import { useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ActivityFeed } from './components/ActivityFeed.jsx';
import { FilePicker } from './components/FilePicker.jsx';
import { FileRow } from './components/FileRow.jsx';
import { KillSwitch } from './components/KillSwitch.jsx';
import { NumericCodeInput } from './components/NumericCodeInput.jsx';
import { QRDisplay } from './components/QRDisplay.jsx';
import { ReceivePanel } from './components/ReceivePanel.jsx';
import { useSession } from './hooks/useSession.js';
import { useTransfer } from './hooks/useTransfer.js';
import { useWebRTC } from './hooks/useWebRTC.js';
import { formatTimer } from './utils/format.js';
import { downloadAllAsZip } from './utils/zip.js';
import { importKeyFromBase64 } from './hooks/useCrypto.js';

const SCREEN_HOME = 'home';
const SCREEN_PICKER = 'picker';
const SCREEN_ACTIVE = 'active';
const SCREEN_ENDED = 'ended';

const RELAY_HTTP_URL = import.meta.env.VITE_RELAY_HTTP_URL || 'http://localhost:3000';
const RELAY_WS_URL = import.meta.env.VITE_RELAY_WS_URL || 'ws://localhost:3000';

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
  const [now, setNow] = useState(Date.now());
  const [sessionEndedSummary, setSessionEndedSummary] = useState([]);
  const [peerConnected, setPeerConnected] = useState(false);
  const [transferStarted, setTransferStarted] = useState(false);
  const { createSession, killSession, session } = useSession();

  const transportRef = useRef(null);

  function addActivity(fileName) {
    setActivity((current) => [
      { fileName, id: `${fileName}-${Date.now()}`, when: agoLabel(Date.now()) },
      ...current,
    ].slice(0, 5));
  }

  const transfer = useTransfer({
    encryptionKey: session?.key,
    onActivity: addActivity,
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
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!session) return undefined;

    const socket = new WebSocket(session.wsUrl);
    socket.binaryType = 'arraybuffer';
    fallbackSocketRef.current = socket;

    socket.onopen = async () => {
      socket.send(JSON.stringify({ sessionId: session.sessionId, token: session.token, type: 'initiator-join' }));
      try {
        const offer = await webRtc.createOffer();
        socket.send(JSON.stringify({ type: 'webrtc-offer', offer }));
      } catch {
        setStatusMessage('Unable to start the connection.');
      }
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
        case 'peer-disconnected':
          setStatusMessage('The other device disconnected.');
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
      fallbackSocketRef.current = null;
    };

    return () => {
      if (fallbackTimeoutRef.current) window.clearTimeout(fallbackTimeoutRef.current);
      socket.close();
      webRtc.closePeerConnection();
    };
  }, [session]);

  function handleFilesAdded(fileList) {
    const files = Array.from(fileList || []).map((file, index) => createLocalFileRecord(file, selectedFiles.length + index));
    setSelectedFiles((current) => [...current, ...files]);
    setSharedFiles((current) => [...current, ...files.map(({ file, ...rest }) => rest)]);
    setScreen(SCREEN_PICKER);
  }

  async function handleGenerateSession() {
    if (!selectedFiles.length) return;
    setIsGenerating(true);
    try {
      await createSession({ fileCount: selectedFiles.length });
      setScreen(SCREEN_ACTIVE);
      setStatusMessage('Connecting to device…');
      setPeerConnected(false);
      setTransferStarted(false);
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
    await killSession(session.sessionId);
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
    anchor.download = file.name;
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

  const timerClass = useMemo(() => {
    if (!session) return '';
    const remaining = session.expiresAt - now;
    if (remaining <= 60 * 1000) return 'critical';
    if (remaining <= 5 * 60 * 1000) return 'warning';
    return '';
  }, [now, session]);

  return (
    <div className="app-shell">
      <div className="app-frame">
        <input ref={fileInputRef} className="hidden-input" type="file" multiple onChange={(event) => handleFilesAdded(event.target.files)} />

        {screen === SCREEN_HOME ? (
          <div className="screen stack-lg">
            <div className="screen-header">
              <div className="wordmark">passr</div>
            </div>
            <div className="stack-md">
              <p className="hero-copy">Share files to any device.</p>
              <p className="hero-copy">Scan a QR on the other device.</p>
              <p className="hero-copy">No install. No account.</p>
            </div>
            <button type="button" className="button-primary" onClick={triggerFilePicker}>Select files to share</button>
            <div className="screen-divider" />
            <Link className="muted-link" to="/r">Already have a code?</Link>
          </div>
        ) : null}

        {screen === SCREEN_PICKER ? (
          <FilePicker
            files={selectedFiles}
            onAddFiles={triggerFilePicker}
            onBack={() => setScreen(SCREEN_HOME)}
            onGenerate={handleGenerateSession}
            onRemoveFile={handleRemoveFile}
          />
        ) : null}

        {screen === SCREEN_ACTIVE && session ? (
          <div className="screen stack-lg">
            <div className="screen-header">
              <div className="wordmark">passr</div>
              <div className={`header-timer ${timerClass}`}>{formatTimer(session.expiresAt)}</div>
            </div>

            <QRDisplay expiresAt={session.expiresAt} joinUrl={session.joinUrl} numericCode={session.numericCode} />
            <div className="screen-divider" />
            <ActivityFeed items={activity} />
            <div className="screen-divider" />

            <div className="file-list">
              {sharedFiles.map((file) => (
                <FileRow key={file.id} file={file} progress={file.progress} status={file.status} />
              ))}
            </div>

            {statusMessage ? <div className="status-copy">{statusMessage}</div> : null}
            {!peerConnected ? <div className="status-copy">Waiting for the other device…</div> : null}

            <ReceivePanel
              files={receivedFiles}
              onDownload={downloadFile}
              onSelectFiles={() => sendBackInputRef.current?.click()}
              sessionId={session.sessionId}
              title="Received from them"
            />

            <div className="bottom-action">
              <KillSwitch onConfirm={handleKillSession} />
            </div>

            <input ref={sendBackInputRef} className="hidden-input" type="file" multiple onChange={handleSendBackFiles} />
          </div>
        ) : null}

        {screen === SCREEN_ENDED ? (
          <div className="screen stack-lg">
            <div className="screen-header">
              <div className="wordmark">passr</div>
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
              <div className="hero-copy">All files transferred.</div>
            </div>
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                setSelectedFiles([]);
                setSharedFiles([]);
                setReceivedFiles([]);
                setActivity([]);
                setScreen(SCREEN_HOME);
              }}
            >
              Share more files
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
        <div className="screen stack-lg">
          <div className="screen-header">
            <div className="wordmark">passr</div>
          </div>
          <div className="stack-md">
            <h1 className="section-title">Enter your 6-digit code</h1>
            <NumericCodeInput autoFocus onComplete={handleLookup} />
            <div className="receiver-note">For full file access, scan the QR code instead.</div>
          </div>
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
  const killTimeoutRef = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [statusMessage, setStatusMessage] = useState('');
  const [statusDanger, setStatusDanger] = useState(false);
  const [joined, setJoined] = useState(false);
  const [lookupMode, setLookupMode] = useState(false);
  const [lookupResult, setLookupResult] = useState(location.state?.lookup || null);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [outgoingFiles, setOutgoingFiles] = useState([]);
  const [transferStarted, setTransferStarted] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const fragment = window.location.hash.replace(/^#/, '');
  const [token, keyBase64] = fragment.split('.');
  const fullLinkMode = Boolean(token && keyBase64);
  const [key, setKey] = useState(null);
  const transportRef = useRef(null);

  const transfer = useTransfer({
    encryptionKey: key,
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
      setLookupMode(true);
      if (!lookupResult) {
        fetch(`${RELAY_HTTP_URL}/session/lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: sessionId }),
        }).catch(() => {});
      }
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
  }, [fullLinkMode, keyBase64, lookupResult, sessionId]);

  useEffect(() => {
    if (!fullLinkMode || !key) return undefined;

    const socket = new WebSocket(RELAY_WS_URL);
    socket.binaryType = 'arraybuffer';
    fallbackSocketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'joiner-join', sessionId, token }));
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
          break;
        case 'webrtc-offer': {
          const answer = await webRtc.acceptOffer(message.offer);
          socket.send(JSON.stringify({ type: 'webrtc-answer', answer }));
          break;
        }
        case 'webrtc-candidate':
          await webRtc.addIceCandidate(message.candidate);
          break;
        case 'peer-disconnected':
          setStatusMessage('The other device disconnected.');
          break;
        default:
          break;
      }
    };

    socket.onclose = () => {
      setStatusMessage('Session ended.');
      setStatusDanger(false);
      setJoined(false);
    };

    return () => {
      socket.close();
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
    anchor.download = file.name;
    anchor.click();
    URL.revokeObjectURL(url);
    transfer.sendDownloadNotice(file.id, transportRef.current).catch(() => {});
  }

  async function handleSendBackFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setOutgoingFiles(files.map((file, index) => ({ id: index, name: file.name, progress: 0, size: file.size, status: 'queued' })));
    setTransferStarted(true);
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
          <div className="screen stack-lg">
            <div className="screen-header">
              <div className="wordmark">passr</div>
            </div>
            <div className="stack-md">
              <h1 className="section-title">Session found</h1>
              <div className="hero-copy">Files available: {lookupResult?.filesAvailable ?? 'unknown'}</div>
              <div className="hero-copy">
                Session found. To receive files, open the full link on this device — ask the sender to share it via message or email.
              </div>
            </div>
            <button type="button" className="button-secondary" onClick={() => navigate('/r')}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="app-shell">
        <div className="app-frame">
          <div className="screen stack-lg">
            <div className="screen-header">
              <div className="wordmark">passr</div>
            </div>
            <div className="stack-md">
              <h1 className="section-title">Connecting to device…</h1>
              {statusMessage ? <div className={`status-copy ${statusDanger ? 'danger' : ''}`}>{statusMessage}</div> : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="screen stack-lg">
          <div className="screen-header">
            <div className="wordmark">passr</div>
            <div className={`header-timer ${timerClass}`}>{formatTimer(expiresAt)}</div>
          </div>

          <div className="stack-md">
            <h1 className="section-title">Files from other device</h1>
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
              <button type="button" className="button-primary" onClick={() => downloadAllAsZip(receivedFiles.filter((file) => file.blob), sessionId)}>
                Download all as ZIP
              </button>
            ) : null}
          </div>

          <div className="screen-divider" />

          <ReceivePanel
            files={outgoingFiles}
            onDownload={() => {}}
            onSelectFiles={() => sendBackInputRef.current?.click()}
            sessionId={sessionId}
            title="Send files back"
          />

          {statusMessage ? <div className={`status-copy ${statusDanger ? 'danger' : ''}`}>{statusMessage}</div> : null}

          <div className="bottom-action">
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
              {confirmKill ? 'Tap again to end session' : 'End session'}
            </button>
          </div>

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
