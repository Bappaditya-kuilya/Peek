# Peek Architecture

## Current shape

- `web/` contains the main React sender app and the static receiver/view assets copied into the build.
- `relay/` contains the temporary session relay and Peek view endpoints.
- Sessions and Peek views are currently stored in memory.

## Core flows

### Session transfer

- Sender selects files in the React app.
- Relay creates a short-lived session with a random token and numeric code.
- Receiver joins via full QR link or limited code lookup.
- File chunks are encrypted in-browser and sent over WebRTC when possible, with relay fallback when necessary.

### Clipboard sync

- Active session text sync is bidirectional.
- Clipboard text is encrypted with the same session key.
- Text is debounced client-side before relay transport.

### Peek view links

- Sender or session user encrypts a PDF or image in-browser.
- Relay stores only encrypted payload plus metadata and expiry.
- Viewer receives a `?k=` decryption key in the URL and decrypts client-side.
- Viewer is view-only and watermarked.

## Security properties

- Session IDs and tokens are cryptographically random.
- Transfer payloads are encrypted client-side.
- Peek payloads are capped and typed.
- `?k=` is ignored by the relay and never required server-side.
- CSP, security headers, rate limits, and WebSocket payload limits are enabled.

## Current operational limits

- Relay state is in-memory, so restarts drop live sessions and Peek links.
- Horizontal scaling requires shared state if you want multi-instance resilience.
- Edge protections such as CDN/WAF/rate limits should still sit in front of the relay in production.

## Production direction

- Keep domains configurable; do not hardcode public origins in runtime logic.
- Keep frontend assets self-contained where possible.
- Prefer safe DOM construction or framework escaping over raw HTML templating.
