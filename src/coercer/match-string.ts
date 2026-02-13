/**
 * Fuzzy string matching for enum variant resolution.
 *
 * Implements the 4-stage heuristic:
 *   1. Exact case-sensitive match
 *   2. Accent-stripped match (Unicode NFKD + ligature expansion)
 *   3. Punctuation-stripped match
 *   4. Case-insensitive match
 *   5. Substring matching with overlap filtering
 *
 * Analogous to BAML's `match_string.rs`.
 */

import type { Flag } from '../flags.js';

export interface MatchCandidate {
  /** The canonical name to return on match. */
  name: string;
  /** Strings that should be tried as match candidates. */
  aliases: string[];
}

export interface MatchResult {
  /** The matched canonical name. */
  name: string;
  flags: Flag[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Match an input string against a set of named candidates.
 * Returns the best match, or null if no match found.
 *
 * @param input      The string to match.
 * @param candidates The set of candidates to match against.
 * @param allowSubstring  Whether to allow substring matching.
 */
export function matchString(
  input: string,
  candidates: MatchCandidate[],
  allowSubstring: boolean,
): MatchResult | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Stage 1: Exact case-sensitive match
  for (const c of candidates) {
    for (const alias of c.aliases) {
      if (trimmed === alias) {
        return { name: c.name, flags: [] };
      }
    }
  }

  // Stage 2: Accent-stripped match
  const inputNorm = stripAccents(trimmed);
  for (const c of candidates) {
    for (const alias of c.aliases) {
      if (inputNorm === stripAccents(alias)) {
        return {
          name: c.name,
          flags: [{ kind: 'stripped-non-alphanumeric', original: trimmed }],
        };
      }
    }
  }

  // Stage 3: Punctuation-stripped match
  const inputStripped = stripPunctuation(trimmed);
  for (const c of candidates) {
    for (const alias of c.aliases) {
      if (inputStripped === stripPunctuation(alias)) {
        return {
          name: c.name,
          flags: [{ kind: 'stripped-non-alphanumeric', original: trimmed }],
        };
      }
    }
  }

  // Stage 4: Case-insensitive match
  const inputLower = inputStripped.toLowerCase();
  for (const c of candidates) {
    for (const alias of c.aliases) {
      if (inputLower === stripPunctuation(alias).toLowerCase()) {
        return {
          name: c.name,
          flags: [{ kind: 'stripped-non-alphanumeric', original: trimmed }],
        };
      }
    }
  }

  // Stage 5: Substring matching
  if (allowSubstring) {
    return substringMatch(trimmed, candidates);
  }

  return null;
}

/**
 * Case-insensitive, normalized key comparison.
 * Strips underscores, hyphens, and spaces for camelCase ↔ snake_case matching.
 * Used for matching object keys to class field names.
 */
export function keysMatch(a: string, b: string): boolean {
  return normalizeKey(a) === normalizeKey(b);
}

/** Normalize a key by stripping separators and lowercasing. */
function normalizeKey(s: string): string {
  return s.replace(/[-_\s]/g, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Accent stripping (Unicode NFKD)
// ---------------------------------------------------------------------------

/**
 * Strip accents/diacritics from a string using Unicode normalization.
 * Also expands common ligatures.
 */
export function stripAccents(s: string): string {
  // Expand common ligatures first
  let result = s
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/ø/g, 'o')
    .replace(/Ø/g, 'O');

  // NFKD decomposition strips combining marks
  result = result.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return result;
}

// ---------------------------------------------------------------------------
// Punctuation stripping
// ---------------------------------------------------------------------------

/** Strip non-alphanumeric characters except hyphens and underscores. */
export function stripPunctuation(s: string): string {
  return s.replace(/[^a-zA-Z0-9\-_\s]/g, '');
}

// ---------------------------------------------------------------------------
// Substring matching
// ---------------------------------------------------------------------------

interface SubMatch {
  candidateName: string;
  start: number;
  end: number;
  alias: string;
}

function substringMatch(
  input: string,
  candidates: MatchCandidate[],
): MatchResult | null {
  const inputLower = input.toLowerCase();

  // Find all occurrences of each candidate alias in the input.
  const allMatches: SubMatch[] = [];
  for (const c of candidates) {
    for (const alias of c.aliases) {
      const aliasLower = alias.toLowerCase();
      if (aliasLower.length === 0) continue;

      let pos = 0;
      while (pos < inputLower.length) {
        const idx = inputLower.indexOf(aliasLower, pos);
        if (idx === -1) break;
        allMatches.push({
          candidateName: c.name,
          start: idx,
          end: idx + aliasLower.length,
          alias,
        });
        pos = idx + 1;
      }
    }
  }

  if (allMatches.length === 0) return null;

  // Sort by start position, then by length descending (longest match first).
  allMatches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  // Filter overlapping matches (keep earlier/longer).
  const filtered: SubMatch[] = [];
  let lastEnd = -1;
  for (const m of allMatches) {
    if (m.start >= lastEnd) {
      filtered.push(m);
      lastEnd = m.end;
    }
  }

  // Count non-overlapping matches per candidate.
  const counts = new Map<string, number>();
  for (const m of filtered) {
    counts.set(m.candidateName, (counts.get(m.candidateName) ?? 0) + 1);
  }

  // Find the candidate with the most matches.
  let bestName: string | null = null;
  let bestCount = 0;
  let ambiguous = false;

  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestName = name;
      bestCount = count;
      ambiguous = false;
    } else if (count === bestCount && name !== bestName) {
      ambiguous = true;
    }
  }

  if (ambiguous || bestName === null) {
    // Multiple candidates tied → ambiguous
    return null;
  }

  return {
    name: bestName,
    flags: [{ kind: 'substring-match', original: input }],
  };
}
