// Production relay defaults. These are only a fallback: the deployed web build
// should set VITE_RELAY_HTTP_URL / VITE_RELAY_WS_URL to its own relay host
// (e.g. in Vercel project env). The defaults below match the relay host the
// docs, fly.toml, and self-hosting guide all reference, so a build with no env
// at least points at a real, intended host instead of a dead one.
const PRODUCTION_HTTP_URL = 'https://peek-relay.fly.dev';
const PRODUCTION_WS_URL = 'wss://peek-relay.fly.dev';

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

export function getRelayWsUrl() {
  if (import.meta.env.VITE_RELAY_WS_URL) {
    return import.meta.env.VITE_RELAY_WS_URL;
  }

  if (isLocalHost()) {
    return getLocalRelayWsOrigin(window.location.protocol);
  }

  return PRODUCTION_WS_URL;
}

export function getReceiverBaseUrl() {
  if (import.meta.env.VITE_RECEIVER_BASE_URL) {
    return import.meta.env.VITE_RECEIVER_BASE_URL.replace(/\/$/, '');
  }

  // The join/receiver route (/r/:sessionId) is served by this same single-page
  // app, so the receiver always lives on the current origin. The previous
  // localhost:5174 special case assumed a second dev server that the documented
  // `npm run dev` flow never starts, which left the QR/join link dead locally.
  return `${window.location.origin}/r`;
}
