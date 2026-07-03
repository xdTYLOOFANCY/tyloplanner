// TyloPlanner — global application state.
// S holds full state from /api/state; SET holds user settings;
// habitSet is a fast lookup for habit completions.

import { api } from './utils.js';

export let S = null;
export let SET = null;
export let habitSet = {};

export function setHabitEntry(key, val) {
  if (val) habitSet[key] = true; else delete habitSet[key];
}

export function setS(val) { S = val; }
export function setSET(val) { SET = val; }

export const PRESETS = {
  balanced: [
    { id: 'deadlines', type: 'deadlines', x: 1, y: 1, w: 6, h: 2, mx: 1, my: 1, mw: 6, mh: 2 },
    { id: 'today_plan', type: 'today_plan', x: 7, y: 1, w: 6, h: 2, mx: 1, my: 3, mw: 6, mh: 2 },
    { id: 'habits', type: 'habits', x: 1, y: 3, w: 4, h: 2, mx: 1, my: 5, mw: 6, mh: 2 },
    { id: 'workouts', type: 'workouts', x: 5, y: 3, w: 4, h: 2, mx: 1, my: 7, mw: 6, mh: 2 },
    { id: 'tasks', type: 'tasks', x: 9, y: 3, w: 4, h: 2, mx: 1, my: 9, mw: 6, mh: 2 }
  ],
  academic: [
    { id: 'deadlines', type: 'deadlines', x: 1, y: 1, w: 8, h: 2, mx: 1, my: 1, mw: 6, mh: 2 },
    { id: 'tasks', type: 'tasks', x: 9, y: 1, w: 4, h: 4, mx: 1, my: 3, mw: 6, mh: 3 },
    { id: 'today_plan', type: 'today_plan', x: 1, y: 3, w: 8, h: 2, mx: 1, my: 6, mw: 6, mh: 2 },
    { id: 'habits', type: 'habits', x: 1, y: 5, w: 6, h: 2, mx: 1, my: 8, mw: 6, mh: 2 },
    { id: 'workouts', type: 'workouts', x: 7, y: 5, w: 6, h: 2, mx: 1, my: 10, mw: 6, mh: 2 }
  ],
  active: [
    { id: 'workouts', type: 'workouts', x: 1, y: 1, w: 8, h: 2, mx: 1, my: 1, mw: 6, mh: 2 },
    { id: 'habits', type: 'habits', x: 9, y: 1, w: 4, h: 4, mx: 1, my: 3, mw: 6, mh: 3 },
    { id: 'today_plan', type: 'today_plan', x: 1, y: 3, w: 8, h: 2, mx: 1, my: 6, mw: 6, mh: 2 },
    { id: 'deadlines', type: 'deadlines', x: 1, y: 5, w: 6, h: 2, mx: 1, my: 8, mw: 6, mh: 2 },
    { id: 'tasks', type: 'tasks', x: 7, y: 5, w: 6, h: 2, mx: 1, my: 10, mw: 6, mh: 2 }
  ],
  minimalist: [
    { id: 'today_plan', type: 'today_plan', x: 1, y: 1, w: 4, h: 2, mx: 1, my: 1, mw: 6, mh: 2 },
    { id: 'deadlines', type: 'deadlines', x: 5, y: 1, w: 4, h: 2, mx: 1, my: 3, mw: 6, mh: 2 },
    { id: 'tasks', type: 'tasks', x: 9, y: 1, w: 4, h: 2, mx: 1, my: 5, mw: 6, mh: 2 },
    { id: 'habits', type: 'habits', x: 1, y: 3, w: 6, h: 2, mx: 1, my: 7, mw: 6, mh: 2 },
    { id: 'workouts', type: 'workouts', x: 7, y: 3, w: 6, h: 2, mx: 1, my: 9, mw: 6, mh: 2 }
  ]
};

export let currentVersion = null;
let syncInterval = null;
let lastCheckTime = 0;
let visibilityListenerAdded = false;
const ACTIVE_INTERVAL = 5000;
const INACTIVE_INTERVAL = 30000;

async function checkVersion() {
  if (!navigator.onLine) return;
  try {
    const res = await api("GET", "/api/state-version");
    if (res && res.version !== undefined && res.version !== currentVersion) {
      if (currentVersion !== null) {
        if (window.refreshApp) {
          await window.refreshApp();
        }
      } else {
        currentVersion = res.version;
      }
    }
  } catch (e) {
    // Ignore network errors
  }
}

export function startLiveSync() {
  if (syncInterval) clearInterval(syncInterval);
  
  const loop = async () => {
    const now = Date.now();
    const interval = document.hidden ? INACTIVE_INTERVAL : ACTIVE_INTERVAL;
    if (now - lastCheckTime >= interval) {
      lastCheckTime = now;
      await checkVersion();
    }
  };
  
  syncInterval = setInterval(loop, 1000);
  
  if (!visibilityListenerAdded) {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        loop();
      }
    });
    visibilityListenerAdded = true;
  }
}

export async function refresh(renderAll) {
  var offMod = await import('./offline.js');

  // Drain queued offline writes BEFORE fetching state: api() serves GETs from
  // cache while writes are pending, so a stale queue with no cached state
  // would otherwise deadlock boot forever (the queue used to be drained only
  // after a successful refresh). No-op when offline or the queue is empty.
  try {
    await offMod.syncQueue();
  } catch (e) {
    console.warn("Pre-refresh queue drain failed:", e);
  }

  if (!S) {
    try {
      S = await offMod.getCache("state");
    } catch (e) {}
  }

  const isValidS = S && typeof S === "object" && Array.isArray(S.events) && Array.isArray(S.tasks) && Array.isArray(S.habit_log);
  let deltaSuccess = false;
  
  if (isValidS && currentVersion !== null && navigator.onLine) {
    try {
      const delta = await api("GET", "/api/state?since_version=" + currentVersion);
      if (delta && delta.is_delta) {
        for (const table in delta) {
          if (table === "deleted_records" || table === "is_delta" || table === "version" ||
              table === "strava" || table === "auth" || table === "app_url" || table === "feed_url" ||
              table === "habit_log") {
            continue;
          }
          if (Array.isArray(S[table]) && Array.isArray(delta[table])) {
            delta[table].forEach(function(newRow) {
              var idx = S[table].findIndex(function(row) { return row.id === newRow.id; });
              if (idx > -1) {
                S[table][idx] = newRow;
              } else {
                S[table].push(newRow);
              }
            });
          }
        }

        if (Array.isArray(delta.habit_log) && Array.isArray(S.habit_log)) {
          delta.habit_log.forEach(function(newRow) {
            var idx = S.habit_log.findIndex(function(row) {
              return row.habit_id === newRow.habit_id && row.date === newRow.date;
            });
            if (idx > -1) {
              S.habit_log[idx] = newRow;
            } else {
              S.habit_log.push(newRow);
            }
          });
        }

        if (Array.isArray(delta.deleted_records)) {
          delta.deleted_records.forEach(function(del) {
            var table = del.table;
            if (table === "habit_log") {
              if (Array.isArray(S.habit_log)) {
                var parts = del.id.split(":");
                var habitId = parts[0];
                var date = parts[1];
                S.habit_log = S.habit_log.filter(function(row) {
                  return !(row.habit_id === habitId && row.date === date);
                });
              }
            } else {
              if (Array.isArray(S[table])) {
                S[table] = S[table].filter(function(row) { return row.id !== del.id; });
              }
            }
          });
        }

        if (delta.strava) S.strava = delta.strava;
        if (delta.auth) S.auth = delta.auth;
        if (delta.app_url) S.app_url = delta.app_url;
        if (delta.feed_url) S.feed_url = delta.feed_url;
        
        currentVersion = delta.version;
        await offMod.setCache("state", S);
        deltaSuccess = true;
      }
    } catch (e) {
      console.error("Delta sync failed, falling back to full state reload:", e);
    }
  }

  if (!deltaSuccess) {
    try {
      S = await api("GET", "/api/state");
      await offMod.setCache("state", S);
      currentVersion = S.version;
    } catch (e) {
      console.warn("Failed to fetch state, falling back to cache:", e);
      if (!S) {
        try {
          S = await offMod.getCache("state");
        } catch (err) {
          console.error("Failed to load cached state:", err);
        }
      }
      const isValidS = S && typeof S === "object" && Array.isArray(S.events) && Array.isArray(S.tasks) && Array.isArray(S.habit_log);
      if (isValidS) {
        currentVersion = S.version;
      } else {
        throw e;
      }
    }
  }

  if (window.Alpine) {
    Alpine.store('state', S);
  }
  
  try {
    SET = await api("GET", "/api/settings");
    await offMod.setCache("settings", SET);
  } catch (e) {
    console.warn("Failed to fetch settings, falling back to cache:", e);
    if (!SET) {
      try {
        SET = await offMod.getCache("settings");
      } catch (err) {
        console.error("Failed to load cached settings:", err);
      }
    }
    if (!SET) {
      SET = {
        app_theme_style: "default",
        accent_color: null,
        persist_active_tab: "1"
      };
    }
  }
  habitSet = {};
  if (S && S.habit_log) {
    S.habit_log.forEach(function(l) { habitSet[l.habit_id + "|" + l.date] = true; });
  }

  renderAll();
}

export const tabNeedsRender = {
  dashboard: true,
  analytics: true,
  planner: true,
  exams: true,
  habits: true,
  workouts: true,
  tasks: true,
  notes: true,
  files: true,
  settings: true
};

export function safeRender(tabName, renderFn) {
  const activeBtn = document.querySelector("#tabs button.active");
  const activeTab = activeBtn ? activeBtn.dataset.tab : "dashboard";
  if (activeTab === tabName) {
    renderFn();
    tabNeedsRender[tabName] = false;
  } else {
    tabNeedsRender[tabName] = true;
  }
}



