/* Composition and layout: turns a Date into a complete, renderer-agnostic
 * artwork model (continuous main route, hatch stripes, date strokes and the
 * view box). Pure computation, no DOM, deterministic per minute. */
(function (SC) {
  'use strict';

  const BASE_Y = 100;
  const LAYOUT = {
    digitWidth: SC.digits.GLYPH_WIDTH,
    digitGap: 13,
    colonWidth: 18,
    colonGap: 10,
    padX: 34,
    padTop: 30,
    padBottom: 24,
    dateGap: 25,
    dateCapHeight: 10,
  };
  const STEP = 1.1;

  function layoutItems(text) {
    const items = [];
    let x = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (i > 0) x += ch === ':' || text[i - 1] === ':' ? LAYOUT.colonGap : LAYOUT.digitGap;
      const w = ch === ':' ? LAYOUT.colonWidth : LAYOUT.digitWidth;
      items.push({ ch, x, w });
      x += w;
    }
    return { items, width: x };
  }

  // The composition is always sized for the widest time ("00:00"), so the
  // drawing never rescales or shifts when the hour gains a digit.
  const FULL_WIDTH = layoutItems('00:00').width;

  function viewBox() {
    const dateBottom = BASE_Y + LAYOUT.dateGap + LAYOUT.dateCapHeight * (7 / 6);
    return {
      x: -LAYOUT.padX,
      y: -LAYOUT.padTop,
      w: FULL_WIDTH + LAYOUT.padX * 2,
      h: LAYOUT.padTop + dateBottom + LAYOUT.padBottom,
    };
  }

  // Small per-minute personality: a hair of scale and tilt, then re-seated on the baseline.
  function placeGlyph(clean, x, rand) {
    const s = 1 + rand.signed(0.012);
    const rot = (rand.signed(0.7) * Math.PI) / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const px = LAYOUT.digitWidth / 2, py = BASE_Y;
    const map = (p) => {
      const dx = (p[0] - px) * s, dy = (p[1] - py) * s;
      return [px + dx * cos - dy * sin + x, py + dx * sin + dy * cos];
    };
    const outer = clean.outer.map(map);
    const holes = clean.holes.map((h) => h.map(map));
    let maxY = -Infinity;
    for (const p of outer) maxY = Math.max(maxY, p[1]);
    const shift = BASE_Y - maxY;
    for (const c of [outer, ...holes]) for (const p of c) p[1] += shift;
    return { outer, holes };
  }

  function buildArtwork(date, settings) {
    const parts = SC.format.getTimeParts(date, settings);
    const key = SC.format.minuteKey(date);
    const rand = SC.rng.createRandom('sketch-clock|' + key);
    const passes = Math.max(1, Math.min(3, Math.round(settings.passes)));
    const hatchAngle = settings.hatchAngle + rand.signed(1.5);
    const layout = layoutItems(parts.text);
    const offsetX = (FULL_WIDTH - layout.width) / 2;

    // ---- 1. The single continuous pen route, as ordered sections ----------
    const sections = [];
    let pen = [offsetX - rand.range(10, 22), BASE_Y + rand.signed(0.5)];
    const add = (kind, pts, meta) => {
      if (pts.length < 2) return;
      sections.push(Object.assign({ kind, points: pts }, meta));
      pen = pts[pts.length - 1];
    };
    const travel = (to) => {
      if (SC.geometry.dist(pen, to) < 0.05) return;
      add('baseline', SC.route.lineTo([pen], to, STEP));
    };

    const glyphs = [];
    for (const item of layout.items) {
      if (item.ch === ':') {
        const cx = offsetX + item.x + item.w / 2;
        travel([cx - rand.range(8, 11), BASE_Y]);
        add('colon', SC.route.colonLoop(pen, cx, BASE_Y, rand.range(8, 11), rand, STEP));
        continue;
      }
      const g = placeGlyph(SC.digits.getContours(item.ch, STEP), offsetX + item.x, rand);
      const entry = SC.route.findEntryIndex(g.outer);
      travel(g.outer[entry]);
      const loop = SC.route.glyphLoop(g.outer, g.holes, entry, { step: STEP, hatchAngle });
      const glyphIndex = glyphs.length;
      for (let p = 0; p < passes; p++) add('glyph', loop.map((pt) => pt.slice()), { glyphIndex, pass: p });
      glyphs.push({ ch: item.ch, outer: g.outer, holes: g.holes });
    }
    travel([offsetX + layout.width + rand.range(12, 22), BASE_Y + rand.signed(0.5)]);

    // ---- 2. Concatenate, add hand tremor, split back into stroked chunks ---
    const flat = [];
    for (const sec of sections) {
      sec.startIdx = flat.length ? flat.length - 1 : 0;
      for (let i = flat.length ? 1 : 0; i < sec.points.length; i++) flat.push(sec.points[i]);
      sec.endIdx = flat.length - 1;
    }
    const points = SC.route.applyWobble(flat, rand.fork('wobble'), { amplitude: 1.1 * settings.wobble, scale: 34 });
    const cum = SC.route.cumulativeLengths(points);
    const widthRand = rand.fork('width');
    const chunks = sections.map((sec) => {
      let factor;
      if (sec.kind === 'glyph') factor = sec.pass === 0 ? 1 + widthRand.signed(0.1) : 0.74 - 0.1 * (sec.pass - 1) + widthRand.signed(0.08);
      else if (sec.kind === 'colon') factor = 0.88 + widthRand.signed(0.06);
      else factor = 0.92 + widthRand.signed(0.08);
      return {
        kind: sec.kind,
        glyphIndex: sec.glyphIndex,
        pass: sec.pass,
        points: points.slice(sec.startIdx, sec.endIdx + 1),
        start: cum[sec.startIdx],
        length: cum[sec.endIdx] - cum[sec.startIdx],
        width: settings.lineWidth * factor,
      };
    });
    glyphs.forEach((g, gi) => {
      const own = chunks.filter((c) => c.kind === 'glyph' && c.glyphIndex === gi);
      g.passOneEnd = own[0].start + own[0].length;
      g.end = own[own.length - 1].start + own[own.length - 1].length;
    });

    // ---- 3. Hatching, one set per digit ------------------------------------
    const spacing = settings.hatchSpacing * (1 + rand.signed(0.06));
    const hatch = glyphs.map((g, gi) => ({
      glyphIndex: gi,
      segments: SC.hatch.generate([g.outer, ...g.holes], { spacing, angle: hatchAngle }, rand.fork('hatch' + gi)),
    }));

    // ---- 4. Date line in single-stroke lettering ---------------------------
    const dateText = SC.format.formatDate(date);
    const text = SC.strokeFont.layoutText(dateText, {
      capHeight: LAYOUT.dateCapHeight,
      centerX: FULL_WIDTH / 2,
      top: BASE_Y + LAYOUT.dateGap,
      maxWidth: FULL_WIDTH - 64,
    });
    const dashY = text.baseline + 0.4;
    const dateRaw = [
      [[text.left - 26, dashY + rand.signed(0.4)], [text.left - 6, dashY]],
      ...text.strokes,
      [[text.right + 6, dashY], [text.right + 26, dashY + rand.signed(0.4)]],
    ];
    const dateRand = rand.fork('date');
    const dateStrokes = dateRaw.map((stroke) => {
      const pts = SC.route.applyWobble(SC.route.resample(stroke, 0.6), dateRand, { amplitude: 0.35 * settings.wobble, scale: 6 });
      const c = SC.route.cumulativeLengths(pts);
      return { points: pts, length: c[c.length - 1], width: settings.lineWidth * (0.66 + dateRand.signed(0.05)) };
    });
    // Little end dots on the dashes, like the reference.
    for (const x of [text.left - 28.5, text.right + 28.5]) {
      const pts = SC.route.arcTo([[x + 0.8, dashY]], [x, dashY], 0.8, 0, Math.PI * 2, 0.3);
      dateStrokes.push({ points: pts, length: Math.PI * 1.6, width: settings.lineWidth * 1.1 });
    }

    return {
      key,
      timeText: parts.text,
      dateText,
      label: `${parts.text}${settings.use24Hour ? '' : parts.isPM ? ' PM' : ' AM'}, ${dateText}`,
      viewBox: viewBox(),
      main: { chunks, points, cum, total: cum[cum.length - 1] },
      glyphs,
      hatch,
      hatchWidth: settings.hatchWidth,
      date: { strokes: dateStrokes },
    };
  }

  SC.artwork = { BASE_Y, LAYOUT, FULL_WIDTH, layoutItems, viewBox, buildArtwork };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
