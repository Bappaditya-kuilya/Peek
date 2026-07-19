const PRODUCTION_HTTP_URL = 'https://peek-relay.bappadityakuilya.workers.dev';
const PRODUCTION_WS_URL = 'wss://peek-relay.bappadityakuilya.workers.dev';

function isLocalHost(hostname = window.location.hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function getLocalRelayOrigin(protocol) {
  const relayProtocol = protocol === 'https:' ? 'https:' : 'http:';
  return `${relayProtocol}//${window.location.hostname}:3000`;
}

function getLocalRelayWsOrigin(protocol) {
  const relayProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${relayProtocol}//${window.location.hostname}:3000`;
}

export function getRelayHttpUrl() {
  if (import.meta.env.VITE_RELAY_HTTP_URL) {
    return import.meta.env.VITE_RELAY_HTTP_URL;
  }

  if (isLocalHost()) {
    return getLocalRelayOrigin(window.location.protocol);
  }

  return PRODUCTION_HTTP_URL;
}

export function getRelayWsUrl(sessionId = '') {
  if (import.meta.env.VITE_RELAY_WS_URL) {
    return import.meta.env.VITE_RELAY_WS_URL;
  }

  if (isLocalHost()) {
    const base = getLocalRelayWsOrigin(window.location.protocol);
    return sessionId ? `${base}?sessionId=${sessionId}` : base;
  }

  const base = PRODUCTION_WS_URL;
  return sessionId ? `${base}?sessionId=${sessionId}` : base;
}

export function getReceiverBaseUrl() {
  if (import.meta.env.VITE_RECEIVER_BASE_URL) {
    return import.meta.env.VITE_RECEIVER_BASE_URL.replace(/\/$/, '');
  }

  return `${window.location.origin}/r`;
}
