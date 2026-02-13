/**
 * Flags record every transformation applied during coercion.
 *
 * Each flag carries a numeric "score" (lower = better, 0 = no penalty).
 * The total score of a coerced value is the sum of all its flags' scores,
 * with child scores weighted 10× to penalize deep structural issues.
 *
 * Analogous to BAML's `Flag` enum and `WithScore` trait.
 */

import type { JsonishValue } from './values.js';
import type { Fix } from './values.js';

// ---------------------------------------------------------------------------
// Flag variants
// ---------------------------------------------------------------------------

export type Flag =
  | { kind: 'object-from-markdown'; penalty: number }
  | { kind: 'object-from-fixed-json'; fixes: Fix[] }
  | { kind: 'default-but-had-unparseable-value'; reason: string }
  | { kind: 'object-to-string' }
  | { kind: 'object-to-primitive' }
  | { kind: 'object-to-map' }
  | { kind: 'extra-key'; key: string }
  | { kind: 'stripped-non-alphanumeric'; original: string }
  | { kind: 'substring-match'; original: string }
  | { kind: 'single-to-array' }
  | { kind: 'array-item-parse-error'; index: number; reason: string }
  | { kind: 'map-key-parse-error'; index: number; reason: string }
  | { kind: 'map-value-parse-error'; key: string; reason: string }
  | { kind: 'json-to-string' }
  | { kind: 'implied-key'; key: string }
  | { kind: 'inferred-object' }
  | { kind: 'first-match'; index: number }
  | { kind: 'union-match'; index: number }
  | { kind: 'str-match-one-from-many'; matches: Array<[string, number]> }
  | { kind: 'default-from-no-value' }
  | { kind: 'default-but-had-value' }
  | { kind: 'optional-default-from-no-value' }
  | { kind: 'string-to-bool'; original: string }
  | { kind: 'string-to-null'; original: string }
  | { kind: 'string-to-char'; original: string }
  | { kind: 'string-to-float'; original: string }
  | { kind: 'float-to-int'; original: number }
  | { kind: 'no-fields' };

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Return the score (penalty) for a single flag.
 *
 * These values are ported directly from BAML's score.rs.
 * Lower is better. 0 means no penalty.
 */
export function flagScore(flag: Flag): number {
  switch (flag.kind) {
    // No penalty
    case 'inferred-object':
      return 0;
    case 'object-from-fixed-json':
      return 0;
    case 'union-match':
      return 0;

    // Low penalty — minor coercions
    case 'optional-default-from-no-value':
      return 1;
    case 'object-to-map':
      return 1;
    case 'extra-key':
      return 1;
    case 'single-to-array':
      return 1;
    case 'first-match':
      return 1;
    case 'string-to-bool':
      return 1;
    case 'string-to-null':
      return 1;
    case 'string-to-char':
      return 1;
    case 'string-to-float':
      return 1;
    case 'float-to-int':
      return 1;
    case 'no-fields':
      return 1;
    case 'map-key-parse-error':
      return 1;
    case 'map-value-parse-error':
      return 1;

    // Medium penalty — lossy coercions
    case 'object-to-string':
      return 2;
    case 'object-to-primitive':
      return 2;
    case 'substring-match':
      return 2;
    case 'implied-key':
      return 2;
    case 'json-to-string':
      return 2;
    case 'default-but-had-unparseable-value':
      return 2;
    case 'stripped-non-alphanumeric':
      return 3;

    // Markdown: carries its own penalty value
    case 'object-from-markdown':
      return flag.penalty;

    // Array item errors: penalty proportional to depth
    case 'array-item-parse-error':
      return 1 + flag.index;

    // Ambiguous string match: sum of all match counts
    case 'str-match-one-from-many':
      return flag.matches.reduce((sum, [, count]) => sum + count, 0);

    // High penalty — using defaults for real data
    case 'default-from-no-value':
      return 100;
    case 'default-but-had-value':
      return 110;
  }
}

/**
 * Compute the total score for a list of flags.
 */
export function totalScore(flags: Flag[]): number {
  return flags.reduce((sum, f) => sum + flagScore(f), 0);
}
