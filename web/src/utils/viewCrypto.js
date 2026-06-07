import {
  exportKeyToBase64,
  generateEncryptionKey,
  importKeyFromBase64,
} from '../hooks/useCrypto.js';

const IV_LENGTH = 12;
const TEN_MB = 10 * 1024 * 1024;
const SUPPORTED_PEEK_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

function inferMimeTypeFromFilename(filename = '') {
  const normalizedName = String(filename).trim().toLowerCase();
  if (normalizedName.endsWith('.pdf')) return 'application/pdf';
  if (normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) return 'image/jpeg';
  if (normalizedName.endsWith('.png')) return 'image/png';
  if (normalizedName.endsWith('.gif')) return 'image/gif';
  if (normalizedName.endsWith('.webp')) return 'image/webp';
  if (normalizedName.endsWith('.svg')) return 'image/svg+xml';
  return '';
}

function normalizePeekMimeType(file) {
  const mimeType = String(file?.type || '').trim().toLowerCase();
  if (mimeType === 'image/jpg') {
    return 'image/jpeg';
  }

  if (SUPPORTED_PEEK_MIME_TYPES.has(mimeType)) {
    return mimeType;
  }

  return inferMimeTypeFromFilename(file?.name);
}

function ensurePeekFile(file) {
  if (!(file instanceof File)) {
    throw new Error('Invalid file');
  }

  if (file.size > TEN_MB) {
    throw new Error('Peek supports files up to 10MB');
  }

  const mimeType = normalizePeekMimeType(file);
  if (!SUPPORTED_PEEK_MIME_TYPES.has(mimeType)) {
    throw new Error('Peek supports only PDF and image files');
  }

  return mimeType;
}

export async function encryptViewFile(file) {
  const mimeType = ensurePeekFile(file);

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
    mimeType,
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
  return `${origin}/view.html?id=${encodeURIComponent(viewId)}&k=${encodeURIComponent(keyBase64)}`;
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
