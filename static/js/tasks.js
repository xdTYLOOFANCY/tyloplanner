// TyloPlanner — tasks (to-do) module.

import { S } from './state.js';
import { todayStr, esc, api } from './utils.js';

export async function addTask(refresh) {
  var n = document.getElementById("taskName").value.trim(); if (!n) return;
  await api("POST", "/api/tasks", { name: n, done: 0, created: todayStr() });
  document.getElementById("taskName").value = "";
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
    html += '<div class="checkbox-task"><input type="checkbox" ' + (t.done ? 'checked' : '') + ' onchange="toggleTask(\'' + t.id + '\',this.checked)">' +
      '<span class="' + (t.done ? 'done' : '') + '" style="flex:1">' + esc(t.name) + '</span>' +
      '<button class="btn danger small" onclick="delRow(\'tasks\',\'' + t.id + '\')">✕</button></div>';
  });
  document.getElementById("taskList").innerHTML = html || '<div class="muted">Nothing to do. Nice.</div>';
}
