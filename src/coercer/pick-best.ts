/**
 * pick_best algorithm — selects the best coercion result from candidates.
 *
 * Multi-criteria sorting:
 *   1. Non-default values preferred
 *   2. Score (lower is better)
 *   3. Original index (tiebreaker)
 *
 * Analogous to BAML's `array_helper::pick_best`.
 */

import type { Flag } from '../flags.js';
import { totalScore } from '../flags.js';
import type { JsonishValue } from '../values.js';
import type { FieldType as FieldTypeT } from '../types.js';
import type { ParsingContext } from './context.js';

// ---------------------------------------------------------------------------
// Shared types used across all coercion modules
// ---------------------------------------------------------------------------

export interface CoercedValue {
  value: unknown;
  flags: Flag[];
}

export type CoerceFn = (
  value: JsonishValue,
  target: FieldTypeT,
  ctx: ParsingContext,
) => CoercedValue | null;

export type TryCastFn = (
  value: JsonishValue,
  target: FieldTypeT,
  ctx: ParsingContext,
) => CoercedValue | null;

// ---------------------------------------------------------------------------
// pick_best
// ---------------------------------------------------------------------------

/**
 * Pick the best result from a list of coercion candidates.
 *
 * Sorting criteria (multi-level):
 *   1. Prefer non-default values (no `default-from-no-value` with empty results)
 *   2. Prefer lower scores
 *   3. Prefer values that aren't empty arrays from SingleToArray
 *   4. Prefer values that aren't all-default-field objects
 *   5. Prefer lower index (original order) as final tiebreaker
 */
export function pickBest(candidates: CoercedValue[]): CoercedValue | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Score and annotate each candidate
  const scored = candidates.map((c, index) => ({
    candidate: c,
    score: totalScore(c.flags),
    index,
    isDefault: isDefaultValue(c),
    hasImpliedKeyOnly: hasOnlyImpliedKey(c),
  }));

  // Multi-level sort
  scored.sort((a, b) => {
    // Level 1: non-default preferred
    if (a.isDefault !== b.isDefault) {
      return a.isDefault ? 1 : -1;
    }

    // Level 2: in union context, avoid implied-key-only classes when alternatives exist
    if (a.hasImpliedKeyOnly !== b.hasImpliedKeyOnly) {
      return a.hasImpliedKeyOnly ? 1 : -1;
    }

    // Level 3: lower score preferred
    if (a.score !== b.score) {
      return a.score - b.score;
    }

    // Level 4: earlier index preferred
    return a.index - b.index;
  });

  return scored[0].candidate;
}

/**
 * Pick best among array-to-singular candidates.
 * Used when coercing an array of values where only one should be picked.
 */
export function pickBestFromArray(candidates: CoercedValue[]): CoercedValue | null {
  const result = pickBest(candidates);
  if (result !== null) {
    // Add first-match flag if not already present
    const hasFirstMatch = result.flags.some((f) => f.kind === 'first-match');
    if (!hasFirstMatch) {
      result.flags.push({ kind: 'first-match', index: 0 });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a coerced value is a "default" value:
 * - Empty array from SingleToArray wrapping
 * - Object with all fields defaulted
 */
function isDefaultValue(v: CoercedValue): boolean {
  // Empty array from single-to-array wrapping
  if (
    Array.isArray(v.value) &&
    (v.value as unknown[]).length === 0 &&
    v.flags.some((f) => f.kind === 'single-to-array')
  ) {
    return true;
  }

  // Object where ALL fields are defaulted (every value is null/undefined).
  // Only consider it "default" if the flags are all default-type AND the
  // actual value object contains no real data. This avoids falsely marking
  // partially-streamed objects (e.g. dish="Pancakes" with one missing field)
  // as "default" just because their only coercion flag is default-from-no-value.
  const defaultKinds = new Set(['default-from-no-value', 'optional-default-from-no-value']);
  if (
    v.flags.length > 0 &&
    v.flags.every((f) => defaultKinds.has(f.kind)) &&
    v.flags.some((f) => f.kind === 'default-from-no-value')
  ) {
    if (typeof v.value === 'object' && v.value !== null && !Array.isArray(v.value)) {
      const vals = Object.values(v.value as Record<string, unknown>);
      if (vals.length > 0 && vals.some((val) => val !== null && val !== undefined)) {
        return false; // Has real data — not a default
      }
    }
    return true;
  }

  return false;
}

/**
 * Check if a coerced value was created solely through implied-key wrapping
 * of a simple string. In union contexts, prefer actual structured matches.
 */
function hasOnlyImpliedKey(v: CoercedValue): boolean {
  return (
    v.flags.some((f) => f.kind === 'implied-key') &&
    v.flags.some((f) => f.kind === 'json-to-string' || f.kind === 'object-to-string')
  );
}
