
const MAX_CLIPBOARD_CHARS = 2000;

function normalizeClipboardText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').slice(0, MAX_CLIPBOARD_CHARS);
}

async function encryptClipboardText(key, text) {
  const normalized = normalizeClipboardText(text);
  const encrypted = await encryptChunk(key, encoder.encode(normalized));
  return base64FromBytes(new Uint8Array(encrypted));
}

async function decryptClipboardText(key, payloadBase64) {
  const encryptedBytes = bytesFromBase64(String(payloadBase64 || ''));
  const decrypted = await decryptChunk(key, encryptedBytes.buffer);
  return normalizeClipboardText(decoder.decode(decrypted));
}