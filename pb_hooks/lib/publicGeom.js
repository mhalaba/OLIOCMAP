module.exports = {
  hexToUnit: function (hex8) {
    var n = parseInt(String(hex8).slice(0, 8), 16);
    if (isNaN(n)) return 0.5;
    return n / 0xffffffff;
  },
  jitterFromSha256: function (sha256hex) {
    var h = String(sha256hex).toLowerCase();
    var hexToUnit = module.exports.hexToUnit;
    return {
      jLat: (hexToUnit(h.slice(0, 8)) * 2 - 1) * 0.005,
      jLon: (hexToUnit(h.slice(8, 16)) * 2 - 1) * 0.005,
    };
  },
  round2: function (n) {
    return Math.round(Number(n) * 100) / 100;
  },
  publicCoords: function (id, lat, lon, mode, sha256hex) {
    if (mode === "hidden" || lat === null || lon === null || lat === undefined || lon === undefined) {
      return { public_lat: null, public_lon: null };
    }
    if (mode === "precise") {
      return { public_lat: Number(lat), public_lon: Number(lon) };
    }
    var j = module.exports.jitterFromSha256(sha256hex);
    return {
      public_lat: module.exports.round2(lat) + j.jLat,
      public_lon: module.exports.round2(lon) + j.jLon,
    };
  },
  defaultPublicGeom: function (category, hostType, envMode, explicit) {
    if (category === "potrzeba") return "hidden";
    if (explicit === "precise" || explicit === "gmina" || explicit === "hidden") return explicit;
    var mode = envMode || "gmina";
    if (category === "lacznosc") return mode;
    if (category === "prad" && hostType === "prywatny") return mode;
    return "precise";
  },
};
