// TyloPlanner — file storage module.

import { S } from './state.js';
import { esc, api, toast } from './utils.js';

var fileSort = "date";
var activeFolderId = null;
var selectedFileIds = [];
var draggedFileIds = [];

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

export function renderFiles() {
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
      breadcrumbsHtml += '<span class="breadcrumb-item' + (isLast ? ' active' : '') + '" onclick="' + (isLast ? '' : 'navigateToFolder(\'' + f.id + '\')') + '" ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, \'' + f.id + '\')">' + folderIcon + esc(f.name) + '</span>';
    });
    breadcrumbsHtml += '</div>';
    
    var actionsHtml = '<div class="folder-actions-group">';
    if (activeFolderId) {
      var currentFolder = folders.find(function(f) { return f.id === activeFolderId; });
      var currentFolderName = currentFolder ? currentFolder.name : "";
      var currentFolderIcon = currentFolder ? (currentFolder.icon || "📁") : "📁";
      actionsHtml += '<button class="btn small ghost" onclick="renameFolderPrompt(\'' + activeFolderId + '\', \'' + esc(currentFolderName).replace(/'/g, "\\'") + '\')">✏️ Rename</button>';
      actionsHtml += '<button class="btn small ghost" onclick="changeFolderIconPrompt(\'' + activeFolderId + '\', \'' + esc(currentFolderIcon).replace(/'/g, "\\'") + '\')">🏷️ Icon</button>';
      actionsHtml += '<button class="btn danger small" onclick="deleteFolderConfirm(\'' + activeFolderId + '\')">✕ Delete</button>';
    }
    actionsHtml += '<button class="btn small" onclick="createFolderPrompt()">+ Folder</button>';
    actionsHtml += '<button class="btn small" onclick="document.getElementById(\'fileInput\').click()">📤 Upload</button>';
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
        folderListHtml += '<div class="folder-card" onclick="navigateToFolder(\'' + f.id + '\')" ondragover="onFolderDragOver(event)" ondragleave="onFolderDragLeave(event)" ondrop="onFolderDrop(event, \'' + f.id + '\')">' +
          '<div class="folder-icon">' + esc(folderIcon) + '</div>' +
          '<div class="folder-name" title="' + esc(f.name) + '">' + esc(f.name) + '</div>' +
          '<div class="folder-actions" onclick="event.stopPropagation();">' +
            '<button class="folder-action-btn" onclick="renameFolderPrompt(\'' + f.id + '\', \'' + esc(f.name).replace(/'/g, "\\'") + '\')" title="Rename">✏️</button>' +
            '<button class="folder-action-btn" onclick="changeFolderIconPrompt(\'' + f.id + '\', \'' + esc(folderIcon).replace(/'/g, "\\'") + '\')" title="Change Icon">🏷️</button>' +
            '<button class="folder-action-btn danger" onclick="deleteFolderConfirm(\'' + f.id + '\')" title="Delete">✕</button>' +
          '</div>' +
          '</div>';
      });
      folderListHtml += '</div>';
    }
    folderList.innerHTML = folderListHtml;
  }

  // 3. Render Files
  var list = (S.files || []).slice();
  if (q) {
    list = list.filter(function(f) {
      var nameMatch = (f.filename || "").toLowerCase().indexOf(q) !== -1;
      if (!nameMatch) return false;
      if (!activeFolderId) return true;
      return f.folder_id === activeFolderId || isDescendant(f.folder_id, activeFolderId);
    });
  } else {
    list = list.filter(function(f) {
      return f.folder_id === activeFolderId;
    });
  }

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
        '<div style="display:flex; gap:8px; align-items:center;">' +
          '<select onchange="moveSelectedFilesToFolder(this.value); this.value=\'\';" style="padding:4px 8px; font-size:12px;">' + selectOptionsHtml + '</select>' +
          '<button class="btn danger small" onclick="deleteSelectedFiles()">✕ Delete</button>' +
          '<button class="btn ghost small" onclick="clearFileSelection()">Cancel</button>' +
        '</div>' +
        '</div>';
    } else {
      selectionBar.innerHTML = "";
    }
  }

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

  list.forEach(function(f) {
    var pinned = f.is_pinned ? 'file-pinned' : '';
    var isPreviewable = f.mimetype && (
      f.mimetype.startsWith("image/") ||
      f.mimetype === "application/pdf" ||
      f.mimetype.startsWith("audio/") ||
      f.mimetype.startsWith("video/")
    );
    
    var icon = getFileIcon(f.mimetype);
    var iconHtml = '<span style="font-size: 16px; margin-right: 6px;">' + icon + '</span>';
    var fileLinkHtml = '';
    if (isPreviewable) {
      fileLinkHtml = '<span class="file-link" onclick="previewFile(\'' + f.id + '\')" style="font-weight:600; display:flex; align-items:center;">' + iconHtml + esc(f.filename || "Unnamed") + '</span>';
    } else {
      fileLinkHtml = '<span style="display:flex; align-items:center; font-weight:600;">' + iconHtml + esc(f.filename || "Unnamed") + '</span>';
    }

    var isChecked = selectedFileIds.indexOf(f.id) !== -1;
    var selectedClass = isChecked ? 'selected' : '';
    var checkboxHtml = '<span class="hcheck' + (isChecked ? ' on' : '') + '" onclick="event.stopPropagation(); onFileSelectChange(\'' + f.id + '\', ' + !isChecked + ')" style="margin-right:8px;">' + (isChecked ? '✓' : '') + '</span>';

    var metaHtml = fmtSize(f.size) + ' &middot; ' + new Date(f.uploaded || 0).toLocaleDateString();
    if (q && f.folder_id !== activeFolderId) {
      var folderPath = getBreadcrumbs(f.folder_id);
      var folderPathStr = folderPath.map(function(folder) { return folder.name; }).join(" / ");
      if (folderPathStr) {
        metaHtml += ' &middot; <span class="muted">in ' + esc(folderPathStr) + '</span>';
      } else {
        metaHtml += ' &middot; <span class="muted">in Root</span>';
      }
    }

    html += '<div class="list-item file-item ' + pinned + ' ' + selectedClass + '" draggable="true" ondragstart="onFileDragStart(event, \'' + f.id + '\')" ondragend="onFileDragEnd(event)">' +
      checkboxHtml +
      '<button class="btn-pin" onclick="toggleFilePin(\'' + f.id + '\',event)" title="' + (f.is_pinned ? 'Unpin' : 'Pin') + '">★</button>' +
      '<div class="grow" style="cursor:grab;">' +
      '<div>' + fileLinkHtml + '</div>' +
      '<div class="file-meta">' + metaHtml + '</div>' +
      '</div>' +
      '<div class="file-actions" onclick="event.stopPropagation()"> ' +
      '<button class="btn small ghost" onclick="renameFilePrompt(\'' + f.id + '\', \'' + esc(f.filename || "").replace(/'/g, "\\'") + '\')" title="Rename">✏️</button>' +
      '<a class="btn small ghost" href="/api/files/' + f.id + '/download" style="text-decoration:none">Download</a>' +
      '<button class="btn danger small" onclick="delFile(\'' + f.id + '\')">✕</button>' +
      '</div>' +
      '</div>';
  });
  document.getElementById("fileList").innerHTML = html || (q ? '<div class="muted">No files match.</div>' : '<div class="muted">No files in this folder.</div>');
  ["date", "name", "size"].forEach(function(s) {
    var btn = document.getElementById("fileSort-" + s);
    if (btn) btn.className = "btn-sort" + (fileSort === s ? " active" : "");
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
      
      for (var i = 0; i < files.length; i++) {
        var fd = new FormData();
        fd.append("file", files[i]);
        if (activeFolderId) {
          fd.append("folder_id", activeFolderId);
        }
        var r = await fetch("/api/files/upload", { method: "POST", body: fd });
        if (!r.ok) {
          var err = await r.json().catch(function() { return { error: r.statusText }; });
          alert("Upload failed: " + (err.error || "unknown error"));
          return;
        }
      }
      toast("Uploaded " + files.length + " file" + (files.length > 1 ? "s" : ""));
      if (window.refreshApp) {
        await window.refreshApp();
      }
    });
  }
}

export async function uploadFile(refresh) {
  var input = document.getElementById("fileInput");
  var files = input.files;
  if (!files || !files.length) { alert("Choose a file first."); return; }
  for (var i = 0; i < files.length; i++) {
    var fd = new FormData();
    fd.append("file", files[i]);
    if (activeFolderId) {
      fd.append("folder_id", activeFolderId);
    }
    var r = await fetch("/api/files/upload", { method: "POST", body: fd });
    if (!r.ok) {
      var e = await r.json().catch(function() { return { error: r.statusText }; });
      alert("Upload failed: " + (e.error || "unknown error"));
      input.value = "";
      return;
    }
  }
  input.value = "";
  toast("Uploaded " + files.length + " file" + (files.length > 1 ? "s" : ""));
  await refresh();
}

export async function delFile(id, refresh) {
  if (!confirm("Delete this file?")) return;
  await api("DELETE", "/api/files/" + id);
  await refresh();
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
      var firstFileItem = fileList.querySelector(".list-item.file-item");
      if (firstFileItem) {
        var dlBtn = firstFileItem.querySelector("a.btn");
        if (dlBtn) dlBtn.click();
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
  var name = prompt("Enter folder name:");
  if (name === null) return;
  name = name.trim();
  if (!name) { alert("Folder name cannot be empty."); return; }
  
  var actualRefresh = refresh || window.refreshApp;
  await api("POST", "/api/folders", {
    name: name,
    parent_id: activeFolderId
  });
  if (actualRefresh) await actualRefresh();
}

export async function renameFolderPrompt(id, oldName, refresh) {
  var name = prompt("Rename folder:", oldName);
  if (name === null) return;
  name = name.trim();
  if (!name) { alert("Folder name cannot be empty."); return; }
  
  var actualRefresh = refresh || window.refreshApp;
  await api("PUT", "/api/folders/" + id, { name: name });
  if (actualRefresh) await actualRefresh();
}

export async function changeFolderIconPrompt(id, oldIcon, refresh) {
  var icon = prompt("Enter an emoji or character for this folder icon:", oldIcon || "📁");
  if (icon === null) return;
  icon = icon.trim();
  if (!icon) icon = "📁";
  
  var actualRefresh = refresh || window.refreshApp;
  await api("PUT", "/api/folders/" + id, { icon: icon });
  if (actualRefresh) await actualRefresh();
}

export async function deleteFolderConfirm(id, refresh) {
  if (!confirm("Delete this folder? Its contents will be moved to the parent directory.")) return;
  
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
  var name = prompt("Rename file:", oldName);
  if (name === null) return;
  name = name.trim();
  if (!name) { alert("Filename cannot be empty."); return; }
  
  var actualRefresh = refresh || window.refreshApp;
  await api("PUT", "/api/files/" + id, { filename: name });
  if (actualRefresh) await actualRefresh();
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
  
  if (mt.startsWith("image/")) {
    container.innerHTML = '<img src="' + url + '" style="max-width:100%; max-height:100%; object-fit:contain;">';
  } else if (mt === "application/pdf") {
    container.innerHTML = '<iframe src="' + url + '" style="width:100%; height:100%; border:none; background:white;"></iframe>';
  } else if (mt.startsWith("audio/")) {
    container.innerHTML = '<audio controls autoplay src="' + url + '" style="width:100%;"></audio>';
  } else if (mt.startsWith("video/")) {
    container.innerHTML = '<video controls autoplay style="max-width:100%; max-height:100%;"><source src="' + url + '" type="' + mt + '"></video>';
  } else {
    container.innerHTML = '<div class="muted">No preview available for this file type.</div>';
  }
  
  modal.style.display = "flex";
}

export function closeMediaPreviewModal() {
  var modal = document.getElementById("mediaPreviewModal");
  var container = document.getElementById("mediaPreviewContainer");
  if (modal) modal.style.display = "none";
  if (container) container.innerHTML = "";
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
  document.querySelectorAll(".folder-drag-over").forEach(function(el) {
    el.classList.remove("folder-drag-over");
  });
}

export function onFolderDragOver(e) {
  // Only allow internal file drags to drop onto folders/breadcrumbs
  if (draggedFileIds.length === 0) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  
  var el = e.currentTarget;
  if (el && !el.classList.contains("folder-drag-over")) {
    el.classList.add("folder-drag-over");
  }
}

export function onFolderDragLeave(e) {
  var el = e.currentTarget;
  if (el) {
    el.classList.remove("folder-drag-over");
  }
}

export async function onFolderDrop(e, targetFolderId) {
  e.preventDefault();
  var el = e.currentTarget;
  if (el) {
    el.classList.remove("folder-drag-over");
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
  var list = (S.files || []).slice();
  if (q) {
    list = list.filter(function(f) {
      return (f.filename || "").toLowerCase().indexOf(q) !== -1;
    });
  } else {
    list = list.filter(function(f) {
      return f.folder_id === activeFolderId;
    });
  }
  
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

export async function deleteSelectedFiles() {
  if (!confirm("Delete the " + selectedFileIds.length + " selected files?")) return;
  for (var i = 0; i < selectedFileIds.length; i++) {
    var id = selectedFileIds[i];
    await api("DELETE", "/api/files/" + id);
  }
  selectedFileIds = [];
  if (window.refreshApp) {
    await window.refreshApp();
  }
}
