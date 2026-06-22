// TyloPlanner — settings module (notifications, calendar, security, Strava).

import { S, SET } from './state.js';
import { esc, api, toast } from './utils.js';
import { applyAccent, applyAccentFromSettings, applyThemeStyle, applyThemeStyleFromSettings } from './theme.js';
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
    setVal("appThemeStyle", SET.app_theme_style || "default");
    setVal("accentColor", SET.accent_color);
  }
  applyThemeStyleFromSettings(SET);
  applyAccentFromSettings(SET);
  var persistTab = SET ? SET.persist_active_tab !== "0" : true;
  var tabToggleEl = document.getElementById("tabPersistenceToggle");
  if (tabToggleEl) tabToggleEl.checked = persistTab;
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

export async function saveAppThemeStyle(refresh) {
  var value = document.getElementById("appThemeStyle").value;
  await api("POST", "/api/settings", {
    app_theme_style: value
  });
  applyThemeStyle(value);
  toast("Theme style saved");
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

async function renderNotifySettings() {
  if (!SET) return;
  setVal("ntfyServer", SET.ntfy_server);
  setVal("ntfyTopic", SET.ntfy_topic);
  setVal("agendaTime", SET.notify_agenda_time);
  setVal("habitTime", SET.notify_habit_time);
  setVal("examDays", SET.notify_exam_days);
  setVal("calSyncUrls", SET.cal_sync_urls);
  setVal("calSyncHours", SET.cal_sync_hours);
  populateTimezones();
  setVal("appTimezone", SET.app_timezone);
  document.getElementById("calSyncMeta").textContent = SET.cal_last_sync ? ("Last sync: " + SET.cal_last_sync) : "";

  const container = document.getElementById("webPushContainer");
  if (!container) return;

  if (!window.isSecureContext) {
    container.innerHTML = `
      <div style="background: rgba(220,53,69,0.1); border: 1px solid rgba(220,53,69,0.2); padding: 10px; border-radius: 6px; font-size: 13px; color: #ff6b6b; line-height: 1.4">
        ⚠️ Native Web Push is disabled because the application is accessed over insecure HTTP. For local network access, please use Option 2 (ntfy) instead, or configure HTTPS.
      </div>
    `;
    return;
  }

  const hasSupport = 'serviceWorker' in navigator && 'PushManager' in window;
  if (!hasSupport) {
    container.innerHTML = `
      <div style="background: rgba(220,53,69,0.1); border: 1px solid rgba(220,53,69,0.2); padding: 10px; border-radius: 6px; font-size: 13px; color: #ff6b6b; line-height: 1.4">
        ⚠️ Native Web Push is not supported by your browser or device. Please use Option 2 (ntfy) instead.
      </div>
    `;
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg) {
      container.innerHTML = `
        <div style="background: rgba(220,53,69,0.1); border: 1px solid rgba(220,53,69,0.2); padding: 10px; border-radius: 6px; font-size: 13px; color: #ff6b6b; line-height: 1.4">
          ⚠️ Service Worker registration not found yet. Please reload the page.
        </div>
      `;
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(40,167,69,0.1); border: 1px solid rgba(40,167,69,0.2); padding: 10px; border-radius: 6px; gap: 8px;">
          <span style="font-size:13px; color: #28a745;">✓ Web Push notifications are active on this device.</span>
          <button class="btn danger small" onclick="disableWebPush()">Disable</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--panel); border: 1px solid var(--border); padding: 10px; border-radius: 6px; gap: 8px;">
          <span class="muted" style="font-size:13px;">Web Push is not configured for this device yet.</span>
          <button class="btn small" onclick="enableWebPush()">Enable on this device</button>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `
      <div style="background: rgba(220,53,69,0.1); border: 1px solid rgba(220,53,69,0.2); padding: 10px; border-radius: 6px; font-size: 13px; color: #ff6b6b; line-height: 1.4">
        ⚠️ Failed to check subscription status: ${err.message || err}
      </div>
    `;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function enableWebPush(refresh) {
  console.log("enableWebPush called");
  try {
    let permission;
    try {
      permission = await Notification.requestPermission();
    } catch (e) {
      permission = await new Promise((resolve) => {
        Notification.requestPermission(resolve);
      });
    }

    console.log("Notification permission state:", permission);
    if (permission !== "granted") {
      alert("Permission for notifications was denied. Please update your browser settings.");
      return;
    }

    console.log("Fetching VAPID public key...");
    const res = await api("GET", "/api/push/public-key");
    console.log("VAPID public key fetched:", res.public_key);

    const reg = await navigator.serviceWorker.ready;
    if (!reg) {
      alert("Service Worker registration not found. Please reload the page.");
      return;
    }

    console.log("Subscribing to push manager...");
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(res.public_key)
    });

    console.log("Saving push subscription on backend...", sub.toJSON());
    await api("POST", "/api/push/subscribe", sub.toJSON());
    toast("Web Push enabled successfully!");
    if (refresh) await refresh();
  } catch (err) {
    console.error("Error enabling Web Push:", err);
    alert("Error enabling Web Push: " + (err.message || err));
  }
}

export async function disableWebPush(refresh) {
  console.log("disableWebPush called");
  try {
    const reg = await navigator.serviceWorker.ready;
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        console.log("Unsubscribing from push manager...");
        await sub.unsubscribe();
        console.log("Removing push subscription from backend...");
        await api("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint });
      }
    }
    toast("Web Push disabled.");
    if (refresh) await refresh();
  } catch (err) {
    console.error("Error disabling Web Push:", err);
    alert("Error disabling Web Push: " + (err.message || err));
  }
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

export async function saveAppTimezone(refresh) {
  await api("POST", "/api/settings", {
    app_timezone: document.getElementById("appTimezone").value.trim()
  });
  toast("Timezone saved");
  await refresh();
}

export function populateTimezones() {
  var tzSelect = document.getElementById("appTimezone");
  if (!tzSelect || tzSelect.options.length > 1) return;
  if (Intl && Intl.supportedValuesOf) {
    try {
      var tzs = Intl.supportedValuesOf('timeZone');
      tzs.forEach(function(tz) {
        var opt = document.createElement("option");
        opt.value = tz;
        opt.text = tz;
        tzSelect.appendChild(opt);
      });
    } catch (e) {
      console.warn("Could not populate timezones:", e);
    }
  }
}

export async function autoSetTimezone(refresh) {
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      populateTimezones(); // Ensure options exist so the value can be selected
      document.getElementById("appTimezone").value = tz;
      await saveAppTimezone(refresh);
    } else {
      alert("Could not automatically detect your time zone.");
    }
  } catch (e) {
    alert("Error detecting time zone: " + e.message);
  }
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
  var r = await fetch("/api/ics/import", { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" }, body: fd });
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

export async function checkForUpdates(force) {
  var statusEl = document.getElementById("versionCheckStatus");
  var checkBtn = document.getElementById("checkUpdateBtn");
  var updateBtn = document.getElementById("updateServerBtn");
  var badgeEl = document.getElementById("settings-update-badge");

  if (!statusEl) return;

  statusEl.textContent = "Checking...";
  statusEl.className = "muted";
  if (checkBtn) checkBtn.disabled = true;

  try {
    var res = await api("GET", "/api/version/check" + (force ? "?force=true" : ""));
    if (res.update_available) {
      statusEl.innerHTML = "✨ Update available! (<b>v" + esc(res.latest) + "</b> is available, current is v" + esc(res.current) + ")";
      statusEl.className = "";
      if (updateBtn) updateBtn.style.display = "inline-block";
      if (badgeEl) badgeEl.style.display = "inline-block";
    } else {
      statusEl.textContent = "Your software is up-to-date (v" + res.current + ").";
      statusEl.className = "muted";
      if (updateBtn) updateBtn.style.display = "none";
      if (badgeEl) badgeEl.style.display = "none";
    }
  } catch (err) {
    console.error("Version check error:", err);
    statusEl.textContent = "Failed to check for updates.";
    statusEl.className = "muted";
  } finally {
    if (checkBtn) checkBtn.disabled = false;
  }
}
