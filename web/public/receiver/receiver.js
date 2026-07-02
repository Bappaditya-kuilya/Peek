const PRODUCTION_RELAY_HTTP_URL = 'https://peek-relay-eku9.onrender.com';
const PRODUCTION_RELAY_WS_URL = 'wss://peek-relay-eku9.onrender.com';
const LOCAL_RELAY_PORT = '3000';
const isLocalHost = (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '0.0.0.0' ||
  window.location.hostname === '[::1]' ||
  /^\d{1,3}(?:\.\d{1,3}){3}$/.test(window.location.hostname)
);
const RELAY_HTTP_URL = isLocalHost
  ? `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${window.location.hostname}:${LOCAL_RELAY_PORT}`
  : PRODUCTION_RELAY_HTTP_URL;
const RELAY_WS_URL = isLocalHost
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:${LOCAL_RELAY_PORT}`
  : PRODUCTION_RELAY_WS_URL;
const CLIPBOARD_DEBOUNCE_MS = 500;
const SESSION_ENDED_CLOSE_CODES = new Set([4000, 4001]);
const SESSION_REPLACED_CLOSE_CODE = 4005;
const MAX_CHUNKS_PER_FILE = 1000000;

const state = {
  activity: [],
  clipboardCopyState: 'idle',
  clipboardDraft: '',
  clipboardReceived: '',
  clipboardSendTimer: null,
  dataChannel: null,
  decryptError: false,
  filesToSend: [],
  incomingFiles: new Map(),
  joined: false,
  joinInfo: parseJoinInfo(),
  lookupResult: null,
  peerConnection: null,
  receivedFiles: [],
  sessionEnded: false,
  socket: null,
  transferStarted: false,
};

function parseJoinInfo() {
  const url = new URL(window.location.href);
  const match = url.pathname.match(/\/r\/([^/]+)/);
  if (!match) {
    return { mode: 'code-entry' };
  }

  const queryToken = url.searchParams.get('t') || '';
  const queryKeyBase64 = url.searchParams.get('k') || '';
  const fragment = window.location.hash.replace(/^#/, '');
  const [fragmentToken, fragmentKeyBase64] = fragment.split('.');
  const token = queryToken || fragmentToken || '';
  const keyBase64 = queryKeyBase64 || fragmentKeyBase64 || '';

  return {
    keyBase64,
    mode: token && keyBase64 ? 'full-link' : 'needs-full-link',
    sessionId: match[1],
    token,
  };
}

function classifyTimer(expiresAt) {
  const remaining = expiresAt - Date.now();
  if (remaining <= 60 * 1000) return 'critical';
  if (remaining <= 5 * 60 * 1000) return 'warning';
  return '';
}

function html(strings, ...values) {
  return strings.reduce((acc, string, index) => {
    const value = values[index];
    if (value && typeof value === 'object' && value.__rawHtml !== undefined) {
      return acc + string + value.__rawHtml;
    }
    return acc + string + escapeHtml(value ?? '');
  }, '');
}

function rawHtml(value) {
  return { __rawHtml: String(value) };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fileIconSvg(type = 'doc') {
  const lines =
    type === 'image'
      ? '<rect x="5" y="6.5" width="6" height="5" stroke="var(--color-text-tertiary)" stroke-width="1" rx="0.5"></rect><path d="M5 10L7 8L8.5 9.5L10 8.5L11 10" stroke="var(--color-text-tertiary)" stroke-width="1"></path>'
      : '<line x1="5.5" y1="7" x2="10.5" y2="7" stroke="var(--color-text-tertiary)" stroke-width="1"></line><line x1="5.5" y1="9.5" x2="10.5" y2="9.5" stroke="var(--color-text-tertiary)" stroke-width="1"></line><line x1="5.5" y1="12" x2="8.5" y2="12" stroke="var(--color-text-tertiary)" stroke-width="1"></line>';

  return rawHtml(html`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 2C3 1.45 3.45 1 4 1H10L13 4V14C13 14.55 12.55 15 12 15H4C3.45 15 3 14.55 3 14V2Z" stroke="var(--color-text-tertiary)" stroke-width="1.2"></path>
    <path d="M10 1V4H13" stroke="var(--color-text-tertiary)" stroke-width="1.2"></path>
    ${lines}
  </svg>`);
}

function render() {
  const app = document.getElementById('app');

  if (state.sessionEnded) {
    app.innerHTML = html`
      <div class="screen stack-lg">
        <div class="screen-header"><div class="wordmark">Peek</div></div>
        <div class="stack-md">
          <h1 class="title">Session ended</h1>
          <div class="copy">The session is no longer available.</div>
        </div>
      </div>
    `;
    return;
  }

  if (state.decryptError) {
    app.innerHTML = html`
      <div class="screen stack-lg">
        <div class="screen-header"><div class="wordmark">Peek</div></div>
        <div class="stack-md">
          <h1 class="title">Couldn't decrypt the files</h1>
          <div class="copy">The link may be incomplete or corrupted. Ask the sender to share the full link again.</div>
        </div>
      </div>
    `;
    return;
  }

  if (state.joinInfo.mode === 'code-entry') {
    app.innerHTML = html`
      <div class="screen stack-lg">
        <div class="screen-header"><div class="wordmark">Peek</div></div>
        <div class="stack-md">
          <h1 class="title">Open the full Peek link</h1>
          <div class="copy">To receive files, scan the QR code or open the full link shared by the sender.</div>
        </div>
      </div>
    `;
    return;
  }

  if (state.joinInfo.mode === 'needs-full-link' && state.lookupResult) {
    app.innerHTML = html`
      <div class="screen stack-lg">
        <div class="screen-header"><div class="wordmark">Peek</div></div>
        <div class="stack-md">
          <h1 class="title">Session found</h1>
          <div class="copy">Files available: ${state.lookupResult.filesAvailable}</div>
          <div class="copy">Session found. To receive files, open the full Peek link on this device and ask the sender to share it directly.</div>
        </div>
      </div>
    `;
    return;
  }

  if (!state.joined) {
    app.innerHTML = html`
      <div class="screen stack-lg">
        <div class="screen-header"><div class="wordmark">Peek</div></div>
        <div class="stack-md">
          <h1 class="title">Connecting to device…</h1>
          <div class="copy">${state.slowJoin ? 'Taking longer than usual. Make sure the other device screen is on.' : ''}</div>
        </div>
      </div>
    `;
    return;
  }

  const timerClass = classifyTimer(state.expiresAt);
  const rows = state.receivedFiles
    .map((file) => {
      const progress = file.progress > 0 && file.progress < 100
        ? rawHtml(`<div class="progress"><div class="progress-bar" style="width:${Number(file.progress)}%"></div></div>`)
        : '';
      const action = file.blob
        ? rawHtml(`<button class="compact-button" data-download="${Number(file.id)}">Download</button>`)
        : '';
      const status =
        file.status === 'done'
          ? rawHtml('<span class="file-status success">✓</span>')
          : rawHtml(`<span class="file-status">${file.progress > 0 ? `${Number(file.progress)}%` : '—'}</span>`);
      return rawHtml(html`<div class="row">
        <div class="row-left">
          ${fileIconSvg(file.type?.startsWith('image/') ? 'image' : 'doc')}
          <div class="row-main">
            <span class="file-name">${sanitizeFilename(file.name)}</span>
            <span class="file-size">${formatBytes(file.size)}</span>
          </div>
        </div>
        ${action || status}
        ${progress}
      </div>`);
    })
    .join('');

  app.innerHTML = html`
    <div class="screen stack-lg">
      <div class="screen-header">
        <div class="wordmark">Peek</div>
        <div class="timer ${timerClass}">${formatTimer(state.expiresAt)}</div>
      </div>

      <div class="stack-md">
        <h1 class="title">Files from the other device</h1>
        <div class="panel stack-sm">
          <div class="panel-head">
            <div class="title-sm">Instant clipboard</div>
            <div class="panel-meta">${state.clipboardDraft.length}/${MAX_CLIPBOARD_CHARS}</div>
          </div>
          <textarea
            id="clipboard-input"
            class="clipboard-textarea"
            maxlength="${MAX_CLIPBOARD_CHARS}"
            placeholder="Type or paste — sends automatically..."
            rows="4"
          >${state.clipboardDraft}</textarea>
          <div class="clipboard-row">
            <div class="copy">
              <strong class="copy-strong">Received:</strong> ${state.clipboardReceived || 'Waiting for the other device…'}
            </div>
            <button class="compact-button" id="clipboard-copy" ${state.clipboardReceived ? '' : 'disabled'}>
              ${state.clipboardCopyState === 'copied' ? 'Copied' : state.clipboardCopyState === 'failed' ? 'Retry copy' : 'Copy'}
            </button>
          </div>
        </div>
        <div class="list">${rawHtml(rows)}</div>
        ${state.receivedFiles.some((file) => file.blob) ? rawHtml('<button class="button-primary" id="zip-download">Download all as ZIP</button>') : ''}
      </div>

      <div class="divider"></div>

      <div class="stack-sm">
        <div class="copy">Send files back:</div>
        <button class="dropzone" id="send-back">Drop files here or click to select</button>
        <input class="hidden" id="send-back-input" type="file" multiple />
      </div>

      <div class="divider"></div>

      <button class="button-danger" id="kill-button">End session</button>
      <div class="status ${state.statusDanger ? 'danger' : ''}">${state.statusMessage || ''}</div>
    </div>
  `;

  bindReceiverActions();
}

function bindCodeInput() {
  const input = document.getElementById('code-input');
  input?.focus();
  input?.addEventListener('input', async (event) => {
    const value = event.target.value.replace(/\D/g, '').slice(0, 6);
    event.target.value = value;
    if (value.length === 6) {
      const response = await fetch(`${RELAY_HTTP_URL}/session/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });

      if (!response.ok) {
        event.target.classList.add('error');
        event.target.value = '';
        window.setTimeout(() => event.target.classList.remove('error'), 250);
        return;
      }

      state.lookupResult = await response.json();
      state.joinInfo = {
        mode: 'needs-full-link',
        sessionId: state.lookupResult.sessionId,
      };
      render();
    }
  });
}

function getTransport() {
  return {
    getBufferedAmount() {
      if (state.dataChannel?.readyState === 'open') return state.dataChannel.bufferedAmount;
      if (state.socket?.readyState === WebSocket.OPEN) return state.socket.bufferedAmount || 0;
      return 0;
    },
    sendBinary(buffer) {
      if (state.dataChannel?.readyState === 'open') {
        state.dataChannel.send(buffer);
        return;
      }
      if (state.socket?.readyState === WebSocket.OPEN) {
        state.socket.send(buffer);
      }
    },
  };
}

async function sendEncryptedPacket(packet) {
  const encrypted = await encryptChunk(state.key, packet);
  getTransport().sendBinary(encrypted);
}

async function sendFiles(files) {
  await sendEncryptedPacket(encodeManifestPacket(files));
  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const bytes = new Uint8Array(await file.slice(start, end).arrayBuffer());
      await sendEncryptedPacket(encodeChunkPacket(fileIndex, chunkIndex, bytes));
      while (getTransport().getBufferedAmount() > 1024 * 1024) {
        await new Promise((resolve) => window.setTimeout(resolve, 25));
      }
    }
    await sendEncryptedPacket(encodeFileCompletePacket(fileIndex));
  }
}

async function handleBinaryMessage(buffer) {
  let decrypted;
  try {
    decrypted = await decryptChunk(state.key, buffer);
  } catch {
    // Wrong key (a truncated or tampered link) or a corrupted packet. The
    // AES-GCM auth tag rejected it. Fail gracefully — show a clear message
    // instead of throwing and leaving a blank, stuck screen.
    state.decryptError = true;
    render();
    return;
  }

  let packet;
  try {
    packet = decodePacket(decrypted);
  } catch {
    state.decryptError = true;
    render();
    return;
  }

  if (packet.type === 'manifest') {
    state.incomingFiles.clear();
    state.receivedFiles = packet.payload.files.map((file) => ({
      ...file,
      chunks: new Array(Math.min(file.totalChunks, MAX_CHUNKS_PER_FILE)).fill(null),
      progress: 0,
      status: 'queued',
    }));
    for (const file of state.receivedFiles) {
      state.incomingFiles.set(file.id, file);
    }
    render();
    return;
  }

  if (packet.type === 'chunk') {
    const file = state.incomingFiles.get(packet.payload.fileId);
    if (!file) return;
    file.chunks[packet.payload.chunkIndex] = packet.payload.chunkBytes;
    const receivedSize = file.chunks.reduce((total, chunk) => total + (chunk ? chunk.byteLength : 0), 0);
    file.progress = Math.min(100, Math.round((receivedSize / file.size) * 100) || 0);
    file.status = 'sending';
    render();
    return;
  }

  if (packet.type === 'file-complete') {
    const file = state.incomingFiles.get(packet.payload.fileId);
    if (!file) return;
    file.blob = new Blob(file.chunks, { type: file.type || 'application/octet-stream' });
    file.progress = 100;
    file.status = 'done';
    render();
    return;
  }

  if (packet.type === 'download-notice') {
    return;
  }
}

async function handleClipboardMessage(message) {
  if (!message?.payload || !state.key) {
    return;
  }

  try {
    state.clipboardReceived = await decryptClipboardText(state.key, message.payload);
    render();
  } catch {}
}

async function setupConnection() {
  if (!state.joinInfo.keyBase64 || !state.joinInfo.sessionId || !state.joinInfo.token) {
    return;
  }

  if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (!state.key) {
    state.key = await importKeyFromBase64(state.joinInfo.keyBase64);
  }
  state.socket = new WebSocket(RELAY_WS_URL);
  state.socket.binaryType = 'arraybuffer';
  state.peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  });

  state.peerConnection.onicecandidate = (event) => {
    if (event.candidate && state.socket?.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify({ type: 'webrtc-candidate', candidate: event.candidate }));
    }
  };

  state.peerConnection.ondatachannel = (event) => {
    state.dataChannel = event.channel;
    state.dataChannel.binaryType = 'arraybuffer';
    state.dataChannel.onmessage = async (messageEvent) => {
      await handleBinaryMessage(messageEvent.data);
    };
  };

  state.socket.onopen = () => {
    state.socket.send(
      JSON.stringify({
        type: 'joiner-join',
        sessionId: state.joinInfo.sessionId,
        token: state.joinInfo.token,
      })
    );
  };

  state.socket.onmessage = async (event) => {
    if (typeof event.data !== 'string') {
      await handleBinaryMessage(event.data);
      return;
    }

    const message = JSON.parse(event.data);
    if (message.expiresAt) {
      state.expiresAt = message.expiresAt;
    }

    switch (message.type) {
      case 'joiner-ready':
        state.joined = true;
        render();
        break;
      case 'webrtc-offer': {
        await state.peerConnection.setRemoteDescription(message.offer);
        const answer = await state.peerConnection.createAnswer();
        await state.peerConnection.setLocalDescription(answer);
        state.socket.send(JSON.stringify({ type: 'webrtc-answer', answer }));
        break;
      }
      case 'webrtc-candidate':
        await state.peerConnection.addIceCandidate(message.candidate);
        break;
      case 'clipboard-push':
        await handleClipboardMessage(message);
        break;
      case 'peer-disconnected':
        state.statusMessage = 'The other device disconnected.';
        state.statusDanger = false;
        render();
        break;
      default:
        break;
    }
  };

  state.socket.onclose = (event) => {
    if (state.socket === event.target) {
      state.socket = null;
    }
    state.joined = false;

    if (SESSION_ENDED_CLOSE_CODES.has(event.code)) {
      state.sessionEnded = true;
      render();
      return;
    }

    if (event.code === SESSION_REPLACED_CLOSE_CODE) {
      return;
    }

    if (!state.sessionEnded) {
      state.statusMessage = 'Connection interrupted. Retrying…';
      state.statusDanger = false;
      render();
      window.setTimeout(() => {
        if (!state.sessionEnded) {
          setupConnection().catch(() => {
            state.statusMessage = 'Unable to reconnect. Refresh and scan again.';
            state.statusDanger = true;
            render();
          });
        }
      }, 750);
    }
  };

  window.setTimeout(() => {
    if (!state.joined) {
      state.slowJoin = true;
      render();
    }
  }, 5000);
}

function bindReceiverActions() {
  const clipboardInput = document.getElementById('clipboard-input');
  clipboardInput?.addEventListener('input', (event) => {
    state.clipboardDraft = normalizeClipboardText(event.target.value);
    if (event.target.value !== state.clipboardDraft) {
      event.target.value = state.clipboardDraft;
    }

    if (state.clipboardSendTimer) {
      window.clearTimeout(state.clipboardSendTimer);
    }

    state.clipboardSendTimer = window.setTimeout(async () => {
      if (state.socket?.readyState !== WebSocket.OPEN || !state.key) {
        return;
      }

      try {
        const payload = await encryptClipboardText(state.key, state.clipboardDraft);
        state.socket.send(JSON.stringify({ type: 'clipboard-push', payload }));
      } catch {}
    }, CLIPBOARD_DEBOUNCE_MS);
  });

  document.getElementById('clipboard-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.clipboardReceived);
      state.clipboardCopyState = 'copied';
    } catch {
      state.clipboardCopyState = 'failed';
    }
    render();
    window.setTimeout(() => {
      state.clipboardCopyState = 'idle';
      render();
    }, 1500);
  });

  document.querySelectorAll('[data-download]').forEach((button) => {
    button.addEventListener('click', async () => {
      const fileId = Number(button.getAttribute('data-download'));
      const file = state.receivedFiles.find((entry) => entry.id === fileId);
      if (!file?.blob) return;
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeBaseName(file.name);
      anchor.click();
      URL.revokeObjectURL(url);
      await sendEncryptedPacket(encodeDownloadNoticePacket(fileId));
    });
  });

  const sendBackButton = document.getElementById('send-back');
  const sendBackInput = document.getElementById('send-back-input');
  sendBackButton?.addEventListener('click', () => sendBackInput?.click());
  sendBackInput?.addEventListener('change', async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length) {
      await sendFiles(files);
      event.target.value = '';
    }
  });

  document.getElementById('kill-button')?.addEventListener('click', () => {
    state.socket?.send(JSON.stringify({ type: 'kill-session' }));
  });

  document.getElementById('zip-download')?.addEventListener('click', async () => {
    const files = state.receivedFiles.filter((file) => file.blob);
    if (!files.length) return;
    const zipModule = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
    const zip = new zipModule.default();
    files.forEach((file) => zip.file(safeBaseName(file.name), file.blob));
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `peek-${state.joinInfo.sessionId.slice(0, 6)}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

render();

if (state.joinInfo.mode === 'full-link') {
  setupConnection().catch(() => {
    state.statusMessage = 'Unable to connect.';
    state.statusDanger = true;
    render();
  });
}
