/* A tiny single-stroke hand-lettering font for the date line.
 *
 * Glyphs live on a grid with cap height 6 (y down). Strokes are written as
 * "x y x y ..." point lists separated by "|". A leading "~" marks a curvy
 * stroke that is rounded with Chaikin smoothing; others keep sharp corners.
 * "@O" draws an overshooting oval, like a pen closing a loop by hand.
 */
(function (SC) {
  'use strict';

  const CAP = 6;

  const RAW = {
    A: [4, '0 6 2 0 4 6|0.7 4 3.3 4'],
    B: [3.8, '0 0 0 6|~0 0 2.4 0 3.4 0.8 3.4 2.2 2.4 3 0 3|~0 3 2.6 3 3.8 3.9 3.8 5.1 2.6 6 0 6'],
    C: [4, '~4 1 3 0 1 0 0 1.3 0 4.7 1 6 3 6 4 5'],
    D: [4, '0 0 0 6|~0 0 2.2 0 3.6 1 4 3 3.6 5 2.2 6 0 6'],
    E: [3.6, '3.6 0 0 0 0 6 3.6 6|0 3 2.8 3'],
    F: [3.6, '3.6 0 0 0 0 6|0 3 2.8 3'],
    G: [4, '~4 1 3 0 1 0 0 1.3 0 4.7 1 6 3 6 4 5 4 3.4|4 3.4 2.2 3.4'],
    H: [4, '0 0 0 6|4 0 4 6|0 3 4 3'],
    I: [2, '0 0 2 0|1 0 1 6|0 6 2 6'],
    J: [3.6, '~3.6 0 3.6 4.6 2.8 6 0.8 6 0 4.8'],
    K: [3.8, '0 0 0 6|3.8 0 0 3.8|1.3 2.6 3.8 6'],
    L: [3.4, '0 0 0 6 3.4 6'],
    M: [5, '0 6 0 0 2.5 4 5 0 5 6'],
    N: [4, '0 6 0 0 4 6 4 0'],
    O: [4.4, '@O'],
    P: [3.8, '0 6 0 0|~0 0 2.6 0 3.8 0.9 3.8 2.3 2.6 3.2 0 3.2'],
    Q: [4.4, '@O|2.8 4.4 4.4 6.4'],
    R: [3.8, '0 6 0 0|~0 0 2.6 0 3.8 0.9 3.8 2.3 2.6 3.2 0 3.2|1.9 3.2 3.8 6'],
    S: [3.8, '~3.8 0.9 2.9 0 1 0 0 0.9 0 2.1 1 2.9 2.8 3.1 3.8 3.9 3.8 5.1 2.9 6 0.9 6 0 5.1'],
    T: [4, '0 0 4 0|2 0 2 6'],
    U: [4, '~0 0 0 4.6 0.9 6 3.1 6 4 4.6 4 0'],
    V: [4, '0 0 2 6 4 0'],
    W: [5.6, '0 0 1.4 6 2.8 1.8 4.2 6 5.6 0'],
    X: [4, '0 0 4 6|4 0 0 6'],
    Y: [4, '0 0 2 3 4 0|2 3 2 6'],
    Z: [4, '0 0 4 0 0 6 4 6'],
    0: [3.8, '@O'],
    1: [3, '0 1.2 1.6 0 1.6 6|0.2 6 3 6'],
    2: [3.8, '~0 1.1 1 0 2.8 0 3.8 1 3.8 2.2 0 6|0 6 3.8 6'],
    3: [3.9, '~0 0.8 1 0 2.8 0 3.8 0.9 3.8 2 2.8 2.9 1.4 2.9|~1.4 2.9 2.8 2.9 3.9 3.8 3.9 5.1 2.8 6 1 6 0 5.2'],
    4: [4, '3 6 3 0 0 4.2 4 4.2'],
    5: [3.8, '3.8 0 0.4 0 0.2 2.8|~0.2 2.8 1.4 2.3 2.8 2.3 3.8 3.3 3.8 5 2.8 6 1 6 0 5.2'],
    6: [3.8, '~3.6 0.5 2.8 0 1.2 0 0 1.5 0 4.6 1 6 2.8 6 3.8 5 3.8 3.7 2.8 2.7 1 2.7 0 3.7'],
    7: [3.8, '0 0 3.8 0 1.4 6'],
    8: [3.8, '~1.9 2.9 0.5 2.3 0.4 0.9 1.2 0 2.6 0 3.4 0.9 3.3 2.3 1.9 2.9 0.4 3.7 0 5 1 6 2.8 6 3.8 5 3.4 3.7 1.9 2.9'],
    9: [3.8, '~3.8 2.3 2.8 3.3 1 3.3 0 2.3 0 1 1 0 2.8 0 3.8 1 3.8 4.5 2.8 6 1 6 0.2 5.4'],
    ',': [1, '0.6 5.3 0.6 6 0.1 7'],
    ' ': [2.4, ''],
  };

  function chaikin(points, iterations) {
    let pts = points;
    for (let it = 0; it < iterations; it++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
        out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  function oval(width) {
    const rx = width / 2, ry = CAP / 2;
    const pts = [];
    const start = -1.9; // a little past the top, so the loop overlaps like a real pen
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = start - (i / n) * (Math.PI * 2 + 0.35);
      pts.push([rx + rx * Math.cos(a), ry + ry * Math.sin(a)]);
    }
    return pts;
  }

  function parseGlyph(width, spec) {
    if (!spec) return [];
    return spec.split('|').map((part) => {
      if (part === '@O') return oval(width);
      const smooth = part[0] === '~';
      const nums = (smooth ? part.slice(1) : part).trim().split(/\s+/).map(Number);
      const pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
      return smooth ? chaikin(pts, 2) : pts;
    });
  }

  const GLYPHS = {};
  for (const ch of Object.keys(RAW)) {
    const [w, spec] = RAW[ch];
    GLYPHS[ch] = { width: w, strokes: parseGlyph(w, spec) };
  }

  // Lay out a line of text, centred on centerX with its cap top at `top`.
  function layoutText(text, { capHeight, centerX, top, maxWidth, letterSpacing = 1.5 }) {
    const chars = [...text.toUpperCase()].map((ch) => GLYPHS[ch] || GLYPHS[' ']);
    let units = 0;
    chars.forEach((g, i) => { units += g.width + (i < chars.length - 1 ? letterSpacing : 0); });
    let k = capHeight / CAP;
    if (maxWidth && units * k > maxWidth) k = maxWidth / units;
    const left = centerX - (units * k) / 2;
    const strokes = [];
    let x = 0;
    for (const g of chars) {
      for (const s of g.strokes) strokes.push(s.map((p) => [left + (x + p[0]) * k, top + p[1] * k]));
      x += g.width + letterSpacing;
    }
    return { strokes, left, right: left + units * k, baseline: top + CAP * k, scale: k };
  }

  SC.strokeFont = { CAP, GLYPHS, layoutText };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
