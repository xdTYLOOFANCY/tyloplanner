// TyloPlanner — notes module (editor, markdown, search, cross-links).

import { S } from './state.js';
import { esc, api, z } from './utils.js';

var currentNote = null, noteTimer = null, noteMode = "edit";
var noteBodySearch = { q: "", idx: 0 };

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

var markedConfigured = false;
function configureMarked() {
  if (markedConfigured) return;
  var parser = window.marked || (typeof marked !== 'undefined' ? marked : null);
  if (parser) {
    const wikiLink = {
      name: 'wikiLink',
      level: 'inline',
      start(src) { return src.indexOf('[['); },
      tokenizer(src, tokens) {
        const rule = /^\[\[([^\]]+)\]\]/;
        const match = rule.exec(src);
        if (match) {
          return {
            type: 'wikiLink',
            raw: match[0],
            title: match[1].trim()
          };
        }
      },
      renderer(token) {
        var t = token.title;
        var note = S && S.notes && S.notes.find(function(n) {
          return esc(n.title || "").toLowerCase() === t.toLowerCase();
        });
        if (note) return '<a href="#" class="note-link" onclick="openNote(\'' + note.id + '\');return false;">' + esc(t) + '</a>';
        return '<span class="note-link-missing">' + esc(token.raw) + '</span>';
      }
    };
    
    parser.use({
      extensions: [wikiLink],
      renderer: {
        html(html) {
          return esc(html);
        }
      }
    });
    markedConfigured = true;
  }
}

function mdToHtml(text) {
  if (!text) return "";
  configureMarked();
  var parser = window.marked || (typeof marked !== 'undefined' ? marked : null);
  if (parser && typeof parser.parse === "function") {
    return parser.parse(text);
  }
  return esc(text);
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
  var r = await api("POST", "/api/notes", { title: "", body: "", updated: Date.now() });
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
    
    var updatedTime = Date.now();
    api("PUT", "/api/notes/" + pendingNoteId, {
      title: pendingTitle,
      body: pendingBody,
      updated: updatedTime
    }).then(function() {
      var n = S.notes.find(function(x) { return x.id === pendingNoteId; });
      if (n) { n.title = pendingTitle; n.body = pendingBody; n.updated = updatedTime; }
      renderNoteList();
    }).catch(console.error);
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
      var updatedTime = Date.now();
      await api("PUT", "/api/notes/" + pendingNoteId, {
        title: pendingTitle,
        body: pendingBody,
        updated: updatedTime
      });
      var n = S.notes.find(function(x) { return x.id === pendingNoteId; });
      if (n) {
        n.title = pendingTitle;
        n.body = pendingBody;
        n.updated = updatedTime;
      }
      renderNoteList();
      
      if (statusEl && currentNote === pendingNoteId) {
        statusEl.textContent = "Saved at " + formatTime(updatedTime);
        statusEl.className = "note-status saved";
      }
    } catch (err) {
      if (statusEl && currentNote === pendingNoteId) {
        statusEl.textContent = "Error saving";
        statusEl.className = "note-status danger";
      }
      console.error(err);
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

export function noteSearchInput() { renderNoteList(); }

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

function renderNoteList() {
  var searchEl = document.getElementById("noteSearch");
  var q = (searchEl ? searchEl.value : "").trim().toLowerCase();
  var list = S.notes.slice().sort(function(a, b) {
    if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
    return (b.updated || 0) - (a.updated || 0);
  });
  if (q) list = list.filter(function(n) {
    return (n.title || "").toLowerCase().indexOf(q) !== -1 || (n.body || "").toLowerCase().indexOf(q) !== -1;
  });
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
    html += '<div class="list-item ' + pinned + (n.id === currentNote ? ' sel' : '') + '" data-id="' + n.id + '" onclick="selectNote(\'' + n.id + '\')">' +
      '<button class="btn-pin" onclick="toggleNotePin(\'' + n.id + '\',event)" title="' + (n.is_pinned ? 'Unpin' : 'Pin') + '">\u2605</button>' +
      '<div class="grow"><div>' + title + '</div>' + snippet +
      '<div class="muted">' + new Date(n.updated || 0).toLocaleDateString() + '</div></div></div>';
  });
  var noteListEl = document.getElementById("noteList");
  if (noteListEl) {
    noteListEl.innerHTML = html || (q ? '<div class="muted">No notes match.</div>' : '<div class="muted">No notes yet.</div>');
  }
}

export function renderNotes() {
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
    if (ed) ed.style.display = "none";
    return;
  }
  if (ed) ed.style.display = "block";
  
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
}

// Mobile panel navigation: go back from editor to note list
export function notesGoBack() {
  currentNote = null;
  localStorage.removeItem("active_note_id");
  var layout = document.querySelector(".noteslayout");
  if (layout) layout.classList.remove("note-editing");
  var ed = document.getElementById("noteEditor");
  if (ed) ed.style.display = "none";
  renderNoteList();
}
