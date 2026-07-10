// TyloPlanner — command palette: Ctrl/Cmd+K search across everything + quick nav.

import { S } from './state.js';
import { esc } from './utils.js';
import { openNote } from './notes.js';
import { openTaskModal } from './tasks.js';
import { goToDate } from './planner.js';
import { previewFile } from './files.js';

var TAB_LABELS = {
  dashboard: 'Dashboard', analytics: 'Analytics', planner: 'Planner',
  exams: 'Exams & grades', habits: 'Habits', workouts: 'Workouts',
  tasks: 'To-do', notes: 'Notes', files: 'Files', music: 'Music', settings: 'Settings'
};

var dlg = null, inputEl = null, listEl = null, results = [], sel = 0;

function gotoTab(name) {
  var b = document.querySelector('#tabs button[data-tab="' + name + '"]');
  if (b) b.click();
}

// ponytail: full index rebuild per keystroke — at personal-app scale that's
// cheaper than cache invalidation; revisit if S ever holds thousands of rows.
function buildIndex() {
  var items = [];
  Object.keys(TAB_LABELS).forEach(function(t) {
    items.push({ label: 'Go to ' + TAB_LABELS[t], type: 'nav', run: function() { gotoTab(t); } });
  });
  (S.notes || []).forEach(function(n) {
    items.push({ label: n.title || 'Untitled note', type: 'note', run: function() { gotoTab('notes'); openNote(n.id); } });
  });
  (S.tasks || []).forEach(function(t) {
    if (t.done) return;
    items.push({ label: t.name || '', type: 'task', hint: t.due || '', run: function() { gotoTab('tasks'); openTaskModal(t.id); } });
  });
  (S.events || []).forEach(function(e) {
    items.push({ label: e.title || '', type: 'event', hint: e.date || '', run: function() { gotoTab('planner'); if (e.date) goToDate(e.date); } });
  });
  (S.exams || []).forEach(function(e) {
    items.push({ label: e.name || '', type: 'exam', hint: e.date || '', run: function() { gotoTab('exams'); } });
  });
  (S.files || []).forEach(function(f) {
    items.push({ label: f.filename || '', type: 'file', run: function() { gotoTab('files'); previewFile(f.id); } });
  });
  (S.shortcuts || []).forEach(function(s) {
    items.push({ label: s.name || s.url || '', type: 'link', run: function() { window.open(s.url, '_blank'); } });
  });
  return items;
}

function search(q) {
  var items = buildIndex();
  if (!q) return items.filter(function(i) { return i.type === 'nav'; });
  q = q.toLowerCase();
  var starts = [], incl = [];
  items.forEach(function(i) {
    var l = (i.label || '').toLowerCase();
    if (!l) return;
    if (l.indexOf(q) === 0) starts.push(i);
    else if (l.indexOf(q) !== -1) incl.push(i);
  });
  return starts.concat(incl).slice(0, 12);
}

function renderList() {
  listEl.innerHTML = results.map(function(r, i) {
    return '<div class="cmdp-row' + (i === sel ? ' sel' : '') + '" data-idx="' + i + '">' +
      '<span class="cmdp-type">' + r.type + '</span>' +
      '<span class="cmdp-label">' + esc(r.label) + '</span>' +
      (r.hint ? '<span class="cmdp-hint">' + esc(r.hint) + '</span>' : '') +
      '</div>';
  }).join('') || '<div class="muted" style="padding:10px 12px;font-size:13px">No matches.</div>';
  var selEl = listEl.querySelector('.cmdp-row.sel');
  if (selEl) selEl.scrollIntoView({ block: 'nearest' });
}

function update() {
  results = search(inputEl.value.trim());
  sel = 0;
  renderList();
}

function run(i) {
  var r = results[i];
  if (!r) return;
  dlg.close();
  r.run();
}

export function openPalette() {
  if (!dlg || dlg.open) return;
  inputEl.value = '';
  update();
  dlg.showModal();
  inputEl.focus();
}

export function initPalette() {
  dlg = document.createElement('dialog');
  dlg.className = 'modal';
  dlg.id = 'cmdPalette';
  dlg.innerHTML = '<div class="modal-content cmdp" style="max-width:520px;width:92%;padding:0">' +
    '<input id="cmdPaletteInput" placeholder="Search notes, tasks, events, exams, files…" autocomplete="off">' +
    '<div id="cmdPaletteList" class="cmdp-list"></div>' +
    '<div class="cmdp-foot muted">↑↓ navigate · Enter open · Esc close</div>' +
    '</div>';
  document.body.appendChild(dlg);
  inputEl = dlg.querySelector('#cmdPaletteInput');
  listEl = dlg.querySelector('#cmdPaletteList');
  inputEl.addEventListener('input', update);
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (sel < results.length - 1) { sel++; renderList(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (sel > 0) { sel--; renderList(); } }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  listEl.addEventListener('click', function(e) {
    var row = e.target.closest('[data-idx]');
    if (row) run(parseInt(row.getAttribute('data-idx'), 10));
  });
  dlg.addEventListener('click', function(e) { if (e.target === dlg) dlg.close(); });
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); }
  });
}
