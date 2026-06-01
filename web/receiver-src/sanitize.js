// receiver/sanitize.js
// No library. The browser's own DOM and string handling do the work.

// Escape a string for safe insertion into innerHTML. Prevents XSS via a
// filename chosen by the sending device, e.g. "<img src=x onerror=alert(1)>".
export function sanitizeFilename(name) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(name == null ? '' : String(name)));
  return div.innerHTML;
}

// Reduce a sender-supplied name to a safe basename for use as a download
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
