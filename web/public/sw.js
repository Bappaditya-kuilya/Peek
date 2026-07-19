// Service Worker for Peek PWA - App Shell Only
// HARD CONSTRAINT: NEVER cache transfer-related data (bytes, sessions, keys, WebSocket traffic)

const APP_SHELL_CACHE = 'peek-app-shell-v1';
const STATIC_ASSETS_CACHE = 'peek-static-assets-v1';

// App shell files to cache on install
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

// Transfer-related patterns to NEVER cache (HARD CONSTRAINT)
const TRANSFER_URL_PATTERNS = [
  /\/view\//,           // Peek view links (encrypted blobs, once-only)
  /\/receiver/,         // Receiver page
  /\/api\/transfer/,    // Transfer API endpoints (if any)
  /\/api\/session/,     // Session API endpoints (if any)
  /\/api\/peek/,        // Peek API endpoints (if any)
  /\/api\/webrtc/,      // WebRTC signaling (if any)
  /\/socket/,           // WebSocket connections
  /\/ws/,               // WebSocket connections
];

const TRANSFER_HEADER_PATTERNS = [
  'x-peek-session',
  'x-peek-transfer',
  'x-peek-encryption-key',
  'x-peek-file-data',
  'x-webrtc-session',
  'x-webrtc-candidate',
  'x-webrtc-offer',
  'x-webrtc-answer',
];

function isTransferRequest(request) {
  const url = new URL(request.url);
  
  // Check URL patterns
  if (TRANSFER_URL_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return true;
  }
  
  // Check for transfer-related headers
  for (const header of TRANSFER_HEADER_PATTERNS) {
    if (request.headers.has(header)) {
      return true;
    }
  }
  
  // Check for WebSocket upgrade
  if (request.headers.get('upgrade') === 'websocket') {
    return true;
  }
  
  return false;
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || 
         (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  return url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp|avif)$/i);
}

async function cacheAppShell() {
  const cache = await caches.open(APP_SHELL_CACHE);
  await cache.addAll(APP_SHELL_URLS);
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_ASSETS_CACHE);
  const cached = await cache.match(request);
  
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);
  
  return cached || fetchPromise;
}

self.addEventListener('install', event => {
  event.waitUntil(
    cacheAppShell().then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== APP_SHELL_CACHE && key !== STATIC_ASSETS_CACHE)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  
  // HARD CONSTRAINT: Never cache transfer-related requests
  if (isTransferRequest(request)) {
    return; // Let it pass through to network, no caching
  }
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip cross-origin requests (CDN, etc.)
  const url = new URL(request.url);
  if (url.origin !== location.origin) {
    return;
  }
  
  if (isNavigationRequest(request)) {
    // Network-first for navigation (HTML)
    event.respondWith(networkFirst(request));
  } else if (isStaticAsset(request)) {
    // Stale-while-revalidate for static assets
    event.respondWith(staleWhileRevalidate(request));
  }
  // Other requests (API, etc.) pass through to network without caching
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});