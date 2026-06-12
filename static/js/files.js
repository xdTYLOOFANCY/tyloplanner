// TyloPlanner — file storage module.

import { S } from './state.js';
import { esc, api, toast } from './utils.js';

var fileSort = "date";

function fmtSize(bytes) {
  if (bytes == null) return "\u2014";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (Math.round(bytes / 102.4) / 10) + " KB";
  return (Math.round(bytes / 104857.6) / 10) + " MB";
}

export function renderFiles() {
  var q = (document.getElementById("fileSearch") || { value: "" }).value.trim().toLowerCase();
  var list = (S.files || []).slice();
  if (q) list = list.filter(function(f) {
    return (f.filename || "").toLowerCase().indexOf(q) !== -1;
  });
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
  list.forEach(function(f) {
    var pinned = f.is_pinned ? 'file-pinned' : '';
    html += '<div class="list-item ' + pinned + '">' +
      '<button class="btn-pin" onclick="toggleFilePin(\'' + f.id + '\',event)" title="' + (f.is_pinned ? 'Unpin' : 'Pin') + '">\u2605</button>' +
      '<div class="grow">' +
      '<div>' + esc(f.filename || "Unnamed") + '</div>' +
      '<div class="muted">' + fmtSize(f.size) + ' &middot; ' + new Date(f.uploaded || 0).toLocaleDateString() + '</div>' +
      '</div>' +
      '<a class="btn small ghost" href="/api/files/' + f.id + '/download" style="text-decoration:none">Download</a>' +
      '<button class="btn danger small" onclick="delFile(\'' + f.id + '\')">✕</button>' +
      '</div>';
  });
  document.getElementById("fileList").innerHTML = html || (q ? '<div class="muted">No files match.</div>' : '<div class="muted">No files uploaded yet.</div>');
  ["date", "name", "size"].forEach(function(s) {
    var btn = document.getElementById("fileSort-" + s);
    if (btn) btn.className = "btn small" + (fileSort === s ? "" : " ghost");
  });
}

export async function uploadFile(refresh) {
  var input = document.getElementById("fileInput");
  var files = input.files;
  if (!files || !files.length) { alert("Choose a file first."); return; }
  for (var i = 0; i < files.length; i++) {
    var fd = new FormData();
    fd.append("file", files[i]);
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
