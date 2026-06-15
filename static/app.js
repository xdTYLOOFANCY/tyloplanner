// TyloPlanner — main entry point.
// Imports every module and wires functions onto `window` so that
// inline onclick/onchange handlers in the HTML keep working.
"use strict";

import { refresh, SET } from './js/state.js';
import { todayStr, esc, delRow as _delRow } from './js/utils.js';
import { updateOfflineBanner, syncQueue } from './js/offline.js';
import { applyTheme, toggleTheme, applyAccentFromSettings } from './js/theme.js';
import { exportData, importData } from './js/backup.js';
import { renderDashboard, addShortcut as _addShortcut } from './js/dashboard.js';
import { renderAnalytics } from './js/analytics.js';
import { moveWeek, renderPlanner, openAdd, editEvent, closeEventModal, saveEventModal as _saveEventModal, delEventModal as _delEventModal, setPlannerRefresh, changePlannerView, openShortcutsModal, closeShortcutsModal, saveShortcuts, resetShortcutsToDefault, searchEvents, hideSearchSoon, navigateToAndEditEvent, handlePlannerSearchKeydown } from './js/planner.js';
import { addExam as _addExam, setGrade as _setGrade, renderExams } from './js/exams.js';
import { addHabit as _addHabit, delHabit as _delHabit, toggleHabit as _toggleHabit, renderHabits } from './js/habits.js';
import { addWorkout as _addWorkout, renderWorkouts } from './js/workouts.js';
import {
  addTask as _addTask, toggleTask as _toggleTask, renderTasks, addSubtask as _addSubtask,
  dragTaskStart, dragTaskOver, dragTaskEnd, dropTask,
  openCategoriesModal, closeCategoriesModal,
  addModalCategory as _addModalCategory, deleteModalCategory as _deleteModalCategory,
  updateModalCategoryColor as _updateModalCategoryColor, renameModalCategory as _renameModalCategory,
  openTaskModal, closeTaskModal, saveTaskModal as _saveTaskModal
} from './js/tasks.js';
import {
  renderNotes, newNote as _newNote, selectNote, openNote, noteChanged, deleteNote as _deleteNote,
  toggleNotePin, noteSearchInput, noteBodySearchInput, noteBodySearchNav,
  toggleNoteMode, noteInsert, toggleNoteReadMode, toggleNoteSplitOnly,
  handleNoteSearchKeydown, handleNoteBodySearchKeydown
} from './js/notes.js';
import {
  renderFiles, uploadFile as _uploadFile, delFile as _delFile, toggleFilePin, setFileSort,
  navigateToFolder, createFolderPrompt, renameFolderPrompt, changeFolderIconPrompt, deleteFolderConfirm,
  previewFile, closeMediaPreviewModal, renameFilePrompt,
  onFileDragStart, onFileDragEnd, onFolderDragOver, onFolderDragLeave, onFolderDrop,
  toggleSelectAllFiles, onFileSelectChange, moveSelectedFilesToFolder, deleteSelectedFiles,
  clearFileSelection, handleFileSearchKeydown
} from './js/files.js';
import {
  renderSettings, saveNotifySettings as _saveNotifySettings, testNotify,
  saveCalSync as _saveCalSync, calSyncNow as _calSyncNow,
  tfaStart, tfaConfirm as _tfaConfirm, tfaDisable as _tfaDisable,
  backupNow as _backupNow, copyIcs,
  importIcsFile as _importIcsFile, clearIcs as _clearIcs,
  stravaSaveConfig as _stravaSaveConfig, stravaForget as _stravaForget,
  stravaSync as _stravaSync, stravaDisconnect as _stravaDisconnect,
  saveAccentColor as _saveAccentColor, resetAccentColor as _resetAccentColor,
  toggleShowShortcuts as _toggleShowShortcuts, reorderShortcut as _reorderShortcut,
  toggleItem as _toggleItem, toggleTabPersistence as _toggleTabPersistence,
  addCustomCategory as _addCustomCategory, deleteCategory as _deleteCategory,
  updateCategoryColor as _updateCategoryColor, checkForUpdates
} from './js/settings.js';

// ---- renderAll used by refresh() ----
function renderAll() {
  renderDashboard(); renderAnalytics(); renderPlanner(); renderExams();
  renderHabits(); renderWorkouts(); renderTasks(); renderNotes(); renderFiles(); renderSettings(R);
}

// ---- wrappers that bind refresh ----
var R = function() { return refresh(renderAll); };
window.delRow = function(t, id) { _delRow(t, id, R); };
window.addShortcut = function() { _addShortcut(R); };
window.saveEventModal = function() { _saveEventModal(R); };
window.delEventModal = function() { _delEventModal(R); };
window.addExam = function() { _addExam(R); };
window.setGrade = function(id, val) { _setGrade(id, val, R); };
window.addHabit = function() { _addHabit(R); };
window.delHabit = function(id) { _delHabit(id, R); };
window.toggleHabit = function(id, iso) { _toggleHabit(id, iso, renderHabits, renderDashboard); };
window.addWorkout = function() { _addWorkout(R); };
window.addTask = function() { _addTask(R); };
window.toggleTask = function(id, done) { _toggleTask(id, done, R); };
window.addSubtask = function(parentId) { _addSubtask(parentId, R); };
window.dragTaskStart = dragTaskStart;
window.dragTaskOver = dragTaskOver;
window.dragTaskEnd = dragTaskEnd;
window.dropTask = function(e, dropId) { dropTask(e, dropId, R); };

window.openCategoriesModal = openCategoriesModal;
window.closeCategoriesModal = closeCategoriesModal;
window.addModalCategory = function() { _addModalCategory(R); };
window.deleteModalCategory = function(catName) { _deleteModalCategory(catName, R); };
window.updateModalCategoryColor = function(name, color) { _updateModalCategoryColor(name, color, R); };
window.renameModalCategory = function(oldName, newName) { _renameModalCategory(oldName, newName, R); };

window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTaskModal = function() { _saveTaskModal(R); };
window.newNote = function() { _newNote(R); };
window.deleteNote = function() { _deleteNote(R); };
window.uploadFile = function() { _uploadFile(R); };
window.delFile = function(id) { _delFile(id, R); };
window.navigateToFolder = navigateToFolder;
window.createFolderPrompt = function() { createFolderPrompt(R); };
window.renameFolderPrompt = function(id, oldName) { renameFolderPrompt(id, oldName, R); };
window.changeFolderIconPrompt = function(id, oldIcon) { changeFolderIconPrompt(id, oldIcon, R); };
window.deleteFolderConfirm = function(id) { deleteFolderConfirm(id, R); };
window.renameFilePrompt = function(id, oldName) { renameFilePrompt(id, oldName, R); };
window.previewFile = previewFile;
window.closeMediaPreviewModal = closeMediaPreviewModal;
window.onFileDragStart = onFileDragStart;
window.onFileDragEnd = onFileDragEnd;
window.onFolderDragOver = onFolderDragOver;
window.onFolderDragLeave = onFolderDragLeave;
window.onFolderDrop = onFolderDrop;
window.toggleSelectAllFiles = toggleSelectAllFiles;
window.onFileSelectChange = onFileSelectChange;
window.moveSelectedFilesToFolder = moveSelectedFilesToFolder;
window.deleteSelectedFiles = deleteSelectedFiles;
window.clearFileSelection = clearFileSelection;
window.refreshApp = R;
window.importData = function(ev) { importData(ev, R); };
window.saveNotifySettings = function() { _saveNotifySettings(R); };
window.saveCalSync = function() { _saveCalSync(R); };
window.calSyncNow = function() { _calSyncNow(R); };
window.importIcsFile = function() { _importIcsFile(R); };
window.clearIcs = function() { _clearIcs(R); };
window.stravaSaveConfig = function() { _stravaSaveConfig(R); };
window.stravaForget = function() { _stravaForget(R); };
window.stravaSync = function() { _stravaSync(R); };
window.stravaDisconnect = function() { _stravaDisconnect(R); };
window.tfaConfirm = function() { _tfaConfirm(R); };
window.tfaDisable = function() { _tfaDisable(R); };
window.backupNow = function() { _backupNow(R); };
window.saveAccentColor = function() { _saveAccentColor(R); };
window.resetAccentColor = function() { _resetAccentColor(R); };
window.toggleShowShortcuts = function() { _toggleShowShortcuts(R); };
window.searchEvents = searchEvents;
window.hideSearchSoon = hideSearchSoon;
window.navigateToAndEditEvent = navigateToAndEditEvent;
window.handlePlannerSearchKeydown = handlePlannerSearchKeydown;
window.toggleItem = function(id) { _toggleItem(id, R); };
window.toggleTabPersistence = function() { _toggleTabPersistence(R); };
window.addCustomCategory = function() { _addCustomCategory(R); };
window.deleteCategory = function(catName) { _deleteCategory(catName, R); };
window.updateCategoryColor = function(name, color) { _updateCategoryColor(name, color, R); };

window.dragShortcutStart = function(e, id) {
  e.dataTransfer.setData("text/plain", id);
  e.target.style.opacity = '0.5';
};
window.dragShortcutEnd = function(e) {
  e.target.style.opacity = '1';
};
window.dragShortcutOver = function(e) {
  e.preventDefault();
};
window.dropShortcut = function(e, dropId) {
  e.preventDefault();
  e.target.style.opacity = '1';
  var dragId = e.dataTransfer.getData("text/plain");
  if (dragId && dragId !== dropId) _reorderShortcut(dragId, dropId, R);
};

// direct pass-throughs (no refresh parameter needed)
window.moveWeek = moveWeek;
window.changePlannerView = changePlannerView;
window.openAdd = openAdd;
window.editEvent = editEvent;
window.closeEventModal = closeEventModal;
window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;
window.saveShortcuts = saveShortcuts;
window.resetShortcutsToDefault = resetShortcutsToDefault;
window.selectNote = selectNote;
window.openNote = openNote;
window.noteChanged = noteChanged;
window.noteSearchInput = noteSearchInput;
window.noteBodySearchInput = noteBodySearchInput;
window.noteBodySearchNav = noteBodySearchNav;
window.handleNoteSearchKeydown = handleNoteSearchKeydown;
window.handleNoteBodySearchKeydown = handleNoteBodySearchKeydown;
window.toggleNoteMode = toggleNoteMode;
window.toggleNoteReadMode = toggleNoteReadMode;
window.toggleNoteSplitOnly = toggleNoteSplitOnly;
window.noteInsert = noteInsert;
window.toggleNotePin = toggleNotePin;
window.toggleFilePin = toggleFilePin;
window.setFileSort = setFileSort;
window.renderFiles = renderFiles;
window.handleFileSearchKeydown = handleFileSearchKeydown;
window.toggleTheme = toggleTheme;
window.exportData = exportData;
window.testNotify = testNotify;
window.tfaStart = tfaStart;
window.copyIcs = copyIcs;
window.renderSettings = function(refresh) { renderSettings(refresh || R); };
window.checkForUpdates = checkForUpdates;

// ---------- tabs ----------
var tabsNav = document.getElementById("tabs");
tabsNav.addEventListener("click", function(e) {
  var b = e.target.closest("button"); if (!b) return;
  tabsNav.querySelectorAll("button").forEach(function(x) { x.classList.remove("active"); });
  b.classList.add("active");
  document.querySelectorAll("main section").forEach(function(s) { s.classList.remove("active"); });
  document.getElementById("tab-" + b.dataset.tab).classList.add("active");
  if (!SET || SET.persist_active_tab !== "0") {
    localStorage.setItem("active_tab", b.dataset.tab);
  } else {
    localStorage.removeItem("active_tab");
  }
});

// ---------- boot ----------
document.getElementById("wDate").value = todayStr();
applyTheme();

// Restore active tab
var savedTab = localStorage.getItem("active_tab");
if (savedTab) {
  var btn = document.querySelector("#tabs button[data-tab='" + savedTab + "']");
  if (btn) {
    tabsNav.querySelectorAll("button").forEach(function(x) { x.classList.remove("active"); });
    btn.classList.add("active");
    document.querySelectorAll("main section").forEach(function(s) { s.classList.remove("active"); });
    var sect = document.getElementById("tab-" + savedTab);
    if (sect) sect.classList.add("active");
  }
}

function showPwaUpdateBanner(worker) {
  var banner = document.getElementById("update-banner");
  if (!banner) return;
  banner.style.display = "flex";
  var btn = document.getElementById("update-btn");
  if (btn) {
    btn.onclick = function () {
      worker.postMessage({ type: "SKIP_WAITING" });
    };
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(function (reg) {
    if (reg.waiting) {
      showPwaUpdateBanner(reg.waiting);
    }
    reg.addEventListener("updatefound", function () {
      var installingWorker = reg.installing;
      if (installingWorker) {
        installingWorker.addEventListener("statechange", function () {
          if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
            showPwaUpdateBanner(installingWorker);
          }
        });
      }
    });
  }).catch(function() {});

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    window.location.reload();
  });
}

window.addEventListener("online", function() {
  syncQueue(R);
});
window.addEventListener("offline", function() {
  updateOfflineBanner();
});

refresh(renderAll).then(function() {
  setPlannerRefresh(R);
  updateOfflineBanner();
  checkForUpdates(false).catch(function() {});
  if (navigator.onLine) {
    syncQueue(R);
  }
  if (new URLSearchParams(location.search).get("strava") === "connected") {
    var toast_ = document.createElement("div"); toast_.className = "toast"; toast_.textContent = "Strava connected! Syncing\u2026";
    document.body.appendChild(toast_); setTimeout(function() { toast_.remove(); }, 2500);
    _stravaSync(R);
    history.replaceState({}, "", "/");
  }
}).catch(function(e) {
  updateOfflineBanner();
  document.getElementById("dashCards").innerHTML = '<div class="card">Could not reach the backend: ' + esc(e.message) + '</div>';
});
