const PUNCTUATION = /[.,'’"()\-_/]/g;
const WHITESPACE = /\s+/g;
const DIACRITICS = /[\u0300-\u036f]/g;

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

export function normalizeText(input: string): string {
  return input
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

