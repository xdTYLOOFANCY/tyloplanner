"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // static/js/offline.js
  var offline_exports = {};
  __export(offline_exports, {
    addToQueue: () => addToQueue,
    getCache: () => getCache,
    getQueue: () => getQueue,
    getQueueCount: () => getQueueCount,
    initDB: () => initDB,
    removeFromQueue: () => removeFromQueue,
    setCache: () => setCache,
    syncQueue: () => syncQueue,
    updateOfflineBanner: () => updateOfflineBanner
  });
  function initDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve, reject) {
      var req = indexedDB.open("tyloplanner_offline", 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("state_cache")) {
          db.createObjectStore("state_cache");
        }
        if (!db.objectStoreNames.contains("api_queue")) {
          db.createObjectStore("api_queue", { keyPath: "id" });
        }
      };
      req.onsuccess = function(e) {
        resolve(e.target.result);
      };
      req.onerror = function(e) {
        reject(e.target.error);
      };
    });
    return dbPromise;
  }
  async function getCache(key) {
    var db = await initDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction("state_cache", "readonly");
      var store = tx.objectStore("state_cache");
      var req = store.get(key);
      req.onsuccess = function() {
        resolve(req.result);
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  }
  async function setCache(key, val) {
    var db = await initDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction("state_cache", "readwrite");
      var store = tx.objectStore("state_cache");
      var req = store.put(val, key);
      req.onsuccess = function() {
        resolve();
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  }
  async function getQueue() {
    var db = await initDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction("api_queue", "readonly");
      var store = tx.objectStore("api_queue");
      var req = store.getAll();
      req.onsuccess = function() {
        var items = req.result || [];
        items.sort(function(a, b) {
          return a.timestamp - b.timestamp;
        });
        resolve(items);
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  }
  async function addToQueue(item) {
    var db = await initDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction("api_queue", "readwrite");
      var store = tx.objectStore("api_queue");
      var req = store.put(item);
      req.onsuccess = function() {
        resolve();
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  }
  async function removeFromQueue(id) {
    var db = await initDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction("api_queue", "readwrite");
      var store = tx.objectStore("api_queue");
      var req = store.delete(id);
      req.onsuccess = function() {
        resolve();
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  }
  async function getQueueCount() {
    var db = await initDB();
    return new Promise(function(resolve, reject) {
      var tx = db.transaction("api_queue", "readonly");
      var store = tx.objectStore("api_queue");
      var req = store.count();
      req.onsuccess = function() {
        resolve(req.result);
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  }
  async function updateOfflineBanner() {
    var banner = document.getElementById("offline-banner");
    if (!banner) return;
    var count = await getQueueCount();
    if (!navigator.onLine) {
      banner.style.display = "flex";
      banner.textContent = "Working Offline \u2014 " + count + " change" + (count === 1 ? "" : "s") + " pending";
      banner.className = "offline-banner offline";
    } else if (count > 0) {
      banner.style.display = "flex";
      banner.textContent = "Syncing \u2014 " + count + " change" + (count === 1 ? "" : "s") + " pending";
      banner.className = "offline-banner syncing";
    } else {
      banner.style.display = "none";
    }
  }
  async function syncQueue(refreshCallback) {
    if (!navigator.onLine) return;
    var queue = await getQueue();
    if (queue.length === 0) {
      await updateOfflineBanner();
      return;
    }
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      try {
        var opt = {
          method: item.method,
          headers: { "Content-Type": "application/json" }
        };
        if (item.data !== void 0) {
          opt.body = JSON.stringify(item.data);
        }
        var r = await fetch(item.path, opt);
        if (!r.ok) {
          if (r.status >= 500) {
            throw new Error("Server error: " + r.statusText);
          }
        }
        await removeFromQueue(item.id);
      } catch (err) {
        console.error("Failed to replay queued item:", item, err);
        await updateOfflineBanner();
        return;
      }
    }
    await updateOfflineBanner();
    if (refreshCallback) {
      await refreshCallback();
    }
  }
  var dbPromise;
  var init_offline = __esm({
    "static/js/offline.js"() {
      "use strict";
      dbPromise = null;
    }
  });

  // static/js/utils.js
  function z(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function toISO(d) {
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }
  function todayStr() {
    return toISO(/* @__PURE__ */ new Date());
  }
  function parseISO(s) {
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function weekDates(off) {
    var now = /* @__PURE__ */ new Date(), dow = (now.getDay() + 6) % 7;
    var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + off * 7);
    var out = [];
    for (var i = 0; i < 7; i++) out.push(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
    return out;
  }
  function getViewDates(view, off) {
    var now = /* @__PURE__ */ new Date();
    if (view === "month") {
      var m = new Date(now.getFullYear(), now.getMonth() + off, 1);
      var dow = (m.getDay() + 6) % 7;
      var start = new Date(m.getFullYear(), m.getMonth(), m.getDate() - dow);
      var out = [];
      for (var i = 0; i < 42; i++) out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
      return out;
    }
    var days = parseInt(view, 10) || 7;
    if (days === 7) return weekDates(off);
    var startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off * days);
    var out = [];
    for (var i = 0; i < days; i++) out.push(new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i));
    return out;
  }
  function daysUntil(iso) {
    return Math.round((parseISO(iso) - parseISO(todayStr())) / 864e5);
  }
  function fmtShort(d) {
    return DAYS[(d.getDay() + 6) % 7] + " " + d.getDate() + " " + MONTHS[d.getMonth()];
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() {
      t.remove();
    }, 2500);
  }
  function generateClientId() {
    return Math.random().toString(36).substring(2, 14);
  }
  function optimisticUpdate(method, path, body, id, S2, SET2) {
    if (path === "/api/settings") {
      if (method === "POST" && body) {
        Object.assign(SET2, body);
      }
      return;
    }
    var parts = path.split("/");
    var table = parts[2];
    var pathId = parts[3];
    var subRoute = parts[4];
    if (!table || !S2 || !S2[table]) return;
    if (method === "POST") {
      if (subRoute === "toggle") {
        var date = body && body.date;
        if (date) {
          if (!S2.habit_log) S2.habit_log = [];
          var idx = S2.habit_log.findIndex(function(l) {
            return l.habit_id === pathId && l.date === date;
          });
          if (idx > -1) {
            S2.habit_log.splice(idx, 1);
          } else {
            S2.habit_log.push({ habit_id: pathId, date });
          }
        }
      } else {
        var existingTemp = null;
        if (S2[table] && S2[table].find) {
          existingTemp = S2[table].find(function(x) {
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
          S2[table].push(newRow);
        }
      }
    } else if (method === "PUT") {
      var idx = S2[table].findIndex(function(item) {
        return item.id === id;
      });
      if (idx > -1) {
        Object.assign(S2[table][idx], body);
      }
    } else if (method === "DELETE") {
      S2[table] = S2[table].filter(function(item) {
        return item.id !== id;
      });
      if (table === "habits" && S2.habit_log) {
        S2.habit_log = S2.habit_log.filter(function(l) {
          return l.habit_id !== id;
        });
      }
    }
  }
  async function api(method, path, body) {
    var offMod = await Promise.resolve().then(() => (init_offline(), offline_exports));
    var stateMod = await Promise.resolve().then(() => (init_state(), state_exports));
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
          method,
          path,
          data: body,
          timestamp: Date.now()
        };
        await offMod.addToQueue(queueItem);
        var S2 = stateMod.S;
        var SET2 = stateMod.SET;
        if (!S2) {
          S2 = await offMod.getCache("state");
          stateMod.setS(S2);
        }
        if (!SET2) {
          SET2 = await offMod.getCache("settings");
          stateMod.setSET(SET2);
        }
        optimisticUpdate(method, path, body, targetId, S2, SET2);
        if (S2) await offMod.setCache("state", S2);
        if (SET2) await offMod.setCache("settings", SET2);
        await offMod.updateOfflineBanner();
        if (navigator.onLine) {
          offMod.syncQueue(window.refreshApp);
        }
        if (method === "POST") {
          if (isToggle) {
            var isToggled = S2 && S2.habit_log && S2.habit_log.some(function(l) {
              return l.habit_id === pathId && l.date === body.date;
            });
            return { on: !!isToggled };
          }
          return { id: targetId };
        }
        return { ok: true };
      }
    }
    var opt = { method, headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" } };
    if (body !== void 0) opt.body = JSON.stringify(body);
    var r = await fetch(path, opt);
    if (!r.ok) {
      var e = await r.json().catch(function() {
        return { error: r.statusText };
      });
      throw new Error(e.error || "request failed");
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
  async function delRow(table, id, refresh2) {
    await api("DELETE", "/api/" + table + "/" + id);
    await refresh2();
  }
  var DAYS, MONTHS;
  var init_utils = __esm({
    "static/js/utils.js"() {
      DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    }
  });

  // static/js/state.js
  var state_exports = {};
  __export(state_exports, {
    PRESETS: () => PRESETS,
    S: () => S,
    SET: () => SET,
    habitSet: () => habitSet,
    refresh: () => refresh,
    setHabitEntry: () => setHabitEntry,
    setS: () => setS,
    setSET: () => setSET
  });
  function setHabitEntry(key, val) {
    if (val) habitSet[key] = true;
    else delete habitSet[key];
  }
  function setS(val) {
    S = val;
  }
  function setSET(val) {
    SET = val;
  }
  async function refresh(renderAll) {
    S = await api("GET", "/api/state");
    if (window.Alpine) {
      Alpine.store("state", S);
    }
    SET = await api("GET", "/api/settings");
    habitSet = {};
    S.habit_log.forEach(function(l) {
      habitSet[l.habit_id + "|" + l.date] = true;
    });
    renderAll();
  }
  var S, SET, habitSet, PRESETS;
  var init_state = __esm({
    "static/js/state.js"() {
      init_utils();
      S = null;
      SET = null;
      habitSet = {};
      PRESETS = {
        balanced: [
          { id: "deadlines", type: "deadlines", x: 1, y: 1, w: 6, h: 2, mx: 1, my: 1, mw: 6, mh: 2 },
          { id: "today_plan", type: "today_plan", x: 7, y: 1, w: 6, h: 2, mx: 1, my: 3, mw: 6, mh: 2 },
          { id: "habits", type: "habits", x: 1, y: 3, w: 4, h: 2, mx: 1, my: 5, mw: 6, mh: 2 },
          { id: "workouts", type: "workouts", x: 5, y: 3, w: 4, h: 2, mx: 1, my: 7, mw: 6, mh: 2 },
          { id: "tasks", type: "tasks", x: 9, y: 3, w: 4, h: 2, mx: 1, my: 9, mw: 6, mh: 2 }
        ],
        academic: [
          { id: "deadlines", type: "deadlines", x: 1, y: 1, w: 8, h: 2, mx: 1, my: 1, mw: 6, mh: 2 },
          { id: "tasks", type: "tasks", x: 9, y: 1, w: 4, h: 4, mx: 1, my: 3, mw: 6, mh: 3 },
          { id: "today_plan", type: "today_plan", x: 1, y: 3, w: 8, h: 2, mx: 1, my: 6, mw: 6, mh: 2 },
          { id: "habits", type: "habits", x: 1, y: 5, w: 6, h: 2, mx: 1, my: 8, mw: 6, mh: 2 },
          { id: "workouts", type: "workouts", x: 7, y: 5, w: 6, h: 2, mx: 1, my: 10, mw: 6, mh: 2 }
        ],
        active: [
          { id: "workouts", type: "workouts", x: 1, y: 1, w: 8, h: 2, mx: 1, my: 1, mw: 6, mh: 2 },
          { id: "habits", type: "habits", x: 9, y: 1, w: 4, h: 4, mx: 1, my: 3, mw: 6, mh: 3 },
          { id: "today_plan", type: "today_plan", x: 1, y: 3, w: 8, h: 2, mx: 1, my: 6, mw: 6, mh: 2 },
          { id: "deadlines", type: "deadlines", x: 1, y: 5, w: 6, h: 2, mx: 1, my: 8, mw: 6, mh: 2 },
          { id: "tasks", type: "tasks", x: 7, y: 5, w: 6, h: 2, mx: 1, my: 10, mw: 6, mh: 2 }
        ],
        minimalist: [
          { id: "today_plan", type: "today_plan", x: 1, y: 1, w: 4, h: 2, mx: 1, my: 1, mw: 6, mh: 2 },
          { id: "deadlines", type: "deadlines", x: 5, y: 1, w: 4, h: 2, mx: 1, my: 3, mw: 6, mh: 2 },
          { id: "tasks", type: "tasks", x: 9, y: 1, w: 4, h: 2, mx: 1, my: 5, mw: 6, mh: 2 },
          { id: "habits", type: "habits", x: 1, y: 3, w: 6, h: 2, mx: 1, my: 7, mw: 6, mh: 2 },
          { id: "workouts", type: "workouts", x: 7, y: 3, w: 6, h: 2, mx: 1, my: 9, mw: 6, mh: 2 }
        ]
      };
    }
  });

  // static/js/theme.js
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", localStorage.getItem("tylo-theme") || "dark");
  }
  function toggleTheme() {
    localStorage.setItem("tylo-theme", (localStorage.getItem("tylo-theme") || "dark") === "dark" ? "light" : "dark");
    applyTheme();
  }
  function applyAccent(hexColor) {
    if (!hexColor || !/^#[0-9a-fA-F]{6}$/.test(hexColor)) return;
    document.documentElement.style.setProperty("--accent", hexColor);
    var r = parseInt(hexColor.slice(1, 3), 16) / 255;
    var g = parseInt(hexColor.slice(3, 5), 16) / 255;
    var b = parseInt(hexColor.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    var hDeg = (h * 360 + 20) % 360;
    var hNorm = hDeg / 360;
    var r2, g2, b2;
    if (s === 0) {
      r2 = g2 = b2 = l;
    } else {
      var hue2rgb = function(p2, q2, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p2 + (q2 - p2) * 6 * t;
        if (t < 1 / 2) return q2;
        if (t < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - t) * 6;
        return p2;
      };
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      var p = 2 * l - q;
      r2 = hue2rgb(p, q, hNorm + 1 / 3);
      g2 = hue2rgb(p, q, hNorm);
      b2 = hue2rgb(p, q, hNorm - 1 / 3);
    }
    var toHex = function(x) {
      var hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? "0" + hex : hex;
    };
    var hex2 = "#" + toHex(r2) + toHex(g2) + toHex(b2);
    document.documentElement.style.setProperty("--accent2", hex2);
  }
  function applyAccentFromSettings(set) {
    if (set && set.accent_color) {
      applyAccent(set.accent_color);
    }
  }
  function applyThemeStyle(style) {
    document.documentElement.setAttribute("data-theme-style", style || "default");
  }
  function applyThemeStyleFromSettings(set) {
    var style = set && set.app_theme_style ? set.app_theme_style : "default";
    applyThemeStyle(style);
  }
  var init_theme = __esm({
    "static/js/theme.js"() {
    }
  });

  // static/js/backup.js
  function exportData() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tyloplanner-backup-" + todayStr() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function importData(ev, refresh2) {
    var f = ev.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = async function() {
      try {
        var s = JSON.parse(r.result);
        if (!s || typeof s !== "object" || !("habits" in s)) throw new Error("not a TyloPlanner backup");
        if (!confirm("Replace ALL current data with this backup?")) return;
        await api("POST", "/api/restore", s);
        await refresh2();
        toast("Backup restored.");
      } catch (e) {
        alert("Restore failed: " + e.message);
      }
    };
    r.readAsText(f);
    ev.target.value = "";
  }
  async function renderBackupList(containerId, refresh2) {
    var container = document.getElementById(containerId);
    if (!container) return;
    try {
      var backups = await api("GET", "/api/backups");
      if (!backups || backups.length === 0) {
        container.innerHTML = '<div class="muted">No automatic backups yet.</div>';
        return;
      }
      var html = "";
      backups.forEach(function(b) {
        var sizeText = typeof b.size_kb === "number" ? b.size_kb.toFixed(1) + " KB" : "";
        html += '<div class="list-item" style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">';
        html += '<div class="grow"><b>' + esc(b.date) + '</b> <span class="muted">(' + esc(sizeText) + ")</span></div>";
        html += '<button class="btn small restore-btn" data-filename="' + esc(b.filename) + '" data-date="' + esc(b.date) + '">Restore</button>';
        html += "</div>";
      });
      container.innerHTML = html;
      container.onclick = async function(e) {
        var btn = e.target.closest(".restore-btn");
        if (!btn) return;
        var filename = btn.getAttribute("data-filename");
        var date = btn.getAttribute("data-date");
        if (confirm("Restore from " + date + "? All current data will be replaced.")) {
          try {
            await api("POST", "/api/backups/" + filename + "/restore");
            toast("Restored from " + date);
            if (refresh2) {
              await refresh2();
            }
          } catch (err) {
            alert("Restore failed: " + err.message);
          }
        }
      };
    } catch (e) {
      container.innerHTML = '<div class="danger">Failed to load backups: ' + esc(e.message) + "</div>";
    }
  }
  var init_backup = __esm({
    "static/js/backup.js"() {
      init_state();
      init_utils();
    }
  });

  // static/js/exams.js
  async function addExam(refresh2) {
    var n = document.getElementById("examName").value.trim();
    var d = document.getElementById("examDate").value;
    if (!n || !d) {
      alert("Name and date required.");
      return;
    }
    var ects = parseFloat(document.getElementById("examEcts").value) || null;
    await api("POST", "/api/exams", { name: n, date: d, ects });
    document.getElementById("examName").value = "";
    document.getElementById("examDate").value = "";
    document.getElementById("examEcts").value = "";
    await refresh2();
  }
  async function setGrade(id, val, refresh2) {
    var g = val === "" ? null : parseFloat(val);
    await api("PUT", "/api/exams/" + id, { grade: g });
    await refresh2();
  }
  function examBadge(d) {
    if (d < 0) return '<span class="badge gray">past</span>';
    if (d === 0) return '<span class="badge red">TODAY</span>';
    var cls = d < 7 ? "red" : d < 21 ? "orange" : "green";
    return '<span class="badge ' + cls + '">' + d + "d</span>";
  }
  function renderExams() {
    var list = S.exams.slice().sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });
    var html = "<tr><th>Name</th><th>Date</th><th>Countdown</th><th>ECTS</th><th>Grade</th><th></th></tr>";
    list.forEach(function(e) {
      html += "<tr><td>" + esc(e.name) + '</td><td class="muted">' + esc(e.date) + "</td><td>" + examBadge(daysUntil(e.date)) + "</td><td>" + (e.ects || "\u2014") + '</td><td><input type="number" step="0.1" min="1" max="10" value="' + (e.grade != null ? e.grade : "") + `" placeholder="\u2014" onchange="setGrade('` + e.id + `',this.value)"></td><td><button class="btn danger small" onclick="delRow('exams','` + e.id + `')">\u2715</button></td></tr>`;
    });
    document.getElementById("examTable").innerHTML = html + (list.length ? "" : '<tr><td colspan="6" class="muted">No exams yet.</td></tr>');
  }
  var init_exams = __esm({
    "static/js/exams.js"() {
      init_state();
      init_utils();
    }
  });

  // static/js/habits.js
  async function addHabit(refresh2) {
    var n = document.getElementById("habitName").value.trim();
    if (!n) return;
    await api("POST", "/api/habits", { name: n, created: todayStr() });
    document.getElementById("habitName").value = "";
    await refresh2();
  }
  async function delHabit(id, refresh2) {
    if (!confirm("Delete this habit and its history?")) return;
    await api("DELETE", "/api/habits/" + id);
    await refresh2();
  }
  async function toggleHabit(id, iso, renderHabits2, renderDashboard2) {
    var key = id + "|" + iso;
    setHabitEntry(key, !habitSet[key]);
    renderHabits2();
    renderDashboard2();
    await api("POST", "/api/habits/" + id + "/toggle", { date: iso });
  }
  function streak(hid) {
    var c = 0, d = parseISO(todayStr());
    if (!habitSet[hid + "|" + toISO(d)]) d.setDate(d.getDate() - 1);
    while (habitSet[hid + "|" + toISO(d)]) {
      c++;
      d.setDate(d.getDate() - 1);
    }
    return c;
  }
  function renderHabits() {
    var dates = weekDates(0), today = todayStr();
    var html = "<tr><th>Habit</th>";
    for (var i = 0; i < 7; i++) html += "<th" + (toISO(dates[i]) === today ? ' style="color:var(--accent)"' : "") + ">" + DAYS[i] + "</th>";
    html += "<th>Streak</th><th></th></tr>";
    S.habits.forEach(function(h) {
      html += "<tr><td>" + esc(h.name) + "</td>";
      for (var k = 0; k < 7; k++) {
        var iso = toISO(dates[k]), on = !!habitSet[h.id + "|" + iso];
        html += '<td><span class="hcheck' + (on ? " on" : "") + `" onclick="toggleHabit('` + h.id + "','" + iso + `')">` + (on ? "\u2713" : "") + "</span></td>";
      }
      html += '<td><span class="badge ' + (streak(h.id) > 0 ? "green" : "gray") + '">' + streak(h.id) + "\u{1F525}</span></td>";
      html += `<td><button class="btn danger small" onclick="delHabit('` + h.id + `')">\u2715</button></td></tr>`;
    });
    document.getElementById("habitTable").innerHTML = html + (S.habits.length ? "" : '<tr><td colspan="10" class="muted">No habits yet \u2014 add one above.</td></tr>');
  }
  var init_habits = __esm({
    "static/js/habits.js"() {
      init_state();
      init_utils();
      init_utils();
    }
  });

  // static/js/workouts.js
  async function addWorkout(refresh2) {
    var dur = parseFloat(document.getElementById("wDur").value) || 0;
    var dist = parseFloat(document.getElementById("wDist").value) || 0;
    if (!dur && !dist) {
      alert("Enter at least minutes or km.");
      return;
    }
    await api("POST", "/api/workouts", {
      type: document.getElementById("wType").value,
      date: document.getElementById("wDate").value || todayStr(),
      dur,
      dist,
      note: document.getElementById("wNote").value.trim(),
      source: "manual"
    });
    document.getElementById("wDur").value = "";
    document.getElementById("wDist").value = "";
    document.getElementById("wNote").value = "";
    await refresh2();
  }
  function weekTotals(off) {
    var ds = weekDates(off), a = toISO(ds[0]), b = toISO(ds[6]);
    var t = { count: 0, runKm: 0, bikeKm: 0, min: 0, gym: 0 };
    S.workouts.forEach(function(w) {
      if (w.date < a || w.date > b) return;
      t.count++;
      t.min += w.dur || 0;
      if (w.type === "gym") t.gym++;
      else if (w.type === "run") t.runKm += w.dist || 0;
      else if (w.type === "bike") t.bikeKm += w.dist || 0;
    });
    return t;
  }
  function renderWorkouts() {
    var t = weekTotals(0);
    document.getElementById("wStats").innerHTML = '<div class="stat"><div class="v">' + t.count + '</div><div class="l">sessions</div></div><div class="stat"><div class="v">' + Math.round(t.runKm * 10) / 10 + '</div><div class="l">run km</div></div><div class="stat"><div class="v">' + Math.round(t.bikeKm * 10) / 10 + '</div><div class="l">bike km</div></div><div class="stat"><div class="v">' + Math.round(t.min) + '</div><div class="l">minutes</div></div><div class="stat"><div class="v">' + t.gym + '</div><div class="l">gym sessions</div></div>';
    var list = S.workouts.slice().sort(function(a, b) {
      return b.date.localeCompare(a.date);
    }).slice(0, 50);
    var html = "";
    list.forEach(function(w) {
      html += '<div class="list-item"><div class="grow"><div>' + WTYPES[w.type] + (w.dist ? " \xB7 " + w.dist + " km" : "") + (w.dur ? " \xB7 " + w.dur + " min" : "") + (w.source === "strava" ? ' <span class="badge blue">strava</span>' : "") + '</div><div class="muted">' + esc(w.date) + (w.note ? " \u2014 " + esc(w.note) : "") + `</div></div><button class="btn danger small" onclick="delRow('workouts','` + w.id + `')">\u2715</button></div>`;
    });
    document.getElementById("wList").innerHTML = html || '<div class="muted">No workouts logged yet.</div>';
    document.getElementById("stravaSyncBtn").style.display = S.strava.connected ? "inline-block" : "none";
  }
  var WTYPES;
  var init_workouts = __esm({
    "static/js/workouts.js"() {
      init_state();
      init_utils();
      init_utils();
      WTYPES = { run: "\u{1F3C3} Run", bike: "\u{1F6B4} Bike", gym: "\u{1F3CB}\uFE0F Gym" };
    }
  });

  // static/js/settings.js
  function setVal(id, v) {
    var el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = v == null ? "" : v;
  }
  function renderSettings(refresh2) {
    document.getElementById("icsUrl").textContent = S.feed_url;
    document.getElementById("icsDownload").href = S.feed_url;
    document.getElementById("logoutBtn").style.display = S.auth.enabled ? "inline-block" : "none";
    var box = document.getElementById("stravaBox"), html = "";
    var host = (S.app_url || location.origin).replace(/^https?:\/\//, "").replace(/:\d+$/, "").replace(/\/.*$/, "");
    if (!S.strava.configured || stravaEditing) {
      html = '<p style="font-size:14px;margin-bottom:10px">Connect Strava in three steps \u2014 no server access needed:</p><ol style="font-size:14px;margin:0 0 12px 18px;line-height:1.7"><li>Create a free API app at <a href="https://www.strava.com/settings/api" target="_blank" style="color:var(--accent)">strava.com/settings/api</a></li><li>Set <b>Authorization Callback Domain</b> to: <code class="url">' + esc(host) + '</code></li><li>Copy the <b>Client ID</b> and <b>Client Secret</b> below and save:</li></ol><div class="formrow"><input id="stravaCid" placeholder="Client ID" style="width:130px" onkeydown="if(event.keyCode===13)stravaSaveConfig()"><input id="stravaSecret" type="password" placeholder="Client Secret" style="flex:1;min-width:200px" onkeydown="if(event.keyCode===13)stravaSaveConfig()"><button class="btn" onclick="stravaSaveConfig()">Save keys</button>' + (stravaEditing ? '<button class="btn ghost" onclick="stravaEditing=false;renderSettings()">Cancel</button>' : "") + "</div>" + (S.strava.from_env ? '<p class="muted">Note: keys are currently set via .env, which overrides keys saved here.</p>' : "");
    } else if (!S.strava.connected) {
      html = '<p style="font-size:14px;margin-bottom:10px">\u2705 API keys saved. Now connect your Strava account:</p><a class="btn" href="/strava/connect" style="text-decoration:none">Connect Strava</a> <button class="btn ghost small" onclick="stravaEditing=true;renderSettings()">Edit keys</button> <button class="btn danger small" onclick="stravaForget()">Remove keys</button>';
    } else {
      html = '<p style="font-size:14px;margin-bottom:10px">\u2705 Connected.' + (S.strava.last_sync ? " Last sync: " + esc(S.strava.last_sync) : "") + '</p><button class="btn" onclick="stravaSync()">\u27F3 Sync activities now</button> <button class="btn danger small" onclick="stravaDisconnect()">Disconnect</button>';
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
      statusBox.innerHTML = '<p style="font-size:14px;margin-bottom:8px">Automatic backups: a JSON snapshot is written to <b>data/backups/</b> every night (newest 14 kept).' + (SET.last_backup ? " Last backup: <b>" + esc(SET.last_backup) + "</b>." : " No backup made yet.") + '</p><button class="btn small" onclick="backupNow()">Backup now</button>';
    }
    var cats = getTaskCategories();
    var catsHtml = "";
    cats.forEach(function(cat) {
      catsHtml += '<div class="list-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:10px;"><span class="badge" style="background-color:' + esc(cat.color) + '; color:#fff; font-weight:600; padding:4px 8px; border-radius:4px;">' + esc(cat.name) + '</span><div style="flex:1"></div><input type="color" value="' + esc(cat.color) + `" onchange="updateCategoryColor('` + esc(cat.name).replace(/'/g, "\\'") + `', this.value)" style="width:30px; height:24px; padding:0; border:none; background:none; cursor:pointer;"><button class="btn danger small" onclick="deleteCategory('` + esc(cat.name).replace(/'/g, "\\'") + `')">Delete</button></div>`;
    });
    var settingsCategoriesEl = document.getElementById("settingsCategories");
    if (settingsCategoriesEl) {
      settingsCategoriesEl.innerHTML = catsHtml || '<div class="muted">No categories configured.</div>';
    }
    renderBackupList("backupList", refresh2);
    checkForUpdates(false).catch(function() {
    });
  }
  async function toggleTabPersistence(refresh2) {
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
    await refresh2();
  }
  async function saveAppThemeStyle(refresh2) {
    var value = document.getElementById("appThemeStyle").value;
    await api("POST", "/api/settings", {
      app_theme_style: value
    });
    applyThemeStyle(value);
    toast("Theme style saved");
    await refresh2();
  }
  async function saveAccentColor(refresh2) {
    var value = document.getElementById("accentColor").value;
    await api("POST", "/api/settings", {
      accent_color: value
    });
    applyAccent(value);
    toast("Accent color saved");
    await refresh2();
  }
  async function resetAccentColor(refresh2) {
    var value = "#4f8cff";
    await api("POST", "/api/settings", {
      accent_color: value
    });
    applyAccent(value);
    toast("Accent color reset");
    await refresh2();
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
    document.getElementById("calSyncMeta").textContent = SET.cal_last_sync ? "Last sync: " + SET.cal_last_sync : "";
  }
  async function saveNotifySettings(refresh2) {
    await api("POST", "/api/settings", {
      ntfy_server: document.getElementById("ntfyServer").value.trim() || "https://ntfy.sh",
      ntfy_topic: document.getElementById("ntfyTopic").value.trim(),
      notify_agenda_time: document.getElementById("agendaTime").value || "07:30",
      notify_habit_time: document.getElementById("habitTime").value || "20:00",
      notify_exam_days: document.getElementById("examDays").value.trim() || "7,3,1"
    });
    toast("Notification settings saved");
    await refresh2();
  }
  async function testNotify() {
    try {
      await api("POST", "/api/notify/test");
      toast("Test sent \u2014 check your phone!");
    } catch (e) {
      alert(e.message);
    }
  }
  async function saveCalSync(refresh2) {
    await api("POST", "/api/settings", {
      cal_sync_urls: document.getElementById("calSyncUrls").value,
      cal_sync_hours: document.getElementById("calSyncHours").value || "6"
    });
    toast("Calendar sync settings saved");
    await refresh2();
  }
  async function calSyncNow(refresh2) {
    try {
      toast("Syncing calendars\u2026");
      var j = await api("POST", "/api/ics/sync-now");
      toast("Calendar sync done \u2014 " + j.added + " new events");
      await refresh2();
    } catch (e) {
      alert(e.message);
    }
  }
  function renderSecurity() {
    var box = document.getElementById("securityBox");
    if (!box || !SET) return;
    var html = "";
    if (!S.auth.enabled) {
      html = '<p style="font-size:14px">Login is disabled \u2014 set <b>AUTH_PASSWORD</b> in <b>.env</b> to enable it (required before 2FA makes sense).</p>';
    } else if (SET.totp_enabled) {
      html = '<p style="font-size:14px;margin-bottom:10px">\u2705 Two-factor authentication is <b>on</b>. Disable by entering a current code:</p><div class="formrow"><input id="tfaCode" placeholder="123456" maxlength="6" style="width:110px;text-align:center" onkeydown="if(event.keyCode===13)tfaDisable()"><button class="btn danger" onclick="tfaDisable()">Disable 2FA</button></div>';
    } else if (tfaPending) {
      html = '<p style="font-size:14px;margin-bottom:10px">Scan this QR code with Google Authenticator / Aegis / 1Password, then enter the 6-digit code to confirm:</p><img src="/api/2fa/qr?t=' + Date.now() + '" alt="2FA QR" style="width:180px;border-radius:10px;background:#fff;padding:8px"><div class="formrow" style="margin-top:10px"><input id="tfaCode" placeholder="123456" maxlength="6" style="width:110px;text-align:center" onkeydown="if(event.keyCode===13)tfaConfirm()"><button class="btn" onclick="tfaConfirm()">Confirm &amp; enable</button><button class="btn ghost" onclick="tfaPending=false;renderSecurity()">Cancel</button></div>';
    } else {
      html = '<p style="font-size:14px;margin-bottom:10px">Add a second login step with an authenticator app (TOTP):</p><button class="btn" onclick="tfaStart()">Enable 2FA</button>';
    }
    box.innerHTML = html;
  }
  async function tfaStart() {
    await api("POST", "/api/2fa/setup");
    tfaPending = true;
    renderSecurity();
  }
  async function tfaConfirm(refresh2) {
    try {
      await api("POST", "/api/2fa/enable", { code: document.getElementById("tfaCode").value.trim() });
      tfaPending = false;
      toast("2FA enabled \u2014 you'll be asked for a code at login");
      await refresh2();
    } catch (e) {
      alert(e.message);
    }
  }
  async function tfaDisable(refresh2) {
    try {
      await api("POST", "/api/2fa/disable", { code: document.getElementById("tfaCode").value.trim() });
      toast("2FA disabled");
      await refresh2();
    } catch (e) {
      alert(e.message);
    }
  }
  async function backupNow(refresh2) {
    var j = await api("POST", "/api/backup/now");
    toast("Backup written: " + j.file);
    await refresh2();
  }
  function copyIcs() {
    navigator.clipboard.writeText(document.getElementById("icsUrl").textContent).then(function() {
      toast("Feed URL copied");
    });
  }
  async function importIcsFile(refresh2) {
    var f = document.getElementById("icsFile").files[0];
    if (!f) {
      alert("Choose an .ics file first.");
      return;
    }
    var fd = new FormData();
    fd.append("file", f);
    var r = await fetch("/api/ics/import", { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" }, body: fd });
    var j = await r.json();
    if (j.error) alert(j.error);
    else toast("Imported " + j.added + " of " + j.found + " events");
    await refresh2();
  }
  async function clearIcs(refresh2) {
    if (!confirm("Remove all events imported from calendars?")) return;
    var j = await api("DELETE", "/api/ics");
    toast("Removed " + j.deleted + " imported events");
    await refresh2();
  }
  async function stravaSaveConfig(refresh2) {
    try {
      await api("POST", "/api/strava/config", {
        client_id: document.getElementById("stravaCid").value.trim(),
        client_secret: document.getElementById("stravaSecret").value.trim()
      });
      stravaEditing = false;
      toast("Strava keys saved \u2014 now click Connect Strava");
      await refresh2();
    } catch (e) {
      alert(e.message);
    }
  }
  async function stravaForget(refresh2) {
    if (!confirm("Remove the saved Strava API keys and connection?")) return;
    await api("DELETE", "/api/strava/config");
    await refresh2();
  }
  async function stravaSync(refresh2) {
    toast("Syncing with Strava\u2026");
    try {
      var j = await api("POST", "/api/strava/sync");
      toast("Strava sync done \u2014 " + j.added + " new activities");
      await refresh2();
    } catch (e) {
      alert(e.message);
    }
  }
  async function stravaDisconnect(refresh2) {
    await api("POST", "/api/strava/disconnect");
    await refresh2();
  }
  function getCategoryColorHex(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    var color = "#";
    for (var i = 0; i < 3; i++) {
      var value = hash >> i * 8 & 255;
      value = Math.floor((value + 128) / 2);
      color += ("00" + value.toString(16)).substr(-2);
    }
    return color;
  }
  function getTaskCategories() {
    var raw = SET && SET.task_categories ? SET.task_categories.trim() : "";
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
      }
    }
    var parts = raw.split(",").map(function(c) {
      return c.trim();
    }).filter(Boolean);
    var defaultColors = { "School": "#4f8cff", "Work": "#3ecf8e", "Personal": "#f5a623" };
    return parts.map(function(c) {
      return { name: c, color: defaultColors[c] || getCategoryColorHex(c) };
    });
  }
  async function updateCategoryColor(name, color, refresh2) {
    var cats = getTaskCategories();
    var cat = cats.find(function(c) {
      return c.name === name;
    });
    if (cat) {
      cat.color = color;
      var obj = {};
      cats.forEach(function(c) {
        obj[c.name] = c.color;
      });
      await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
      await refresh2();
    }
  }
  async function addCustomCategory(refresh2) {
    var input = document.getElementById("newCategoryInput");
    var colorInput = document.getElementById("newCategoryColor");
    if (!input) return;
    var newCat = input.value.trim();
    if (!newCat) return;
    var newColor = colorInput ? colorInput.value : "#4f8cff";
    var cats = getTaskCategories();
    var exists = cats.some(function(c) {
      return c.name.toLowerCase() === newCat.toLowerCase();
    });
    if (!exists) {
      cats.push({ name: newCat, color: newColor });
      var obj = {};
      cats.forEach(function(c) {
        obj[c.name] = c.color;
      });
      await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
      input.value = "";
      if (colorInput) colorInput.value = "#4f8cff";
      await refresh2();
    }
  }
  async function deleteCategory(catName, refresh2) {
    var cats = getTaskCategories();
    var idx = cats.findIndex(function(c) {
      return c.name === catName;
    });
    if (idx !== -1) {
      cats.splice(idx, 1);
      var obj = {};
      cats.forEach(function(c) {
        obj[c.name] = c.color;
      });
      await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
      await refresh2();
    }
  }
  async function checkForUpdates(force) {
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
        statusEl.innerHTML = "\u2728 Update available! (<b>v" + esc(res.latest) + "</b> is available, current is v" + esc(res.current) + ")";
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
  var stravaEditing, tfaPending;
  var init_settings = __esm({
    "static/js/settings.js"() {
      init_state();
      init_utils();
      init_theme();
      init_backup();
      stravaEditing = false;
      tfaPending = false;
    }
  });

  // static/js/dashboard.js
  function saveWidgetsData() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async function() {
      await api("POST", "/api/settings", {
        dashboard_widgets_data: JSON.stringify(widgetsData)
      });
      if (SET) {
        SET.dashboard_widgets_data = JSON.stringify(widgetsData);
      }
    }, 1e3);
  }
  function mdToHtml(text) {
    if (!text) return "";
    var parser = window.marked || (typeof marked !== "undefined" ? marked : null);
    if (parser) {
      if (typeof parser.parse === "function") {
        return parser.parse(text);
      } else if (typeof parser === "function") {
        return parser(text);
      }
    }
    return esc(text);
  }
  function initLayoutAndStyle() {
    let desktop = [];
    let mobile = [];
    try {
      if (SET && SET.dashboard_desktop_layout) desktop = JSON.parse(SET.dashboard_desktop_layout);
    } catch (e) {
    }
    try {
      if (SET && SET.dashboard_mobile_layout) mobile = JSON.parse(SET.dashboard_mobile_layout);
    } catch (e) {
    }
    if (!desktop.length || !mobile.length) {
      currentLayout = JSON.parse(JSON.stringify(PRESETS.balanced));
    } else {
      var mobileMap = {};
      mobile.forEach(function(item) {
        var mId = item.id === "today" ? "today_plan" : item.id;
        mobileMap[mId] = item;
      });
      currentLayout = desktop.map(function(dItem) {
        var dId = dItem.id === "today" ? "today_plan" : dItem.id;
        var dType = dItem.type === "today" ? "today_plan" : dItem.type || dId;
        var mItem = mobileMap[dId] || {};
        return {
          id: dId,
          type: dType,
          x: dItem.x,
          y: dItem.y,
          w: dItem.w,
          h: dItem.h,
          mx: mItem.mx !== void 0 ? mItem.mx : mItem.x !== void 0 ? mItem.x : dItem.x,
          my: mItem.my !== void 0 ? mItem.my : mItem.y !== void 0 ? mItem.y : dItem.y,
          mw: mItem.mw !== void 0 ? mItem.mw : mItem.w !== void 0 ? mItem.w : dItem.w,
          mh: mItem.mh !== void 0 ? mItem.mh : mItem.h !== void 0 ? mItem.h : dItem.h
        };
      });
    }
    currentLayout = compactAll(currentLayout);
  }
  function getFileIcon(mimetype) {
    var mt = mimetype || "";
    if (mt.startsWith("image/")) return "\u{1F5BC}\uFE0F";
    if (mt === "application/pdf") return "\u{1F4C4}";
    if (mt.startsWith("audio/")) return "\u{1F3B5}";
    if (mt.startsWith("video/")) return "\u{1F3A5}";
    if (mt.startsWith("text/")) return "\u{1F4DD}";
    if (mt.indexOf("zip") !== -1 || mt.indexOf("tar") !== -1 || mt.indexOf("compressed") !== -1) return "\u{1F4E6}";
    return "\u{1F4CE}";
  }
  function renderDeadlinesWidget(id) {
    var wData = id ? widgetsData[id] || {} : {};
    var title = wData.title || "Next deadlines";
    var exams = S.exams.filter(function(e) {
      return daysUntil(e.date) >= 0;
    }).sort(function(a, b) {
      return a.date.localeCompare(b.date);
    });
    var html = "<h3>" + esc(title) + '</h3><div class="card-scroll">';
    if (exams.length) exams.forEach(function(e) {
      html += '<div class="list-item"><div class="grow">' + esc(e.name) + "</div>" + examBadge(daysUntil(e.date)) + "</div>";
    });
    else html += '<div class="muted">Nothing upcoming.</div>';
    html += "</div>";
    return html;
  }
  function parseTime(t) {
    if (!t) return 0;
    var parts = t.split(":");
    return parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
  }
  function renderTodayPlanListHTML(id) {
    var today = todayStr();
    var evs = S.events.filter(function(e) {
      return e.date === today;
    }).sort(function(a, b) {
      return (a.start || "").localeCompare(b.start || "");
    });
    if (!evs.length) {
      return '<div class="muted">Nothing planned today.</div>';
    }
    var now = /* @__PURE__ */ new Date();
    var currentTimeVal = now.getHours() * 60 + now.getMinutes();
    var upcomingHtml = "";
    var pastHtml = "";
    evs.forEach(function(ev) {
      var timeStr = ev.start && ev.end ? ev.start + " \u2013 " + ev.end : "All Day";
      var isPast = false;
      var isHappening = false;
      if (ev.start && ev.end) {
        var startVal = parseTime(ev.start);
        var endVal = parseTime(ev.end);
        if (currentTimeVal >= endVal) {
          isPast = true;
        } else if (currentTimeVal >= startVal && currentTimeVal < endVal) {
          isHappening = true;
        }
      } else {
        isHappening = true;
      }
      var itemStyle = "cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px;";
      if (isPast) {
        itemStyle += "opacity:0.55;";
      }
      if (ev.type === "deadline") {
        itemStyle += "background: rgba(239, 91, 108, 0.15); border-left: 3px solid var(--red); padding-left: 8px;";
      }
      var itemHtml = `<div class="list-item" onclick="showDashboardEventDetails('` + ev.id + `')" style="` + itemStyle + '">';
      itemHtml += '<div class="grow" style="display:flex; align-items:center; gap:6px;' + (isPast ? "text-decoration:line-through; color:var(--text-muted);" : "") + '">';
      if (isHappening) {
        itemHtml += '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--accent); flex-shrink:0;" title="Happening now"></span>';
      }
      if (ev.type === "deadline") {
        itemHtml += '<span class="badge red" style="margin-right: 4px; padding: 1px 4px; font-size: 9px; flex-shrink: 0;">DEADLINE</span>';
      }
      itemHtml += esc(ev.title) + "</div>";
      itemHtml += '<span class="muted" style="font-size:11px;' + (isHappening ? "color:var(--accent); font-weight:600;" : "") + '">' + esc(timeStr) + "</span>";
      itemHtml += "</div>";
      if (isPast) {
        pastHtml += itemHtml;
      } else {
        upcomingHtml += itemHtml;
      }
    });
    var html = "";
    if (upcomingHtml) {
      html += '<div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--accent); letter-spacing: 0.8px; margin: 6px 0 6px 0; flex-shrink:0;">Upcoming &amp; Happening</div>';
      html += upcomingHtml;
    }
    if (pastHtml) {
      var marginTop = upcomingHtml ? "margin-top: 12px;" : "";
      html += '<div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.8px; ' + marginTop + ' margin-bottom: 6px; flex-shrink:0;">Past</div>';
      html += pastHtml;
    }
    return html;
  }
  function showDashboardEventDetails(eventId) {
    if (isEditMode) return;
    var ev = S.events.find((x) => x.id === eventId);
    if (!ev) return;
    document.getElementById("dbEvTitleVal").textContent = ev.title || "Untitled Event";
    var dateVal = document.getElementById("dbEvDateVal");
    if (dateVal && ev.date) {
      var d = /* @__PURE__ */ new Date(ev.date + "T00:00:00");
      if (!isNaN(d.getTime())) {
        dateVal.textContent = fmtShort(d) + " " + d.getFullYear();
      } else {
        dateVal.textContent = ev.date;
      }
    }
    var typeVal = document.getElementById("dbEvTypeVal");
    typeVal.textContent = ev.type || "personal";
    var bg = "var(--border)";
    var color = "var(--text)";
    if (ev.type === "study") {
      bg = "rgba(255, 152, 0, 0.2)";
      color = "#ffa726";
    } else if (ev.type === "class") {
      bg = "rgba(79, 140, 255, 0.2)";
      color = "#29b6f6";
    } else if (ev.type === "exam" || ev.type === "deadline") {
      bg = "rgba(239, 91, 108, 0.2)";
      color = "var(--red)";
    } else if (ev.type === "workout") {
      bg = "rgba(76, 175, 80, 0.2)";
      color = "#66bb6a";
    }
    typeVal.style.background = bg;
    typeVal.style.color = color;
    var timeStr = ev.start && ev.end ? ev.start + " \u2013 " + ev.end : "All Day";
    document.getElementById("dbEvTimeVal").textContent = timeStr;
    var recVal = document.getElementById("dbEvRecVal");
    var recGroup = document.getElementById("dbEvRecGroup");
    if (recVal && recGroup) {
      if (ev.recurrence && ev.recurrence !== "none") {
        recVal.textContent = ev.recurrence;
        recGroup.style.display = "block";
      } else {
        recGroup.style.display = "none";
      }
    }
    var descVal = document.getElementById("dbEvDescVal");
    var descGroup = document.getElementById("dbEvDescGroup");
    if (ev.description) {
      descVal.innerHTML = mdToHtml(ev.description);
      descGroup.style.display = "block";
    } else {
      descGroup.style.display = "none";
    }
    var locVal = document.getElementById("dbEvLocVal");
    var locGroup = document.getElementById("dbEvLocGroup");
    if (ev.location) {
      locVal.textContent = ev.location;
      locGroup.style.display = "block";
    } else {
      locGroup.style.display = "none";
    }
    var editBtn = document.getElementById("dbEvEditBtn");
    editBtn.onclick = function() {
      closeDashboardEventDetailsModal();
      window.navigateToAndEditEvent(ev.id, ev.date);
    };
    document.getElementById("dashboardEventDetailsModal").style.display = "flex";
  }
  function closeDashboardEventDetailsModal() {
    document.getElementById("dashboardEventDetailsModal").style.display = "none";
  }
  function renderTodayPlanWidget(id) {
    var wData = id ? widgetsData[id] || {} : {};
    var title = wData.title || "Today\u2019s plan";
    return "<h3>" + esc(title) + '</h3><div class="card-scroll">' + renderTodayPlanListHTML(id) + "</div>";
  }
  function renderHabitsWidget(id) {
    var wData = id ? widgetsData[id] || {} : {};
    var title = wData.title || "Habits today";
    var today = todayStr();
    var html = "<h3>" + esc(title) + '</h3><div class="card-scroll">';
    if (S.habits.length) S.habits.forEach(function(h) {
      var on = !!habitSet[h.id + "|" + today];
      html += '<div class="list-item"><span class="hcheck' + (on ? " on" : "") + `" onclick="toggleHabit('` + h.id + "','" + today + `')">` + (on ? "\u2713" : "") + '</span><div class="grow">' + esc(h.name) + '</div><span class="badge ' + (streak(h.id) > 0 ? "green" : "gray") + '">' + streak(h.id) + "\u{1F525}</span></div>";
    });
    else html += '<div class="muted">No habits yet.</div>';
    html += "</div>";
    return html;
  }
  function renderWorkoutsWidget(id) {
    var wData = id ? widgetsData[id] || {} : {};
    var title = wData.title || "Training this week";
    var t = weekTotals(0);
    var html = "<h3>" + esc(title) + '</h3><div class="wstats"><div class="stat"><div class="v">' + t.count + '</div><div class="l">sessions</div></div><div class="stat"><div class="v">' + Math.round(t.runKm * 10) / 10 + '</div><div class="l">run km</div></div><div class="stat"><div class="v">' + Math.round(t.bikeKm * 10) / 10 + '</div><div class="l">bike km</div></div><div class="stat"><div class="v">' + Math.round(t.min) + '</div><div class="l">min</div></div></div>';
    return html;
  }
  function renderTasksWidget(id) {
    var wData = id ? widgetsData[id] || {} : {};
    var title = wData.title || "Open to-dos";
    var open = S.tasks.filter(function(x) {
      return !x.done && !x.parent_id;
    });
    var html = "<h3>" + esc(title) + '</h3><div class="card-scroll">';
    if (open.length) open.forEach(function(o) {
      html += '<div class="checkbox-task"><span class="hcheck' + (o.done ? " on" : "") + `" onclick="toggleTask('` + o.id + `',true)">` + (o.done ? "\u2713" : "") + "</span><span>" + esc(o.name) + "</span></div>";
    });
    else html += '<div class="muted">All clear \u2728</div>';
    html += "</div>";
    return html;
  }
  function renderShortcutsWidget(id) {
    var wData = id ? widgetsData[id] || {} : {};
    var title = wData.title || "Shortcuts";
    var html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><h3 style="margin:0;">' + esc(title) + '</h3><button class="btn ghost small" onclick="addShortcut()" style="padding:2px 8px; font-size:12px;">+ Add</button></div><div class="card-scroll" style="display:flex; flex-wrap:wrap; gap:12px; justify-content:flex-start; align-content:flex-start;">';
    if (S.shortcuts && S.shortcuts.length) {
      var disabled = SET && SET.disabled_shortcuts ? SET.disabled_shortcuts.split(",") : [];
      var order = SET && SET.shortcut_order ? SET.shortcut_order.split(",") : [];
      var sorted = S.shortcuts.slice().sort(function(a, b) {
        var ia = order.indexOf(a.id);
        var ib = order.indexOf(b.id);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        return ia - ib;
      });
      sorted.forEach(function(s) {
        if (disabled.indexOf(s.id) !== -1) return;
        var domain = "";
        try {
          domain = new URL(s.url).hostname;
        } catch (e) {
        }
        var icon = s.icon || "https://www.google.com/s2/favicons?domain=" + domain + "&sz=64";
        html += '<a href="' + esc(s.url) + '" target="_blank" class="shortcut-btn" style="width:70px; height:70px; gap:4px; margin:0;"><img src="' + esc(icon) + '" alt="" style="width:28px; height:28px;"><div class="name" style="font-size:10px;">' + esc(s.name) + "</div></a>";
      });
    } else {
      html += '<div class="muted">No shortcuts.</div>';
    }
    html += "</div>";
    return html;
  }
  function renderQuickAddWidget(id) {
    var wData = id ? widgetsData[id] || {} : {};
    var title = wData.title || "Quick Add";
    var today = todayStr();
    var cats = getTaskCategories ? getTaskCategories() : [];
    var catOptions = '<option value="">Category (opt.)</option>';
    cats.forEach(function(c) {
      catOptions += '<option value="' + esc(c.name) + '">' + esc(c.name) + "</option>";
    });
    var html = "<h3>" + esc(title) + `</h3><div class="quick-add-form" style="display:flex; flex-direction:column; gap:8px;">  <select class="qa-type-select" onchange="changeQuickAddType('` + id + `', this.value)" style="padding:6px; font-size:13px; border-radius:6px; border:1px solid var(--border); background:var(--panel2); color:var(--text); width:100%;">    <option value="event" selected>Event</option>    <option value="task">Task</option>    <option value="habit">Habit</option>    <option value="workout">Workout</option>    <option value="exam">Exam</option>  </select>  <!-- Fields for Event -->  <div class="qa-fields-group qa-fields-event" style="display:flex; flex-direction:column; gap:6px;">    <input class="qa-event-title" placeholder="Event Title" style="padding:6px; font-size:13px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    <div style="display:flex; gap:6px;">      <input class="qa-event-date" type="date" value="` + today + '" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">      <input class="qa-event-start" type="time" style="padding:6px; font-size:13px; width:90px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    </div>  </div>  <!-- Fields for Task -->  <div class="qa-fields-group qa-fields-task" style="display:none; flex-direction:column; gap:6px;">    <input class="qa-task-name" placeholder="Task Name" style="padding:6px; font-size:13px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    <div style="display:flex; gap:6px;">      <select class="qa-task-category" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' + catOptions + '</select>      <input class="qa-task-due" type="date" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    </div>  </div>  <!-- Fields for Habit -->  <div class="qa-fields-group qa-fields-habit" style="display:none; flex-direction:column; gap:6px;">    <input class="qa-habit-name" placeholder="Habit Name" style="padding:6px; font-size:13px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">  </div>  <!-- Fields for Workout -->  <div class="qa-fields-group qa-fields-workout" style="display:none; flex-direction:column; gap:6px;">    <div style="display:flex; gap:6px;">      <select class="qa-workout-type" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">        <option value="run">\u{1F3C3} Run</option>        <option value="bike">\u{1F6B4} Bike</option>        <option value="gym">\u{1F3CB}\uFE0F Gym</option>      </select>      <input class="qa-workout-date" type="date" value="' + today + '" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    </div>    <div style="display:flex; gap:6px;">      <input class="qa-workout-dur" type="number" placeholder="Min" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">      <input class="qa-workout-dist" type="number" step="0.1" placeholder="km (opt)" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    </div>  </div>  <!-- Fields for Exam -->  <div class="qa-fields-group qa-fields-exam" style="display:none; flex-direction:column; gap:6px;">    <input class="qa-exam-name" placeholder="Exam/Deadline Name" style="padding:6px; font-size:13px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    <div style="display:flex; gap:6px;">      <input class="qa-exam-date" type="date" value="' + today + `" style="padding:6px; font-size:13px; flex:1.5; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">      <input class="qa-exam-ects" type="number" step="0.5" placeholder="ECTS" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    </div>  </div>  <button class="btn small" onclick="submitQuickAdd('` + id + `')" style="background:var(--accent); color:#fff; border-color:var(--accent); padding:6px; font-size:13px; margin-top:4px;">Add Item</button></div>`;
    return html;
  }
  function renderRecentFilesWidget(id) {
    var wData = id ? widgetsData[id] || {} : {};
    var title = wData.title || "Recent Files";
    var html = "<h3>" + esc(title) + '</h3><div class="card-scroll">';
    var files = (S.files || []).slice();
    files.sort(function(a, b) {
      return (b.uploaded || 0) - (a.uploaded || 0);
    });
    var recent = files.slice(0, 5);
    if (recent.length) {
      recent.forEach(function(f) {
        var isPreviewable = f.mimetype && (f.mimetype.startsWith("image/") || f.mimetype === "application/pdf" || f.mimetype.startsWith("audio/") || f.mimetype.startsWith("video/"));
        var icon = getFileIcon(f.mimetype);
        var iconHtml = '<span style="font-size: 16px; margin-right: 6px;">' + icon + "</span>";
        var nameHtml = "";
        if (isPreviewable) {
          nameHtml = `<span class="file-link" onclick="previewFile('` + f.id + `')" style="font-weight:600; cursor:pointer; display:inline-flex; align-items:center;">` + iconHtml + esc(f.filename || "Unnamed") + "</span>";
        } else {
          nameHtml = '<span style="display:inline-flex; align-items:center; font-weight:600;">' + iconHtml + esc(f.filename || "Unnamed") + "</span>";
        }
        html += '<div class="list-item" style="display:flex; justify-content:space-between; align-items:center; padding: 4px 0;"><div class="grow" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">' + nameHtml + '</div><div class="file-actions" style="display:flex; gap:4px; flex-shrink:0;">';
        if (isPreviewable) {
          html += `<button class="btn small ghost" onclick="previewFile('` + f.id + `')" style="padding:2px 6px; font-size:11px;">View</button>`;
        }
        html += '<a class="btn small ghost" href="/api/files/' + f.id + '/download" style="text-decoration:none; padding:2px 6px; font-size:11px;">Download</a></div></div>';
      });
    } else {
      html += '<div class="muted">No files uploaded yet.</div>';
    }
    html += "</div>";
    return html;
  }
  function renderQuickNotesWidget(id) {
    var wData = widgetsData[id] || {};
    var title = wData.title || "Notepad";
    var font = wData.font || "sans";
    var textVal = wData.text || "";
    var fontFamily = "inherit";
    if (font === "serif") fontFamily = "Georgia, serif";
    else if (font === "mono") fontFamily = "Courier New, monospace";
    var html = '<div style="display:flex; flex-direction:column; height:100%; box-sizing:border-box;">  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-shrink:0;">    <h3 style="margin:0;">' + esc(title) + `</h3>    <select onchange="changeNoteFont('` + id + `', this.value)" style="padding:2px; font-size:11px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">      <option value="sans"` + (font === "sans" ? " selected" : "") + '>sans</option>      <option value="serif"' + (font === "serif" ? " selected" : "") + '>serif</option>      <option value="mono"' + (font === "mono" ? " selected" : "") + `>mono</option>    </select>  </div>  <textarea class="note-textarea" oninput="saveNoteText('` + id + `', this.value)" placeholder="Write something..." style="flex-grow:1; border:none; background:transparent; color:var(--text); resize:none; font-family:` + fontFamily + '; outline:none; font-size:14px; padding:0; box-sizing:border-box;">' + esc(textVal) + "</textarea></div>";
    return html;
  }
  function renderAnalyticsWidget(id) {
    var wData = widgetsData[id] || {};
    var metric = wData.metric || "study_hours";
    var customTitle = wData.title;
    var title = customTitle || {
      "study_hours": "Study Hours",
      "workouts": "Workouts Count",
      "habits": "Habit Check-ins",
      "run_km": "Running (km)",
      "cycle_km": "Cycling (km)"
    }[metric] || "Analytics";
    var months = [];
    var now = /* @__PURE__ */ new Date();
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + "-" + z(d.getMonth() + 1), label: MONTHS[d.getMonth()] });
    }
    var values = {};
    months.forEach(function(m) {
      values[m.key] = 0;
    });
    if (metric === "workouts") {
      S.workouts.forEach(function(w) {
        var k = (w.date || "").slice(0, 7);
        if (k in values) values[k]++;
      });
    } else if (metric === "run_km") {
      S.workouts.forEach(function(w) {
        var k = (w.date || "").slice(0, 7);
        if (w.type === "run" && k in values) values[k] += w.dist || 0;
      });
    } else if (metric === "cycle_km") {
      S.workouts.forEach(function(w) {
        var k = (w.date || "").slice(0, 7);
        if (w.type === "bike" && k in values) values[k] += w.dist || 0;
      });
    } else if (metric === "study_hours") {
      S.events.forEach(function(e) {
        if (e.type !== "study" || !e.start || !e.end) return;
        var h = parseInt(e.end, 10) - parseInt(e.start, 10) + ((parseInt(e.end.slice(3), 10) || 0) - (parseInt(e.start.slice(3), 10) || 0)) / 60;
        if (h <= 0) return;
        var k = (e.date || "").slice(0, 7);
        if (k in values) values[k] += h;
      });
    } else if (metric === "habits") {
      S.habit_log.forEach(function(l) {
        var k = (l.date || "").slice(0, 7);
        if (k in values) values[k]++;
      });
    }
    var chartValues = months.map(function(m) {
      return values[m.key];
    });
    var max = Math.max.apply(null, chartValues.concat([1]));
    var colorClass = "";
    if (metric === "study_hours") colorClass = "orange";
    else if (metric === "run_km" || metric === "cycle_km") colorClass = "green";
    var isDecimal = metric === "run_km" || metric === "cycle_km" || metric === "study_hours";
    var ch = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-shrink:0;">  <h3 style="margin:0;">' + esc(title) + `</h3>  <select onchange="changeAnalyticsMetric('` + id + `', this.value)" style="padding:2px; font-size:11px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">    <option value="study_hours"` + (metric === "study_hours" ? " selected" : "") + '>study</option>    <option value="workouts"' + (metric === "workouts" ? " selected" : "") + '>workouts</option>    <option value="habits"' + (metric === "habits" ? " selected" : "") + '>habits</option>    <option value="run_km"' + (metric === "run_km" ? " selected" : "") + '>run km</option>    <option value="cycle_km"' + (metric === "cycle_km" ? " selected" : "") + ">bike km</option>  </select></div>";
    ch += '<div class="chart" style="flex-grow:1; display:flex; align-items:flex-end; gap:6px; padding:18px 4px 0; box-sizing:border-box; height: 100px;">';
    for (var i = 0; i < chartValues.length; i++) {
      var val = chartValues[i];
      var pc = Math.round(val / max * 100);
      var displayVal = isDecimal ? Math.round(val * 10) / 10 : Math.round(val);
      ch += '  <div class="bar ' + colorClass + '" style="height:' + pc + '%; flex:1; position:relative; min-height:2px; border-radius:5px 5px 0 0;">    <span style="position:absolute; top:-17px; left:-6px; right:-6px; text-align:center; font-size:9px; color:var(--muted);">' + (val ? displayVal : "") + "</span>  </div>";
    }
    ch += "</div>";
    ch += '<div class="chartlabels" style="display:flex; gap:6px; margin-top:4px; flex-shrink:0;">';
    for (var i = 0; i < months.length; i++) {
      ch += '  <div style="flex:1; text-align:center; font-size:9px; color:var(--muted);">' + months[i].label + "</div>";
    }
    ch += "</div>";
    return '<div style="display:flex; flex-direction:column; height:100%; box-sizing:border-box;">' + ch + "</div>";
  }
  function renderCustomTextWidget(id) {
    var wData = widgetsData[id] || {};
    var title = wData.title || "Custom Text";
    var textVal = wData.text || "*No text yet. Click 'Gear' in Edit Mode to edit.*";
    var html = '<h3 style="margin:0 0 8px 0; flex-shrink:0;">' + esc(title) + '</h3><div class="card-scroll" style="flex-grow:1; overflow-y:auto; font-size:14px; line-height:1.5;">' + mdToHtml(textVal) + "</div>";
    return '<div style="display:flex; flex-direction:column; height:100%; box-sizing:border-box;">' + html + "</div>";
  }
  function renderGreetingWidget(id) {
    var wData = widgetsData[id] || {};
    var title = wData.title;
    var now = /* @__PURE__ */ new Date();
    var timeStr = z(now.getHours()) + ":" + z(now.getMinutes());
    var dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var dayName = dayNames[now.getDay()];
    var dateStr = dayName + ", " + fmtShort(now) + " " + now.getFullYear();
    var hr = now.getHours();
    var greetingText = hr < 6 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    var titleHtml = title ? '<div style="font-size:11px; text-transform:uppercase; color:var(--muted); letter-spacing:.06em; margin-bottom:4px;">' + esc(title) + "</div>" : "";
    var html = '<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; text-align:center; box-sizing:border-box;">' + titleHtml + '  <div class="greeting-time" style="font-size:32px; font-weight:700; color:var(--text); line-height:1.2;">' + timeStr + '</div>  <div class="greeting-text" style="font-size:16px; font-weight:600; color:var(--accent); margin: 4px 0;">' + greetingText + ' \u{1F44B}</div>  <div class="greeting-date" style="font-size:12px; color:var(--text-muted);">' + dateStr + "</div></div>";
    return html;
  }
  function getCardHTML(type, id) {
    if (type === "deadlines") return renderDeadlinesWidget(id);
    if (type === "today" || type === "today_plan") return renderTodayPlanWidget(id);
    if (type === "habits") return renderHabitsWidget(id);
    if (type === "workouts") return renderWorkoutsWidget(id);
    if (type === "tasks") return renderTasksWidget(id);
    if (type === "shortcuts") return renderShortcutsWidget(id);
    if (type === "quick_add") return renderQuickAddWidget(id);
    if (type === "recent_files") return renderRecentFilesWidget(id);
    if (type === "quick_notes") return renderQuickNotesWidget(id);
    if (type === "analytics") return renderAnalyticsWidget(id);
    if (type === "custom_text") return renderCustomTextWidget(id);
    if (type === "greeting") return renderGreetingWidget(id);
    return "";
  }
  function renderCustomizerPanelHTML() {
    var html = "";
    html += '<div class="card db-customizer" style="margin-bottom: 20px; padding: 20px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel2); box-shadow: 0 4px 20px rgba(0,0,0,0.15);">';
    html += '<div style="display: flex; flex-direction: column; gap: 16px;">';
    html += '<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 12px;">';
    html += '<span style="font-weight: 700; font-size: 16px; display: flex; align-items: center; gap: 8px;">\u{1F3A8} Dashboard Customizer</span>';
    html += '<span style="font-size: 12px; color: var(--text-muted);">Drag widgets to position, drag bottom-right corner to resize.</span>';
    html += "</div>";
    html += '<div style="display: flex; flex-wrap: wrap; gap: 24px;">';
    html += '<div style="flex: 1.5; min-width: 250px;">';
    html += '<h4 style="margin: 0 0 8px 0; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Presets</h4>';
    html += '<div style="display: flex; gap: 8px; flex-wrap: wrap;">';
    html += `<button class="btn ghost small" onclick="applyPreset('balanced')">Balanced</button>`;
    html += `<button class="btn ghost small" onclick="applyPreset('academic')">Academic Focus</button>`;
    html += `<button class="btn ghost small" onclick="applyPreset('active')">Active/Healthy</button>`;
    html += `<button class="btn ghost small" onclick="applyPreset('minimalist')">Minimalist</button>`;
    html += "</div>";
    html += "</div>";
    html += '<div style="flex: 2; min-width: 300px;">';
    html += '<h4 style="margin: 0 0 8px 0; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Toggle Widgets</h4>';
    html += '<div style="display: flex; gap: 12px; flex-wrap: wrap;">';
    ALL_WIDGETS.forEach(function(w) {
      var active = currentLayout.some(function(item) {
        return item.id === w.id || item.type === w.id;
      });
      html += `<div onclick="toggleWidgetPresence('` + w.id + "', " + !active + ')" style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; background: var(--panel); padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); user-select: none;">';
      html += '<span class="hcheck' + (active ? " on" : "") + '">' + (active ? "\u2713" : "") + "</span>";
      html += "<span>" + w.name + "</span>";
      html += "</div>";
    });
    html += "</div>";
    html += "</div>";
    html += '<div style="flex: 1.5; min-width: 250px;">';
    html += '<h4 style="margin: 0 0 8px 0; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">Add Widget Instance</h4>';
    html += '<div style="display: flex; gap: 8px;">';
    html += '  <select id="addWidgetType" style="padding: 6px; font-size: 13px; border-radius: 6px; border: 1px solid var(--border); background: var(--panel); color: var(--text); flex: 1;">';
    html += '    <option value="quick_notes">Notepad</option>';
    html += '    <option value="analytics">Mini Chart</option>';
    html += '    <option value="custom_text">Custom Text</option>';
    html += '    <option value="greeting">Clock</option>';
    html += '    <option value="deadlines">Deadlines</option>';
    html += `    <option value="today_plan">Today's Plan</option>`;
    html += '    <option value="habits">Habits</option>';
    html += '    <option value="workouts">Workouts</option>';
    html += '    <option value="tasks">To-Dos</option>';
    html += '    <option value="shortcuts">Shortcuts</option>';
    html += '    <option value="quick_add">Quick Add</option>';
    html += '    <option value="recent_files">Recent Files</option>';
    html += "  </select>";
    html += '  <button class="btn small" onclick="addNewWidgetInstance()" style="background: var(--accent); color: #fff; border-color: var(--accent);">Add</button>';
    html += "</div>";
    html += "</div>";
    html += "</div>";
    var showShortcuts = SET ? SET.show_shortcuts !== "0" : true;
    html += '<div style="flex: 1 1 100%; border-top: 1px solid var(--border); padding-top: 16px; margin-top: 8px;">';
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">';
    html += '<h4 style="margin: 0; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">\u{1F517} Manage Shortcuts</h4>';
    html += '<div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">';
    html += '<div onclick="toggleShowShortcuts()" style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; user-select: none;">';
    html += '<span id="showShortcutsToggle" class="hcheck' + (showShortcuts ? " on" : "") + '">' + (showShortcuts ? "\u2713" : "") + "</span>";
    html += "<span>Show standalone row</span>";
    html += "</div>";
    html += '<button class="btn small" onclick="addShortcut()" style="background: var(--accent); color: #fff; border-color: var(--accent); padding: 4px 12px; font-size: 12px; margin-left: 4px;">+ Add Shortcut</button>';
    html += "</div>";
    html += "</div>";
    html += '<div style="display: flex; flex-direction: column; gap: 6px; max-height: 250px; overflow-y: auto; padding-right: 4px;">';
    if (S.shortcuts && S.shortcuts.length) {
      var disabled = SET && SET.disabled_shortcuts ? SET.disabled_shortcuts.split(",") : [];
      var order = SET && SET.shortcut_order ? SET.shortcut_order.split(",") : [];
      var sorted = S.shortcuts.slice().sort(function(a, b) {
        var ia = order.indexOf(a.id);
        var ib = order.indexOf(b.id);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        return ia - ib;
      });
      sorted.forEach(function(s) {
        var isOff = disabled.indexOf(s.id) !== -1;
        html += `<div class="list-item" draggable="true" ondragstart="dragShortcutStart(event,'` + s.id + `')" ondragover="dragShortcutOver(event)" ondrop="dropShortcut(event,'` + s.id + `')" ondragend="dragShortcutEnd(event)" style="cursor:grab; display:flex; align-items:center; gap:10px; background:var(--panel); padding:8px 12px; border-radius:6px; border:1px solid var(--border); margin:0;">`;
        html += '<span class="muted" style="cursor:grab; padding-right:4px; user-select:none;">\u2630</span>';
        html += '<div class="grow" style="flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(s.name) + ' <span class="muted" style="font-size:11px;">(' + esc(s.url) + ")</span></div>";
        html += `<div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="toggleItem('` + s.id + `')">`;
        html += '<span style="font-size:11px; color:var(--text-muted); user-select:none;">Active</span>';
        html += '<span class="hcheck' + (isOff ? "" : " on") + '">' + (isOff ? "" : "\u2713") + "</span>";
        html += "</div>";
        html += `<button class="btn danger small" onclick="delRow('shortcuts', '` + s.id + `')" style="padding:2px 8px; font-size:11px; margin-left:8px;">Remove</button>`;
        html += "</div>";
      });
    } else {
      html += '<div class="muted" style="font-size:13px; padding:8px; text-align:center;">No shortcuts added yet. Click "+ Add Shortcut" above to get started.</div>';
    }
    html += "</div>";
    html += "</div>";
    html += '<div style="display: flex; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--border); padding-top: 12px; margin-top: 4px;">';
    html += '<button class="btn ghost small" onclick="cancelCustomize()">Cancel</button>';
    html += '<button class="btn small" onclick="saveCustomize()" style="background: var(--accent); color: #fff; border-color: var(--accent);">Save Changes</button>';
    html += "</div>";
    html += "</div>";
    html += "</div>";
    return html;
  }
  function hasCollision(item, other, isMobile) {
    if (isMobile) {
      return item.mx < other.mx + other.mw && item.mx + item.mw > other.mx && item.my < other.my + other.mh && item.my + item.mh > other.my;
    } else {
      return item.x < other.x + other.w && item.x + item.w > other.x && item.y < other.y + other.h && item.y + item.h > other.y;
    }
  }
  function compactLayout(layout, activeId, isMobile) {
    var sorted = layout.slice().sort(function(a, b) {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      var ay = isMobile ? a.my : a.y;
      var by = isMobile ? b.my : b.y;
      if (ay !== by) return ay - by;
      var axVal = isMobile ? a.mx : a.x;
      var bxVal = isMobile ? b.mx : b.x;
      return axVal - bxVal;
    });
    var placed = [];
    sorted.forEach(function(item) {
      var copy = Object.assign({}, item);
      if (copy.id === activeId) {
        placed.push(copy);
        return;
      }
      while (placed.some(function(other) {
        return hasCollision(copy, other, isMobile);
      })) {
        if (isMobile) {
          copy.my++;
        } else {
          copy.y++;
        }
      }
      placed.push(copy);
    });
    var compacted = [];
    var sortedForCompaction = placed.slice().sort(function(a, b) {
      if (a.id === activeId) return -1;
      if (b.id === activeId) return 1;
      var ay = isMobile ? a.my : a.y;
      var by = isMobile ? b.my : b.y;
      if (ay !== by) return ay - by;
      var axVal = isMobile ? a.mx : a.x;
      var bxVal = isMobile ? b.mx : b.x;
      return axVal - bxVal;
    });
    sortedForCompaction.forEach(function(item) {
      var copy = Object.assign({}, item);
      if (copy.id === activeId) {
        compacted.push(copy);
        return;
      }
      if (isMobile) {
        while (copy.my > 1) {
          copy.my--;
          if (compacted.some(function(other) {
            return hasCollision(copy, other, isMobile);
          })) {
            copy.my++;
            break;
          }
        }
      } else {
        while (copy.y > 1) {
          copy.y--;
          if (compacted.some(function(other) {
            return hasCollision(copy, other, isMobile);
          })) {
            copy.y++;
            break;
          }
        }
      }
      compacted.push(copy);
    });
    return compacted;
  }
  function compactAll(layout) {
    var withDesktop = compactLayout(layout, null, false);
    var withBoth = compactLayout(withDesktop, null, true);
    return withBoth;
  }
  function startClockUpdates() {
    if (greetingInterval) clearInterval(greetingInterval);
    greetingInterval = setInterval(function() {
      var cards = document.querySelectorAll(".card[data-id]");
      cards.forEach(function(card) {
        var id = card.dataset.id;
        var item = currentLayout.find((x) => x.id === id);
        if (item) {
          var type = item.type || item.id;
          if (type === "greeting") {
            var now = /* @__PURE__ */ new Date();
            var timeStr = z(now.getHours()) + ":" + z(now.getMinutes());
            var dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            var dayName = dayNames[now.getDay()];
            var dateStr = dayName + ", " + fmtShort(now) + " " + now.getFullYear();
            var hr = now.getHours();
            var greetingText = hr < 6 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
            var timeEl = card.querySelector(".greeting-time");
            var textEl = card.querySelector(".greeting-text");
            var dateEl = card.querySelector(".greeting-date");
            if (timeEl) timeEl.textContent = timeStr;
            if (textEl) textEl.textContent = greetingText + " \u{1F44B}";
            if (dateEl) dateEl.textContent = dateStr;
          } else if (type === "today_plan") {
            var scrollEl = card.querySelector(".card-scroll");
            if (scrollEl) {
              scrollEl.innerHTML = renderTodayPlanListHTML(id);
            }
          }
        }
      });
    }, 1e4);
  }
  function renderDashboard() {
    var now = /* @__PURE__ */ new Date(), hr = now.getHours();
    var g = hr < 6 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    document.getElementById("greeting").textContent = g + " \u{1F44B}";
    document.getElementById("headerDate").textContent = fmtShort(now) + " " + now.getFullYear();
    try {
      widgetsData = JSON.parse(SET && SET.dashboard_widgets_data ? SET.dashboard_widgets_data : "{}");
    } catch (e) {
      widgetsData = {};
    }
    if (!isEditMode) {
      initLayoutAndStyle();
    }
    var panel = document.getElementById("customizerPanel");
    if (panel) {
      if (isEditMode) {
        panel.style.display = "block";
        panel.innerHTML = renderCustomizerPanelHTML();
      } else {
        panel.style.display = "none";
        panel.innerHTML = "";
      }
    }
    var container = document.getElementById("dashCards");
    if (container) {
      container.className = "dashboard-grid";
      container.setAttribute("data-customizing", isEditMode ? "true" : "false");
    }
    var html = "";
    currentLayout.forEach(function(item) {
      var cardContent = getCardHTML(item.type || item.id, item.id);
      if (!cardContent) return;
      var wData = widgetsData[item.id] || {};
      var borderColor = wData.border_color;
      var borderStyle = borderColor ? "border-color: " + borderColor + " !important; " : "";
      var styleStr = "--x: " + item.x + "; --w: " + item.w + "; --y: " + item.y + "; --h: " + item.h + "; --mx: " + item.mx + "; --mw: " + item.mw + "; --my: " + item.my + "; --mh: " + item.mh + "; grid-column: var(--x) / span var(--w); grid-row: var(--y) / span var(--h); " + borderStyle;
      html += '<div class="card" data-id="' + item.id + '" style="' + styleStr + '">';
      if (isEditMode) {
        html += `<div class="card-drag-handle" onmousedown="startCardDrag(event, '` + item.id + `')" ontouchstart="startCardDrag(event, '` + item.id + `')"></div>`;
        html += `<button class="card-settings-btn" onclick="openWidgetSettings(event, '` + item.id + `')" style="position: absolute; top: 6px; right: 6px; z-index: 12; background: var(--panel2); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; cursor: pointer; color: var(--text); font-size: 11px;">\u2699\uFE0F</button>`;
        html += `<div class="card-resize-handle" onmousedown="startResize(event, '` + item.id + `')" ontouchstart="startResize(event, '` + item.id + `')"></div>`;
      }
      html += cardContent;
      html += "</div>";
    });
    if (container) {
      container.innerHTML = html;
    }
    var shortcutHtml = "";
    var showShortcuts = SET ? SET.show_shortcuts !== "0" : true;
    if (showShortcuts && S.shortcuts) {
      var disabled = SET && SET.disabled_shortcuts ? SET.disabled_shortcuts.split(",") : [];
      var order = SET && SET.shortcut_order ? SET.shortcut_order.split(",") : [];
      var sorted = S.shortcuts.slice().sort(function(a, b) {
        var ia = order.indexOf(a.id);
        var ib = order.indexOf(b.id);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        return ia - ib;
      });
      sorted.forEach(function(s) {
        if (disabled.indexOf(s.id) !== -1) return;
        var domain = "";
        try {
          domain = new URL(s.url).hostname;
        } catch (e) {
        }
        var icon = s.icon || "https://www.google.com/s2/favicons?domain=" + domain + "&sz=64";
        shortcutHtml += '<a href="' + esc(s.url) + '" target="_blank" class="shortcut-btn"><img src="' + esc(icon) + '" alt=""><div class="name">' + esc(s.name) + "</div></a>";
      });
    }
    var shortcutsEl = document.getElementById("dashShortcuts");
    if (shortcutsEl) {
      var hasShortcutsWidget = currentLayout.some((x) => (x.type || x.id) === "shortcuts");
      if (hasShortcutsWidget) {
        shortcutsEl.innerHTML = "";
        shortcutsEl.style.display = "none";
      } else {
        shortcutsEl.innerHTML = shortcutHtml;
        shortcutsEl.style.display = shortcutHtml ? "flex" : "none";
      }
    }
    startClockUpdates();
  }
  async function addShortcut(refresh2) {
    var url = prompt("Enter website URL (e.g. https://github.com):");
    if (!url) return;
    if (!url.startsWith("http")) url = "https://" + url;
    var name = prompt("Enter shortcut name:");
    if (!name) {
      try {
        name = new URL(url).hostname.replace(/^www\./, "");
      } catch (e) {
        name = url;
      }
    }
    await api("POST", "/api/shortcuts", { name, url, icon: "" });
    await refresh2();
  }
  async function toggleShowShortcuts(refresh2) {
    var el = document.getElementById("showShortcutsToggle");
    var show = el.tagName === "INPUT" ? el.checked : !el.classList.contains("on");
    await api("POST", "/api/settings", { show_shortcuts: show ? "1" : "0" });
    await refresh2();
  }
  async function toggleItem(id, refresh2) {
    var disabled = SET && SET.disabled_shortcuts ? SET.disabled_shortcuts.split(",").filter(Boolean) : [];
    var idx = disabled.indexOf(id);
    if (idx === -1) disabled.push(id);
    else disabled.splice(idx, 1);
    await api("POST", "/api/settings", { disabled_shortcuts: disabled.join(",") });
    await refresh2();
  }
  async function reorderShortcut(dragId, dropId, refresh2) {
    if (dragId === dropId) return;
    var order = SET && SET.shortcut_order ? SET.shortcut_order.split(",").filter(Boolean) : S.shortcuts.map(function(s) {
      return s.id;
    });
    S.shortcuts.forEach(function(s) {
      if (order.indexOf(s.id) === -1) order.push(s.id);
    });
    var dragIdx = order.indexOf(dragId);
    if (dragIdx > -1) order.splice(dragIdx, 1);
    var dropIdx = order.indexOf(dropId);
    if (dropIdx > -1) order.splice(dropIdx, 0, dragId);
    await api("POST", "/api/settings", { shortcut_order: order.join(",") });
    await refresh2();
  }
  function toggleEditMode() {
    isEditMode = !isEditMode;
    var btn = document.getElementById("customizeBtn");
    if (btn) {
      if (isEditMode) {
        btn.classList.add("active");
        btn.textContent = "Close Customizer";
        initLayoutAndStyle();
      } else {
        btn.classList.remove("active");
        btn.textContent = "\u2699\uFE0F Customize";
      }
    }
    renderDashboard();
  }
  function cancelCustomize() {
    isEditMode = false;
    var btn = document.getElementById("customizeBtn");
    if (btn) {
      btn.classList.remove("active");
      btn.textContent = "\u2699\uFE0F Customize";
    }
    renderDashboard();
  }
  async function saveCustomize() {
    var payload = {
      dashboard_desktop_layout: JSON.stringify(currentLayout.map(function(item) {
        return { id: item.id, type: item.type, x: item.x, y: item.y, w: item.w, h: item.h };
      })),
      dashboard_mobile_layout: JSON.stringify(currentLayout.map(function(item) {
        return { id: item.id, type: item.type, x: item.mx, y: item.my, w: item.mw, h: item.mh };
      }))
    };
    await api("POST", "/api/settings", payload);
    isEditMode = false;
    var btn = document.getElementById("customizeBtn");
    if (btn) {
      btn.classList.remove("active");
      btn.textContent = "\u2699\uFE0F Customize";
    }
    if (window.refreshApp) {
      await window.refreshApp();
    } else {
      renderDashboard();
    }
  }
  function applyPreset(name) {
    if (PRESETS[name]) {
      currentLayout = JSON.parse(JSON.stringify(PRESETS[name]));
      currentLayout = compactAll(currentLayout);
      renderDashboard();
    }
  }
  function toggleWidgetPresence(id, checked) {
    if (checked) {
      if (!currentLayout.some((x) => x.id === id || x.type === id)) {
        var defaultItem = PRESETS.balanced.find((x) => x.id === id);
        if (!defaultItem && id === "today_plan") {
          defaultItem = PRESETS.balanced.find((x) => x.id === "today");
        }
        if (defaultItem) {
          var copy = JSON.parse(JSON.stringify(defaultItem));
          if (copy.id === "today") {
            copy.id = "today_plan";
            copy.type = "today_plan";
          }
          currentLayout.push(copy);
        } else {
          currentLayout.push({ id, type: id, x: 1, y: 5, w: 6, h: 2, mx: 1, my: 9, mw: 6, mh: 2 });
        }
      }
    } else {
      currentLayout = currentLayout.filter((x) => x.id !== id && x.type !== id && x.id !== (id === "today_plan" ? "today" : ""));
    }
    currentLayout = compactAll(currentLayout);
    renderDashboard();
  }
  function startCardDrag(e, id) {
    if (!isEditMode) return;
    if (e.target.closest("button, input, select, textarea")) return;
    e.preventDefault();
    var isTouch = e.type === "touchstart";
    var startX = isTouch ? e.touches[0].clientX : e.clientX;
    var startY = isTouch ? e.touches[0].clientY : e.clientY;
    var card = document.querySelector(`.card[data-id="${id}"]`);
    var container = document.getElementById("dashCards");
    if (!card || !container) return;
    var containerRect = container.getBoundingClientRect();
    var startRect = card.getBoundingClientRect();
    var grabX = startX - startRect.left;
    var grabY = startY - startRect.top;
    var itemIndex = currentLayout.findIndex((x) => x.id === id);
    if (itemIndex === -1) return;
    var item = currentLayout[itemIndex];
    var isMobile = window.innerWidth <= 768;
    var colWidth = containerRect.width / (isMobile ? 6 : 12);
    var rowHeight = 150 + (isMobile ? 12 : 16);
    var placeholder = document.createElement("div");
    placeholder.className = "card-placeholder";
    if (isMobile) {
      placeholder.style.gridColumn = `${item.mx} / span ${item.mw}`;
      placeholder.style.gridRow = `${item.my} / span ${item.mh}`;
    } else {
      placeholder.style.gridColumn = `${item.x} / span ${item.w}`;
      placeholder.style.gridRow = `${item.y} / span ${item.h}`;
    }
    container.appendChild(placeholder);
    card.classList.add("dragging");
    card.style.position = "absolute";
    card.style.zIndex = "1000";
    card.style.width = startRect.width + "px";
    card.style.height = startRect.height + "px";
    card.style.pointerEvents = "none";
    var initialLeft = startRect.left - containerRect.left;
    var initialTop = startRect.top - containerRect.top;
    card.style.left = initialLeft + "px";
    card.style.top = initialTop + "px";
    var tempLayout = JSON.parse(JSON.stringify(currentLayout));
    var lastTargetX = isMobile ? item.mx : item.x;
    var lastTargetY = isMobile ? item.my : item.y;
    function onMove(moveEvent) {
      var clientX = isTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
      var clientY = isTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;
      var left = clientX - containerRect.left - grabX;
      var top = clientY - containerRect.top - grabY;
      card.style.left = left + "px";
      card.style.top = top + "px";
      var targetX = Math.round(left / colWidth) + 1;
      var targetY = Math.round(top / rowHeight) + 1;
      if (isMobile) {
        targetX = Math.max(1, Math.min(6 - item.mw + 1, targetX));
        targetY = Math.max(1, targetY);
      } else {
        targetX = Math.max(1, Math.min(12 - item.w + 1, targetX));
        targetY = Math.max(1, targetY);
      }
      if (targetX !== lastTargetX || targetY !== lastTargetY) {
        lastTargetX = targetX;
        lastTargetY = targetY;
        var activeItem = tempLayout.find((x) => x.id === id);
        if (activeItem) {
          if (isMobile) {
            activeItem.mx = targetX;
            activeItem.my = targetY;
          } else {
            activeItem.x = targetX;
            activeItem.y = targetY;
          }
        }
        var compacted = compactLayout(tempLayout, id, isMobile);
        if (isMobile) {
          placeholder.style.gridColumn = `${targetX} / span ${item.mw}`;
          placeholder.style.gridRow = `${targetY} / span ${item.mh}`;
        } else {
          placeholder.style.gridColumn = `${targetX} / span ${item.w}`;
          placeholder.style.gridRow = `${targetY} / span ${item.h}`;
        }
        compacted.forEach((c) => {
          if (c.id === id) return;
          var el = container.querySelector(`.card[data-id="${c.id}"]`);
          if (el) {
            if (isMobile) {
              el.style.gridColumn = `${c.mx} / span ${c.mw}`;
              el.style.gridRow = `${c.my} / span ${c.mh}`;
            } else {
              el.style.gridColumn = `${c.x} / span ${c.w}`;
              el.style.gridRow = `${c.y} / span ${c.h}`;
            }
          }
        });
        tempLayout = compacted;
      }
    }
    function onEnd() {
      window.removeEventListener(isTouch ? "touchmove" : "mousemove", onMove);
      window.removeEventListener(isTouch ? "touchend" : "mouseup", onEnd);
      card.classList.remove("dragging");
      card.style.position = "";
      card.style.zIndex = "";
      card.style.width = "";
      card.style.height = "";
      card.style.pointerEvents = "";
      card.style.left = "";
      card.style.top = "";
      if (placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
      }
      var activeItem = tempLayout.find((x) => x.id === id);
      if (activeItem) {
        if (isMobile) {
          activeItem.mx = lastTargetX;
          activeItem.my = lastTargetY;
        } else {
          activeItem.x = lastTargetX;
          activeItem.y = lastTargetY;
        }
      }
      currentLayout = compactAll(tempLayout);
      renderDashboard();
    }
    window.addEventListener(isTouch ? "touchmove" : "mousemove", onMove, { passive: false });
    window.addEventListener(isTouch ? "touchend" : "mouseup", onEnd);
  }
  function startResize(e, id) {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    var isTouch = e.type === "touchstart";
    var startX = isTouch ? e.touches[0].clientX : e.clientX;
    var startY = isTouch ? e.touches[0].clientY : e.clientY;
    var card = document.querySelector(`.card[data-id="${id}"]`);
    var container = document.getElementById("dashCards");
    if (!card || !container) return;
    var containerRect = container.getBoundingClientRect();
    var isMobile = window.innerWidth <= 768;
    var colWidth = containerRect.width / (isMobile ? 6 : 12);
    var rowHeight = 150 + (isMobile ? 12 : 16);
    var itemIndex = currentLayout.findIndex((x) => x.id === id);
    if (itemIndex === -1) return;
    var item = currentLayout[itemIndex];
    var startW = isMobile ? item.mw : item.w;
    var startH = isMobile ? item.mh : item.h;
    var placeholder = document.createElement("div");
    placeholder.className = "card-placeholder";
    if (isMobile) {
      placeholder.style.gridColumn = `${item.mx} / span ${item.mw}`;
      placeholder.style.gridRow = `${item.my} / span ${item.mh}`;
    } else {
      placeholder.style.gridColumn = `${item.x} / span ${item.w}`;
      placeholder.style.gridRow = `${item.y} / span ${item.h}`;
    }
    container.appendChild(placeholder);
    card.style.opacity = "0.5";
    var tempLayout = JSON.parse(JSON.stringify(currentLayout));
    var lastW = startW;
    var lastH = startH;
    function onMove(moveEvent) {
      var clientX = isTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
      var clientY = isTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;
      var deltaX = clientX - startX;
      var deltaY = clientY - startY;
      var deltaW = Math.round(deltaX / colWidth);
      var deltaH = Math.round(deltaY / rowHeight);
      var targetW = startW + deltaW;
      var targetH = startH + deltaH;
      if (isMobile) {
        targetW = Math.max(2, Math.min(6 - item.mx + 1, targetW));
        targetH = Math.max(1, targetH);
      } else {
        targetW = Math.max(2, Math.min(12 - item.x + 1, targetW));
        targetH = Math.max(1, targetH);
      }
      if (targetW !== lastW || targetH !== lastH) {
        lastW = targetW;
        lastH = targetH;
        var activeItem = tempLayout.find((x) => x.id === id);
        if (activeItem) {
          if (isMobile) {
            activeItem.mw = targetW;
            activeItem.mh = targetH;
          } else {
            activeItem.w = targetW;
            activeItem.h = targetH;
          }
        }
        var compacted = compactLayout(tempLayout, id, isMobile);
        if (isMobile) {
          placeholder.style.gridColumn = `${item.mx} / span ${targetW}`;
          placeholder.style.gridRow = `${item.my} / span ${targetH}`;
        } else {
          placeholder.style.gridColumn = `${item.x} / span ${targetW}`;
          placeholder.style.gridRow = `${item.y} / span ${targetH}`;
        }
        compacted.forEach((c) => {
          if (c.id === id) return;
          var el = container.querySelector(`.card[data-id="${c.id}"]`);
          if (el) {
            if (isMobile) {
              el.style.gridColumn = `${c.mx} / span ${c.mw}`;
              el.style.gridRow = `${c.my} / span ${c.mh}`;
            } else {
              el.style.gridColumn = `${c.x} / span ${c.w}`;
              el.style.gridRow = `${c.y} / span ${c.h}`;
            }
          }
        });
        tempLayout = compacted;
      }
    }
    function onEnd() {
      window.removeEventListener(isTouch ? "touchmove" : "mousemove", onMove);
      window.removeEventListener(isTouch ? "touchend" : "mouseup", onEnd);
      card.style.opacity = "";
      if (placeholder.parentNode) {
        placeholder.parentNode.removeChild(placeholder);
      }
      var activeItem = tempLayout.find((x) => x.id === id);
      if (activeItem) {
        if (isMobile) {
          activeItem.mw = lastW;
          activeItem.mh = lastH;
        } else {
          activeItem.w = lastW;
          activeItem.h = lastH;
        }
      }
      currentLayout = compactAll(tempLayout);
      renderDashboard();
    }
    window.addEventListener(isTouch ? "touchmove" : "mousemove", onMove, { passive: false });
    window.addEventListener(isTouch ? "touchend" : "mouseup", onEnd);
  }
  var isEditMode, currentLayout, widgetsData, saveTimeout, greetingInterval, ALL_WIDGETS;
  var init_dashboard = __esm({
    "static/js/dashboard.js"() {
      init_state();
      init_utils();
      init_exams();
      init_habits();
      init_workouts();
      init_settings();
      isEditMode = false;
      currentLayout = [];
      widgetsData = {};
      saveTimeout = null;
      greetingInterval = null;
      ALL_WIDGETS = [
        { id: "deadlines", name: "Next Deadlines" },
        { id: "today_plan", name: "Today's Plan" },
        { id: "habits", name: "Habits Today" },
        { id: "workouts", name: "Training This Week" },
        { id: "tasks", name: "Open To-Dos" },
        { id: "shortcuts", name: "Web Shortcuts" },
        { id: "quick_add", name: "Quick Add" },
        { id: "recent_files", name: "Recent Files" }
      ];
      window.changeQuickAddType = function(id, val) {
        var card = document.querySelector('.card[data-id="' + id + '"]');
        if (!card) return;
        card.querySelectorAll(".qa-fields-group").forEach(function(el) {
          el.style.display = "none";
        });
        var target = card.querySelector(".qa-fields-" + val);
        if (target) {
          target.style.display = "flex";
        }
      };
      window.submitQuickAdd = async function(id) {
        var card = document.querySelector('.card[data-id="' + id + '"]');
        if (!card) return;
        var type = card.querySelector(".qa-type-select").value;
        if (type === "event") {
          var title = card.querySelector(".qa-event-title").value.trim();
          var date = card.querySelector(".qa-event-date").value;
          if (!title || !date) {
            alert("Title and date required.");
            return;
          }
          var start = card.querySelector(".qa-event-start").value || "";
          var end = "";
          if (start) {
            var parts = start.split(":");
            var h = parseInt(parts[0], 10);
            var m = parseInt(parts[1], 10);
            h = (h + 1) % 24;
            end = (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
          }
          await api("POST", "/api/events", {
            title,
            type: "study",
            date,
            start,
            end,
            description: "",
            location: "",
            recurrence: "none",
            recurrence_until: null,
            reminder_offset: -1,
            source: "local"
          });
        } else if (type === "task") {
          var name = card.querySelector(".qa-task-name").value.trim();
          if (!name) {
            alert("Task name required.");
            return;
          }
          var cat = card.querySelector(".qa-task-category").value || null;
          var due = card.querySelector(".qa-task-due").value || null;
          var maxOrder = -1;
          if (S.tasks && S.tasks.length) {
            S.tasks.forEach(function(t) {
              if (!t.parent_id && t.order_index > maxOrder) maxOrder = t.order_index;
            });
          }
          var orderIndex = maxOrder + 1;
          await api("POST", "/api/tasks", {
            name,
            done: 0,
            created: todayStr(),
            due,
            due_date: due ? due + "T12:00" : null,
            category: cat,
            order_index: orderIndex
          });
        } else if (type === "habit") {
          var name = card.querySelector(".qa-habit-name").value.trim();
          if (!name) {
            alert("Habit name required.");
            return;
          }
          await api("POST", "/api/habits", { name, created: todayStr() });
        } else if (type === "workout") {
          var wType = card.querySelector(".qa-workout-type").value;
          var date = card.querySelector(".qa-workout-date").value || todayStr();
          var dur = parseFloat(card.querySelector(".qa-workout-dur").value) || 0;
          var dist = parseFloat(card.querySelector(".qa-workout-dist").value) || 0;
          if (!dur && !dist) {
            alert("Enter at least minutes or km.");
            return;
          }
          await api("POST", "/api/workouts", {
            type: wType,
            date,
            dur,
            dist,
            note: "",
            source: "manual"
          });
        } else if (type === "exam") {
          var name = card.querySelector(".qa-exam-name").value.trim();
          var date = card.querySelector(".qa-exam-date").value;
          if (!name || !date) {
            alert("Name and date required.");
            return;
          }
          var ects = parseFloat(card.querySelector(".qa-exam-ects").value) || null;
          await api("POST", "/api/exams", { name, date, ects });
        }
        if (window.refreshApp) {
          await window.refreshApp();
        }
      };
      window.changeNoteFont = function(id, val) {
        if (!widgetsData[id]) widgetsData[id] = {};
        widgetsData[id].font = val;
        saveWidgetsData();
        var card = document.querySelector('.card[data-id="' + id + '"]');
        if (card) {
          var ta = card.querySelector(".note-textarea");
          if (ta) {
            var fontFamily = "inherit";
            if (val === "serif") fontFamily = "Georgia, serif";
            else if (val === "mono") fontFamily = "Courier New, monospace";
            ta.style.fontFamily = fontFamily;
          }
        }
      };
      window.saveNoteText = function(id, val) {
        if (!widgetsData[id]) widgetsData[id] = {};
        widgetsData[id].text = val;
        saveWidgetsData();
      };
      window.openWidgetSettings = function(event, id) {
        if (event) {
          event.stopPropagation();
          event.preventDefault();
        }
        var item = currentLayout.find((x) => x.id === id);
        if (!item) return;
        var wData = widgetsData[id] || {};
        var title = wData.title || "";
        var borderColor = wData.border_color || "";
        var modalHtml = '<div id="widgetSettingsModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">  <div style="background: var(--panel2); border: 1px solid var(--border); padding: 20px; border-radius: 12px; width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 12px; color: var(--text);">    <h3 style="margin: 0; font-size: 16px; text-transform: none; color: var(--text); letter-spacing: normal;">Widget Settings</h3>        <div>      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Custom Title</label>      <input type="text" id="wsTitle" value="' + esc(title) + '" placeholder="Default Title" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text);">    </div>        <div>      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Border Color</label>      <div style="display: flex; gap: 6px;">        <input type="color" id="wsColorPicker" value="' + (borderColor.startsWith("#") && borderColor.length === 7 ? borderColor : "#4f8cff") + '" style="width: 34px; height: 32px; border: none; border-radius: 4px; background: none; cursor: pointer; padding: 0;">        <input type="text" id="wsBorderColor" value="' + esc(borderColor) + '" placeholder="e.g. #ff0000 or empty" style="flex: 1; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text);">      </div>    </div>';
        if (item.type === "quick_notes") {
          var font = wData.font || "sans";
          modalHtml += '    <div>      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Font Style</label>      <select id="wsFont" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text);">        <option value="sans"' + (font === "sans" ? " selected" : "") + '>sans</option>        <option value="serif"' + (font === "serif" ? " selected" : "") + '>serif</option>        <option value="mono"' + (font === "mono" ? " selected" : "") + ">mono</option>      </select>    </div>";
        } else if (item.type === "analytics") {
          var metric = wData.metric || "study_hours";
          modalHtml += '    <div>      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Display Metric</label>      <select id="wsMetric" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text);">        <option value="study_hours"' + (metric === "study_hours" ? " selected" : "") + '>Study Hours</option>        <option value="workouts"' + (metric === "workouts" ? " selected" : "") + '>Workout Sessions</option>        <option value="habits"' + (metric === "habits" ? " selected" : "") + '>Habits Count</option>        <option value="run_km"' + (metric === "run_km" ? " selected" : "") + '>Running Distance (km)</option>        <option value="cycle_km"' + (metric === "cycle_km" ? " selected" : "") + ">Cycling Distance (km)</option>      </select>    </div>";
        } else if (item.type === "custom_text") {
          var customText = wData.text || "";
          modalHtml += '    <div>      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Custom Text / Markdown</label>      <textarea id="wsCustomText" style="width: 100%; height: 80px; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); resize: vertical; font-family: monospace; font-size: 12px;">' + esc(customText) + "</textarea>    </div>";
        }
        modalHtml += `    <div style="display: flex; gap: 8px; justify-content: space-between; margin-top: 8px;">      <button onclick="deleteWidgetInstance('` + id + `')" style="background: #dc3545; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;">Delete</button>      <div style="display: flex; gap: 8px;">        <button onclick="closeWidgetSettingsModal()" style="background: var(--panel); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;">Cancel</button>        <button onclick="saveWidgetSettings('` + id + `')" style="background: var(--accent); color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;">Save</button>      </div>    </div>  </div></div>`;
        var div = document.createElement("div");
        div.id = "widgetSettingsWrapper";
        div.innerHTML = modalHtml;
        document.body.appendChild(div);
        var wsColorPicker = document.getElementById("wsColorPicker");
        var wsBorderColor = document.getElementById("wsBorderColor");
        if (wsColorPicker && wsBorderColor) {
          wsColorPicker.addEventListener("input", function() {
            wsBorderColor.value = wsColorPicker.value;
          });
          wsBorderColor.addEventListener("input", function() {
            var val = wsBorderColor.value.trim();
            if (val.startsWith("#") && val.length === 7) {
              wsColorPicker.value = val;
            }
          });
        }
      };
      window.closeWidgetSettingsModal = function() {
        var el = document.getElementById("widgetSettingsWrapper");
        if (el) el.remove();
      };
      window.deleteWidgetInstance = function(id) {
        if (confirm("Are you sure you want to remove this widget?")) {
          currentLayout = currentLayout.filter((x) => x.id !== id);
          delete widgetsData[id];
          saveWidgetsData();
          closeWidgetSettingsModal();
          renderDashboard();
        }
      };
      window.saveWidgetSettings = function(id) {
        var item = currentLayout.find((x) => x.id === id);
        if (!item) return;
        if (!widgetsData[id]) widgetsData[id] = {};
        var titleVal = document.getElementById("wsTitle").value.trim();
        widgetsData[id].title = titleVal || null;
        var colorVal = document.getElementById("wsBorderColor").value.trim();
        widgetsData[id].border_color = colorVal || null;
        if (item.type === "quick_notes") {
          widgetsData[id].font = document.getElementById("wsFont").value;
        } else if (item.type === "analytics") {
          widgetsData[id].metric = document.getElementById("wsMetric").value;
        } else if (item.type === "custom_text") {
          widgetsData[id].text = document.getElementById("wsCustomText").value;
        }
        saveWidgetsData();
        closeWidgetSettingsModal();
        renderDashboard();
      };
      window.addNewWidgetInstance = function() {
        var type = document.getElementById("addWidgetType").value;
        var id = type + "_" + Date.now();
        var maxY = 1;
        currentLayout.forEach(function(item) {
          var val = item.y + item.h;
          if (val > maxY) maxY = val;
        });
        var maxMy = 1;
        currentLayout.forEach(function(item) {
          var val = item.my + item.mh;
          if (val > maxMy) maxMy = val;
        });
        var newWidget = {
          id,
          type,
          x: 1,
          y: maxY,
          w: 6,
          h: 2,
          mx: 1,
          my: maxMy,
          mw: 6,
          mh: 2
        };
        currentLayout.push(newWidget);
        currentLayout = compactAll(currentLayout);
        renderDashboard();
      };
    }
  });

  // static/js/analytics.js
  function barChart(elId, labelId, values, labels, cls, decimals) {
    var max = Math.max.apply(null, values.concat([1]));
    var ch = "", lb = "";
    for (var i = 0; i < values.length; i++) {
      var pc = Math.round(values[i] / max * 100);
      var v = decimals ? Math.round(values[i] * Math.pow(10, decimals)) / Math.pow(10, decimals) : Math.round(values[i]);
      ch += '<div class="bar ' + (cls || "") + '" style="height:' + pc + '%"><span>' + (values[i] ? v : "") + "</span></div>";
      lb += "<div>" + labels[i] + "</div>";
    }
    document.getElementById(elId).innerHTML = ch;
    document.getElementById(labelId).innerHTML = lb;
  }
  function last12Months() {
    var out = [], now = /* @__PURE__ */ new Date();
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ key: d.getFullYear() + "-" + z(d.getMonth() + 1), label: MONTHS[d.getMonth()] });
    }
    return out;
  }
  function renderAnalytics() {
    var months = last12Months();
    var sessions = {}, kmRun = {}, kmBike = {}, study = {}, habits = {};
    months.forEach(function(m) {
      sessions[m.key] = 0;
      kmRun[m.key] = 0;
      kmBike[m.key] = 0;
      study[m.key] = 0;
      habits[m.key] = 0;
    });
    var totRunKm = 0, totBikeKm = 0, totMin = 0, totSessions = 0, totStudyH = 0, totChecks = 0;
    S.workouts.forEach(function(w) {
      var k = (w.date || "").slice(0, 7);
      totSessions++;
      totMin += w.dur || 0;
      if (w.type === "run") totRunKm += w.dist || 0;
      if (w.type === "bike") totBikeKm += w.dist || 0;
      if (k in sessions) {
        sessions[k]++;
        if (w.type === "run") kmRun[k] += w.dist || 0;
        if (w.type === "bike") kmBike[k] += w.dist || 0;
      }
    });
    S.events.forEach(function(e) {
      if (e.type !== "study" || !e.start || !e.end) return;
      var h = parseInt(e.end, 10) - parseInt(e.start, 10) + ((parseInt(e.end.slice(3), 10) || 0) - (parseInt(e.start.slice(3), 10) || 0)) / 60;
      if (h <= 0) return;
      totStudyH += h;
      var k = (e.date || "").slice(0, 7);
      if (k in study) study[k] += h;
    });
    S.habit_log.forEach(function(l) {
      totChecks++;
      var k = (l.date || "").slice(0, 7);
      if (k in habits) habits[k]++;
    });
    var graded = S.exams.filter(function(e) {
      return e.grade != null;
    });
    var avg = null;
    if (graded.length) {
      var wsum = 0, sum = 0;
      graded.forEach(function(e) {
        var w = e.ects || 1;
        wsum += w;
        sum += e.grade * w;
      });
      avg = Math.round(sum / wsum * 100) / 100;
    }
    document.getElementById("aTotals").innerHTML = '<div class="stat"><div class="v">' + totSessions + '</div><div class="l">workouts</div></div><div class="stat"><div class="v">' + Math.round(totRunKm) + '</div><div class="l">run km</div></div><div class="stat"><div class="v">' + Math.round(totBikeKm) + '</div><div class="l">bike km</div></div><div class="stat"><div class="v">' + Math.round(totMin / 60) + '</div><div class="l">training hrs</div></div><div class="stat"><div class="v">' + Math.round(totStudyH) + '</div><div class="l">study hrs planned</div></div><div class="stat"><div class="v">' + totChecks + '</div><div class="l">habit check-ins</div></div><div class="stat"><div class="v">' + (avg != null ? avg : "\u2014") + '</div><div class="l">avg grade' + (graded.length ? " (" + graded.length + ")" : "") + "</div></div>";
    var labels = months.map(function(m) {
      return m.label;
    });
    barChart("aWorkouts", "aWorkoutsL", months.map(function(m) {
      return sessions[m.key];
    }), labels, "", 0);
    barChart("aKmRun", "aKmRunL", months.map(function(m) {
      return kmRun[m.key];
    }), labels, "green", 1);
    barChart("aKmBike", "aKmBikeL", months.map(function(m) {
      return kmBike[m.key];
    }), labels, "green", 1);
    barChart("aStudy", "aStudyL", months.map(function(m) {
      return study[m.key];
    }), labels, "orange", 1);
    barChart("aHabits", "aHabitsL", months.map(function(m) {
      return habits[m.key];
    }), labels, "", 0);
    var gh = "";
    if (graded.length) {
      gh = '<table class="grades"><tr><th>Exam</th><th>Date</th><th>ECTS</th><th>Grade</th></tr>';
      graded.slice().sort(function(a, b) {
        return b.date.localeCompare(a.date);
      }).forEach(function(e) {
        var cls = e.grade >= 5.5 ? "green" : "red";
        gh += "<tr><td>" + esc(e.name) + '</td><td class="muted">' + esc(e.date) + "</td><td>" + (e.ects || "\u2014") + '</td><td><span class="badge ' + cls + '">' + e.grade + "</span></td></tr>";
      });
      gh += "</table>";
      if (avg != null) gh += '<p style="margin-top:10px;font-size:14px">Weighted average (by ECTS): <b>' + avg + "</b></p>";
    } else gh = '<div class="muted">No grades entered yet \u2014 add them in the Exams &amp; grades tab.</div>';
    document.getElementById("aGrades").innerHTML = gh;
  }
  var init_analytics = __esm({
    "static/js/analytics.js"() {
      init_state();
      init_utils();
    }
  });

  // static/js/planner.js
  function setPlannerRefresh(fn) {
    plannerRefresh = fn;
  }
  function changePlannerView(val) {
    currentView = val;
    dateOffset = 0;
    renderPlanner();
  }
  function moveWeek(d) {
    if (d === 0) dateOffset = 0;
    else dateOffset += d;
    renderPlanner();
  }
  function getInstances(e, startIso, endIso) {
    var instances = [];
    var d = new Date(startIso);
    var eDate = new Date(e.date);
    for (var i = 0; i < 42; i++) {
      var cur = new Date(d);
      cur.setDate(d.getDate() + i);
      var curIso = toISO(cur);
      if (curIso > endIso) break;
      if (curIso < e.date) continue;
      if (e.recurrence_until && curIso > e.recurrence_until) continue;
      var match = false;
      if (!e.recurrence || e.recurrence === "none") {
        match = curIso === e.date;
      } else if (e.recurrence === "daily") {
        match = true;
      } else if (e.recurrence === "weekly") {
        match = cur.getDay() === eDate.getDay();
      } else if (e.recurrence === "monthly") {
        match = cur.getDate() === eDate.getDate();
      }
      if (match) instances.push(Object.assign({}, e, { virtualDate: curIso }));
    }
    return instances;
  }
  function calculateOverlaps(events) {
    events.sort(function(a, b) {
      return parseTime2(a.start) - parseTime2(b.start);
    });
    var clusters = [];
    var currentCluster = [];
    var maxEnd = -1;
    events.forEach(function(e) {
      if (!e.start || !e.end) return;
      var startVal = parseTime2(e.start);
      var endVal = parseTime2(e.end);
      if (currentCluster.length === 0) {
        currentCluster.push(e);
        maxEnd = endVal;
      } else if (startVal < maxEnd) {
        currentCluster.push(e);
        maxEnd = Math.max(maxEnd, endVal);
      } else {
        clusters.push(currentCluster);
        currentCluster = [e];
        maxEnd = endVal;
      }
    });
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }
    clusters.forEach(function(cluster) {
      var cols = [];
      cluster.forEach(function(e) {
        var placed = false;
        var startVal = parseTime2(e.start);
        for (var i = 0; i < cols.length; i++) {
          var last = cols[i][cols[i].length - 1];
          if (parseTime2(last.end) <= startVal) {
            cols[i].push(e);
            e._col = i;
            placed = true;
            break;
          }
        }
        if (!placed) {
          e._col = cols.length;
          cols.push([e]);
        }
      });
      var totalCols = cols.length;
      cluster.forEach(function(e) {
        e._width = 100 / totalCols;
        e._left = e._col * e._width;
      });
    });
  }
  function parseTime2(t) {
    if (!t) return 0;
    var p = t.split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function renderPlanner() {
    isRendering = true;
    var dates = getViewDates(currentView, dateOffset);
    var title = "";
    if (currentView === "month") {
      var mDate = /* @__PURE__ */ new Date();
      mDate.setMonth(mDate.getMonth() + dateOffset);
      title = MONTHS[mDate.getMonth()] + " " + mDate.getFullYear();
    } else {
      title = (dateOffset === 0 ? "This " + (currentView === "1" ? "day" : currentView === "7" ? "week" : currentView + " days") + " \xB7 " : "") + fmtShort(dates[0]) + (dates.length > 1 ? " \u2013 " + fmtShort(dates[dates.length - 1]) : "") + " " + dates[0].getFullYear();
    }
    document.getElementById("weekLabel").textContent = title;
    var today = todayStr();
    var allInstances = [];
    S.events.forEach(function(e) {
      allInstances = allInstances.concat(getInstances(e, toISO(dates[0]), toISO(dates[dates.length - 1])));
    });
    var html = "";
    if (currentView === "month") {
      html += '<div class="month-header">';
      for (var i = 0; i < 7; i++) html += '<div class="month-header-cell">' + DAYS[i] + "</div>";
      html += '</div><div class="month-grid">';
      var exactMonthDate = /* @__PURE__ */ new Date();
      exactMonthDate.setMonth(exactMonthDate.getMonth() + dateOffset);
      var exactMonth = exactMonthDate.getMonth();
      dates.forEach(function(d) {
        var iso = toISO(d);
        var evs = allInstances.filter(function(e) {
          return e.virtualDate === iso;
        }).sort(function(a, b) {
          return (a.start || "").localeCompare(b.start || "");
        });
        var tDue = S.tasks ? S.tasks.filter(function(t2) {
          return t2.due === iso && !t2.done;
        }) : [];
        var isOther = d.getMonth() !== exactMonth;
        var ccls = "month-cell" + (iso === today ? " today" : "") + (isOther ? " other-month" : "");
        html += '<div class="' + ccls + '" data-iso="' + iso + '">';
        html += `<div class="month-date" onclick="openAdd('` + iso + `')" style="cursor:pointer">` + d.getDate() + "</div>";
        tDue.forEach(function(t2) {
          html += `<div class="month-event ics" onclick="toggleTask('` + t2.id + `',true)">\u2611 ` + esc(t2.name) + "</div>";
        });
        evs.forEach(function(e) {
          var rep = e.recurrence && e.recurrence !== "none" ? " \u{1F504}" : "";
          var tstr = e.start ? e.start + " " : "";
          html += '<div class="month-event ' + esc(e.source === "ics" ? "ics" : e.type) + `" onclick="editEvent('` + e.id + `')">` + esc(tstr + e.title) + rep + "</div>";
        });
        html += "</div>";
      });
      html += "</div>";
    } else {
      html += '<div class="time-grid-wrapper">';
      html += '<div class="time-grid-inner">';
      html += '<div class="time-axis">';
      html += '<div class="time-axis-spacer" style="height:37px"></div>';
      for (var h = 0; h < 24; h++) {
        html += '<div style="height:60px; position:relative;"><span class="time-label">' + h + ":00</span></div>";
      }
      html += "</div>";
      html += '<div class="day-columns">';
      dates.forEach(function(d) {
        var iso = toISO(d);
        var evs = allInstances.filter(function(e) {
          return e.virtualDate === iso;
        }).sort(function(a, b) {
          return (a.start || "").localeCompare(b.start || "");
        });
        var tDue = S.tasks ? S.tasks.filter(function(t2) {
          return t2.due === iso && !t2.done;
        }) : [];
        var timedEvs = evs.filter(function(e) {
          return e.start && e.end;
        });
        var allDayEvs = evs.filter(function(e) {
          return !e.start || !e.end;
        });
        calculateOverlaps(timedEvs);
        html += '<div class="day-col' + (iso === today ? " today" : "") + '" data-iso="' + iso + '">';
        html += '<div class="day-col-header"><span class="dname">' + DAYS[(d.getDay() + 6) % 7] + " " + d.getDate() + `</span><button class="btn ghost small" onclick="openAdd('` + iso + `')">+</button></div>`;
        html += `<div class="all-day-bar" onclick="if (event.target === this) openAdd('` + iso + `')">`;
        tDue.forEach(function(t2) {
          html += '<div class="event" style="border-left-color:var(--muted); cursor:pointer; display:flex; align-items:center; gap:6px"><span class="hcheck' + (t2.done ? " on" : "") + `" onclick="toggleTask('` + t2.id + "'," + !t2.done + ')" style="flex-shrink:0; width:16px; height:16px; line-height:16px; border-radius:4px; font-size:10px;">' + (t2.done ? "\u2713" : "") + "</span> <span>" + esc(t2.name) + "</span></div>";
        });
        allDayEvs.forEach(function(e) {
          var repeatIcon = e.recurrence && e.recurrence !== "none" ? " \u{1F504}" : "";
          html += '<div class="event ' + esc(e.source === "ics" ? "ics" : e.type) + '" draggable="true" data-id="' + e.id + `" onclick="editEvent('` + e.id + `')">` + esc(e.title) + repeatIcon + "</div>";
        });
        html += "</div>";
        html += '<div class="time-grid-content" data-iso="' + iso + '">';
        html += '<div class="time-grid-bg">';
        for (var h2 = 0; h2 < 24; h2++) html += '<div class="time-grid-bg-hour"></div>';
        html += "</div>";
        if (iso === today) {
          var now2 = /* @__PURE__ */ new Date();
          var nowMin2 = now2.getHours() * 60 + now2.getMinutes();
          html += '<div class="current-time-line" style="top:' + nowMin2 + 'px"></div>';
        }
        timedEvs.forEach(function(e) {
          var startMin = parseTime2(e.start);
          var endMin = parseTime2(e.end);
          var height = endMin - startMin;
          if (height < 15) height = 15;
          var repeatIcon = e.recurrence && e.recurrence !== "none" ? " \u{1F504}" : "";
          var locHtml = "";
          if (e.location && e.location.trim() !== "") {
            locHtml = '<div class="muted" style="font-size:9.5px; color:inherit; opacity:0.75; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\u{1F4CD} ' + esc(e.location.trim()) + "</div>";
          }
          html += '<div class="event absolute ' + esc(e.source === "ics" ? "ics" : e.type) + '" draggable="true" data-id="' + e.id + `" onclick="editEvent('` + e.id + `')" `;
          html += 'style="--original-height:' + height + "px; top:" + startMin + "px; height:" + height + "px; left:" + e._left + "%; width:calc(" + e._width + '% - 2px);">';
          html += '<div class="resize-handle top"></div>';
          html += '<div style="font-weight:bold; pointer-events:none;">' + esc(e.title) + repeatIcon + "</div>";
          html += '<div class="muted" style="font-size:10px; color:inherit; opacity:0.8; pointer-events:none;">' + esc(e.start) + " \u2013 " + esc(e.end) + "</div>";
          html += locHtml;
          html += '<div class="resize-handle bottom"></div>';
          html += "</div>";
        });
        html += "</div></div>";
      });
      html += "</div></div></div>";
    }
    var oldWrapper = document.querySelector(".time-grid-wrapper");
    if (oldWrapper && oldWrapper.clientHeight > 0) {
      lastScrollTop = oldWrapper.scrollTop;
    }
    document.getElementById("weekGrid").innerHTML = html;
    var newWrapper = document.querySelector(".time-grid-wrapper");
    if (newWrapper) {
      newWrapper.addEventListener("scroll", function() {
        if (isRendering) return;
        if (newWrapper.clientHeight > 0) {
          lastScrollTop = newWrapper.scrollTop;
        }
      });
    }
    document.querySelectorAll(currentView === "month" ? ".month-cell" : ".day-col").forEach(function(col) {
      col.addEventListener("dragover", function(ev) {
        ev.preventDefault();
        col.classList.add("drag-over");
        if (draggingEventId) {
          var e = S.events.find(function(x) {
            return x.id == draggingEventId;
          });
          if (e) {
            if (e.start && e.end && currentView !== "month") {
              var tgc = col.querySelector(".time-grid-content");
              if (tgc) {
                var rect = tgc.getBoundingClientRect();
                var y = ev.clientY - rect.top - draggingOffsetY;
                var dur = parseTime2(e.end) - parseTime2(e.start);
                var startMin = Math.max(0, Math.round(y / 15) * 15);
                var endMin = startMin + dur;
                var sh = Math.floor(startMin / 60);
                var sm = startMin % 60;
                var eh = Math.floor(endMin / 60);
                var em = endMin % 60;
                if (eh >= 24) {
                  eh = 23;
                  em = 59;
                }
                var startStr = (sh < 10 ? "0" + sh : sh) + ":" + (sm < 10 ? "0" + sm : sm);
                var endStr = (eh < 10 ? "0" + eh : eh) + ":" + (em < 10 ? "0" + em : em);
                if (!dragPreviewEl) {
                  var sourceEl = document.querySelector('.event[data-id="' + draggingEventId + '"]');
                  dragPreviewEl = document.createElement("div");
                  dragPreviewEl.className = sourceEl ? sourceEl.className : "event absolute";
                  dragPreviewEl.classList.add("dragging-preview");
                  dragPreviewEl.classList.remove("drag-source");
                  dragPreviewEl.classList.remove("dragging");
                  dragPreviewEl.style.height = dur + "px";
                  dragPreviewEl.style.position = "absolute";
                  dragPreviewEl.style.pointerEvents = "none";
                  dragPreviewEl.style.zIndex = "50";
                  dragPreviewEl.style.opacity = "0.8";
                  var title2 = e.title || "";
                  var repeatIcon = e.recurrence && e.recurrence !== "none" ? " \u{1F504}" : "";
                  var locHtml = "";
                  if (e.location && e.location.trim() !== "") {
                    locHtml = '<div class="muted" style="font-size:9.5px; color:inherit; opacity:0.75; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">\u{1F4CD} ' + esc(e.location.trim()) + "</div>";
                  }
                  dragPreviewEl.innerHTML = '<div style="font-weight:bold; pointer-events:none;">' + esc(title2) + repeatIcon + '</div><div class="muted" style="font-size:10px; color:inherit; opacity:0.8; pointer-events:none;">' + startStr + " \u2013 " + endStr + "</div>" + locHtml;
                  tgc.appendChild(dragPreviewEl);
                }
                if (dragPreviewEl.parentNode !== tgc) {
                  tgc.appendChild(dragPreviewEl);
                }
                dragPreviewEl.style.top = startMin + "px";
                dragPreviewEl.style.left = "0%";
                dragPreviewEl.style.width = "calc(100% - 2px)";
                var timeDiv = dragPreviewEl.querySelector(".muted");
                if (timeDiv) {
                  timeDiv.textContent = startStr + " \u2013 " + endStr;
                }
              } else {
                var targetContainer = currentView === "month" ? col : col.querySelector(".all-day-bar");
                if (targetContainer) {
                  if (!dragPreviewEl) {
                    var sourceEl = document.querySelector('.event[data-id="' + draggingEventId + '"]');
                    dragPreviewEl = document.createElement("div");
                    dragPreviewEl.className = sourceEl ? sourceEl.className : "event";
                    dragPreviewEl.classList.add("dragging-preview");
                    dragPreviewEl.classList.remove("drag-source");
                    dragPreviewEl.classList.remove("dragging");
                    dragPreviewEl.style.pointerEvents = "none";
                    dragPreviewEl.style.opacity = "0.8";
                    dragPreviewEl.innerHTML = sourceEl ? sourceEl.innerHTML : esc(e.title);
                    targetContainer.appendChild(dragPreviewEl);
                  }
                  if (dragPreviewEl.parentNode !== targetContainer) {
                    targetContainer.appendChild(dragPreviewEl);
                  }
                }
              }
            }
          }
        }
      });
      col.addEventListener("dragleave", function(ev) {
        col.classList.remove("drag-over");
      });
      col.addEventListener("drop", async function(ev) {
        ev.preventDefault();
        col.classList.remove("drag-over");
        var id = ev.dataTransfer.getData("text/plain");
        var iso = col.getAttribute("data-iso");
        if (id && iso) {
          var data = { date: iso };
          var e = S.events.find(function(x) {
            return x.id == id;
          });
          var originalDate = e ? e.date : null;
          var originalStart = e ? e.start : null;
          var originalEnd = e ? e.end : null;
          if (e && e.start && e.end && currentView !== "month") {
            var tgc = col.querySelector(".time-grid-content");
            if (tgc) {
              var rect = tgc.getBoundingClientRect();
              var offsetY = parseFloat(ev.dataTransfer.getData("offsetY")) || 0;
              var y = ev.clientY - rect.top - offsetY;
              var dur = parseTime2(e.end) - parseTime2(e.start);
              var startMin = Math.max(0, Math.round(y / 15) * 15);
              var endMin = startMin + dur;
              var sh = Math.floor(startMin / 60);
              var sm = startMin % 60;
              var eh = Math.floor(endMin / 60);
              var em = endMin % 60;
              if (eh >= 24) {
                eh = 23;
                em = 59;
              }
              data.start = (sh < 10 ? "0" + sh : sh) + ":" + (sm < 10 ? "0" + sm : sm);
              data.end = (eh < 10 ? "0" + eh : eh) + ":" + (em < 10 ? "0" + em : em);
            }
          }
          if (e) {
            Object.assign(e, data);
          }
          if (dragPreviewEl) {
            dragPreviewEl.remove();
            dragPreviewEl = null;
          }
          renderPlanner();
          renderDashboard();
          if (e) {
            var undoCallback = async function() {
              var eventToRestore = S.events.find(function(x) {
                return x.id == id;
              });
              if (eventToRestore) {
                eventToRestore.date = originalDate;
                eventToRestore.start = originalStart;
                eventToRestore.end = originalEnd;
                renderPlanner();
                renderDashboard();
                try {
                  await api("PUT", "/api/events/" + id, { date: originalDate, start: originalStart, end: originalEnd });
                  if (plannerRefresh) plannerRefresh();
                } catch (err) {
                  console.error("Undo move failed:", err);
                  if (plannerRefresh) plannerRefresh();
                }
              }
            };
            showUndoToast("Event moved", undoCallback);
          }
          try {
            await api("PUT", "/api/events/" + id, data);
            if (plannerRefresh) plannerRefresh();
          } catch (err) {
            console.error(err);
            if (plannerRefresh) await plannerRefresh();
          }
        }
      });
    });
    document.querySelectorAll(".event, .month-event").forEach(function(el) {
      if (el.getAttribute("data-id") && el.getAttribute("draggable") !== "false") {
        el.setAttribute("draggable", "true");
        el.addEventListener("dragstart", function(ev) {
          var eventId = el.getAttribute("data-id");
          draggingEventId = eventId;
          ev.dataTransfer.setData("text/plain", eventId);
          var rect = el.getBoundingClientRect();
          var offsetY = ev.clientY - rect.top;
          draggingOffsetY = offsetY;
          ev.dataTransfer.setData("offsetY", offsetY);
          var img = new Image();
          img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
          ev.dataTransfer.setDragImage(img, 0, 0);
          el.classList.add("dragging");
          var height = parseFloat(el.style.height) || el.offsetHeight;
          el.style.setProperty("--drag-height", height + "px");
          document.body.classList.add("dragging-move-active");
        });
        el.addEventListener("dragend", function(ev) {
          draggingEventId = null;
          draggingOffsetY = 0;
          el.classList.remove("dragging");
          document.body.classList.remove("dragging-move-active");
          renderPlanner();
        });
      }
    });
    if (currentView !== "month") {
      attachTimeGridInteractivity();
      var headerH = 0;
      var allDayH = 0;
      document.querySelectorAll(".day-col-header").forEach(function(el) {
        if (el.offsetHeight > headerH) headerH = el.offsetHeight;
      });
      document.querySelectorAll(".all-day-bar").forEach(function(el) {
        if (el.offsetHeight > allDayH) allDayH = el.offsetHeight;
      });
      document.querySelectorAll(".all-day-bar").forEach(function(el) {
        el.style.height = allDayH + "px";
        el.style.top = headerH + "px";
      });
      var spacer = document.querySelector(".time-axis-spacer");
      if (spacer) spacer.style.height = headerH + allDayH + "px";
      var minStart = 7 * 60;
      document.querySelectorAll(".event.absolute").forEach(function(el) {
        if (el.style.top) {
          var topPx = parseFloat(el.style.top);
          if (topPx < minStart) minStart = topPx;
        }
      });
      var wrapper = document.querySelector(".time-grid-wrapper");
      if (wrapper) {
        var tabPlanner = document.getElementById("tab-planner");
        var isVisible = tabPlanner && tabPlanner.classList.contains("active") && wrapper.clientHeight > 0;
        if (isVisible) {
          if (lastScrollTop !== null) {
            wrapper.scrollTop = lastScrollTop;
          } else if (!scrolledToCurrentTimeThisSession) {
            var now = /* @__PURE__ */ new Date();
            var nowMin = now.getHours() * 60 + now.getMinutes();
            var targetScroll = allDayH + nowMin - (wrapper.clientHeight - headerH) / 3;
            wrapper.scrollTop = Math.max(0, targetScroll);
            scrolledToCurrentTimeThisSession = true;
            lastScrollTop = wrapper.scrollTop;
          } else {
            wrapper.scrollTop = Math.max(0, minStart - 20);
            lastScrollTop = wrapper.scrollTop;
          }
          isRendering = false;
        } else {
          setTimeout(function() {
            var isVisibleNow = tabPlanner && tabPlanner.classList.contains("active") && wrapper.clientHeight > 0;
            if (isVisibleNow) {
              if (lastScrollTop !== null) {
                wrapper.scrollTop = lastScrollTop;
              } else if (!scrolledToCurrentTimeThisSession) {
                var now2 = /* @__PURE__ */ new Date();
                var nowMin2 = now2.getHours() * 60 + now2.getMinutes();
                var targetScroll2 = allDayH + nowMin2 - (wrapper.clientHeight - headerH) / 3;
                wrapper.scrollTop = Math.max(0, targetScroll2);
                scrolledToCurrentTimeThisSession = true;
                lastScrollTop = wrapper.scrollTop;
              }
            }
            isRendering = false;
          }, 50);
        }
      } else {
        isRendering = false;
      }
    } else {
      isRendering = false;
    }
    var t = document.getElementById("evTitle");
    if (t) t.focus();
  }
  function scrollToCurrentTimeLineIfVisible() {
    if (scrolledToCurrentTimeThisSession) return;
    if (currentView === "month") return;
    var tabPlanner = document.getElementById("tab-planner");
    var wrapper = document.querySelector(".time-grid-wrapper");
    var isVisible = tabPlanner && tabPlanner.classList.contains("active") && wrapper && wrapper.clientHeight > 0;
    if (!isVisible) return;
    var headerH = 0;
    var allDayH = 0;
    document.querySelectorAll(".day-col-header").forEach(function(el) {
      if (el.offsetHeight > headerH) headerH = el.offsetHeight;
    });
    document.querySelectorAll(".all-day-bar").forEach(function(el) {
      if (el.offsetHeight > allDayH) allDayH = el.offsetHeight;
    });
    var now = /* @__PURE__ */ new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var targetScroll = allDayH + nowMin - (wrapper.clientHeight - headerH) / 3;
    wrapper.scrollTop = Math.max(0, targetScroll);
    scrolledToCurrentTimeThisSession = true;
    lastScrollTop = wrapper.scrollTop;
  }
  function initTabListener() {
    var tabs = document.getElementById("tabs");
    if (tabs) {
      tabs.addEventListener("click", function(e) {
        var b = e.target.closest("button");
        if (b && b.dataset.tab === "planner") {
          setTimeout(scrollToCurrentTimeLineIfVisible, 50);
        }
      });
    }
    var startInput = document.getElementById("evModalStart");
    var endInput = document.getElementById("evModalEnd");
    var durationSelect = document.getElementById("evModalDuration");
    var recSelect = document.getElementById("evModalRec");
    if (startInput) {
      startInput.addEventListener("change", function() {
        if (durationSelect && durationSelect.value !== "custom") {
          updateEndTimeFromDuration();
        } else {
          updateDurationFromTimes();
        }
      });
    }
    if (endInput) {
      endInput.addEventListener("change", function() {
        updateDurationFromTimes();
      });
    }
    if (durationSelect) {
      durationSelect.addEventListener("change", function() {
        updateEndTimeFromDuration();
      });
    }
    if (recSelect) {
      recSelect.addEventListener("change", updateRecurrenceVisibility);
    }
    var addRemBtn = document.getElementById("evModalRemAddBtn");
    var remSelect = document.getElementById("evModalRemSelect");
    var customAddBtn = document.getElementById("evModalRemCustomAdd");
    var customValInput = document.getElementById("evModalRemCustomVal");
    var cancelRemBtn = document.getElementById("evModalRemCancel");
    if (addRemBtn) {
      addRemBtn.addEventListener("click", function() {
        addRemBtn.style.display = "none";
        document.getElementById("evModalRemSelectorGroup").style.display = "flex";
        if (remSelect) remSelect.value = "";
      });
    }
    if (cancelRemBtn) {
      cancelRemBtn.addEventListener("click", resetReminderControls);
    }
    if (remSelect) {
      remSelect.addEventListener("change", function() {
        var val = remSelect.value;
        if (val === "custom") {
          document.getElementById("evModalRemCustomGroup").style.display = "flex";
          if (customValInput) {
            customValInput.value = "";
            customValInput.focus();
          }
        } else if (val !== "") {
          var offset = parseInt(val, 10);
          if (!isNaN(offset) && activeReminders.indexOf(offset) === -1) {
            activeReminders.push(offset);
            renderReminderPills();
          }
          resetReminderControls();
        }
      });
    }
    if (customAddBtn) {
      customAddBtn.addEventListener("click", function() {
        if (customValInput) {
          var offset = parseInt(customValInput.value, 10);
          if (!isNaN(offset) && offset >= 0 && activeReminders.indexOf(offset) === -1) {
            activeReminders.push(offset);
            renderReminderPills();
          }
        }
        resetReminderControls();
      });
    }
    if (customValInput) {
      customValInput.addEventListener("keydown", function(ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          customAddBtn.click();
        }
      });
    }
    document.querySelectorAll(".shortcut-input").forEach(function(input) {
      input.addEventListener("keydown", function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (["Control", "Shift", "Alt", "Meta"].indexOf(e.key) !== -1) return;
        var keyName = e.key;
        if (keyName === " ") {
          keyName = "Space";
        }
        if (keyName.length === 1) {
          keyName = keyName.toLowerCase();
        }
        input.value = keyName;
      });
    });
    var eventModal = document.getElementById("eventModal");
    if (eventModal) {
      eventModal.addEventListener("keydown", function(ev) {
        if (ev.key === "Enter") {
          var target = ev.target;
          if (target && target.id !== "evModalDesc" && target.id !== "evModalRemCustomVal" && target.tagName !== "BUTTON") {
            ev.preventDefault();
            saveEventModal();
          }
        }
      });
    }
    window.addEventListener("keydown", function(e) {
      var tabPlanner = document.getElementById("tab-planner");
      if (!tabPlanner || !tabPlanner.classList.contains("active")) return;
      if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.tagName === "SELECT")) return;
      var modalOpen = false;
      document.querySelectorAll(".modal").forEach(function(m) {
        if (m.style.display && m.style.display !== "none") modalOpen = true;
      });
      if (modalOpen) return;
      var key = e.key;
      if (key === " ") {
        key = "Space";
      }
      if (key.length === 1) {
        key = key.toLowerCase();
      }
      if (key === shortcuts.today) {
        e.preventDefault();
        moveWeek(0);
      } else if (key === shortcuts.weekView) {
        e.preventDefault();
        var select = document.getElementById("plannerView");
        if (select) {
          select.value = "7";
          changePlannerView("7");
        }
      } else if (key === shortcuts.dayView) {
        e.preventDefault();
        var select = document.getElementById("plannerView");
        if (select) {
          select.value = "1";
          changePlannerView("1");
        }
      } else if (key === shortcuts.monthView) {
        e.preventDefault();
        var select = document.getElementById("plannerView");
        if (select) {
          select.value = "month";
          changePlannerView("month");
        }
      } else if (key === shortcuts.next) {
        e.preventDefault();
        moveWeek(1);
      } else if (key === shortcuts.prev) {
        e.preventDefault();
        moveWeek(-1);
      } else if (key === shortcuts.create) {
        e.preventDefault();
        openAdd(todayStr());
      }
    });
  }
  function attachTimeGridInteractivity() {
    document.querySelectorAll(".time-grid-content").forEach(function(node) {
      node.addEventListener("mousedown", function(e) {
        if (e.target.closest(".event")) return;
        e.preventDefault();
        var iso = node.getAttribute("data-iso");
        var rect = node.getBoundingClientRect();
        var startY = e.clientY - rect.top;
        var startMin = Math.max(0, Math.round(startY / 15) * 15);
        var placeholder = document.createElement("div");
        placeholder.className = "selection-placeholder";
        placeholder.style.top = startMin + "px";
        placeholder.style.height = "15px";
        placeholder.innerHTML = '<div style="font-weight:bold;">New Event</div><div class="selection-time-label"></div>';
        node.appendChild(placeholder);
        function updatePlaceholder(currentY) {
          var currentMin = Math.max(0, Math.round(currentY / 15) * 15);
          var actualStart = Math.min(startMin, currentMin);
          var actualEnd = Math.max(startMin, currentMin);
          if (actualEnd === actualStart) {
            actualEnd = actualStart + 15;
          }
          var height = actualEnd - actualStart;
          placeholder.style.top = actualStart + "px";
          placeholder.style.height = height + "px";
          if (height < 35) {
            placeholder.classList.add("short");
          } else {
            placeholder.classList.remove("short");
          }
          var sh = Math.floor(actualStart / 60);
          var sm = actualStart % 60;
          var eh = Math.floor(actualEnd / 60);
          var em = actualEnd % 60;
          if (eh >= 24) {
            eh = 23;
            em = 59;
          }
          var startStr = (sh < 10 ? "0" + sh : sh) + ":" + (sm < 10 ? "0" + sm : sm);
          var endStr = (eh < 10 ? "0" + eh : eh) + ":" + (em < 10 ? "0" + em : em);
          var label = placeholder.querySelector(".selection-time-label");
          if (label) {
            label.textContent = startStr + " \u2013 " + endStr;
          }
        }
        updatePlaceholder(startY);
        function onMouseMove(moveEvent) {
          var currentY = moveEvent.clientY - rect.top;
          updatePlaceholder(currentY);
        }
        function onMouseUp(upEvent) {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          var finalY = upEvent.clientY - rect.top;
          var finalMin = Math.max(0, Math.round(finalY / 15) * 15);
          var actualStart = Math.min(startMin, finalMin);
          var actualEnd = Math.max(startMin, finalMin);
          if (actualEnd === actualStart) {
            actualEnd = actualStart + 60;
          }
          var sh = Math.floor(actualStart / 60);
          var sm = actualStart % 60;
          var eh = Math.floor(actualEnd / 60);
          var em = actualEnd % 60;
          if (eh >= 24) {
            eh = 23;
            em = 59;
          }
          var startStr = (sh < 10 ? "0" + sh : sh) + ":" + (sm < 10 ? "0" + sm : sm);
          var endStr = (eh < 10 ? "0" + eh : eh) + ":" + (em < 10 ? "0" + em : em);
          placeholder.remove();
          openAdd(iso, startStr, endStr);
        }
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    });
    document.querySelectorAll(".event.absolute").forEach(function(el) {
      var handles = el.querySelectorAll(".resize-handle");
      var id = el.getAttribute("data-id");
      handles.forEach(function(handle) {
        handle.addEventListener("click", function(e) {
          e.stopPropagation();
        });
        handle.addEventListener("mousedown", function(e) {
          e.stopPropagation();
          e.preventDefault();
          isResizing = true;
          var evObj = S.events.find(function(x) {
            return x.id == id;
          });
          var originalStart = evObj ? evObj.start : null;
          var originalEnd = evObj ? evObj.end : null;
          var dragType = handle.classList.contains("top") ? "resize-top" : "resize-bottom";
          var startY = e.clientY;
          var startTop = parseFloat(el.style.top);
          var startHeight = parseFloat(el.style.height);
          document.body.classList.add("dragging-active");
          el.classList.add("dragging");
          el.style.setProperty("--drag-height", startHeight + "px");
          function onMouseMove(moveEvent) {
            var dy = moveEvent.clientY - startY;
            var newTop = startTop;
            var newHeight = startHeight;
            if (dragType === "resize-bottom") {
              newHeight = Math.max(15, startHeight + dy);
            } else if (dragType === "resize-top") {
              newTop = Math.max(0, startTop + dy);
              newHeight = startHeight - (newTop - startTop);
              if (newHeight < 15) {
                newTop = startTop + startHeight - 15;
                newHeight = 15;
              }
            }
            el.style.top = newTop + "px";
            el.style.height = newHeight + "px";
            el.style.setProperty("--drag-height", newHeight + "px");
            var currentTop = Math.round(newTop / 15) * 15;
            var currentHeight = Math.round(newHeight / 15) * 15;
            if (currentHeight < 15) currentHeight = 15;
            var currentEndTop = currentTop + currentHeight;
            var sh = Math.floor(currentTop / 60);
            var sm = currentTop % 60;
            var eh = Math.floor(currentEndTop / 60);
            var em = currentEndTop % 60;
            if (eh >= 24) {
              eh = 23;
              em = 59;
            }
            var startStr = (sh < 10 ? "0" + sh : sh) + ":" + (sm < 10 ? "0" + sm : sm);
            var endStr = (eh < 10 ? "0" + eh : eh) + ":" + (em < 10 ? "0" + em : em);
            var timeDiv = el.querySelector(".muted");
            if (timeDiv) {
              timeDiv.textContent = startStr + " \u2013 " + endStr;
            }
          }
          function onMouseUp(upEvent) {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.body.classList.remove("dragging-active");
            el.classList.remove("dragging");
            var finalTop = parseFloat(el.style.top);
            var finalHeight = parseFloat(el.style.height);
            finalTop = Math.round(finalTop / 15) * 15;
            finalHeight = Math.round(finalHeight / 15) * 15;
            if (finalHeight < 15) finalHeight = 15;
            el.style.top = finalTop + "px";
            el.style.height = finalHeight + "px";
            el.style.setProperty("--drag-height", finalHeight + "px");
            el.style.setProperty("--original-height", finalHeight + "px");
            el.classList.add("resizing-saving");
            var endTop = finalTop + finalHeight;
            var sh = Math.floor(finalTop / 60);
            var sm = finalTop % 60;
            var eh = Math.floor(endTop / 60);
            var em = endTop % 60;
            var startStr = (sh < 10 ? "0" + sh : sh) + ":" + (sm < 10 ? "0" + sm : sm);
            var endStr = (eh < 10 ? "0" + eh : eh) + ":" + (em < 10 ? "0" + em : em);
            var e2 = S.events.find(function(x) {
              return x.id == id;
            });
            if (e2) {
              e2.start = startStr;
              e2.end = endStr;
            }
            renderPlanner();
            renderDashboard();
            if (e2) {
              var undoCallback = async function() {
                var eventToRestore = S.events.find(function(x) {
                  return x.id == id;
                });
                if (eventToRestore) {
                  eventToRestore.start = originalStart;
                  eventToRestore.end = originalEnd;
                  renderPlanner();
                  renderDashboard();
                  try {
                    await api("PUT", "/api/events/" + id, { start: originalStart, end: originalEnd });
                    if (plannerRefresh) plannerRefresh();
                  } catch (err) {
                    console.error("Undo resize failed:", err);
                    if (plannerRefresh) plannerRefresh();
                  }
                }
              };
              showUndoToast("Event resized", undoCallback);
            }
            if (id) {
              api("PUT", "/api/events/" + id, { start: startStr, end: endStr }).then(function() {
                if (plannerRefresh) plannerRefresh();
              }).catch(function(err) {
                console.error(err);
                if (plannerRefresh) plannerRefresh();
              }).then(function() {
                setTimeout(function() {
                  isResizing = false;
                }, 50);
              });
            } else {
              setTimeout(function() {
                isResizing = false;
              }, 50);
            }
          }
          document.addEventListener("mousemove", onMouseMove);
          document.addEventListener("mouseup", onMouseUp);
        });
      });
    });
  }
  function formatTime(minutes) {
    var h = Math.floor(minutes / 60) % 24;
    var m = minutes % 60;
    return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
  }
  function updateDurationFromTimes() {
    var startVal = document.getElementById("evModalStart").value;
    var endVal = document.getElementById("evModalEnd").value;
    var durationSelect = document.getElementById("evModalDuration");
    if (!durationSelect) return;
    if (!startVal || !endVal) {
      durationSelect.value = "custom";
      return;
    }
    var startMin = parseTime2(startVal);
    var endMin = parseTime2(endVal);
    var diff = endMin - startMin;
    if (diff < 0) {
      durationSelect.value = "custom";
      return;
    }
    var presets = ["15", "30", "45", "60", "90", "120", "180"];
    if (presets.indexOf(diff.toString()) !== -1) {
      durationSelect.value = diff.toString();
    } else {
      durationSelect.value = "custom";
    }
  }
  function updateEndTimeFromDuration() {
    var startVal = document.getElementById("evModalStart").value;
    var durationSelect = document.getElementById("evModalDuration");
    if (!durationSelect || !startVal) return;
    var dur = durationSelect.value;
    if (dur === "custom") return;
    var startMin = parseTime2(startVal);
    var endMin = startMin + parseInt(dur, 10);
    document.getElementById("evModalEnd").value = formatTime(endMin);
  }
  function updateRecurrenceVisibility() {
    var recSelect = document.getElementById("evModalRec");
    var group = document.getElementById("evModalRecUntilGroup");
    if (recSelect && group) {
      group.style.display = recSelect.value === "none" ? "none" : "flex";
    }
  }
  function resetReminderControls() {
    document.getElementById("evModalRemAddBtn").style.display = "inline-block";
    document.getElementById("evModalRemSelectorGroup").style.display = "none";
    document.getElementById("evModalRemCustomGroup").style.display = "none";
    document.getElementById("evModalRemSelect").value = "";
    document.getElementById("evModalRemCustomVal").value = "";
  }
  function renderReminderPills() {
    var list = document.getElementById("evModalRemList");
    if (!list) return;
    list.innerHTML = "";
    if (activeReminders.length === 0) {
      list.innerHTML = '<span class="muted" style="font-size:12px; font-style:italic;">No reminders set</span>';
      return;
    }
    activeReminders.sort(function(a, b) {
      return a - b;
    });
    activeReminders.forEach(function(offset) {
      var text = "";
      if (offset === 0) {
        text = "At start";
      } else if (offset < 60) {
        text = offset + "m before";
      } else if (offset % 60 === 0) {
        text = offset / 60 + "h before";
      } else {
        text = offset + "m before";
      }
      var pill = document.createElement("div");
      pill.style.cssText = "background:var(--panel2); border:1px solid var(--border); border-radius:12px; padding:3px 8px; font-size:11.5px; display:inline-flex; align-items:center; gap:6px; color:var(--text);";
      pill.innerHTML = "<span>" + esc(text) + '</span><span class="remove-btn" style="cursor:pointer; color:var(--muted); font-weight:bold; font-size:11px;">\u2715</span>';
      pill.querySelector(".remove-btn").addEventListener("click", function() {
        activeReminders = activeReminders.filter(function(x) {
          return x !== offset;
        });
        renderReminderPills();
      });
      pill.querySelector(".remove-btn").addEventListener("mouseenter", function() {
        this.style.color = "var(--red)";
      });
      pill.querySelector(".remove-btn").addEventListener("mouseleave", function() {
        this.style.color = "var(--muted)";
      });
      list.appendChild(pill);
    });
  }
  function openAdd(iso, defaultStart, defaultEnd) {
    document.getElementById("eventModal").style.display = "flex";
    document.getElementById("evModalTitleText").textContent = "Add Event";
    document.getElementById("evModalId").value = "";
    document.getElementById("evModalTitle").value = "";
    document.getElementById("evModalType").value = "study";
    document.getElementById("evModalDate").value = iso;
    document.getElementById("evModalStart").value = defaultStart || "";
    document.getElementById("evModalEnd").value = defaultEnd || "";
    document.getElementById("evModalDesc").value = "";
    document.getElementById("evModalLoc").value = "";
    document.getElementById("evModalRec").value = "none";
    document.getElementById("evModalRecUntil").value = "";
    document.getElementById("evModalDelBtn").style.display = "none";
    activeReminders = [];
    renderReminderPills();
    resetReminderControls();
    updateDurationFromTimes();
    updateRecurrenceVisibility();
    document.getElementById("evModalTitle").focus();
  }
  function editEvent(id) {
    if (isResizing) return;
    var e = S.events.find(function(x) {
      return x.id === id;
    });
    if (!e) return;
    document.getElementById("eventModal").style.display = "flex";
    document.getElementById("evModalTitleText").textContent = "Edit Event";
    document.getElementById("evModalId").value = e.id;
    document.getElementById("evModalTitle").value = e.title || "";
    document.getElementById("evModalType").value = e.type || "other";
    document.getElementById("evModalDate").value = e.date || "";
    document.getElementById("evModalStart").value = e.start || "";
    document.getElementById("evModalEnd").value = e.end || "";
    document.getElementById("evModalDesc").value = e.description || "";
    document.getElementById("evModalLoc").value = e.location || "";
    document.getElementById("evModalRec").value = e.recurrence || "none";
    document.getElementById("evModalRecUntil").value = e.recurrence_until || "";
    document.getElementById("evModalDelBtn").style.display = "block";
    activeReminders = [];
    if (e.reminder_offset !== void 0 && e.reminder_offset !== null) {
      var raw = e.reminder_offset.toString().trim();
      if (raw !== "-1" && raw !== "") {
        activeReminders = raw.split(",").map(function(x) {
          return parseInt(x.trim(), 10);
        }).filter(function(x) {
          return !isNaN(x) && x >= 0;
        });
      }
    }
    renderReminderPills();
    resetReminderControls();
    updateDurationFromTimes();
    updateRecurrenceVisibility();
    document.getElementById("evModalTitle").focus();
  }
  function closeEventModal() {
    document.getElementById("eventModal").style.display = "none";
  }
  async function saveEventModal(refresh2) {
    var id = document.getElementById("evModalId").value;
    var title = document.getElementById("evModalTitle").value.trim();
    if (!title) return;
    var data = {
      title,
      type: document.getElementById("evModalType").value,
      date: document.getElementById("evModalDate").value,
      start: document.getElementById("evModalStart").value,
      end: document.getElementById("evModalEnd").value,
      description: document.getElementById("evModalDesc").value,
      location: document.getElementById("evModalLoc").value,
      recurrence: document.getElementById("evModalRec").value,
      recurrence_until: document.getElementById("evModalRecUntil").value,
      reminder_offset: activeReminders.length > 0 ? activeReminders.join(",") : -1,
      source: "local"
    };
    closeEventModal();
    var tempId = null;
    if (id) {
      var eIdx = S.events.findIndex(function(x) {
        return x.id == id;
      });
      if (eIdx !== -1) {
        S.events[eIdx] = Object.assign({}, S.events[eIdx], data);
      }
    } else {
      tempId = "temp_" + Date.now();
      var tempEvent = Object.assign({ id: tempId }, data);
      S.events.push(tempEvent);
    }
    renderPlanner();
    renderDashboard();
    try {
      if (id) {
        await api("PUT", "/api/events/" + id, data);
      } else {
        var res = await api("POST", "/api/events", data);
        var tempIdx = S.events.findIndex(function(x) {
          return x.id === tempId;
        });
        if (tempIdx !== -1) {
          if (res && res.id) {
            S.events[tempIdx].id = res.id;
          } else {
            if (refresh2) await refresh2();
            else if (plannerRefresh) await plannerRefresh();
            return;
          }
        }
      }
      if (refresh2) refresh2();
      else if (plannerRefresh) plannerRefresh();
    } catch (err) {
      console.error("Failed to save event:", err);
      if (refresh2) await refresh2();
      else if (plannerRefresh) await plannerRefresh();
    }
  }
  async function delEventModal(refresh2) {
    var id = document.getElementById("evModalId").value;
    if (!id) return;
    closeEventModal();
    var eventToDelete = S.events.find(function(x) {
      return x.id == id;
    });
    if (eventToDelete) {
      var deletedEvent = Object.assign({}, eventToDelete);
      var postData = Object.assign({}, deletedEvent);
      delete postData.virtualDate;
      delete postData._left;
      delete postData._width;
      var undoCallback = async function() {
        S.events.push(deletedEvent);
        renderPlanner();
        renderDashboard();
        try {
          var res = await api("POST", "/api/events", postData);
          if (res && res.id) {
            var idx = S.events.findIndex(function(x) {
              return x.id === deletedEvent.id;
            });
            if (idx !== -1) {
              S.events[idx].id = res.id;
            }
          }
          if (refresh2) refresh2();
          else if (plannerRefresh) plannerRefresh();
        } catch (err) {
          console.error("Undo delete failed:", err);
          if (refresh2) await refresh2();
          else if (plannerRefresh) await plannerRefresh();
        }
      };
      showUndoToast("Event deleted", undoCallback);
    }
    S.events = S.events.filter(function(x) {
      return x.id != id;
    });
    renderPlanner();
    renderDashboard();
    try {
      await api("DELETE", "/api/events/" + id);
      if (refresh2) refresh2();
      else if (plannerRefresh) plannerRefresh();
    } catch (err) {
      console.error("Failed to delete event:", err);
      if (refresh2) await refresh2();
      else if (plannerRefresh) await plannerRefresh();
    }
  }
  function saveShortcuts() {
    var newShortcuts = {};
    var duplicate = false;
    var keysSeen = {};
    document.querySelectorAll(".shortcut-input").forEach(function(input) {
      var action = input.getAttribute("data-action");
      var val = input.value.trim();
      if (action && val) {
        newShortcuts[action] = val;
        if (keysSeen[val]) {
          duplicate = true;
        }
        keysSeen[val] = true;
      }
    });
    if (duplicate) {
      alert("Warning: Multiple actions are assigned to the same key! Please resolve duplicates before saving.");
      return;
    }
    shortcuts = Object.assign({}, defaultShortcuts, newShortcuts);
    try {
      localStorage.setItem("tylo_shortcuts", JSON.stringify(shortcuts));
    } catch (e) {
    }
    window.dispatchEvent(new CustomEvent("close-shortcuts-modal"));
  }
  function resetShortcutsToDefault() {
    if (confirm("Reset all shortcuts to defaults?")) {
      shortcuts = Object.assign({}, defaultShortcuts);
      try {
        localStorage.removeItem("tylo_shortcuts");
      } catch (e) {
      }
      document.querySelectorAll(".shortcut-input").forEach(function(input) {
        var action = input.getAttribute("data-action");
        if (action && shortcuts[action] !== void 0) {
          input.value = shortcuts[action];
        }
      });
    }
  }
  function showUndoToast(message, undoCallback) {
    var existing = document.getElementById("undoToast");
    if (existing) {
      existing.remove();
    }
    if (undoToastTimeout) {
      clearTimeout(undoToastTimeout);
    }
    currentUndoAction = undoCallback;
    var toastEl = document.createElement("div");
    toastEl.id = "undoToast";
    toastEl.className = "toast";
    toastEl.style.display = "flex";
    toastEl.style.alignItems = "center";
    toastEl.style.gap = "12px";
    toastEl.innerHTML = "<span>" + esc(message) + '</span><button class="btn small" style="padding:2px 8px; font-size:11px; background:var(--accent); color:#fff; border:none; border-radius:4px; cursor:pointer;" onclick="triggerUndo()">Undo</button>';
    document.body.appendChild(toastEl);
    undoToastTimeout = setTimeout(function() {
      toastEl.remove();
      currentUndoAction = null;
    }, 6e3);
  }
  function searchEvents() {
    var q = document.getElementById("plannerSearch").value.trim().toLowerCase();
    var resultsDiv = document.getElementById("plannerSearchResults");
    if (!resultsDiv) return;
    if (!q) {
      resultsDiv.style.display = "none";
      resultsDiv.innerHTML = "";
      return;
    }
    var matches = S.events.filter(function(e) {
      return (e.title || "").toLowerCase().indexOf(q) !== -1 || (e.location || "").toLowerCase().indexOf(q) !== -1 || (e.description || "").toLowerCase().indexOf(q) !== -1;
    });
    matches.sort(function(a, b) {
      var da = a.date || "";
      var db = b.date || "";
      if (da !== db) return db.localeCompare(da);
      return (a.start || "").localeCompare(b.start || "");
    });
    if (matches.length === 0) {
      resultsDiv.innerHTML = '<div style="padding:8px 12px; font-size:12px; color:var(--muted);">No matching events</div>';
    } else {
      var html = "";
      matches.slice(0, 20).forEach(function(e) {
        var dateStr = e.date;
        try {
          var d = /* @__PURE__ */ new Date(e.date + "T00:00:00");
          if (isNaN(d.getTime())) d = new Date(e.date);
          if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
          }
        } catch (err) {
        }
        var timeStr = e.start && e.end ? e.start + " \u2013 " + e.end : "All Day";
        var locStr = e.location ? " \u{1F4CD} " + e.location : "";
        html += `<div class="search-result-item" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); transition:background 0.2s;" onclick="navigateToAndEditEvent('` + e.id + "', '" + e.date + `')"><div style="font-weight:600; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">` + esc(e.title) + '</div><div style="font-size:11px; color:var(--muted); margin-top:2px;">' + dateStr + " \u2022 " + timeStr + esc(locStr) + "</div></div>";
      });
      resultsDiv.innerHTML = html;
    }
    resultsDiv.style.display = "block";
  }
  function handlePlannerSearchKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var resultsDiv = document.getElementById("plannerSearchResults");
      if (resultsDiv && resultsDiv.style.display !== "none") {
        var firstItem = resultsDiv.querySelector(".search-result-item");
        if (firstItem) {
          firstItem.click();
        }
      }
    }
  }
  function hideSearchSoon() {
    setTimeout(function() {
      var resultsDiv = document.getElementById("plannerSearchResults");
      if (resultsDiv) resultsDiv.style.display = "none";
    }, 200);
  }
  function navigateToAndEditEvent(id, date) {
    var tabBtn = document.querySelector('#tabs button[data-tab="planner"]');
    if (tabBtn) {
      tabBtn.click();
    }
    var now = /* @__PURE__ */ new Date();
    var target = /* @__PURE__ */ new Date(date + "T00:00:00");
    if (isNaN(target.getTime())) {
      target = new Date(date);
    }
    if (currentView === "month") {
      var monthsDiff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
      dateOffset = monthsDiff;
    } else {
      var days = parseInt(currentView, 10) || 7;
      if (days === 7) {
        var dow = (now.getDay() + 6) % 7;
        var currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
        currentMonday.setHours(0, 0, 0, 0);
        var targetDow = (target.getDay() + 6) % 7;
        var targetMonday = new Date(target.getFullYear(), target.getMonth(), target.getDate() - targetDow);
        targetMonday.setHours(0, 0, 0, 0);
        var diffMs = targetMonday - currentMonday;
        dateOffset = Math.round(diffMs / (7 * 24 * 60 * 60 * 1e3));
      } else {
        var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        todayStart.setHours(0, 0, 0, 0);
        var targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        targetStart.setHours(0, 0, 0, 0);
        var diffDays = Math.round((targetStart - todayStart) / (24 * 60 * 60 * 1e3));
        dateOffset = Math.floor(diffDays / days);
      }
    }
    renderPlanner();
    editEvent(id);
    var resultsDiv = document.getElementById("plannerSearchResults");
    if (resultsDiv) resultsDiv.style.display = "none";
    var searchInput = document.getElementById("plannerSearch");
    if (searchInput) searchInput.value = "";
  }
  var dateOffset, plannerRefresh, currentView, scrolledToCurrentTimeThisSession, isResizing, lastScrollTop, activeReminders, isRendering, draggingEventId, draggingOffsetY, currentUndoAction, undoToastTimeout, dragPreviewEl, defaultShortcuts, shortcuts, stored;
  var init_planner = __esm({
    "static/js/planner.js"() {
      init_state();
      init_utils();
      init_utils();
      init_dashboard();
      dateOffset = 0;
      plannerRefresh = null;
      currentView = "7";
      scrolledToCurrentTimeThisSession = false;
      isResizing = false;
      lastScrollTop = null;
      activeReminders = [];
      isRendering = false;
      draggingEventId = null;
      draggingOffsetY = 0;
      currentUndoAction = null;
      undoToastTimeout = null;
      dragPreviewEl = null;
      defaultShortcuts = {
        today: "t",
        weekView: "w",
        dayView: "d",
        monthView: "m",
        next: "n",
        prev: "p",
        create: "c"
      };
      shortcuts = Object.assign({}, defaultShortcuts);
      try {
        stored = localStorage.getItem("tylo_shortcuts");
        if (stored) {
          Object.assign(shortcuts, JSON.parse(stored));
        }
      } catch (e) {
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initTabListener);
      } else {
        initTabListener();
      }
      window.addEventListener("open-shortcuts-modal", function() {
        document.querySelectorAll(".shortcut-input").forEach(function(input) {
          var action = input.getAttribute("data-action");
          if (action && shortcuts[action] !== void 0) {
            input.value = shortcuts[action];
          }
        });
      });
      window.triggerUndo = function() {
        if (currentUndoAction) {
          currentUndoAction();
          currentUndoAction = null;
        }
        var toastEl = document.getElementById("undoToast");
        if (toastEl) {
          toastEl.remove();
        }
      };
    }
  });

  // static/js/tasks.js
  async function addTask(refresh2) {
    var n = document.getElementById("taskName").value.trim();
    if (!n) return;
    var cat = document.getElementById("taskCategory").value || null;
    var d = document.getElementById("taskDue").value;
    var dueStr = d ? d.substring(0, 10) : null;
    var maxOrder = -1;
    if (S.tasks && S.tasks.length) {
      S.tasks.forEach(function(t) {
        if (!t.parent_id && t.order_index > maxOrder) maxOrder = t.order_index;
      });
    }
    var orderIndex = maxOrder + 1;
    await api("POST", "/api/tasks", {
      name: n,
      done: 0,
      created: todayStr(),
      due: dueStr,
      due_date: d || null,
      category: cat,
      order_index: orderIndex
    });
    document.getElementById("taskName").value = "";
    document.getElementById("taskDue").value = "";
    var catSelect = document.getElementById("taskCategory");
    if (catSelect) catSelect.value = "";
    await refresh2();
  }
  async function addSubtask(parentId, refresh2) {
    var inputEl = document.getElementById("subtask-input-" + parentId);
    if (!inputEl) return;
    var n = inputEl.value.trim();
    if (!n) return;
    await api("POST", "/api/tasks", {
      name: n,
      done: 0,
      created: todayStr(),
      parent_id: parentId
    });
    inputEl.value = "";
    await refresh2();
  }
  async function toggleTask(id, done, refresh2) {
    await api("PUT", "/api/tasks/" + id, { done: done ? 1 : 0, completed_at: done ? todayStr() : null });
    await refresh2();
  }
  function dragTaskStart(e, id) {
    e.dataTransfer.setData("text/plain", id);
    setTimeout(function() {
      var el = document.querySelector('[data-id="' + id + '"]');
      if (el) el.classList.add("dragging");
    }, 0);
  }
  function dragTaskOver(e) {
    e.preventDefault();
  }
  function dragTaskEnd(e) {
    var rows = document.querySelectorAll(".task-card");
    rows.forEach(function(row) {
      row.classList.remove("dragging");
    });
  }
  async function dropTask(e, dropId, refresh2) {
    e.preventDefault();
    var dragId = e.dataTransfer.getData("text/plain");
    if (dragId && dragId !== dropId) {
      await reorderTasks(dragId, dropId, refresh2);
    }
  }
  async function reorderTasks(dragId, dropId, refresh2) {
    var parentTasks = S.tasks.filter(function(t) {
      return !t.parent_id;
    });
    parentTasks.sort(function(a, b) {
      return (a.order_index || 0) - (b.order_index || 0);
    });
    var dragIndex = parentTasks.findIndex(function(t) {
      return t.id === dragId;
    });
    var dropIndex = parentTasks.findIndex(function(t) {
      return t.id === dropId;
    });
    if (dragIndex === -1 || dropIndex === -1 || dragIndex === dropIndex) return;
    var [draggedTask] = parentTasks.splice(dragIndex, 1);
    parentTasks.splice(dropIndex, 0, draggedTask);
    var promises = parentTasks.map(function(t, idx) {
      if (t.order_index !== idx) {
        t.order_index = idx;
        return api("PUT", "/api/tasks/" + t.id, { order_index: idx });
      }
      return Promise.resolve();
    });
    await Promise.all(promises);
    await refresh2();
  }
  async function addModalCategory(refresh2) {
    var input = document.getElementById("modalCategoryInput");
    var colorInput = document.getElementById("modalCategoryColor");
    if (!input) return;
    var newCat = input.value.trim();
    if (!newCat) return;
    var newColor = colorInput ? colorInput.value : "#4f8cff";
    var cats = getTaskCategories();
    var exists = cats.some(function(c) {
      return c.name.toLowerCase() === newCat.toLowerCase();
    });
    if (!exists) {
      cats.push({ name: newCat, color: newColor });
      var obj = {};
      cats.forEach(function(c) {
        obj[c.name] = c.color;
      });
      await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
      input.value = "";
      if (colorInput) colorInput.value = "#4f8cff";
      await refresh2();
    }
  }
  async function deleteModalCategory(catName, refresh2) {
    var cats = getTaskCategories();
    var idx = cats.findIndex(function(c) {
      return c.name === catName;
    });
    if (idx !== -1) {
      cats.splice(idx, 1);
      var obj = {};
      cats.forEach(function(c) {
        obj[c.name] = c.color;
      });
      await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
      await refresh2();
    }
  }
  async function updateModalCategoryColor(name, color, refresh2) {
    var cats = getTaskCategories();
    var cat = cats.find(function(c) {
      return c.name === name;
    });
    if (cat) {
      cat.color = color;
      var obj = {};
      cats.forEach(function(c) {
        obj[c.name] = c.color;
      });
      await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
      await refresh2();
    }
  }
  async function renameModalCategory(oldName, newName, refresh2) {
    newName = newName.trim();
    if (!newName || oldName === newName) {
      await refresh2();
      return;
    }
    var cats = getTaskCategories();
    var exists = cats.some(function(c) {
      return c.name.toLowerCase() === newName.toLowerCase();
    });
    if (exists) {
      alert("Category already exists");
      await refresh2();
      return;
    }
    var cat = cats.find(function(c) {
      return c.name === oldName;
    });
    if (cat) {
      cat.name = newName;
      var obj = {};
      cats.forEach(function(c) {
        obj[c.name] = c.color;
      });
      await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
      var tasksToUpdate = S.tasks.filter(function(t) {
        return t.category === oldName;
      });
      var promises = tasksToUpdate.map(function(t) {
        return api("PUT", "/api/tasks/" + t.id, { category: newName });
      });
      await Promise.all(promises);
      await refresh2();
    }
  }
  function openTaskModal(id) {
    var t = S.tasks.find(function(x) {
      return x.id === id;
    });
    if (!t) return;
    document.getElementById("editTaskId").value = t.id;
    document.getElementById("editTaskName").value = t.name || "";
    document.getElementById("editTaskCategory").value = t.category || "";
    document.getElementById("editTaskDue").value = t.due_date || "";
    document.getElementById("taskModal").style.display = "flex";
  }
  function closeTaskModal() {
    document.getElementById("taskModal").style.display = "none";
  }
  async function saveTaskModal(refresh2) {
    var id = document.getElementById("editTaskId").value;
    var name = document.getElementById("editTaskName").value.trim();
    var category = document.getElementById("editTaskCategory").value || null;
    var due_date = document.getElementById("editTaskDue").value || null;
    var due = due_date ? due_date.substring(0, 10) : null;
    if (!name) return;
    await api("PUT", "/api/tasks/" + id, {
      name,
      category,
      due_date,
      due
    });
    closeTaskModal();
    await refresh2();
  }
  function renderTasks() {
    var cats = getTaskCategories();
    var selectEl = document.getElementById("taskCategory");
    if (selectEl) {
      var currentVal = selectEl.value;
      var optHtml = '<option value="">Category (opt.)</option>';
      cats.forEach(function(c) {
        optHtml += '<option value="' + esc(c.name) + '">' + esc(c.name) + "</option>";
      });
      selectEl.innerHTML = optHtml;
      selectEl.value = currentVal;
    }
    var editSelectEl = document.getElementById("editTaskCategory");
    if (editSelectEl) {
      var editCurrentVal = editSelectEl.value;
      var optHtml = '<option value="">Category (opt.)</option>';
      cats.forEach(function(c) {
        optHtml += '<option value="' + esc(c.name) + '">' + esc(c.name) + "</option>";
      });
      editSelectEl.innerHTML = optHtml;
      editSelectEl.value = editCurrentVal;
    }
    var modalListEl = document.getElementById("modalCategoriesList");
    if (modalListEl) {
      var catsHtml = "";
      cats.forEach(function(cat) {
        catsHtml += '<div class="list-item" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;"><input type="color" value="' + esc(cat.color) + `" onchange="updateModalCategoryColor('` + esc(cat.name).replace(/'/g, "\\'") + `', this.value)" style="width:28px; height:24px; padding:0; border:none; background:none; cursor:pointer;"><input type="text" value="` + esc(cat.name) + `" onchange="renameModalCategory('` + esc(cat.name).replace(/'/g, "\\'") + `', this.value)" style="flex:1; font-size:13px; padding:2px 6px; border:1px solid var(--border); border-radius:4px; background:var(--panel2); color:var(--text);"><button class="btn danger small" onclick="deleteModalCategory('` + esc(cat.name).replace(/'/g, "\\'") + `')">\u2715</button></div>`;
      });
      modalListEl.innerHTML = catsHtml || '<div class="muted">No categories configured.</div>';
    }
    var parentTasks = S.tasks.filter(function(t) {
      return !t.parent_id;
    });
    parentTasks.sort(function(a, b) {
      return (a.order_index || 0) - (b.order_index || 0);
    });
    var html = "";
    parentTasks.forEach(function(t) {
      var catObj = cats.find(function(c) {
        return c.name === t.category;
      });
      var color = catObj ? catObj.color : "#4f8cff";
      var categoryBadge = t.category ? '<span class="badge" style="margin-right:8px; background-color:' + esc(color) + '; color:#fff; font-weight:600; padding:3px 8px; border-radius:4px;">' + esc(t.category) + "</span>" : "";
      var dueBadge = "";
      if (t.due_date) {
        var now = /* @__PURE__ */ new Date();
        var dueDt = new Date(t.due_date);
        var isOverdue = !t.done && dueDt < now;
        var formattedDue = t.due_date.replace("T", " ");
        var badgeClass = isOverdue ? "red" : "gray";
        dueBadge = '<span class="badge ' + badgeClass + '" style="margin-right:8px">' + esc(formattedDue) + "</span>";
      } else if (t.due) {
        var nowStr = todayStr();
        var isOverdue = !t.done && t.due < nowStr;
        var badgeClass = isOverdue ? "red" : "gray";
        dueBadge = '<span class="badge ' + badgeClass + '" style="margin-right:8px">' + esc(t.due) + "</span>";
      }
      var subtasks = S.tasks.filter(function(sub) {
        return sub.parent_id === t.id;
      });
      var subtasksHtml = "";
      subtasks.forEach(function(sub) {
        subtasksHtml += '<div class="subtask-row"><span class="hcheck' + (sub.done ? " on" : "") + `" onclick="toggleTask('` + sub.id + "'," + !sub.done + ')">' + (sub.done ? "\u2713" : "") + '</span><span class="subtask-name' + (sub.done ? " done" : "") + '" style="flex:1">' + esc(sub.name) + `</span><button class="btn ghost small" style="padding: 1px 4px; font-size: 10px; margin-right: 4px;" onclick="openTaskModal('` + sub.id + `')">\u270F\uFE0F</button><button class="btn danger small" style="padding:1px 5px; font-size:10px;" onclick="delRow('tasks','` + sub.id + `')">\u2715</button></div>`;
      });
      html += '<div class="task-card" draggable="true" data-id="' + t.id + `" ondragstart="dragTaskStart(event,'` + t.id + `')" ondragover="dragTaskOver(event)" ondrop="dropTask(event,'` + t.id + `')" ondragend="dragTaskEnd(event)"><div class="task-header"><span class="task-drag-handle" style="cursor:grab; color:var(--muted)">\u2630</span><span class="hcheck` + (t.done ? " on" : "") + `" onclick="toggleTask('` + t.id + "'," + !t.done + ')">' + (t.done ? "\u2713" : "") + '</span><span class="task-name' + (t.done ? " done" : "") + '" style="flex:1">' + esc(t.name) + "</span>" + categoryBadge + dueBadge + `<button class="btn ghost small" style="padding: 2px 6px; margin-right: 4px;" onclick="openTaskModal('` + t.id + `')">\u270F\uFE0F</button><button class="btn danger small" onclick="delRow('tasks','` + t.id + `')">\u2715</button></div><div class="subtasks-container"><div class="subtasks-list">` + subtasksHtml + '</div><div class="subtask-add-row" style="display:flex; gap:6px; margin-top:6px;"><input type="text" placeholder="Add subtask..." class="subtask-input" id="subtask-input-' + t.id + `" style="font-size:12px; padding:2px 6px; flex:1" onkeydown="if(event.key==='Enter')addSubtask('` + t.id + `')"><button class="btn small" style="padding:2px 8px;" onclick="addSubtask('` + t.id + `')">+</button></div></div></div>`;
    });
    document.getElementById("taskList").innerHTML = html || '<div class="muted">Nothing to do. Nice.</div>';
  }
  var taskModalEl, categoriesModalEl;
  var init_tasks = __esm({
    "static/js/tasks.js"() {
      init_state();
      init_utils();
      init_settings();
      taskModalEl = document.getElementById("taskModal");
      if (taskModalEl) {
        taskModalEl.addEventListener("click", function(e) {
          if (e.target === this) {
            closeTaskModal();
          }
        });
        taskModalEl.addEventListener("keydown", function(e) {
          if (e.key === "Enter") {
            var target = e.target;
            if (target && target.tagName !== "BUTTON") {
              e.preventDefault();
              if (typeof window.saveTaskModal === "function") {
                window.saveTaskModal();
              }
            }
          }
        });
      }
      categoriesModalEl = document.getElementById("categoriesModal");
      if (categoriesModalEl) {
        categoriesModalEl.addEventListener("click", function(e) {
          if (e.target === this) {
            window.dispatchEvent(new CustomEvent("close-categories-modal"));
          }
        });
      }
      document.addEventListener("keydown", function(e) {
        if (e.key === "Escape") {
          var taskModal = document.getElementById("taskModal");
          if (taskModal && taskModal.style.display === "flex") {
            closeTaskModal();
          }
          var catsModal = document.getElementById("categoriesModal");
          if (catsModal && catsModal.style.display !== "none") {
            window.dispatchEvent(new CustomEvent("close-categories-modal"));
          }
        }
      });
    }
  });

  // static/js/notes.js
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function highlightText(text, q) {
    if (!q || !text) return esc(text || "");
    var res = "", lc = text.toLowerCase(), lq = q.toLowerCase(), i = 0;
    while (i < text.length) {
      var idx = lc.indexOf(lq, i);
      if (idx === -1) {
        res += esc(text.slice(i));
        break;
      }
      res += esc(text.slice(i, idx)) + "<mark>" + esc(text.slice(idx, idx + q.length)) + "</mark>";
      i = idx + q.length;
    }
    return res;
  }
  function highlightHtml(html, q) {
    if (!q) return html;
    var re = new RegExp("(" + escapeRegex(esc(q)) + ")(?![^<]*>)", "gi");
    return html.replace(re, "<mark>$1</mark>");
  }
  function configureMarked() {
    if (markedConfigured) return;
    var parser = window.marked || (typeof marked !== "undefined" ? marked : null);
    if (parser) {
      const wikiLink = {
        name: "wikiLink",
        level: "inline",
        start(src) {
          return src.indexOf("[[");
        },
        tokenizer(src, tokens) {
          const rule = /^\[\[([^\]]+)\]\]/;
          const match = rule.exec(src);
          if (match) {
            return {
              type: "wikiLink",
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
          if (note) return `<a href="#" class="note-link" onclick="openNote('` + note.id + `');return false;">` + esc(t) + "</a>";
          return '<span class="note-link-missing">' + esc(token.raw) + "</span>";
        }
      };
      parser.use({
        extensions: [wikiLink],
        renderer: {
          html(html) {
            return esc(html);
          }
        }
      });
      markedConfigured = true;
    }
  }
  function mdToHtml2(text) {
    if (!text) return "";
    configureMarked();
    var parser = window.marked || (typeof marked !== "undefined" ? marked : null);
    if (parser && typeof parser.parse === "function") {
      return parser.parse(text);
    }
    return esc(text);
  }
  function formatTime2(timestamp) {
    var d = new Date(timestamp);
    return z(d.getHours()) + ":" + z(d.getMinutes()) + ":" + z(d.getSeconds());
  }
  function getWordCount(text) {
    if (!text) return 0;
    var cleanText = text.trim();
    if (cleanText === "") return 0;
    return cleanText.split(/\s+/).length;
  }
  function updateCountersAndPreview() {
    var ta = document.getElementById("noteBody");
    if (!ta) return;
    var text = ta.value || "";
    var wordCount = getWordCount(text);
    var charCount = text.length;
    var wcEl = document.getElementById("noteWordCount");
    var ccEl = document.getElementById("noteCharCount");
    if (wcEl) wcEl.textContent = wordCount + " " + (wordCount === 1 ? "word" : "words");
    if (ccEl) ccEl.textContent = charCount + " " + (charCount === 1 ? "character" : "characters");
    renderNoteView();
  }
  function toggleNoteMode() {
  }
  function toggleNoteReadMode() {
    if (!currentNote) return;
    var toggle = document.getElementById("noteReadToggle");
    var isRead = toggle ? toggle.checked : false;
    localStorage.setItem("note_read_mode_" + currentNote, isRead ? "true" : "false");
    applyNoteLayout();
  }
  function toggleNoteSplitOnly() {
    if (!currentNote) return;
    var check = document.getElementById("noteSplitCheck");
    if (!check) return;
    var isSplit = !check.classList.contains("on");
    if (isSplit) {
      check.classList.add("on");
      check.textContent = "\u2713";
    } else {
      check.classList.remove("on");
      check.textContent = "";
    }
    localStorage.setItem("note_split_view_" + currentNote, isSplit ? "true" : "false");
    applyNoteLayout();
  }
  function applyNoteLayout() {
    var readToggle = document.getElementById("noteReadToggle");
    var splitCheck = document.getElementById("noteSplitCheck");
    var isRead = readToggle ? readToggle.checked : false;
    var isSplit = splitCheck ? splitCheck.classList.contains("on") : true;
    var ta = document.getElementById("noteBody");
    var view = document.getElementById("noteView");
    var toolbar = document.getElementById("noteToolbar");
    var searchBar = document.querySelector(".note-search-bar");
    var splitPane = document.querySelector(".note-split-pane");
    if (isRead) {
      if (ta) ta.style.display = "none";
      if (view) view.style.display = "";
      if (toolbar) toolbar.style.display = "none";
      if (searchBar) {
        searchBar.style.display = "";
        searchBar.classList.add("read-mode-search");
      }
      if (splitPane) splitPane.style.gridTemplateColumns = "1fr";
    } else {
      if (ta) ta.style.display = "";
      if (toolbar) toolbar.style.display = "";
      if (searchBar) {
        searchBar.style.display = "";
        searchBar.classList.remove("read-mode-search");
      }
      if (isSplit) {
        if (view) view.style.display = "";
        if (splitPane) splitPane.style.gridTemplateColumns = "";
      } else {
        if (view) view.style.display = "none";
        if (splitPane) splitPane.style.gridTemplateColumns = "1fr";
      }
    }
  }
  function renderNoteView() {
    var ta = document.getElementById("noteBody");
    var view = document.getElementById("noteView");
    var cnt = document.getElementById("noteBodySearchCount");
    var q = (noteBodySearch.q || "").toLowerCase().trim();
    var html = mdToHtml2(ta ? ta.value : "");
    if (q) html = highlightHtml(html, q);
    if (view) view.innerHTML = html;
    if (view) {
      var marks = view.querySelectorAll("mark");
      var n = marks.length;
      if (noteBodySearch.idx >= n) noteBodySearch.idx = 0;
      if (marks[noteBodySearch.idx]) marks[noteBodySearch.idx].className = "cur";
      if (cnt) cnt.textContent = q ? n ? noteBodySearch.idx + 1 + "/" + n : "0 results" : "";
    }
  }
  function applyNoteMode() {
    updateCountersAndPreview();
    applyNoteLayout();
    var q = (noteBodySearch.q || "").toLowerCase().trim();
    var cnt = document.getElementById("noteBodySearchCount");
    var view = document.getElementById("noteView");
    if (cnt) {
      if (q && view) {
        var marks = view.querySelectorAll("mark");
        var n = marks.length;
        noteBodySearch.idx = Math.min(noteBodySearch.idx, Math.max(0, n - 1));
        cnt.textContent = n ? noteBodySearch.idx + 1 + "/" + n : "0 results";
      } else {
        cnt.textContent = "";
      }
    }
  }
  function noteInsert(type) {
    var ta = document.getElementById("noteBody");
    if (!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd, val = ta.value, sel = val.slice(s, e);
    var newVal, pos, ls;
    if (type === "bold") {
      newVal = val.slice(0, s) + "**" + sel + "**" + val.slice(e);
      pos = sel ? s + 2 + sel.length + 2 : s + 2;
    } else if (type === "italic") {
      newVal = val.slice(0, s) + "*" + sel + "*" + val.slice(e);
      pos = sel ? s + 1 + sel.length + 1 : s + 1;
    } else if (type === "heading") {
      ls = val.lastIndexOf("\n", s - 1) + 1;
      newVal = val.slice(0, ls) + "# " + val.slice(ls);
      pos = s + 2;
    } else if (type === "list") {
      ls = val.lastIndexOf("\n", s - 1) + 1;
      newVal = val.slice(0, ls) + "- " + val.slice(ls);
      pos = s + 2;
    } else if (type === "numlist") {
      ls = val.lastIndexOf("\n", s - 1) + 1;
      newVal = val.slice(0, ls) + "1. " + val.slice(ls);
      pos = s + 3;
    } else {
      var pre = s > 0 && val[s - 1] !== "\n" ? "\n" : "";
      var ins = pre + "---\n";
      newVal = val.slice(0, s) + ins + val.slice(s);
      pos = s + ins.length;
    }
    ta.value = newVal;
    ta.selectionStart = ta.selectionEnd = pos;
    ta.focus();
    noteChanged();
  }
  async function newNote(refresh2) {
    noteMode = "edit";
    var r = await api("POST", "/api/notes", { title: "", body: "", updated: Date.now() });
    currentNote = r.id;
    localStorage.setItem("active_note_id", r.id);
    await refresh2();
    var titleEl = document.getElementById("noteTitle");
    if (titleEl) titleEl.focus();
  }
  function openNote(id) {
    var btn = document.querySelector("#tabs button[data-tab='notes']");
    if (btn) btn.click();
    selectNote(id);
  }
  function selectNote(id) {
    if (noteTimer && currentNote && currentNote !== id) {
      var pendingNoteId = currentNote;
      var pendingTitle = document.getElementById("noteTitle").value;
      var pendingBody = document.getElementById("noteBody").value;
      clearTimeout(noteTimer);
      noteTimer = null;
      var updatedTime = Date.now();
      api("PUT", "/api/notes/" + pendingNoteId, {
        title: pendingTitle,
        body: pendingBody,
        updated: updatedTime
      }).then(function() {
        var n = S.notes.find(function(x) {
          return x.id === pendingNoteId;
        });
        if (n) {
          n.title = pendingTitle;
          n.body = pendingBody;
          n.updated = updatedTime;
        }
        renderNoteList();
      }).catch(console.error);
    }
    currentNote = id;
    localStorage.setItem("active_note_id", id);
    renderNotes();
  }
  function noteChanged() {
    clearTimeout(noteTimer);
    updateCountersAndPreview();
    var statusEl = document.getElementById("noteSaveStatus");
    if (statusEl) {
      statusEl.textContent = "Typing...";
      statusEl.className = "note-status typing";
    }
    var pendingNoteId = currentNote;
    var pendingTitle = document.getElementById("noteTitle").value;
    var pendingBody = document.getElementById("noteBody").value;
    noteTimer = setTimeout(async function() {
      if (!pendingNoteId) return;
      if (statusEl && currentNote === pendingNoteId) {
        statusEl.textContent = "Saving...";
        statusEl.className = "note-status saving";
      }
      try {
        var updatedTime = Date.now();
        await api("PUT", "/api/notes/" + pendingNoteId, {
          title: pendingTitle,
          body: pendingBody,
          updated: updatedTime
        });
        var n = S.notes.find(function(x) {
          return x.id === pendingNoteId;
        });
        if (n) {
          n.title = pendingTitle;
          n.body = pendingBody;
          n.updated = updatedTime;
        }
        renderNoteList();
        if (statusEl && currentNote === pendingNoteId) {
          statusEl.textContent = "Saved at " + formatTime2(updatedTime);
          statusEl.className = "note-status saved";
        }
      } catch (err) {
        if (statusEl && currentNote === pendingNoteId) {
          statusEl.textContent = "Error saving";
          statusEl.className = "note-status danger";
        }
        console.error(err);
      }
    }, 500);
  }
  async function deleteNote(refresh2) {
    if (!confirm("Delete this note?")) return;
    await api("DELETE", "/api/notes/" + currentNote);
    currentNote = null;
    localStorage.removeItem("active_note_id");
    await refresh2();
  }
  async function toggleNotePin(id, ev) {
    ev.stopPropagation();
    var n = S.notes.find(function(x) {
      return x.id === id;
    });
    if (!n) return;
    var newPinned = n.is_pinned ? 0 : 1;
    await api("PUT", "/api/notes/" + id, { is_pinned: newPinned });
    n.is_pinned = newPinned;
    renderNoteList();
  }
  function noteSearchInput() {
    renderNoteList();
  }
  function handleNoteSearchKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var listEl = document.getElementById("noteList");
      if (listEl) {
        var firstItem = listEl.querySelector(".list-item");
        if (firstItem) {
          firstItem.click();
        }
      }
    }
  }
  function noteBodySearchInput() {
    var searchEl = document.getElementById("noteBodySearch");
    noteBodySearch.q = searchEl ? searchEl.value : "";
    noteBodySearch.idx = 0;
    applyNoteBodySearch(noteBodySearch.q.trim().length > 0);
  }
  function handleNoteBodySearchKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      noteBodySearchNav(1);
    }
  }
  function noteBodySearchNav(dir) {
    var q = (noteBodySearch.q || "").toLowerCase().trim();
    if (!q) return;
    var view = document.getElementById("noteView");
    var n = view ? view.querySelectorAll("mark").length : 0;
    if (!n) return;
    noteBodySearch.idx = (noteBodySearch.idx + dir + n) % n;
    applyNoteBodySearch(true);
  }
  function applyNoteBodySearch(jump) {
    var q = (noteBodySearch.q || "").toLowerCase().trim();
    var ta = document.getElementById("noteBody");
    var cnt = document.getElementById("noteBodySearchCount");
    if (!ta) return;
    renderNoteView();
    if (jump && q) {
      var view = document.getElementById("noteView");
      if (view) {
        var marks = view.querySelectorAll("mark");
        if (marks[noteBodySearch.idx]) {
          marks[noteBodySearch.idx].scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
  }
  function renderNoteList() {
    var searchEl = document.getElementById("noteSearch");
    var q = (searchEl ? searchEl.value : "").trim().toLowerCase();
    var list = S.notes.slice().sort(function(a, b) {
      if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
      return (b.updated || 0) - (a.updated || 0);
    });
    if (q) list = list.filter(function(n) {
      return (n.title || "").toLowerCase().indexOf(q) !== -1 || (n.body || "").toLowerCase().indexOf(q) !== -1;
    });
    var html = "";
    list.forEach(function(n) {
      var title = n.title ? highlightText(n.title, q) : '<span class="muted">Untitled</span>';
      var snippet = "";
      if (q && (n.body || "").toLowerCase().indexOf(q) !== -1) {
        var lc = (n.body || "").toLowerCase(), midx = lc.indexOf(q);
        var start = Math.max(0, midx - 35), end = Math.min((n.body || "").length, midx + q.length + 50);
        snippet = '<div class="muted" style="line-height:1.4;margin:2px 0">' + (start > 0 ? "\u2026" : "") + highlightText((n.body || "").slice(start, end), q) + (end < (n.body || "").length ? "\u2026" : "") + "</div>";
      }
      var pinned = n.is_pinned ? "note-pinned" : "";
      html += '<div class="list-item ' + pinned + (n.id === currentNote ? " sel" : "") + `" onclick="selectNote('` + n.id + `')"><button class="btn-pin" onclick="toggleNotePin('` + n.id + `',event)" title="` + (n.is_pinned ? "Unpin" : "Pin") + '">\u2605</button><div class="grow"><div>' + title + "</div>" + snippet + '<div class="muted">' + new Date(n.updated || 0).toLocaleDateString() + "</div></div></div>";
    });
    var noteListEl = document.getElementById("noteList");
    if (noteListEl) {
      noteListEl.innerHTML = html || (q ? '<div class="muted">No notes match.</div>' : '<div class="muted">No notes yet.</div>');
    }
  }
  function renderNotes() {
    renderNoteList();
    if (currentNote === null) {
      var savedActiveNoteId = localStorage.getItem("active_note_id");
      if (savedActiveNoteId && S.notes.some(function(x) {
        return x.id === savedActiveNoteId;
      })) {
        currentNote = savedActiveNoteId;
      }
    }
    var ed = document.getElementById("noteEditor");
    var n = S.notes.find(function(x) {
      return x.id === currentNote;
    });
    if (!n) {
      currentNote = null;
      localStorage.removeItem("active_note_id");
      if (ed) ed.style.display = "none";
      return;
    }
    if (ed) ed.style.display = "block";
    var titleEl = document.getElementById("noteTitle");
    var bodyEl = document.getElementById("noteBody");
    if (titleEl) titleEl.value = n.title || "";
    if (bodyEl) bodyEl.value = n.body || "";
    var statusEl = document.getElementById("noteSaveStatus");
    if (statusEl) {
      statusEl.textContent = "Saved at " + formatTime2(n.updated || Date.now());
      statusEl.className = "note-status saved";
    }
    if (currentNote) {
      var readToggle = document.getElementById("noteReadToggle");
      if (readToggle) {
        var savedRead = localStorage.getItem("note_read_mode_" + currentNote);
        readToggle.checked = savedRead === "true";
      }
      var splitCheck = document.getElementById("noteSplitCheck");
      if (splitCheck) {
        var savedSplit = localStorage.getItem("note_split_view_" + currentNote);
        var isSplit = savedSplit !== "false";
        if (isSplit) {
          splitCheck.classList.add("on");
          splitCheck.textContent = "\u2713";
        } else {
          splitCheck.classList.remove("on");
          splitCheck.textContent = "";
        }
      }
    }
    noteBodySearch.idx = 0;
    applyNoteMode();
  }
  var currentNote, noteTimer, noteMode, noteBodySearch, markedConfigured;
  var init_notes = __esm({
    "static/js/notes.js"() {
      init_state();
      init_utils();
      currentNote = null;
      noteTimer = null;
      noteMode = "edit";
      noteBodySearch = { q: "", idx: 0 };
      markedConfigured = false;
    }
  });

  // static/js/files.js
  function fmtSize(bytes) {
    if (bytes == null) return "\u2014";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return Math.round(bytes / 102.4) / 10 + " KB";
    return Math.round(bytes / 104857.6) / 10 + " MB";
  }
  function getFileIcon2(mimetype) {
    var mt = mimetype || "";
    if (mt.startsWith("image/")) return "\u{1F5BC}\uFE0F";
    if (mt === "application/pdf") return "\u{1F4C4}";
    if (mt.startsWith("audio/")) return "\u{1F3B5}";
    if (mt.startsWith("video/")) return "\u{1F3A5}";
    if (mt.startsWith("text/")) return "\u{1F4DD}";
    if (mt.indexOf("zip") !== -1 || mt.indexOf("tar") !== -1 || mt.indexOf("compressed") !== -1) return "\u{1F4E6}";
    return "\u{1F4CE}";
  }
  function getBreadcrumbs(folderId) {
    var path = [];
    var currentId = folderId;
    var limit = 20;
    while (currentId && limit > 0) {
      limit--;
      var folder = (S.folders || []).find(function(f) {
        return f.id === currentId;
      });
      if (folder) {
        path.unshift(folder);
        currentId = folder.parent_id;
      } else {
        break;
      }
    }
    return path;
  }
  function isDescendant(folderId, targetId) {
    if (!folderId || !targetId) return false;
    var currentId = folderId;
    var limit = 20;
    while (currentId && limit > 0) {
      limit--;
      if (currentId === targetId) return true;
      var folder = (S.folders || []).find(function(f) {
        return f.id === currentId;
      });
      currentId = folder ? folder.parent_id : null;
    }
    return false;
  }
  function renderFiles() {
    var q = (document.getElementById("fileSearch") || { value: "" }).value.trim().toLowerCase();
    var folders = S.folders || [];
    if (activeFolderId && !folders.some(function(f) {
      return f.id === activeFolderId;
    })) {
      activeFolderId = null;
    }
    selectedFileIds = selectedFileIds.filter(function(id) {
      return (S.files || []).some(function(f) {
        return f.id === id;
      });
    });
    var folderHeader = document.getElementById("folderHeader");
    if (folderHeader) {
      var breadcrumbsHtml = '<div class="breadcrumbs">';
      breadcrumbsHtml += '<span class="breadcrumb-item' + (activeFolderId ? "" : " active") + '" onclick="navigateToFolder(null)" ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, null)">Root</span>';
      var path = getBreadcrumbs(activeFolderId);
      path.forEach(function(f, idx) {
        breadcrumbsHtml += '<span class="breadcrumb-separator">/</span>';
        var isLast = idx === path.length - 1;
        var folderIcon = f.icon ? f.icon + " " : "";
        breadcrumbsHtml += '<span class="breadcrumb-item' + (isLast ? " active" : "") + '" onclick="' + (isLast ? "" : "navigateToFolder('" + f.id + "')") + `" ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, '` + f.id + `')">` + folderIcon + esc(f.name) + "</span>";
      });
      breadcrumbsHtml += "</div>";
      var actionsHtml = '<div class="folder-actions-group">';
      if (activeFolderId) {
        var currentFolder = folders.find(function(f) {
          return f.id === activeFolderId;
        });
        var currentFolderName = currentFolder ? currentFolder.name : "";
        var currentFolderIcon = currentFolder ? currentFolder.icon || "\u{1F4C1}" : "\u{1F4C1}";
        actionsHtml += `<button class="btn small ghost" onclick="renameFolderPrompt('` + activeFolderId + "', '" + esc(currentFolderName).replace(/'/g, "\\'") + `')">\u270F\uFE0F Rename</button>`;
        actionsHtml += `<button class="btn small ghost" onclick="changeFolderIconPrompt('` + activeFolderId + "', '" + esc(currentFolderIcon).replace(/'/g, "\\'") + `')">\u{1F3F7}\uFE0F Icon</button>`;
        actionsHtml += `<button class="btn danger small" onclick="deleteFolderConfirm('` + activeFolderId + `')">\u2715 Delete</button>`;
      }
      actionsHtml += '<button class="btn small" onclick="createFolderPrompt()">+ Folder</button>';
      actionsHtml += `<button class="btn small" onclick="document.getElementById('fileInput').click()">\u{1F4E4} Upload</button>`;
      if (activeFolderId) {
        var currentFolder = folders.find(function(f) {
          return f.id === activeFolderId;
        });
        var parentId = currentFolder ? currentFolder.parent_id : null;
        actionsHtml += '<button class="btn small ghost" onclick="navigateToFolder(' + (parentId ? "'" + parentId + "'" : "null") + ')" title="Go Back">\u2B05\uFE0F Back</button>';
      }
      actionsHtml += "</div>";
      folderHeader.innerHTML = breadcrumbsHtml + actionsHtml;
    }
    var folderList = document.getElementById("folderList");
    if (folderList) {
      var folderListHtml = "";
      var subfolders = folders.slice();
      if (q) {
        subfolders = subfolders.filter(function(f) {
          var nameMatch = (f.name || "").toLowerCase().indexOf(q) !== -1;
          if (!nameMatch) return false;
          if (!activeFolderId) return true;
          return f.id === activeFolderId || isDescendant(f.id, activeFolderId);
        });
      } else {
        subfolders = subfolders.filter(function(f) {
          return f.parent_id === activeFolderId;
        });
      }
      if (subfolders.length > 0) {
        folderListHtml += '<div class="folders-grid">';
        subfolders.forEach(function(f) {
          var folderIcon = f.icon || "\u{1F4C1}";
          folderListHtml += `<div class="folder-card" onclick="navigateToFolder('` + f.id + `')" ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, '` + f.id + `')"><div class="folder-icon">` + esc(folderIcon) + '</div><div class="folder-name" title="' + esc(f.name) + '">' + esc(f.name) + `</div><div class="folder-actions" onclick="event.stopPropagation();"><button class="folder-action-btn" onclick="renameFolderPrompt('` + f.id + "', '" + esc(f.name).replace(/'/g, "\\'") + `')" title="Rename">\u270F\uFE0F</button><button class="folder-action-btn" onclick="changeFolderIconPrompt('` + f.id + "', '" + esc(folderIcon).replace(/'/g, "\\'") + `')" title="Change Icon">\u{1F3F7}\uFE0F</button><button class="folder-action-btn danger" onclick="deleteFolderConfirm('` + f.id + `')" title="Delete">\u2715</button></div></div>`;
        });
        folderListHtml += "</div>";
      }
      folderList.innerHTML = folderListHtml;
    }
    var list = (S.files || []).slice();
    if (q) {
      list = list.filter(function(f) {
        var nameMatch = (f.filename || "").toLowerCase().indexOf(q) !== -1;
        if (!nameMatch) return false;
        if (!activeFolderId) return true;
        return f.folder_id === activeFolderId || isDescendant(f.folder_id, activeFolderId);
      });
    } else {
      list = list.filter(function(f) {
        return f.folder_id === activeFolderId;
      });
    }
    var selectionBar = document.getElementById("fileSelectionBar");
    if (selectionBar) {
      if (selectedFileIds.length > 0) {
        var currentFolder = folders.find(function(f) {
          return f.id === activeFolderId;
        });
        var parentId = currentFolder ? currentFolder.parent_id : null;
        var parentFolder = parentId ? folders.find(function(f) {
          return f.id === parentId;
        }) : null;
        var parentName = parentFolder ? parentFolder.name : "Root";
        var selectOptionsHtml = '<option value="" disabled selected>Move to...</option>';
        if (activeFolderId) {
          selectOptionsHtml += '<option value="__parent__">parent: ' + esc(parentName) + "</option>";
        }
        folders.forEach(function(f) {
          if (f.id !== activeFolderId) {
            selectOptionsHtml += '<option value="' + f.id + '">' + esc(f.name) + "</option>";
          }
        });
        selectionBar.innerHTML = '<div class="selection-bar"><div>' + selectedFileIds.length + " file" + (selectedFileIds.length > 1 ? "s" : "") + ` selected</div><div style="display:flex; gap:8px; align-items:center;"><select onchange="moveSelectedFilesToFolder(this.value); this.value='';" style="padding:4px 8px; font-size:12px;">` + selectOptionsHtml + '</select><button class="btn danger small" onclick="deleteSelectedFiles()">\u2715 Delete</button><button class="btn ghost small" onclick="clearFileSelection()">Cancel</button></div></div>';
      } else {
        selectionBar.innerHTML = "";
      }
    }
    if (fileSort === "name") {
      list.sort(function(a, b) {
        if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
        return (a.filename || "").localeCompare(b.filename || "");
      });
    } else if (fileSort === "size") {
      list.sort(function(a, b) {
        if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
        return (b.size || 0) - (a.size || 0);
      });
    } else {
      list.sort(function(a, b) {
        if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
        return (b.uploaded || 0) - (a.uploaded || 0);
      });
    }
    var html = "";
    if (list.length > 0) {
      var allChecked = list.every(function(f) {
        return selectedFileIds.indexOf(f.id) !== -1;
      });
      var allCheckedClass = allChecked ? " on" : "";
      var allCheckedMark = allChecked ? "\u2713" : "";
      html += '<div class="list-item" style="background:transparent; border:none; margin-bottom:10px; padding:0 10px;"><span class="hcheck' + allCheckedClass + '" onclick="event.stopPropagation(); toggleSelectAllFiles(' + !allChecked + ')" style="margin-right:8px;">' + allCheckedMark + '</span><span class="muted" style="font-size:12px; font-weight:600; line-height:22px;">Select All (' + list.length + " files)</span></div>";
    }
    list.forEach(function(f) {
      var pinned = f.is_pinned ? "file-pinned" : "";
      var isPreviewable = f.mimetype && (f.mimetype.startsWith("image/") || f.mimetype === "application/pdf" || f.mimetype.startsWith("audio/") || f.mimetype.startsWith("video/"));
      var icon = getFileIcon2(f.mimetype);
      var iconHtml = '<span style="font-size: 16px; margin-right: 6px;">' + icon + "</span>";
      var fileLinkHtml = "";
      if (isPreviewable) {
        fileLinkHtml = `<span class="file-link" onclick="previewFile('` + f.id + `')" style="font-weight:600; display:flex; align-items:center;">` + iconHtml + esc(f.filename || "Unnamed") + "</span>";
      } else {
        fileLinkHtml = '<span style="display:flex; align-items:center; font-weight:600;">' + iconHtml + esc(f.filename || "Unnamed") + "</span>";
      }
      var isChecked = selectedFileIds.indexOf(f.id) !== -1;
      var selectedClass = isChecked ? "selected" : "";
      var checkboxHtml = '<span class="hcheck' + (isChecked ? " on" : "") + `" onclick="event.stopPropagation(); onFileSelectChange('` + f.id + "', " + !isChecked + ')" style="margin-right:8px;">' + (isChecked ? "\u2713" : "") + "</span>";
      var metaHtml = fmtSize(f.size) + " &middot; " + new Date(f.uploaded || 0).toLocaleDateString();
      if (q && f.folder_id !== activeFolderId) {
        var folderPath = getBreadcrumbs(f.folder_id);
        var folderPathStr = folderPath.map(function(folder) {
          return folder.name;
        }).join(" / ");
        if (folderPathStr) {
          metaHtml += ' &middot; <span class="muted">in ' + esc(folderPathStr) + "</span>";
        } else {
          metaHtml += ' &middot; <span class="muted">in Root</span>';
        }
      }
      html += '<div class="list-item file-item ' + pinned + " " + selectedClass + `" draggable="true" ondragstart="onFileDragStart(event, '` + f.id + `')" ondragend="onFileDragEnd(event)">` + checkboxHtml + `<button class="btn-pin" onclick="toggleFilePin('` + f.id + `',event)" title="` + (f.is_pinned ? "Unpin" : "Pin") + '">\u2605</button><div class="grow" style="cursor:grab;"><div>' + fileLinkHtml + '</div><div class="file-meta">' + metaHtml + `</div></div><div class="file-actions" onclick="event.stopPropagation()"> <button class="btn small ghost" onclick="renameFilePrompt('` + f.id + "', '" + esc(f.filename || "").replace(/'/g, "\\'") + `')" title="Rename">\u270F\uFE0F</button><a class="btn small ghost" href="/api/files/` + f.id + `/download" style="text-decoration:none">Download</a><button class="btn danger small" onclick="delFile('` + f.id + `')">\u2715</button></div></div>`;
    });
    document.getElementById("fileList").innerHTML = html || (q ? '<div class="muted">No files match.</div>' : '<div class="muted">No files in this folder.</div>');
    ["date", "name", "size"].forEach(function(s) {
      var btn = document.getElementById("fileSort-" + s);
      if (btn) btn.className = "btn-sort" + (fileSort === s ? " active" : "");
    });
    var tabFiles = document.getElementById("tab-files");
    if (tabFiles && !tabFiles.dataset.dragInitialized) {
      tabFiles.dataset.dragInitialized = "true";
      var dragCounter = 0;
      tabFiles.addEventListener("dragenter", function(e) {
        e.preventDefault();
        if (e.dataTransfer.types.indexOf("Files") === -1) return;
        dragCounter++;
        if (dragCounter === 1) {
          var overlay = document.getElementById("fileDropOverlay");
          if (overlay) {
            overlay.style.display = "flex";
            var currentFolderNameSpan = document.getElementById("dropFolderName");
            if (currentFolderNameSpan) {
              var currentFolder2 = (S.folders || []).find(function(f) {
                return f.id === activeFolderId;
              });
              currentFolderNameSpan.textContent = currentFolder2 ? currentFolder2.name : "Root";
            }
          }
        }
      });
      tabFiles.addEventListener("dragover", function(e) {
        e.preventDefault();
      });
      tabFiles.addEventListener("dragleave", function(e) {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
          var overlay = document.getElementById("fileDropOverlay");
          if (overlay) overlay.style.display = "none";
        }
      });
      tabFiles.addEventListener("drop", async function(e) {
        e.preventDefault();
        dragCounter = 0;
        var overlay = document.getElementById("fileDropOverlay");
        if (overlay) overlay.style.display = "none";
        var files = e.dataTransfer.files;
        if (!files || !files.length) return;
        for (var i = 0; i < files.length; i++) {
          var fd = new FormData();
          fd.append("file", files[i]);
          if (activeFolderId) {
            fd.append("folder_id", activeFolderId);
          }
          var r = await fetch("/api/files/upload", { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" }, body: fd });
          if (!r.ok) {
            var err = await r.json().catch(function() {
              return { error: r.statusText };
            });
            alert("Upload failed: " + (err.error || "unknown error"));
            return;
          }
        }
        toast("Uploaded " + files.length + " file" + (files.length > 1 ? "s" : ""));
        if (window.refreshApp) {
          await window.refreshApp();
        }
      });
    }
  }
  async function uploadFile(refresh2) {
    var input = document.getElementById("fileInput");
    var files = input.files;
    if (!files || !files.length) {
      alert("Choose a file first.");
      return;
    }
    for (var i = 0; i < files.length; i++) {
      var fd = new FormData();
      fd.append("file", files[i]);
      if (activeFolderId) {
        fd.append("folder_id", activeFolderId);
      }
      var r = await fetch("/api/files/upload", { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" }, body: fd });
      if (!r.ok) {
        var e = await r.json().catch(function() {
          return { error: r.statusText };
        });
        alert("Upload failed: " + (e.error || "unknown error"));
        input.value = "";
        return;
      }
    }
    input.value = "";
    toast("Uploaded " + files.length + " file" + (files.length > 1 ? "s" : ""));
    await refresh2();
  }
  async function delFile(id, refresh2) {
    if (!confirm("Delete this file?")) return;
    await api("DELETE", "/api/files/" + id);
    await refresh2();
  }
  async function toggleFilePin(id, ev) {
    ev.stopPropagation();
    var f = (S.files || []).find(function(x) {
      return x.id === id;
    });
    if (!f) return;
    var newPinned = f.is_pinned ? 0 : 1;
    await api("PUT", "/api/files/" + id, { is_pinned: newPinned });
    f.is_pinned = newPinned;
    renderFiles();
  }
  function setFileSort(s) {
    fileSort = s;
    renderFiles();
  }
  function handleFileSearchKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      var folderList = document.getElementById("folderList");
      if (folderList) {
        var firstFolder = folderList.querySelector(".folder-card");
        if (firstFolder) {
          firstFolder.click();
          return;
        }
      }
      var fileList = document.getElementById("fileList");
      if (fileList) {
        var firstFileLink = fileList.querySelector(".file-link");
        if (firstFileLink) {
          firstFileLink.click();
          return;
        }
        var firstFileItem = fileList.querySelector(".list-item.file-item");
        if (firstFileItem) {
          var dlBtn = firstFileItem.querySelector("a.btn");
          if (dlBtn) dlBtn.click();
        }
      }
    }
  }
  function navigateToFolder(id) {
    activeFolderId = id;
    selectedFileIds = [];
    renderFiles();
  }
  async function createFolderPrompt(refresh2) {
    var name = prompt("Enter folder name:");
    if (name === null) return;
    name = name.trim();
    if (!name) {
      alert("Folder name cannot be empty.");
      return;
    }
    var actualRefresh = refresh2 || window.refreshApp;
    await api("POST", "/api/folders", {
      name,
      parent_id: activeFolderId
    });
    if (actualRefresh) await actualRefresh();
  }
  async function renameFolderPrompt(id, oldName, refresh2) {
    var name = prompt("Rename folder:", oldName);
    if (name === null) return;
    name = name.trim();
    if (!name) {
      alert("Folder name cannot be empty.");
      return;
    }
    var actualRefresh = refresh2 || window.refreshApp;
    await api("PUT", "/api/folders/" + id, { name });
    if (actualRefresh) await actualRefresh();
  }
  async function changeFolderIconPrompt(id, oldIcon, refresh2) {
    var icon = prompt("Enter an emoji or character for this folder icon:", oldIcon || "\u{1F4C1}");
    if (icon === null) return;
    icon = icon.trim();
    if (!icon) icon = "\u{1F4C1}";
    var actualRefresh = refresh2 || window.refreshApp;
    await api("PUT", "/api/folders/" + id, { icon });
    if (actualRefresh) await actualRefresh();
  }
  async function deleteFolderConfirm(id, refresh2) {
    if (!confirm("Delete this folder? Its contents will be moved to the parent directory.")) return;
    var actualRefresh = refresh2 || window.refreshApp;
    await api("DELETE", "/api/folders/" + id);
    if (activeFolderId === id) {
      var folders = S.folders || [];
      var folder = folders.find(function(f) {
        return f.id === id;
      });
      activeFolderId = folder ? folder.parent_id : null;
    }
    if (actualRefresh) await actualRefresh();
  }
  async function renameFilePrompt(id, oldName, refresh2) {
    var name = prompt("Rename file:", oldName);
    if (name === null) return;
    name = name.trim();
    if (!name) {
      alert("Filename cannot be empty.");
      return;
    }
    var actualRefresh = refresh2 || window.refreshApp;
    await api("PUT", "/api/files/" + id, { filename: name });
    if (actualRefresh) await actualRefresh();
  }
  function previewFile(id) {
    var f = (S.files || []).find(function(x) {
      return x.id === id;
    });
    if (!f) return;
    var title = document.getElementById("mediaPreviewTitle");
    var container = document.getElementById("mediaPreviewContainer");
    var modal = document.getElementById("mediaPreviewModal");
    if (!title || !container || !modal) return;
    title.textContent = f.filename || "File Preview";
    container.innerHTML = "";
    var url = "/api/files/" + f.id + "/view";
    var mt = f.mimetype || "";
    if (mt.startsWith("image/")) {
      container.innerHTML = '<img src="' + url + '" style="max-width:100%; max-height:100%; object-fit:contain;">';
    } else if (mt === "application/pdf") {
      container.innerHTML = '<iframe src="' + url + '" style="width:100%; height:100%; border:none; background:white;"></iframe>';
    } else if (mt.startsWith("audio/")) {
      container.innerHTML = '<audio controls autoplay src="' + url + '" style="width:100%;"></audio>';
    } else if (mt.startsWith("video/")) {
      container.innerHTML = '<video controls autoplay style="max-width:100%; max-height:100%;"><source src="' + url + '" type="' + mt + '"></video>';
    } else {
      container.innerHTML = '<div class="muted">No preview available for this file type.</div>';
    }
    modal.style.display = "flex";
  }
  function closeMediaPreviewModal() {
    var modal = document.getElementById("mediaPreviewModal");
    var container = document.getElementById("mediaPreviewContainer");
    if (modal) modal.style.display = "none";
    if (container) container.innerHTML = "";
  }
  function onFileDragStart(e, fileId) {
    if (selectedFileIds.indexOf(fileId) === -1) {
      selectedFileIds = [fileId];
      renderFiles();
    }
    draggedFileIds = selectedFileIds.slice();
    e.dataTransfer.setData("text/plain", fileId);
    e.dataTransfer.effectAllowed = "move";
  }
  function onFileDragEnd(e) {
    draggedFileIds = [];
    document.querySelectorAll(".folder-drag-over").forEach(function(el) {
      el.classList.remove("folder-drag-over");
    });
  }
  function onFolderDragOver(e) {
    if (draggedFileIds.length === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    var el = e.currentTarget;
    if (el && !el.classList.contains("folder-drag-over")) {
      el.classList.add("folder-drag-over");
    }
  }
  function onFolderDragLeave(e) {
    var el = e.currentTarget;
    if (el) {
      el.classList.remove("folder-drag-over");
    }
  }
  async function onFolderDrop(e, targetFolderId) {
    e.preventDefault();
    var el = e.currentTarget;
    if (el) {
      el.classList.remove("folder-drag-over");
    }
    if (draggedFileIds.length > 0) {
      if (targetFolderId === activeFolderId) {
        draggedFileIds = [];
        return;
      }
      await api("POST", "/api/files/move", {
        file_ids: draggedFileIds,
        folder_id: targetFolderId
      });
      selectedFileIds = [];
      draggedFileIds = [];
      if (window.refreshApp) {
        await window.refreshApp();
      }
    }
  }
  function toggleSelectAllFiles(checked) {
    var q = (document.getElementById("fileSearch") || { value: "" }).value.trim().toLowerCase();
    var list = (S.files || []).slice();
    if (q) {
      list = list.filter(function(f) {
        return (f.filename || "").toLowerCase().indexOf(q) !== -1;
      });
    } else {
      list = list.filter(function(f) {
        return f.folder_id === activeFolderId;
      });
    }
    if (checked) {
      list.forEach(function(f) {
        if (selectedFileIds.indexOf(f.id) === -1) {
          selectedFileIds.push(f.id);
        }
      });
    } else {
      list.forEach(function(f) {
        var idx = selectedFileIds.indexOf(f.id);
        if (idx !== -1) {
          selectedFileIds.splice(idx, 1);
        }
      });
    }
    renderFiles();
  }
  function onFileSelectChange(fileId, checked) {
    var idx = selectedFileIds.indexOf(fileId);
    if (checked && idx === -1) {
      selectedFileIds.push(fileId);
    } else if (!checked && idx !== -1) {
      selectedFileIds.splice(idx, 1);
    }
    renderFiles();
  }
  function clearFileSelection() {
    selectedFileIds = [];
    renderFiles();
  }
  async function moveSelectedFilesToFolder(targetFolderId) {
    if (targetFolderId === "__parent__") {
      var folders = S.folders || [];
      var currentFolder = folders.find(function(f) {
        return f.id === activeFolderId;
      });
      targetFolderId = currentFolder ? currentFolder.parent_id : null;
    }
    if (selectedFileIds.length > 0) {
      await api("POST", "/api/files/move", {
        file_ids: selectedFileIds,
        folder_id: targetFolderId
      });
      selectedFileIds = [];
      if (window.refreshApp) {
        await window.refreshApp();
      }
    }
  }
  async function deleteSelectedFiles() {
    if (!confirm("Delete the " + selectedFileIds.length + " selected files?")) return;
    for (var i = 0; i < selectedFileIds.length; i++) {
      var id = selectedFileIds[i];
      await api("DELETE", "/api/files/" + id);
    }
    selectedFileIds = [];
    if (window.refreshApp) {
      await window.refreshApp();
    }
  }
  var fileSort, activeFolderId, selectedFileIds, draggedFileIds;
  var init_files = __esm({
    "static/js/files.js"() {
      init_state();
      init_utils();
      fileSort = "date";
      activeFolderId = null;
      selectedFileIds = [];
      draggedFileIds = [];
    }
  });

  // static/app.js
  var require_app = __commonJS({
    "static/app.js"() {
      init_state();
      init_utils();
      init_offline();
      init_theme();
      init_backup();
      init_dashboard();
      init_analytics();
      init_planner();
      init_exams();
      init_habits();
      init_workouts();
      init_tasks();
      init_notes();
      init_files();
      init_settings();
      function renderAll() {
        renderDashboard();
        renderAnalytics();
        renderPlanner();
        renderExams();
        renderHabits();
        renderWorkouts();
        renderTasks();
        renderNotes();
        renderFiles();
        renderSettings(R);
      }
      var R = function() {
        return refresh(renderAll);
      };
      window.delRow = function(t, id) {
        delRow(t, id, R);
      };
      window.addShortcut = function() {
        addShortcut(R);
      };
      window.saveEventModal = function() {
        saveEventModal(R);
      };
      window.delEventModal = function() {
        delEventModal(R);
      };
      window.addExam = function() {
        addExam(R);
      };
      window.setGrade = function(id, val) {
        setGrade(id, val, R);
      };
      window.addHabit = function() {
        addHabit(R);
      };
      window.delHabit = function(id) {
        delHabit(id, R);
      };
      window.toggleHabit = function(id, iso) {
        toggleHabit(id, iso, renderHabits, renderDashboard);
      };
      window.addWorkout = function() {
        addWorkout(R);
      };
      window.addTask = function() {
        addTask(R);
      };
      window.toggleTask = function(id, done) {
        toggleTask(id, done, R);
      };
      window.addSubtask = function(parentId) {
        addSubtask(parentId, R);
      };
      window.dragTaskStart = dragTaskStart;
      window.dragTaskOver = dragTaskOver;
      window.dragTaskEnd = dragTaskEnd;
      window.dropTask = function(e, dropId) {
        dropTask(e, dropId, R);
      };
      window.addModalCategory = function() {
        addModalCategory(R);
      };
      window.deleteModalCategory = function(catName) {
        deleteModalCategory(catName, R);
      };
      window.updateModalCategoryColor = function(name, color) {
        updateModalCategoryColor(name, color, R);
      };
      window.renameModalCategory = function(oldName, newName) {
        renameModalCategory(oldName, newName, R);
      };
      window.openTaskModal = openTaskModal;
      window.closeTaskModal = closeTaskModal;
      window.saveTaskModal = function() {
        saveTaskModal(R);
      };
      window.newNote = function() {
        newNote(R);
      };
      window.deleteNote = function() {
        deleteNote(R);
      };
      window.uploadFile = function() {
        uploadFile(R);
      };
      window.delFile = function(id) {
        delFile(id, R);
      };
      window.navigateToFolder = navigateToFolder;
      window.createFolderPrompt = function() {
        createFolderPrompt(R);
      };
      window.renameFolderPrompt = function(id, oldName) {
        renameFolderPrompt(id, oldName, R);
      };
      window.changeFolderIconPrompt = function(id, oldIcon) {
        changeFolderIconPrompt(id, oldIcon, R);
      };
      window.deleteFolderConfirm = function(id) {
        deleteFolderConfirm(id, R);
      };
      window.renameFilePrompt = function(id, oldName) {
        renameFilePrompt(id, oldName, R);
      };
      window.previewFile = previewFile;
      window.closeMediaPreviewModal = closeMediaPreviewModal;
      window.onFileDragStart = onFileDragStart;
      window.onFileDragEnd = onFileDragEnd;
      window.onFolderDragOver = onFolderDragOver;
      window.onFolderDragLeave = onFolderDragLeave;
      window.onFolderDrop = onFolderDrop;
      window.toggleSelectAllFiles = toggleSelectAllFiles;
      window.onFileSelectChange = onFileSelectChange;
      window.moveSelectedFilesToFolder = moveSelectedFilesToFolder;
      window.deleteSelectedFiles = deleteSelectedFiles;
      window.clearFileSelection = clearFileSelection;
      window.refreshApp = R;
      window.importData = function(ev) {
        importData(ev, R);
      };
      window.saveNotifySettings = function() {
        saveNotifySettings(R);
      };
      window.saveCalSync = function() {
        saveCalSync(R);
      };
      window.calSyncNow = function() {
        calSyncNow(R);
      };
      window.importIcsFile = function() {
        importIcsFile(R);
      };
      window.clearIcs = function() {
        clearIcs(R);
      };
      window.stravaSaveConfig = function() {
        stravaSaveConfig(R);
      };
      window.stravaForget = function() {
        stravaForget(R);
      };
      window.stravaSync = function() {
        stravaSync(R);
      };
      window.stravaDisconnect = function() {
        stravaDisconnect(R);
      };
      window.tfaConfirm = function() {
        tfaConfirm(R);
      };
      window.tfaDisable = function() {
        tfaDisable(R);
      };
      window.backupNow = function() {
        backupNow(R);
      };
      window.saveAppThemeStyle = function() {
        saveAppThemeStyle(R);
      };
      window.saveAccentColor = function() {
        saveAccentColor(R);
      };
      window.resetAccentColor = function() {
        resetAccentColor(R);
      };
      window.toggleShowShortcuts = function() {
        toggleShowShortcuts(R);
      };
      window.searchEvents = searchEvents;
      window.hideSearchSoon = hideSearchSoon;
      window.navigateToAndEditEvent = navigateToAndEditEvent;
      window.handlePlannerSearchKeydown = handlePlannerSearchKeydown;
      window.toggleItem = function(id) {
        toggleItem(id, R);
      };
      window.toggleTabPersistence = function() {
        toggleTabPersistence(R);
      };
      window.addCustomCategory = function() {
        addCustomCategory(R);
      };
      window.deleteCategory = function(catName) {
        deleteCategory(catName, R);
      };
      window.updateCategoryColor = function(name, color) {
        updateCategoryColor(name, color, R);
      };
      window.dragShortcutStart = function(e, id) {
        e.dataTransfer.setData("text/plain", id);
        e.target.style.opacity = "0.5";
      };
      window.dragShortcutEnd = function(e) {
        e.target.style.opacity = "1";
      };
      window.dragShortcutOver = function(e) {
        e.preventDefault();
      };
      window.dropShortcut = function(e, dropId) {
        e.preventDefault();
        e.target.style.opacity = "1";
        var dragId = e.dataTransfer.getData("text/plain");
        if (dragId && dragId !== dropId) reorderShortcut(dragId, dropId, R);
      };
      window.moveWeek = moveWeek;
      window.changePlannerView = changePlannerView;
      window.openAdd = openAdd;
      window.editEvent = editEvent;
      window.closeEventModal = closeEventModal;
      window.saveShortcuts = saveShortcuts;
      window.resetShortcutsToDefault = resetShortcutsToDefault;
      window.selectNote = selectNote;
      window.openNote = openNote;
      window.noteChanged = noteChanged;
      window.noteSearchInput = noteSearchInput;
      window.noteBodySearchInput = noteBodySearchInput;
      window.noteBodySearchNav = noteBodySearchNav;
      window.handleNoteSearchKeydown = handleNoteSearchKeydown;
      window.handleNoteBodySearchKeydown = handleNoteBodySearchKeydown;
      window.toggleNoteMode = toggleNoteMode;
      window.toggleNoteReadMode = toggleNoteReadMode;
      window.toggleNoteSplitOnly = toggleNoteSplitOnly;
      window.noteInsert = noteInsert;
      window.toggleNotePin = toggleNotePin;
      window.toggleFilePin = toggleFilePin;
      window.setFileSort = setFileSort;
      window.renderFiles = renderFiles;
      window.handleFileSearchKeydown = handleFileSearchKeydown;
      window.toggleTheme = toggleTheme;
      window.exportData = exportData;
      window.testNotify = testNotify;
      window.tfaStart = tfaStart;
      window.copyIcs = copyIcs;
      window.renderSettings = function(refresh2) {
        renderSettings(refresh2 || R);
      };
      window.checkForUpdates = checkForUpdates;
      window.toggleEditMode = toggleEditMode;
      window.cancelCustomize = cancelCustomize;
      window.saveCustomize = saveCustomize;
      window.applyPreset = applyPreset;
      window.toggleWidgetPresence = toggleWidgetPresence;
      window.startCardDrag = startCardDrag;
      window.startResize = startResize;
      window.showDashboardEventDetails = showDashboardEventDetails;
      window.closeDashboardEventDetailsModal = closeDashboardEventDetailsModal;
      var tabsNav = document.getElementById("tabs");
      tabsNav.addEventListener("click", function(e) {
        var b = e.target.closest("button");
        if (!b) return;
        tabsNav.querySelectorAll("button").forEach(function(x) {
          x.classList.remove("active");
        });
        b.classList.add("active");
        document.querySelectorAll("main section").forEach(function(s) {
          s.classList.remove("active");
        });
        document.getElementById("tab-" + b.dataset.tab).classList.add("active");
        if (!SET || SET.persist_active_tab !== "0") {
          localStorage.setItem("active_tab", b.dataset.tab);
        } else {
          localStorage.removeItem("active_tab");
        }
      });
      document.addEventListener("alpine:init", () => {
        Promise.resolve().then(() => (init_state(), state_exports)).then(({ S: S2 }) => {
          Alpine.store("state", S2 || {});
        });
      });
      document.getElementById("wDate").value = todayStr();
      applyTheme();
      var savedTab = localStorage.getItem("active_tab");
      if (savedTab) {
        btn = document.querySelector("#tabs button[data-tab='" + savedTab + "']");
        if (btn) {
          tabsNav.querySelectorAll("button").forEach(function(x) {
            x.classList.remove("active");
          });
          btn.classList.add("active");
          document.querySelectorAll("main section").forEach(function(s) {
            s.classList.remove("active");
          });
          sect = document.getElementById("tab-" + savedTab);
          if (sect) sect.classList.add("active");
        }
      }
      var btn;
      var sect;
      function showPwaUpdateBanner(worker) {
        var banner = document.getElementById("update-banner");
        if (!banner) return;
        banner.style.display = "flex";
        var btn2 = document.getElementById("update-btn");
        if (btn2) {
          btn2.onclick = function() {
            worker.postMessage({ type: "SKIP_WAITING" });
          };
        }
      }
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").then(function(reg) {
          if (reg.waiting) {
            showPwaUpdateBanner(reg.waiting);
          }
          reg.addEventListener("updatefound", function() {
            var installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.addEventListener("statechange", function() {
                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                  showPwaUpdateBanner(installingWorker);
                }
              });
            }
          });
        }).catch(function() {
        });
        navigator.serviceWorker.addEventListener("controllerchange", function() {
          window.location.reload();
        });
      }
      window.addEventListener("online", function() {
        syncQueue(R);
      });
      window.addEventListener("offline", function() {
        updateOfflineBanner();
      });
      refresh(renderAll).then(function() {
        setPlannerRefresh(R);
        updateOfflineBanner();
        checkForUpdates(false).catch(function() {
        });
        if (navigator.onLine) {
          syncQueue(R);
        }
        if (new URLSearchParams(location.search).get("strava") === "connected") {
          var toast_ = document.createElement("div");
          toast_.className = "toast";
          toast_.textContent = "Strava connected! Syncing\u2026";
          document.body.appendChild(toast_);
          setTimeout(function() {
            toast_.remove();
          }, 2500);
          stravaSync(R);
          history.replaceState({}, "", "/");
        }
      }).catch(function(e) {
        updateOfflineBanner();
        document.getElementById("dashCards").innerHTML = '<div class="card">Could not reach the backend: ' + esc(e.message) + "</div>";
      });
    }
  });
  require_app();
})();
