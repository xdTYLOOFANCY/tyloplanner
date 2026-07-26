// TyloPlanner — Study Timer & Pomodoro dashboard widget.
//
// Vanilla ES module, no framework. State lives here + localStorage, never in
// the DOM: the dashboard rebuilds every card's markup on each live-sync tick,
// so the markup is always generated from state. Clicks call repaint(), which
// swaps only this widget's guts; the 500ms tick touches just the clock text
// and the ring, so a running timer can never eat input focus.

import { todayStr, esc, toast, api, z, applyMinuteWheels } from './utils.js';

var KEY = 'study_timer_state';
var RING = 440;                  // stroke-dasharray of the r=70 progress ring

// Persisted. startTime is an absolute epoch, so a running timer stays accurate
// across reloads and through background-tab throttling.
var st = {
  mode: 'pomodoro',              // 'pomodoro' | 'break' | 'stopwatch'
  timerState: 'idle',            // 'idle' | 'running' | 'paused'
  subject: '',
  customStudyMinutes: 25,
  customBreakMinutes: 5,
  totalDuration: 1500,           // seconds
  timeLeft: 1500,
  timeElapsed: 0,
  startTime: null,               // epoch ms of the current run segment
  accumulatedTime: 0             // seconds banked by previous segments
};

// Memory-only — the log dialog never survives a reload.
var showLog = false, logSubject = '', logDuration = 0, pendingMode = null;
var tickHandle = null;

function countdown() { return st.mode !== 'stopwatch'; }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
}

function restore() {
  var data;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  if (!data) return;
  Object.keys(st).forEach(function (k) { if (k in data) st[k] = data[k]; });
  if (st.timerState !== 'running' || !st.startTime) return;
  recalc();
  // Finished while we were away: park it at 0 rather than ringing on boot.
  if (countdown() && st.timeLeft <= 0) {
    st.timerState = 'paused';
    st.accumulatedTime = st.totalDuration;
    st.startTime = null;
  }
}

function recalc() {
  if (st.timerState !== 'running' || !st.startTime) return;
  var passed = Math.floor((Date.now() - st.startTime) / 1000) + st.accumulatedTime;
  if (countdown()) st.timeLeft = Math.max(0, st.totalDuration - passed);
  else st.timeElapsed = passed;
}

function startTick() {
  if (tickHandle) return;
  tickHandle = setInterval(function () {
    recalc();
    save();
    if (countdown() && st.timeLeft <= 0) { complete(); return; }
    tickPaint();
  }, 500);
}

function stopTick() {
  if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
}

// ---- actions ----

function setMode(m) {
  if (st.timerState !== 'idle') return;
  st.mode = m;
  reset();
}

function start() {
  if (st.timerState === 'idle') {
    st.accumulatedTime = 0;
    if (countdown()) {
      st.totalDuration = (st.mode === 'break' ? st.customBreakMinutes : st.customStudyMinutes) * 60;
      st.timeLeft = st.totalDuration;
    } else {
      st.timeElapsed = 0;
    }
  }
  st.startTime = Date.now();
  st.timerState = 'running';
  save();
  startTick();
}

function pause() {
  if (st.timerState !== 'running') return;
  // A background tab throttles the tick, so timeLeft/timeElapsed can be
  // stale — settle them before the clock stops moving. openLog() reads them
  // through here, which is why the logged duration comes out right.
  recalc();
  st.accumulatedTime += Math.floor((Date.now() - st.startTime) / 1000);
  st.timerState = 'paused';
  st.startTime = null;
  stopTick();
  save();
}

function reset() {
  st.timerState = 'idle';
  st.startTime = null;
  st.accumulatedTime = 0;
  showLog = false;
  stopTick();
  if (countdown()) {
    st.totalDuration = (st.mode === 'break' ? st.customBreakMinutes : st.customStudyMinutes) * 60;
    st.timeLeft = st.totalDuration;
  } else {
    st.timeElapsed = 0;
  }
  save();
}

function complete() {
  pause();
  playBell();
  if (st.mode === 'break') {
    st.mode = 'pomodoro';
    reset();
    toast('Break over — back to it.');
  } else {
    // The break starts once the log dialog is dealt with: setMode() resets,
    // which would wipe the dialog out from under the user.
    pendingMode = 'break';
    openLog();
    toast('Pomodoro done — log your session.');
  }
  repaint();
}

function openLog() {
  pause();
  showLog = true;
  logSubject = st.subject || 'Study';
  var secs = countdown() ? st.totalDuration - st.timeLeft : st.timeElapsed;
  logDuration = Math.round((secs / 60) * 10) / 10;
}

function closeLog() {
  showLog = false;
  if (pendingMode) {
    st.mode = pendingMode;
    pendingMode = null;
    reset();
  }
}

async function saveLog() {
  // Read the field itself, not the mirror: on phones applyMinuteWheels() proxies
  // .value through whole-minute picker wheels, so this is what the user sees.
  var el = widget() && widget().querySelector('[data-stf="logDuration"]');
  if (el) logDuration = parseFloat(el.value) || 0;
  if (!(logDuration > 0)) { toast('Duration must be greater than 0.'); return; }
  try {
    await api('POST', '/api/study_sessions', {
      subject: logSubject || 'Study',
      date: todayStr(),
      duration: logDuration,
      completed: 1
    });
  } catch (e) {
    toast('Failed to log study session.');
    return;
  }
  toast('Study session logged.');
  closeLog();
  reset();
  if (window.refreshApp) window.refreshApp();   // redraws the dashboard for us
  else repaint();
}

// Two-tone chime, shared in spirit with timers.js.
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

// ---- rendering ----

function dashOffset() {
  // Stopwatch has no end, so the ring sweeps once per minute instead.
  if (!countdown()) return Math.round(RING * ((st.timeElapsed % 60) / 60));
  if (st.totalDuration <= 0) return 0;
  return Math.round(RING * (1 - st.timeLeft / st.totalDuration));
}

function formatTime() {
  var total = countdown() ? st.timeLeft : st.timeElapsed;
  return z(Math.floor(total / 60)) + ':' + z(total % 60);
}

function labelText() {
  if (st.timerState === 'idle') return 'Idle';
  if (st.mode === 'break') return 'Break';
  if (st.mode === 'pomodoro') return 'Study';
  return 'Elapsed';
}

function show(on) { return on ? '' : ' st-hide'; }

function opts(values, selected, suffix) {
  return values.map(function (v) {
    return '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + suffix + '</option>';
  }).join('');
}

function inner() {
  var idle = st.timerState === 'idle';
  return '' +
    '<div class="timer-circle-container">' +
      '<svg viewBox="0 0 160 160">' +
        '<circle class="progress-ring__track" cx="80" cy="80" r="70" stroke="var(--border)" stroke-width="8" fill="none"></circle>' +
        '<circle class="progress-ring__circle st-ring" cx="80" cy="80" r="70" stroke="var(--accent)" stroke-width="8" fill="none" stroke-dasharray="' + RING + '" stroke-dashoffset="' + dashOffset() + '"></circle>' +
      '</svg>' +
      '<div class="timer-text-container">' +
        '<div class="timer-time st-time">' + formatTime() + '</div>' +
        '<div class="timer-label st-label">' + labelText() + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="timer-controls-container">' +
      '<div class="st-modes' + show(idle) + '">' +
        '<button class="btn small' + (st.mode === 'pomodoro' ? '' : ' ghost') + '" data-st="mode" data-mode="pomodoro">Pomodoro</button>' +
        '<button class="btn small' + (st.mode === 'stopwatch' ? '' : ' ghost') + '" data-st="mode" data-mode="stopwatch">Stopwatch</button>' +
      '</div>' +
      '<input class="st-input' + show(idle) + '" data-stf="subject" type="text" list="subjectList" ' +
        'placeholder="Subject (e.g. Math, Coding)" maxlength="60" value="' + esc(st.subject) + '">' +
      '<div class="st-subject-active' + show(!idle) + '">' + esc(st.subject || 'Study Session') + '</div>' +
      '<div class="st-durations' + show(idle && countdown()) + '">' +
        '<select data-stf="study">' + opts([15, 25, 45, 50, 60], st.customStudyMinutes, 'm study') + '</select>' +
        '<select data-stf="break">' + opts([3, 5, 10, 15], st.customBreakMinutes, 'm break') + '</select>' +
      '</div>' +
      '<div class="st-buttons">' +
        '<button class="btn small" data-st="toggle">' + (st.timerState === 'running' ? 'Pause' : 'Start') + '</button>' +
        '<button class="btn small ghost' + show(!idle) + '" data-st="log">Log</button>' +
        '<button class="btn small danger' + show(!idle) + '" data-st="reset" title="Reset" aria-label="Reset">✕</button>' +
      '</div>' +
      '<div class="st-dialog' + show(showLog) + '">' +
        '<div class="st-dialog-title">Log Study Session</div>' +
        '<div class="st-dialog-row">' +
          '<input type="text" data-stf="logSubject" placeholder="Subject" maxlength="60" value="' + esc(logSubject) + '">' +
          '<input type="number" inputmode="numeric" data-minutes min="0" step="0.5" data-stf="logDuration" ' +
            'placeholder="Minutes" title="Minutes" value="' + logDuration + '">' +
        '</div>' +
        '<div class="st-dialog-actions">' +
          '<button class="btn small ghost" data-st="cancelLog">Cancel</button>' +
          '<button class="btn small" data-st="saveLog">Save</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

export function renderStudyTimerWidget() {
  return '<div class="study-timer-widget">' + inner() + '</div>';
}

function widget() { return document.querySelector('.study-timer-widget'); }

function repaint() {
  var w = widget();
  if (!w) return;
  w.innerHTML = inner();
  applyMinuteWheels();     // no-op on desktop and on already-wheeled fields
}

function tickPaint() {
  var w = widget();
  if (!w) return;
  var t = w.querySelector('.st-time'), r = w.querySelector('.st-ring');
  if (t) t.textContent = formatTime();
  if (r) r.setAttribute('stroke-dashoffset', dashOffset());
}

// ---- wiring (delegated once; the dashboard rebuilds this markup constantly) ----

document.addEventListener('click', function (e) {
  var b = e.target.closest('.study-timer-widget [data-st]');
  if (!b) return;
  var action = b.getAttribute('data-st');
  if (action === 'mode') setMode(b.getAttribute('data-mode'));
  else if (action === 'toggle') st.timerState === 'running' ? pause() : start();
  else if (action === 'log') openLog();
  else if (action === 'reset') reset();
  else if (action === 'cancelLog') closeLog();
  else if (action === 'saveLog') { saveLog(); return; }   // repaints when it settles
  repaint();
});

// 'input' covers typing and the mobile minute wheel (which re-dispatches it);
// 'change' covers the two duration selects.
['input', 'change'].forEach(function (evt) {
  document.addEventListener(evt, function (e) {
    var el = e.target.closest('.study-timer-widget [data-stf]');
    if (!el) return;
    var f = el.getAttribute('data-stf');
    if (f === 'subject') { st.subject = el.value; save(); }
    else if (f === 'study') { st.customStudyMinutes = parseInt(el.value, 10) || 25; reset(); tickPaint(); }
    else if (f === 'break') { st.customBreakMinutes = parseInt(el.value, 10) || 5; reset(); tickPaint(); }
    else if (f === 'logSubject') logSubject = el.value;
    else if (f === 'logDuration') logDuration = parseFloat(el.value) || 0;
  });
});

restore();
if (st.timerState === 'running') startTick();
