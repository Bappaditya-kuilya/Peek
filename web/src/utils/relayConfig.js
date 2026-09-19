const PRODUCTION_HTTP_URL = 'https://peek-relay.famous-wolf.workers.dev';
const PRODUCTION_WS_URL = 'wss://peek-relay.famous-wolf.workers.dev';

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
  return `${relayProtocol}//${window.location.hostname}:8787`;
}

function getLocalRelayWsOrigin(protocol) {
  const relayProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${relayProtocol}//${window.location.hostname}:8787`;
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
  const base = (import.meta.env.VITE_RELAY_WS_URL || (isLocalHost() ? getLocalRelayWsOrigin(window.location.protocol) : PRODUCTION_WS_URL)).replace(/\/+$/, '');
  return sessionId ? `${base}?sessionId=${sessionId}` : base;
}

export function getReceiverBaseUrl() {
  if (import.meta.env.VITE_RECEIVER_BASE_URL) {
    return import.meta.env.VITE_RECEIVER_BASE_URL.replace(/\/$/, '');
  }

  return `${window.location.origin}/r`;
}
