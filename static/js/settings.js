// TyloPlanner — settings module (notifications, calendar, security, Strava).

import { S, SET } from './state.js';
import { esc, api, toast } from './utils.js';
import { applyAccent, applyAccentFromSettings } from './theme.js';


var stravaEditing = false;
var tfaPending = false;

function setVal(id, v) {
  var el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = v == null ? "" : v;
}

export function renderSettings() {
  document.getElementById("icsUrl").textContent = S.feed_url;
  document.getElementById("icsDownload").href = S.feed_url;
  document.getElementById("logoutBtn").style.display = S.auth.enabled ? "inline-block" : "none";
  var box = document.getElementById("stravaBox"), html = "";
  var host = (S.app_url || location.origin).replace(/^https?:\/\//, "").replace(/:\d+$/, "").replace(/\/.*$/, "");
  if (!S.strava.configured || stravaEditing) {
    html = '<p style="font-size:14px;margin-bottom:10px">Connect Strava in three steps \u2014 no server access needed:</p>' +
      '<ol style="font-size:14px;margin:0 0 12px 18px;line-height:1.7">' +
      '<li>Create a free API app at <a href="https://www.strava.com/settings/api" target="_blank" style="color:var(--accent)">strava.com/settings/api</a></li>' +
      '<li>Set <b>Authorization Callback Domain</b> to: <code class="url">' + esc(host) + '</code></li>' +
      '<li>Copy the <b>Client ID</b> and <b>Client Secret</b> below and save:</li></ol>' +
      '<div class="formrow">' +
      '<input id="stravaCid" placeholder="Client ID" style="width:130px" onkeydown="if(event.keyCode===13)stravaSaveConfig()">' +
      '<input id="stravaSecret" type="password" placeholder="Client Secret" style="flex:1;min-width:200px" onkeydown="if(event.keyCode===13)stravaSaveConfig()">' +
      '<button class="btn" onclick="stravaSaveConfig()">Save keys</button>' +
      (stravaEditing ? '<button class="btn ghost" onclick="stravaEditing=false;renderSettings()">Cancel</button>' : '') +
      '</div>' +
      (S.strava.from_env ? '<p class="muted">Note: keys are currently set via .env, which overrides keys saved here.</p>' : '');
  } else if (!S.strava.connected) {
    html = '<p style="font-size:14px;margin-bottom:10px">\u2705 API keys saved. Now connect your Strava account:</p>' +
      '<a class="btn" href="/strava/connect" style="text-decoration:none">Connect Strava</a> ' +
      '<button class="btn ghost small" onclick="stravaEditing=true;renderSettings()">Edit keys</button> ' +
      '<button class="btn danger small" onclick="stravaForget()">Remove keys</button>';
  } else {
    html = '<p style="font-size:14px;margin-bottom:10px">\u2705 Connected.' +
      (S.strava.last_sync ? ' Last sync: ' + esc(S.strava.last_sync) : '') + '</p>' +
      '<button class="btn" onclick="stravaSync()">\u27F3 Sync activities now</button> ' +
      '<button class="btn danger small" onclick="stravaDisconnect()">Disconnect</button>';
  }
  box.innerHTML = html;
  renderNotifySettings();
  renderSecurity();
  if (SET) {
    setVal("accentColor", SET.accent_color);
  }
  applyAccentFromSettings(SET);
  if (S.shortcuts && S.shortcuts.length) {
    var sh = '';
    S.shortcuts.forEach(function(s) {
      sh += '<div class="list-item"><div class="grow">' + esc(s.name) + ' <span class="muted">(' + esc(s.url) + ')</span></div><button class="btn danger small" onclick="delRow(\'shortcuts\', \'' + s.id + '\')">Remove</button></div>';
    });
    document.getElementById("settingsShortcuts").innerHTML = sh;
  } else {
    document.getElementById("settingsShortcuts").innerHTML = '<div class="muted">No shortcuts added yet.</div>';
  }
}

export async function saveAccentColor(refresh) {
  var value = document.getElementById("accentColor").value;
  await api("POST", "/api/settings", {
    accent_color: value
  });
  applyAccent(value);
  toast("Accent color saved");
  await refresh();
}

export async function resetAccentColor(refresh) {
  var value = "#4f8cff";
  await api("POST", "/api/settings", {
    accent_color: value
  });
  applyAccent(value);
  toast("Accent color reset");
  await refresh();
}

function renderNotifySettings() {
  if (!SET) return;
  setVal("ntfyServer", SET.ntfy_server);
  setVal("ntfyTopic", SET.ntfy_topic);
  setVal("agendaTime", SET.notify_agenda_time);
  setVal("habitTime", SET.notify_habit_time);
  setVal("examDays", SET.notify_exam_days);
  setVal("calSyncUrls", SET.cal_sync_urls);
  setVal("calSyncHours", SET.cal_sync_hours);
  document.getElementById("calSyncMeta").textContent = SET.cal_last_sync ? ("Last sync: " + SET.cal_last_sync) : "";
}

export async function saveNotifySettings(refresh) {
  await api("POST", "/api/settings", {
    ntfy_server: document.getElementById("ntfyServer").value.trim() || "https://ntfy.sh",
    ntfy_topic: document.getElementById("ntfyTopic").value.trim(),
    notify_agenda_time: document.getElementById("agendaTime").value || "07:30",
    notify_habit_time: document.getElementById("habitTime").value || "20:00",
    notify_exam_days: document.getElementById("examDays").value.trim() || "7,3,1"
  });
  toast("Notification settings saved");
  await refresh();
}

export async function testNotify() {
  try { await api("POST", "/api/notify/test"); toast("Test sent \u2014 check your phone!"); }
  catch(e) { alert(e.message); }
}

export async function saveCalSync(refresh) {
  await api("POST", "/api/settings", {
    cal_sync_urls: document.getElementById("calSyncUrls").value,
    cal_sync_hours: document.getElementById("calSyncHours").value || "6"
  });
  toast("Calendar sync settings saved");
  await refresh();
}

export async function calSyncNow(refresh) {
  try {
    toast("Syncing calendars\u2026");
    var j = await api("POST", "/api/ics/sync-now");
    toast("Calendar sync done \u2014 " + j.added + " new events");
    await refresh();
  } catch(e) { alert(e.message); }
}

function renderSecurity() {
  var box = document.getElementById("securityBox");
  if (!box || !SET) return;
  var html = "";
  if (!S.auth.enabled) {
    html = '<p style="font-size:14px">Login is disabled \u2014 set <b>AUTH_PASSWORD</b> in <b>.env</b> to enable it (required before 2FA makes sense).</p>';
  } else if (SET.totp_enabled) {
    html = '<p style="font-size:14px;margin-bottom:10px">\u2705 Two-factor authentication is <b>on</b>. Disable by entering a current code:</p>' +
      '<div class="formrow"><input id="tfaCode" placeholder="123456" maxlength="6" style="width:110px;text-align:center" onkeydown="if(event.keyCode===13)tfaDisable()">' +
      '<button class="btn danger" onclick="tfaDisable()">Disable 2FA</button></div>';
  } else if (tfaPending) {
    html = '<p style="font-size:14px;margin-bottom:10px">Scan this QR code with Google Authenticator / Aegis / 1Password, then enter the 6-digit code to confirm:</p>' +
      '<img src="/api/2fa/qr?t=' + Date.now() + '" alt="2FA QR" style="width:180px;border-radius:10px;background:#fff;padding:8px">' +
      '<div class="formrow" style="margin-top:10px"><input id="tfaCode" placeholder="123456" maxlength="6" style="width:110px;text-align:center" onkeydown="if(event.keyCode===13)tfaConfirm()">' +
      '<button class="btn" onclick="tfaConfirm()">Confirm &amp; enable</button>' +
      '<button class="btn ghost" onclick="tfaPending=false;renderSecurity()">Cancel</button></div>';
  } else {
    html = '<p style="font-size:14px;margin-bottom:10px">Add a second login step with an authenticator app (TOTP):</p>' +
      '<button class="btn" onclick="tfaStart()">Enable 2FA</button>';
  }
  html += '<hr style="border:none;border-top:1px solid var(--border);margin:14px 0">' +
    '<p style="font-size:14px;margin-bottom:8px">Automatic backups: a JSON snapshot is written to <b>data/backups/</b> every night (newest 14 kept).' +
    (SET.last_backup ? ' Last backup: <b>' + esc(SET.last_backup) + '</b>.' : ' No backup made yet.') + '</p>' +
    '<button class="btn ghost small" onclick="backupNow()">Backup now</button>';
  box.innerHTML = html;
}

export async function tfaStart() {
  await api("POST", "/api/2fa/setup");
  tfaPending = true;
  renderSecurity();
}

export async function tfaConfirm(refresh) {
  try {
    await api("POST", "/api/2fa/enable", { code: document.getElementById("tfaCode").value.trim() });
    tfaPending = false;
    toast("2FA enabled \u2014 you'll be asked for a code at login");
    await refresh();
  } catch(e) { alert(e.message); }
}

export async function tfaDisable(refresh) {
  try {
    await api("POST", "/api/2fa/disable", { code: document.getElementById("tfaCode").value.trim() });
    toast("2FA disabled");
    await refresh();
  } catch(e) { alert(e.message); }
}

export async function backupNow(refresh) {
  var j = await api("POST", "/api/backup/now");
  toast("Backup written: " + j.file);
  await refresh();
}

export function copyIcs() {
  navigator.clipboard.writeText(document.getElementById("icsUrl").textContent)
    .then(function() { toast("Feed URL copied"); });
}

export async function importIcsFile(refresh) {
  var f = document.getElementById("icsFile").files[0];
  if (!f) { alert("Choose an .ics file first."); return; }
  var fd = new FormData(); fd.append("file", f);
  var r = await fetch("/api/ics/import", { method: "POST", body: fd });
  var j = await r.json();
  if (j.error) alert(j.error); else toast("Imported " + j.added + " of " + j.found + " events");
  await refresh();
}

export async function importIcsUrl(refresh) {
  var u = document.getElementById("icsImportUrl").value.trim();
  if (!u) { alert("Paste an iCal URL first."); return; }
  try {
    var j = await api("POST", "/api/ics/import", { url: u });
    toast("Imported " + j.added + " of " + j.found + " events");
    await refresh();
  } catch(e) { alert(e.message); }
}

export async function clearIcs(refresh) {
  if (!confirm("Remove all events imported from calendars?")) return;
  var j = await api("DELETE", "/api/ics");
  toast("Removed " + j.deleted + " imported events");
  await refresh();
}

export async function stravaSaveConfig(refresh) {
  try {
    await api("POST", "/api/strava/config", {
      client_id: document.getElementById("stravaCid").value.trim(),
      client_secret: document.getElementById("stravaSecret").value.trim()
    });
    stravaEditing = false;
    toast("Strava keys saved \u2014 now click Connect Strava");
    await refresh();
  } catch(e) { alert(e.message); }
}

export async function stravaForget(refresh) {
  if (!confirm("Remove the saved Strava API keys and connection?")) return;
  await api("DELETE", "/api/strava/config");
  await refresh();
}

export async function stravaSync(refresh) {
  toast("Syncing with Strava\u2026");
  try {
    var j = await api("POST", "/api/strava/sync");
    toast("Strava sync done \u2014 " + j.added + " new activities");
    await refresh();
  } catch(e) { alert(e.message); }
}

export async function stravaDisconnect(refresh) {
  await api("POST", "/api/strava/disconnect");
  await refresh();
}

// expose stravaEditing for inline onclick toggle
export { stravaEditing, tfaPending };
