// TyloPlanner — notes module (editor, markdown, search, cross-links).

import { S, safeRender } from './state.js';
import { esc, api, z, mdToHtml } from './utils.js';

var currentNote = null, noteTimer = null, noteMode = "edit";
var noteBodySearch = { q: "", idx: 0 };
var activeNoteFolderId = null;
var draggedNoteId = null;
var draggedNoteFolderId = null;
var lastNoteSearchQuery = "";
var noteSearchResults = null;
var noteSearchTimeout = null;

export function getNoteBreadcrumbs(folderId) {
  var path = [];
  var currentId = folderId;
  var limit = 20;
  while (currentId && limit > 0) {
    limit--;
    var folder = (S.note_folders || []).find(function(f) { return f.id === currentId; });
    if (folder) {
      path.unshift(folder);
      currentId = folder.parent_id;
    } else {
      break;
    }
  }
  return path;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function highlightText(text, q) {
  if (!q || !text) return esc(text || "");
  var res = "", lc = text.toLowerCase(), lq = q.toLowerCase(), i = 0;
  while (i < text.length) {
    var idx = lc.indexOf(lq, i);
    if (idx === -1) { res += esc(text.slice(i)); break; }
    res += esc(text.slice(i, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>';
    i = idx + q.length;
  }
  return res;
}
function highlightHtml(html, q) {
  if (!q) return html;
  var re = new RegExp('(' + escapeRegex(esc(q)) + ')(?![^<]*>)', 'gi');
  return html.replace(re, '<mark>$1</mark>');
}



function formatTime(timestamp) {
  var d = new Date(timestamp);
  return z(d.getHours()) + ":" + z(d.getMinutes()) + ":" + z(d.getSeconds());
}

function getWordCount(text) {
  if (!text) return 0;
  var cleanText = text.trim();
  if (cleanText === "") return 0;
  return cleanText.split(/\s+/).length;
}

function updateCountersAndPreview() {
  var ta = document.getElementById("noteBody");
  if (!ta) return;
  var text = ta.value || "";
  
  var wordCount = getWordCount(text);
  var charCount = text.length;
  
  var wcEl = document.getElementById("noteWordCount");
  var ccEl = document.getElementById("noteCharCount");
  if (wcEl) wcEl.textContent = wordCount + " " + (wordCount === 1 ? "word" : "words");
  if (ccEl) ccEl.textContent = charCount + " " + (charCount === 1 ? "character" : "characters");
  
  renderNoteView();
}

export function toggleNoteMode() {
  // Always split layout, mode toggling no longer needed.
}

export function toggleNoteReadMode() {
  if (!currentNote) return;
  var toggle = document.getElementById("noteReadToggle");
  var isRead = toggle ? toggle.checked : false;
  localStorage.setItem("note_read_mode_" + currentNote, isRead ? "true" : "false");
  applyNoteLayout();
}

export function toggleNoteSplitOnly() {
  if (!currentNote) return;
  var check = document.getElementById("noteSplitCheck");
  if (!check) return;
  
  var isSplit = !check.classList.contains("on");
  if (isSplit) {
    check.classList.add("on");
    check.textContent = "✓";
  } else {
    check.classList.remove("on");
    check.textContent = "";
  }
  
  localStorage.setItem("note_split_view_" + currentNote, isSplit ? "true" : "false");
  applyNoteLayout();
}

export function applyNoteLayout() {
  var readToggle = document.getElementById("noteReadToggle");
  var splitCheck = document.getElementById("noteSplitCheck");

  var isRead = readToggle ? readToggle.checked : false;
  var isSplit = splitCheck ? splitCheck.classList.contains("on") : true;

  // On phones the split preview is too cramped, so we never show editor +
  // preview side by side. Edit mode = textarea only; Read mode = preview only.
  // This also lets Read Mode actually work on mobile (the old CSS hard-hid the
  // preview with !important, which broke the read toggle entirely).
  var isMobile = window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  if (isMobile) isSplit = false;

  var ta = document.getElementById("noteBody");
  var view = document.getElementById("noteView");
  var toolbar = document.getElementById("noteToolbar");
  var searchBar = document.querySelector(".note-search-bar");
  var splitPane = document.querySelector(".note-split-pane");
  
  if (isRead) {
    if (ta) ta.style.display = "none";
    if (view) view.style.display = "";
    if (toolbar) toolbar.style.display = "none";
    if (searchBar) {
      searchBar.style.display = "";
      searchBar.classList.add("read-mode-search");
    }
    if (splitPane) splitPane.style.gridTemplateColumns = "1fr";
  } else {
    if (ta) ta.style.display = "";
    if (toolbar) toolbar.style.display = "";
    if (searchBar) {
      searchBar.style.display = "";
      searchBar.classList.remove("read-mode-search");
    }
    
    if (isSplit) {
      if (view) view.style.display = "";
      if (splitPane) splitPane.style.gridTemplateColumns = "";
    } else {
      if (view) view.style.display = "none";
      if (splitPane) splitPane.style.gridTemplateColumns = "1fr";
    }
  }
}

function renderNoteView() {
  var ta = document.getElementById("noteBody");
  var view = document.getElementById("noteView");
  var cnt = document.getElementById("noteBodySearchCount");
  var q = (noteBodySearch.q || "").toLowerCase().trim();
  var html = mdToHtml(ta ? ta.value : "");
  if (q) html = highlightHtml(html, q);
  if (view) view.innerHTML = html;
  
  if (view) {
    var marks = view.querySelectorAll("mark");
    var n = marks.length;
    if (noteBodySearch.idx >= n) noteBodySearch.idx = 0;
    if (marks[noteBodySearch.idx]) marks[noteBodySearch.idx].className = "cur";
    if (cnt) cnt.textContent = q ? (n ? (noteBodySearch.idx + 1) + "/" + n : "0 results") : "";
  }
}

function applyNoteMode() {
  updateCountersAndPreview();
  applyNoteLayout();
  
  var q = (noteBodySearch.q || "").toLowerCase().trim();
  var cnt = document.getElementById("noteBodySearchCount");
  var view = document.getElementById("noteView");
  if (cnt) {
    if (q && view) {
      var marks = view.querySelectorAll("mark");
      var n = marks.length;
      noteBodySearch.idx = Math.min(noteBodySearch.idx, Math.max(0, n - 1));
      cnt.textContent = n ? (noteBodySearch.idx + 1) + "/" + n : "0 results";
    } else {
      cnt.textContent = "";
    }
  }
}

export function noteInsert(type) {
  var ta = document.getElementById("noteBody");
  if (!ta) return;
  var s = ta.selectionStart, e = ta.selectionEnd, val = ta.value, sel = val.slice(s, e);
  var newVal, pos, ls;
  if (type === "bold") {
    newVal = val.slice(0, s) + "**" + sel + "**" + val.slice(e);
    pos = sel ? (s + 2 + sel.length + 2) : (s + 2);
  } else if (type === "italic") {
    newVal = val.slice(0, s) + "*" + sel + "*" + val.slice(e);
    pos = sel ? (s + 1 + sel.length + 1) : (s + 1);
  } else if (type === "heading") {
    ls = val.lastIndexOf("\n", s - 1) + 1;
    newVal = val.slice(0, ls) + "# " + val.slice(ls);
    pos = s + 2;
  } else if (type === "list") {
    ls = val.lastIndexOf("\n", s - 1) + 1;
    newVal = val.slice(0, ls) + "- " + val.slice(ls);
    pos = s + 2;
  } else if (type === "numlist") {
    ls = val.lastIndexOf("\n", s - 1) + 1;
    newVal = val.slice(0, ls) + "1. " + val.slice(ls);
    pos = s + 3;
  } else {
    var pre = (s > 0 && val[s - 1] !== "\n") ? "\n" : "";
    var ins = pre + "---\n";
    newVal = val.slice(0, s) + ins + val.slice(s);
    pos = s + ins.length;
  }
  ta.value = newVal;
  ta.selectionStart = ta.selectionEnd = pos;
  ta.focus();
  noteChanged();
}

export async function newNote(refresh) {
  noteMode = "edit";
  var payload = { title: "", body: "", updated: Date.now() };
  if (activeNoteFolderId) payload.folder_id = activeNoteFolderId;
  var r = await api("POST", "/api/notes", payload);
  currentNote = r.id;
  localStorage.setItem("active_note_id", r.id);
  await refresh();
  var titleEl = document.getElementById("noteTitle");
  if (titleEl) titleEl.focus();
}

export function openNote(id) {
  var btn = document.querySelector("#tabs button[data-tab='notes']");
  if (btn) btn.click();
  selectNote(id);
}

export function selectNote(id) {
  if (noteTimer && currentNote && currentNote !== id) {
    // Run the pending save in the background immediately
    var pendingNoteId = currentNote;
    var pendingTitle = document.getElementById("noteTitle").value;
    var pendingBody = document.getElementById("noteBody").value;
    clearTimeout(noteTimer);
    noteTimer = null;
    
    var n = S.notes.find(function(x) { return x.id === pendingNoteId; });
    var lastUpdated = n ? n.updated : 0;
    var updatedTime = Date.now();
    
    api("PUT", "/api/notes/" + pendingNoteId, {
      title: pendingTitle,
      body: pendingBody,
      updated: updatedTime,
      last_updated: lastUpdated
    }).then(function() {
      var n = S.notes.find(function(x) { return x.id === pendingNoteId; });
      if (n) { n.title = pendingTitle; n.body = pendingBody; n.updated = updatedTime; }
      renderNoteList();
    }).catch(function(err) {
      if (err.message && err.message.includes("conflict")) {
        var choice = prompt("This note was modified elsewhere. Overwrite or Reload?", "Reload");
        if (choice && choice.toLowerCase().startsWith("o")) {
          api("PUT", "/api/notes/" + pendingNoteId, {
            title: pendingTitle,
            body: pendingBody,
            updated: updatedTime,
            last_updated: Date.now() // force overwrite next time
          });
        } else {
          window.refreshApp && window.refreshApp();
        }
      } else {
        console.error(err);
      }
    });
  }
  currentNote = id;
  localStorage.setItem("active_note_id", id);
  renderNotes();
  // On mobile: activate editor-panel mode so the editor fills the screen
  var layout = document.querySelector(".noteslayout");
  if (layout) layout.classList.add("note-editing");
}

export function noteChanged() {
  clearTimeout(noteTimer);
  
  updateCountersAndPreview();
  
  var statusEl = document.getElementById("noteSaveStatus");
  if (statusEl) {
    statusEl.textContent = "Typing...";
    statusEl.className = "note-status typing";
  }
  
  var pendingNoteId = currentNote;
  var pendingTitle = document.getElementById("noteTitle").value;
  var pendingBody = document.getElementById("noteBody").value;
  
  noteTimer = setTimeout(async function() {
    if (!pendingNoteId) return;
    
    if (statusEl && currentNote === pendingNoteId) {
      statusEl.textContent = "Saving...";
      statusEl.className = "note-status saving";
    }
    
    try {
      var n = S.notes.find(function(x) { return x.id === pendingNoteId; });
      var lastUpdated = n ? n.updated : 0;
      var updatedTime = Date.now();
      await api("PUT", "/api/notes/" + pendingNoteId, {
        title: pendingTitle,
        body: pendingBody,
        updated: updatedTime,
        last_updated: lastUpdated
      });
      var n2 = S.notes.find(function(x) { return x.id === pendingNoteId; });
      if (n2) {
        n2.title = pendingTitle;
        n2.body = pendingBody;
        n2.updated = updatedTime;
      }
      renderNoteList();
      
      if (statusEl && currentNote === pendingNoteId) {
        statusEl.textContent = "Saved at " + formatTime(updatedTime);
        statusEl.className = "note-status saved";
      }
    } catch (err) {
      if (err.message === "conflict") {
        if (statusEl && currentNote === pendingNoteId) {
          statusEl.textContent = "Conflict! Modified elsewhere.";
          statusEl.className = "note-status danger";
        }
        var choice = prompt("This note was modified elsewhere. Overwrite or Reload?", "Reload");
        if (choice && choice.toLowerCase().startsWith("o")) {
          var updatedTime2 = Date.now();
          await api("PUT", "/api/notes/" + pendingNoteId, {
            title: pendingTitle,
            body: pendingBody,
            updated: updatedTime2,
            last_updated: updatedTime2 // force overwrite
          });
          var n3 = S.notes.find(function(x) { return x.id === pendingNoteId; });
          if (n3) {
            n3.title = pendingTitle;
            n3.body = pendingBody;
            n3.updated = updatedTime2;
          }
          renderNoteList();
          if (statusEl && currentNote === pendingNoteId) {
            statusEl.textContent = "Saved at " + formatTime(updatedTime2);
            statusEl.className = "note-status saved";
          }
        } else {
          window.refreshApp && window.refreshApp();
        }
      } else {
        if (statusEl && currentNote === pendingNoteId) {
          statusEl.textContent = "Error saving";
          statusEl.className = "note-status danger";
        }
        console.error(err);
      }
    }
  }, 500);
}

export async function deleteNote(refresh) {
  if (!confirm("Delete this note?")) return;
  await api("DELETE", "/api/notes/" + currentNote);
  currentNote = null;
  localStorage.removeItem("active_note_id");
  await refresh();
}

export async function toggleNotePin(id, ev) {
  ev.stopPropagation();
  var n = S.notes.find(function(x) { return x.id === id; });
  if (!n) return;
  var newPinned = n.is_pinned ? 0 : 1;
  await api("PUT", "/api/notes/" + id, { is_pinned: newPinned });
  n.is_pinned = newPinned;
  renderNoteList();
}

export function noteSearchInput() {
  var searchEl = document.getElementById("noteSearch");
  var q = (searchEl ? searchEl.value : "").trim().toLowerCase();
  
  if (q === lastNoteSearchQuery) return;
  lastNoteSearchQuery = q;
  
  if (noteSearchTimeout) clearTimeout(noteSearchTimeout);
  
  if (!q) {
    noteSearchResults = null;
    renderNoteList();
    return;
  }
  
  // Render local results immediately, then update once FTS5 finishes
  noteSearchResults = null;
  renderNoteList();
  
  noteSearchTimeout = setTimeout(function() {
    fetch("/api/notes/search?q=" + encodeURIComponent(q))
      .then(function(res) { return res.json(); })
      .then(function(ids) {
        if (lastNoteSearchQuery === q) {
          noteSearchResults = ids;
          renderNoteList();
        }
      })
      .catch(function() {
        if (lastNoteSearchQuery === q) {
          noteSearchResults = null;
          renderNoteList();
        }
      });
  }, 150);
}

export function handleNoteSearchKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    var listEl = document.getElementById("noteList");
    if (listEl) {
      var firstItem = listEl.querySelector(".list-item");
      if (firstItem) {
        firstItem.click();
      }
    }
  }
}

export function noteBodySearchInput() {
  var searchEl = document.getElementById("noteBodySearch");
  noteBodySearch.q = searchEl ? searchEl.value : "";
  noteBodySearch.idx = 0;
  applyNoteBodySearch(noteBodySearch.q.trim().length > 0);
}

export function handleNoteBodySearchKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    noteBodySearchNav(1);
  }
}

export function noteBodySearchNav(dir) {
  var q = (noteBodySearch.q || "").toLowerCase().trim();
  if (!q) return;
  var view = document.getElementById("noteView");
  var n = view ? view.querySelectorAll("mark").length : 0;
  if (!n) return;
  noteBodySearch.idx = (noteBodySearch.idx + dir + n) % n;
  applyNoteBodySearch(true);
}

function applyNoteBodySearch(jump) {
  var q = (noteBodySearch.q || "").toLowerCase().trim();
  var ta = document.getElementById("noteBody");
  var cnt = document.getElementById("noteBodySearchCount");
  if (!ta) return;
  
  renderNoteView();
  
  if (jump && q) {
    var view = document.getElementById("noteView");
    if (view) {
      var marks = view.querySelectorAll("mark");
      if (marks[noteBodySearch.idx]) {
        marks[noteBodySearch.idx].scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }
}

function isNoteDescendant(folderId, targetId) {
  if (!folderId || !targetId) return false;
  var currentId = folderId;
  var limit = 20;
  while (currentId && limit > 0) {
    limit--;
    if (currentId === targetId) return true;
    var folder = (S.note_folders || []).find(function(f) { return f.id === currentId; });
    currentId = folder ? folder.parent_id : null;
  }
  return false;
}

function renderNoteList() {
  var searchEl = document.getElementById("noteSearch");
  var q = (searchEl ? searchEl.value : "").trim().toLowerCase();
  
  // Render Folder Header
  var header = document.getElementById("noteFolderHeader");
  if (header) {
    var breadcrumbsHtml = '<div class="breadcrumbs" style="font-size:13px; margin-bottom:8px;">';
    breadcrumbsHtml += '<span class="breadcrumb-item' + (activeNoteFolderId ? '' : ' active') + '" onclick="navigateToNoteFolder(null)" ondragover="onNoteFolderDragOver(event)" ondragleave="onNoteFolderDragLeave(event)" ondrop="onNoteFolderDrop(event, null)">Root</span>';
    var path = getNoteBreadcrumbs(activeNoteFolderId);
    path.forEach(function(f, idx) {
      breadcrumbsHtml += '<span class="breadcrumb-separator">/</span>';
      var isLast = (idx === path.length - 1);
      var folderIcon = f.icon ? f.icon + ' ' : '';
      breadcrumbsHtml += '<span class="breadcrumb-item' + (isLast ? ' active' : '') + '" onclick="' + (isLast ? '' : 'navigateToNoteFolder(\'' + f.id + '\')') + '" ondragover="onNoteFolderDragOver(event)" ondragleave="onNoteFolderDragLeave(event)" ondrop="onNoteFolderDrop(event, \'' + f.id + '\')">' + folderIcon + esc(f.name) + '</span>';
    });
    breadcrumbsHtml += '</div>';
    
    if (activeNoteFolderId) {
      var currentFolder = (S.note_folders || []).find(function(f) { return f.id === activeNoteFolderId; });
      if (currentFolder) {
        var icon = currentFolder.icon || "📁";
        breadcrumbsHtml += '<div style="display:flex;gap:4px;margin-bottom:8px;">';
        breadcrumbsHtml += '<button class="btn small ghost" style="padding:2px 6px;font-size:11px;" onclick="renameNoteFolderPrompt(\'' + currentFolder.id + '\', \'' + esc(currentFolder.name).replace(/'/g, "\\'") + '\')">✏️ Rename</button>';
        breadcrumbsHtml += '<button class="btn small ghost" style="padding:2px 6px;font-size:11px;" onclick="changeNoteFolderIconPrompt(\'' + currentFolder.id + '\', \'' + esc(icon).replace(/'/g, "\\'") + '\')">🏷️ Icon</button>';
        breadcrumbsHtml += '<button class="btn small ghost" style="padding:2px 6px;font-size:11px;" onclick="downloadNoteFolder(\'' + currentFolder.id + '\')" title="Compile folder into a digital notebook">📓 Compiled HTML</button>';
        breadcrumbsHtml += '<button class="btn danger small" style="padding:2px 6px;font-size:11px;" onclick="deleteNoteFolderConfirm(\'' + currentFolder.id + '\')">✕ Delete</button>';
        breadcrumbsHtml += '<div style="flex:1"></div>';
        breadcrumbsHtml += '<button class="btn small ghost" style="padding:2px 6px;font-size:11px;" onclick="navigateToNoteFolder(' + (currentFolder.parent_id ? '\'' + currentFolder.parent_id + '\'' : 'null') + ')" title="Go Back">⬅️</button>';
        breadcrumbsHtml += '</div>';
      } else {
        activeNoteFolderId = null;
      }
    }
    header.innerHTML = breadcrumbsHtml;
  }
  
  // Render Folders
  var folders = (S.note_folders || []).slice();
  if (q) {
    folders = folders.filter(function(f) {
      var match = (f.name || "").toLowerCase().indexOf(q) !== -1;
      if (!match) return false;
      if (!activeNoteFolderId) return true;
      return f.id === activeNoteFolderId || isNoteDescendant(f.id, activeNoteFolderId);
    });
  } else {
    folders = folders.filter(function(f) { return f.parent_id === activeNoteFolderId; });
  }
  
  folders.sort(function(a, b) { return (a.order_index || 0) - (b.order_index || 0); });
  
  var fHtml = "";
  folders.forEach(function(f) {
    var icon = f.icon || "📁";
    fHtml += '<div class="list-item" style="padding:6px 10px; cursor:pointer;" draggable="true" ondragstart="onNoteFolderDragStart(event, \'' + f.id + '\')" ondragend="onNoteFolderDragEnd(event)" onclick="navigateToNoteFolder(\'' + f.id + '\')" ondragover="onNoteFolderDragOver(event)" ondragleave="onNoteFolderDragLeave(event)" ondrop="onNoteFolderDrop(event, \'' + f.id + '\')">' +
      '<span class="task-drag-handle" style="cursor:grab; color:var(--muted); margin-right:6px;">☰</span>' +
      '<span style="margin-right:8px;">' + esc(icon) + '</span>' +
      '<span style="font-weight:600;">' + esc(f.name) + '</span>' +
      '</div>';
  });
  var folderListEl = document.getElementById("noteFolderList");
  if (folderListEl) folderListEl.innerHTML = fHtml;

  // Render Notes
  var list = S.notes.slice();
  if (q) {
    if (noteSearchResults !== null) {
      list = list.filter(function(n) {
        var inFts = noteSearchResults.indexOf(n.id) !== -1;
        if (!inFts) return false;
        if (!activeNoteFolderId) return true;
        return n.folder_id === activeNoteFolderId || isNoteDescendant(n.folder_id, activeNoteFolderId);
      });
      list.sort(function(a, b) {
        return noteSearchResults.indexOf(a.id) - noteSearchResults.indexOf(b.id);
      });
    } else {
      list = list.filter(function(n) {
        var match = (n.title || "").toLowerCase().indexOf(q) !== -1 || (n.body || "").toLowerCase().indexOf(q) !== -1;
        if (!match) return false;
        if (!activeNoteFolderId) return true;
        return n.folder_id === activeNoteFolderId || isNoteDescendant(n.folder_id, activeNoteFolderId);
      });
      list.sort(function(a, b) {
        if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
        return (b.updated || 0) - (a.updated || 0);
      });
    }
  } else {
    list = list.filter(function(n) { return n.folder_id === activeNoteFolderId; });
    list.sort(function(a, b) {
      if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
      return (b.updated || 0) - (a.updated || 0);
    });
  }
  
  var html = "";
  list.forEach(function(n) {
    var title = n.title ? highlightText(n.title, q) : '<span class="muted">Untitled</span>';
    var snippet = "";
    if (q && (n.body || "").toLowerCase().indexOf(q) !== -1) {
      var lc = (n.body || "").toLowerCase(), midx = lc.indexOf(q);
      var start = Math.max(0, midx - 35), end = Math.min((n.body || "").length, midx + q.length + 50);
      snippet = '<div class="muted" style="line-height:1.4;margin:2px 0">' + (start > 0 ? "\u2026" : "") +
        highlightText((n.body || "").slice(start, end), q) + (end < (n.body || "").length ? "\u2026" : "") + '</div>';
    }
    var pinned = n.is_pinned ? 'note-pinned' : '';
    html += '<div class="list-item ' + pinned + (n.id === currentNote ? ' sel' : '') + '" data-id="' + n.id + '" onclick="selectNote(\'' + n.id + '\')" draggable="true" ondragstart="onNoteDragStart(event, \'' + n.id + '\')" ondragend="onNoteDragEnd(event)">' +
      '<button class="btn-pin" onclick="toggleNotePin(\'' + n.id + '\',event)" title="' + (n.is_pinned ? 'Unpin' : 'Pin') + '">\u2605</button>' +
      '<div class="grow"><div>' + title + '</div>' + snippet +
      '<div class="muted">' + new Date(n.updated || 0).toLocaleDateString() + '</div></div></div>';
  });
  var noteListEl = document.getElementById("noteList");
  if (noteListEl) {
    noteListEl.innerHTML = html || (q && !fHtml ? '<div class="muted">No notes match.</div>' : (!fHtml ? '<div class="muted">No notes yet.</div>' : ''));
  }
}

export function renderNotes() {
  safeRender("notes", () => {
    renderNoteList();
  
  if (currentNote === null) {
    var savedActiveNoteId = localStorage.getItem("active_note_id");
    if (savedActiveNoteId && S.notes.some(function(x) { return x.id === savedActiveNoteId; })) {
      currentNote = savedActiveNoteId;
    }
  }

  var ed = document.getElementById("noteEditor");
  var n = S.notes.find(function(x) { return x.id === currentNote; });
  if (!n) {
    currentNote = null;
    localStorage.removeItem("active_note_id");
    // On mobile: exit editor-panel mode
    var layout = document.querySelector(".noteslayout");
    if (layout) layout.classList.remove("note-editing");
    document.body.classList.remove("note-open");
    if (ed) ed.style.display = "none";
    return;
  }
  if (ed) ed.style.display = "block";
  var layout = document.querySelector(".noteslayout");
  if (layout) layout.classList.add("note-editing");
  document.body.classList.add("note-open");

  var titleEl = document.getElementById("noteTitle");
  var bodyEl = document.getElementById("noteBody");
  if (titleEl) titleEl.value = n.title || "";
  if (bodyEl) bodyEl.value = n.body || "";
  
  var statusEl = document.getElementById("noteSaveStatus");
  if (statusEl) {
    statusEl.textContent = "Saved at " + formatTime(n.updated || Date.now());
    statusEl.className = "note-status saved";
  }
  
  // Apply saved layout states
  if (currentNote) {
    var readToggle = document.getElementById("noteReadToggle");
    if (readToggle) {
      var savedRead = localStorage.getItem("note_read_mode_" + currentNote);
      readToggle.checked = savedRead === "true"; // default to false
    }
    
    var splitCheck = document.getElementById("noteSplitCheck");
    if (splitCheck) {
      var savedSplit = localStorage.getItem("note_split_view_" + currentNote);
      var isSplit = savedSplit !== "false"; // default to true
      if (isSplit) {
        splitCheck.classList.add("on");
        splitCheck.textContent = "✓";
      } else {
        splitCheck.classList.remove("on");
        splitCheck.textContent = "";
      }
    }
  }
  
  noteBodySearch.idx = 0;
    applyNoteMode();
  });
}

// Toggle the in-note search bar. On mobile it is collapsed by default to give
// the textarea maximum room; this reveals/hides it and focuses the field.
export function toggleNoteSearchBar() {
  var ed = document.getElementById("noteEditor");
  if (!ed) return;
  var open = ed.classList.toggle("note-search-open");
  var input = document.getElementById("noteBodySearch");
  if (open) {
    if (input) input.focus();
  } else if (input) {
    input.value = "";
    noteBodySearch.q = "";
    input.blur();
    updateCountersAndPreview();
  }
}

// Mobile panel navigation: go back from editor to note list
export function notesGoBack() {
  currentNote = null;
  localStorage.removeItem("active_note_id");
  var layout = document.querySelector(".noteslayout");
  if (layout) layout.classList.remove("note-editing");
  document.body.classList.remove("note-open");
  var ed = document.getElementById("noteEditor");
  if (ed) {
    ed.style.display = "none";
    ed.classList.remove("note-search-open");
  }
  renderNoteList();
}

export function navigateToNoteFolder(id) {
  activeNoteFolderId = id;
  renderNotes();
}

export async function createNoteFolderPrompt(refresh) {
  var name = prompt("Enter folder name:");
  if (name === null) return;
  name = name.trim();
  if (!name) { alert("Folder name cannot be empty."); return; }
  
  var actualRefresh = refresh || window.refreshApp;
  await api("POST", "/api/note_folders", {
    name: name,
    parent_id: activeNoteFolderId
  });
  if (actualRefresh) await actualRefresh();
}

export async function renameNoteFolderPrompt(id, oldName, refresh) {
  var name = prompt("Rename folder:", oldName);
  if (name === null) return;
  name = name.trim();
  if (!name) { alert("Folder name cannot be empty."); return; }
  
  var actualRefresh = refresh || window.refreshApp;
  await api("PUT", "/api/note_folders/" + id, { name: name });
  if (actualRefresh) await actualRefresh();
}

export async function changeNoteFolderIconPrompt(id, oldIcon, refresh) {
  var icon = prompt("Enter an emoji or character for this folder icon:", oldIcon || "📁");
  if (icon === null) return;
  icon = icon.trim();
  if (!icon) icon = "📁";
  
  var actualRefresh = refresh || window.refreshApp;
  await api("PUT", "/api/note_folders/" + id, { icon: icon });
  if (actualRefresh) await actualRefresh();
}

export async function deleteNoteFolderConfirm(id, refresh) {
  if (!confirm("Delete this folder? Its contents will be moved to the parent directory.")) return;
  
  var actualRefresh = refresh || window.refreshApp;
  await api("DELETE", "/api/note_folders/" + id);
  
  if (activeNoteFolderId === id) {
    var folders = S.note_folders || [];
    var folder = folders.find(function(f) { return f.id === id; });
    activeNoteFolderId = folder ? folder.parent_id : null;
  }
  
  if (actualRefresh) await actualRefresh();
}

export function onNoteDragStart(e, noteId) {
  draggedNoteId = noteId;
  e.dataTransfer.setData("text/plain", noteId);
  e.dataTransfer.effectAllowed = "move";
}

export function onNoteDragEnd(e) {
  draggedNoteId = null;
  document.querySelectorAll(".drag-over").forEach(function(el) {
    el.classList.remove("drag-over");
  });
}

export function onNoteFolderDragOver(e) {
  if (!draggedNoteId && !draggedNoteFolderId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  
  var el = e.currentTarget;
  if (el && !el.classList.contains("drag-over")) {
    el.classList.add("drag-over");
  }
}

export function onNoteFolderDragLeave(e) {
  var el = e.currentTarget;
  if (el) el.classList.remove("drag-over");
}

export async function onNoteFolderDrop(e, targetFolderId) {
  e.preventDefault();
  var el = e.currentTarget;
  if (el) el.classList.remove("drag-over");
  
  if (draggedNoteId) {
    var note = S.notes.find(function(n) { return n.id === draggedNoteId; });
    if (note && note.folder_id === targetFolderId) {
      draggedNoteId = null;
      return;
    }
    await api("POST", "/api/notes/move", {
      note_ids: [draggedNoteId],
      folder_id: targetFolderId
    });
    draggedNoteId = null;
    if (window.refreshApp) {
      await window.refreshApp();
    }
  } else if (draggedNoteFolderId) {
    if (draggedNoteFolderId !== targetFolderId) {
      await reorderNoteFolders(draggedNoteFolderId, targetFolderId, window.refreshApp);
    }
    draggedNoteFolderId = null;
  }
}

export function onNoteFolderDragStart(e, folderId) {
  draggedNoteFolderId = folderId;
  e.dataTransfer.setData("text/plain", folderId);
  e.dataTransfer.effectAllowed = "move";
  // Prevent click on drag
  e.stopPropagation();
}

export function onNoteFolderDragEnd(e) {
  draggedNoteFolderId = null;
  document.querySelectorAll(".drag-over").forEach(function(el) {
    el.classList.remove("drag-over");
  });
}

async function reorderNoteFolders(dragId, dropId, refresh) {
  var folders = (S.note_folders || []).filter(function(f) { return f.parent_id === activeNoteFolderId; });
  folders.sort(function(a, b) { return (a.order_index || 0) - (b.order_index || 0); });
  
  var dragIndex = folders.findIndex(function(f) { return f.id === dragId; });
  var dropIndex = folders.findIndex(function(f) { return f.id === dropId; });
  if (dragIndex === -1 || dropIndex === -1 || dragIndex === dropIndex) return;
  
  var [dragged] = folders.splice(dragIndex, 1);
  folders.splice(dropIndex, 0, dragged);
  
  var promises = [];
  for (var i = 0; i < folders.length; i++) {
    folders[i].order_index = i;
    promises.push(api("PUT", "/api/note_folders/" + folders[i].id, { order_index: i }));
  }
  await Promise.all(promises);
  
  if (refresh) await refresh();
}

/* Notes Download / Export Features */

function triggerDownload(content, filename, contentType) {
  var blob = new Blob([content], { type: contentType });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toggleNoteDownloadMenu(e) {
  if (e) e.stopPropagation();
  var el = document.getElementById("noteDownloadDropdown");
  if (el) {
    el.classList.toggle("show");
  }
}

// Global window event listener to close the dropdown when clicking outside
window.addEventListener('click', function(e) {
  var dropdown = document.getElementById("noteDownloadDropdown");
  if (dropdown && !dropdown.contains(e.target)) {
    dropdown.classList.remove("show");
  }
});

export function downloadNoteAs(format) {
  if (!currentNote) return;
  var note = S.notes.find(function(n) { return n.id === currentNote; });
  if (!note) return;
  
  var title = note.title || "Untitled";
  
  if (format === 'md') {
    triggerDownload(note.body || "", title + ".md", "text/markdown");
    var dropdown = document.getElementById("noteDownloadDropdown");
    if (dropdown) dropdown.classList.remove("show");
    return;
  }
  
  if (format === 'print') {
    var dropdown = document.getElementById("noteDownloadDropdown");
    if (dropdown) dropdown.classList.remove("show");
    window.print();
    return;
  }
  
  if (format === 'html') {
    var rawHtml = mdToHtml(note.body);
    // Replace wiki links with alert behavior in standalone mode
    var renderedHtml = rawHtml.replace(/onclick="openNote\('([^']+)'\);return false;"/g, 'onclick="alert(\'This link points to another note inside TyloPlanner. Download as a Compiled Notebook to make links interactive.\');return false;"');
    
    var theme = localStorage.getItem("tylo-theme") || "dark";
    var updatedDate = new Date(note.updated || Date.now()).toLocaleDateString();
    var wordCount = getWordCount(note.body);
    var charCount = note.body ? note.body.length : 0;
    
    // Directory breadcrumbs omitted for single note downloads
    
    var htmlContent = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    :root {
      --bg: #0f1115; --panel: #181b22; --panel2: #1f232c; --border: #2a2f3a;
      --text: #e8eaf0; --muted: #8b93a3; --accent: #4f8cff; --green: #3ecf8e;
      --radius: 12px;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
    }
    [data-theme="light"] {
      --bg: #f4f5f8; --panel: #ffffff; --panel2: #eef0f5; --border: #dcdfe6;
      --text: #1c2230; --muted: #69707f;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      margin: 0;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
      line-height: 1.6;
      transition: background 0.3s, color 0.3s;
    }
    .container {
      max-width: 800px;
      width: 100%;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 40px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 30px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .breadcrumbs {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .title {
      font-size: 2em;
      font-weight: 700;
      margin: 0 0 10px 0;
      line-height: 1.2;
    }
    .meta {
      font-size: 13px;
      color: var(--muted);
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .meta-divider {
      color: var(--border);
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .btn {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn:hover {
      background: var(--border);
    }
    .markdown-body {
      font-size: 15px;
    }
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
      margin-top: 24px;
      margin-bottom: 12px;
      font-weight: 600;
      line-height: 1.25;
    }
    .markdown-body h1 { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    .markdown-body h2 { font-size: 1.3em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    .markdown-body h3 { font-size: 1.15em; }
    .markdown-body p { margin-top: 0; margin-bottom: 16px; }
    .markdown-body ul, .markdown-body ol { padding-left: 24px; margin-top: 0; margin-bottom: 16px; }
    .markdown-body li { margin-bottom: 6px; }
    .markdown-body code {
      background: var(--panel2);
      padding: 3px 6px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 85%;
    }
    .markdown-body pre {
      background: var(--panel2);
      padding: 16px;
      border-radius: var(--radius);
      overflow-x: auto;
      margin-bottom: 16px;
      border: 1px solid var(--border);
    }
    .markdown-body pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
      font-size: 90%;
    }
    .markdown-body blockquote {
      margin: 0 0 16px 0;
      padding: 0 16px;
      color: var(--muted);
      border-left: 4px solid var(--border);
    }
    .markdown-body hr {
      height: 1px;
      border: none;
      background: var(--border);
      margin: 24px 0;
    }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .markdown-body th, .markdown-body td {
      padding: 8px 12px;
      border: 1px solid var(--border);
      text-align: left;
    }
    .markdown-body th {
      background: var(--panel2);
    }
    .note-link {
      color: var(--accent);
      text-decoration: none;
    }
    .note-link:hover {
      text-decoration: underline;
    }
    .note-link-missing {
      color: var(--muted);
      text-decoration: underline dashed;
      cursor: default;
    }
    .footer {
      margin-top: 50px;
      border-top: 1px solid var(--border);
      padding-top: 16px;
      font-size: 12px;
      color: var(--muted);
      text-align: center;
    }
    @media (max-width: 600px) {
      body { padding: 10px; }
      .container { padding: 20px; border-radius: 8px; }
      .header-bar { padding-bottom: 10px; margin-bottom: 15px; }
    }
    @media print {
      body { background: white !important; color: black !important; padding: 0; }
      .container { border: none !important; box-shadow: none !important; padding: 0; max-width: 100%; }
      .actions { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-bar">
      <div>
        <h1 class="title">${esc(title)}</h1>
        <div class="meta">
          <span>📅 ${updatedDate}</span>
          <span class="meta-divider">|</span>
          <span>⏱️ ${wordCount} ${wordCount === 1 ? 'word' : 'words'}</span>
          <span class="meta-divider">|</span>
          <span>🔤 ${charCount} ${charCount === 1 ? 'char' : 'chars'}</span>
        </div>
      </div>
      <div class="actions">
        <button class="btn" onclick="toggleLocalTheme()">🌓 Theme</button>
        <button class="btn" onclick="window.print()">🖨️ Print</button>
      </div>
    </div>
    <div class="markdown-body">
      ${renderedHtml}
    </div>
    <div class="footer">
      Note made with <a href="https://tyloplanner.brambiemans.com/" target="_blank" style="color: var(--accent); text-decoration: none; font-weight: 500;">TyloPlanner</a>
    </div>
  </div>
  <script>
    function toggleLocalTheme() {
      var current = document.documentElement.getAttribute('data-theme') || 'dark';
      document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    }
  </script>
</body>
</html>`;
    
    triggerDownload(htmlContent, title + ".html", "text/html");
    var dropdown = document.getElementById("noteDownloadDropdown");
    if (dropdown) dropdown.classList.remove("show");
  }
}

function compileDigitalNotebook(rootFolderId, notebookTitle) {
  var exportedFolders = [];
  var exportedNotes = [];

  function isFolderDescendantOf(folderId, ancestorId) {
    if (!folderId || !ancestorId) return false;
    var currentId = folderId;
    var limit = 20;
    while (currentId && limit > 0) {
      limit--;
      var folder = (S.note_folders || []).find(function(f) { return f.id === currentId; });
      currentId = folder ? folder.parent_id : null;
    }
    return false;
  }

  if (rootFolderId) {
    var rootFolder = S.note_folders.find(function(f) { return f.id === rootFolderId; });
    if (rootFolder) exportedFolders.push(rootFolder);
    
    (S.note_folders || []).forEach(function(f) {
      if (isFolderDescendantOf(f.id, rootFolderId)) {
        exportedFolders.push(f);
      }
    });
    
    (S.notes || []).forEach(function(n) {
      if (n.folder_id === rootFolderId || isFolderDescendantOf(n.folder_id, rootFolderId)) {
        exportedNotes.push(n);
      }
    });
  } else {
    exportedFolders = S.note_folders || [];
    exportedNotes = S.notes || [];
  }

  var renderedNotesMap = {};
  exportedNotes.forEach(function(n) {
    var rawHtml = mdToHtml(n.body);
    // Replace openNote with showNote
    var localHtml = rawHtml.replace(/onclick="openNote\('([^']+)'\);return false;"/g, 'href="#note-$1" onclick="showNote(\'$1\');return false;"');
    
    renderedNotesMap[n.id] = {
      id: n.id,
      title: n.title || "Untitled",
      body: n.body || "",
      html: localHtml,
      updated: n.updated || Date.now(),
      folder_id: n.folder_id
    };
  });

  var theme = localStorage.getItem("tylo-theme") || "dark";
  
  var htmlContent = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(notebookTitle)}</title>
  <style>
    :root {
      --bg: #0f1115; --panel: #181b22; --panel2: #1f232c; --border: #2a2f3a;
      --text: #e8eaf0; --muted: #8b93a3; --accent: #4f8cff; --accent2: #7c5cff;
      --green: #3ecf8e; --radius: 12px;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
    }
    [data-theme="light"] {
      --bg: #f4f5f8; --panel: #ffffff; --panel2: #eef0f5; --border: #dcdfe6;
      --text: #1c2230; --muted: #69707f;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      height: 100vh;
      display: flex;
      overflow: hidden;
      line-height: 1.6;
      transition: background 0.3s, color 0.3s;
    }
    
    .sidebar {
      width: 280px;
      background: var(--panel);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      transition: transform 0.3s ease;
      z-index: 100;
    }
    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid var(--border);
    }
    .sidebar-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .search-box {
      width: 100%;
      background: var(--panel2);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
    }
    .search-box:focus {
      outline: 1px solid var(--accent);
    }
    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 15px 10px;
    }
    
    .folder-item {
      margin-bottom: 4px;
    }
    .folder-header {
      display: flex;
      align-items: center;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      transition: background 0.2s;
    }
    .folder-header:hover {
      background: var(--panel2);
    }
    .folder-toggle {
      font-size: 9px;
      width: 12px;
      margin-right: 6px;
      color: var(--muted);
      transition: transform 0.2s;
      display: inline-block;
      text-align: center;
    }
    .folder-toggle.open {
      transform: rotate(90deg);
    }
    .folder-icon {
      margin-right: 6px;
    }
    .folder-children {
      padding-left: 16px;
      margin-top: 2px;
      display: none;
    }
    .folder-children.open {
      display: block;
    }
    .note-item {
      display: block;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      color: var(--muted);
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
      transition: all 0.2s;
    }
    .note-item:hover {
      background: var(--panel2);
      color: var(--text);
    }
    .note-item.active {
      background: rgba(79, 140, 255, 0.1);
      color: var(--accent);
      font-weight: 500;
    }
    
    .main-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg);
      overflow: hidden;
    }
    .top-bar {
      height: 60px;
      border-bottom: 1px solid var(--border);
      background: var(--panel);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 30px;
      flex-shrink: 0;
    }
    .top-bar-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .menu-toggle {
      display: none;
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 20px;
      cursor: pointer;
    }
    .breadcrumbs {
      font-size: 12px;
      color: var(--muted);
    }
    .top-bar-right {
      display: flex;
      gap: 8px;
    }
    
    .btn {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn:hover {
      background: var(--border);
    }
    
    .content-area {
      flex: 1;
      overflow-y: auto;
      padding: 40px 30px;
      display: flex;
      justify-content: center;
    }
    .note-container {
      max-width: 800px;
      width: 100%;
    }
    .note-header {
      margin-bottom: 25px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 15px;
    }
    .note-title {
      font-size: 2.2em;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .note-meta {
      font-size: 13px;
      color: var(--muted);
      display: flex;
      gap: 12px;
    }
    .note-meta-divider {
      color: var(--border);
    }
    
    .markdown-body {
      font-size: 15px;
    }
    .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
      margin-top: 24px;
      margin-bottom: 12px;
      font-weight: 600;
      line-height: 1.25;
    }
    .markdown-body h1 { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    .markdown-body h2 { font-size: 1.3em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
    .markdown-body h3 { font-size: 1.15em; }
    .markdown-body p { margin-top: 0; margin-bottom: 16px; }
    .markdown-body ul, .markdown-body ol { padding-left: 24px; margin-top: 0; margin-bottom: 16px; }
    .markdown-body li { margin-bottom: 6px; }
    .markdown-body code {
      background: var(--panel2);
      padding: 3px 6px;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 85%;
    }
    .markdown-body pre {
      background: var(--panel2);
      padding: 16px;
      border-radius: var(--radius);
      overflow-x: auto;
      margin-bottom: 16px;
      border: 1px solid var(--border);
    }
    .markdown-body pre code {
      background: transparent;
      padding: 0;
      border-radius: 0;
      font-size: 90%;
    }
    .markdown-body blockquote {
      margin: 0 0 16px 0;
      padding: 0 16px;
      color: var(--muted);
      border-left: 4px solid var(--border);
    }
    .markdown-body hr {
      height: 1px;
      border: none;
      background: var(--border);
      margin: 24px 0;
    }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .markdown-body th, .markdown-body td {
      padding: 8px 12px;
      border: 1px solid var(--border);
      text-align: left;
    }
    .markdown-body th {
      background: var(--panel2);
    }
    
    .note-link { color: var(--accent); text-decoration: none; }
    .note-link:hover { text-decoration: underline; }
    .note-link-missing { color: var(--muted); text-decoration: underline dashed; cursor: default; }
    
    .sidebar-overlay {
      display: none;
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      z-index: 90;
    }
    
    @media (max-width: 768px) {
      .menu-toggle { display: block; }
      .sidebar {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        transform: translateX(-100%);
      }
      .sidebar.open {
        transform: translateX(0);
      }
      .sidebar-overlay.open {
        display: block;
      }
    }
    
    @media print {
      .sidebar, .top-bar { display: none !important; }
      .main-panel { overflow: visible !important; height: auto !important; }
      .content-area { overflow: visible !important; padding: 0 !important; }
      body { background: white !important; color: black !important; }
      .note-container { max-width: 100% !important; }
    }
  </style>
</head>
<body>
  <div class="sidebar-overlay" id="overlay" onclick="toggleSidebar()"></div>
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title">${esc(notebookTitle)}</div>
      <input type="text" class="search-box" id="searchBox" placeholder="Search notes..." oninput="onSearch()">
    </div>
    <div class="sidebar-nav" id="sidebarNav">
      <!-- Generated dynamically -->
    </div>
  </div>
  
  <div class="main-panel">
    <div class="top-bar">
      <div class="top-bar-left">
        <button class="menu-toggle" onclick="toggleSidebar()">☰</button>
        <div class="breadcrumbs" id="breadcrumbs">Root</div>
      </div>
      <div class="top-bar-right">
        <button class="btn" onclick="toggleLocalTheme()">🌓 Theme</button>
        <button class="btn" onclick="window.print()">🖨️ Print</button>
      </div>
    </div>
    <div class="content-area">
      <div class="note-container">
        <div id="noteContent">
          <!-- Loaded dynamically -->
        </div>
      </div>
    </div>
  </div>
  
  <script>
    const notesData = ${JSON.stringify(renderedNotesMap)};
    const foldersData = ${JSON.stringify(exportedFolders)};
    const rootFolderId = ${JSON.stringify(rootFolderId)};
    let currentNoteId = null;

    function init() {
      renderSidebar();
      
      const initialId = window.location.hash.slice(6);
      if (initialId && notesData[initialId]) {
        showNote(initialId);
      } else {
        const keys = Object.keys(notesData);
        if (keys.length > 0) {
          showNote(keys[0]);
        } else {
          document.getElementById('noteContent').innerHTML = '<div style="text-align:center;margin-top:100px;color:var(--muted)">No notes in this notebook.</div>';
        }
      }
    }

    window.addEventListener('hashchange', () => {
      const id = window.location.hash.slice(6);
      if (id && notesData[id] && id !== currentNoteId) {
        showNote(id);
      }
    });

    function showNote(id) {
      const note = notesData[id];
      if (!note) return;
      currentNoteId = id;
      
      document.querySelectorAll('.note-item').forEach(el => el.classList.remove('active'));
      const navEl = document.getElementById('nav-note-' + id);
      if (navEl) {
        navEl.classList.add('active');
        let parent = navEl.parentElement;
        while (parent && parent.id !== 'sidebarNav') {
          if (parent.classList.contains('folder-children')) {
            parent.classList.add('open');
            const folderId = parent.id.slice(16);
            const headerToggle = document.querySelector('#folder-header-' + folderId + ' .folder-toggle');
            if (headerToggle) headerToggle.classList.add('open');
          }
          parent = parent.parentElement;
        }
      }
      
      if (window.location.hash !== '#note-' + id) {
        window.history.pushState(null, null, '#note-' + id);
      }
      
      document.getElementById('breadcrumbs').innerHTML = getBreadcrumbsHtml(note.folder_id);
      
      const updatedDate = new Date(note.updated).toLocaleDateString();
      const wordCount = getWordCount(note.body);
      const charCount = note.body ? note.body.length : 0;
      
      document.getElementById('noteContent').innerHTML = \`
        <div class="note-header">
          <h1 class="note-title">\${escapeHtml(note.title || "Untitled")}</h1>
          <div class="note-meta">
            <span>📅 \${updatedDate}</span>
            <span class="note-meta-divider">|</span>
            <span>⏱️ \${wordCount} \${wordCount === 1 ? 'word' : 'words'}</span>
            <span class="note-meta-divider">|</span>
            <span>🔤 \${charCount} \${charCount === 1 ? 'char' : 'chars'}</span>
          </div>
        </div>
        <div class="markdown-body">
          \${note.html}
        </div>
      \`;
      
      document.querySelector('.content-area').scrollTop = 0;
      
      if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('overlay').classList.remove('open');
      }
    }

    function getWordCount(text) {
      if (!text) return 0;
      var cleanText = text.trim();
      if (cleanText === "") return 0;
      return cleanText.split(/\\\\s+/).length;
    }

    function escapeHtml(s) {
      if (!s) return "";
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('overlay').classList.toggle('open');
    }

    function toggleLocalTheme() {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
    }

    function toggleFolder(folderId) {
      const children = document.getElementById('folder-children-' + folderId);
      const toggle = document.querySelector('#folder-header-' + folderId + ' .folder-toggle');
      if (children) {
        const isOpen = children.classList.toggle('open');
        if (toggle) {
          if (isOpen) {
            toggle.classList.add('open');
          } else {
            toggle.classList.remove('open');
          }
        }
      }
    }

    function getBreadcrumbsHtml(folderId) {
      if (!folderId) return 'Root';
      let path = [];
      let currentId = folderId;
      let limit = 20;
      while (currentId && limit > 0) {
        limit--;
        const f = foldersData.find(x => x.id === currentId);
        if (f) {
          path.unshift(f);
          currentId = f.parent_id;
        } else {
          break;
        }
      }
      
      let html = '<span style="cursor:pointer;" onclick="showFirstInFolder(null)">Root</span>';
      path.forEach(f => {
        html += ' / <span style="cursor:pointer;" onclick="showFirstInFolder(\\'' + f.id + '\\')">' + (f.icon || '📁') + ' ' + escapeHtml(f.name) + '</span>';
      });
      return html;
    }

    function showFirstInFolder(folderId) {
      const folderNotes = Object.values(notesData).filter(n => {
        if (!folderId) return !n.folder_id;
        return n.folder_id === folderId || isDescendant(n.folder_id, folderId);
      });
      if (folderNotes.length > 0) {
        showNote(folderNotes[0].id);
      }
    }

    function isDescendant(folderId, targetId) {
      if (!folderId || !targetId) return false;
      let currentId = folderId;
      let limit = 20;
      while (currentId && limit > 0) {
        limit--;
        if (currentId === targetId) return true;
        const f = foldersData.find(x => x.id === currentId);
        currentId = f ? f.parent_id : null;
      }
      return false;
    }

    function renderSidebar() {
      const container = document.getElementById('sidebarNav');
      container.innerHTML = '';
      
      const searchQ = document.getElementById('searchBox').value.trim().toLowerCase();
      
      if (searchQ) {
        let html = '';
        Object.values(notesData).forEach(n => {
          const matchTitle = (n.title || '').toLowerCase().includes(searchQ);
          const matchBody = (n.body || '').toLowerCase().includes(searchQ);
          if (matchTitle || matchBody) {
            html += \`<a href="#note-\${n.id}" id="nav-note-\${n.id}" class="note-item" onclick="showNote('\${n.id}');return false;">📝 \${escapeHtml(n.title || "Untitled")}</a>\`;
          }
        });
        container.innerHTML = html || '<div class="muted" style="padding:10px;font-size:12px;">No matches found.</div>';
        return;
      }
      
      const folders = foldersData.slice();
      const notes = Object.values(notesData);
      
      const targetRootId = rootFolderId;
      
      function renderFolderNode(folder) {
        const childFolders = folders.filter(f => f.parent_id === folder.id);
        const childNotes = notes.filter(n => n.folder_id === folder.id);
        
        childFolders.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
        
        let childrenHtml = '';
        childFolders.forEach(f => {
          childrenHtml += renderFolderNode(f);
        });
        childNotes.forEach(n => {
          childrenHtml += \`<a href="#note-\${n.id}" id="nav-note-\${n.id}" class="note-item" onclick="showNote('\${n.id}');return false;">📝 \${escapeHtml(n.title || "Untitled")}</a>\`;
        });
        
        const icon = folder.icon || '📁';
        return \`
          <div class="folder-item" id="folder-\${folder.id}">
            <div class="folder-header" id="folder-header-\${folder.id}" onclick="toggleFolder('\${folder.id}')">
              <span class="folder-toggle">▶</span>
              <span class="folder-icon">\${escapeHtml(icon)}</span>
              <span>\${escapeHtml(folder.name)}</span>
            </div>
            <div class="folder-children" id="folder-children-\${folder.id}">
              \${childrenHtml}
            </div>
          </div>
        \`;
      }
      
      const rootFolders = folders.filter(f => f.parent_id === targetRootId);
      rootFolders.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      
      const rootNotes = notes.filter(n => n.folder_id === targetRootId);
      
      let treeHtml = '';
      rootFolders.forEach(f => {
        treeHtml += renderFolderNode(f);
      });
      rootNotes.forEach(n => {
        treeHtml += \`<a href="#note-\${n.id}" id="nav-note-\${n.id}" class="note-item" onclick="showNote('\${n.id}');return false;">📝 \${escapeHtml(n.title || "Untitled")}</a>\`;
      });
      
      container.innerHTML = treeHtml || '<div class="muted" style="padding:10px;font-size:12px;">No notes or folders.</div>';
    }

    function onSearch() {
      renderSidebar();
    }

    window.onload = init;
  </script>
</body>
</html>`;

  triggerDownload(htmlContent, notebookTitle + ".html", "text/html");
}

export function downloadNoteFolder(folderId) {
  if (!folderId) return;
  var folder = S.note_folders.find(function(f) { return f.id === folderId; });
  if (!folder) return;
  compileDigitalNotebook(folderId, (folder.name || "Folder") + " Notes");
}

export function downloadAllNotesNotebook() {
  compileDigitalNotebook(null, "TyloPlanner Notes");
}

