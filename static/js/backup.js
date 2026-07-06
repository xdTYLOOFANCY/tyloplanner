// TyloPlanner — backup / restore module.

import { S } from './state.js';
import { todayStr, api, toast, esc } from './utils.js';

export function exportData() {
  var blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "tyloplanner-backup-" + todayStr() + ".json";
  a.click(); URL.revokeObjectURL(a.href);
}

export function importData(ev, refresh) {
  var f = ev.target.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = async function() {
    try {
      var s = JSON.parse(r.result);
      if (!s || typeof s !== "object" || !("habits" in s)) throw new Error("not a TyloPlanner backup");
      if (!confirm("Replace ALL current data with this backup?")) return;
      await api("POST", "/api/restore", s);
      await refresh(); toast("Backup restored.");
    } catch(e) { alert("Restore failed: " + e.message); }
  };
  r.readAsText(f); ev.target.value = "";
}

// ---------------- universal export/import archive ----------------

function archiveCategories() {
  var cats = [];
  document.querySelectorAll('#archiveCats input[type="checkbox"]:checked').forEach(function(cb) {
    cats.push(cb.value);
  });
  return cats;
}

export function exportArchive() {
  var cats = archiveCategories();
  if (!cats.length) { alert("Select at least one category to export."); return; }
  window.location.href = "/api/export/archive?categories=" + encodeURIComponent(cats.join(","));
}

export function importArchive(ev, refresh) {
  var f = ev.target.files[0]; ev.target.value = "";
  if (!f) return;
  var cats = archiveCategories();
  if (!cats.length) { alert("Select at least one category to import."); return; }
  var mode = document.getElementById("archiveMode").value;
  var msg = mode === "replace"
    ? "REPLACE the selected categories (" + cats.join(", ") + ") with the archive contents? Current data in those categories will be deleted."
    : "Merge the archive into the selected categories (" + cats.join(", ") + ")? Existing items are kept.";
  if (!confirm(msg)) return;
  var fd = new FormData(); fd.append("file", f);
  fetch("/api/import/archive?mode=" + mode + "&categories=" + encodeURIComponent(cats.join(",")),
        { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" }, body: fd })
    .then(function(r) { return r.json(); })
    .then(async function(j) {
      if (j.error) { alert("Import failed: " + j.error); return; }
      toast("Imported " + j.imported + " items (" + j.mode + ")");
      if (refresh) await refresh();
    })
    .catch(function(e) { alert("Import failed: " + e.message); });
}

export async function renderBackupList(containerId, refresh) {
  var container = document.getElementById(containerId);
  if (!container) return;
  try {
    var backups = await api("GET", "/api/backups");
    if (!backups || backups.length === 0) {
      container.innerHTML = '<div class="muted">No automatic backups yet.</div>';
      return;
    }
    
    var html = '';
    backups.forEach(function(b) {
      var sizeText = typeof b.size_kb === 'number' ? b.size_kb.toFixed(1) + ' KB' : '';
      html += '<div class="list-item" style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">';
      html += '<div class="grow"><b>' + esc(b.date) + '</b> <span class="muted">(' + esc(sizeText) + ')</span></div>';
      html += '<button class="btn small restore-btn" data-filename="' + esc(b.filename) + '" data-date="' + esc(b.date) + '">Restore</button>';
      html += '</div>';
    });
    container.innerHTML = html;
    
    container.onclick = async function(e) {
      var btn = e.target.closest('.restore-btn');
      if (!btn) return;
      var filename = btn.getAttribute('data-filename');
      var date = btn.getAttribute('data-date');
      if (confirm("Restore from " + date + "? All current data will be replaced.")) {
        try {
          await api("POST", "/api/backups/" + filename + "/restore");
          toast("Restored from " + date);
          if (refresh) {
            await refresh();
          }
        } catch(err) {
          alert("Restore failed: " + err.message);
        }
      }
    };
  } catch(e) {
    container.innerHTML = '<div class="danger">Failed to load backups: ' + esc(e.message) + '</div>';
  }
}

