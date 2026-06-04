# Security

Peek is designed to minimize persistent exposure:

- transfer chunks are encrypted client-side before relay fallback transport
- session tokens are cryptographically random
- sessions auto-expire
- Peek view links are temporary and optional one-time use

## Report a vulnerability

Open a private security advisory in the project hosting platform you use for this repository, or route reports to the owner privately.

## Operational guidance

- run the relay only behind HTTPS
- set strict `ALLOWED_ORIGINS`
- place the relay behind a CDN/WAF or reverse proxy with connection limits
- monitor process restarts and memory usage
