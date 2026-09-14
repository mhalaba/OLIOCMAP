module.exports = {
  parseHlc: function (hlc) {
    if (!hlc || typeof hlc !== "string") return null;
    var m = hlc.match(/^(\d{13})-([0-9a-f]{4})-(.+)$/i);
    if (!m) return null;
    return { wall: Number(m[1]), counter: parseInt(m[2], 16), nodeId: m[3], raw: hlc };
  },
  formatHlc: function (wall, counter, nodeId) {
    var w = String(Math.max(0, Math.floor(wall)));
    while (w.length < 13) w = "0" + w;
    if (w.length > 13) w = w.slice(-13);
    var c = (counter & 0xffff).toString(16);
    while (c.length < 4) c = "0" + c;
    return w + "-" + c + "-" + nodeId;
  },
  tickHlc: function (state, nodeId, nowMs) {
    var now = Math.floor(nowMs);
    var wall = now;
    var counter = 0;
    if (state && typeof state.lastMs === "number") {
      if (now > state.lastMs) {
        wall = now;
        counter = 0;
      } else {
        wall = state.lastMs;
        counter = (state.counter || 0) + 1;
        if (counter > 0xffff) {
          wall += 1;
          counter = 0;
        }
      }
    }
    return {
      hlc: module.exports.formatHlc(wall, counter, nodeId),
      lastMs: wall,
      counter: counter,
    };
  },
  hlcToDateString: function (hlc) {
    var p = module.exports.parseHlc(hlc);
    if (!p) return "";
    var d = new Date(p.wall);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().replace("T", " ");
  },
};
