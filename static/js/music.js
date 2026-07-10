// TyloPlanner — Music tab: local media player.
// Library / playlists / queue rendering, a persistent bottom player bar,
// Media Session (lock-screen) controls, and offline downloads.
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
let repeat = 'off';      // off | all | one
let shuffle = false;
let unshuffled = null;   // queue order before shuffle was enabled
let mtab = 'library';    // library | playlists | queue
let sortBy = 'title';    // title | artist | date | duration
let searchTerm = '';
let openPlaylist = null; // playlist id when viewing its tracks
let dragging = false;    // suppress re-render mid-drag (live-sync guard)
let seekHeld = false;    // suppress seek-slider updates while user drags it
let scanRequested = false;
let settingsInit = false;
let offlineIds = new Set();

// ---------- helpers ----------
function audioFiles() {
  return ((S && S.files) || []).filter(function(f) {
    return (f.mimetype || '').startsWith('audio/');
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
    if (offlineIds.size && mtab === 'library' && !dragging) renderLibrary();
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

export function playTrack(fid, listIds) {
  ensureInit();
  queue = listIds ? listIds.slice() : visibleLibraryIds();
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
  if (mtab === 'queue') renderMusic();
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
  if (mtab === 'queue') renderMusic();
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
  if (mtab === 'queue') renderMusic();
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
  if (mtab === 'queue') renderMusic();
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
  document.querySelectorAll('#tab-music .music-track').forEach(function(el) {
    el.classList.toggle('now-playing', !!cur && el.dataset.fid === cur && !audio.paused);
    el.classList.toggle('is-current', !!cur && el.dataset.fid === cur);
  });
}
audio.addEventListener('play', updateNowPlayingHighlight);
audio.addEventListener('pause', updateNowPlayingHighlight);

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
  var text = n + ' track' + (n === 1 ? '' : 's') + ' downloaded for offline';
  if (navigator.storage && navigator.storage.estimate) {
    try {
      var est = await navigator.storage.estimate();
      text += ' · app storage ' + (est.usage / 1048576).toFixed(1) + ' MB of ' +
              (est.quota / 1048576 / 1024).toFixed(1) + ' GB';
    } catch (e) {}
  }
  el.textContent = text;
}

// ---------- library ----------
function visibleLibraryIds() {
  return filteredSortedLibrary().map(function(f) { return f.id; });
}

function filteredSortedLibrary() {
  var list = audioFiles();
  if (searchTerm) {
    var q = searchTerm.toLowerCase();
    list = list.filter(function(f) {
      return (trackTitle(f) + ' ' + (f.audio_artist || '') + ' ' + (f.audio_album || '') + ' ' + (f.filename || ''))
        .toLowerCase().indexOf(q) > -1;
    });
  }
  var cmp = {
    title:    function(a, b) { return trackTitle(a).localeCompare(trackTitle(b)); },
    artist:   function(a, b) { return (a.audio_artist || '~').localeCompare(b.audio_artist || '~'); },
    date:     function(a, b) { return (b.uploaded || 0) - (a.uploaded || 0); },
    duration: function(a, b) { return (a.duration || 0) - (b.duration || 0); }
  }[sortBy];
  return list.slice().sort(cmp);
}

function trackRowHtml(f, opts) {
  opts = opts || {};
  var cur = currentFileId() === f.id;
  return '<div class="music-track' + (cur ? ' is-current' : '') + (cur && !audio.paused ? ' now-playing' : '') + '"' +
    ' data-fid="' + esc(f.id) + '"' +
    (opts.draggable ? ' draggable="true" data-idx="' + opts.idx + '"' : '') +
    ' onclick="musicTrackClick(\'' + esc(f.id) + '\',\'' + (opts.context || 'library') + '\',' + (opts.idx != null ? opts.idx : -1) + ')"' +
    ' oncontextmenu="musicTrackMenu(event,\'' + esc(f.id) + '\'' + (opts.ptId ? ',\'' + esc(opts.ptId) + '\'' : '') + ')">' +
    (opts.draggable ? '<span class="track-grip" title="Drag to reorder">⠿</span>' : '') +
    '<img class="track-art" loading="lazy" src="' + artUrl(f.id) + '" alt="">' +
    '<div class="track-main">' +
      '<div class="track-title">' + esc(trackTitle(f)) + '</div>' +
      '<div class="track-artist">' + esc(f.audio_artist || '') + (f.audio_album ? ' · ' + esc(f.audio_album) : '') + '</div>' +
    '</div>' +
    (offlineIds.has(f.id) ? '<span class="track-offline" title="Available offline">⤓</span>' : '') +
    '<span class="track-dur">' + fmtTime(f.duration) + '</span>' +
    '<button class="track-menu-btn" onclick="event.stopPropagation();musicTrackMenu(event,\'' + esc(f.id) + '\'' + (opts.ptId ? ',\'' + esc(opts.ptId) + '\'' : '') + ')" title="More" aria-label="Track options">⋯</button>' +
  '</div>';
}

function renderLibrary() {
  var el = document.getElementById('musicLibrary');
  var tracks = filteredSortedLibrary();
  var h = '<div class="music-toolbar">' +
    '<span class="muted" style="font-size:13px">' + tracks.length + ' track' + (tracks.length === 1 ? '' : 's') + '</span>' +
    '<div class="music-sort">' +
      '<label class="muted" for="musicSort" style="font-size:12px">Sort:</label>' +
      '<select id="musicSort" onchange="musicSetSort(this.value)">' +
        ['title', 'artist', 'date', 'duration'].map(function(s) {
          return '<option value="' + s + '"' + (s === sortBy ? ' selected' : '') + '>' +
            s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +
  '</div>';
  if (!tracks.length) {
    h += '<div class="music-empty">' +
      (audioFiles().length
        ? 'No tracks match your search.'
        : 'No audio files yet. Upload MP3 / FLAC / WAV / OGG files in the <b>Files</b> tab and they\'ll show up here.') +
      '</div>';
  } else {
    h += '<div class="music-list">' + tracks.map(function(f) { return trackRowHtml(f); }).join('') + '</div>';
  }
  h += '<div id="musicStorageInfo" class="music-storage muted"></div>';
  el.innerHTML = h;
  renderStorageInfo();
}

// ---------- playlists ----------
function playlistTracks(pid) {
  return ((S && S.playlist_tracks) || [])
    .filter(function(t) { return t.playlist_id === pid; })
    .sort(function(a, b) { return (a.position || 0) - (b.position || 0); });
}

function renderPlaylists() {
  var el = document.getElementById('musicPlaylists');
  var pls = ((S && S.playlists) || []).slice().sort(function(a, b) {
    return (a.name || '').localeCompare(b.name || '');
  });

  if (openPlaylist) {
    var pl = pls.find(function(p) { return p.id === openPlaylist; });
    if (!pl) { openPlaylist = null; renderPlaylists(); return; }
    var pts = playlistTracks(pl.id);
    var h = '<div class="music-toolbar">' +
      '<button class="btn ghost small" onclick="musicOpenPlaylist(null)">← Playlists</button>' +
      '<strong class="playlist-heading">' + esc(pl.name) + '</strong>' +
      '<span class="muted" style="font-size:13px">' + pts.length + ' track' + (pts.length === 1 ? '' : 's') + '</span>' +
      (pts.length ? '<button class="btn small" onclick="musicPlayPlaylist(\'' + esc(pl.id) + '\')">▶ Play all</button>' : '') +
    '</div>';
    if (!pts.length) {
      h += '<div class="music-empty">Empty playlist. Right-click a track in the Library and choose “Add to playlist”.</div>';
    } else {
      h += '<div class="music-list" data-reorder="playlist">' + pts.map(function(t, i) {
        var f = trackById(t.file_id);
        if (!f) return '';
        return trackRowHtml(f, { draggable: true, idx: i, context: 'playlist', ptId: t.id });
      }).join('') + '</div>';
    }
    el.innerHTML = h;
    wireReorder(el.querySelector('[data-reorder]'), function(order) {
      var ids = playlistTracks(pl.id).map(function(t) { return t.id; });
      var newIds = order.map(function(i) { return ids[i]; });
      // optimistic local update so the re-render doesn't snap back
      newIds.forEach(function(tid, pos) {
        var row = (S.playlist_tracks || []).find(function(t) { return t.id === tid; });
        if (row) row.position = pos;
      });
      api('POST', '/api/playlists/' + pl.id + '/reorder', { tracks: newIds })
        .catch(function() { toast('Reorder failed'); })
        .then(function() { renderMusic(); });
    });
    return;
  }

  var h = '<div class="music-toolbar">' +
    '<button class="btn small" onclick="musicNewPlaylist()">+ New playlist</button>' +
  '</div>';
  if (!pls.length) {
    h += '<div class="music-empty">No playlists yet.</div>';
  } else {
    h += '<div class="playlist-grid">' + pls.map(function(p) {
      var n = playlistTracks(p.id).length;
      var covers = playlistTracks(p.id).slice(0, 1);
      var cover = covers.length ? artUrl(covers[0].file_id) : '';
      return '<div class="playlist-card" onclick="musicOpenPlaylist(\'' + esc(p.id) + '\')" oncontextmenu="musicPlaylistMenu(event,\'' + esc(p.id) + '\')">' +
        (cover ? '<img class="playlist-cover" loading="lazy" src="' + cover + '" alt="">' : '<div class="playlist-cover playlist-cover-empty">♪</div>') +
        '<div class="playlist-card-main">' +
          '<div class="playlist-name">' + esc(p.name) + '</div>' +
          '<div class="muted" style="font-size:12px">' + n + ' track' + (n === 1 ? '' : 's') + '</div>' +
        '</div>' +
        (n ? '<button class="btn ghost small" onclick="event.stopPropagation();musicPlayPlaylist(\'' + esc(p.id) + '\')" title="Play all">▶</button>' : '') +
        '<button class="track-menu-btn" onclick="event.stopPropagation();musicPlaylistMenu(event,\'' + esc(p.id) + '\')" title="More" aria-label="Playlist options">⋯</button>' +
      '</div>';
    }).join('') + '</div>';
  }
  el.innerHTML = h;
}

// ---------- queue view ----------
function renderQueue() {
  var el = document.getElementById('musicQueue');
  var h = '<div class="music-toolbar">' +
    '<span class="muted" style="font-size:13px">' + queue.length + ' in queue</span>' +
    (queue.length ? '<button class="btn ghost small" onclick="musicClearQueue()">Clear queue</button>' : '') +
  '</div>';
  if (!queue.length) {
    h += '<div class="music-empty">Queue is empty — play something from the Library.</div>';
  } else {
    h += '<div class="music-list" data-reorder="queue">' + queue.map(function(fid, i) {
      var f = trackById(fid);
      if (!f) return '';
      return trackRowHtml(f, { draggable: true, idx: i, context: 'queue' });
    }).join('') + '</div>';
  }
  el.innerHTML = h;
  wireReorder(el.querySelector('[data-reorder]'), function(order) {
    var cur = currentFileId();
    queue = order.map(function(i) { return queue[i]; });
    qIndex = queue.indexOf(cur);
    renderMusic();
  });
}

// ---------- drag-to-reorder (shared by queue + playlist detail) ----------
function wireReorder(container, onDrop) {
  if (!container) return;
  var fromIdx = null;
  container.querySelectorAll('.music-track[draggable]').forEach(function(row) {
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
    renderMusic();
  } else if (context === 'playlist' && openPlaylist) {
    playTrack(fid, playlistTracks(openPlaylist).map(function(t) { return t.file_id; }));
  } else {
    playTrack(fid);
  }
}

function musicTrackMenu(ev, fid, ptId) {
  ensureInit();
  var items = [
    { label: 'Play', icon: '▶', onClick: function() { musicTrackClick(fid, ptId ? 'playlist' : 'library', -1); } },
    { label: 'Play next', icon: '⏭', onClick: function() {
        if (!queue.length) { playTrack(fid); return; }
        queue.splice(qIndex + 1, 0, fid);
        toast('Playing next');
        if (mtab === 'queue') renderMusic();
      } },
    { label: 'Add to queue', icon: '＋', onClick: function() {
        if (!queue.length) { playTrack(fid); return; }
        queue.push(fid);
        toast('Added to queue');
        if (mtab === 'queue') renderMusic();
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
  await api('POST', '/api/playlists', { name: name });
  if (window.refreshApp) window.refreshApp();
}

function musicPlaylistMenu(ev, pid) {
  showContextMenu(ev, [
    { label: 'Play all', icon: '▶', onClick: function() { musicPlayPlaylist(pid); } },
    { label: 'Rename', icon: '✏️', onClick: async function() {
        var pl = (S.playlists || []).find(function(p) { return p.id === pid; });
        var name = await askPrompt('Rename playlist', pl ? pl.name : '');
        if (!name) return;
        await api('PUT', '/api/playlists/' + pid, { name: name });
        if (window.refreshApp) window.refreshApp();
      } },
    { sep: true },
    { label: 'Delete playlist', icon: '🗑', danger: true, onClick: async function() {
        if (!(await askConfirm('Delete this playlist? Its tracks stay in your library.', { danger: true, okText: 'Delete' }))) return;
        await api('DELETE', '/api/playlists/' + pid);
        if (openPlaylist === pid) openPlaylist = null;
        if (window.refreshApp) window.refreshApp();
      } }
  ]);
}

function musicPlayPlaylist(pid) {
  var ids = playlistTracks(pid).map(function(t) { return t.file_id; })
    .filter(function(fid) { return !!trackById(fid); });
  if (!ids.length) return;
  playTrack(ids[0], ids);
}

function musicOpenPlaylist(pid) {
  openPlaylist = pid;
  renderPlaylists();
}

function musicClearQueue() {
  playerClose();
}

export function switchMusicTab(tab) {
  mtab = tab;
  document.querySelectorAll('#tab-music .music-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.mtab === tab);
  });
  ['Library', 'Playlists', 'Queue'].forEach(function(n) {
    document.getElementById('music' + n).style.display = (n.toLowerCase() === tab) ? '' : 'none';
  });
  renderMusic();
}

export const musicSearchInput = debounce(function() {
  searchTerm = (document.getElementById('musicSearch').value || '').trim();
  if (mtab !== 'library') switchMusicTab('library'); else renderLibrary();
}, 200);

function musicSetSort(v) { sortBy = v; renderLibrary(); }

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
    // Don't rebuild a panel the user is interacting with (e.g. the open Sort
    // dropdown) — the live-sync poll would close it under them.
    var ae = document.activeElement;
    if (ae && ['musicLibrary', 'musicPlaylists', 'musicQueue'].some(function(id) {
      var el = document.getElementById(id);
      return el && el.contains(ae);
    })) { tabNeedsRender.music = true; return; }
    ensureInit();
    maybeScan();
    if (mtab === 'library') renderLibrary();
    else if (mtab === 'playlists') renderPlaylists();
    else renderQueue();
    updateNowPlayingHighlight();
  });
}

// ---------- seek slider drag guard + window bindings ----------
document.addEventListener('DOMContentLoaded', function() {
  var seek = document.getElementById('playerSeek');
  if (seek) {
    seek.addEventListener('pointerdown', function() { seekHeld = true; });
    seek.addEventListener('pointerup', function() { seekHeld = false; });
  }
});

// Inline onclick handlers in generated HTML call these.
window.playTrack = playTrack;
window.playerToggle = playerToggle;
window.playerNext = playerNext;
window.playerPrev = playerPrev;
window.playerSeekTo = playerSeekTo;
window.playerSetVolume = playerSetVolume;
window.toggleShuffle = toggleShuffle;
window.cycleRepeat = cycleRepeat;
window.playerClose = playerClose;
window.switchMusicTab = switchMusicTab;
window.musicSearchInput = musicSearchInput;
window.musicSetSort = musicSetSort;
window.musicTrackClick = musicTrackClick;
window.musicTrackMenu = musicTrackMenu;
window.musicNewPlaylist = musicNewPlaylist;
window.musicPlaylistMenu = musicPlaylistMenu;
window.musicPlayPlaylist = musicPlayPlaylist;
window.musicOpenPlaylist = musicOpenPlaylist;
window.musicClearQueue = musicClearQueue;
