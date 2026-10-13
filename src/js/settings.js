/* Settings manager. There is no settings panel: values live in settings.json
 * (right-click > "Open settings file") and are validated here. Outside the
 * desktop shell (e.g. a plain browser) the defaults are used. */
(function (SC) {
  'use strict';

  const DEFAULTS = Object.freeze({
    use24Hour: false,
    animationPaused: false,
    drawDurationMs: 3800,  // main pen; 0 = draw instantly
    eraseDurationMs: 650,
    dateDurationMs: 1500,
    passes: 2,             // how many times the pen laps each digit
    lineWidth: 1.9,
    hatchSpacing: 4.2,
    hatchWidth: 1.15,
    hatchAngle: 45,
    wobble: 1,             // 0 = ruler straight, 1 = default hand, 2+ = shaky
    showPen: true,
    inkColor: '#1d1d1b',
    paperColor: '#dddbd4',
  });

  const LIMITS = {
    drawDurationMs: [0, 20000],
    eraseDurationMs: [0, 3000],
    dateDurationMs: [200, 6000],
    passes: [1, 3],
    lineWidth: [0.4, 4],
    hatchSpacing: [2.5, 12],
    hatchWidth: [0.3, 3],
    hatchAngle: [15, 75],
    wobble: [0, 3],
  };

  const host = globalThis.sketchClockHost || null;

  function sanitize(raw) {
    const out = Object.assign({}, DEFAULTS);
    if (!raw || typeof raw !== 'object') return out;
    for (const key of Object.keys(DEFAULTS)) {
      const value = raw[key];
      if (typeof value !== typeof DEFAULTS[key]) continue;
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) continue;
        const [min, max] = LIMITS[key] || [-Infinity, Infinity];
        out[key] = Math.min(max, Math.max(min, value));
      } else if (key.endsWith('Color')) {
        if (/^#[0-9a-f]{3,8}$/i.test(value)) out[key] = value;
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  // Keep only the keys this module owns (the file also stores window state).
  function pick(settings) {
    const out = {};
    for (const key of Object.keys(DEFAULTS)) out[key] = settings[key];
    return out;
  }

  async function load(params) {
    let raw = {};
    if (host) {
      try { raw = await host.getSettings(); } catch (e) { console.warn('settings unavailable', e); }
    }
    const settings = sanitize(raw);
    // Writes any missing keys back so the settings file documents every option.
    if (host) save(pick(settings));
    if (params) {
      if (params.get('24h') === '1') settings.use24Hour = true;
      if (params.get('paused') === '1') settings.animationPaused = true;
    }
    return settings;
  }

  function save(patch) {
    if (host) host.saveSettings(patch).catch((e) => console.warn('could not save settings', e));
  }

  SC.settings = { DEFAULTS, LIMITS, sanitize, load, save, host };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
