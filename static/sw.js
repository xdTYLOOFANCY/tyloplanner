// TyloPlanner service worker: cache static assets so the app shell loads
// instantly (and the icon/manifest work offline). API calls always hit the
// network - your data is never served stale.
const CACHE = "tylo-v106";
// Uploaded note images (/api/files/<id>/view) get their own runtime cache so
// inline images still render offline. Kept separate so it survives app updates.
const MEDIA_CACHE = "tylo-media-v1";
const MEDIA_RE = /^\/api\/files\/[^/]+\/view$/;
const ASSETS = ["/", "/index.html", "/style.css", "/app.js", "/logo.svg", "/manifest.json",
                "/icon-192.png", "/icon-512.png",
                "/js/state.js", "/js/utils.js", "/js/theme.js",
                "/js/planner.js", "/js/exams.js", "/js/habits.js",
                "/js/workouts.js", "/js/tasks.js", "/js/notes.js",
                "/js/analytics.js", "/js/dashboard.js", "/js/backup.js", "/js/chart.umd.js",
                "/js/files.js", "/js/settings.js", "/js/marked.min.js",
                "/js/offline.js", "/js/sidebar.js", "/js/login.js", "/js/study_timer.js",
                "/js/swipe.js", "/js/quill.js", "/js/quill.snow.css",
                "/fonts/inter-400.woff2", "/fonts/inter-500.woff2",
                "/fonts/inter-600.woff2", "/fonts/inter-700.woff2"];

self.addEventListener("install", function (e) {
  // Do NOT call skipWaiting() here — it causes infinite reload loops on iOS
  // standalone PWA mode. The new SW waits until the user clicks "Update now".
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== MEDIA_CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", function (e) {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Inline note images: serve cached-first, revalidate in the background, so
  // they render offline. (Everything else under /api/ always hits the network.)
  if (MEDIA_RE.test(url.pathname)) {
    e.respondWith(
      caches.open(MEDIA_CACHE).then(function (cache) {
        return cache.match(e.request).then(function (hit) {
          const fetchP = fetch(e.request).then(function (resp) {
            if (resp && resp.status === 200) cache.put(e.request, resp.clone());
            return resp;
          }).catch(function () { return hit; });
          return hit || fetchP;
        });
      })
    );
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname === "/calendar.ics") return;
  if (ASSETS.indexOf(url.pathname) !== -1) {
    e.respondWith(
      caches.match(e.request).then(function (hit) {
        return hit || fetch(e.request).then(function (resp) {
          const copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          return resp;
        });
      })
    );
  }
});

self.addEventListener("push", function (e) {
  if (!e.data) return;
  var title = "TyloPlanner";
  var body = "";
  try {
    var data = e.data.json();
    title = data.title || title;
    body = data.body || "";
  } catch (err) {
    body = e.data.text();
  }
  
  var options = {
    body: body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: {
      url: "/"
    }
  };
  e.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  const urlToOpen = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clList) {
      for (let i = 0; i < clList.length; i++) {
        let client = clList[i];
        if (client.url.endsWith(urlToOpen) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

