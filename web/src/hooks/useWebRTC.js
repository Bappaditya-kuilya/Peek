import { useEffect, useRef } from 'react';
import { recordIceEvent, shouldWarnTurn } from '../shared/iceMonitor.js';
import * as Sentry from '@sentry/react';

const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];

// Free defaults, no signup: public OpenRelay static-auth hosts already used here.
const DEFAULT_TURN_URLS = [
  'turn:openrelay.metered.ca:80',
  'turn:openrelay.metered.ca:443',
  'turn:openrelay.metered.ca:443?transport=tcp',
];

function parseTurnUrls() {
  const plural = import.meta.env.VITE_TURN_URLS;
  if (plural) {
    const list = plural.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length) return list;
  }
  // Legacy single-URL override.
  const single = import.meta.env.VITE_TURN_URL;
  if (single?.trim()) return [single.trim()];
  return DEFAULT_TURN_URLS;
}

function getIceServers() {
  const stunServers = DEFAULT_STUN_URLS.map((urls) => ({ urls }));

  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (!turnUsername || !turnCredential) {
    return stunServers;
  }

  return [
    ...stunServers,
    ...parseTurnUrls().map((urls) => ({
      urls,
      username: turnUsername,
      credential: turnCredential,
    })),
  ];
}

export function useWebRTC({
  onCandidate,
  onConnectionStateChange,
  onDataChannel,
  onFallbackNeeded,
  onDeviceId,
}) {
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const restartCountRef = useRef(0);
  const MAX_ICE_RESTARTS = 2;

  useEffect(() => {
    return () => {
      if (dataChannelRef.current) {
        dataChannelRef.current.close();
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  function bindConnectionEvents(connection) {
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        onCandidate?.(event.candidate);
      }
    };

    connection.oniceconnectionstatechange = () => {
      const state = connection.iceConnectionState;
      recordIceEvent(state);
      onConnectionStateChange?.(state);

      if (state === 'connected' || state === 'completed') {
        restartCountRef.current = 0;
        return;
      }

      if (state === 'failed') {
        if (restartCountRef.current < MAX_ICE_RESTARTS) {
          restartCountRef.current += 1;
          connection.restartIce();
        } else {
          if (shouldWarnTurn()) {
            const message = '[Peek] ICE failure rate >5% over 24h. Consider adding TURN servers.';
            console.warn(message);
            Sentry.captureMessage(message, 'warning');
          }
          onFallbackNeeded?.();
        }
      }
    };

    connection.ondatachannel = (event) => {
      dataChannelRef.current = event.channel;
      onDataChannel?.(event.channel);
      setupDataChannelHandlers(event.channel);
    };
  }

  function setupDataChannelHandlers(channel) {
    channel.binaryType = 'arraybuffer';
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'device-id' && message.deviceId) {
            onDeviceId?.(message.deviceId);
          }
        } catch {
          // ignore non-JSON messages
        }
      }
    };
  }

  function createPeerConnection({ createChannel = false } = {}) {
    const connection = new RTCPeerConnection({ iceServers: getIceServers() });
    peerConnectionRef.current = connection;
    bindConnectionEvents(connection);

    if (createChannel) {
      const channel = connection.createDataChannel('peek-files', {
        ordered: true,
      });
      dataChannelRef.current = channel;
      setupDataChannelHandlers(channel);
      onDataChannel?.(channel);
    }

    return connection;
  }

  async function createOffer() {
    const connection = peerConnectionRef.current || createPeerConnection({ createChannel: true });
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    return offer;
  }

  async function acceptOffer(offer) {
    const connection = peerConnectionRef.current || createPeerConnection();
    await connection.setRemoteDescription(offer);
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    return answer;
  }

  async function acceptAnswer(answer) {
    if (!peerConnectionRef.current) {
      return;
    }
    await peerConnectionRef.current.setRemoteDescription(answer);
  }

  async function addIceCandidate(candidate) {
    if (!peerConnectionRef.current) {
      return;
    }
    await peerConnectionRef.current.addIceCandidate(candidate);
  }

  function closePeerConnection() {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  }

  async function sendDeviceId(deviceId) {
    if (dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'device-id', deviceId }));
    }
  }

  return {
    addIceCandidate,
    acceptAnswer,
    acceptOffer,
    closePeerConnection,
    createOffer,
    createPeerConnection,
    dataChannelRef,
    peerConnectionRef,
    sendDeviceId,
  };
}
