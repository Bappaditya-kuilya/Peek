import { describe, it, expect } from 'vitest';
import { formatBytes } from './shared/format.js';

describe('formatBytes (bug4)', () => {
  it('formats 2 GiB as "2.0 GB"', () => {
    expect(formatBytes(2147483648)).toBe('2.0 GB');
  });

  it('formats 0 B', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats 1 MiB as "1.0 MB"', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });

  it('formats 1 KiB as "1.0 KB"', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });
});