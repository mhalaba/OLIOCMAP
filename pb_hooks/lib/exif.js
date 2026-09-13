/**
 * Odrzuć JPEG/WebP z GPS EXIF. PNG zwykle bez GPS — skan APP1.
 * JSVM nie rekoduje obrazów w P0; P1: re-encode.
 */
module.exports = {
  hasGpsExif: function (bytes) {
    if (!bytes || bytes.length < 12) return false;
    var b = bytes;
    function u8(i) { return b[i] & 0xff; }
    function u16be(i) { return (u8(i) << 8) | u8(i + 1); }
    function u16le(i) { return u8(i) | (u8(i + 1) << 8); }
    if (u8(0) === 0xff && u8(1) === 0xd8) {
      var off = 2;
      while (off + 4 < b.length) {
        if (u8(off) !== 0xff) break;
        var marker = u8(off + 1);
        if (marker === 0xda) break;
        var len = u16be(off + 2);
        if (marker === 0xe1 && len > 8) {
          var start = off + 4;
          if (start + 6 < b.length) {
            var head = String.fromCharCode(u8(start), u8(start+1), u8(start+2), u8(start+3), u8(start+4));
            if (head.indexOf("Exif") === 0) {
              var tiff = start + 6;
              if (tiff + 8 < b.length) {
                var le = u8(tiff) === 0x49 && u8(tiff + 1) === 0x49;
                var u16 = le ? u16le : u16be;
                function u32(i) {
                  if (le) return (u8(i) | (u8(i+1)<<8) | (u8(i+2)<<16) | (u8(i+3)<<24)) >>> 0;
                  return ((u8(i)<<24) | (u8(i+1)<<16) | (u8(i+2)<<8) | u8(i+3)) >>> 0;
                }
                var ifd0 = tiff + u32(tiff + 4);
                if (ifd0 + 2 < b.length) {
                  var n = u16(ifd0);
                  for (var i = 0; i < n && ifd0 + 2 + i * 12 + 12 <= b.length; i++) {
                    var entry = ifd0 + 2 + i * 12;
                    var tag = u16(entry);
                    if (tag === 0x8825) return true;
                  }
                }
              }
            }
          }
        }
        off += 2 + len;
      }
    }
    return false;
  },
};
