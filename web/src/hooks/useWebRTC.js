import { useEffect, useRef } from 'react';

const DEV_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

function getIceServers() {
  const stunServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    return [
      ...stunServers,
      {
        urls: turnUrl,
        username: turnUsername,
        credential: turnCredential,
      },
    ];
  }

  if (import.meta.env.DEV) {
    return DEV_ICE_SERVERS;
  }

  return stunServers;
}

export function useWebRTC({
  onCandidate,
  onConnectionStateChange,
  onDataChannel,
  onFallbackNeeded,
}) {
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);

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
      onConnectionStateChange?.(state);
      if (state === 'failed') {
        onFallbackNeeded?.();
      }
    };

    connection.ondatachannel = (event) => {
      dataChannelRef.current = event.channel;
      onDataChannel?.(event.channel);
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

  return {
    addIceCandidate,
    acceptAnswer,
    acceptOffer,
    closePeerConnection,
    createOffer,
    createPeerConnection,
    dataChannelRef,
    peerConnectionRef,
  };
}
