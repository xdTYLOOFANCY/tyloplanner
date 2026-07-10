// TyloPlanner — tasks (to-do) module.

import { S, SET, safeRender } from './state.js';
import { todayStr, esc, api, debounce } from './utils.js';
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

// Next due date strictly after today for a recurring task, stepping from the
// current due date (or today if none). Keeps any time-of-day suffix.
export function nextDue(current, recurrence) {
  var time = current && current.length > 10 ? current.slice(10) : "";
  var base = current ? current.slice(0, 10) : todayStr();
  var d = new Date(base + "T00:00:00");
  if (isNaN(d)) d = new Date(todayStr() + "T00:00:00");
  var today = new Date(todayStr() + "T00:00:00");
  var anchorDay = d.getDate();
  var i = 0;
  do {
    if (recurrence === "weekly") d.setDate(d.getDate() + 7);
    else if (recurrence === "biweekly") d.setDate(d.getDate() + 14);
    else if (recurrence === "monthly") {
      // ponytail: day-of-month clamps to shorter months; anchorDay keeps
      // "the 31st" from drifting to the 30th permanently
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
      var dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(anchorDay, dim));
    } else d.setDate(d.getDate() + 1); // daily (and any unknown value)
  } while (d <= today && ++i < 1000);
  var iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return { due: iso, due_date: time ? iso + time : iso };
}

export async function toggleTask(id, done, refresh) {
  var t = S.tasks.find(function(x) { return x.id === id; });

  // Completing a recurring task reschedules it instead of finishing it:
  // due date advances to the next occurrence and its subtask checklist resets.
  if (done && t && t.recurrence && !t.parent_id) {
    var next = nextDue(t.due_date || t.due, t.recurrence);
    var updates = [api("PUT", "/api/tasks/" + id, {
      done: 0, completed_at: null,
      due: next.due,
      due_date: t.due_date ? next.due_date : null
    })];
    S.tasks.forEach(function(s) {
      if (s.parent_id === id && s.done) {
        updates.push(api("PUT", "/api/tasks/" + s.id, { done: 0, completed_at: null }));
      }
    });
    await Promise.all(updates);
    await refresh();
    return;
  }

  if (t) {
    t.done = done ? 1 : 0;
    t.completed_at = done ? todayStr() : null;
  }

  window.dispatchEvent(new CustomEvent("tylo:task-updated", {
    detail: { id: id, done: done }
  }));

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
// (Modals now use Alpine.js)

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

const saveModalCategoryColorsDebounced = debounce(async function(obj, refresh) {
  await api("POST", "/api/settings", { task_categories: JSON.stringify(obj) });
  if (refresh) await refresh();
}, 500);

export async function updateModalCategoryColor(name, color, refresh) {
  var cats = getTaskCategories();
  var cat = cats.find(function(c) { return c.name === name; });
  if (cat) {
    cat.color = color;
    var obj = {};
    cats.forEach(function(c) {
      obj[c.name] = c.color;
    });
    saveModalCategoryColorsDebounced(obj, refresh);
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
  // With an id we edit an existing task; without one (e.g. the dashboard /
  // tasks quick-create FAB) we open the modal in "create" mode with blank
  // fields. saveTaskModal() decides POST vs PUT from whether editTaskId is set.
  var t = id ? S.tasks.find(function(x) { return x.id === id; }) : null;
  if (id && !t) return;

  document.getElementById("editTaskId").value = t ? t.id : "";
  document.getElementById("editTaskName").value = t ? (t.name || "") : "";
  document.getElementById("editTaskCategory").value = t ? (t.category || "") : "";
  document.getElementById("editTaskDue").value = t ? (t.due_date || "") : "";
  document.getElementById("editTaskRecurrence").value = t ? (t.recurrence || "") : "";

  var titleEl = document.getElementById("taskModalTitle");
  if (titleEl) titleEl.textContent = t ? "Edit Task" : "Add Task";

  window.dispatchEvent(new CustomEvent('open-task-modal'));
}

export async function saveTaskModal(refresh) {
  var id = document.getElementById("editTaskId").value;
  var name = document.getElementById("editTaskName").value.trim();
  var category = document.getElementById("editTaskCategory").value || null;
  var due_date = document.getElementById("editTaskDue").value || null;
  var due = due_date ? due_date.substring(0, 10) : null;
  var recurrence = document.getElementById("editTaskRecurrence").value || null;

  if (!name) return;

  if (id) {
    await api("PUT", "/api/tasks/" + id, {
      name: name,
      category: category,
      due_date: due_date,
      due: due,
      recurrence: recurrence
    });
  } else {
    // Create mode (opened from the quick-create FAB with no task id).
    var maxOrder = -1;
    if (S.tasks && S.tasks.length) {
      S.tasks.forEach(function(t) {
        if (!t.parent_id && t.order_index > maxOrder) maxOrder = t.order_index;
      });
    }
    await api("POST", "/api/tasks", {
      name: name,
      done: 0,
      created: todayStr(),
      due: due,
      due_date: due_date,
      category: category,
      order_index: maxOrder + 1,
      recurrence: recurrence
    });
  }

  window.dispatchEvent(new CustomEvent('close-task-modal'));
  await refresh();
}

export function renderTasks() {
  safeRender("tasks", () => {
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

    var taskList = document.getElementById("taskList");
    if (!taskList) return;

    if (parentTasks.length === 0) {
      taskList.innerHTML = '<div class="muted">Nothing to do. Nice.</div>';
      return;
    }

    if (taskList.firstElementChild && taskList.firstElementChild.classList.contains("muted")) {
      taskList.innerHTML = '';
    }

    var existingCards = Array.from(taskList.querySelectorAll(".task-card"));
    var parentIds = new Set(parentTasks.map(function(t) { return String(t.id); }));

    existingCards.forEach(function(card) {
      if (!parentIds.has(card.dataset.id)) {
        card.remove();
      }
    });

    parentTasks.forEach(function(t, index) {
      var card = taskList.querySelector('.task-card[data-id="' + t.id + '"]');
      if (!card) {
        card = document.createElement("div");
        card.className = "task-card";
        card.dataset.id = t.id;
        card.draggable = true;

        card.addEventListener("dragstart", function(e) { window.dragTaskStart(e, t.id); });
        card.addEventListener("dragover", window.dragTaskOver);
        card.addEventListener("drop", function(e) { window.dropTask(e, t.id); });
        card.addEventListener("dragend", window.dragTaskEnd);

        var header = document.createElement("div");
        header.className = "task-header";

        var dragHandle = document.createElement("span");
        dragHandle.className = "task-drag-handle";
        dragHandle.style.cursor = "grab";
        dragHandle.style.color = "var(--muted)";
        dragHandle.textContent = "☰";

        var checkSpan = document.createElement("span");
        checkSpan.dataset.taskCheck = t.id;
        checkSpan.addEventListener("click", function() {
          var task = S.tasks.find(function(x) { return x.id === t.id; });
          if (task) window.toggleTask(t.id, !task.done);
        });

        var nameSpan = document.createElement("span");
        nameSpan.dataset.taskName = t.id;
        nameSpan.style.flex = "1";

        var badgeContainer = document.createElement("span");
        badgeContainer.className = "badge-container";

        var editBtn = document.createElement("button");
        editBtn.className = "btn ghost small";
        editBtn.style.padding = "2px 6px";
        editBtn.style.marginRight = "4px";
        editBtn.textContent = "✏️";
        editBtn.addEventListener("click", function() { window.openTaskModal(t.id); });

        var delBtn = document.createElement("button");
        delBtn.className = "btn danger small";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", function() { window.delRow('tasks', t.id); });

        header.appendChild(dragHandle);
        header.appendChild(checkSpan);
        header.appendChild(nameSpan);
        header.appendChild(badgeContainer);
        header.appendChild(editBtn);
        header.appendChild(delBtn);

        var subsContainer = document.createElement("div");
        subsContainer.className = "subtasks-container";

        var subList = document.createElement("div");
        subList.className = "subtasks-list";

        var addRow = document.createElement("div");
        addRow.className = "subtask-add-row";
        addRow.style.display = "flex";
        addRow.style.gap = "6px";
        addRow.style.marginTop = "6px";

        var subInput = document.createElement("input");
        subInput.type = "text";
        subInput.placeholder = "Add subtask...";
        subInput.className = "subtask-input";
        subInput.id = "subtask-input-" + t.id;
        subInput.style.fontSize = "12px";
        subInput.style.padding = "2px 6px";
        subInput.style.flex = "1";
        subInput.addEventListener("keydown", function(e) {
          if (e.key === 'Enter') window.addSubtask(t.id);
        });

        var addBtn = document.createElement("button");
        addBtn.className = "btn small";
        addBtn.style.padding = "2px 8px";
        addBtn.textContent = "+";
        addBtn.addEventListener("click", function() { window.addSubtask(t.id); });

        addRow.appendChild(subInput);
        addRow.appendChild(addBtn);

        subsContainer.appendChild(subList);
        subsContainer.appendChild(addRow);

        card.appendChild(header);
        card.appendChild(subsContainer);
      }

      var checkSpan = card.querySelector('[data-task-check="' + t.id + '"]');
      if (checkSpan) {
        checkSpan.className = "hcheck" + (t.done ? " on" : "");
        checkSpan.textContent = t.done ? "✓" : "";
      }

      var nameSpan = card.querySelector('[data-task-name="' + t.id + '"]');
      if (nameSpan) {
        nameSpan.className = "task-name" + (t.done ? " done" : "");
        nameSpan.textContent = t.name;
      }

      var badgeContainer = card.querySelector('.badge-container');
      if (badgeContainer) {
        badgeContainer.innerHTML = '';
        var catObj = cats.find(function(c) { return c.name === t.category; });
        var color = catObj ? catObj.color : '#4f8cff';
        if (t.category) {
          var catBadge = document.createElement("span");
          catBadge.className = "badge";
          catBadge.style.marginRight = "8px";
          catBadge.style.backgroundColor = color;
          catBadge.style.color = "#fff";
          catBadge.style.fontWeight = "600";
          catBadge.style.padding = "3px 8px";
          catBadge.style.borderRadius = "4px";
          catBadge.textContent = t.category;
          badgeContainer.appendChild(catBadge);
        }

        if (t.due_date || t.due) {
          var dueBadge = document.createElement("span");
          var isOverdue = false;
          var badgeText = "";
          if (t.due_date) {
            var now = new Date();
            var dueDt = new Date(t.due_date);
            isOverdue = !t.done && (dueDt < now);
            badgeText = t.due_date.replace("T", " ");
          } else {
            var nowStr = todayStr();
            isOverdue = !t.done && (t.due < nowStr);
            badgeText = t.due;
          }
          dueBadge.className = "badge " + (isOverdue ? "red" : "gray");
          dueBadge.style.marginRight = "8px";
          dueBadge.textContent = badgeText;
          badgeContainer.appendChild(dueBadge);
        }

        if (t.recurrence) {
          var recBadge = document.createElement("span");
          recBadge.className = "badge gray";
          recBadge.style.marginRight = "8px";
          recBadge.title = "Completing reschedules to the next occurrence";
          recBadge.textContent = "↻ " + t.recurrence;
          badgeContainer.appendChild(recBadge);
        }
      }

      var subtasks = S.tasks.filter(function(sub) { return sub.parent_id === t.id; });
      var subList = card.querySelector(".subtasks-list");
      if (subList) {
        var existingSubs = Array.from(subList.querySelectorAll(".subtask-row"));
        var subIds = new Set(subtasks.map(function(s) { return String(s.id); }));

        existingSubs.forEach(function(row) {
          if (!subIds.has(row.dataset.id)) {
            row.remove();
          }
        });

        subtasks.forEach(function(sub, subIdx) {
          var row = subList.querySelector('.subtask-row[data-id="' + sub.id + '"]');
          if (!row) {
            row = document.createElement("div");
            row.className = "subtask-row";
            row.dataset.id = sub.id;

            var subCheck = document.createElement("span");
            subCheck.dataset.taskCheck = sub.id;
            subCheck.addEventListener("click", function() {
              var sTask = S.tasks.find(function(x) { return x.id === sub.id; });
              if (sTask) window.toggleTask(sub.id, !sTask.done);
            });

            var subName = document.createElement("span");
            subName.dataset.taskName = sub.id;
            subName.style.flex = "1";

            var subEdit = document.createElement("button");
            subEdit.className = "btn ghost small";
            subEdit.style.padding = "1px 4px";
            subEdit.style.fontSize = "10px";
            subEdit.style.marginRight = "4px";
            subEdit.textContent = "✏️";
            subEdit.addEventListener("click", function() { window.openTaskModal(sub.id); });

            var subDel = document.createElement("button");
            subDel.className = "btn danger small";
            subDel.style.padding = "1px 5px";
            subDel.style.fontSize = "10px";
            subDel.textContent = "✕";
            subDel.addEventListener("click", function() { window.delRow('tasks', sub.id); });

            row.appendChild(subCheck);
            row.appendChild(subName);
            row.appendChild(subEdit);
            row.appendChild(subDel);
          }

          var subCheck = row.querySelector('[data-task-check="' + sub.id + '"]');
          if (subCheck) {
            subCheck.className = "hcheck" + (sub.done ? " on" : "");
            subCheck.textContent = sub.done ? "✓" : "";
          }

          var subName = row.querySelector('[data-task-name="' + sub.id + '"]');
          if (subName) {
            subName.className = "subtask-name" + (sub.done ? " done" : "");
            subName.textContent = sub.name;
          }

          if (subList.children[subIdx] !== row) {
            subList.insertBefore(row, subList.children[subIdx]);
          }
        });
      }

      if (taskList.children[index] !== card) {
        taskList.insertBefore(card, taskList.children[index]);
      }
    });
  });
}

// Global listener for localized DOM patching
window.addEventListener("tylo:task-updated", function(e) {
  const { id, done } = e.detail;
  
  // Patch checkboxes
  const checkEls = document.querySelectorAll(`[data-task-check="${id}"]`);
  checkEls.forEach(function(el) {
    if (done) {
      el.classList.add("on");
      el.textContent = "✓";
    } else {
      el.classList.remove("on");
      el.textContent = "";
    }
    // Update onclick handler with new state only if it was inline
    if (el.hasAttribute("onclick")) {
      el.setAttribute("onclick", `toggleTask('${id}', ${!done})`);
    }
  });

  // Patch task names
  const nameEls = document.querySelectorAll(`[data-task-name="${id}"]`);
  nameEls.forEach(function(el) {
    if (done) {
      el.classList.add("done");
    } else {
      el.classList.remove("done");
    }
  });
});


