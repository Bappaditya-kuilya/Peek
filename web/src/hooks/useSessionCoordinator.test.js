import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReceiverSessionCoordinator, useSenderSessionCoordinator } from './useSessionCoordinator.js';
import {
  exportKeyToBase64,
  generateEncryptionKey,
  generateViewerKeypair,
  wrapSessionKeyForViewer,
} from '../shared/crypto.js';

class FakeSocket {
  static last = null;
  static all = [];
  constructor() {
    this.sent = [];
    this.readyState = 1;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    FakeSocket.last = this;
    FakeSocket.all.push(this);
  }
  send(data) { this.sent.push(data); }
  close() {}
  fireOpen() { this.onopen?.(); }
  fireMessage(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

describe('sender viewer-pending → sender-key-grant handshake', () => {
  beforeEach(() => {
    FakeSocket.last = null;
    FakeSocket.all = [];
    global.WebSocket = FakeSocket;
    global.WebSocket.OPEN = 1;
  });
  afterEach(() => { delete global.WebSocket; });

  it('queues viewer-pending and sends sender-key-grant on approve', async () => {
    const sessionKey = await generateEncryptionKey();
    const session = { sessionId: 'a'.repeat(16), token: 'b'.repeat(64), key: sessionKey, wsUrl: 'ws://test' };
    const fallbackSocketRef = { current: null };
    const { result } = renderHook(() => useSenderSessionCoordinator({
      clipboard: { flushDraft: async () => {} },
      fallbackSocketRef,
      fallbackTimeoutRef: { current: null },
      selectedFiles: [],
      session,
      setPeerConnected: () => {},
      setIncomingPeekUrl: () => {},
      setScreen: () => {},
      setStatusMessage: () => {},
      setTransferStarted: () => {},
      setTransportMode: () => {},
      transfer: { handleBinaryMessage: async () => {} },
      transferStartedRef: { current: false },
      transportRef: { current: null },
      webRtc: { createOffer: async () => ({ type: 'offer' }), dataChannelRef: { current: null }, closePeerConnection: () => {} },
    }));

    await act(async () => { FakeSocket.last.fireOpen(); });
    const { pubKeyJwk } = await generateViewerKeypair();
    await act(async () => {
      FakeSocket.last.fireMessage({ type: 'viewer-pending', receiverId: 'r1', pubKeyJwk, viewerName: 'Alice' });
    });
    expect(result.current.pendingViewers.map((v) => v.receiverId)).toContain('r1');

    await act(async () => { await result.current.approveViewer('r1'); });
    const sent = FakeSocket.last.sent.map((s) => JSON.parse(s));
    const grant = sent.find((m) => m.type === 'sender-key-grant');
    expect(grant).toBeTruthy();
    expect(grant.targetReceiverId).toBe('r1');
    expect(typeof grant.wrappedKeyB64).toBe('string');
    expect(result.current.pendingViewers.length).toBe(0);
  });

  it('resends files over relay when a later viewer joins mid-session', async () => {
    const sessionKey = await generateEncryptionKey();
    const session = { sessionId: 'a'.repeat(16), token: 'b'.repeat(64), key: sessionKey, wsUrl: 'ws://test' };
    const fallbackSocketRef = { current: null };
    const relayTransport = { sendBinary: () => {}, waitForDrain: async () => {}, getBufferedAmount: () => 0 };
    const fakeFile = { name: 'a.bin', size: 1, slice: () => ({ arrayBuffer: async () => new ArrayBuffer(1) }) };
    const sendFiles = vi.fn(async () => {});
    renderHook(() => useSenderSessionCoordinator({
      clipboard: { flushDraft: async () => {} },
      fallbackSocketRef,
      fallbackTimeoutRef: { current: null },
      selectedFiles: [{ id: 0, file: fakeFile }],
      session,
      setPeerConnected: () => {},
      setIncomingPeekUrl: () => {},
      setScreen: () => {},
      setStatusMessage: () => {},
      setTransferStarted: () => {},
      setTransportMode: () => {},
      transfer: { handleBinaryMessage: async () => {}, sendFiles },
      transferStartedRef: { current: true },
      transportRef: { current: relayTransport },
      webRtc: { createOffer: async () => ({ type: 'offer' }), dataChannelRef: { current: null }, closePeerConnection: () => {} },
    }));

    await act(async () => { FakeSocket.last.fireOpen(); });
    fallbackSocketRef.current = { send: () => {} };
    await act(async () => { FakeSocket.last.fireMessage({ type: 'peer-connected', receiverId: 'r9' }); });
    await vi.waitFor(() => {
      expect(sendFiles).toHaveBeenCalledTimes(1);
    }, { timeout: 5000 });
    expect(sendFiles.mock.calls[0][0]).toHaveLength(1);
    expect(sendFiles.mock.calls[0][1]).not.toBe(relayTransport);
  });
});

describe('receiver receiver-join-request → key-grant handshake', () => {
  beforeEach(() => {
    FakeSocket.last = null;
    FakeSocket.all = [];
    global.WebSocket = FakeSocket;
    global.WebSocket.OPEN = 1;
    localStorage.clear();
  });
  afterEach(() => { delete global.WebSocket; });

  it('sends receiver-join-request then unlocks key-grant into the transfer key', async () => {
    const sessionId = 'c'.repeat(16);
    const token = 'd'.repeat(64);
    const fallbackSocketRef = { current: null };
    let joined = false;
    let grantedKey = null;
    renderHook(() => useReceiverSessionCoordinator({
      clipboard: { flushDraft: async () => {} },
      fallbackSocketRef,
      fullLinkMode: false,
      key: null,
      keyBase64: '',
      sessionId,
      setIncomingPeekUrl: () => {},
      setJoined: (v) => { joined = v; },
      setKey: (k) => { grantedKey = k; },
      setSessionExpiresAt: () => {},
      setStatusDanger: () => {},
      setStatusMessage: () => {},
      setTransportMode: () => {},
      token,
      transfer: { handleBinaryMessage: async () => {} },
      webRtc: { acceptOffer: async () => ({}), addIceCandidate: async () => {} },
    }));

    await act(async () => {
      FakeSocket.last.fireOpen();
    });
    // Poll, don't sleep: CI runners are slower than laptops and a fixed
    // 800ms wait flaked there (join arrives late, not never).
    let joinSent;
    await vi.waitFor(() => {
      joinSent = FakeSocket.last.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'receiver-join-request');
      expect(joinSent).toBeTruthy();
    }, { timeout: 5000 });
    expect(joinSent).toBeTruthy();
    expect(joinSent.sessionId).toBe(sessionId);
    expect(joinSent.token).toBe(token);
    expect(joinSent.pubKeyJwk.kty).toBe('RSA');
    expect(typeof joinSent.viewerName).toBe('string');

    const sessionKey = await generateEncryptionKey();
    const wrappedKeyB64 = await wrapSessionKeyForViewer(joinSent.pubKeyJwk, sessionKey);
    await act(async () => {
      FakeSocket.last.fireMessage({ type: 'key-grant', wrappedKeyB64 });
    });
    // RSA-OAEP unwrap is slow on loaded runners — poll, don't sleep.
    await vi.waitFor(() => {
      expect(joined).toBe(true);
      expect(grantedKey).toBeTruthy();
    }, { timeout: 8000 });
    expect(await exportKeyToBase64(grantedKey)).toBe(await exportKeyToBase64(sessionKey));
  });
});
