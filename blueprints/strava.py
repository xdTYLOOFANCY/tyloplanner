"""
Strava blueprint — OAuth flow, API key config, activity sync, disconnect.
"""
import time
from urllib.parse import urlencode

import requests
from flask import Blueprint, request, jsonify, redirect, current_app

import helpers
from helpers import (
    db, uid, kv_get, kv_set, kv_del, APP_URL, local_now, http_get, http_post,
)

bp = Blueprint("strava", __name__)

STRAVA_AUTH = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN = "https://www.strava.com/oauth/token"
STRAVA_API = "https://www.strava.com/api/v3"

TYPE_MAP = {
    "Run": "run", "TrailRun": "run", "VirtualRun": "run",
    "Ride": "bike", "VirtualRide": "bike", "GravelRide": "bike",
    "MountainBikeRide": "bike", "EBikeRide": "bike",
    "WeightTraining": "gym", "Workout": "gym", "Crossfit": "gym",
    "Swim": "swim", "OpenWaterSwim": "swim",
}


def strava_client_id():
    """Env var wins; otherwise keys saved via the Settings UI (kv table)."""
    return helpers.STRAVA_CLIENT_ID or kv_get("strava_client_id", "")


def strava_client_secret():
    return helpers.STRAVA_CLIENT_SECRET or kv_get("strava_client_secret", "")


def strava_access_token():
    if int(kv_get("strava_expires", "0") or 0) > time.time() + 60:
        return kv_get("strava_access")
    refresh = kv_get("strava_refresh")
    if not refresh:
        return None
    r = http_post(STRAVA_TOKEN, data={
        "client_id": strava_client_id(),
        "client_secret": strava_client_secret(),
        "grant_type": "refresh_token",
        "refresh_token": refresh,
    }, timeout=20)
    if r.status_code != 200:
        return None
    tok = r.json()
    kv_set("strava_access", tok["access_token"])
    kv_set("strava_refresh", tok["refresh_token"])
    kv_set("strava_expires", tok["expires_at"])
    return tok["access_token"]


@bp.post("/api/strava/config")
def strava_config():
    d = request.get_json(force=True) or {}
    cid = str(d.get("client_id", "")).strip()
    cs = str(d.get("client_secret", "")).strip()
    if not cid or not cs:
        return jsonify({"error": "both Client ID and Client Secret are required"}), 400
    kv_set("strava_client_id", cid)
    kv_set("strava_client_secret", cs)
    return jsonify({"ok": True})


@bp.delete("/api/strava/config")
def strava_config_delete():
    for k in ("strava_client_id", "strava_client_secret",
              "strava_access", "strava_refresh", "strava_expires", "strava_last_sync"):
        kv_del(k)
    return jsonify({"ok": True})


@bp.get("/strava/connect")
def strava_connect():
    if not (strava_client_id() and strava_client_secret()):
        return "Add your Strava API keys in Settings first.", 400
    params = urlencode({
        "client_id": strava_client_id(),
        "redirect_uri": APP_URL + "/strava/callback",
        "response_type": "code",
        "scope": "activity:read_all",
        "approval_prompt": "auto",
    })
    return redirect(STRAVA_AUTH + "?" + params)


@bp.get("/strava/callback")
def strava_callback():
    code = request.args.get("code")
    if not code:
        return redirect("/?strava=denied")
    r = http_post(STRAVA_TOKEN, data={
        "client_id": strava_client_id(),
        "client_secret": strava_client_secret(),
        "code": code,
        "grant_type": "authorization_code",
    }, timeout=20)
    if r.status_code != 200:
        return "Strava token exchange failed: " + r.text, 400
    tok = r.json()
    kv_set("strava_access", tok["access_token"])
    kv_set("strava_refresh", tok["refresh_token"])
    kv_set("strava_expires", tok["expires_at"])
    return redirect("/?strava=connected")


def do_strava_sync():
    token = strava_access_token()
    if not token:
        raise ValueError("Not connected to Strava: no refresh token or failed to refresh access token.")
    added, page = 0, 1
    headers = {"Authorization": "Bearer " + token}
    with db(write=True) as con:
        while page <= 10:  # up to 1000 activities
            r = http_get(STRAVA_API + "/athlete/activities",
                             params={"per_page": 100, "page": page},
                             headers=headers, timeout=30)
            if r.status_code != 200:
                raise ValueError("Strava API error: " + r.text[:200])
            acts = r.json()
            if not acts:
                break
            for a in acts:
                wtype = TYPE_MAP.get(a.get("sport_type") or a.get("type"))
                if not wtype:
                    continue
                ext = "strava-%s" % a["id"]
                if con.execute("SELECT 1 FROM workouts WHERE ext_id=?", (ext,)).fetchone():
                    continue
                con.execute(
                    'INSERT INTO workouts(id,type,"date",dur,dist,note,source,ext_id) '
                    "VALUES(?,?,?,?,?,?,?,?)",
                    (uid(), wtype, (a.get("start_date_local") or "")[:10],
                     round((a.get("moving_time") or 0) / 60.0, 1),
                     round((a.get("distance") or 0) / 1000.0, 2),
                     a.get("name") or "", "strava", ext))
                added += 1
            if len(acts) < 100:
                break
            page += 1
    kv_set("strava_last_sync", local_now().isoformat(timespec="seconds"))
    return {"added": added}


@bp.post("/api/strava/sync")
def strava_sync():
    token = strava_access_token()
    if not token:
        return jsonify({"error": "not connected to Strava"}), 400
    try:
        return jsonify(do_strava_sync())
    except Exception:
        current_app.logger.exception("Strava sync failed")
        return jsonify({"error": "Sync failed"}), 500


@bp.post("/api/strava/disconnect")
def strava_disconnect():
    # removes the account connection but keeps the API keys
    for k in ("strava_access", "strava_refresh", "strava_expires", "strava_last_sync"):
        kv_del(k)
    return jsonify({"ok": True})
