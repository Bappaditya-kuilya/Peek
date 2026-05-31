// web/src/utils/sanitize.js
// Mirror of receiver/sanitize.js. The two cannot share a module: the receiver
// is a standalone static page copied verbatim, while this runs inside the Vite
// React bundle. No library — the browser's own DOM does the escaping.

// Escape a string for safe insertion into innerHTML. JSX already escapes text
// nodes, so this exists for any non-JSX DOM write and as a defensive helper.
export function sanitizeFilename(name) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(name == null ? '' : String(name)));
  return div.innerHTML;
}

// Reduce a peer-supplied name to a safe basename for use as a download
// filename or ZIP entry path. Strips directory components and control
// characters so a name like "../../evil.sh" cannot escape the target folder
// (Zip-Slip / path traversal). HTML-escaping would be wrong here — this is a
// filename string, not HTML.
export function safeBaseName(name, fallback = 'file') {
  const base = String(name == null ? '' : name)
    .replace(/\\/g, '/') // normalise Windows separators
    .split('/')
    .pop() // last path segment — drops ../ and absolute paths
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control chars
    .replace(/^\.+/, '') // no leading dots (hidden files / traversal)
    .trim();
  return base || fallback;
}
