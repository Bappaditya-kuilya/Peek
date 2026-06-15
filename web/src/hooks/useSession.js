import { useEffect, useRef, useState } from 'react';
import {
  exportKeyToBase64,
  generateEncryptionKey,
} from './useCrypto.js';
import { getReceiverBaseUrl, getRelayHttpUrl, getRelayWsUrl } from '../utils/relayConfig.js';

const DEFAULT_HTTP_URL = getRelayHttpUrl();
const DEFAULT_WS_URL = getRelayWsUrl();
const SESSION_CREATE_TIMEOUT_MS = 10000;

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

    let response;
    try {
      response = await fetch(`${DEFAULT_HTTP_URL}/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileCount }),
        signal: AbortSignal.timeout(SESSION_CREATE_TIMEOUT_MS),
      });
    } catch (error) {
      if (error?.name === 'TimeoutError') {
        throw new Error('Session setup timed out. Check that the relay server is reachable and try again.');
      }
      throw new Error('Unable to reach the relay server. Start the relay or verify the relay URL.');
    }

    if (!response.ok) {
      throw new Error('Unable to create session');
    }

    const payload = await response.json();
    const receiverBaseUrl = getReceiverBaseUrl();
    // Token and key live in the URL fragment (#token.key) so the static host and
    // any proxy/CDN logs never receive the session secret or decryption key —
    // fragments are never sent to the server. The receiver reads them from
    // location.hash.
    const joinUrl = `${receiverBaseUrl}/${payload.sessionId}#${encodeURIComponent(payload.token)}.${encodeURIComponent(keyBase64)}`;

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
