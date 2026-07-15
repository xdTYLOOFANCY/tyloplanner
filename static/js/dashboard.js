// TyloPlanner — dashboard module.

import { S, habitSet, SET, PRESETS, safeRender } from './state.js';
import { todayStr, fmtShort, esc, daysUntil, api, z, MONTHS, mdToHtml, askConfirm, askPrompt, showContextMenu } from './utils.js';
import { examBadge } from './exams.js';
import { streak } from './habits.js';
import { weekTotals } from './workouts.js';
import { getTaskCategories } from './settings.js';
import { renderStudyTimerWidget } from './study_timer.js';

let isEditMode = false;
let currentLayout = [];
let widgetsData = {};
let saveTimeout = null;
let greetingInterval = null;
let gridInstance = null;
let lastIsMobileRender = null;

// Single source of truth for widget types: name (customizer label), render
// function, and whether it's a togglable singleton (vs. an "add another
// instance" type like Notepad/Mini Chart). Add a widget type here only.
const WIDGET_REGISTRY = {
  deadlines:    { name: 'Next Deadlines',     render: renderDeadlinesWidget,   toggleable: true },
  today_plan:   { name: 'Today\'s Plan',      render: renderTodayPlanWidget,   toggleable: true },
  habits:       { name: 'Habits Today',       render: renderHabitsWidget,      toggleable: true },
  workouts:     { name: 'Training This Week', render: renderWorkoutsWidget,    toggleable: true },
  tasks:        { name: 'Open To-Dos',        render: renderTasksWidget,       toggleable: true },
  shortcuts:    { name: 'Web Shortcuts',      render: renderShortcutsWidget,   toggleable: true },
  quick_add:    { name: 'Quick Add',          render: renderQuickAddWidget,    toggleable: true },
  recent_files: { name: 'Recent Files',       render: renderRecentFilesWidget, toggleable: true },
  study_timer:  { name: 'Study Timer',        render: renderStudyTimerWidget,  toggleable: true },
  quick_notes:  { name: 'Notepad',            render: renderQuickNotesWidget },
  analytics:    { name: 'Mini Chart',         render: renderAnalyticsWidget },
  custom_text:  { name: 'Custom Text',        render: renderCustomTextWidget },
  greeting:     { name: 'Clock',              render: renderGreetingWidget }
};

function saveWidgetsData() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async function() {
    await api("POST", "/api/settings", {
      dashboard_widgets_data: JSON.stringify(widgetsData)
    });
    if (SET) {
      SET.dashboard_widgets_data = JSON.stringify(widgetsData);
    }
  }, 1000);
}

// Layout autosave: every edit (drag, resize, add, remove, reorder) persists
// automatically after a short debounce — there is no separate Save button.
let layoutSaveTimeout = null;

function layoutPayload() {
  return {
    dashboard_desktop_layout: JSON.stringify(currentLayout.map(function(item) {
      return { id: item.id, type: item.type, x: item.x, y: item.y, w: item.w, h: item.h };
    })),
    dashboard_mobile_layout: JSON.stringify(currentLayout.map(function(item) {
      return { id: item.id, type: item.type, x: item.mx, y: item.my, w: item.mw, h: item.mh };
    }))
  };
}

async function persistLayout() {
  var payload = layoutPayload();
  await api("POST", "/api/settings", payload);
  if (SET) {
    SET.dashboard_desktop_layout = payload.dashboard_desktop_layout;
    SET.dashboard_mobile_layout = payload.dashboard_mobile_layout;
  }
}

function scheduleLayoutSave() {
  if (layoutSaveTimeout) clearTimeout(layoutSaveTimeout);
  layoutSaveTimeout = setTimeout(persistLayout, 800);
}

function flushLayoutSave() {
  if (layoutSaveTimeout) {
    clearTimeout(layoutSaveTimeout);
    layoutSaveTimeout = null;
  }
  return persistLayout();
}



function initLayoutAndStyle() {
  
  let desktop = [];
  let mobile = [];
  try {
    if (SET && SET.dashboard_desktop_layout) desktop = JSON.parse(SET.dashboard_desktop_layout);
  } catch(e){}
  try {
    if (SET && SET.dashboard_mobile_layout) mobile = JSON.parse(SET.dashboard_mobile_layout);
  } catch(e){}

  if (!desktop.length || !mobile.length) {
    currentLayout = JSON.parse(JSON.stringify(PRESETS.balanced));
  } else {
    var mobileMap = {};
    mobile.forEach(function(item) {
      var mId = item.id === 'today' ? 'today_plan' : item.id;
      mobileMap[mId] = item;
    });
    
    currentLayout = desktop.map(function(dItem) {
      var dId = dItem.id === 'today' ? 'today_plan' : dItem.id;
      var dType = dItem.type === 'today' ? 'today_plan' : (dItem.type || dId);
      var mItem = mobileMap[dId] || {};
      return {
        id: dId,
        type: dType,
        x: dItem.x,
        y: dItem.y,
        w: dItem.w,
        h: dItem.h,
        mx: mItem.mx !== undefined ? mItem.mx : (mItem.x !== undefined ? mItem.x : dItem.x),
        my: mItem.my !== undefined ? mItem.my : (mItem.y !== undefined ? mItem.y : dItem.y),
        mw: mItem.mw !== undefined ? mItem.mw : (mItem.w !== undefined ? mItem.w : dItem.w),
        mh: mItem.mh !== undefined ? mItem.mh : (mItem.h !== undefined ? mItem.h : dItem.h)
      };
    });
  }
  // ponytail: no compaction on load — widgets stay exactly where the user put them
}

function getFileIcon(mimetype) {
  var mt = mimetype || "";
  if (mt.startsWith("image/")) return "🖼️";
  if (mt === "application/pdf") return "📄";
  if (mt.startsWith("audio/")) return "🎵";
  if (mt.startsWith("video/")) return "🎥";
  if (mt.startsWith("text/")) return "📝";
  if (mt.indexOf("zip") !== -1 || mt.indexOf("tar") !== -1 || mt.indexOf("compressed") !== -1) return "📦";
  return "📎";
}

function renderDeadlinesWidget(id) {
  var wData = id ? (widgetsData[id] || {}) : {};
  var title = wData.title || "Next deadlines";
  var exams = S.exams.filter(function(e) { return daysUntil(e.date) >= 0; })
    .sort(function(a, b) { return a.date.localeCompare(b.date); });
  var html = '<h3>' + esc(title) + '</h3><div class="card-scroll">';
  if (exams.length) exams.forEach(function(e) {
    html += '<div class="list-item"><div class="grow">' + esc(e.name) + '</div>' + examBadge(daysUntil(e.date)) + '</div>'; });
  else html += '<div class="muted">Nothing upcoming.</div>';
  html += '</div>';
  return html;
}

function parseTime(t) {
  if (!t) return 0;
  var parts = t.split(":");
  return parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
}

function renderTodayPlanListHTML(id) {
  var today = todayStr();
  var evs = S.events.filter(function(e) { return e.date === today; })
    .sort(function(a, b) { return (a.start || "").localeCompare(b.start || ""); });
    
  if (!evs.length) {
    return '<div class="muted">Nothing planned today.</div>';
  }
  
  var now = new Date();
  var currentTimeVal = now.getHours() * 60 + now.getMinutes();
  
  var upcomingHtml = '';
  var pastHtml = '';
  
  evs.forEach(function(ev) {
    var timeStr = (ev.start && ev.end) ? ev.start + ' – ' + ev.end : 'All Day';
    var isPast = false;
    var isHappening = false;
    
    if (ev.start && ev.end) {
      var startVal = parseTime(ev.start);
      var endVal = parseTime(ev.end);
      if (currentTimeVal >= endVal) {
        isPast = true;
      } else if (currentTimeVal >= startVal && currentTimeVal < endVal) {
        isHappening = true;
      }
    } else {
      isHappening = true;
    }
    
    var itemStyle = 'cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:8px;';
    if (isPast) {
      itemStyle += 'opacity:0.55;';
    }
    if (ev.type === 'deadline') {
      itemStyle += 'background: rgba(239, 91, 108, 0.15); border-left: 3px solid var(--red); padding-left: 8px;';
    }
    
    var itemHtml = '<div class="list-item" onclick="showDashboardEventDetails(\'' + ev.id + '\')" style="' + itemStyle + '">';
    itemHtml += '<div class="grow" style="display:flex; align-items:center; gap:6px;' + (isPast ? 'text-decoration:line-through; color:var(--text-muted);' : '') + '">';
    if (isHappening) {
      itemHtml += '<span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--accent); flex-shrink:0;" title="Happening now"></span>';
    }
    if (ev.type === 'deadline') {
      itemHtml += '<span class="badge red" style="margin-right: 4px; padding: 1px 4px; font-size: 9px; flex-shrink: 0;">DEADLINE</span>';
    }
    itemHtml += esc(ev.title) + '</div>';
    itemHtml += '<span class="muted" style="font-size:11px;' + (isHappening ? 'color:var(--accent); font-weight:600;' : '') + '">' + esc(timeStr) + '</span>';
    itemHtml += '</div>';
    
    if (isPast) {
      pastHtml += itemHtml;
    } else {
      upcomingHtml += itemHtml;
    }
  });
  
  var html = '';
  if (upcomingHtml) {
    html += '<div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--accent); letter-spacing: 0.8px; margin: 6px 0 6px 0; flex-shrink:0;">Upcoming &amp; Happening</div>';
    html += upcomingHtml;
  }
  if (pastHtml) {
    var marginTop = upcomingHtml ? 'margin-top: 12px;' : '';
    html += '<div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.8px; ' + marginTop + ' margin-bottom: 6px; flex-shrink:0;">Past</div>';
    html += pastHtml;
  }
  return html;
}

export function showDashboardEventDetails(eventId) {
  if (isEditMode) return;
  var ev = S.events.find(x => x.id === eventId);
  if (!ev) return;
  
  document.getElementById("dbEvTitleVal").textContent = ev.title || "Untitled Event";
  
  var dateVal = document.getElementById("dbEvDateVal");
  if (dateVal && ev.date) {
    var d = new Date(ev.date + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      dateVal.textContent = fmtShort(d) + ' ' + d.getFullYear();
    } else {
      dateVal.textContent = ev.date;
    }
  }
  
  var typeVal = document.getElementById("dbEvTypeVal");
  typeVal.textContent = ev.type || "personal";
  var bg = "var(--border)";
  var color = "var(--text)";
  if (ev.type === "study") { bg = "rgba(255, 152, 0, 0.2)"; color = "#ffa726"; }
  else if (ev.type === "class") { bg = "rgba(79, 140, 255, 0.2)"; color = "#29b6f6"; }
  else if (ev.type === "exam" || ev.type === "deadline") { bg = "rgba(239, 91, 108, 0.2)"; color = "var(--red)"; }
  else if (ev.type === "workout") { bg = "rgba(76, 175, 80, 0.2)"; color = "#66bb6a"; }
  typeVal.style.background = bg;
  typeVal.style.color = color;
  
  var timeStr = (ev.start && ev.end) ? ev.start + ' – ' + ev.end : 'All Day';
  document.getElementById("dbEvTimeVal").textContent = timeStr;
  
  var recVal = document.getElementById("dbEvRecVal");
  var recGroup = document.getElementById("dbEvRecGroup");
  if (recVal && recGroup) {
    if (ev.recurrence && ev.recurrence !== 'none') {
      recVal.textContent = ev.recurrence;
      recGroup.style.display = "block";
    } else {
      recGroup.style.display = "none";
    }
  }
  
  var descVal = document.getElementById("dbEvDescVal");
  var descGroup = document.getElementById("dbEvDescGroup");
  if (ev.description) {
    descVal.innerHTML = mdToHtml(ev.description);
    descGroup.style.display = "block";
  } else {
    descGroup.style.display = "none";
  }
  
  var locVal = document.getElementById("dbEvLocVal");
  var locGroup = document.getElementById("dbEvLocGroup");
  if (ev.location) {
    locVal.textContent = ev.location;
    locGroup.style.display = "block";
  } else {
    locGroup.style.display = "none";
  }
  
  var editBtn = document.getElementById("dbEvEditBtn");
  editBtn.onclick = function() {
    window.dispatchEvent(new CustomEvent('close-dashboard-event-modal'));
    window.navigateToAndEditEvent(ev.id, ev.date);
  };
  
  window.dispatchEvent(new CustomEvent('open-dashboard-event-modal'));
}

function renderTodayPlanWidget(id) {
  var wData = id ? (widgetsData[id] || {}) : {};
  var title = wData.title || "Today\u2019s plan";
  return '<h3>' + esc(title) + '</h3><div class="card-scroll">' + renderTodayPlanListHTML(id) + '</div>';
}

function renderHabitsWidget(id) {
  var wData = id ? (widgetsData[id] || {}) : {};
  var title = wData.title || "Habits today";
  var today = todayStr();
  var html = '<h3>' + esc(title) + '</h3><div class="card-scroll">';
  if (S.habits.length) S.habits.forEach(function(h) {
    var on = !!habitSet[h.id + "|" + today];
    html += '<div class="list-item"><span class="hcheck' + (on ? ' on' : '') + '" data-habit-id="' + h.id + '" data-habit-date="' + today + '" onclick="toggleHabit(\'' + h.id + '\',\'' + today + '\')">' + (on ? '\u2713' : '') + '</span><div class="grow">' + esc(h.name) + '</div><span class="badge ' + (streak(h.id) > 0 ? 'green' : 'gray') + '" data-habit-streak="' + h.id + '">' + streak(h.id) + '\uD83D\uDD25</span></div>'; });
  else html += '<div class="muted">No habits yet.</div>';
  html += '</div>';
  return html;
}

function renderWorkoutsWidget(id) {
  var wData = id ? (widgetsData[id] || {}) : {};
  var title = wData.title || "Training this week";
  var t = weekTotals(0);
  var html = '<h3>' + esc(title) + '</h3><div class="wstats">' +
    '<div class="stat"><div class="v">' + t.count + '</div><div class="l">sessions</div></div>' +
    '<div class="stat"><div class="v">' + (Math.round(t.runKm * 10) / 10) + '</div><div class="l">run km</div></div>' +
    '<div class="stat"><div class="v">' + (Math.round(t.bikeKm * 10) / 10) + '</div><div class="l">bike km</div></div>' +
    '<div class="stat"><div class="v">' + (Math.round(t.swimKm * 10) / 10) + '</div><div class="l">swim km</div></div>' +
    '<div class="stat"><div class="v">' + Math.round(t.min) + '</div><div class="l">min</div></div></div>';
  return html;
}

function renderTasksWidget(id) {
  var wData = id ? (widgetsData[id] || {}) : {};
  var title = wData.title || "Open to-dos";
  var open = S.tasks.filter(function(x) { return !x.done && !x.parent_id; });
  var html = '<h3>' + esc(title) + '</h3><div class="card-scroll">';
  if (open.length) open.forEach(function(o) {
    html += '<div class="checkbox-task" data-dashboard-task-id="' + o.id + '"><span class="hcheck' + (o.done ? ' on' : '') + '" data-task-check="' + o.id + '" onclick="toggleTask(\'' + o.id + '\',true)">' + (o.done ? '✓' : '') + '</span><span>' + esc(o.name) + '</span></div>'; });
  else html += '<div class="muted">All clear \u2728</div>';
  html += '</div>';
  return html;
}

function renderShortcutsWidget(id) {
  var wData = id ? (widgetsData[id] || {}) : {};
  var title = wData.title || "Shortcuts";
  var html = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">' +
    '<h3 style="margin:0;">' + esc(title) + '</h3>' +
    '<button class="btn ghost small" onclick="addShortcut()" style="padding:2px 8px; font-size:12px;">+ Add</button>' +
    '</div>' +
    '<div class="card-scroll" style="display:flex; flex-wrap:wrap; gap:12px; justify-content:flex-start; align-content:flex-start;">';
  
  if (S.shortcuts && S.shortcuts.length) {
    var disabled = (SET && SET.disabled_shortcuts) ? SET.disabled_shortcuts.split(',') : [];
    var order = (SET && SET.shortcut_order) ? SET.shortcut_order.split(',') : [];
    var sorted = S.shortcuts.slice().sort(function(a, b) {
      var ia = order.indexOf(a.id);
      var ib = order.indexOf(b.id);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      return ia - ib;
    });

    sorted.forEach(function(s) {
      if (disabled.indexOf(s.id) !== -1) return;
      var domain = '';
      try { domain = new URL(s.url).hostname; } catch(e){}
      var icon = s.icon || ("https://www.google.com/s2/favicons?domain=" + domain + "&sz=64");
      
      html += '<a href="' + esc(s.url) + '" target="_blank" class="shortcut-btn" oncontextmenu="shortcutContextMenu(event, \'' + s.id + '\')" style="width:70px; height:70px; gap:4px; margin:0;">' +
              '<img src="' + esc(icon) + '" alt="" style="width:28px; height:28px;">' +
              '<div class="name" style="font-size:10px;">' + esc(s.name) + '</div>' +
              '</a>';
    });
  } else {
    html += '<div class="muted">No shortcuts.</div>';
  }
  
  html += '</div>';
  return html;
}

function renderQuickAddWidget(id) {
  var wData = id ? (widgetsData[id] || {}) : {};
  var title = wData.title || "Quick Add";
  var today = todayStr();
  var cats = getTaskCategories ? getTaskCategories() : [];
  var catOptions = '<option value="">Category (opt.)</option>';
  cats.forEach(function(c) {
    catOptions += '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
  });

  var html = '<h3>' + esc(title) + '</h3>' +
    '<div class="quick-add-form" style="display:flex; flex-direction:column; gap:8px;">' +
    '  <select class="qa-type-select" onchange="changeQuickAddType(\'' + id + '\', this.value)" style="padding:6px; font-size:13px; border-radius:6px; border:1px solid var(--border); background:var(--panel2); color:var(--text); width:100%;">' +
    '    <option value="event" selected>Event</option>' +
    '    <option value="task">Task</option>' +
    '    <option value="habit">Habit</option>' +
    '    <option value="workout">Workout</option>' +
    '    <option value="exam">Exam</option>' +
    '  </select>' +
    
    '  <!-- Fields for Event -->' +
    '  <div class="qa-fields-group qa-fields-event" style="display:flex; flex-direction:column; gap:6px;">' +
    '    <input class="qa-event-title" placeholder="Event Title" style="padding:6px; font-size:13px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '    <div style="display:flex; gap:6px;">' +
    '      <input class="qa-event-date" type="date" value="' + today + '" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '      <input class="qa-event-start" type="time" style="padding:6px; font-size:13px; width:90px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '    </div>' +
    '  </div>' +

    '  <!-- Fields for Task -->' +
    '  <div class="qa-fields-group qa-fields-task" style="display:none; flex-direction:column; gap:6px;">' +
    '    <input class="qa-task-name" placeholder="Task Name" style="padding:6px; font-size:13px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '    <div style="display:flex; gap:6px;">' +
    '      <select class="qa-task-category" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' + catOptions + '</select>' +
    '      <input class="qa-task-due" type="date" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '    </div>' +
    '  </div>' +

    '  <!-- Fields for Habit -->' +
    '  <div class="qa-fields-group qa-fields-habit" style="display:none; flex-direction:column; gap:6px;">' +
    '    <input class="qa-habit-name" placeholder="Habit Name" style="padding:6px; font-size:13px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '  </div>' +

    '  <!-- Fields for Workout -->' +
    '  <div class="qa-fields-group qa-fields-workout" style="display:none; flex-direction:column; gap:6px;">' +
    '    <div style="display:flex; gap:6px;">' +
    '      <select class="qa-workout-type" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '        <option value="run">🏃 Run</option>' +
    '        <option value="bike">🚴 Bike</option>' +
    '        <option value="swim">🏊 Swim</option>' +
    '        <option value="gym">🏋️ Gym</option>' +
    '      </select>' +
    '      <input class="qa-workout-date" type="date" value="' + today + '" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '    </div>' +
    '    <div style="display:flex; gap:6px;">' +
    '      <input class="qa-workout-dur" type="number" placeholder="Min" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '      <input class="qa-workout-dist" type="number" step="0.1" placeholder="km (opt)" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '    </div>' +
    '  </div>' +

    '  <!-- Fields for Exam -->' +
    '  <div class="qa-fields-group qa-fields-exam" style="display:none; flex-direction:column; gap:6px;">' +
    '    <input class="qa-exam-name" placeholder="Exam/Deadline Name" style="padding:6px; font-size:13px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '    <div style="display:flex; gap:6px;">' +
    '      <input class="qa-exam-date" type="date" value="' + today + '" style="padding:6px; font-size:13px; flex:1.5; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '      <input class="qa-exam-ects" type="number" step="0.5" placeholder="ECTS" style="padding:6px; font-size:13px; flex:1; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
    '    </div>' +
    '  </div>' +

    '  <button class="btn small" onclick="submitQuickAdd(\'' + id + '\')" style="background:var(--accent); color:#fff; border-color:var(--accent); padding:6px; font-size:13px; margin-top:4px;">Add Item</button>' +
    '</div>';
  return html;
}

function renderRecentFilesWidget(id) {
  var wData = id ? (widgetsData[id] || {}) : {};
  var title = wData.title || "Recent Files";
  var html = '<h3>' + esc(title) + '</h3><div class="card-scroll">';
  var files = (S.files || []).slice();
  files.sort(function(a, b) {
    return (b.uploaded || 0) - (a.uploaded || 0);
  });
  var recent = files.slice(0, 5);
  
  if (recent.length) {
    recent.forEach(function(f) {
      var isPreviewable = f.mimetype && (
        f.mimetype.startsWith("image/") ||
        f.mimetype === "application/pdf" ||
        f.mimetype.startsWith("audio/") ||
        f.mimetype.startsWith("video/")
      );
      
      var icon = getFileIcon(f.mimetype);
      var iconHtml = '<span style="font-size: 16px; margin-right: 6px;">' + icon + '</span>';
      
      var nameHtml = '';
      if (isPreviewable) {
        nameHtml = '<span class="file-link" onclick="previewFile(\'' + f.id + '\')" style="font-weight:600; cursor:pointer; display:inline-flex; align-items:center;">' + iconHtml + esc(f.filename || "Unnamed") + '</span>';
      } else {
        nameHtml = '<span style="display:inline-flex; align-items:center; font-weight:600;">' + iconHtml + esc(f.filename || "Unnamed") + '</span>';
      }
      
      html += '<div class="list-item" style="display:flex; justify-content:space-between; align-items:center; padding: 4px 0;">' +
        '<div class="grow" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:8px;">' + nameHtml + '</div>' +
        '<div class="file-actions" style="display:flex; gap:4px; flex-shrink:0;">';
      
      if (isPreviewable) {
        html += '<button class="btn small ghost" onclick="previewFile(\'' + f.id + '\')" style="padding:2px 6px; font-size:11px;">View</button>';
      }
      
      html += '<a class="btn small ghost" href="/api/files/' + f.id + '/download" style="text-decoration:none; padding:2px 6px; font-size:11px;">Download</a>' +
        '</div>' +
        '</div>';
    });
  } else {
    html += '<div class="muted">No files uploaded yet.</div>';
  }
  
  html += '</div>';
  return html;
}

function renderQuickNotesWidget(id) {
  var wData = widgetsData[id] || {};
  var title = wData.title || "Notepad";
  var font = wData.font || "sans";
  var textVal = wData.text || "";

  var fontFamily = 'inherit';
  if (font === 'serif') fontFamily = 'Georgia, serif';
  else if (font === 'mono') fontFamily = 'Courier New, monospace';

  var html = '<div style="display:flex; flex-direction:column; height:100%; box-sizing:border-box;">' +
             '  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-shrink:0;">' +
             '    <h3 style="margin:0;">' + esc(title) + '</h3>' +
             '    <select onchange="changeNoteFont(\'' + id + '\', this.value)" style="padding:2px; font-size:11px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
             '      <option value="sans"' + (font === 'sans' ? ' selected' : '') + '>sans</option>' +
             '      <option value="serif"' + (font === 'serif' ? ' selected' : '') + '>serif</option>' +
             '      <option value="mono"' + (font === 'mono' ? ' selected' : '') + '>mono</option>' +
             '    </select>' +
             '  </div>' +
             '  <textarea class="note-textarea" oninput="saveNoteText(\'' + id + '\', this.value)" placeholder="Write something..." style="flex-grow:1; border:none; background:transparent; color:var(--text); resize:none; font-family:' + fontFamily + '; outline:none; font-size:14px; padding:0; box-sizing:border-box;">' + esc(textVal) + '</textarea>' +
             '</div>';
  return html;
}

function renderAnalyticsWidget(id) {
  var wData = widgetsData[id] || {};
  var metric = wData.metric || 'study_hours';
  var customTitle = wData.title;

  var title = customTitle || {
    'study_hours': 'Study Hours',
    'workouts': 'Workouts Count',
    'habits': 'Habit Check-ins',
    'run_km': 'Running (km)',
    'cycle_km': 'Cycling (km)',
    'swim_km': 'Swimming (km)'
  }[metric] || 'Analytics';

  var months = [];
  var now = new Date();
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.getFullYear() + "-" + z(d.getMonth() + 1), label: MONTHS[d.getMonth()] });
  }

  var values = {};
  months.forEach(function(m) { values[m.key] = 0; });

  if (metric === 'workouts') {
    S.workouts.forEach(function(w) {
      var k = (w.date || "").slice(0, 7);
      if (k in values) values[k]++;
    });
  } else if (metric === 'run_km') {
    S.workouts.forEach(function(w) {
      var k = (w.date || "").slice(0, 7);
      if (w.type === "run" && k in values) values[k] += w.dist || 0;
    });
  } else if (metric === 'cycle_km') {
    S.workouts.forEach(function(w) {
      var k = (w.date || "").slice(0, 7);
      if (w.type === "bike" && k in values) values[k] += w.dist || 0;
    });
  } else if (metric === 'swim_km') {
    S.workouts.forEach(function(w) {
      var k = (w.date || "").slice(0, 7);
      if (w.type === "swim" && k in values) values[k] += w.dist || 0;
    });
  } else if (metric === 'study_hours') {
    S.events.forEach(function(e) {
      if (e.type !== "study" || !e.start || !e.end) return;
      var h = (parseInt(e.end, 10) - parseInt(e.start, 10)) +
        ((parseInt(e.end.slice(3), 10) || 0) - (parseInt(e.start.slice(3), 10) || 0)) / 60;
      if (h <= 0) return;
      var k = (e.date || "").slice(0, 7);
      if (k in values) values[k] += h;
    });
  } else if (metric === 'habits') {
    S.habit_log.forEach(function(l) {
      var k = (l.date || "").slice(0, 7);
      if (k in values) values[k]++;
    });
  }

  var chartValues = months.map(function(m) { return values[m.key]; });
  var max = Math.max.apply(null, chartValues.concat([1]));

  var colorClass = "";
  if (metric === 'study_hours') colorClass = "orange";
  else if (metric === 'run_km' || metric === 'cycle_km' || metric === 'swim_km') colorClass = "green";

  var isDecimal = metric === 'run_km' || metric === 'cycle_km' || metric === 'swim_km' || metric === 'study_hours';

  var ch = '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-shrink:0;">' +
           '  <h3 style="margin:0;">' + esc(title) + '</h3>' +
           '  <select onchange="changeAnalyticsMetric(\'' + id + '\', this.value)" style="padding:2px; font-size:11px; border-radius:4px; border:1px solid var(--border); background:var(--panel2); color:var(--text);">' +
           '    <option value="study_hours"' + (metric === 'study_hours' ? ' selected' : '') + '>study</option>' +
           '    <option value="workouts"' + (metric === 'workouts' ? ' selected' : '') + '>workouts</option>' +
           '    <option value="habits"' + (metric === 'habits' ? ' selected' : '') + '>habits</option>' +
           '    <option value="run_km"' + (metric === 'run_km' ? ' selected' : '') + '>run km</option>' +
           '    <option value="cycle_km"' + (metric === 'cycle_km' ? ' selected' : '') + '>bike km</option>' +
           '    <option value="swim_km"' + (metric === 'swim_km' ? ' selected' : '') + '>swim km</option>' +
           '  </select>' +
           '</div>';

  ch += '<div class="chart" style="flex-grow:1; display:flex; align-items:flex-end; gap:6px; padding:18px 4px 0; box-sizing:border-box; height: 100px;">';
  for (var i = 0; i < chartValues.length; i++) {
    var val = chartValues[i];
    var pc = Math.round(val / max * 100);
    var displayVal = isDecimal ? Math.round(val * 10) / 10 : Math.round(val);
    ch += '  <div class="bar ' + colorClass + '" style="height:' + pc + '%; flex:1; position:relative; min-height:2px; border-radius:5px 5px 0 0;">' +
          '    <span style="position:absolute; top:-17px; left:-6px; right:-6px; text-align:center; font-size:9px; color:var(--muted);">' + (val ? displayVal : "") + '</span>' +
          '  </div>';
  }
  ch += '</div>';

  ch += '<div class="chartlabels" style="display:flex; gap:6px; margin-top:4px; flex-shrink:0;">';
  for (var i = 0; i < months.length; i++) {
    ch += '  <div style="flex:1; text-align:center; font-size:9px; color:var(--muted);">' + months[i].label + '</div>';
  }
  ch += '</div>';

  return '<div style="display:flex; flex-direction:column; height:100%; box-sizing:border-box;">' + ch + '</div>';
}

function renderCustomTextWidget(id) {
  var wData = widgetsData[id] || {};
  var title = wData.title || "Custom Text";
  var textVal = wData.text || "*No text yet. Click 'Gear' in Edit Mode to edit.*";
  
  var html = '<h3 style="margin:0 0 8px 0; flex-shrink:0;">' + esc(title) + '</h3>' +
             '<div class="card-scroll" style="flex-grow:1; overflow-y:auto; font-size:14px; line-height:1.5;">' +
             mdToHtml(textVal) +
             '</div>';
  return '<div style="display:flex; flex-direction:column; height:100%; box-sizing:border-box;">' + html + '</div>';
}

function renderGreetingWidget(id) {
  var wData = widgetsData[id] || {};
  var title = wData.title;
  
  var now = new Date();
  var timeStr = z(now.getHours()) + ":" + z(now.getMinutes());
  var dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var dayName = dayNames[now.getDay()];
  var dateStr = dayName + ", " + fmtShort(now) + " " + now.getFullYear();
  
  var hr = now.getHours();
  var greetingText = hr < 6 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  
  var titleHtml = title ? '<div style="font-size:11px; text-transform:uppercase; color:var(--muted); letter-spacing:.06em; margin-bottom:4px;">' + esc(title) + '</div>' : '';

  var html = '<div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100%; text-align:center; box-sizing:border-box;">' +
             titleHtml +
             '  <div class="greeting-time" style="font-size:32px; font-weight:700; color:var(--text); line-height:1.2;">' + timeStr + '</div>' +
             '  <div class="greeting-text" style="font-size:16px; font-weight:600; color:var(--accent); margin: 4px 0;">' + greetingText + ' 👋</div>' +
             '  <div class="greeting-date" style="font-size:12px; color:var(--text-muted);">' + dateStr + '</div>' +
             '</div>';
  return html;
}

window.changeQuickAddType = function(id, val) {
  var card = document.querySelector('.card[data-id="' + id + '"]');
  if (!card) return;
  card.querySelectorAll('.qa-fields-group').forEach(function(el) {
    el.style.display = 'none';
  });
  var target = card.querySelector('.qa-fields-' + val);
  if (target) {
    target.style.display = 'flex';
  }
};

window.submitQuickAdd = async function(id) {
  var card = document.querySelector('.card[data-id="' + id + '"]');
  if (!card) return;
  var type = card.querySelector('.qa-type-select').value;
  
  if (type === "event") {
    var title = card.querySelector(".qa-event-title").value.trim();
    var date = card.querySelector(".qa-event-date").value;
    if (!title || !date) { alert("Title and date required."); return; }
    var start = card.querySelector(".qa-event-start").value || "";
    
    var end = "";
    if (start) {
      var parts = start.split(":");
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10);
      h = (h + 1) % 24;
      end = (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
    }
    
    await api("POST", "/api/events", {
      title: title,
      type: "study",
      date: date,
      start: start,
      end: end,
      description: "",
      location: "",
      recurrence: "none",
      recurrence_until: null,
      reminder_offset: -1,
      source: "local"
    });
  } 
  else if (type === "task") {
    var name = card.querySelector(".qa-task-name").value.trim();
    if (!name) { alert("Task name required."); return; }
    var cat = card.querySelector(".qa-task-category").value || null;
    var due = card.querySelector(".qa-task-due").value || null;
    
    var maxOrder = -1;
    if (S.tasks && S.tasks.length) {
      S.tasks.forEach(function(t) {
        if (!t.parent_id && t.order_index > maxOrder) maxOrder = t.order_index;
      });
    }
    var orderIndex = maxOrder + 1;

    await api("POST", "/api/tasks", { 
      name: name, 
      done: 0, 
      created: todayStr(), 
      due: due,
      due_date: due ? due + 'T12:00' : null,
      category: cat,
      order_index: orderIndex
    });
  }
  else if (type === "habit") {
    var name = card.querySelector(".qa-habit-name").value.trim();
    if (!name) { alert("Habit name required."); return; }
    await api("POST", "/api/habits", { name: name, created: todayStr() });
  }
  else if (type === "workout") {
    var wType = card.querySelector(".qa-workout-type").value;
    var date = card.querySelector(".qa-workout-date").value || todayStr();
    var dur = parseFloat(card.querySelector(".qa-workout-dur").value) || 0;
    var dist = parseFloat(card.querySelector(".qa-workout-dist").value) || 0;
    if (!dur && !dist) { alert("Enter at least minutes or km."); return; }
    await api("POST", "/api/workouts", {
      type: wType,
      date: date,
      dur: dur,
      dist: dist,
      note: "",
      source: "manual"
    });
  }
  else if (type === "exam") {
    var name = card.querySelector(".qa-exam-name").value.trim();
    var date = card.querySelector(".qa-exam-date").value;
    if (!name || !date) { alert("Name and date required."); return; }
    var ects = parseFloat(card.querySelector(".qa-exam-ects").value) || null;
    await api("POST", "/api/exams", { name: name, date: date, ects: ects });
  }
  
  if (window.refreshApp) {
    await window.refreshApp();
  }
};

window.changeNoteFont = function(id, val) {
  if (!widgetsData[id]) widgetsData[id] = {};
  widgetsData[id].font = val;
  saveWidgetsData();
  
  var card = document.querySelector('.card[data-id="' + id + '"]');
  if (card) {
    var ta = card.querySelector('.note-textarea');
    if (ta) {
      var fontFamily = 'inherit';
      if (val === 'serif') fontFamily = 'Georgia, serif';
      else if (val === 'mono') fontFamily = 'Courier New, monospace';
      ta.style.fontFamily = fontFamily;
    }
  }
};

window.saveNoteText = function(id, val) {
  if (!widgetsData[id]) widgetsData[id] = {};
  widgetsData[id].text = val;
  saveWidgetsData();
};

window.openWidgetSettings = function(event, id) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  var item = currentLayout.find(x => x.id === id);
  if (!item) return;
  var wData = widgetsData[id] || {};
  var title = wData.title || "";
  var borderColor = wData.border_color || "";

  var modalHtml = '<div id="widgetSettingsModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">' +
                  '  <div style="background: var(--panel2); border: 1px solid var(--border); padding: 20px; border-radius: 12px; width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 12px; color: var(--text);">' +
                  '    <h3 style="margin: 0; font-size: 16px; text-transform: none; color: var(--text); letter-spacing: normal;">Widget Settings</h3>' +
                  '    ' +
                  '    <div>' +
                  '      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Custom Title</label>' +
                  '      <input type="text" id="wsTitle" value="' + esc(title) + '" placeholder="Default Title" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text);">' +
                  '    </div>' +
                  '    ' +
                  '    <div>' +
                  '      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Border Color</label>' +
                  '      <div style="display: flex; gap: 6px;">' +
                  '        <input type="color" id="wsColorPicker" value="' + (borderColor.startsWith('#') && borderColor.length === 7 ? borderColor : '#4f8cff') + '" style="width: 34px; height: 32px; border: none; border-radius: 4px; background: none; cursor: pointer; padding: 0;">' +
                  '        <input type="text" id="wsBorderColor" value="' + esc(borderColor) + '" placeholder="e.g. #ff0000 or empty" style="flex: 1; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text);">' +
                  '      </div>' +
                  '    </div>';

  if (item.type === 'quick_notes') {
    var font = wData.font || 'sans';
    modalHtml += '    <div>' +
                 '      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Font Style</label>' +
                 '      <select id="wsFont" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text);">' +
                 '        <option value="sans"' + (font === 'sans' ? ' selected' : '') + '>sans</option>' +
                 '        <option value="serif"' + (font === 'serif' ? ' selected' : '') + '>serif</option>' +
                 '        <option value="mono"' + (font === 'mono' ? ' selected' : '') + '>mono</option>' +
                 '      </select>' +
                 '    </div>';
  } else if (item.type === 'analytics') {
    var metric = wData.metric || 'study_hours';
    modalHtml += '    <div>' +
                 '      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Display Metric</label>' +
                 '      <select id="wsMetric" style="width: 100%; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text);">' +
                 '        <option value="study_hours"' + (metric === 'study_hours' ? ' selected' : '') + '>Study Hours</option>' +
                 '        <option value="workouts"' + (metric === 'workouts' ? ' selected' : '') + '>Workout Sessions</option>' +
                 '        <option value="habits"' + (metric === 'habits' ? ' selected' : '') + '>Habits Count</option>' +
                 '        <option value="run_km"' + (metric === 'run_km' ? ' selected' : '') + '>Running Distance (km)</option>' +
                 '        <option value="cycle_km"' + (metric === 'cycle_km' ? ' selected' : '') + '>Cycling Distance (km)</option>' +
                 '        <option value="swim_km"' + (metric === 'swim_km' ? ' selected' : '') + '>Swimming Distance (km)</option>' +
                 '      </select>' +
                 '    </div>';
  } else if (item.type === 'custom_text') {
    var customText = wData.text || '';
    modalHtml += '    <div>' +
                 '      <label style="display: block; font-size: 12px; margin-bottom: 4px; color: var(--muted);">Custom Text / Markdown</label>' +
                 '      <textarea id="wsCustomText" style="width: 100%; height: 80px; padding: 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); color: var(--text); resize: vertical; font-family: monospace; font-size: 12px;">' + esc(customText) + '</textarea>' +
                 '    </div>';
  }

  modalHtml += '    <div style="display: flex; gap: 8px; justify-content: space-between; margin-top: 8px;">' +
               '      <button onclick="deleteWidgetInstance(\'' + id + '\')" style="background: #dc3545; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;">Delete</button>' +
               '      <div style="display: flex; gap: 8px;">' +
               '        <button onclick="closeWidgetSettingsModal()" style="background: var(--panel); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;">Cancel</button>' +
               '        <button onclick="saveWidgetSettings(\'' + id + '\')" style="background: var(--accent); color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;">Save</button>' +
               '      </div>' +
               '    </div>' +
               '  </div>' +
               '</div>';

  var div = document.createElement('div');
  div.id = 'widgetSettingsWrapper';
  div.innerHTML = modalHtml;
  document.body.appendChild(div);

  var wsColorPicker = document.getElementById('wsColorPicker');
  var wsBorderColor = document.getElementById('wsBorderColor');
  if (wsColorPicker && wsBorderColor) {
    wsColorPicker.addEventListener('input', function() {
      wsBorderColor.value = wsColorPicker.value;
    });
    wsBorderColor.addEventListener('input', function() {
      var val = wsBorderColor.value.trim();
      if (val.startsWith('#') && val.length === 7) {
        wsColorPicker.value = val;
      }
    });
  }
};

window.closeWidgetSettingsModal = function() {
  var el = document.getElementById('widgetSettingsWrapper');
  if (el) el.remove();
};

window.shortcutContextMenu = function(ev, id) {
  var s = (S.shortcuts || []).find(function(x) { return x.id === id; });
  if (!s) return;
  showContextMenu(ev, [
    { label: "Open", icon: "🔗", onClick: function() { window.open(s.url, "_blank"); } },
    { sep: true },
    { label: "Remove", icon: "✕", danger: true, onClick: async function() {
      if (!await askConfirm("Remove the “" + (s.name || s.url) + "” shortcut?", { title: "Remove shortcut", okText: "Remove", danger: true })) return;
      await api("DELETE", "/api/shortcuts/" + id);
      if (window.refreshApp) await window.refreshApp();
    } }
  ]);
};

// Right-click a widget card → settings/remove (delegated; skips text inputs
// and links so their native menus / own handlers still work).
function initDashboardContextMenu() {
  var tab = document.getElementById("tab-dashboard");
  if (!tab || tab.dataset.ctxInitialized) return;
  tab.dataset.ctxInitialized = "true";
  tab.addEventListener("contextmenu", function(ev) {
    var t = ev.target;
    if (t.closest && (t.closest("a, input, textarea, select") || t.isContentEditable)) return;
    var card = t.closest && t.closest(".grid-stack-item-content.card[data-id], .card[data-id]");
    if (!card) return;
    var id = card.getAttribute("data-id");
    if (!currentLayout.some(function(x) { return x.id === id; })) return;
    showContextMenu(ev, [
      { label: "Widget settings…", icon: "⚙️", onClick: function() { window.openWidgetSettings(ev, id); } },
      { sep: true },
      { label: "Remove widget", icon: "✕", danger: true, onClick: function() { window.deleteWidgetInstance(id); } }
    ]);
  });
}

window.deleteWidgetInstance = async function(id) {
  if (await askConfirm("Are you sure you want to remove this widget?", { title: "Remove widget", okText: "Remove", danger: true })) {
    currentLayout = currentLayout.filter(x => x.id !== id);
    delete widgetsData[id];
    saveWidgetsData();
    scheduleLayoutSave();
    closeWidgetSettingsModal();
    renderDashboard(true);
  }
};

window.saveWidgetSettings = function(id) {
  var item = currentLayout.find(x => x.id === id);
  if (!item) return;

  if (!widgetsData[id]) widgetsData[id] = {};
  
  var titleVal = document.getElementById('wsTitle').value.trim();
  widgetsData[id].title = titleVal || null;

  var colorVal = document.getElementById('wsBorderColor').value.trim();
  widgetsData[id].border_color = colorVal || null;

  if (item.type === 'quick_notes') {
    widgetsData[id].font = document.getElementById('wsFont').value;
  } else if (item.type === 'analytics') {
    widgetsData[id].metric = document.getElementById('wsMetric').value;
  } else if (item.type === 'custom_text') {
    widgetsData[id].text = document.getElementById('wsCustomText').value;
  }

  saveWidgetsData();
  closeWidgetSettingsModal();
  renderDashboard(true);
};

// Append a widget below everything else (both layouts) without disturbing
// any existing positions.
function appendWidget(id, type) {
  var maxY = 1, maxMy = 1;
  currentLayout.forEach(function(item) {
    if (item.y + item.h > maxY) maxY = item.y + item.h;
    if (item.my + item.mh > maxMy) maxMy = item.my + item.mh;
  });
  currentLayout.push({ id: id, type: type, x: 1, y: maxY, w: 6, h: 2, mx: 1, my: maxMy, mw: 6, mh: 2 });
}

window.addWidgetInstance = function(type) {
  if (!WIDGET_REGISTRY[type]) return;
  appendWidget(type + "_" + Date.now(), type);
  scheduleLayoutSave();
  renderDashboard(true);
};

function getCardHTML(type, id) {
  var entry = WIDGET_REGISTRY[type === 'today' ? 'today_plan' : type];
  return entry ? entry.render(id) : '';
}

// Customize drawer: slides in from the right, everything applies and
// autosaves immediately — no Save/Cancel buttons.
function renderCustomizerPanelHTML() {
  var showShortcuts = SET ? SET.show_shortcuts !== "0" : true;
  var showShortcutsMobile = SET ? SET.show_shortcuts_mobile === "1" : false;
  var isMobileView = window.innerWidth <= 640;

  var html = '';
  html += '<div class="drawer-head">';
  html += '  <div>';
  html += '    <div class="drawer-title">Customize dashboard</div>';
  html += '    <div class="drawer-hint">' + (isMobileView
    ? 'Drag the handle on a card to reorder. Changes save automatically.'
    : 'Drag cards by their handle, resize from the corner. Changes save automatically.') + '</div>';
  html += '  </div>';
  html += '  <button class="btn small drawer-done" onclick="toggleEditMode()">Done</button>';
  html += '</div>';

  // --- Widgets: one row per type. Singletons get an on/off toggle; ---
  // --- multi-instance types (Notepad, Mini Chart, ...) get "+ Add". ---
  html += '<div class="drawer-section">';
  html += '<h4>Widgets</h4>';
  html += '<div class="drawer-list">';
  Object.keys(WIDGET_REGISTRY).forEach(function(id) {
    var entry = WIDGET_REGISTRY[id];
    html += '<div class="drawer-row">';
    html += '<span class="drawer-row-name">' + esc(entry.name) + '</span>';
    if (entry.toggleable) {
      var active = currentLayout.some(function(item) { return item.id === id || item.type === id; });
      html += '<span class="hcheck' + (active ? ' on' : '') + '" onclick="toggleWidgetPresence(\'' + id + '\', ' + !active + ')">' + (active ? '\u2713' : '') + '</span>';
    } else {
      html += '<button class="btn ghost small" onclick="addWidgetInstance(\'' + id + '\')">+ Add</button>';
    }
    html += '</div>';
  });
  html += '</div>';
  html += '<div class="drawer-hint" style="margin-top:8px;">Tip: click the \u2699\ufe0f on a card to rename, recolor or remove it.</div>';
  html += '</div>';

  // --- Presets ---
  html += '<div class="drawer-section">';
  html += '<h4>Layout presets</h4>';
  html += '<div class="drawer-btn-row">';
  html += '<button class="btn ghost small" onclick="applyPreset(\'balanced\')">Balanced</button>';
  html += '<button class="btn ghost small" onclick="applyPreset(\'academic\')">Academic</button>';
  html += '<button class="btn ghost small" onclick="applyPreset(\'active\')">Active</button>';
  html += '<button class="btn ghost small" onclick="applyPreset(\'minimalist\')">Minimalist</button>';
  html += '</div>';
  html += '<div class="drawer-hint" style="margin-top:8px;">Applying a preset replaces your current layout.</div>';
  html += '</div>';

  // --- Shortcuts ---
  html += '<div class="drawer-section">';
  html += '<div class="drawer-section-head">';
  html += '<h4>Web shortcuts</h4>';
  html += '<button class="btn ghost small" onclick="addShortcut()">+ Add</button>';
  html += '</div>';
  html += '<div class="drawer-row">';
  html += '<span class="drawer-row-name">Show shortcut row</span>';
  html += '<span id="showShortcutsToggle" class="hcheck' + (showShortcuts ? ' on' : '') + '" onclick="toggleShowShortcuts()">' + (showShortcuts ? '\u2713' : '') + '</span>';
  html += '</div>';
  html += '<div class="drawer-row">';
  html += '<span class="drawer-row-name">Show shortcuts on mobile</span>';
  html += '<span id="showShortcutsMobileToggle" class="hcheck' + (showShortcutsMobile ? ' on' : '') + '" onclick="toggleShowShortcutsMobile()">' + (showShortcutsMobile ? '\u2713' : '') + '</span>';
  html += '</div>';

  html += '<div class="drawer-list" style="margin-top:8px;">';
  if (S.shortcuts && S.shortcuts.length) {
    var disabled = (SET && SET.disabled_shortcuts) ? SET.disabled_shortcuts.split(',') : [];
    var order = (SET && SET.shortcut_order) ? SET.shortcut_order.split(',') : [];
    var sorted = S.shortcuts.slice().sort(function(a, b) {
      var ia = order.indexOf(a.id);
      var ib = order.indexOf(b.id);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      return ia - ib;
    });

    sorted.forEach(function(s) {
      var isOff = disabled.indexOf(s.id) !== -1;
      html += '<div class="drawer-row" draggable="true" ondragstart="dragShortcutStart(event,\'' + s.id + '\')" ondragover="dragShortcutOver(event)" ondrop="dropShortcut(event,\'' + s.id + '\')" ondragend="dragShortcutEnd(event)" style="cursor:grab;">';
      html += '<span class="muted" style="user-select:none;">\u2630</span>';
      html += '<span class="drawer-row-name" title="' + esc(s.url) + '">' + esc(s.name) + '</span>';
      html += '<span class="hcheck' + (isOff ? '' : ' on') + '" onclick="toggleItem(\'' + s.id + '\')">' + (isOff ? '' : '\u2713') + '</span>';
      html += '<button class="btn danger small" onclick="delRow(\'shortcuts\', \'' + s.id + '\')" style="padding:2px 8px; font-size:11px;">\u00d7</button>';
      html += '</div>';
    });
  } else {
    html += '<div class="muted" style="font-size:13px; padding:4px 0;">No shortcuts yet.</div>';
  }
  html += '</div>';
  html += '</div>';

  return html;
}


function startClockUpdates() {
  if (greetingInterval) clearInterval(greetingInterval);
  greetingInterval = setInterval(function() {
    var cards = document.querySelectorAll('.card[data-id]');
    cards.forEach(function(card) {
      var id = card.dataset.id;
      var item = currentLayout.find(x => x.id === id);
      if (item) {
        var type = item.type || item.id;
        if (type === 'greeting') {
          var now = new Date();
          var timeStr = z(now.getHours()) + ":" + z(now.getMinutes());
          var dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
          var dayName = dayNames[now.getDay()];
          var dateStr = dayName + ", " + fmtShort(now) + " " + now.getFullYear();
          var hr = now.getHours();
          var greetingText = hr < 6 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";

          var timeEl = card.querySelector('.greeting-time');
          var textEl = card.querySelector('.greeting-text');
          var dateEl = card.querySelector('.greeting-date');
          if (timeEl) timeEl.textContent = timeStr;
          if (textEl) textEl.textContent = greetingText + " 👋";
          if (dateEl) dateEl.textContent = dateStr;
        } else if (type === 'today_plan') {
          var scrollEl = card.querySelector('.card-scroll');
          if (scrollEl) {
            scrollEl.innerHTML = renderTodayPlanListHTML(id);
          }
        }
      }
    });
  }, 10000);
}

function buildCardBodyHTML(item) {
  var cardContent = getCardHTML(item.type || item.id, item.id);
  if (!cardContent) return null;
  var wData = widgetsData[item.id] || {};
  var borderColor = wData.border_color;
  var borderStyle = borderColor ? "border-color: " + borderColor + " !important;" : "";
  var gear = isEditMode
    ? '<button class="card-settings-btn" onclick="openWidgetSettings(event, \'' + item.id + '\')" style="position: absolute; top: 6px; right: 6px; z-index: 12; background: var(--panel2); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; cursor: pointer; color: var(--text); font-size: 11px;">⚙️</button>'
    : '';
  var dragHandle = isEditMode ? '<div class="card-drag-handle"></div>' : '';
  return { borderStyle: borderStyle, gear: gear, dragHandle: dragHandle, cardContent: cardContent };
}

function renderGridStackHTML() {
  var html = "";
  currentLayout.forEach(function(item) {
    var body = buildCardBodyHTML(item);
    if (!body) return;
    html += '<div class="grid-stack-item" gs-id="' + item.id + '" gs-x="' + (item.x - 1) + '" gs-y="' + (item.y - 1) + '" gs-w="' + item.w + '" gs-h="' + item.h + '">';
    html += '  <div class="grid-stack-item-content card" data-id="' + item.id + '" style="' + body.borderStyle + '">';
    html += body.dragHandle + body.gear + body.cardContent;
    html += '  </div>';
    html += '</div>';
  });
  return html;
}

function initGridStack(container) {
  if (!window.GridStack) return;
  gridInstance = window.GridStack.init({
    column: 12,
    cellHeight: 150,
    margin: 8,
    // float: widgets stay exactly where the user drops them — nothing gets
    // pushed/compacted to the top.
    float: true,
    animate: true,
    staticGrid: !isEditMode,
    alwaysShowResizeHandle: true,
    handle: '.card-drag-handle',
    resizable: { handles: 'se' }
  }, container);

  gridInstance.on('change', function(event, changedItems) {
    (changedItems || []).forEach(function(gsItem) {
      var layoutItem = currentLayout.find(function(x) { return x.id === gsItem.id; });
      if (layoutItem) {
        layoutItem.x = gsItem.x + 1;
        layoutItem.y = gsItem.y + 1;
        layoutItem.w = gsItem.w;
        layoutItem.h = gsItem.h;
      }
    });
    scheduleLayoutSave();
  });
}

// Mobile has no free-form grid: widgets stack full-width, ordered by `my`,
// reordered only via drag-handle (no resize — height is always auto-content).
function renderMobileListHTML() {
  var sorted = currentLayout.slice().sort(function(a, b) { return a.my - b.my; });
  var html = "";
  sorted.forEach(function(item) {
    var body = buildCardBodyHTML(item);
    if (!body) return;
    // Only the handle is a drag source (draggable) so buttons/inputs/textareas
    // inside the widget content keep working normally; the whole card is a
    // valid drop target so dropping anywhere on it reorders.
    var dropAttrs = isEditMode
      ? ' ondragover="dragWidgetOver(event)" ondrop="dropWidget(event,\'' + item.id + '\')"'
      : '';
    var dragHandle = isEditMode
      ? '<div class="card-drag-handle" draggable="true" ondragstart="dragWidgetStart(event,\'' + item.id + '\')" ondragend="dragWidgetEnd(event)"></div>'
      : '';
    html += '<div class="card" data-id="' + item.id + '" style="' + body.borderStyle + '"' + dropAttrs + '>';
    html += dragHandle + body.gear + body.cardContent;
    html += '</div>';
  });
  return html;
}

var mobileDragId = null;

window.dragWidgetStart = function(e, id) {
  mobileDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  var card = e.currentTarget.closest('.card');
  if (card) card.classList.add('dragging');
};

window.dragWidgetOver = function(e) {
  e.preventDefault();
};

window.dropWidget = function(e, dropId) {
  e.preventDefault();
  if (!mobileDragId || mobileDragId === dropId) { mobileDragId = null; return; }
  var sorted = currentLayout.slice().sort(function(a, b) { return a.my - b.my; });
  var dragIdx = sorted.findIndex(function(x) { return x.id === mobileDragId; });
  var dropIdx = sorted.findIndex(function(x) { return x.id === dropId; });
  mobileDragId = null;
  if (dragIdx === -1 || dropIdx === -1) return;
  var moved = sorted.splice(dragIdx, 1)[0];
  sorted.splice(dropIdx, 0, moved);
  sorted.forEach(function(item, i) { item.my = i + 1; });
  scheduleLayoutSave();
  renderDashboard(true);
};

window.dragWidgetEnd = function(e) {
  var card = e.currentTarget.closest('.card');
  if (card) card.classList.remove('dragging');
  mobileDragId = null;
};

export function renderDashboard(force) {
  safeRender("dashboard", () => {
    initDashboardContextMenu();
    var now = new Date(), hr = now.getHours();
    var g = hr < 6 ? "Good night" : hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
    var greetEl = document.getElementById("greeting");
    if (greetEl) greetEl.textContent = g + " \uD83D\uDC4B";
    document.getElementById("headerDate").textContent = fmtShort(now) + " " + now.getFullYear();
    var sbDate = document.getElementById("sidebarDate");
    if (sbDate) sbDate.textContent = fmtShort(now) + " " + now.getFullYear();

    // Load widgets data
    try {
      widgetsData = JSON.parse(SET && SET.dashboard_widgets_data ? SET.dashboard_widgets_data : '{}');
    } catch(e) {
      widgetsData = {};
    }

    // Load layout and theme style
    if (!isEditMode) {
      initLayoutAndStyle();
    }

    // Render Customizer Panel if customizing
    var panel = document.getElementById("customizerPanel");
    if (panel) {
      if (isEditMode) {
        panel.style.display = "block";
        panel.className = "customizer-drawer";
        panel.innerHTML = renderCustomizerPanelHTML();
      } else {
        panel.style.display = "none";
        panel.className = "";
        panel.innerHTML = "";
      }
    }

    // While editing, external re-renders (live sync ticks every few seconds)
    // must NOT rebuild the grid: tearing down Gridstack mid-interaction
    // orphans its drag/resize listeners and kills the handles until a page
    // refresh. Grid rebuilds during edit only happen via explicit actions
    // (add/remove widget, preset, done) which pass force=true. The drawer
    // above is still refreshed so shortcut edits show up immediately.
    if (isEditMode && !force) {
      return;
    }

    var container = document.getElementById("dashCards");
    var isMobileRender = window.innerWidth <= 640;
    lastIsMobileRender = isMobileRender;

    if (gridInstance) {
      try { gridInstance.destroy(false); } catch (e) {}
      gridInstance = null;
    }

    if (container) {
      if (window.Alpine && typeof window.Alpine.destroyTree === 'function') {
        container.querySelectorAll('[x-data]').forEach(function(el) {
          try {
            window.Alpine.destroyTree(el);
          } catch (e) {
            console.warn("Failed to destroy Alpine tree for element:", el, e);
          }
        });
      }

      container.setAttribute("data-customizing", isEditMode ? "true" : "false");

      if (isMobileRender) {
        // Mobile: no free-form grid — full-width stacked cards, reordered by drag handle only.
        container.className = "dashboard-grid dashboard-mobile-list";
        container.innerHTML = renderMobileListHTML();
      } else {
        // Desktop/tablet: Gridstack-powered free-form grid (drag + resize + collision).
        container.className = "dashboard-grid grid-stack";
        container.innerHTML = renderGridStackHTML();
        initGridStack(container);
      }
    }

    // Render shortcuts (hidden on mobile unless explicitly re-enabled there)
    var shortcutHtml = '';
    var showShortcuts = SET ? SET.show_shortcuts !== "0" : true;
    var showShortcutsMobile = SET ? SET.show_shortcuts_mobile === "1" : false;
    if (isMobileRender && !showShortcutsMobile) showShortcuts = false;
    if (showShortcuts && S.shortcuts) {
      var disabled = (SET && SET.disabled_shortcuts) ? SET.disabled_shortcuts.split(',') : [];
      var order = (SET && SET.shortcut_order) ? SET.shortcut_order.split(',') : [];
      var sorted = S.shortcuts.slice().sort(function(a, b) {
        var ia = order.indexOf(a.id);
        var ib = order.indexOf(b.id);
        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;
        return ia - ib;
      });

      sorted.forEach(function(s) {
        if (disabled.indexOf(s.id) !== -1) return;
        var domain = '';
        try { domain = new URL(s.url).hostname; } catch(e){}
        var icon = s.icon || ("https://www.google.com/s2/favicons?domain=" + domain + "&sz=64");
        
        shortcutHtml += '<a href="' + esc(s.url) + '" target="_blank" class="shortcut-btn" oncontextmenu="shortcutContextMenu(event, \'' + s.id + '\')">' +
                '<img src="' + esc(icon) + '" alt="">' +
                '<div class="name">' + esc(s.name) + '</div>' +
                '</a>';
      });
    }

    var shortcutsEl = document.getElementById("dashShortcuts");
    if (shortcutsEl) {
      var hasShortcutsWidget = currentLayout.some(x => (x.type || x.id) === 'shortcuts');
      if (hasShortcutsWidget) {
        shortcutsEl.innerHTML = '';
        shortcutsEl.style.display = 'none';
      } else {
        shortcutsEl.innerHTML = shortcutHtml;
        shortcutsEl.style.display = shortcutHtml ? 'flex' : 'none';
      }
    }

    // Trigger clock updates
    startClockUpdates();
  });
}

export async function addShortcut(refresh) {
  var url = await askPrompt("Website URL", "", { okText: "Next", placeholder: "e.g. https://github.com" });
  if (!url) return;
  if (!url.startsWith('http')) url = 'https://' + url;
  var name = await askPrompt("Shortcut name", "", { okText: "Add", placeholder: "Leave empty to use the domain" });
  if (name === null) return;
  if (!name) {
    try {
      name = new URL(url).hostname.replace(/^www\./, '');
    } catch(e) {
      name = url;
    }
  }
  
  await api("POST", "/api/shortcuts", { name: name, url: url, icon: "" });
  await refresh();
}

export async function toggleShowShortcuts(refresh) {
  var el = document.getElementById("showShortcutsToggle");
  var show = el.tagName === 'INPUT' ? el.checked : !el.classList.contains('on');
  await api("POST", "/api/settings", { show_shortcuts: show ? "1" : "0" });
  await refresh();
}

export async function toggleShowShortcutsMobile(refresh) {
  var el = document.getElementById("showShortcutsMobileToggle");
  var show = el.tagName === 'INPUT' ? el.checked : !el.classList.contains('on');
  await api("POST", "/api/settings", { show_shortcuts_mobile: show ? "1" : "0" });
  await refresh();
}

export async function toggleItem(id, refresh) {
  var disabled = (SET && SET.disabled_shortcuts) ? SET.disabled_shortcuts.split(',').filter(Boolean) : [];
  var idx = disabled.indexOf(id);
  if (idx === -1) disabled.push(id);
  else disabled.splice(idx, 1);
  await api("POST", "/api/settings", { disabled_shortcuts: disabled.join(',') });
  await refresh();
}

export async function reorderShortcut(dragId, dropId, refresh) {
  if (dragId === dropId) return;
  var order = (SET && SET.shortcut_order) ? SET.shortcut_order.split(',').filter(Boolean) : S.shortcuts.map(function(s) { return s.id; });
  S.shortcuts.forEach(function(s) { if (order.indexOf(s.id) === -1) order.push(s.id); });
  
  var dragIdx = order.indexOf(dragId);
  if (dragIdx > -1) order.splice(dragIdx, 1);
  var dropIdx = order.indexOf(dropId);
  if (dropIdx > -1) order.splice(dropIdx, 0, dragId);
  
  await api("POST", "/api/settings", { shortcut_order: order.join(',') });
  await refresh();
}

// Customizer actions & event handlers
// Opening enters edit mode; closing (button or drawer's "Done") flushes any
// pending autosave and exits — edits are always kept, there is no cancel.
export function toggleEditMode() {
  isEditMode = !isEditMode;
  var btn = document.getElementById("customizeBtn");
  if (btn) {
    if (isEditMode) {
      btn.classList.add("active");
      btn.textContent = "✓ Done";
      initLayoutAndStyle();
    } else {
      btn.classList.remove("active");
      btn.textContent = "⚙️ Customize";
    }
  }
  if (!isEditMode) {
    flushLayoutSave();
  }
  renderDashboard(true);
}

export function applyPreset(name) {
  if (PRESETS[name]) {
    currentLayout = JSON.parse(JSON.stringify(PRESETS[name]));
    scheduleLayoutSave();
    renderDashboard(true);
  }
}

export function toggleWidgetPresence(id, checked) {
  if (checked) {
    if (!currentLayout.some(x => x.id === id || x.type === id)) {
      appendWidget(id, id);
    }
  } else {
    currentLayout = currentLayout.filter(x => x.id !== id && x.type !== id && x.id !== (id === 'today_plan' ? 'today' : ''));
  }
  scheduleLayoutSave();
  renderDashboard(true);
}

// Global listener for localized DOM patching on dashboard
window.addEventListener("tylo:task-updated", function(e) {
  const { id, done } = e.detail;
  if (done) {
    const el = document.querySelector(`[data-dashboard-task-id="${id}"]`);
    if (el) {
      el.remove();
    }
  }
});

// Re-render if the viewport crosses the mobile-list <-> Gridstack breakpoint.
var dashboardResizeTimeout = null;
window.addEventListener("resize", function() {
  if (lastIsMobileRender === null) return;
  clearTimeout(dashboardResizeTimeout);
  dashboardResizeTimeout = setTimeout(function() {
    if ((window.innerWidth <= 640) !== lastIsMobileRender) {
      renderDashboard(true);
    }
  }, 150);
});
