/* Custom numeral geometry.
 *
 * Each digit is a bold, outlined, industrial shape drawn on a 64 x 100 grid
 * (y grows downward, baseline at y = 100). Every glyph is stored as SVG path
 * data: the first large subpath is the outer silhouette, any further subpaths
 * are counters (holes). The stroke weight is ~19-20 units throughout so the
 * digits read as one family and leave room for 4-5 hatch stripes per stroke.
 *
 * Shapes are resolution independent; getContours() samples them into dense
 * polylines that the continuous-path generator and hatching engine consume.
 */
(function (SC) {
  'use strict';

  const DIGITS = {
    // Large oval zero, like the reference.
    '0': {
      d: 'M 32,0 C 49.67,0 64,22.39 64,50 C 64,77.61 49.67,100 32,100 C 14.33,100 0,77.61 0,50 C 0,22.39 14.33,0 32,0 Z ' +
         'M 32,19 C 38.9,19 44.5,32.88 44.5,50 C 44.5,67.12 38.9,81 32,81 C 25.1,81 19.5,67.12 19.5,50 C 19.5,32.88 25.1,19 32,19 Z',
    },
    // Tall blocky stem with a flag and a wide base.
    '1': {
      d: 'M 6,100 L 6,82 L 22,82 L 22,30 L 8,36 L 8,17 L 27,0 L 42,0 L 42,82 L 58,82 L 58,100 Z',
    },
    '2': {
      d: 'M 2,100 L 62,100 L 62,81 L 31,81 L 50,60 C 58,51 62,43 62,32 C 62,13 48,0 32,0 C 15,0 3,12 2,30 ' +
         'L 22,32 C 23,24 27,19 32,19 C 38,19 42,24 42,31 C 42,38 39,43 33,50 L 2,84 Z',
    },
    '3': {
      d: 'M 3,28 C 5,10 17,0 32,0 C 49,0 61,11 61,26 C 61,36 56,44 49,48 C 57,52 63,60 63,72 ' +
         'C 63,89 50,100 32,100 C 14,100 2,89 1,72 L 21,70 C 22,77 26,81 32,81 C 39,81 43,77 43,70 ' +
         'C 43,62 38,58 30,58 L 26,58 L 26,40 L 30,40 C 37,40 41,36 41,29 C 41,23 37,19 32,19 C 27,19 24,23 23,29 Z',
    },
    '4': {
      d: 'M 38,100 L 58,100 L 58,80 L 64,80 L 64,62 L 58,62 L 58,0 L 38,0 L 0,62 L 0,80 L 38,80 Z ' +
         'M 38,36 L 38,62 L 22,62 Z',
    },
    '5': {
      d: 'M 8,0 L 60,0 L 60,19 L 26,19 L 24,37 C 28,35 32,34 36,34 C 52,34 63,47 63,66 ' +
         'C 63,87 50,100 32,100 C 15,100 3,90 1,74 L 21,71 C 22,78 26,81 32,81 C 39,81 43,75 43,67 ' +
         'C 43,58 38,53 32,53 C 27,53 24,56 22,60 L 3,58 Z',
    },
    '6': {
      d: 'M 56,6 C 50,2 43,0 35,0 C 15,0 1,18 1,50 C 1,80 13,100 32,100 C 50,100 63,87 63,66 ' +
         'C 63,46 51,34 35,34 C 29,34 24,36 21,39 C 22,26 27,19 35,19 C 40,19 44,21 48,24 Z ' +
         'M 32,52 C 39,52 44,58 44,67 C 44,76 39,82 32,82 C 25,82 21,76 21,67 C 21,58 25,52 32,52 Z',
    },
    '7': {
      d: 'M 2,0 L 62,0 L 62,18 L 32,100 L 11,100 L 40,19 L 2,19 Z',
    },
    '8': {
      d: 'M 32,0 C 49,0 60,11 60,26 C 60,36 55,43 48,47 C 57,52 63,61 63,72 C 63,89 50,100 32,100 ' +
         'C 14,100 1,89 1,72 C 1,61 7,52 16,47 C 9,43 4,36 4,26 C 4,11 15,0 32,0 Z ' +
         'M 32,18 C 37,18 41,22 41,27 C 41,33 37,37 32,37 C 27,37 23,33 23,27 C 23,22 27,18 32,18 Z ' +
         'M 32,56 C 39,56 44,62 44,70 C 44,77 39,82 32,82 C 25,82 20,77 20,70 C 20,62 25,56 32,56 Z',
    },
    // The 6 rotated 180 degrees.
    '9': {
      d: 'M 8,94 C 14,98 21,100 29,100 C 49,100 63,82 63,50 C 63,20 51,0 32,0 C 14,0 1,13 1,34 ' +
         'C 1,54 13,66 29,66 C 35,66 40,64 43,61 C 42,74 37,81 29,81 C 24,81 20,79 16,76 Z ' +
         'M 32,48 C 25,48 20,42 20,33 C 20,24 25,18 32,18 C 39,18 43,24 43,33 C 43,42 39,48 32,48 Z',
    },
  };

  const GLYPH_WIDTH = 64;
  const GLYPH_HEIGHT = 100;
  const cache = new Map();

  // Returns { outer, holes } as sampled polylines in glyph units. The outer
  // contour is always oriented visually clockwise. Results are cached and
  // must be treated as read-only.
  function getContours(ch, step = 1.1) {
    const key = ch + '@' + step;
    if (cache.has(key)) return cache.get(key);
    const def = DIGITS[ch];
    if (!def) throw new Error('No glyph for "' + ch + '"');
    const { parsePathData, sampleSubpath, signedArea } = SC.geometry;
    const contours = parsePathData(def.d).map((sp) => sampleSubpath(sp, step));
    let outerIdx = 0;
    let maxArea = -1;
    contours.forEach((c, i) => {
      const a = Math.abs(signedArea(c));
      if (a > maxArea) { maxArea = a; outerIdx = i; }
    });
    let outer = contours[outerIdx];
    if (signedArea(outer) < 0) outer = outer.slice().reverse();
    const holes = contours.filter((_, i) => i !== outerIdx);
    const result = Object.freeze({ outer, holes });
    cache.set(key, result);
    return result;
  }

  SC.digits = { DIGITS, GLYPH_WIDTH, GLYPH_HEIGHT, getContours };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
