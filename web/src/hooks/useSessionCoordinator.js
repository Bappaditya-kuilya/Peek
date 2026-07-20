import { useEffect, useRef } from 'react';
import { importKeyFromBase64 } from '../shared/crypto.js';
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
          setStatusMessage('Waiting for the other device to join…');
          break;
        case 'joiner-ready':
        case 'peer-connected':
          hasConnectedPeerRef.current = true;
          setPeerConnected(true);
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

  const wsEnabled = Boolean(fullLinkMode && key);
  const wsUrl = fullLinkMode ? getRelayWsUrl(sessionId) : '';

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
      if (s) {
        const deviceId = await getDeviceId();
        s.send(JSON.stringify({ type: 'joiner-join', sessionId, token, deviceId }));
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
          hasJoinedRef.current = true;
          if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
          setJoined(true);
          setTransportMode(TRANSPORT_RELAY);
          setStatusMessage('');
          setStatusDanger(false);
          clipboard.flushDraft().catch(() => {});
          break;
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
  }, [sessionId, token, clipboard, setIncomingPeekUrl, setJoined, setSessionExpiresAt, setStatusDanger, setStatusMessage, setTransportMode, transfer, webRtc, fallbackSocketRef]);

  useEffect(() => {
    return () => {
      if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
      hasJoinedRef.current = false;
    };
  }, [fullLinkMode, key, sessionId, token]);
}
