// TyloPlanner — analytics module.

import { S } from './state.js';
import { z, esc, MONTHS } from './utils.js';

function barChart(elId, labelId, values, labels, cls, decimals) {
  var max = Math.max.apply(null, values.concat([1]));
  var ch = "", lb = "";
  for (var i = 0; i < values.length; i++) {
    var pc = Math.round(values[i] / max * 100);
    var v = decimals ? Math.round(values[i] * Math.pow(10, decimals)) / Math.pow(10, decimals) : Math.round(values[i]);
    ch += '<div class="bar ' + (cls || "") + '" style="height:' + pc + '%"><span>' + (values[i] ? v : "") + '</span></div>';
    lb += '<div>' + labels[i] + '</div>';
  }
  document.getElementById(elId).innerHTML = ch;
  document.getElementById(labelId).innerHTML = lb;
}

function last12Months() {
  var out = [], now = new Date();
  for (var i = 11; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: d.getFullYear() + "-" + z(d.getMonth() + 1), label: MONTHS[d.getMonth()] });
  }
  return out;
}

export function renderAnalytics() {
  var months = last12Months();
  var sessions = {}, kmRun = {}, kmBike = {}, study = {}, habits = {}, studyActual = {};
  months.forEach(function(m) { sessions[m.key] = 0; kmRun[m.key] = 0; kmBike[m.key] = 0; study[m.key] = 0; habits[m.key] = 0; studyActual[m.key] = 0; });

  var totRunKm = 0, totBikeKm = 0, totMin = 0, totSessions = 0, totStudyH = 0, totChecks = 0, totStudyActualH = 0;
  S.workouts.forEach(function(w) {
    var k = (w.date || "").slice(0, 7);
    totSessions++; totMin += w.dur || 0;
    if (w.type === "run") totRunKm += w.dist || 0;
    if (w.type === "bike") totBikeKm += w.dist || 0;
    if (k in sessions) {
      sessions[k]++;
      if (w.type === "run") kmRun[k] += w.dist || 0;
      if (w.type === "bike") kmBike[k] += w.dist || 0;
    }
  });
  S.events.forEach(function(e) {
    if (e.type !== "study" || !e.start || !e.end) return;
    var h = (parseInt(e.end, 10) - parseInt(e.start, 10)) +
      ((parseInt(e.end.slice(3), 10) || 0) - (parseInt(e.start.slice(3), 10) || 0)) / 60;
    if (h <= 0) return;
    totStudyH += h;
    var k = (e.date || "").slice(0, 7);
    if (k in study) study[k] += h;
  });
  S.habit_log.forEach(function(l) {
    totChecks++;
    var k = (l.date || "").slice(0, 7);
    if (k in habits) habits[k]++;
  });
  
  if (S.study_sessions) {
    S.study_sessions.forEach(function(s) {
      var h = (s.duration || 0) / 60;
      totStudyActualH += h;
      var k = (s.date || "").slice(0, 7);
      if (k in studyActual) studyActual[k] += h;
    });
  }

  var graded = S.exams.filter(function(e) { return e.grade != null; });
  var avg = null;
  if (graded.length) {
    var wsum = 0, sum = 0;
    graded.forEach(function(e) { var w = e.ects || 1; wsum += w; sum += e.grade * w; });
    avg = Math.round(sum / wsum * 100) / 100;
  }

  document.getElementById("aTotals").innerHTML =
    '<div class="stat"><div class="v">' + totSessions + '</div><div class="l">workouts</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(totRunKm) + '</div><div class="l">run km</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(totBikeKm) + '</div><div class="l">bike km</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(totMin / 60) + '</div><div class="l">training hrs</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(totStudyH) + '</div><div class="l">study hrs planned</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(totStudyActualH) + '</div><div class="l">study hrs actual</div></div>' +
    '<div class="stat"><div class="v">' + totChecks + '</div><div class="l">habit check-ins</div></div>' +
    '<div class="stat"><div class="v">' + (avg != null ? avg : "\u2014") + '</div><div class="l">avg grade' + (graded.length ? " (" + graded.length + ")" : "") + '</div></div>';

  var labels = months.map(function(m) { return m.label; });
  barChart("aWorkouts", "aWorkoutsL", months.map(function(m) { return sessions[m.key]; }), labels, "", 0);
  barChart("aKmRun", "aKmRunL", months.map(function(m) { return kmRun[m.key]; }), labels, "green", 1);
  barChart("aKmBike", "aKmBikeL", months.map(function(m) { return kmBike[m.key]; }), labels, "green", 1);
  barChart("aStudy", "aStudyL", months.map(function(m) { return study[m.key]; }), labels, "orange", 1);
  barChart("aStudyActual", "aStudyActualL", months.map(function(m) { return studyActual[m.key]; }), labels, "orange", 1);
  barChart("aHabits", "aHabitsL", months.map(function(m) { return habits[m.key]; }), labels, "", 0);

  var gh = "";
  if (graded.length) {
    gh = '<table class="grades"><tr><th>Exam</th><th>Date</th><th>ECTS</th><th>Grade</th></tr>';
    graded.slice().sort(function(a, b) { return b.date.localeCompare(a.date); }).forEach(function(e) {
      var cls = e.grade >= 5.5 ? "green" : "red";
      gh += '<tr><td>' + esc(e.name) + '</td><td class="muted">' + esc(e.date) + '</td><td>' + (e.ects || "\u2014") + '</td>' +
        '<td><span class="badge ' + cls + '">' + e.grade + '</span></td></tr>';
    });
    gh += '</table>';
    if (avg != null) gh += '<p style="margin-top:10px;font-size:14px">Weighted average (by ECTS): <b>' + avg + '</b></p>';
  } else gh = '<div class="muted">No grades entered yet \u2014 add them in the Exams &amp; grades tab.</div>';
  document.getElementById("aGrades").innerHTML = gh;

  var sh = "";
  if (S.study_sessions && S.study_sessions.length) {
    sh = '<table class="grades"><tr><th>Subject</th><th>Date</th><th>Duration</th><th></th></tr>';
    S.study_sessions.slice().sort(function(a, b) { return b.date.localeCompare(a.date); }).forEach(function(s) {
      sh += '<tr><td>' + esc(s.subject) + '</td><td class="muted">' + esc(s.date) + '</td><td>' + s.duration + 'm</td>' +
        '<td style="text-align:right"><button class="btn danger small" onclick="delRow(\'study_sessions\', \'' + s.id + '\')">Delete</button></td></tr>';
    });
    sh += '</table>';
  } else {
    sh = '<div class="muted">No study sessions logged yet. Complete a Pomodoro session or stopwatch on the dashboard to log!</div>';
  }
  document.getElementById("aStudySessionsList").innerHTML = sh;
}
