// First-run account setup. Mirrors login.js: clean up any service worker and
// caches so a previously cached app shell can't shadow the setup flow.
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

document.getElementById("formSetup").addEventListener("submit", async function(e) {
  e.preventDefault();
  var err = document.getElementById("setupError");
  var username = this.username.value.trim();
  var password = this.password.value;
  var password2 = this.password2.value;

  function fail(msg) {
    err.textContent = msg;
    err.style.display = "block";
  }
  err.style.display = "none";

  if (!username) return fail("Pick a username.");
  if (password.length < 4) return fail("Password must be at least 4 characters.");
  if (password !== password2) return fail("Passwords don't match.");

  var btn = this.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    var res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ username: username, password: password })
    });
    var data = await res.json();
    if (res.ok && data.ok) {
      window.location.href = "/";
    } else {
      fail(data.error || "Setup failed, please try again.");
      btn.disabled = false;
    }
  } catch (ex) {
    fail("Network error, please try again.");
    btn.disabled = false;
  }
});
