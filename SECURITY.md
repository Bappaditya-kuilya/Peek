# Security Policy

Passr is a file-transfer tool whose entire value rests on its privacy and
security properties. Reports are taken seriously.

## Supported versions

Only the latest `main` is supported. There are no long-lived release branches
in v1.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Report privately through either channel:

- GitHub: open a [private security advisory](https://github.com/Bappaditya-kuilya/zapr/security/advisories/new)
- Email: bappadityakuilya@gmail.com

Please include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept is ideal),
- affected component (`relay/`, `web/`, or `receiver/`),
- any suggested fix.

You will get an acknowledgement within 72 hours. Once a fix is released, you
are welcome to be credited.

## Scope

In scope:

- the relay server (`relay/`) — session handling, auth, rate limiting,
- the web app (`web/`) — crypto, key handling, transfer logic,
- the receiver page (`receiver/`) — decryption, filename handling, downloads.

Examples of in-scope issues:

- the relay being able to read file contents or encryption keys,
- the encryption key leaking outside the URL fragment (into a path, query
  string, log, or referrer header),
- IV reuse or other AES-GCM misuse,
- XSS or path traversal via a malicious filename,
- session token brute-force, fixation, or reuse,
- bypassing session expiry or the kill switch.

Out of scope:

- the documented v1 limitation that the 6-digit code is lookup-only and does
  not authenticate a device (see [docs/security.md](docs/security.md)),
- denial of service from extreme traffic against a self-hosted relay,
- vulnerabilities in third-party TURN/STUN providers you choose to configure.

## Security model in brief

- Every file chunk is encrypted with AES-GCM 256-bit on the sending device.
- The key lives only in the URL fragment (`#...`), which browsers never send to
  a server.
- The relay sees session IDs and ciphertext only. It stores nothing on disk and
  logs no filenames or file contents.
- Sessions auto-expire server-side and can be killed by either peer.

See [docs/security.md](docs/security.md) for the full model.
