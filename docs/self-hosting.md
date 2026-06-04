# Self-hosting

Minimum production environment:

```bash
ALLOWED_ORIGINS=https://peek.dev
PORT=3000
TRUST_PROXY=1
REDIS_URL=redis://localhost:6379
VITE_RELAY_HTTP_URL=https://peek-relay.fly.dev
VITE_RELAY_WS_URL=wss://peek-relay.fly.dev
```

Suggested deployment posture:

- terminate TLS before the relay
- set `TRUST_PROXY` to the exact proxy hop count when behind a load balancer or CDN
- use `REDIS_URL` for shared session and Peek view state across instances
- set `ALLOWED_ORIGINS` to exact frontend origins for production; wildcard preview origins are only for deployment testing
- rate-limit at the edge as well as in-process
- keep frontend and relay origins explicit
- use persistent logging and monitoring
