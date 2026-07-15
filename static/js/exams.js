// TyloPlanner — exams & grades module.

import { S, SET, safeRender } from './state.js';
import { esc, api, daysUntil, todayStr, askConfirm, askPrompt, showContextMenu, guardFocus } from './utils.js';

// ---- trackers (studies/programmes; stored as JSON in setting exam_trackers) ----

function trackers() {
  var t = [];
  try { t = JSON.parse(SET.exam_trackers || '[]') || []; } catch (e) {}
  if (!t.length) {
    // ponytail: implicit default tracker until the user creates one; inherits legacy ects_goal
    t = [{ id: 'main', name: 'Main', goal: parseFloat(SET.ects_goal) || 0 }];
  }
  return t;
}

function selTrackerId() {
  var t = trackers();
  var sel = localStorage.getItem('examTrackerSel');
  for (var i = 0; i < t.length; i++) if (t[i].id === sel) return sel;
  return t[0].id;
}

// Exams with a null/unknown tracker_id belong to the first tracker.
function trackerOf(e, list) {
  for (var i = 0; i < list.length; i++) if (list[i].id === e.tracker_id) return e.tracker_id;
  return list[0].id;
}

async function saveTrackers(t, refresh) {
  await api('POST', '/api/settings', { exam_trackers: JSON.stringify(t) });
  if (refresh) await refresh();
}

export async function addTracker(refresh) {
  var name = await askPrompt('New tracker (e.g. Minor, Master)', '', { okText: 'Add' });
  if (!name || !name.trim()) return;
  var t = trackers();
  var id = Math.random().toString(36).slice(2, 10);
  t.push({ id: id, name: name.trim(), goal: 0 });
  localStorage.setItem('examTrackerSel', id);
  await saveTrackers(t, refresh);
}

export function selectTracker(id, refresh) {
  localStorage.setItem('examTrackerSel', id);
  renderExams(refresh);
}

export function trackerMenu(ev, id, refresh) {
  var t = trackers();
  var tr = t.filter(function(x) { return x.id === id; })[0];
  if (!tr) return;
  showContextMenu(ev, [
    { label: 'Rename', icon: '✏️', onClick: async function() {
        var name = await askPrompt('Rename tracker', tr.name, { okText: 'Save' });
        if (!name || !name.trim()) return;
        tr.name = name.trim();
        await saveTrackers(t, refresh);
      } },
    { label: 'Delete', icon: '🗑', danger: true, onClick: async function() {
        if (t.length < 2) { alert('You need at least one tracker.'); return; }
        var ok = await askConfirm('Delete "' + tr.name + '"? Its exams move to the first tracker.', { danger: true, okText: 'Delete' });
        if (!ok) return;
        var rest = t.filter(function(x) { return x.id !== id; });
        // ponytail: one PUT per exam; fine at personal-app scale
        var moves = S.exams.filter(function(e) { return trackerOf(e, t) === id; });
        for (var i = 0; i < moves.length; i++) {
          await api('PUT', '/api/exams/' + moves[i].id, { tracker_id: rest[0].id });
        }
        if (localStorage.getItem('examTrackerSel') === id) localStorage.setItem('examTrackerSel', rest[0].id);
        await saveTrackers(rest, refresh);
      } },
  ]);
}

// ---- custom tags (global list in setting exam_tags; per-exam CSV in exams.tags) ----

function allTags() {
  try { return JSON.parse(SET.exam_tags || '[]') || []; } catch (e) { return []; }
}

function examTagList(e) {
  return e.tags ? e.tags.split(',').filter(Boolean) : [];
}

var tagFilter = null; // active tag filter, not persisted

export function toggleTagFilter(tag, refresh) {
  tagFilter = tagFilter === tag ? null : tag;
  renderExams(refresh);
}

export function tagMenu(ev, tag, refresh) {
  showContextMenu(ev, [
    { label: 'Rename', icon: '✏️', onClick: async function() {
        var name = await askPrompt('Rename tag', tag, { okText: 'Save' });
        if (!name || !name.trim() || name === tag) return;
        name = name.trim().replace(/,/g, '');
        var tags = allTags().map(function(x) { return x === tag ? name : x; });
        for (var i = 0; i < S.exams.length; i++) {
          var e = S.exams[i], list = examTagList(e);
          var idx = list.indexOf(tag);
          if (idx !== -1) { list[idx] = name; await api('PUT', '/api/exams/' + e.id, { tags: list.join(',') }); }
        }
        if (tagFilter === tag) tagFilter = name;
        await api('POST', '/api/settings', { exam_tags: JSON.stringify(tags) });
        await refresh();
      } },
    { label: 'Delete', icon: '🗑', danger: true, onClick: function() { deleteTag(tag, refresh); } },
  ]);
}

// Delete a tag globally: from the tag list and from every exam that has it.
async function deleteTag(tag, refresh) {
  var ok = await askConfirm('Delete tag "' + tag + '"? It is removed from all exams.', { danger: true, okText: 'Delete' });
  if (!ok) return false;
  for (var i = 0; i < S.exams.length; i++) {
    var e = S.exams[i], list = examTagList(e);
    if (list.indexOf(tag) !== -1) {
      await api('PUT', '/api/exams/' + e.id, { tags: list.filter(function(x) { return x !== tag; }).join(',') || null });
    }
  }
  if (tagFilter === tag) tagFilter = null;
  await api('POST', '/api/settings', { exam_tags: JSON.stringify(allTags().filter(function(x) { return x !== tag; })) });
  await refresh();
  return true;
}

// Checkbox dialog to assign tags to one exam (and create new tags inline).
export function editExamTags(id, refresh) {
  var e = S.exams.filter(function(x) { return x.id === id; })[0];
  if (!e) return;
  var current = examTagList(e);
  var tags = allTags();
  var dlg = document.createElement('dialog');
  dlg.className = 'modal';
  var boxes = tags.map(function(t) {
    return '<label class="tagpick-row"><input type="checkbox" value="' + esc(t) + '"' +
      (current.indexOf(t) !== -1 ? ' checked' : '') + '> ' + esc(t) +
      '<button type="button" class="tagpick-del" data-del="' + esc(t) + '" title="Delete tag everywhere">✕</button></label>';
  }).join('');
  dlg.innerHTML = '<div class="modal-content" style="max-width:340px;width:90%">' +
    '<h3 style="margin:0 0 12px;font-size:16px;font-weight:700">Tags — ' + esc(e.name) + '</h3>' +
    '<div class="tagpick-list">' + (boxes || '<span class="muted" style="font-size:13px">No tags yet — create one below.</span>') + '</div>' +
    '<input data-newtag placeholder="New tag (e.g. exam, practical, essay)" style="width:100%;box-sizing:border-box;margin:10px 0 16px;padding:8px">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn ghost" data-act="cancel">Cancel</button>' +
      '<button class="btn" data-act="ok">Save</button>' +
    '</div></div>';
  document.body.appendChild(dlg);
  dlg.showModal();
  function close() { try { dlg.close(); } catch (err) {} dlg.remove(); }
  async function save() {
    var picked = Array.prototype.map.call(dlg.querySelectorAll('input[type=checkbox]:checked'), function(c) { return c.value; });
    var nt = dlg.querySelector('[data-newtag]').value.trim().replace(/,/g, '');
    if (nt) {
      if (tags.indexOf(nt) === -1) await api('POST', '/api/settings', { exam_tags: JSON.stringify(tags.concat([nt])) });
      if (picked.indexOf(nt) === -1) picked.push(nt);
    }
    close();
    await api('PUT', '/api/exams/' + id, { tags: picked.join(',') || null });
    await refresh();
  }
  dlg.addEventListener('click', function(ev) {
    var del = ev.target.getAttribute && ev.target.getAttribute('data-del');
    if (del) {
      // close first — the dialog's tag list is stale once the tag is gone
      ev.preventDefault();
      close();
      deleteTag(del, refresh);
      return;
    }
    var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
    if (act === 'ok') save();
    else if (act === 'cancel' || ev.target === dlg) close();
  });
  dlg.querySelector('[data-newtag]').addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); save(); }
  });
}

// ---- academic year (stored as start year, e.g. "2025" = 2025-2026) ----

function guessAY(dateStr) {
  var yr = parseInt(dateStr.slice(0, 4)), mo = parseInt(dateStr.slice(5, 7));
  return String(mo >= 9 ? yr : yr - 1);
}

function examAY(e) {
  if (e.academic_year) return String(e.academic_year);
  return e.date ? guessAY(e.date) : '';
}

function ayLabel(ay) {
  var y = parseInt(ay);
  if (isNaN(y)) return '';
  return "'" + String(y % 100).padStart(2, '0') + '-' + String((y + 1) % 100).padStart(2, '0');
}

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
  await api('POST', '/api/exams', { name: n, date: d, ects: ects, tracker_id: selTrackerId(), academic_year: guessAY(d) });
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
  input.type = field === 'date' ? 'date' : (field === 'ects' || field === 'academic_year' ? 'number' : 'text');
  input.className = 'inline-input';
  input.value = currentVal != null ? currentVal : '';
  if (field === 'ects') { input.step = '0.5'; input.min = '0'; input.style.width = '58px'; }
  else if (field === 'academic_year') { input.step = '1'; input.min = '2000'; input.placeholder = 'start yr'; input.style.width = '72px'; }
  else if (field === 'date') input.style.width = '130px';
  else input.style.width = '180px';

  var cancelled = false;
  async function save() {
    if (cancelled) return;
    var val = input.value;
    var payload = {};
    if (field === 'ects') payload.ects = val === '' ? null : parseFloat(val);
    else if (field === 'academic_year') payload.academic_year = val === '' ? null : String(parseInt(val));
    else payload[field] = val;
    await api('PUT', '/api/exams/' + id, payload);
    await refresh();
  }
  input.addEventListener('blur', save);
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') input.blur();
    if (ev.key === 'Escape') {
      // the focus guard skips re-render while the input has focus, so
      // restore the cell directly and make sure blur doesn't commit
      cancelled = true;
      input.blur();
      refresh();
    }
  });
  el.innerHTML = '';
  el.appendChild(input);
  input.focus();
  if (input.select) input.select();
}

// ---- ECTS goal (per tracker) ----
export async function saveEctsGoal(val, refresh) {
  var t = trackers(), id = selTrackerId();
  t.forEach(function(x) { if (x.id === id) x.goal = parseFloat(val) || 0; });
  await saveTrackers(t, refresh);
}

// ---- grade goal (target average per tracker) ----

// Pure math. Dutch-numeric rows only (same classification calcStats uses);
// "remaining" = ungraded rows with ECTS. Solves
// target = (Σ grade·w + needed·Wr) / (Wd + Wr) for needed.
function neededAvg(target, exams) {
  var gw = 0, wd = 0, wr = 0;
  exams.forEach(function(e) {
    var v = gradeVal(e);
    if (v == null) { if (e.ects > 0) wr += e.ects; return; }
    var n = parseNumeric(v);
    if (n != null && n <= 10 && !String(v).includes('%')) {
      var w = e.ects || 1;
      gw += n * w; wd += w;
    }
  });
  var needed = (target > 0 && wr > 0) ? (target * (wd + wr) - gw) / wr : null;
  var state = needed == null ? null : (needed > 10 ? 'unreachable' : (needed <= 5.5 ? 'safe' : 'open'));
  return { avg: wd > 0 ? gw / wd : null, needed: needed, gradedEcts: wd, remainingEcts: wr, state: state };
}

export async function saveGradeTarget(val, refresh) {
  var t = trackers(), id = selTrackerId();
  t.forEach(function(x) { if (x.id === id) x.target = parseFloat(val) || 0; });
  await saveTrackers(t, refresh);
}

// Round UP to 1 decimal ("need ≥ x" must actually reach the target), floor 1.0;
// pre-round to 3 decimals so fp noise doesn't bump an exact 7.5 to 7.6.
function ceil1(n) {
  return Math.max(1, Math.ceil(Math.round(n * 1000) / 100) / 10).toFixed(1);
}

function needText(r) {
  var col = r.state === 'unreachable' ? 'var(--red)' : (r.state === 'safe' ? 'var(--green)' : 'var(--orange)');
  var t = 'Need ≥ <b style="color:' + col + '">' + ceil1(r.needed) + '</b> on remaining ' + r.remainingEcts + ' EC';
  if (r.state === 'unreachable') t += ' <span style="color:var(--red)">— not reachable</span>';
  else if (r.state === 'safe') t += ' <span style="color:var(--green)">— any pass secures it</span>';
  return t;
}

function gradeGoalHtml(exams, tracker) {
  var target = parseFloat(tracker.target) || 0;
  var r = neededAvg(target, exams);
  var out = 'Target avg <input type="number" class="inline-input" id="gradeTargetInput" value="' +
    (target || '') + '" min="1" max="10" step="0.1" placeholder="e.g. 7.5" style="width:58px" ' +
    'onchange="saveGradeTarget(this.value)">';
  if (target > 0) {
    out += r.remainingEcts > 0
      ? ' &nbsp;·&nbsp; ' + needText(r)
      : ' <span class="muted">— add upcoming exams with ECTS to plan</span>';
  }
  if (r.remainingEcts > 0) out += ' <button class="btn ghost small" style="margin-left:6px" onclick="examWhatIf()">What if…</button>';
  return out;
}

// Sandbox dialog: hypothetical grades on ungraded exams, nothing persisted.
export function whatIfDialog() {
  var tlist = trackers(), tid = selTrackerId();
  var tracker = tlist.filter(function(x) { return x.id === tid; })[0] || tlist[0];
  var mine = S.exams.filter(function(e) { return trackerOf(e, tlist) === tid; });
  var remaining = mine.filter(function(e) { return gradeVal(e) == null && e.ects > 0; })
    .sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
  if (!remaining.length) return;
  var target = parseFloat(tracker.target) || 0;

  var dlg = document.createElement('dialog');
  dlg.className = 'modal';
  var rows = remaining.map(function(e) {
    return '<label class="tagpick-row" style="gap:8px">' +
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(e.name) + '</span>' +
      '<span class="muted" style="font-size:12px;flex-shrink:0">' + esc(e.date || '') + ' · ' + e.ects + ' EC</span>' +
      '<input type="number" min="1" max="10" step="0.1" placeholder="—" data-whatif="' + esc(e.id) + '" ' +
        'style="width:64px;padding:4px 6px;flex-shrink:0">' +
      '</label>';
  }).join('');
  dlg.innerHTML = '<div class="modal-content" style="max-width:420px;width:92%">' +
    '<h3 style="margin:0 0 4px;font-size:16px;font-weight:700">What if… — ' + esc(tracker.name) + '</h3>' +
    '<div class="muted" style="font-size:12px;margin-bottom:10px">Type hypothetical grades — nothing is saved.</div>' +
    '<div class="tagpick-list">' + rows + '</div>' +
    '<div data-whatif-out style="margin:12px 0 16px;font-size:13px"></div>' +
    '<div style="display:flex;justify-content:flex-end"><button class="btn" data-act="close">Close</button></div>' +
    '</div>';
  document.body.appendChild(dlg);

  function recompute() {
    var hyp = {};
    Array.prototype.forEach.call(dlg.querySelectorAll('[data-whatif]'), function(i) {
      var n = parseFloat(i.value);
      if (!isNaN(n)) hyp[i.getAttribute('data-whatif')] = Math.min(10, Math.max(1, n));
    });
    var sim = mine.map(function(e) {
      return hyp[e.id] != null ? Object.assign({}, e, { grade_text: String(hyp[e.id]), grade: hyp[e.id] }) : e;
    });
    var r = neededAvg(target, sim);
    var avgR = r.avg != null ? Math.round(r.avg * 100) / 100 : null;
    var out = 'Projected average: <b>' + (avgR != null ? avgR : '—') + '</b>';
    if (target > 0) {
      if (r.needed != null) out += ' &nbsp;·&nbsp; ' + needText(r);
      else if (avgR != null) out += avgR >= target
        ? ' <span style="color:var(--green)">— target reached ✓</span>'
        : ' <span style="color:var(--red)">— below target</span>';
    }
    dlg.querySelector('[data-whatif-out]').innerHTML = out;
  }
  dlg.addEventListener('input', recompute);
  dlg.addEventListener('click', function(ev) {
    var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
    if (act === 'close' || ev.target === dlg) { try { dlg.close(); } catch (e) {} dlg.remove(); }
  });
  recompute();
  dlg.showModal();
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
    var key = examAY(e);
    if (!key) return;
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
    var label = ayLabel(k);
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
function renderAnalytics(exams, tracker) {
  var goal = parseFloat(tracker.goal) || 0;
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
        '<div class="da-section"><div class="da-section-label">Grade goal</div>' +
          '<div style="font-size:13px">' + gradeGoalHtml(exams, tracker) + '</div></div>' +
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
    ' &nbsp;·&nbsp; ECTS goal: ' + goalInput +
    ' &nbsp;·&nbsp; ' + gradeGoalHtml(exams, tracker) + '</div>';
}

// ---- main render ----
export function renderExams(refresh) {
  // Don't blow away an input the user is actively editing: grade/date/name in
  // the table or the ECTS goal field in analytics. The add form is excluded on
  // purpose — Enter-to-add must still show the new row.
  if (guardFocus('examTable', 'examAnalytics')) return;

  safeRender('exams', function() {
    var tlist = trackers();
    var tid = selTrackerId();
    var tracker = tlist.filter(function(x) { return x.id === tid; })[0] || tlist[0];
    var today = todayStr();

    // tracker pills
    var trackersEl = document.getElementById('examTrackers');
    if (trackersEl) {
      trackersEl.innerHTML = tlist.map(function(t) {
        return '<button class="exam-pill' + (t.id === tid ? ' active' : '') + '" ' +
          'onclick="examSelectTracker(\'' + esc(t.id) + '\')" ' +
          'oncontextmenu="examTrackerMenu(event,\'' + esc(t.id) + '\')">' + esc(t.name) + '</button>';
      }).join('') + '<button class="exam-pill add" onclick="examAddTracker()" title="Add tracker">＋</button>';
    }

    var mine = S.exams.filter(function(e) { return trackerOf(e, tlist) === tid; });

    // tag filter bar
    var tagBarEl = document.getElementById('examTagBar');
    if (tagBarEl) {
      var tags = allTags();
      tagBarEl.innerHTML = tags.length
        ? tags.map(function(t) {
            return '<button class="exam-tag' + (tagFilter === t ? ' active' : '') + '" ' +
              'onclick="examToggleTagFilter(\'' + esc(t.replace(/'/g, "\\'")) + '\')" ' +
              'oncontextmenu="examTagMenu(event,\'' + esc(t.replace(/'/g, "\\'")) + '\')">' + esc(t) + '</button>';
          }).join('')
        : '';
    }

    var list = mine.slice();
    if (tagFilter) list = list.filter(function(e) { return examTagList(e).indexOf(tagFilter) !== -1; });
    list.sort(function(a, b) {
      var af = a.date >= today, bf = b.date >= today;
      if (af && bf) return a.date.localeCompare(b.date);   // future: soonest first
      if (!af && !bf) return b.date.localeCompare(a.date); // past: newest first
      return af ? -1 : 1;
    });

    var analyticsEl = document.getElementById('examAnalytics');
    if (analyticsEl) analyticsEl.innerHTML = mine.length ? renderAnalytics(mine, tracker) : '';

    var html = '<tr><th>Name</th><th>Date</th><th></th><th>Year</th><th>ECTS</th><th>Tags</th><th>Grade</th><th></th></tr>';
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
      var ay = examAY(e);
      var chips = examTagList(e).map(function(t) { return '<span class="exam-tag mini">' + esc(t) + '</span>'; }).join('');
      html += '<tr class="exam-tr">' +
        '<td class="exam-name-cell" onclick="examInlineEdit(this,\'' + id + '\',\'name\',\'' + esc((e.name || '').replace(/'/g,"\\'")) + '\')">' + esc(e.name) + '</td>' +
        '<td class="muted exam-date-cell" onclick="examInlineEdit(this,\'' + id + '\',\'date\',\'' + esc(e.date) + '\')">' + esc(e.date) + '</td>' +
        '<td>' + examBadge(d) + '</td>' +
        '<td class="exam-year-cell' + (e.academic_year ? '' : ' muted') + '" title="Academic year (click to override)" ' +
          'onclick="examInlineEdit(this,\'' + id + '\',\'academic_year\',\'' + esc(ay) + '\')">' + ayLabel(ay) + '</td>' +
        '<td class="exam-ects-cell" onclick="examInlineEdit(this,\'' + id + '\',\'ects\',' + (e.ects != null ? e.ects : 'null') + ')">' + (e.ects || '<span class="muted">—</span>') + '</td>' +
        '<td class="exam-tags-cell" onclick="examEditTags(\'' + id + '\')" title="Edit tags">' + (chips || '<span class="muted">＋</span>') + '</td>' +
        '<td class="exam-grade-cell">' +
          '<input type="text" class="grade-input" value="' + esc(v || '') + '" placeholder="—" ' +
          'onchange="setGradeText(\'' + id + '\',this.value)">' +
          (displayVal ? '<span class="grade-badge-preview">' + displayVal + '</span>' : '') +
        '</td>' +
        '<td><button class="btn danger small exam-del" onclick="delRow(\'exams\',\'' + id + '\')">✕</button></td>' +
        '</tr>';
    });
    if (!list.length) html += '<tr><td colspan="8" class="muted">' + (tagFilter ? 'No exams with this tag.' : 'No exams yet.') + '</td></tr>';

    document.getElementById('examTable').innerHTML = html;
  });
}

// ---- window-level bindings ----
export function examInlineEditFn(el, id, field, currentVal, refresh) {
  startInlineEdit(el, id, field, currentVal, refresh);
}
