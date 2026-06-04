import {
  exportKeyToBase64,
  generateEncryptionKey,
  importKeyFromBase64,
} from '../hooks/useCrypto.js';

const IV_LENGTH = 12;
const TEN_MB = 10 * 1024 * 1024;

function ensurePeekFile(file) {
  if (!(file instanceof File)) {
    throw new Error('Invalid file');
  }

  if (file.size > TEN_MB) {
    throw new Error('Peek supports files up to 10MB');
  }

  const mimeType = file.type || '';
  const supported =
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/');

  if (!supported) {
    throw new Error('Peek supports only PDF and image files');
  }
}

export async function encryptViewFile(file) {
  ensurePeekFile(file);

  const key = await generateEncryptionKey();
  const keyBase64 = await exportKeyToBase64(key);
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = await file.arrayBuffer();
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const encryptedBytes = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  encryptedBytes.set(iv, 0);
  encryptedBytes.set(new Uint8Array(ciphertext), IV_LENGTH);

  return {
    encryptedBlob: encryptedBytes.buffer,
    key,
    keyBase64,
    mimeType: file.type || 'application/octet-stream',
    filename: file.name,
    size: file.size,
  };
}

export async function decryptViewFile(encryptionKey, encryptedBuffer) {
  const bytes = new Uint8Array(encryptedBuffer);
  const iv = bytes.slice(0, IV_LENGTH);
  const ciphertext = bytes.slice(IV_LENGTH);
  return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encryptionKey, ciphertext);
}

export function createViewUrl(viewId, keyBase64) {
  const origin = window.location.origin.replace(/\/$/, '');
  return `${origin}/view/${viewId}?k=${encodeURIComponent(keyBase64)}`;
}

export async function uploadEncryptedView({
  encryptedBlob,
  expiresIn,
  filename,
  httpUrl,
  mimeType,
  onceOnly,
}) {
  const response = await fetch(`${httpUrl}/view`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Expires-In': String(expiresIn),
      'X-Filename': filename,
      'X-Mime-Type': mimeType,
      'X-Once-Only': onceOnly ? 'true' : 'false',
    },
    body: encryptedBlob,
  });

  if (!response.ok) {
    throw new Error('Unable to upload Peek');
  }

  return response.json();
}

export async function importViewKey(keyBase64) {
  return importKeyFromBase64(keyBase64);
}
