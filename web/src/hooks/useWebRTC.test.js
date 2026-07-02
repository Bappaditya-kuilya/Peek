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
  global.RTCPeerConnection = vi.fn(() => fakePeer);
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
