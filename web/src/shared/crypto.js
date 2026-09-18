const IV_LENGTH = 12;

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export function base64FromBytes(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

export function bytesFromBase64(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function generateEncryptionKey() {
  return window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKeyToBase64(key) {
  const rawKey = await window.crypto.subtle.exportKey('raw', key);
  return base64FromBytes(new Uint8Array(rawKey));
}

export async function importKeyFromBase64(base64) {
  const rawBytes = bytesFromBase64(base64);
  // Two-way transfer: the joiner both decrypts incoming files and encrypts the
  // files it sends back, so the imported key needs both usages. Importing it
  // decrypt-only made encryptChunk throw InvalidAccessError and silently broke
  // the joiner -> initiator direction. Still non-extractable.
  return window.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt', 'encrypt']
  );
}

export async function encryptChunk(key, chunk) {
  // SECURITY: AES-GCM requires a fresh IV for every encrypted chunk.
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    chunk
  );

  const encryptedBytes = new Uint8Array(ciphertext);
  const output = new Uint8Array(IV_LENGTH + encryptedBytes.byteLength);
  output.set(iv, 0);
  output.set(encryptedBytes, IV_LENGTH);
  return output.buffer;
}

export async function decryptChunk(key, encryptedBuffer) {
  const encryptedBytes = new Uint8Array(encryptedBuffer);
  const iv = encryptedBytes.slice(0, IV_LENGTH);
  const ciphertext = encryptedBytes.slice(IV_LENGTH);

  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
}

export async function generateViewerKeypair() {
  const keypair = await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
  const pubKeyJwk = await window.crypto.subtle.exportKey('jwk', keypair.publicKey);
  return { privateKey: keypair.privateKey, publicKey: keypair.publicKey, pubKeyJwk };
}

export async function wrapSessionKeyForViewer(viewerPubJwk, sessionAesKey) {
  const viewerPub = await window.crypto.subtle.importKey(
    'jwk',
    viewerPubJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const raw = await window.crypto.subtle.exportKey('raw', sessionAesKey);
  const rawBytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
  const wrapped = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, viewerPub, rawBytes);
  return base64FromBytes(new Uint8Array(wrapped));
}

export async function unwrapSessionKey(viewerPrivateKey, wrappedKeyB64) {
  const wrappedBytes = bytesFromBase64(wrappedKeyB64);
  const raw = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    viewerPrivateKey,
    wrappedBytes
  );
  const rawBytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
  return window.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt', 'encrypt']
  );
}