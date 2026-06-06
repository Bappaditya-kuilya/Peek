import { useEffect, useRef, useState } from 'react';
import {
  decryptClipboardText,
  encryptClipboardText,
  MAX_CLIPBOARD_CHARS,
  normalizeClipboardText,
} from '../utils/clipboardCrypto.js';

const DEBOUNCE_MS = 500;

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('copy failed');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

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
    if (!receivedText) {
      return false;
    }

    try {
      await writeTextToClipboard(receivedText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
      return false;
    }

    if (copyResetRef.current) {
      window.clearTimeout(copyResetRef.current);
    }
    copyResetRef.current = window.setTimeout(() => setCopyState('idle'), 1500);
    return true;
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
