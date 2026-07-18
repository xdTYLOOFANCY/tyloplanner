// TyloPlanner — natural-language timers/alarms.
// "timer 25m focus", "timer 2h laundry", "timer 1h30m brew", "timer 90s tea".
// The browser owns the live countdown (localStorage, absolute end-epoch so it
// stays accurate across reloads) + the sound/notification when it finishes.
// If "push to phone" is on, a server row (POST /api/timer) fires the push too,
// so it lands even with the tab closed. See blueprints/notifications.py.

import { S, SET } from './state.js';
import { esc, api, toast } from './utils.js';

var KEY = 'tylo_timers';        // [{ id, label, endEpoch }]
var timers = [];
var tickHandle = null;

function load() {
  try { timers = JSON.parse(localStorage.getItem(KEY) || '[]'); }
  catch (e) { timers = []; }
  // Drop anything already finished while we were away — the phone push (if on)
  // already handled it; don't surprise-ring a stale focus timer on boot.
  var now = Date.now();
  timers = timers.filter(function (t) { return t.endEpoch > now + 500; });
  save();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch (e) {}
}

// "25m focus" / "2h laundry" / "1h30m brew" / "90s tea" / "25 focus" (bare = min).
export function parseTimer(str) {
  var s = String(str || '').trim().replace(/^timer\s+/i, '');
  var m = s.match(/^((?:\d+\s*[hms]\s*)+|\d+)\s*(.*)$/i);
  if (!m) return null;
  var dur = m[1].trim(), label = (m[2] || '').trim();
  var secs = 0;
  if (/^\d+$/.test(dur)) {
    secs = parseInt(dur, 10) * 60;          // bare number = minutes
  } else {
    var re = /(\d+)\s*([hms])/gi, mm;
    while ((mm = re.exec(dur))) {
      var n = parseInt(mm[1], 10), u = mm[2].toLowerCase();
      secs += u === 'h' ? n * 3600 : u === 'm' ? n * 60 : n;
    }
  }
  if (secs <= 0) return null;
  secs = Math.min(secs, 24 * 3600);          // cap at 24h
  return { seconds: secs, label: label || 'Timer' };
}

function fmt(sec) {
  sec = Math.max(0, Math.ceil(sec));
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
}

// Two-tone bell, borrowed from the study timer.
function playBell() {
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = new AC(), now = ctx.currentTime;
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o1.type = o2.type = 'sine';
    o1.frequency.setValueAtTime(880, now);
    o2.frequency.setValueAtTime(1318.51, now);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.start(now); o2.start(now); o1.stop(now + 1.5); o2.stop(now + 1.5);
  } catch (e) {}
}

function fire(t) {
  playBell();
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  if (window.Notification && Notification.permission === 'granted') {
    try { new Notification('⏰ ' + t.label, { body: 'Timer done!', tag: 'tylo-timer-' + t.id }); } catch (e) {}
  }
  toast('⏰ ' + t.label + ' — done!');
  // Server row (if any) fires its own push and self-deletes; leave it be.
}

function ensureTick() {
  if (tickHandle || !timers.length) return;
  tickHandle = setInterval(function () {
    var now = Date.now(), fired = false;
    timers = timers.filter(function (t) {
      if (t.endEpoch <= now) { fire(t); fired = true; return false; }
      return true;
    });
    if (fired) save();
    if (!timers.length) { clearInterval(tickHandle); tickHandle = null; }
    renderTimers();
  }, 500);
}

function chipsHtml() {
  var now = Date.now();
  return timers.map(function (t) {
    return '<span class="timer-chip" title="' + esc(t.label) + '">' +
      '<span class="timer-chip-dot"></span>' +
      '<span class="timer-chip-label">' + esc(t.label) + '</span>' +
      '<span class="timer-chip-time">' + fmt((t.endEpoch - now) / 1000) + '</span>' +
      '<button class="timer-chip-x" data-timer-cancel="' + esc(t.id) + '" aria-label="Cancel timer" title="Cancel">×</button>' +
      '</span>';
  }).join('');
}

export function renderTimers() {
  var hidden = SET && SET.timer_hide === '1';
  var html = hidden ? '' : chipsHtml();
  ['sidebarTimers', 'headerTimers'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  });
  // The dashboard widget's list and the config dialog's list both ignore
  // "hide running timers" — you set timers from there, so you must see them.
  var listHtml = timers.length ? chipsHtml() : '<div class="muted" style="font-size:13px">No timers running.</div>';
  var wt = document.getElementById('widgetTimers');
  if (wt) wt.innerHTML = listHtml;
  var cfg = document.getElementById('timerCfgList');
  if (cfg) cfg.innerHTML = listHtml;
}

export function addTimer(label, seconds) {
  var t = { id: 'tm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            label: label || 'Timer', endEpoch: Date.now() + seconds * 1000 };
  timers.push(t);
  save();
  // Ask for notification permission the first time, non-blocking.
  if (window.Notification && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }
  // Server is the source of truth so the timer survives the tab closing and
  // shows up on other devices; push=1 also fires the phone alarm when it ends.
  api('POST', '/api/timer', {
    id: t.id, label: t.label, fire_at: Math.round(t.endEpoch / 1000),
    push: (SET && SET.timer_push === '1') ? 1 : 0
  }).catch(function () {});
  ensureTick();
  renderTimers();
  toast('Timer set: ' + t.label + ' (' + fmt(seconds) + ')');
  return t;
}

export function cancelTimer(id) {
  timers = timers.filter(function (t) { return t.id !== id; });
  save();
  api('DELETE', '/api/timer/' + encodeURIComponent(id)).catch(function () {});
  if (!timers.length && tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  renderTimers();
}

// ---- Config submenu (opened via the command palette) ----
var cfgDlg = null;

function syncCfgChecks() {
  if (!cfgDlg) return;
  cfgDlg.querySelector('#timerCfgHide').classList.toggle('on', SET && SET.timer_hide === '1');
  cfgDlg.querySelector('#timerCfgPush').classList.toggle('on', SET && SET.timer_push === '1');
}

function toggleSetting(key) {
  var on = !(SET && SET[key] === '1');
  if (SET) SET[key] = on ? '1' : '0';           // reflect locally so render is instant
  var body = {}; body[key] = on ? '1' : '0';
  api('POST', '/api/settings', body).catch(function () {});
  syncCfgChecks();
  renderTimers();
}

export function openTimerConfig() {
  if (!cfgDlg) {
    cfgDlg = document.createElement('dialog');
    cfgDlg.className = 'modal';
    cfgDlg.id = 'timerCfg';
    cfgDlg.innerHTML =
      '<div class="modal-content" style="max-width:400px;width:92%">' +
        '<h3 tabindex="-1" autofocus style="margin-bottom:4px;font-size:16px;font-weight:700;outline:none">Timers</h3>' +
        '<p class="muted" style="font-size:12px;margin-bottom:14px">Start one from search: <code>timer 25m focus</code></p>' +
        '<div class="timer-cfg-row" data-timer-toggle="timer_hide"><span class="hcheck" id="timerCfgHide"></span> <span>Hide running timers <span class="muted" style="font-weight:400">— keep them off the nav</span></span></div>' +
        '<div class="timer-cfg-row" data-timer-toggle="timer_push"><span class="hcheck" id="timerCfgPush"></span> <span>Push notification <span class="muted" style="font-weight:400">— also alert your phone via ntfy / web push</span></span></div>' +
        '<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 8px" class="muted">Running</div>' +
        '<div id="timerCfgList" class="timer-cfg-list"></div>' +
        '<div style="display:flex;justify-content:flex-end;margin-top:16px">' +
          '<button class="btn" onclick="this.closest(\'dialog\').close()">Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(cfgDlg);
    cfgDlg.addEventListener('click', function (e) {
      if (e.target === cfgDlg) { cfgDlg.close(); return; }
      var row = e.target.closest('[data-timer-toggle]');
      if (row) toggleSetting(row.getAttribute('data-timer-toggle'));
    });
  }
  syncCfgChecks();
  renderTimers();
  cfgDlg.showModal();
}

// ---- Dashboard widget: pick a duration + optional name, like a phone timer ----
function opts(max, sel) {
  var s = '';
  for (var i = 0; i <= max; i++)
    s += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + i + '</option>';
  return s;
}

export function renderTimerWidget(id) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
      '<h3 style="margin:0">Timer</h3>' +
      '<button class="btn ghost small" onclick="openTimerConfig()" title="Timer settings" aria-label="Timer settings" style="padding:2px 8px">⚙</button>' +
    '</div>' +
    '<div class="timer-widget-picker">' +
      '<label>H<select id="wtH">' + opts(23, 0) + '</select></label>' +
      '<label>M<select id="wtM">' + opts(59, 5) + '</select></label>' +
      '<label>S<select id="wtS">' + opts(59, 0) + '</select></label>' +
    '</div>' +
    '<div class="timer-widget-row">' +
      '<input id="wtName" type="text" placeholder="Name (optional)" autocomplete="off" maxlength="40">' +
      '<button class="btn" onclick="startTimerFromWidget()">Start</button>' +
    '</div>' +
    '<div id="widgetTimers" class="timer-cfg-list" style="margin-top:10px"></div>';
}

export function startTimerFromWidget() {
  var g = function (i) { var el = document.getElementById(i); return el ? parseInt(el.value, 10) || 0 : 0; };
  var secs = g('wtH') * 3600 + g('wtM') * 60 + g('wtS');
  if (secs <= 0) { toast('Pick a duration first.'); return; }
  var nameEl = document.getElementById('wtName');
  var name = (nameEl && nameEl.value || '').trim() || 'Timer';
  addTimer(name, secs);
  if (nameEl) nameEl.value = '';
}

// Reconcile with the server (the source of truth) so a timer started on
// another device / before a restart shows up here. When online with an empty
// write queue this replaces the local list; offline (api() throws) we keep the
// localStorage copy untouched. Runs once at boot — before any timer is created
// this session — so there's no race with a just-started timer.
function hydrateFromServer() {
  api('GET', '/api/timers').then(function (res) {
    var now = Date.now();
    timers = ((res && res.timers) || [])
      .map(function (r) { return { id: r.id, label: r.label || 'Timer', endEpoch: r.fire_at * 1000 }; })
      .filter(function (t) { return t.endEpoch > now + 500; });
    save();
    ensureTick();
    renderTimers();
  }).catch(function () { /* offline: keep the localStorage timers */ });
}

export function initTimers() {
  load();
  // Cancel buttons work from the sidebar/header chips and the config list alike.
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-timer-cancel]');
    if (b) { e.preventDefault(); cancelTimer(b.getAttribute('data-timer-cancel')); }
  });
  ensureTick();
  renderTimers();
  hydrateFromServer();
}
