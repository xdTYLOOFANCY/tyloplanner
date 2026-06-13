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

