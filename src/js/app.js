/* Application wiring: settings → clock manager → artwork → renderer/animator.
 *
 * Keyboard: Space pauses/resumes animation, R redraws the current minute.
 * Test hooks (query string): ?at=2026-10-13T23:59:50 runs the clock from that
 * moment (still ticking in real time), ?static=1 skips animation, ?24h=1. */
(function (SC) {
  'use strict';

  async function main() {
    const params = new URLSearchParams(location.search);
    let settings = await SC.settings.load(params);

    let offset = 0;
    if (params.has('at')) {
      const target = new Date(params.get('at'));
      if (!Number.isNaN(target.getTime())) offset = target.getTime() - Date.now();
    }
    const now = () => new Date(Date.now() + offset);
    const staticMode = params.get('static') === '1';

    const svg = document.getElementById('canvas');
    const layer = document.getElementById('layer');
    const animator = new SC.animation.DrawingAnimator();
    const state = { handles: null, token: 0, paused: settings.animationPaused };
    if (state.paused) animator.pause();

    const vb = SC.artwork.viewBox();
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

    function applyTheme() {
      const root = document.documentElement.style;
      root.setProperty('--paper', settings.paperColor);
      root.setProperty('--ink', settings.inkColor);
    }
    applyTheme();

    async function show(date, animate) {
      const token = ++state.token;
      animator.cancel();
      const model = SC.artwork.buildArtwork(date, settings);
      const previous = state.handles;
      state.handles = null;
      const doAnimate = animate && !staticMode && !state.paused && !document.hidden && settings.drawDurationMs > 0;
      if (previous) {
        if (doAnimate) await animator.erase(previous, settings.eraseDurationMs);
        previous.group.remove();
        if (token !== state.token) return; // a newer minute took over mid-erase
      }
      const handles = SC.renderer.render(layer, model);
      state.handles = handles;
      svg.setAttribute('aria-label', model.label);
      document.title = model.label;
      if (doAnimate) animator.play(handles, SC.animation.buildTimeline(model, settings), { showPen: settings.showPen });
      else SC.renderer.finishAll(handles);
    }

    const clock = new SC.ClockManager({ now, onMinute: (date) => show(date, true) });
    clock.start();

    function setPaused(paused) {
      state.paused = paused;
      if (paused) animator.pause(); else animator.resume();
      settings.animationPaused = paused;
      SC.settings.save({ animationPaused: paused });
    }

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); setPaused(!state.paused); }
      if (e.code === 'KeyR') show(now(), true);
    });

    const host = SC.settings.host;
    if (host) {
      host.on('clock:resync', () => clock.resync());
      host.on('clock:redraw', () => show(now(), true));
      host.on('clock:set-paused', (paused) => setPaused(!!paused));
      host.on('settings:changed', (raw) => {
        settings = SC.settings.sanitize(raw);
        if (settings.animationPaused !== state.paused) setPaused(settings.animationPaused);
        applyTheme();
        show(now(), true);
      });
    }
  }

  main().catch((e) => console.error(e));
})((globalThis.SketchClock = globalThis.SketchClock || {}));
