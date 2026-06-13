// TyloPlanner — main entry point.
// Imports every module and wires functions onto `window` so that
// inline onclick/onchange handlers in the HTML keep working.
"use strict";

import { refresh } from './js/state.js';
import { todayStr, esc, delRow as _delRow } from './js/utils.js';
import { applyTheme, toggleTheme, applyAccentFromSettings } from './js/theme.js';
import { exportData, importData } from './js/backup.js';
import { renderDashboard, addShortcut as _addShortcut } from './js/dashboard.js';
import { renderAnalytics } from './js/analytics.js';
import { moveWeek, renderPlanner, openAdd, editEvent, closeEventModal, saveEventModal as _saveEventModal, delEventModal as _delEventModal, setPlannerRefresh, changePlannerView, openShortcutsModal, closeShortcutsModal, saveShortcuts, resetShortcutsToDefault, searchEvents, hideSearchSoon, navigateToAndEditEvent } from './js/planner.js';
import { addExam as _addExam, setGrade as _setGrade, renderExams } from './js/exams.js';
import { addHabit as _addHabit, delHabit as _delHabit, toggleHabit as _toggleHabit, renderHabits } from './js/habits.js';
import { addWorkout as _addWorkout, renderWorkouts } from './js/workouts.js';
import { addTask as _addTask, toggleTask as _toggleTask, renderTasks } from './js/tasks.js';
import {
  renderNotes, newNote as _newNote, selectNote, openNote, noteChanged, deleteNote as _deleteNote,
  toggleNotePin, noteSearchInput, noteBodySearchInput, noteBodySearchNav,
  toggleNoteMode, noteInsert
} from './js/notes.js';
import { renderFiles, uploadFile as _uploadFile, delFile as _delFile, toggleFilePin, setFileSort } from './js/files.js';
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
  toggleItem as _toggleItem
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
window.newNote = function() { _newNote(R); };
window.deleteNote = function() { _deleteNote(R); };
window.uploadFile = function() { _uploadFile(R); };
window.delFile = function(id) { _delFile(id, R); };
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
window.toggleItem = function(id) { _toggleItem(id, R); };

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
window.toggleNoteMode = toggleNoteMode;
window.noteInsert = noteInsert;
window.toggleNotePin = toggleNotePin;
window.toggleFilePin = toggleFilePin;
window.setFileSort = setFileSort;
window.toggleTheme = toggleTheme;
window.exportData = exportData;
window.testNotify = testNotify;
window.tfaStart = tfaStart;
window.copyIcs = copyIcs;
window.renderSettings = function(refresh) { renderSettings(refresh || R); };

// ---------- tabs ----------
var tabsNav = document.getElementById("tabs");
tabsNav.addEventListener("click", function(e) {
  var b = e.target.closest("button"); if (!b) return;
  tabsNav.querySelectorAll("button").forEach(function(x) { x.classList.remove("active"); });
  b.classList.add("active");
  document.querySelectorAll("main section").forEach(function(s) { s.classList.remove("active"); });
  document.getElementById("tab-" + b.dataset.tab).classList.add("active");
});

// ---------- boot ----------
document.getElementById("wDate").value = todayStr();
applyTheme();
if ("serviceWorker" in navigator) { navigator.serviceWorker.register("/sw.js").catch(function() {}); }
refresh(renderAll).then(function() {
  setPlannerRefresh(R);
  if (new URLSearchParams(location.search).get("strava") === "connected") {
    var toast_ = document.createElement("div"); toast_.className = "toast"; toast_.textContent = "Strava connected! Syncing\u2026";
    document.body.appendChild(toast_); setTimeout(function() { toast_.remove(); }, 2500);
    _stravaSync(R);
    history.replaceState({}, "", "/");
  }
}).catch(function(e) {
  document.getElementById("dashCards").innerHTML = '<div class="card">Could not reach the backend: ' + esc(e.message) + '</div>';
});
