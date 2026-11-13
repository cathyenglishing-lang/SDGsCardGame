// The code a topic is SHOWN with: 9-1 → 9-A, 4-2 → 4-B (2026-11-11, the teacher: numbers look like an
// order the topics do not have). Only what people read changes. The id stored with every play, clip,
// course setting and card (9-1, 9-1/A2/s07) stays as it is, so nothing already recorded moves.
// The same rule is in backend/reports.py (topic_code) for the pages the server writes.
(function () {
  function topicCode(id) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(id == null ? "" : id));
    if (!m) return String(id == null ? "" : id);
    const n = Number(m[2]);
    return n >= 1 && n <= 26 ? m[1] + "-" + String.fromCharCode(64 + n) : m[0];
  }
  window.topicCode = topicCode;
  if (typeof module !== "undefined") module.exports = topicCode;
})();
