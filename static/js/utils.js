import { S } from './state.js';

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

// ---------- dialogs (modal replacements for confirm()/prompt()) ----------
function openAskDialog(bodyHtml, wire) {
  var dlg = document.createElement("dialog");
  dlg.className = "modal";
  dlg.innerHTML = '<div class="modal-content" style="max-width:340px; width:90%;">' + bodyHtml + '</div>';
  document.body.appendChild(dlg);
  function done(cb) {
    return function(val) { try { dlg.close(); } catch (e) {} dlg.remove(); cb(val); };
  }
  dlg.showModal();
  return { dlg: dlg, done: done };
}

// Modal confirm(). Resolves true/false. opts: {title, okText, cancelText, danger}
export function askConfirm(message, opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    var d = openAskDialog(
      '<h3 style="margin:0 0 10px; font-size:16px; font-weight:700;">' + esc(opts.title || "Are you sure?") + '</h3>' +
      '<p style="font-size:13px; margin:0 0 16px; line-height:1.5;">' + esc(message) + '</p>' +
      '<div style="display:flex; gap:8px; justify-content:flex-end;">' +
        '<button class="btn ghost" data-act="cancel">' + esc(opts.cancelText || "Cancel") + '</button>' +
        '<button class="btn' + (opts.danger ? ' danger' : '') + '" data-act="ok">' + esc(opts.okText || "OK") + '</button>' +
      '</div>');
    var finish = d.done(resolve);
    d.dlg.addEventListener("click", function(ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute("data-act");
      if (act === "ok") finish(true);
      else if (act === "cancel" || ev.target === d.dlg) finish(false);
    });
    d.dlg.addEventListener("cancel", function(ev) { ev.preventDefault(); finish(false); });
    d.dlg.querySelector('[data-act="ok"]').focus();
  });
}

// Modal prompt(). Resolves the entered string, or null on cancel.
// opts: {title, okText, placeholder, options:[{value,label}]} — options renders a <select>.
export function askPrompt(message, defaultValue, opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    var field;
    if (opts.options) {
      field = '<select data-field style="width:100%; box-sizing:border-box; margin:0 0 16px; padding:8px;">' +
        opts.options.map(function(o) {
          return '<option value="' + esc(o.value) + '"' + (o.value === defaultValue ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join("") + '</select>';
    } else {
      field = '<input data-field type="text" value="' + esc(defaultValue == null ? "" : defaultValue) + '"' +
        (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '') +
        ' style="width:100%; box-sizing:border-box; margin:0 0 16px; padding:8px;">';
    }
    var d = openAskDialog(
      '<h3 style="margin:0 0 12px; font-size:16px; font-weight:700;">' + esc(message) + '</h3>' +
      field +
      '<div style="display:flex; gap:8px; justify-content:flex-end;">' +
        '<button class="btn ghost" data-act="cancel">Cancel</button>' +
        '<button class="btn" data-act="ok">' + esc(opts.okText || "OK") + '</button>' +
      '</div>');
    var input = d.dlg.querySelector("[data-field]");
    var finish = d.done(resolve);
    function ok() { finish(input.value); }
    d.dlg.addEventListener("click", function(ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute("data-act");
      if (act === "ok") ok();
      else if (act === "cancel" || ev.target === d.dlg) finish(null);
    });
    d.dlg.addEventListener("cancel", function(ev) { ev.preventDefault(); finish(null); });
    input.addEventListener("keydown", function(ev) { if (ev.key === "Enter") { ev.preventDefault(); ok(); } });
    input.focus();
    if (input.select) input.select();
  });
}

// ---------- context menu ----------
var _ctxMenuEl = null;
function _ctxOutside(e) { if (_ctxMenuEl && !_ctxMenuEl.contains(e.target)) closeContextMenu(); }
function _ctxEsc(e) { if (e.key === "Escape") closeContextMenu(); }
export function closeContextMenu() {
  if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
  document.removeEventListener("mousedown", _ctxOutside, true);
  document.removeEventListener("keydown", _ctxEsc, true);
  window.removeEventListener("scroll", closeContextMenu, true);
  window.removeEventListener("resize", closeContextMenu);
}

// Right-click menu at the event's cursor position.
// items: [{label, icon, danger, onClick}] or {sep:true}
export function showContextMenu(ev, items) {
  ev.preventDefault();
  ev.stopPropagation();
  closeContextMenu();
  var m = document.createElement("div");
  m.className = "ctx-menu";
  items.forEach(function(it) {
    if (it.sep) {
      var s = document.createElement("div");
      s.className = "ctx-sep";
      m.appendChild(s);
      return;
    }
    var b = document.createElement("button");
    b.className = "ctx-item" + (it.danger ? " danger" : "");
    b.innerHTML = (it.icon ? '<span class="ctx-icon">' + esc(it.icon) + '</span>' : '') + esc(it.label);
    b.addEventListener("click", function() { closeContextMenu(); it.onClick(); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  _ctxMenuEl = m;
  var x = ev.clientX, y = ev.clientY;
  if (x + m.offsetWidth > window.innerWidth - 8) x = Math.max(8, window.innerWidth - m.offsetWidth - 8);
  if (y + m.offsetHeight > window.innerHeight - 8) y = Math.max(8, window.innerHeight - m.offsetHeight - 8);
  m.style.left = x + "px";
  m.style.top = y + "px";
  setTimeout(function() {
    document.addEventListener("mousedown", _ctxOutside, true);
    document.addEventListener("keydown", _ctxEsc, true);
    window.addEventListener("scroll", closeContextMenu, true);
    window.addEventListener("resize", closeContextMenu);
  }, 0);
}

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

  // Custom action endpoints (/api/<table>/<id>/<action>, e.g. playlist
  // add-tracks/reorder) have no generic row mapping — pushing their body into
  // S[table] would create a ghost row. Habit toggle is the one exception.
  if (subRoute && subRoute !== "toggle") return;

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
  // direction is accepted for call-site compatibility but unused: the
  // transition is a directionless crossfade scoped to <main> (see style.css).
  if (!document.startViewTransition) {
    updateDOM();
    return;
  }
  return document.startViewTransition(updateDOM);
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

// ---------- Markdown ----------
var markedConfigured = false;
export function configureMarked() {
  if (markedConfigured) return;
  var parser = window.marked || (typeof marked !== 'undefined' ? marked : null);
  if (parser) {
    const wikiLink = {
      name: 'wikiLink',
      level: 'inline',
      start(src) { return src.indexOf('[['); },
      tokenizer(src, tokens) {
        const rule = /^\[\[([^\]]+)\]\]/;
        const match = rule.exec(src);
        if (match) {
          return {
            type: 'wikiLink',
            raw: match[0],
            title: match[1].trim()
          };
        }
      },
      renderer(token) {
        var t = token.title;
        var note = S && S.notes && S.notes.find(function(n) {
          return esc(n.title || "").toLowerCase() === t.toLowerCase();
        });
        if (note) return '<a href="#" class="note-link" onclick="openNote(\'' + note.id + '\');return false;">' + esc(t) + '</a>';
        return '<span class="note-link-missing">' + esc(token.raw) + '</span>';
      }
    };
    
    parser.use({
      breaks: true,
      gfm: true,
      extensions: [wikiLink],
      renderer: {
        html(token) {
          // marked v15 passes a token object here, not a raw string.
          // Escape its text so embedded HTML shows as literal text (and can't inject markup).
          var raw = token && typeof token === "object" ? (token.text != null ? token.text : token.raw) : token;
          return esc(raw);
        }
      }
    });
    markedConfigured = true;
  }
}

export function mdToHtml(text) {
  if (!text) return "";
  configureMarked();
  var parser = window.marked || (typeof marked !== 'undefined' ? marked : null);
  if (parser && typeof parser.parse === "function") {
    return parser.parse(text);
  }
  return esc(text);
}

export function debounce(func, wait) {
  var timeout;
  return function() {
    var context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      timeout = null;
      func.apply(context, args);
    }, wait);
  };
}
