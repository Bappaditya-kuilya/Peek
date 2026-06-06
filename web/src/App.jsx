import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ActivityFeed } from './components/ActivityFeed.jsx';
import { ClipboardBar } from './components/ClipboardBar.jsx';
import { FilePicker } from './components/FilePicker.jsx';
import { FileRow } from './components/FileRow.jsx';
import { KillSwitch } from './components/KillSwitch.jsx';
import { NumericCodeInput } from './components/NumericCodeInput.jsx';
import { QRDisplay } from './components/QRDisplay.jsx';
import { ReceivePanel } from './components/ReceivePanel.jsx';
import { ViewShare } from './components/ViewShare.jsx';
import { useClipboard } from './hooks/useClipboard.js';
import { useSession } from './hooks/useSession.js';
import { useTransfer } from './hooks/useTransfer.js';
import { useWebRTC } from './hooks/useWebRTC.js';
import { formatTimer } from './utils/format.js';
import { safeBaseName } from './utils/sanitize.js';
import { createViewUrl, encryptViewFile, uploadEncryptedView } from './utils/viewCrypto.js';
import { downloadAllAsZip } from './utils/zip.js';
import { importKeyFromBase64 } from './hooks/useCrypto.js';
import { getRelayHttpUrl, getRelayWsUrl } from './utils/relayConfig.js';

const SCREEN_HOME = 'home';
const SCREEN_PICKER = 'picker';
const SCREEN_ACTIVE = 'active';
const SCREEN_ENDED = 'ended';
const SESSION_ENDED_CLOSE_CODES = new Set([4000, 4001]);
const SESSION_REPLACED_CLOSE_CODE = 4005;

const RELAY_HTTP_URL = getRelayHttpUrl();
const RELAY_WS_URL = getRelayWsUrl();

function createLocalFileRecord(file, index) {
  return {
    file,
    id: index,
    name: file.name,
    progress: 0,
    size: file.size,
    status: 'queued',
    type: file.type,
  };
}

function stripFilePayload(fileRecord) {
  const { file, ...rest } = fileRecord;
  return rest;
}

function createTransport(dataChannelRef, fallbackSocketRef) {
  return {
    getBufferedAmount() {
      if (dataChannelRef.current?.readyState === 'open') {
        return dataChannelRef.current.bufferedAmount;
      }
      if (fallbackSocketRef.current?.readyState === WebSocket.OPEN) {
        return fallbackSocketRef.current.bufferedAmount || 0;
      }
      return 0;
    },
    sendBinary(buffer) {
      if (dataChannelRef.current?.readyState === 'open') {
        dataChannelRef.current.send(buffer);
        return;
      }
      if (fallbackSocketRef.current?.readyState === WebSocket.OPEN) {
        fallbackSocketRef.current.send(buffer);
      }
    },
  };
}

function agoLabel(timestamp) {
  const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function SenderApp() {
  const fileInputRef = useRef(null);
  const sendBackInputRef = useRef(null);
  const fallbackSocketRef = useRef(null);
  const fallbackTimeoutRef = useRef(null);
  const [screen, setScreen] = useState(SCREEN_HOME);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [activity, setActivity] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionEndedSummary, setSessionEndedSummary] = useState([]);
  const [peerConnected, setPeerConnected] = useState(false);
  const [transferStarted, setTransferStarted] = useState(false);
  const [peekFile, setPeekFile] = useState(null);
  const [peekExpiresIn, setPeekExpiresIn] = useState(15);
  const [peekOnceOnly, setPeekOnceOnly] = useState(false);
  const [peekUrl, setPeekUrl] = useState('');
  const [peekBusy, setPeekBusy] = useState(false);
  const [peekStatus, setPeekStatus] = useState('');
  const [incomingPeekUrl, setIncomingPeekUrl] = useState('');
  const { createSession, killSession, session } = useSession();
  const clipboard = useClipboard({
    encryptionKey: session?.key || null,
    socketRef: fallbackSocketRef,
  });

  const transportRef = useRef(null);
  const nextFileIdRef = useRef(0);
  const hasSentOfferRef = useRef(false);
  // Mirrors of the latest file lists so the session-close handler (which lives
  // in a [session] effect closure) can build an accurate ended-summary instead
  // of capturing stale empty arrays.
  const sharedFilesRef = useRef([]);
  const receivedFilesRef = useRef([]);

  function addActivity(fileName) {
    setActivity((current) => [
      { fileName, id: `${fileName}-${Date.now()}`, when: agoLabel(Date.now()) },
      ...current,
    ].slice(0, 5));
  }

  const transfer = useTransfer({
    encryptionKey: session?.key,
    onActivity: addActivity,
    onError() {
      setStatusMessage('Some incoming data could not be read. The connection may be unstable.');
    },
    onManifest(files) {
      setReceivedFiles(files.map((file) => ({ ...file, progress: 0, status: 'queued' })));
    },
    onReceiveComplete(file) {
      setReceivedFiles((current) =>
        current.map((item) => (item.id === file.id ? { ...item, blob: file.blob, progress: 100, status: 'done' } : item))
      );
    },
    onReceiveProgress({ fileId, progress }) {
      setReceivedFiles((current) =>
        current.map((item) => (item.id === fileId ? { ...item, progress, status: 'sending' } : item))
      );
    },
    onSendProgress({ fileId, progress }) {
      setSharedFiles((current) =>
        current.map((item) => (item.id === fileId ? { ...item, progress, status: progress === 100 ? 'done' : 'sending' } : item))
      );
    },
  });

  const webRtc = useWebRTC({
    onCandidate(candidate) {
      fallbackSocketRef.current?.send(JSON.stringify({ type: 'webrtc-candidate', candidate }));
    },
    onConnectionStateChange(state) {
      if (state === 'connected') {
        setStatusMessage('');
      }
    },
    onDataChannel(channel) {
      channel.binaryType = 'arraybuffer';
      channel.onopen = async () => {
        if (!transferStarted && selectedFiles.length) {
          setTransferStarted(true);
          await transfer.sendFiles(
            selectedFiles.map((entry) => entry.file),
            transportRef.current
          );
        }
      };
      channel.onmessage = async (event) => {
        await transfer.handleBinaryMessage(event.data);
      };
    },
    onFallbackNeeded() {
      setStatusMessage('Taking longer than usual. Make sure the other device screen is on.');
    },
  });

  transportRef.current = createTransport(webRtc.dataChannelRef, fallbackSocketRef);

  useEffect(() => {
    sharedFilesRef.current = sharedFiles;
  }, [sharedFiles]);

  useEffect(() => {
    receivedFilesRef.current = receivedFiles;
  }, [receivedFiles]);

  useEffect(() => {
    if (!session) return undefined;

    const socket = new WebSocket(session.wsUrl);
    socket.binaryType = 'arraybuffer';
    fallbackSocketRef.current = socket;
    hasSentOfferRef.current = false;

    async function sendOffer() {
      if (hasSentOfferRef.current) {
        return;
      }
      hasSentOfferRef.current = true;
      try {
        const offer = await webRtc.createOffer();
        socket.send(JSON.stringify({ type: 'webrtc-offer', offer }));
      } catch {
        hasSentOfferRef.current = false;
        setStatusMessage('Unable to start the connection.');
      }
    }

    socket.onopen = () => {
      socket.send(JSON.stringify({ sessionId: session.sessionId, token: session.token, type: 'initiator-join' }));
      clipboard.flushDraft().catch(() => {});
    };

    socket.onmessage = async (event) => {
      if (typeof event.data !== 'string') {
        await transfer.handleBinaryMessage(event.data);
        return;
      }

      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'joiner-ready':
        case 'peer-connected':
          setPeerConnected(true);
          setStatusMessage('');
          clipboard.flushDraft().catch(() => {});
          sendOffer().catch(() => {});
          if (fallbackTimeoutRef.current) {
            window.clearTimeout(fallbackTimeoutRef.current);
          }
          fallbackTimeoutRef.current = window.setTimeout(async () => {
            if (!webRtc.dataChannelRef.current || webRtc.dataChannelRef.current.readyState !== 'open') {
              if (!transferStarted && selectedFiles.length) {
                setTransferStarted(true);
                await transfer.sendFiles(
                  selectedFiles.map((entry) => entry.file),
                  transportRef.current
                );
              }
            }
          }, 2500);
          break;
        case 'webrtc-answer':
          await webRtc.acceptAnswer(message.answer);
          break;
        case 'webrtc-candidate':
          await webRtc.addIceCandidate(message.candidate);
          break;
        case 'clipboard-push':
          await clipboard.handleClipboardMessage(message);
          break;
        case 'view-share-push':
          setIncomingPeekUrl(message.url || '');
          break;
        case 'peer-disconnected':
          setStatusMessage('The other device disconnected.');
          break;
        default:
          break;
      }
    };

    socket.onclose = (event) => {
      if (fallbackSocketRef.current === socket) {
        fallbackSocketRef.current = null;
      }
      // 4000 = killed by the other peer, 4001 = expired server-side. Either way
      // the session is gone mid-use and the sender must be told. Normal local
      // teardown closes with a non-4000 code, so it won't trip this.
      if (event.code === 4000 || event.code === 4001) {
        setSessionEndedSummary([
          ...sharedFilesRef.current.map((file) => ({ name: file.name, status: file.status })),
          ...receivedFilesRef.current.map((file) => ({ name: file.name, status: file.status })),
        ]);
        setScreen(SCREEN_ENDED);
      }
      if (event.code === SESSION_REPLACED_CLOSE_CODE) {
        return;
      }
    };

    return () => {
      if (fallbackTimeoutRef.current) window.clearTimeout(fallbackTimeoutRef.current);
      socket.close();
      webRtc.closePeerConnection();
    };
  }, [session]);

  function handleFilesAdded(fileList) {
    const files = Array.from(fileList || []).map((file) => {
      const id = nextFileIdRef.current;
      nextFileIdRef.current += 1;
      return createLocalFileRecord(file, id);
    });
    if (!files.length) {
      return;
    }

    setSelectedFiles((current) => [...current, ...files]);
    setSharedFiles((current) => [...current, ...files.map(stripFilePayload)]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setScreen(SCREEN_PICKER);
  }

  async function handleGenerateSession() {
    if (!selectedFiles.length) return;
    setIsGenerating(true);
    setStatusMessage('');
    try {
      await createSession({ fileCount: selectedFiles.length });
      setScreen(SCREEN_ACTIVE);
      setStatusMessage('Connecting to device…');
      setPeerConnected(false);
      setTransferStarted(false);
    } catch (error) {
      setStatusMessage(error?.message || 'Unable to create session.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleKillSession() {
    if (!session) return;
    setSessionEndedSummary([
      ...sharedFiles.map((file) => ({ name: file.name, status: file.status })),
      ...receivedFiles.map((file) => ({ name: file.name, status: file.status })),
    ]);
    if (fallbackSocketRef.current?.readyState === WebSocket.OPEN) {
      fallbackSocketRef.current.send(JSON.stringify({ type: 'kill-session' }));
    }
    await killSession(session.sessionId, session.token);
    setScreen(SCREEN_ENDED);
  }

  function handleRemoveFile(fileId) {
    setSelectedFiles((current) => current.filter((file) => file.id !== fileId));
    setSharedFiles((current) => current.filter((file) => file.id !== fileId));
  }

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  function downloadFile(file) {
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeBaseName(file.name);
    anchor.click();
    URL.revokeObjectURL(url);
    transfer.sendDownloadNotice(file.id, transportRef.current).catch(() => {});
  }

  async function handleSendBackFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    await transfer.sendFiles(files, transportRef.current);
    event.target.value = '';
  }

  async function handleCreatePeekLink() {
    if (!peekFile || !session) {
      return;
    }

    setPeekBusy(true);
    setPeekStatus('');
    try {
      const encrypted = await encryptViewFile(peekFile);
      const view = await uploadEncryptedView({
        encryptedBlob: encrypted.encryptedBlob,
        expiresIn: peekExpiresIn,
        filename: encrypted.filename,
        httpUrl: session.httpUrl,
        mimeType: encrypted.mimeType,
        onceOnly: peekOnceOnly,
      });
      setPeekUrl(createViewUrl(view.id, encrypted.keyBase64));
      setPeekStatus('Peek link ready.');
    } catch (error) {
      setPeekStatus(error?.message || 'Unable to create Peek link.');
    } finally {
      setPeekBusy(false);
    }
  }

  async function handleSessionPeek(fileRecord) {
    if (!fileRecord?.file || !session) {
      return;
    }

    setPeekBusy(true);
    setPeekStatus('');
    try {
      const encrypted = await encryptViewFile(fileRecord.file);
      const view = await uploadEncryptedView({
        encryptedBlob: encrypted.encryptedBlob,
        expiresIn: peekExpiresIn,
        filename: encrypted.filename,
        httpUrl: session.httpUrl,
        mimeType: encrypted.mimeType,
        onceOnly: peekOnceOnly,
      });
      const url = createViewUrl(view.id, encrypted.keyBase64);
      setPeekUrl(url);
      fallbackSocketRef.current?.send(JSON.stringify({
        type: 'view-share-push',
        fileName: encrypted.filename,
        url,
      }));
      setPeekStatus('Peek link ready and sent to the other device.');
    } catch (error) {
      setPeekStatus(error?.message || 'Unable to create Peek link.');
    } finally {
      setPeekBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <input ref={fileInputRef} className="hidden-input" type="file" multiple onChange={(event) => handleFilesAdded(event.target.files)} />

        {screen === SCREEN_HOME ? (
          <div className="workspace">
            <div className="workspace-main">
              <div className="hero-card stack-lg">
                <div className="workspace-header">
                  <div className="brand-block">
                    <div className="wordmark">Peek</div>
                    <div className="eyebrow">Shared Device Transfer</div>
                  </div>
                  <Link className="link-chip" to="/r">
                    Have a code?
                  </Link>
                </div>

                <div className="stack-md">
                  <h1 className="workspace-title">Move files into a shared browser without friction.</h1>
                  <p className="hero-subtitle">
                    Built for labs, library PCs, kiosks, and temporary machines where installs and sign-ins are the slowest part of the job.
                  </p>
                </div>

                <div className="hero-feature-list">
                  <div className="hero-feature">
                    <strong>No install</strong>
                    <span>The receiving side opens as a normal browser page.</span>
                  </div>
                  <div className="hero-feature">
                    <strong>No account</strong>
                    <span>One session, one QR, and automatic expiry after 60 minutes.</span>
                  </div>
                  <div className="hero-feature">
                    <strong>Encrypted fallback</strong>
                    <span>Relay fallback carries ciphertext only when direct local transfer fails.</span>
                  </div>
                  <div className="hero-feature">
                    <strong>Two-way session</strong>
                    <span>The other device can send files back without starting a new room.</span>
                  </div>
                </div>

                <div className="stack-sm">
                  <button type="button" className="button-primary" onClick={triggerFilePicker}>Start sharing files</button>
                  <div className="helper-copy">Choose files first, then create the short-lived session.</div>
                </div>
              </div>
            </div>

            <aside className="workspace-side">
              <div className="panel stack-md">
                <div>
                  <div className="panel-label">How it works</div>
                  <h2 className="section-title">Three short steps</h2>
                </div>
                <div className="steps-list">
                  <div className="step-row">
                    <strong>1. Select the files</strong>
                    <span className="helper-copy">Prepare the transfer before the second device joins.</span>
                  </div>
                  <div className="step-row">
                    <strong>2. Open the session</strong>
                    <span className="helper-copy">Peek generates a QR link and fallback code for the other device.</span>
                  </div>
                  <div className="step-row">
                    <strong>3. Transfer and close</strong>
                    <span className="helper-copy">Send, receive, and end the session when you are finished.</span>
                  </div>
                </div>
              </div>

              <div className="panel stack-md">
                <div>
                  <div className="panel-label">Security posture</div>
                  <h2 className="section-title">Designed for risky environments</h2>
                </div>
                <div className="security-list">
                  <div className="security-row">
                    <strong>Client-side encryption</strong>
                    <span className="helper-copy">Transfer packets are encrypted in the browser before fallback relay transport is used.</span>
                  </div>
                  <div className="security-row">
                    <strong>Short-lived sessions</strong>
                    <span className="helper-copy">Sessions expire automatically and can also be killed manually from either side.</span>
                  </div>
                  <div className="security-row">
                    <strong>Minimal ceremony</strong>
                    <span className="helper-copy">No account, no install, and no permanent workspace left behind on public hardware.</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {screen === SCREEN_PICKER ? (
          <FilePicker
            files={selectedFiles}
            isGenerating={isGenerating}
            onAddFiles={triggerFilePicker}
            onBack={() => setScreen(SCREEN_HOME)}
            onGenerate={handleGenerateSession}
            onRemoveFile={handleRemoveFile}
            statusMessage={statusMessage}
          />
        ) : null}

        {screen === SCREEN_ACTIVE && session ? (
          <div className="workspace">
            <div className="workspace-main">
              <div className="workspace-shell stack-lg">
                <div className="workspace-header compact">
                  <div className="brand-block">
                    <div className="wordmark">Peek</div>
                    <div className="eyebrow">Live session</div>
                  </div>
                  <div className={`status-pill ${peerConnected ? 'live' : 'waiting'}`}>
                    {peerConnected ? 'Peer connected' : 'Waiting for peer'}
                  </div>
                </div>

                <div className="metric-strip">
                  <div className="metric-cell">
                    <span className="metric-value">{sharedFiles.length}</span>
                    <span className="metric-label">Files staged</span>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-value">{receivedFiles.filter((file) => file.status === 'done').length}</span>
                    <span className="metric-label">Files received</span>
                  </div>
                  <div className="metric-cell">
                    <span className="metric-value">{formatTimer(session.expiresAt)}</span>
                    <span className="metric-label">Time left</span>
                  </div>
                </div>

                {statusMessage ? <div className="notice-banner danger">{statusMessage}</div> : null}
                {!peerConnected ? <div className="notice-banner warning">Waiting for the other device to join and keep the session alive.</div> : null}

                <div className="panel">
                  <div className="section-heading-row">
                    <div>
                      <div className="panel-label">Your transfer set</div>
                      <h2 className="section-title">Files staged for this session</h2>
                    </div>
                  </div>
                  <div className="file-list">
                    {sharedFiles.map((file) => {
                      const selectedEntry = selectedFiles.find((entry) => entry.id === file.id);
                      return (
                        <FileRow
                          key={file.id}
                          action={
                            selectedEntry?.file ? (
                              <button
                                type="button"
                                className="compact-button"
                                onClick={() => handleSessionPeek(selectedEntry)}
                              >
                                Peek
                              </button>
                            ) : null
                          }
                          file={file}
                          progress={file.progress}
                          status={file.status}
                        />
                      );
                    })}
                  </div>
                </div>

                <ReceivePanel
                  files={receivedFiles}
                  onDownload={downloadFile}
                  onSelectFiles={() => sendBackInputRef.current?.click()}
                  sessionId={session.sessionId}
                  title="Files received"
                />

                <ClipboardBar
                  copyLabel={clipboard.copyState === 'copied' ? 'Copied' : clipboard.copyState === 'failed' ? 'Retry copy' : 'Copy'}
                  draftText={clipboard.draftText}
                  maxChars={clipboard.maxChars}
                  onChange={clipboard.setDraftText}
                  onCopy={clipboard.copyReceivedText}
                  receivedText={clipboard.receivedText}
                />
              </div>
            </div>

            <aside className="workspace-side">
              <QRDisplay expiresAt={session.expiresAt} joinUrl={session.joinUrl} numericCode={session.numericCode} />
              <ViewShare
                expiresIn={peekExpiresIn}
                file={peekFile}
                generatedUrl={peekUrl}
                isBusy={peekBusy}
                onExpiresChange={setPeekExpiresIn}
                onFileChange={setPeekFile}
                onGenerate={handleCreatePeekLink}
                onToggleOnceOnly={setPeekOnceOnly}
                onceOnly={peekOnceOnly}
                statusMessage={peekStatus}
              />
              {incomingPeekUrl ? (
                <div className="panel stack-sm">
                  <div>
                    <div className="panel-label">Incoming view-only share</div>
                    <h2 className="section-title">Peek ready</h2>
                  </div>
                  <div className="helper-copy">The other device shared a temporary view-only Peek.</div>
                  <button type="button" className="button-primary" onClick={() => window.open(incomingPeekUrl, '_blank', 'noopener,noreferrer')}>
                    Open Peek in new tab
                  </button>
                </div>
              ) : null}
              <ActivityFeed items={activity} />
              <KillSwitch onConfirm={handleKillSession} />
            </aside>

            <input ref={sendBackInputRef} className="hidden-input" type="file" multiple onChange={handleSendBackFiles} />
          </div>
        ) : null}

        {screen === SCREEN_ENDED ? (
          <div className="screen stack-lg">
            <div className="screen-header">
              <div className="wordmark">Peek</div>
            </div>
            <div className="stack-md">
              <h1 className="section-title">Session ended</h1>
              <div className="file-list">
                {sessionEndedSummary.map((file) => (
                  <div className="file-row" key={`${file.name}-${file.status}`}>
                    <div className="file-row-left">
                      <span className="file-name">{file.name}</span>
                    </div>
                    <div className={`file-status ${file.status === 'done' ? 'success' : ''}`}>{file.status === 'done' ? '✓' : '—'}</div>
                  </div>
                ))}
              </div>
              <div className="hero-copy">This Peek session is closed. Start a new one whenever you need.</div>
            </div>
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                setSelectedFiles([]);
                setSharedFiles([]);
                setReceivedFiles([]);
                setActivity([]);
                nextFileIdRef.current = 0;
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
                setScreen(SCREEN_HOME);
              }}
            >
              Start another Peek session
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReceiverLookup() {
  const navigate = useNavigate();

  async function handleLookup(code) {
    const response = await fetch(`${RELAY_HTTP_URL}/session/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      throw new Error('lookup failed');
    }

    const payload = await response.json();
    navigate(`/r/${payload.sessionId}`, { state: { lookup: payload } });
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="workspace">
          <div className="workspace-main">
            <div className="workspace-shell stack-lg">
              <div className="brand-block">
                <div className="wordmark">Peek</div>
                <div className="eyebrow">Join by code</div>
              </div>
              <div className="stack-md">
                <h1 className="section-title">Enter your 6-digit code</h1>
                <div className="section-subtitle">Use this only when you cannot open the full QR link on the receiving device.</div>
                <NumericCodeInput autoFocus onComplete={handleLookup} />
              </div>
            </div>
          </div>
          <aside className="workspace-side">
            <div className="panel stack-md">
              <div>
                <div className="panel-label">What code lookup does</div>
                <h2 className="section-title">Lookup, not authentication</h2>
              </div>
              <div className="helper-copy">It confirms the session exists, but it does not carry the encryption key. For actual file access, the full link is still required.</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ReceiverSession() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams();
  const sendBackInputRef = useRef(null);
  const fallbackSocketRef = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [statusMessage, setStatusMessage] = useState('');
  const [statusDanger, setStatusDanger] = useState(false);
  const [joined, setJoined] = useState(false);
  const [lookupResult, setLookupResult] = useState(location.state?.lookup || null);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [outgoingFiles, setOutgoingFiles] = useState([]);
  const [confirmKill, setConfirmKill] = useState(false);
  const [incomingPeekUrl, setIncomingPeekUrl] = useState('');
  const receiverUrl = new URL(window.location.href);
  const queryToken = receiverUrl.searchParams.get('t') || '';
  const queryKeyBase64 = receiverUrl.searchParams.get('k') || '';
  const fragment = window.location.hash.replace(/^#/, '');
  const [fragmentToken, fragmentKeyBase64] = fragment.split('.');
  const token = queryToken || fragmentToken || '';
  const keyBase64 = queryKeyBase64 || fragmentKeyBase64 || '';
  const fullLinkMode = Boolean(token && keyBase64);
  const [key, setKey] = useState(null);
  const transportRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const clipboard = useClipboard({
    encryptionKey: key,
    socketRef: fallbackSocketRef,
  });

  const transfer = useTransfer({
    encryptionKey: key,
    onError() {
      setStatusMessage('We could not decrypt the files. The link may be incomplete — ask the sender to share the full link again.');
      setStatusDanger(true);
    },
    onManifest(files) {
      setReceivedFiles(files.map((file) => ({ ...file, progress: 0, status: 'queued' })));
    },
    onReceiveComplete(file) {
      setReceivedFiles((current) =>
        current.map((item) => (item.id === file.id ? { ...item, blob: file.blob, progress: 100, status: 'done' } : item))
      );
    },
    onReceiveProgress({ fileId, progress }) {
      setReceivedFiles((current) =>
        current.map((item) => (item.id === fileId ? { ...item, progress, status: 'sending' } : item))
      );
    },
    onSendProgress({ fileId, fileName, progress }) {
      setOutgoingFiles((current) => {
        const exists = current.find((item) => item.id === fileId);
        if (!exists) {
          return [...current, { id: fileId, name: fileName, progress, size: 0, status: progress === 100 ? 'done' : 'sending' }];
        }
        return current.map((item) => (item.id === fileId ? { ...item, progress, status: progress === 100 ? 'done' : 'sending' } : item));
      });
    },
  });

  const webRtc = useWebRTC({
    onCandidate(candidate) {
      fallbackSocketRef.current?.send(JSON.stringify({ type: 'webrtc-candidate', candidate }));
    },
    onConnectionStateChange(state) {
      if (state === 'connected') {
        setStatusMessage('');
      }
    },
    onDataChannel(channel) {
      channel.binaryType = 'arraybuffer';
      channel.onmessage = async (event) => {
        await transfer.handleBinaryMessage(event.data);
      };
    },
    onFallbackNeeded() {
      setStatusMessage('Taking longer than usual. Make sure the other device screen is on.');
    },
  });

  transportRef.current = createTransport(webRtc.dataChannelRef, fallbackSocketRef);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!fullLinkMode) {
      return;
    }

    let active = true;
    importKeyFromBase64(keyBase64)
      .then((importedKey) => {
        if (active) {
          setKey(importedKey);
        }
      })
      .catch(() => {
        setStatusMessage('Unable to read the full link.');
        setStatusDanger(true);
      });

    return () => {
      active = false;
    };
    // Deps are only what the key import actually uses. Including lookupResult
    // here caused the key to be recreated on every expiresAt update, which tore
    // down and reopened the WebSocket in a loop.
  }, [fullLinkMode, keyBase64]);

  useEffect(() => {
    if (!fullLinkMode || !key) return undefined;

    let active = true;

    function connect() {
      if (!active) {
        return;
      }

      const socket = new WebSocket(RELAY_WS_URL);
      socket.binaryType = 'arraybuffer';
      fallbackSocketRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));
        clipboard.flushDraft().catch(() => {});
      };

      socket.onmessage = async (event) => {
        if (typeof event.data !== 'string') {
          await transfer.handleBinaryMessage(event.data);
          return;
        }

        const message = JSON.parse(event.data);
        if (message.expiresAt) {
          setLookupResult((current) => ({ ...(current || {}), expiresAt: message.expiresAt }));
        }

        switch (message.type) {
          case 'joiner-ready':
            setJoined(true);
            setStatusMessage('');
            clipboard.flushDraft().catch(() => {});
            break;
          case 'webrtc-offer': {
            const answer = await webRtc.acceptOffer(message.offer);
            socket.send(JSON.stringify({ type: 'webrtc-answer', answer }));
            break;
          }
          case 'webrtc-candidate':
            await webRtc.addIceCandidate(message.candidate);
            break;
          case 'clipboard-push':
            await clipboard.handleClipboardMessage(message);
            break;
          case 'view-share-push':
            setIncomingPeekUrl(message.url || '');
            break;
          case 'peer-disconnected':
            setStatusMessage('The other device disconnected.');
            break;
          default:
            break;
        }
      };

      socket.onclose = (event) => {
        if (fallbackSocketRef.current === socket) {
          fallbackSocketRef.current = null;
        }
        setJoined(false);
        if (SESSION_ENDED_CLOSE_CODES.has(event.code)) {
          setStatusMessage('Session ended.');
          setStatusDanger(false);
          return;
        }
        if (event.code === SESSION_REPLACED_CLOSE_CODE) {
          return;
        }
        setStatusMessage('Connection interrupted. Retrying…');
        setStatusDanger(false);
        if (active) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            webRtc.closePeerConnection();
            connect();
          }, 1000);
        }
      };
    }

    connect();

    return () => {
      active = false;
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      fallbackSocketRef.current?.close();
      webRtc.closePeerConnection();
    };
  }, [fullLinkMode, key, sessionId, token]);

  useEffect(() => {
    if (!confirmKill) return undefined;
    const timeout = window.setTimeout(() => setConfirmKill(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [confirmKill]);

  function downloadFile(file) {
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeBaseName(file.name);
    anchor.click();
    URL.revokeObjectURL(url);
    transfer.sendDownloadNotice(file.id, transportRef.current).catch(() => {});
  }

  async function handleSendBackFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setOutgoingFiles(files.map((file, index) => ({ id: index, name: file.name, progress: 0, size: file.size, status: 'queued' })));
    await transfer.sendFiles(files, transportRef.current);
    event.target.value = '';
  }

  const expiresAt = lookupResult?.expiresAt || Date.now() + 60 * 60 * 1000;
  const remaining = expiresAt - now;
  const timerClass = remaining <= 60 * 1000 ? 'critical' : remaining <= 5 * 60 * 1000 ? 'warning' : '';

  if (!fullLinkMode) {
    return (
      <div className="app-shell">
        <div className="app-frame">
          <div className="workspace">
            <div className="workspace-main">
              <div className="workspace-shell stack-lg">
                <div className="brand-block">
                  <div className="wordmark">Peek</div>
                  <div className="eyebrow">Session lookup</div>
                </div>
                <div className="stack-md">
                  <h1 className="section-title">Session found</h1>
                  <div className="hero-copy">Files available: {lookupResult?.filesAvailable ?? 'unknown'}</div>
                  {lookupResult?.expiresAt ? (
                    <div className="status-pill">Expires in {formatTimer(lookupResult.expiresAt)}</div>
                  ) : null}
                </div>
                <button type="button" className="button-secondary" onClick={() => navigate('/r')}>
                  Back
                </button>
              </div>
            </div>
            <aside className="workspace-side">
              <div className="panel stack-md">
                <div>
                  <div className="panel-label">Next step</div>
                  <h2 className="section-title">You still need the full link</h2>
                </div>
                <div className="helper-copy">
                  Code lookup only tells you the session exists. To receive files, open the full Peek link on this device and ask the sender to share it directly.
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="app-shell">
        <div className="app-frame">
          <div className="workspace">
            <div className="workspace-main">
              <div className="workspace-shell stack-lg">
                <div className="brand-block">
                  <div className="wordmark">Peek</div>
                  <div className="eyebrow">Receiver session</div>
                </div>
                <h1 className="section-title">Connecting to device…</h1>
                {statusMessage ? <div className={`notice-banner ${statusDanger ? 'danger' : 'warning'}`}>{statusMessage}</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="workspace">
          <div className="workspace-main">
            <div className="workspace-shell stack-lg">
              <div className="workspace-header compact">
                <div className="brand-block">
                  <div className="wordmark">Peek</div>
                  <div className="eyebrow">Receiving session</div>
                </div>
                <div className={`header-timer ${timerClass}`}>{formatTimer(expiresAt)}</div>
              </div>

              <div className="metric-strip">
                <div className="metric-cell">
                  <span className="metric-value">{receivedFiles.length}</span>
                  <span className="metric-label">Incoming files</span>
                </div>
                <div className="metric-cell">
                  <span className="metric-value">{receivedFiles.filter((file) => file.blob).length}</span>
                  <span className="metric-label">Ready to save</span>
                </div>
                <div className="metric-cell">
                  <span className="metric-value">Live</span>
                  <span className="metric-label">Session state</span>
                </div>
              </div>

              {statusMessage ? <div className={`notice-banner ${statusDanger ? 'danger' : 'warning'}`}>{statusMessage}</div> : null}

              <div className="panel">
                <div className="section-heading-row">
                  <div>
                    <div className="panel-label">Incoming transfer</div>
                    <h2 className="section-title">Files from the other device</h2>
                  </div>
                </div>
                <div className="file-list">
                  {receivedFiles.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      progress={file.progress}
                      status={file.status}
                      action={
                        file.blob ? (
                          <button type="button" className="compact-button" onClick={() => downloadFile(file)}>
                            Download
                          </button>
                        ) : null
                      }
                    />
                  ))}
                </div>

                {receivedFiles.some((file) => file.blob) ? (
                  <div className="stack-sm" style={{ marginTop: '16px' }}>
                    <button type="button" className="button-primary" onClick={() => downloadAllAsZip(receivedFiles.filter((file) => file.blob), sessionId)}>
                      Download all as ZIP
                    </button>
                  </div>
                ) : null}
              </div>

              <ReceivePanel
                files={outgoingFiles}
                onDownload={() => {}}
                onSelectFiles={() => sendBackInputRef.current?.click()}
                sessionId={sessionId}
                title="Send files back"
              />
            </div>
          </div>

          <aside className="workspace-side">
            <ClipboardBar
              copyLabel={clipboard.copyState === 'copied' ? 'Copied' : clipboard.copyState === 'failed' ? 'Retry copy' : 'Copy'}
              draftText={clipboard.draftText}
              maxChars={clipboard.maxChars}
              onChange={clipboard.setDraftText}
              onCopy={clipboard.copyReceivedText}
              receivedText={clipboard.receivedText}
            />
            {incomingPeekUrl ? (
              <div className="panel stack-sm">
                <div>
                  <div className="panel-label">Incoming view-only share</div>
                  <h2 className="section-title">Peek ready</h2>
                </div>
                <div className="helper-copy">The other device shared a temporary view-only Peek.</div>
                <button type="button" className="button-primary" onClick={() => window.open(incomingPeekUrl, '_blank', 'noopener,noreferrer')}>
                  Open Peek in new tab
                </button>
              </div>
            ) : null}
            <div className="panel stack-sm">
              <div>
                <div className="panel-label">End session</div>
                <div className="helper-copy">Close this receiver session and disconnect both devices.</div>
              </div>
              <button
                type="button"
                className={`button-danger ${confirmKill ? 'confirm' : ''}`}
                onClick={() => {
                  if (!confirmKill) {
                    setConfirmKill(true);
                    return;
                  }
                  fallbackSocketRef.current?.send(JSON.stringify({ type: 'kill-session' }));
                }}
              >
                {confirmKill ? 'Confirm end session' : 'End session'}
              </button>
            </div>
          </aside>

          <input ref={sendBackInputRef} className="hidden-input" type="file" multiple onChange={handleSendBackFiles} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SenderApp />} />
      <Route path="/r" element={<ReceiverLookup />} />
      <Route path="/r/:sessionId" element={<ReceiverSession />} />
    </Routes>
  );
}
