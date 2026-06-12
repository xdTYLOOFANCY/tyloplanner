// TyloPlanner — habits tracker module.

import { S, habitSet, setHabitEntry } from './state.js';
import { toISO, todayStr, parseISO, esc, api, DAYS } from './utils.js';
import { weekDates } from './utils.js';

export async function addHabit(refresh) {
  var n = document.getElementById("habitName").value.trim(); if (!n) return;
  await api("POST", "/api/habits", { name: n, created: todayStr() });
  document.getElementById("habitName").value = "";
  await refresh();
}

export async function delHabit(id, refresh) {
  if (!confirm("Delete this habit and its history?")) return;
  await api("DELETE", "/api/habits/" + id); await refresh();
}

export async function toggleHabit(id, iso, renderHabits, renderDashboard) {
  var key = id + "|" + iso;
  setHabitEntry(key, !habitSet[key]); // optimistic
  renderHabits(); renderDashboard();
  await api("POST", "/api/habits/" + id + "/toggle", { date: iso });
}

export function streak(hid) {
  var c = 0, d = parseISO(todayStr());
  if (!habitSet[hid + "|" + toISO(d)]) d.setDate(d.getDate() - 1);
  while (habitSet[hid + "|" + toISO(d)]) { c++; d.setDate(d.getDate() - 1); }
  return c;
}

export function renderHabits() {
  var dates = weekDates(0), today = todayStr();
  var html = '<tr><th>Habit</th>';
  for (var i = 0; i < 7; i++) html += '<th' + (toISO(dates[i]) === today ? ' style="color:var(--accent)"' : '') + '>' + DAYS[i] + '</th>';
  html += '<th>Streak</th><th></th></tr>';
  S.habits.forEach(function(h) {
    html += '<tr><td>' + esc(h.name) + '</td>';
    for (var k = 0; k < 7; k++) {
      var iso = toISO(dates[k]), on = !!habitSet[h.id + "|" + iso];
      html += '<td><span class="hcheck' + (on ? ' on' : '') + '" onclick="toggleHabit(\'' + h.id + '\',\'' + iso + '\')">' + (on ? '✓' : '') + '</span></td>';
    }
    html += '<td><span class="badge ' + (streak(h.id) > 0 ? 'green' : 'gray') + '">' + streak(h.id) + '🔥</span></td>';
    html += '<td><button class="btn danger small" onclick="delHabit(\'' + h.id + '\')">✕</button></td></tr>';
  });
  document.getElementById("habitTable").innerHTML = html + (S.habits.length ? "" : '<tr><td colspan="10" class="muted">No habits yet \u2014 add one above.</td></tr>');
}
