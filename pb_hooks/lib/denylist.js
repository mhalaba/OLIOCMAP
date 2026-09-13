module.exports = {
  foldPl: function foldPl(text) {
    if (!text) return "";
    var map = {
      ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
    };
    var s = String(text).toLowerCase();
    s = s.replace(/[ąćęłńóśźż]/g, function (ch) { return map[ch] || ch; });
    return s;
  },
  DENYLIST_MESSAGE: "Nie mapujemy infrastruktury krytycznej. Zgłoś to właściwym służbom, nie na mapie.",
  checkDenylist: function checkDenylist(title, description, category, hostType) {
    var foldPl = module.exports.foldPl;
    var folded = foldPl((title || "") + " " + (description || ""));
    var phrases = [
      { phrase: "elektrownia" },
      { phrase: "elektrocieplownia" },
      { phrase: "ec", whole: true },
      { phrase: "gpz", whole: true },
      { phrase: "stacja transformatorowa" },
      { phrase: "rozdzielnia" },
      { phrase: "gazociag" },
      { phrase: "tlocznia" },
      { phrase: "magazyn paliw" },
      { phrase: "baza paliw" },
      { phrase: "rafineria" },
      { phrase: "oczyszczalnia" },
      { phrase: "ujecie wody", unlessWodaGmina: true },
      { phrase: "zaklad chemiczny" },
      { phrase: "jednostka wojskowa" },
      { phrase: "koszary" },
      { phrase: "poligon" },
      { phrase: "radar" },
      { phrase: "maszt" },
      { phrase: "serwerownia" },
      { phrase: "wezel telekomunikacyjny" },
      { phrase: "brama zakladu" },
      { phrase: "portiernia" },
      { phrase: "magazyn broni" },
      { phrase: "wku", whole: true },
      { phrase: "wcr", whole: true },
    ];
    function hasPhrase(foldedText, phrase) {
      var esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var re = new RegExp("(^|[^a-z0-9])" + esc + "([^a-z0-9]|$)");
      return re.test(foldedText);
    }
    for (var i = 0; i < phrases.length; i++) {
      var item = phrases[i];
      if (item.unlessWodaGmina && category === "woda" && hostType === "gmina") continue;
      if (hasPhrase(folded, item.phrase)) {
        return { blocked: true, phrase: item.phrase, message: module.exports.DENYLIST_MESSAGE };
      }
    }
    return { blocked: false };
  },
};
