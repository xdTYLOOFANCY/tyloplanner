// Self-check for static/js/calc.js — run: node test_calc.mjs
// Pure module, no DOM; time-zone cases assert shape (offsets vary by DST/date).
import { calc } from './static/js/calc.js';

let fails = 0;
function eq(got, exp, msg) {
  const g = got && got.value !== undefined ? got.value : got;
  if (g !== exp) { console.error('FAIL', msg, '— got', JSON.stringify(g), 'exp', JSON.stringify(exp)); fails++; }
}
function ok(got, msg) { if (!got) { console.error('FAIL', msg, '— got null'); fails++; } }

// arithmetic
eq(calc('8 * 9'), '72', 'mul');
eq(calc('8 times 9'), '72', 'word times');
eq(calc('100 - 50'), '50', 'sub');
eq(calc('(2 + 3) * 4'), '20', 'parens');
eq(calc('2^10'), '1024', 'power');
eq(calc('-5 + 3'), '-2', 'unary');
eq(calc('20% of $250'), '50', 'percent-of + currency');
eq(calc('1,000 + 1'), '1001', 'thousands sep');
eq(calc('42'), null, 'bare number → null');
eq(calc('hello world'), null, 'text → null');
eq(calc('5 apples'), null, 'number + word → null');

// unit conversion
eq(calc('5 km in miles'), '3.106856', 'km→mi');
eq(calc('12pt in px'), '16', 'css pt→px');
eq(calc('2cm in px'), '75.590551', 'css cm→px (not physical)');
eq(calc('1 kg in lb'), '2.204624', 'kg→lb');
eq(calc('1 mile in m'), '1609.344', 'mi→m');
eq(calc('0 c in f'), '32', 'temp C→F');
eq(calc('100 celsius in f'), '212', 'temp word C→F');
eq(calc('300 k in c'), '26.85', 'temp K→C');
eq(calc('1 gb in mb'), '1000', 'data gb→mb');
eq(calc('1 m in cm'), '100', 'length m→cm (physical, not css)');
eq(calc('5 xyz in abc'), null, 'unknown units → null');

// time zones (shape only — values depend on today's DST)
ok(calc('time in Tokyo'), 'tz now');
ok(calc('2:30pm HKT in Berlin'), 'tz convert');
ok(calc('3pm PST'), 'tz to local');
ok(calc('tokyo time'), 'X time');
eq(calc('bed time'), null, 'non-zone "X time" → null');

console.log(fails ? `\n${fails} calc test(s) FAILED` : 'all calc tests passed');
process.exit(fails ? 1 : 0);
