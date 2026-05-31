export function deriveNumericCode(sessionId) {
  // SECURITY: numeric code is a session lookup shortcut only.
  // It is NOT an authenticator. Authorization requires the full
  // token + encryption key from the URL fragment.
  // Collisions are acceptable — worst case, user sees "session not found."
  const hex = sessionId.slice(0, 6);
  const num = parseInt(hex, 16) % 1000000;
  return String(num).padStart(6, '0');
}
