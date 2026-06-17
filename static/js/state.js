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

export async function refresh(renderAll) {
  S = await api("GET", "/api/state");
  if (window.Alpine) {
    Alpine.store('state', S);
  }
  SET = await api("GET", "/api/settings");
  habitSet = {};
  S.habit_log.forEach(function(l) { habitSet[l.habit_id + "|" + l.date] = true; });
  renderAll();
}

