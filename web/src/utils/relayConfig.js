const LOCAL_HTTP_URL = 'http://localhost:3000';
const LOCAL_WS_URL = 'ws://localhost:3000';
const PRODUCTION_HTTP_URL = 'https://peek-relay.fly.dev';
const PRODUCTION_WS_URL = 'wss://peek-relay.fly.dev';

function isLocalHost(hostname = window.location.hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
}

export function getRelayHttpUrl() {
  return import.meta.env.VITE_RELAY_HTTP_URL || (isLocalHost() ? LOCAL_HTTP_URL : PRODUCTION_HTTP_URL);
}

export function getRelayWsUrl() {
  return import.meta.env.VITE_RELAY_WS_URL || (isLocalHost() ? LOCAL_WS_URL : PRODUCTION_WS_URL);
}

export function getReceiverBaseUrl() {
  if (import.meta.env.VITE_RECEIVER_BASE_URL) {
    return import.meta.env.VITE_RECEIVER_BASE_URL.replace(/\/$/, '');
  }

  if (isLocalHost() && window.location.port === '5173') {
    return 'http://localhost:5174/r';
  }

  return `${window.location.origin}/r`;
}
