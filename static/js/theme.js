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
  }
}

export function applyThemeStyle(style) {
  document.documentElement.setAttribute("data-theme-style", style || "default");
  window.dispatchEvent(new CustomEvent("theme-changed"));
}

export function applyThemeStyleFromSettings(set) {
  var style = (set && set.app_theme_style) ? set.app_theme_style : "default";
  applyThemeStyle(style);
}

