"""
Notifications blueprint — test push notification endpoint.
"""
from flask import Blueprint, jsonify

from helpers import setting, ntfy_send

bp = Blueprint("notifications", __name__)


@bp.post("/api/notify/test")
def notify_test():
    if not setting("ntfy_topic"):
        return jsonify({"error": "set an ntfy topic first (and save)"}), 400
    ok = ntfy_send("TyloPlanner", "Test notification - it works! 🎉", "tada")
    if not ok:
        return jsonify({"error": "could not reach the ntfy server"}), 502
    return jsonify({"ok": True})
