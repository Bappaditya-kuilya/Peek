Peek

  Move files between devices through nothing but a browser tab.
     
  Peek is a zero-install, no-account file transfer tool built for the messiest setups — library PCs, lab machines, kiosks, a friend's laptop, a locked-down work computer. If it has
  a browser, it can send and receive. Open a tab, scan a code, transfer, walk away. Nothing is left behind.

  ---
  Why Peek
  
  You know the moment: you need to get a file onto (or off of) a computer that isn't yours. No USB stick. No login to your cloud drive. No permission to install anything. Emailing
  it to yourself feels wrong, and that USB port might be disabled anyway.
  
  Peek is the answer to "I just need to move this one file, right now, safely."

  ---
  What it does

  📲 Pair in seconds with a QR code
  One device opens Peek and picks files. The other device scans the QR — that's the whole handshake. No usernames, no passwords, no setup.
  
  🔒 Encrypted end-to-end
  Files are encrypted in your browser before they ever leave. The decryption key lives in the link itself (the part after #) and is never sent to any server. Even the people
  running Peek can't see your files.

  ⚡ Direct when possible, relayed when not
  When both devices can talk directly, your files take the fast lane — peer to peer. When a network blocks that, Peek falls back to a relay that only ever carries scrambled data.
  Either way it just works.

  ↔️  Two-way in one session
  It's not one-and-done. Once two devices are paired, files flow both directions — send some over, get some back, all in the same room.

  ⏳ Temporary by design
  Sessions expire automatically (60 minutes) and either side can end them instantly. Nothing lingers on the shared computer afterward — no history, no leftover files, no trace.

  👀 Peek links — share a file with anyone
  Generate a short-lived link to a single file. Send it over chat, email, anywhere. PDFs and images preview right in the browser; everything else (zips, notebooks, archives, any
  file type up to 50MB) downloads securely. Optional "burn after viewing" deletes it the moment it's opened.
  
  📋 Clipboard sync
  Need to move a chunk of text, a password, a snippet? Sync the clipboard between the two devices without touching a file at all.
  
  ---
  Built for risky places
  
  ┌──────────────────┬────────────────────────────────────────────────────────────┐
  │                  │                                                            │
  ├──────────────────┼────────────────────────────────────────────────────────────┤
  │ No install       │ The receiving side is just a web page.                     │
  ├──────────────────┼────────────────────────────────────────────────────────────┤
  │ No account       │ Nothing to sign up for, nothing to log into.               │
  ├──────────────────┼────────────────────────────────────────────────────────────┤
  │ No trace         │ Sessions self-destruct; nothing saved on the host machine. │
  ├──────────────────┼────────────────────────────────────────────────────────────┤
  │ Encrypted always │ Your key stays in your browser, never on a server.         │
  ├──────────────────┼────────────────────────────────────────────────────────────┤
  │ Short-lived      │ Everything expires on a timer, or kill it on demand.       │
  └──────────────────┴────────────────────────────────────────────────────────────┘
  
  ---
  The 3-step flow

  1. Pick your files on the sending device.
  2. Scan the QR on the receiving device.
  3. Transfer, then close. Send, receive, end the session. Done.

  ---

  Quick start (development)

  ```bash
  git clone <repo-url> && cd Peek
  npm install
  npm --prefix web install
  npm --prefix relay start &    # relay on port 3000
  npm --prefix web dev           # web on port 5173
  ```

  Tests: `npm test` (runs relay + web suites)

  ---

  Documentation

  - [Architecture](ARCHITECTURE.md) — system design, components, data flow
  - [Protocol](PROTOCOL.md) — binary packet format, WebSocket messages
  - [Contributing](CONTRIBUTING.md) — dev setup, code style, PR process
  - [Security](SECURITY.md) — threat model, crypto choices, limitations
  - [Deployment](DEPLOYMENT.md) — Vercel + Render setup,env vars
  - [Redis Persistence](relay/REDIS.md) — optional Redis backend

  ---
  Peek is for the in-between moments — the borrowed computer, the public terminal, the quick handoff — where every other option is too slow, too permanent, or too risky.

  ---
