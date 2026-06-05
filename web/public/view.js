const PRODUCTION_RELAY_HTTP_URL = 'https://peek-relay.fly.dev';
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
const IV_LENGTH = 12;

const app = document.getElementById('app');

function clearApp() {
  app.replaceChildren();
}

function buildShell({ timerText = 'View only', content }) {
  clearApp();
  const shell = document.createElement('div');
  shell.className = 'shell';

  const header = document.createElement('div');
  header.className = 'panel header';
  const wordmark = document.createElement('div');
  wordmark.className = 'wordmark';
  wordmark.textContent = 'Peek';
  const timer = document.createElement('div');
  timer.className = 'timer';
  timer.id = timerText === '--:--' ? 'peek-timer' : '';
  timer.textContent = timerText;
  header.append(wordmark, timer);

  const contentPanel = document.createElement('div');
  contentPanel.className = 'panel content';
  contentPanel.append(content);
  shell.append(header, contentPanel);
  app.append(shell);
}

function base64ToBytes(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importViewKey(base64) {
  const rawBytes = base64ToBytes(base64);
  return window.crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decryptViewFile(encryptionKey, encryptedBuffer) {
  const bytes = new Uint8Array(encryptedBuffer);
  const iv = bytes.slice(0, IV_LENGTH);
  const ciphertext = bytes.slice(IV_LENGTH);
  return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encryptionKey, ciphertext);
}

function renderStatus(message, isError = false) {
  const fragment = document.createDocumentFragment();
  const warning = document.createElement('div');
  warning.className = 'warning';
  warning.textContent = 'This is a view-only peek. Screenshots and screen recording are not prevented.';
  const status = document.createElement('div');
  status.className = `status ${isError ? 'error' : ''}`.trim();
  status.textContent = message;
  fragment.append(warning, status);
  buildShell({ timerText: 'View only', content: fragment });
}

function startTimer(expiresAt) {
  const timerNode = document.getElementById('peek-timer');
  if (!timerNode) {
    return;
  }

  const tick = () => {
    const remainingSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    timerNode.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  tick();
  window.setInterval(tick, 1000);
}

async function renderPdf(blob) {
  const objectUrl = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.src = objectUrl;
  frame.title = 'Peek PDF preview';
  frame.style.width = '100%';
  frame.style.minHeight = '70vh';
  frame.style.border = '0';
  frame.addEventListener('load', () => {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  }, { once: true });
  return frame;
}

async function renderImage(blob) {
  const imageUrl = URL.createObjectURL(blob);
  const img = document.createElement('img');
  img.alt = 'Peek preview';
  img.src = imageUrl;
  img.addEventListener('load', () => URL.revokeObjectURL(imageUrl), { once: true });
  return img;
}

async function main() {
  const url = new URL(window.location.href);
  const keyBase64 = url.searchParams.get('k') || '';
  const viewId = url.pathname.split('/').filter(Boolean).pop();

  if (!viewId || !keyBase64) {
    renderStatus('This Peek link is incomplete.', true);
    return;
  }

  renderStatus('Decrypting Peek…');

  let response;
  try {
    response = await fetch(`${RELAY_HTTP_URL}/view/${viewId}`, {
      method: 'GET',
      cache: 'no-store',
    });
  } catch {
    renderStatus('Unable to load this Peek right now.', true);
    return;
  }

  if (response.status === 410) {
    renderStatus('This Peek has expired or is no longer available.', true);
    return;
  }

  if (!response.ok) {
    renderStatus('Unable to load this Peek right now.', true);
    return;
  }

  const expiresAt = Number(response.headers.get('X-Expires-At')) || Date.now();
  const mimeType = response.headers.get('X-Mime-Type') || 'application/octet-stream';
  const filename = response.headers.get('X-Filename') || 'Peek file';

  let decrypted;
  try {
    const key = await importViewKey(keyBase64);
    decrypted = await decryptViewFile(key, await response.arrayBuffer());
  } catch {
    renderStatus('Unable to decrypt this Peek. The link may be incomplete or corrupted.', true);
    return;
  }

  const fragment = document.createDocumentFragment();
  const warning = document.createElement('div');
  warning.className = 'warning';
  warning.textContent = 'This is a view-only peek. Screenshots and screen recording are not prevented.';
  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = filename;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = 'View-only. Timed. No install.';
  const viewer = document.createElement('div');
  viewer.className = 'panel viewer';
  viewer.id = 'viewer';
  fragment.append(warning, title, meta, viewer);
  buildShell({ timerText: '--:--', content: fragment });

  startTimer(expiresAt);

  const blob = new Blob([decrypted], { type: mimeType });
  const viewerNode = document.getElementById('viewer');

  try {
    if (mimeType === 'application/pdf') {
      viewerNode.appendChild(await renderPdf(blob));
    } else if (mimeType.startsWith('image/')) {
      viewerNode.appendChild(await renderImage(blob));
    } else {
      renderStatus('This Peek file type is not supported.', true);
    }
  } catch {
    renderStatus('Unable to render this Peek.', true);
  }
}

main();
