// TyloPlanner — main entry point.
// Imports every module and wires functions onto `window` so that
// inline onclick/onchange handlers in the HTML keep working.
"use strict";

import { refresh, SET, startLiveSync, tabNeedsRender } from './js/state.js';
import { todayStr, esc, delRow as _delRow, navigateWithTransition } from './js/utils.js';
import { updateOfflineBanner, syncQueue } from './js/offline.js';
import { applyTheme, toggleTheme, applyAccentFromSettings, applyThemeStyleFromSettings } from './js/theme.js';
import { exportData, importData } from './js/backup.js';
import { 
  renderDashboard, 
  addShortcut as _addShortcut,
  toggleEditMode,
  cancelCustomize,
  saveCustomize,
  applyPreset,
  toggleWidgetPresence,
  startCardDrag,
  startResize,
  toggleShowShortcuts as _toggleShowShortcuts,
  reorderShortcut as _reorderShortcut,
  toggleItem as _toggleItem,
  showDashboardEventDetails
} from './js/dashboard.js';
import { renderAnalytics } from './js/analytics.js';
import { moveWeek, renderPlanner, openAdd, editEvent, saveEventModal as _saveEventModal, delEventModal as _delEventModal, setPlannerRefresh, changePlannerView, saveShortcuts, resetShortcutsToDefault, searchEvents, hideSearchSoon, navigateToAndEditEvent, goToDate, showEventPopover, showDayPopover, closeEventPopover, duplicateEvent, deleteEventById, updateAllDayVisibility, toggleEvModalAllDay, setEventColor, handleQuickAddKeydown, quickAddOpen, handlePlannerSearchKeydown, togglePlannerCalendarsPanel as _togglePlannerCalendarsPanel, renderPlannerCalendarsPanel as _renderPlannerCalendarsPanel, toggleCalendarType as _toggleCalendarType, updateCalendarColor as _updateCalendarColor } from './js/planner.js';
import { addExam as _addExam, setGrade as _setGrade, setGradeText as _setGradeText, renderExams, examInlineEditFn, saveEctsGoal as _saveEctsGoal } from './js/exams.js';
import { addHabit as _addHabit, delHabit as _delHabit, toggleHabit as _toggleHabit, renderHabits } from './js/habits.js';
import { addWorkout as _addWorkout, renderWorkouts } from './js/workouts.js';
import {
  addTask as _addTask, toggleTask as _toggleTask, renderTasks, addSubtask as _addSubtask,
  dragTaskStart, dragTaskOver, dragTaskEnd, dropTask,
  addModalCategory as _addModalCategory, deleteModalCategory as _deleteModalCategory,
  updateModalCategoryColor as _updateModalCategoryColor, renameModalCategory as _renameModalCategory,
  openTaskModal, saveTaskModal as _saveTaskModal
} from './js/tasks.js';
import {
  renderNotes, newNote as _newNote, selectNote, openNote, noteChanged, deleteNote as _deleteNote,
  toggleNotePin, noteSearchInput, noteBodySearchInput, noteBodySearchNav,
  noteReplaceCurrent, noteReplaceAll,
  handleNoteSearchKeydown, handleNoteBodySearchKeydown, notesGoBack, toggleNoteSearchBar,
  navigateToNoteFolder, createNoteFolderPrompt, renameNoteFolderPrompt, changeNoteFolderIconPrompt, deleteNoteFolderConfirm,
  onNoteDragStart, onNoteDragEnd, onNoteFolderDragOver, onNoteFolderDragLeave, onNoteFolderDrop,
  onNoteFolderDragStart, onNoteFolderDragEnd,
  toggleNoteDownloadMenu, downloadNoteAs, downloadNoteFolder, downloadAllNotesNotebook
} from './js/notes.js';
import {
  renderFiles, uploadFile as _uploadFile, uploadCameraFile as _uploadCameraFile, delFile as _delFile, toggleFilePin, setFileSort,
  navigateToFolder, createFolderPrompt, renameFolderPrompt, changeFolderIconPrompt, deleteFolderConfirm,
  previewFile, renameFilePrompt,
  onFileDragStart, onFileDragEnd, onFolderDragOver, onFolderDragLeave, onFolderDrop,
  toggleSelectAllFiles, onFileSelectChange, moveSelectedFilesToFolder, deleteSelectedFiles,
  clearFileSelection, handleFileSearchKeydown, fileSearchInput
} from './js/files.js';
import {
  renderSettings, saveNotifySettings as _saveNotifySettings, testNotify,
  saveCalSync as _saveCalSync, calSyncNow as _calSyncNow, saveAppTimezone as _saveAppTimezone, autoSetTimezone as _autoSetTimezone,
  tfaStart as _tfaStart, tfaConfirm as _tfaConfirm, tfaDisable as _tfaDisable,
  backupNow as _backupNow, copyIcs as _copyIcs,
  importIcsFile as _importIcsFile, clearIcs as _clearIcs,
  stravaSaveConfig as _stravaSaveConfig, stravaForget as _stravaForget,
  stravaSync as _stravaSync, stravaDisconnect as _stravaDisconnect,
  saveAppThemeStyle as _saveAppThemeStyle, saveAccentColor as _saveAccentColor, resetAccentColor as _resetAccentColor,
  toggleTabPersistence as _toggleTabPersistence,
  addCustomCategory as _addCustomCategory, deleteCategory as _deleteCategory,
  updateCategoryColor as _updateCategoryColor, checkForUpdates,
  enableWebPush, disableWebPush, changePassword,
  revokeSession as _revokeSession
} from './js/settings.js';
import './js/study_timer.js';
import { initSwipeGestures } from './js/swipe.js';

function getActiveTab() {
  const activeBtn = document.querySelector("#tabs button.active");
  return activeBtn ? activeBtn.dataset.tab : "dashboard";
}

function renderTab(tab) {
  if (tab === "dashboard") renderDashboard();
  else if (tab === "analytics") renderAnalytics();
  else if (tab === "planner") renderPlanner();
  else if (tab === "exams") renderExams(R);
  else if (tab === "habits") renderHabits();
  else if (tab === "workouts") renderWorkouts();
  else if (tab === "tasks") renderTasks();
  else if (tab === "notes") renderNotes();
  else if (tab === "files") renderFiles();
  else if (tab === "settings") renderSettings(R);
  
  if (tabNeedsRender[tab] !== undefined) {
    tabNeedsRender[tab] = false;
  }
}

// ---- renderAll used by refresh() ----
function renderAll() {
  // Mark all tabs as needing rendering since state has changed
  Object.keys(tabNeedsRender).forEach(function(t) {
    tabNeedsRender[t] = true;
  });
  
  // Render only the active tab immediately
  const activeTab = getActiveTab();
  renderTab(activeTab);
}

// ---- wrappers that bind refresh ----
var R = function() { return refresh(renderAll); };
window.refreshApp = R;
window.delRow = function(t, id) { _delRow(t, id, R); };
window.addShortcut = function() { _addShortcut(R); };
window.saveEventModal = function() { _saveEventModal(R); };
window.delEventModal = function() { _delEventModal(R); };
window.addExam = function() { _addExam(R); };
window.setGrade = function(id, val) { _setGrade(id, val, R); };
window.setGradeText = function(id, val) { _setGradeText(id, val, R); };
window.examInlineEdit = function(el, id, field, currentVal) { examInlineEditFn(el, id, field, currentVal, R); };
window.saveEctsGoal = function(val) { _saveEctsGoal(val, R); };
window.addHabit = function() { _addHabit(R); };
window.delHabit = function(id) { _delHabit(id, R); };
window.toggleHabit = function(id, iso) { _toggleHabit(id, iso); };
window.addWorkout = function() { _addWorkout(R); };
window.addTask = function() { _addTask(R); };
window.toggleTask = function(id, done) { _toggleTask(id, done, R); };
window.addSubtask = function(parentId) { _addSubtask(parentId, R); };
window.dragTaskStart = dragTaskStart;
window.dragTaskOver = dragTaskOver;
window.dragTaskEnd = dragTaskEnd;
window.dropTask = function(e, dropId) { dropTask(e, dropId, R); };

window.addModalCategory = function() { _addModalCategory(R); };
window.deleteModalCategory = function(catName) { _deleteModalCategory(catName, R); };
window.updateModalCategoryColor = function(name, color) { _updateModalCategoryColor(name, color, R); };
window.renameModalCategory = function(oldName, newName) { _renameModalCategory(oldName, newName, R); };

window.openTaskModal = openTaskModal;
window.saveTaskModal = function() { _saveTaskModal(R); };
window.newNote = function() {
  // Ensure we're on the Notes tab before creating, so the new note's editor is
  // visible (e.g. when triggered from the dashboard quick-create FAB).
  var notesBtn = document.querySelector("#tabs button[data-tab='notes']");
  if (notesBtn && !notesBtn.classList.contains("active")) notesBtn.click();
  _newNote(R);
};
window.deleteNote = function() { _deleteNote(R); };
window.navigateToNoteFolder = navigateToNoteFolder;
window.createNoteFolderPrompt = function() { createNoteFolderPrompt(R); };
window.renameNoteFolderPrompt = function(id, oldName) { renameNoteFolderPrompt(id, oldName, R); };
window.changeNoteFolderIconPrompt = function(id, oldIcon) { changeNoteFolderIconPrompt(id, oldIcon, R); };
window.deleteNoteFolderConfirm = function(id) { deleteNoteFolderConfirm(id, R); };
window.onNoteDragStart = onNoteDragStart;
window.onNoteDragEnd = onNoteDragEnd;
window.onNoteFolderDragOver = onNoteFolderDragOver;
window.onNoteFolderDragLeave = onNoteFolderDragLeave;
window.onNoteFolderDrop = onNoteFolderDrop;
window.onNoteFolderDragStart = onNoteFolderDragStart;
window.onNoteFolderDragEnd = onNoteFolderDragEnd;
window.uploadFile = function() { _uploadFile(R); };
window.uploadCameraFile = function() { _uploadCameraFile(R); };
window.delFile = function(id) { _delFile(id, R); };
window.navigateToFolder = navigateToFolder;
window.createFolderPrompt = function() { createFolderPrompt(R); };
window.renameFolderPrompt = function(id, oldName) { renameFolderPrompt(id, oldName, R); };
window.changeFolderIconPrompt = function(id, oldIcon) { changeFolderIconPrompt(id, oldIcon, R); };
window.deleteFolderConfirm = function(id) { deleteFolderConfirm(id, R); };
window.renameFilePrompt = function(id, oldName) { renameFilePrompt(id, oldName, R); };
window.previewFile = previewFile;
window.togglePlannerCalendarsPanel = _togglePlannerCalendarsPanel;
window.renderPlannerCalendarsPanel = _renderPlannerCalendarsPanel;
window.toggleCalendarType = function(id, checked) { _toggleCalendarType(id, checked); };
window.updateCalendarColor = function(id, color) { _updateCalendarColor(id, color); };

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
window.enableWebPush = function() { enableWebPush(R); };
window.disableWebPush = function() { disableWebPush(R); };
window.saveCalSync = function() { _saveCalSync(R); };
window.calSyncNow = function() { _calSyncNow(R); };
window.saveAppTimezone = function() { _saveAppTimezone(R); };
window.autoSetTimezone = function() { _autoSetTimezone(R); };
window.copyIcs = _copyIcs;
window.importIcsFile = function() { _importIcsFile(R); };
window.clearIcs = function() { _clearIcs(R); };
window.stravaSaveConfig = function() { _stravaSaveConfig(R); };
window.stravaForget = function() { _stravaForget(R); };
window.stravaSync = function() { _stravaSync(R); };
window.stravaDisconnect = function() { _stravaDisconnect(R); };
window.tfaStart = _tfaStart;
window.tfaConfirm = function() { _tfaConfirm(R); };
window.tfaDisable = function() { _tfaDisable(R); };
window.revokeSession = function(sid) { _revokeSession(sid, R); };
window.changePassword = function() { changePassword(R); };
window.backupNow = function() { _backupNow(R); };
window.saveAppThemeStyle = function() { _saveAppThemeStyle(R); };
window.saveAccentColor = function() { _saveAccentColor(R); };
window.resetAccentColor = function() { _resetAccentColor(R); };
window.toggleShowShortcuts = function() { _toggleShowShortcuts(R); };
window.searchEvents = searchEvents;
window.hideSearchSoon = hideSearchSoon;
window.navigateToAndEditEvent = navigateToAndEditEvent;
window.goToDate = goToDate;
window.showEventPopover = showEventPopover;
window.showDayPopover = showDayPopover;
window.closeEventPopover = closeEventPopover;
window.duplicateEvent = duplicateEvent;
window.deleteEventById = deleteEventById;
window.updateAllDayVisibility = updateAllDayVisibility;
window.toggleEvModalAllDay = toggleEvModalAllDay;
window.setEventColor = setEventColor;
window.handleQuickAddKeydown = handleQuickAddKeydown;
window.quickAddOpen = quickAddOpen;
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
window.saveShortcuts = saveShortcuts;
window.resetShortcutsToDefault = resetShortcutsToDefault;
window.selectNote = selectNote;
window.openNote = openNote;
window.notesGoBack = notesGoBack;
window.toggleNoteSearchBar = toggleNoteSearchBar;
window.noteChanged = noteChanged;
window.noteSearchInput = noteSearchInput;
window.noteBodySearchInput = noteBodySearchInput;
window.noteBodySearchNav = noteBodySearchNav;
window.noteReplaceCurrent = noteReplaceCurrent;
window.noteReplaceAll = noteReplaceAll;
window.handleNoteSearchKeydown = handleNoteSearchKeydown;
window.handleNoteBodySearchKeydown = handleNoteBodySearchKeydown;
window.toggleNotePin = toggleNotePin;
window.toggleNoteDownloadMenu = toggleNoteDownloadMenu;
window.downloadNoteAs = downloadNoteAs;
window.downloadNoteFolder = downloadNoteFolder;
window.downloadAllNotesNotebook = downloadAllNotesNotebook;
window.toggleFilePin = toggleFilePin;
window.setFileSort = setFileSort;
window.renderFiles = renderFiles;
window.fileSearchInput = fileSearchInput;
window.handleFileSearchKeydown = handleFileSearchKeydown;
window.toggleTheme = toggleTheme;
window.exportData = exportData;
window.testNotify = testNotify;
window.tfaStart = tfaStart;
window.copyIcs = copyIcs;
window.renderSettings = function(refresh) { renderSettings(refresh || R); };
window.checkForUpdates = checkForUpdates;

// Dashboard customization bindings
window.toggleEditMode = toggleEditMode;
window.cancelCustomize = cancelCustomize;
window.saveCustomize = saveCustomize;
window.applyPreset = applyPreset;
window.toggleWidgetPresence = toggleWidgetPresence;
window.startCardDrag = startCardDrag;
window.startResize = startResize;
window.showDashboardEventDetails = showDashboardEventDetails;

// ---------- tabs ----------
const TABS = ["dashboard", "analytics", "planner", "exams", "habits", "workouts", "tasks", "notes", "files", "settings"];

var tabsNav = document.getElementById("tabs");
tabsNav.addEventListener("click", function(e) {
  var b = e.target.closest("button"); if (!b) return;
  
  const currentActiveBtn = tabsNav.querySelector("button.active");
  const oldTab = currentActiveBtn ? currentActiveBtn.dataset.tab : "dashboard";
  const newTab = b.dataset.tab;
  
  if (oldTab === newTab) return;
  
  const oldIdx = TABS.indexOf(oldTab);
  const newIdx = TABS.indexOf(newTab);
  const direction = newIdx > oldIdx ? "forward" : "backward";

  navigateWithTransition(function() {
    tabsNav.querySelectorAll("button").forEach(function(x) { x.classList.remove("active"); });
    b.classList.add("active");
    document.querySelectorAll("main section").forEach(function(s) { s.classList.remove("active"); });
    document.getElementById("tab-" + newTab).classList.add("active");
    
    // Render the target tab if it has stale state
    if (tabNeedsRender[newTab]) {
      renderTab(newTab);
    }
  }, direction);

  if (!SET || SET.persist_active_tab !== "0") {
    localStorage.setItem("active_tab", newTab);
  } else {
    localStorage.removeItem("active_tab");
  }
  if (typeof window.updateFAB === "function") {
    window.updateFAB(newTab);
  }
  if (newTab === "planner" && window.innerWidth <= 640) {
    var pvSel = document.getElementById("plannerView");
    if (pvSel && (pvSel.value === "7" || pvSel.value === "5")) {
      pvSel.value = "1";
      changePlannerView("1");
    }
  }
});

// ---------- Floating Action Button (FAB) ----------
let currentActiveTab = "dashboard";

window.updateFAB = function(tab) {
  currentActiveTab = tab;
  
  const customizeBtn = document.getElementById("customizeBtn");
  if (customizeBtn) {
    customizeBtn.style.display = (tab === "dashboard") ? "" : "none";
  }
  const fabContainer = document.getElementById("globalFab");
  const fabBtn = document.getElementById("fabBtn");
  const fabIcon = document.getElementById("fabIcon");
  const fabMenu = document.getElementById("fabMenu");
  
  if (!fabContainer || !fabBtn || !fabIcon || !fabMenu) return;

  // Close menu if open
  fabMenu.classList.remove("open");
  fabBtn.style.transform = "";

  // Set FAB display and icon depending on tab
  if (tab === "dashboard") {
    fabContainer.style.display = "flex";
    fabIcon.textContent = "+";
  } else if (tab === "planner") {
    fabContainer.style.display = "flex";
    fabIcon.textContent = "📅";
  } else if (tab === "tasks") {
    fabContainer.style.display = "flex";
    fabIcon.textContent = "☑️";
  } else if (tab === "notes") {
    fabContainer.style.display = "flex";
    fabIcon.textContent = "📝";
  } else if (tab === "files") {
    fabContainer.style.display = "flex";
    fabIcon.textContent = "📁";
  } else {
    fabContainer.style.display = "none";
  }
};

window.handleFabClick = function(event) {
  event.stopPropagation();
  const fabMenu = document.getElementById("fabMenu");
  const fabBtn = document.getElementById("fabBtn");

  if (currentActiveTab === "planner") {
    if (typeof window.openAdd === "function") window.openAdd();
  } else if (currentActiveTab === "tasks") {
    if (typeof window.openTaskModal === "function") window.openTaskModal();
  } else if (currentActiveTab === "notes") {
    if (typeof window.newNote === "function") window.newNote();
  } else if (currentActiveTab === "files" || currentActiveTab === "dashboard") {
    // Toggle speed dial menu
    const isOpen = fabMenu.classList.toggle("open");
    if (isOpen) {
      fabBtn.style.transform = "rotate(45deg)";
      renderFabMenu();
    } else {
      fabBtn.style.transform = "";
    }
  }
};

// Close FAB menu when clicking outside
document.addEventListener("click", () => {
  const fabMenu = document.getElementById("fabMenu");
  const fabBtn = document.getElementById("fabBtn");
  if (fabMenu && fabMenu.classList.contains("open")) {
    fabMenu.classList.remove("open");
    if (fabBtn) fabBtn.style.transform = "";
  }
});

function renderFabMenu() {
  const fabMenu = document.getElementById("fabMenu");
  if (!fabMenu) return;

  let html = "";
  if (currentActiveTab === "files") {
    html = `
      <div class="fab-menu-item" onclick="document.getElementById('fileInput').click();">
        <span class="item-icon">📤</span> Upload File
      </div>
      <div class="fab-menu-item" onclick="document.getElementById('cameraInput').click();">
        <span class="item-icon">📸</span> Take Photo
      </div>
    `;
  } else if (currentActiveTab === "dashboard") {
    html = `
      <div class="fab-menu-item" onclick="if(typeof window.openAdd === 'function') window.openAdd();">
        <span class="item-icon">📅</span> Add Event
      </div>
      <div class="fab-menu-item" onclick="if(typeof window.openTaskModal === 'function') window.openTaskModal();">
        <span class="item-icon">☑️</span> Add Task
      </div>
      <div class="fab-menu-item" onclick="if(typeof window.newNote === 'function') window.newNote();">
        <span class="item-icon">📝</span> New Note
      </div>
    `;
  }
  fabMenu.innerHTML = html;
}

// ---------- boot ----------
// Wire up <dialog> modals: open/close via window CustomEvents, plus backdrop-click-to-close.
const MODALS = {
  updateModal: 'update',
  taskModal: 'task',
  categoriesModal: 'categories',
  eventModal: 'event',
  shortcutsModal: 'shortcuts',
  mediaPreviewModal: 'media-preview',
  dashboardEventDetailsModal: 'dashboard-event',
  plannerCalendarsModal: 'planner-calendars',
  mobileMenuModal: 'mobile-menu',
};
for (const [id, slug] of Object.entries(MODALS)) {
  const dlg = document.getElementById(id);
  if (!dlg) continue;
  window.addEventListener(`open-${slug}-modal`, () => dlg.showModal());
  window.addEventListener(`close-${slug}-modal`, () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}
document.getElementById('mediaPreviewModal')?.addEventListener('close', () => {
  document.getElementById('mediaPreviewContainer').innerHTML = '';
});
document.getElementById('taskModal')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    window.saveTaskModal();
  }
});

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
  window.updateFAB(savedTab);
} else {
  var activeBtn = document.querySelector("#tabs button.active");
  window.updateFAB(activeBtn ? activeBtn.dataset.tab : "dashboard");
}

if (window.innerWidth <= 640) {
  var pvInitSel = document.getElementById("plannerView");
  if (pvInitSel && (pvInitSel.value === "7" || pvInitSel.value === "5")) {
    pvInitSel.value = "1";
    changePlannerView("1");
  }
}

initSwipeGestures();

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
  var _swRefreshing = false;

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

  // Only reload after a user-initiated SKIP_WAITING message.
  // The _swRefreshing flag is set inside showPwaUpdateBanner's click handler.
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (_swRefreshing) return;
    _swRefreshing = true;
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
  applyThemeStyleFromSettings(SET);
  applyAccentFromSettings(SET);
  setPlannerRefresh(R);
  updateOfflineBanner();
  startLiveSync();
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
