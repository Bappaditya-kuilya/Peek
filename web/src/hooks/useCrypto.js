const IV_LENGTH = 12;

function base64FromBytes(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function bytesFromBase64(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function generateEncryptionKey() {
  // SECURITY: All encryption uses the browser Web Crypto API.
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
  return window.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
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
