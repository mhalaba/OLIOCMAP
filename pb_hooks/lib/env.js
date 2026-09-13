module.exports = {
  get: function (key, fallback) {
    var v = $os.getenv(key);
    if (v === null || v === undefined || v === "") return fallback;
    return v;
  },
};
