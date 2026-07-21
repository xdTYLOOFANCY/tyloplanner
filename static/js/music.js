// TyloPlanner — Music tab: local media player.
// Spotify-style layout: a left "Your Library" sidebar (Songs / Recently added /
// playlists), a center content pane (colored hero + track list), and a right
// Queue panel (Now playing + Next up). A persistent bottom player bar, Media
// Session (lock-screen) controls, offline downloads, and a pop-out window all
// hang off the same playback engine below.
//
// Streaming goes through the existing /api/files/<id>/view endpoint; the
// service worker's media cache (tylo-media-v1) serves it cache-first, so
// "download for offline" is simply a deliberate Cache API put — no separate
// IndexedDB blob store needed.
"use strict";

import { S, SET, safeRender, tabNeedsRender } from './state.js';
import { api, esc, toast, showContextMenu, askPrompt, askConfirm, debounce } from './utils.js';

const MEDIA_CACHE = 'tylo-media-v1';

// ---------- playback state ----------
const audio = new Audio();
audio.preload = 'metadata';

let queue = [];          // file ids
let qIndex = -1;
let playSource = null;   // where playback started: {type:'library'} | {type:'playlist', id}
let repeat = 'off';      // off | all | one
let shuffle = false;
let unshuffled = null;   // queue order before shuffle was enabled
let view = { kind: 'songs' }; // songs | recent | {kind:'playlist', id}
let sortBy = 'title';    // title | artist | date | duration  (Songs view only)
let searchTerm = '';
let libOpen = false;     // narrow-width: left drawer open
let queueOpen = false;   // narrow-width: right drawer open
let dragging = false;    // suppress re-render mid-drag (live-sync guard)
let seekHeld = false;    // suppress seek-slider updates while user drags it
let scanRequested = false;
let settingsInit = false;
let offlineIds = new Set();

// Inline SVGs reused across the hero + rows.
const SVG_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="4.5" height="16" rx="1"/><rect x="14.5" y="4" width="4.5" height="16" rx="1"/></svg>';
const SVG_SHUFFLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>';
const SVG_PLAY_SM = '<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
const EQ_BARS = '<i></i><i></i><i></i>';

// ---------- helpers ----------
function audioFiles() {
  return ((S && S.files) || []).filter(function(f) {
    return (f.mimetype || '').startsWith('audio/') && !f.deleted;
  });
}
function trackById(id) {
  return audioFiles().find(function(f) { return f.id === id; });
}
function trackTitle(f) {
  return f.audio_title || (f.filename || '').replace(/\.[^.]+$/, '') || 'Untitled';
}
function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  s = Math.round(s);
  return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
}
function fmtTimeLong(s) {
  s = Math.round(s || 0);
  var h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  if (h) return h + ' hr ' + m + ' min';
  return Math.max(1, m) + ' min';
}
function viewUrl(fid) { return '/api/files/' + fid + '/view'; }
function artUrl(fid) { return '/api/files/' + fid + '/art'; }

function persistSetting(patch) {
  api('POST', '/api/settings', patch).catch(function() {});
  if (SET) Object.assign(SET, patch);
}
const persistVolume = debounce(function(v) { persistSetting({ music_volume: String(v) }); }, 500);

function ensureInit() {
  if (settingsInit || !SET) return;
  settingsInit = true;
  var v = parseFloat(SET.music_volume);
  if (isFinite(v) && v >= 0 && v <= 1) audio.volume = v;
  repeat = (SET.music_repeat === 'all' || SET.music_repeat === 'one') ? SET.music_repeat : 'off';
  shuffle = SET.music_shuffle === '1';
  var vol = document.getElementById('playerVolume');
  if (vol) vol.value = audio.volume;
  updateModeButtons();
  refreshOfflineIds();
}

async function refreshOfflineIds() {
  try {
    var cache = await caches.open(MEDIA_CACHE);
    var keys = await cache.keys();
    offlineIds = new Set();
    keys.forEach(function(req) {
      var m = new URL(req.url).pathname.match(/^\/api\/files\/([^/]+)\/view$/);
      if (m) offlineIds.add(m[1]);
    });
    // First render races this async scan — repaint so offline badges show.
    if (offlineIds.size && !dragging) renderMusic();
  } catch (e) { /* Cache API unavailable (e.g. non-secure context) */ }
}

// ---------- playback engine ----------
async function playFile(fid) {
  var f = trackById(fid);
  if (!f) return;
  audio.src = viewUrl(fid);
  try { await audio.play(); } catch (e) { /* autoplay rejection / decode error */ }
  updatePlayerBar(f);
  updateMediaSession(f);
  updateNowPlayingHighlight();
}

export function playTrack(fid, listIds, source) {
  ensureInit();
  playSource = source || { type: 'library' };
  queue = listIds ? listIds.slice() : viewTrackIds();
  if (queue.indexOf(fid) === -1) queue = [fid];
  if (shuffle) {
    unshuffled = queue.slice();
    shuffleArray(queue);
    // keep the chosen track first so playback starts where the user clicked
    queue.splice(queue.indexOf(fid), 1);
    queue.unshift(fid);
  }
  qIndex = queue.indexOf(fid);
  playFile(fid);
  renderHero();
  renderQueuePanel();
}

export function playerToggle() {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(function() {}); else audio.pause();
}

export function playerNext() { advance(1, true); }
export function playerPrev() {
  // Standard behavior: restart the track unless we're near its start.
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  advance(-1, true);
}

function advance(dir, manual) {
  if (!queue.length) return;
  var next = qIndex + dir;
  if (next >= queue.length) {
    if (repeat === 'all' || manual) next = 0;
    else { audio.pause(); return; }
  }
  if (next < 0) next = queue.length - 1;
  qIndex = next;
  playFile(queue[qIndex]);
  renderQueuePanel();
}

export function playerSeekTo(val) {
  if (audio.duration) audio.currentTime = (val / 1000) * audio.duration;
}

export function playerSetVolume(val) {
  audio.volume = parseFloat(val);
  persistVolume(val);
}

export function toggleShuffle() {
  ensureInit();
  shuffle = !shuffle;
  if (shuffle) {
    unshuffled = queue.slice();
    var current = queue[qIndex];
    shuffleArray(queue);
    if (current) {
      queue.splice(queue.indexOf(current), 1);
      queue.unshift(current);
      qIndex = 0;
    }
  } else if (unshuffled) {
    var cur = queue[qIndex];
    queue = unshuffled;
    unshuffled = null;
    qIndex = Math.max(0, queue.indexOf(cur));
  }
  persistSetting({ music_shuffle: shuffle ? '1' : '0' });
  updateModeButtons();
  renderHero();
  renderQueuePanel();
}

export function cycleRepeat() {
  ensureInit();
  repeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
  persistSetting({ music_repeat: repeat });
  updateModeButtons();
}

export function playerClose() {
  audio.pause();
  audio.removeAttribute('src');
  queue = []; qIndex = -1;
  document.getElementById('musicPlayerBar').style.display = 'none';
  document.body.classList.remove('has-player');
  updateNowPlayingHighlight();
  renderHero();
  renderQueuePanel();
}

function shuffleArray(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
}

// ---------- audio element events ----------
audio.addEventListener('timeupdate', function() {
  var t = document.getElementById('playerTime');
  if (t) t.textContent = fmtTime(audio.currentTime);
  var seek = document.getElementById('playerSeek');
  if (seek && !seekHeld && audio.duration) {
    seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
  }
  if ('mediaSession' in navigator && audio.duration) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration, position: audio.currentTime, playbackRate: audio.playbackRate
      });
    } catch (e) {}
  }
});
audio.addEventListener('loadedmetadata', function() {
  var d = document.getElementById('playerDuration');
  if (d) d.textContent = fmtTime(audio.duration);
});
audio.addEventListener('play', function() { setPlayIcon(true); });
audio.addEventListener('pause', function() { setPlayIcon(false); });
audio.addEventListener('ended', function() {
  if (repeat === 'one') { audio.currentTime = 0; audio.play().catch(function() {}); return; }
  advance(1, false);
});
audio.addEventListener('error', function() {
  if (audio.src && queue.length > 1) { toast('Could not play track — skipping'); advance(1, false); }
});

function setPlayIcon(playing) {
  var p = document.getElementById('playerPlayIcon'), q = document.getElementById('playerPauseIcon');
  if (p) p.style.display = playing ? 'none' : '';
  if (q) q.style.display = playing ? '' : 'none';
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  renderHeroPlayIcon();
}

function updatePlayerBar(f) {
  var bar = document.getElementById('musicPlayerBar');
  bar.style.display = 'grid';
  document.body.classList.add('has-player');
  document.getElementById('playerTitle').textContent = trackTitle(f);
  document.getElementById('playerArtist').textContent = f.audio_artist || '';
  var art = document.getElementById('playerArt');
  art.classList.remove('art-fade');
  void art.offsetWidth; // restart the crossfade animation
  art.classList.add('art-fade');
  art.src = artUrl(f.id);
  document.getElementById('playerDuration').textContent = fmtTime(f.duration);
}

function updateModeButtons() {
  var sh = document.getElementById('playerShuffle');
  if (sh) sh.classList.toggle('mode-on', shuffle);
  var rp = document.getElementById('playerRepeat');
  if (rp) rp.classList.toggle('mode-on', repeat !== 'off');
  var one = document.getElementById('playerRepeatOne');
  if (one) one.style.display = repeat === 'one' ? '' : 'none';
}

function currentFileId() { return qIndex > -1 ? queue[qIndex] : null; }

function updateNowPlayingHighlight() {
  var cur = currentFileId();
  document.querySelectorAll('#tab-music .mtrack, #tab-music .mqtrack').forEach(function(el) {
    var on = !!cur && el.dataset.fid === cur;
    el.classList.toggle('now-playing', on && !audio.paused);
    el.classList.toggle('is-current', on);
  });
}
audio.addEventListener('play', updateNowPlayingHighlight);
audio.addEventListener('pause', updateNowPlayingHighlight);

// Keep just the hero's big play/pause glyph in sync without a full re-render.
function renderHeroPlayIcon() {
  var btn = document.getElementById('heroPlayBtn');
  if (btn) btn.innerHTML = isPlayingThisView() ? SVG_PAUSE : SVG_PLAY;
}

// ---------- Media Session (lock-screen controls) ----------
function updateMediaSession(f) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackTitle(f),
      artist: f.audio_artist || '',
      album: f.audio_album || '',
      artwork: [{ src: artUrl(f.id), sizes: '512x512', type: 'image/jpeg' }]
    });
  } catch (e) {}
}
if ('mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('play', function() { audio.play().catch(function() {}); });
    navigator.mediaSession.setActionHandler('pause', function() { audio.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', function() { playerPrev(); });
    navigator.mediaSession.setActionHandler('nexttrack', function() { playerNext(); });
    navigator.mediaSession.setActionHandler('seekto', function(d) {
      if (d.seekTime != null) audio.currentTime = d.seekTime;
    });
  } catch (e) {}
}

// ---------- offline downloads (Cache API, shared with the SW media cache) ----------
async function downloadForOffline(fid) {
  try {
    var cache = await caches.open(MEDIA_CACHE);
    toast('Downloading for offline…');
    var resp = await fetch(viewUrl(fid));
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    await cache.put(viewUrl(fid), resp);
    offlineIds.add(fid);
    toast('Available offline');
    renderMusic();
  } catch (e) {
    toast('Download failed: ' + e.message);
  }
}

async function removeOffline(fid) {
  try {
    var cache = await caches.open(MEDIA_CACHE);
    await cache.delete(viewUrl(fid));
    offlineIds.delete(fid);
    toast('Offline copy removed');
    renderMusic();
  } catch (e) {}
}

async function renderStorageInfo() {
  var el = document.getElementById('musicStorageInfo');
  if (!el) return;
  var n = 0;
  audioFiles().forEach(function(f) { if (offlineIds.has(f.id)) n++; });
  var text = n + ' track' + (n === 1 ? '' : 's') + ' offline';
  if (navigator.storage && navigator.storage.estimate) {
    try {
      var est = await navigator.storage.estimate();
      text += ' · ' + (est.usage / 1048576).toFixed(0) + ' MB used';
    } catch (e) {}
  }
  el.textContent = text;
}

// ---------- the active view's track rows ----------
function cmpFor(s) {
  return {
    title:    function(a, b) { return trackTitle(a).localeCompare(trackTitle(b)); },
    artist:   function(a, b) { return (a.audio_artist || '~').localeCompare(b.audio_artist || '~'); },
    date:     function(a, b) { return (b.uploaded || 0) - (a.uploaded || 0); },
    duration: function(a, b) { return (a.duration || 0) - (b.duration || 0); }
  }[s] || function() { return 0; };
}

// Rows for whatever the sidebar currently selects, after search + sort.
// Returns [{ f, ptId? }] — ptId is the playlist_track row id (for "remove").
function currentViewRows() {
  var rows;
  if (view.kind === 'playlist') {
    rows = playlistTracks(view.id).map(function(t) {
      var f = trackById(t.file_id);
      return f ? { f: f, ptId: t.id } : null;
    }).filter(Boolean);
  } else {
    rows = audioFiles().map(function(f) { return { f: f }; });
  }
  if (searchTerm) {
    var q = searchTerm.toLowerCase();
    rows = rows.filter(function(r) {
      var f = r.f;
      return (trackTitle(f) + ' ' + (f.audio_artist || '') + ' ' + (f.audio_album || '') + ' ' + (f.filename || ''))
        .toLowerCase().indexOf(q) > -1;
    });
  }
  if (view.kind === 'recent') rows.sort(function(a, b) { return (b.f.uploaded || 0) - (a.f.uploaded || 0); });
  else if (view.kind === 'songs') rows.sort(function(a, b) { return cmpFor(sortBy)(a.f, b.f); });
  // playlist view keeps the user's own drag order
  return rows;
}
function viewTrackIds() { return currentViewRows().map(function(r) { return r.f.id; }); }
function viewSource() { return view.kind === 'playlist' ? { type: 'playlist', id: view.id } : { type: 'library' }; }

// Is the current view the one that's actively playing? (songs + recent share
// the 'library' source, so the hero on both reads as playing — close enough.)
function isPlayingThisView() {
  if (!audio.src || audio.paused || !playSource) return false;
  var src = viewSource();
  return (src.type === 'library' && playSource.type === 'library') ||
         (src.type === 'playlist' && playSource.type === 'playlist' && playSource.id === src.id);
}

// ---------- left: Your Library sidebar ----------
function playlistTracks(pid) {
  return ((S && S.playlist_tracks) || [])
    .filter(function(t) { return t.playlist_id === pid; })
    .sort(function(a, b) { return (a.position || 0) - (b.position || 0); });
}
function coverFor(pid) {
  var t = playlistTracks(pid)[0];
  return t ? artUrl(t.file_id) : null;
}

function navItemHtml(kind, id, icon, label, sub) {
  var active = view.kind === kind && (kind !== 'playlist' || view.id === id);
  var iconHtml = (typeof icon === 'string' && icon.indexOf('/api/') === 0)
    ? '<img class="mni-cover" loading="lazy" src="' + icon + '" alt="">'
    : '<span class="mni-emoji">' + icon + '</span>';
  var onclick = kind === 'playlist'
    ? "musicSetView('playlist','" + esc(id) + "')"
    : "musicSetView('" + kind + "')";
  var ctx = kind === 'playlist' ? ' oncontextmenu="musicPlaylistMenu(event,\'' + esc(id) + '\')"' : '';
  return '<button class="music-nav-item' + (active ? ' active' : '') + '" onclick="' + onclick + '"' + ctx + '>' +
    iconHtml +
    '<span class="mni-main"><span class="mni-label">' + label + '</span>' +
      (sub ? '<span class="mni-sub">' + sub + '</span>' : '') + '</span>' +
    (kind === 'playlist'
      ? '<span class="mni-menu" onclick="event.stopPropagation();musicPlaylistMenu(event,\'' + esc(id) + '\')" title="More" aria-label="Playlist options">⋯</span>'
      : '') +
  '</button>';
}

function renderSidebar() {
  var nav = document.getElementById('musicNav');
  if (!nav) return;
  var pls = ((S && S.playlists) || []).slice().sort(function(a, b) { return (a.name || '').localeCompare(b.name || ''); });
  var songs = audioFiles().length;
  var h = navItemHtml('songs', null, '♥', 'Songs', songs + ' song' + (songs === 1 ? '' : 's')) +
          navItemHtml('recent', null, '🕒', 'Recently added', null) +
          '<div class="music-nav-label">Playlists</div>';
  if (!pls.length) {
    h += '<div class="music-nav-empty muted">No playlists yet. Tap + to create one.</div>';
  } else {
    h += pls.map(function(p) {
      var n = playlistTracks(p.id).length;
      var cover = coverFor(p.id);
      return navItemHtml('playlist', p.id, cover || '♪', esc(p.name), n + ' track' + (n === 1 ? '' : 's'));
    }).join('');
  }
  nav.innerHTML = h;
}

// ---------- center: hero + track list ----------
function heroColor() {
  if (view.kind === 'recent') return 'var(--green)';
  if (view.kind === 'playlist') return 'hsl(' + hashHue(view.id || '') + ' 55% 45%)';
  return 'var(--accent)';
}
function hashHue(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function renderHero() {
  var el = document.getElementById('musicHero');
  if (!el) return;
  var rows = currentViewRows();
  var n = rows.length;
  var total = rows.reduce(function(s, r) { return s + (r.f.duration || 0); }, 0);
  var color = heroColor();
  var eyebrow, title, coverHtml;

  if (view.kind === 'playlist') {
    var pl = ((S && S.playlists) || []).find(function(p) { return p.id === view.id; });
    if (!pl) { view = { kind: 'songs' }; return renderHero(); }
    eyebrow = 'PLAYLIST'; title = esc(pl.name);
    var t0 = playlistTracks(pl.id)[0];
    // Colored tile with the first track's art overlaid; on error the img drops
    // itself and the tile (with its ♪) shows through — no broken-image box.
    coverHtml = '<div class="hero-cover hero-cover-empty" style="background:' + coverGrad(color) + '">' +
      (t0 ? '<img class="hero-cover-art" src="' + artUrl(t0.file_id) + '" alt="" onerror="this.remove()">' : '♪') +
    '</div>';
  } else if (view.kind === 'recent') {
    eyebrow = 'LIBRARY'; title = 'Recently added';
    coverHtml = '<div class="hero-cover hero-cover-empty" style="background:' + coverGrad(color) + '">🕒</div>';
  } else {
    eyebrow = 'LIBRARY'; title = 'Songs';
    coverHtml = '<div class="hero-cover hero-cover-empty" style="background:' + coverGrad(color) + '">♥</div>';
  }

  var sub = n + ' song' + (n === 1 ? '' : 's') + (total ? ' · ' + fmtTimeLong(total) : '');
  el.style.background = 'linear-gradient(180deg, color-mix(in srgb, ' + color + ' 42%, var(--panel2)), var(--panel2) 82%)';
  el.innerHTML =
    '<div class="hero-cover-box">' + coverHtml + '</div>' +
    '<div class="hero-body">' +
      '<div class="hero-eyebrow">' + eyebrow + '</div>' +
      '<h1 class="hero-title">' + title + '</h1>' +
      '<div class="hero-sub">' + sub + '</div>' +
      '<div class="hero-actions">' +
        '<button id="heroPlayBtn" class="hero-play" onclick="musicHeroPlay()" title="Play" aria-label="Play">' +
          (isPlayingThisView() ? SVG_PAUSE : SVG_PLAY) + '</button>' +
        '<button class="hero-btn' + (shuffle ? ' on' : '') + '" onclick="musicHeroShuffle()" title="Shuffle" aria-label="Shuffle">' + SVG_SHUFFLE + '</button>' +
        (n ? '<button class="hero-btn" onclick="musicHeroMenu(event)" title="More" aria-label="More">⋯</button>' : '') +
      '</div>' +
    '</div>';
}
function coverGrad(color) {
  return 'linear-gradient(145deg, ' + color + ', color-mix(in srgb, ' + color + ' 45%, #000))';
}

function trackRowHtml(f, opts) {
  opts = opts || {};
  var cur = currentFileId() === f.id;
  return '<div class="mtrack' + (cur ? ' is-current' : '') + (cur && !audio.paused ? ' now-playing' : '') + '"' +
    ' data-fid="' + esc(f.id) + '"' +
    (opts.draggable ? ' draggable="true" data-idx="' + opts.idx + '"' : '') +
    ' onclick="musicTrackClick(\'' + esc(f.id) + '\',\'' + (opts.context || 'songs') + '\',' + (opts.idx != null ? opts.idx : -1) + ')"' +
    ' oncontextmenu="musicTrackMenu(event,\'' + esc(f.id) + '\'' + (opts.ptId ? ',\'' + esc(opts.ptId) + '\'' : '') + ')">' +
    '<div class="mtrack-idx">' +
      '<span class="idx-num">' + (opts.index || '') + '</span>' +
      '<span class="idx-play">' + SVG_PLAY_SM + '</span>' +
      '<span class="idx-eq">' + EQ_BARS + '</span>' +
    '</div>' +
    '<img class="mtrack-art" loading="lazy" src="' + artUrl(f.id) + '" alt="">' +
    '<div class="mtrack-info">' +
      '<div class="mtrack-title">' + esc(trackTitle(f)) + '</div>' +
      '<div class="mtrack-artist">' + esc(f.audio_artist || 'Unknown artist') + '</div>' +
    '</div>' +
    '<div class="mtrack-album">' + esc(f.audio_album || '') + '</div>' +
    '<span class="mtrack-offline">' + (offlineIds.has(f.id) ? '⤓' : '') + '</span>' +
    '<span class="mtrack-dur">' + fmtTime(f.duration) + '</span>' +
    '<button class="mtrack-menu" onclick="event.stopPropagation();musicTrackMenu(event,\'' + esc(f.id) + '\'' + (opts.ptId ? ',\'' + esc(opts.ptId) + '\'' : '') + ')" title="More" aria-label="Track options">⋯</button>' +
  '</div>';
}

function emptyMsg() {
  if (!audioFiles().length) {
    return 'No audio files yet. Upload MP3 / FLAC / WAV / OGG files in the <b>Files</b> tab and they\'ll show up here.';
  }
  if (searchTerm) return 'No songs match “' + esc(searchTerm) + '”.';
  if (view.kind === 'playlist') return 'This playlist is empty. Right-click a song in the library and choose “Add to playlist”.';
  return 'Nothing here yet.';
}

function renderTracklist() {
  var head = document.getElementById('mtracklistHead');
  var list = document.getElementById('musicTracklist');
  if (!list) return;
  var rows = currentViewRows();
  if (head) head.style.display = rows.length ? '' : 'none';
  if (!rows.length) { list.innerHTML = '<div class="music-empty">' + emptyMsg() + '</div>'; return; }

  var draggable = view.kind === 'playlist' && !searchTerm;
  list.innerHTML = rows.map(function(r, i) {
    return trackRowHtml(r.f, { index: i + 1, context: view.kind, ptId: r.ptId, draggable: draggable, idx: i });
  }).join('');
  if (draggable) {
    wireReorder(list, function(order) { reorderPlaylist(order); });
  }
}

function reorderPlaylist(order) {
  var ids = playlistTracks(view.id).map(function(t) { return t.id; });
  var newIds = order.map(function(i) { return ids[i]; });
  // optimistic local update so the re-render doesn't snap back
  newIds.forEach(function(tid, pos) {
    var row = (S.playlist_tracks || []).find(function(t) { return t.id === tid; });
    if (row) row.position = pos;
  });
  api('POST', '/api/playlists/' + view.id + '/reorder', { tracks: newIds })
    .catch(function() { toast('Reorder failed'); })
    .then(function() { renderMusic(); });
}

// ---------- right: Queue panel (Now playing + Next up) ----------
function playSourceLabel() {
  if (!playSource) return '';
  if (playSource.type === 'playlist') {
    var p = ((S && S.playlists) || []).find(function(x) { return x.id === playSource.id; });
    return p ? esc(p.name) : '';
  }
  return 'your library';
}

function queueRowHtml(f, absIdx, localIdx, isCurrent, draggable) {
  return '<div class="mqtrack' + (isCurrent ? ' is-current' : '') + (isCurrent && !audio.paused ? ' now-playing' : '') + '"' +
    ' data-fid="' + esc(f.id) + '"' +
    (draggable ? ' draggable="true" data-idx="' + localIdx + '"' : '') +
    ' onclick="musicTrackClick(\'' + esc(f.id) + '\',\'queue\',' + absIdx + ')"' +
    ' oncontextmenu="musicTrackMenu(event,\'' + esc(f.id) + '\')">' +
    '<img class="mqtrack-art" loading="lazy" src="' + artUrl(f.id) + '" alt="">' +
    '<div class="mqtrack-info">' +
      '<div class="mtrack-title">' + esc(trackTitle(f)) + '</div>' +
      '<div class="mtrack-artist">' + esc(f.audio_artist || 'Unknown artist') + '</div>' +
    '</div>' +
    (isCurrent
      ? '<span class="mqtrack-eq">' + EQ_BARS + '</span>'
      : '<button class="mtrack-menu" onclick="event.stopPropagation();musicTrackMenu(event,\'' + esc(f.id) + '\')" title="More" aria-label="Track options">⋯</button>') +
  '</div>';
}

function renderQueuePanel() {
  var el = document.getElementById('musicQueuePanel');
  if (!el) return;
  var cur = currentFileId();
  var h = '<div class="mqueue-head"><span class="mqueue-title">Queue</span>' +
    (queue.length ? '<button class="mqueue-clear" onclick="musicClearQueue()">Clear</button>' : '') + '</div>';

  if (qIndex < 0 || !cur) {
    h += '<div class="music-empty small">Nothing playing yet. Pick a song and it\'ll queue up here.</div>';
    el.innerHTML = h;
    return;
  }

  var curF = trackById(cur);
  h += '<div class="mqueue-sec-label">Now playing</div>';
  h += curF ? queueRowHtml(curF, qIndex, -1, true, false) : '';

  var upNext = [];
  for (var i = qIndex + 1; i < queue.length; i++) {
    var f = trackById(queue[i]);
    if (f) upNext.push({ f: f, idx: i });
  }
  var srcLabel = playSourceLabel();
  h += '<div class="mqueue-sec-label">Next up' + (srcLabel ? ' <span class="mqueue-source">from ' + srcLabel + '</span>' : '') + '</div>';
  if (!upNext.length) {
    h += '<div class="music-empty small">End of queue.</div>';
  } else {
    h += '<div class="mqueue-list" data-reorder="queue">' +
      upNext.map(function(r, li) { return queueRowHtml(r.f, r.idx, li, false, true); }).join('') +
    '</div>';
  }
  el.innerHTML = h;

  var lst = el.querySelector('[data-reorder="queue"]');
  if (lst) {
    var base = qIndex;
    wireReorder(lst, function(order) {
      // order is a permutation over the LOCAL next-up rows; map back to the
      // absolute queue slots after the current track.
      var nextIds = queue.slice(base + 1);
      queue = queue.slice(0, base + 1).concat(order.map(function(i) { return nextIds[i]; }));
      renderMusic();
    });
  }
}

// ---------- drag-to-reorder (shared by playlist detail + queue panel) ----------
function wireReorder(container, onDrop) {
  if (!container) return;
  var fromIdx = null;
  container.querySelectorAll('[draggable="true"]').forEach(function(row) {
    row.addEventListener('dragstart', function(e) {
      dragging = true;
      fromIdx = parseInt(row.dataset.idx, 10);
      row.classList.add('drag-src');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', function() {
      dragging = false;
      row.classList.remove('drag-src');
      container.querySelectorAll('.drag-over').forEach(function(x) { x.classList.remove('drag-over'); });
      if (tabNeedsRender.music) renderMusic();
    });
    row.addEventListener('dragover', function(e) { e.preventDefault(); row.classList.add('drag-over'); });
    row.addEventListener('dragleave', function() { row.classList.remove('drag-over'); });
    row.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var toIdx = parseInt(row.dataset.idx, 10);
      if (fromIdx == null || fromIdx === toIdx) return;
      var order = [];
      for (var i = 0; i < container.children.length; i++) order.push(i);
      order.splice(toIdx, 0, order.splice(fromIdx, 1)[0]);
      dragging = false;
      onDrop(order);
    });
  });
}

// ---------- interactions ----------
function musicTrackClick(fid, context, idx) {
  ensureInit();
  if (context === 'queue') {
    qIndex = idx;
    playFile(fid);
    renderQueuePanel();
    return;
  }
  playTrack(fid, viewTrackIds(), viewSource());
}

function musicTrackMenu(ev, fid, ptId) {
  ensureInit();
  var items = [
    { label: 'Play', icon: '▶', onClick: function() { playTrack(fid, viewTrackIds(), viewSource()); } },
    { label: 'Play next', icon: '⏭', onClick: function() {
        if (!queue.length) { playTrack(fid, viewTrackIds(), viewSource()); return; }
        queue.splice(qIndex + 1, 0, fid);
        toast('Playing next');
        renderQueuePanel();
      } },
    { label: 'Add to queue', icon: '＋', onClick: function() {
        if (!queue.length) { playTrack(fid, viewTrackIds(), viewSource()); return; }
        queue.push(fid);
        toast('Added to queue');
        renderQueuePanel();
      } },
    { label: 'Add to playlist…', icon: '🎵', onClick: function() { addToPlaylistDialog(fid); } },
    { sep: true }
  ];
  if (offlineIds.has(fid)) {
    items.push({ label: 'Remove offline copy', icon: '⤓', onClick: function() { removeOffline(fid); } });
  } else {
    items.push({ label: 'Download for offline', icon: '⤓', onClick: function() { downloadForOffline(fid); } });
  }
  if (ptId) {
    items.push({ label: 'Remove from playlist', icon: '✕', danger: true, onClick: function() {
      api('DELETE', '/api/playlist_tracks/' + ptId).then(function() {
        if (window.refreshApp) window.refreshApp();
      });
    } });
  }
  showContextMenu(ev, items);
}

async function addToPlaylistDialog(fid) {
  var pls = (S && S.playlists) || [];
  var NEW = '__new__';
  var options = pls.map(function(p) { return { value: p.id, label: p.name }; });
  options.push({ value: NEW, label: '＋ New playlist…' });
  var choice = await askPrompt('Add to playlist', pls.length ? pls[0].id : NEW, { options: options, okText: 'Add' });
  if (choice == null) return;
  var pid = choice;
  if (choice === NEW) {
    var name = await askPrompt('New playlist name', '', { placeholder: 'My playlist' });
    if (!name) return;
    var res = await api('POST', '/api/playlists', { name: name });
    pid = res.id;
  }
  await api('POST', '/api/playlists/' + pid + '/add-tracks', { file_ids: [fid] });
  toast('Added to playlist');
  if (window.refreshApp) window.refreshApp();
}

async function musicNewPlaylist() {
  var name = await askPrompt('New playlist name', '', { placeholder: 'My playlist' });
  if (!name) return;
  var res = await api('POST', '/api/playlists', { name: name });
  if (res && res.id) view = { kind: 'playlist', id: res.id };
  if (window.refreshApp) window.refreshApp();
}

async function renamePlaylist(pid) {
  var pl = (S.playlists || []).find(function(p) { return p.id === pid; });
  var name = await askPrompt('Rename playlist', pl ? pl.name : '');
  if (!name) return;
  await api('PUT', '/api/playlists/' + pid, { name: name });
  if (window.refreshApp) window.refreshApp();
}

async function deletePlaylist(pid) {
  if (!(await askConfirm('Delete this playlist? Its tracks stay in your library.', { danger: true, okText: 'Delete' }))) return;
  await api('DELETE', '/api/playlists/' + pid);
  if (view.kind === 'playlist' && view.id === pid) view = { kind: 'songs' };
  if (window.refreshApp) window.refreshApp();
}

function musicPlaylistMenu(ev, pid) {
  showContextMenu(ev, [
    { label: 'Play', icon: '▶', onClick: function() { musicPlayPlaylist(pid); } },
    { label: 'Open', icon: '📂', onClick: function() { musicSetView('playlist', pid); } },
    { sep: true },
    { label: 'Rename', icon: '✏️', onClick: function() { renamePlaylist(pid); } },
    { label: 'Delete playlist', icon: '🗑', danger: true, onClick: function() { deletePlaylist(pid); } }
  ]);
}

function musicPlayPlaylist(pid) {
  var ids = playlistTracks(pid).map(function(t) { return t.file_id; })
    .filter(function(fid) { return !!trackById(fid); });
  if (!ids.length) return;
  playTrack(ids[0], ids, { type: 'playlist', id: pid });
}

// ---------- hero actions ----------
function musicHeroPlay() {
  ensureInit();
  if (isPlayingThisView()) { audio.pause(); return; }
  // Resume if we're paused on this exact context; otherwise start it fresh.
  var src = viewSource();
  var sameCtx = audio.src && playSource &&
    ((src.type === 'library' && playSource.type === 'library') ||
     (src.type === 'playlist' && playSource.type === 'playlist' && playSource.id === src.id));
  if (sameCtx) { audio.play().catch(function() {}); return; }
  var ids = viewTrackIds();
  if (ids.length) playTrack(ids[0], ids, src);
}

function musicHeroShuffle() {
  ensureInit();
  var ids = viewTrackIds();
  if (!ids.length) return;
  if (!shuffle) { shuffle = true; persistSetting({ music_shuffle: '1' }); updateModeButtons(); }
  var start = ids[Math.floor(Math.random() * ids.length)];
  playTrack(start, ids, viewSource());
}

function musicHeroMenu(ev) {
  var items = [
    { label: 'Play', icon: '▶', onClick: musicHeroPlay },
    { label: 'Shuffle play', icon: '🔀', onClick: musicHeroShuffle }
  ];
  if (view.kind === 'playlist') {
    items.push({ sep: true });
    items.push({ label: 'Rename', icon: '✏️', onClick: function() { renamePlaylist(view.id); } });
    items.push({ label: 'Delete playlist', icon: '🗑', danger: true, onClick: function() { deletePlaylist(view.id); } });
  }
  showContextMenu(ev, items);
}

// Click on the player bar's track info → jump to where playback started.
function playerJumpToSource() {
  if (qIndex < 0) return;
  var tabsBtn = document.querySelector('#tabs button[data-tab="music"]');
  if (tabsBtn && !tabsBtn.classList.contains('active')) tabsBtn.click();
  if (playSource && playSource.type === 'playlist' &&
      ((S && S.playlists) || []).some(function(p) { return p.id === playSource.id; })) {
    view = { kind: 'playlist', id: playSource.id };
  } else {
    view = { kind: 'songs' };
  }
  searchTerm = '';
  var s = document.getElementById('musicSearch'); if (s) s.value = '';
  renderMusic();
  setTimeout(function() {
    var row = document.querySelector('#tab-music .mtrack.is-current');
    if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 300);
}

function musicSetView(kind, id) {
  view = kind === 'playlist' ? { kind: 'playlist', id: id } : { kind: kind };
  searchTerm = '';
  var s = document.getElementById('musicSearch'); if (s) s.value = '';
  musicCloseDrawers();
  renderMusic();
  var main = document.getElementById('musicMain'); if (main) main.scrollTop = 0;
}

function musicClearQueue() {
  // Keep the current track playing, drop what's queued after it (Spotify-style).
  if (qIndex >= 0) queue = queue.slice(0, qIndex + 1);
  else { queue = []; qIndex = -1; }
  renderQueuePanel();
}

// ---------- narrow-width drawers ----------
function syncDrawers() {
  var sh = document.getElementById('musicShell');
  if (!sh) return;
  sh.classList.toggle('lib-open', libOpen);
  sh.classList.toggle('queue-open', queueOpen);
}
function musicToggleLibrary() { libOpen = !libOpen; queueOpen = false; syncDrawers(); }
function musicToggleQueue() { queueOpen = !queueOpen; libOpen = false; syncDrawers(); }
function musicCloseDrawers() { libOpen = false; queueOpen = false; syncDrawers(); }

// ---------- toolbar / search / sort ----------
export const musicSearchInput = debounce(function() {
  var s = document.getElementById('musicSearch');
  searchTerm = (s && s.value || '').trim();
  renderHero();
  renderTracklist();
}, 200);

function musicSetSort(v) { sortBy = v; renderTracklist(); }

function renderToolbarState() {
  var wrap = document.getElementById('musicSortWrap');
  if (wrap) wrap.style.display = view.kind === 'songs' ? '' : 'none';
  var sel = document.getElementById('musicSort');
  if (sel && sel.value !== sortBy) sel.value = sortBy;
}

// ---------- auto metadata scan ----------
function maybeScan() {
  if (scanRequested) return;
  var missing = audioFiles().some(function(f) { return f.duration == null; });
  if (!missing) return;
  scanRequested = true;
  api('POST', '/api/music/scan', {}).then(function(r) {
    if (r && r.scanned && window.refreshApp) window.refreshApp();
  }).catch(function() {});
}

// ---------- main render ----------
export function renderMusic() {
  safeRender('music', function() {
    if (!S) return;
    if (dragging) { tabNeedsRender.music = true; return; } // live-sync guard
    ensureInit();
    maybeScan();
    renderSidebar();
    renderHero();
    renderToolbarState();
    renderTracklist();
    renderQueuePanel();
    updateNowPlayingHighlight();
    renderStorageInfo();
  });
}

// ---------- pop-out player window + cross-window hand-off ----------
// A dedicated music tab is just this same app loaded at /?player=1 (the chrome
// is stripped by .player-mode). Each browser tab has its own <audio>, so the
// pop-out *takes over* playback rather than mirroring it; a BroadcastChannel
// carries the hand-off and stops the two windows from both playing at once.
const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('tylo-music') : null;
const playerMode = document.body.classList.contains('player-mode');
let popoutActive = false;   // (main window) a pop-out currently owns playback
let pendingHandoff = null;  // snapshot to send once the pop-out reports ready
let popoutRef = null;       // handle for the pop-out window we opened

function snapshotPlayback() {
  return {
    queue: queue.slice(), qIndex: qIndex, position: audio.currentTime || 0,
    paused: audio.paused, playSource: playSource, shuffle: shuffle, repeat: repeat
  };
}

async function adoptPlayback(s) {
  ensureInit();
  if (!s || !s.queue || !s.queue.length) return;
  queue = s.queue.slice();
  qIndex = (s.qIndex >= 0 && s.qIndex < queue.length) ? s.qIndex : 0;
  playSource = s.playSource || { type: 'library' };
  shuffle = !!s.shuffle; unshuffled = null;
  repeat = (s.repeat === 'all' || s.repeat === 'one') ? s.repeat : 'off';
  updateModeButtons();
  var f = trackById(queue[qIndex]);
  if (!f) return;
  audio.src = viewUrl(f.id);
  var resume = function() {
    audio.removeEventListener('loadedmetadata', resume);
    try { if (s.position) audio.currentTime = s.position; } catch (e) {}
  };
  audio.addEventListener('loadedmetadata', resume);
  if (!s.paused) { try { await audio.play(); } catch (e) {} }
  updatePlayerBar(f); updateMediaSession(f); updateNowPlayingHighlight();
  renderHero();
  renderQueuePanel();
}

export function popOutPlayer() {
  if (popoutRef && !popoutRef.closed) { popoutRef.focus(); return; }
  var w = window.open('/?player=1', 'tyloMusicPlayer', 'width=480,height=880');
  if (!w) { toast('Allow pop-ups for this site to open the player window'); return; }
  popoutRef = w;
  pendingHandoff = snapshotPlayback();  // handed over once the pop-out is ready
  onPopoutTookOver();                   // stop + hide the bar here right away
  w.focus();
}

export function reclaimPlayer() {
  if (bc) bc.postMessage({ type: 'reclaim' });  // pop-out ships state back, then closes
}

function onPopoutTookOver() {
  popoutActive = true;
  audio.pause();
  var bar = document.getElementById('musicPlayerBar');
  if (bar) bar.style.display = 'none';
  document.body.classList.remove('has-player');
  updatePopoutHint();
}

function onPopoutClosed() {
  popoutActive = false;
  popoutRef = null;
  var bar = document.getElementById('musicPlayerBar');
  if (audio.src && bar) { bar.style.display = 'grid'; document.body.classList.add('has-player'); }
  updatePopoutHint();
}

function updatePopoutHint() {
  var h = document.getElementById('musicPopoutHint');
  if (h) h.style.display = popoutActive ? 'flex' : 'none';
}

if (bc) {
  bc.onmessage = function(e) {
    var m = e.data || {};
    switch (m.type) {
      case 'ping':                          // main is (re)booting — announce ourselves
        if (playerMode) bc.postMessage({ type: 'player-open' });
        break;
      case 'player-open':                   // a pop-out exists → main yields the bar
        if (!playerMode) onPopoutTookOver();
        break;
      case 'player-closed':                 // pop-out went away → main takes ownership back
        if (!playerMode) onPopoutClosed();
        break;
      case 'ready':                         // pop-out finished booting → send it the current track
        if (!playerMode && pendingHandoff) { bc.postMessage({ type: 'adopt', state: pendingHandoff }); pendingHandoff = null; }
        break;
      case 'reclaim':                       // main wants playback back → ship state, then close
        if (playerMode) { bc.postMessage({ type: 'adopt', state: snapshotPlayback() }); setTimeout(function() { try { window.close(); } catch (e) {} }, 120); }
        break;
      case 'adopt':                         // receive a hand-off (either direction)
        adoptPlayback(m.state);
        break;
    }
  };
  if (playerMode) {
    bc.postMessage({ type: 'player-open' });
    bc.postMessage({ type: 'ready' });
    window.addEventListener('beforeunload', function() { bc.postMessage({ type: 'player-closed' }); });
  } else {
    bc.postMessage({ type: 'ping' });  // discover a pop-out already open (e.g. after a main reload)
  }
}
// ponytail: if you hit play in the main window while a pop-out owns playback,
// both play at once. Upgrade path: route main-window play through bc to the
// pop-out. Not worth it — the point is to browse in the pop-out.

// ---------- seek slider drag guard + window bindings ----------
document.addEventListener('DOMContentLoaded', function() {
  var seek = document.getElementById('playerSeek');
  if (seek) {
    seek.addEventListener('pointerdown', function() { seekHeld = true; });
    seek.addEventListener('pointerup', function() { seekHeld = false; });
  }
});

// Inline onclick handlers in generated + static HTML call these.
window.playTrack = playTrack;
window.playerToggle = playerToggle;
window.playerNext = playerNext;
window.playerPrev = playerPrev;
window.playerSeekTo = playerSeekTo;
window.playerSetVolume = playerSetVolume;
window.toggleShuffle = toggleShuffle;
window.cycleRepeat = cycleRepeat;
window.playerClose = playerClose;
window.playerJumpToSource = playerJumpToSource;
window.musicSearchInput = musicSearchInput;
window.musicSetSort = musicSetSort;
window.musicSetView = musicSetView;
window.musicTrackClick = musicTrackClick;
window.musicTrackMenu = musicTrackMenu;
window.musicNewPlaylist = musicNewPlaylist;
window.musicPlaylistMenu = musicPlaylistMenu;
window.musicPlayPlaylist = musicPlayPlaylist;
window.musicHeroPlay = musicHeroPlay;
window.musicHeroShuffle = musicHeroShuffle;
window.musicHeroMenu = musicHeroMenu;
window.musicClearQueue = musicClearQueue;
window.musicToggleLibrary = musicToggleLibrary;
window.musicToggleQueue = musicToggleQueue;
window.musicCloseDrawers = musicCloseDrawers;
window.popOutPlayer = popOutPlayer;
window.reclaimPlayer = reclaimPlayer;
