# Peek

Peek is a secure browser-based file transfer workspace for shared and public computers.

## Core properties

- Temporary session pairing by QR code or 6-digit lookup code
- Browser-side encryption with relay fallback
- Two-way transfer inside one session
- View-only Peek links for PDFs and images

## Local development

Relay:

```bash
cd relay
npm install
npm start
```

Web app:

```bash
cd web
npm install
npm run dev
```

Repo-level verification:

```bash
npm run test
```

## Production notes

- The relay currently stores sessions and view links in memory.
- For higher resilience, use external state and edge protections in front of the relay.
- Set `ALLOWED_ORIGINS` explicitly in production.
