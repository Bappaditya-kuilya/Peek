const PRODUCTION_RELAY_HTTP_URL = 'https://peek-relay.bappadityakuilya.workers.dev';
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
const PREVIEWABLE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/markdown',
  'text/csv',
  'video/mp4',
  'video/webm',
  'video/ogg',
]);

function normalizeMimeType(mimeType = '') {
  const normalizedMimeType = String(mimeType).trim().toLowerCase();
  if (normalizedMimeType === 'image/jpg') {
    return 'image/jpeg';
  }
  if (PREVIEWABLE_TYPES.has(normalizedMimeType)) {
    return normalizedMimeType;
  }
  return 'application/octet-stream';
}

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderText(blob) {
  return blob.text().then((text) => {
    const pre = document.createElement('pre');
    pre.className = 'text-preview';
    pre.textContent = text;
    pre.style.cssText = 'margin:0;padding:18px;background:#f7f7f8;border-radius:12px;overflow:auto;font-family:var(--font-mono);font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;';
    return pre;
  });
}

function renderMarkdown(blob) {
  return blob.text().then((text) => {
    const container = document.createElement('div');
    container.className = 'markdown-preview';
    container.style.cssText = 'padding:18px;background:#f7f7f8;border-radius:12px;overflow:auto;font-size:15px;line-height:1.6;color:#111111;';

    const escaped = escapeHtml(text);
    const lines = escaped.split('\n');
    let html = '';
    let inCodeBlock = false;
    let codeContent = '';

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          html += '<pre style="margin:12px 0;padding:12px;background:#ebebed;border-radius:8px;overflow:auto;font-size:13px;line-height:1.5;">' + codeContent + '</pre>';
          codeContent = '';
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }
      if (inCodeBlock) {
        codeContent += line + '\n';
        continue;
      }
      if (line.startsWith('# ')) {
        html += '<h1 style="margin:16px 0 8px;font-size:24px;font-weight:600;">' + line.slice(2) + '</h1>';
      } else if (line.startsWith('## ')) {
        html += '<h2 style="margin:14px 0 6px;font-size:20px;font-weight:600;">' + line.slice(3) + '</h2>';
      } else if (line.startsWith('### ')) {
        html += '<h3 style="margin:12px 0 4px;font-size:17px;font-weight:600;">' + line.slice(4) + '</h3>';
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        html += '<div style="margin:2px 0;padding-left:16px;">• ' + line.slice(2) + '</div>';
      } else if (line.match(/^\d+\. /)) {
        html += '<div style="margin:2px 0;padding-left:16px;">' + line + '</div>';
      } else if (line.startsWith('> ')) {
        html += '<div style="margin:4px 0;padding:8px 12px;border-left:3px solid #cacacb;color:#707072;font-style:italic;">' + line.slice(2) + '</div>';
      } else if (line.trim() === '') {
        html += '<br>';
      } else {
        let formatted = line
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code style="padding:2px 6px;background:#ebebed;border-radius:4px;font-size:13px;">$1</code>');
        html += '<p style="margin:4px 0;">' + formatted + '</p>';
      }
    }
    if (inCodeBlock && codeContent) {
      html += '<pre style="margin:12px 0;padding:12px;background:#ebebed;border-radius:8px;overflow:auto;font-size:13px;line-height:1.5;">' + codeContent + '</pre>';
    }
    container.innerHTML = html;
    return container;
  });
}

function renderVideo(blob, mimeType) {
  const videoUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.controls = true;
  video.style.cssText = 'display:block;max-width:100%;max-height:80vh;margin:0 auto;border-radius:12px;';
  video.addEventListener('loadeddata', () => {
    window.setTimeout(() => URL.revokeObjectURL(videoUrl), 10000);
  }, { once: true });
  return video;
}

function renderDownload(blob, filename) {
  const wrapper = document.createElement('div');
  wrapper.className = 'download-block';

  const note = document.createElement('div');
  note.className = 'meta';
  note.textContent = 'This file type cannot be previewed in the browser. Download it to view the content.';

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.className = 'download-button';
  anchor.href = objectUrl;
  anchor.download = filename || 'peek-file';
  anchor.textContent = `Download ${filename || 'file'}`;
  anchor.addEventListener('click', () => {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  }, { once: true });

  wrapper.append(note, anchor);
  return wrapper;
}

async function main() {
  const url = new URL(window.location.href);
  // The key is carried in the fragment (#k=…) so it never reaches the server.
  // Fall back to the legacy ?k= query param for links created before this change.
  const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const keyBase64 = hashParams.get('k') || url.searchParams.get('k') || '';
  const queryViewId = url.searchParams.get('id') || '';
  const pathViewId = url.pathname.split('/').filter(Boolean).pop();
  const viewId = queryViewId || (pathViewId !== 'view' && pathViewId !== 'view.html' ? pathViewId : '');

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
  const filename = response.headers.get('X-Filename') || 'Peek file';
  const mimeType = normalizeMimeType(response.headers.get('X-Mime-Type') || 'application/octet-stream');

  let decrypted;
  try {
    const key = await importKeyFromBase64(keyBase64);
    decrypted = await decryptChunk(key, await response.arrayBuffer());
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
    } else if (mimeType === 'text/markdown') {
      viewerNode.appendChild(await renderMarkdown(blob));
    } else if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      viewerNode.appendChild(await renderText(blob));
    } else if (mimeType.startsWith('video/')) {
      viewerNode.appendChild(renderVideo(blob, mimeType));
    } else {
      viewerNode.appendChild(renderDownload(blob, filename));
    }
  } catch {
    renderStatus('Unable to render this Peek.', true);
  }
}

main();
