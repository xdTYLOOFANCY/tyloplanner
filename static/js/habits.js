// TyloPlanner — habits tracker module.

import { S, habitSet, setHabitEntry, safeRender, syncSilent } from './state.js';
import { createChart, getPastMonths, noGridOptions, registerChartRerender } from './charts.js';
import { toISO, todayStr, parseISO, esc, api, DAYS } from './utils.js';
import { weekDates } from './utils.js';
import { askConfirm, askPrompt, showContextMenu } from './utils.js';

// Frequency labels for display
var FREQ_OPTIONS = [
  { value: 7, label: 'Daily' },
  { value: 8, label: 'Weekdays (Mon–Fri)' },
  { value: 9, label: 'Weekend (Sat–Sun)' },
  { value: 6, label: '6×/week' },
  { value: 5, label: '5×/week' },
  { value: 4, label: '4×/week' },
  { value: 3, label: '3×/week' },
  { value: 2, label: '2×/week' },
  { value: 1, label: '1×/week' },
];

function freqLabel(f) {
  if (f === 7) return '';
  if (f === 8) return 'Mon–Fri';
  if (f === 9) return 'Sat–Sun';
  return f + '×/wk';
}

// ----- Add / Toggle -----

export async function addHabit(refresh) {
  var n = document.getElementById("habitName").value.trim(); if (!n) return;
  var freqSel = document.getElementById("habitFreq");
  var freq = freqSel ? parseInt(freqSel.value, 10) : 7;
  // Compute next order_index
  var maxOrder = 0;
  S.habits.forEach(function(h) { if ((h.order_index || 0) > maxOrder) maxOrder = h.order_index || 0; });
  await api("POST", "/api/habits", { name: n, created: todayStr(), frequency: freq, order_index: maxOrder + 1 });
  document.getElementById("habitName").value = "";
  if (freqSel) freqSel.value = "7";
  await refresh();
}

export async function archiveHabit(id, refresh) {
  var ok = await askConfirm("This habit will be moved to the archive. You can restore it later.", { title: "Archive habit?" });
  if (!ok) return;
  await api("DELETE", "/api/habits/" + id);
  await refresh();
}

export async function restoreHabit(id, refresh) {
  await api("PUT", "/api/habits/" + id, { archived: 0 });
  await refresh();
}

export async function permanentDeleteHabit(id, refresh) {
  var ok = await askConfirm("Permanently delete this habit and ALL its history? This cannot be undone.", { title: "Delete permanently?", danger: true, okText: "Delete forever" });
  if (!ok) return;
  await api("DELETE", "/api/habits/" + id + "/permanent");
  await refresh();
}

export async function renameHabit(id, currentName, refresh) {
  var newName = await askPrompt("Rename habit", currentName);
  if (newName === null || newName.trim() === "" || newName.trim() === currentName) return;
  await api("PUT", "/api/habits/" + id, { name: newName.trim() });
  await refresh();
}

export async function editHabitFrequency(id, currentFreq, refresh) {
  var newFreq = await askPrompt("Frequency target", String(currentFreq), {
    options: FREQ_OPTIONS.map(function(o) { return { value: String(o.value), label: o.label }; })
  });
  if (newFreq === null) return;
  var f = parseInt(newFreq, 10);
  if (f === currentFreq) return;
  await api("PUT", "/api/habits/" + id, { frequency: f });
  await refresh();
}

export function habitMenu(ev, id, refresh) {
  var h = S.habits.find(function(x) { return x.id === id; });
  if (!h) return;
  showContextMenu(ev, [
    { icon: '✏️', label: 'Rename', onClick: function() { renameHabit(id, h.name, refresh); } },
    { icon: '🎯', label: 'Change frequency', onClick: function() { editHabitFrequency(id, h.frequency || 7, refresh); } },
    { sep: true },
    { icon: '📦', label: 'Archive', onClick: function() { archiveHabit(id, refresh); } },
  ]);
}

export async function toggleHabit(id, iso) {
  var key = id + "|" + iso;
  var done = !habitSet[key];
  setHabitEntry(key, done); // optimistic

  window.dispatchEvent(new CustomEvent("tylo:habit-toggled", {
    detail: { id: id, date: iso, done: done }
  }));

  await api("POST", "/api/habits/" + id + "/toggle", { date: iso });
  // Absorb our own version bump so the live-sync poll doesn't force a full
  // re-render (dashboard grid rebuild = visible jerk) a few seconds later.
  await syncSilent();
}

// ----- Streak calculation -----

function getMonday(d) {
  var day = d.getDay(); // 0=Sun
  var diff = (day === 0) ? -6 : 1 - day;
  var mon = new Date(d);
  mon.setDate(mon.getDate() + diff);
  return mon;
}

function countInWeek(hid, weekStart) {
  var count = 0;
  for (var i = 0; i < 7; i++) {
    var d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    if (habitSet[hid + "|" + toISO(d)]) count++;
  }
  return count;
}

function weekdaysInWeek(hid, weekStart) {
  var count = 0;
  for (var i = 0; i < 5; i++) { // Mon=0..Fri=4
    var d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    if (habitSet[hid + "|" + toISO(d)]) count++;
  }
  return count;
}

function weekendInWeek(hid, weekStart) {
  var count = 0;
  for (var i = 5; i < 7; i++) { // Sat=5, Sun=6
    var d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    if (habitSet[hid + "|" + toISO(d)]) count++;
  }
  return count;
}

export function streak(hid) {
  var h = S.habits.find(function(x) { return x.id === hid; });
  var freq = (h && h.frequency) || 7;

  // For daily streaks, use the original fast path
  if (freq === 7) {
    var c = 0, d = parseISO(todayStr());
    if (!habitSet[hid + "|" + toISO(d)]) d.setDate(d.getDate() - 1);
    while (habitSet[hid + "|" + toISO(d)]) { c++; d.setDate(d.getDate() - 1); }
    return c;
  }

  // Weekly streak: count consecutive weeks meeting target
  var today = parseISO(todayStr());
  var weekStart = getMonday(today);
  var s = 0;

  // Check current (partial) week first
  var met = false;
  if (freq === 8) met = weekdaysInWeek(hid, weekStart) >= 5;
  else if (freq === 9) met = weekendInWeek(hid, weekStart) >= 2;
  else met = countInWeek(hid, weekStart) >= freq;

  if (met) {
    s++;
    weekStart.setDate(weekStart.getDate() - 7);
  } else {
    // Current week not met yet — start counting from last week
    weekStart.setDate(weekStart.getDate() - 7);
  }

  // Count previous consecutive weeks
  for (var i = 0; i < 200; i++) {
    if (freq === 8) met = weekdaysInWeek(hid, weekStart) >= 5;
    else if (freq === 9) met = weekendInWeek(hid, weekStart) >= 2;
    else met = countInWeek(hid, weekStart) >= freq;
    if (!met) break;
    s++;
    weekStart.setDate(weekStart.getDate() - 7);
  }
  return s;
}

// ----- Heatmap -----

var _openHeatmapId = null;

export function toggleHeatmap(id) {
  if (_openHeatmapId === id) {
    _openHeatmapId = null;
  } else {
    _openHeatmapId = id;
  }
  renderHabits();
}

function renderHeatmapCard() {
  var container = document.getElementById("habitHeatmap");
  if (!container) return;
  if (!_openHeatmapId) { container.innerHTML = ""; return; }
  var h = S.habits.find(function(x) { return x.id === _openHeatmapId; });
  if (!h) { container.innerHTML = ""; _openHeatmapId = null; return; }

  var today = parseISO(todayStr());
  var hid = h.id;

  // Build 12 months of data (roughly 53 weeks)
  var weeks = 53;
  // Find the Monday of the current week
  var endMonday = getMonday(today);
  var startDate = new Date(endMonday);
  startDate.setDate(startDate.getDate() - (weeks - 1) * 7);

  // Count total days and completed days for consistency %
  var createdDate = h.created ? parseISO(h.created) : startDate;
  var totalDays = 0, completedDays = 0;

  // Build cells
  var cells = '';
  for (var w = 0; w < weeks; w++) {
    for (var d = 0; d < 7; d++) {
      var date = new Date(startDate);
      date.setDate(date.getDate() + w * 7 + d);
      if (date > today) {
        cells += '<div class="heatmap-cell" data-level="empty"></div>';
        continue;
      }
      var iso = toISO(date);
      var on = !!habitSet[hid + "|" + iso];

      // For consistency calc, only count applicable days
      if (date >= createdDate) {
        var dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        var applicable = true;
        if (h.frequency === 8 && (dayOfWeek === 0 || dayOfWeek === 6)) applicable = false;
        if (h.frequency === 9 && dayOfWeek >= 1 && dayOfWeek <= 5) applicable = false;
        if (applicable) {
          totalDays++;
          if (on) completedDays++;
        }
      }

      var level = on ? 4 : 0;
      cells += '<div class="heatmap-cell" data-level="' + level + '" title="' + iso + (on ? ' ✓' : '') + '"></div>';
    }
  }

  // Month labels
  var monthLabels = '';
  var prevMonth = -1;
  for (var w = 0; w < weeks; w++) {
    var d = new Date(startDate);
    d.setDate(d.getDate() + w * 7);
    if (d.getMonth() !== prevMonth) {
      prevMonth = d.getMonth();
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      monthLabels += '<span style="grid-column:' + (w + 1) + '">' + months[d.getMonth()] + '</span>';
    }
  }

  var consistency = totalDays > 0 ? Math.round(completedDays / totalDays * 100) : 0;

  var html = '<div class="card" style="margin-top:12px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
  html += '<h3 style="margin:0">' + esc(h.name) + ' — Consistency</h3>';
  html += '<span class="badge ' + (consistency >= 80 ? 'green' : consistency >= 50 ? 'yellow' : 'gray') + '" style="font-size:14px">' + consistency + '%</span>';
  html += '</div>';
  html += '<div class="heatmap-months">' + monthLabels + '</div>';
  html += '<div class="heatmap-grid">';
  html += '<div class="heatmap-days">';
  html += '<span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>';
  html += '</div>';
  html += '<div class="heatmap-cells">' + cells + '</div>';
  html += '</div>';
  html += '<div class="heatmap-legend">';
  html += '<span class="muted" style="font-size:11px">Less</span>';
  html += '<div class="heatmap-cell" data-level="0"></div>';
  html += '<div class="heatmap-cell" data-level="4"></div>';
  html += '<span class="muted" style="font-size:11px">More</span>';
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;
}

// ----- Drag reorder -----

var _dragHabitId = null;

export function dragHabitStart(e, id) {
  _dragHabitId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  e.target.closest('tr').classList.add('dragging');
}

export function dragHabitOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

export function dragHabitEnd(e) {
  document.querySelectorAll('#habitTable tr.dragging').forEach(function(r) { r.classList.remove('dragging'); });
  _dragHabitId = null;
}

export async function dropHabit(e, dropId, refresh) {
  e.preventDefault();
  var dragId = e.dataTransfer.getData('text/plain');
  if (!dragId || dragId === dropId) return;
  await reorderHabits(dragId, dropId, refresh);
}

async function reorderHabits(dragId, dropId, refresh) {
  var active = S.habits.filter(function(h) { return !h.archived; });
  active.sort(function(a, b) { return (a.order_index || 0) - (b.order_index || 0); });

  var dragIdx = active.findIndex(function(h) { return h.id === dragId; });
  var dropIdx = active.findIndex(function(h) { return h.id === dropId; });
  if (dragIdx === -1 || dropIdx === -1 || dragIdx === dropIdx) return;

  var dragged = active.splice(dragIdx, 1)[0];
  active.splice(dropIdx, 0, dragged);

  var promises = active.map(function(h, idx) {
    if (h.order_index !== idx) {
      h.order_index = idx;
      return api("PUT", "/api/habits/" + h.id, { order_index: idx });
    }
    return Promise.resolve();
  });
  await Promise.all(promises);
  await refresh();
}

// ----- Archived section -----

function renderArchivedSection(refresh) {
  var container = document.getElementById("habitArchived");
  if (!container) return;
  var archived = S.habits.filter(function(h) { return !!h.archived; });
  if (archived.length === 0) { container.innerHTML = ""; return; }

  var html = '<div class="card" style="margin-top:12px">';
  html += '<details>';
  html += '<summary style="cursor:pointer;font-weight:600;font-size:14px;color:var(--muted)">Archived habits (' + archived.length + ')</summary>';
  html += '<div style="margin-top:10px">';
  archived.forEach(function(h) {
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">';
    html += '<span>' + esc(h.name) + ' <span class="muted" style="font-size:12px">' + esc(freqLabel(h.frequency || 7)) + '</span></span>';
    html += '<span style="display:flex;gap:6px">';
    html += '<button class="btn ghost small" onclick="restoreHabit(\'' + h.id + '\')" title="Restore">↩️</button>';
    html += '<button class="btn danger small" onclick="permanentDeleteHabit(\'' + h.id + '\')" title="Delete permanently">🗑️</button>';
    html += '</span>';
    html += '</div>';
  });
  html += '</div></details></div>';
  container.innerHTML = html;
}

// ----- Main render -----

// Monthly check-ins chart (moved here from the old Analytics tab).
function renderCheckinsChart() {
  if (!S) return; // theme-changed can fire before state loads
  var months = getPastMonths(12), counts = {};
  months.forEach(function(m) { counts[m.key] = 0; });
  S.habit_log.forEach(function(l) {
    var k = (l.date || "").slice(0, 7);
    if (k in counts) counts[k]++;
  });
  var lineCtx = document.getElementById('chartHabits');
  if (!lineCtx) return;
  createChart('chartHabits', 'line', months.map(function(m) { return m.label; }), [
    {
      label: 'Check-ins',
      data: months.map(function(m) { return counts[m.key]; }),
      borderColor: '#ff5c5c',
      backgroundColor: '#ff5c5c22',
      fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 6, borderWidth: 2
    }
  ], noGridOptions());
}

registerChartRerender(renderCheckinsChart);

export function renderHabits() {
  safeRender("habits", function() {
    var dates = weekDates(0), today = todayStr();
    var active = S.habits.filter(function(h) { return !h.archived; });
    active.sort(function(a, b) { return (a.order_index || 0) - (b.order_index || 0); });

    var html = '<tr><th style="width:30px"></th><th>Habit</th>';
    for (var i = 0; i < 7; i++) html += '<th' + (toISO(dates[i]) === today ? ' style="color:var(--accent)"' : '') + '>' + DAYS[i] + '</th>';
    html += '<th>Streak</th><th style="width:36px"></th></tr>';

    active.forEach(function(h) {
      var freq = h.frequency || 7;
      var fl = freqLabel(freq);
      html += '<tr draggable="true" data-habit-row="' + h.id + '"'
        + ' ondragstart="dragHabitStart(event,\'' + h.id + '\')"'
        + ' ondragover="dragHabitOver(event)"'
        + ' ondrop="dropHabit(event,\'' + h.id + '\')"'
        + ' ondragend="dragHabitEnd(event)">';
      html += '<td style="cursor:grab;color:var(--muted);text-align:center">☰</td>';
      html += '<td style="cursor:pointer" onclick="toggleHeatmap(\'' + h.id + '\')">' + esc(h.name);
      if (fl) html += ' <span class="muted" style="font-size:11px">' + esc(fl) + '</span>';
      html += '</td>';
      for (var k = 0; k < 7; k++) {
        var iso = toISO(dates[k]), on = !!habitSet[h.id + "|" + iso];

        // Gray out non-applicable days for weekday/weekend habits
        var dayNum = dates[k].getDay(); // 0=Sun..6=Sat
        var dimmed = false;
        if (freq === 8 && (dayNum === 0 || dayNum === 6)) dimmed = true;
        if (freq === 9 && dayNum >= 1 && dayNum <= 5) dimmed = true;

        html += '<td>';
        html += '<span class="hcheck' + (on ? ' on' : '') + (dimmed ? ' dimmed' : '') + '"'
          + ' data-habit-id="' + h.id + '" data-habit-date="' + iso + '"'
          + ' onclick="toggleHabit(\'' + h.id + '\',\'' + iso + '\')">';
        html += (on ? '✓' : '') + '</span></td>';
      }
      var s = streak(h.id);
      var streakUnit = (freq === 7) ? '' : 'w';
      html += '<td><span class="badge ' + (s > 0 ? 'green' : 'gray') + '" data-habit-streak="' + h.id + '">' + s + streakUnit + '🔥</span></td>';
      html += '<td><button class="btn ghost small" style="padding:2px 6px" onclick="habitMenu(event,\'' + h.id + '\')" title="Actions">⋮</button></td>';
      html += '</tr>';
    });

    document.getElementById("habitTable").innerHTML = html + (active.length ? "" : '<tr><td colspan="11" class="muted">No habits yet \u2014 add one above.</td></tr>');

    renderHeatmapCard();
    renderCheckinsChart();
    renderArchivedSection(window._habitRefresh);
  });
}

// Global listener for localized DOM patching
window.addEventListener("tylo:habit-toggled", function(e) {
  const { id, date, done } = e.detail;

  // Patch checkboxes
  const checkEls = document.querySelectorAll(`[data-habit-id="${id}"][data-habit-date="${date}"]`);
  checkEls.forEach(function(el) {
    if (done) {
      el.classList.add("on");
      el.textContent = "✓";
    } else {
      el.classList.remove("on");
      el.textContent = "";
    }
  });

  // Patch streak badges
  const streakEls = document.querySelectorAll(`[data-habit-streak="${id}"]`);
  streakEls.forEach(function(el) {
    var h = S.habits.find(function(x) { return x.id === id; });
    var freq = (h && h.frequency) || 7;
    var c = streak(id);
    var unit = (freq === 7) ? '' : 'w';
    el.textContent = c + unit + "🔥";
    if (c > 0) {
      el.className = "badge green";
    } else {
      el.className = "badge gray";
    }
  });
});
