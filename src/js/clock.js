/* Clock and date manager.
 *
 * The system clock is the only source of truth. A timeout is aimed at the
 * next minute boundary, and a cheap 1 s watchdog compares the current minute
 * key with the last one drawn. That catches timer drift, sleep/wake, clock
 * changes and throttled timers. Nothing ever counts minutes; every check
 * reads the current time. */
(function (SC) {
  'use strict';

  class ClockManager {
    constructor({ now = () => new Date(), onMinute, watchdogMs = 1000 }) {
      this.now = now;
      this.onMinute = onMinute;
      this.watchdogMs = watchdogMs;
      this.lastKey = null;
      this.timer = 0;
      this.watchdog = 0;
      this.resync = this.resync.bind(this);
    }

    start() {
      this.check();
      this.schedule();
      this.watchdog = setInterval(() => this.check(), this.watchdogMs);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.resync(); });
        window.addEventListener('focus', this.resync);
      }
    }

    stop() {
      clearTimeout(this.timer);
      clearInterval(this.watchdog);
    }

    // Returns true if the minute changed (or this is the first check).
    check() {
      const date = this.now();
      const key = SC.format.minuteKey(date);
      if (key === this.lastKey) return false;
      const initial = this.lastKey === null;
      this.lastKey = key;
      this.onMinute(date, { initial, key });
      return true;
    }

    schedule() {
      clearTimeout(this.timer);
      const delay = SC.format.msUntilNextMinute(this.now()) + 20;
      this.timer = setTimeout(() => {
        this.check();
        this.schedule();
      }, delay);
    }

    // Called after wake from sleep, unlock or when the window becomes visible.
    resync() {
      this.check();
      this.schedule();
    }
  }

  SC.ClockManager = ClockManager;
})((globalThis.SketchClock = globalThis.SketchClock || {}));
