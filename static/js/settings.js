// TyloPlanner — settings module (notifications, calendar, security, Strava).

import { S, SET } from './state.js';
import { esc, api, toast } from './utils.js';
import { applyAccent, applyAccentFromSettings } from './theme.js';
import { renderBackupList } from './backup.js';


var stravaEditing = false;
var tfaPending = false;

function setVal(id, v) {
  var el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = v == null ? "" : v;
}

export function renderSettings(refresh) {
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
  var showShortcuts = SET ? SET.show_shortcuts !== "0" : true;
  var toggleEl = document.getElementById("showShortcutsToggle");
  if (toggleEl) toggleEl.checked = showShortcuts;

  var persistTab = SET ? SET.persist_active_tab !== "0" : true;
  var tabToggleEl = document.getElementById("tabPersistenceToggle");
  if (tabToggleEl) tabToggleEl.checked = persistTab;

  if (S.shortcuts && S.shortcuts.length) {
    var order = (SET && SET.shortcut_order) ? SET.shortcut_order.split(',') : [];
    var sorted = S.shortcuts.slice().sort(function(a, b) {
      var ia = order.indexOf(a.id);
      var ib = order.indexOf(b.id);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      return ia - ib;
    });

    var disabled = (SET && SET.disabled_shortcuts) ? SET.disabled_shortcuts.split(',') : [];
    
    var sh = '';
    sorted.forEach(function(s) {
      var isOff = disabled.indexOf(s.id) !== -1;
      var toggleInput = '<input type="checkbox" class="ios-toggle" style="margin-right:8px" ' + (isOff ? '' : 'checked') + ' onchange="toggleItem(\'' + s.id + '\')">';
      
      sh += '<div class="list-item" draggable="true" ondragstart="dragShortcutStart(event,\'' + s.id + '\')" ondragover="dragShortcutOver(event)" ondrop="dropShortcut(event,\'' + s.id + '\')" ondragend="dragShortcutEnd(event)" style="cursor:grab">';
      sh += '<span class="muted" style="cursor:grab;padding-right:4px">☰</span>';
      sh += '<div class="grow">' + esc(s.name) + ' <span class="muted">(' + esc(s.url) + ')</span></div>';
      sh += toggleInput;
      sh += '<button class="btn danger small" onclick="delRow(\'shortcuts\', \'' + s.id + '\')">Remove</button>';
      sh += '</div>';
    });
    document.getElementById("settingsShortcuts").innerHTML = sh;
  } else {
    document.getElementById("settingsShortcuts").innerHTML = '<div class="muted">No shortcuts added yet.</div>';
  }
  var statusBox = document.getElementById("backupStatus");
  if (statusBox && SET) {
    statusBox.innerHTML = '<p style="font-size:14px;margin-bottom:8px">Automatic backups: a JSON snapshot is written to <b>data/backups/</b> every night (newest 14 kept).' +
      (SET.last_backup ? ' Last backup: <b>' + esc(SET.last_backup) + '</b>.' : ' No backup made yet.') + '</p>' +
      '<button class="btn small" onclick="backupNow()">Backup now</button>';
  }

  // Render categories
  var cats = getTaskCategories();
  var catsHtml = "";
  cats.forEach(function(cat) {
    catsHtml += '<div class="list-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:10px;">' +
      '<span class="badge" style="background-color:' + esc(cat.color) + '; color:#fff; font-weight:600; padding:4px 8px; border-radius:4px;">' + esc(cat.name) + '</span>' +
      '<div style="flex:1"></div>' +
      '<input type="color" value="' + esc(cat.color) + '" onchange="updateCategoryColor(\'' + esc(cat.name).replace(/'/g, "\\'") + '\', this.value)" style="width:30px; height:24px; padding:0; border:none; background:none; cursor:pointer;">' +
      '<button class="btn danger small" onclick="deleteCategory(\'' + esc(cat.name).replace(/'/g, "\\'") + '\')">Delete</button>' +
      '</div>';
  });
  var settingsCategoriesEl = document.getElementById("settingsCategories");
  if (settingsCategoriesEl) {
    settingsCategoriesEl.innerHTML = catsHtml || '<div class="muted">No categories configured.</div>';
  }

  renderBackupList("backupList", refresh);
}

export async function toggleShowShortcuts(refresh) {
  var show = document.getElementById("showShortcutsToggle").checked;
  await api("POST", "/api/settings", { show_shortcuts: show ? "1" : "0" });
  await refresh();
}

export async function toggleTabPersistence(refresh) {
  var toggle = document.getElementById("tabPersistenceToggle");
  var persist = toggle ? toggle.checked : true;
  await api("POST", "/api/settings", { persist_active_tab: persist ? "1" : "0" });
  
  if (!persist) {
    localStorage.removeItem("active_tab");
  } else {
    var activeBtn = document.querySelector("#tabs button.active");
    if (activeBtn) {
      localStorage.setItem("active_tab", activeBtn.dataset.tab);
    }
  }
  await refresh();
}

export async function toggleItem(id, refresh) {
  var disabled = (SET && SET.disabled_shortcuts) ? SET.disabled_shortcuts.split(',').filter(Boolean) : [];
  var idx = disabled.indexOf(id);
  if (idx === -1) disabled.push(id);
  else disabled.splice(idx, 1);
  await api("POST", "/api/settings", { disabled_shortcuts: disabled.join(',') });
  await refresh();
}

export async function reorderShortcut(dragId, dropId, refresh) {
  if (dragId === dropId) return;
  var order = (SET && SET.shortcut_order) ? SET.shortcut_order.split(',').filter(Boolean) : S.shortcuts.map(function(s) { return s.id; });
  S.shortcuts.forEach(function(s) { if (order.indexOf(s.id) === -1) order.push(s.id); });
  
  var dragIdx = order.indexOf(dragId);
  if (dragIdx > -1) order.splice(dragIdx, 1);
  var dropIdx = order.indexOf(dropId);
  if (dropIdx > -1) order.splice(dropIdx, 0, dragId);
  
  await api("POST", "/api/settings", { shortcut_order: order.join(',') });
  await refresh();
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

export function getCategoryColorHex(name) {
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  var color = '#';
  for (var i = 0; i < 3; i++) {
    var value = (hash >> (i * 8)) & 0xFF;
    value = Math.floor((value + 128) / 2);
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
}

export function getTaskCategories() {
  var raw = (SET && SET.task_categories) ? SET.task_categories.trim() : "";
  if (!raw) {
    return [
      { name: "School", color: "#4f8cff" },
      { name: "Work", color: "#3ecf8e" },
      { name: "Personal", color: "#f5a623" }
    ];
  }
  if (raw.startsWith("{")) {
    try {
      var obj = JSON.parse(raw);
      var res = [];
      for (var k in obj) {
        res.push({ name: k, color: obj[k] });
      }
      return res;
    } catch (e) {
      // Fall through
    }
  }
  var parts = raw.split(',').map(function(c) { return c.trim(); }).filter(Boolean);
  var defaultColors = { "School": "#4f8cff", "Work": "#3ecf8e", "Personal": "#f5a623" };
  return parts.map(function(c) {
    return { name: c, color: defaultColors[c] || getCategoryColorHex(c) };
  });
}

export async function updateCategoryColor(name, color, refresh) {
  var cats = getTaskCategories();
  var cat = cats.find(function(c) { return c.name === name; });
  if (cat) {
    cat.color = color;
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
    await refresh();
  }
}

export async function addCustomCategory(refresh) {
  var input = document.getElementById("newCategoryInput");
  var colorInput = document.getElementById("newCategoryColor");
  if (!input) return;
  var newCat = input.value.trim();
  if (!newCat) return;
  var newColor = colorInput ? colorInput.value : "#4f8cff";
  
  var cats = getTaskCategories();
  var exists = cats.some(function(c) { return c.name.toLowerCase() === newCat.toLowerCase(); });
  if (!exists) {
    cats.push({ name: newCat, color: newColor });
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
    input.value = "";
    if (colorInput) colorInput.value = "#4f8cff";
    await refresh();
  }
}

export async function deleteCategory(catName, refresh) {
  var cats = getTaskCategories();
  var idx = cats.findIndex(function(c) { return c.name === catName; });
  if (idx !== -1) {
    cats.splice(idx, 1);
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
    await refresh();
  }
}
