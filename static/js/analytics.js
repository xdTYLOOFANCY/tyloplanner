// TyloPlanner — study tracker module.
// ponytail: file/tab id stay "analytics" (nav state, sw cache, TABS array all
// reference it) — only the visible label changed to "Study".

import { S, safeRender } from './state.js';
import { esc, todayStr, api } from './utils.js';
import { createChart, getPastMonths, getBarGradient, noGridOptions, registerChartRerender } from './charts.js';

export async function addStudySession(refresh) {
  var dur = parseFloat(document.getElementById("ssDur").value) || 0;
  if (dur <= 0) { alert("Enter the minutes studied."); return; }
  await api("POST", "/api/study_sessions", {
    subject: document.getElementById("ssSubject").value.trim() || "Study",
    date: document.getElementById("ssDate").value || todayStr(),
    duration: dur, completed: 1,
    note: document.getElementById("ssNote").value.trim()
  });
  document.getElementById("ssSubject").value = "";
  document.getElementById("ssDur").value = "";
  document.getElementById("ssNote").value = "";
  await refresh();
}

let analyticsTimeRange = 12; // default: 12 months, 'all' for all time.

// Subject autocomplete for the log form and the dashboard timer widget:
// distinct subjects across ALL sessions, first-seen casing. Change-guarded.
export function populateSubjectList() {
  var dl = document.getElementById("subjectList");
  if (!dl || !S) return;
  var seen = {};
  (S.study_sessions || []).forEach(function(s) {
    var subj = (s.subject || "").trim();
    if (subj && !seen[subj.toLowerCase()]) seen[subj.toLowerCase()] = subj;
  });
  var opts = Object.values(seen).sort().map(function(v) { return '<option value="' + esc(v) + '">'; }).join('');
  if (dl.innerHTML !== opts) dl.innerHTML = opts;
}

// Ensure global scope for the HTML select
window.updateAnalyticsTimeRange = function(val) {
  analyticsTimeRange = val === 'all' ? 'all' : parseInt(val, 10);
  renderAnalytics();
};

export function renderAnalytics() {
  if (!S) return;
  safeRender("analytics", () => {
  // Determine time range from logged/planned study data
  let allKeys = new Set();
  S.events.forEach(e => { if (e.type === "study") allKeys.add((e.date || "").slice(0, 7)); });
  (S.study_sessions || []).forEach(s => allKeys.add((s.date || "").slice(0, 7)));

  let sortedKeys = Array.from(allKeys).sort();
  let months = [];

  if (analyticsTimeRange === 'all') {
    if (sortedKeys.length > 0) {
      let startD = new Date(sortedKeys[0] + "-01");
      let now = new Date();
      let diffMonths = (now.getFullYear() - startD.getFullYear()) * 12 + (now.getMonth() - startD.getMonth()) + 1;
      months = getPastMonths(Math.max(diffMonths, 1));
    } else {
      months = getPastMonths(1);
    }
  } else {
    months = getPastMonths(analyticsTimeRange);
  }

  var planned = {}, actual = {};
  months.forEach(function(m) { planned[m.key] = 0; actual[m.key] = 0; });

  // Planned hours from calendar "study" events, scoped to the selected range.
  var plannedH = 0;
  S.events.forEach(function(e) {
    if (e.type !== "study" || !e.start || !e.end) return;
    var h = (parseInt(e.end, 10) - parseInt(e.start, 10)) +
      ((parseInt(e.end.slice(3), 10) || 0) - (parseInt(e.start.slice(3), 10) || 0)) / 60;
    if (h <= 0) return;
    var k = (e.date || "").slice(0, 7);
    if (k in planned) { planned[k] += h; plannedH += h; }
  });

  // Actual hours from logged study sessions, plus per-subject totals.
  // Subjects are free text: group case-insensitively, display first-seen casing.
  var actualH = 0, sessionCount = 0, bySubject = {}, subjectNames = {}, studyDays = new Set();
  var inRange = [];
  (S.study_sessions || []).forEach(function(s) {
    var k = (s.date || "").slice(0, 7);
    if (!(k in actual)) return;
    var h = (s.duration || 0) / 60;
    actual[k] += h; actualH += h; sessionCount++;
    inRange.push(s);
    if (s.date) studyDays.add(s.date);
    var subj = (s.subject || "Study").trim() || "Study";
    var key = subj.toLowerCase();
    if (!subjectNames[key]) subjectNames[key] = subj;
    bySubject[key] = (bySubject[key] || 0) + h;
  });

  populateSubjectList();

  // --- Stat cards (scoped to selected range) ---
  const stats = [
    { label: "Hours Studied ✅", val: Math.round(actualH * 10) / 10, icon: "☑️" },
    { label: "Hours Planned 📚", val: Math.round(plannedH * 10) / 10, icon: "📚" },
    { label: "Sessions", val: sessionCount, icon: "📖" },
    { label: "Study Days 🔥", val: studyDays.size, icon: "📆" }
  ];
  let gridHtml = '';
  stats.forEach(s => {
    gridHtml += `
      <div class="stat-card">
        <div class="stat-card-top">
          <div class="stat-card-val">${s.val}</div>
          <div class="stat-card-icon">${s.icon}</div>
        </div>
        <div class="stat-card-label">${s.label}</div>
      </div>
    `;
  });
  document.getElementById("aTotalsGrid").innerHTML = gridHtml;

  // --- Charts ---
  var labels = months.map(function(m) { return m.label; });
  const style = getComputedStyle(document.body);
  const colorAccent = style.getPropertyValue('--accent').trim() || '#4f8cff';
  const colorAccent2 = style.getPropertyValue('--accent2').trim() || '#7c5cff';
  const colorOrange = style.getPropertyValue('--orange').trim() || '#f5a623';

  const barCtxStudy = document.getElementById('chartStudy').getContext('2d');
  createChart('chartStudy', 'bar', labels, [
    {
      label: 'Planned (hrs)',
      data: months.map(m => Math.round(planned[m.key] * 10) / 10),
      backgroundColor: colorOrange + '55',
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      label: 'Actual (hrs)',
      data: months.map(m => Math.round(actual[m.key] * 10) / 10),
      backgroundColor: getBarGradient(barCtxStudy, colorOrange, '#d68b00'),
      borderRadius: 6,
      borderSkipped: false,
    }
  ], noGridOptions());

  // Hours by subject (top 10, horizontal bars)
  var subjects = Object.keys(bySubject).sort(function(a, b) { return bySubject[b] - bySubject[a]; }).slice(0, 10);
  const barCtxSubj = document.getElementById('chartSubjects').getContext('2d');
  var subjOpts = noGridOptions();
  subjOpts.indexAxis = 'y';
  subjOpts.plugins = { legend: { display: false } };
  createChart('chartSubjects', 'bar', subjects.map(function(k) { return subjectNames[k]; }), [
    {
      label: 'Hours',
      data: subjects.map(function(s) { return Math.round(bySubject[s] * 10) / 10; }),
      backgroundColor: getBarGradient(barCtxSubj, colorAccent, colorAccent2),
      borderRadius: 6,
      borderSkipped: false,
    }
  ], subjOpts);

  // --- Session log ---
  var sh = "";
  if (inRange.length) {
    sh = '<table class="grades"><tr><th>Subject</th><th>Date</th><th>Duration</th><th>What was studied</th><th></th></tr>';
    inRange.slice().sort(function(a, b) { return b.date.localeCompare(a.date); }).forEach(function(s) {
      sh += '<tr><td>' + esc(s.subject) + '</td><td class="muted">' + esc(s.date) + '</td><td>' + s.duration + 'm</td>' +
        '<td class="muted">' + esc(s.note || '') + '</td>' +
        '<td style="text-align:right"><button class="btn danger small" onclick="delRow(\'study_sessions\', \'' + s.id + '\')">Delete</button></td></tr>';
    });
    sh += '</table>';
  } else {
    sh = '<div class="muted">No study sessions logged yet. Log one above, or use the timer on the dashboard.</div>';
  }
  document.getElementById("aStudySessionsList").innerHTML = sh;
  var ssd = document.getElementById("ssDate");
  if (ssd && !ssd.value && document.activeElement !== ssd) ssd.value = todayStr();
  });
}

registerChartRerender(renderAnalytics);
