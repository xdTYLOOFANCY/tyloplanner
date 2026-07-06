// TyloPlanner — file storage module.

import { S, safeRender } from './state.js';
import { esc, api, toast, askConfirm, askPrompt, showContextMenu } from './utils.js';

var fileSort = "date";
var fileView = localStorage.getItem("file_view") || "list";
var activeFolderId = null;
var selectedFileIds = [];
var draggedFileIds = [];
var lastFileSearchQuery = "";
var fileSearchResults = null;
var fileSearchTimeout = null;

// UPLOAD PROGRESS PANEL
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
        resolve(true);
      } else {
        var msg = "failed";
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) {}
        row.classList.add("failed");
        pct.textContent = "✕";
        row.title = msg;
        resolve(false);
      }
    };
    xhr.onerror = function() {
      row.classList.add("failed");
      pct.textContent = "✕";
      row.title = "network error";
      resolve(false);
    };
    xhr.send(fd);
  });
}

async function uploadFilesWithProgress(files) {
  var panel = getUploadPanel();
  var rows = document.getElementById("uploadPanelRows");
  var title = document.getElementById("uploadPanelTitle");
  rows.innerHTML = "";
  title.textContent = "Uploading " + files.length + " file" + (files.length > 1 ? "s" : "") + "…";

  var folderId = activeFolderId;
  var queue = [];
  for (var i = 0; i < files.length; i++) {
    var row = document.createElement("div");
    row.className = "upload-row";
    row.innerHTML = '<div class="upload-row-name">' + esc(files[i].name) + '</div>' +
      '<div class="upload-row-bar"><span></span></div>' +
      '<div class="upload-row-pct">queued</div>';
    rows.appendChild(row);
    queue.push({ file: files[i], row: row });
  }

  // Max 5 concurrent uploads; the rest wait in the queue.
  var results = [];
  async function worker() {
    while (queue.length) {
      var job = queue.shift();
      job.row.querySelector(".upload-row-pct").textContent = "0%";
      results.push(await uploadOneFile(job.file, folderId, job.row));
    }
  }
  var workers = [];
  for (var w = 0; w < Math.min(5, files.length); w++) workers.push(worker());
  await Promise.all(workers);
  var ok = results.filter(Boolean).length;
  var failed = results.length - ok;
  title.textContent = failed ? (ok + " uploaded, " + failed + " failed") : ("Uploaded " + ok + " file" + (ok > 1 ? "s" : ""));
  if (!failed) {
    setTimeout(function() { panel.style.display = "none"; }, 2500);
    toast("Uploaded " + ok + " file" + (ok > 1 ? "s" : ""));
  }
  if (window.refreshApp) await window.refreshApp();
}

function fmtSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (Math.round(bytes / 102.4) / 10) + " KB";
  return (Math.round(bytes / 104857.6) / 10) + " MB";
}

function getFileIcon(mimetype) {
  var mt = mimetype || "";
  if (mt.startsWith("image/")) return "🖼️";
  if (mt === "application/pdf") return "📄";
  if (mt.startsWith("audio/")) return "🎵";
  if (mt.startsWith("video/")) return "🎥";
  if (mt.startsWith("text/")) return "📝";
  if (mt.indexOf("zip") !== -1 || mt.indexOf("tar") !== -1 || mt.indexOf("compressed") !== -1) return "📦";
  return "📎";
}

function getBreadcrumbs(folderId) {
  var path = [];
  var currentId = folderId;
  var limit = 20; // safety limit
  while (currentId && limit > 0) {
    limit--;
    var folder = (S.folders || []).find(function(f) { return f.id === currentId; });
    if (folder) {
      path.unshift(folder);
      currentId = folder.parent_id;
    } else {
      break;
    }
  }
  return path;
}
function isDescendant(folderId, targetId) {
  if (!folderId || !targetId) return false;
  var currentId = folderId;
  var limit = 20; // safety limit
  while (currentId && limit > 0) {
    limit--;
    if (currentId === targetId) return true;
    var folder = (S.folders || []).find(function(f) { return f.id === currentId; });
    currentId = folder ? folder.parent_id : null;
  }
  return false;
}

// The files currently visible in the list, honoring search (local or FTS)
// and folder scoping. Shared by renderFiles and toggleSelectAllFiles so
// "Select All" can never select files that aren't shown.
function getVisibleFiles(q) {
  var list = (S.files || []).slice();
  if (q) {
    if (fileSearchResults !== null) {
      return list.filter(function(f) {
        if (fileSearchResults.indexOf(f.id) === -1) return false;
        if (!activeFolderId) return true;
        return f.folder_id === activeFolderId || isDescendant(f.folder_id, activeFolderId);
      });
    }
    return list.filter(function(f) {
      if ((f.filename || "").toLowerCase().indexOf(q) === -1) return false;
      if (!activeFolderId) return true;
      return f.folder_id === activeFolderId || isDescendant(f.folder_id, activeFolderId);
    });
  }
  return list.filter(function(f) { return f.folder_id === activeFolderId; });
}

export function renderFiles() {
  safeRender("files", () => {
    var q = (document.getElementById("fileSearch") || { value: "" }).value.trim().toLowerCase();
  
  // Make sure active folder is valid
  var folders = S.folders || [];
  if (activeFolderId && !folders.some(function(f) { return f.id === activeFolderId; })) {
    activeFolderId = null;
  }

  // Cleanup selection list of files that no longer exist
  selectedFileIds = selectedFileIds.filter(function(id) {
    return (S.files || []).some(function(f) { return f.id === id; });
  });

  // 1. Render Folder Header (Breadcrumbs + Actions)
  var folderHeader = document.getElementById("folderHeader");
  if (folderHeader) {
    var breadcrumbsHtml = '<div class="breadcrumbs">';
    breadcrumbsHtml += '<span class="breadcrumb-item' + (activeFolderId ? '' : ' active') + '" onclick="navigateToFolder(null)" ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, null)">Root</span>';
    
    var path = getBreadcrumbs(activeFolderId);
    path.forEach(function(f, idx) {
      breadcrumbsHtml += '<span class="breadcrumb-separator">/</span>';
      var isLast = (idx === path.length - 1);
      var folderIcon = f.icon ? f.icon + ' ' : '';
      // Folder breadcrumbs are right-clickable: rename/icon/delete moved there.
      breadcrumbsHtml += '<span class="breadcrumb-item' + (isLast ? ' active' : '') + '" oncontextmenu="folderContextMenu(event, \'' + f.id + '\')" onclick="' + (isLast ? '' : 'navigateToFolder(\'' + f.id + '\')') + '" ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, \'' + f.id + '\')">' + folderIcon + esc(f.name) + '</span>';
    });
    breadcrumbsHtml += '</div>';

    var actionsHtml = '<div class="folder-actions-group">';
    actionsHtml += '<button class="btn small" onclick="createFolderPrompt()">+ Folder</button>';
    actionsHtml += '<button class="btn small" onclick="document.getElementById(\'fileInput\').click()">📤 Upload</button>';
    actionsHtml += '<button class="btn small mobile-only" onclick="document.getElementById(\'cameraInput\').click()">📸 Camera</button>';
    if (activeFolderId) {
      var currentFolder = folders.find(function(f) { return f.id === activeFolderId; });
      var parentId = currentFolder ? currentFolder.parent_id : null;
      actionsHtml += '<button class="btn small ghost" onclick="navigateToFolder(' + (parentId ? '\'' + parentId + '\'' : 'null') + ')" title="Go Back">⬅️ Back</button>';
    }
    actionsHtml += '</div>';
    
    folderHeader.innerHTML = breadcrumbsHtml + actionsHtml;
  }

  // 2. Render Subfolders (Grid View)
  var folderList = document.getElementById("folderList");
  if (folderList) {
    var folderListHtml = "";
    var subfolders = folders.slice();
    if (q) {
      subfolders = subfolders.filter(function(f) {
        var nameMatch = (f.name || "").toLowerCase().indexOf(q) !== -1;
        if (!nameMatch) return false;
        if (!activeFolderId) return true;
        return f.id === activeFolderId || isDescendant(f.id, activeFolderId);
      });
    } else {
      subfolders = subfolders.filter(function(f) {
        return f.parent_id === activeFolderId;
      });
    }
    
    if (subfolders.length > 0) {
      folderListHtml += '<div class="folders-grid">';
      subfolders.forEach(function(f) {
        var folderIcon = f.icon || "📁";
        folderListHtml += '<div class="folder-card" oncontextmenu="folderContextMenu(event, \'' + f.id + '\')" onclick="navigateToFolder(\'' + f.id + '\')" ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, \'' + f.id + '\')">' +
          '<div class="folder-icon">' + esc(folderIcon) + '</div>' +
          '<div class="folder-name" title="' + esc(f.name) + '">' + esc(f.name) + '</div>' +
          '</div>';
      });
      folderListHtml += '</div>';
    }
    folderList.innerHTML = folderListHtml;
  }

  // 3. Render Files
  var list = getVisibleFiles(q);

  // Render Selection Bar if multiple selected
  var selectionBar = document.getElementById("fileSelectionBar");
  if (selectionBar) {
    if (selectedFileIds.length > 0) {
      var currentFolder = folders.find(function(f) { return f.id === activeFolderId; });
      var parentId = currentFolder ? currentFolder.parent_id : null;
      var parentFolder = parentId ? folders.find(function(f) { return f.id === parentId; }) : null;
      var parentName = parentFolder ? parentFolder.name : "Root";

      var selectOptionsHtml = '<option value="" disabled selected>Move to...</option>';
      if (activeFolderId) {
        selectOptionsHtml += '<option value="__parent__">parent: ' + esc(parentName) + '</option>';
      }
      folders.forEach(function(f) {
        if (f.id !== activeFolderId) {
          selectOptionsHtml += '<option value="' + f.id + '">' + esc(f.name) + '</option>';
        }
      });

      selectionBar.innerHTML = '<div class="selection-bar">' +
        '<div>' + selectedFileIds.length + ' file' + (selectedFileIds.length > 1 ? 's' : '') + ' selected</div>' +
        '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">' +
          '<select onchange="moveSelectedFilesToFolder(this.value); this.value=\'\';" style="padding:4px 8px; font-size:12px; max-width:140px;">' + selectOptionsHtml + '</select>' +
          '<button class="btn small" onclick="downloadSelectedFiles()">⬇️ Download</button>' +
          '<button class="btn danger small" onclick="deleteSelectedFiles()">✕ Delete</button>' +
          '<button class="btn ghost small" onclick="clearFileSelection()">Cancel</button>' +
        '</div>' +
        '</div>';
    } else {
      selectionBar.innerHTML = "";
    }
  }

  if (q && fileSearchResults !== null) {
    list.sort(function(a, b) {
      if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
      return fileSearchResults.indexOf(a.id) - fileSearchResults.indexOf(b.id);
    });
  } else {
    if (fileSort === "name") {
      list.sort(function(a, b) {
        if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
        return (a.filename || "").localeCompare(b.filename || "");
      });
    } else if (fileSort === "size") {
      list.sort(function(a, b) {
        if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
        return (b.size || 0) - (a.size || 0);
      });
    } else {
      list.sort(function(a, b) {
        if ((b.is_pinned || 0) !== (a.is_pinned || 0)) return (b.is_pinned || 0) - (a.is_pinned || 0);
        return (b.uploaded || 0) - (a.uploaded || 0);
      });
    }
  }

  var html = "";
  if (list.length > 0) {
    var allChecked = list.every(function(f) { return selectedFileIds.indexOf(f.id) !== -1; });
    var allCheckedClass = allChecked ? ' on' : '';
    var allCheckedMark = allChecked ? '✓' : '';
    html += '<div class="list-item" style="background:transparent; border:none; margin-bottom:10px; padding:0 10px;">' +
      '<span class="hcheck' + allCheckedClass + '" onclick="event.stopPropagation(); toggleSelectAllFiles(' + !allChecked + ')" style="margin-right:8px;">' + allCheckedMark + '</span>' +
      '<span class="muted" style="font-size:12px; font-weight:600; line-height:22px;">Select All (' + list.length + ' files)</span>' +
      '</div>';
  }

  if (fileView === "grid") {
    html += '<div class="files-grid">';
  }
  list.forEach(function(f) {
    var pinned = f.is_pinned ? 'file-pinned' : '';
    var isPreviewable = f.mimetype && (
      f.mimetype.startsWith("image/") ||
      f.mimetype === "application/pdf" ||
      f.mimetype.startsWith("audio/") ||
      f.mimetype.startsWith("video/")
    );

    var isChecked = selectedFileIds.indexOf(f.id) !== -1;
    var selectedClass = isChecked ? 'selected' : '';
    var metaHtml = fmtSize(f.size) + ' &middot; ' + new Date(f.uploaded || 0).toLocaleDateString();
    if (q && f.folder_id !== activeFolderId) {
      var folderPath = getBreadcrumbs(f.folder_id);
      var folderPathStr = folderPath.map(function(folder) { return folder.name; }).join(" / ");
      metaHtml += ' &middot; <span class="muted">in ' + (folderPathStr ? esc(folderPathStr) : 'Root') + '</span>';
    }

    // Per-file rename/download/delete moved to the right-click context menu.

    if (fileView === "grid") {
      var thumbHtml;
      if (f.mimetype && f.mimetype.startsWith("image/")) {
        thumbHtml = '<img class="file-thumb-img" src="/api/files/' + f.id + '/view" loading="lazy" alt="">';
      } else {
        thumbHtml = '<span class="file-thumb-icon">' + getFileIcon(f.mimetype) + '</span>';
      }
      html += '<div class="file-card ' + pinned + ' ' + selectedClass + '" oncontextmenu="fileContextMenu(event, \'' + f.id + '\')" draggable="true" ondragstart="onFileDragStart(event, \'' + f.id + '\')" ondragend="onFileDragEnd(event)"' +
        (isPreviewable ? ' onclick="previewFile(\'' + f.id + '\')"' : '') + '>' +
        '<span class="hcheck file-card-check' + (isChecked ? ' on' : '') + '" onclick="event.stopPropagation(); onFileSelectChange(\'' + f.id + '\', ' + !isChecked + ')">' + (isChecked ? '✓' : '') + '</span>' +
        '<div class="file-thumb">' + thumbHtml + '</div>' +
        '<div class="file-card-name" title="' + esc(f.filename || "Unnamed") + '">' + esc(f.filename || "Unnamed") + '</div>' +
        '<div class="file-meta">' + metaHtml + '</div>' +
        '</div>';
      return;
    }

    var icon = getFileIcon(f.mimetype);
    var iconHtml = '<span style="font-size: 16px; margin-right: 6px;">' + icon + '</span>';
    var fileLinkHtml = '';
    if (isPreviewable) {
      fileLinkHtml = '<span class="file-link" onclick="previewFile(\'' + f.id + '\')" style="font-weight:600; display:flex; align-items:center;">' + iconHtml + esc(f.filename || "Unnamed") + '</span>';
    } else {
      fileLinkHtml = '<span style="display:flex; align-items:center; font-weight:600;">' + iconHtml + esc(f.filename || "Unnamed") + '</span>';
    }

    var checkboxHtml = '<span class="hcheck' + (isChecked ? ' on' : '') + '" onclick="event.stopPropagation(); onFileSelectChange(\'' + f.id + '\', ' + !isChecked + ')" style="margin-right:8px;">' + (isChecked ? '✓' : '') + '</span>';

    html += '<div class="list-item file-item ' + pinned + ' ' + selectedClass + '" oncontextmenu="fileContextMenu(event, \'' + f.id + '\')" draggable="true" ondragstart="onFileDragStart(event, \'' + f.id + '\')" ondragend="onFileDragEnd(event)">' +
      checkboxHtml +
      '<div class="grow" style="cursor:grab;">' +
      '<div>' + fileLinkHtml + '</div>' +
      '<div class="file-meta">' + metaHtml + '</div>' +
      '</div>' +
      '</div>';
  });
  if (fileView === "grid") {
    html += '</div>';
    if (!list.length) html = "";
  }
  document.getElementById("fileList").innerHTML = html || (q ? '<div class="muted">No files match.</div>' : '<div class="muted">No files in this folder.</div>');
  ["date", "name", "size"].forEach(function(s) {
    var btn = document.getElementById("fileSort-" + s);
    if (btn) btn.className = "btn-sort" + (fileSort === s ? " active" : "");
  });
  ["list", "grid"].forEach(function(v) {
    var btn = document.getElementById("fileView-" + v);
    if (btn) btn.className = "btn-sort" + (fileView === v ? " active" : "");
  });

  // 4. Initialize Drag & Drop listeners (upload drop zone)
  var tabFiles = document.getElementById("tab-files");
  if (tabFiles && !tabFiles.dataset.dragInitialized) {
    tabFiles.dataset.dragInitialized = "true";
    var dragCounter = 0;
    tabFiles.addEventListener("dragenter", function(e) {
      e.preventDefault();
      // Only show upload overlay if dragging actual files from outside the browser
      if (e.dataTransfer.types.indexOf("Files") === -1) return;
      
      dragCounter++;
      if (dragCounter === 1) {
        var overlay = document.getElementById("fileDropOverlay");
        if (overlay) {
          overlay.style.display = "flex";
          var currentFolderNameSpan = document.getElementById("dropFolderName");
          if (currentFolderNameSpan) {
            var currentFolder = (S.folders || []).find(function(f) { return f.id === activeFolderId; });
            currentFolderNameSpan.textContent = currentFolder ? currentFolder.name : "Root";
          }
        }
      }
    });
    tabFiles.addEventListener("dragover", function(e) {
      e.preventDefault();
    });
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
      
      var files = e.dataTransfer.files;
      if (!files || !files.length) return;
      await uploadFilesWithProgress(files);
    });
  }
  });
}

export async function uploadFile(refresh) {
  var input = document.getElementById("fileInput");
  var files = input.files;
  if (!files || !files.length) { toast("Choose a file first."); return; }
  var picked = Array.prototype.slice.call(files);
  input.value = "";
  await uploadFilesWithProgress(picked);
}

export async function uploadCameraFile(refresh) {
  var input = document.getElementById("cameraInput");
  var files = input.files;
  if (!files || !files.length) return;
  var picked = Array.prototype.slice.call(files);
  input.value = "";
  await uploadFilesWithProgress(picked);
}

export async function delFile(id, refresh) {
  if (!await askConfirm("Delete this file?", { title: "Delete file", okText: "Delete", danger: true })) return;
  await api("DELETE", "/api/files/" + id);
  await (refresh || window.refreshApp)();
}

export async function toggleFilePin(id, ev) {
  ev.stopPropagation();
  var f = (S.files || []).find(function(x) { return x.id === id; });
  if (!f) return;
  var newPinned = f.is_pinned ? 0 : 1;
  await api("PUT", "/api/files/" + id, { is_pinned: newPinned });
  f.is_pinned = newPinned;
  renderFiles();
}

export function setFileSort(s) { fileSort = s; renderFiles(); }

export function setFileView(v) {
  fileView = v;
  localStorage.setItem("file_view", v);
  renderFiles();
}

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
    var folderList = document.getElementById("folderList");
    if (folderList) {
      var firstFolder = folderList.querySelector(".folder-card");
      if (firstFolder) {
        firstFolder.click();
        return;
      }
    }
    var fileList = document.getElementById("fileList");
    if (fileList) {
      var firstFileLink = fileList.querySelector(".file-link");
      if (firstFileLink) {
        firstFileLink.click();
        return;
      }
    }
  }
}

// Folder navigation/management operations
export function navigateToFolder(id) {
  activeFolderId = id;
  selectedFileIds = [];
  renderFiles();
}

export async function createFolderPrompt(refresh) {
  var name = await askPrompt("New folder", "", { okText: "Create", placeholder: "Folder name" });
  if (name === null) return;
  name = name.trim();
  if (!name) { toast("Folder name cannot be empty."); return; }

  var actualRefresh = refresh || window.refreshApp;
  await api("POST", "/api/folders", {
    name: name,
    parent_id: activeFolderId
  });
  if (actualRefresh) await actualRefresh();
}

export async function renameFolderPrompt(id, oldName, refresh) {
  var name = await askPrompt("Rename folder", oldName, { okText: "Rename" });
  if (name === null) return;
  name = name.trim();
  if (!name) { toast("Folder name cannot be empty."); return; }

  var actualRefresh = refresh || window.refreshApp;
  await api("PUT", "/api/folders/" + id, { name: name });
  if (actualRefresh) await actualRefresh();
}

export async function changeFolderIconPrompt(id, oldIcon, refresh) {
  var icon = await askPrompt("Folder icon (emoji or character)", oldIcon || "📁", { okText: "Save" });
  if (icon === null) return;
  icon = icon.trim();
  if (!icon) icon = "📁";

  var actualRefresh = refresh || window.refreshApp;
  await api("PUT", "/api/folders/" + id, { icon: icon });
  if (actualRefresh) await actualRefresh();
}

export async function deleteFolderConfirm(id, refresh) {
  if (!await askConfirm("Delete this folder? Its contents will be moved to the parent directory.", { title: "Delete folder", okText: "Delete", danger: true })) return;

  var actualRefresh = refresh || window.refreshApp;
  await api("DELETE", "/api/folders/" + id);

  if (activeFolderId === id) {
    var folders = S.folders || [];
    var folder = folders.find(function(f) { return f.id === id; });
    activeFolderId = folder ? folder.parent_id : null;
  }

  if (actualRefresh) await actualRefresh();
}

export async function renameFilePrompt(id, oldName, refresh) {
  var name = await askPrompt("Rename file", oldName, { okText: "Rename" });
  if (name === null) return;
  name = name.trim();
  if (!name) { toast("Filename cannot be empty."); return; }

  var actualRefresh = refresh || window.refreshApp;
  await api("PUT", "/api/files/" + id, { filename: name });
  if (actualRefresh) await actualRefresh();
}

// Move one or more files via a folder picker dialog (used by the context menu).
export async function moveFilesDialog(ids) {
  if (!ids.length) return;
  var f = (S.files || []).find(function(x) { return x.id === ids[0]; });
  var label = ids.length === 1 ? "“" + ((f && f.filename) || "file") + "”" : ids.length + " files";
  var options = [{ value: "", label: "Root" }];
  (S.folders || []).forEach(function(folder) {
    var depth = getBreadcrumbs(folder.id).length - 1;
    options.push({ value: folder.id, label: Array(depth + 1).join("  ") + folder.name });
  });
  var target = await askPrompt("Move " + label + " to…", (f && f.folder_id) || "", { okText: "Move", options: options });
  if (target === null) return;
  await api("POST", "/api/files/move", { file_ids: ids, folder_id: target || null });
  selectedFileIds = [];
  if (window.refreshApp) await window.refreshApp();
}

// Right-click menus
export function fileContextMenu(ev, id) {
  // Right-clicking one of several selected files acts on the whole selection.
  if (selectedFileIds.length > 1 && selectedFileIds.indexOf(id) !== -1) {
    var n = selectedFileIds.length;
    showContextMenu(ev, [
      { label: "Download " + n + " files", icon: "⬇️", onClick: downloadSelectedFiles },
      { label: "Move " + n + " files to…", icon: "📁", onClick: function() { moveFilesDialog(selectedFileIds.slice()); } },
      { label: "Clear selection", icon: "◻️", onClick: clearFileSelection },
      { sep: true },
      { label: "Delete " + n + " files", icon: "✕", danger: true, onClick: deleteSelectedFiles }
    ]);
    return;
  }
  var f = (S.files || []).find(function(x) { return x.id === id; });
  if (!f) return;
  showContextMenu(ev, [
    { label: "Rename", icon: "✏️", onClick: function() { renameFilePrompt(id, f.filename || ""); } },
    { label: "Move to…", icon: "📁", onClick: function() { moveFilesDialog([id]); } },
    { label: "Download", icon: "⬇️", onClick: function() { window.location.href = "/api/files/" + id + "/download"; } },
    { label: f.is_pinned ? "Unpin" : "Pin", icon: "★", onClick: function() { toggleFilePin(id, ev); } },
    { sep: true },
    { label: "Delete", icon: "✕", danger: true, onClick: function() { delFile(id); } }
  ]);
}

export function folderContextMenu(ev, id) {
  var folder = (S.folders || []).find(function(x) { return x.id === id; });
  if (!folder) return;
  showContextMenu(ev, [
    { label: "Open", icon: "📂", onClick: function() { navigateToFolder(id); } },
    { label: "Rename", icon: "✏️", onClick: function() { renameFolderPrompt(id, folder.name || ""); } },
    { label: "Change icon", icon: "🏷️", onClick: function() { changeFolderIconPrompt(id, folder.icon || "📁"); } },
    { sep: true },
    { label: "Delete", icon: "✕", danger: true, onClick: function() { deleteFolderConfirm(id); } }
  ]);
}

// Media Preview operations
export function previewFile(id) {
  var f = (S.files || []).find(function(x) { return x.id === id; });
  if (!f) return;
  
  var title = document.getElementById("mediaPreviewTitle");
  var container = document.getElementById("mediaPreviewContainer");
  var modal = document.getElementById("mediaPreviewModal");
  
  if (!title || !container || !modal) return;
  
  title.textContent = f.filename || "File Preview";
  container.innerHTML = "";
  
  var url = "/api/files/" + f.id + "/view";
  var mt = f.mimetype || "";
  var content = document.getElementById("mediaPreviewModalContent");
  
  if (mt.startsWith("image/")) {
    if (content) content.style.cssText = "display: flex; flex-direction: column; box-sizing: border-box; max-width: 90vw; width: max-content; height: auto; max-height: 90vh;";
    container.innerHTML = '<img src="' + url + '" style="max-width:100%; max-height:100%; object-fit:contain;">';
  } else if (mt === "application/pdf") {
    if (content) content.style.cssText = "display: flex; flex-direction: column; box-sizing: border-box; max-width: 95vw; width: 95vw; height: 95vh;";
    container.innerHTML = '<iframe src="' + url + '" style="width:100%; height:100%; border:none; background:white; border-radius: 4px;"></iframe>';
  } else if (mt.startsWith("audio/")) {
    if (content) content.style.cssText = "display: flex; flex-direction: column; box-sizing: border-box; max-width: 400px; width: 90%; height: auto;";
    container.innerHTML = '<audio controls autoplay src="' + url + '" style="width:100%; outline:none; border-radius: 8px; margin-top: 10px;"></audio>';
  } else if (mt.startsWith("video/")) {
    if (content) content.style.cssText = "display: flex; flex-direction: column; box-sizing: border-box; max-width: 90vw; width: max-content; height: auto; max-height: 90vh;";
    container.innerHTML = '<video controls autoplay style="max-width:100%; max-height:100%; outline:none; border-radius: 8px;"><source src="' + url + '" type="' + mt + '"></video>';
  } else {
    if (content) content.style.cssText = "display: flex; flex-direction: column; box-sizing: border-box; max-width: 400px; width: 90%; height: auto;";
    container.innerHTML = '<div class="muted">No preview available for this file type.</div>';
  }
  
  window.dispatchEvent(new CustomEvent('open-media-preview-modal'));
}


// DRAG-AND-DROP FILE MOVING FOR INTERNAL FILES
export function onFileDragStart(e, fileId) {
  // If the dragged file is not currently selected, select it as the sole target
  if (selectedFileIds.indexOf(fileId) === -1) {
    selectedFileIds = [fileId];
    renderFiles();
  }
  draggedFileIds = selectedFileIds.slice();
  
  e.dataTransfer.setData("text/plain", fileId);
  e.dataTransfer.effectAllowed = "move";
}

export function onFileDragEnd(e) {
  draggedFileIds = [];
  document.querySelectorAll(".drag-over").forEach(function(el) {
    el.classList.remove("drag-over");
  });
}

export function onFolderDragOver(e) {
  // Only allow internal file drags to drop onto folders/breadcrumbs
  if (draggedFileIds.length === 0) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  
  var el = e.currentTarget;
  if (el && !el.classList.contains("drag-over")) {
    el.classList.add("drag-over");
  }
}

export function onFolderDragLeave(e) {
  var el = e.currentTarget;
  if (el) {
    el.classList.remove("drag-over");
  }
}

export async function onFolderDrop(e, targetFolderId) {
  e.preventDefault();
  var el = e.currentTarget;
  if (el) {
    el.classList.remove("drag-over");
  }
  
  if (draggedFileIds.length > 0) {
    // Avoid moving files into the folder they are already in
    if (targetFolderId === activeFolderId) {
      draggedFileIds = [];
      return;
    }
    
    await api("POST", "/api/files/move", {
      file_ids: draggedFileIds,
      folder_id: targetFolderId
    });
    
    selectedFileIds = [];
    draggedFileIds = [];
    if (window.refreshApp) {
      await window.refreshApp();
    }
  }
}

// MULTI-SELECT ACTIONS
export function toggleSelectAllFiles(checked) {
  var q = (document.getElementById("fileSearch") || { value: "" }).value.trim().toLowerCase();
  var list = getVisibleFiles(q);


  if (checked) {
    list.forEach(function(f) {
      if (selectedFileIds.indexOf(f.id) === -1) {
        selectedFileIds.push(f.id);
      }
    });
  } else {
    list.forEach(function(f) {
      var idx = selectedFileIds.indexOf(f.id);
      if (idx !== -1) {
        selectedFileIds.splice(idx, 1);
      }
    });
  }
  renderFiles();
}

export function onFileSelectChange(fileId, checked) {
  var idx = selectedFileIds.indexOf(fileId);
  if (checked && idx === -1) {
    selectedFileIds.push(fileId);
  } else if (!checked && idx !== -1) {
    selectedFileIds.splice(idx, 1);
  }
  renderFiles();
}

export function clearFileSelection() {
  selectedFileIds = [];
  renderFiles();
}

export async function moveSelectedFilesToFolder(targetFolderId) {
  if (targetFolderId === "__parent__") {
    var folders = S.folders || [];
    var currentFolder = folders.find(function(f) { return f.id === activeFolderId; });
    targetFolderId = currentFolder ? currentFolder.parent_id : null;
  }
  if (selectedFileIds.length > 0) {
    await api("POST", "/api/files/move", {
      file_ids: selectedFileIds,
      folder_id: targetFolderId
    });
    selectedFileIds = [];
    if (window.refreshApp) {
      await window.refreshApp();
    }
  }
}

export function downloadSelectedFiles() {
  // ponytail: sequential anchor clicks — the browser may ask once to allow
  // multiple downloads; a server-side zip endpoint is the upgrade path.
  selectedFileIds.forEach(function(id, i) {
    setTimeout(function() {
      var a = document.createElement("a");
      a.href = "/api/files/" + id + "/download";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 400);
  });
  toast("Downloading " + selectedFileIds.length + " file" + (selectedFileIds.length > 1 ? "s" : "") + "…");
}

export async function deleteSelectedFiles() {
  if (!await askConfirm("Delete the " + selectedFileIds.length + " selected files?", { title: "Delete files", okText: "Delete", danger: true })) return;
  for (var i = 0; i < selectedFileIds.length; i++) {
    var id = selectedFileIds[i];
    await api("DELETE", "/api/files/" + id);
  }
  selectedFileIds = [];
  if (window.refreshApp) {
    await window.refreshApp();
  }
}
