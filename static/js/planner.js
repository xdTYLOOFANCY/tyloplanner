// TyloPlanner — planner (weekly calendar) module.

import { S } from './state.js';
import { toISO, todayStr, fmtShort, esc, api, DAYS } from './utils.js';
import { weekDates } from './utils.js';

var weekOffset = 0, addingDay = null;

export function moveWeek(d) {
  if (d === 0) weekOffset = 0; else weekOffset += d;
  addingDay = null; renderPlanner();
}

export function renderPlanner() {
  var dates = weekDates(weekOffset);
  document.getElementById("weekLabel").textContent =
    (weekOffset === 0 ? "This week · " : "") + fmtShort(dates[0]) + " – " + fmtShort(dates[6]) + " " + dates[6].getFullYear();
  var today = todayStr(), html = "";
  for (var i = 0; i < 7; i++) {
    var iso = toISO(dates[i]);
    var evs = S.events.filter(function(e) { return e.date === iso; })
      .sort(function(a, b) { return (a.start || "").localeCompare(b.start || ""); });
    html += '<div class="daycol' + (iso === today ? ' today' : '') + '">';
    html += '<h4><span class="dname">' + DAYS[i] + ' ' + dates[i].getDate() + '</span><button class="btn ghost small" onclick="openAdd(\'' + iso + '\')">+</button></h4>';
    evs.forEach(function(e) {
      html += '<div class="event ' + esc(e.source === "ics" ? "ics" : e.type) + '"><span class="x" onclick="delRow(\'events\',\'' + e.id + '\')">✕</span>' +
        (e.start ? '<div class="muted">' + esc(e.start) + (e.end ? '–' + esc(e.end) : '') + '</div>' : '') +
        '<div>' + esc(e.title) + '</div></div>';
    });
    if (addingDay === iso) {
      html += '<div class="miniform">' +
        '<input id="evTitle" placeholder="What?">' +
        '<select id="evType"><option value="study">Study</option><option value="other">Other</option><option value="workout">Workout</option></select>' +
        '<div style="display:flex;gap:4px"><input id="evStart" type="time" style="flex:1"><input id="evEnd" type="time" style="flex:1"></div>' +
        '<div style="display:flex;gap:4px"><button class="btn small" style="flex:1" onclick="saveEvent(\'' + iso + '\')">Save</button>' +
        '<button class="btn ghost small" onclick="cancelAdd()">✕</button></div></div>';
    }
    html += '</div>';
  }
  document.getElementById("weekGrid").innerHTML = html;
  document.querySelectorAll(".miniform input, .miniform select").forEach(function(el) {
    el.addEventListener("keydown", function(ev) {
      if (ev.key === "Enter") { ev.preventDefault(); saveEvent(addingDay); }
      if (ev.key === "Escape") cancelAdd();
    });
  });
  var t = document.getElementById("evTitle"); if (t) t.focus();
}

export function openAdd(iso) { addingDay = iso; renderPlanner(); }
export function cancelAdd() { addingDay = null; renderPlanner(); }

export async function saveEvent(iso, refresh) {
  var title = document.getElementById("evTitle").value.trim(); if (!title) return;
  await api("POST", "/api/events", {
    date: iso, title: title,
    type: document.getElementById("evType").value,
    start: document.getElementById("evStart").value,
    end: document.getElementById("evEnd").value, source: "local"
  });
  addingDay = null; await refresh();
}
