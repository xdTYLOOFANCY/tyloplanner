// TyloPlanner — font table.
//
// One source of truth for everything font-related: the Notes toolbar font
// picker (Quill's whitelist *and* the CSS classes it writes), the default
// app/notes font settings, and the .doc/.html export style maps. Duplicating a
// stack in CSS and JS is how these drift, so the CSS is generated from here.
//
// Every stack is system-installed — the only webfont the app ships is Inter.
// id "" is the built-in default (no class in Quill, no CSS var override).

export var FONTS = [
  { id: "",          label: "Default",    stack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { id: "system",    label: "System UI",  stack: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "arial",     label: "Arial",      stack: "Arial, Helvetica, sans-serif" },
  { id: "helvetica", label: "Helvetica",  stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: "verdana",   label: "Verdana",    stack: "Verdana, Geneva, sans-serif" },
  { id: "tahoma",    label: "Tahoma",     stack: "Tahoma, Verdana, sans-serif" },
  { id: "trebuchet", label: "Trebuchet",  stack: "'Trebuchet MS', 'Lucida Grande', sans-serif" },
  // "serif"/"monospace" are Quill's own built-in ids — keep them so notes
  // written before this table still render with the font they were saved with.
  { id: "serif",     label: "Georgia",    stack: "Georgia, 'Times New Roman', serif" },
  { id: "times",     label: "Times",      stack: "'Times New Roman', Times, serif" },
  { id: "garamond",  label: "Garamond",   stack: "Garamond, 'Apple Garamond', 'Times New Roman', serif" },
  { id: "palatino",  label: "Palatino",   stack: "'Palatino Linotype', Palatino, 'Book Antiqua', serif" },
  { id: "monospace", label: "Monospace",  stack: "SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace" },
  { id: "courier",   label: "Courier",    stack: "'Courier New', Courier, monospace" },
  { id: "comic",     label: "Comic Sans", stack: "'Comic Sans MS', 'Comic Sans', cursive" },
  { id: "impact",    label: "Impact",     stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" }
];

export function fontStack(id) {
  for (var i = 0; i < FONTS.length; i++) {
    if (FONTS[i].id === id) return FONTS[i].stack;
  }
  return "";
}

// Quill writes class="ql-font-<id>" and labels the picker entries with CSS
// ::before content, so both need one rule per font. The default entry's rule
// comes first so the per-value rules override it.
export function fontCss() {
  return FONTS.map(function(f) {
    var sel = f.id
      ? '.ql-snow .ql-picker.ql-font .ql-picker-label[data-value="' + f.id + '"]::before,' +
        '.ql-snow .ql-picker.ql-font .ql-picker-item[data-value="' + f.id + '"]::before'
      : '.ql-snow .ql-picker.ql-font .ql-picker-label::before,' +
        '.ql-snow .ql-picker.ql-font .ql-picker-item::before';
    var css = sel + '{content:"' + f.label + '";font-family:' + f.stack + '}';
    if (f.id) css += '\n.ql-font-' + f.id + ',.ql-editor .ql-font-' + f.id + '{font-family:' + f.stack + '}';
    return css;
  }).join("\n");
}

export function injectFontCss() {
  if (document.getElementById("tyloFontCss")) return;
  var el = document.createElement("style");
  el.id = "tyloFontCss";
  el.textContent = fontCss();
  // Appended to <head> after quill.snow.css and style.css, so these win.
  document.head.appendChild(el);
}

// --- default app / notes font (settings) ---
// Both are plain CSS variables; --note-font falls back to --app-font in
// style.css, so "app font only" needs no extra wiring.
function setFontVar(name, cacheKey, id) {
  var stack = id ? fontStack(id) : "";
  if (stack) document.documentElement.style.setProperty(name, stack);
  else document.documentElement.style.removeProperty(name);
  // Cached for the pre-paint boot script in index.html (avoids a font swap
  // flash on every load). It re-validates the value before applying it.
  try { localStorage.setItem(cacheKey, stack); } catch (e) {}
}

export function applyFonts(appFont, noteFont) {
  setFontVar("--app-font", "tylo-app-font", appFont);
  setFontVar("--note-font", "tylo-note-font", noteFont);
}

export function applyFontsFromSettings(set) {
  applyFonts(set && set.app_font, set && set.notes_font);
}
