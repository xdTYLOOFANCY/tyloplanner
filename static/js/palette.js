// TyloPlanner — command palette: Ctrl/Cmd+K search across everything + quick nav.

import { S } from './state.js';
import { esc, toast, api, todayStr, isInputFocused } from './utils.js';
import { openNote } from './notes.js';
import { openTaskModal } from './tasks.js';
import { goToDate, quickAddOpen } from './planner.js';
import { previewFile } from './files.js';
import { openQrModal } from './qr.js';
import { parseTimer, addTimer, openTimerConfig } from './timers.js';
import { calc } from './calc.js';

var TAB_LABELS = {
  dashboard: 'Dashboard', analytics: 'Study', planner: 'Planner',
  exams: 'Exams & grades', habits: 'Habits', workouts: 'Workouts',
  tasks: 'To-do', notes: 'Notes', files: 'Files', music: 'Music', settings: 'Settings'
};

var dlg = null, inputEl = null, listEl = null, results = [], sel = 0;

function prettyDur(sec) {
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return [h ? h + 'h' : '', m ? m + 'm' : '', s ? s + 's' : ''].filter(Boolean).join(' ');
}

function gotoTab(name) {
  var b = document.querySelector('#tabs button[data-tab="' + name + '"]');
  if (b) b.click();
}

// Copy a calculator result. Secure contexts get the async Clipboard API; a
// self-hosted LAN box over plain http falls back to the textarea+execCommand trick.
function copyText(v) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(v).then(function() { toast('Copied ' + v); }, function() { fallbackCopy(v); });
  } else { fallbackCopy(v); }
}
function fallbackCopy(v) {
  try {
    var ta = document.createElement('textarea');
    ta.value = v; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    toast('Copied ' + v);
  } catch (e) { toast(v); }
}

function calcRow(c) {
  return { label: c.text, type: 'calc', hint: 'copy', run: function() { copyText(c.value); } };
}

// ---- quick-create from the palette ("task …", "note …", "event …") ----
async function createTask(name) {
  var maxOrder = -1;
  (S.tasks || []).forEach(function(t) { if (!t.parent_id && t.order_index > maxOrder) maxOrder = t.order_index; });
  await api('POST', '/api/tasks', { name: name, done: 0, created: todayStr(), order_index: maxOrder + 1 });
  if (window.refreshApp) await window.refreshApp();
  toast('Added to-do');
  gotoTab('tasks');
}
async function createNote(title) {
  var r = await api('POST', '/api/notes', { title: title, body: '', body_format: 'html', updated: Date.now() });
  if (window.refreshApp) await window.refreshApp();
  gotoTab('notes');
  if (r && r.id) openNote(r.id);
}
// Events carry more (time, location, recurrence) so open the prefilled modal —
// reuses planner's NL parser via quickAddOpen — instead of creating blind.
function createEvent(text) { gotoTab('planner'); quickAddOpen(text); }

// Rows shown when the palette input is "?": each `fill` seeds the input so the
// user can keep typing the real command.
function helpRows() {
  return [
    { label: '= 20% of 250',           type: 'calc',   hint: 'calculator',  fill: '= ' },
    { label: 'timer 25m focus',        type: 'timer',  hint: 'countdown',   fill: 'timer ' },
    { label: 'task buy milk',          type: 'task',   hint: 'new to-do',   fill: 'task ' },
    { label: 'event dentist tue 3pm',  type: 'event',  hint: 'new event',   fill: 'event ' },
    { label: 'note Ideas',             type: 'note',   hint: 'new note',    fill: 'note ' },
    { label: 'Generate QR code',       type: 'action', hint: 'qr',          run: function() { openQrModal(); } },
    { label: 'Type anything else to search notes, tasks, events, files…', type: 'search' }
  ];
}

// The "?" keyboard shortcut — a keybinding + palette cheat-sheet.
function helpPairs(pairs) {
  return pairs.map(function(p) {
    return '<div style="display:flex;gap:12px;align-items:baseline;padding:5px 0;font-size:13px">' +
      '<kbd style="flex:0 0 155px;font-family:ui-monospace,monospace;font-size:12px;color:var(--accent)">' + esc(p[0]) + '</kbd>' +
      '<span class="muted">' + esc(p[1]) + '</span></div>';
  }).join('');
}
export function showShortcutsHelp() {
  if (document.getElementById('shortcutsHelp')) return;
  var d = document.createElement('dialog');
  d.className = 'modal';
  d.id = 'shortcutsHelp';
  d.innerHTML = '<div class="modal-content" style="max-width:440px;width:92%">' +
    '<h3 style="margin:0 0 10px;font-size:16px;font-weight:700">Keyboard shortcuts</h3>' +
    helpPairs([
      ['⌘ / Ctrl + K', 'Open the command palette'],
      ['⌘ / Ctrl + F', 'Find in the current note'],
      ['?', 'Show this help'],
      ['Esc', 'Close dialogs']
    ]) +
    '<h3 style="margin:18px 0 10px;font-size:16px;font-weight:700">In the command palette</h3>' +
    helpPairs([
      ['= 20% of 250', 'Calculator — maths, units, time zones'],
      ['timer 25m focus', 'Start a countdown timer'],
      ['task buy milk', 'Add a to-do'],
      ['event dentist tue 3pm', 'Add a calendar event'],
      ['note Ideas', 'Create a note'],
      ['?', 'List everything the palette can do']
    ]) +
    '<div style="display:flex;justify-content:flex-end;margin-top:18px">' +
    '<button class="btn" data-close>Close</button></div>' +
    '</div>';
  document.body.appendChild(d);
  d.addEventListener('click', function(e) {
    if (e.target === d || (e.target.getAttribute && e.target.getAttribute('data-close') !== null)) d.close();
  });
  d.addEventListener('close', function() { d.remove(); });
  d.showModal();
}

// ponytail: full index rebuild per keystroke — at personal-app scale that's
// cheaper than cache invalidation; revisit if S ever holds thousands of rows.
function buildIndex() {
  var items = [];
  Object.keys(TAB_LABELS).forEach(function(t) {
    items.push({ label: 'Go to ' + TAB_LABELS[t], type: 'nav', run: function() { gotoTab(t); } });
  });
  items.push({ label: 'Generate QR code', type: 'action', run: function() { openQrModal(); } });
  items.push({ label: 'Timer settings', type: 'action', run: function() { openTimerConfig(); } });
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
  if (!q) return items.filter(function(i) { return i.type === 'nav' || i.type === 'action'; });
  if (q === '?') return helpRows();
  // "timer 25m focus" → offer a start-timer action at the top.
  if (/^timer\s+\S/i.test(q)) {
    var p = parseTimer(q);
    if (p) return [{ label: 'Start timer: ' + p.label, type: 'timer', hint: prettyDur(p.seconds),
                     run: function() { addTimer(p.label, p.seconds); } }];
  }
  // Quick-create: "task …", "note …", "event …".
  var mk = q.match(/^(task|note|event)\s+(\S.*)$/i);
  if (mk) {
    var kind = mk[1].toLowerCase(), text = mk[2].trim();
    if (kind === 'task') return [{ label: 'Add to-do: ' + text, type: 'task', hint: 'Enter', run: function() { createTask(text); } }];
    if (kind === 'note') return [{ label: 'New note: ' + text, type: 'note', hint: 'Enter', run: function() { createNote(text); } }];
    return [{ label: 'Add event: ' + text, type: 'event', hint: 'Enter', run: function() { createEvent(text); } }];
  }
  // "= 20% of 250", "= 5 km in mi", "= 2:30pm HKT in Berlin". A leading "="
  // forces the calculator (only the result shows); otherwise a valid expression
  // is prepended above normal search results, and plain queries pass through.
  var forced = q.charAt(0) === '=';
  var c = calc(forced ? q.slice(1) : q);
  if (forced) return c ? [calcRow(c)] : [{ label: 'Type an expression — e.g. 20% of 250, 5 km in mi', type: 'calc' }];

  q = q.toLowerCase();
  var starts = [], incl = [];
  items.forEach(function(i) {
    var l = (i.label || '').toLowerCase();
    if (!l) return;
    if (l.indexOf(q) === 0) starts.push(i);
    else if (l.indexOf(q) !== -1) incl.push(i);
  });
  var out = starts.concat(incl).slice(0, 12);
  return c ? [calcRow(c)].concat(out) : out;
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
  if (r.fill) { inputEl.value = r.fill; update(); inputEl.focus(); return; }  // help rows seed the input
  if (!r.run) return;   // e.g. the "type an expression" calc placeholder
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
    '<input id="cmdPaletteInput" placeholder="Search… · = 20% of 250 · timer 25m · ? for help" autocomplete="off">' +
    '<div id="cmdPaletteList" class="cmdp-list"></div>' +
    '<div class="cmdp-foot muted">↑↓ navigate · Enter open · ? help · Esc close</div>' +
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
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); return; }
    // "?" (outside inputs / dialogs) opens the shortcuts cheat-sheet.
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey &&
        !isInputFocused() && !document.querySelector('dialog[open]')) {
      e.preventDefault();
      showShortcutsHelp();
    }
  });
}
