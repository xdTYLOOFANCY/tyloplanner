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
    data = request.get_json(force=True) or {}
    endpoint = data.get("endpoint")
    if not endpoint:
        return jsonify({"error": "endpoint required"}), 400
    
    subscription_json = json.dumps(data)
    sub_id = hashlib.sha256(endpoint.encode("utf-8")).hexdigest()[:16]
    
    with db() as con:
        con.execute(
            "INSERT INTO push_subscriptions(id, subscription_json, created_at) VALUES(?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET subscription_json=excluded.subscription_json",
            (sub_id, subscription_json, int(time.time()))
        )
    return jsonify({"ok": True})


@bp.post("/api/push/unsubscribe")
def push_unsubscribe():
    data = request.get_json(force=True) or {}
    endpoint = data.get("endpoint")
    if not endpoint:
        return jsonify({"error": "endpoint required"}), 400
    sub_id = hashlib.sha256(endpoint.encode("utf-8")).hexdigest()[:16]
    with db() as con:
        con.execute("DELETE FROM push_subscriptions WHERE id=?", (sub_id,))
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
