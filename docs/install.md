# Install guide

## One-command install (Ubuntu server, Docker)

**Prerequisites:** make sure `docker` (with the compose plugin) and `git` are
installed and working first — check with `docker compose version` and
`git --version`. See https://docs.docker.com/engine/install/ubuntu/ if you
still need Docker.

Then paste this whole block. It clones the repo, points the app at your
server's address, and starts TyloPlanner:

```bash
git clone https://github.com/xdTYLOOFANCY/tyloplanner.git && \
cd tyloplanner && cp .env.example .env && \
sed -i "s|^APP_URL=.*|APP_URL=http://$(hostname -I | awk '{print $1}'):8000|" .env && \
sudo docker compose up -d --build && \
echo "" && echo "=========================================" && \
echo " TyloPlanner is up!" && \
echo " Open:  http://$(hostname -I | awk '{print $1}'):8000" && \
echo " Create your account on the first visit." && \
echo "========================================="
```

Open the URL it prints. **The first visit shows a setup screen** where you
pick your own username and password — no `.env` editing needed. After that,
set up 2FA in **Settings → Security** and install it on your phone via
*Add to Home Screen*.

## Accounts, passwords & getting back in

Your account is created **in the browser on the first visit** and stored
(hashed) in the app's own database — not in `.env`.

- **Change username or password:** in the app under **Settings → Security**
  (you'll need your current password, plus a 2FA code if enabled).
- **Forgot your password?** Reset it from the server terminal:

  ```bash
  cd tyloplanner
  sudo docker compose exec tyloplanner python app.py --reset-password "new-password"
  ```

- **Lost your 2FA device?**

  ```bash
  sudo docker compose exec tyloplanner python app.py --disable-2fa
  ```

- Running without Docker? The same commands work directly:
  `python app.py --reset-password "new-password"`.

Setting `AUTH_USERNAME` / `AUTH_PASSWORD` in `.env` still works: on the
first run those are imported as your account and the setup screen is
skipped. That's mainly there so older installs keep working — the
in-browser setup is the normal path now.

## Useful commands afterwards

```bash
cd tyloplanner
sudo docker compose logs -f          # watch logs
sudo docker compose restart          # restart
git pull && sudo docker compose up -d --build   # update to latest code
sudo docker compose down             # stop (data in ./data is kept)
```

Change anything in `.env` (APP_URL, Strava keys)? Run
`sudo docker compose up -d --build` again to apply.

## Build only (no compose)

```bash
sudo docker build -t tyloplanner .
sudo docker run -d --name tyloplanner -p 8000:8000 \
  -v "$PWD/data:/data" --env-file .env --restart unless-stopped tyloplanner
```

## Without Docker (any Linux/macOS with Python 3.10+)

```bash
git clone https://github.com/xdTYLOOFANCY/tyloplanner.git
cd tyloplanner
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python app.py                        # http://localhost:8000
```

Open http://localhost:8000 and create your account on the setup screen.

## Exposing it to the internet (recommended setup)

The container speaks plain HTTP. For access from outside your home network,
pick one:

- **Easiest & safest — Tailscale (free VPN):** `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`,
  then open `http://<tailscale-ip>:8000` from any of your devices. Nothing is
  exposed publicly; calendar feed subscriptions work from your own devices.
- **Public with HTTPS — Caddy reverse proxy:** point a domain at your server, then:

  ```bash
  sudo apt-get install -y caddy
  echo 'your.domain.com {
      reverse_proxy localhost:8000
  }' | sudo tee /etc/caddy/Caddyfile && sudo systemctl restart caddy
  ```

  Caddy gets a TLS certificate automatically. Set
  `APP_URL=https://your.domain.com` in `.env` and rebuild — needed so the
  calendar feed URL and Strava OAuth redirect use the right address. Pick a
  strong account password and enable 2FA.
- **Public with HTTPS + Zero Trust — Cloudflare Tunnel:** no open ports and an
  identity check (Google/GitHub or email OTP) enforced at Cloudflare's edge.
  See the dedicated **[Cloudflare Tunnel setup](cloudflare-tunnel.md)** guide.

## Ports & firewall

TyloPlanner listens on **8000**. On a fresh Ubuntu with UFW:

```bash
sudo ufw allow 8000/tcp     # LAN/direct access (skip if using Caddy)
sudo ufw allow 443/tcp      # if using the Caddy HTTPS setup
```
