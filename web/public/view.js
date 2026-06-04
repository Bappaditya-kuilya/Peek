const RELAY_HTTP_URL = import.meta.env.VITE_RELAY_HTTP_URL || 'http://localhost:3000';
const IV_LENGTH = 12;

const app = document.getElementById('app');

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
  app.innerHTML = `
    <div class="shell">
      <div class="panel header">
        <div class="wordmark">Peek</div>
        <div class="timer">View only</div>
      </div>
      <div class="panel content">
        <div class="warning">⚠ This is a view-only peek. Screenshots and screen recording are not prevented.</div>
        <div class="status ${isError ? 'error' : ''}">${message}</div>
      </div>
    </div>
  `;
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
  const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const stack = document.createElement('div');
  stack.className = 'pdf-stack';

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
    stack.appendChild(canvas);
  }

  return stack;
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

  app.innerHTML = `
    <div class="shell">
      <div class="panel header">
        <div class="wordmark">Peek</div>
        <div class="timer" id="peek-timer">--:--</div>
      </div>
      <div class="panel content">
        <div class="warning">⚠ This is a view-only peek. Screenshots and screen recording are not prevented.</div>
        <h1 class="title">${filename}</h1>
        <div class="meta">View-only. Timed. No install.</div>
        <div class="panel viewer" id="viewer"></div>
      </div>
    </div>
  `;

  startTimer(expiresAt);

  const blob = new Blob([decrypted], { type: mimeType });
  const viewer = document.getElementById('viewer');

  try {
    if (mimeType === 'application/pdf') {
      viewer.appendChild(await renderPdf(blob));
    } else if (mimeType.startsWith('image/')) {
      viewer.appendChild(await renderImage(blob));
    } else {
      renderStatus('This Peek file type is not supported.', true);
    }
  } catch {
    renderStatus('Unable to render this Peek.', true);
  }
}

main();
