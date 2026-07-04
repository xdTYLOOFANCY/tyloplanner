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
  const errMap = {
    "oauth_failed": "OAuth login failed. Please try again.",
    "oauth_unauthorized": "This OAuth account is not linked to TyloPlanner.",
    "1": "Wrong username or password."
  };
  document.getElementById("loginError").textContent = errMap[p.get("error")] || errMap["1"];
  document.getElementById("loginError").style.display = "block";
}

// Fetch OAuth providers
fetch('/api/auth/providers')
  .then(res => res.json())
  .then(data => {
    if (data.providers && data.providers.length > 0) {
      const container = document.getElementById('oauthContainer');
      const divider = document.getElementById('dividerOr');
      container.style.display = 'block';
      divider.style.display = 'block';
      
      // prioritize GitHub if both are present
      const sortedProviders = data.providers.sort((a, b) => a === 'github' ? -1 : 1);
      
      sortedProviders.forEach(provider => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.style.marginBottom = '8px';
        btn.style.backgroundColor = provider === 'github' ? '#24292e' : '#ffffff';
        btn.style.color = provider === 'github' ? '#fff' : '#000';
        btn.textContent = `Sign in with ${provider === 'github' ? 'GitHub' : 'Google'}`;
        
        btn.addEventListener('click', async () => {
          try {
            const res = await fetch('/api/oauth/init', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: provider, action: 'login' })
            });
            const data = await res.json();
            if (data.url) {
              window.location.href = data.url;
            } else {
              document.getElementById('loginError').textContent = data.error || 'OAuth failed';
              document.getElementById('loginError').style.display = 'block';
            }
          } catch (e) {
            document.getElementById('loginError').textContent = 'Network error.';
            document.getElementById('loginError').style.display = 'block';
          }
        });
        
        container.appendChild(btn);
      });
    }
  });
