// TyloPlanner — dashboard module.

import { S, habitSet } from './state.js';
import { todayStr, fmtShort, esc, daysUntil, api } from './utils.js';
import { examBadge } from './exams.js';
import { streak } from './habits.js';
import { weekTotals } from './workouts.js';

export function renderDashboard() {
  var now = new Date(), hr = now.getHours();
  var g = hr < 6 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  document.getElementById("greeting").textContent = g + " \uD83D\uDC4B";
  document.getElementById("headerDate").textContent = fmtShort(now) + " " + now.getFullYear();
  var today = todayStr(), html = "";

  var exams = S.exams.filter(function(e) { return daysUntil(e.date) >= 0; })
    .sort(function(a, b) { return a.date.localeCompare(b.date); });
  html += '<div class="card"><h3>Next deadlines</h3><div class="card-scroll">';
  if (exams.length) exams.forEach(function(e) {
    html += '<div class="list-item"><div class="grow">' + esc(e.name) + '</div>' + examBadge(daysUntil(e.date)) + '</div>'; });
  else html += '<div class="muted">Nothing upcoming.</div>';
  html += '</div></div>';

  var evs = S.events.filter(function(e) { return e.date === today; })
    .sort(function(a, b) { return (a.start || "").localeCompare(b.start || ""); });
  html += '<div class="card"><h3>Today\u2019s plan</h3><div class="card-scroll">';
  if (evs.length) evs.forEach(function(ev) {
    html += '<div class="list-item"><div class="grow">' + esc(ev.title) + '</div><span class="muted">' + esc(ev.start || "") + '</span></div>'; });
  else html += '<div class="muted">Nothing planned today.</div>';
  html += '</div></div>';

  html += '<div class="card"><h3>Habits today</h3><div class="card-scroll">';
  if (S.habits.length) S.habits.forEach(function(h) {
    var on = !!habitSet[h.id + "|" + today];
    html += '<div class="list-item"><span class="hcheck' + (on ? ' on' : '') + '" onclick="toggleHabit(\'' + h.id + '\',\'' + today + '\')">' + (on ? '\u2713' : '') + '</span><div class="grow">' + esc(h.name) + '</div><span class="badge ' + (streak(h.id) > 0 ? 'green' : 'gray') + '">' + streak(h.id) + '\uD83D\uDD25</span></div>'; });
  else html += '<div class="muted">No habits yet.</div>';
  html += '</div></div>';

  var t = weekTotals(0);
  html += '<div class="card"><h3>Training this week</h3><div class="wstats">' +
    '<div class="stat"><div class="v">' + t.count + '</div><div class="l">sessions</div></div>' +
    '<div class="stat"><div class="v">' + (Math.round(t.runKm * 10) / 10) + '</div><div class="l">run km</div></div>' +
    '<div class="stat"><div class="v">' + (Math.round(t.bikeKm * 10) / 10) + '</div><div class="l">bike km</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(t.min) + '</div><div class="l">min</div></div></div></div>';

  var open = S.tasks.filter(function(x) { return !x.done; });
  html += '<div class="card"><h3>Open to-dos</h3><div class="card-scroll">';
  if (open.length) open.forEach(function(o) {
    html += '<div class="checkbox-task"><input type="checkbox" onchange="toggleTask(\'' + o.id + '\',true)"><span>' + esc(o.name) + '</span></div>'; });
  else html += '<div class="muted">All clear \u2728</div>';
  html += '</div></div>';

  document.getElementById("dashCards").innerHTML = html;

  var shortcutHtml = '';
  if (S.shortcuts) {
    S.shortcuts.forEach(function(s) {
      var domain = '';
      try { domain = new URL(s.url).hostname; } catch(e){}
      var icon = s.icon || ("https://www.google.com/s2/favicons?domain=" + domain + "&sz=64");
      
      shortcutHtml += '<a href="' + esc(s.url) + '" target="_blank" class="shortcut-btn">' +
              '<img src="' + esc(icon) + '" alt="">' +
              '<div class="name">' + esc(s.name) + '</div>' +
              '</a>';
    });
  }
  
  var shortcutsEl = document.getElementById("dashShortcuts");
  if (shortcutsEl) {
    shortcutsEl.innerHTML = shortcutHtml;
  }
}

export async function addShortcut(refresh) {
  var url = prompt("Enter website URL (e.g. https://github.com):");
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  var name = prompt("Enter shortcut name:");
  if (!name) {
    try {
      name = new URL(url).hostname.replace(/^www\./, '');
    } catch(e) {
      name = url;
    }
  }
  
  await api("POST", "/api/shortcuts", { name: name, url: url, icon: "" });
  await refresh();
}
