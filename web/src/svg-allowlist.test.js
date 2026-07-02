import { describe, it, expect } from 'vitest';
import { normalizePeekMimeType } from './utils/viewCrypto.js';

describe('SVG allowlist (bug5)', () => {
  it('excludes image/svg+xml → application/octet-stream', () => {
    expect(normalizePeekMimeType({ type: 'image/svg+xml' })).toBe('application/octet-stream');
  });

  it('keeps image/png previewable', () => {
    expect(normalizePeekMimeType({ type: 'image/png' })).toBe('image/png');
  });

  it('keeps application/pdf previewable', () => {
    expect(normalizePeekMimeType({ type: 'application/pdf' })).toBe('application/pdf');
  });
});