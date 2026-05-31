# Self-hosting

## Relay

Set these environment variables:

```bash
PORT=3000
ALLOWED_ORIGINS=https://passr.dev,http://localhost:5173,http://localhost:5174
```

## TURN

The web app expects TURN values at build time:

```bash
VITE_TURN_URL=turn:your-turn-server.com:3478
VITE_TURN_USERNAME=your-user
VITE_TURN_CREDENTIAL=your-secret
```

If these values are missing in development, the app falls back to the public
openrelay configuration. Production should not rely on that fallback.
