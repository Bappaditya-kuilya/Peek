# Self-hosting

Minimum production environment:

```bash
ALLOWED_ORIGINS=https://peek.dev
PORT=3000
```

Suggested deployment posture:

- terminate TLS before the relay
- rate-limit at the edge as well as in-process
- keep frontend and relay origins explicit
- use persistent logging and monitoring
