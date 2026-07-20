// TyloPlanner — theme (dark/light) toggle.

export function applyTheme() {
  document.documentElement.setAttribute("data-theme", localStorage.getItem("tylo-theme") || "dark");
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

export function toggleTheme() {
  localStorage.setItem("tylo-theme", (localStorage.getItem("tylo-theme") || "dark") === "dark" ? "light" : "dark");
  applyTheme();
}

export function applyAccent(hexColor) {
  if (!hexColor || !/^#[0-9a-fA-F]{6}$/.test(hexColor)) return;
  document.documentElement.style.setProperty('--accent', hexColor);

  var r = parseInt(hexColor.slice(1, 3), 16) / 255;
  var g = parseInt(hexColor.slice(3, 5), 16) / 255;
  var b = parseInt(hexColor.slice(5, 7), 16) / 255;

  // Themes paint glows/tints with rgba(var(--accent-rgb), …) — keep it in
  // sync or a custom accent leaves them on the theme's original color.
  document.documentElement.style.setProperty('--accent-rgb',
    Math.round(r * 255) + ', ' + Math.round(g * 255) + ', ' + Math.round(b * 255));

  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  var hDeg = (h * 360 + 20) % 360;
  var hNorm = hDeg / 360;
  var r2, g2, b2;

  if (s === 0) {
    r2 = g2 = b2 = l;
  } else {
    var hue2rgb = function(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r2 = hue2rgb(p, q, hNorm + 1/3);
    g2 = hue2rgb(p, q, hNorm);
    b2 = hue2rgb(p, q, hNorm - 1/3);
  }

  var toHex = function(x) {
    var hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  var hex2 = '#' + toHex(r2) + toHex(g2) + toHex(b2);

  document.documentElement.style.setProperty('--accent2', hex2);
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

export function applyAccentFromSettings(set) {
  if (set && set.accent_color) {
    applyAccent(set.accent_color);
  } else {
    // No custom accent saved: drop the inline overrides so the active
    // theme's own accent shows (also un-sticks other devices after a reset).
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent2');
    document.documentElement.style.removeProperty('--accent-rgb');
  }
}

export function applyThemeStyle(style) {
  var v = style || "default";
  document.documentElement.setAttribute("data-theme-style", v);
  // Cache for the pre-paint boot script in index.html (avoids theme flash),
  // and as this device's own choice — theme style is per-device.
  try { localStorage.setItem("tylo-theme-style", v); } catch (e) {}
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

export function applyThemeStyleFromSettings(set) {
  // Per-device: a theme picked on this device (localStorage) wins over the
  // synced server setting, so phone and desktop can each run their own theme.
  // The server value is only the default for devices that never chose one.
  var local = null;
  try { local = localStorage.getItem("tylo-theme-style"); } catch (e) {}
  applyThemeStyle(local || (set && set.app_theme_style) || "default");
}

export function applyNavLayout(layout) {
  var v = (layout === "sidebar") ? "sidebar" : "topbar";
  document.documentElement.setAttribute("data-nav-layout", v);
  document.body.setAttribute("data-nav-layout", v);
  // Cache for the pre-paint boot script in index.html (avoids layout flash).
  try { localStorage.setItem("tylo-nav-layout", v); } catch (e) {}
}

export function applyNavLayoutFromSettings(set) {
  applyNavLayout(set && set.nav_layout === "sidebar" ? "sidebar" : "topbar");
}

