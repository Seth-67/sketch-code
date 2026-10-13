/* Seeded randomness and smooth 1D noise.
 * Every minute gets its own deterministic seed, so the same minute always
 * produces the same artwork while consecutive minutes differ slightly. */
(function (SC) {
  'use strict';

  // FNV-1a 32-bit string hash.
  function hashString(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createRandom(seed) {
    const next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
    return {
      next,
      range: (min, max) => min + (max - min) * next(),
      signed: (amount) => (next() * 2 - 1) * amount,
      // Independent child stream, so adding draws in one module never
      // shifts the variations produced by another.
      fork: (label) => createRandom(hashString(label + ':' + Math.floor(next() * 4294967296))),
    };
  }

  // Smooth value noise in [-1, 1].
  function createNoise1D(rand, size = 256) {
    const values = new Float32Array(size);
    for (let i = 0; i < size; i++) values[i] = rand.next() * 2 - 1;
    return function (x) {
      const xi = Math.floor(x);
      const f = x - xi;
      const a = values[((xi % size) + size) % size];
      const b = values[(((xi + 1) % size) + size) % size];
      const u = f * f * (3 - 2 * f);
      return a + (b - a) * u;
    };
  }

  SC.rng = { hashString, createRandom, createNoise1D };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
