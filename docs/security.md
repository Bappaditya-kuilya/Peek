# Security

## Encryption

Passr encrypts each file chunk with AES-GCM 256-bit before it leaves the sender.
The encryption key is created in the browser and shared only through the URL
fragment. The relay does not receive the fragment, so it never learns the key.

## Session auth

- Session IDs identify a session
- Tokens authorize the join
- The encryption key protects file confidentiality
- The numeric code is not an authenticator

## Relay behavior

The relay stores sessions in memory only.
It does not store files, filenames, or encryption keys.
It should be treated as signaling and encrypted-byte transport only.

## No-camera PC limitations

The 6-digit code path is intentionally limited in v1.

What it does:
- Finds an active session
- Returns session metadata like expiry and file count

What it does not do:
- Authenticate the device
- Reveal filenames
- Grant file access

If a user enters the code on a no-camera PC, the UI should tell them:

> Session found. To receive files, open the full link on this device — ask the sender to share it via message or email.

This is a known product limitation in v1, not a bug.

## Planned v2 improvement

Add initiator-side approval for numeric joins:
- PC enters the code
- initiator device receives a one-time approval prompt
- join is granted only if approved within a short timeout

Track this as a follow-up product issue before launch.
