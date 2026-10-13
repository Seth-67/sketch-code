/* Drawing animation controller.
 *
 * Timeline (default ~4 s):
 *   - The main pen runs the whole continuous route with a trapezoidal speed
 *     profile: smooth start, constant mechanical speed, smooth stop.
 *   - As soon as the pen finishes the first lap of a digit, that digit's
 *     hatching is scribbled in, back and forth, while the pen retraces it.
 *   - The date is lettered by a second, quicker pen during the last part.
 * The erase is an Etch A Sketch style shake that fades the old drawing.
 * Requires requestAnimationFrame; it only runs while something is moving.
 */
(function (SC) {
  'use strict';

  function trapezoid(x, a) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const v = 1 / (1 - a);
    if (x < a) return (v * x * x) / (2 * a);
    if (x > 1 - a) return 1 - (v * (1 - x) * (1 - x)) / (2 * a);
    return v * (x - a / 2);
  }

  function sequence(items, lengthOf, t0, duration, gapShare) {
    const total = items.reduce((sum, it) => sum + lengthOf(it), 0) || 1;
    const gap = items.length > 1 ? (duration * gapShare) / (items.length - 1) : 0;
    const drawTime = duration * (items.length > 1 ? 1 - gapShare : 1);
    let t = t0;
    return items.map((it) => {
      const span = (drawTime * lengthOf(it)) / total;
      const slot = { t0: t, t1: t + span };
      t += span + gap;
      return slot;
    });
  }

  function buildTimeline(model, settings) {
    const T = Math.max(300, settings.drawDurationMs);
    const total = model.main.total;
    const ease = (x) => trapezoid(x, 0.08);
    const timeForLength = (len) => {
      let lo = 0, hi = 1;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        if (ease(mid) * total < len) lo = mid; else hi = mid;
      }
      return hi * T;
    };
    const hatch = model.hatch.map((set) => {
      const g = model.glyphs[set.glyphIndex];
      const t0 = timeForLength(g.passOneEnd);
      const duration = Math.max(T * 0.15, timeForLength(g.end) - t0 + T * 0.08);
      return sequence(set.segments, (s) => s.length, t0, duration, 0.25);
    });
    const dateStart = T * 0.55;
    const date = sequence(model.date.strokes, (s) => s.length, dateStart, settings.dateDurationMs, 0.2);
    let end = T;
    for (const set of hatch) if (set.length) end = Math.max(end, set[set.length - 1].t1);
    if (date.length) end = Math.max(end, date[date.length - 1].t1);
    return { T, total, ease, hatch, date, end };
  }

  class DrawingAnimator {
    constructor() {
      this.raf = 0;
      this.job = null;
      this.paused = false;
      this.erasing = null;
    }

    get running() {
      return !!this.job;
    }

    play(handles, timeline, { showPen = true } = {}) {
      this.cancel();
      this.job = { handles, timeline, showPen, t0: performance.now(), pausedAt: null };
      if (this.paused) this.job.pausedAt = this.job.t0;
      else this.raf = requestAnimationFrame((now) => this.frame(now));
    }

    frame(now) {
      const job = this.job;
      if (!job) return;
      const { handles, timeline: tl } = job;
      const t = now - job.t0;
      const R = SC.renderer;

      const len = tl.ease(Math.min(1, t / tl.T)) * tl.total;
      for (const h of handles.main) if (h.state !== 2) R.setProgress(h, (len - h.start) / (h.length || 1));
      R.setPen(handles, job.showPen && t < tl.T ? SC.route.pointAtLength(handles.model.main.points, handles.model.main.cum, len) : null);

      handles.hatch.forEach((set, gi) => {
        const slots = tl.hatch[gi];
        for (let i = 0; i < set.length; i++) {
          if (set[i].state !== 2) R.setProgress(set[i], (t - slots[i].t0) / (slots[i].t1 - slots[i].t0 || 1));
        }
      });
      handles.date.forEach((h, i) => {
        if (h.state !== 2) R.setProgress(h, (t - tl.date[i].t0) / (tl.date[i].t1 - tl.date[i].t0 || 1));
      });

      if (t >= tl.end) {
        R.finishAll(handles);
        this.job = null;
        this.raf = 0;
        return;
      }
      this.raf = requestAnimationFrame((n) => this.frame(n));
    }

    pause() {
      this.paused = true;
      if (this.job && this.job.pausedAt === null) {
        this.job.pausedAt = performance.now();
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
    }

    resume() {
      this.paused = false;
      if (this.job && this.job.pausedAt !== null) {
        this.job.t0 += performance.now() - this.job.pausedAt;
        this.job.pausedAt = null;
        this.raf = requestAnimationFrame((now) => this.frame(now));
      }
    }

    // Jump the current drawing to its finished state.
    finish() {
      if (this.job) SC.renderer.finishAll(this.job.handles);
      this.cancel();
    }

    cancel() {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.job = null;
      if (this.erasing) {
        cancelAnimationFrame(this.erasing.raf);
        const done = this.erasing.resolve;
        this.erasing = null;
        done();
      }
    }

    // Shake-to-clear: a damped side-to-side shake while the ink fades out.
    erase(handles, duration) {
      SC.renderer.setPen(handles, null);
      if (duration <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        const g = handles.group;
        const start = performance.now();
        const state = { raf: 0, resolve };
        this.erasing = state;
        // If frames stop (window not painting), never hold the new minute back.
        const fallback = setTimeout(() => step(start + duration), duration + 150);
        const step = (now) => {
          if (this.erasing !== state) return;
          const x = Math.min(1, (now - start) / duration);
          const decay = 1 - x;
          const dx = Math.sin(x * Math.PI * 2 * 4.5) * 6 * decay;
          const dy = Math.sin(x * Math.PI * 2 * 3.1 + 1) * 1.4 * decay;
          g.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
          g.style.opacity = String(1 - x * x);
          if (x >= 1) {
            clearTimeout(fallback);
            cancelAnimationFrame(state.raf);
            this.erasing = null;
            resolve();
          } else {
            state.raf = requestAnimationFrame(step);
          }
        };
        state.raf = requestAnimationFrame(step);
      });
    }
  }

  SC.animation = { trapezoid, buildTimeline, DrawingAnimator };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
