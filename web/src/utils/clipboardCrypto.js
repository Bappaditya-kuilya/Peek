import { decryptChunk, encryptChunk } from '../hooks/useCrypto.js';

const MAX_CLIPBOARD_CHARS = 2000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function base64ToBytes(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function normalizeClipboardText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').slice(0, MAX_CLIPBOARD_CHARS);
}

export async function encryptClipboardText(key, text) {
  const normalized = normalizeClipboardText(text);
  const encrypted = await encryptChunk(key, encoder.encode(normalized));
  return bytesToBase64(new Uint8Array(encrypted));
}

export async function decryptClipboardText(key, payloadBase64) {
  const encryptedBytes = base64ToBytes(String(payloadBase64 || ''));
  const decrypted = await decryptChunk(key, encryptedBytes.buffer);
  return normalizeClipboardText(decoder.decode(decrypted));
}

export { MAX_CLIPBOARD_CHARS };
