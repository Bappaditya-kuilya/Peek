import { useEffect, useRef, useState } from 'react';
import {
  exportKeyToBase64,
  generateEncryptionKey,
} from './useCrypto.js';

const DEFAULT_HTTP_URL = import.meta.env.VITE_RELAY_HTTP_URL || 'http://localhost:3000';
const DEFAULT_WS_URL = import.meta.env.VITE_RELAY_WS_URL || 'ws://localhost:3000';
const DEFAULT_RECEIVER_BASE_URL =
  import.meta.env.VITE_RECEIVER_BASE_URL || 'https://passr.dev/r';

function getReceiverBaseUrl() {
  if (import.meta.env.VITE_RECEIVER_BASE_URL) {
    return import.meta.env.VITE_RECEIVER_BASE_URL.replace(/\/$/, '');
  }

  if (window.location.hostname === 'localhost' && window.location.port === '5173') {
    return 'http://localhost:5174/r';
  }

  return DEFAULT_RECEIVER_BASE_URL.replace(/\/$/, '');
}

export function useSession() {
  const [session, setSession] = useState(null);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);
  const wakeLockRef = useRef(null);

  useEffect(() => {
    setWakeLockSupported('wakeLock' in navigator);
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
      }
    };
  }, []);

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) {
      return null;
    }

    try {
      const lock = await navigator.wakeLock.request('screen');
      wakeLockRef.current = lock;
      return lock;
    } catch {
      return null;
    }
  }

  async function createSession({ fileCount }) {
    const key = await generateEncryptionKey();
    const keyBase64 = await exportKeyToBase64(key);

    const response = await fetch(`${DEFAULT_HTTP_URL}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileCount }),
    });

    if (!response.ok) {
      throw new Error('Unable to create session');
    }

    const payload = await response.json();
    const receiverBaseUrl = getReceiverBaseUrl();
    const joinUrl = `${receiverBaseUrl}/${payload.sessionId}#${payload.token}.${keyBase64}`;

    const nextSession = {
      ...payload,
      httpUrl: DEFAULT_HTTP_URL,
      joinUrl,
      key,
      keyBase64,
      receiverBaseUrl,
      wsUrl: DEFAULT_WS_URL,
    };

    setSession(nextSession);
    await requestWakeLock();
    return nextSession;
  }

  async function killSession(sessionId, token) {
    await fetch(`${DEFAULT_HTTP_URL}/session/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    }).catch(() => {});

    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }

    setSession(null);
  }

  return {
    createSession,
    killSession,
    requestWakeLock,
    session,
    setSession,
    wakeLockSupported,
  };
}
