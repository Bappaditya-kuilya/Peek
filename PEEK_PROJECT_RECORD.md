# Peek — Project Record

Last updated: 2026-07-19. Main is green: relay 20/20, web 32/32, build 121.65 kB gzip.

## What Peek is
Browser-only, account-free, install-free file/clipboard transfer. One device
picks files, a second scans a QR code, browsers exchange E2E-encrypted data
peer-to-peer when possible, falling back to a relay when not. Nothing persisted
server-side.

## Architecture (current)
- **Relay**: Cloudflare Worker + Durable Object `PeekSession` (SQLite,
  WebSocket Hibernation API). Per-session DO routing. Located in
  `cloudflare-relay/`. Deployed via `wrangler deploy`.
- **Frontend**: React 18 + Vite + Vitest, deployed to Vercel (`web/`).
- **History**: originally an Express relay on Render (`relay/`, `render.yaml`)
  — fully removed 2026-07-19 (see "Removed" below).

## Verification commands (run before claiming done)
```bash
cd cloudflare-relay && npm test            # 20/20 (needs --no-isolate --max-workers=1)
cd web && npm test && npm run lint && npm run typecheck && npm run build
```

## The full arc
1. **RC-1 hardening (PR #2)**: rate limit raised, HSTS + gzip, dead code removed.
2. **Cloudflare migration (PR #3–#7)**: moved off Render/Express to Worker +
   DO. Fixed two real bugs: WebSockets can't go in DO `storage.put()` (use
   Hibernation API `getWebSockets()`/`serializeAttachment()`), and missing
   HTTP/1.1 upgrade response headers broke the handshake. Per-session DO
   routing replaced a single shared `"global"` instance.
3. **UX work (PR #6–#7)**: real drag-and-drop, photo thumbnails, Peek Link
   preview (markdown/text/CSV/video, HTML-escaped), full redesign via CSS tokens.
4. **Growth/trust (PR #8, merged 2026-07-19)**: real relay test suite
   (0 → 20/20), Sentry signals + retry UI, privacy policy + data-flow page,
   PWA service worker, Web Share API, self-host docs, homepage repositioning
   around the competitive wedge (cross-network + QR pairing + zero server-side
   plaintext).

## Relay test saga (root causes, each confirmed by running, not by commit msg)
1. `vitest.config.ts` used Vitest-3 `pool:` string API under Vitest 4 →
   migrated to `cloudflareTest()` plugin API.
2. Hallucinated test helpers `getDurableObjectNamespace` / `waitFor` from
   `cloudflare:test` don't exist in this version → removed.
3. Cloudflare known issue: WS tests need `--no-isolate --max-workers=1` →
   now in the test script.
4. Genuine worker defects fixed in `src/index.ts`: missing rate limiter
   (429/4008), `/view` expiry clamp `Math.max(1)` → `Math.max(0)` for
   immediate expiry, reconnect closes deferred via `queueMicrotask`, and a new
   joiner-join replaces any existing receiver socket for the session.
5. CI `Typecheck` step failed: `npx tsc` fetched bogus `tsc@2.0.4` because
   `typescript` wasn't a dependency → added to devDependencies.

## Branch protection note (2026-07-19)
`main` required a status check named `verify` (a leftover from initial setup,
never wired to a real job). Corrected via API to require `relay-tests`,
`web-tests`, `Vercel` — the contexts actually reported. Merges use **merge
commits** (not squash), consistent with PRs #2–#8.

## Removed (2026-07-19, after PR #8 merged)
- `relay/` (legacy Express relay)
- `render.yaml`
- `.github/workflows/keep-alive.yml` (pinged dead Render relay)
- `.github/workflows/deploy-relay.yml` (deployed legacy relay)
- Root `package.json` `test:relay` script
- `AGENTS.md` legacy/forbidden-patterns references

## Still open (tracked, not blocking)
- **Phase 5 backlog** (from the earlier 9/10 plan): real user research, full
  accessibility audit, i18n, performance budgets. Deliberately out of scope for
  this build.
- **Multi-receiver sessions**: design notes need review before implementation.
- **"Trusted device" reconnect feature**: design notes need review before
  implementation.
- **Self-host docs** (`SELF_HOST.md`) assume a hardcoded CORS allowed-origins
  list in `cloudflare-relay/src/index.ts` — fine for now, revisit if self-hosting
  adoption grows.
