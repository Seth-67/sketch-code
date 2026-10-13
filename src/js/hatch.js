/* Diagonal hatching engine.
 *
 * Fills any set of contours (outer silhouette plus holes) with parallel
 * stripes. Each stripe line is intersected analytically with every contour
 * edge; sorting the crossings and pairing them even-odd yields exactly the
 * spans that lie inside the ink, so holes are skipped and nothing leaks
 * outside the outline. Stripes are returned in boustrophedon order (back and
 * forth) so they animate like a hand hatching a shape.
 */
(function (SC) {
  'use strict';

  const DEFAULTS = {
    spacing: 4.2,       // distance between stripes
    angle: 45,          // degrees; 45 = "/" stripes like the reference
    inset: 0.45,        // keep stripe ends this far inside the outline
    endJitter: 0.9,     // random extra shortening at each end
    spacingJitter: 0.12, // +/- fraction of spacing
    bow: 0.35,          // max sideways bulge of each stripe
    minLength: 1.2,
  };

  function generate(contours, options, rand) {
    const o = Object.assign({}, DEFAULTS, options);
    const ang = (o.angle * Math.PI) / 180;
    const u = [Math.cos(ang), -Math.sin(ang)]; // along a stripe
    const v = [Math.sin(ang), Math.cos(ang)];  // across stripes
    const along = (p) => p[0] * u[0] + p[1] * u[1];
    const across = (p) => p[0] * v[0] + p[1] * v[1];

    let smin = Infinity, smax = -Infinity;
    for (const c of contours) for (const p of c) { const s = across(p); smin = Math.min(smin, s); smax = Math.max(smax, s); }

    const segments = [];
    let s = smin + o.spacing * rand.range(0.35, 0.9);
    let line = 0;
    while (s < smax) {
      const crossings = [];
      for (const c of contours) {
        for (let i = 0; i < c.length; i++) {
          const p = c[i], q = c[(i + 1) % c.length];
          const sp = across(p), sq = across(q);
          if ((sp <= s) !== (sq <= s)) {
            const f = (s - sp) / (sq - sp);
            crossings.push(along(p) + (along(q) - along(p)) * f);
          }
        }
      }
      crossings.sort((a, b) => a - b);
      const spans = [];
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const t0 = crossings[i] + o.inset + rand.range(0, o.endJitter);
        const t1 = crossings[i + 1] - o.inset - rand.range(0, o.endJitter);
        if (t1 - t0 >= o.minLength) spans.push([t0, t1]);
      }
      if (line % 2 === 1) { spans.reverse(); spans.forEach((sp) => sp.reverse()); }
      for (const [t0, t1] of spans) {
        const a = [t0 * u[0] + s * v[0], t0 * u[1] + s * v[1]];
        const b = [t1 * u[0] + s * v[0], t1 * u[1] + s * v[1]];
        const bow = rand.signed(o.bow);
        const c = [(a[0] + b[0]) / 2 + v[0] * bow, (a[1] + b[1]) / 2 + v[1] * bow];
        segments.push({ a, b, c, line, length: Math.abs(t1 - t0) });
      }
      s += o.spacing * (1 + rand.signed(o.spacingJitter));
      line++;
    }
    return segments;
  }

  SC.hatch = { DEFAULTS, generate };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
