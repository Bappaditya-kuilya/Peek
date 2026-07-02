import {
  encryptChunk,
  exportKeyToBase64,
  generateEncryptionKey,
} from '../shared/crypto.js';

const FIFTY_MB = 50 * 1024 * 1024;
// Types the in-browser viewer can render inline. Anything else is still shared
// end-to-end encrypted, but the receiver gets a Download button instead of a
// preview. SVG is intentionally excluded — it can carry script.
const PREVIEWABLE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function normalizePeekMimeType(file) {
  const mimeType = String(file?.type || '').trim().toLowerCase();
  if (mimeType === 'image/jpg') {
    return 'image/jpeg';
  }
  if (PREVIEWABLE_MIME_TYPES.has(mimeType)) {
    return mimeType;
  }
  // Unknown / non-previewable: hand it through as a generic binary. The browser
  // value (e.g. application/zip) is dropped to keep the header predictable.
  return 'application/octet-stream';
}

function ensurePeekFile(file) {
  if (!(file instanceof File)) {
    throw new Error('Invalid file');
  }

  if (file.size > FIFTY_MB) {
    throw new Error('Peek supports files up to 50MB');
  }

  return normalizePeekMimeType(file);
}

export async function encryptViewFile(file) {
  const mimeType = ensurePeekFile(file);

  const key = await generateEncryptionKey();
  const keyBase64 = await exportKeyToBase64(key);
  const plaintext = await file.arrayBuffer();
  const encryptedBlob = await encryptChunk(key, plaintext);

  return {
    encryptedBlob,
    key,
    keyBase64,
    mimeType,
    filename: file.name,
    size: file.size,
  };
}

export function createViewUrl(viewId, keyBase64) {
  const origin = window.location.origin.replace(/\/$/, '');
  // The key lives in the URL fragment (#…), which browsers never transmit to
  // the server. Keeping it out of the query string prevents the static host,
  // CDNs, and proxy logs from ever seeing the decryption key.
  return `${origin}/view.html?id=${encodeURIComponent(viewId)}#k=${encodeURIComponent(keyBase64)}`;
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
