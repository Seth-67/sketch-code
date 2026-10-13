/* Vector geometry helpers: a small SVG path-data parser (absolute M/L/H/V/C/Z),
 * uniform sampling of subpaths into dense polylines, and polygon utilities. */
(function (SC) {
  'use strict';

  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

  function parsePathData(d) {
    const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    const subpaths = [];
    let current = null;
    let cmd = null;
    let pos = [0, 0];
    let i = 0;
    const num = () => parseFloat(tokens[i++]);

    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) {
        cmd = tokens[i++];
        if (cmd === 'Z' || cmd === 'z') {
          if (current) current.closed = true;
          continue;
        }
        if (cmd !== cmd.toUpperCase()) throw new Error('Only absolute path commands are supported: ' + cmd);
      }
      switch (cmd) {
        case 'M':
          pos = [num(), num()];
          current = { start: pos, segments: [], closed: false };
          subpaths.push(current);
          cmd = 'L'; // implicit lineto after moveto
          break;
        case 'L':
          pos = [num(), num()];
          current.segments.push({ type: 'L', to: pos });
          break;
        case 'H':
          pos = [num(), pos[1]];
          current.segments.push({ type: 'L', to: pos });
          break;
        case 'V':
          pos = [pos[0], num()];
          current.segments.push({ type: 'L', to: pos });
          break;
        case 'C': {
          const c1 = [num(), num()];
          const c2 = [num(), num()];
          pos = [num(), num()];
          current.segments.push({ type: 'C', c1, c2, to: pos });
          break;
        }
        default:
          throw new Error('Unsupported path command: ' + cmd);
      }
    }
    return subpaths;
  }

  function cubicPoint(p0, c1, c2, p1, t) {
    const mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, e = t * t * t;
    return [
      a * p0[0] + b * c1[0] + c * c2[0] + e * p1[0],
      a * p0[1] + b * c1[1] + c * c2[1] + e * p1[1],
    ];
  }

  // Sample a subpath every ~step units. Segment endpoints (corners) are kept
  // exactly. Closed subpaths are returned without a duplicated final point.
  function sampleSubpath(sub, step) {
    const pts = [sub.start.slice()];
    let pos = sub.start;
    const segments = sub.segments.slice();
    if (sub.closed && dist(segments.length ? segments[segments.length - 1].to : pos, sub.start) > 1e-6) {
      segments.push({ type: 'L', to: sub.start });
    }
    for (const seg of segments) {
      if (seg.type === 'L') {
        const n = Math.max(1, Math.ceil(dist(pos, seg.to) / step));
        for (let k = 1; k <= n; k++) {
          const t = k / n;
          pts.push([pos[0] + (seg.to[0] - pos[0]) * t, pos[1] + (seg.to[1] - pos[1]) * t]);
        }
      } else {
        const est = dist(pos, seg.c1) + dist(seg.c1, seg.c2) + dist(seg.c2, seg.to);
        const n = Math.max(4, Math.ceil(est / step));
        for (let k = 1; k <= n; k++) pts.push(cubicPoint(pos, seg.c1, seg.c2, seg.to, k / n));
      }
      pos = seg.to;
    }
    if (sub.closed && pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
    return pts.filter((p, k) => k === 0 || dist(p, pts[k - 1]) > 1e-9);
  }

  // Positive in screen space (y down) means visually clockwise.
  function signedArea(pts) {
    let sum = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      sum += p[0] * q[1] - q[0] * p[1];
    }
    return sum / 2;
  }

  // Even-odd point-in-polygon across all contours (holes are handled naturally).
  function pointInContours(pt, contours) {
    let inside = false;
    for (const c of contours) {
      for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
        const a = c[i], b = c[j];
        if ((a[1] > pt[1]) !== (b[1] > pt[1]) &&
            pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  function bounds(pointLists) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const list of pointLists) {
      for (const p of list) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
    }
    return { minX, minY, maxX, maxY };
  }

  SC.geometry = { dist, parsePathData, sampleSubpath, signedArea, pointInContours, bounds };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
