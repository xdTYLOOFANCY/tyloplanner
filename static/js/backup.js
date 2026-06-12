// TyloPlanner — backup / restore module.

import { S } from './state.js';
import { todayStr, api, toast } from './utils.js';

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
