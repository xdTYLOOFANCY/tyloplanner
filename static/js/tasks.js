// TyloPlanner — tasks (to-do) module.

import { S } from './state.js';
import { todayStr, esc, api } from './utils.js';

export async function addTask(refresh) {
  var n = document.getElementById("taskName").value.trim(); if (!n) return;
  var d = document.getElementById("taskDue").value;
  await api("POST", "/api/tasks", { name: n, done: 0, created: todayStr(), due: d || null });
  document.getElementById("taskName").value = "";
  document.getElementById("taskDue").value = "";
  await refresh();
}

export async function toggleTask(id, done, refresh) {
  await api("PUT", "/api/tasks/" + id, { done: done ? 1 : 0, completed_at: done ? todayStr() : null });
  await refresh();
}

export function renderTasks() {
  var open = S.tasks.filter(function(t) { return !t.done; });
  var done = S.tasks.filter(function(t) { return t.done; });
  var html = "";
  open.concat(done).forEach(function(t) {
    var dueBadge = t.due ? '<span class="badge gray" style="margin-right:8px">' + esc(t.due) + '</span>' : '';
    html += '<div class="checkbox-task"><input type="checkbox" ' + (t.done ? 'checked' : '') + ' onchange="toggleTask(\'' + t.id + '\',this.checked)">' +
      '<span class="' + (t.done ? 'done' : '') + '" style="flex:1">' + esc(t.name) + '</span>' + dueBadge +
      '<button class="btn danger small" onclick="delRow(\'tasks\',\'' + t.id + '\')">✕</button></div>';
  });
  document.getElementById("taskList").innerHTML = html || '<div class="muted">Nothing to do. Nice.</div>';
}
