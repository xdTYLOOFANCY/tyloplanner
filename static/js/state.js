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

export async function refresh(renderAll) {
  S = await api("GET", "/api/state");
  SET = await api("GET", "/api/settings");
  habitSet = {};
  S.habit_log.forEach(function(l) { habitSet[l.habit_id + "|" + l.date] = true; });
  renderAll();
}
