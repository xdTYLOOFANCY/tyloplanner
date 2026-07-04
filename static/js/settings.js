// TyloPlanner — settings module (notifications, calendar, security, Strava).

import { S, SET, safeRender } from './state.js';
import { esc, api, toast, debounce } from './utils.js';
import { applyAccent, applyAccentFromSettings, applyThemeStyle, applyThemeStyleFromSettings, applyNavLayout, applyNavLayoutFromSettings } from './theme.js';
import { renderBackupList } from './backup.js';


var stravaEditing = false;
var tfaPending = false;
var sessionsNeedReload = false;
var oauthEditing = false;

function setVal(id, v) {
  var el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = v == null ? "" : v;
}

export function renderSettings(refresh) {
  safeRender("settings", () => {
    document.getElementById("icsUrl").textContent = S.feed_url;
  document.getElementById("icsDownload").href = S.feed_url;
  document.body.classList.toggle("auth-enabled", !!S.auth.enabled);
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
    setVal("navLayout", SET.nav_layout || "topbar");
  }
  applyThemeStyleFromSettings(SET);
  applyAccentFromSettings(SET);
  applyNavLayoutFromSettings(SET);
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
    renderTasks();
  });
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

export async function saveNavLayout(refresh) {
  var value = document.getElementById("navLayout").value;
  await api("POST", "/api/settings", {
    nav_layout: value
  });
  applyNavLayout(value);
  toast("Navigation layout saved");
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
    toast("Syncing calendars (queued)...");
    var j = await api("POST", "/api/ics/sync-now");
    if (j.status === "queued") {
      pollTask(j.task_id, "Calendar sync done", refresh);
    } else {
      toast("Calendar sync done \u2014 " + (j.added || 0) + " new events");
      await refresh();
    }
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
  var html = '';

  if (S.auth.has_password) {
    if (SET.totp_enabled) {
      html += '<p style="font-size:14px;margin-bottom:10px">\u2705 Two-factor authentication is <b>on</b>. Disable by entering a current code:</p>' +
        '<div class="formrow"><input id="tfaCode" placeholder="123456" maxlength="6" style="width:110px;text-align:center" onkeydown="if(event.keyCode===13)tfaDisable()">' +
        '<button class="btn danger" onclick="tfaDisable()">Disable 2FA</button></div>';
    } else if (tfaPending) {
      html += '<p style="font-size:14px;margin-bottom:10px">Scan this QR code with Google Authenticator / Aegis / 1Password, then enter the 6-digit code to confirm:</p>' +
        '<img src="/api/2fa/qr?t=' + Date.now() + '" alt="2FA QR" style="width:180px;border-radius:10px;background:#fff;padding:8px">' +
        '<div class="formrow" style="margin-top:10px"><input id="tfaCode" placeholder="123456" maxlength="6" style="width:110px;text-align:center" onkeydown="if(event.keyCode===13)tfaConfirm()">' +
        '<button class="btn" onclick="tfaConfirm()">Confirm &amp; enable</button>' +
        '<button class="btn ghost" onclick="tfaPending=false;renderSecurity()">Cancel</button></div>';
    } else {
      html += '<p style="font-size:14px;margin-bottom:10px">Add a second login step with an authenticator app (TOTP):</p>' +
        '<button class="btn" onclick="tfaStart()">Enable 2FA</button>';
    }

    // Add password change form below 2FA controls
    html += '<hr style="border:none;border-top:1px solid var(--border);margin:20px 0">' +
      '<h4 style="margin-bottom:12px;font-size:14px;color:var(--text)">Change Password</h4>' +
      '<div style="display:flex;flex-direction:column;gap:10px;max-width:320px;">' +
      '  <div style="display:flex;flex-direction:column;gap:4px;">' +
      '    <label class="muted" style="font-size:12px;">Current Password</label>' +
      '    <input id="changePwCurrent" type="password" placeholder="••••••••" style="padding:6px;font-size:14px;border-radius:6px;border:1px solid var(--border);background:var(--panel);color:var(--text);">' +
      '  </div>' +
      (SET.totp_enabled ?
      '  <div style="display:flex;flex-direction:column;gap:4px;">' +
      '    <label class="muted" style="font-size:12px;">2FA Verification Code</label>' +
      '    <input id="changePwTfa" type="text" placeholder="123456" maxlength="6" style="padding:6px;font-size:14px;border-radius:6px;border:1px solid var(--border);background:var(--panel);color:var(--text);text-align:center;letter-spacing:2px;">' +
      '  </div>' : '') +
      '  <div style="display:flex;flex-direction:column;gap:4px;">' +
      '    <label class="muted" style="font-size:12px;">New Password</label>' +
      '    <input id="changePwNew" type="password" placeholder="••••••••" style="padding:6px;font-size:14px;border-radius:6px;border:1px solid var(--border);background:var(--panel);color:var(--text);">' +
      '  </div>' +
      '  <div style="display:flex;flex-direction:column;gap:4px;">' +
      '    <label class="muted" style="font-size:12px;">Confirm New Password</label>' +
      '    <input id="changePwConfirm" type="password" placeholder="••••••••" style="padding:6px;font-size:14px;border-radius:6px;border:1px solid var(--border);background:var(--panel);color:var(--text);" onkeydown="if(event.keyCode===13)changePassword()">' +
      '  </div>' +
      '  <button class="btn" onclick="changePassword()" style="align-self:flex-start;margin-top:4px;">Update Password</button>' +
      '</div>';
  } else {
    // Set Password form
    html += '<h4 style="margin-bottom:12px;font-size:14px;color:var(--text)">Set Password</h4>' +
      '<div style="display:flex;flex-direction:column;gap:10px;max-width:320px;">' +
      '  <div style="display:flex;flex-direction:column;gap:4px;">' +
      '    <label class="muted" style="font-size:12px;">New Password</label>' +
      '    <input id="changePwNew" type="password" placeholder="••••••••" style="padding:6px;font-size:14px;border-radius:6px;border:1px solid var(--border);background:var(--panel);color:var(--text);">' +
      '  </div>' +
      '  <div style="display:flex;flex-direction:column;gap:4px;">' +
      '    <label class="muted" style="font-size:12px;">Confirm Password</label>' +
      '    <input id="changePwConfirm" type="password" placeholder="••••••••" style="padding:6px;font-size:14px;border-radius:6px;border:1px solid var(--border);background:var(--panel);color:var(--text);" onkeydown="if(event.keyCode===13)changePassword()">' +
      '  </div>' +
      '  <button class="btn" onclick="changePassword()" style="align-self:flex-start;margin-top:4px;">Set Password</button>' +
      '</div>';
  }

  if (S.auth.enabled) {
    // Add OAuth Configuration section
    html += '<hr style="border:none;border-top:1px solid var(--border);margin:20px 0">' +
      '<h4 style="margin-bottom:12px;font-size:14px;color:var(--text)">OAuth Configuration</h4>' +
      '<div id="oauthSettingsBox"><p class="muted" style="font-size:13px">Loading OAuth configuration...</p></div>';

    // Add active sessions section
    html += '<hr style="border:none;border-top:1px solid var(--border);margin:20px 0">' +
      '<h4 style="margin-bottom:12px;font-size:14px;color:var(--text)">📱 Active Sessions</h4>' +
      '<div id="activeSessionsBox"><p class="muted" style="font-size:13px">Loading active sessions...</p></div>';
  }

  // Preserve existing sessions content across re-renders to avoid jitter
  var existingSessionsEl = document.getElementById("activeSessionsBox");
  var existingSessionsHtml = existingSessionsEl ? existingSessionsEl.innerHTML : null;
  var sessionsAlreadyLoaded = !sessionsNeedReload && existingSessionsHtml &&
    !existingSessionsHtml.includes("Loading active sessions");

  // Preserve the live OAuth box node (not just its HTML) so an in-progress
  // Link form or focused input survives a live-sync re-render.
  var existingOauthEl = document.getElementById("oauthSettingsBox");
  var preserveOauth = !!existingOauthEl && (oauthEditing ||
    (existingOauthEl.innerHTML && !existingOauthEl.innerHTML.includes("Loading OAuth configuration")));

  box.innerHTML = html;

  if (S.auth.enabled) {
    if (sessionsAlreadyLoaded) {
      var newSessionsEl = document.getElementById("activeSessionsBox");
      if (newSessionsEl) newSessionsEl.innerHTML = existingSessionsHtml;
    } else {
      sessionsNeedReload = false;
      loadActiveSessions();
    }

    var newOauthEl = document.getElementById("oauthSettingsBox");
    if (preserveOauth && newOauthEl) {
      newOauthEl.replaceWith(existingOauthEl);
    } else {
      loadOauthConfig();
    }
  }
}

async function loadOauthConfig() {
  var container = document.getElementById("oauthSettingsBox");
  if (!container) return;
  oauthEditing = false;
  try {
    const res = await fetch("/api/oauth/status");
    if (!res.ok) throw new Error("Failed");
    const data = await res.json();
    
    let html = '';
    ['github', 'google'].forEach(provider => {
      const isLinked = data[provider];
      const title = provider.charAt(0).toUpperCase() + provider.slice(1);
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--panel);border:1px solid var(--border);border-radius:6px;margin-bottom:8px;">';
      html += '  <div style="display:flex;align-items:center;gap:12px;">';
      html += `    <div style="font-weight:500;">${title}</div>`;
      if (isLinked) {
        html += '    <span style="font-size:11px;padding:2px 6px;background:rgba(46,160,67,0.15);color:#3fb950;border-radius:10px;">Linked</span>';
      } else {
        html += '    <span style="font-size:11px;padding:2px 6px;background:rgba(139,148,158,0.15);color:var(--muted);border-radius:10px;">Not Linked</span>';
      }
      html += '  </div>';
      
      if (isLinked) {
        html += `  <button class="btn danger" style="padding:4px 8px;font-size:12px;" onclick="unlinkOauth('${provider}')">Unlink</button>`;
      } else {
        html += `  <button class="btn ghost" style="padding:4px 8px;font-size:12px;" onclick="linkOauthSetup('${provider}')">Link</button>`;
      }
      html += '</div>';
    });
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p class="loginerror">Failed to load OAuth configuration.</p>';
  }
}

async function unlinkOauth(provider) {
  if (!confirm(`Are you sure you want to unlink ${provider}?`)) return;
  
  try {
    const res = await fetch("/api/oauth/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider })
    });
    const data = await res.json();
    if (data.ok) {
      loadOauthConfig();
    } else {
      alert(data.error || "Failed to unlink.");
    }
  } catch (e) {
    alert("Network error.");
  }
}

function linkOauthSetup(provider) {
  oauthEditing = true;
  const container = document.getElementById("oauthSettingsBox");
  container.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:8px;">
      <h5 style="margin-bottom:12px;font-size:13px;font-weight:600;">Link ${provider.charAt(0).toUpperCase() + provider.slice(1)}</h5>
      <div style="margin-bottom:8px;">
        <label class="muted" style="font-size:11px;display:block;margin-bottom:4px;">Client ID</label>
        <input id="linkOauthClientId" style="width:100%;padding:6px;font-size:13px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);">
      </div>
      <div style="margin-bottom:12px;">
        <label class="muted" style="font-size:11px;display:block;margin-bottom:4px;">Client Secret</label>
        <input id="linkOauthClientSecret" type="password" style="width:100%;padding:6px;font-size:13px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);">
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn" style="padding:4px 12px;font-size:12px;" onclick="submitLinkOauth('${provider}')">Authorize</button>
        <button class="btn ghost" style="padding:4px 12px;font-size:12px;" onclick="loadOauthConfig()">Cancel</button>
      </div>
    </div>
  `;
}

// These are invoked from inline onclick handlers rendered above, so expose them.
window.loadOauthConfig = loadOauthConfig;
window.unlinkOauth = unlinkOauth;
window.linkOauthSetup = linkOauthSetup;
window.submitLinkOauth = submitLinkOauth;

async function submitLinkOauth(provider) {
  const clientId = document.getElementById("linkOauthClientId").value.trim();
  const clientSecret = document.getElementById("linkOauthClientSecret").value.trim();
  
  if (!clientId || !clientSecret) {
    alert("Client ID and Secret are required.");
    return;
  }
  
  try {
    const res = await fetch("/api/oauth/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: provider,
        action: "link",
        client_id: clientId,
        client_secret: clientSecret
      })
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Failed to initialize OAuth linking.");
    }
  } catch (e) {
    alert("Network error.");
  }
}


async function loadActiveSessions() {
  var container = document.getElementById("activeSessionsBox");
  if (!container) return;
  try {
    var sessions = await api("GET", "/api/auth/sessions");
    if (!sessions || sessions.length === 0) {
      container.innerHTML = '<p class="muted" style="font-size:13px">No active sessions.</p>';
      return;
    }
    
    var html = '<div style="display:flex; flex-direction:column; gap:10px;">';
    sessions.forEach(function(s) {
      var isCurrent = s.is_current;
      var activeDate = new Date(s.active_at * 1000);
      var timeStr = activeDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      var dateStr = activeDate.toLocaleDateString([], {month: 'short', day: 'numeric'});
      
      var timeDiff = Math.floor(Date.now() / 1000 - s.active_at);
      var relativeTime = "";
      if (timeDiff < 60) relativeTime = "Just now";
      else if (timeDiff < 3600) relativeTime = Math.floor(timeDiff / 60) + "m ago";
      else if (timeDiff < 86400) relativeTime = Math.floor(timeDiff / 3600) + "h ago";
      else relativeTime = Math.floor(timeDiff / 86400) + "d ago";

      html += '<div class="list-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-radius:6px; border:1px solid var(--border); background:var(--panel-dark, rgba(0,0,0,0.02)); gap:10px;">' +
        '  <div style="display:flex; flex-direction:column; gap:2px; flex:1; min-width:0;">' +
        '    <div style="display:flex; align-items:center; gap:6px;">' +
        '      <span style="font-weight:600; font-size:13.5px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(s.device) + '</span>' +
        (isCurrent ? '      <span class="badge" style="background:var(--accent); color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:600;">Current Device</span>' : '') +
        '    </div>' +
        '    <div style="font-size:12px; color:var(--text-muted, #888); display:flex; gap:10px; flex-wrap:wrap;">' +
        '      <span>IP: ' + esc(s.ip_address) + '</span>' +
        '      <span>•</span>' +
        '      <span title="' + activeDate.toLocaleString() + '">Active: ' + esc(relativeTime) + ' (' + esc(dateStr) + ' ' + esc(timeStr) + ')</span>' +
        '    </div>' +
        '  </div>' +
        '  <div>' +
        '    <button class="btn danger small" onclick="revokeSession(\'' + esc(s.id) + '\')">Revoke</button>' +
        '  </div>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<p class="danger" style="font-size:13px; color:red;">Failed to load active sessions: ' + esc(e.message) + '</p>';
  }
}

export async function revokeSession(sid, refresh) {
  var confirmMsg = "Are you sure you want to revoke this session? You will be logged out of that device.";
  if (confirm(confirmMsg)) {
    try {
      var res = await api("POST", "/api/auth/sessions/revoke", { session_id: sid });
      if (res.logged_out) {
        toast("Current session revoked. Logging out...");
        setTimeout(() => {
          location.href = "/login";
        }, 1000);
      } else {
        toast("Session revoked.");
        sessionsNeedReload = true;
        await refresh();
      }
    } catch(e) {
      alert(e.message || "Failed to revoke session.");
    }
  }
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

export async function changePassword(refresh) {
  var curPwEl = document.getElementById("changePwCurrent");
  var curPw = curPwEl ? curPwEl.value : "";
  var newPw = document.getElementById("changePwNew").value;
  var confirmPw = document.getElementById("changePwConfirm").value;
  
  var tfaEl = document.getElementById("changePwTfa");
  var tfaCode = tfaEl ? tfaEl.value.trim() : "";

  if (S.auth.has_password && !curPw) {
    alert("Please enter your current password.");
    return;
  }
  if (tfaEl && !tfaCode) {
    alert("Please enter your 2FA verification code.");
    return;
  }
  if (!newPw) {
    alert("Please enter your new password.");
    return;
  }
  if (newPw.length < 4) {
    alert("New password must be at least 4 characters long.");
    return;
  }
  if (newPw !== confirmPw) {
    alert("New password and confirmation do not match.");
    return;
  }

  try {
    await api("POST", "/api/settings/password", {
      current_password: curPw,
      new_password: newPw,
      tfa_code: tfaCode
    });
    toast(S.auth.has_password ? "Password updated successfully!" : "Password set successfully!");
    if (curPwEl) curPwEl.value = "";
    document.getElementById("changePwNew").value = "";
    document.getElementById("changePwConfirm").value = "";
    if (tfaEl) tfaEl.value = "";
    if (refresh) await refresh();
  } catch(e) {
    alert(e.message || "Failed to update password.");
  }
}

export async function backupNow(refresh) {
  try {
    toast("Creating backup (queued)...");
    var j = await api("POST", "/api/backup/now");
    if (j.status === "queued") {
      pollTask(j.task_id, "Backup written", refresh);
    } else {
      toast("Backup written: " + j.file);
      await refresh();
    }
  } catch(e) { alert(e.message); }
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
  try {
    toast("Syncing with Strava (queued)...");
    var j = await api("POST", "/api/strava/sync");
    if (j.status === "queued") {
      pollTask(j.task_id, "Strava sync done", refresh);
    } else {
      toast("Strava sync done \u2014 " + (j.added || 0) + " new activities");
      await refresh();
    }
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

const saveCategoryColorsDebounced = debounce(async function(obj, refresh) {
  await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
  if (refresh) await refresh();
}, 500);

export async function updateCategoryColor(name, color, refresh) {
  var cats = getTaskCategories();
  var cat = cats.find(function(c) { return c.name === name; });
  if (cat) {
    cat.color = color;
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    saveCategoryColorsDebounced(obj, refresh);
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
  var badgeEls = document.querySelectorAll(".settings-update-badge");

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
      badgeEls.forEach(function(el) { el.style.display = "inline-block"; });
    } else {
      statusEl.textContent = "Your software is up-to-date (v" + res.current + ").";
      statusEl.className = "muted";
      if (updateBtn) updateBtn.style.display = "none";
      badgeEls.forEach(function(el) { el.style.display = "none"; });
    }
  } catch (err) {
    console.error("Version check error:", err);
    statusEl.textContent = "Failed to check for updates.";
    statusEl.className = "muted";
  } finally {
    if (checkBtn) checkBtn.disabled = false;
  }
}


export async function renderTasks() {
  var list = document.getElementById("bgTaskList");
  if (!list) return;

  try {
    var tasks = await api("GET", "/api/tasks");
    if (!tasks || tasks.length === 0) {
      list.innerHTML = '<span class="muted">No background tasks logged.</span>';
      return;
    }

    var html = "";
    tasks.forEach(function(t) {
      var statusClass = "gray";
      if (t.status === "completed") statusClass = "green";
      else if (t.status === "running") statusClass = "blue";
      else if (t.status === "failed") statusClass = "red";
      else if (t.status === "pending") statusClass = "orange";

      var created = new Date(t.created_at * 1000).toLocaleString();
      var finished = t.finished_at ? new Date(t.finished_at * 1000).toLocaleString() : "-";
      var started = t.started_at ? new Date(t.started_at * 1000).toLocaleString() : "-";

      var duration = "-";
      if (t.started_at && t.finished_at) {
        duration = (t.finished_at - t.started_at) + "s";
      }

      var payloadStr = "";
      if (t.payload) {
        try {
          payloadStr = JSON.stringify(JSON.parse(t.payload));
        } catch(e) {
          payloadStr = t.payload;
        }
      }

      var resultStr = "";
      if (t.result) {
        try {
          resultStr = JSON.stringify(JSON.parse(t.result));
        } catch(e) {
          resultStr = t.result;
        }
      }

      var errHtml = "";
      if (t.error_message) {
        var errId = "task-err-" + t.id;
        errHtml = '<div style="margin-top:6px; font-size:11px;">' +
          '<button class="btn ghost small" onclick="var el = document.getElementById(\'' + errId + '\'); el.style.display = el.style.display === \'none\' ? \'block\' : \'none\'">Show error log</button>' +
          '<pre id="' + errId + '" style="display:none; margin-top:4px; padding:6px; background:var(--panel2); border:1px solid var(--border); border-radius:4px; font-family:monospace; white-space:pre-wrap; word-break:break-all; max-height:150px; overflow-y:auto; color:var(--red); text-align:left;">' + esc(t.error_message) + '</pre>' +
          '</div>';
      }

      html += '<div class="list-item" style="display:flex; flex-direction:column; padding:10px 8px; border-bottom:1px solid var(--border); gap:4px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
        '<b>' + esc(t.task_type.toUpperCase()) + '</b>' +
        '<span class="badge ' + statusClass + '">' + esc(t.status.toUpperCase()) + '</span>' +
        '</div>' +
        '<div class="muted" style="font-size:12px; display:flex; flex-wrap:wrap; gap:8px 12px;">' +
        '<span>Created: ' + esc(created) + '</span>' +
        '<span>Attempts: ' + t.attempts + '/' + t.max_attempts + '</span>' +
        (duration !== "-" ? '<span>Duration: ' + esc(duration) + '</span>' : '') +
        '</div>' +
        (payloadStr ? '<div class="muted" style="font-size:12px;">Payload: <code>' + esc(payloadStr) + '</code></div>' : '') +
        (resultStr ? '<div class="muted" style="font-size:12px; color:var(--green);">Result: <code>' + esc(resultStr) + '</code></div>' : '') +
        errHtml +
        '</div>';
    });

    list.innerHTML = html;
  } catch (err) {
    list.innerHTML = '<span class="muted" style="color:var(--red)">Failed to load task logs: ' + esc(err.message) + '</span>';
  }
}


async function pollTask(taskId, successMessage, refresh) {
  var count = 0;
  var interval = setInterval(async function() {
    try {
      count++;
      var t = await api("GET", "/api/tasks/" + taskId);
      
      // Update task list log in UI
      renderTasks();
      
      if (t.status === "completed") {
        clearInterval(interval);
        var resultMsg = successMessage;
        if (t.result) {
          try {
            var res = JSON.parse(t.result);
            if (res.added !== undefined) {
              resultMsg += " \u2014 " + res.added + " new items";
            } else if (res.file !== undefined) {
              resultMsg += ": " + res.file;
            }
          } catch(e) {}
        }
        toast(resultMsg);
        await refresh();
      } else if (t.status === "failed") {
        clearInterval(interval);
        alert("Task failed: " + (t.error_message || "Unknown error"));
        await refresh();
      } else if (count > 60) {
        clearInterval(interval);
        toast("Task is taking longer than expected. Check logs below.");
        await refresh();
      }
    } catch(e) {
      clearInterval(interval);
      alert("Error checking task status: " + e.message);
    }
  }, 1000);
}
