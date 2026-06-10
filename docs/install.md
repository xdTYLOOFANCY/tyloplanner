# Install guide

## One-command install (Ubuntu server, Docker)

**Prerequisites:** make sure `docker` (with the compose plugin) and `git` are
installed and working first — check with `docker compose version` and
`git --version`. See https://docs.docker.com/engine/install/ubuntu/ if you
still need Docker.

Then paste this whole block. It clones the repo, generates a random login
password, and starts TyloPlanner:

```bash
git clone https://github.com/xdTYLOOFANCY/tyloplanner.git && \
cd tyloplanner && cp .env.example .env && \
PW=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16) && \
sed -i "s|^AUTH_PASSWORD=.*|AUTH_PASSWORD=$PW|" .env && \
sed -i "s|^APP_URL=.*|APP_URL=http://$(hostname -I | awk '{print $1}'):8000|" .env && \
sudo docker compose up -d --build && \
echo "" && echo "=========================================" && \
echo " TyloPlanner is up!" && \
echo " URL:      http://$(hostname -I | awk '{print $1}'):8000" && \
echo " Username: admin" && \
echo " Password: $PW   (also saved in .env)" && \
echo "========================================="
```

> **Private repo?** If the repo is private, `git clone` will ask for
> credentials — use your GitHub username + a personal access token as the
> password, or set the repo to public first.

That's it. Sign in, set up 2FA in **Settings → Security**, and install it on
your phone via *Add to Home Screen*.

## Useful commands afterwards

```bash
cd tyloplanner
sudo docker compose logs -f          # watch logs
sudo docker compose restart          # restart
git pull && sudo docker compose up -d --build   # update to latest code
sudo docker compose down             # stop (data in ./data is kept)
cat .env                             # see/change password & settings
```

Change anything in `.env` (password, Strava keys, APP_URL)? Run
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
AUTH_PASSWORD=pick-a-password python app.py    # http://localhost:8000
```

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
  calendar feed URL and Strava OAuth redirect use the right address. Keep
  `AUTH_PASSWORD` strong and enable 2FA.

## Ports & firewall

TyloPlanner listens on **8000**. On a fresh Ubuntu with UFW:

```bash
sudo ufw allow 8000/tcp     # LAN/direct access (skip if using Caddy)
sudo ufw allow 443/tcp      # if using the Caddy HTTPS setup
```
