"""
Settings blueprint — get and update user settings.
"""
from flask import Blueprint, request, jsonify

from helpers import SETTING_DEFAULTS, setting, kv_get, kv_set, totp_enabled, check_version

bp = Blueprint("settings", __name__)


@bp.get("/api/settings")
def get_settings():
    out = {k: setting(k) for k in SETTING_DEFAULTS}
    out["totp_enabled"] = totp_enabled()
    out["last_backup"] = kv_get("last_backup")
    out["cal_last_sync"] = kv_get("cal_last_sync_human")
    return jsonify(out)


@bp.post("/api/settings")
def set_settings():
    data = request.get_json(force=True) or {}
    for k in SETTING_DEFAULTS:
        if k in data:
            kv_set("set_" + k, str(data[k]).strip())
    return jsonify({"ok": True})


@bp.get("/api/version/check")
def version_check():
    force = request.args.get("force") == "true"
    return jsonify(check_version(force=force))

