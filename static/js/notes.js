// TyloPlanner — notes module (editor, markdown, search, cross-links).

import { S, safeRender } from './state.js';
import { esc, api, z, mdToHtml } from './utils.js';

var currentNote = null, noteTimer = null;
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

// Rendered HTML for a note regardless of storage format (used by export).
function noteBodyHtml(note) {
  if (!note) return "";
  return note.body_format === "html" ? (note.body || "") : mdToHtml(note.body || "");
}

// Inline uploaded images (/api/files/<id>/view) as data: URIs so an exported
// HTML file is self-contained and its images render for anyone it's shared with.
async function inlineExportImages(html) {
  if (!html || html.indexOf("/api/files/") === -1) return html;
  var re = /\/api\/files\/[A-Za-z0-9]+\/view/g, m, urls = [];
  while ((m = re.exec(html))) { if (urls.indexOf(m[0]) === -1) urls.push(m[0]); }
  for (var i = 0; i < urls.length; i++) {
    try {
      var resp = await fetch(urls[i]);
      if (!resp.ok) continue;
      var blob = await resp.blob();
      var dataUri = await new Promise(function(res, rej) {
        var r = new FileReader();
        r.onloadend = function() { res(r.result); };
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      html = html.split(urls[i]).join(dataUri);
    } catch (e) { /* leave the original URL if fetch fails */ }
  }
  return html;
}

// Plain text of a note body, for word/character counts in exports.
function notePlainText(note) {
  if (!note) return "";
  if (note.body_format === "html") {
    var tmp = document.createElement("div");
    tmp.innerHTML = note.body || "";
    return tmp.textContent || tmp.innerText || "";
  }
  return note.body || "";
}

// ---- Quill rich-text (WYSIWYG) editor ----
// The editor stores rich HTML in note.body (body_format === 'html'). Legacy
// Markdown notes are converted to HTML for display the first time they open and
// are persisted as HTML on the first edit.
var quill = null;
var loadedNoteId = null;      // which note is currently loaded into the editor
var suppressChange = false;   // guard: programmatic loads must not autosave
var searchMatches = [];       // in-note search hit indices (Quill offsets)

// Google-Docs-style toolbar: paragraph style, font, size, inline formatting,
// color, sub/superscript, alignment, lists, indent, blocks, links & images.
var QUILL_TOOLBAR = [
  [{ header: [1, 2, 3, 4, 5, 6, false] }, { font: [] }, { size: ["small", false, "large", "huge"] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ align: [] }],
  [{ list: "ordered" }, { list: "bullet" }, { list: "check" }],
  [{ indent: "-1" }, { indent: "+1" }],
  ["blockquote", "code-block"],
  ["link", "image"],
  ["clean"]
];

// Quill (209 KB) is loaded lazily the first time a note is opened, so it never
// weighs on the initial page load (Notes is not the default tab).
var quillLoadPromise = null;
function ensureQuill() {
  if (window.Quill) return Promise.resolve();
  if (!quillLoadPromise) {
    quillLoadPromise = new Promise(function(resolve, reject) {
      var s = document.createElement("script");
      s.src = "js/quill.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return quillLoadPromise;
}

function initQuill() {
  if (quill) return quill;
  if (!window.Quill) return null;
  var host = document.getElementById("noteEditorQuill");
  if (!host) return null;
  quill = new window.Quill(host, {
    theme: "snow",
    placeholder: "Write anything…",
    modules: {
      table: true,
      toolbar: {
        container: QUILL_TOOLBAR,
        handlers: { image: quillImageHandler }
      }
    }
  });
  // Quill injects the toolbar right before the editor (inside the page); move it
  // up into the sticky Docs-style formatting bar above the canvas.
  var slot = document.getElementById("noteToolbarSlot");
  var tbModule = quill.getModule("toolbar");
  if (slot && tbModule && tbModule.container) slot.appendChild(tbModule.container);
  quill.on("text-change", function(delta, oldDelta, source) {
    if (suppressChange || source !== "user") return;
    updateCounters();
    noteChanged();
    // Defer a tick: Quill hasn't committed the new selection yet when
    // text-change fires, so getSelection() can be stale on the first keystroke.
    setTimeout(function() { autoLinkify(delta); }, 0);
    setTimeout(maybeTriggerEditorPopup, 0);
  });
  quill.on("selection-change", function(range) {
    if (!range) {
      closeEditorPopup();
      if (tableTools) tableTools.style.display = "none";
      return;
    }
    setTimeout(maybeTriggerEditorPopup, 0);
    setTimeout(updateTableTools, 0);
    // Hide the image overlay if the selection is no longer on that image.
    if (imgTarget && !(range.length === 1 && range.index === imgTarget.index)) hideImgOverlay();
  });
  // Keyboard navigation for the inline popup (capture so it beats Quill's keys).
  quill.root.addEventListener("keydown", function(e) {
    if (!popupState) return;
    var handled = true;
    if (e.key === "ArrowDown") movePopupSelection(1);
    else if (e.key === "ArrowUp") movePopupSelection(-1);
    else if (e.key === "Enter" || e.key === "Tab") choosePopupItem();
    else if (e.key === "Escape") closeEditorPopup();
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  quill.root.addEventListener("click", function(e) {
    // Clicking a [[wiki-link]] opens the target note (beats Quill's tooltip).
    var a = e.target.closest && e.target.closest('a[href^="#note-"]');
    if (a) {
      e.preventDefault(); e.stopPropagation();
      var id = a.getAttribute("href").slice(6);
      if ((S.notes || []).some(function(n) { return n.id === id; })) openNote(id);
      return;
    }
    // Clicking an image selects it and shows the resize/align overlay.
    if (e.target.tagName === "IMG") { selectEditorImage(e.target); return; }
    hideImgOverlay();
  }, true);
  return quill;
}

// Current editor contents as HTML ("" when the note is empty).
function getEditorBody() {
  if (!quill) return "";
  var html = quill.root.innerHTML;
  if (html === "<p><br></p>" || html === "<p></p>") return "";
  return html;
}

// Load an HTML string into the editor without triggering an autosave.
function setEditorBody(html) {
  if (!quill) return;
  closeEditorPopup();
  if (tableTools) tableTools.style.display = "none";
  hideImgOverlay();
  suppressChange = true;
  try {
    if (html) {
      quill.setContents(quill.clipboard.convert({ html: html }), "silent");
    } else {
      quill.setText("", "silent");
    }
    // Reset the undo stack so Ctrl+Z can't reach into the previously-open note.
    if (quill.history) quill.history.clear();
  } finally {
    suppressChange = false;
  }
}

// Toolbar image button: upload through the existing files API and embed the
// stored URL (keeps big base64 blobs out of the notes table).
function quillImageHandler() {
  if (!quill) return;
  var input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = function() {
    var file = input.files && input.files[0];
    if (!file) return;
    var range = quill.getSelection(true) || { index: quill.getLength() };
    var fd = new FormData();
    fd.append("file", file);
    fetch("/api/files/upload", { method: "POST", body: fd })
      .then(function(r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function(res) {
        if (!res || !res.id) return Promise.reject();
        quill.insertEmbed(range.index, "image", "/api/files/" + res.id + "/view", "user");
        quill.setSelection(range.index + 1, 0, "user");
      })
      .catch(function() { alert("Image upload failed."); });
  };
  input.click();
}

function updateCounters() {
  if (!quill) return;
  // Quill always keeps a trailing newline; drop it for honest counts.
  var text = (quill.getText() || "").replace(/\n+$/, "");
  var wordCount = getWordCount(text);
  var charCount = text.length;
  var wcEl = document.getElementById("noteWordCount");
  var ccEl = document.getElementById("noteCharCount");
  if (wcEl) wcEl.textContent = wordCount + " " + (wordCount === 1 ? "word" : "words");
  if (ccEl) ccEl.textContent = charCount + " " + (charCount === 1 ? "character" : "characters");
}

// ---- Inline command popup: "/" slash menu + "[[" wiki-links ----
// A single floating menu, positioned at the caret, shared by both triggers.
var editorPopup = null;      // the reused DOM element
var popupState = null;       // { type:'slash'|'wiki', anchor, items, index }
var popupBusy = false;       // guard while applying a choice

var SLASH_ITEMS = [
  { icon: "H1", label: "Heading 1", kw: "title", apply: function() { quill.format("header", 1, "user"); } },
  { icon: "H2", label: "Heading 2", kw: "subtitle", apply: function() { quill.format("header", 2, "user"); } },
  { icon: "H3", label: "Heading 3", kw: "", apply: function() { quill.format("header", 3, "user"); } },
  { icon: "•", label: "Bulleted list", kw: "unordered", apply: function() { quill.format("list", "bullet", "user"); } },
  { icon: "1.", label: "Numbered list", kw: "ordered", apply: function() { quill.format("list", "ordered", "user"); } },
  { icon: "☑", label: "Checklist", kw: "todo task", apply: function() { quill.format("list", "unchecked", "user"); } },
  { icon: "❝", label: "Quote", kw: "blockquote", apply: function() { quill.format("blockquote", true, "user"); } },
  { icon: "</>", label: "Code block", kw: "pre monospace", apply: function() { quill.format("code-block", true, "user"); } },
  { icon: "▦", label: "Table", kw: "grid", apply: function() { insertTable(); } },
  { icon: "🖼", label: "Image", kw: "picture photo", apply: function() { quillImageHandler(); } }
];

function insertTable() {
  var t = quill.getModule("table");
  if (!t) return;
  var sel = quill.getSelection(true);
  if (!sel) { quill.setSelection(quill.getLength() - 1, 0); }
  t.insertTable(3, 3);
  setTimeout(updateTableTools, 0);
}

// A small floating toolbar (add/remove rows & columns) shown while the caret is
// inside a table.
var tableTools = null;
function buildTableTools() {
  if (tableTools) return tableTools;
  tableTools = document.createElement("div");
  tableTools.className = "note-table-tools";
  tableTools.style.display = "none";
  var btns = [
    ["+ Col", function(t) { t.insertColumnRight(); }],
    ["+ Row", function(t) { t.insertRowBelow(); }],
    ["− Col", function(t) { t.deleteColumn(); }],
    ["− Row", function(t) { t.deleteRow(); }],
    ["✕ Table", function(t) { t.deleteTable(); }]
  ];
  btns.forEach(function(spec) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = spec[0];
    if (spec[0] === "✕ Table") b.className = "ttx";
    b.addEventListener("mousedown", function(e) {
      e.preventDefault();
      var t = quill && quill.getModule("table");
      if (!t) return;
      try { spec[1](t); } catch (err) {}
      setTimeout(updateTableTools, 0);
    });
    tableTools.appendChild(b);
  });
  document.body.appendChild(tableTools);
  // Reposition while scrolling the canvas so the bar tracks its table.
  window.addEventListener("scroll", function() {
    if (tableTools && tableTools.style.display !== "none") updateTableTools();
  }, true);
  return tableTools;
}

function updateTableTools() {
  if (!quill) return;
  var bar = buildTableTools();
  var t = quill.getModule("table");
  var info = null;
  try { info = t && t.getTable(); } catch (e) {}
  var tableBlot = info && info[0];
  var node = tableBlot && tableBlot.domNode;
  if (!node) { bar.style.display = "none"; return; }
  var rect = node.getBoundingClientRect();
  bar.style.display = "flex";
  bar.style.position = "fixed";
  bar.style.left = Math.max(8, rect.left) + "px";
  bar.style.top = Math.max(8, rect.top - 38) + "px";
}

// ---- Auto-linkify URLs (typed + pasted) ----
var URL_TOKEN_RE = /^(https?:\/\/[^\s]+\.[^\s]+|www\.[^\s]+\.[^\s]+)$/i;

function linkifyAt(start, len, url) {
  var cleaned = url.replace(/[.,;:!?)\]}'"]+$/, ""); // don't swallow trailing punctuation
  if (!cleaned || !URL_TOKEN_RE.test(cleaned)) return;
  var fmt = quill.getFormat(start, cleaned.length);
  if (fmt && fmt.link) return; // already a link
  var href = /^www\./i.test(cleaned) ? "http://" + cleaned : cleaned;
  quill.formatText(start, cleaned.length, "link", href, "user");
}

function autoLinkify(delta) {
  if (!quill || suppressChange) return;
  // Position of the change + the inserted string (robust even if more was typed
  // before this deferred call runs — earlier indices are frozen).
  var ops = (delta && delta.ops) || [];
  var pos = 0, ins = null;
  for (var i = 0; i < ops.length; i++) {
    if (typeof ops[i].retain === "number") pos += ops[i].retain;
    else if (typeof ops[i].insert === "string") { ins = ops[i].insert; break; }
    else if (ops[i].insert) pos += 1; // embed
  }
  if (!ins) return;
  if (ins.length > 1) {
    // Pasted / batched text: linkify every URL inside the inserted range.
    var re = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi, m;
    while ((m = re.exec(ins))) linkifyAt(pos + m.index, m[0].length, m[0]);
  }
  // For every boundary (space/newline) anywhere in the inserted text — keystrokes
  // can batch as "e ", " and", etc. — linkify the token ending just before it (a
  // URL that may have started in an earlier insert).
  for (var k = 0; k < ins.length; k++) {
    if (ins[k] !== " " && ins[k] !== "\n") continue;
    var bpos = pos + k;
    var li = quill.getLine(bpos);
    if (!li || !li[0]) continue;
    var lineStart = bpos - li[1];
    var before = quill.getText(lineStart, li[1]); // up to (not incl.) the boundary
    var t = /(\S+)$/.exec(before);
    if (t) linkifyAt(lineStart + (before.length - t[1].length), t[1].length, t[1]);
  }
}

// ---- Inline image resize + alignment ----
var imgOverlay = null;
var imgTarget = null;   // { node, index }

function buildImgOverlay() {
  if (imgOverlay) return imgOverlay;
  imgOverlay = document.createElement("div");
  imgOverlay.className = "note-img-overlay";
  imgOverlay.innerHTML =
    '<div class="nio-bar">' +
      '<button type="button" data-a="left" title="Align left">⬅</button>' +
      '<button type="button" data-a="center" title="Align center">↔</button>' +
      '<button type="button" data-a="right" title="Align right">➡</button>' +
      '<button type="button" data-a="reset" title="Reset size">⟲</button>' +
    '</div>' +
    '<span class="nio-handle" title="Drag to resize"></span>';
  document.body.appendChild(imgOverlay);
  // alignment / reset buttons
  Array.prototype.forEach.call(imgOverlay.querySelectorAll(".nio-bar button"), function(btn) {
    btn.addEventListener("mousedown", function(e) {
      e.preventDefault(); e.stopPropagation();
      if (!imgTarget) return;
      var a = btn.getAttribute("data-a");
      if (a === "reset") {
        imgTarget.node.removeAttribute("width");
        quill.formatText(imgTarget.index, 1, "width", false, "user");
      } else {
        quill.formatLine(imgTarget.index, 1, "align", a === "left" ? false : a, "user");
      }
      setTimeout(showImgOverlay, 0);
    });
  });
  // drag-to-resize handle (keeps aspect ratio)
  var handle = imgOverlay.querySelector(".nio-handle");
  handle.addEventListener("mousedown", function(e) {
    if (!imgTarget) return;
    e.preventDefault(); e.stopPropagation();
    var startX = e.clientX;
    var startW = imgTarget.node.getBoundingClientRect().width;
    var maxW = quill.root.clientWidth;
    function move(ev) {
      var w = Math.max(40, Math.min(maxW, Math.round(startW + (ev.clientX - startX))));
      imgTarget.node.setAttribute("width", w);
      showImgOverlay();
    }
    function up() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      var w = imgTarget.node.getAttribute("width");
      if (w) quill.formatText(imgTarget.index, 1, "width", String(w), "user");
      showImgOverlay();
    }
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
  window.addEventListener("scroll", function() {
    if (imgTarget) showImgOverlay();
  }, true);
  return imgOverlay;
}

function selectEditorImage(node) {
  var blot = window.Quill.find(node);
  if (!blot) return;
  imgTarget = { node: node, index: quill.getIndex(blot) };
  quill.setSelection(imgTarget.index, 1, "silent");
  showImgOverlay();
}

function showImgOverlay() {
  if (!imgTarget) return;
  var ov = buildImgOverlay();
  var rect = imgTarget.node.getBoundingClientRect();
  ov.style.display = "block";
  ov.style.left = rect.left + "px";
  ov.style.top = rect.top + "px";
  ov.style.width = rect.width + "px";
  ov.style.height = rect.height + "px";
}

function hideImgOverlay() {
  imgTarget = null;
  if (imgOverlay) imgOverlay.style.display = "none";
}

function buildPopup() {
  if (editorPopup) return editorPopup;
  editorPopup = document.createElement("div");
  editorPopup.className = "editor-popup";
  editorPopup.style.display = "none";
  document.body.appendChild(editorPopup);
  document.addEventListener("mousedown", function(e) {
    if (popupState && editorPopup && !editorPopup.contains(e.target)) closeEditorPopup();
  });
  return editorPopup;
}

function closeEditorPopup() {
  popupState = null;
  if (editorPopup) editorPopup.style.display = "none";
}

function maybeTriggerEditorPopup() {
  if (popupBusy || !quill) return;
  var sel = quill.getSelection();
  if (!sel || sel.length > 0) return closeEditorPopup();
  var lineInfo = quill.getLine(sel.index);
  var line = lineInfo && lineInfo[0];
  var offset = lineInfo ? lineInfo[1] : 0;
  if (!line) return closeEditorPopup();
  var lineStart = sel.index - offset;
  var before = quill.getText(lineStart, offset);
  // Slash menu: the line up to the caret is "/" + word chars.
  var mSlash = /^\/(\w*)$/.exec(before);
  if (mSlash) { openSlashMenu(lineStart, mSlash[1]); return; }
  // Wiki-link: an open "[[" with a short query and no closing "]]" yet.
  var open = before.lastIndexOf("[[");
  if (open !== -1) {
    var after = before.slice(open + 2);
    if (after.indexOf("]]") === -1 && after.indexOf("[") === -1 && after.length <= 60) {
      openWikiMenu(lineStart + open, after); return;
    }
  }
  closeEditorPopup();
}

function openSlashMenu(anchor, query) {
  var q = (query || "").toLowerCase();
  var items = SLASH_ITEMS.filter(function(it) {
    return !q || it.label.toLowerCase().indexOf(q) !== -1 || (it.kw && it.kw.indexOf(q) !== -1);
  });
  if (!items.length) return closeEditorPopup();
  popupState = { type: "slash", anchor: anchor, items: items, index: 0 };
  renderPopup(); positionPopup(anchor);
}

function openWikiMenu(anchor, query) {
  var q = (query || "").toLowerCase();
  var list = (S.notes || []).filter(function(n) {
    return n.id !== currentNote && (n.title || "").trim() !== "" &&
      (n.title || "").toLowerCase().indexOf(q) !== -1;
  });
  list.sort(function(a, b) { return (b.updated || 0) - (a.updated || 0); });
  list = list.slice(0, 8).map(function(n) { return { id: n.id, title: n.title }; });
  if (!list.length) return closeEditorPopup();
  popupState = { type: "wiki", anchor: anchor, items: list, index: 0 };
  renderPopup(); positionPopup(anchor);
}

function renderPopup() {
  var el = buildPopup();
  var st = popupState;
  var html = st.type === "wiki" ? '<div class="ep-head">Link to note</div>' : "";
  st.items.forEach(function(it, i) {
    var icon = st.type === "slash" ? it.icon : "🔗";
    var label = st.type === "slash" ? it.label : it.title;
    html += '<div class="ep-item' + (i === st.index ? " sel" : "") + '" data-i="' + i + '">' +
      '<span class="ep-icon">' + esc(icon) + '</span>' +
      '<span class="ep-label">' + esc(label) + '</span></div>';
  });
  el.innerHTML = html;
  el.style.display = "block";
  Array.prototype.forEach.call(el.querySelectorAll(".ep-item"), function(node) {
    node.addEventListener("mousedown", function(e) {
      e.preventDefault();
      popupState.index = parseInt(node.getAttribute("data-i"), 10);
      choosePopupItem();
    });
  });
}

function positionPopup(anchor) {
  var el = buildPopup();
  var b = quill.getBounds(anchor);
  var rect = quill.root.getBoundingClientRect();
  el.style.position = "fixed";
  el.style.left = Math.max(8, Math.min(rect.left + b.left, window.innerWidth - 268)) + "px";
  el.style.top = Math.min(rect.top + b.top + b.height + 6, window.innerHeight - 280) + "px";
}

function movePopupSelection(dir) {
  if (!popupState) return;
  var n = popupState.items.length;
  popupState.index = (popupState.index + dir + n) % n;
  renderPopup();
}

function choosePopupItem() {
  if (!popupState || !quill) return;
  var st = popupState;
  var item = st.items[st.index];
  if (!item) return closeEditorPopup();
  var sel = quill.getSelection();
  var cursor = sel ? sel.index : st.anchor;
  popupBusy = true;
  try {
    if (st.type === "slash") {
      quill.deleteText(st.anchor, cursor - st.anchor, "user");
      quill.setSelection(st.anchor, 0, "silent");
      item.apply();
    } else {
      quill.deleteText(st.anchor, cursor - st.anchor, "user");
      quill.insertText(st.anchor, item.title, { link: "#note-" + item.id }, "user");
      var end = st.anchor + item.title.length;
      quill.setSelection(end, 0, "silent");
      quill.format("link", false, "silent");
      quill.insertText(end, " ", "user");
      quill.setSelection(end + 1, 0, "silent");
    }
  } finally {
    popupBusy = false;
    closeEditorPopup();
  }
}

export async function newNote(refresh) {
  var payload = { title: "", body: "", body_format: "html", updated: Date.now() };
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
    var pendingBody = getEditorBody();
    clearTimeout(noteTimer);
    noteTimer = null;

    var n = S.notes.find(function(x) { return x.id === pendingNoteId; });
    var lastUpdated = n ? n.updated : 0;
    var updatedTime = Date.now();

    api("PUT", "/api/notes/" + pendingNoteId, {
      title: pendingTitle,
      body: pendingBody,
      body_format: "html",
      updated: updatedTime,
      last_updated: lastUpdated
    }).then(function() {
      var n = S.notes.find(function(x) { return x.id === pendingNoteId; });
      if (n) { n.title = pendingTitle; n.body = pendingBody; n.body_format = "html"; n.updated = updatedTime; }
      renderNoteList();
    }).catch(function(err) {
      if (err.message && err.message.includes("conflict")) {
        var choice = prompt("This note was modified elsewhere. Overwrite or Reload?", "Reload");
        if (choice && choice.toLowerCase().startsWith("o")) {
          api("PUT", "/api/notes/" + pendingNoteId, {
            title: pendingTitle,
            body: pendingBody,
            body_format: "html",
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

  updateCounters();

  var statusEl = document.getElementById("noteSaveStatus");
  if (statusEl) {
    statusEl.textContent = "Typing...";
    statusEl.className = "note-status typing";
  }
  
  var pendingNoteId = currentNote;
  var pendingTitle = document.getElementById("noteTitle").value;
  var pendingBody = getEditorBody();

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
        body_format: "html",
        updated: updatedTime,
        last_updated: lastUpdated
      });
      var n2 = S.notes.find(function(x) { return x.id === pendingNoteId; });
      if (n2) {
        n2.title = pendingTitle;
        n2.body = pendingBody;
        n2.body_format = "html";
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
            body_format: "html",
            updated: updatedTime2,
            last_updated: updatedTime2 // force overwrite
          });
          var n3 = S.notes.find(function(x) { return x.id === pendingNoteId; });
          if (n3) {
            n3.title = pendingTitle;
            n3.body = pendingBody;
            n3.body_format = "html";
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
  runNoteBodySearch(noteBodySearch.q.trim().length > 0);
}

export function handleNoteBodySearchKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    noteBodySearchNav(1);
  }
}

export function noteBodySearchNav(dir) {
  var n = searchMatches.length;
  if (!n) return;
  noteBodySearch.idx = (noteBodySearch.idx + dir + n) % n;
  var cnt = document.getElementById("noteBodySearchCount");
  if (cnt) cnt.textContent = (noteBodySearch.idx + 1) + "/" + n;
  focusNoteMatch();
}

// Find all matches for the current query in the Quill document. Navigation
// selects each hit (via the native selection) and scrolls it into view — no
// document mutation, so it never dirties the note.
function runNoteBodySearch(jump) {
  var cnt = document.getElementById("noteBodySearchCount");
  searchMatches = [];
  var q = (noteBodySearch.q || "").trim();
  if (!quill || !q) {
    if (cnt) cnt.textContent = "";
    return;
  }
  var text = quill.getText();
  var lc = text.toLowerCase(), lq = q.toLowerCase(), i = 0;
  while (i <= lc.length) {
    var idx = lc.indexOf(lq, i);
    if (idx === -1) break;
    searchMatches.push(idx);
    i = idx + lq.length;
  }
  var n = searchMatches.length;
  if (noteBodySearch.idx >= n) noteBodySearch.idx = 0;
  if (cnt) cnt.textContent = n ? (noteBodySearch.idx + 1) + "/" + n : "0 results";
  if (jump && n) focusNoteMatch();
}

function focusNoteMatch() {
  var q = (noteBodySearch.q || "").trim();
  if (!quill || !searchMatches.length) return;
  var idx = searchMatches[noteBodySearch.idx];
  quill.setSelection(idx, q.length, "user");
  // The page (.ql-editor) grows with content; the .note-canvas is the scroller,
  // so scroll the match into the canvas viewport ourselves.
  var sel = window.getSelection();
  var canvas = document.querySelector(".note-canvas");
  if (sel && sel.rangeCount && canvas) {
    var rect = sel.getRangeAt(0).getBoundingClientRect();
    var crect = canvas.getBoundingClientRect();
    if (rect.height && (rect.top < crect.top || rect.bottom > crect.bottom)) {
      canvas.scrollTop += (rect.top - crect.top) - canvas.clientHeight / 2;
    }
  }
}

function getReplaceValue() {
  var el = document.getElementById("noteBodyReplace");
  return el ? el.value : "";
}

// Replace the currently-focused match, then re-run the search.
export function noteReplaceCurrent() {
  var q = (noteBodySearch.q || "");
  if (!quill || !q || !searchMatches.length) return;
  var rep = getReplaceValue();
  var idx = searchMatches[noteBodySearch.idx];
  var current = quill.getText(idx, q.length);
  if (current.toLowerCase() !== q.toLowerCase()) { runNoteBodySearch(true); return; }
  quill.deleteText(idx, q.length, "user");
  if (rep) quill.insertText(idx, rep, "user");
  runNoteBodySearch(true);
}

// Replace every match. Work back-to-front so earlier offsets stay valid.
export function noteReplaceAll() {
  var q = (noteBodySearch.q || "");
  if (!quill || !q) return;
  var rep = getReplaceValue();
  runNoteBodySearch(false);
  for (var i = searchMatches.length - 1; i >= 0; i--) {
    var idx = searchMatches[i];
    quill.deleteText(idx, q.length, "user");
    if (rep) quill.insertText(idx, rep, "user");
  }
  noteBodySearch.idx = 0;
  runNoteBodySearch(true);
}

// ---- Version history ----
var selectedRevisionId = null;

function relTime(ts) {
  var m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
  var h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  var d = Math.floor(h / 24);
  if (d < 7) return d + (d === 1 ? " day ago" : " days ago");
  return new Date(ts).toLocaleDateString();
}

export async function openNoteHistory() {
  if (!currentNote) return;
  var modal = document.getElementById("noteHistoryModal");
  if (!modal) return;
  selectedRevisionId = null;
  var listEl = document.getElementById("nhList");
  var prev = document.getElementById("nhPreview");
  var meta = document.getElementById("nhPreviewMeta");
  var restore = document.getElementById("nhRestoreBtn");
  if (prev) prev.innerHTML = '<div class="muted nh-hint">Select a version on the left to preview it.</div>';
  if (meta) meta.textContent = "";
  if (restore) restore.style.display = "none";
  if (listEl) listEl.innerHTML = '<div class="muted nh-hint">Loading…</div>';
  if (typeof modal.showModal === "function") modal.showModal();
  try {
    var revs = await (await fetch("/api/notes/" + currentNote + "/revisions")).json();
    renderRevisionList(revs);
  } catch (e) {
    if (listEl) listEl.innerHTML = '<div class="muted nh-hint">Could not load history.</div>';
  }
}

function renderRevisionList(revs) {
  var listEl = document.getElementById("nhList");
  if (!listEl) return;
  if (!revs || !revs.length) {
    listEl.innerHTML = '<div class="muted nh-hint">No earlier versions yet. Snapshots are saved automatically as you keep editing.</div>';
    return;
  }
  var html = "";
  revs.forEach(function(r, i) {
    html += '<div class="nh-item" data-id="' + r.id + '" onclick="previewRevision(\'' + r.id + '\')">' +
      '<div class="nh-when">' + esc(relTime(r.created)) + (i === 0 ? ' <span class="nh-badge">newest</span>' : '') + '</div>' +
      '<div class="muted nh-abs">' + esc(new Date(r.created).toLocaleString()) + '</div>' +
      '</div>';
  });
  listEl.innerHTML = html;
}

export function previewRevision(rid) {
  selectedRevisionId = rid;
  var items = document.querySelectorAll("#nhList .nh-item");
  items.forEach(function(el) { el.classList.toggle("sel", el.getAttribute("data-id") === rid); });
  var prev = document.getElementById("nhPreview");
  var meta = document.getElementById("nhPreviewMeta");
  var restore = document.getElementById("nhRestoreBtn");
  if (prev) prev.innerHTML = '<div class="muted nh-hint">Loading…</div>';
  fetch("/api/notes/" + currentNote + "/revisions/" + rid)
    .then(function(r) { return r.json(); })
    .then(function(rev) {
      // rev.body was sanitized server-side before storage.
      if (prev) prev.innerHTML = rev.body_format === "html" ? (rev.body || "") : mdToHtml(rev.body || "");
      if (meta) meta.textContent = "Version from " + new Date(rev.created).toLocaleString();
      if (restore) restore.style.display = "";
    })
    .catch(function() {
      if (prev) prev.innerHTML = '<div class="muted nh-hint">Could not load this version.</div>';
    });
}

export async function restoreSelectedRevision() {
  if (!currentNote || !selectedRevisionId) return;
  if (!confirm("Restore this version? Your current content is saved to history first, so you can undo this.")) return;
  await api("POST", "/api/notes/" + currentNote + "/revisions/" + selectedRevisionId + "/restore");
  closeNoteHistory();
  loadedNoteId = null;   // force the editor to reload the restored content
  if (window.refreshApp) await window.refreshApp();
}

export function closeNoteHistory() {
  var modal = document.getElementById("noteHistoryModal");
  if (modal && modal.close) modal.close();
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
    loadedNoteId = null;
    localStorage.removeItem("active_note_id");
    // On mobile: exit editor-panel mode
    var layout = document.querySelector(".noteslayout");
    if (layout) layout.classList.remove("note-editing");
    document.body.classList.remove("note-open");
    if (ed) ed.style.display = "none";
    return;
  }
  // Reveal via CSS (desktop: flex column; mobile: block panel) — don't hard-set
  // 'block' or it would override the flex layout the Docs canvas depends on.
  if (ed) ed.style.display = "";
  var layout = document.querySelector(".noteslayout");
  if (layout) layout.classList.add("note-editing");
  document.body.classList.add("note-open");

  // Load Quill on first use, then re-render once it's ready.
  if (!window.Quill) {
    ensureQuill().then(function() { renderNotes(); }).catch(function() {});
    return;
  }
  initQuill();

  var titleEl = document.getElementById("noteTitle");
  // Only (re)load a note's content when actually switching notes. Reloading on
  // every render would reset the caret and could clobber live edits mid-type,
  // and a live-sync tick must never overwrite what the user is writing.
  if (loadedNoteId !== currentNote) {
    if (titleEl) titleEl.value = n.title || "";
    var body = n.body || "";
    // Legacy Markdown notes are converted to HTML for display; they persist as
    // HTML on the first edit (see noteChanged).
    setEditorBody(n.body_format === "html" ? body : (body ? mdToHtml(body) : ""));
    loadedNoteId = currentNote;
    noteBodySearch.idx = 0;
    searchMatches = [];
    updateCounters();
  }

  var statusEl = document.getElementById("noteSaveStatus");
  if (statusEl && !noteTimer) {
    statusEl.textContent = "Saved at " + formatTime(n.updated || Date.now());
    statusEl.className = "note-status saved";
  }
  });
}

// Toggle the in-note search bar. On mobile it is collapsed by default to give
// the editor maximum room; this reveals/hides it and focuses the field.
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
    var rep = document.getElementById("noteBodyReplace");
    if (rep) rep.value = "";
    input.blur();
    runNoteBodySearch(false);
  }
}

// Mobile panel navigation: go back from editor to note list
export function notesGoBack() {
  currentNote = null;
  loadedNoteId = null;
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

export async function downloadNoteAs(format) {
  if (!currentNote) return;
  var note = S.notes.find(function(n) { return n.id === currentNote; });
  if (!note) return;
  
  var title = note.title || "Untitled";
  var isHtmlNote = note.body_format === "html";

  if (format === 'md') {
    // HTML notes export their raw rich HTML; legacy notes stay Markdown.
    triggerDownload(note.body || "", title + (isHtmlNote ? ".html" : ".md"),
      isHtmlNote ? "text/html" : "text/markdown");
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
    var rawHtml = await inlineExportImages(noteBodyHtml(note));
    // Replace wiki links with alert behavior in standalone mode
    var renderedHtml = rawHtml.replace(/onclick="openNote\('([^']+)'\);return false;"/g, 'onclick="alert(\'This link points to another note inside TyloPlanner. Download as a Compiled Notebook to make links interactive.\');return false;"');

    var theme = localStorage.getItem("tylo-theme") || "dark";
    var updatedDate = new Date(note.updated || Date.now()).toLocaleDateString();
    var plainText = notePlainText(note);
    var wordCount = getWordCount(plainText);
    var charCount = plainText.length;
    
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
      width: auto;
      max-width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      display: block;
      overflow-x: auto;
    }
    .markdown-body th, .markdown-body td {
      padding: 8px 12px;
      border: 1px solid var(--border);
      text-align: left;
    }
    .markdown-body th {
      background: var(--panel2);
    }
    .markdown-body img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      display: block;
      margin: 8px 0;
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

async function compileDigitalNotebook(rootFolderId, notebookTitle) {
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
  for (var ni = 0; ni < exportedNotes.length; ni++) {
    var n = exportedNotes[ni];
    var rawHtml = await inlineExportImages(noteBodyHtml(n));
    // Replace openNote with showNote
    var localHtml = rawHtml.replace(/onclick="openNote\('([^']+)'\);return false;"/g, 'href="#note-$1" onclick="showNote(\'$1\');return false;"');

    renderedNotesMap[n.id] = {
      id: n.id,
      title: n.title || "Untitled",
      // Plain text is used only for the word/char counters in the exported page.
      body: notePlainText(n),
      html: localHtml,
      updated: n.updated || Date.now(),
      folder_id: n.folder_id
    };
  }

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
      width: auto;
      max-width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      display: block;
      overflow-x: auto;
    }
    .markdown-body th, .markdown-body td {
      padding: 8px 12px;
      border: 1px solid var(--border);
      text-align: left;
    }
    .markdown-body th {
      background: var(--panel2);
    }
    .markdown-body img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      display: block;
      margin: 8px 0;
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

export async function downloadNoteFolder(folderId) {
  if (!folderId) return;
  var folder = S.note_folders.find(function(f) { return f.id === folderId; });
  if (!folder) return;
  await compileDigitalNotebook(folderId, (folder.name || "Folder") + " Notes");
}

export async function downloadAllNotesNotebook() {
  await compileDigitalNotebook(null, "TyloPlanner Notes");
}

