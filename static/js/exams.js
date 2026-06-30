// TyloPlanner — exams & grades module.

import { S, SET, safeRender } from './state.js';
import { esc, api, daysUntil, todayStr } from './utils.js';

// ---- grade helpers ----

// Returns the display value: prefer grade_text, fall back to legacy numeric grade
function gradeVal(e) {
  if (e.grade_text != null && e.grade_text !== '') return e.grade_text;
  if (e.grade != null) return String(e.grade);
  return null;
}

function parseNumeric(v) {
  if (v == null) return null;
  var s = String(v).replace('%', '').trim();
  var n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function isPassFail(v) {
  var s = String(v).toLowerCase().trim();
  return s === 'pass' || s === 'fail' || s === 'p' || s === 'f';
}

function normalisePassFail(v) {
  var s = String(v).toLowerCase().trim();
  if (s === 'p' || s === 'pass') return 'pass';
  if (s === 'f' || s === 'fail') return 'fail';
  return v;
}

function gradeClass(v) {
  if (v == null) return '';
  var s = String(v).toLowerCase().trim();
  if (s === 'pass') return 'green';
  if (s === 'fail') return 'red';
  var n = parseNumeric(v);
  if (n != null) {
    // percentage if > 10 or ends with %
    if (String(v).includes('%') || n > 10) return n >= 55 ? 'green' : 'red';
    return n >= 5.5 ? 'green' : 'red';
  }
  // letter grade
  var upper = s.toUpperCase();
  if (upper === 'F') return 'red';
  if (upper.startsWith('D')) return 'orange';
  return 'green';
}

// ---- countdown badge ----
export function examBadge(d) {
  if (d < 0)  return '<span class="badge gray">past</span>';
  if (d === 0) return '<span class="badge red">TODAY</span>';
  var cls = d < 7 ? 'red' : (d < 21 ? 'orange' : 'green');
  return '<span class="badge ' + cls + '">' + d + 'd</span>';
}

// ---- add exam ----
export async function addExam(refresh) {
  var n    = document.getElementById('examName').value.trim();
  var d    = document.getElementById('examDate').value;
  var ects = parseFloat(document.getElementById('examEcts').value) || null;
  if (!n || !d) { alert('Name and date required.'); return; }
  await api('POST', '/api/exams', { name: n, date: d, ects: ects });
  document.getElementById('examName').value = '';
  document.getElementById('examDate').value = '';
  document.getElementById('examEcts').value = '';
  await refresh();
}

// ---- save grade (called from input onchange) ----
export async function setGradeText(id, raw, refresh) {
  var v = raw.trim();
  if (isPassFail(v)) v = normalisePassFail(v);
  var n = parseNumeric(v);
  // store numeric in grade column for backward compat, text in grade_text
  var payload = { grade_text: v || null, grade: n };
  await api('PUT', '/api/exams/' + id, payload);
  await refresh();
}

// legacy compat
export async function setGrade(id, val, refresh) {
  await setGradeText(id, String(val ?? ''), refresh);
}

// ---- inline field edit (name / date / ects) ----
function startInlineEdit(el, id, field, currentVal, refresh) {
  if (el.querySelector('input')) return;
  var input = document.createElement('input');
  input.type = field === 'date' ? 'date' : (field === 'ects' ? 'number' : 'text');
  input.className = 'inline-input';
  input.value = currentVal != null ? currentVal : '';
  if (field === 'ects') { input.step = '0.5'; input.min = '0'; input.style.width = '58px'; }
  else if (field === 'date') input.style.width = '130px';
  else input.style.width = '180px';

  async function save() {
    var val = input.value;
    var payload = {};
    if (field === 'ects') payload.ects = val === '' ? null : parseFloat(val);
    else payload[field] = val;
    await api('PUT', '/api/exams/' + id, payload);
    await refresh();
  }
  input.addEventListener('blur', save);
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') input.blur();
    if (ev.key === 'Escape') refresh();
  });
  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  if (input.select) input.select();
}

// ---- ECTS goal ----
export async function saveEctsGoal(val, refresh) {
  await api('POST', '/api/settings', { ects_goal: val === '' ? '' : String(parseFloat(val) || '') });
  if (refresh) await refresh();
}

// ---- analytics helpers ----
function calcStats(exams) {
  var ectsEarned = 0, passed = 0, failed = 0, dutchSum = 0, dutchW = 0, dutchCount = 0;
  // distribution buckets: excellent / good / sufficient / fail / pending
  var dist = { excellent: 0, good: 0, sufficient: 0, fail: 0, pending: 0 };

  exams.forEach(function(e) {
    var v = gradeVal(e);
    if (v == null) { dist.pending++; return; }
    var s = String(v).toLowerCase().trim();
    if (s === 'pass') { ectsEarned += (e.ects || 0); passed++; dist.excellent++; return; }
    if (s === 'fail') { failed++; dist.fail++; return; }
    var n = parseNumeric(v);
    if (n != null) {
      var isDutch = n <= 10 && !String(v).includes('%');
      if (isDutch) {
        if (n >= 5.5) { ectsEarned += (e.ects || 0); passed++; } else failed++;
        var w = e.ects || 1; dutchSum += n * w; dutchW += w; dutchCount++;
        if (n >= 7.5) dist.excellent++;
        else if (n >= 6.5) dist.good++;
        else if (n >= 5.5) dist.sufficient++;
        else dist.fail++;
      } else { // percentage
        if (n >= 55) { ectsEarned += (e.ects || 0); passed++; }
        else if (String(v).includes('%')) failed++;
        if (n >= 75) dist.excellent++;
        else if (n >= 65) dist.good++;
        else if (n >= 55) dist.sufficient++;
        else dist.fail++;
      }
    } else { // letter grade
      var u = s.toUpperCase();
      if (u !== 'F' && !u.startsWith('D')) { ectsEarned += (e.ects || 0); passed++; } else failed++;
      if (u === 'A+' || u === 'A' || u === 'A-') dist.excellent++;
      else if (u === 'B+' || u === 'B' || u === 'B-') dist.good++;
      else if (u === 'C+' || u === 'C' || u === 'C-') dist.sufficient++;
      else dist.fail++;
    }
  });
  var avg = dutchCount > 0 ? Math.round(dutchSum / dutchW * 100) / 100 : null;
  return { ectsEarned: ectsEarned, passed: passed, failed: failed, avg: avg, dist: dist };
}

function donutSvg(earned, goal) {
  var r = 46, sw = 12;
  var circ = 2 * Math.PI * r;
  var pct = goal > 0 ? Math.min(1, earned / goal) : 0;
  var offset = circ * (1 - pct);
  return '<svg width="116" height="116" viewBox="0 0 116 116" style="flex-shrink:0">' +
    '<circle cx="58" cy="58" r="' + r + '" fill="none" stroke="var(--border)" stroke-width="' + sw + '"/>' +
    '<circle cx="58" cy="58" r="' + r + '" fill="none" stroke="var(--accent)" stroke-width="' + sw + '" ' +
      'stroke-dasharray="' + circ.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '" ' +
      'stroke-linecap="round" transform="rotate(-90 58 58)"/>' +
    '<text x="58" y="54" text-anchor="middle" dominant-baseline="middle" font-size="15" font-weight="700" fill="var(--text)">' + earned + '/' + goal + '</text>' +
    '<text x="58" y="70" text-anchor="middle" font-size="11" fill="var(--muted)">ECTS</text>' +
    '</svg>';
}

function distBar(dist) {
  var total = dist.excellent + dist.good + dist.sufficient + dist.fail + dist.pending;
  if (!total) return '';
  function seg(n, cls) {
    return n ? '<div class="dist-seg ' + cls + '" style="flex:' + n + '" title="' + n + '"></div>' : '';
  }
  var bar = '<div class="grade-dist-bar">' +
    seg(dist.excellent, 'excellent') + seg(dist.good, 'good') +
    seg(dist.sufficient, 'sufficient') + seg(dist.fail, 'fail') + seg(dist.pending, 'pending') +
    '</div>';
  var legend = '<div class="dist-legend">';
  if (dist.excellent) legend += '<span><span class="dist-dot excellent"></span>' + dist.excellent + ' high</span>';
  if (dist.good) legend += '<span><span class="dist-dot good"></span>' + dist.good + ' good</span>';
  if (dist.sufficient) legend += '<span><span class="dist-dot sufficient"></span>' + dist.sufficient + ' pass</span>';
  if (dist.fail) legend += '<span><span class="dist-dot fail"></span>' + dist.fail + ' fail</span>';
  if (dist.pending) legend += '<span><span class="dist-dot pending"></span>' + dist.pending + ' pending</span>';
  return bar + legend + '</div>';
}

function upcomingHtml(exams, today) {
  var up = exams.filter(function(e) { return e.date >= today; })
    .sort(function(a, b) { return a.date.localeCompare(b.date); })
    .slice(0, 3);
  if (!up.length) return '<span class="muted" style="font-size:12px">None upcoming</span>';
  return up.map(function(e) {
    var d = daysUntil(e.date);
    var cls = d === 0 ? 'red' : d < 7 ? 'red' : d < 21 ? 'orange' : 'green';
    var name = e.name.length > 20 ? e.name.slice(0, 18) + '…' : e.name;
    return '<div class="upcoming-row"><span class="upcoming-name">' + esc(name) + '</span>' +
      '<span class="badge ' + cls + '">' + (d === 0 ? 'TODAY' : d + 'd') + '</span></div>';
  }).join('');
}

function byYearHtml(exams) {
  var byYear = {};
  exams.forEach(function(e) {
    if (!e.date) return;
    var yr = parseInt(e.date.slice(0, 4));
    var mo = parseInt(e.date.slice(5, 7));
    var ay = mo >= 9 ? yr : yr - 1;
    var key = ay;
    if (!byYear[key]) byYear[key] = { earned: 0, total: 0 };
    byYear[key].total += (e.ects || 0);
    var v = gradeVal(e);
    if (v != null) {
      var s = String(v).toLowerCase().trim();
      var passes = false;
      if (s === 'pass') passes = true;
      else if (s !== 'fail') {
        var n = parseNumeric(v);
        if (n != null) passes = (n <= 10 && !String(v).includes('%')) ? n >= 5.5 : n >= 55;
        else { var u = s.toUpperCase(); passes = u !== 'F' && !u.startsWith('D'); }
      }
      if (passes) byYear[key].earned += (e.ects || 0);
    }
  });
  var keys = Object.keys(byYear).sort();
  if (!keys.length) return '<span class="muted" style="font-size:12px">No data</span>';
  var maxTotal = Math.max.apply(null, keys.map(function(k) { return byYear[k].total; })) || 1;
  return keys.map(function(k) {
    var y = byYear[k];
    var label = "'" + String(parseInt(k) % 100).padStart(2,'0') + '-' + String((parseInt(k)+1) % 100).padStart(2,'0');
    var tPct = Math.round(y.total / maxTotal * 100);
    var ePct = y.total > 0 ? Math.round(y.earned / maxTotal * 100) : 0;
    return '<div class="year-bar-row">' +
      '<span class="year-bar-label">' + label + '</span>' +
      '<div class="year-bar-track">' +
        '<div class="year-bar-total" style="width:' + tPct + '%"></div>' +
        '<div class="year-bar-earned" style="width:' + ePct + '%"></div>' +
      '</div>' +
      '<span class="year-bar-val">' + y.earned + (y.total !== y.earned ? '/' + y.total : '') + '</span>' +
      '</div>';
  }).join('');
}

// ---- analytics card ----
function renderAnalytics(exams, ectsGoal) {
  var goal = parseFloat(ectsGoal) || 0;
  var st = calcStats(exams);
  var today = todayStr();
  var goalInput = '<input type="number" class="inline-input" id="ectsGoalInput" value="' +
    (goal || '') + '" min="0" step="1" placeholder="set goal" style="width:62px" onchange="saveEctsGoal(this.value)">';

  if (goal > 0) {
    var topStats = '';
    if (st.avg != null) topStats += '<div class="da-stat"><div class="da-label">Weighted avg</div><div class="da-val">' + st.avg + '</div></div>';
    topStats += '<div class="da-stat"><div class="da-label">Passed</div><div class="da-val" style="color:var(--green)">' + st.passed + '</div></div>';
    if (st.failed) topStats += '<div class="da-stat"><div class="da-label">Failed</div><div class="da-val" style="color:#ff5c5c">' + st.failed + '</div></div>';
    topStats += '<div class="da-stat" style="margin-left:auto"><div class="da-label">ECTS goal</div><div>' + goalInput + '</div></div>';

    return '<div class="da-layout">' +
      donutSvg(st.ectsEarned, goal) +
      '<div class="da-right">' +
        '<div class="da-top">' + topStats + '</div>' +
        '<div class="da-section"><div class="da-section-label">Grade distribution</div>' + distBar(st.dist) + '</div>' +
        '<div class="da-bottom-grid">' +
          '<div><div class="da-section-label">Upcoming</div>' + upcomingHtml(exams, today) + '</div>' +
          '<div><div class="da-section-label">By academic year</div>' + byYearHtml(exams) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Slim bar (no goal set)
  var parts = ['<strong>' + st.ectsEarned + '</strong> ECTS earned'];
  if (st.avg != null) parts.push('<strong>' + st.avg + '</strong> avg');
  if (st.passed > 0) parts.push('<span style="color:var(--green)">' + st.passed + ' passed</span>');
  if (st.failed > 0) parts.push('<span style="color:#ff5c5c">' + st.failed + ' failed</span>');
  return '<div class="exam-analytics-row">' + parts.join(' &nbsp;·&nbsp; ') +
    ' &nbsp;·&nbsp; ECTS goal: ' + goalInput + '</div>';
}

// ---- main render ----
export function renderExams(refresh) {
  // Don't blow away a grade/date/name input the user is actively editing in the table
  var examTable = document.getElementById('examTable');
  var active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT') &&
      examTable && examTable.contains(active)) {
    return;
  }

  safeRender('exams', function() {
    var goal = SET && SET.ects_goal ? SET.ects_goal : '';
    var today = todayStr();

    var list = S.exams.slice().sort(function(a, b) {
      var af = a.date >= today, bf = b.date >= today;
      if (af && bf) return a.date.localeCompare(b.date);   // future: soonest first
      if (!af && !bf) return b.date.localeCompare(a.date); // past: newest first
      return af ? -1 : 1;
    });

    var analyticsEl = document.getElementById('examAnalytics');
    if (analyticsEl) analyticsEl.innerHTML = S.exams.length ? renderAnalytics(S.exams, goal) : '';

    var html = '<tr><th>Name</th><th>Date</th><th></th><th>ECTS</th><th>Grade</th><th></th></tr>';
    list.forEach(function(e) {
      var d = daysUntil(e.date);
      var v = gradeVal(e);
      var cls = v ? gradeClass(v) : '';
      var displayVal = v
        ? (isPassFail(v)
            ? '<span class="badge ' + (v === 'pass' ? 'green' : 'red') + '">' + v + '</span>'
            : (cls ? '<span class="badge ' + cls + '">' + esc(v) + '</span>' : esc(v)))
        : '';
      var id = esc(e.id);
      html += '<tr class="exam-tr">' +
        '<td class="exam-name-cell" onclick="examInlineEdit(this,\'' + id + '\',\'name\',\'' + esc((e.name || '').replace(/'/g,"\\'")) + '\')">' + esc(e.name) + '</td>' +
        '<td class="muted exam-date-cell" onclick="examInlineEdit(this,\'' + id + '\',\'date\',\'' + esc(e.date) + '\')">' + esc(e.date) + '</td>' +
        '<td>' + examBadge(d) + '</td>' +
        '<td class="exam-ects-cell" onclick="examInlineEdit(this,\'' + id + '\',\'ects\',' + (e.ects != null ? e.ects : 'null') + ')">' + (e.ects || '<span class="muted">—</span>') + '</td>' +
        '<td class="exam-grade-cell">' +
          '<input type="text" class="grade-input" value="' + esc(v || '') + '" placeholder="—" ' +
          'onchange="setGradeText(\'' + id + '\',this.value)">' +
          (displayVal ? '<span class="grade-badge-preview">' + displayVal + '</span>' : '') +
        '</td>' +
        '<td><button class="btn danger small exam-del" onclick="delRow(\'exams\',\'' + id + '\')">✕</button></td>' +
        '</tr>';
    });
    if (!list.length) html += '<tr><td colspan="6" class="muted">No exams yet.</td></tr>';

    document.getElementById('examTable').innerHTML = html;
  });
}

// ---- window-level bindings ----
export function examInlineEditFn(el, id, field, currentVal, refresh) {
  startInlineEdit(el, id, field, currentVal, refresh);
}
