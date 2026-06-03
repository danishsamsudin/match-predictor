import { normalizeText } from "@/lib/soccerdata/normalize";

const NAME_PARTICLES = new Set([
  "van",
  "de",
  "der",
  "den",
  "von",
  "del",
  "la",
  "le",
  "di",
  "da",
  "du",
  "dos",
  "das",
  "do",
  "el",
  "al",
]);

const CORRUPT_NAME_PATTERN = /[A-Z]{6,}|\b(\S+)\s+\1\b/i;

function foldToken(token: string): string {
  return normalizeText(token);
}

function titleWord(word: string): string {
  const lower = word.toLowerCase();
  if (NAME_PARTICLES.has(lower)) return lower;
  if (word.includes("-")) {
    return word
      .split("-")
      .map((part) => titleWord(part))
      .join("-");
  }
  if (word === word.toUpperCase() && word.length > 1) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  return word;
}

function dedupeWords(words: string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    if (out.length && foldToken(out[out.length - 1]) === foldToken(word)) {
      if (word.length > out[out.length - 1].length) out[out.length - 1] = word;
      continue;
    }
    out.push(word);
  }
  return out;
}

function splitRepeatedToken(token: string): string {
  const letters = token.replace(/[^A-Za-z\u00C0-\u017F]/g, "");
  if (letters.length < 6 || !/^[A-Za-z\u00C0-\u017F]+$/.test(letters)) return token;
  const upper = letters.toUpperCase();
  for (let size = Math.floor(upper.length / 2); size >= 3; size -= 1) {
    if (upper.length % size !== 0) continue;
    const chunk = upper.slice(0, size);
    if (chunk.repeat(upper.length / size) === upper) {
      const start = token.indexOf(letters[0]);
      return `${token.slice(0, start)}${chunk}${token.slice(start + letters.length)}`;
    }
  }
  return token;
}

function unglue(value: string): string {
  let out = value.replace(/-\s+/g, "-");
  const chars: string[] = [];
  for (let index = 0; index < out.length; index += 1) {
    const char = out[index];
    const prev = out[index - 1];
    if (
      index > 0 &&
      prev &&
      prev.toLowerCase() === prev &&
      char.toUpperCase() === char &&
      char.toLowerCase() !== char
    ) {
      chars.push(" ");
    }
    chars.push(char);
  }
  out = chars.join("");
  out = out.replace(/([A-Z]{3,})([A-Z][a-z\u00C0-\u017F])/g, "$1 $2");
  return out.replace(/\s+/g, " ").trim();
}

function collapseHyphenated(firstNames: string[], sourceWords: string[]): string[] {
  const hyphenated = sourceWords.filter((word) => word.includes("-"));
  let result = [...firstNames];
  for (const candidate of hyphenated) {
    const [head, tail] = candidate.split("-", 2);
    if (!tail) continue;
    for (let index = 0; index < result.length - 1; index += 1) {
      if (
        foldToken(result[index]) === foldToken(head) &&
        foldToken(result[index + 1]) === foldToken(tail)
      ) {
        result = [...result.slice(0, index), candidate, ...result.slice(index + 2)];
        break;
      }
    }
  }
  const cleaned: string[] = [];
  for (const word of result) {
    if (cleaned.length && word.includes("-")) {
      const head = word.split("-", 1)[0];
      if (foldToken(cleaned[cleaned.length - 1]) === foldToken(head)) {
        cleaned[cleaned.length - 1] = word;
        continue;
      }
    }
    cleaned.push(word);
  }
  return dedupeWords(cleaned);
}

/** Reformat FIFA-style glued names; pass-through for normal SofaScore/Scoutlyst names. */
export function formatPlayerDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || !CORRUPT_NAME_PATTERN.test(trimmed)) return trimmed;

  let blob = unglue(trimmed);
  const words: string[] = [];
  for (const token of blob.split(/\s+/)) {
    words.push(splitRepeatedToken(token));
  }
  const tokens = dedupeWords(words);
  if (!tokens.length) return trimmed;

  let firstNameStart = 0;
  while (
    firstNameStart < tokens.length &&
    (tokens[firstNameStart].toUpperCase() === tokens[firstNameStart] ||
      (tokens[firstNameStart].includes("-") &&
        tokens[firstNameStart]
          .split("-")
          .every((part) => part.toUpperCase() === part)))
  ) {
    firstNameStart += 1;
  }
  while (
    firstNameStart < tokens.length &&
    !(tokens[firstNameStart][0]?.toUpperCase() === tokens[firstNameStart][0] &&
      tokens[firstNameStart].toLowerCase() !== tokens[firstNameStart])
  ) {
    firstNameStart += 1;
  }
  if (firstNameStart >= tokens.length) {
    return tokens.map(titleWord).join(" ");
  }

  const surnameParts = tokens.slice(0, firstNameStart);
  const rest = tokens.slice(firstNameStart);
  const surnameKeys = new Set(surnameParts.map((part) => foldToken(part)));
  const surnameNorm = foldToken(surnameParts.join(""));

  const firstNames: string[] = [];
  for (const word of rest) {
    const wordKey = foldToken(word);
    if (surnameKeys.has(wordKey) || wordKey === surnameNorm) break;
    if (word.toUpperCase() === word && word.length >= 4) break;
    firstNames.push(word);
  }

  let given = dedupeWords(firstNames);
  given = collapseHyphenated(given, tokens);

  const last = surnameParts.map(titleWord).join(" ");
  const first = given.map(titleWord).join(" ");
  if (first && last) return `${first} ${last}`;
  return first || last || trimmed;
}

export function formatPlayerDisplayNameIfNeeded(name: string | null | undefined): string {
  if (!name?.trim()) return name?.trim() ?? "";
  return formatPlayerDisplayName(name);
}
