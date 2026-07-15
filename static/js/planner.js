import { S, SET, safeRender } from './state.js';
import { toISO, todayStr, fmtShort, esc, api, DAYS, MONTHS, isInputFocused, debounce, askConfirm, showContextMenu } from './utils.js';
import { getViewDates } from './utils.js';
import { renderDashboard } from './dashboard.js';
import { priorityRank } from './tasks.js';

// Default to a single-day agenda on phones (the multi-day grid is unreadable
// at <=640px); desktop keeps the week view. Scoped to initial load only.
var _isMobileViewport = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(max-width: 640px)').matches : false;
var dateOffset = 0, plannerRefresh = null, currentView = _isMobileViewport ? '1' : '7', scrolledToCurrentTimeThisSession = false, isResizing = false, isDragCreating = false, lastScrollTop = null, activeReminders = [], isRendering = false, lastRenderToday = todayStr();
// Keep the view <select> in sync with the mobile default chosen above.
if (_isMobileViewport) {
  document.addEventListener('DOMContentLoaded', function () {
    var _pv = document.getElementById('plannerView');
    if (_pv) _pv.value = currentView;
  });
}
var draggingEventId = null, draggingOccDate = null, draggingOffsetY = 0, currentUndoAction = null, undoToastTimeout = null, dragPreviewEl = null;
// Occurrence date of the recurring instance currently being edited (null for a
// non-recurring event or the whole series), so Save can ask "this / following /
// all events" and apply the change to the right scope.
var editingOccurrenceDate = null;
// Task tray: draggable open tasks shown above the grid so they can be dropped
// onto a day/time to create a linked time-block event (events.task_id).
var taskTrayOpen = false;
var isTouchDragging = false, touchDragPointerId = null, touchDragStartClientX = 0, touchDragStartClientY = 0, touchDragLongPressTimer = null, justTouchDragged = false, lastTouchTime = 0;

var defaultShortcuts = {
  today: 't',
  weekView: 'w',
  dayView: 'd',
  monthView: 'm',
  next: 'n',
  prev: 'p',
  create: 'c'
};
var shortcuts = Object.assign({}, defaultShortcuts);
try {
  var stored = localStorage.getItem('tylo_shortcuts');
  if (stored) {
    Object.assign(shortcuts, JSON.parse(stored));
  }
} catch(e) {}

export function setPlannerRefresh(fn) { plannerRefresh = fn; }

// Size the time grid to the real space below its rendered position instead of
// a guessed constant: the controls above it wrap at some widths and sidebar
// mode has no top header, so any fixed offset is wrong somewhere. Sets a CSS
// var the .time-grid-wrapper height rule consumes (constant kept as fallback).
function sizeTimeGrid() {
  var w = document.querySelector('.time-grid-wrapper');
  if (!w) return; // month view has no time grid
  // Mobile (≤640px) keeps its own CSS height with the bottom-nav allowance.
  if (window.innerWidth <= 640) { w.style.removeProperty('--planner-grid-h'); return; }
  if (!w.offsetParent) return; // planner tab hidden — remeasured on activation
  var top = w.getBoundingClientRect().top + window.scrollY;
  w.style.setProperty('--planner-grid-h', Math.floor(window.innerHeight - top) + 'px');
}
window.addEventListener('resize', debounce(sizeTimeGrid, 150));
// Re-measure when the planner tab becomes visible: a resize while it was
// display:none can't be measured (offsetParent is null until activation).
var _plannerSection = document.getElementById('tab-planner');
if (_plannerSection) {
  new MutationObserver(function() {
    if (_plannerSection.classList.contains('active')) sizeTimeGrid();
  }).observe(_plannerSection, { attributes: true, attributeFilter: ['class'] });
}

export function changePlannerView(val) {
  currentView = val;
  dateOffset = 0;
  renderPlanner();
}

export function moveWeek(d) {
  if (d === 0) dateOffset = 0; else dateOffset += d;
  renderPlanner();
}

// Parse a "YYYY-MM-DD" string into a local-midnight Date (avoids the UTC-parse
// off-by-one that `new Date("YYYY-MM-DD")` causes near timezone boundaries).
function parseLocalDate(iso) {
  var p = String(iso).split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}
function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }

// recurrence_days is a CSV of JS getDay() indices (0=Sun … 6=Sat).
function parseRecDays(s) {
  if (!s) return [];
  return String(s).split(',').map(function (x) { return parseInt(x.trim(), 10); }).filter(function (x) { return !isNaN(x) && x >= 0 && x <= 6; });
}
// excluded_dates is a CSV of ISO dates to skip (deleted/overridden occurrences).
function parseExcluded(s) {
  var set = {};
  if (s) String(s).split(',').forEach(function (x) { var v = x.trim(); if (v) set[v] = true; });
  return set;
}

// Inline override for a per-event color (re-validated as hex client-side before
// it touches a style attribute). Empty when the event uses its type color.
function eventColorStyle(e) {
  return (e.color && /^#[0-9a-fA-F]{3,8}$/.test(e.color)) ? 'background-color:' + e.color + ' !important;' : '';
}

// Expand an event into its occurrences within [startIso, endIso]. Honors
// recurrence type (daily/weekly/monthly/yearly), interval ("every N"), weekly
// multi-day (recurrence_days), end-by-date (recurrence_until) or end-after-N
// (recurrence_count), and single-occurrence exclusions (excluded_dates).
function getInstances(e, startIso, endIso) {
  var out = [];
  if (!e.date) return out;

  // Multi-day span (end_date after date): each occurrence is expanded into one
  // segment per day. spanDays = number of extra days beyond the start day.
  var spanDays = 0;
  if (e.end_date && e.end_date > e.date) {
    spanDays = Math.round((parseLocalDate(e.end_date) - parseLocalDate(e.date)) / 86400000);
    if (!(spanDays > 0)) spanDays = 0;
    if (spanDays > 366) spanDays = 366;
  }
  function seg(dayIso, occIso, role) {
    var s = Object.assign({}, e, { virtualDate: dayIso, _occDate: occIso, _multiRole: role });
    if (e.start && role !== 'single') {
      // Timed segment: show the real span times, but position within this day.
      s._origTime = (e.start || '') + ' – ' + (e.end || '');
      s.start = (role === 'start') ? e.start : '00:00';
      s.end = (role === 'end') ? (e.end || '23:59') : '24:00';
    }
    return s;
  }
  function emit(occIso) {
    if (spanDays <= 0) {
      if (occIso >= startIso && occIso <= endIso) out.push(seg(occIso, occIso, 'single'));
      return;
    }
    var occDate = parseLocalDate(occIso);
    for (var k = 0; k <= spanDays; k++) {
      var dayIso = toISO(addDays(occDate, k));
      if (dayIso < startIso || dayIso > endIso) continue;
      out.push(seg(dayIso, occIso, k === 0 ? 'start' : (k === spanDays ? 'end' : 'middle')));
    }
  }

  var rec = e.recurrence || 'none';
  if (rec === 'none') { emit(e.date); return out; }

  var excluded = parseExcluded(e.excluded_dates);
  var interval = Math.max(1, parseInt(e.recurrence_interval, 10) || 1);
  var count = (e.recurrence_count != null && String(e.recurrence_count) !== '') ? parseInt(e.recurrence_count, 10) : null;
  if (count != null && (isNaN(count) || count < 1)) count = null;
  var until = e.recurrence_until || null;
  var startDate = parseLocalDate(e.date);
  var dset = parseRecDays(e.recurrence_days);
  if (rec === 'weekly' && !dset.length) dset = [startDate.getDay()];

  function matches(cur) {
    if (cur < startDate) return false;
    if (rec === 'daily') {
      return Math.round((cur - startDate) / 86400000) % interval === 0;
    }
    if (rec === 'weekly') {
      if (dset.indexOf(cur.getDay()) === -1) return false;
      var wd = Math.round((addDays(cur, -cur.getDay()) - addDays(startDate, -startDate.getDay())) / (7 * 86400000));
      return wd >= 0 && wd % interval === 0;
    }
    if (rec === 'monthly') {
      if (cur.getDate() !== startDate.getDate()) return false;
      var md = (cur.getFullYear() - startDate.getFullYear()) * 12 + (cur.getMonth() - startDate.getMonth());
      return md >= 0 && md % interval === 0;
    }
    if (rec === 'yearly') {
      if (cur.getDate() !== startDate.getDate() || cur.getMonth() !== startDate.getMonth()) return false;
      var yd = cur.getFullYear() - startDate.getFullYear();
      return yd >= 0 && yd % interval === 0;
    }
    return false;
  }

  // Multi-day occurrences starting up to spanDays before the window can still
  // have segments inside it, so widen the scan start accordingly.
  var scanStartIso = spanDays > 0 ? toISO(addDays(parseLocalDate(startIso), -spanDays)) : startIso;

  if (count == null) {
    // Common case: scan the (slightly widened) visible window — cheap.
    var winStart = parseLocalDate(scanStartIso);
    if (winStart < startDate) winStart = startDate;
    var winEnd = parseLocalDate(endIso);
    for (var cur = new Date(winStart); cur <= winEnd; cur = addDays(cur, 1)) {
      var curIso = toISO(cur);
      if (until && curIso > until) break;
      if (matches(cur) && !excluded[curIso]) emit(curIso);
    }
  } else {
    // Count-limited: walk from the start counting occurrences (incl. excluded,
    // matching RRULE COUNT semantics), emitting those whose segments hit the view.
    var ordinal = 0;
    var c = new Date(startDate);
    for (var i = 0; i < 366 * 12 && ordinal < count; i++) {
      var iso = toISO(c);
      if (until && iso > until) break;
      if (iso > endIso) break;
      if (matches(c)) {
        ordinal++;
        if (!excluded[iso]) emit(iso);
      }
      c = addDays(c, 1);
    }
  }
  return out;
}

export function togglePlannerCalendarsPanel() {
  var p = document.getElementById("plannerCalendarsPanel");
  if (p.style.display === "none") {
    p.style.display = "block";
    renderPlannerCalendarsPanel();
  } else {
    p.style.display = "none";
  }
}

export function renderPlannerCalendarsPanel() {
  var p = document.getElementById("plannerCalendarsList");
  if (!p || !SET) return;
  
  var hiddenTypes = [];
  try { hiddenTypes = JSON.parse(SET.calendar_hidden_types || "[]"); } catch(e){}
  
  var customColors = {};
  try { customColors = JSON.parse(SET.calendar_colors || "{}"); } catch(e){}
  
  var types = [
    {id: "study", label: "Study", defaultColor: "#a371f7"},
    {id: "work", label: "Work", defaultColor: "#f85149"},
    {id: "personal", label: "Personal", defaultColor: "#ff7b72"},
    {id: "workout", label: "Workout", defaultColor: "#3fb950"},
    {id: "deadline", label: "Deadline", defaultColor: "#f85149"},
    {id: "other", label: "Other", defaultColor: "#2f81f7"}
  ];

  var syncUrls = (SET.cal_sync_urls || "").split("\n").map(u => u.trim()).filter(Boolean);
  syncUrls.forEach((url, idx) => {
    var label = "Imported " + (idx + 1);
    try {
      var u = new URL(url);
      label = "Sync: " + u.hostname.replace('www.','');
    } catch(e){}
    types.push({id: "ics_" + idx, label: label, defaultColor: "#8b949e"});
  });
  types.push({id: "ics", label: "Imported (Files)", defaultColor: "#8b949e"});
  
  var html = "";
  types.forEach(function(t) {
    var isHidden = hiddenTypes.indexOf(t.id) !== -1;
    var cColor = customColors[t.id] || t.defaultColor;
    html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--panel); padding:10px 16px; border-radius:8px; border:1px solid var(--border); box-shadow:0 1px 2px rgba(0,0,0,0.05);">
      <div style="font-size:14px; font-weight:600; color:var(--text); display:flex; align-items:center; gap:12px;">
        <input type="color" value="${cColor}" title="Pick color" onchange="updateCalendarColor('${t.id}', this.value)" style="width:24px; height:24px; border:none; padding:0; cursor:pointer; background:none; border-radius:4px;">
        ${t.label}
      </div>
      <label style="display:flex; align-items:center; cursor:pointer;">
        <input type="checkbox" class="ios-toggle" onchange="toggleCalendarType('${t.id}', this.checked)" ${!isHidden ? "checked" : ""}>
      </label>
    </div>`;
  });
  p.innerHTML = html;
}

export async function toggleCalendarType(typeId, isChecked) {
  var hiddenTypes = [];
  try { hiddenTypes = JSON.parse(SET.calendar_hidden_types || "[]"); } catch(e){}
  
  if (isChecked) {
    hiddenTypes = hiddenTypes.filter(id => id !== typeId);
  } else {
    if (!hiddenTypes.includes(typeId)) hiddenTypes.push(typeId);
  }
  
  SET.calendar_hidden_types = JSON.stringify(hiddenTypes);
  await api("POST", "/api/settings", { calendar_hidden_types: SET.calendar_hidden_types });
  window.refreshApp();
}

export async function updateCalendarColor(typeId, color) {
  var customColors = {};
  try { customColors = JSON.parse(SET.calendar_colors || "{}"); } catch(e){}
  
  customColors[typeId] = color;
  SET.calendar_colors = JSON.stringify(customColors);
  await api("POST", "/api/settings", { calendar_colors: SET.calendar_colors });
  applyCalendarColors();
}

function applyCalendarColors() {
  var customColors = {};
  if (SET && SET.calendar_colors) {
    try { customColors = JSON.parse(SET.calendar_colors); } catch(e){}
  }
  
  var styleTag = document.getElementById("dynamicCalendarColors");
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "dynamicCalendarColors";
    document.head.appendChild(styleTag);
  }
  
  var css = "";
  for (var typeId in customColors) {
    var c = customColors[typeId];
    if (c) {
      css += `.event.${typeId} { background-color: ${c} !important; }\n`;
      css += `.event.absolute.${typeId} { background-color: ${c} !important; }\n`;
      css += `.month-event.${typeId} { background-color: ${c} !important; }\n`;
      css += `.cal-popover-dot.${typeId} { background-color: ${c} !important; }\n`;
    }
  }
  styleTag.innerHTML = css;
}

function calculateOverlaps(events) {
  // Sort events by start time first
  events.sort(function(a, b) {
    return parseTime(a.start) - parseTime(b.start);
  });

  var clusters = [];
  var currentCluster = [];
  var maxEnd = -1;

  events.forEach(function(e) {
    if (!e.start || !e.end) return;
    var startVal = parseTime(e.start);
    var endVal = parseTime(e.end);

    if (currentCluster.length === 0) {
      currentCluster.push(e);
      maxEnd = endVal;
    } else if (startVal < maxEnd) {
      currentCluster.push(e);
      maxEnd = Math.max(maxEnd, endVal);
    } else {
      clusters.push(currentCluster);
      currentCluster = [e];
      maxEnd = endVal;
    }
  });
  if (currentCluster.length > 0) {
    clusters.push(currentCluster);
  }

  clusters.forEach(function(cluster) {
    // Pass 1 — column assignment (greedy leftmost-fit).
    var cols = [];
    cluster.forEach(function(e) {
      var placed = false;
      var startVal = parseTime(e.start);
      for (var i = 0; i < cols.length; i++) {
        var last = cols[i][cols[i].length - 1];
        if (parseTime(last.end) <= startVal) {
          cols[i].push(e);
          e._col = i;
          placed = true;
          break;
        }
      }
      if (!placed) {
        e._col = cols.length;
        cols.push([e]);
      }
    });

    // Pass 2 — span expansion. Each event grows rightward across columns
    // until it reaches one holding a time-overlapping event, so non-conflicting
    // events fill the available width (matching Google Calendar's layout).
    var totalCols = cols.length;
    cluster.forEach(function(e) {
      var startVal = parseTime(e.start);
      var endVal = parseTime(e.end);
      var span = totalCols - e._col;
      for (var c = e._col + 1; c < totalCols; c++) {
        var blocked = cols[c].some(function(other) {
          return parseTime(other.start) < endVal && parseTime(other.end) > startVal;
        });
        if (blocked) {
          span = c - e._col;
          break;
        }
      }
      e._left = (e._col / totalCols) * 100;
      e._width = (span / totalCols) * 100;
    });
  });
}

function parseTime(t) {
  if (!t) return 0;
  var p = t.split(":");
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

// Live check (the viewport can change after load), used to avoid auto-focusing
// inputs on phones — that pops the on-screen keyboard before the user has
// chosen which field to fill.
function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(max-width: 640px)').matches : false;
}

export function renderPlanner() {
  if (isDragCreating) return;
  initPlannerContextMenu();
  safeRender("planner", () => {
    isRendering = true;
  lastRenderToday = todayStr();
  var dates = getViewDates(currentView, dateOffset);
  var title = "";
  if (currentView === 'month') {
    var mDate = new Date(); mDate.setMonth(mDate.getMonth() + dateOffset);
    title = MONTHS[mDate.getMonth()] + " " + mDate.getFullYear();
  } else {
    title = (dateOffset === 0 ? "This " + (currentView === '1' ? "day" : (currentView === '7' ? "week" : currentView + " days")) + " · " : "") + fmtShort(dates[0]) + (dates.length > 1 ? " – " + fmtShort(dates[dates.length - 1]) : "") + " " + dates[0].getFullYear();
  }
  document.getElementById("weekLabel").textContent = title;
  var goToInput = document.getElementById("plannerGoToDate");
  if (goToInput) goToInput.value = toISO(dates[0]);

  var today = todayStr();
  var allInstances = [];
  
  var hiddenTypes = [];
  if (SET && SET.calendar_hidden_types) {
    try { hiddenTypes = JSON.parse(SET.calendar_hidden_types); } catch(e){}
  }
  applyCalendarColors();

  S.events.forEach(function(e) {
    var eType = (e.source && e.source.startsWith("ics")) ? e.source : e.type;
    if (hiddenTypes.indexOf(eType) !== -1) return;
    allInstances = allInstances.concat(getInstances(e, toISO(dates[0]), toISO(dates[dates.length - 1])));
  });

  var html = "";
  if (currentView === 'month') {
    html += '<div class="month-header">';
    for(var i = 0; i < 7; i++) html += '<div class="month-header-cell">' + DAYS[i] + '</div>';
    html += '</div><div class="month-grid">';
    var exactMonthDate = new Date(); exactMonthDate.setMonth(exactMonthDate.getMonth() + dateOffset);
    var exactMonth = exactMonthDate.getMonth();

    dates.forEach(function(d) {
      var iso = toISO(d);
      var evs = allInstances.filter(function(e) { return e.virtualDate === iso; }).sort(function(a, b) { return (a.start || "").localeCompare(b.start || ""); });
      var tDue = S.tasks ? S.tasks.filter(function(t) { return t.due === iso && !t.done; }) : [];
      
      var isOther = d.getMonth() !== exactMonth;
      var ccls = "month-cell" + (iso === today ? " today" : "") + (isOther ? " other-month" : "");
      html += '<div class="'+ccls+'" data-iso="'+iso+'">';
      html += '<div class="month-date" onclick="openAdd(\''+iso+'\')" style="cursor:pointer">' + d.getDate() + '</div>';
      
      // Cap chips per cell; overflow collapses into a "+N more" that opens a
      // day popover (Google-style), so busy days don't blow out the row height.
      var MONTH_CAP = 4;
      var totalItems = tDue.length + evs.length;
      var taskShown = tDue, evShown = evs, moreCount = 0;
      if (totalItems > MONTH_CAP) {
        var limit = MONTH_CAP - 1;
        taskShown = tDue.slice(0, limit);
        evShown = evs.slice(0, Math.max(0, limit - taskShown.length));
        moreCount = totalItems - (taskShown.length + evShown.length);
      }
      taskShown.forEach(function(t) {
        html += '<div class="month-event ics" onclick="toggleTask(\'' + t.id + '\',true)">☑ ' + esc(t.name) + '</div>';
      });
      evShown.forEach(function(e) {
        var rep = (e.recurrence && e.recurrence !== 'none') ? ' 🔄' : '';
        var isMulti = e._multiRole && e._multiRole !== 'single';
        var isCont = isMulti && e._multiRole !== 'start';
        var tstr = (e.start && !isCont) ? e.start + ' ' : '';
        var mcls = isMulti ? ' multi multi-' + e._multiRole : '';
        html += '<div class="month-event ' + esc(e.source && e.source.startsWith("ics") ? e.source : e.type) + mcls + '" data-id="' + e.id + '" data-occ="' + (e._occDate || e.virtualDate || e.date) + '" style="' + eventColorStyle(e) + '" onclick="showEventPopover(\'' + e.id + '\', this)">' + esc(tstr + e.title) + rep + '</div>';
      });
      if (moreCount > 0) {
        html += '<div class="month-more" onclick="showDayPopover(\'' + iso + '\', this)">+' + moreCount + ' more</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="time-grid-wrapper">';
    html += '<div class="time-grid-inner">';
    html += '<div class="time-axis">';
    html += '<div class="time-axis-spacer" style="height:37px"></div>';
    for(var h = 0; h < 24; h++) {
      html += '<div style="height:60px; position:relative;"><span class="time-label">' + h + ':00</span></div>';
    }
    html += '</div>';
    html += '<div class="day-columns' + (dates.length > 1 ? ' multiday' : '') + '">';

    dates.forEach(function(d) {
      var iso = toISO(d);
      var evs = allInstances.filter(function(e) { return e.virtualDate === iso; }).sort(function(a, b) { return (a.start || "").localeCompare(b.start || ""); });
      var tDue = S.tasks ? S.tasks.filter(function(t) { return t.due === iso && !t.done; }) : [];
      
      var timedEvs = evs.filter(function(e) { return e.start && e.end; });
      var allDayEvs = evs.filter(function(e) { return !e.start || !e.end; });
      
      calculateOverlaps(timedEvs);
      
      html += '<div class="day-col' + (iso === today ? ' today' : '') + '" data-iso="' + iso + '">';
      var dateNum = (iso === today) ? '<span class="today-circle">' + d.getDate() + '</span>' : String(d.getDate());
      html += '<div class="day-col-header"><span class="dname">' + DAYS[(d.getDay()+6)%7] + ' ' + dateNum + '</span><button class="btn ghost small" onclick="openAdd(\'' + iso + '\')">+</button></div>';
      
      html += '<div class="all-day-bar" onclick="if (event.target === this) openAdd(\'' + iso + '\', \'\', \'\', true)">';
      tDue.forEach(function(t) {
        html += '<div class="event" style="border-left-color:var(--muted); cursor:pointer; display:flex; align-items:center; gap:6px"><span class="hcheck' + (t.done ? ' on' : '') + '" onclick="toggleTask(\'' + t.id + '\',' + !t.done + ')" style="flex-shrink:0; width:16px; height:16px; line-height:16px; border-radius:4px; font-size:10px;">' + (t.done ? '✓' : '') + '</span> <span>' + esc(t.name) + '</span></div>';
      });
      allDayEvs.forEach(function(e) {
        var repeatIcon = (e.recurrence && e.recurrence !== 'none') ? ' 🔄' : '';
        var isMulti = e._multiRole && e._multiRole !== 'single';
        var mcls = isMulti ? ' multi multi-' + e._multiRole : '';
        html += '<div class="event ' + esc(e.source && e.source.startsWith("ics") ? e.source : e.type) + mcls + '" draggable="' + (isMulti ? 'false' : 'true') + '" data-id="' + e.id + '" data-occ="' + (e._occDate || e.virtualDate || e.date) + '" style="' + eventColorStyle(e) + '" onclick="showEventPopover(\'' + e.id + '\', this)">' + esc(e.title) + repeatIcon + '</div>';
      });
      html += '</div>';
      
      html += '<div class="time-grid-content" data-iso="' + iso + '">';
      html += '<div class="time-grid-bg">';
      for(var h=0; h<24; h++) html += '<div class="time-grid-bg-hour"></div>';
      html += '</div>';
      
      if (iso === today) {
        var now = new Date();
        var nowMin = now.getHours() * 60 + now.getMinutes();
        html += '<div class="current-time-line" style="top:' + nowMin + 'px"></div>';
      }
      
      timedEvs.forEach(function(e) {
        var startMin = parseTime(e.start);
        var endMin = parseTime(e.end);
        var height = endMin - startMin;
        if (height < 15) height = 15;
        var repeatIcon = (e.recurrence && e.recurrence !== 'none') ? ' 🔄' : '';
        // Multi-day timed segments show the real span times (_origTime).
        var timeStr = e._origTime ? esc(e._origTime) : (esc(e.start) + ' – ' + esc(e.end));
        var isMulti = e._multiRole && e._multiRole !== 'single';
        var mcls = isMulti ? ' multi multi-' + e._multiRole : '';
        var hasLoc = e.location && e.location.trim() !== '';
        var locStr = hasLoc ? esc(e.location.trim()) : '';
        // Google-Calendar hierarchy: bold title first (wraps so the full name
        // stays readable), then the time, then the location when there's room.
        var locHtml = (height >= 50 && hasLoc)
          ? '<div class="event-loc">' + locStr + '</div>'
          : '';
        html += '<div class="event absolute ' + esc(e.source && e.source.startsWith("ics") ? e.source : e.type) + mcls + '" draggable="' + (isMulti ? 'false' : 'true') + '" data-id="' + e.id + '" data-occ="' + (e._occDate || e.virtualDate || e.date) + '" onclick="showEventPopover(\'' + e.id + '\', this)" ';
        html += 'style="--original-height:' + height + 'px; top:' + startMin + 'px; height:' + height + 'px; left:' + e._left + '%; width:calc(' + e._width + '% - 2px);' + eventColorStyle(e) + '">';
        html += '<div class="resize-handle top"></div>';
        html += '<div class="event-title">' + esc(e.title) + repeatIcon + '</div>';
        html += '<div class="event-time">' + timeStr + '</div>';
        html += locHtml;
        html += '<div class="resize-handle bottom"></div>';
        html += '</div>';
      });
      
      html += '</div></div>';
    });
    html += '</div></div></div>';
  }
  
  var oldWrapper = document.querySelector('.time-grid-wrapper');
  if (oldWrapper && oldWrapper.clientHeight > 0) {
    lastScrollTop = oldWrapper.scrollTop;
  }

  document.getElementById("weekGrid").innerHTML = html;

  if (currentView === 'month') {
    document.querySelectorAll('.month-cell').forEach(function(col) {
      var iso = col.getAttribute("data-iso");
      attachCellTouchInteractivity(col, iso, false);
    });
  }

  var newWrapper = document.querySelector('.time-grid-wrapper');
  if (newWrapper) {
    newWrapper.addEventListener('scroll', function() {
      if (isRendering) return;
      if (newWrapper.clientHeight > 0) {
        lastScrollTop = newWrapper.scrollTop;
      }
    });
  }
  sizeTimeGrid();
  renderPlannerTaskTray();

  document.querySelectorAll(currentView === 'month' ? ".month-cell" : ".day-col").forEach(function(col) {
    col.addEventListener("dragover", function(ev) {
      ev.preventDefault();
      col.classList.add("drag-over");
      
      if (draggingEventId) {
        var e = S.events.find(function(x) { return x.id == draggingEventId; });
        if (e) {
          if (e.start && e.end && currentView !== 'month') {
            var tgc = col.querySelector('.time-grid-content');
            if (tgc) {
              var rect = tgc.getBoundingClientRect();
              var y = ev.clientY - rect.top - draggingOffsetY;
              var dur = parseTime(e.end) - parseTime(e.start);
              var startMin = Math.max(0, Math.round(y / 15) * 15);
              var endMin = startMin + dur;
              var sh = Math.floor(startMin / 60); var sm = startMin % 60;
              var eh = Math.floor(endMin / 60); var em = endMin % 60;
              if (eh >= 24) { eh = 23; em = 59; }
              var startStr = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
              var endStr = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);
              
              if (!dragPreviewEl) {
                var sourceEl = document.querySelector('.event[data-id="' + draggingEventId + '"]');
                dragPreviewEl = document.createElement('div');
                dragPreviewEl.className = sourceEl ? sourceEl.className : 'event absolute';
                dragPreviewEl.classList.add('dragging-preview');
                dragPreviewEl.classList.remove('drag-source');
                dragPreviewEl.classList.remove('dragging');
                dragPreviewEl.style.height = dur + 'px';
                dragPreviewEl.style.position = 'absolute';
                dragPreviewEl.style.pointerEvents = 'none';
                dragPreviewEl.style.zIndex = '50';
                dragPreviewEl.style.opacity = '0.8';
                
                var title = e.title || '';
                var repeatIcon = (e.recurrence && e.recurrence !== 'none') ? ' 🔄' : '';
                var hasLoc = e.location && e.location.trim() !== '';
                var locStr = hasLoc ? esc(e.location.trim()) : '';
                var timeStr = startStr + ' – ' + endStr;
                var titleHtml = '<div class="event-title">' + esc(title) + repeatIcon + '</div>';
                var timeHtml = '<div class="event-time">' + timeStr + '</div>';
                var locHtml = (dur >= 50 && hasLoc) ? '<div class="event-loc">' + locStr + '</div>' : '';

                dragPreviewEl.innerHTML = titleHtml + timeHtml + locHtml;
                tgc.appendChild(dragPreviewEl);
              }
              
              if (dragPreviewEl.parentNode !== tgc) {
                tgc.appendChild(dragPreviewEl);
              }
              dragPreviewEl.style.top = startMin + 'px';
              dragPreviewEl.style.left = '0%';
              dragPreviewEl.style.width = 'calc(100% - 2px)';
              
              var timeDiv = dragPreviewEl.querySelector('.event-time');
              if (timeDiv) {
                timeDiv.textContent = startStr + ' – ' + endStr;
              }
            } else {
              var targetContainer = currentView === 'month' ? col : col.querySelector('.all-day-bar');
              if (targetContainer) {
                if (!dragPreviewEl) {
                  var sourceEl = document.querySelector('.event[data-id="' + draggingEventId + '"]');
                  dragPreviewEl = document.createElement('div');
                  dragPreviewEl.className = sourceEl ? sourceEl.className : 'event';
                  dragPreviewEl.classList.add('dragging-preview');
                  dragPreviewEl.classList.remove('drag-source');
                  dragPreviewEl.classList.remove('dragging');
                  dragPreviewEl.style.pointerEvents = 'none';
                  dragPreviewEl.style.opacity = '0.8';
                  dragPreviewEl.innerHTML = sourceEl ? sourceEl.innerHTML : esc(e.title);
                  targetContainer.appendChild(dragPreviewEl);
                }
                if (dragPreviewEl.parentNode !== targetContainer) {
                  targetContainer.appendChild(dragPreviewEl);
                }
              }
            }
          }
        }
      }
    });
    col.addEventListener("dragleave", function(ev) {
      col.classList.remove("drag-over");
    });
    col.addEventListener("drop", async function(ev) {
      ev.preventDefault();
      col.classList.remove("drag-over");

      // Task dropped from the tray → create a linked time-block. Timed when
      // dropped on the day grid, all-day in month view.
      var taskId = ev.dataTransfer.getData("tylo/task");
      if (taskId) {
        if (dragPreviewEl) { dragPreviewEl.remove(); dragPreviewEl = null; }
        var tiso = col.getAttribute("data-iso");
        var tStart = '', tEnd = '';
        var ttgc = col.querySelector('.time-grid-content');
        if (ttgc && currentView !== 'month') {
          var trect = ttgc.getBoundingClientRect();
          var ty = ev.clientY - trect.top;
          var tStartMin = Math.max(0, Math.round(ty / 15) * 15);
          var tEndMin = tStartMin + 60;
          var tsh = Math.floor(tStartMin / 60), tsm = tStartMin % 60;
          var teh = Math.floor(tEndMin / 60), tem = tEndMin % 60;
          if (teh >= 24) { teh = 23; tem = 59; }
          tStart = (tsh < 10 ? '0'+tsh : tsh) + ':' + (tsm < 10 ? '0'+tsm : tsm);
          tEnd = (teh < 10 ? '0'+teh : teh) + ':' + (tem < 10 ? '0'+tem : tem);
        }
        await createTaskTimeBlock(taskId, tiso, tStart, tEnd);
        return;
      }

      var id = ev.dataTransfer.getData("text/plain");
      var iso = col.getAttribute("data-iso");
      if (id && iso) {
        var data = { date: iso };
        var e = S.events.find(function(x) { return x.id == id; });
        var originalDate = e ? e.date : null;
        var originalStart = e ? e.start : null;
        var originalEnd = e ? e.end : null;
        
        if (e && e.start && e.end && currentView !== 'month') {
          var tgc = col.querySelector('.time-grid-content');
          if (tgc) {
            var rect = tgc.getBoundingClientRect();
            var offsetY = parseFloat(ev.dataTransfer.getData("offsetY")) || 0;
            var y = ev.clientY - rect.top - offsetY;
            var dur = parseTime(e.end) - parseTime(e.start);
            var startMin = Math.max(0, Math.round(y / 15) * 15);
            var endMin = startMin + dur;
            var sh = Math.floor(startMin / 60); var sm = startMin % 60;
            var eh = Math.floor(endMin / 60); var em = endMin % 60;
            if (eh >= 24) { eh = 23; em = 59; }
            data.start = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
            data.end = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);
          }
        }
        // Recurring event: ask "this / all" instead of moving the whole series.
        if (e && e.recurrence && e.recurrence !== 'none') {
          if (dragPreviewEl) { dragPreviewEl.remove(); dragPreviewEl = null; }
          var occ = draggingOccDate || e.date;
          var mscope = await promptRecurrenceScope('Move recurring event', false);
          if (mscope) await applyRecurringMove(mscope, e, occ, data);
          else renderPlanner();
          return;
        }
        if (e) {
          Object.assign(e, data);
        }
        if (dragPreviewEl) {
          dragPreviewEl.remove();
          dragPreviewEl = null;
        }
        renderPlanner();
        renderDashboard();
        
        if (e) {
          var undoCallback = async function() {
            var eventToRestore = S.events.find(function(x) { return x.id == id; });
            if (eventToRestore) {
              eventToRestore.date = originalDate;
              eventToRestore.start = originalStart;
              eventToRestore.end = originalEnd;
              renderPlanner();
              renderDashboard();
              try {
                await api("PUT", "/api/events/" + id, { date: originalDate, start: originalStart, end: originalEnd });
                if (plannerRefresh) plannerRefresh();
              } catch(err) {
                console.error("Undo move failed:", err);
                if (plannerRefresh) plannerRefresh();
              }
            }
          };
          showUndoToast("Event moved", undoCallback);
        }

        try {
          await api("PUT", "/api/events/" + id, data);
          if (plannerRefresh) plannerRefresh();
        } catch(err) {
          console.error(err);
          if (plannerRefresh) await plannerRefresh();
        }
      }
    });
  });
  document.querySelectorAll(".event, .month-event").forEach(function(el) {
    if (el.getAttribute("data-id") && el.getAttribute("draggable") !== "false") {
      el.setAttribute("draggable", "true");
      el.addEventListener("dragstart", function(ev) {
        var eventId = el.getAttribute("data-id");
        draggingEventId = eventId;
        draggingOccDate = el.getAttribute("data-occ");
        ev.dataTransfer.setData("text/plain", eventId);
        var rect = el.getBoundingClientRect();
        var offsetY = ev.clientY - rect.top;
        draggingOffsetY = offsetY;
        ev.dataTransfer.setData("offsetY", offsetY);
        
        // Hide default drag ghost image
        var img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        ev.dataTransfer.setDragImage(img, 0, 0);
        
        el.classList.add('dragging');
        var height = parseFloat(el.style.height) || el.offsetHeight;
        el.style.setProperty('--drag-height', height + 'px');
        document.body.classList.add('dragging-move-active');
      });
      el.addEventListener("dragend", function(ev) {
        draggingEventId = null;
        draggingOffsetY = 0;
        el.classList.remove('dragging');
        document.body.classList.remove('dragging-move-active');
        renderPlanner();
      });

      // custom touch drag-and-drop pointer listeners
      el.addEventListener("pointerdown", function(ev) {
        if (ev.pointerType !== 'touch') return;
        if (isResizing) return;
        lastTouchTime = Date.now();
        
        var eventId = el.getAttribute("data-id");
        if (!eventId) return;
        
        touchDragPointerId = ev.pointerId;
        touchDragStartClientX = ev.clientX;
        touchDragStartClientY = ev.clientY;
        isTouchDragging = false;
        
        clearTimeout(touchDragLongPressTimer);
        touchDragLongPressTimer = setTimeout(function() {
          isTouchDragging = true;
          draggingEventId = eventId;
          draggingOccDate = el.getAttribute("data-occ");
          el.setPointerCapture(ev.pointerId);
          
          var rect = el.getBoundingClientRect();
          draggingOffsetY = ev.clientY - rect.top;
          
          if (navigator.vibrate) navigator.vibrate(20);
          
          el.classList.add('dragging');
          var height = parseFloat(el.style.height) || el.offsetHeight;
          el.style.setProperty('--drag-height', height + 'px');
          document.body.classList.add('dragging-move-active');
          
          window.addEventListener('touchmove', preventDefaultTouchMove, { passive: false });
        }, 250);
      });

      el.addEventListener("pointermove", function(ev) {
        if (ev.pointerId !== touchDragPointerId) return;
        lastTouchTime = Date.now();
        
        if (!isTouchDragging) {
          var dx = ev.clientX - touchDragStartClientX;
          var dy = ev.clientY - touchDragStartClientY;
          if (Math.sqrt(dx*dx + dy*dy) > 10) {
            clearTimeout(touchDragLongPressTimer);
          }
          return;
        }
        
        updateTouchDrag(ev);
      });

      el.addEventListener("pointerup", function(ev) {
        if (ev.pointerId !== touchDragPointerId) return;
        clearTimeout(touchDragLongPressTimer);
        lastTouchTime = Date.now();
        
        if (isTouchDragging) {
          ev.preventDefault();
          ev.stopPropagation();
          el.releasePointerCapture(ev.pointerId);
          handleTouchDrop(ev);
        }
        
        touchDragPointerId = null;
        isTouchDragging = false;
        window.removeEventListener('touchmove', preventDefaultTouchMove, { passive: false });
      });

      el.addEventListener("pointercancel", function(ev) {
        if (ev.pointerId !== touchDragPointerId) return;
        clearTimeout(touchDragLongPressTimer);
        lastTouchTime = Date.now();
        
        if (isTouchDragging) {
          el.releasePointerCapture(ev.pointerId);
          if (dragPreviewEl) {
            dragPreviewEl.remove();
            dragPreviewEl = null;
          }
          el.classList.remove('dragging');
          document.body.classList.remove('dragging-move-active');
          document.querySelectorAll('.day-col, .month-cell').forEach(function(c) {
            c.classList.remove('drag-over');
          });
        }
        
        touchDragPointerId = null;
        isTouchDragging = false;
        window.removeEventListener('touchmove', preventDefaultTouchMove, { passive: false });
      });
    }
  });
  
  if (currentView !== 'month') {
    attachTimeGridInteractivity();
    
    var headerH = 0;
    var allDayH = 0;
    document.querySelectorAll('.day-col-header').forEach(function(el) { if (el.offsetHeight > headerH) headerH = el.offsetHeight; });
    document.querySelectorAll('.all-day-bar').forEach(function(el) { if (el.offsetHeight > allDayH) allDayH = el.offsetHeight; });
    document.querySelectorAll('.all-day-bar').forEach(function(el) {
      el.style.height = allDayH + 'px';
      el.style.top = headerH + 'px';
    });
    var spacer = document.querySelector('.time-axis-spacer');
    if (spacer) spacer.style.height = (headerH + allDayH) + 'px';
    
    var minStart = 7 * 60; // 7 am
    document.querySelectorAll('.event.absolute').forEach(function(el) {
      if (el.style.top) {
        var topPx = parseFloat(el.style.top);
        if (topPx < minStart) minStart = topPx;
      }
    });
    
    var wrapper = document.querySelector('.time-grid-wrapper');
    if (wrapper) {
      var tabPlanner = document.getElementById("tab-planner");
      var isVisible = tabPlanner && tabPlanner.classList.contains("active") && wrapper.clientHeight > 0;
      if (isVisible) {
        if (lastScrollTop !== null) {
          wrapper.scrollTop = lastScrollTop;
        } else if (!scrolledToCurrentTimeThisSession) {
          // Open on the morning (~7am, or the earliest event) so the bulk of
          // the day is visible at a glance — like Google Calendar.
          wrapper.scrollTop = Math.max(0, allDayH + minStart - 8);
          scrolledToCurrentTimeThisSession = true;
          lastScrollTop = wrapper.scrollTop;
        } else {
          wrapper.scrollTop = Math.max(0, allDayH + minStart - 8);
          lastScrollTop = wrapper.scrollTop;
        }
        isRendering = false;
      } else {
        setTimeout(function() {
          var isVisibleNow = tabPlanner && tabPlanner.classList.contains("active") && wrapper.clientHeight > 0;
          if (isVisibleNow) {
            if (lastScrollTop !== null) {
              wrapper.scrollTop = lastScrollTop;
            } else if (!scrolledToCurrentTimeThisSession) {
              // Open on the morning (~7am, or the earliest event), like GCal.
              wrapper.scrollTop = Math.max(0, allDayH + minStart - 8);
              scrolledToCurrentTimeThisSession = true;
              lastScrollTop = wrapper.scrollTop;
            }
          }
          isRendering = false;
        }, 50);
      }
    } else {
      isRendering = false;
    }
  } else {
    isRendering = false;
  }

    var t = document.getElementById("evTitle"); if (t) t.focus();
  });
}

function scrollToCurrentTimeLineIfVisible() {
  if (scrolledToCurrentTimeThisSession) return;
  if (currentView === 'month') return;
  
  var tabPlanner = document.getElementById("tab-planner");
  var wrapper = document.querySelector('.time-grid-wrapper');
  var isVisible = tabPlanner && tabPlanner.classList.contains("active") && wrapper && wrapper.clientHeight > 0;
  if (!isVisible) return;
  
  var headerH = 0;
  var allDayH = 0;
  document.querySelectorAll('.day-col-header').forEach(function(el) { if (el.offsetHeight > headerH) headerH = el.offsetHeight; });
  document.querySelectorAll('.all-day-bar').forEach(function(el) { if (el.offsetHeight > allDayH) allDayH = el.offsetHeight; });
  
  // Open on the morning (~7am) so the day is visible from the top, like GCal.
  wrapper.scrollTop = Math.max(0, allDayH + 7 * 60 - 8);
  scrolledToCurrentTimeThisSession = true;
  lastScrollTop = wrapper.scrollTop;
}

function initTabListener() {
  var tabs = document.getElementById("tabs");
  if (tabs) {
    tabs.addEventListener("click", function(e) {
      var b = e.target.closest("button");
      if (b && b.dataset.tab === "planner") {
        setTimeout(scrollToCurrentTimeLineIfVisible, 50);
      }
    });
  }

  var startInput = document.getElementById('evModalStart');
  var endInput = document.getElementById('evModalEnd');
  var durationSelect = document.getElementById('evModalDuration');
  var recSelect = document.getElementById('evModalRec');

  if (startInput) {
    startInput.addEventListener('change', function() {
      if (durationSelect && durationSelect.value !== 'custom') {
        updateEndTimeFromDuration();
      } else {
        updateDurationFromTimes();
      }
    });
  }

  if (endInput) {
    endInput.addEventListener('change', function() {
      updateDurationFromTimes();
    });
  }

  if (durationSelect) {
    durationSelect.addEventListener('change', function() {
      updateEndTimeFromDuration();
    });
  }

  if (recSelect) {
    recSelect.addEventListener('change', updateRecurrenceVisibility);
  }
  var recEndSelect = document.getElementById('evModalRecEnd');
  if (recEndSelect) {
    recEndSelect.addEventListener('change', updateRecurrenceVisibility);
  }

  // Reminder list and controls setup
  var addRemBtn = document.getElementById('evModalRemAddBtn');
  var remSelect = document.getElementById('evModalRemSelect');
  var customAddBtn = document.getElementById('evModalRemCustomAdd');
  var customValInput = document.getElementById('evModalRemCustomVal');
  var cancelRemBtn = document.getElementById('evModalRemCancel');

  if (addRemBtn) {
    addRemBtn.addEventListener('click', function() {
      addRemBtn.style.display = 'none';
      document.getElementById('evModalRemSelectorGroup').style.display = 'flex';
      if (remSelect) remSelect.value = '';
    });
  }

  if (cancelRemBtn) {
    cancelRemBtn.addEventListener('click', resetReminderControls);
  }

  if (remSelect) {
    remSelect.addEventListener('change', function() {
      var val = remSelect.value;
      if (val === 'custom') {
        document.getElementById('evModalRemCustomGroup').style.display = 'flex';
        if (customValInput) {
          customValInput.value = '';
          customValInput.focus();
        }
      } else if (val !== '') {
        var offset = parseInt(val, 10);
        if (!isNaN(offset) && activeReminders.indexOf(offset) === -1) {
          activeReminders.push(offset);
          renderReminderPills();
        }
        resetReminderControls();
      }
    });
  }

  if (customAddBtn) {
    customAddBtn.addEventListener('click', function() {
      if (customValInput) {
        var offset = parseInt(customValInput.value, 10);
        if (!isNaN(offset) && offset >= 0 && activeReminders.indexOf(offset) === -1) {
          activeReminders.push(offset);
          renderReminderPills();
        }
      }
      resetReminderControls();
    });
  }

  if (customValInput) {
    customValInput.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        customAddBtn.click();
      }
    });
  }

  // Keyboard shortcuts inputs key recording
  document.querySelectorAll('.shortcut-input').forEach(function(input) {
    input.addEventListener('keydown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].indexOf(e.key) !== -1) return;
      var keyName = e.key;
      if (keyName === ' ') {
        keyName = 'Space';
      }
      if (keyName.length === 1) {
        keyName = keyName.toLowerCase();
      }
      input.value = keyName;
    });
  });

  // Event modal Enter key save listener
  var eventModal = document.getElementById('eventModal');
  if (eventModal) {
    eventModal.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') {
        var target = ev.target;
        if (target && target.id !== 'evModalDesc' && target.id !== 'evModalRemCustomVal' && target.tagName !== 'BUTTON') {
          ev.preventDefault();
          saveEventModal();
        }
      }
    });
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', function(e) {
    var tabPlanner = document.getElementById("tab-planner");
    if (!tabPlanner || !tabPlanner.classList.contains("active")) return;
    
    if (isInputFocused()) return;

    var modalOpen = false;
    document.querySelectorAll('.modal').forEach(function(m) {
      if (m.open || (m.style.display && m.style.display !== 'none')) modalOpen = true;
    });
    if (modalOpen) return;

    var key = e.key;
    if (key === ' ') {
      key = 'Space';
    }
    if (key.length === 1) {
      key = key.toLowerCase();
    }
    
    if (key === shortcuts.today) {
      e.preventDefault();
      moveWeek(0);
    } else if (key === shortcuts.weekView) {
      e.preventDefault();
      var select = document.getElementById('plannerView');
      if (select) { select.value = '7'; changePlannerView('7'); }
    } else if (key === shortcuts.dayView) {
      e.preventDefault();
      var select = document.getElementById('plannerView');
      if (select) { select.value = '1'; changePlannerView('1'); }
    } else if (key === shortcuts.monthView) {
      e.preventDefault();
      var select = document.getElementById('plannerView');
      if (select) { select.value = 'month'; changePlannerView('month'); }
    } else if (key === shortcuts.next || key === 'ArrowRight') {
      e.preventDefault();
      moveWeek(1);
    } else if (key === shortcuts.prev || key === 'ArrowLeft') {
      e.preventDefault();
      moveWeek(-1);
    } else if (key === shortcuts.create) {
      e.preventDefault();
      openAdd(todayStr());
    }
  });

  // Swipe Navigation
  var weekGrid = document.getElementById("weekGrid");
  if (weekGrid) {
    var swipeStartX = 0;
    var swipeStartY = 0;
    var swipeStartTime = 0;
    var swipePointerId = null;
    
    weekGrid.addEventListener("pointerdown", function(e) {
      if (e.pointerType !== "touch") return;
      if (isTouchDragging || isResizing || draggingEventId) return;
      
      swipeStartX = e.clientX;
      swipeStartY = e.clientY;
      swipeStartTime = Date.now();
      swipePointerId = e.pointerId;
    });
    
    weekGrid.addEventListener("pointerup", function(e) {
      if (e.pointerId !== swipePointerId) return;
      
      var dX = e.clientX - swipeStartX;
      var dY = e.clientY - swipeStartY;
      var dT = Date.now() - swipeStartTime;
      
      swipePointerId = null;
      
      if (dT < 400 && Math.abs(dX) > 50 && Math.abs(dX) > 2 * Math.abs(dY)) {
        if (dX > 50) {
          moveWeek(-1);
        } else if (dX < -50) {
          moveWeek(1);
        }
      }
    });
    
    weekGrid.addEventListener("pointercancel", function(e) {
      if (e.pointerId === swipePointerId) {
        swipePointerId = null;
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTabListener);
} else {
  initTabListener();
}

function attachTimeGridInteractivity() {
  document.querySelectorAll('.time-grid-content').forEach(function(node) {
    var iso = node.getAttribute('data-iso');
    attachCellTouchInteractivity(node, iso, true);

    node.addEventListener('mousedown', function(e) {
      if (Date.now() - lastTouchTime < 1000) return;
      if (e.target.closest('.event')) return;
      e.preventDefault();
      isDragCreating = true;

      var rect = node.getBoundingClientRect();
      var startY = e.clientY - rect.top;
      var startMin = Math.max(0, Math.round(startY / 15) * 15);
      
      // Create selection placeholder element
      var placeholder = document.createElement('div');
      placeholder.className = 'selection-placeholder';
      placeholder.style.top = startMin + 'px';
      placeholder.style.height = '15px';
      placeholder.innerHTML = '<div style="font-weight:bold;">New Event</div><div class="selection-time-label"></div>';
      node.appendChild(placeholder);
      
      function updatePlaceholder(currentY) {
        var currentMin = Math.max(0, Math.round(currentY / 15) * 15);
        var actualStart = Math.min(startMin, currentMin);
        var actualEnd = Math.max(startMin, currentMin);
        if (actualEnd === actualStart) {
          actualEnd = actualStart + 15;
        }
        var height = actualEnd - actualStart;
        placeholder.style.top = actualStart + 'px';
        placeholder.style.height = height + 'px';
        
        if (height < 35) {
          placeholder.classList.add('short');
        } else {
          placeholder.classList.remove('short');
        }
        
        var sh = Math.floor(actualStart / 60); var sm = actualStart % 60;
        var eh = Math.floor(actualEnd / 60); var em = actualEnd % 60;
        if (eh >= 24) { eh = 23; em = 59; }
        var startStr = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
        var endStr = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);
        
        var label = placeholder.querySelector('.selection-time-label');
        if (label) {
          label.textContent = startStr + ' – ' + endStr;
        }
      }
      
      updatePlaceholder(startY);
      
      function onMouseMove(moveEvent) {
        var currentY = moveEvent.clientY - rect.top;
        updatePlaceholder(currentY);
      }
      
      function onMouseUp(upEvent) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        isDragCreating = false;

        var finalY = upEvent.clientY - rect.top;
        var finalMin = Math.max(0, Math.round(finalY / 15) * 15);
        var actualStart = Math.min(startMin, finalMin);
        var actualEnd = Math.max(startMin, finalMin);
        if (actualEnd === actualStart) {
          // Default to 1 hour if it was a single click
          actualEnd = actualStart + 60;
        }
        var sh = Math.floor(actualStart / 60); var sm = actualStart % 60;
        var eh = Math.floor(actualEnd / 60); var em = actualEnd % 60;
        if (eh >= 24) { eh = 23; em = 59; }
        var startStr = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
        var endStr = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);
        
        placeholder.remove();
        openAdd(iso, startStr, endStr);
      }
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });

  document.querySelectorAll('.event.absolute').forEach(function(el) {
    var handles = el.querySelectorAll('.resize-handle');
    var id = el.getAttribute('data-id');
    
    handles.forEach(function(handle) {
      handle.addEventListener('click', function(e) {
        e.stopPropagation();
      });
      handle.addEventListener('pointerdown', function(e) {
        e.stopPropagation();
        e.preventDefault();
        isResizing = true;
        
        handle.setPointerCapture(e.pointerId);
        
        var evObj = S.events.find(function(x) { return x.id == id; });
        var originalStart = evObj ? evObj.start : null;
        var originalEnd = evObj ? evObj.end : null;
        var dragType = handle.classList.contains('top') ? 'resize-top' : 'resize-bottom';
        var startY = e.clientY;
        var startTop = parseFloat(el.style.top);
        var startHeight = parseFloat(el.style.height);
        document.body.classList.add('dragging-active');
        el.classList.add('dragging');
        el.style.setProperty('--drag-height', startHeight + 'px');
        
        function onPointerMove(moveEvent) {
          var dy = moveEvent.clientY - startY;
          var newTop = startTop;
          var newHeight = startHeight;
          if (dragType === 'resize-bottom') {
            newHeight = Math.max(15, startHeight + dy);
          } else if (dragType === 'resize-top') {
            newTop = Math.max(0, startTop + dy);
            newHeight = startHeight - (newTop - startTop);
            if (newHeight < 15) {
               newTop = startTop + startHeight - 15;
               newHeight = 15;
            }
          }
          el.style.top = newTop + 'px';
          el.style.height = newHeight + 'px';
          el.style.setProperty('--drag-height', newHeight + 'px');

          var currentTop = Math.round(newTop / 15) * 15;
          var currentHeight = Math.round(newHeight / 15) * 15;
          if (currentHeight < 15) currentHeight = 15;
          var currentEndTop = currentTop + currentHeight;
          var sh = Math.floor(currentTop / 60); var sm = currentTop % 60;
          var eh = Math.floor(currentEndTop / 60); var em = currentEndTop % 60;
          if (eh >= 24) { eh = 23; em = 59; }
          var startStr = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
          var endStr = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);

          var timeDiv = el.querySelector('.event-time');
          if (timeDiv) {
            timeDiv.textContent = startStr + ' – ' + endStr;
          }
        }
        
        function onPointerUp(upEvent) {
          handle.releasePointerCapture(upEvent.pointerId);
          document.removeEventListener('pointermove', onPointerMove);
          document.removeEventListener('pointerup', onPointerUp);
          document.removeEventListener('pointercancel', onPointerUp);
          document.body.classList.remove('dragging-active');
          el.classList.remove('dragging');
          
          var finalTop = parseFloat(el.style.top);
          var finalHeight = parseFloat(el.style.height);
          finalTop = Math.round(finalTop / 15) * 15;
          finalHeight = Math.round(finalHeight / 15) * 15;
          if (finalHeight < 15) finalHeight = 15;
          
          // Snap locally immediately
          el.style.top = finalTop + 'px';
          el.style.height = finalHeight + 'px';
          el.style.setProperty('--drag-height', finalHeight + 'px');
          el.style.setProperty('--original-height', finalHeight + 'px');
          el.classList.add('resizing-saving');
          
          var endTop = finalTop + finalHeight;
          var sh = Math.floor(finalTop / 60); var sm = finalTop % 60;
          var eh = Math.floor(endTop / 60); var em = endTop % 60;
          var startStr = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
          var endStr = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);
          
          var e = S.events.find(function(x) { return x.id == id; });

          // No-op: handle was pressed but times didn't change — just re-render, no toast, no save.
          if (startStr === originalStart && endStr === originalEnd) {
            renderPlanner();
            setTimeout(function() { isResizing = false; }, 50);
            return;
          }

          if (e) {
            e.start = startStr;
            e.end = endStr;
          }
          renderPlanner();
          renderDashboard();

          if (e) {
            var undoCallback = async function() {
              var eventToRestore = S.events.find(function(x) { return x.id == id; });
              if (eventToRestore) {
                eventToRestore.start = originalStart;
                eventToRestore.end = originalEnd;
                renderPlanner();
                renderDashboard();
                try {
                  await api("PUT", "/api/events/" + id, { start: originalStart, end: originalEnd });
                  if (plannerRefresh) plannerRefresh();
                } catch(err) {
                  console.error("Undo resize failed:", err);
                  if (plannerRefresh) plannerRefresh();
                }
              }
            };
            showUndoToast("Event resized", undoCallback);
          }

          if (id) {
            api("PUT", "/api/events/" + id, { start: startStr, end: endStr })
              .then(function() {
                if (plannerRefresh) plannerRefresh();
              })
              .catch(function(err) {
                console.error(err);
                if (plannerRefresh) plannerRefresh();
              })
              .then(function() {
                setTimeout(function() { isResizing = false; }, 50);
              });
          } else {
            setTimeout(function() { isResizing = false; }, 50);
          }
        }
        
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
      });
    });
  });
}

function formatTime(minutes) {
  var h = Math.floor(minutes / 60) % 24;
  var m = minutes % 60;
  return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
}

function updateDurationFromTimes() {
  var startVal = document.getElementById('evModalStart').value;
  var endVal = document.getElementById('evModalEnd').value;
  var durationSelect = document.getElementById('evModalDuration');
  if (!durationSelect) return;

  if (!startVal || !endVal) {
    durationSelect.value = 'custom';
    return;
  }

  var startMin = parseTime(startVal);
  var endMin = parseTime(endVal);
  var diff = endMin - startMin;

  if (diff < 0) {
    durationSelect.value = 'custom';
    return;
  }

  var presets = ['15', '30', '45', '60', '90', '120', '180'];
  if (presets.indexOf(diff.toString()) !== -1) {
    durationSelect.value = diff.toString();
  } else {
    durationSelect.value = 'custom';
  }
}

function updateEndTimeFromDuration() {
  var startVal = document.getElementById('evModalStart').value;
  var durationSelect = document.getElementById('evModalDuration');
  if (!durationSelect || !startVal) return;

  var dur = durationSelect.value;
  if (dur === 'custom') return;

  var startMin = parseTime(startVal);
  var endMin = startMin + parseInt(dur, 10);
  
  document.getElementById('evModalEnd').value = formatTime(endMin);
}

// Toggle the time fields when the "All day" hcheck flips. (Exported so the
// inline onclick in index.html can reach it through app.js.)
export function toggleEvModalAllDay() {
  var cb = document.getElementById('evModalAllDay');
  if (cb) cb.classList.toggle('on');
  updateAllDayVisibility();
}

export function updateAllDayVisibility() {
  var cb = document.getElementById('evModalAllDay');
  var fields = document.getElementById('evModalTimeFields');
  if (cb && fields) fields.style.display = cb.classList.contains('on') ? 'none' : 'flex';
}

// Per-event color picker: '' = default (use the type color). Highlights the
// chosen swatch (or the custom one for a non-preset hex).
export function setEventColor(hex) {
  hex = hex || '';
  var input = document.getElementById('evModalColor');
  if (input) input.value = hex;
  var matched = false;
  document.querySelectorAll('#evModalColorSwatches .color-swatch').forEach(function (sw) {
    if (sw.classList.contains('color-custom')) return;
    var on = (sw.getAttribute('data-color') || '') === hex;
    sw.classList.toggle('active', on);
    if (on) matched = true;
  });
  var custom = document.getElementById('evModalColorCustom');
  if (custom) {
    if (hex && !matched) { custom.value = hex; custom.classList.add('active'); }
    else custom.classList.remove('active');
  }
}

function updateRecurrenceVisibility() {
  var rec = document.getElementById('evModalRec');
  var opts = document.getElementById('evModalRecOptions');
  if (!rec || !opts) return;
  if (rec.value === 'none') { opts.style.display = 'none'; return; }
  opts.style.display = 'flex';

  var unit = document.getElementById('evModalRecUnit');
  var units = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' };
  if (unit) unit.textContent = units[rec.value] || 'times';

  var daysGroup = document.getElementById('evModalRecDaysGroup');
  if (daysGroup) daysGroup.style.display = (rec.value === 'weekly') ? 'flex' : 'none';

  var endSel = document.getElementById('evModalRecEnd');
  var endMode = endSel ? endSel.value : 'never';
  var untilInput = document.getElementById('evModalRecUntil');
  var countGroup = document.getElementById('evModalRecCountGroup');
  if (untilInput) untilInput.style.display = (endMode === 'until') ? 'block' : 'none';
  if (countGroup) countGroup.style.display = (endMode === 'count') ? 'flex' : 'none';
}

// Populate the recurrence sub-form from an event (blank defaults when e is null).
function setRecurrenceUI(e) {
  var rec = (e && e.recurrence) || 'none';
  document.getElementById('evModalRec').value = rec;
  document.getElementById('evModalRecInterval').value = (e && e.recurrence_interval) ? e.recurrence_interval : 1;

  var days = parseRecDays(e && e.recurrence_days);
  if (!days.length && rec === 'weekly' && e && e.date) days = [parseLocalDate(e.date).getDay()];
  document.querySelectorAll('#evModalRecDays .rec-day').forEach(function (cb) {
    cb.checked = days.indexOf(parseInt(cb.value, 10)) !== -1;
  });

  var endSel = document.getElementById('evModalRecEnd');
  if (e && e.recurrence_count != null && String(e.recurrence_count) !== '') {
    endSel.value = 'count';
    document.getElementById('evModalRecCount').value = e.recurrence_count;
    document.getElementById('evModalRecUntil').value = '';
  } else if (e && e.recurrence_until) {
    endSel.value = 'until';
    document.getElementById('evModalRecUntil').value = e.recurrence_until;
    document.getElementById('evModalRecCount').value = 10;
  } else {
    endSel.value = 'never';
    document.getElementById('evModalRecUntil').value = '';
    document.getElementById('evModalRecCount').value = 10;
  }
  updateRecurrenceVisibility();
}

// Read recurrence fields from the sub-form into a payload fragment.
function readRecurrenceFromUI() {
  var rec = document.getElementById('evModalRec').value;
  if (rec === 'none') {
    return { recurrence: 'none', recurrence_interval: 1, recurrence_days: '', recurrence_until: '', recurrence_count: null };
  }
  var interval = Math.max(1, Math.min(999, parseInt(document.getElementById('evModalRecInterval').value, 10) || 1));
  var days = '';
  if (rec === 'weekly') {
    var checked = [];
    document.querySelectorAll('#evModalRecDays .rec-day:checked').forEach(function (cb) { checked.push(parseInt(cb.value, 10)); });
    days = checked.sort(function (a, b) { return a - b; }).join(',');
  }
  var endMode = document.getElementById('evModalRecEnd').value;
  var until = '', count = null;
  if (endMode === 'until') until = document.getElementById('evModalRecUntil').value || '';
  else if (endMode === 'count') count = Math.max(1, Math.min(10000, parseInt(document.getElementById('evModalRecCount').value, 10) || 1));
  return { recurrence: rec, recurrence_interval: interval, recurrence_days: days, recurrence_until: until, recurrence_count: count };
}

function resetReminderControls() {
  document.getElementById('evModalRemAddBtn').style.display = 'inline-block';
  document.getElementById('evModalRemSelectorGroup').style.display = 'none';
  document.getElementById('evModalRemCustomGroup').style.display = 'none';
  document.getElementById('evModalRemSelect').value = '';
  document.getElementById('evModalRemCustomVal').value = '';
}

function renderReminderPills() {
  var list = document.getElementById('evModalRemList');
  if (!list) return;
  list.innerHTML = '';
  
  if (activeReminders.length === 0) {
    list.innerHTML = '<span class="muted" style="font-size:12px; font-style:italic;">No reminders set</span>';
    return;
  }
  
  activeReminders.sort(function(a, b) { return a - b; });
  
  activeReminders.forEach(function(offset) {
    var text = '';
    if (offset === 0) {
      text = 'At start';
    } else if (offset < 60) {
      text = offset + 'm before';
    } else if (offset % 60 === 0) {
      text = (offset / 60) + 'h before';
    } else {
      text = offset + 'm before';
    }
    
    var pill = document.createElement('div');
    pill.style.cssText = 'background:var(--panel2); border:1px solid var(--border); border-radius:12px; padding:3px 8px; font-size:11.5px; display:inline-flex; align-items:center; gap:6px; color:var(--text);';
    pill.innerHTML = '<span>' + esc(text) + '</span><span class="remove-btn" style="cursor:pointer; color:var(--muted); font-weight:bold; font-size:11px;">✕</span>';
    
    pill.querySelector('.remove-btn').addEventListener('click', function() {
      activeReminders = activeReminders.filter(function(x) { return x !== offset; });
      renderReminderPills();
    });
    
    pill.querySelector('.remove-btn').addEventListener('mouseenter', function() {
      this.style.color = 'var(--red)';
    });
    pill.querySelector('.remove-btn').addEventListener('mouseleave', function() {
      this.style.color = 'var(--muted)';
    });
    
    list.appendChild(pill);
  });
}

// ---- Task tray (drag a task onto the calendar to time-block it) ----

var TRAY_PRIO_DOT = { high: 'var(--red)', med: 'var(--orange)', low: 'var(--accent)' };

export function togglePlannerTaskTray() {
  taskTrayOpen = !taskTrayOpen;
  var tray = document.getElementById('plannerTaskTray');
  var btn = document.getElementById('plannerTaskTrayBtn');
  if (tray) tray.style.display = taskTrayOpen ? 'flex' : 'none';
  if (btn) btn.classList.toggle('active', taskTrayOpen);
  if (taskTrayOpen) renderPlannerTaskTray();
}

function renderPlannerTaskTray() {
  var tray = document.getElementById('plannerTaskTray');
  if (!tray || !taskTrayOpen) return;

  // Open, top-level tasks that aren't already time-blocked (no event links back).
  var blocked = {};
  (S.events || []).forEach(function(e) { if (e.task_id) blocked[e.task_id] = true; });
  var open = (S.tasks || []).filter(function(t) {
    return !t.done && !t.parent_id && !blocked[t.id];
  });
  open.sort(function(a, b) {
    var r = priorityRank(a.priority) - priorityRank(b.priority);
    if (r !== 0) return r;
    return (a.order_index || 0) - (b.order_index || 0);
  });

  tray.innerHTML = '';
  var label = document.createElement('span');
  label.className = 'tray-label';
  label.textContent = open.length ? '📋 Drag onto a day to schedule:' : '📋 No unscheduled tasks';
  tray.appendChild(label);

  open.forEach(function(t) {
    var chip = document.createElement('span');
    chip.className = 'task-chip';
    chip.draggable = true;
    chip.dataset.taskId = t.id;
    var dot = TRAY_PRIO_DOT[t.priority];
    if (dot) {
      var dotEl = document.createElement('span');
      dotEl.className = 'chip-dot';
      dotEl.style.background = dot;
      chip.appendChild(dotEl);
    }
    chip.appendChild(document.createTextNode(t.name));
    chip.addEventListener('dragstart', function(ev) {
      // Only tylo/task is set (no text/plain) so the event-move drop path is
      // skipped and the task branch in the column drop handler takes over.
      ev.dataTransfer.setData('tylo/task', t.id);
      ev.dataTransfer.effectAllowed = 'copy';
      chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', function() { chip.classList.remove('dragging'); });
    tray.appendChild(chip);
  });
}

// Create a calendar time-block linked to a task (events.task_id). Timed when
// dropped on the day grid, all-day when dropped in month view / the all-day bar.
async function createTaskTimeBlock(taskId, iso, start, end) {
  var t = (S.tasks || []).find(function(x) { return x.id === taskId; });
  if (!t || !iso) return;
  var data = {
    title: t.name, date: iso,
    start: start || '', end: end || '',
    type: 'task', task_id: taskId, source: 'local'
  };
  try {
    var res = await api('POST', '/api/events', data);
    if (res && res.id) S.events.push(Object.assign({ id: res.id }, data));
  } catch (err) {
    console.error('Time-block create failed:', err);
  }
  renderPlanner();
  renderDashboard();
  renderPlannerTaskTray();
  if (plannerRefresh) plannerRefresh();
}

export function openAdd(iso, defaultStart, defaultEnd, allDay) {
  editingOccurrenceDate = null;
  window.dispatchEvent(new CustomEvent('open-event-modal'));
  document.getElementById('evModalTitleText').textContent = 'Add Event';
  document.getElementById('evModalId').value = '';
  document.getElementById('evModalTitle').value = '';
  document.getElementById('evModalType').value = 'study';
  document.getElementById('evModalDate').value = iso;
  document.getElementById('evModalEndDate').value = '';
  document.getElementById('evModalStart').value = defaultStart || '';
  document.getElementById('evModalEnd').value = defaultEnd || '';
  document.getElementById('evModalDesc').value = '';
  document.getElementById('evModalLoc').value = '';
  setRecurrenceUI(null);
  document.getElementById('evModalAllDay').classList.toggle('on', !!allDay);
  updateAllDayVisibility();
  setEventColor('');
  document.getElementById('evModalDelBtn').style.display = 'none';

  activeReminders = [];
  renderReminderPills();
  resetReminderControls();
  updateDurationFromTimes();

  // Desktop: focus the title for quick typing. Mobile: leave focus on the
  // dialog heading (autofocus in index.html) so the keyboard stays down and the
  // user can pick which field to fill first.
  if (!isMobileViewport()) {
    setTimeout(function () { var t = document.getElementById('evModalTitle'); if (t) t.focus(); }, 50);
  }
}

export function editEvent(id, occDate) {
  if (isResizing || justTouchDragged) return;
  var e = S.events.find(function(x) { return x.id === id; });
  if (!e) return;
  window.dispatchEvent(new CustomEvent('open-event-modal'));
  document.getElementById('evModalTitleText').textContent = 'Edit Event';
  document.getElementById('evModalId').value = e.id;
  document.getElementById('evModalTitle').value = e.title || '';
  document.getElementById('evModalType').value = e.type || 'other';
  // When editing one occurrence of a recurring event, show that occurrence's
  // date (not the series start) and remember it so Save can scope the change.
  var isRecurring = e.recurrence && e.recurrence !== 'none';
  editingOccurrenceDate = (isRecurring && occDate) ? occDate : null;
  document.getElementById('evModalDate').value = editingOccurrenceDate || e.date || '';
  document.getElementById('evModalEndDate').value = e.end_date || '';
  document.getElementById('evModalAllDay').classList.toggle('on', !(e.start && e.end));
  updateAllDayVisibility();
  setEventColor(e.color || '');
  document.getElementById('evModalStart').value = e.start || '';
  document.getElementById('evModalEnd').value = e.end || '';
  document.getElementById('evModalDesc').value = e.description || '';
  document.getElementById('evModalLoc').value = e.location || '';
  setRecurrenceUI(e);
  document.getElementById('evModalDelBtn').style.display = 'block';

  activeReminders = [];
  if (e.reminder_offset !== undefined && e.reminder_offset !== null) {
    var raw = e.reminder_offset.toString().trim();
    if (raw !== '-1' && raw !== '') {
      activeReminders = raw.split(',').map(function(x) { return parseInt(x.trim(), 10); }).filter(function(x) { return !isNaN(x) && x >= 0; });
    }
  }
  renderReminderPills();
  resetReminderControls();
  updateDurationFromTimes();

  // Desktop: focus the title for quick typing. Mobile: leave focus on the
  // dialog heading (autofocus in index.html) so the keyboard stays down and the
  // user can pick which field to fill first.
  if (!isMobileViewport()) {
    setTimeout(function () { var t = document.getElementById('evModalTitle'); if (t) t.focus(); }, 50);
  }
}



export async function saveEventModal(refresh) {
  var id = document.getElementById("evModalId").value;
  var title = document.getElementById("evModalTitle").value.trim();
  if (!title) return;
  var startDateVal = document.getElementById("evModalDate").value;
  var endDateVal = document.getElementById("evModalEndDate").value;
  // Only keep end_date when it's genuinely a multi-day span.
  if (!(endDateVal && endDateVal > startDateVal)) endDateVal = '';
  var allDay = document.getElementById("evModalAllDay").classList.contains('on');
  var data = Object.assign({
    title: title,
    type: document.getElementById("evModalType").value,
    date: startDateVal,
    end_date: endDateVal,
    start: allDay ? '' : document.getElementById("evModalStart").value,
    end: allDay ? '' : document.getElementById("evModalEnd").value,
    description: document.getElementById("evModalDesc").value,
    location: document.getElementById("evModalLoc").value,
    color: document.getElementById("evModalColor").value || '',
    reminder_offset: activeReminders.length > 0 ? activeReminders.join(',') : -1,
    source: "local"
  }, readRecurrenceFromUI());

  // Editing one occurrence of a recurring event → ask "this / following / all".
  var master = id ? S.events.find(function (x) { return x.id == id; }) : null;
  if (master && master.recurrence && master.recurrence !== 'none' && editingOccurrenceDate) {
    var scope = await promptRecurrenceScope('Edit recurring event', true);
    if (!scope) return; // cancelled — leave the editor open
    var occ = editingOccurrenceDate;
    editingOccurrenceDate = null;
    window.dispatchEvent(new CustomEvent('close-event-modal'));
    await applyRecurringEdit(scope, master, occ, data, refresh);
    return;
  }

  window.dispatchEvent(new CustomEvent('close-event-modal'));

  var tempId = null;
  if (id) {
    var eIdx = S.events.findIndex(function(x) { return x.id == id; });
    if (eIdx !== -1) {
      S.events[eIdx] = Object.assign({}, S.events[eIdx], data);
    }
  } else {
    tempId = 'temp_' + Date.now();
    var tempEvent = Object.assign({ id: tempId }, data);
    S.events.push(tempEvent);
  }

  renderPlanner();
  renderDashboard();

  try {
    if (id) {
      await api("PUT", "/api/events/" + id, data);
    } else {
      var res = await api("POST", "/api/events", data);
      var tempIdx = S.events.findIndex(function(x) { return x.id === tempId; });
      if (tempIdx !== -1) {
        if (res && res.id) {
          S.events[tempIdx].id = res.id;
        } else {
          if(refresh) await refresh(); else if(plannerRefresh) await plannerRefresh();
          return;
        }
      }
    }
    if(refresh) refresh(); else if(plannerRefresh) plannerRefresh();
  } catch (err) {
    console.error("Failed to save event:", err);
    if(refresh) await refresh(); else if(plannerRefresh) await plannerRefresh();
  }
}

export async function delEventModal(refresh) {
  var id = document.getElementById("evModalId").value;
  if (!id) return;
  window.dispatchEvent(new CustomEvent('close-event-modal'));

  var eventToDelete = S.events.find(function(x) { return x.id == id; });
  if (eventToDelete) {
    var deletedEvent = Object.assign({}, eventToDelete);
    var postData = Object.assign({}, deletedEvent);
    delete postData.virtualDate;
    delete postData._left;
    delete postData._width;

    var undoCallback = async function() {
      S.events.push(deletedEvent);
      renderPlanner();
      renderDashboard();
      try {
        var res = await api("POST", "/api/events", postData);
        if (res && res.id) {
          var idx = S.events.findIndex(function(x) { return x.id === deletedEvent.id; });
          if (idx !== -1) {
            S.events[idx].id = res.id;
          }
        }
        if (refresh) refresh(); else if (plannerRefresh) plannerRefresh();
      } catch(err) {
        console.error("Undo delete failed:", err);
        if (refresh) await refresh(); else if (plannerRefresh) await plannerRefresh();
      }
    };
    showUndoToast("Event deleted", undoCallback);
  }

  S.events = S.events.filter(function(x) { return x.id != id; });
  renderPlanner();
  renderDashboard();

  try {
    await api("DELETE", "/api/events/" + id);
    if(refresh) refresh(); else if(plannerRefresh) plannerRefresh();
  } catch (err) {
    console.error("Failed to delete event:", err);
    if(refresh) await refresh(); else if(plannerRefresh) await plannerRefresh();
  }
}

window.addEventListener('open-shortcuts-modal', function() {
  document.querySelectorAll('.shortcut-input').forEach(function(input) {
    var action = input.getAttribute('data-action');
    if (action && shortcuts[action] !== undefined) {
      input.value = shortcuts[action];
    }
  });
});

export function saveShortcuts() {
  var newShortcuts = {};
  var duplicate = false;
  var keysSeen = {};
  
  document.querySelectorAll('.shortcut-input').forEach(function(input) {
    var action = input.getAttribute('data-action');
    var val = input.value.trim();
    if (action && val) {
      newShortcuts[action] = val;
      if (keysSeen[val]) {
        duplicate = true;
      }
      keysSeen[val] = true;
    }
  });
  
  if (duplicate) {
    alert("Warning: Multiple actions are assigned to the same key! Please resolve duplicates before saving.");
    return;
  }
  
  shortcuts = Object.assign({}, defaultShortcuts, newShortcuts);
  try {
    localStorage.setItem('tylo_shortcuts', JSON.stringify(shortcuts));
  } catch(e) {}
  
  window.dispatchEvent(new CustomEvent('close-shortcuts-modal'));
}

export async function resetShortcutsToDefault() {
  if (await askConfirm("Reset all shortcuts to defaults?", { okText: "Reset" })) {
    shortcuts = Object.assign({}, defaultShortcuts);
    try {
      localStorage.removeItem('tylo_shortcuts');
    } catch(e) {}
    
    document.querySelectorAll('.shortcut-input').forEach(function(input) {
      var action = input.getAttribute('data-action');
      if (action && shortcuts[action] !== undefined) {
        input.value = shortcuts[action];
      }
    });
  }
}

function showUndoToast(message, undoCallback) {
  var existing = document.getElementById('undoToast');
  if (existing) {
    existing.remove();
  }
  if (undoToastTimeout) {
    clearTimeout(undoToastTimeout);
  }

  currentUndoAction = undoCallback;

  var toastEl = document.createElement("div");
  toastEl.id = "undoToast";
  toastEl.className = "toast";
  toastEl.style.display = "flex";
  toastEl.style.alignItems = "center";
  toastEl.style.gap = "12px";
  
  toastEl.innerHTML = '<span>' + esc(message) + '</span>' +
                      '<button class="btn small" style="padding:2px 8px; font-size:11px; background:var(--accent); color:#fff; border:none; border-radius:4px; cursor:pointer;" onclick="triggerUndo()">Undo</button>';
                      
  document.body.appendChild(toastEl);
  
  undoToastTimeout = setTimeout(function() {
    toastEl.remove();
    currentUndoAction = null;
  }, 6000);
}

window.triggerUndo = function() {
  if (currentUndoAction) {
    currentUndoAction();
    currentUndoAction = null;
  }
  var toastEl = document.getElementById('undoToast');
  if (toastEl) {
    toastEl.remove();
  }
};

export function searchEvents() {
  var q = document.getElementById("plannerSearch").value.trim().toLowerCase();
  var resultsDiv = document.getElementById("plannerSearchResults");
  if (!resultsDiv) return;
  
  if (!q) {
    resultsDiv.style.display = "none";
    resultsDiv.innerHTML = "";
    return;
  }
  
  var matches = S.events.filter(function(e) {
    return (e.title || "").toLowerCase().indexOf(q) !== -1 || 
           (e.location || "").toLowerCase().indexOf(q) !== -1 ||
           (e.description || "").toLowerCase().indexOf(q) !== -1;
  });
  
  matches.sort(function(a, b) {
    var da = a.date || "";
    var db = b.date || "";
    if (da !== db) return db.localeCompare(da);
    return (a.start || "").localeCompare(b.start || "");
  });
  
  if (matches.length === 0) {
    resultsDiv.innerHTML = '<div style="padding:8px 12px; font-size:12px; color:var(--muted);">No matching events</div>';
  } else {
    var html = "";
    matches.slice(0, 20).forEach(function(e) {
      var dateStr = e.date;
      try {
        var d = new Date(e.date + 'T00:00:00');
        if (isNaN(d.getTime())) d = new Date(e.date);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
      } catch(err){}
      var timeStr = (e.start && e.end) ? e.start + ' – ' + e.end : 'All Day';
      var locStr = e.location ? ' 📍 ' + e.location : '';
      
      html += '<div class="search-result-item" style="padding:8px 12px; cursor:pointer; border-bottom:1px solid var(--border); transition:background 0.2s;" ' +
              'onclick="navigateToAndEditEvent(\'' + e.id + '\', \'' + e.date + '\', false)">' +
              '<div style="font-weight:600; font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(e.title) + '</div>' +
              '<div style="font-size:11px; color:var(--muted); margin-top:2px;">' + dateStr + ' • ' + timeStr + esc(locStr) + '</div>' +
              '</div>';
    });
    resultsDiv.innerHTML = html;
  }
  resultsDiv.style.display = "block";
}

export function handlePlannerSearchKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    var resultsDiv = document.getElementById("plannerSearchResults");
    if (resultsDiv && resultsDiv.style.display !== "none") {
      var firstItem = resultsDiv.querySelector(".search-result-item");
      if (firstItem) {
        firstItem.click();
      }
    }
  }
}

export function hideSearchSoon() {
  setTimeout(function() {
    var resultsDiv = document.getElementById("plannerSearchResults");
    if (resultsDiv) resultsDiv.style.display = "none";
  }, 200);
}

// ---------------------------------------------------------------------------
// Natural-language quick-add. Hand-rolled (no NLP dep): pull a date, time(s),
// duration and location out of a free-text line; the rest becomes the title.
// Best-effort — it pre-fills the Add-Event modal so the user can confirm.
// ---------------------------------------------------------------------------
function parseQuickAdd(text) {
  var out = { title: '', date: '', start: '', end: '', location: '', allDay: false };
  var raw = String(text || '').trim();
  if (!raw) return out;
  var rest = ' ' + raw + ' ';

  function cut(re) {
    var m = rest.match(re);
    if (m) rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
    return m;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function to24(h, m, ap) {
    h = parseInt(h, 10); m = m ? parseInt(m, 10) : 0;
    ap = ap ? ap.toLowerCase() : '';
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23) h = 23; if (m > 59) m = 59;
    return pad(h) + ':' + pad(m);
  }
  function addMin(hhmm, mins) {
    var t = parseInt(hhmm.slice(0, 2), 10) * 60 + parseInt(hhmm.slice(3), 10) + mins;
    t = Math.max(0, Math.min(1439, t));
    return pad(Math.floor(t / 60)) + ':' + pad(t % 60);
  }

  // Location: "@place"
  var at = cut(/\s@\s?(\S+)/);
  if (at) out.location = at[1];

  // Time range: "9-11am", "9:00-11:30", "from 9 to 11pm"
  var range = cut(/\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (range) {
    var ap1 = range[3], ap2 = range[6];
    if (!ap1 && ap2) ap1 = ap2;
    if (!ap2 && ap1) ap2 = ap1;
    out.start = to24(range[1], range[2], ap1);
    out.end = to24(range[4], range[5], ap2);
  } else {
    var t = cut(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || cut(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
    if (t) out.start = to24(t[1], t[2], t[3]);
    else if (cut(/\bnoon\b/i)) out.start = '12:00';
    else if (cut(/\bmidnight\b/i)) out.start = '00:00';
    if (out.start) out.end = addMin(out.start, 60);
  }

  // Duration override ("for 2h", "90 min")
  var dur = cut(/\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minutes)\b/i) || cut(/\b(\d+)\s*(min|mins|minutes)\b/i);
  if (dur && out.start) {
    var n = parseFloat(dur[1]); var unit = dur[2].toLowerCase();
    out.end = addMin(out.start, (unit.charAt(0) === 'h') ? Math.round(n * 60) : Math.round(n));
  }

  // Date
  var now = new Date();
  var dabbr = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function fromToday(days) { var d = new Date(now); d.setDate(d.getDate() + days); return toISO(d); }
  var dm;
  if (cut(/\btoday\b/i)) out.date = toISO(now);
  else if (cut(/\btomorrow\b/i)) out.date = fromToday(1);
  else if ((dm = cut(/\bin\s+(\d+)\s+days?\b/i))) out.date = fromToday(parseInt(dm[1], 10));
  else if ((dm = cut(/\b(next\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i))) {
    var target = dabbr.indexOf(dm[2].toLowerCase().slice(0, 3));
    var delta = (target - now.getDay() + 7) % 7;
    if (dm[1]) delta += 7; // "next" → following week
    out.date = fromToday(delta);
  }
  else if ((dm = cut(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i)) ||
           (dm = cut(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\b/i))) {
    var mo, day;
    if (/^\d/.test(dm[1])) { day = parseInt(dm[1], 10); mo = months.indexOf(dm[2].toLowerCase().slice(0, 3)); }
    else { mo = months.indexOf(dm[1].toLowerCase().slice(0, 3)); day = parseInt(dm[2], 10); }
    var d3 = new Date(now.getFullYear(), mo, day);
    if (d3 < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d3.setFullYear(now.getFullYear() + 1);
    out.date = toISO(d3);
  }
  else if ((dm = cut(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    var yr = dm[3] ? parseInt(dm[3], 10) : now.getFullYear();
    if (yr < 100) yr += 2000;
    out.date = toISO(new Date(yr, parseInt(dm[2], 10) - 1, parseInt(dm[1], 10))); // day/month (European)
  }
  if (!out.date) out.date = toISO(now);

  // Trailing room-code as location (e.g. "Eg-350") when no @ was given
  if (!out.location) {
    var room = cut(/\b([A-Za-z]{1,4}-\d{2,4}[A-Za-z]?)\b/);
    if (room) out.location = room[1];
  }

  out.title = rest.replace(/\s+/g, ' ').trim();
  out.allDay = !out.start;
  return out;
}

export function quickAddOpen(text) {
  var p = parseQuickAdd(text);
  if (!p.title) return;
  openAdd(p.date, p.start, p.end);
  document.getElementById('evModalTitle').value = p.title;
  document.getElementById('evModalLoc').value = p.location || '';
  if (p.allDay) {
    document.getElementById('evModalAllDay').checked = true;
    updateAllDayVisibility();
  }
  updateDurationFromTimes();
}

export function handleQuickAddKeydown(ev) {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    var v = ev.target.value.trim();
    if (v) { quickAddOpen(v); ev.target.value = ''; }
  }
}

// Set the module's dateOffset so the given date is in view for the current
// view (month / week / N-day). Shared by search-navigation and the toolbar's
// go-to-date picker.
function setDateOffsetForDate(date) {
  var now = new Date();
  var target = new Date(date + 'T00:00:00');
  if (isNaN(target.getTime())) {
    target = new Date(date);
  }

  if (currentView === 'month') {
    dateOffset = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  } else {
    var days = parseInt(currentView, 10) || 7;
    if (days === 7) {
      var dow = (now.getDay() + 6) % 7;
      var currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
      currentMonday.setHours(0,0,0,0);

      var targetDow = (target.getDay() + 6) % 7;
      var targetMonday = new Date(target.getFullYear(), target.getMonth(), target.getDate() - targetDow);
      targetMonday.setHours(0,0,0,0);

      dateOffset = Math.round((targetMonday - currentMonday) / (7 * 24 * 60 * 60 * 1000));
    } else {
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      todayStart.setHours(0,0,0,0);
      var targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
      targetStart.setHours(0,0,0,0);
      var diffDays = Math.round((targetStart - todayStart) / (24 * 60 * 60 * 1000));
      dateOffset = Math.floor(diffDays / days);
    }
  }
}

// Toolbar go-to-date: jump the planner to an arbitrary date (Google's
// mini-calendar equivalent). Resets the saved scroll so the new range scrolls
// to the morning like a fresh navigation.
export function goToDate(iso) {
  if (!iso) return;
  setDateOffsetForDate(iso);
  lastScrollTop = null;
  renderPlanner();
}

export function navigateToAndEditEvent(id, date, openEditor) {
  var tabBtn = document.querySelector('#tabs button[data-tab="planner"]');
  if (tabBtn) {
    tabBtn.click();
  }

  setDateOffsetForDate(date);

  renderPlanner();
  // Search just jumps to the event and flags it; it does NOT open the editor.
  // The dashboard still passes openEditor !== false to open it directly.
  if (openEditor !== false) {
    editEvent(id);
  } else {
    highlightEvent(id);
  }

  var resultsDiv = document.getElementById("plannerSearchResults");
  if (resultsDiv) resultsDiv.style.display = "none";
  var searchInput = document.getElementById("plannerSearch");
  if (searchInput) searchInput.value = "";
}

// Briefly pulse an event (after navigating to it from search) and scroll it
// into view, so the user can spot it without the editor popping open.
function highlightEvent(id) {
  setTimeout(function () {
    var el = document.querySelector('.event[data-id="' + id + '"]');
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    el.classList.add('event-flash');
    setTimeout(function () { el.classList.remove('event-flash'); }, 1600);
  }, 80);
}

// ---------------------------------------------------------------------------
// Lightweight popovers: a Google-style quick read view on event click, and the
// month-view "+N more" day list. One floating element, repositioned per anchor.
// ---------------------------------------------------------------------------
var _popoverEl = null;

export function closeEventPopover() {
  if (_popoverEl) { _popoverEl.remove(); _popoverEl = null; }
  document.removeEventListener('mousedown', _onPopoverOutside, true);
  document.removeEventListener('keydown', _onPopoverEsc, true);
}
function _onPopoverOutside(e) {
  if (_popoverEl && !_popoverEl.contains(e.target)) closeEventPopover();
}
function _onPopoverEsc(e) { if (e.key === 'Escape') closeEventPopover(); }

function openPopover(anchorEl, innerHtml) {
  closeEventPopover();
  var pop = document.createElement('div');
  pop.className = 'cal-popover';
  pop.innerHTML = innerHtml;
  document.body.appendChild(pop);
  _popoverEl = pop;
  // Position next to the anchor, flipping/clamping to stay on screen.
  var r = anchorEl.getBoundingClientRect();
  var pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 8;
  var left = r.right + gap;
  if (left + pw > window.innerWidth - 8) left = r.left - pw - gap;
  if (left < 8) left = Math.min(Math.max(8, r.left), window.innerWidth - pw - 8);
  var top = r.top;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  if (top < 8) top = 8;
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
  // Defer the outside-click listener so the opening click doesn't close it.
  setTimeout(function () {
    document.addEventListener('mousedown', _onPopoverOutside, true);
    document.addEventListener('keydown', _onPopoverEsc, true);
  }, 0);
  return pop;
}

function fmtDateLabel(iso) {
  var d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function recurrenceLabel(e) {
  if (!e.recurrence || e.recurrence === 'none') return '';
  var interval = Math.max(1, parseInt(e.recurrence_interval, 10) || 1);
  var unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[e.recurrence] || e.recurrence;
  var base = interval === 1 ? ('Every ' + unit) : ('Every ' + interval + ' ' + unit + 's');
  if (e.recurrence === 'weekly') {
    var days = parseRecDays(e.recurrence_days);
    if (days.length) {
      var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      base += ' on ' + days.sort(function (a, b) { return a - b; }).map(function (d) { return names[d]; }).join(', ');
    }
  }
  if (e.recurrence_count != null && String(e.recurrence_count) !== '') base += ', ' + e.recurrence_count + '×';
  else if (e.recurrence_until) base += ' until ' + e.recurrence_until;
  return base;
}

// Google Calendar-style right-click menu on events. Delegated on the tab so it
// survives every re-render; set up once from renderPlanner().
function initPlannerContextMenu() {
  var tab = document.getElementById('tab-planner');
  if (!tab || tab.dataset.ctxInitialized) return;
  tab.dataset.ctxInitialized = 'true';
  tab.addEventListener('contextmenu', function (ev) {
    var el = ev.target.closest && ev.target.closest('.event[data-id], .month-event[data-id]');
    if (!el) return;
    var id = el.getAttribute('data-id');
    var e = S.events.find(function (x) { return x.id === id; });
    if (!e) return;
    var occ = el.getAttribute('data-occ') || e.date;
    closeEventPopover();
    showContextMenu(ev, [
      { label: 'Edit', icon: '✏️', onClick: function () { editEvent(id, occ); } },
      { label: 'Duplicate', icon: '📋', onClick: function () { duplicateEvent(id); } },
      { sep: true },
      { label: 'Delete', icon: '✕', danger: true, onClick: function () { deleteEventById(id, occ); } }
    ]);
  });
}

export function showEventPopover(id, anchorEl) {
  if (isResizing || justTouchDragged) return;
  var e = S.events.find(function (x) { return x.id === id; });
  if (!e) return;
  // The clicked occurrence date (recurring events render one element per
  // instance, tagged with data-occ); falls back to the event's own date.
  var occ = (anchorEl && anchorEl.getAttribute && anchorEl.getAttribute('data-occ')) || e.date;
  var typeClass = esc(e.source && e.source.startsWith('ics') ? e.source : (e.type || 'other'));
  var timeStr = (e.start && e.end) ? esc(e.start) + ' – ' + esc(e.end) : 'All day';
  var rep = recurrenceLabel(e);
  var dotStyle = (e.color && /^#[0-9a-fA-F]{3,8}$/.test(e.color)) ? ' style="background:' + e.color + '"' : '';
  var html =
    '<div class="cal-popover-head">' +
      '<span class="cal-popover-dot ' + typeClass + '"' + dotStyle + '></span>' +
      '<div class="cal-popover-title">' + esc(e.title || '(no title)') + '</div>' +
      '<button class="cal-popover-x" aria-label="Close" onclick="closeEventPopover()">✕</button>' +
    '</div>' +
    '<div class="cal-popover-meta">' + esc(fmtDateLabel(occ)) + ' · ' + timeStr + '</div>' +
    (e.location ? '<div class="cal-popover-row">📍 ' + esc(e.location) + '</div>' : '') +
    (rep ? '<div class="cal-popover-row">🔄 ' + esc(rep) + '</div>' : '') +
    (e.description ? '<div class="cal-popover-desc">' + esc(e.description) + '</div>' : '') +
    '<div class="cal-popover-actions">' +
      '<button class="btn ghost small" onclick="closeEventPopover(); editEvent(\'' + e.id + '\', \'' + occ + '\')">Edit</button>' +
      '<button class="btn ghost small" onclick="duplicateEvent(\'' + e.id + '\')">Duplicate</button>' +
      '<button class="btn danger small" onclick="deleteEventById(\'' + e.id + '\', \'' + occ + '\')">Delete</button>' +
    '</div>';
  openPopover(anchorEl, html);
}

// All non-hidden event instances + due tasks for a single day (used by the
// month "+N more" popover).
function getDayItems(iso) {
  var hiddenTypes = [];
  if (SET && SET.calendar_hidden_types) { try { hiddenTypes = JSON.parse(SET.calendar_hidden_types); } catch (e) {} }
  var evs = [];
  S.events.forEach(function (e) {
    var eType = (e.source && e.source.startsWith('ics')) ? e.source : e.type;
    if (hiddenTypes.indexOf(eType) !== -1) return;
    getInstances(e, iso, iso).forEach(function (inst) { if (inst.virtualDate === iso) evs.push(inst); });
  });
  evs.sort(function (a, b) { return (a.start || '').localeCompare(b.start || ''); });
  var tasks = S.tasks ? S.tasks.filter(function (t) { return t.due === iso && !t.done; }) : [];
  return { evs: evs, tasks: tasks };
}

export function showDayPopover(iso, anchorEl) {
  var items = getDayItems(iso);
  var rows = '';
  items.tasks.forEach(function (t) {
    rows += '<div class="cal-day-row" onclick="toggleTask(\'' + t.id + '\', true)">' +
            '<span class="cal-popover-dot ics"></span><span class="cal-day-title">☑ ' + esc(t.name) + '</span></div>';
  });
  items.evs.forEach(function (e) {
    var tcls = esc(e.source && e.source.startsWith('ics') ? e.source : (e.type || 'other'));
    var tm = (e.start) ? esc(e.start) : 'All day';
    rows += '<div class="cal-day-row" data-occ="' + (e._occDate || e.virtualDate || e.date) + '" onclick="showEventPopover(\'' + e.id + '\', this)">' +
            '<span class="cal-popover-dot ' + tcls + '"></span>' +
            '<span class="cal-day-time">' + tm + '</span>' +
            '<span class="cal-day-title">' + esc(e.title) + '</span></div>';
  });
  if (!rows) rows = '<div class="cal-popover-row muted">No events</div>';
  var html =
    '<div class="cal-popover-head">' +
      '<div class="cal-popover-title">' + esc(fmtDateLabel(iso)) + '</div>' +
      '<button class="cal-popover-x" aria-label="Close" onclick="closeEventPopover()">✕</button>' +
    '</div>' +
    '<div class="cal-day-list">' + rows + '</div>' +
    '<div class="cal-popover-actions"><button class="btn ghost small" onclick="closeEventPopover(); openAdd(\'' + iso + '\')">+ Add event</button></div>';
  openPopover(anchorEl, html);
}

export async function duplicateEvent(id) {
  closeEventPopover();
  var e = S.events.find(function (x) { return x.id === id; });
  if (!e) return;
  var copy = {
    date: e.date, start: e.start, end: e.end, end_date: e.end_date, title: (e.title || '') + ' (copy)',
    type: e.type, description: e.description, location: e.location,
    recurrence: e.recurrence, recurrence_until: e.recurrence_until, recurrence_interval: e.recurrence_interval,
    recurrence_days: e.recurrence_days, recurrence_count: e.recurrence_count, reminder_offset: e.reminder_offset,
    color: e.color || ''
  };
  try {
    await api('POST', '/api/events', copy);
    if (plannerRefresh) await plannerRefresh();
    renderDashboard();
  } catch (err) { console.error('Duplicate failed:', err); }
}

export async function deleteEventById(id, occDate) {
  closeEventPopover();
  var e = S.events.find(function (x) { return x.id === id; });
  if (e && e.recurrence && e.recurrence !== 'none') {
    var scope = await promptRecurrenceScope('Delete recurring event', true);
    if (!scope) return;
    await applyRecurringDelete(scope, e, occDate || e.date);
    return;
  }
  if (!await askConfirm('Delete this event?', { title: 'Delete event', okText: 'Delete', danger: true })) return;
  try {
    await api('DELETE', '/api/events/' + id);
    if (plannerRefresh) await plannerRefresh();
    renderDashboard();
  } catch (err) { console.error('Delete failed:', err); }
}

// ---- Recurring-event scope: "this / this and following / all" ----

function dayBeforeISO(iso) {
  var d = parseLocalDate(iso);
  d.setDate(d.getDate() - 1);
  return toISO(d);
}
function addExcludedDate(csv, iso) {
  var set = parseExcluded(csv);
  set[iso] = true;
  return Object.keys(set).sort().join(',');
}

// Native <dialog> so it stacks above the (also-<dialog>) event modal in the top
// layer. Resolves 'this' | 'following' | 'all' | null (cancelled).
function promptRecurrenceScope(actionLabel, withFollowing) {
  return new Promise(function (resolve) {
    var dlg = document.createElement('dialog');
    dlg.className = 'modal scope-modal';
    var btns = '<button class="btn" data-scope="this">This event</button>';
    if (withFollowing !== false) btns += '<button class="btn" data-scope="following">This and following events</button>';
    btns += '<button class="btn" data-scope="all">All events</button>';
    btns += '<button class="btn ghost" data-scope="">Cancel</button>';
    dlg.innerHTML =
      '<div class="modal-content" style="max-width:340px; width:90%;">' +
        '<h3 style="margin-bottom:6px; font-size:16px; font-weight:700;">' + esc(actionLabel) + '</h3>' +
        '<p class="muted" style="font-size:13px; margin:0 0 14px;">Apply to:</p>' +
        '<div style="display:flex; flex-direction:column; gap:8px;">' + btns + '</div>' +
      '</div>';
    document.body.appendChild(dlg);
    function done(val) { try { dlg.close(); } catch (e) {} dlg.remove(); resolve(val || null); }
    dlg.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-scope]');
      if (b) { ev.preventDefault(); done(b.getAttribute('data-scope')); }
      else if (ev.target === dlg) done(null);
    });
    dlg.addEventListener('cancel', function (ev) { ev.preventDefault(); done(null); });
    dlg.showModal();
  });
}

// These optimistically mutate S first (so the view is correct immediately,
// independent of incremental-sync timing), then persist and fire a reconciling
// sync — the same pattern the move/save/delete handlers use. Newly created
// override/series events are added with a temp id, swapped for the real id once
// the POST returns.
function _eventIdx(id) { return S.events.findIndex(function (x) { return x.id == id; }); }

async function applyRecurringEdit(scope, master, occDate, data, refresh) {
  var doRefresh = function () { if (refresh) return refresh(); if (plannerRefresh) return plannerRefresh(); };
  var idx = _eventIdx(master.id);
  var excluded = addExcludedDate(master.excluded_dates, occDate);
  try {
    if (scope === 'all') {
      var allData = Object.assign({}, data, { date: master.date });
      if (idx !== -1) S.events[idx] = Object.assign({}, S.events[idx], allData);
      renderPlanner(); renderDashboard();
      await api('PUT', '/api/events/' + master.id, allData);
    } else if (scope === 'this') {
      if (idx !== -1) S.events[idx] = Object.assign({}, S.events[idx], { excluded_dates: excluded });
      var override = Object.assign({}, data, { recurrence: 'none', recurrence_interval: 1, recurrence_days: '', recurrence_until: '', recurrence_count: null });
      var tempA = 'temp_' + Date.now();
      S.events.push(Object.assign({ id: tempA }, override));
      renderPlanner(); renderDashboard();
      await api('PUT', '/api/events/' + master.id, { excluded_dates: excluded });
      var ra = await api('POST', '/api/events', override);
      var ia = _eventIdx(tempA);
      if (ia !== -1 && ra && ra.id) S.events[ia].id = ra.id;
    } else if (scope === 'following') {
      if (idx !== -1) S.events[idx] = Object.assign({}, S.events[idx], { recurrence_until: dayBeforeISO(occDate), recurrence_count: null });
      var newSeries = Object.assign({}, data, { recurrence_count: null });
      var tempB = 'temp_' + Date.now();
      S.events.push(Object.assign({ id: tempB }, newSeries));
      renderPlanner(); renderDashboard();
      await api('PUT', '/api/events/' + master.id, { recurrence_until: dayBeforeISO(occDate), recurrence_count: null });
      var rb = await api('POST', '/api/events', newSeries);
      var ib = _eventIdx(tempB);
      if (ib !== -1 && rb && rb.id) S.events[ib].id = rb.id;
    }
    if (plannerRefresh) plannerRefresh();
  } catch (err) {
    console.error('Recurring edit failed:', err);
    await doRefresh();
  }
}

async function applyRecurringDelete(scope, master, occDate) {
  var idx = _eventIdx(master.id);
  try {
    if (scope === 'all') {
      if (idx !== -1) S.events.splice(idx, 1);
      renderPlanner(); renderDashboard();
      await api('DELETE', '/api/events/' + master.id);
    } else if (scope === 'this') {
      var ex = addExcludedDate(master.excluded_dates, occDate);
      if (idx !== -1) S.events[idx] = Object.assign({}, S.events[idx], { excluded_dates: ex });
      renderPlanner(); renderDashboard();
      await api('PUT', '/api/events/' + master.id, { excluded_dates: ex });
    } else if (scope === 'following') {
      if (idx !== -1) S.events[idx] = Object.assign({}, S.events[idx], { recurrence_until: dayBeforeISO(occDate), recurrence_count: null });
      renderPlanner(); renderDashboard();
      await api('PUT', '/api/events/' + master.id, { recurrence_until: dayBeforeISO(occDate), recurrence_count: null });
    }
    if (plannerRefresh) plannerRefresh();
  } catch (err) { console.error('Recurring delete failed:', err); if (plannerRefresh) await plannerRefresh(); }
}

// Drag a recurring occurrence to a new slot. `data` holds the drop target's
// {date, start?, end?}. 'this' detaches it; 'all' shifts the whole series.
async function applyRecurringMove(scope, master, occDate, data) {
  var idx = _eventIdx(master.id);
  try {
    if (scope === 'all') {
      var deltaDays = Math.round((parseLocalDate(data.date) - parseLocalDate(occDate)) / 86400000);
      var upd = { date: toISO(addDays(parseLocalDate(master.date), deltaDays)) };
      if (data.start) upd.start = data.start;
      if (data.end) upd.end = data.end;
      if (idx !== -1) S.events[idx] = Object.assign({}, S.events[idx], upd);
      renderPlanner(); renderDashboard();
      await api('PUT', '/api/events/' + master.id, upd);
    } else if (scope === 'this') {
      var exm = addExcludedDate(master.excluded_dates, occDate);
      if (idx !== -1) S.events[idx] = Object.assign({}, S.events[idx], { excluded_dates: exm });
      var ov = {
        date: data.date, start: data.start || master.start, end: data.end || master.end,
        title: master.title, type: master.type, description: master.description, location: master.location,
        recurrence: 'none', reminder_offset: master.reminder_offset, source: 'local'
      };
      var tempM = 'temp_' + Date.now();
      S.events.push(Object.assign({ id: tempM }, ov));
      renderPlanner(); renderDashboard();
      await api('PUT', '/api/events/' + master.id, { excluded_dates: exm });
      var rm = await api('POST', '/api/events', ov);
      var im = _eventIdx(tempM);
      if (im !== -1 && rm && rm.id) S.events[im].id = rm.id;
    }
    if (plannerRefresh) plannerRefresh();
  } catch (err) { console.error('Recurring move failed:', err); if (plannerRefresh) await plannerRefresh(); }
}

function preventDefaultTouchMove(e) {
  e.preventDefault();
}

function updateTouchDrag(ev) {
  if (!isTouchDragging || !draggingEventId) return;
  
  var targetEl = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!targetEl) return;
  
  var col = targetEl.closest(currentView === 'month' ? ".month-cell" : ".day-col");
  
  document.querySelectorAll('.day-col, .month-cell').forEach(function(c) {
    if (c !== col) c.classList.remove('drag-over');
  });
  
  if (col) {
    col.classList.add('drag-over');
    var e = S.events.find(function(x) { return x.id == draggingEventId; });
    if (e) {
      if (e.start && e.end && currentView !== 'month') {
        var tgc = col.querySelector('.time-grid-content');
        if (tgc) {
          var rect = tgc.getBoundingClientRect();
          var y = ev.clientY - rect.top - draggingOffsetY;
          var dur = parseTime(e.end) - parseTime(e.start);
          var startMin = Math.max(0, Math.round(y / 15) * 15);
          var endMin = startMin + dur;
          var sh = Math.floor(startMin / 60); var sm = startMin % 60;
          var eh = Math.floor(endMin / 60); var em = endMin % 60;
          if (eh >= 24) { eh = 23; em = 59; }
          var startStr = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
          var endStr = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);
          
          if (!dragPreviewEl) {
            var sourceEl = document.querySelector('.event[data-id="' + draggingEventId + '"]');
            dragPreviewEl = document.createElement('div');
            dragPreviewEl.className = sourceEl ? sourceEl.className : 'event absolute';
            dragPreviewEl.classList.add('dragging-preview');
            dragPreviewEl.classList.remove('drag-source');
            dragPreviewEl.classList.remove('dragging');
            dragPreviewEl.style.height = dur + 'px';
            dragPreviewEl.style.position = 'absolute';
            dragPreviewEl.style.pointerEvents = 'none';
            dragPreviewEl.style.zIndex = '50';
            dragPreviewEl.style.opacity = '0.8';
            
            var title = e.title || '';
            var repeatIcon = (e.recurrence && e.recurrence !== 'none') ? ' 🔄' : '';
            var hasLoc = e.location && e.location.trim() !== '';
            var locStr = hasLoc ? esc(e.location.trim()) : '';
            var timeStr = startStr + ' – ' + endStr;
            var titleHtml = '<div class="event-title">' + esc(title) + repeatIcon + '</div>';
            var timeHtml = '<div class="event-time">' + timeStr + '</div>';
            var locHtml = (dur >= 50 && hasLoc) ? '<div class="event-loc">' + locStr + '</div>' : '';
            dragPreviewEl.innerHTML = titleHtml + timeHtml + locHtml;
            tgc.appendChild(dragPreviewEl);
          }
          
          if (dragPreviewEl.parentNode !== tgc) {
            dragPreviewEl.remove();
            tgc.appendChild(dragPreviewEl);
          }
          dragPreviewEl.style.top = startMin + 'px';
          dragPreviewEl.style.left = '0%';
          dragPreviewEl.style.width = 'calc(100% - 2px)';
          
          var timeDiv = dragPreviewEl.querySelector('.event-time');
          if (timeDiv) {
            timeDiv.textContent = startStr + ' – ' + endStr;
          }
        }
      } else {
        var targetContainer = currentView === 'month' ? col : col.querySelector('.all-day-bar');
        if (targetContainer) {
          if (!dragPreviewEl) {
            var sourceEl = document.querySelector('.event[data-id="' + draggingEventId + '"]');
            dragPreviewEl = document.createElement('div');
            dragPreviewEl.className = sourceEl ? sourceEl.className : 'event';
            dragPreviewEl.classList.add('dragging-preview');
            dragPreviewEl.classList.remove('drag-source');
            dragPreviewEl.classList.remove('dragging');
            dragPreviewEl.style.pointerEvents = 'none';
            dragPreviewEl.style.opacity = '0.8';
            dragPreviewEl.innerHTML = sourceEl ? sourceEl.innerHTML : esc(e.title);
            targetContainer.appendChild(dragPreviewEl);
          }
          if (dragPreviewEl.parentNode !== targetContainer) {
            dragPreviewEl.remove();
            targetContainer.appendChild(dragPreviewEl);
          }
        }
      }
    }
  }
  
  var wrapper = document.querySelector('.time-grid-wrapper');
  if (wrapper) {
    var wRect = wrapper.getBoundingClientRect();
    if (ev.clientY < wRect.top + 40) {
      wrapper.scrollTop -= 10;
    } else if (ev.clientY > wRect.bottom - 40) {
      wrapper.scrollTop += 10;
    }
  }
}

async function handleTouchDrop(ev) {
  var targetEl = document.elementFromPoint(ev.clientX, ev.clientY);
  var col = targetEl ? targetEl.closest(currentView === 'month' ? ".month-cell" : ".day-col") : null;
  
  document.querySelectorAll('.day-col, .month-cell').forEach(function(c) {
    c.classList.remove('drag-over');
  });
  
  var id = draggingEventId;
  var iso = col ? col.getAttribute("data-iso") : null;
  
  if (col && id && iso) {
    justTouchDragged = true;
    setTimeout(function() { justTouchDragged = false; }, 100);
    
    var data = { date: iso };
    var e = S.events.find(function(x) { return x.id == id; });
    var originalDate = e ? e.date : null;
    var originalStart = e ? e.start : null;
    var originalEnd = e ? e.end : null;
    
    if (e && e.start && e.end && currentView !== 'month') {
      var tgc = col.querySelector('.time-grid-content');
      if (tgc) {
        var rect = tgc.getBoundingClientRect();
        var y = ev.clientY - rect.top - draggingOffsetY;
        var dur = parseTime(e.end) - parseTime(e.start);
        var startMin = Math.max(0, Math.round(y / 15) * 15);
        var endMin = startMin + dur;
        var sh = Math.floor(startMin / 60); var sm = startMin % 60;
        var eh = Math.floor(endMin / 60); var em = endMin % 60;
        if (eh >= 24) { eh = 23; em = 59; }
        data.start = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
        data.end = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);
      }
    }

    if (e && e.recurrence && e.recurrence !== 'none') {
      if (dragPreviewEl) { dragPreviewEl.remove(); dragPreviewEl = null; }
      var tocc = draggingOccDate || e.date;
      var tscope = await promptRecurrenceScope('Move recurring event', false);
      if (tscope) await applyRecurringMove(tscope, e, tocc, data);
      else renderPlanner();
      return;
    }

    if (e) {
      Object.assign(e, data);
    }

    if (dragPreviewEl) {
      dragPreviewEl.remove();
      dragPreviewEl = null;
    }

    renderPlanner();
    renderDashboard();

    if (e) {
      var undoCallback = async function() {
        var eventToRestore = S.events.find(function(x) { return x.id == id; });
        if (eventToRestore) {
          eventToRestore.date = originalDate;
          eventToRestore.start = originalStart;
          eventToRestore.end = originalEnd;
          renderPlanner();
          renderDashboard();
          try {
            await api("PUT", "/api/events/" + id, { date: originalDate, start: originalStart, end: originalEnd });
            if (plannerRefresh) plannerRefresh();
          } catch(err) {
            console.error("Undo move failed:", err);
            if (plannerRefresh) plannerRefresh();
          }
        }
      };
      showUndoToast("Event moved", undoCallback);
    }

    try {
      await api("PUT", "/api/events/" + id, data);
      if (plannerRefresh) plannerRefresh();
    } catch(err) {
      console.error(err);
      if (plannerRefresh) await plannerRefresh();
    }
  } else {
    if (dragPreviewEl) {
      dragPreviewEl.remove();
      dragPreviewEl = null;
    }
    renderPlanner();
  }
  
  var sourceEl = document.querySelector('.event[data-id="' + id + '"]');
  if (sourceEl) sourceEl.classList.remove('dragging');
  document.body.classList.remove('dragging-move-active');
  draggingEventId = null;
  draggingOffsetY = 0;
}

function attachCellTouchInteractivity(el, iso, isTimeGrid) {
  var lastTapTime = 0;
  var longPressTimer = null;
  var touchStartClientX = 0;
  var touchStartClientY = 0;
  var touchPointerId = null;

  el.addEventListener("pointerdown", function(ev) {
    if (ev.pointerType !== "touch") return;
    if (ev.target.closest('.event')) return;
    
    touchPointerId = ev.pointerId;
    touchStartClientX = ev.clientX;
    touchStartClientY = ev.clientY;
    
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(function() {
      if (navigator.vibrate) navigator.vibrate(20);
      
      var targetTime = null;
      if (isTimeGrid) {
        var rect = el.getBoundingClientRect();
        var y = ev.clientY - rect.top;
        var startMin = Math.max(0, Math.round(y / 15) * 15);
        targetTime = startMin;
      }
      triggerAddEventAt(iso, targetTime);
      cleanup();
    }, 500);
  });

  el.addEventListener("pointermove", function(ev) {
    if (ev.pointerId !== touchPointerId) return;
    
    var dx = ev.clientX - touchStartClientX;
    var dy = ev.clientY - touchStartClientY;
    if (Math.sqrt(dx*dx + dy*dy) > 10) {
      cleanup();
    }
  });

  el.addEventListener("pointerup", function(ev) {
    if (ev.pointerId !== touchPointerId) return;
    
    clearTimeout(longPressTimer);
    
    var currentTime = Date.now();
    var tapDelay = currentTime - lastTapTime;
    
    if (tapDelay < 300) {
      var targetTime = null;
      if (isTimeGrid) {
        var rect = el.getBoundingClientRect();
        var y = ev.clientY - rect.top;
        var startMin = Math.max(0, Math.round(y / 15) * 15);
        targetTime = startMin;
      }
      triggerAddEventAt(iso, targetTime);
      cleanup();
    } else {
      lastTapTime = currentTime;
    }
    
    touchPointerId = null;
  });

  el.addEventListener("pointercancel", function(ev) {
    if (ev.pointerId === touchPointerId) {
      cleanup();
    }
  });

  function cleanup() {
    clearTimeout(longPressTimer);
    touchPointerId = null;
  }
}

function triggerAddEventAt(iso, startMin) {
  if (startMin !== null && startMin !== undefined) {
    var endMin = startMin + 60;
    var sh = Math.floor(startMin / 60); var sm = startMin % 60;
    var eh = Math.floor(endMin / 60); var em = endMin % 60;
    if (eh >= 24) { eh = 23; em = 59; }
    var startStr = (sh < 10 ? '0'+sh : sh) + ':' + (sm < 10 ? '0'+sm : sm);
    var endStr = (eh < 10 ? '0'+eh : eh) + ':' + (em < 10 ? '0'+em : em);
    openAdd(iso, startStr, endStr);
  } else {
    openAdd(iso);
  }
}

function updatePlannerTimeLine() {
  var today = todayStr();
  if (today !== lastRenderToday) {
    lastRenderToday = today;
    renderPlanner();
    return;
  }
  
  var lines = document.querySelectorAll('.current-time-line');
  if (lines.length > 0) {
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    lines.forEach(function(line) {
      line.style.top = nowMin + 'px';
    });
  }
}

setInterval(updatePlannerTimeLine, 15000);

