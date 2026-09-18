import '@testing-library/react';

// Mock crypto.subtle for tests to avoid jsdom crypto issues in CI
if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
  const originalEncrypt = window.crypto.subtle.encrypt;
  const originalDecrypt = window.crypto.subtle.decrypt;
  const originalGenerateKey = window.crypto.subtle.generateKey;
  const originalImportKey = window.crypto.subtle.importKey;
  const originalExportKey = window.crypto.subtle.exportKey;

  // Mock getRandomValues to return deterministic values for tests
  window.crypto.getRandomValues = function(array) {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  };

  // Mock encrypt to return a simple deterministic "encrypted" buffer
  // RSA-OAEP passes through to real WebCrypto for viewer key grants.
  window.crypto.subtle.encrypt = async function (algorithm, key, data) {
    if (algorithm?.name === 'RSA-OAEP') {
      return originalEncrypt.call(window.crypto.subtle, algorithm, key, data);
    }
    const dataBytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const dataLength = dataBytes.length;
    const result = new Uint8Array(12 + dataBytes.length + 16); // IV + data + auth tag
    // IV (12 bytes)
    result.set(new Uint8Array(12), 0);
    // Data
    result.set(dataBytes, 12);
    // Auth tag (16 bytes)
    result.set(new Uint8Array(16), 12 + dataBytes.length);
    return result.buffer;
  };

  window.crypto.subtle.decrypt = async function (algorithm, key, data) {
    if (algorithm?.name === 'RSA-OAEP') {
      return originalDecrypt.call(window.crypto.subtle, algorithm, key, data);
    }
    const dataView = new Uint8Array(data);
    // Skip IV (12 bytes) and auth tag (16 bytes), return the middle
    const dataLength = data.byteLength - 12 - 16;
    return dataView.slice(12, 12 + dataLength).buffer;
  };

  window.crypto.subtle.generateKey = async function (algorithm, ...rest) {
    if (algorithm?.name && algorithm.name !== 'AES-GCM') {
      return originalGenerateKey.call(window.crypto.subtle, algorithm, ...rest);
    }
    return { type: 'secret', algorithm: { name: 'AES-GCM', length: 256 } };
  };

  window.crypto.subtle.importKey = async function (format, ...rest) {
    if (format === 'jwk') {
      return originalImportKey.call(window.crypto.subtle, format, ...rest);
    }
    try {
      return await originalImportKey.call(window.crypto.subtle, format, ...rest);
    } catch {
      return { type: 'secret', algorithm: { name: 'AES-GCM', length: 256 } };
    }
  };

  window.crypto.subtle.exportKey = async function (format, ...rest) {
    if (format === 'jwk') {
      return originalExportKey.call(window.crypto.subtle, format, ...rest);
    }
    try {
      return await originalExportKey.call(window.crypto.subtle, format, ...rest);
    } catch {
      return new ArrayBuffer(32);
    }
  };
}
