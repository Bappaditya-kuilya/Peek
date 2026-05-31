# Contributing

Thanks for helping. Passr is small on purpose — keep changes small too.

## Local setup

Three parts run independently.

**Relay** (terminal 1):

```bash
cd relay
npm install
npm start          # http://localhost:3000
```

**Web app** (terminal 2):

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

The receiver is served by the web dev server at `/receiver` and copied into the
build automatically — you do not run it separately.

## Project layout

```
relay/      Node + Express + ws signaling and encrypted-byte relay
web/        React + Vite sender app (runs on phone or PC)
receiver/   Single source of truth for the static receiver page
docs/       Security model, privacy, self-hosting, this guide
```

`receiver/` is the **only** copy of the receiver. The Vite build copies it to
`web/public/receiver/` output via `vite-plugin-static-copy` — never edit a copy
under `web/`, and never commit one.

## Hard rules — non-negotiable

These come straight from the security model. A PR that breaks one will not be
merged.

- **No `Math.random()`** anywhere near sessions, tokens, or crypto. Use
  `crypto.randomBytes` (relay) or `crypto.getRandomValues` (browser).
- **The encryption key lives in the URL fragment only.** Never put it in a path,
  query string, header, or log.
- **The relay never parses or logs file content or filenames.** It forwards raw
  encrypted bytes. Keep it that way.
- **Fresh IV per chunk.** Never reuse an IV with AES-GCM.
- **Sanitise filenames** before they reach the DOM, a `download` attribute, or a
  ZIP entry. Use `sanitizeFilename` / `safeBaseName`.
- **No analytics, no tracking, no persistent logging.**
- **Token comparison uses `crypto.timingSafeEqual`**, never `===`.

## Style

- Plain CSS with the variables already defined — no Tailwind, no UI libraries.
- No emoji in the UI, no gradients, no box-shadow depth (see
  `PASSR_CLAUDE_CODE.md`).
- Match the surrounding code. Two fonts, flat colour, borders for depth.

## Before opening a PR

- `cd relay && npm audit --omit=dev` — expect 0 vulnerabilities.
- `cd web && npm audit --omit=dev` — expect 0 vulnerabilities.
- `cd web && npm run build` — must pass.
- Test the path you changed end to end with a real transfer.

## Reporting security issues

Do not open a public issue. See [SECURITY.md](../SECURITY.md).
