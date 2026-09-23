const PUNCTUATION = /[.,'’"()\-_/]/g;
const WHITESPACE = /\s+/g;
const DIACRITICS = /[\u0300-\u036f]/g;

/** Letters that do not NFKD-decompose to ASCII (ø stays ø, etc.). */
const LATIN_LETTER_FOLDS: Record<string, string> = {
  ø: "o",
  Ø: "o",
  æ: "ae",
  Æ: "ae",
  å: "a",
  Å: "a",
  ð: "d",
  Ð: "d",
  þ: "th",
  Þ: "th",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  ı: "i",
  ß: "ss",
};

const TEAM_STOPWORDS = new Set([
  "fc",
  "cf",
  "afc",
  "cfc",
  "sc",
  "ac",
  "sv",
  "cd",
  "ud",
  "the",
]);

function foldLatinLetters(input: string): string {
  let out = "";
  for (const char of input) {
    out += LATIN_LETTER_FOLDS[char] ?? char;
  }
  return out;
}

export function normalizeText(input: string): string {
  return foldLatinLetters(input)
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(WHITESPACE, " ")
    .trim();
}

export function normalizeTeamName(input: string): string {
  const base = normalizeText(input);
  const tokens = base
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !TEAM_STOPWORDS.has(t));

  return tokens.join(" ");
}

