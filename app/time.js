// One place for every time the app shows: 24-hour (military) clock, HH:mm, 00:00 to 23:59, never AM/PM.
// Built by hand from the clock parts so every phone and browser shows the same thing, whatever its language
// or 12-hour setting. Stored timestamps are never changed: a timestamp with an offset (timestamptz from the
// database) is read as that exact moment and shown in the device's time zone, as the app always has; a booking
// slot ("14:00") is already 24-hour text and is shown as is. Server code shows Miami time with inET().
(function (root) {
  "use strict";
  const pad2 = (n) => String(n).padStart(2, "0");
  const toDate = (v) => (v instanceof Date ? v : new Date(v));
  const valid = (d) => d instanceof Date && !isNaN(d.getTime());
  // HH:mm for a Date, an ISO timestamp or epoch ms, in the device's time zone. "" when the value is not a time.
  const hm = (v) => { const d = toDate(v); return valid(d) ? pad2(d.getHours()) + ":" + pad2(d.getMinutes()) : ""; };
  // HH:mm:ss, for the live header clock.
  const hms = (v) => { const d = toDate(v); return valid(d) ? hm(d) + ":" + pad2(d.getSeconds()) : ""; };
  // HH:mm in a named time zone (server messages: America/New_York). Uses Intl only for the zone's clock parts.
  const hmIn = (v, timeZone) => {
    const d = toDate(v);
    if (!valid(d)) return "";
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value || "00";
    return pad2(Number(get("hour")) % 24) + ":" + pad2(Number(get("minute")));
  };
  // A booking slot like "14:00" or "8:00": normalized to HH:mm. Anything else returns "".
  const slot = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m && +m[1] < 24 && +m[2] < 60 ? pad2(+m[1]) + ":" + m[2] : ""; };
  // "Mon, Nov 16, 14:00": the date in the person's language, then the 24-hour time.
  const dateTime = (v, locale) => { const d = toDate(v); return valid(d) ? d.toLocaleDateString(locale || "en-US", { weekday: "short", month: "short", day: "numeric" }) + ", " + hm(d) : ""; };
  // Same, in a named time zone (server messages).
  const dateTimeIn = (v, locale, timeZone) => {
    const d = toDate(v);
    return valid(d) ? d.toLocaleDateString(locale || "en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }) + ", " + hmIn(d, timeZone) : "";
  };
  const api = { pad2, hm, hms, hmIn, slot, dateTime, dateTimeIn, PATTERN: /^([01]\d|2[0-3]):[0-5]\d$/ };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WCIA_TIME = api;
})(typeof window !== "undefined" ? window : null);
