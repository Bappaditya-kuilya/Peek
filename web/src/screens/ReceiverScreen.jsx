import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardBar } from '../components/ClipboardBar.jsx';
import { ErrorBanner } from '../components/ErrorBanner.jsx';
import { FileRow } from '../components/FileRow.jsx';
import { IncomingPeekPanel } from '../components/IncomingPeekPanel.jsx';
import { ReceivePanel } from '../components/ReceivePanel.jsx';
import { Watermark } from '../components/Watermark.jsx';
import { ReceiverPendingView } from './receiver/ReceiverPendingView.jsx';
import { useClipboard } from '../hooks/useClipboard.js';
import { useIncomingPeekLink } from '../hooks/usePeekLink.js';
import { useReceiverSessionCoordinator } from '../hooks/useSessionCoordinator.js';
import { useTransfer } from '../hooks/useTransfer.js';
import { useWebRTC } from '../hooks/useWebRTC.js';
import { formatTimer } from '../shared/format.js';
import { safeBaseName } from '../shared/sanitize.js';
import {
  TRANSPORT_DIRECT,
  TRANSPORT_RELAY,
  TRANSPORT_WAITING,
  createTransport,
  getTransportLabel,
} from '../shared/transport.js';
import { downloadAllAsZip } from '../utils/zip.js';

export function ReceiverScreen() {
  const { sessionId } = useParams();
  const sendBackInputRef = useRef(null);
  const fallbackSocketRef = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [statusMessage, setStatusMessage] = useState('');
  const [statusDanger, setStatusDanger] = useState(false);
  const [connectionTrouble, setConnectionTrouble] = useState(false);
  const [joined, setJoined] = useState(false);
  const [transportMode, setTransportMode] = useState(TRANSPORT_WAITING);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [outgoingFiles, setOutgoingFiles] = useState([]);
  const [confirmKill, setConfirmKill] = useState(false);
  const { incomingPeekUrl, setIncomingPeekUrl } = useIncomingPeekLink();
  const receiverUrl = new URL(window.location.href);
  // Secrets arrive in the URL fragment (#token.key) — never sent to the server.
  // Both halves are percent-encoded when the link is built (the base64 key can
  // contain +, /, =), so decode each part before use.
  // Legacy ?t=&k= query links are still accepted for backward compatibility.
  const fragment = window.location.hash.replace(/^#/, '');
  const [fragmentTokenRaw, fragmentKeyRaw] = fragment.split('.');
  const decodeFragmentPart = (value) => {
    if (!value) {
      return '';
    }
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const fragmentToken = decodeFragmentPart(fragmentTokenRaw);
  const fragmentKeyBase64 = decodeFragmentPart(fragmentKeyRaw);
  const queryToken = receiverUrl.searchParams.get('t') || receiverUrl.searchParams.get('token') || '';
  const queryKeyBase64 = receiverUrl.searchParams.get('k') || '';
  const token = fragmentToken || queryToken || '';
  const keyBase64 = fragmentKeyBase64 || queryKeyBase64 || '';
  const fullLinkMode = Boolean(token && keyBase64);
  const [key, setKey] = useState(null);
  const transportRef = useRef(null);
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
    onSendProgress({ fileId, fileName, size, progress }) {
      setOutgoingFiles((current) => {
        const exists = current.find((item) => item.id === fileId);
        if (!exists) {
          return [...current, { id: fileId, name: fileName, size, progress, status: progress === 100 ? 'done' : 'sending' }];
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
        setTransportMode(TRANSPORT_DIRECT);
        setStatusMessage('');
        setConnectionTrouble(false);
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setTransportMode((current) => (current === TRANSPORT_DIRECT ? TRANSPORT_RELAY : current));
        if (state === 'failed') {
          setConnectionTrouble(true);
          setStatusMessage('Connection trouble. Retrying…');
        }
      }
    },
    onDataChannel(channel) {
      channel.binaryType = 'arraybuffer';
      channel.onopen = () => {
        setTransportMode(TRANSPORT_DIRECT);
        setStatusMessage('');
        setConnectionTrouble(false);
      };
      channel.onmessage = async (event) => {
        await transfer.handleBinaryMessage(event.data);
      };
      channel.onclose = () => {
        setTransportMode((current) => (current === TRANSPORT_DIRECT ? TRANSPORT_RELAY : current));
        setConnectionTrouble(true);
        setStatusMessage('Connection lost. Retrying…');
      };
    },
    onFallbackNeeded() {
      setConnectionTrouble(true);
      setStatusMessage('Connection trouble. Retrying…');
    },
  });

  transportRef.current = createTransport(webRtc.dataChannelRef, fallbackSocketRef);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useReceiverSessionCoordinator({
    clipboard,
    fallbackSocketRef,
    fullLinkMode,
    key,
    keyBase64,
    sessionId,
    setIncomingPeekUrl,
    setJoined,
    setKey,
    setSessionExpiresAt,
    setStatusDanger,
    setStatusMessage,
    setTransportMode,
    token,
    transfer,
    webRtc,
  });

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

  const expiresAt = sessionExpiresAt || Date.now() + 60 * 60 * 1000;
  const remaining = expiresAt - now;
  const timerClass = remaining <= 60 * 1000 ? 'critical' : remaining <= 5 * 60 * 1000 ? 'warning' : '';

  if (!fullLinkMode) {
    return <ReceiverPendingView mode="missing-key" statusMessage={statusMessage} statusDanger={statusDanger} connectionTrouble={connectionTrouble} onRetry={async () => { setConnectionTrouble(false); setStatusMessage(''); await webRtc.createPeerConnection(); }} />;
  }

  if (!joined) {
    return <ReceiverPendingView mode="connecting" statusMessage={statusMessage} statusDanger={statusDanger} connectionTrouble={connectionTrouble} onRetry={async () => { setConnectionTrouble(false); setStatusMessage(''); await webRtc.createPeerConnection(); }} />;
  }

  return (
    <div className="app-shell">
      <div className="app-frame">
        <div className="workspace">
          <div className="workspace-main">
            <div className="workspace-shell stack-lg">
              <div className="workspace-header compact">
                <Watermark eyebrow="Receiving session" />
                <div className={`header-timer ${timerClass}`}>{formatTimer(expiresAt)}</div>
              </div>

              <div className="metric-strip">
                <div className="metric-cell">
                  <span className="metric-value">{receivedFiles.length}</span><span className="metric-label">Incoming files</span>
                </div>
                <div className="metric-cell">
                  <span className="metric-value">{receivedFiles.filter((file) => file.blob).length}</span><span className="metric-label">Ready to save</span>
                </div>
                <div className="metric-cell">
                  <span className="metric-value">{getTransportLabel(transportMode, joined)}</span><span className="metric-label">Session state</span>
                </div>
              </div>

              <ErrorBanner tone={statusDanger ? 'danger' : 'warning'}>{statusMessage}</ErrorBanner>

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
                onDrop={handleSendBackFiles}
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
              sendLabel={joined ? 'Sync available' : 'Will sync after connection'}
              receivedText={clipboard.receivedText}
            />
            <IncomingPeekPanel url={incomingPeekUrl} />
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
