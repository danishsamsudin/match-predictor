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

function preferToken(a: string, b: string): string {
  const aDiacritic = /[^\u0000-\u007f]/.test(a);
  const bDiacritic = /[^\u0000-\u007f]/.test(b);
  if (aDiacritic !== bDiacritic) return bDiacritic ? b : a;
  const aAllCaps = a.length > 1 && a === a.toUpperCase();
  const bAllCaps = b.length > 1 && b === b.toUpperCase();
  if (aAllCaps !== bAllCaps) return aAllCaps ? b : a;
  return b.length >= a.length ? b : a;
}

function dedupeWords(words: string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    if (out.length && foldToken(out[out.length - 1]) === foldToken(word)) {
      out[out.length - 1] = preferToken(out[out.length - 1], word);
      continue;
    }
    out.push(word);
  }
  return out;
}

/** Collapse repeated blocks: ABAB, ABCABC (e.g. "Jens Petter Jens Petter"). */
function collapseRepeatedSequences(words: string[]): string[] {
  let result = [...words];
  for (let n = Math.min(4, Math.floor(result.length / 2)); n >= 2; n -= 1) {
    const next: string[] = [];
    let index = 0;
    while (index < result.length) {
      if (index + 2 * n <= result.length) {
        const first = result.slice(index, index + n);
        const second = result.slice(index + n, index + 2 * n);
        const foldsA = first.map(foldToken);
        const foldsB = second.map(foldToken);
        if (
          foldsA.every(Boolean) &&
          foldsA.every((fold, i) => fold === foldsB[i]) &&
          new Set(foldsA).size > 1
        ) {
          for (let i = 0; i < n; i += 1) {
            next.push(preferToken(first[i]!, second[i]!));
          }
          index += 2 * n;
          continue;
        }
      }
      next.push(result[index]!);
      index += 1;
    }
    result = next;
  }
  return result;
}

/**
 * Fix doubled FIFA/PDF tokens without requiring ALLCAPS glue detection
 * (e.g. "Jorgen Jørgen Strand Larsen", "Jens Petter Jens Petter Hauge").
 */
export function collapseRepeatedNameTokens(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) return trimmed;
  return collapseRepeatedSequences(dedupeWords(words)).join(" ");
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
      /[A-Za-z\u00C0-\u017F]/.test(prev) &&
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
    const parts = candidate.split("-");
    const head = parts[0];
    const tail = parts.slice(1).join("-");
    if (!head || !tail) continue;
    for (let index = 0; index < result.length - 1; index += 1) {
      if (
        foldToken(result[index]!) === foldToken(head) &&
        foldToken(result[index + 1]!) === foldToken(tail)
      ) {
        result = [...result.slice(0, index), candidate, ...result.slice(index + 2)];
        break;
      }
    }
  }
  const cleaned: string[] = [];
  for (const word of result) {
    if (cleaned.length && word.includes("-")) {
      const head = word.split("-")[0]!;
      if (foldToken(cleaned[cleaned.length - 1]!) === foldToken(head)) {
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
  if (!trimmed) return trimmed;

  // Soft cleanup for doubled tokens (Jorgen/Jørgen, ABAB blocks) when the
  // string does not look like a FIFA ALLCAPS glue blob.
  if (!CORRUPT_NAME_PATTERN.test(trimmed)) {
    return collapseRepeatedNameTokens(trimmed);
  }

  const blob = unglue(trimmed);
  const words: string[] = [];
  for (const token of blob.split(/\s+/)) {
    words.push(splitRepeatedToken(token));
  }
  const tokens = dedupeWords(words);
  if (!tokens.length) return trimmed;

  let firstNameStart = 0;
  while (
    firstNameStart < tokens.length &&
    (tokens[firstNameStart]!.toUpperCase() === tokens[firstNameStart] ||
      (tokens[firstNameStart]!.includes("-") &&
        tokens[firstNameStart]!
          .split("-")
          .every((part) => part.toUpperCase() === part)))
  ) {
    firstNameStart += 1;
  }
  while (
    firstNameStart < tokens.length &&
    !(tokens[firstNameStart]![0]?.toUpperCase() === tokens[firstNameStart]![0] &&
      tokens[firstNameStart]!.toLowerCase() !== tokens[firstNameStart])
  ) {
    firstNameStart += 1;
  }
  if (firstNameStart >= tokens.length) {
    return collapseRepeatedNameTokens(tokens.map(titleWord).join(" "));
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

  // Prefer hyphenated surname when the last given token matches the surname head
  // (FIFA often repeats "Wan" before "WAN-BISSAKA").
  if (
    surnameParts.length === 1 &&
    surnameParts[0]!.includes("-") &&
    given.length
  ) {
    const [head, ...tailParts] = surnameParts[0]!.split("-");
    const tail = tailParts.join("-");
    if (
      head &&
      tail &&
      foldToken(given[given.length - 1]!) === foldToken(head)
    ) {
      const merged = `${titleWord(given[given.length - 1]!)}-${titleWord(tail)}`;
      given = given.slice(0, -1);
      const first = given.map(titleWord).join(" ");
      return collapseRepeatedNameTokens(first ? `${first} ${merged}` : merged);
    }
  }

  const last = surnameParts.map(titleWord).join(" ");
  const first = given.map(titleWord).join(" ");
  if (first && last) return collapseRepeatedNameTokens(`${first} ${last}`);
  return collapseRepeatedNameTokens(first || last || trimmed);
}

export function formatPlayerDisplayNameIfNeeded(name: string | null | undefined): string {
  if (!name?.trim()) return name?.trim() ?? "";
  return formatPlayerDisplayName(name);
}
