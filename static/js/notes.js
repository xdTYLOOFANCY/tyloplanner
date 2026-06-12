// TyloPlanner — notes module (editor, markdown, search, cross-links).

import { S } from './state.js';
import { esc, api } from './utils.js';

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
function mdToHtml(text) {
  var lines = (text || "").split("\n");
  var html = "", inUl = false, inOl = false, inBq = false;
  function closeLists() { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } }
  function closeBq() { if (inBq) { html += "</blockquote>"; inBq = false; } }
  function inline(s) {
    s = esc(s);
    s = s.replace(/\[\[(.+?)\]\]/g, function(match, title) {
      var t = title.trim();
      var note = S && S.notes && S.notes.find(function(n) {
        return esc(n.title || "").toLowerCase() === t.toLowerCase();
      });
      if (note) return '<a href="#" class="note-link" onclick="openNote(\'' + note.id + '\');return false;">' + t + '</a>';
      return '<span class="note-link-missing">' + match + '</span>';
    });
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    s = s.replace(/__(.+?)__/g, "<u>$1</u>");
    s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
    return s;
  }
  lines.forEach(function(line) {
    var m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/)) !== null) {
      closeLists(); closeBq();
      html += "<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">";
    } else if (/^-{3,}$/.test(line.trim())) {
      closeLists(); closeBq(); html += "<hr>";
    } else if ((m = line.match(/^>\s?(.*)/)) !== null) {
      closeLists();
      if (!inBq) { html += "<blockquote>"; inBq = true; }
      html += inline(m[1]) + "<br>";
    } else if ((m = line.match(/^[-*]\s+(.*)/)) !== null) {
      closeBq(); if (inOl) { html += "</ol>"; inOl = false; }
      if (!inUl) { html += "<ul>"; inUl = true; }
      html += "<li>" + inline(m[1]) + "</li>";
    } else if ((m = line.match(/^\d+\.\s+(.*)/)) !== null) {
      closeBq(); if (inUl) { html += "</ul>"; inUl = false; }
      if (!inOl) { html += "<ol>"; inOl = true; }
      html += "<li>" + inline(m[1]) + "</li>";
    } else if (line.trim() === "") {
      closeLists(); closeBq(); html += "<br>";
    } else {
      closeLists(); closeBq(); html += "<p>" + inline(line) + "</p>";
    }
  });
  closeLists(); closeBq();
  return html;
}

export function toggleNoteMode() {
  noteMode = (noteMode === "edit") ? "view" : "edit";
  applyNoteMode();
}
function renderNoteView() {
  var ta = document.getElementById("noteBody");
  var view = document.getElementById("noteView");
  var cnt = document.getElementById("noteBodySearchCount");
  var q = (noteBodySearch.q || "").toLowerCase().trim();
  var html = mdToHtml(ta.value);
  if (q) html = highlightHtml(html, q);
  view.innerHTML = html;
  var marks = view.querySelectorAll("mark");
  var n = marks.length;
  if (noteBodySearch.idx >= n) noteBodySearch.idx = 0;
  if (marks[noteBodySearch.idx]) marks[noteBodySearch.idx].className = "cur";
  if (cnt) cnt.textContent = q ? (n ? (noteBodySearch.idx + 1) + "/" + n : "0 results") : "";
}
function applyNoteMode() {
  var ta = document.getElementById("noteBody");
  var view = document.getElementById("noteView");
  var btn = document.getElementById("noteModeBtn");
  var tb = document.getElementById("noteToolbar");
  if (noteMode === "view") {
    renderNoteView();
    ta.style.display = "none"; view.style.display = "block"; btn.textContent = "Edit";
    if (tb) tb.style.display = "none";
  } else {
    ta.style.display = ""; view.style.display = "none"; btn.textContent = "View";
    if (tb) tb.style.display = "";
    var q = (noteBodySearch.q || "").toLowerCase().trim();
    var cnt = document.getElementById("noteBodySearchCount");
    if (cnt && q) {
      var lc = (ta.value || "").toLowerCase(), i = 0, n = 0;
      while (i < (ta.value || "").length) { var idx = lc.indexOf(q, i); if (idx === -1) break; n++; i = idx + Math.max(1, q.length); }
      noteBodySearch.idx = Math.min(noteBodySearch.idx, Math.max(0, n - 1));
      cnt.textContent = n ? (noteBodySearch.idx + 1) + "/" + n : "0 results";
    } else if (cnt) { cnt.textContent = ""; }
  }
}
export function noteInsert(type) {
  var ta = document.getElementById("noteBody");
  if (!ta || ta.style.display === "none") return;
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
  currentNote = r.id; await refresh();
  document.getElementById("noteTitle").focus();
}
export function openNote(id) {
  var btn = document.querySelector("#tabs button[data-tab='notes']");
  if (btn) btn.click();
  selectNote(id);
}
export function selectNote(id) { noteMode = "view"; currentNote = id; renderNotes(); }
export function noteChanged() {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async function() {
    if (!currentNote) return;
    await api("PUT", "/api/notes/" + currentNote, {
      title: document.getElementById("noteTitle").value,
      body: document.getElementById("noteBody").value,
      updated: Date.now()
    });
    var n = S.notes.find(function(x) { return x.id === currentNote; });
    if (n) { n.title = document.getElementById("noteTitle").value; n.body = document.getElementById("noteBody").value; n.updated = Date.now(); }
    renderNoteList();
  }, 500);
}
export async function deleteNote(refresh) {
  if (!confirm("Delete this note?")) return;
  await api("DELETE", "/api/notes/" + currentNote);
  currentNote = null; await refresh();
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
export function noteBodySearchInput() {
  noteBodySearch.q = document.getElementById("noteBodySearch").value;
  noteBodySearch.idx = 0;
  applyNoteBodySearch(noteBodySearch.q.trim().length > 0);
}
export function noteBodySearchNav(dir) {
  var q = (noteBodySearch.q || "").toLowerCase().trim();
  if (!q) return;
  var n;
  if (noteMode === "view") {
    n = (document.getElementById("noteView") || { querySelectorAll: function() { return []; } }).querySelectorAll("mark").length;
  } else {
    var text = (document.getElementById("noteBody") || { value: "" }).value;
    var lc = text.toLowerCase(); n = 0; var i = 0;
    while (i < text.length) { var idx = lc.indexOf(q, i); if (idx === -1) break; n++; i = idx + Math.max(1, q.length); }
  }
  if (!n) return;
  noteBodySearch.idx = (noteBodySearch.idx + dir + n) % n;
  applyNoteBodySearch(true);
}
function applyNoteBodySearch(jump) {
  var q = (noteBodySearch.q || "").toLowerCase().trim();
  var ta = document.getElementById("noteBody");
  var cnt = document.getElementById("noteBodySearchCount");
  if (!ta) return;
  if (noteMode === "view") {
    renderNoteView();
    if (jump && q) {
      var view = document.getElementById("noteView");
      var marks = view.querySelectorAll("mark");
      if (marks[noteBodySearch.idx]) marks[noteBodySearch.idx].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  } else {
    var text = ta.value, lc = text.toLowerCase(), i = 0, positions = [];
    if (q) { while (i < text.length) { var idx = lc.indexOf(q, i); if (idx === -1) break; positions.push(idx); i = idx + Math.max(1, q.length); } }
    var n = positions.length;
    if (noteBodySearch.idx >= n) noteBodySearch.idx = 0;
    if (cnt) cnt.textContent = q ? (n ? (noteBodySearch.idx + 1) + "/" + n : "0 results") : "";
    if (jump && n) {
      var pos = positions[noteBodySearch.idx];
      ta.focus();
      ta.setSelectionRange(pos, pos + q.length);
      var lines = text.slice(0, pos).split("\n").length - 1;
      var lh = parseInt(window.getComputedStyle(ta).lineHeight) || 20;
      ta.scrollTop = Math.max(0, lines * lh - ta.clientHeight / 3);
    }
  }
}
function renderNoteList() {
  var q = (document.getElementById("noteSearch") || { value: "" }).value.trim().toLowerCase();
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
    html += '<div class="list-item ' + pinned + (n.id === currentNote ? ' sel' : '') + '" onclick="selectNote(\'' + n.id + '\')">' +
      '<button class="btn-pin" onclick="toggleNotePin(\'' + n.id + '\',event)" title="' + (n.is_pinned ? 'Unpin' : 'Pin') + '">\u2605</button>' +
      '<div class="grow"><div>' + title + '</div>' + snippet +
      '<div class="muted">' + new Date(n.updated || 0).toLocaleDateString() + '</div></div></div>';
  });
  document.getElementById("noteList").innerHTML = html || (q ? '<div class="muted">No notes match.</div>' : '<div class="muted">No notes yet.</div>');
}
export function renderNotes() {
  renderNoteList();
  var ed = document.getElementById("noteEditor");
  var n = S.notes.find(function(x) { return x.id === currentNote; });
  if (!n) { ed.style.display = "none"; return; }
  ed.style.display = "block";
  document.getElementById("noteTitle").value = n.title || "";
  document.getElementById("noteBody").value = n.body || "";
  document.getElementById("noteMeta").textContent = "Last edited " + new Date(n.updated || 0).toLocaleString();
  noteBodySearch.idx = 0;
  applyNoteMode();
}
