import { useEffect, useRef, useState } from 'react';
import { SESSION_ENDED_CLOSE_CODES, SESSION_REPLACED_CLOSE_CODE } from '../shared/transport.js';

// ponytail: exp backoff 1,2,4,8,30s; 5 retries then give up
const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 30000];
const MAX_RETRIES = BACKOFF_STEPS.length;

export const WS_IDLE = 'idle';
export const WS_OPEN = 'open';
export const WS_RECONNECTING = 'reconnecting';
export const WS_LOST = 'lost';

function shouldRetry(code) {
  return !SESSION_ENDED_CLOSE_CODES.has(code) && code !== SESSION_REPLACED_CLOSE_CODE;
}

export function useWebSocket({ url, enabled = true, onOpen, onMessage, onClose }) {
  const socketRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const handlersRef = useRef({ onOpen, onMessage, onClose });
  handlersRef.current = { onOpen, onMessage, onClose };
  const [connectionState, setConnectionState] = useState(WS_IDLE);

  useEffect(() => {
    if (!enabled) {
      setConnectionState(WS_IDLE);
      return undefined;
    }

    let active = true;

    function connect() {
      if (!active) return;
      setConnectionState((prev) => (prev === WS_OPEN ? WS_RECONNECTING : WS_IDLE));
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setConnectionState(WS_OPEN);
        handlersRef.current.onOpen?.(socket);
      };

      socket.onmessage = (event) => {
        handlersRef.current.onMessage?.(event, socket);
      };

      socket.onclose = (event) => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        if (!shouldRetry(event.code)) {
          setConnectionState(WS_LOST);
          handlersRef.current.onClose?.(event, { willRetry: false, isFinal: true });
          return;
        }
        if (retryRef.current >= MAX_RETRIES) {
          setConnectionState(WS_LOST);
          handlersRef.current.onClose?.(event, { willRetry: false, isFinal: true });
          return;
        }
        const delay = BACKOFF_STEPS[retryRef.current];
        retryRef.current += 1;
        setConnectionState(WS_RECONNECTING);
        handlersRef.current.onClose?.(event, { willRetry: true, isFinal: false });
        timerRef.current = window.setTimeout(() => {
          if (active) connect();
        }, delay);
      };

      socket.onerror = () => {};
    }

    connect();

    return () => {
      active = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const s = socketRef.current;
      if (s) {
        s.onclose = null;
        s.close();
        socketRef.current = null;
      }
      setConnectionState(WS_IDLE);
    };
  }, [url, enabled]);

  function send(data) {
    const s = socketRef.current;
    if (s && s.readyState === 1) {
      s.send(data);
      return true;
    }
    return false;
  }

  return { socketRef, connectionState, send };
}