// TyloPlanner — workouts module.

import { S, SET, safeRender } from './state.js';
import { toISO, todayStr, esc, api, guardFocus, MONTHS } from './utils.js';
import { weekDates } from './utils.js';
import { createChart, getPastMonths, getBarGradient, noGridOptions, lineSeries, lineChartOptions, registerChartRerender } from './charts.js';

var WTYPES = { run: "🏃 Run", bike: "🚴 Bike", swim: "🏊 Swim", gym: "🏋\uFE0F Gym" };

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

function fmtMinSec(min) {
  var m = Math.floor(min), s = Math.round((min - m) * 60);
  if (s === 60) { m++; s = 0; }
  return m + ":" + (s < 10 ? "0" : "") + s;
}

function paceStr(w) {
  if (!w.dur || !w.dist) return "";
  if (w.type === "run") return fmtMinSec(w.dur / w.dist) + " /km";
  if (w.type === "bike") return (Math.round(w.dist / (w.dur / 60) * 10) / 10) + " km/h";
  if (w.type === "swim") return fmtMinSec(w.dur / (w.dist * 10)) + " /100m";
  return "";
}

export async function saveWorkoutGoal(key, val, refresh) {
  var o = {}; o[key] = String(parseFloat(val) || "");
  SET[key] = o[key];
  // blur so the focus-guard in renderWorkouts doesn't suppress the refresh
  if (document.activeElement && document.activeElement.tagName === "INPUT") document.activeElement.blur();
  await api("POST", "/api/settings", o);
  await refresh();
}

export function weekTotals(off) {
  var ds = weekDates(off), a = toISO(ds[0]), b = toISO(ds[6]);
  var t = { count: 0, runKm: 0, bikeKm: 0, swimKm: 0, min: 0, gym: 0 };
  S.workouts.forEach(function(w) {
    if (w.date < a || w.date > b) return;
    t.count++; t.min += w.dur || 0;
    if (w.type === "gym") t.gym++;
    else if (w.type === "run") t.runKm += w.dist || 0;
    else if (w.type === "bike") t.bikeKm += w.dist || 0;
    else if (w.type === "swim") t.swimKm += w.dist || 0;
  });
  return t;
}

function statHtml(val, label, goal) {
  var h = '<div class="stat"><div class="v">' + val + '</div><div class="l">' + label + '</div>';
  if (goal > 0) {
    var pc = Math.min(100, Math.round(val / goal * 100));
    h += '<div class="goalbar"><div style="width:' + pc + '%"></div></div>' +
      '<div class="goal-sub">goal ' + goal + '</div>';
  }
  return h + '</div>';
}

function goalInput(key, label) {
  var v = parseFloat(SET[key]) || "";
  return '<label class="muted" style="font-size:12px;display:flex;align-items:center;gap:4px">' + label +
    '<input type="number" min="0" step="0.5" value="' + v + '" placeholder="0" style="width:64px" ' +
    'onchange="saveWorkoutGoal(\'' + key + '\', this.value)"></label>';
}

var PR_MIN_DIST = { run: 3, bike: 10, swim: 0.5 }; // ponytail: fixed floor so a 200m jog can't be "best pace"

function computePRs() {
  var out = { run: {}, bike: {}, swim: {} };
  S.workouts.forEach(function(w) {
    var o = out[w.type];
    if (!o) return;
    var d = w.dist || 0, m = w.dur || 0;
    if (d > ((o.longest || {}).dist || 0)) o.longest = w;
    if (m > 0 && d >= PR_MIN_DIST[w.type]) {
      var better = w.type === "bike"
        ? (!o.best || d / m > o.best.dist / o.best.dur)   // bike: higher speed wins
        : (!o.best || m / d < o.best.dur / o.best.dist);  // run/swim: lower pace wins
      if (better) o.best = w;
    }
  });
  return out;
}

export function renderWorkouts() {
  // Don't blow away a goal input the user is editing (live-sync re-render).
  if (guardFocus("wGoalsRow")) return;

  // Default the log-session date to today, but never clobber a date the user
  // picked (live-sync re-renders used to reset a backdate mid-entry).
  var wd = document.getElementById("wDate");
  if (wd && !wd.value) wd.value = todayStr();

  safeRender("workouts", () => {
    var t = weekTotals(0);
  document.getElementById("wStats").innerHTML =
    statHtml(t.count, 'sessions', 0) +
    statHtml(Math.round(t.runKm * 10) / 10, 'run km', parseFloat(SET.goal_run_km) || 0) +
    statHtml(Math.round(t.bikeKm * 10) / 10, 'bike km', parseFloat(SET.goal_bike_km) || 0) +
    statHtml(Math.round(t.swimKm * 10) / 10, 'swim km', parseFloat(SET.goal_swim_km) || 0) +
    statHtml(Math.round(t.min), 'minutes', 0) +
    statHtml(t.gym, 'gym sessions', parseFloat(SET.goal_gym_sessions) || 0);
  document.getElementById("wGoalsRow").innerHTML =
    '<span class="muted" style="font-size:12px">Weekly goals:</span>' +
    goalInput('goal_run_km', '🏃 km') +
    goalInput('goal_bike_km', '🚴 km') +
    goalInput('goal_swim_km', '🏊 km') +
    goalInput('goal_gym_sessions', '🏋️ sessions');
  var prs = computePRs(), prHtml = "";
  ["run", "bike", "swim"].forEach(function(ty) {
    var o = prs[ty];
    if (!o.longest || !o.longest.dist) return;
    prHtml += '<div class="stat"><div class="v">' + (Math.round(o.longest.dist * 10) / 10) +
      ' km</div><div class="l">longest ' + ty + '</div><div class="goal-sub">' + esc(o.longest.date) + '</div></div>';
    if (o.best) prHtml += '<div class="stat"><div class="v">' + paceStr(o.best) +
      '</div><div class="l">best ' + (ty === "bike" ? "speed" : "pace") + ' (' + ty + ')</div>' +
      '<div class="goal-sub">' + esc(o.best.date) + '</div></div>';
  });
  document.getElementById("wPRs").innerHTML = prHtml ||
    '<div class="muted">Log workouts with a distance to see records.</div>';
  var list = S.workouts.slice().sort(function(a, b) { return b.date.localeCompare(a.date); }).slice(0, 50);
  var html = "";
  list.forEach(function(w) {
    var pace = paceStr(w);
    html += '<div class="list-item"><div class="grow"><div>' + WTYPES[w.type] +
      (w.dist ? ' \u00b7 ' + w.dist + ' km' : '') + (w.dur ? ' \u00b7 ' + w.dur + ' min' : '') +
      (pace ? ' · <span class="muted">' + pace + '</span>' : '') +
      (w.source === "strava" ? ' <span class="badge blue">strava</span>' : '') + '</div>' +
      '<div class="muted">' + esc(w.date) + (w.note ? ' \u2014 ' + esc(w.note) : '') + '</div></div>' +
      '<button class="btn danger small" onclick="delRow(\'workouts\',\'' + w.id + '\')">✕</button></div>';
  });
  document.getElementById("wList").innerHTML = html || '<div class="muted">No workouts logged yet.</div>';
  document.getElementById("stravaSyncBtn").style.display = S.strava.connected ? "inline-block" : "none";
  renderWorkoutCharts();
  });
}

// ---- Monthly/weekly analytics charts (moved here from the old Analytics tab) ----

let workoutsTimeRange = 12; // months shown, 'all' for all time.

window.updateWorkoutsTimeRange = function(val) {
  workoutsTimeRange = val === 'all' ? 'all' : parseInt(val, 10);
  renderWorkoutCharts();
};

function renderWorkoutCharts() {
  if (!S) return; // theme-changed can fire before state loads
  var months;
  if (workoutsTimeRange === 'all') {
    var keys = new Set();
    S.workouts.forEach(function(w) { keys.add((w.date || "").slice(0, 7)); });
    var sorted = Array.from(keys).sort();
    if (sorted.length) {
      var startD = new Date(sorted[0] + "-01"), now = new Date();
      var diff = (now.getFullYear() - startD.getFullYear()) * 12 + (now.getMonth() - startD.getMonth()) + 1;
      months = getPastMonths(Math.max(diff, 1));
    } else months = getPastMonths(1);
  } else {
    months = getPastMonths(workoutsTimeRange);
  }

  var sessions = {}, kmRun = {}, kmBike = {}, kmSwim = {};
  months.forEach(function(m) { sessions[m.key] = 0; kmRun[m.key] = 0; kmBike[m.key] = 0; kmSwim[m.key] = 0; });
  var totRunKm = 0, totBikeKm = 0, totSwimKm = 0, totMin = 0, totSessions = 0;
  S.workouts.forEach(function(w) {
    var k = (w.date || "").slice(0, 7);
    totSessions++; totMin += w.dur || 0;
    if (w.type === "run") totRunKm += w.dist || 0;
    if (w.type === "bike") totBikeKm += w.dist || 0;
    if (w.type === "swim") totSwimKm += w.dist || 0;
    if (k in sessions) {
      sessions[k]++;
      if (w.type === "run") kmRun[k] += w.dist || 0;
      if (w.type === "bike") kmBike[k] += w.dist || 0;
      if (w.type === "swim") kmSwim[k] += w.dist || 0;
    }
  });

  // All-time totals row
  document.getElementById("wAllTime").innerHTML =
    '<div class="stat"><div class="v">' + totSessions + '</div><div class="l">sessions</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(totRunKm) + '</div><div class="l">run km</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(totBikeKm) + '</div><div class="l">bike km</div></div>' +
    '<div class="stat"><div class="v">' + (Math.round(totSwimKm * 10) / 10) + '</div><div class="l">swim km</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(totMin / 60) + '</div><div class="l">training hrs</div></div>';

  var labels = months.map(function(m) { return m.label; });
  const style = getComputedStyle(document.body);
  const colorAccent = style.getPropertyValue('--accent').trim() || '#4f8cff';
  const colorAccent2 = style.getPropertyValue('--accent2').trim() || '#7c5cff';
  const colorGreen = style.getPropertyValue('--green').trim() || '#3ecf8e';
  const colorOrange = style.getPropertyValue('--orange').trim() || '#f5a623';
  const colorCyan = '#00f0ff'; // Neon cyan for running chart

  const barCtxWorkouts = document.getElementById('chartWorkouts').getContext('2d');
  createChart('chartWorkouts', 'bar', labels, [
    {
      label: 'Sessions',
      data: months.map(function(m) { return sessions[m.key]; }),
      backgroundColor: getBarGradient(barCtxWorkouts, colorAccent, colorAccent2),
      borderRadius: 6,
      borderSkipped: false,
    }
  ], noGridOptions());

  createChart('chartDistance', 'line', labels, [
    lineSeries('Run (km)', months.map(function(m) { return kmRun[m.key]; }), colorCyan),
    lineSeries('Bike (km)', months.map(function(m) { return kmBike[m.key]; }), colorAccent2),
    lineSeries('Swim (km)', months.map(function(m) { return kmSwim[m.key]; }), colorGreen)
  ], lineChartOptions());

  // Training load: hours per discipline, last 12 weeks
  var weekKeys = [], weekLabels = [];
  for (var off = -11; off <= 0; off++) {
    var mon = weekDates(off)[0];
    weekKeys.push(toISO(mon));
    weekLabels.push(mon.getDate() + " " + MONTHS[mon.getMonth()]);
  }
  var load = { run: {}, bike: {}, swim: {}, gym: {} };
  weekKeys.forEach(function(k) { load.run[k] = 0; load.bike[k] = 0; load.swim[k] = 0; load.gym[k] = 0; });
  S.workouts.forEach(function(w) {
    if (!w.date || !load[w.type]) return;
    var d = new Date(w.date + "T00:00:00");
    var mon2 = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7);
    var k = toISO(mon2);
    if (k in load[w.type]) load[w.type][k] += (w.dur || 0) / 60;
  });
  var loadColors = { run: colorCyan, bike: colorAccent2, swim: colorGreen, gym: colorOrange };
  createChart('chartTrainingLoad', 'line', weekLabels, ['run', 'bike', 'swim', 'gym'].map(function(ty) {
    return lineSeries(
      ty.charAt(0).toUpperCase() + ty.slice(1),
      weekKeys.map(function(k) { return Math.round(load[ty][k] * 10) / 10; }),
      loadColors[ty]
    );
  }), lineChartOptions());
}

registerChartRerender(renderWorkoutCharts);
