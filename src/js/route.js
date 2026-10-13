/* Continuous-path generator.
 *
 * Builds the single pen route that draws the whole time display:
 *
 *   start ── baseline ──▶ entry of digit 1 ─▶ trace outline (with detours
 *   into every counter) ─▶ back to entry ─▶ retrace (second pass) ─▶ along
 *   the baseline ─▶ colon (tail up, lower dot, stem, upper dot, back down,
 *   tail out) ─▶ next digit ... ─▶ end of baseline.
 *
 * Each digit is entered and exited at the lowest-left point of its silhouette,
 * which sits on the shared baseline, so the pen never has to lift. Counters
 * (holes in 0, 4, 6, 8, 9) are reached through a short "bridge" stroke that is
 * chosen to run parallel to the hatching, so it reads as one more stripe.
 */
(function (SC) {
  'use strict';

  const { dist } = SC.geometry;

  function lineTo(points, to, step) {
    const from = points[points.length - 1];
    const n = Math.max(1, Math.ceil(dist(from, to) / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    }
    return points;
  }

  function quadTo(points, c, to, step) {
    const from = points[points.length - 1];
    const n = Math.max(2, Math.ceil((dist(from, c) + dist(c, to)) / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n, mt = 1 - t;
      points.push([
        mt * mt * from[0] + 2 * mt * t * c[0] + t * t * to[0],
        mt * mt * from[1] + 2 * mt * t * c[1] + t * t * to[1],
      ]);
    }
    return points;
  }

  // Arc around `center`; angles in radians, y down (PI/2 = bottom, PI = left).
  function arcTo(points, center, r, a0, a1, step) {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / step));
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      points.push([center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)]);
    }
    return points;
  }

  // Lowest point of the silhouette; among near-ties take the leftmost.
  function findEntryIndex(outer) {
    let maxY = -Infinity;
    for (const p of outer) maxY = Math.max(maxY, p[1]);
    let best = -1;
    outer.forEach((p, i) => {
      if (p[1] >= maxY - 0.6 && (best < 0 || p[0] < outer[best][0])) best = i;
    });
    return best;
  }

  function segmentInside(a, b, contours) {
    for (let k = 1; k < 12; k++) {
      const t = k / 12;
      if (!SC.geometry.pointInContours([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], contours)) return false;
    }
    return true;
  }

  // Pick where the pen crosses from the silhouette into a counter. Short
  // bridges that run along the hatch direction score best, and the bridge must
  // stay inside the ink so it never crosses a hole or open paper.
  function chooseBridge(outer, hole, contours, hatchAngleDeg) {
    const ang = (hatchAngleDeg * Math.PI) / 180;
    const ux = Math.cos(ang), uy = -Math.sin(ang);
    const so = Math.max(1, Math.floor(outer.length / 180));
    const sh = Math.max(1, Math.floor(hole.length / 90));
    const candidates = [];
    for (let i = 0; i < outer.length; i += so) {
      for (let j = 0; j < hole.length; j += sh) {
        const dx = hole[j][0] - outer[i][0], dy = hole[j][1] - outer[i][1];
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) continue;
        const align = Math.abs(dx * ux + dy * uy) / d;
        candidates.push({ i, j, d, score: d / (0.3 + 0.7 * align * align) });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    for (let k = 0; k < Math.min(240, candidates.length); k++) {
      const c = candidates[k];
      if (segmentInside(outer[c.i], hole[c.j], contours)) return c;
    }
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0];
  }

  // One full lap of a digit: starts and ends at outer[entry], visiting every counter.
  function glyphLoop(outer, holes, entry, { step, hatchAngle }) {
    const contours = [outer, ...holes];
    const bridges = new Map();
    for (const hole of holes) {
      const b = chooseBridge(outer, hole, contours, hatchAngle);
      if (!bridges.has(b.i)) bridges.set(b.i, []);
      bridges.get(b.i).push({ hole, j: b.j });
    }
    const n = outer.length;
    const pts = [outer[entry].slice()];
    for (let k = 1; k <= n; k++) {
      const idx = (entry + k) % n;
      pts.push(outer[idx].slice());
      const detours = bridges.get(idx);
      if (!detours) continue;
      for (const { hole, j } of detours) {
        lineTo(pts, hole[j], step);
        for (let m = 1; m <= hole.length; m++) pts.push(hole[(j + m) % hole.length].slice());
        lineTo(pts, outer[idx], step);
      }
    }
    return pts;
  }

  // The colon: a tail rises from the baseline into the lower dot, a stem joins
  // the two dots, and a second tail drops back to the baseline on the right.
  function colonLoop(start, cx, baseY, tailOut, rand, step) {
    const r = 5 + rand.signed(0.35);
    const lower = [cx + rand.signed(0.6), 68 + rand.signed(0.8)];
    const upper = [cx + rand.signed(0.6), 31 + rand.signed(0.8)];
    const pts = [start.slice()];
    quadTo(pts, [cx - 1 + rand.signed(1.2), baseY - 3.5], [lower[0], lower[1] + r], step);
    arcTo(pts, lower, r, Math.PI / 2, (3 * Math.PI) / 2, step);
    lineTo(pts, [upper[0], upper[1] + r], step);
    arcTo(pts, upper, r, Math.PI / 2, Math.PI / 2 + Math.PI * 2, step);
    lineTo(pts, [lower[0], lower[1] - r], step);
    arcTo(pts, lower, r, (3 * Math.PI) / 2, (5 * Math.PI) / 2, step);
    quadTo(pts, [cx + 1 + rand.signed(1.2), baseY - 3.5], [cx + tailOut, baseY], step);
    return pts;
  }

  // Hand tremor: offset each point by a smooth 2D drift indexed by distance
  // travelled. Because it depends only on arc length (not on direction) it
  // stays continuous through sharp corners and reversals. Retraced passes sit
  // at a different arc length, so they drift differently and read as separate
  // thin lines.
  function applyWobble(points, rand, { amplitude = 1, scale = 34, detail = 0.28 } = {}) {
    const lowX = SC.rng.createNoise1D(rand), lowY = SC.rng.createNoise1D(rand);
    const highX = SC.rng.createNoise1D(rand), highY = SC.rng.createNoise1D(rand);
    const offset = rand.range(0, 200);
    const out = new Array(points.length);
    let s = 0;
    for (let i = 0; i < points.length; i++) {
      if (i > 0) s += dist(points[i - 1], points[i]);
      const lo = offset + s / scale, hi = offset + s / (scale * 0.18);
      const dx = (1 - detail) * lowX(lo) + detail * highX(hi);
      const dy = (1 - detail) * lowY(lo) + detail * highY(hi);
      out[i] = [points[i][0] + amplitude * dx, points[i][1] + amplitude * dy];
    }
    return out;
  }

  function cumulativeLengths(points) {
    const cum = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) cum[i] = cum[i - 1] + dist(points[i - 1], points[i]);
    return cum;
  }

  function pointAtLength(points, cum, len) {
    if (len <= 0) return points[0];
    const last = points.length - 1;
    if (len >= cum[last]) return points[last];
    let lo = 0, hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < len) lo = mid; else hi = mid;
    }
    const span = cum[hi] - cum[lo] || 1;
    const t = (len - cum[lo]) / span;
    return [points[lo][0] + (points[hi][0] - points[lo][0]) * t, points[lo][1] + (points[hi][1] - points[lo][1]) * t];
  }

  function resample(points, step) {
    const cum = cumulativeLengths(points);
    const total = cum[cum.length - 1];
    const n = Math.max(1, Math.ceil(total / step));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(pointAtLength(points, cum, (total * i) / n));
    return out;
  }

  SC.route = {
    lineTo, quadTo, arcTo, findEntryIndex, chooseBridge, glyphLoop, colonLoop,
    applyWobble, cumulativeLengths, pointAtLength, resample,
  };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
