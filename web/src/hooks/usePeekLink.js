import { useState } from 'react';
import { createViewUrl, encryptViewFile, uploadEncryptedView } from '../utils/viewCrypto.js';

async function copyText(text) {
  if (!text) {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
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
    return true;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function useIncomingPeekLink() {
  const [incomingPeekUrl, setIncomingPeekUrl] = useState('');

  return {
    incomingPeekUrl,
    setIncomingPeekUrl,
  };
}

export function usePeekLink({ fallbackSocketRef, session }) {
  const [peekFile, setPeekFile] = useState(null);
  const [peekExpiresIn, setPeekExpiresIn] = useState(15);
  const [peekOnceOnly, setPeekOnceOnly] = useState(false);
  const [peekUrl, setPeekUrl] = useState('');
  const [peekBusy, setPeekBusy] = useState(false);
  const [peekStatus, setPeekStatus] = useState('');
  const [peekCopyState, setPeekCopyState] = useState('idle');
  const incomingPeek = useIncomingPeekLink();

  async function createPeekLink(file, { pushToPeer = false } = {}) {
    if (!file || !session) {
      return;
    }

    setPeekBusy(true);
    setPeekStatus('');
    try {
      const encrypted = await encryptViewFile(file);
      const view = await uploadEncryptedView({
        encryptedBlob: encrypted.encryptedBlob,
        expiresIn: peekExpiresIn,
        filename: encrypted.filename,
        httpUrl: session.httpUrl,
        mimeType: encrypted.mimeType,
        onceOnly: peekOnceOnly,
      });
      const url = createViewUrl(view.id, encrypted.keyBase64);
      setPeekUrl(url);
      if (pushToPeer) {
        fallbackSocketRef.current?.send(JSON.stringify({
          type: 'view-share-push',
          fileName: encrypted.filename,
          url,
        }));
        setPeekStatus('Peek link ready and sent to the other device.');
      } else {
        setPeekStatus('Peek link ready.');
      }
    } catch (error) {
      setPeekStatus(error?.message || 'Unable to create Peek link.');
    } finally {
      setPeekBusy(false);
    }
  }

  async function handleCreatePeekLink() {
    await createPeekLink(peekFile);
  }

  async function handleSessionPeek(fileRecord) {
    await createPeekLink(fileRecord?.file, { pushToPeer: true });
  }

  async function handleCopyPeekLink() {
    if (!peekUrl) {
      return;
    }

    try {
      await copyText(peekUrl);
      setPeekCopyState('copied');
    } catch {
      setPeekCopyState('failed');
    }

    window.setTimeout(() => setPeekCopyState('idle'), 1500);
  }

  return {
    ...incomingPeek,
    handleCopyPeekLink,
    handleCreatePeekLink,
    handleSessionPeek,
    peekBusy,
    peekCopyState,
    peekExpiresIn,
    peekFile,
    peekOnceOnly,
    peekStatus,
    peekUrl,
    setPeekExpiresIn,
    setPeekFile,
    setPeekOnceOnly,
  };
}
