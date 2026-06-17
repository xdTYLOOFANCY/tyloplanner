# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's
private *Report a vulnerability* feature (Security tab) on this repository,
or contact the maintainer directly. You'll get a response as soon as
possible; please allow reasonable time for a fix before disclosing.

## Security model (what you should know as a user)

- **Single-user app.** One username/password from `.env`, optional TOTP
  two-factor authentication. There is no multi-user separation.
- **Plain HTTP server.** The built-in server does not do TLS. For anything
  beyond localhost/LAN, put it behind HTTPS (Caddy/Traefik/nginx) or a VPN
  such as Tailscale — see [docs/install.md](docs/install.md).
- **Calendar feed:** `/calendar.ics` is protected by a secret key in the
  URL, not by the session. Anyone with the full URL can read your agenda.
  Rotate it by deleting the `feed_key` row from the `kv` table.
- **Secrets at rest:** Strava tokens, the TOTP secret and the session
  signing key are stored unencrypted in the SQLite database — protect the
  `data/` directory and your backups accordingly.
- **Brute-force resistance:** constant-time credential comparison and a
  non-blocking in-memory IP rate limiter (locks after 5 failed attempts in 60 seconds).
  There is no lockout; use a strong password, especially when internet-exposed.
