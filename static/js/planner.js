import { S, SET } from './state.js';
import { toISO, todayStr, fmtShort, esc, api, DAYS, MONTHS } from './utils.js';
import { getViewDates } from './utils.js';
import { renderDashboard } from './dashboard.js';

var dateOffset = 0, plannerRefresh = null, currentView = '7', scrolledToCurrentTimeThisSession = false, isResizing = false, lastScrollTop = null, activeReminders = [], isRendering = false;
var draggingEventId = null, draggingOffsetY = 0, currentUndoAction = null, undoToastTimeout = null, dragPreviewEl = null;
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

export function changePlannerView(val) {
  currentView = val;
  dateOffset = 0;
  renderPlanner();
}

export function moveWeek(d) {
  if (d === 0) dateOffset = 0; else dateOffset += d;
  renderPlanner();
}

function getInstances(e, startIso, endIso) {
  var instances = [];
  var d = new Date(startIso);
  var eDate = new Date(e.date);
  for (var i = 0; i < 42; i++) {
    var cur = new Date(d);
    cur.setDate(d.getDate() + i);
    var curIso = toISO(cur);
    if (curIso > endIso) break;
    if (curIso < e.date) continue;
    if (e.recurrence_until && curIso > e.recurrence_until) continue;
    var match = false;
    if (!e.recurrence || e.recurrence === 'none') {
      match = (curIso === e.date);
    } else if (e.recurrence === 'daily') {
      match = true;
    } else if (e.recurrence === 'weekly') {
      match = (cur.getDay() === eDate.getDay());
    } else if (e.recurrence === 'monthly') {
      match = (cur.getDate() === eDate.getDate());
    }
    if (match) instances.push(Object.assign({}, e, {virtualDate: curIso}));
  }
  return instances;
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

export function applyCalendarColors() {
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

    var totalCols = cols.length;
    cluster.forEach(function(e) {
      e._width = 100 / totalCols;
      e._left = e._col * e._width;
    });
  });
}

function parseTime(t) {
  if (!t) return 0;
  var p = t.split(":");
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

export function renderPlanner() {
  isRendering = true;
  var dates = getViewDates(currentView, dateOffset);
  var title = "";
  if (currentView === 'month') {
    var mDate = new Date(); mDate.setMonth(mDate.getMonth() + dateOffset);
    title = MONTHS[mDate.getMonth()] + " " + mDate.getFullYear();
  } else {
    title = (dateOffset === 0 ? "This " + (currentView === '1' ? "day" : (currentView === '7' ? "week" : currentView + " days")) + " · " : "") + fmtShort(dates[0]) + (dates.length > 1 ? " – " + fmtShort(dates[dates.length - 1]) : "") + " " + dates[0].getFullYear();
  }
  document.getElementById("weekLabel").textContent = title;
  
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
      
      tDue.forEach(function(t) {
        html += '<div class="month-event ics" onclick="toggleTask(\'' + t.id + '\',true)">☑ ' + esc(t.name) + '</div>';
      });
      evs.forEach(function(e) {
        var rep = (e.recurrence && e.recurrence !== 'none') ? ' 🔄' : '';
        var tstr = e.start ? e.start + ' ' : '';
        html += '<div class="month-event ' + esc(e.source && e.source.startsWith("ics") ? e.source : e.type) + '" onclick="editEvent(\'' + e.id + '\')">' + esc(tstr + e.title) + rep + '</div>';
      });
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
    html += '<div class="day-columns">';
    
    dates.forEach(function(d) {
      var iso = toISO(d);
      var evs = allInstances.filter(function(e) { return e.virtualDate === iso; }).sort(function(a, b) { return (a.start || "").localeCompare(b.start || ""); });
      var tDue = S.tasks ? S.tasks.filter(function(t) { return t.due === iso && !t.done; }) : [];
      
      var timedEvs = evs.filter(function(e) { return e.start && e.end; });
      var allDayEvs = evs.filter(function(e) { return !e.start || !e.end; });
      
      calculateOverlaps(timedEvs);
      
      html += '<div class="day-col' + (iso === today ? ' today' : '') + '" data-iso="' + iso + '">';
      html += '<div class="day-col-header"><span class="dname">' + DAYS[(d.getDay()+6)%7] + ' ' + d.getDate() + '</span><button class="btn ghost small" onclick="openAdd(\'' + iso + '\')">+</button></div>';
      
      html += '<div class="all-day-bar" onclick="if (event.target === this) openAdd(\'' + iso + '\')">';
      tDue.forEach(function(t) {
        html += '<div class="event" style="border-left-color:var(--muted); cursor:pointer; display:flex; align-items:center; gap:6px"><span class="hcheck' + (t.done ? ' on' : '') + '" onclick="toggleTask(\'' + t.id + '\',' + !t.done + ')" style="flex-shrink:0; width:16px; height:16px; line-height:16px; border-radius:4px; font-size:10px;">' + (t.done ? '✓' : '') + '</span> <span>' + esc(t.name) + '</span></div>';
      });
      allDayEvs.forEach(function(e) {
        var repeatIcon = (e.recurrence && e.recurrence !== 'none') ? ' 🔄' : '';
        html += '<div class="event ' + esc(e.source && e.source.startsWith("ics") ? e.source : e.type) + '" draggable="true" data-id="' + e.id + '" onclick="editEvent(\'' + e.id + '\')">' + esc(e.title) + repeatIcon + '</div>';
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
        var timeStr = esc(e.start) + ' - ' + esc(e.end);
        var hasLoc = e.location && e.location.trim() !== '';
        var locStr = hasLoc ? esc(e.location.trim()) : '';
        var detailsHtml = '';
        if (height >= 50 && hasLoc) {
            detailsHtml = '<div class="event-time muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + timeStr + '</div>';
            detailsHtml += '<div class="event-loc muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ' + locStr + '</div>';
        } else {
            var combined = timeStr + (hasLoc ? ', ' + locStr : '');
            detailsHtml = '<div class="event-details muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + combined + '</div>';
        }
        html += '<div class="event absolute ' + esc(e.source && e.source.startsWith("ics") ? e.source : e.type) + '" draggable="true" data-id="' + e.id + '" onclick="editEvent(\'' + e.id + '\')" ';
        html += 'style="--original-height:' + height + 'px; top:' + startMin + 'px; height:' + height + 'px; left:' + e._left + '%; width:calc(' + e._width + '% - 2px);">';
        html += '<div class="resize-handle top"></div>';
        html += '<div class="event-title" style="font-weight:600; font-size:11.5px; margin-bottom:2px; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(e.title) + repeatIcon + '</div>';
        html += detailsHtml;
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
                var timeStr = startStr + ' - ' + endStr;
                var detailsHtml = '';
                if (dur >= 50 && hasLoc) {
                    detailsHtml = '<div class="event-time muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + timeStr + '</div>';
                    detailsHtml += '<div class="event-loc muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ' + locStr + '</div>';
                } else {
                    var combined = timeStr + (hasLoc ? ', ' + locStr : '');
                    detailsHtml = '<div class="event-details muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + combined + '</div>';
                }
                
                dragPreviewEl.innerHTML = '<div class="event-title" style="font-weight:600; font-size:11.5px; margin-bottom:2px; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(title) + repeatIcon + '</div>' + detailsHtml;
                tgc.appendChild(dragPreviewEl);
              }
              
              if (dragPreviewEl.parentNode !== tgc) {
                tgc.appendChild(dragPreviewEl);
              }
              dragPreviewEl.style.top = startMin + 'px';
              dragPreviewEl.style.left = '0%';
              dragPreviewEl.style.width = 'calc(100% - 2px)';
              
              var timeDiv = dragPreviewEl.querySelector('.muted');
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
          var now = new Date();
          var nowMin = now.getHours() * 60 + now.getMinutes();
          var targetScroll = allDayH + nowMin - (wrapper.clientHeight - headerH) / 3;
          wrapper.scrollTop = Math.max(0, targetScroll);
          scrolledToCurrentTimeThisSession = true;
          lastScrollTop = wrapper.scrollTop;
        } else {
          wrapper.scrollTop = Math.max(0, minStart - 20);
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
              var now = new Date();
              var nowMin = now.getHours() * 60 + now.getMinutes();
              var targetScroll = allDayH + nowMin - (wrapper.clientHeight - headerH) / 3;
              wrapper.scrollTop = Math.max(0, targetScroll);
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
  
  var now = new Date();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var targetScroll = allDayH + nowMin - (wrapper.clientHeight - headerH) / 3;
  
  wrapper.scrollTop = Math.max(0, targetScroll);
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
    
    if (document.activeElement && (
      document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA' ||
      document.activeElement.tagName === 'SELECT'
    )) return;

    var modalOpen = false;
    document.querySelectorAll('.modal').forEach(function(m) {
      if (m.style.display && m.style.display !== 'none') modalOpen = true;
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
    } else if (key === shortcuts.next) {
      e.preventDefault();
      moveWeek(1);
    } else if (key === shortcuts.prev) {
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

          var timeDiv = el.querySelector('.muted');
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

function updateRecurrenceVisibility() {
  var recSelect = document.getElementById('evModalRec');
  var group = document.getElementById('evModalRecUntilGroup');
  if (recSelect && group) {
    group.style.display = (recSelect.value === 'none') ? 'none' : 'flex';
  }
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

export function openAdd(iso, defaultStart, defaultEnd) {
  window.dispatchEvent(new CustomEvent('open-event-modal'));
  document.getElementById('evModalTitleText').textContent = 'Add Event';
  document.getElementById('evModalId').value = '';
  document.getElementById('evModalTitle').value = '';
  document.getElementById('evModalType').value = 'study';
  document.getElementById('evModalDate').value = iso;
  document.getElementById('evModalStart').value = defaultStart || '';
  document.getElementById('evModalEnd').value = defaultEnd || '';
  document.getElementById('evModalDesc').value = '';
  document.getElementById('evModalLoc').value = '';
  document.getElementById('evModalRec').value = 'none';
  document.getElementById('evModalRecUntil').value = '';
  document.getElementById('evModalDelBtn').style.display = 'none';
  
  activeReminders = [];
  renderReminderPills();
  resetReminderControls();
  updateDurationFromTimes();
  updateRecurrenceVisibility();
  
  document.getElementById('evModalTitle').focus();
}

export function editEvent(id) {
  if (isResizing || justTouchDragged) return;
  var e = S.events.find(function(x) { return x.id === id; });
  if (!e) return;
  window.dispatchEvent(new CustomEvent('open-event-modal'));
  document.getElementById('evModalTitleText').textContent = 'Edit Event';
  document.getElementById('evModalId').value = e.id;
  document.getElementById('evModalTitle').value = e.title || '';
  document.getElementById('evModalType').value = e.type || 'other';
  document.getElementById('evModalDate').value = e.date || '';
  document.getElementById('evModalStart').value = e.start || '';
  document.getElementById('evModalEnd').value = e.end || '';
  document.getElementById('evModalDesc').value = e.description || '';
  document.getElementById('evModalLoc').value = e.location || '';
  document.getElementById('evModalRec').value = e.recurrence || 'none';
  document.getElementById('evModalRecUntil').value = e.recurrence_until || '';
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
  updateRecurrenceVisibility();

  document.getElementById('evModalTitle').focus();
}



export async function saveEventModal(refresh) {
  var id = document.getElementById("evModalId").value;
  var title = document.getElementById("evModalTitle").value.trim();
  if (!title) return;
  var data = {
    title: title,
    type: document.getElementById("evModalType").value,
    date: document.getElementById("evModalDate").value,
    start: document.getElementById("evModalStart").value,
    end: document.getElementById("evModalEnd").value,
    description: document.getElementById("evModalDesc").value,
    location: document.getElementById("evModalLoc").value,
    recurrence: document.getElementById("evModalRec").value,
    recurrence_until: document.getElementById("evModalRecUntil").value,
    reminder_offset: activeReminders.length > 0 ? activeReminders.join(',') : -1,
    source: "local"
  };
  
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

export function resetShortcutsToDefault() {
  if (confirm("Reset all shortcuts to defaults?")) {
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

export function showUndoToast(message, undoCallback) {
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
              'onclick="navigateToAndEditEvent(\'' + e.id + '\', \'' + e.date + '\')">' +
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

export function navigateToAndEditEvent(id, date) {
  var tabBtn = document.querySelector('#tabs button[data-tab="planner"]');
  if (tabBtn) {
    tabBtn.click();
  }
  
  var now = new Date();
  var target = new Date(date + 'T00:00:00');
  if (isNaN(target.getTime())) {
    target = new Date(date);
  }
  
  if (currentView === 'month') {
    var monthsDiff = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    dateOffset = monthsDiff;
  } else {
    var days = parseInt(currentView, 10) || 7;
    if (days === 7) {
      var dow = (now.getDay() + 6) % 7;
      var currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
      currentMonday.setHours(0,0,0,0);
      
      var targetDow = (target.getDay() + 6) % 7;
      var targetMonday = new Date(target.getFullYear(), target.getMonth(), target.getDate() - targetDow);
      targetMonday.setHours(0,0,0,0);
      
      var diffMs = targetMonday - currentMonday;
      dateOffset = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
    } else {
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      todayStart.setHours(0,0,0,0);
      var targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate());
      targetStart.setHours(0,0,0,0);
      var diffDays = Math.round((targetStart - todayStart) / (24 * 60 * 60 * 1000));
      dateOffset = Math.floor(diffDays / days);
    }
  }
  
  renderPlanner();
  editEvent(id);
  
  var resultsDiv = document.getElementById("plannerSearchResults");
  if (resultsDiv) resultsDiv.style.display = "none";
  var searchInput = document.getElementById("plannerSearch");
  if (searchInput) searchInput.value = "";
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
            var timeStr = startStr + ' - ' + endStr;
            var detailsHtml = '';
            if (dur >= 50 && hasLoc) {
                detailsHtml = '<div class="event-time muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + timeStr + '</div>';
                detailsHtml += '<div class="event-loc muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ' + locStr + '</div>';
            } else {
                var combined = timeStr + (hasLoc ? ', ' + locStr : '');
                detailsHtml = '<div class="event-details muted" style="font-size:10.5px; color:inherit; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + combined + '</div>';
            }
            dragPreviewEl.innerHTML = '<div class="event-title" style="font-weight:600; font-size:11.5px; margin-bottom:2px; pointer-events:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + esc(title) + repeatIcon + '</div>' + detailsHtml;
            tgc.appendChild(dragPreviewEl);
          }
          
          if (dragPreviewEl.parentNode !== tgc) {
            dragPreviewEl.remove();
            tgc.appendChild(dragPreviewEl);
          }
          dragPreviewEl.style.top = startMin + 'px';
          dragPreviewEl.style.left = '0%';
          dragPreviewEl.style.width = 'calc(100% - 2px)';
          
          var timeDiv = dragPreviewEl.querySelector('.muted');
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
