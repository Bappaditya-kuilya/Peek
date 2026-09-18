import { describe, it, expect } from 'vitest';
import {
  exportKeyToBase64,
  generateEncryptionKey,
  generateViewerKeypair,
  unwrapSessionKey,
  wrapSessionKeyForViewer,
} from './crypto.js';

describe('viewer key wrap (multi-viewer grant)', () => {
  it('wraps and unwraps the session file-key via RSA-OAEP-2048/SHA-256', async () => {
    const sessionKey = await generateEncryptionKey();
    const { privateKey, pubKeyJwk } = await generateViewerKeypair();
    expect(pubKeyJwk.kty).toBe('RSA');
    const wrappedKeyB64 = await wrapSessionKeyForViewer(pubKeyJwk, sessionKey);
    expect(typeof wrappedKeyB64).toBe('string');
    expect(wrappedKeyB64.length).toBeGreaterThan(10);
    const unwrappedKey = await unwrapSessionKey(privateKey, wrappedKeyB64);
    const originalB64 = await exportKeyToBase64(sessionKey);
    const roundtripB64 = await exportKeyToBase64(unwrappedKey);
    expect(roundtripB64).toBe(originalB64);
  });

  it('uses RSA-OAEP-2048 + SHA-256 for the viewer keypair', async () => {
    const { pubKeyJwk } = await generateViewerKeypair();
    expect(pubKeyJwk.kty).toBe('RSA');
    expect(pubKeyJwk.alg).toBe('RSA-OAEP-256');
    expect(pubKeyJwk.n.length).toBeGreaterThan(300);
  });
});
