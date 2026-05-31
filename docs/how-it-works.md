# How Passr works

A plain walk-through of what happens during a transfer, from tapping "share"
to the session dying.

## The pieces

- **Sender** — a React app (`web/`). Runs on a phone or a PC. Creates the
  session, picks files, shows the QR and 6-digit code.
- **Receiver** — a static page (`receiver/`). Runs in any browser tab. Joins via
  the QR link or the numeric code, decrypts and saves files.
- **Relay** — a small Node server (`relay/`). Does signaling and, when direct
  peer-to-peer fails, forwards encrypted bytes. It never sees plaintext.

Either side can send and receive — roles are **initiator** (made the session)
and **joiner** (joined it), not "sender" and "receiver".

## Step by step

1. **Create.** The sender asks the relay for a session. The relay returns a
   random session ID and a session token (both from `crypto.randomBytes`).
   Sessions live in memory and expire after 60 minutes.

2. **Make a key.** The sender generates an AES-GCM 256-bit key in the browser
   with the Web Crypto API. This key never goes to the relay.

3. **Encode the link.** The join URL is:

   ```
   https://passr.dev/r/{sessionId}#{token}.{keyBase64}
   ```

   Everything secret lives after the `#`. The fragment is a browser feature that
   is never sent to any server, never logged, and never put in a referrer
   header. The relay only ever sees the path `/r/{sessionId}`.

   The 6-digit code is derived from the session ID alone — it carries no key and
   no token.

4. **Join.** The other device scans the QR (or, on a camera-less PC, types the
   6-digit code). The receiver page reads the fragment from
   `window.location.hash`, imports the key, and authenticates with the token.

5. **Connect.** The two peers try a direct WebRTC DataChannel first, using STUN
   to find a path. On strict networks (symmetric NAT, corporate firewalls) that
   fails, so a TURN server relays the (still encrypted) packets. If WebRTC can't
   be established at all, the relay's WebSocket carries the encrypted chunks.

6. **Transfer.** Every chunk is encrypted before it leaves the sender, with a
   fresh 96-bit IV per chunk prepended to the ciphertext. The other side
   decrypts each chunk and reassembles the file. This is true whether the bytes
   went peer-to-peer or through the relay.

7. **Save.** Files can be downloaded one at a time or all at once as a ZIP,
   built client-side. Filenames are sanitised before they touch the DOM or a
   download path.

8. **End.** The session ends when the timer runs out or when either peer hits
   the kill switch. The relay drops the in-memory session; the key is garbage
   collected. Nothing persists.

## What each party can see

| Party | Can see |
|---|---|
| Relay | session ID, connection timestamps, approximate bytes relayed, ciphertext |
| Relay | **cannot** see filenames, file contents, or the encryption key |
| Joiner with full link | everything (it has the key) |
| Joiner with code only | that a session exists and how many files — **not** the files |

See [security.md](./security.md) for the threat model and the documented v1
limitation of the numeric code.
