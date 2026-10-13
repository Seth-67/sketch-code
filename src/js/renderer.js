/* SVG renderer: turns an artwork model into SVG paths that start fully
 * hidden. Each drawable is revealed by stroke-dashoffset with pathLength=1,
 * so progress is simply a 0..1 value per path. */
(function (SC) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const fmt = (n) => String(Math.round(n * 100) / 100);

  function make(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function polylineD(points) {
    let d = 'M' + fmt(points[0][0]) + ' ' + fmt(points[0][1]);
    for (let i = 1; i < points.length; i++) d += 'L' + fmt(points[i][0]) + ' ' + fmt(points[i][1]);
    return d;
  }

  function strokePath(d, width, parent) {
    const el = make('path', { d, pathLength: '1', 'stroke-width': fmt(width) }, parent);
    const h = { el, state: -1 };
    setProgress(h, 0);
    return h;
  }

  // state: 0 hidden, 1 partially drawn, 2 complete (dash attributes removed).
  function setProgress(h, p) {
    if (p <= 0) {
      if (h.state !== 0) {
        h.el.setAttribute('visibility', 'hidden');
        h.el.setAttribute('stroke-dasharray', '1 1');
        h.el.setAttribute('stroke-dashoffset', '1');
        h.state = 0;
      }
      return;
    }
    if (p >= 1) {
      if (h.state !== 2) {
        h.el.removeAttribute('visibility');
        h.el.removeAttribute('stroke-dasharray');
        h.el.removeAttribute('stroke-dashoffset');
        h.state = 2;
      }
      return;
    }
    if (h.state !== 1) {
      h.el.removeAttribute('visibility');
      h.el.setAttribute('stroke-dasharray', '1 1');
      h.state = 1;
    }
    h.el.setAttribute('stroke-dashoffset', (1 - p).toFixed(5));
  }

  // Builds the full drawing off-DOM, every stroke hidden, then attaches it in
  // one operation so nothing flickers.
  function render(layer, model) {
    const group = make('g', { class: 'artwork' });
    const hatchG = make('g', { class: 'ink hatch', 'stroke-width': fmt(model.hatchWidth) }, group);
    const mainG = make('g', { class: 'ink main' }, group);
    const dateG = make('g', { class: 'ink date' }, group);

    const hatch = model.hatch.map((set) =>
      set.segments.map((s) =>
        strokePath(`M${fmt(s.a[0])} ${fmt(s.a[1])}Q${fmt(s.c[0])} ${fmt(s.c[1])} ${fmt(s.b[0])} ${fmt(s.b[1])}`, model.hatchWidth, hatchG)));
    const main = model.main.chunks.map((c) =>
      Object.assign(strokePath(polylineD(c.points), c.width, mainG), { start: c.start, length: c.length }));
    const date = model.date.strokes.map((s) => strokePath(polylineD(s.points), s.width, dateG));

    const pen = make('g', { class: 'pen', visibility: 'hidden' }, group);
    make('circle', { r: '3.4', class: 'pen-ring' }, pen);
    make('circle', { r: '1.5', class: 'pen-tip' }, pen);

    layer.appendChild(group);
    return { group, main, hatch, date, pen, model };
  }

  function setPen(handles, point) {
    if (!point) {
      handles.pen.setAttribute('visibility', 'hidden');
      return;
    }
    handles.pen.removeAttribute('visibility');
    handles.pen.setAttribute('transform', `translate(${fmt(point[0])} ${fmt(point[1])})`);
  }

  function finishAll(handles) {
    for (const h of handles.main) setProgress(h, 1);
    for (const set of handles.hatch) for (const h of set) setProgress(h, 1);
    for (const h of handles.date) setProgress(h, 1);
    setPen(handles, null);
  }

  SC.renderer = { render, setProgress, setPen, finishAll, polylineD };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
