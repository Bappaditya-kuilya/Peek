import { useRef, useState } from 'react';
import { FilePicker } from '../components/FilePicker.jsx';
import { SenderActiveView } from './sender/SenderActiveView.jsx';
import { SenderEndedView } from './sender/SenderEndedView.jsx';
import { SenderHomeHero } from './sender/SenderHomeHero.jsx';
import { useClipboard } from '../hooks/useClipboard.js';
import { usePeekLink } from '../hooks/usePeekLink.js';
import { useSenderSessionCoordinator } from '../hooks/useSessionCoordinator.js';
import { useSession } from '../hooks/useSession.js';
import { useTransfer } from '../hooks/useTransfer.js';
import { useWebRTC } from '../hooks/useWebRTC.js';
import { safeBaseName } from '../shared/sanitize.js';
import {
  TRANSPORT_DIRECT,
  TRANSPORT_RELAY,
  TRANSPORT_WAITING,
  createTransport,
} from '../shared/transport.js';

const SCREEN_HOME = 'home';
const SCREEN_PICKER = 'picker';
const SCREEN_ACTIVE = 'active';
const SCREEN_ENDED = 'ended';

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

function agoLabel(timestamp) {
  const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

export function SenderScreen() {
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
  const [peerConnected, setPeerConnected] = useState(false);
  const [transportMode, setTransportMode] = useState(TRANSPORT_WAITING);
  const [transferStarted, setTransferStarted] = useState(false);
  const { createSession, killSession, session } = useSession();
  const clipboard = useClipboard({
    encryptionKey: session?.key || null,
    socketRef: fallbackSocketRef,
  });
  const peekLink = usePeekLink({ fallbackSocketRef, session });

  const transportRef = useRef(null);
  const nextFileIdRef = useRef(0);
  const transferStartedRef = useRef(transferStarted);
  transferStartedRef.current = transferStarted;

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
        setTransportMode(TRANSPORT_DIRECT);
        setStatusMessage('');
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        setTransportMode((current) => (current === TRANSPORT_DIRECT ? TRANSPORT_RELAY : current));
      }
    },
    onDataChannel(channel) {
      channel.binaryType = 'arraybuffer';
      channel.onopen = async () => {
        setTransportMode(TRANSPORT_DIRECT);
        setStatusMessage('');
        if (!transferStartedRef.current && selectedFiles.length) {
          transferStartedRef.current = true;
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
      channel.onclose = () => {
        setTransportMode((current) => (current === TRANSPORT_DIRECT ? TRANSPORT_RELAY : current));
      };
    },
    onFallbackNeeded() {
      setStatusMessage('Taking longer than usual. Make sure the other device screen is on.');
    },
  });

  transportRef.current = createTransport(webRtc.dataChannelRef, fallbackSocketRef);

  useSenderSessionCoordinator({
    clipboard,
    fallbackSocketRef,
    fallbackTimeoutRef,
    selectedFiles,
    session,
    setIncomingPeekUrl: peekLink.setIncomingPeekUrl,
    setPeerConnected,
    setScreen,
    setStatusMessage,
    setTransferStarted,
    setTransportMode,
    transfer,
    transferStartedRef,
    transportRef,
    webRtc,
  });

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
      setTransportMode(TRANSPORT_WAITING);
      setTransferStarted(false);
    } catch (error) {
      setStatusMessage(error?.message || 'Unable to create session.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleKillSession() {
    if (!session) return;
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

  const sessionEndedSummary = [
    ...sharedFiles.map((file) => ({ name: file.name, status: file.status })),
    ...receivedFiles.map((file) => ({ name: file.name, status: file.status })),
  ];

  return (
    <div className="app-shell">
      <div className="app-frame">
        <input ref={fileInputRef} className="hidden-input" type="file" multiple onChange={(event) => handleFilesAdded(event.target.files)} />

        {screen === SCREEN_HOME ? <SenderHomeHero onStart={triggerFilePicker} /> : null}

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
          <SenderActiveView
            activity={activity}
            clipboard={clipboard}
            onDownload={downloadFile}
            onKill={handleKillSession}
            onSendBack={handleSendBackFiles}
            peerConnected={peerConnected}
            peekLink={peekLink}
            receivedFiles={receivedFiles}
            selectedFiles={selectedFiles}
            sendBackInputRef={sendBackInputRef}
            session={session}
            sharedFiles={sharedFiles}
            statusMessage={statusMessage}
            transportMode={transportMode}
          />
        ) : null}

        {screen === SCREEN_ENDED ? (
          <SenderEndedView
            summary={sessionEndedSummary}
            onReset={() => {
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
          />
        ) : null}
      </div>
    </div>
  );
}
