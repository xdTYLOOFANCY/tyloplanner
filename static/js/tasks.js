// TyloPlanner — tasks (to-do) module.

import { S, SET } from './state.js';
import { todayStr, esc, api } from './utils.js';
import { getTaskCategories } from './settings.js';

export async function addTask(refresh) {
  var n = document.getElementById("taskName").value.trim(); if (!n) return;
  var cat = document.getElementById("taskCategory").value || null;
  var d = document.getElementById("taskDue").value;
  var dueStr = d ? d.substring(0, 10) : null;
  
  var maxOrder = -1;
  if (S.tasks && S.tasks.length) {
    S.tasks.forEach(function(t) {
      if (!t.parent_id && t.order_index > maxOrder) maxOrder = t.order_index;
    });
  }
  var orderIndex = maxOrder + 1;

  await api("POST", "/api/tasks", { 
    name: n, 
    done: 0, 
    created: todayStr(), 
    due: dueStr,
    due_date: d || null,
    category: cat,
    order_index: orderIndex
  });
  
  document.getElementById("taskName").value = "";
  document.getElementById("taskDue").value = "";
  var catSelect = document.getElementById("taskCategory");
  if (catSelect) catSelect.value = "";
  await refresh();
}

export async function addSubtask(parentId, refresh) {
  var inputEl = document.getElementById("subtask-input-" + parentId);
  if (!inputEl) return;
  var n = inputEl.value.trim();
  if (!n) return;
  
  await api("POST", "/api/tasks", {
    name: n,
    done: 0,
    created: todayStr(),
    parent_id: parentId
  });
  
  inputEl.value = "";
  await refresh();
}

export async function toggleTask(id, done, refresh) {
  await api("PUT", "/api/tasks/" + id, { done: done ? 1 : 0, completed_at: done ? todayStr() : null });
  await refresh();
}

export function dragTaskStart(e, id) {
  e.dataTransfer.setData("text/plain", id);
  setTimeout(function() {
    var el = document.querySelector('[data-id="' + id + '"]');
    if (el) el.classList.add("dragging");
  }, 0);
}

export function dragTaskOver(e) {
  e.preventDefault();
}

export function dragTaskEnd(e) {
  var rows = document.querySelectorAll(".task-card");
  rows.forEach(function(row) {
    row.classList.remove("dragging");
  });
}

export async function dropTask(e, dropId, refresh) {
  e.preventDefault();
  var dragId = e.dataTransfer.getData("text/plain");
  if (dragId && dragId !== dropId) {
    await reorderTasks(dragId, dropId, refresh);
  }
}

async function reorderTasks(dragId, dropId, refresh) {
  var parentTasks = S.tasks.filter(function(t) { return !t.parent_id; });
  parentTasks.sort(function(a, b) {
    return (a.order_index || 0) - (b.order_index || 0);
  });
  
  var dragIndex = parentTasks.findIndex(function(t) { return t.id === dragId; });
  var dropIndex = parentTasks.findIndex(function(t) { return t.id === dropId; });
  
  if (dragIndex === -1 || dropIndex === -1 || dragIndex === dropIndex) return;
  
  var [draggedTask] = parentTasks.splice(dragIndex, 1);
  parentTasks.splice(dropIndex, 0, draggedTask);
  
  var promises = parentTasks.map(function(t, idx) {
    if (t.order_index !== idx) {
      t.order_index = idx;
      return api("PUT", "/api/tasks/" + t.id, { order_index: idx });
    }
    return Promise.resolve();
  });
  
  await Promise.all(promises);
  await refresh();
}

// --- Categories Modal ---
export function openCategoriesModal() {
  document.getElementById("categoriesModal").style.display = "flex";
}

export function closeCategoriesModal() {
  document.getElementById("categoriesModal").style.display = "none";
}

export async function addModalCategory(refresh) {
  var input = document.getElementById("modalCategoryInput");
  var colorInput = document.getElementById("modalCategoryColor");
  if (!input) return;
  var newCat = input.value.trim();
  if (!newCat) return;
  var newColor = colorInput ? colorInput.value : "#4f8cff";
  
  var cats = getTaskCategories();
  var exists = cats.some(function(c) { return c.name.toLowerCase() === newCat.toLowerCase(); });
  if (!exists) {
    cats.push({ name: newCat, color: newColor });
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
    input.value = "";
    if (colorInput) colorInput.value = "#4f8cff";
    await refresh();
  }
}

export async function deleteModalCategory(catName, refresh) {
  var cats = getTaskCategories();
  var idx = cats.findIndex(function(c) { return c.name === catName; });
  if (idx !== -1) {
    cats.splice(idx, 1);
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
    await refresh();
  }
}

export async function updateModalCategoryColor(name, color, refresh) {
  var cats = getTaskCategories();
  var cat = cats.find(function(c) { return c.name === name; });
  if (cat) {
    cat.color = color;
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
    await refresh();
  }
}

export async function renameModalCategory(oldName, newName, refresh) {
  newName = newName.trim();
  if (!newName || oldName === newName) {
    await refresh();
    return;
  }
  
  var cats = getTaskCategories();
  var exists = cats.some(function(c) { return c.name.toLowerCase() === newName.toLowerCase(); });
  if (exists) {
    alert("Category already exists");
    await refresh();
    return;
  }
  
  var cat = cats.find(function(c) { return c.name === oldName; });
  if (cat) {
    cat.name = newName;
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
    
    // Update existing tasks in database
    var tasksToUpdate = S.tasks.filter(function(t) { return t.category === oldName; });
    var promises = tasksToUpdate.map(function(t) {
      return api("PUT", "/api/tasks/" + t.id, { category: newName });
    });
    await Promise.all(promises);
    await refresh();
  }
}

// --- Task Editing Modal ---
export function openTaskModal(id) {
  var t = S.tasks.find(function(x) { return x.id === id; });
  if (!t) return;
  
  document.getElementById("editTaskId").value = t.id;
  document.getElementById("editTaskName").value = t.name || "";
  document.getElementById("editTaskCategory").value = t.category || "";
  document.getElementById("editTaskDue").value = t.due_date || "";
  
  document.getElementById("taskModal").style.display = "flex";
}

export function closeTaskModal() {
  document.getElementById("taskModal").style.display = "none";
}

export async function saveTaskModal(refresh) {
  var id = document.getElementById("editTaskId").value;
  var name = document.getElementById("editTaskName").value.trim();
  var category = document.getElementById("editTaskCategory").value || null;
  var due_date = document.getElementById("editTaskDue").value || null;
  var due = due_date ? due_date.substring(0, 10) : null;
  
  if (!name) return;
  
  await api("PUT", "/api/tasks/" + id, {
    name: name,
    category: category,
    due_date: due_date,
    due: due
  });
  
  closeTaskModal();
  await refresh();
}

export function renderTasks() {
  var cats = getTaskCategories();
  
  // Populate both task creation and edit form category dropdowns
  var selectEl = document.getElementById("taskCategory");
  if (selectEl) {
    var currentVal = selectEl.value;
    var optHtml = '<option value="">Category (opt.)</option>';
    cats.forEach(function(c) {
      optHtml += '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
    });
    selectEl.innerHTML = optHtml;
    selectEl.value = currentVal;
  }
  
  var editSelectEl = document.getElementById("editTaskCategory");
  if (editSelectEl) {
    var editCurrentVal = editSelectEl.value;
    var optHtml = '<option value="">Category (opt.)</option>';
    cats.forEach(function(c) {
      optHtml += '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>';
    });
    editSelectEl.innerHTML = optHtml;
    editSelectEl.value = editCurrentVal;
  }

  // Populate Categories Modal List
  var modalListEl = document.getElementById("modalCategoriesList");
  if (modalListEl) {
    var catsHtml = "";
    cats.forEach(function(cat) {
      catsHtml += '<div class="list-item" style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">' +
        '<input type="color" value="' + esc(cat.color) + '" onchange="updateModalCategoryColor(\'' + esc(cat.name).replace(/'/g, "\\'") + '\', this.value)" style="width:28px; height:24px; padding:0; border:none; background:none; cursor:pointer;">' +
        '<input type="text" value="' + esc(cat.name) + '" onchange="renameModalCategory(\'' + esc(cat.name).replace(/'/g, "\\'") + '\', this.value)" style="flex:1; font-size:13px; padding:2px 6px; border:1px solid var(--border); border-radius:4px; background:var(--panel2); color:var(--text);">' +
        '<button class="btn danger small" onclick="deleteModalCategory(\'' + esc(cat.name).replace(/'/g, "\\'") + '\')">✕</button>' +
        '</div>';
    });
    modalListEl.innerHTML = catsHtml || '<div class="muted">No categories configured.</div>';
  }

  var parentTasks = S.tasks.filter(function(t) { return !t.parent_id; });
  parentTasks.sort(function(a, b) {
    return (a.order_index || 0) - (b.order_index || 0);
  });

  var html = "";
  parentTasks.forEach(function(t) {
    var catObj = cats.find(function(c) { return c.name === t.category; });
    var color = catObj ? catObj.color : '#4f8cff';
    var categoryBadge = t.category ? '<span class="badge" style="margin-right:8px; background-color:' + esc(color) + '; color:#fff; font-weight:600; padding:3px 8px; border-radius:4px;">' + esc(t.category) + '</span>' : '';
    
    var dueBadge = '';
    if (t.due_date) {
      var now = new Date();
      var dueDt = new Date(t.due_date);
      var isOverdue = !t.done && (dueDt < now);
      var formattedDue = t.due_date.replace("T", " ");
      var badgeClass = isOverdue ? 'red' : 'gray';
      dueBadge = '<span class="badge ' + badgeClass + '" style="margin-right:8px">' + esc(formattedDue) + '</span>';
    } else if (t.due) {
      var nowStr = todayStr();
      var isOverdue = !t.done && (t.due < nowStr);
      var badgeClass = isOverdue ? 'red' : 'gray';
      dueBadge = '<span class="badge ' + badgeClass + '" style="margin-right:8px">' + esc(t.due) + '</span>';
    }

    var subtasks = S.tasks.filter(function(sub) { return sub.parent_id === t.id; });
    var subtasksHtml = "";
    subtasks.forEach(function(sub) {
      subtasksHtml += '<div class="subtask-row">' +
        '<span class="hcheck' + (sub.done ? ' on' : '') + '" onclick="toggleTask(\'' + sub.id + '\',' + !sub.done + ')">' + (sub.done ? '✓' : '') + '</span>' +
        '<span class="subtask-name' + (sub.done ? ' done' : '') + '" style="flex:1">' + esc(sub.name) + '</span>' +
        '<button class="btn ghost small" style="padding: 1px 4px; font-size: 10px; margin-right: 4px;" onclick="openTaskModal(\'' + sub.id + '\')">✏️</button>' +
        '<button class="btn danger small" style="padding:1px 5px; font-size:10px;" onclick="delRow(\'tasks\',\'' + sub.id + '\')">✕</button>' +
        '</div>';
    });

    html += '<div class="task-card" draggable="true" data-id="' + t.id + '" ' +
      'ondragstart="dragTaskStart(event,\'' + t.id + '\')" ' +
      'ondragover="dragTaskOver(event)" ' +
      'ondrop="dropTask(event,\'' + t.id + '\')" ' +
      'ondragend="dragTaskEnd(event)">' +
      '<div class="task-header">' +
        '<span class="task-drag-handle" style="cursor:grab; color:var(--muted)">☰</span>' +
        '<span class="hcheck' + (t.done ? ' on' : '') + '" onclick="toggleTask(\'' + t.id + '\',' + !t.done + ')">' + (t.done ? '✓' : '') + '</span>' +
        '<span class="task-name' + (t.done ? ' done' : '') + '" style="flex:1">' + esc(t.name) + '</span>' +
        categoryBadge + dueBadge +
        '<button class="btn ghost small" style="padding: 2px 6px; margin-right: 4px;" onclick="openTaskModal(\'' + t.id + '\')">✏️</button>' +
        '<button class="btn danger small" onclick="delRow(\'tasks\',\'' + t.id + '\')">✕</button>' +
      '</div>' +
      '<div class="subtasks-container">' +
        '<div class="subtasks-list">' + subtasksHtml + '</div>' +
        '<div class="subtask-add-row" style="display:flex; gap:6px; margin-top:6px;">' +
          '<input type="text" placeholder="Add subtask..." class="subtask-input" id="subtask-input-' + t.id + '" style="font-size:12px; padding:2px 6px; flex:1" onkeydown="if(event.key===\'Enter\')addSubtask(\'' + t.id + '\')">' +
          '<button class="btn small" style="padding:2px 8px;" onclick="addSubtask(\'' + t.id + '\')">+</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  });

  document.getElementById("taskList").innerHTML = html || '<div class="muted">Nothing to do. Nice.</div>';
}

// --- Modal Event Listeners (Outside clicks, Enter, Escape key handling) ---
var taskModalEl = document.getElementById("taskModal");
if (taskModalEl) {
  taskModalEl.addEventListener("click", function(e) {
    if (e.target === this) {
      closeTaskModal();
    }
  });
  taskModalEl.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      var target = e.target;
      if (target && target.tagName !== 'BUTTON') {
        e.preventDefault();
        if (typeof window.saveTaskModal === "function") {
          window.saveTaskModal();
        }
      }
    }
  });
}

var categoriesModalEl = document.getElementById("categoriesModal");
if (categoriesModalEl) {
  categoriesModalEl.addEventListener("click", function(e) {
    if (e.target === this) {
      closeCategoriesModal();
    }
  });
}

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    var taskModal = document.getElementById("taskModal");
    if (taskModal && taskModal.style.display === "flex") {
      closeTaskModal();
    }
    var catsModal = document.getElementById("categoriesModal");
    if (catsModal && catsModal.style.display === "flex") {
      closeCategoriesModal();
    }
  }
});
