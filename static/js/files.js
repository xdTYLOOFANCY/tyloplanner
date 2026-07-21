// TyloPlanner — file storage module (Drive-style).
//
// Left rail: New button, views (My Files / Starred / Recent / Trash / Storage)
// and a folder tree. Main pane: breadcrumbs, folder cards, file list/grid.
// Trash is a soft delete (server auto-purges after the retention window).
// The Storage view is the storage manager: quota, per-category usage,
// biggest files, folder sizes, maintenance.

import { S, safeRender } from './state.js';
import { esc, api, toast, askConfirm, askPrompt, showContextMenu } from './utils.js';

var filesView = "files";   // files | starred | recent | trash | storage
var activeFolderId = null;
var sortKey = localStorage.getItem("file_sort") || "date";
var sortDir = localStorage.getItem("file_sort_dir") || "desc";
var viewMode = localStorage.getItem("file_view") || "list";
var selectedFiles = [];
var selectedFolders = [];
var lastClickedFileId = null;
var expandedFolders = new Set(JSON.parse(localStorage.getItem("files_tree_open") || "[]"));
var lastListing = [];      // file ids in current display order (preview prev/next)
var lastFileSearchQuery = "";
var fileSearchResults = null;
var fileSearchTimeout = null;
var dragPayload = null;    // {files:[], folders:[]} during an internal drag
var initDone = false;

// storage stats cache (/api/storage)
var storageStats = null;
var storageStatsTs = 0;
var storageStatsLoading = false;

// ---------- basic helpers ----------

function liveFiles() { return (S.files || []).filter(function(f) { return !f.deleted; }); }
function liveFolders() { return (S.folders || []).filter(function(f) { return !f.deleted; }); }
function trashedFiles() { return (S.files || []).filter(function(f) { return f.deleted; }); }
function trashedFolders() { return (S.folders || []).filter(function(f) { return f.deleted; }); }
function fileById(id) { return (S.files || []).find(function(f) { return f.id === id; }); }
function folderById(id) { return (S.folders || []).find(function(f) { return f.id === id; }); }

function fmtSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (Math.round(bytes / 102.4) / 10) + " KB";
  if (bytes < 1073741824) return (Math.round(bytes / 104857.6) / 10) + " MB";
  return (Math.round(bytes / 107374182.4) / 10) + " GB";
}

function fileExt(f) {
  var m = /\.([a-z0-9]+)$/i.exec(f.filename || "");
  return m ? m[1].toLowerCase() : "";
}

function getFileIcon(f) {
  var mt = f.mimetype || "";
  var ext = fileExt(f);
  if (mt.startsWith("image/")) return "🖼️";
  if (mt === "application/pdf" || ext === "pdf") return "📕";
  if (mt.startsWith("audio/")) return "🎵";
  if (mt.startsWith("video/")) return "🎬";
  if (ext === "docx" || ext === "doc" || ext === "odt") return "📄";
  if (ext === "xlsx" || ext === "xls" || ext === "csv" || ext === "tsv" || ext === "ods") return "📊";
  if (ext === "pptx" || ext === "ppt" || ext === "odp") return "📽️";
  if (mt.startsWith("text/") || ext === "md" || ext === "txt") return "📝";
  if (["zip", "rar", "7z", "tar", "gz"].indexOf(ext) !== -1 || mt.indexOf("zip") !== -1 || mt.indexOf("compressed") !== -1) return "📦";
  if (["js", "py", "html", "css", "json", "ts", "java", "c", "cpp", "sh", "sql", "r"].indexOf(ext) !== -1) return "💻";
  return "📎";
}

var TEXT_EXTS = ["txt", "log", "json", "xml", "yml", "yaml", "js", "ts", "py", "html", "css",
  "java", "c", "cpp", "h", "sh", "sql", "r", "ini", "cfg", "toml", "tex", "bib"];

// What the preview modal can render.
function previewKind(f) {
  var mt = f.mimetype || "";
  var ext = fileExt(f);
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("video/")) return "video";
  if (mt.startsWith("audio/")) return "audio";
  if (mt === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "xlsx" || ext === "csv" || ext === "tsv") return "server";
  if (ext === "md" || ext === "markdown") return "markdown";
  if ((mt.startsWith("text/") || TEXT_EXTS.indexOf(ext) !== -1) && (f.size || 0) < 2097152) return "text";
  return "none";
}

function storageCategory(f) {
  var mt = f.mimetype || "";
  var ext = fileExt(f);
  if (mt.startsWith("image/")) return "images";
  if (mt.startsWith("video/")) return "video";
  if (mt.startsWith("audio/")) return "audio";
  if (["pdf", "doc", "docx", "odt", "xls", "xlsx", "ods", "csv", "tsv", "ppt", "pptx",
       "odp", "txt", "md", "tex"].indexOf(ext) !== -1) return "docs";
  if (["zip", "rar", "7z", "tar", "gz"].indexOf(ext) !== -1) return "archives";
  return "other";
}

function folderChildren(parentId) {
  return liveFolders().filter(function(f) { return (f.parent_id || null) === (parentId || null); })
    .sort(function(a, b) { return (a.name || "").localeCompare(b.name || ""); });
}

function folderPath(folderId) {
  var path = [], cur = folderId, limit = 30;
  while (cur && limit-- > 0) {
    var f = folderById(cur);
    if (!f) break;
    path.unshift(f);
    cur = f.parent_id;
  }
  return path;
}

function isDescendantOf(folderId, ancestorId) {
  var cur = folderId, limit = 30;
  while (cur && limit-- > 0) {
    if (cur === ancestorId) return true;
    var f = folderById(cur);
    cur = f ? f.parent_id : null;
  }
  return false;
}

// Recursive folder size over live files.
function folderSize(folderId) {
  var total = 0;
  liveFiles().forEach(function(f) {
    if (f.folder_id && isDescendantOf(f.folder_id, folderId)) total += f.size || 0;
  });
  return total;
}

function refresh() { return window.refreshApp ? window.refreshApp() : Promise.resolve(); }

function fetchStorageStats(force) {
  if (storageStatsLoading) return;
  if (!force && storageStats && Date.now() - storageStatsTs < 60000) return;
  storageStatsLoading = true;
  fetch("/api/storage").then(function(r) { return r.json(); }).then(function(j) {
    storageStatsLoading = false;
    var changed = JSON.stringify(j) !== JSON.stringify(storageStats);
    storageStats = j;
    storageStatsTs = Date.now();
    if (changed) renderFiles();
  }).catch(function() { storageStatsLoading = false; });
}

// ---------- upload progress panel ----------
// Lives on document.body so live-sync renderAll() can never wipe it mid-upload.

function getUploadPanel() {
  var panel = document.getElementById("uploadProgressPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "uploadProgressPanel";
    panel.innerHTML = '<div class="upload-panel-header"><span id="uploadPanelTitle">Uploading…</span>' +
      '<button class="upload-panel-close" onclick="document.getElementById(\'uploadProgressPanel\').style.display=\'none\'">✕</button></div>' +
      '<div id="uploadPanelRows"></div>';
    document.body.appendChild(panel);
  }
  panel.style.display = "block";
  return panel;
}

function uploadOneFile(file, folderId, row) {
  return new Promise(function(resolve) {
    var fd = new FormData();
    fd.append("file", file);
    if (folderId) fd.append("folder_id", folderId);

    var bar = row.querySelector(".upload-row-bar span");
    var pct = row.querySelector(".upload-row-pct");
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        var p = Math.round((e.loaded / e.total) * 100);
        bar.style.width = p + "%";
        pct.textContent = p + "%";
      }
    };
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        bar.style.width = "100%";
        row.classList.add("done");
        pct.textContent = "✓";
        resolve(null);
      } else {
        var msg = "failed";
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) {}
        row.classList.add("failed");
        pct.textContent = "✕";
        row.title = msg;
        resolve(msg);
      }
    };
    xhr.onerror = function() {
      row.classList.add("failed");
      pct.textContent = "✕";
      row.title = "network error";
      resolve("network error");
    };
    xhr.send(fd);
  });
}

// jobs: [{file, folderId}]
async function uploadJobsWithProgress(jobs) {
  if (!jobs.length) return;
  var panel = getUploadPanel();
  var rows = document.getElementById("uploadPanelRows");
  var title = document.getElementById("uploadPanelTitle");
  rows.innerHTML = "";
  title.textContent = "Uploading " + jobs.length + " file" + (jobs.length > 1 ? "s" : "") + "…";

  var queue = [];
  jobs.forEach(function(job) {
    var row = document.createElement("div");
    row.className = "upload-row";
    row.innerHTML = '<div class="upload-row-name">' + esc(job.file.name) + '</div>' +
      '<div class="upload-row-bar"><span></span></div>' +
      '<div class="upload-row-pct">queued</div>';
    rows.appendChild(row);
    queue.push({ file: job.file, folderId: job.folderId, row: row });
  });

  // Max 5 concurrent uploads; the rest wait in the queue.
  var errors = [];
  async function worker() {
    while (queue.length) {
      var job = queue.shift();
      job.row.querySelector(".upload-row-pct").textContent = "0%";
      var err = await uploadOneFile(job.file, job.folderId, job.row);
      if (err) errors.push(err);
    }
  }
  var workers = [];
  for (var w = 0; w < Math.min(5, jobs.length); w++) workers.push(worker());
  await Promise.all(workers);
  var ok = jobs.length - errors.length;
  title.textContent = errors.length ? (ok + " uploaded, " + errors.length + " failed") : ("Uploaded " + ok + " file" + (ok > 1 ? "s" : ""));
  if (errors.length) {
    // Quota errors repeat per file — surface just the first one.
    toast(errors[0]);
  } else {
    setTimeout(function() { panel.style.display = "none"; }, 2500);
    toast("Uploaded " + ok + " file" + (ok > 1 ? "s" : ""));
  }
  storageStatsTs = 0;
  await refresh();
}

// Create (or find) the folder chain ["Uni","Week 1"] under baseId; returns leaf id.
var folderPathCache = {};
async function ensureFolderPath(parts, baseId) {
  var parentId = baseId || null;
  for (var i = 0; i < parts.length; i++) {
    var name = parts[i];
    if (!name) continue;
    var key = (parentId || "root") + "/" + name;
    if (folderPathCache[key]) { parentId = folderPathCache[key]; continue; }
    var existing = liveFolders().find(function(f) {
      return (f.parent_id || null) === parentId && f.name === name;
    });
    if (existing) {
      folderPathCache[key] = existing.id;
      parentId = existing.id;
      continue;
    }
    var res = await api("POST", "/api/folders", { name: name, parent_id: parentId });
    folderPathCache[key] = res.id;
    parentId = res.id;
  }
  return parentId;
}

// files: FileList/array; each may carry webkitRelativePath ("Top/sub/a.pdf").
async function uploadFilesToCurrentFolder(files) {
  var list = Array.prototype.slice.call(files);
  if (!list.length) return;
  folderPathCache = {};
  var jobs = [];
  for (var i = 0; i < list.length; i++) {
    var f = list[i];
    var rel = f.webkitRelativePath || f._relPath || "";
    var parts = rel ? rel.split("/").slice(0, -1) : [];
    var folderId = parts.length ? await ensureFolderPath(parts, activeFolderId) : activeFolderId;
    jobs.push({ file: f, folderId: folderId });
  }
  if (jobs.length) await uploadJobsWithProgress(jobs);
}

export async function uploadFile() {
  var input = document.getElementById("fileInput");
  if (!input.files || !input.files.length) return;
  var picked = Array.prototype.slice.call(input.files);
  input.value = "";
  await uploadFilesToCurrentFolder(picked);
}

export async function uploadFolderInput() {
  var input = document.getElementById("folderInput");
  if (!input.files || !input.files.length) return;
  var picked = Array.prototype.slice.call(input.files);
  input.value = "";
  await uploadFilesToCurrentFolder(picked);
}

export async function uploadCameraFile() {
  var input = document.getElementById("cameraInput");
  if (!input.files || !input.files.length) return;
  var picked = Array.prototype.slice.call(input.files);
  input.value = "";
  await uploadFilesToCurrentFolder(picked);
}

// Recursively collect files from an OS drag that may include directories.
function collectDroppedFiles(dataTransfer) {
  var items = dataTransfer.items;
  if (!items || !items.length || !items[0].webkitGetAsEntry) {
    return Promise.resolve(Array.prototype.slice.call(dataTransfer.files));
  }
  var out = [];
  function walkEntry(entry, prefix) {
    return new Promise(function(resolve) {
      if (!entry) return resolve();
      if (entry.isFile) {
        entry.file(function(file) {
          if (prefix) file._relPath = prefix + file.name;
          out.push(file);
          resolve();
        }, function() { resolve(); });
      } else if (entry.isDirectory) {
        var reader = entry.createReader();
        var all = [];
        (function readMore() {
          reader.readEntries(function(entries) {
            if (!entries.length) {
              Promise.all(all.map(function(e) { return walkEntry(e, prefix + entry.name + "/"); }))
                .then(resolve);
              return;
            }
            all = all.concat(entries);
            readMore();
          }, function() { resolve(); });
        })();
      } else resolve();
    });
  }
  var walks = [];
  for (var i = 0; i < items.length; i++) {
    var entry = items[i].webkitGetAsEntry();
    if (entry) walks.push(walkEntry(entry, ""));
  }
  return Promise.all(walks).then(function() { return out.slice(0, 1000); });
}

// ---------- one-time wiring ----------

function ensureInit() {
  if (initDone) return;
  initDone = true;

  var tabFiles = document.getElementById("tab-files");
  if (tabFiles) {
    var dragCounter = 0;
    tabFiles.addEventListener("dragenter", function(e) {
      e.preventDefault();
      if (!e.dataTransfer || e.dataTransfer.types.indexOf("Files") === -1) return;
      dragCounter++;
      if (dragCounter === 1) {
        var overlay = document.getElementById("fileDropOverlay");
        if (overlay) {
          overlay.style.display = "flex";
          var span = document.getElementById("dropFolderName");
          if (span) {
            var cur = folderById(activeFolderId);
            span.textContent = (filesView === "files" && cur) ? cur.name : "My Files";
          }
        }
      }
    });
    tabFiles.addEventListener("dragover", function(e) { e.preventDefault(); });
    tabFiles.addEventListener("dragleave", function(e) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        var overlay = document.getElementById("fileDropOverlay");
        if (overlay) overlay.style.display = "none";
      }
    });
    tabFiles.addEventListener("drop", async function(e) {
      e.preventDefault();
      dragCounter = 0;
      var overlay = document.getElementById("fileDropOverlay");
      if (overlay) overlay.style.display = "none";
      if (dragPayload) return; // internal move, handled by drop targets
      if (filesView !== "files") { filesView = "files"; activeFolderId = null; }
      var files = await collectDroppedFiles(e.dataTransfer);
      if (files.length) await uploadFilesToCurrentFolder(files);
    });
  }

  var modal = document.getElementById("mediaPreviewModal");
  if (modal) {
    modal.addEventListener("keydown", function(e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); previewStep(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); previewStep(1); }
    });
  }
}

// ---------- render ----------

export function renderFiles() {
  safeRender("files", function() {
    ensureInit();
    if (dragPayload) return; // don't re-render mid-drag (live-sync guard)

    if (activeFolderId && !folderById(activeFolderId)) activeFolderId = null;
    var fol = folderById(activeFolderId);
    if (fol && fol.deleted) activeFolderId = null;
    selectedFiles = selectedFiles.filter(function(id) { return fileById(id); });
    selectedFolders = selectedFolders.filter(function(id) { return folderById(id); });

    renderSidebar();
    renderToolbar();
    renderSelectionBar();
    renderContent();
  });
}

function navItem(view, icon, label, extra) {
  var active = filesView === view && (view !== "files" || !activeFolderId);
  return '<div class="fnav-row' + (active ? ' active' : '') + '" onclick="setFilesView(\'' + view + '\')"' +
    (view === "files" ? ' ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, null)"' : '') +
    (view === "trash" ? ' ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onTrashDrop(event)"' : '') +
    '><span class="fnav-ic">' + icon + '</span><span class="fnav-name">' + label + '</span>' +
    (extra || '') + '</div>';
}

function renderTreeRows(parentId, depth) {
  var html = "";
  folderChildren(parentId).forEach(function(f) {
    var kids = folderChildren(f.id).length > 0;
    var open = expandedFolders.has(f.id);
    var active = filesView === "files" && activeFolderId === f.id;
    html += '<div class="fnav-row tree' + (active ? ' active' : '') + '" style="padding-left:' + (10 + depth * 14) + 'px" ' +
      'onclick="navigateToFolder(\'' + f.id + '\')" oncontextmenu="folderContextMenu(event, \'' + f.id + '\')" ' +
      'draggable="true" ondragstart="onItemDragStart(event, \'' + f.id + '\', true)" ondragend="onItemDragEnd(event)" ' +
      'ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, \'' + f.id + '\')">' +
      '<span class="fnav-caret' + (kids ? '' : ' none') + (open ? ' open' : '') + '" onclick="toggleFolderExpand(\'' + f.id + '\', event)">' + (kids ? '▸' : '') + '</span>' +
      '<span class="fnav-ic">' + esc(f.icon || '📁') + '</span>' +
      '<span class="fnav-name">' + esc(f.name || 'Folder') + '</span></div>';
    if (kids && open) html += renderTreeRows(f.id, depth + 1);
  });
  return html;
}

function renderSidebar() {
  var nav = document.getElementById("filesNav");
  if (nav) {
    var trashCount = trashedFiles().length + trashedFolders().filter(function(f) {
      var p = f.parent_id ? folderById(f.parent_id) : null;
      return !p || !p.deleted;
    }).length;
    var html = navItem("files", "🏠", "My Files");
    html += '<div id="filesTree" class="files-tree">' + renderTreeRows(null, 1) + '</div>';
    html += navItem("starred", "★", "Starred");
    html += navItem("recent", "🕒", "Recent");
    html += navItem("trash", "🗑️", "Trash", trashCount ? '<span class="fnav-count">' + trashCount + '</span>' : '');
    html += navItem("storage", "📊", "Storage");
    nav.innerHTML = html;
  }

  var mini = document.getElementById("filesStorageMini");
  if (mini) {
    fetchStorageStats(false);
    var used = storageStats ? (storageStats.files_bytes + storageStats.trash_bytes)
      : liveFiles().concat(trashedFiles()).reduce(function(a, f) { return a + (f.size || 0); }, 0);
    var quota = storageStats ? storageStats.quota_bytes : 0;
    var pct = quota ? Math.min(100, Math.round(used / quota * 100)) : 0;
    var cls = pct >= 95 ? " full" : pct >= 80 ? " warn" : "";
    mini.innerHTML =
      '<div class="fsm-bar"><span class="' + cls.trim() + '" style="width:' + (quota ? pct : 0) + '%"></span></div>' +
      '<div class="fsm-label">' + fmtSize(used) + (quota ? ' of ' + fmtSize(quota) : ' used') + '</div>';
  }
}

var VIEW_TITLES = { starred: "★ Starred", recent: "🕒 Recent", trash: "🗑️ Trash", storage: "📊 Storage" };

function renderToolbar() {
  var crumbs = document.getElementById("fileCrumbs");
  if (crumbs) {
    var html = "";
    if (filesView === "files") {
      html += '<span class="breadcrumb-item' + (activeFolderId ? '' : ' active') + '" onclick="navigateToFolder(null)" ' +
        'ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, null)">My Files</span>';
      folderPath(activeFolderId).forEach(function(f, idx, path) {
        var isLast = idx === path.length - 1;
        html += '<span class="breadcrumb-separator">›</span>' +
          '<span class="breadcrumb-item' + (isLast ? ' active' : '') + '" ' +
          'oncontextmenu="folderContextMenu(event, \'' + f.id + '\')" ' +
          (isLast ? '' : 'onclick="navigateToFolder(\'' + f.id + '\')" ') +
          'ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, \'' + f.id + '\')">' +
          (f.icon ? esc(f.icon) + ' ' : '') + esc(f.name) + '</span>';
      });
    } else {
      html += '<span class="breadcrumb-item active">' + VIEW_TITLES[filesView] + '</span>';
    }
    crumbs.innerHTML = html;
  }

  var ctl = document.getElementById("fileSortCtl");
  if (ctl) {
    if (filesView === "storage" || filesView === "trash") {
      ctl.innerHTML = "";
      ctl.style.display = "none";  // empty .file-sort-group still paints its pill chrome
      return;
    }
    ctl.style.display = "";
    var arrow = sortDir === "asc" ? "▲" : "▼";
    var html = "";
    [["name", "Name"], ["date", "Date"], ["size", "Size"], ["type", "Type"]].forEach(function(s) {
      var on = sortKey === s[0];
      html += '<button class="btn-sort' + (on ? ' active' : '') + '" onclick="setFileSort(\'' + s[0] + '\')">' +
        s[1] + (on ? ' ' + arrow : '') + '</button>';
    });
    html += '<span class="sort-sep"></span>';
    html += '<button class="btn-sort' + (viewMode === "list" ? ' active' : '') + '" onclick="setFileView(\'list\')" title="List view">☰</button>';
    html += '<button class="btn-sort' + (viewMode === "grid" ? ' active' : '') + '" onclick="setFileView(\'grid\')" title="Grid view">▦</button>';
    ctl.innerHTML = html;
  }
}

function renderSelectionBar() {
  var bar = document.getElementById("fileSelectionBar");
  if (!bar) return;
  var n = selectedFiles.length + selectedFolders.length;
  if (!n) { bar.innerHTML = ""; return; }
  var label = n + " selected";
  var btns = "";
  if (filesView === "trash") {
    btns += '<button class="btn small" onclick="restoreSelected()">♻️ Restore</button>' +
      '<button class="btn danger small" onclick="deleteForeverSelected()">✕ Delete forever</button>';
  } else {
    btns += '<button class="btn small" onclick="downloadSelected()">⬇️ Download</button>' +
      '<button class="btn small" onclick="openMoveDialog()">📁 Move</button>';
    if (selectedFiles.length && !selectedFolders.length) {
      btns += '<button class="btn small ghost" onclick="starSelected()">★ Star</button>';
    }
    btns += '<button class="btn danger small" onclick="trashSelected()">🗑️ Trash</button>';
  }
  btns += '<button class="btn ghost small" onclick="clearFileSelection()">✕</button>';
  bar.innerHTML = '<div class="selection-bar"><div>' + label + '</div>' +
    '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' + btns + '</div></div>';
}

function sortFiles(list) {
  var dir = sortDir === "asc" ? 1 : -1;
  list.sort(function(a, b) {
    if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
    if (sortKey === "name") return dir * (a.filename || "").localeCompare(b.filename || "");
    if (sortKey === "size") return dir * ((a.size || 0) - (b.size || 0));
    if (sortKey === "type") return dir * fileExt(a).localeCompare(fileExt(b));
    return dir * ((a.uploaded || 0) - (b.uploaded || 0));
  });
  return list;
}

function currentQuery() {
  var el = document.getElementById("fileSearch");
  return el ? el.value.trim().toLowerCase() : "";
}

// The files + folders shown for the current view/search.
function getListing() {
  var q = currentQuery();
  var files, folders = [], showPath = false;
  if (q) {
    showPath = true;
    folders = liveFolders().filter(function(f) { return (f.name || "").toLowerCase().indexOf(q) !== -1; });
    if (fileSearchResults !== null) {
      files = liveFiles().filter(function(f) { return fileSearchResults.indexOf(f.id) !== -1; });
      files.sort(function(a, b) { return fileSearchResults.indexOf(a.id) - fileSearchResults.indexOf(b.id); });
      return { files: files, folders: folders, showPath: showPath, presorted: true };
    }
    files = liveFiles().filter(function(f) { return (f.filename || "").toLowerCase().indexOf(q) !== -1; });
  } else if (filesView === "starred") {
    files = liveFiles().filter(function(f) { return f.is_pinned; });
    showPath = true;
  } else if (filesView === "recent") {
    files = liveFiles().slice().sort(function(a, b) { return (b.uploaded || 0) - (a.uploaded || 0); }).slice(0, 50);
    showPath = true;
    return { files: files, folders: [], showPath: true, presorted: true };
  } else {
    folders = folderChildren(activeFolderId);
    files = liveFiles().filter(function(f) { return (f.folder_id || null) === (activeFolderId || null); });
  }
  return { files: sortFiles(files), folders: folders, showPath: showPath, presorted: false };
}

function pathLabel(f) {
  var path = folderPath(f.folder_id).map(function(x) { return x.name; }).join(" / ");
  return path || "My Files";
}

function folderCardHtml(f) {
  var sel = selectedFolders.indexOf(f.id) !== -1;
  return '<div class="folder-card' + (sel ? ' selected' : '') + '" onclick="folderClick(event, \'' + f.id + '\')" ' +
    'oncontextmenu="folderContextMenu(event, \'' + f.id + '\')" ' +
    'draggable="true" ondragstart="onItemDragStart(event, \'' + f.id + '\', true)" ondragend="onItemDragEnd(event)" ' +
    'ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, \'' + f.id + '\')">' +
    '<span class="hcheck file-card-check' + (sel ? ' on' : '') + '" onclick="folderCheck(\'' + f.id + '\', event)">' + (sel ? '✓' : '') + '</span>' +
    '<div class="folder-icon">' + esc(f.icon || '📁') + '</div>' +
    '<div class="folder-name" title="' + esc(f.name) + '">' + esc(f.name) + '</div>' +
    '<button class="file-kebab" onclick="folderContextMenu(event, \'' + f.id + '\'); event.stopPropagation();" title="More">⋯</button>' +
    '</div>';
}

function fileRowHtml(f, showPath) {
  var sel = selectedFiles.indexOf(f.id) !== -1;
  var meta = fmtSize(f.size) + ' · ' + new Date(f.uploaded || 0).toLocaleDateString();
  if (showPath) meta += ' · <span class="muted">' + esc(pathLabel(f)) + '</span>';
  var star = f.is_pinned ? ' <span class="file-star">★</span>' : '';
  var thumb = (f.mimetype || "").startsWith("image/")
    ? '<img class="file-row-thumb" src="/api/files/' + f.id + '/view" loading="lazy" alt="">'
    : '<span class="file-row-ic">' + getFileIcon(f) + '</span>';
  return '<div class="list-item file-item' + (sel ? ' selected' : '') + (f.is_pinned ? ' file-pinned' : '') + '" ' +
    'onclick="fileClick(event, \'' + f.id + '\')" oncontextmenu="fileContextMenu(event, \'' + f.id + '\')" ' +
    'draggable="true" ondragstart="onItemDragStart(event, \'' + f.id + '\', false)" ondragend="onItemDragEnd(event)">' +
    '<span class="hcheck' + (sel ? ' on' : '') + '" onclick="fileCheck(\'' + f.id + '\', event)">' + (sel ? '✓' : '') + '</span>' +
    thumb +
    '<div class="grow file-row-main"><div class="file-name">' + esc(f.filename || "Unnamed") + star + '</div>' +
    '<div class="file-meta">' + meta + '</div></div>' +
    '<button class="file-kebab" onclick="fileContextMenu(event, \'' + f.id + '\'); event.stopPropagation();" title="More">⋯</button>' +
    '</div>';
}

function fileCardHtml(f, showPath) {
  var sel = selectedFiles.indexOf(f.id) !== -1;
  var thumbHtml = (f.mimetype || "").startsWith("image/")
    ? '<img class="file-thumb-img" src="/api/files/' + f.id + '/view" loading="lazy" alt="">'
    : '<span class="file-thumb-icon">' + getFileIcon(f) + '</span>';
  var star = f.is_pinned ? ' <span class="file-star">★</span>' : '';
  return '<div class="file-card' + (sel ? ' selected' : '') + (f.is_pinned ? ' file-pinned' : '') + '" ' +
    'onclick="fileClick(event, \'' + f.id + '\')" oncontextmenu="fileContextMenu(event, \'' + f.id + '\')" ' +
    'draggable="true" ondragstart="onItemDragStart(event, \'' + f.id + '\', false)" ondragend="onItemDragEnd(event)">' +
    '<span class="hcheck file-card-check' + (sel ? ' on' : '') + '" onclick="fileCheck(\'' + f.id + '\', event)">' + (sel ? '✓' : '') + '</span>' +
    '<button class="file-kebab" onclick="fileContextMenu(event, \'' + f.id + '\'); event.stopPropagation();" title="More">⋯</button>' +
    '<div class="file-thumb">' + thumbHtml + '</div>' +
    '<div class="file-card-name" title="' + esc(f.filename || "Unnamed") + '">' + esc(f.filename || "Unnamed") + star + '</div>' +
    '<div class="file-meta">' + fmtSize(f.size) + '</div>' +
    '</div>';
}

function renderContent() {
  var box = document.getElementById("filesContent");
  if (!box) return;
  if (filesView === "storage") {
    // Live-sync guard: don't wipe the limits inputs while the user types.
    var ae = document.activeElement;
    if (ae && (ae.id === "storageQuotaInput" || ae.id === "trashRetentionInput")) return;
    box.innerHTML = storageViewHtml();
    return;
  }
  if (filesView === "trash") { box.innerHTML = trashViewHtml(); return; }

  var listing = getListing();
  lastListing = listing.files.map(function(f) { return f.id; });
  var html = "";

  if (listing.folders.length) {
    html += '<div class="files-section-label">Folders</div><div class="folders-grid">';
    listing.folders.forEach(function(f) { html += folderCardHtml(f); });
    html += '</div>';
  }

  if (listing.files.length) {
    var allSel = listing.files.every(function(f) { return selectedFiles.indexOf(f.id) !== -1; });
    html += '<div class="files-section-head"><div class="files-section-label">Files</div>' +
      '<span class="files-select-all" onclick="toggleSelectAllFiles()">' +
      '<span class="hcheck' + (allSel ? ' on' : '') + '">' + (allSel ? '✓' : '') + '</span> Select all (' + listing.files.length + ')</span></div>';
    if (viewMode === "grid") {
      html += '<div class="files-grid">';
      listing.files.forEach(function(f) { html += fileCardHtml(f, listing.showPath); });
      html += '</div>';
    } else {
      listing.files.forEach(function(f) { html += fileRowHtml(f, listing.showPath); });
    }
  }

  if (!listing.folders.length && !listing.files.length) {
    if (currentQuery()) {
      html = '<div class="files-empty"><div class="files-empty-ic">🔍</div>No matches.</div>';
    } else if (filesView === "starred") {
      html = '<div class="files-empty"><div class="files-empty-ic">★</div>No starred files yet.<br><span class="muted">Right-click a file → Star to keep it handy.</span></div>';
    } else if (filesView === "recent") {
      html = '<div class="files-empty"><div class="files-empty-ic">🕒</div>No files yet.</div>';
    } else {
      html = '<div class="files-empty" oncontextmenu="filesContentMenu(event)"><div class="files-empty-ic">📂</div>This folder is empty.<br>' +
        '<span class="muted">Drop files here or </span><a class="file-link" onclick="document.getElementById(\'fileInput\').click()">upload</a></div>';
    }
  }
  box.innerHTML = html;
}

// ---------- trash view ----------

function trashViewHtml() {
  // Top-level trash entries: trashed folders whose parent isn't trashed,
  // and trashed files whose folder isn't trashed.
  var folders = trashedFolders().filter(function(f) {
    var p = f.parent_id ? folderById(f.parent_id) : null;
    return !p || !p.deleted;
  });
  var files = trashedFiles().filter(function(f) {
    var p = f.folder_id ? folderById(f.folder_id) : null;
    return !p || !p.deleted;
  });
  files.sort(function(a, b) { return (b.deleted || 0) - (a.deleted || 0); });

  var days = storageStats ? parseFloat(storageStats.trash_retention_days || 0) : 30;
  var note = days > 0 ? 'Items in the trash are deleted forever after ' + days + ' days.' :
    'Items stay in the trash until you empty it.';
  var html = '<div class="trash-banner"><span>' + note + '</span>' +
    (folders.length || files.length ? '<button class="btn danger small" onclick="emptyTrashConfirm()">Empty trash</button>' : '') +
    '</div>';

  if (!folders.length && !files.length) {
    return html + '<div class="files-empty"><div class="files-empty-ic">🗑️</div>Trash is empty.</div>';
  }
  folders.forEach(function(f) {
    var sel = selectedFolders.indexOf(f.id) !== -1;
    html += '<div class="list-item file-item' + (sel ? ' selected' : '') + '" onclick="trashItemMenu(event, \'' + f.id + '\', true)" oncontextmenu="trashItemMenu(event, \'' + f.id + '\', true)">' +
      '<span class="hcheck' + (sel ? ' on' : '') + '" onclick="folderCheck(\'' + f.id + '\', event)">' + (sel ? '✓' : '') + '</span>' +
      '<span class="file-row-ic">' + esc(f.icon || '📁') + '</span>' +
      '<div class="grow file-row-main"><div class="file-name">' + esc(f.name || 'Folder') + '</div>' +
      '<div class="file-meta">Folder · ' + fmtSize(folderSizeTrashed(f.id)) + ' · trashed ' + new Date(f.deleted || 0).toLocaleDateString() + '</div></div>' +
      '<button class="file-kebab" onclick="trashItemMenu(event, \'' + f.id + '\', true); event.stopPropagation();" title="More">⋯</button></div>';
  });
  files.forEach(function(f) {
    var sel = selectedFiles.indexOf(f.id) !== -1;
    html += '<div class="list-item file-item' + (sel ? ' selected' : '') + '" onclick="trashItemMenu(event, \'' + f.id + '\', false)" oncontextmenu="trashItemMenu(event, \'' + f.id + '\', false)">' +
      '<span class="hcheck' + (sel ? ' on' : '') + '" onclick="fileCheck(\'' + f.id + '\', event)">' + (sel ? '✓' : '') + '</span>' +
      '<span class="file-row-ic">' + getFileIcon(f) + '</span>' +
      '<div class="grow file-row-main"><div class="file-name">' + esc(f.filename || 'Unnamed') + '</div>' +
      '<div class="file-meta">' + fmtSize(f.size) + ' · trashed ' + new Date(f.deleted || 0).toLocaleDateString() + '</div></div>' +
      '<button class="file-kebab" onclick="trashItemMenu(event, \'' + f.id + '\', false); event.stopPropagation();" title="More">⋯</button></div>';
  });
  return html;
}

function folderSizeTrashed(folderId) {
  var total = 0;
  (S.files || []).forEach(function(f) {
    if (f.folder_id && isDescendantOf(f.folder_id, folderId)) total += f.size || 0;
  });
  return total;
}

export function trashItemMenu(ev, id, isFolder) {
  ev.preventDefault();
  showContextMenu(ev, [
    { label: "Restore", icon: "♻️", onClick: function() { restoreItems(isFolder ? [] : [id], isFolder ? [id] : []); } },
    { sep: true },
    { label: "Delete forever", icon: "✕", danger: true, onClick: async function() {
      if (!await askConfirm("Permanently delete this item? This cannot be undone.", { title: "Delete forever", okText: "Delete", danger: true })) return;
      if (isFolder) await api("DELETE", "/api/folders/" + id);
      else await api("DELETE", "/api/files/" + id);
      storageStatsTs = 0;
      await refresh();
    } }
  ]);
}

async function restoreItems(fileIds, folderIds) {
  await api("POST", "/api/files/restore", { file_ids: fileIds, folder_ids: folderIds });
  toast("Restored");
  await refresh();
}

export async function emptyTrashConfirm() {
  if (!await askConfirm("Permanently delete everything in the trash? This cannot be undone.",
      { title: "Empty trash", okText: "Empty trash", danger: true })) return;
  await api("POST", "/api/files/trash/empty");
  storageStatsTs = 0;
  toast("Trash emptied");
  await refresh();
}

// ---------- storage manager view ----------

var STORAGE_CATS = [
  ["images", "Images", "#4f8ef7"],
  ["video", "Video", "#9b6ef7"],
  ["audio", "Audio", "#3dbf7a"],
  ["docs", "Documents", "#f2a93b"],
  ["archives", "Archives", "#e06c9f"],
  ["other", "Other", "#8a94a6"]
];

function storageViewHtml() {
  fetchStorageStats(false);
  var st = storageStats;
  var live = liveFiles();
  var catBytes = {};
  live.forEach(function(f) {
    var c = storageCategory(f);
    catBytes[c] = (catBytes[c] || 0) + (f.size || 0);
  });
  var filesBytes = live.reduce(function(a, f) { return a + (f.size || 0); }, 0);
  var trashBytes = trashedFiles().reduce(function(a, f) { return a + (f.size || 0); }, 0);
  var quota = st ? st.quota_bytes : 0;
  var used = filesBytes + trashBytes;
  var denom = quota || used || 1;

  // Segmented usage bar
  var segs = "", legend = "";
  STORAGE_CATS.forEach(function(c) {
    var b = catBytes[c[0]] || 0;
    if (!b) return;
    segs += '<span style="width:' + Math.max(0.6, b / denom * 100) + '%;background:' + c[2] + '" title="' + c[1] + ': ' + fmtSize(b) + '"></span>';
    legend += '<span class="storage-legend-item"><span class="dot" style="background:' + c[2] + '"></span>' + c[1] + ' · ' + fmtSize(b) + '</span>';
  });
  if (trashBytes) {
    segs += '<span style="width:' + Math.max(0.6, trashBytes / denom * 100) + '%;background:#666" title="Trash: ' + fmtSize(trashBytes) + '"></span>';
    legend += '<span class="storage-legend-item"><span class="dot" style="background:#666"></span>Trash · ' + fmtSize(trashBytes) + '</span>';
  }

  var html = '<div class="storage-section">' +
    '<div class="storage-usage-line"><b>' + fmtSize(used) + '</b>' +
    (quota ? ' of ' + fmtSize(quota) + ' used' + (used > quota * 0.95 ? ' <span class="storage-alert">— almost full</span>' : '') : ' used · no limit set') +
    '</div>' +
    '<div class="storage-bar">' + segs + '</div>' +
    '<div class="storage-legend">' + legend + '</div></div>';

  // Limits
  var quotaVal = st ? (st.quota_gb_setting || "") : "";
  var retVal = st ? (st.trash_retention_days || "") : "";
  html += '<div class="storage-section"><div class="files-section-label">Limits</div>' +
    '<div class="storage-limits">' +
    '<span class="storage-limit-group"><label class="muted">Max file storage</label>' +
    '<input id="storageQuotaInput" type="number" min="0" step="0.5" placeholder="No limit" value="' + esc(quotaVal) + '"> <span class="muted">GB</span></span>' +
    '<span class="storage-limit-group"><label class="muted">Auto-empty trash after</label>' +
    '<input id="trashRetentionInput" type="number" min="0" step="1" placeholder="Never" value="' + esc(retVal) + '"> <span class="muted">days</span></span>' +
    '<button class="btn small" onclick="saveStorageLimits()">Save</button>' +
    '</div><p class="muted" style="font-size:12px;margin:6px 0 0">Uploads are rejected once the limit is reached. Leave empty for no limit.</p></div>';

  // What uses your storage
  if (st) {
    var rows = [
      ["📁 Files", filesBytes],
      ["🗑️ Trash", trashBytes],
      ["📝 Notes text", st.notes_bytes],
      ["⚙️ App data (database)", st.db_bytes],
      ["💾 Backups", st.backups_bytes]
    ];
    var total = filesBytes + trashBytes + st.notes_bytes + st.db_bytes + st.backups_bytes;
    html += '<div class="storage-section"><div class="files-section-label">What uses your storage</div>';
    rows.forEach(function(r) {
      html += '<div class="storage-row"><span>' + r[0] + '</span><b>' + fmtSize(r[1]) + '</b></div>';
    });
    html += '<div class="storage-row total"><span>Total app storage</span><b>' + fmtSize(total) + '</b></div></div>';
  }

  // Biggest files
  var biggest = live.slice().sort(function(a, b) { return (b.size || 0) - (a.size || 0); }).slice(0, 10);
  if (biggest.length) {
    html += '<div class="storage-section"><div class="files-section-label">Biggest files</div>';
    biggest.forEach(function(f) {
      html += '<div class="list-item file-item" onclick="previewFile(\'' + f.id + '\')" oncontextmenu="fileContextMenu(event, \'' + f.id + '\')">' +
        '<span class="file-row-ic">' + getFileIcon(f) + '</span>' +
        '<div class="grow file-row-main"><div class="file-name">' + esc(f.filename || 'Unnamed') + '</div>' +
        '<div class="file-meta">' + esc(pathLabel(f)) + '</div></div>' +
        '<b class="storage-size">' + fmtSize(f.size) + '</b>' +
        '<button class="file-kebab" onclick="fileContextMenu(event, \'' + f.id + '\'); event.stopPropagation();" title="More">⋯</button></div>';
    });
    html += '</div>';
  }

  // Folder sizes (top level)
  var tops = folderChildren(null).map(function(f) { return { f: f, size: folderSize(f.id) }; })
    .sort(function(a, b) { return b.size - a.size; }).filter(function(x) { return x.size > 0; }).slice(0, 10);
  if (tops.length) {
    html += '<div class="storage-section"><div class="files-section-label">Folders by size</div>';
    tops.forEach(function(x) {
      html += '<div class="storage-row link" onclick="navigateToFolder(\'' + x.f.id + '\')">' +
        '<span>' + esc(x.f.icon || '📁') + ' ' + esc(x.f.name) + '</span><b>' + fmtSize(x.size) + '</b></div>';
    });
    html += '</div>';
  }

  // Maintenance
  html += '<div class="storage-section"><div class="files-section-label">Maintenance</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn small" onclick="emptyTrashConfirm()">🗑️ Empty trash' + (trashBytes ? ' (' + fmtSize(trashBytes) + ')' : '') + '</button>' +
    '<button class="btn ghost small" onclick="runStorageCleanup()">🧹 Clean up orphaned files</button>' +
    '</div></div>';

  return html;
}

export async function saveStorageLimits() {
  var quota = (document.getElementById("storageQuotaInput") || {}).value || "";
  var ret = (document.getElementById("trashRetentionInput") || {}).value || "";
  await api("POST", "/api/settings", { storage_quota_gb: quota, trash_retention_days: ret });
  storageStatsTs = 0;
  fetchStorageStats(true);
  toast("Storage settings saved");
}

export async function runStorageCleanup() {
  var res = await api("POST", "/api/files/cleanup");
  toast("Cleanup done: removed " + res.deleted_count + " orphaned file" + (res.deleted_count === 1 ? "" : "s") +
    (res.missing_count ? ", " + res.missing_count + " missing on disk" : ""));
  storageStatsTs = 0;
  await refresh();
}

// ---------- navigation & view switching ----------

export function setFilesView(v) {
  filesView = v;
  activeFolderId = null;
  selectedFiles = [];
  selectedFolders = [];
  if (v === "storage") fetchStorageStats(true);
  renderFiles();
}

export function navigateToFolder(id) {
  filesView = "files";
  activeFolderId = id;
  selectedFiles = [];
  selectedFolders = [];
  var search = document.getElementById("fileSearch");
  if (search && search.value) { search.value = ""; lastFileSearchQuery = ""; fileSearchResults = null; }
  if (id) {
    // auto-expand the tree down to this folder
    folderPath(id).forEach(function(f) { expandedFolders.add(f.id); });
    persistTree();
  }
  renderFiles();
}

function persistTree() {
  localStorage.setItem("files_tree_open", JSON.stringify(Array.from(expandedFolders)));
}

export function toggleFolderExpand(id, ev) {
  if (ev) ev.stopPropagation();
  if (expandedFolders.has(id)) expandedFolders.delete(id);
  else expandedFolders.add(id);
  persistTree();
  renderFiles();
}

export function setFileSort(key) {
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = key === "name" || key === "type" ? "asc" : "desc";
  }
  localStorage.setItem("file_sort", sortKey);
  localStorage.setItem("file_sort_dir", sortDir);
  renderFiles();
}

export function setFileView(v) {
  viewMode = v;
  localStorage.setItem("file_view", v);
  renderFiles();
}

// ---------- the New menu ----------

export function filesNewMenu(ev) {
  showContextMenu(ev, [
    { label: "New folder", icon: "📁", onClick: function() { createFolderPrompt(); } },
    { label: "Upload files", icon: "📤", onClick: function() { document.getElementById("fileInput").click(); } },
    { label: "Upload folder", icon: "🗂️", onClick: function() { document.getElementById("folderInput").click(); } },
    { label: "Camera", icon: "📸", onClick: function() { document.getElementById("cameraInput").click(); } }
  ]);
}

export function filesContentMenu(ev) {
  ev.preventDefault();
  filesNewMenu(ev);
}

export async function createFolderPrompt() {
  var name = await askPrompt("New folder", "", { okText: "Create", placeholder: "Folder name" });
  if (name === null) return;
  name = name.trim();
  if (!name) { toast("Folder name cannot be empty."); return; }
  if (filesView !== "files") { filesView = "files"; activeFolderId = null; }
  await api("POST", "/api/folders", { name: name, parent_id: activeFolderId });
  await refresh();
}

// ---------- selection ----------

function openFileOrSelect(ev, id, isFolder) {
  var arr = isFolder ? selectedFolders : selectedFiles;
  if (ev.metaKey || ev.ctrlKey) {
    var i = arr.indexOf(id);
    if (i === -1) arr.push(id); else arr.splice(i, 1);
    if (!isFolder) lastClickedFileId = id;
    renderFiles();
    return true;
  }
  if (ev.shiftKey && !isFolder && lastClickedFileId) {
    var a = lastListing.indexOf(lastClickedFileId);
    var b = lastListing.indexOf(id);
    if (a !== -1 && b !== -1) {
      var lo = Math.min(a, b), hi = Math.max(a, b);
      for (var j = lo; j <= hi; j++) {
        if (selectedFiles.indexOf(lastListing[j]) === -1) selectedFiles.push(lastListing[j]);
      }
      renderFiles();
      return true;
    }
  }
  return false;
}

export function fileClick(ev, id) {
  if (openFileOrSelect(ev, id, false)) return;
  previewFile(id);
}

export function folderClick(ev, id) {
  if (openFileOrSelect(ev, id, true)) return;
  navigateToFolder(id);
}

export function fileCheck(id, ev) {
  if (ev) ev.stopPropagation();
  var i = selectedFiles.indexOf(id);
  if (i === -1) { selectedFiles.push(id); lastClickedFileId = id; }
  else selectedFiles.splice(i, 1);
  renderFiles();
}

export function folderCheck(id, ev) {
  if (ev) ev.stopPropagation();
  var i = selectedFolders.indexOf(id);
  if (i === -1) selectedFolders.push(id); else selectedFolders.splice(i, 1);
  renderFiles();
}

export function toggleSelectAllFiles() {
  var listing = getListing();
  var all = listing.files.every(function(f) { return selectedFiles.indexOf(f.id) !== -1; });
  if (all) {
    listing.files.forEach(function(f) {
      var i = selectedFiles.indexOf(f.id);
      if (i !== -1) selectedFiles.splice(i, 1);
    });
  } else {
    listing.files.forEach(function(f) {
      if (selectedFiles.indexOf(f.id) === -1) selectedFiles.push(f.id);
    });
  }
  renderFiles();
}

export function clearFileSelection() {
  selectedFiles = [];
  selectedFolders = [];
  renderFiles();
}

// ---------- context menus ----------

export function fileContextMenu(ev, id) {
  ev.preventDefault();
  // Right-clicking one of several selected items acts on the whole selection.
  var n = selectedFiles.length + selectedFolders.length;
  if (n > 1 && selectedFiles.indexOf(id) !== -1) { selectionContextMenu(ev); return; }
  var f = fileById(id);
  if (!f) return;
  showContextMenu(ev, [
    { label: "Preview", icon: "👁️", onClick: function() { previewFile(id); } },
    { label: "Download", icon: "⬇️", onClick: function() { window.location.href = "/api/files/" + id + "/download"; } },
    { label: "Rename", icon: "✏️", onClick: function() { renameFilePrompt(id, f.filename || ""); } },
    { label: f.is_pinned ? "Unstar" : "Star", icon: "★", onClick: function() { toggleFilePin(id); } },
    { label: "Move to…", icon: "📁", onClick: function() { openMoveDialogFor([id], []); } },
    { sep: true },
    { label: "Move to trash", icon: "🗑️", danger: true, onClick: function() { trashItems([id], []); } }
  ]);
}

export function folderContextMenu(ev, id) {
  ev.preventDefault();
  var n = selectedFiles.length + selectedFolders.length;
  if (n > 1 && selectedFolders.indexOf(id) !== -1) { selectionContextMenu(ev); return; }
  var f = folderById(id);
  if (!f) return;
  showContextMenu(ev, [
    { label: "Open", icon: "📂", onClick: function() { navigateToFolder(id); } },
    { label: "Download as zip", icon: "⬇️", onClick: function() { postZip([], [id]); } },
    { label: "Rename", icon: "✏️", onClick: function() { renameFolderPrompt(id, f.name || ""); } },
    { label: "Change icon", icon: "🏷️", onClick: function() { changeFolderIconPrompt(id, f.icon || "📁"); } },
    { label: "Move to…", icon: "📁", onClick: function() { openMoveDialogFor([], [id]); } },
    { sep: true },
    { label: "Move to trash", icon: "🗑️", danger: true, onClick: function() { trashItems([], [id]); } }
  ]);
}

function selectionContextMenu(ev) {
  var n = selectedFiles.length + selectedFolders.length;
  showContextMenu(ev, [
    { label: "Download " + n + " items", icon: "⬇️", onClick: downloadSelected },
    { label: "Move " + n + " items to…", icon: "📁", onClick: openMoveDialog },
    { label: "Clear selection", icon: "◻️", onClick: clearFileSelection },
    { sep: true },
    { label: "Trash " + n + " items", icon: "🗑️", danger: true, onClick: trashSelected }
  ]);
}

export async function renameFilePrompt(id, oldName) {
  var name = await askPrompt("Rename file", oldName, { okText: "Rename" });
  if (name === null) return;
  name = name.trim();
  if (!name) { toast("Filename cannot be empty."); return; }
  await api("PUT", "/api/files/" + id, { filename: name });
  await refresh();
}

export async function renameFolderPrompt(id, oldName) {
  var name = await askPrompt("Rename folder", oldName, { okText: "Rename" });
  if (name === null) return;
  name = name.trim();
  if (!name) { toast("Folder name cannot be empty."); return; }
  await api("PUT", "/api/folders/" + id, { name: name });
  await refresh();
}

export async function changeFolderIconPrompt(id, oldIcon) {
  var icon = await askPrompt("Folder icon (emoji or character)", oldIcon || "📁", { okText: "Save" });
  if (icon === null) return;
  icon = icon.trim() || "📁";
  await api("PUT", "/api/folders/" + id, { icon: icon });
  await refresh();
}

export async function toggleFilePin(id, ev) {
  if (ev) ev.stopPropagation();
  var f = fileById(id);
  if (!f) return;
  var newPinned = f.is_pinned ? 0 : 1;
  await api("PUT", "/api/files/" + id, { is_pinned: newPinned });
  f.is_pinned = newPinned;
  renderFiles();
}

export async function starSelected() {
  for (var i = 0; i < selectedFiles.length; i++) {
    await api("PUT", "/api/files/" + selectedFiles[i], { is_pinned: 1 });
    var f = fileById(selectedFiles[i]);
    if (f) f.is_pinned = 1;
  }
  clearFileSelection();
}

// ---------- trash / restore / download actions ----------

async function trashItems(fileIds, folderIds) {
  await api("POST", "/api/files/trash", { file_ids: fileIds, folder_ids: folderIds });
  selectedFiles = [];
  selectedFolders = [];
  toast("Moved to trash");
  await refresh();
}

export function trashSelected() {
  trashItems(selectedFiles.slice(), selectedFolders.slice());
}

export function restoreSelected() {
  var f = selectedFiles.slice(), d = selectedFolders.slice();
  selectedFiles = [];
  selectedFolders = [];
  restoreItems(f, d);
}

export async function deleteForeverSelected() {
  var n = selectedFiles.length + selectedFolders.length;
  if (!await askConfirm("Permanently delete the " + n + " selected item" + (n > 1 ? "s" : "") + "? This cannot be undone.",
      { title: "Delete forever", okText: "Delete", danger: true })) return;
  for (var i = 0; i < selectedFiles.length; i++) await api("DELETE", "/api/files/" + selectedFiles[i]);
  for (var j = 0; j < selectedFolders.length; j++) await api("DELETE", "/api/folders/" + selectedFolders[j]);
  selectedFiles = [];
  selectedFolders = [];
  storageStatsTs = 0;
  await refresh();
}

// Native browser download via a form POST (the endpoint is CSRF-exempt).
function postZip(fileIds, folderIds) {
  var form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/files/zip";
  form.style.display = "none";
  var inp = document.createElement("input");
  inp.type = "hidden";
  inp.name = "payload";
  inp.value = JSON.stringify({ file_ids: fileIds, folder_ids: folderIds });
  form.appendChild(inp);
  document.body.appendChild(form);
  form.submit();
  form.remove();
  toast("Preparing download…");
}

export function downloadSelected() {
  if (selectedFiles.length === 1 && !selectedFolders.length) {
    window.location.href = "/api/files/" + selectedFiles[0] + "/download";
    return;
  }
  postZip(selectedFiles.slice(), selectedFolders.slice());
}

// ---------- move dialog ----------

var movePayload = { files: [], folders: [] };
var moveTargetId = null;
var moveExpanded = new Set();

export function openMoveDialog() {
  openMoveDialogFor(selectedFiles.slice(), selectedFolders.slice());
}

function openMoveDialogFor(fileIds, folderIds) {
  if (!fileIds.length && !folderIds.length) return;
  movePayload = { files: fileIds, folders: folderIds };
  moveTargetId = null;
  moveExpanded = new Set(expandedFolders);
  var title = document.getElementById("fileMoveTitle");
  if (title) {
    var n = fileIds.length + folderIds.length;
    var label = n + " items";
    if (n === 1) {
      var it = fileIds.length ? fileById(fileIds[0]) : folderById(folderIds[0]);
      label = "“" + ((it && (it.filename || it.name)) || "item") + "”";
    }
    title.textContent = "Move " + label + " to…";
  }
  renderMoveTree();
  window.dispatchEvent(new CustomEvent("open-file-move-modal"));
}

function moveTargetInvalid(folderId) {
  // Can't move a folder into itself or its own subtree.
  return movePayload.folders.some(function(fid) {
    return folderId === fid || isDescendantOf(folderId, fid);
  });
}

function renderMoveTree() {
  var box = document.getElementById("fileMoveTree");
  if (!box) return;
  var html = '<div class="fnav-row' + (moveTargetId === null ? ' active' : '') + '" onclick="moveDialogPick(null)">' +
    '<span class="fnav-ic">🏠</span><span class="fnav-name">My Files</span></div>';
  function walk(parentId, depth) {
    folderChildren(parentId).forEach(function(f) {
      var kids = folderChildren(f.id).length > 0;
      var open = moveExpanded.has(f.id);
      var invalid = moveTargetInvalid(f.id);
      html += '<div class="fnav-row' + (moveTargetId === f.id ? ' active' : '') + (invalid ? ' disabled' : '') + '" ' +
        'style="padding-left:' + (10 + depth * 16) + 'px" ' +
        (invalid ? '' : 'onclick="moveDialogPick(\'' + f.id + '\')" ') + '>' +
        '<span class="fnav-caret' + (kids ? '' : ' none') + (open ? ' open' : '') + '" onclick="moveDialogToggle(\'' + f.id + '\', event)">' + (kids ? '▸' : '') + '</span>' +
        '<span class="fnav-ic">' + esc(f.icon || '📁') + '</span>' +
        '<span class="fnav-name">' + esc(f.name || 'Folder') + '</span></div>';
      if (kids && open) walk(f.id, depth + 1);
    });
  }
  walk(null, 1);
  box.innerHTML = html;
}

export function moveDialogPick(id) {
  moveTargetId = id;
  renderMoveTree();
}

export function moveDialogToggle(id, ev) {
  if (ev) ev.stopPropagation();
  if (moveExpanded.has(id)) moveExpanded.delete(id); else moveExpanded.add(id);
  renderMoveTree();
}

export async function moveDialogNewFolder() {
  var name = await askPrompt("New folder", "", { okText: "Create", placeholder: "Folder name" });
  if (name === null) return;
  name = name.trim();
  if (!name) return;
  var res = await api("POST", "/api/folders", { name: name, parent_id: moveTargetId });
  await refresh();
  if (moveTargetId) moveExpanded.add(moveTargetId);
  moveTargetId = res.id;
  renderMoveTree();
}

export async function confirmMoveDialog() {
  await api("POST", "/api/files/move", {
    file_ids: movePayload.files,
    folder_ids: movePayload.folders,
    folder_id: moveTargetId
  });
  window.dispatchEvent(new CustomEvent("close-file-move-modal"));
  selectedFiles = [];
  selectedFolders = [];
  toast("Moved");
  await refresh();
}

// ---------- drag & drop (internal moves) ----------

export function onItemDragStart(ev, id, isFolder) {
  if (isFolder) {
    if (selectedFolders.indexOf(id) === -1) { selectedFolders = [id]; selectedFiles = []; }
  } else {
    if (selectedFiles.indexOf(id) === -1) { selectedFiles = [id]; selectedFolders = []; }
  }
  dragPayload = { files: selectedFiles.slice(), folders: selectedFolders.slice() };
  ev.dataTransfer.setData("text/plain", id);
  ev.dataTransfer.effectAllowed = "move";
}

export function onItemDragEnd() {
  dragPayload = null;
  document.querySelectorAll(".drag-over").forEach(function(el) { el.classList.remove("drag-over"); });
  renderFiles();
}

export function onFolderDragOver(e) {
  if (!dragPayload) return;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = "move";
  var el = e.currentTarget;
  if (el && !el.classList.contains("drag-over")) el.classList.add("drag-over");
}

export function onFolderDragLeave(e) {
  var el = e.currentTarget;
  if (el) el.classList.remove("drag-over");
}

export async function onFolderDrop(e, targetFolderId) {
  e.preventDefault();
  e.stopPropagation();
  var el = e.currentTarget;
  if (el) el.classList.remove("drag-over");
  if (!dragPayload) return;
  var payload = dragPayload;
  dragPayload = null;
  // Filter no-op and invalid moves client-side; the server double-checks.
  payload.folders = payload.folders.filter(function(fid) {
    return fid !== targetFolderId && !(targetFolderId && isDescendantOf(targetFolderId, fid));
  });
  if (!payload.files.length && !payload.folders.length) return;
  await api("POST", "/api/files/move", {
    file_ids: payload.files, folder_ids: payload.folders, folder_id: targetFolderId
  });
  selectedFiles = [];
  selectedFolders = [];
  await refresh();
}

export async function onTrashDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  var el = e.currentTarget;
  if (el) el.classList.remove("drag-over");
  if (!dragPayload) return;
  var payload = dragPayload;
  dragPayload = null;
  await trashItems(payload.files, payload.folders);
}

// ---------- search ----------

export function fileSearchInput() {
  var searchEl = document.getElementById("fileSearch");
  var q = (searchEl ? searchEl.value : "").trim().toLowerCase();
  if (q === lastFileSearchQuery) return;
  lastFileSearchQuery = q;
  if (fileSearchTimeout) clearTimeout(fileSearchTimeout);
  if (!q) {
    fileSearchResults = null;
    renderFiles();
    return;
  }
  if (filesView === "storage" || filesView === "trash") { filesView = "files"; activeFolderId = null; }
  // Render local results immediately, then update once FTS5 finishes
  fileSearchResults = null;
  renderFiles();
  fileSearchTimeout = setTimeout(function() {
    fetch("/api/files/search?q=" + encodeURIComponent(q))
      .then(function(res) { return res.json(); })
      .then(function(ids) {
        if (lastFileSearchQuery === q) {
          fileSearchResults = ids;
          renderFiles();
        }
      })
      .catch(function() {
        if (lastFileSearchQuery === q) {
          fileSearchResults = null;
          renderFiles();
        }
      });
  }, 150);
}

export function handleFileSearchKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    var content = document.getElementById("filesContent");
    if (!content) return;
    var first = content.querySelector(".folder-card, .file-item, .file-card");
    if (first) first.click();
  }
}

// ---------- preview modal ----------

var previewId = null;

export function previewFile(id) {
  var f = fileById(id);
  if (!f) return;
  previewId = id;

  var title = document.getElementById("mediaPreviewTitle");
  var meta = document.getElementById("mediaPreviewMeta");
  var container = document.getElementById("mediaPreviewContainer");
  var modal = document.getElementById("mediaPreviewModal");
  if (!title || !container || !modal) return;

  title.textContent = f.filename || "File Preview";
  if (meta) meta.textContent = fmtSize(f.size) + " · " + new Date(f.uploaded || 0).toLocaleDateString();
  container.innerHTML = "";

  var url = "/api/files/" + f.id + "/view";
  var kind = previewKind(f);
  var content = document.getElementById("mediaPreviewModalContent");
  var wide = "display:flex; flex-direction:column; box-sizing:border-box; max-width:95vw; width:95vw; height:95vh;";
  var fit = "display:flex; flex-direction:column; box-sizing:border-box; max-width:90vw; width:max-content; min-width:min(560px, 90vw); height:auto; max-height:92vh;";
  var narrow = "display:flex; flex-direction:column; box-sizing:border-box; max-width:440px; width:92%; height:auto;";

  if (kind === "image") {
    if (content) content.style.cssText = fit;
    container.innerHTML = '<img src="' + url + '" style="max-width:100%; max-height:78vh; object-fit:contain;" ' +
      'onerror="this.outerHTML=\'<div class=muted>Could not display this image. Try downloading it.</div>\'">';
  } else if (kind === "pdf") {
    if (content) content.style.cssText = wide;
    container.innerHTML = '<iframe src="' + url + '" style="width:100%; height:100%; border:none; background:white; border-radius:4px;"></iframe>';
  } else if (kind === "audio") {
    if (content) content.style.cssText = narrow;
    container.innerHTML = '<audio controls autoplay src="' + url + '" style="width:100%; outline:none; border-radius:8px; margin-top:10px;"></audio>';
  } else if (kind === "video") {
    if (content) content.style.cssText = fit;
    container.innerHTML = '<video controls autoplay style="max-width:100%; max-height:78vh; outline:none; border-radius:8px;" ' +
      'onerror="this.outerHTML=\'<div class=muted>This video format can&#39;t be played in the browser. Download it instead.</div>\'">' +
      '<source src="' + url + '" type="' + esc(f.mimetype || "") + '"></video>';
  } else if (kind === "server") {
    if (content) content.style.cssText = wide;
    container.innerHTML = '<iframe src="/api/files/' + f.id + '/preview" sandbox="allow-popups" ' +
      'style="width:100%; height:100%; border:none; background:white; border-radius:4px;"></iframe>';
  } else if (kind === "markdown") {
    if (content) content.style.cssText = wide;
    container.innerHTML = '<div class="muted">Loading…</div>';
    fetch(url).then(function(r) { return r.text(); }).then(function(text) {
      if (previewId !== id) return;
      var body = (window.marked ? window.marked.parse(text) : "<pre>" + esc(text) + "</pre>");
      var doc = "<!doctype html><html><head><meta charset='utf-8'><style>" +
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:760px;" +
        "margin:0 auto;padding:28px 20px;line-height:1.6;color:#1a1a1a;background:#fff}" +
        "img{max-width:100%}pre{background:#f4f4f4;padding:10px;border-radius:6px;overflow-x:auto}" +
        "code{background:#f4f4f4;padding:1px 4px;border-radius:4px}table{border-collapse:collapse}" +
        "td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body>" + body + "</body></html>";
      var iframe = document.createElement("iframe");
      iframe.setAttribute("sandbox", "allow-popups");
      iframe.style.cssText = "width:100%; height:100%; border:none; background:white; border-radius:4px;";
      iframe.srcdoc = doc;
      container.innerHTML = "";
      container.appendChild(iframe);
    }).catch(function() {
      if (previewId === id) container.innerHTML = '<div class="muted">Could not load this file.</div>';
    });
  } else if (kind === "text") {
    if (content) content.style.cssText = wide;
    container.innerHTML = '<div class="muted">Loading…</div>';
    fetch(url).then(function(r) { return r.text(); }).then(function(text) {
      if (previewId !== id) return;
      container.innerHTML = '<pre class="preview-text">' + esc(text) + '</pre>';
    }).catch(function() {
      if (previewId === id) container.innerHTML = '<div class="muted">Could not load this file.</div>';
    });
  } else {
    if (content) content.style.cssText = narrow;
    container.innerHTML = '<div class="preview-fallback"><div style="font-size:44px">' + getFileIcon(f) + '</div>' +
      '<div class="muted" style="margin:8px 0 14px">No preview available for this file type.</div>' +
      '<button class="btn" onclick="previewDownload()">⬇️ Download</button></div>';
  }

  updatePreviewArrows();
  window.dispatchEvent(new CustomEvent('open-media-preview-modal'));
}

function updatePreviewArrows() {
  var idx = lastListing.indexOf(previewId);
  var prev = document.getElementById("previewPrevBtn");
  var next = document.getElementById("previewNextBtn");
  var multi = lastListing.length > 1 && idx !== -1;
  if (prev) prev.style.display = multi ? "" : "none";
  if (next) next.style.display = multi ? "" : "none";
}

export function previewStep(dir) {
  var idx = lastListing.indexOf(previewId);
  if (idx === -1 || lastListing.length < 2) return;
  var nextIdx = (idx + dir + lastListing.length) % lastListing.length;
  previewFile(lastListing[nextIdx]);
}

export function previewDownload() {
  if (previewId) window.location.href = "/api/files/" + previewId + "/download";
}

export function previewOpenTab() {
  if (previewId) window.open("/api/files/" + previewId + "/view", "_blank");
}
