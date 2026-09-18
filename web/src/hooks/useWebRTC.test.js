import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebRTC } from './useWebRTC.js';

class FakePeerConnection {
  constructor() {
    this.iceConnectionState = 'new';
    this.onicecandidate = null;
    this.oniceconnectionstatechange = null;
    this.ondatachannel = null;
    this._closed = false;
    this.restartIceCalls = 0;
  }
  restartIce() { this.restartIceCalls += 1; }
  createOffer() { return Promise.resolve({ type: 'offer', sdp: 'fake' }); }
  createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'fake' }); }
  setLocalDescription() { return Promise.resolve(); }
  setRemoteDescription() { return Promise.resolve(); }
  addIceCandidate() { return Promise.resolve(); }
  createDataChannel() { return { binaryType: '', onopen: null, onmessage: null, onclose: null }; }
  close() { this._closed = true; }
  setState(state) {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
  }
}

let fakePeer;
beforeEach(() => {
  fakePeer = new FakePeerConnection();
  global.RTCPeerConnection = vi.fn(function () { return fakePeer; });
});
afterEach(() => {
  delete global.RTCPeerConnection;
});

describe('useWebRTC ICE restart', () => {
  it('attempts ICE restart on first failure, not fallback', () => {
    const onFallbackNeeded = vi.fn();
    const { result } = renderHook(() => useWebRTC({ onFallbackNeeded }));

    act(() => result.current.createPeerConnection());
    act(() => fakePeer.setState('failed'));

    expect(fakePeer.restartIceCalls).toBe(1);
    expect(onFallbackNeeded).not.toHaveBeenCalled();
  });

  it('attempts ICE restart on second failure, not fallback', () => {
    const onFallbackNeeded = vi.fn();
    const { result } = renderHook(() => useWebRTC({ onFallbackNeeded }));

    act(() => result.current.createPeerConnection());
    act(() => fakePeer.setState('failed'));
    act(() => fakePeer.setState('failed'));

    expect(fakePeer.restartIceCalls).toBe(2);
    expect(onFallbackNeeded).not.toHaveBeenCalled();
  });

  it('calls onFallbackNeeded after max restarts (2)', () => {
    const onFallbackNeeded = vi.fn();
    const { result } = renderHook(() => useWebRTC({ onFallbackNeeded }));

    act(() => result.current.createPeerConnection());
    act(() => fakePeer.setState('failed'));
    act(() => fakePeer.setState('failed'));
    act(() => fakePeer.setState('failed'));

    expect(fakePeer.restartIceCalls).toBe(2);
    expect(onFallbackNeeded).toHaveBeenCalledTimes(1);
  });

  it('resets restart count on successful connection', () => {
    const onFallbackNeeded = vi.fn();
    const { result } = renderHook(() => useWebRTC({ onFallbackNeeded }));

    act(() => result.current.createPeerConnection());
    act(() => fakePeer.setState('failed'));
    act(() => fakePeer.setState('connected'));

    // Now 2 more failures should still restart (not fallback)
    act(() => fakePeer.setState('failed'));
    act(() => fakePeer.setState('failed'));
    act(() => fakePeer.setState('failed'));

    expect(fakePeer.restartIceCalls).toBe(3);
    expect(onFallbackNeeded).toHaveBeenCalledTimes(1);
  });
});

describe('useWebRTC data channel dispatch', () => {
  function makeChannel() {
    return { binaryType: '', onmessage: null, onopen: null, onclose: null, close: vi.fn(), send: vi.fn() };
  }

  function setupReceiverPath(callbacks) {
    const { result } = renderHook(() => useWebRTC(callbacks));
    const channel = makeChannel();
    act(() => result.current.createPeerConnection());
    act(() => fakePeer.ondatachannel({ channel }));
    return channel;
  }

  it('forwards binary to the screen handler instead of dropping it', () => {
    const onBinary = vi.fn();
    const onDeviceId = vi.fn();
    const channel = setupReceiverPath({
      onDeviceId,
      onDataChannel(ch) {
        ch.onmessage = (event) => onBinary(event.data);
      },
    });

    const bytes = new Uint8Array([1, 2, 3]).buffer;
    act(() => channel.onmessage({ data: bytes }));

    expect(onBinary).toHaveBeenCalledTimes(1);
    expect(onBinary).toHaveBeenCalledWith(bytes);
    expect(onDeviceId).not.toHaveBeenCalled();
  });

  it('still routes device-id strings to onDeviceId', () => {
    const onBinary = vi.fn();
    const onDeviceId = vi.fn();
    const channel = setupReceiverPath({
      onDeviceId,
      onDataChannel(ch) {
        ch.onmessage = (event) => onBinary(event.data);
      },
    });

    act(() => channel.onmessage({ data: JSON.stringify({ type: 'device-id', deviceId: 'd1' }) }));

    expect(onDeviceId).toHaveBeenCalledWith('d1');
    expect(onBinary).not.toHaveBeenCalled();
  });
});
