// TyloPlanner — exams & grades module.

import { S, safeRender } from './state.js';
import { esc, api, daysUntil, todayStr } from './utils.js';

export async function addExam(refresh) {
  var n = document.getElementById("examName").value.trim();
  var d = document.getElementById("examDate").value;
  if (!n || !d) { alert("Name and date required."); return; }
  var ects = parseFloat(document.getElementById("examEcts").value) || null;
  await api("POST", "/api/exams", { name: n, date: d, ects: ects });
  document.getElementById("examName").value = ""; document.getElementById("examDate").value = "";
  document.getElementById("examEcts").value = "";
  await refresh();
}

export async function setGrade(id, val, refresh) {
  var g = val === "" ? null : parseFloat(val);
  await api("PUT", "/api/exams/" + id, { grade: g });
  await refresh();
}

export function examBadge(d) {
  if (d < 0) return '<span class="badge gray">past</span>';
  if (d === 0) return '<span class="badge red">TODAY</span>';
  var cls = d < 7 ? "red" : (d < 21 ? "orange" : "green");
  return '<span class="badge ' + cls + '">' + d + 'd</span>';
}

export function renderExams() {
  safeRender("exams", () => {
    var list = S.exams.slice().sort(function(a, b) { return a.date.localeCompare(b.date); });
  var html = '<tr><th>Name</th><th>Date</th><th>Countdown</th><th>ECTS</th><th>Grade</th><th></th></tr>';
  list.forEach(function(e) {
    html += '<tr><td>' + esc(e.name) + '</td><td class="muted">' + esc(e.date) + '</td><td>' + examBadge(daysUntil(e.date)) + '</td>' +
      '<td>' + (e.ects || "—") + '</td>' +
      '<td><input type="number" step="0.1" min="1" max="10" value="' + (e.grade != null ? e.grade : "") + '" placeholder="—" onchange="setGrade(\'' + e.id + '\',this.value)"></td>' +
      '<td><button class="btn danger small" onclick="delRow(\'exams\',\'' + e.id + '\')">✕</button></td></tr>';
  });
    document.getElementById("examTable").innerHTML = html + (list.length ? "" : '<tr><td colspan="6" class="muted">No exams yet.</td></tr>');
  });
}
