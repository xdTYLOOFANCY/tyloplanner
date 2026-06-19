// Clean up Service Worker and caches when on login page to avoid caching redirects/login pages
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for (let r of registrations) {
      r.unregister();
    }
  });
}
if ('caches' in window) {
  caches.keys().then(function(keys) {
    keys.forEach(function(key) {
      caches.delete(key);
    });
  });
}

var p = new URLSearchParams(location.search);
if (p.get("step") === "2fa") {
  document.getElementById("formPw").style.display = "none";
  document.getElementById("form2fa").style.display = "flex";
  document.querySelector("#form2fa input[name=code]").focus();
  if (p.get("error")) document.getElementById("tfaError").style.display = "block";
} else if (p.get("error")) {
  document.getElementById("loginError").style.display = "block";
}

