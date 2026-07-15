// TyloPlanner — QR code generator: turn any text/link into a scannable QR.
// Uses vendored qrcode-generator (global `qrcode`, loaded via script tag).
// QR data is self-contained — the code IS the link, so it never expires.

var dlg = null, inputEl = null, canvas = null, dlBtn = null, copyBtn = null, statusEl = null;
var libPromise = null;

// Lazy-load the ~57KB encoder on first use (mirrors ensureQuill in notes.js).
function ensureLib() {
  if (window.qrcode) return Promise.resolve();
  if (!libPromise) {
    libPromise = new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = 'js/qrcode.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

// QR must stay black-on-white regardless of app theme, or scanners fail.
function draw(text) {
  if (!text) { canvas.width = canvas.height = 0; dlBtn.disabled = copyBtn.disabled = true; return; }
  var qr = qrcode(0, 'M');           // 0 = auto-size, M = ~15% error correction
  qr.addData(text);
  qr.make();
  var count = qr.getModuleCount(), cell = 8, margin = 4;
  var size = (count + margin * 2) * cell;
  canvas.width = canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (var r = 0; r < count; r++)
    for (var c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  dlBtn.disabled = copyBtn.disabled = false;
}

function update() {
  if (!window.qrcode) return;   // still loading; open handler re-runs this on load
  statusEl.textContent = '';
  try { draw(inputEl.value.trim()); }
  catch (e) { statusEl.textContent = 'Text too long for a QR code.'; canvas.width = canvas.height = 0; dlBtn.disabled = copyBtn.disabled = true; }
}

function download() {
  var a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'qrcode.png';
  a.click();
}

function copy() {
  if (!navigator.clipboard || !window.ClipboardItem) { statusEl.textContent = 'Copy not supported — use Download.'; return; }
  canvas.toBlob(function(blob) {
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(function() { statusEl.textContent = 'Copied to clipboard.'; })
      .catch(function() { statusEl.textContent = 'Copy failed — use Download.'; });
  });
}

export function openQrModal(prefill) {
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.id = 'qrModal';
    dlg.innerHTML = '<div class="modal-content" style="max-width:360px;width:90%">' +
      '<h3 tabindex="-1" autofocus style="margin-bottom:16px;font-size:16px;font-weight:700;outline:none">QR code</h3>' +
      '<input id="qrInput" placeholder="Paste a link or any text…" autocomplete="off" style="width:100%;padding:8px 10px;font-size:14px;box-sizing:border-box">' +
      '<div style="display:flex;justify-content:center;margin:16px 0;min-height:40px">' +
        '<canvas id="qrCanvas" style="max-width:100%;height:auto;border-radius:6px"></canvas></div>' +
      '<div id="qrStatus" class="muted" style="font-size:12px;text-align:center;min-height:16px"></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">' +
        '<button class="btn ghost" onclick="this.closest(\'dialog\').close()">Close</button>' +
        '<button class="btn ghost" id="qrCopy">Copy</button>' +
        '<button class="btn" id="qrDownload">Download PNG</button>' +
      '</div></div>';
    document.body.appendChild(dlg);
    inputEl = dlg.querySelector('#qrInput');
    canvas = dlg.querySelector('#qrCanvas');
    statusEl = dlg.querySelector('#qrStatus');
    dlBtn = dlg.querySelector('#qrDownload');
    copyBtn = dlg.querySelector('#qrCopy');
    inputEl.addEventListener('input', update);
    dlBtn.addEventListener('click', download);
    copyBtn.addEventListener('click', copy);
    dlg.addEventListener('click', function(e) { if (e.target === dlg) dlg.close(); });
  }
  inputEl.value = prefill || '';
  statusEl.textContent = 'Loading…';
  dlg.showModal();
  inputEl.focus();
  ensureLib().then(update).catch(function() { statusEl.textContent = 'Could not load QR generator.'; });
}
