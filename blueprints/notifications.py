"""
Notifications blueprint — test push notification endpoint and manage Web Push subscriptions.
"""
import hashlib
import json
import time
from flask import Blueprint, jsonify, request

from helpers import setting, db, vapid_keys, send_notification

bp = Blueprint("notifications", __name__)


@bp.get("/api/push/public-key")
def push_public_key():
    _, pub_key = vapid_keys()
    return jsonify({"public_key": pub_key})


@bp.post("/api/push/subscribe")
def push_subscribe():
    data = request.get_json(force=True, silent=True) or {}
    endpoint = data.get("endpoint")
    if not endpoint:
        return jsonify({"error": "endpoint required"}), 400
    
    subscription_json = json.dumps(data)
    sub_id = hashlib.sha256(endpoint.encode("utf-8")).hexdigest()[:16]
    
    with db(write=True) as con:
        con.execute(
            "INSERT INTO push_subscriptions(id, subscription_json, created_at) VALUES(?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET subscription_json=excluded.subscription_json",
            (sub_id, subscription_json, int(time.time()))
        )
    return jsonify({"ok": True})


@bp.post("/api/push/unsubscribe")
def push_unsubscribe():
    data = request.get_json(force=True, silent=True) or {}
    endpoint = data.get("endpoint")
    if not endpoint:
        return jsonify({"error": "endpoint required"}), 400
    sub_id = hashlib.sha256(endpoint.encode("utf-8")).hexdigest()[:16]
    with db(write=True) as con:
        con.execute("DELETE FROM push_subscriptions WHERE id=?", (sub_id,))
    return jsonify({"ok": True})


@bp.get("/api/timers")
def timers_list():
    """Running timers (fire_at still in the future) so any device can pick up a
    timer started elsewhere. Already-fired rows are excluded — the scheduler
    deletes them shortly after they fire."""
    now = int(time.time())
    with db() as con:
        rows = con.execute(
            "SELECT id, label, fire_at, push FROM timers WHERE fire_at > ? ORDER BY fire_at",
            (now,)).fetchall()
    return jsonify({"timers": [dict(r) for r in rows]})


@bp.post("/api/timer")
def timer_create():
    """Register a timer as the server-side source of truth: it survives the tab
    closing and syncs to other devices on load. The browser still owns the live
    countdown/sound; the server fires the phone push (when push=1) even with no
    tab open. id is client-generated so cancel/fire can delete by the same key."""
    data = request.get_json(force=True, silent=True) or {}
    tid = str(data.get("id") or "").strip()
    fire_at = data.get("fire_at")
    if not tid or not isinstance(fire_at, (int, float)):
        return jsonify({"error": "id and fire_at required"}), 400
    push = 1 if data.get("push") in (1, "1", True) else 0
    with db(write=True) as con:
        con.execute(
            "INSERT INTO timers(id, label, fire_at, push, created) VALUES(?,?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET label=excluded.label, fire_at=excluded.fire_at, push=excluded.push",
            (tid, str(data.get("label") or "Timer")[:200], int(fire_at), push, int(time.time()))
        )
    return jsonify({"ok": True})


@bp.delete("/api/timer/<tid>")
def timer_delete(tid):
    with db(write=True) as con:
        con.execute("DELETE FROM timers WHERE id=?", (tid,))
    return jsonify({"ok": True})


@bp.post("/api/notify/test")
def notify_test():
    has_ntfy = bool(setting("ntfy_topic"))
    with db() as con:
        has_push = bool(con.execute("SELECT 1 FROM push_subscriptions LIMIT 1").fetchone())
        
    if not has_ntfy and not has_push:
        return jsonify({"error": "Configure ntfy or enable Web Push first"}), 400
        
    ok = send_notification("TyloPlanner", "Test notification - it works! 🎉", "tada")
    if not ok:
        return jsonify({"error": "Could not deliver notification"}), 502
    return jsonify({"ok": True})
