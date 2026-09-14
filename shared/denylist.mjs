/**
 * Denylist infrastruktury krytycznej.
 * Porównanie bez wielkości liter i bez polskich znaków, na granicach słów.
 */

const DIACRITICS = {
  ą: "a",
  ć: "c",
  ę: "e",
  ł: "l",
  ń: "n",
  ó: "o",
  ś: "s",
  ź: "z",
  ż: "z",
  Ą: "a",
  Ć: "c",
  Ę: "e",
  Ł: "l",
  Ń: "n",
  Ó: "o",
  Ś: "s",
  Ź: "z",
  Ż: "z",
};

export function foldPl(text) {
  if (!text) return "";
  let s = String(text).toLowerCase();
  s = s.replace(/[ąćęłńóśźż]/g, (ch) => DIACRITICS[ch] || ch);
  try {
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    /* Goja may lack normalize */
  }
  return s;
}

/** Fraza → czy wymaga wyjątku (ujęcie wody przy category=woda i host_type=gmina). */
export const DENY_PHRASES = [
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

export const DENYLIST_MESSAGE =
  "Nie mapujemy infrastruktury krytycznej. Zgłoś to właściwym służbom, nie na mapie.";

function hasPhrase(folded, phrase, whole) {
  if (whole) {
    const re = new RegExp("(^|[^a-z0-9])" + phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)");
    return re.test(folded);
  }
  const re = new RegExp("(^|[^a-z0-9])" + phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)");
  return re.test(folded);
}

export function checkDenylist(title, description, category, hostType) {
  const folded = foldPl(`${title || ""} ${description || ""}`);
  for (const item of DENY_PHRASES) {
    if (item.unlessWodaGmina && category === "woda" && hostType === "gmina") {
      continue;
    }
    if (hasPhrase(folded, item.phrase, item.whole)) {
      return { blocked: true, phrase: item.phrase, message: DENYLIST_MESSAGE };
    }
  }
  return { blocked: false };
}
