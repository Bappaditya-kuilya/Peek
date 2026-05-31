# Privacy Policy

Passr is designed to keep as little information as possible.

## What the relay knows

- random session ID
- session expiry timestamp
- approximate bytes relayed

## What the relay should not store

- filenames
- file contents
- encryption keys
- persistent user profiles

## File privacy

File chunks are encrypted before leaving the sender device.
The encryption key is shared only via the URL fragment and is not sent to the relay.
In relay mode, the relay transports encrypted bytes and cannot decrypt them.
