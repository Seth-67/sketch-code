/* Test gallery: renders a set of edge-case times side by side. */
(function (SC) {
  'use strict';

  const CASES = [
    ['2025-10-14T16:37', {}],
    ['2026-10-13T00:00', {}],
    ['2026-10-13T00:00', { use24Hour: true }],
    ['2026-10-13T23:59', {}],
    ['2026-10-14T00:00', {}],
    ['2026-10-13T11:11', {}],
    ['2026-10-13T10:08', {}],
    ['2026-10-13T08:08', {}],
    ['2026-10-13T06:06', {}],
    ['2026-10-13T09:59', {}],
    ['2026-10-13T12:00', {}],
    ['2026-10-13T13:45', {}],
    ['2026-10-13T02:22', {}],
    ['2026-10-13T19:50', { use24Hour: true }],
    ['2026-09-30T05:47', {}],
    ['2026-10-13T03:29', {}],
  ];

  const grid = document.getElementById('grid');
  const vb = SC.artwork.viewBox();
  const animator = new SC.animation.DrawingAnimator();

  for (const [iso, overrides] of CASES) {
    const settings = Object.assign({}, SC.settings.DEFAULTS, overrides);
    const date = new Date(iso);
    const fig = document.createElement('figure');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(layer);
    const caption = document.createElement('figcaption');
    fig.append(svg, caption);
    grid.appendChild(fig);

    let handles = null;
    const draw = (animate) => {
      if (handles) handles.group.remove();
      const t0 = performance.now();
      const model = SC.artwork.buildArtwork(date, settings);
      const ms = (performance.now() - t0).toFixed(1);
      handles = SC.renderer.render(layer, model);
      caption.textContent = `${model.label} · built in ${ms} ms`;
      if (animate) animator.play(handles, SC.animation.buildTimeline(model, settings));
      else SC.renderer.finishAll(handles);
    };
    draw(false);
    fig.addEventListener('click', () => draw(true));
  }
})((globalThis.SketchClock = globalThis.SketchClock || {}));
