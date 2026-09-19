import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransfer } from '../hooks/useTransfer.js';
import { encryptChunk, generateEncryptionKey } from '../shared/crypto.js';
import {
  encodeChunkPacket,
  encodeFileCompletePacket,
  encodeManifestPacket,
} from '../shared/packetProtocol.js';

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

  it('upserts second manifest, preserving completed files (S-upsert)', async () => {
    const key = await generateEncryptionKey();
    const manifests = [];
    const completes = [];
    const { result } = renderHook(() =>
      useTransfer({
        encryptionKey: key,
        onManifest: (files) => manifests.push(files),
        onReceiveComplete: (file) => completes.push(file),
      })
    );

    async function feed(packet) {
      const encrypted = await encryptChunk(key, packet);
      await act(async () => {
        await result.current.handleBinaryMessage(encrypted);
      });
    }

    await feed(encodeManifestPacket([makeFile('a.bin', 1)]));
    expect(manifests).toHaveLength(1);

    await feed(encodeChunkPacket(0, 0, new Uint8Array([7])));
    await feed(encodeFileCompletePacket(0));
    expect(completes).toHaveLength(1);

    await feed(encodeManifestPacket([makeFile('a.bin', 1), makeFile('b.bin', 1)]));
    expect(manifests).toHaveLength(2);
    const second = manifests[1];
    expect(second).toHaveLength(2);
    const old = second.find((file) => file.id === 0);
    const fresh = second.find((file) => file.id === 1);
    expect(old.complete).toBe(true);
    expect(old.blob).toBeInstanceOf(Blob);
    expect(fresh.complete).toBe(false);
  });

  it('merges second manifest, keeping partial bytes (mid-transfer add)', async () => {
    const key = await generateEncryptionKey();
    const manifests = [];
    const { result } = renderHook(() =>
      useTransfer({ encryptionKey: key, onManifest: (files) => manifests.push(files) })
    );

    async function feed(packet) {
      const encrypted = await encryptChunk(key, packet);
      await act(async () => {
        await result.current.handleBinaryMessage(encrypted);
      });
    }

    const big = makeFile('big.bin', 2 * 48 * 1024);
    await feed(encodeManifestPacket([big]));
    await feed(encodeChunkPacket(0, 0, new Uint8Array(48 * 1024)));
    await feed(encodeManifestPacket([big, makeFile('b.bin', 1)]));
    expect(manifests).toHaveLength(2);
    const kept = manifests[1].find((file) => file.id === 0);
    expect(kept.complete).toBe(false);
    expect(kept.bytesReceived).toBe(48 * 1024);
    expect(kept.chunks[0]).not.toBeNull();
  });

  it('counts a duplicate chunk once (resend-safe)', async () => {
    const key = await generateEncryptionKey();
    const progresses = [];
    const { result } = renderHook(() =>
      useTransfer({ encryptionKey: key, onReceiveProgress: (p) => progresses.push(p) })
    );

    async function feed(packet) {
      const encrypted = await encryptChunk(key, packet);
      await act(async () => {
        await result.current.handleBinaryMessage(encrypted);
      });
    }

    const big = makeFile('big.bin', 2 * 48 * 1024);
    await feed(encodeManifestPacket([big]));
    await feed(encodeChunkPacket(0, 0, new Uint8Array(48 * 1024)));
    await feed(encodeChunkPacket(0, 0, new Uint8Array(48 * 1024)));
    const last = progresses[progresses.length - 1];
    expect(last.progress).toBe(50);
  });
});
