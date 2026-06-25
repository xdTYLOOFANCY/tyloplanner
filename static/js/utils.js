// TyloPlanner — shared utility functions.

// ---------- date helpers ----------
export function z(n) { return (n < 10 ? "0" : "") + n; }
export function toISO(d) { return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
export function todayStr() { return toISO(new Date()); }
export function parseISO(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
export var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function weekDates(off) {
  var now = new Date(), dow = (now.getDay() + 6) % 7;
  var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + off * 7);
  var out = []; for (var i = 0; i < 7; i++) out.push(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
  return out;
}
export function getViewDates(view, off) {
  var now = new Date();
  if (view === 'month') {
    var m = new Date(now.getFullYear(), now.getMonth() + off, 1);
    var dow = (m.getDay() + 6) % 7;
    var start = new Date(m.getFullYear(), m.getMonth(), m.getDate() - dow);
    var out = [];
    for (var i = 0; i < 42; i++) out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    return out;
  }
  var days = parseInt(view, 10) || 7;
  if (days === 7) return weekDates(off);
  var startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (off * days));
  var out = []; for (var i = 0; i < days; i++) out.push(new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i));
  return out;
}
export function daysUntil(iso) { return Math.round((parseISO(iso) - parseISO(todayStr())) / 86400000); }
export function fmtShort(d) { return DAYS[(d.getDay() + 6) % 7] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; }

// ---------- DOM helpers ----------
export function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
export function toast(msg) {
  var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(function() { t.remove(); }, 2500);
}

// ---------- API ----------
// ---------- API ----------
function generateClientId() {
  return Math.random().toString(36).substring(2, 14);
}

function optimisticUpdate(method, path, body, id, S, SET) {
  if (path === "/api/settings") {
    if (method === "POST" && body) {
      Object.assign(SET, body);
    }
    return;
  }

  var parts = path.split("/");
  var table = parts[2];
  var pathId = parts[3];
  var subRoute = parts[4];

  if (!table || !S || !S[table]) return;

  if (method === "POST") {
    if (subRoute === "toggle") {
      var date = body && body.date;
      if (date) {
        if (!S.habit_log) S.habit_log = [];
        var idx = S.habit_log.findIndex(function(l) { return l.habit_id === pathId && l.date === date; });
        if (idx > -1) {
          S.habit_log.splice(idx, 1);
        } else {
          S.habit_log.push({ habit_id: pathId, date: date });
        }
      }
    } else {
      var existingTemp = null;
      if (S[table] && S[table].find) {
        existingTemp = S[table].find(function(x) {
          if (body && body.id && x.id === body.id) return true;
          if (!x.id || typeof x.id !== "string" || !x.id.startsWith("temp_")) return false;
          for (var k in body) {
            if (k !== "id" && body[k] !== x[k]) return false;
          }
          return true;
        });
      }

      if (existingTemp) {
        existingTemp.id = id;
      } else {
        var newRow = Object.assign({}, body);
        delete newRow.id;
        newRow.id = id;
        S[table].push(newRow);
      }
    }
  } else if (method === "PUT") {
    var idx = S[table].findIndex(function(item) { return item.id === id; });
    if (idx > -1) {
      Object.assign(S[table][idx], body);
    }
  } else if (method === "DELETE") {
    if (table === "note_folders") {
      var deletedFolder = (S.note_folders || []).find(function(f) { return f.id === id; });
      var parentId = deletedFolder ? deletedFolder.parent_id : null;
      if (S.notes) {
        S.notes.forEach(function(n) {
          if (n.folder_id === id) n.folder_id = parentId;
        });
      }
      if (S.note_folders) {
        S.note_folders.forEach(function(f) {
          if (f.parent_id === id) f.parent_id = parentId;
        });
      }
    } else if (table === "folders") {
      var deletedFolder = (S.folders || []).find(function(f) { return f.id === id; });
      var parentId = deletedFolder ? deletedFolder.parent_id : null;
      if (S.files) {
        S.files.forEach(function(f) {
          if (f.folder_id === id) f.folder_id = parentId;
        });
      }
      if (S.folders) {
        S.folders.forEach(function(f) {
          if (f.parent_id === id) f.parent_id = parentId;
        });
      }
    }
    S[table] = S[table].filter(function(item) { return item.id !== id; });
    if (table === "habits" && S.habit_log) {
      S.habit_log = S.habit_log.filter(function(l) { return l.habit_id !== id; });
    }
  }
}

export async function api(method, path, body) {
  var offMod = await import('./offline.js');
  var stateMod = await import('./state.js');

  var count = await offMod.getQueueCount();
  var isOfflineOrQueued = !navigator.onLine || count > 0;

  if (isOfflineOrQueued) {
    if (method === "GET") {
      if (path === "/api/state") {
        var cachedState = await offMod.getCache("state");
        if (cachedState) return cachedState;
        throw new Error("No cached state available offline");
      }
      if (path === "/api/settings") {
        var cachedSettings = await offMod.getCache("settings");
        if (cachedSettings) return cachedSettings;
        throw new Error("No cached settings available offline");
      }
      throw new Error("Cannot fetch GET " + path + " offline");
    } else if (method === "POST" || method === "PUT" || method === "DELETE") {
      var isToggle = path.includes("/toggle");
      var isSettings = path === "/api/settings";
      var parts = path.split("/");
      var pathId = parts[3] || null;

      var generatedId = null;
      if (method === "POST" && !isToggle && !isSettings) {
        generatedId = generateClientId();
      }
      var targetId = generatedId || pathId;

      var queueId = generateClientId();
      var queueItem = {
        id: queueId,
        method: method,
        path: path,
        data: body,
        clientId: generatedId,
        timestamp: Date.now()
      };

      await offMod.addToQueue(queueItem);

      // Mutate local state
      var S = stateMod.S;
      var SET = stateMod.SET;
      if (!S) {
        S = await offMod.getCache("state");
        stateMod.setS(S);
      }
      if (!SET) {
        SET = await offMod.getCache("settings");
        stateMod.setSET(SET);
      }

      optimisticUpdate(method, path, body, targetId, S, SET);

      if (S) await offMod.setCache("state", S);
      if (SET) await offMod.setCache("settings", SET);

      await offMod.updateOfflineBanner();

      if (navigator.onLine) {
        offMod.syncQueue(window.refreshApp);
      }

      if (method === "POST") {
        if (isToggle) {
          var isToggled = S && S.habit_log && S.habit_log.some(function(l) { return l.habit_id === pathId && l.date === body.date; });
          return { on: !!isToggled };
        }
        return { id: targetId };
      }
      return { ok: true };
    }
  }

  var opt = { method: method, headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" } };
  if (body !== undefined) opt.body = JSON.stringify(body);
  var r = await fetch(path, opt);
  if (!r.ok) {
    var e;
    try {
      e = await r.json();
    } catch (err) {
      e = { error: "HTTP " + r.status + " " + (r.statusText || "Error") };
    }
    if (e.error === "unauthorized") {
      window.location.href = "/login";
      return;
    }
    throw new Error(e.error || "Request failed");
  }
  var res = await r.json();

  if (method === "GET") {
    if (path === "/api/state") {
      await offMod.setCache("state", res);
    } else if (path === "/api/settings") {
      await offMod.setCache("settings", res);
    }
  }

  return res;
}

// ---------- shared actions ----------
export async function delRow(table, id, refresh) {
  await api("DELETE", "/api/" + table + "/" + id);
  await refresh();
}

/**
 * Executes a callback within a view transition, if supported by the browser.
 * Otherwise, calls the callback immediately.
 * Optionally supports specifying a transition direction ('forward' or 'backward').
 * @param {Function} updateDOM - Callback that performs the DOM updates.
 * @param {string} [direction] - Optional navigation direction.
 */
export function navigateWithTransition(updateDOM, direction) {
  if (!document.startViewTransition) {
    updateDOM();
    return;
  }

  if (direction) {
    try {
      // 1. Modern API: types option
      return document.startViewTransition({
        update: updateDOM,
        types: [direction]
      });
    } catch (e) {
      // Fallback for browsers supporting startViewTransition but not types
      document.documentElement.classList.add(`transition-${direction}`);
      const transition = document.startViewTransition(updateDOM);
      transition.finished.finally(() => {
        document.documentElement.classList.remove(`transition-${direction}`);
      });
      return transition;
    }
  } else {
    return document.startViewTransition(updateDOM);
  }
}

/**
 * Checks if the user is currently focused on a text input, textarea, select, or contenteditable element.
 * Useful for guarding global keyboard shortcuts.
 * @returns {boolean} True if an input element is focused.
 */
export function isInputFocused() {
  var active = document.activeElement;
  if (!active) return false;
  var tag = active.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (active.isContentEditable || active.closest('[contenteditable="true"]') !== null) return true;
  return false;
}


