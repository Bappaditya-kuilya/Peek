import { useEffect, useRef, useState } from 'react';
import {
  generateViewerKeypair,
  importKeyFromBase64,
  unwrapSessionKey,
  wrapSessionKeyForViewer,
} from '../shared/crypto.js';
import { getDeviceId } from '../utils/deviceIdentity.js';
import {
  SESSION_ENDED_CLOSE_CODES,
  SESSION_REPLACED_CLOSE_CODE,
  TRANSPORT_RECONNECTING,
  TRANSPORT_RELAY,
} from '../shared/transport.js';
import { useWebSocket, WS_LOST } from './useWebSocket.js';
import { getRelayWsUrl } from '../utils/relayConfig.js';

export function useSenderSessionCoordinator({
  clipboard,
  fallbackSocketRef,
  fallbackTimeoutRef,
  selectedFiles,
  session,
  setPeerConnected,
  setIncomingPeekUrl,
  setScreen,
  setStatusMessage,
  setTransferStarted,
  setTransportMode,
  transfer,
  transferStartedRef,
  transportRef,
  webRtc,
}) {
  const hasSentOfferRef = useRef(false);
  const hasConnectedPeerRef = useRef(false);
  const selectedFilesRef = useRef(selectedFiles);
  selectedFilesRef.current = selectedFiles;
  const [pendingViewers, setPendingViewers] = useState([]);
  const [viewerCount, setViewerCount] = useState(0);
  const pendingViewersRef = useRef([]);
  pendingViewersRef.current = pendingViewers;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const MAX_VIEWERS = 5;

  async function approveViewer(receiverId) {
    const currentSession = sessionRef.current;
    const viewer = pendingViewersRef.current.find((v) => v.receiverId === receiverId);
    if (!viewer || !currentSession?.key) {
      return;
    }
    const wrappedKeyB64 = await wrapSessionKeyForViewer(viewer.pubKeyJwk, currentSession.key);
    fallbackSocketRef.current?.send(
      JSON.stringify({
        type: 'sender-key-grant',
        sessionId: currentSession.sessionId,
        token: currentSession.token,
        targetReceiverId: receiverId,
        wrappedKeyB64,
      })
    );
    setPendingViewers((current) => current.filter((v) => v.receiverId !== receiverId));
  }

  useEffect(() => {
    if (!session) return undefined;

    const socket = new WebSocket(session.wsUrl);
    socket.binaryType = 'arraybuffer';
    fallbackSocketRef.current = socket;
    hasSentOfferRef.current = false;
    setPendingViewers([]);
    setViewerCount(0);

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

    socket.onopen = async () => {
      const deviceId = await getDeviceId();
      socket.send(JSON.stringify({ sessionId: session.sessionId, token: session.token, type: 'initiator-join', deviceId }));
      clipboard.flushDraft().catch(() => {});
    };

    socket.onmessage = async (event) => {
      if (typeof event.data !== 'string') {
        await transfer.handleBinaryMessage(event.data);
        return;
      }

      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'initiator-ready':
          if (typeof message.receiverCount === 'number') {
            setViewerCount(message.receiverCount);
          }
          setStatusMessage('Waiting for the other device to join…');
          break;
        case 'viewer-pending':
          if (message.receiverId && message.pubKeyJwk) {
            setPendingViewers((current) => {
              if (current.some((v) => v.receiverId === message.receiverId)) {
                return current;
              }
              if (current.length >= MAX_VIEWERS) {
                return current;
              }
              return [
                ...current,
                {
                  receiverId: message.receiverId,
                  pubKeyJwk: message.pubKeyJwk,
                  viewerName: message.viewerName || message.receiverId,
                },
              ];
            });
          }
          break;
        case 'joiner-ready':
        case 'peer-connected':
          hasConnectedPeerRef.current = true;
          setPeerConnected(true);
          if (typeof message.receiverCount === 'number') {
            setViewerCount(message.receiverCount);
          } else if (message.receiverId) {
            setViewerCount((c) => Math.min(MAX_VIEWERS, c + 1));
          }
          setStatusMessage('');
          clipboard.flushDraft().catch(() => {});
          sendOffer().catch(() => {});
          if (fallbackTimeoutRef.current) {
            window.clearTimeout(fallbackTimeoutRef.current);
          }
          fallbackTimeoutRef.current = window.setTimeout(async () => {
            if (!webRtc.dataChannelRef.current || webRtc.dataChannelRef.current.readyState !== 'open') {
              if (!transferStartedRef.current && selectedFilesRef.current.length) {
                transferStartedRef.current = true;
                setTransferStarted(true);
                await transfer.sendFiles(
                  selectedFilesRef.current.map((entry) => entry.file),
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
          if (typeof message.receiverCount === 'number') {
            setViewerCount(message.receiverCount);
          } else {
            setViewerCount((c) => Math.max(0, c - 1));
          }
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
      if (event.code === 4000 || event.code === 4001) {
        setScreen('ended');
      }
      if (event.code === SESSION_REPLACED_CLOSE_CODE) {
        return;
      }
      if (!hasConnectedPeerRef.current) {
        return;
      }
      setPeerConnected(false);
      setTransportMode(TRANSPORT_RECONNECTING);
      setStatusMessage('Connection interrupted. Waiting for the other device to reconnect…');
    };

    return () => {
      if (fallbackTimeoutRef.current) window.clearTimeout(fallbackTimeoutRef.current);
      socket.close();
      webRtc.closePeerConnection();
    };
  }, [session]);

  return { pendingViewers, viewerCount, approveViewer };
}

export function useReceiverSessionCoordinator({
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
}) {
  const joinTimeoutRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const handlersRef = useRef({});
  const viewerPrivateKeyRef = useRef(null);

  const grantMode = Boolean(sessionId && token && !keyBase64);
  const wsEnabled = Boolean((fullLinkMode && key) || grantMode);
  const wsUrl = fullLinkMode || grantMode ? getRelayWsUrl(sessionId) : '';

  const onMessage = (event) => {
    handlersRef.current.onMessage?.(event);
  };
  const onOpen = (socket) => {
    fallbackSocketRef.current = socket;
    handlersRef.current.onOpen?.();
  };
  const onClose = (_event, info) => {
    fallbackSocketRef.current = null;
    handlersRef.current.onClose?.(info);
  };

  const { connectionState } = useWebSocket({
    url: wsUrl,
    enabled: wsEnabled,
    onOpen,
    onMessage,
    onClose,
  });

  useEffect(() => {
    if (!fullLinkMode) {
      return;
    }
    let active = true;
    importKeyFromBase64(keyBase64)
      .then((importedKey) => {
        if (active) setKey(importedKey);
      })
      .catch(() => {
        setStatusMessage('Unable to read the full link.');
        setStatusDanger(true);
      });
    return () => { active = false; };
  }, [fullLinkMode, keyBase64]);

  useEffect(() => {
    if (connectionState === WS_LOST) {
      setStatusMessage('Connection lost. The relay may be down.');
      setStatusDanger(true);
    }
  }, [connectionState]);

  useEffect(() => {
    handlersRef.current.onOpen = async () => {
      const s = fallbackSocketRef.current;
      if (fullLinkMode) {
        if (s) {
          const deviceId = await getDeviceId();
          s.send(JSON.stringify({ type: 'joiner-join', sessionId, token, deviceId }));
        }
      } else if (grantMode) {
        try {
          const { privateKey, pubKeyJwk } = await generateViewerKeypair();
          viewerPrivateKeyRef.current = privateKey;
          let viewerName = 'Viewer';
          try {
            const deviceId = await getDeviceId();
            viewerName = `Viewer-${String(deviceId).slice(0, 4)}`;
          } catch {
            viewerName = 'Viewer';
          }
          if (s) {
            s.send(
              JSON.stringify({ type: 'receiver-join-request', sessionId, token, pubKeyJwk, viewerName })
            );
          }
        } catch {
          setStatusMessage('Unable to start secure join.');
          setStatusDanger(true);
          return;
        }
      }
      clipboard.flushDraft().catch(() => {});
      if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = window.setTimeout(() => {
        if (!hasJoinedRef.current) {
          setStatusMessage('Unable to join session. Check that the full link opened correctly.');
          setStatusDanger(true);
        }
      }, 5000);
    };

    handlersRef.current.onMessage = async (event) => {
      if (typeof event.data !== 'string') {
        await transfer.handleBinaryMessage(event.data);
        return;
      }
      const message = JSON.parse(event.data);
      if (message.expiresAt) setSessionExpiresAt(message.expiresAt);

      switch (message.type) {
        case 'joiner-ready':
        case 'receiver-ready':
          hasJoinedRef.current = true;
          if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
          setJoined(true);
          setTransportMode(TRANSPORT_RELAY);
          setStatusMessage('');
          setStatusDanger(false);
          clipboard.flushDraft().catch(() => {});
          break;
        case 'key-grant': {
          if (!message.wrappedKeyB64 || !viewerPrivateKeyRef.current) {
            break;
          }
          try {
            const sessionKey = await unwrapSessionKey(viewerPrivateKeyRef.current, message.wrappedKeyB64);
            hasJoinedRef.current = true;
            if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
            setKey(sessionKey);
            setJoined(true);
            setTransportMode(TRANSPORT_RELAY);
            setStatusMessage('');
            setStatusDanger(false);
            clipboard.flushDraft().catch(() => {});
          } catch {
            setStatusMessage('Unable to unlock this session. Ask the sender to approve again.');
            setStatusDanger(true);
          }
          break;
        }
        case 'webrtc-offer': {
          const answer = await webRtc.acceptOffer(message.offer);
          const s = fallbackSocketRef.current;
          if (s) s.send(JSON.stringify({ type: 'webrtc-answer', answer }));
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
          setTransportMode(TRANSPORT_RECONNECTING);
          setStatusMessage('The other device disconnected.');
          break;
        default:
          break;
      }
    };

    handlersRef.current.onClose = (info) => {
      if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
      setJoined(false);
      setTransportMode(TRANSPORT_RECONNECTING);
      if (info.isFinal) return;
      if (hasJoinedRef.current) {
        setStatusMessage('Connection interrupted. Retrying…');
      } else {
        setStatusMessage('Connecting to device…');
      }
      setStatusDanger(false);
    };
  }, [sessionId, token, clipboard, setIncomingPeekUrl, setJoined, setKey, setSessionExpiresAt, setStatusDanger, setStatusMessage, setTransportMode, transfer, webRtc, fallbackSocketRef, fullLinkMode, keyBase64]);

  useEffect(() => {
    return () => {
      if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
      hasJoinedRef.current = false;
      viewerPrivateKeyRef.current = null;
    };
  }, [fullLinkMode, keyBase64, sessionId, token]);
}
