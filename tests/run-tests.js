/* Headless tests for the pure modules (no Electron needed): node tests/run-tests.js */
'use strict';

const path = require('path');
const assert = require('assert');

for (const f of ['rng', 'format', 'geometry', 'digits', 'strokefont', 'route', 'hatch', 'artwork', 'clock', 'settings']) {
  require(path.join(__dirname, '..', 'src', 'js', f + '.js'));
}
const SC = globalThis.SketchClock;
const DEFAULTS = SC.settings.DEFAULTS;

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (e) {
    failures++;
    console.log('  FAIL ' + name + '\n       ' + e.message);
  }
}

const at = (iso) => new Date(iso);

console.log('format');
test('12-hour formatting without leading zero', () => {
  const cases = { '00:05': '12:05', '01:00': '1:00', '04:37': '4:37', '12:30': '12:30', '13:07': '1:07', '23:59': '11:59' };
  for (const [hhmm, expected] of Object.entries(cases)) {
    assert.strictEqual(SC.format.getTimeParts(at('2026-10-13T' + hhmm), {}).text, expected);
  }
});
test('24-hour formatting', () => {
  assert.strictEqual(SC.format.getTimeParts(at('2026-10-13T00:05'), { use24Hour: true }).text, '00:05');
  assert.strictEqual(SC.format.getTimeParts(at('2026-10-13T16:37'), { use24Hour: true }).text, '16:37');
});
test('date string', () => {
  assert.strictEqual(SC.format.formatDate(at('2026-10-13T12:00')), 'TUESDAY, OCTOBER 13, 2026');
  assert.strictEqual(SC.format.formatDate(at('2025-10-14T16:37')), 'TUESDAY, OCTOBER 14, 2025');
});
test('midnight changes minute key, time and date', () => {
  const before = at('2026-10-13T23:59:59.900');
  const after = at('2026-10-14T00:00:00.050');
  assert.notStrictEqual(SC.format.minuteKey(before), SC.format.minuteKey(after));
  assert.strictEqual(SC.format.getTimeParts(after, {}).text, '12:00');
  assert.strictEqual(SC.format.formatDate(after), 'WEDNESDAY, OCTOBER 14, 2026');
  assert.strictEqual(SC.format.msUntilNextMinute(before), 100);
});
test('year rollover', () => {
  assert.strictEqual(SC.format.formatDate(at('2027-01-01T00:00')), 'FRIDAY, JANUARY 1, 2027');
});

console.log('clock manager');
test('fires once per real minute and catches jumps (sleep / clock change)', () => {
  let fake = at('2026-10-13T23:58:30').getTime();
  const seen = [];
  const clock = new SC.ClockManager({ now: () => new Date(fake), onMinute: (d, info) => seen.push(info.key) });
  clock.check();
  clock.check();
  fake += 20000; clock.check();          // 23:58:50, same minute
  fake += 15000; clock.check();          // 23:59:05
  fake += 3 * 3600 * 1000; clock.check(); // woke up hours later
  assert.deepStrictEqual(seen, ['2026-10-13T23:58', '2026-10-13T23:59', '2026-10-14T02:59']);
});

console.log('digit geometry');
test('every digit has a clockwise outline and the right number of counters', () => {
  const holes = { 0: 1, 1: 0, 2: 0, 3: 0, 4: 1, 5: 0, 6: 1, 7: 0, 8: 2, 9: 1 };
  for (const ch of '0123456789') {
    const g = SC.digits.getContours(ch);
    assert.ok(SC.geometry.signedArea(g.outer) > 0, ch + ' orientation');
    assert.strictEqual(g.holes.length, holes[ch], ch + ' holes');
    for (const h of g.holes) for (const p of h) assert.ok(SC.geometry.pointInContours(p, [g.outer]), ch + ' hole inside outline');
    const b = SC.geometry.bounds([g.outer]);
    assert.ok(b.minX >= 0 && b.maxX <= 64 && b.minY >= 0 && b.maxY <= 100, ch + ' within glyph box');
  }
});

console.log('artwork (every minute of a day, 12h and 24h)');
const vb = SC.artwork.viewBox();
function checkModel(m, label) {
  // Main route is continuous: no jump larger than the sampling step + tremor.
  const pts = m.main.points;
  for (let i = 1; i < pts.length; i++) {
    const d = SC.geometry.dist(pts[i - 1], pts[i]);
    if (d > 3) throw new Error(`${label}: gap of ${d.toFixed(2)} in main path at ${i}`);
  }
  // Chunks tile the route end to end.
  const chunks = m.main.chunks;
  for (let i = 1; i < chunks.length; i++) {
    const a = chunks[i - 1].points[chunks[i - 1].points.length - 1], b = chunks[i].points[0];
    if (a !== b) throw new Error(`${label}: chunk ${i} not joined`);
  }
  // Everything stays inside the view box (never clipped).
  const all = [pts, ...m.date.strokes.map((s) => s.points)];
  const b = SC.geometry.bounds(all);
  if (b.minX < vb.x || b.maxX > vb.x + vb.w || b.minY < vb.y || b.maxY > vb.y + vb.h) {
    throw new Error(`${label}: drawing exceeds view box ${JSON.stringify(b)}`);
  }
  // Digits never overlap each other.
  const boxes = m.glyphs.map((g) => SC.geometry.bounds([g.outer]));
  for (let i = 1; i < boxes.length; i++) {
    if (boxes[i].minX <= boxes[i - 1].maxX + 4) throw new Error(`${label}: digits ${i - 1}/${i} too close`);
  }
  // Hatch stripes lie entirely inside ink: endpoints and midpoints, never in a counter.
  m.hatch.forEach((set) => {
    const g = m.glyphs[set.glyphIndex];
    const contours = [g.outer, ...g.holes];
    if (set.segments.length < 8) throw new Error(`${label}: too few stripes on ${g.ch}`);
    for (const s of set.segments) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
        if (!SC.geometry.pointInContours(p, contours)) throw new Error(`${label}: stripe leaves digit ${g.ch}`);
      }
    }
  });
}

test('all 1440 minutes (12h) build valid, continuous, unclipped artwork', () => {
  const start = at('2026-10-13T00:00').getTime();
  for (let m = 0; m < 1440; m++) {
    const d = new Date(start + m * 60000);
    checkModel(SC.artwork.buildArtwork(d, DEFAULTS), SC.format.minuteKey(d));
  }
});
test('24h mode, extreme settings', () => {
  const s = Object.assign({}, DEFAULTS, { use24Hour: true, passes: 3, wobble: 3, hatchSpacing: 2.5 });
  for (const hhmm of ['00:00', '08:08', '11:11', '19:59', '23:59', '20:48']) checkModel(SC.artwork.buildArtwork(at('2026-10-13T' + hhmm), s), hhmm);
});
test('deterministic per minute, different between minutes', () => {
  const a = SC.artwork.buildArtwork(at('2026-10-13T04:37:05'), DEFAULTS);
  const b = SC.artwork.buildArtwork(at('2026-10-13T04:37:55'), DEFAULTS);
  const c = SC.artwork.buildArtwork(at('2026-10-13T04:38:00'), DEFAULTS);
  assert.deepStrictEqual(a.main.points, b.main.points);
  assert.notDeepStrictEqual(a.main.points, c.main.points);
  const d = SC.artwork.buildArtwork(at('2026-10-14T04:37'), DEFAULTS);
  assert.notDeepStrictEqual(a.main.points, d.main.points); // same time, next day
});
test('wide dates fit', () => {
  const m = SC.artwork.buildArtwork(at('2026-09-30T10:10'), DEFAULTS);
  assert.strictEqual(m.dateText, 'WEDNESDAY, SEPTEMBER 30, 2026');
  checkModel(m, 'wide date');
});

console.log('settings');
test('sanitize clamps and rejects bad values', () => {
  const s = SC.settings.sanitize({ passes: 9, hatchSpacing: 'x', inkColor: 'red', paperColor: '#fff', drawDurationMs: -5 });
  assert.strictEqual(s.passes, 3);
  assert.strictEqual(s.hatchSpacing, DEFAULTS.hatchSpacing);
  assert.strictEqual(s.inkColor, DEFAULTS.inkColor);
  assert.strictEqual(s.paperColor, '#fff');
  assert.strictEqual(s.drawDurationMs, 0);
});

console.log(failures ? `\n${failures} test(s) failed` : '\nall tests passed');
process.exit(failures ? 1 : 0);
