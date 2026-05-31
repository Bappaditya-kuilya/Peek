# Passr

Scan a QR. Files appear. Nothing installs. Session dies in 60 minutes.

Passr is a free, open-source file transfer tool for shared and public computers.
It is built for the case where one device has the files and the other device
should receive them in the browser with the least possible friction.

## What works in v1

- React sender app for creating a session
- Static receiver page for shared PCs
- QR join flow with end-to-end encrypted file chunks
- Numeric code lookup at `/r`
- Two-way file transfer in one session
- Download individual files
- Download all received files as ZIP
- Session auto-expiry and manual kill from either peer

## Privacy model

Every file chunk is encrypted on the sending device before it travels.
The encryption key is stored only in the URL fragment, which browsers do not
send to the server. In relay fallback mode, the relay sees ciphertext only.

## Known limitation

The 6-digit code is lookup-only. It does not authenticate a device.
See [docs/security.md](docs/security.md) for the no-camera limitation details.

## Development

### Relay

```bash
cd relay
npm install
npm start
```

### Web app

```bash
cd web
npm install
npm run dev
```

### Receiver

The receiver assets are currently mirrored under `web/public/receiver/`.
For local development, serve the static `receiver/` folder on port `5174`
or use the mirrored assets from the Vite app.

## Environment

`web/.env.example`:

```bash
VITE_RELAY_HTTP_URL=http://localhost:3000
VITE_RELAY_WS_URL=ws://localhost:3000
VITE_RECEIVER_BASE_URL=http://localhost:5174/r
VITE_TURN_URL=
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

Production TURN credentials should come from environment variables.
Public openrelay fallback is development-only.
