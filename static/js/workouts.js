// TyloPlanner — workouts module.

import { S } from './state.js';
import { toISO, todayStr, esc, api } from './utils.js';
import { weekDates } from './utils.js';

export var WTYPES = { run: "🏃 Run", bike: "🚴 Bike", gym: "🏋\uFE0F Gym" };

export async function addWorkout(refresh) {
  var dur = parseFloat(document.getElementById("wDur").value) || 0;
  var dist = parseFloat(document.getElementById("wDist").value) || 0;
  if (!dur && !dist) { alert("Enter at least minutes or km."); return; }
  await api("POST", "/api/workouts", {
    type: document.getElementById("wType").value,
    date: document.getElementById("wDate").value || todayStr(),
    dur: dur, dist: dist, note: document.getElementById("wNote").value.trim(), source: "manual"
  });
  document.getElementById("wDur").value = ""; document.getElementById("wDist").value = ""; document.getElementById("wNote").value = "";
  await refresh();
}

export function weekTotals(off) {
  var ds = weekDates(off), a = toISO(ds[0]), b = toISO(ds[6]);
  var t = { count: 0, runKm: 0, bikeKm: 0, min: 0, gym: 0 };
  S.workouts.forEach(function(w) {
    if (w.date < a || w.date > b) return;
    t.count++; t.min += w.dur || 0;
    if (w.type === "gym") t.gym++;
    else if (w.type === "run") t.runKm += w.dist || 0;
    else if (w.type === "bike") t.bikeKm += w.dist || 0;
  });
  return t;
}

export function renderWorkouts() {
  var t = weekTotals(0);
  document.getElementById("wStats").innerHTML =
    '<div class="stat"><div class="v">' + t.count + '</div><div class="l">sessions</div></div>' +
    '<div class="stat"><div class="v">' + (Math.round(t.runKm * 10) / 10) + '</div><div class="l">run km</div></div>' +
    '<div class="stat"><div class="v">' + (Math.round(t.bikeKm * 10) / 10) + '</div><div class="l">bike km</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(t.min) + '</div><div class="l">minutes</div></div>' +
    '<div class="stat"><div class="v">' + t.gym + '</div><div class="l">gym sessions</div></div>';
  var list = S.workouts.slice().sort(function(a, b) { return b.date.localeCompare(a.date); }).slice(0, 50);
  var html = "";
  list.forEach(function(w) {
    html += '<div class="list-item"><div class="grow"><div>' + WTYPES[w.type] +
      (w.dist ? ' \u00b7 ' + w.dist + ' km' : '') + (w.dur ? ' \u00b7 ' + w.dur + ' min' : '') +
      (w.source === "strava" ? ' <span class="badge blue">strava</span>' : '') + '</div>' +
      '<div class="muted">' + esc(w.date) + (w.note ? ' \u2014 ' + esc(w.note) : '') + '</div></div>' +
      '<button class="btn danger small" onclick="delRow(\'workouts\',\'' + w.id + '\')">✕</button></div>';
  });
  document.getElementById("wList").innerHTML = html || '<div class="muted">No workouts logged yet.</div>';
  document.getElementById("stravaSyncBtn").style.display = S.strava.connected ? "inline-block" : "none";
}
