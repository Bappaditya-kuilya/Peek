const STORAGE_KEY = 'peek:device:identity';

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function getOrCreateDeviceIdentity() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.deviceId && parsed.privateKeyJwk) {
        return parsed;
      }
    } catch {
      // ignore parse errors
    }
  }

  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  );

  const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);

  const deviceId = base64urlEncode(base64urlDecode(publicKeyJwk.x));

  const identity = {
    deviceId,
    privateKeyJwk,
    createdAt: Date.now(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export async function getDeviceId() {
  const identity = await getOrCreateDeviceIdentity();
  return identity.deviceId;
}

export async function signChallenge(challenge) {
  const identity = await getOrCreateDeviceIdentity();
  const privateKey = await window.crypto.subtle.importKey(
    'jwk',
    identity.privateKeyJwk,
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  const encoder = new TextEncoder();
  const signature = await window.crypto.subtle.sign('Ed25519', privateKey, encoder.encode(challenge));
  return base64urlEncode(signature);
}

export function clearDeviceIdentity() {
  localStorage.removeItem(STORAGE_KEY);
}

export function getStoredDeviceIdentity() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}