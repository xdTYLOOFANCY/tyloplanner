// TyloPlanner — analytics module.

import { S, safeRender } from './state.js';
import { z, esc, MONTHS } from './utils.js';

let chartInstances = {};
let analyticsTimeRange = 12; // default: 12 months, 'all' for all time.

function getPastMonths(count) {
  var out = [], now = new Date();
  for (var i = count - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: d.getFullYear() + "-" + z(d.getMonth() + 1), label: MONTHS[d.getMonth()] + " '" + d.getFullYear().toString().substring(2) });
  }
  return out;
}

// Ensure global scope for the HTML select
window.updateAnalyticsTimeRange = function(val) {
  analyticsTimeRange = val === 'all' ? 'all' : parseInt(val, 10);
  renderAnalytics();
};

function createChart(canvasId, type, labels, datasets, options = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  // Get computed theme variables
  const style = getComputedStyle(document.body);
  const textColor = style.getPropertyValue('--text').trim();
  const gridColor = style.getPropertyValue('--border').trim();
  const fontFamily = style.getPropertyValue('font-family').trim();
  const panelColor = style.getPropertyValue('--panel').trim();

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    color: textColor,
    font: { family: fontFamily },
    plugins: {
      legend: {
        labels: { color: textColor, font: { family: fontFamily, size: 13 } }
      },
      tooltip: {
        backgroundColor: panelColor,
        titleColor: textColor,
        bodyColor: textColor,
        borderColor: gridColor,
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
        displayColors: true,
        titleFont: { family: fontFamily, size: 13, weight: 'bold' },
        bodyFont: { family: fontFamily, size: 13 },
      }
    },
    scales: {
      x: {
        grid: { color: gridColor, drawBorder: false },
        ticks: { color: textColor, font: { family: fontFamily } }
      },
      y: {
        grid: { color: gridColor, drawBorder: false },
        ticks: { color: textColor, font: { family: fontFamily } },
        beginAtZero: true
      }
    }
  };

  if (window.Chart) {
    chartInstances[canvasId] = new window.Chart(ctx, {
      type: type,
      data: {
        labels: labels,
        datasets: datasets
      },
      options: Object.assign({}, defaultOptions, options)
    });
  } else {
    console.error("Chart.js not loaded.");
  }
}

export function renderAnalytics() {
  if (!S) return;
  safeRender("analytics", () => {
  // Determine time range
  let allKeys = new Set();
  S.workouts.forEach(w => allKeys.add((w.date || "").slice(0, 7)));
  S.events.forEach(e => { if (e.type === "study") allKeys.add((e.date || "").slice(0, 7)); });
  S.habit_log.forEach(l => allKeys.add((l.date || "").slice(0, 7)));
  if (S.study_sessions) S.study_sessions.forEach(s => allKeys.add((s.date || "").slice(0, 7)));
  
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

  var dutchGraded = S.exams.filter(function(e) { return (e.grading_type === 'dutch' || !e.grading_type) && e.grade != null; });
  var avg = null;
  if (dutchGraded.length) {
    var wsum = 0, sum = 0;
    dutchGraded.forEach(function(e) { var w = e.ects || 1; wsum += w; sum += e.grade * w; });
    avg = Math.round(sum / wsum * 100) / 100;
  }
  var graded = S.exams.filter(function(e) {
    if (e.grading_type === 'pass_fail' || e.grading_type === 'letter') return e.grade_text != null;
    return e.grade != null;
  });

  // --- Populate Summary Items (Grid of 8 Stat Cards) ---
  const stats = [
    { label: "Workouts \uD83C\uDFC3", val: totSessions, icon: "\uD83C\uDFCD\uFE0F" },
    { label: "Run KM \uD83D\uDC5F", val: Math.round(totRunKm), icon: "\uD83D\uDC5F" },
    { label: "Bike KM \uD83D\uDEB4", val: Math.round(totBikeKm), icon: "\uD83D\uDEB4\u200D\u2642\uFE0F" },
    { label: "Training Hrs \uD83D\uDD52", val: Math.round(totMin / 60), icon: "\uD83D\uDD52" },
    { label: "Study Hrs Planned \uD83D\uDCDA", val: Math.round(totStudyH), icon: "\uD83D\uDCDA" },
    { label: "Study Hrs Actual \u2705", val: Math.round(totStudyActualH), icon: "\u2611\uFE0F" },
    { label: "Habit Check-ins \uD83D\uDD25", val: totChecks, icon: "\uD83D\uDD25" },
    { label: "Dutch avg (" + dutchGraded.length + ")", val: avg != null ? avg : "\u2014", icon: "\uD83C\uDF93" }
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

  // --- Draw Charts ---
  var labels = months.map(function(m) { return m.label; });
  
  const style = getComputedStyle(document.body);
  const colorAccent = style.getPropertyValue('--accent').trim() || '#4f8cff';
  const colorAccent2 = style.getPropertyValue('--accent2').trim() || '#7c5cff';
  const colorGreen = style.getPropertyValue('--green').trim() || '#3ecf8e';
  const colorOrange = style.getPropertyValue('--orange').trim() || '#f5a623';
  const colorCyan = '#00f0ff'; // Neon cyan for running chart

  // Helper function for bar gradients
  function getBarGradient(ctx, c1, c2) {
    if (!ctx) return c1;
    var gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, c1);
    gradient.addColorStop(1, c2);
    return gradient;
  }
  
  // Update default options to remove grid lines
  const noGridOptions = {
    scales: {
      x: { grid: { display: false }, ticks: { color: style.getPropertyValue('--text').trim() } },
      y: { grid: { display: false }, ticks: { color: style.getPropertyValue('--text').trim(), stepSize: 1 }, beginAtZero: true }
    }
  };

  const barCtxWorkouts = document.getElementById('chartWorkouts').getContext('2d');
  createChart('chartWorkouts', 'bar', labels, [
    {
      label: 'Sessions',
      data: months.map(m => sessions[m.key]),
      backgroundColor: getBarGradient(barCtxWorkouts, colorAccent, colorAccent2),
      borderRadius: 6,
      borderSkipped: false,
    }
  ], noGridOptions);

  const lineCtxDist = document.getElementById('chartDistance').getContext('2d');
  createChart('chartDistance', 'line', labels, [
    {
      label: 'Run (km)',
      data: months.map(m => kmRun[m.key]),
      borderColor: colorCyan,
      backgroundColor: getBarGradient(lineCtxDist, colorCyan + '44', colorCyan + '00'),
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 6,
      borderWidth: 2
    },
    {
      label: 'Bike (km)',
      data: months.map(m => kmBike[m.key]),
      borderColor: colorAccent2,
      backgroundColor: getBarGradient(lineCtxDist, colorAccent2 + '44', colorAccent2 + '00'),
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 6,
      borderWidth: 2
    }
  ], noGridOptions);

  const barCtxStudy = document.getElementById('chartStudy').getContext('2d');
  createChart('chartStudy', 'bar', labels, [
    {
      label: 'Planned (hrs)',
      data: months.map(m => study[m.key]),
      backgroundColor: colorOrange + '55',
      borderRadius: 6,
      borderSkipped: false,
    },
    {
      label: 'Actual (hrs)',
      data: months.map(m => studyActual[m.key]),
      backgroundColor: getBarGradient(barCtxStudy, colorOrange, '#d68b00'),
      borderRadius: 6,
      borderSkipped: false,
    }
  ], noGridOptions);

  const lineCtxHabits = document.getElementById('chartHabits').getContext('2d');
  createChart('chartHabits', 'line', labels, [
    {
      label: 'Check-ins',
      data: months.map(m => habits[m.key]),
      borderColor: '#ff5c5c',
      backgroundColor: getBarGradient(lineCtxHabits, '#ff5c5c44', '#ff5c5c00'),
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 6,
      borderWidth: 2
    }
  ], noGridOptions);

  // --- Populate Tables ---
  var gh = "";
  if (graded.length) {
    gh = '<table class="grades"><tr><th>Exam</th><th>Date</th><th>ECTS</th><th>Grade</th></tr>';
    graded.slice().sort(function(a, b) { return b.date.localeCompare(a.date); }).forEach(function(e) {
      var badgeHtml;
      var type = e.grading_type || 'dutch';
      if (type === 'pass_fail') {
        var pf = e.grade_text === 'pass' ? 'green' : 'red';
        badgeHtml = '<span class="badge ' + pf + '">' + esc(e.grade_text || '\u2014') + '</span>';
      } else if (type === 'letter') {
        var lp = e.grade_text && e.grade_text !== 'F' && !e.grade_text.startsWith('D') ? 'gray' : 'red';
        badgeHtml = '<span class="badge ' + lp + '">' + esc(e.grade_text || '\u2014') + '</span>';
      } else {
        var pass = type === 'percentage' ? e.grade >= 55 : e.grade >= 5.5;
        var suffix = type === 'percentage' ? '%' : '';
        badgeHtml = '<span class="badge ' + (pass ? 'green' : 'red') + '">' + e.grade + suffix + '</span>';
      }
      gh += '<tr><td>' + esc(e.name) + '</td><td class="muted">' + esc(e.date) + '</td><td>' + (e.ects || '\u2014') + '</td>' +
        '<td>' + badgeHtml + '</td></tr>';
    });
    gh += '</table>';
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
  });
}

window.addEventListener('theme-changed', () => {
  Object.values(chartInstances).forEach(chart => {
    if (chart) chart.destroy();
  });
  chartInstances = {};
  renderAnalytics();
});
