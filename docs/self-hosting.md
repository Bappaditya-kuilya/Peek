# Self-hosting

Minimum production environment:

```bash
ALLOWED_ORIGINS=https://peek.dev
PORT=3000
TRUST_PROXY=1
```

Suggested deployment posture:

- terminate TLS before the relay
- set `TRUST_PROXY` to the exact proxy hop count when behind a load balancer or CDN
- rate-limit at the edge as well as in-process
- keep frontend and relay origins explicit
- use persistent logging and monitoring
