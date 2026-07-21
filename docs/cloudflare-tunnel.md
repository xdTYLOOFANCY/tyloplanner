# Cloudflare Tunnel + Zero Trust setup

Expose TyloPlanner on a public HTTPS domain with **no open ports** and put a
real identity check (Google/GitHub login or email OTP) in front of it — while
keeping every feature working. This is the most locked-down way to reach your
instance from anywhere.

## How it fits together

`cloudflared` connects out to Cloudflare and forwards traffic to the app on a
**private** port. **Access** gates the whole hostname at Cloudflare's edge, so
unauthenticated traffic never reaches your server. Almost everything keeps
working automatically: browser requests carry the Access cookie, and the app's
outbound integrations (Strava sync, notifications, ICS auto-sync) never touch
Access. **Exactly one endpoint** — the calendar feed — needs an exemption,
because external calendar apps can't log in interactively.

## 1. Run the app behind a tunnel (no public port)

Add `cloudflared` to `docker-compose.yml` and **remove the app's `ports:`
mapping** so port 8000 only exists inside the Docker network:

```yaml
services:
  tyloplanner:
    build: .
    container_name: tyloplanner
    # ports:                         # ← delete: no longer exposed to the host
    #   - "8000:8000"
    volumes:
      - ./data:/data
    env_file: [.env]
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${TUNNEL_TOKEN}   # from the dashboard, step 2
    restart: unless-stopped
```

The two containers reach each other by service name over the default compose
network, so `cloudflared` can forward to `http://tyloplanner:8000` without that
port ever being reachable from the internet or your LAN.

> **Not using Docker?** Run `cloudflared` on the same host pointing at
> `http://localhost:8000`, and don't open 8000 in your firewall
> (`sudo ufw deny 8000/tcp`). Only `cloudflared` should reach it.

## 2. Create the tunnel

In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com) →
**Networks → Tunnels → Create a tunnel → Cloudflared**:

1. Name the tunnel and copy the **token** it shows for the Docker connector.
   Put it in `.env` as `TUNNEL_TOKEN=...`.
2. On the tunnel's **Public Hostname** tab, add:
   - **Subdomain / domain:** `planner.yourdomain.com`
   - **Service:** `http://tyloplanner:8000` (or `http://localhost:8000` for the
     non-Docker case)
3. `docker compose up -d` — the tunnel comes up and the hostname goes live.

The app already trusts Cloudflare's forwarded headers (`ProxyFix` is
configured), so HTTPS, the client IP, and the host are handled correctly.

## 3. Set `APP_URL` (required)

In `.env`:

```
APP_URL=https://planner.yourdomain.com
SECRET_KEY=<run: python3 -c "import secrets; print(secrets.token_hex(32))">
```

`APP_URL` is **not optional** behind a tunnel — it builds the calendar-feed URL
and the OAuth/Strava callback URLs, and it's what enables the `Secure` flag on
your session cookie. If it's left at the default `http://localhost:8000`,
redirects break and the cookie is served without `Secure`. `SECRET_KEY` keeps
you logged in across container rebuilds. Rebuild after editing `.env`.

## 4. Gate the app with Access

Zero Trust → **Access → Applications → Add an application → Self-hosted**:

- **Application domain:** `planner.yourdomain.com`
- **Policy:** Action **Allow**, Include → **Emails = you@example.com** (or
  **Email OTP**, or connect Google/GitHub as an identity provider first and
  require that login).
- **Session duration: long** (e.g. 1 week or 1 month) — see
  [Keep the PWA happy](#keep-the-pwa-happy).

Now the whole app requires an Access login at the edge before any request
reaches your server.

## 5. Exempt the calendar feed (the one required exception)

`GET /calendar.ics` is fetched **non-interactively** by external calendar apps
(Google Calendar, Apple Calendar), which can't complete an Access login. Left
under Access, calendar subscriptions silently stop updating.

Add a **second** Access application scoped to the feed path and let it through:

- **Application domain:** `planner.yourdomain.com/calendar.ics`
- **Policy:** Action **Bypass**, Include → **Everyone**

Cloudflare evaluates the more specific path first, so this overrides the
catch-all app for that one URL.

**Use Bypass, not a service token.** Calendar apps can't send the
`CF-Access-Client-Id` headers a service token requires, so a token would still
block them. Bypass is safe here because the feed has its own secret key built
in — the `?key=` in the feed URL *is* the authentication. Treat that URL as a
secret (anyone who has it can read your calendar, same as any ICS feed).

## 6. Authentication strategy

You now have two auth layers available. Pick one:

- **Access + app password (recommended).** Keep a strong in-app password so a
  future Access misconfiguration can't instantly expose your data. **Skip the
  in-app Google/GitHub login** — it's redundant with Access. Long Access
  sessions plus the app's persistent session mean you rarely re-type anything.
- **Access only.** Rely entirely on the edge. The app still shows a one-time
  `/setup` screen on first run, so create a throwaway password once.

**Enable 2FA at whichever layer is your gate** — your identity provider's 2FA
if Access-only, or the app's TOTP (Settings → Security) if you keep app auth.

## What keeps working automatically

Everything except the calendar feed rides the Access cookie or runs outbound
from the server, so no extra configuration is needed for:

- The full app UI, PWA install, and offline sync
- **Strava** connect and sync, and **ICS import / auto-sync**
- **Web-push** and **ntfy** notifications
- Cross-device study timers and update checks

## Gotchas

### Upload size cap

Cloudflare's proxy limits request bodies (**100 MB** on free plans). That
affects large file uploads and restoring a big backup archive
(`Settings → Data`). For anything larger, do it over your LAN or directly on
the host, not through the tunnel.

### Keep the PWA happy

When an Access session expires, the installed PWA's background API calls get
redirected to the Access login page and fail quietly until you reopen the app
in a tab and re-authenticate. A **long Access session duration** (step 4) keeps
this rare.

---

See also: [Install guide](install.md) · [Configuration](configuration.md) ·
[Integrations](integrations.md)
