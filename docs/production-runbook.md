# Production Runbook

## Preconditions

- Frontend and relay origins are known.
- `ALLOWED_ORIGINS` is set explicitly for production relay deployment.
- `TRUST_PROXY` matches the real proxy chain depth in front of the relay.
- TLS is terminated before public traffic reaches the relay.

## Verify before deploy

Run locally:

```bash
npm run test:relay
npm run build
```

## Relay deployment

- Build from `relay/`
- Confirm port `3000`
- Confirm memory and concurrency limits at the platform edge
- Confirm only expected origins are allowed
- Confirm `TRUST_PROXY` is set correctly before trusting forwarded client IPs
- Confirm websocket and HTTP rate limits are active

## Frontend deployment

- Deploy the built `web/dist`
- Confirm CSP and response headers are active
- Confirm `/r` and `/view` routes still resolve correctly

## Smoke test after deploy

1. Open the home page.
2. Create a session.
3. Join the session from a second browser/device.
4. Transfer one small file.
5. Verify clipboard sync.
6. Create one Peek link and open it.
7. End the session.

## Rollback trigger

Rollback immediately if any of these fail:

- session creation
- session join
- file transfer
- Peek link decryption/rendering
- unexpected CSP breakage

## Monitoring priorities

- relay process restarts
- memory growth
- 4xx/5xx spikes
- session creation and view upload rate-limit spikes
