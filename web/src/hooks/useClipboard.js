import { useEffect, useRef, useState } from 'react';
import {
  decryptClipboardText,
  encryptClipboardText,
  MAX_CLIPBOARD_CHARS,
  normalizeClipboardText,
} from '../utils/clipboardCrypto.js';

const DEBOUNCE_MS = 500;

export function useClipboard({ encryptionKey, socketRef }) {
  const [draftText, setDraftText] = useState('');
  const [receivedText, setReceivedText] = useState('');
  const [copyState, setCopyState] = useState('idle');
  const debounceRef = useRef(null);
  const copyResetRef = useRef(null);
  const pendingTextRef = useRef('');

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
      if (copyResetRef.current) {
        window.clearTimeout(copyResetRef.current);
      }
    };
  }, []);

  function updateDraft(nextValue) {
    const normalized = normalizeClipboardText(nextValue);
    setDraftText(normalized);
    pendingTextRef.current = normalized;

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      flushDraft().catch(() => {});
    }, DEBOUNCE_MS);
  }

  async function flushDraft() {
    const socket = socketRef.current;
    if (!encryptionKey || socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const payload = await encryptClipboardText(encryptionKey, pendingTextRef.current);
      socket.send(JSON.stringify({ type: 'clipboard-push', payload }));
      return true;
    } catch {
      return false;
    }
  }

  async function handleClipboardMessage(message) {
    if (!encryptionKey || !message?.payload) {
      return false;
    }

    try {
      const text = await decryptClipboardText(encryptionKey, message.payload);
      setReceivedText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function copyReceivedText() {
    try {
      await navigator.clipboard.writeText(receivedText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }

    if (copyResetRef.current) {
      window.clearTimeout(copyResetRef.current);
    }
    copyResetRef.current = window.setTimeout(() => setCopyState('idle'), 1500);
  }

  return {
    copyReceivedText,
    copyState,
    draftText,
    flushDraft,
    handleClipboardMessage,
    maxChars: MAX_CLIPBOARD_CHARS,
    receivedText,
    setDraftText: updateDraft,
  };
}
