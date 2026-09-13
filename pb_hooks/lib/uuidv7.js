module.exports = {
  uuidv7: function (nowMs, randomHex) {
    var now = Math.floor(nowMs);
    var hex = now.toString(16);
    while (hex.length < 12) hex = "0" + hex;
    hex = hex.slice(-12);
    var rand = randomHex || "";
    while (rand.length < 20) {
      rand += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
    }
    rand = rand.slice(0, 20);
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-7" + rand.slice(0, 3) + "-8" + rand.slice(3, 6) + "-" + rand.slice(6, 18);
  },
};
