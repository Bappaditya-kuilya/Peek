import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransfer } from '../hooks/useTransfer.js';
import { generateEncryptionKey } from '../shared/crypto.js';

function makeFile(name, size, type = 'application/octet-stream') {
  const file = { name, size, type };
  file.slice = () => ({ arrayBuffer: async () => new ArrayBuffer(size) });
  return file;
}

function makeTransport({ bufferedAmount = 0 } = {}) {
  return {
    sent: [],
    currentBuffered: bufferedAmount,
    drainCalls: 0,
    sendBinary(buf) {
      this.sent.push(buf);
    },
    getBufferedAmount() {
      return this.currentBuffered;
    },
    waitForDrain() {
      this.drainCalls += 1;
      return Promise.resolve();
    },
  };
}

describe('useTransfer.sendFiles', () => {
  it('passes file.size in onSendProgress (bug1)', async () => {
    const key = await generateEncryptionKey();
    const progressCalls = [];
    const { result } = renderHook(() =>
      useTransfer({ encryptionKey: key, onSendProgress: (p) => progressCalls.push(p) })
    );

    const transport = makeTransport();

    await act(async () => {
      await result.current.sendFiles([makeFile('a.bin', 1)], transport);
    });

    const last = progressCalls[progressCalls.length - 1];
    expect(last.size).toBe(1);
    expect(last).toMatchObject({ fileId: 0, fileName: 'a.bin', size: 1, progress: 100 });
  });

  it('awaits transport.waitForDrain after each chunk (bug2)', async () => {
    const key = await generateEncryptionKey();
    const { result } = renderHook(() => useTransfer({ encryptionKey: key }));

    const transport = makeTransport({ bufferedAmount: 32 * 1024 * 1024 });

    await act(async () => {
      await result.current.sendFiles([makeFile('big.bin', 1)], transport);
    });

    expect(transport.drainCalls).toBe(1);
  });
});
