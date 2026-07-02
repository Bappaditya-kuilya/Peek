import { decryptChunk, encryptChunk, encoder, decoder, base64FromBytes, bytesFromBase64 } from './crypto.js';

export const MAX_CLIPBOARD_CHARS = 2000;

export function normalizeClipboardText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').slice(0, MAX_CLIPBOARD_CHARS);
}

export async function encryptClipboardText(key, text) {
  const normalized = normalizeClipboardText(text);
  const encrypted = await encryptChunk(key, encoder.encode(normalized));
  return base64FromBytes(new Uint8Array(encrypted));
}

export async function decryptClipboardText(key, payloadBase64) {
  const encryptedBytes = bytesFromBase64(String(payloadBase64 || ''));
  const decrypted = await decryptChunk(key, encryptedBytes.buffer);
  return normalizeClipboardText(decoder.decode(decrypted));
}