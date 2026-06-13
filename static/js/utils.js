// TyloPlanner — shared utility functions.

// ---------- date helpers ----------
export function z(n) { return (n < 10 ? "0" : "") + n; }
export function toISO(d) { return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }
export function todayStr() { return toISO(new Date()); }
export function parseISO(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
export var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function weekDates(off) {
  var now = new Date(), dow = (now.getDay() + 6) % 7;
  var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + off * 7);
  var out = []; for (var i = 0; i < 7; i++) out.push(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
  return out;
}
export function getViewDates(view, off) {
  var now = new Date();
  if (view === 'month') {
    var m = new Date(now.getFullYear(), now.getMonth() + off, 1);
    var dow = (m.getDay() + 6) % 7;
    var start = new Date(m.getFullYear(), m.getMonth(), m.getDate() - dow);
    var out = [];
    for (var i = 0; i < 42; i++) out.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    return out;
  }
  var days = parseInt(view, 10) || 7;
  if (days === 7) return weekDates(off);
  var startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (off * days));
  var out = []; for (var i = 0; i < days; i++) out.push(new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + i));
  return out;
}
export function daysUntil(iso) { return Math.round((parseISO(iso) - parseISO(todayStr())) / 86400000); }
export function fmtShort(d) { return DAYS[(d.getDay() + 6) % 7] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; }

// ---------- DOM helpers ----------
export function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
export function toast(msg) {
  var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(function() { t.remove(); }, 2500);
}

// ---------- API ----------
export async function api(method, path, body) {
  var opt = { method: method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opt.body = JSON.stringify(body);
  var r = await fetch(path, opt);
  if (!r.ok) { var e = await r.json().catch(function() { return { error: r.statusText }; }); throw new Error(e.error || "request failed"); }
  return r.json();
}

// ---------- shared actions ----------
export async function delRow(table, id, refresh) {
  await api("DELETE", "/api/" + table + "/" + id);
  await refresh();
}
