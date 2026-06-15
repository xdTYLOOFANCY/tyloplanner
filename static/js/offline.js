// TyloPlanner — Offline IndexedDB coordinator and sync queue.
"use strict";

let dbPromise = null;

export function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function(resolve, reject) {
    var req = indexedDB.open("tyloplanner_offline", 1);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains("state_cache")) {
        db.createObjectStore("state_cache");
      }
      if (!db.objectStoreNames.contains("api_queue")) {
        db.createObjectStore("api_queue", { keyPath: "id" });
      }
    };
    req.onsuccess = function(e) {
      resolve(e.target.result);
    };
    req.onerror = function(e) {
      reject(e.target.error);
    };
  });
  return dbPromise;
}

export async function getCache(key) {
  var db = await initDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction("state_cache", "readonly");
    var store = tx.objectStore("state_cache");
    var req = store.get(key);
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

export async function setCache(key, val) {
  var db = await initDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction("state_cache", "readwrite");
    var store = tx.objectStore("state_cache");
    var req = store.put(val, key);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

export async function getQueue() {
  var db = await initDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction("api_queue", "readonly");
    var store = tx.objectStore("api_queue");
    var req = store.getAll();
    req.onsuccess = function() {
      var items = req.result || [];
      items.sort(function(a, b) { return a.timestamp - b.timestamp; });
      resolve(items);
    };
    req.onerror = function() { reject(req.error); };
  });
}

export async function addToQueue(item) {
  var db = await initDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction("api_queue", "readwrite");
    var store = tx.objectStore("api_queue");
    var req = store.put(item);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

export async function removeFromQueue(id) {
  var db = await initDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction("api_queue", "readwrite");
    var store = tx.objectStore("api_queue");
    var req = store.delete(id);
    req.onsuccess = function() { resolve(); };
    req.onerror = function() { reject(req.error); };
  });
}

export async function getQueueCount() {
  var db = await initDB();
  return new Promise(function(resolve, reject) {
    var tx = db.transaction("api_queue", "readonly");
    var store = tx.objectStore("api_queue");
    var req = store.count();
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

export async function updateOfflineBanner() {
  var banner = document.getElementById("offline-banner");
  if (!banner) return;

  var count = await getQueueCount();
  if (!navigator.onLine) {
    banner.style.display = "flex";
    banner.textContent = "Working Offline — " + count + " change" + (count === 1 ? "" : "s") + " pending";
    banner.className = "offline-banner offline";
  } else if (count > 0) {
    banner.style.display = "flex";
    banner.textContent = "Syncing — " + count + " change" + (count === 1 ? "" : "s") + " pending";
    banner.className = "offline-banner syncing";
  } else {
    banner.style.display = "none";
  }
}

export async function syncQueue(refreshCallback) {
  if (!navigator.onLine) return;
  var queue = await getQueue();
  if (queue.length === 0) {
    await updateOfflineBanner();
    return;
  }

  for (var i = 0; i < queue.length; i++) {
    var item = queue[i];
    try {
      var opt = {
        method: item.method,
        headers: { "Content-Type": "application/json" }
      };
      if (item.data !== undefined) {
        opt.body = JSON.stringify(item.data);
      }
      var r = await fetch(item.path, opt);
      if (!r.ok) {
        if (r.status >= 500) {
          throw new Error("Server error: " + r.statusText);
        }
      }
      await removeFromQueue(item.id);
    } catch (err) {
      console.error("Failed to replay queued item:", item, err);
      // Abort sync replay on server/network failure to preserve operation order
      await updateOfflineBanner();
      return;
    }
  }

  await updateOfflineBanner();
  if (refreshCallback) {
    await refreshCallback();
  }
}
