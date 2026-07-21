// TyloPlanner — main entry point.
// Imports every module and wires functions onto `window` so that
// inline onclick/onchange handlers in the HTML keep working.
"use strict";

import { refresh, SET, startLiveSync, tabNeedsRender } from './js/state.js';
import { todayStr, esc, fmtShort, delRow as _delRow } from './js/utils.js';
import { updateOfflineBanner, syncQueue } from './js/offline.js';
import { applyTheme, toggleTheme, applyAccentFromSettings, applyThemeStyleFromSettings, applyNavLayoutFromSettings } from './js/theme.js';
import { exportData, importData, exportArchive, importArchive } from './js/backup.js';
import { 
  renderDashboard, 
  addShortcut as _addShortcut,
  toggleEditMode,
  applyPreset,
  toggleWidgetPresence,
  toggleShowShortcuts as _toggleShowShortcuts,
  toggleShowShortcutsMobile as _toggleShowShortcutsMobile,
  reorderShortcut as _reorderShortcut,
  toggleItem as _toggleItem,
  showDashboardEventDetails
} from './js/dashboard.js';
import { renderAnalytics, populateSubjectList, addStudySession as _addStudySession } from './js/analytics.js';
import { moveWeek, renderPlanner, openAdd, editEvent, saveEventModal as _saveEventModal, delEventModal as _delEventModal, setPlannerRefresh, changePlannerView, saveShortcuts, resetShortcutsToDefault, searchEvents, hideSearchSoon, navigateToAndEditEvent, goToDate, showEventPopover, showDayPopover, closeEventPopover, duplicateEvent, deleteEventById, updateAllDayVisibility, toggleEvModalAllDay, setEventColor, handleQuickAddKeydown, quickAddOpen, handlePlannerSearchKeydown, togglePlannerCalendarsPanel as _togglePlannerCalendarsPanel, renderPlannerCalendarsPanel as _renderPlannerCalendarsPanel, toggleCalendarType as _toggleCalendarType, updateCalendarColor as _updateCalendarColor, togglePlannerTaskTray } from './js/planner.js';
import { addExam as _addExam, setGrade as _setGrade, setGradeText as _setGradeText, renderExams, examInlineEditFn, saveEctsGoal as _saveEctsGoal, saveGradeTarget as _saveGradeTarget, whatIfDialog as _examWhatIf, addTracker as _examAddTracker, selectTracker as _examSelectTracker, trackerMenu as _examTrackerMenu, editExamTags as _examEditTags, toggleTagFilter as _examToggleTagFilter, tagMenu as _examTagMenu } from './js/exams.js';
import { addHabit as _addHabit, archiveHabit as _archiveHabit, restoreHabit as _restoreHabit, permanentDeleteHabit as _permanentDeleteHabit, renameHabit as _renameHabit, editHabitFrequency as _editHabitFreq, habitMenu as _habitMenu, toggleHabit as _toggleHabit, toggleHeatmap as _toggleHeatmap, habitWeekNav as _habitWeekNav, dragHabitStart as _dragHabitStart, dragHabitOver as _dragHabitOver, dragHabitEnd as _dragHabitEnd, dropHabit as _dropHabit, renderHabits } from './js/habits.js';
import { addWorkout as _addWorkout, renderWorkouts, saveWorkoutGoal as _saveWorkoutGoal } from './js/workouts.js';
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
  openNoteHistory, previewRevision, restoreSelectedRevision, closeNoteHistory,
  handleNoteSearchKeydown, handleNoteBodySearchKeydown, notesGoBack, toggleNoteSearchBar,
  navigateToNoteFolder, createNoteFolderPrompt, renameNoteFolderPrompt, changeNoteFolderIconPrompt, deleteNoteFolderConfirm,
  toggleNoteFolderExpand, noteTreeFolderClick,
  noteContextMenu, noteFolderContextMenu,
  onNoteDragStart, onNoteDragEnd, onNoteFolderDragOver, onNoteFolderDragLeave, onNoteFolderDrop,
  onNoteFolderDragStart, onNoteFolderDragEnd,
  toggleNoteDownloadMenu, downloadNoteAs, downloadNoteFolder, downloadAllNotesNotebook,
  toggleNoteTagFilter, noteTagMenu, editCurrentNoteTags, toggleNoteOutline
} from './js/notes.js';
import {
  renderFiles, uploadFile, uploadCameraFile, uploadFolderInput, toggleFilePin, setFileSort, setFileView,
  setFilesView, navigateToFolder, toggleFolderExpand, filesNewMenu, filesContentMenu,
  createFolderPrompt, renameFolderPrompt, changeFolderIconPrompt, renameFilePrompt,
  previewFile, previewStep, previewDownload, previewOpenTab,
  fileContextMenu, folderContextMenu, trashItemMenu,
  fileClick, folderClick, fileCheck, folderCheck,
  onItemDragStart, onItemDragEnd, onFolderDragOver, onFolderDragLeave, onFolderDrop, onTrashDrop,
  toggleSelectAllFiles, clearFileSelection,
  trashSelected, restoreSelected, deleteForeverSelected, emptyTrashConfirm,
  downloadSelected, starSelected,
  openMoveDialog, moveDialogPick, moveDialogToggle, moveDialogNewFolder, confirmMoveDialog,
  saveStorageLimits, runStorageCleanup,
  handleFileSearchKeydown, fileSearchInput
} from './js/files.js';
import {
  renderSettings, saveNotifySettings as _saveNotifySettings, testNotify,
  saveCalSync as _saveCalSync, calSyncNow as _calSyncNow, saveAppTimezone as _saveAppTimezone, autoSetTimezone as _autoSetTimezone,
  tfaStart as _tfaStart, tfaConfirm as _tfaConfirm, tfaDisable as _tfaDisable,
  backupNow as _backupNow, copyIcs as _copyIcs,
  importIcsFile as _importIcsFile, clearIcs as _clearIcs,
  stravaSaveConfig as _stravaSaveConfig, stravaForget as _stravaForget,
  stravaSync as _stravaSync, stravaDisconnect as _stravaDisconnect,
  saveAppThemeStyle as _saveAppThemeStyle, saveNavLayout as _saveNavLayout, saveAccentColor as _saveAccentColor, resetAccentColor as _resetAccentColor,
  saveDensity as _saveDensity, saveWeekStart as _saveWeekStart, saveDefaultTab as _saveDefaultTab, saveSidebarCollapsedDefault as _saveSidebarCollapsedDefault,
  toggleTabPersistence as _toggleTabPersistence,
  addCustomCategory as _addCustomCategory, deleteCategory as _deleteCategory,
  updateCategoryColor as _updateCategoryColor, checkForUpdates,
  enableWebPush, disableWebPush, changePassword,
  revokeSession as _revokeSession
} from './js/settings.js';
import './js/study_timer.js';
import { renderMusic } from './js/music.js'; // binds its own window.* handlers
import { initSwipeGestures } from './js/swipe.js';
import { initPalette, openPalette } from './js/palette.js';
import { initTimers, openTimerConfig, startTimerFromWidget } from './js/timers.js';

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
  else if (tab === "music") renderMusic();
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

  // Keep the subject autocomplete fresh for whichever tab uses it (study form,
  // dashboard timer widget) — cheap and change-guarded.
  populateSubjectList();
  
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
window.saveGradeTarget = function(val) { _saveGradeTarget(val, R); };
window.examWhatIf = function() { _examWhatIf(); };
window.examAddTracker = function() { _examAddTracker(R); };
window.examSelectTracker = function(id) { _examSelectTracker(id, R); };
window.examTrackerMenu = function(ev, id) { _examTrackerMenu(ev, id, R); };
window.examEditTags = function(id) { _examEditTags(id, R); };
window.examToggleTagFilter = function(tag) { _examToggleTagFilter(tag, R); };
window.examTagMenu = function(ev, tag) { _examTagMenu(ev, tag, R); };
window._habitRefresh = R;
window.addHabit = function() { _addHabit(R); };
window.archiveHabit = function(id) { _archiveHabit(id, R); };
window.restoreHabit = function(id) { _restoreHabit(id, R); };
window.permanentDeleteHabit = function(id) { _permanentDeleteHabit(id, R); };
window.habitMenu = function(ev, id) { _habitMenu(ev, id, R); };
window.toggleHabit = function(id, iso) { _toggleHabit(id, iso); };
window.toggleHeatmap = function(id) { _toggleHeatmap(id); };
window.habitWeekNav = function(d) { _habitWeekNav(d); };
window.dragHabitStart = function(ev, id) { _dragHabitStart(ev, id); };
window.dragHabitOver = function(ev) { _dragHabitOver(ev); };
window.dragHabitEnd = function(ev) { _dragHabitEnd(ev); };
window.dropHabit = function(ev, id) { _dropHabit(ev, id, R); };
window.addWorkout = function() { _addWorkout(R); };
window.addStudySession = function() { _addStudySession(R); };
window.saveWorkoutGoal = function(key, val) { _saveWorkoutGoal(key, val, R); };
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
window.toggleNoteFolderExpand = toggleNoteFolderExpand;
window.noteTreeFolderClick = noteTreeFolderClick;
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
window.noteToggleTagFilter = toggleNoteTagFilter;
window.noteTagMenu = noteTagMenu;
window.editCurrentNoteTags = editCurrentNoteTags;
window.toggleNoteOutline = toggleNoteOutline;
window.uploadFile = uploadFile;
window.uploadCameraFile = uploadCameraFile;
window.uploadFolderInput = uploadFolderInput;
window.navigateToFolder = navigateToFolder;
window.setFilesView = setFilesView;
window.toggleFolderExpand = toggleFolderExpand;
window.filesNewMenu = filesNewMenu;
window.filesContentMenu = filesContentMenu;
window.createFolderPrompt = createFolderPrompt;
window.renameFolderPrompt = renameFolderPrompt;
window.changeFolderIconPrompt = changeFolderIconPrompt;
window.renameFilePrompt = renameFilePrompt;
window.previewFile = previewFile;
window.previewStep = previewStep;
window.previewDownload = previewDownload;
window.previewOpenTab = previewOpenTab;
window.fileContextMenu = fileContextMenu;
window.folderContextMenu = folderContextMenu;
window.trashItemMenu = trashItemMenu;
window.fileClick = fileClick;
window.folderClick = folderClick;
window.fileCheck = fileCheck;
window.folderCheck = folderCheck;
window.trashSelected = trashSelected;
window.restoreSelected = restoreSelected;
window.deleteForeverSelected = deleteForeverSelected;
window.emptyTrashConfirm = emptyTrashConfirm;
window.downloadSelected = downloadSelected;
window.starSelected = starSelected;
window.openMoveDialog = openMoveDialog;
window.moveDialogPick = moveDialogPick;
window.moveDialogToggle = moveDialogToggle;
window.moveDialogNewFolder = moveDialogNewFolder;
window.confirmMoveDialog = confirmMoveDialog;
window.saveStorageLimits = saveStorageLimits;
window.runStorageCleanup = runStorageCleanup;
window.togglePlannerCalendarsPanel = _togglePlannerCalendarsPanel;
window.renderPlannerCalendarsPanel = _renderPlannerCalendarsPanel;
window.togglePlannerTaskTray = togglePlannerTaskTray;
window.toggleCalendarType = function(id, checked) { _toggleCalendarType(id, checked); };
window.updateCalendarColor = function(id, color) { _updateCalendarColor(id, color); };

window.onItemDragStart = onItemDragStart;
window.onItemDragEnd = onItemDragEnd;
window.onFolderDragOver = onFolderDragOver;
window.onFolderDragLeave = onFolderDragLeave;
window.onFolderDrop = onFolderDrop;
window.onTrashDrop = onTrashDrop;
window.toggleSelectAllFiles = toggleSelectAllFiles;
window.clearFileSelection = clearFileSelection;
window.refreshApp = R;
window.importData = function(ev) { importData(ev, R); };
window.exportArchive = exportArchive;
window.importArchive = function(ev) { importArchive(ev, R); };
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
window.saveNavLayout = function() { _saveNavLayout(R); };
window.saveDensity = function() { _saveDensity(R); };
window.saveWeekStart = function() { _saveWeekStart(R); };
window.saveDefaultTab = function() { _saveDefaultTab(R); };
window.saveSidebarCollapsedDefault = function() { _saveSidebarCollapsedDefault(R); };
window.saveAccentColor = function() { _saveAccentColor(R); };
window.resetAccentColor = function() { _resetAccentColor(R); };
window.toggleShowShortcuts = function() { _toggleShowShortcuts(R); };
window.toggleShowShortcutsMobile = function() { _toggleShowShortcutsMobile(R); };
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
window.noteContextMenu = noteContextMenu;
window.noteFolderContextMenu = noteFolderContextMenu;
window.openNote = openNote;
window.notesGoBack = notesGoBack;
window.toggleNoteSearchBar = toggleNoteSearchBar;
window.noteChanged = noteChanged;
window.noteSearchInput = noteSearchInput;
window.noteBodySearchInput = noteBodySearchInput;
window.noteBodySearchNav = noteBodySearchNav;
window.noteReplaceCurrent = noteReplaceCurrent;
window.noteReplaceAll = noteReplaceAll;
window.openNoteHistory = openNoteHistory;
window.previewRevision = previewRevision;
window.restoreSelectedRevision = restoreSelectedRevision;
window.closeNoteHistory = closeNoteHistory;
window.handleNoteSearchKeydown = handleNoteSearchKeydown;
window.handleNoteBodySearchKeydown = handleNoteBodySearchKeydown;
window.toggleNotePin = toggleNotePin;
window.toggleNoteDownloadMenu = toggleNoteDownloadMenu;
window.downloadNoteAs = downloadNoteAs;
window.downloadNoteFolder = downloadNoteFolder;
window.downloadAllNotesNotebook = downloadAllNotesNotebook;
window.toggleFilePin = toggleFilePin;
window.setFileSort = setFileSort;
window.setFileView = setFileView;
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
window.applyPreset = applyPreset;
window.toggleWidgetPresence = toggleWidgetPresence;
window.showDashboardEventDetails = showDashboardEventDetails;

// ---------- tabs ----------
const TABS = ["dashboard", "analytics", "planner", "exams", "habits", "workouts", "tasks", "notes", "files", "music", "settings"];

var tabsNav = document.getElementById("tabs");
tabsNav.addEventListener("click", function(e) {
  var b = e.target.closest("button"); if (!b) return;
  
  const currentActiveBtn = tabsNav.querySelector("button.active");
  const oldTab = currentActiveBtn ? currentActiveBtn.dataset.tab : "dashboard";
  const newTab = b.dataset.tab;
  
  if (oldTab === newTab) return;

  // Directionless crossfade scoped to <main> (see style.css)
  var switchTab = function() {
    tabsNav.querySelectorAll("button").forEach(function(x) { x.classList.remove("active"); });
    b.classList.add("active");
    document.querySelectorAll("main section").forEach(function(s) { s.classList.remove("active"); });
    document.getElementById("tab-" + newTab).classList.add("active");

    // Render the target tab if it has stale state
    if (tabNeedsRender[newTab]) {
      renderTab(newTab);
    }
  };
  if (document.startViewTransition) document.startViewTransition(switchTab);
  else switchTab();

  if (!SET || SET.persist_active_tab !== "0") {
    localStorage.setItem("active_tab", newTab);
  } else {
    localStorage.removeItem("active_tab");
  }
  // Show/hide the customize button depending on tab
  var customizeBtn = document.getElementById("customizeBtn");
  if (customizeBtn) {
    customizeBtn.style.display = (newTab === "dashboard") ? "" : "none";
  }
  if (newTab === "planner" && window.innerWidth <= 640) {
    var pvSel = document.getElementById("plannerView");
    if (pvSel && (pvSel.value === "7" || pvSel.value === "5")) {
      pvSel.value = "1";
      changePlannerView("1");
    }
  }
});

// ---------- boot ----------
// Wire up <dialog> modals: open/close via window CustomEvents, plus backdrop-click-to-close.
const MODALS = {
  updateModal: 'update',
  taskModal: 'task',
  categoriesModal: 'categories',
  eventModal: 'event',
  shortcutsModal: 'shortcuts',
  mediaPreviewModal: 'media-preview',
  fileMoveModal: 'file-move',
  dashboardEventDetailsModal: 'dashboard-event',
  plannerCalendarsModal: 'planner-calendars',
};
for (const [id, slug] of Object.entries(MODALS)) {
  const dlg = document.getElementById(id);
  if (!dlg) continue;
  window.addEventListener(`open-${slug}-modal`, () => dlg.showModal());
  window.addEventListener(`close-${slug}-modal`, () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}
document.getElementById('mediaPreviewModal')?.addEventListener('close', () => {
  // Clear so audio/video stop playing — but the 'close' event fires async and
  // can land after the next preview already opened; don't wipe that one.
  const dlg = document.getElementById('mediaPreviewModal');
  if (!dlg.open) document.getElementById('mediaPreviewContainer').innerHTML = '';
});
document.getElementById('taskModal')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
    e.preventDefault();
    window.saveTaskModal();
  }
});

document.getElementById("wDate").value = todayStr();
// Header/sidebar date at boot — renderDashboard also sets these, but it only
// runs once the dashboard tab is opened (active tab persists across reloads).
(function() {
  var now = new Date(), s = fmtShort(now) + " " + now.getFullYear();
  var hd = document.getElementById("headerDate");
  if (hd) hd.textContent = s;
  var sb = document.getElementById("sidebarDate");
  if (sb) sb.textContent = s;
})();
applyTheme();

// Restore active tab. When the last tab isn't being persisted, fall back to the
// user's chosen landing tab (mirrored from the server setting).
// Pop-out player window (/?player=1) always boots straight into Music; the rest
// of the chrome is hidden by .player-mode, so no other tab is reachable.
var playerMode = document.body.classList.contains("player-mode");
if (playerMode) document.title = "Music — TyloPlanner";
var savedTab = playerMode ? "music" : (localStorage.getItem("active_tab") || localStorage.getItem("tylo-default-tab"));
if (savedTab) {
  var btn = document.querySelector("#tabs button[data-tab='" + savedTab + "']");
  if (btn) {
    tabsNav.querySelectorAll("button").forEach(function(x) { x.classList.remove("active"); });
    btn.classList.add("active");
    document.querySelectorAll("main section").forEach(function(s) { s.classList.remove("active"); });
    var sect = document.getElementById("tab-" + savedTab);
    if (sect) sect.classList.add("active");
  }
  // Show/hide the customize button depending on restored tab
  var custBtn = document.getElementById("customizeBtn");
  if (custBtn) {
    custBtn.style.display = (savedTab === "dashboard") ? "" : "none";
  }
} else {
  // Default tab is dashboard — customize button is already visible
}

if (window.innerWidth <= 640) {
  var pvInitSel = document.getElementById("plannerView");
  if (pvInitSel && (pvInitSel.value === "7" || pvInitSel.value === "5")) {
    pvInitSel.value = "1";
    changePlannerView("1");
  }
}

initSwipeGestures();
initPalette();
initTimers();
window.openCommandPalette = openPalette;
window.openTimerConfig = openTimerConfig;
window.startTimerFromWidget = startTimerFromWidget;

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
  applyNavLayoutFromSettings(SET);
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
