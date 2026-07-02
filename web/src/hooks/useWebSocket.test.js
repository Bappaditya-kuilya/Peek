import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket, WS_IDLE, WS_OPEN, WS_RECONNECTING, WS_LOST } from '../hooks/useWebSocket.js';

class FakeSocket {
  static last = null;
  constructor(url) {
    this.url = url;
    this.binaryType = 'blob';
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._closed = false;
    FakeSocket.last = this;
  }
  send() {}
  close(code = 1000) {
    if (this._closed) return;
    this._closed = true;
    this.readyState = 3;
    if (this.onclose) this.onclose({ code });
  }
  fireOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
}

function renderWs({ url = 'ws://test', enabled = true, onClose = vi.fn() } = {}) {
  return renderHook(({ url, enabled }) => useWebSocket({ url, enabled, onClose }), {
    initialProps: { url, enabled },
  });
}

describe('useWebSocket reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.WebSocket = FakeSocket;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete global.WebSocket;
  });

  it('gives up after 5 retries and signals isFinal', () => {
    const onClose = vi.fn();
    renderHook(() => useWebSocket({ url: 'ws://test', onClose }));

    for (let i = 0; i < 5; i++) {
      FakeSocket.last.close(1006);
      act(() => vi.runOnlyPendingTimers());
    }

    FakeSocket.last.close(1006);
    const finalCall = onClose.mock.calls[onClose.mock.calls.length - 1];
    expect(finalCall[1]).toEqual({ willRetry: false, isFinal: true });
  });

  it('schedules reconnect with backoff sequence 1000,2000,4000,8000,30000', () => {
    const onClose = vi.fn();
    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    renderHook(() => useWebSocket({ url: 'ws://test', onClose }));

    const expected = [1000, 2000, 4000, 8000, 30000];
    const actualDelays = [];

    for (const expectedDelay of expected) {
      onClose.mockClear();
      setTimeoutSpy.mockClear();
      FakeSocket.last.close(1006);
      expect(onClose.mock.calls[0][1]).toEqual({ willRetry: true, isFinal: false });
      const calls = setTimeoutSpy.mock.calls.filter((c) => typeof c[1] === 'number');
      expect(calls.length).toBe(1);
      expect(calls[0][1]).toBe(expectedDelay);
      actualDelays.push(calls[0][1]);
      act(() => {
        vi.runOnlyPendingTimers();
      });
    }
    expect(actualDelays).toEqual(expected);
    setTimeoutSpy.mockRestore();
  });

  it('resets retry count on successful open', () => {
    const onClose = vi.fn();
    renderHook(() => useWebSocket({ url: 'ws://test', onClose }));

    // close twice (retry 1, 2)
    FakeSocket.last.close(1006);
    act(() => vi.runOnlyPendingTimers());
    FakeSocket.last.close(1006);
    act(() => vi.runOnlyPendingTimers());

    // open successfully -> resets
    FakeSocket.last.fireOpen();

    // now close 5 times should still retry (not give up early)
    for (let i = 0; i < 5; i++) {
      FakeSocket.last.close(1006);
      const call = onClose.mock.calls[onClose.mock.calls.length - 1][1];
      if (i < 5) {
        expect(call.willRetry).toBe(true);
      }
      act(() => vi.runOnlyPendingTimers());
    }
    // 6th close after 5 retries -> isFinal
    FakeSocket.last.close(1006);
    const finalCall = onClose.mock.calls[onClose.mock.calls.length - 1][1];
    expect(finalCall.isFinal).toBe(true);
  });

  it('does not retry on session-ended close codes', () => {
    const onClose = vi.fn();
    renderHook(() => useWebSocket({ url: 'ws://test', onClose }));

    FakeSocket.last.close(4000);
    expect(onClose.mock.calls[0][1]).toEqual({ willRetry: false, isFinal: true });
    // no timer scheduled
    act(() => vi.runOnlyPendingTimers());
    expect(FakeSocket.last._closed).toBe(true);
  });

  it('transitions connectionState: idle → open → reconnecting → lost', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://test' }));

    expect(result.current.connectionState).toBe(WS_IDLE);

    act(() => FakeSocket.last.fireOpen());
    expect(result.current.connectionState).toBe(WS_OPEN);

    act(() => FakeSocket.last.close(1006));
    expect(result.current.connectionState).toBe(WS_RECONNECTING);

    for (let i = 0; i < 5; i++) {
      act(() => vi.runOnlyPendingTimers());
      act(() => FakeSocket.last.close(1006));
    }
    act(() => vi.runOnlyPendingTimers());
    act(() => FakeSocket.last.close(1006));
    expect(result.current.connectionState).toBe(WS_LOST);
  });

  it('send() returns true when open, false when closed', () => {
    const { result } = renderHook(() => useWebSocket({ url: 'ws://test' }));

    expect(result.current.send('hello')).toBe(false);

    act(() => FakeSocket.last.fireOpen());
    // Verify socket is assigned and open
    expect(result.current.socketRef.current).not.toBeNull();
    expect(result.current.socketRef.current.readyState).toBe(1);
    expect(result.current.send('hello')).toBe(true);

    act(() => FakeSocket.last.close(1006));
    expect(result.current.send('hello')).toBe(false);
  });
});