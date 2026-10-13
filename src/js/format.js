/* Time and date formatting utilities. All values are derived from a Date
 * read from the system clock; nothing here keeps its own notion of time. */
(function (SC) {
  'use strict';

  const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const MONTH_NAMES = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
  ];

  const pad2 = (n) => String(n).padStart(2, '0');

  // 12-hour mode has no leading zero and no AM/PM ("4:37", "12:05").
  // 24-hour mode is zero padded ("16:37", "09:05").
  function getTimeParts(date, options = {}) {
    const h24 = date.getHours();
    const minutes = date.getMinutes();
    const hourText = options.use24Hour ? pad2(h24) : String(h24 % 12 || 12);
    return { minutes, isPM: h24 >= 12, text: hourText + ':' + pad2(minutes) };
  }

  function formatDate(date) {
    return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  // Unique per local calendar minute; a change in this key is what triggers a redraw.
  function minuteKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function msUntilNextMinute(date) {
    return 60000 - (date.getSeconds() * 1000 + date.getMilliseconds());
  }

  SC.format = { getTimeParts, formatDate, minuteKey, msUntilNextMinute, DAY_NAMES, MONTH_NAMES };
})((globalThis.SketchClock = globalThis.SketchClock || {}));
