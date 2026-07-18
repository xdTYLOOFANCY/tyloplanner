// TyloPlanner — command-palette calculator. Arithmetic, unit conversion, and
// time-zone conversion, all offline and dependency-free (time zones use the
// browser's own Intl database — no tz library). Modelled on parseTimer():
// a pure function the palette special-cases before its normal search.
//
//   = 8 * 9                  → 72
//   = 20% of $250            → 50
//   = (2 + 3) * 4            → 20
//   = 5 km in miles          → 3.106856 miles
//   = 12pt in px             → 16 px
//   = 0 c in f               → 32 f
//   = 1 gb in mb             → 1000 mb
//   = 2:30pm HKT in Berlin   → 8:30 AM Berlin
//   = time in Tokyo          → now in Tokyo
//
// Returns { text, value } on a hit (text = the display line, value = the bare
// result to copy), or null when the string isn't something to compute — so the
// palette falls back to normal search. Pure, no DOM: node-testable (test_calc.mjs).

// ---- number formatting ----
function fmtNum(n) {
  if (n == null || !isFinite(n)) return null;
  if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-4)) {
    return n.toExponential(4).replace(/\.?0+e/, 'e');
  }
  return String(Math.round(n * 1e6) / 1e6);
}

// ---- arithmetic: recursive-descent over + - * / ^ ( ), unary sign, sci-notation ----
function preprocess(input) {
  var s = ' ' + String(input).toLowerCase() + ' ';
  s = s.replace(/[$€£¥]/g, '');
  s = s.replace(/,(?=\d{3}\b)/g, '');              // thousands separators
  s = s.replace(/×/g, '*').replace(/÷/g, '/');
  s = s.replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-')
       .replace(/\b(?:times|multiplied by)\b/g, '*')
       .replace(/\b(?:divided by|over)\b/g, '/')
       .replace(/\bof\b/g, '*');
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)'); // 20% → (20/100)
  if (/[^0-9+\-*/^().e\s]/i.test(s)) return null;    // any leftover letter → not arithmetic
  return s;
}

function evalArith(input) {
  var s = preprocess(input);
  if (s == null) return null;
  var i = 0, n = s.length, ops = 0;
  var numRe = /\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+/iy;
  function peek() { while (i < n && s[i] === ' ') i++; return s[i]; }
  function expr() {
    var v = term(), c;
    while ((c = peek()) === '+' || c === '-') { i++; var t = term(); v = c === '+' ? v + t : v - t; ops++; }
    return v;
  }
  function term() {
    var v = power(), c;
    while ((c = peek()) === '*' || c === '/') { i++; var p = power(); v = c === '*' ? v * p : v / p; ops++; }
    return v;
  }
  function power() {
    var v = unary();
    if (peek() === '^') { i++; v = Math.pow(v, power()); ops++; }
    return v;
  }
  function unary() {
    var c = peek();
    if (c === '-') { i++; return -unary(); }
    if (c === '+') { i++; return unary(); }
    return primary();
  }
  function primary() {
    if (peek() === '(') { i++; var v = expr(); if (peek() !== ')') throw 0; i++; return v; }
    numRe.lastIndex = i;
    var m = numRe.exec(s);
    if (!m || m.index !== i) throw 0;
    i += m[0].length;
    return parseFloat(m[0]);
  }
  try {
    var v = expr();
    peek();
    if (i !== n || ops === 0 || !isFinite(v)) return null;  // bare number = nothing computed
    return v;
  } catch (e) { return null; }
}

// ---- unit conversion: cross-table ratios (base unit per dimension) ----
var DIM = {
  length: { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, meter: 1, meters: 1, metre: 1, km: 1000, kilometer: 1000,
    in: 0.0254, inch: 0.0254, inches: 0.0254, ft: 0.3048, foot: 0.3048, feet: 0.3048,
    yd: 0.9144, yard: 0.9144, yards: 0.9144, mi: 1609.344, mile: 1609.344, miles: 1609.344, nmi: 1852 },
  mass: { mg: 1e-6, g: 1e-3, gram: 1e-3, grams: 1e-3, kg: 1, kilo: 1, kilos: 1, kilogram: 1, kilograms: 1,
    t: 1000, tonne: 1000, tonnes: 1000, ton: 1000, oz: 0.0283495, ounce: 0.0283495, ounces: 0.0283495,
    lb: 0.453592, lbs: 0.453592, pound: 0.453592, pounds: 0.453592, st: 6.35029, stone: 6.35029 },
  area: { mm2: 1e-6, cm2: 1e-4, m2: 1, km2: 1e6, ha: 1e4, hectare: 1e4, hectares: 1e4,
    sqft: 0.092903, ft2: 0.092903, sqin: 0.00064516, in2: 0.00064516, sqmi: 2589988, mi2: 2589988,
    acre: 4046.86, acres: 4046.86 },
  volume: { ml: 0.001, cl: 0.01, dl: 0.1, l: 1, liter: 1, litre: 1, liters: 1, litres: 1, m3: 1000,
    gal: 3.78541, gallon: 3.78541, gallons: 3.78541, qt: 0.946353, quart: 0.946353, quarts: 0.946353,
    pint: 0.473176, pints: 0.473176, cup: 0.236588, cups: 0.236588,
    floz: 0.0295735, tbsp: 0.0147868, tsp: 0.00492892 },
  data: { bit: 0.125, bits: 0.125, b: 1, byte: 1, bytes: 1, kb: 1000, kib: 1024, mb: 1e6, mib: 1048576,
    gb: 1e9, gib: 1073741824, tb: 1e12, tib: 1099511627776, pb: 1e15,
    kbit: 125, mbit: 125000, gbit: 1.25e8 },
  // CSS lengths (96dpi; em/rem assume a 16px root). Overlaps with `length` on
  // cm/mm/in — DIM is searched in order, so those resolve to physical `length`
  // unless the pair also involves a CSS-only unit (px/pt/pc/em/rem/ex/ch).
  css: { px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6,
    em: 16, rem: 16, ex: 8, ch: 8 }
};
var TEMP = { c: 'c', celsius: 'c', f: 'f', fahrenheit: 'f', k: 'k', kelvin: 'k' };
function toC(v, u) { return u === 'f' ? (v - 32) * 5 / 9 : u === 'k' ? v - 273.15 : v; }
function fromC(c, u) { return u === 'f' ? c * 9 / 5 + 32 : u === 'k' ? c + 273.15 : c; }
function normU(u) { return u.toLowerCase().replace(/°/g, '').replace(/"/g, 'in').replace(/'/g, 'ft'); }

function convertUnit(numStr, fromRaw, toRaw) {
  var n = parseFloat(numStr), f = normU(fromRaw), t = normU(toRaw), out = null;
  if (TEMP[f] && TEMP[t]) {
    out = fromC(toC(n, TEMP[f]), TEMP[t]);
  } else {
    for (var dim in DIM) {
      var u = DIM[dim];
      if (u[f] != null && u[t] != null) { out = n * u[f] / u[t]; break; }
    }
  }
  var fo = fmtNum(out);
  if (fo == null) return null;
  return { text: numStr + ' ' + f + ' = ' + fo + ' ' + t, value: fo };
}

function tryUnit(q) {
  var m = q.match(/^(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*([a-z°"'²³]+)\s+(?:in|to|as)\s+([a-z°"'²³]+)$/i);
  return m ? convertUnit(m[1], m[2], m[3]) : null;
}

// ---- time zones: curated abbreviation/city map → IANA, math via native Intl ----
var ZONES = {
  utc: 'UTC', gmt: 'UTC', z: 'UTC',
  est: 'America/New_York', edt: 'America/New_York', et: 'America/New_York',
  cst: 'America/Chicago', cdt: 'America/Chicago', ct: 'America/Chicago',
  mst: 'America/Denver', mdt: 'America/Denver', mt: 'America/Denver',
  pst: 'America/Los_Angeles', pdt: 'America/Los_Angeles', pt: 'America/Los_Angeles',
  akst: 'America/Anchorage', hst: 'Pacific/Honolulu',
  bst: 'Europe/London', wet: 'Europe/Lisbon',
  cet: 'Europe/Paris', cest: 'Europe/Paris', eet: 'Europe/Athens', eest: 'Europe/Athens',
  msk: 'Europe/Moscow', ist: 'Asia/Kolkata', gst: 'Asia/Dubai',
  jst: 'Asia/Tokyo', kst: 'Asia/Seoul', hkt: 'Asia/Hong_Kong', sgt: 'Asia/Singapore',
  aest: 'Australia/Sydney', aedt: 'Australia/Sydney', awst: 'Australia/Perth',
  nzst: 'Pacific/Auckland', nzdt: 'Pacific/Auckland',
  london: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin', madrid: 'Europe/Madrid',
  rome: 'Europe/Rome', amsterdam: 'Europe/Amsterdam', dublin: 'Europe/Dublin', lisbon: 'Europe/Lisbon',
  moscow: 'Europe/Moscow', istanbul: 'Europe/Istanbul', dubai: 'Asia/Dubai',
  'new york': 'America/New_York', nyc: 'America/New_York', chicago: 'America/Chicago',
  denver: 'America/Denver', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles', sf: 'America/Los_Angeles', seattle: 'America/Los_Angeles',
  toronto: 'America/Toronto', 'mexico city': 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo',
  tokyo: 'Asia/Tokyo', seoul: 'Asia/Seoul', 'hong kong': 'Asia/Hong_Kong', hongkong: 'Asia/Hong_Kong',
  singapore: 'Asia/Singapore', beijing: 'Asia/Shanghai', shanghai: 'Asia/Shanghai',
  mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', kolkata: 'Asia/Kolkata', bangkok: 'Asia/Bangkok',
  jakarta: 'Asia/Jakarta', sydney: 'Australia/Sydney', melbourne: 'Australia/Melbourne',
  perth: 'Australia/Perth', auckland: 'Pacific/Auckland', honolulu: 'Pacific/Honolulu'
};
var LOCAL = { id: Intl.DateTimeFormat().resolvedOptions().timeZone, label: 'local' };

function resolveZone(str) {
  var raw = String(str).trim(), k = raw.toLowerCase().replace(/\s+/g, ' ');
  if (ZONES[k]) return { id: ZONES[k], label: raw };
  if (raw.indexOf('/') !== -1) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: raw }); return { id: raw, label: raw }; }
    catch (e) { /* not a valid IANA id */ }
  }
  return null;
}

function parseClock(str) {
  var m = String(str).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  var h = +m[1], mi = m[2] ? +m[2] : 0, ap = m[3] && m[3].toLowerCase();
  if (mi > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
  } else if (h > 23) return null;
  return { h: h, mi: mi };
}
function clockLabel(c) {
  var ap = c.h < 12 ? 'AM' : 'PM', hh = c.h % 12 || 12;
  return hh + ':' + (c.mi < 10 ? '0' + c.mi : c.mi) + ' ' + ap;
}
// Wall-clock time in a zone → the UTC instant. Diff the zone's localized render
// of a guess against UTC to get its offset, then refine once for DST edges.
function tzOffsetMs(tz, date) {
  var s = date.toLocaleString('en-US', { timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  var m = s.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+):(\d+)/);
  if (!m) return 0;
  return Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4] % 24, +m[5], +m[6]) - date.getTime();
}
function wallToInstant(y, mo, d, h, mi, tz) {
  var guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  var inst = new Date(guess - tzOffsetMs(tz, new Date(guess)));
  return new Date(guess - tzOffsetMs(tz, inst));
}
function fmtTimeIn(inst, tz) {
  return inst.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
}
function zoneParts(tz, date) {
  var s = date.toLocaleString('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  var m = s.match(/(\d+)\/(\d+)\/(\d+)/);
  return m ? { y: +m[3], mo: +m[1], d: +m[2] } : null;
}

function tzConvert(clock, src, dst) {
  var p = zoneParts(src.id, new Date());              // "today" in the source zone
  if (!p) return null;
  var out = fmtTimeIn(wallToInstant(p.y, p.mo, p.d, clock.h, clock.mi, src.id), dst.id);
  return { text: clockLabel(clock) + ' ' + src.label + ' → ' + out + ' ' + dst.label, value: out };
}
function tzNow(zone) {
  var t = fmtTimeIn(new Date(), zone.id);
  return { text: 'Now in ' + zone.label + ': ' + t, value: t };
}

function tryTz(q) {
  var m, src, dst, clock;
  if ((m = q.match(/^(?:current\s+)?time\s+in\s+(.+)$/i)) ||
      (m = q.match(/^what(?:'s| is)?\s+the\s+time\s+in\s+(.+)$/i))) {
    src = resolveZone(m[1]);
    return src ? tzNow(src) : null;
  }
  if ((m = q.match(/^(.+?)\s+time$/i))) {
    src = resolveZone(m[1]);
    if (src) return tzNow(src);
  }
  if ((m = q.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(.+?)\s+(?:in|to)\s+(.+)$/i))) {
    clock = parseClock(m[1]); src = resolveZone(m[2]); dst = resolveZone(m[3]);
    return clock && src && dst ? tzConvert(clock, src, dst) : null;
  }
  if ((m = q.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(.+)$/i))) {
    clock = parseClock(m[1]); src = resolveZone(m[2]);
    if (clock && src) return tzConvert(clock, src, LOCAL);
  }
  return null;
}

// ---- entry point ----
export function calc(str) {
  var q = String(str || '').trim();
  if (!q) return null;
  var r = tryTz(q) || tryUnit(q);
  if (r) return r;
  var v = evalArith(q);
  if (v != null) { var f = fmtNum(v); if (f != null) return { text: q + ' = ' + f, value: f }; }
  return null;
}
