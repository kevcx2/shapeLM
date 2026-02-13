/**
 * Union type coercion.
 *
 * Disambiguates union variants using dual tryCast/coerce with scoring.
 * Uses union variant hints for array optimization.
 *
 * Analogous to BAML's `coerce_union.rs`.
 */

import type { UnionType } from '../types.js';
import type { JsonishValue } from '../values.js';
import { totalScore } from '../flags.js';
import type { ParsingContext } from './context.js';
import { pickBest, type CoercedValue, type CoerceFn, type TryCastFn } from './pick-best.js';

// ---------------------------------------------------------------------------
// tryCast (strict)
// ---------------------------------------------------------------------------

/**
 * Try strict cast to a union: tries each variant with tryCast,
 * picks the best match by score.
 */
export function tryCastUnion(
  value: JsonishValue,
  unionType: UnionType,
  ctx: ParsingContext,
  tryCastFn: TryCastFn,
): CoercedValue | null {
  const options = unionType.options;

  // If null and union is optional (contains null), return null
  if (value.type === 'null') {
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (opt.type === 'primitive' && opt.value === 'null') {
        return { value: null, flags: [{ kind: 'union-match', index: i }] };
      }
    }
  }

  // Try union hint first (optimization for homogeneous arrays)
  const hint = ctx.unionHint;
  if (hint !== undefined && hint < options.length) {
    const hinted = tryCastFn(value, options[hint], ctx.withUnionHint(undefined));
    if (hinted !== null && totalScore(hinted.flags) === 0) {
      return {
        value: hinted.value,
        flags: [...hinted.flags, { kind: 'union-match', index: hint }],
      };
    }
  }

  // Try all variants
  const candidates: CoercedValue[] = [];
  for (let i = 0; i < options.length; i++) {
    const result = tryCastFn(value, options[i], ctx.withUnionHint(undefined));
    if (result !== null) {
      const score = totalScore(result.flags);
      // Perfect match: return immediately
      if (score === 0) {
        return {
          value: result.value,
          flags: [...result.flags, { kind: 'union-match', index: i }],
        };
      }
      candidates.push({
        value: result.value,
        flags: [...result.flags, { kind: 'union-match', index: i }],
      });
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return pickBest(candidates);
}

// ---------------------------------------------------------------------------
// coerce (flexible)
// ---------------------------------------------------------------------------

/**
 * Coerce a value to a union variant using flexible matching.
 *
 * Two-phase approach (matching BAML's behavior):
 *   Phase 1: Try tryCast (strict) on all variants — prefer exact matches
 *   Phase 2: If no strict match, try coerce (flexible) on all variants
 */
export function coerceUnion(
  value: JsonishValue,
  unionType: UnionType,
  ctx: ParsingContext,
  coerceFn: CoerceFn,
  tryCastFn?: TryCastFn,
): CoercedValue | null {
  const options = unionType.options;

  // If null and union is optional, return null
  if (value.type === 'null') {
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (opt.type === 'primitive' && opt.value === 'null') {
        return { value: null, flags: [{ kind: 'union-match', index: i }] };
      }
    }
  }

  // Phase 1: Try strict cast on all variants (if tryCastFn provided)
  if (tryCastFn) {
    // Try union hint first
    const hint = ctx.unionHint;
    if (hint !== undefined && hint < options.length) {
      const hinted = tryCastFn(value, options[hint], ctx.withUnionHint(undefined));
      if (hinted !== null && totalScore(hinted.flags) === 0) {
        return {
          value: hinted.value,
          flags: [...hinted.flags, { kind: 'union-match', index: hint }],
        };
      }
    }

    const strictCandidates: CoercedValue[] = [];
    for (let i = 0; i < options.length; i++) {
      const result = tryCastFn(value, options[i], ctx.withUnionHint(undefined));
      if (result !== null) {
        const score = totalScore(result.flags);
        if (score === 0) {
          return {
            value: result.value,
            flags: [...result.flags, { kind: 'union-match', index: i }],
          };
        }
        strictCandidates.push({
          value: result.value,
          flags: [...result.flags, { kind: 'union-match', index: i }],
        });
      }
    }

    if (strictCandidates.length === 1) return strictCandidates[0];
    if (strictCandidates.length > 1) return pickBest(strictCandidates);
  }

  // Phase 2: Flexible coerce on all variants
  // Try union hint first
  const hint = ctx.unionHint;
  if (hint !== undefined && hint < options.length) {
    const hinted = coerceFn(value, options[hint], ctx.withUnionHint(undefined));
    if (hinted !== null && totalScore(hinted.flags) === 0) {
      return {
        value: hinted.value,
        flags: [...hinted.flags, { kind: 'union-match', index: hint }],
      };
    }
  }

  const candidates: CoercedValue[] = [];
  for (let i = 0; i < options.length; i++) {
    const result = coerceFn(value, options[i], ctx.withUnionHint(undefined));
    if (result !== null) {
      const score = totalScore(result.flags);
      if (score === 0) {
        return {
          value: result.value,
          flags: [...result.flags, { kind: 'union-match', index: i }],
        };
      }
      candidates.push({
        value: result.value,
        flags: [...result.flags, { kind: 'union-match', index: i }],
      });
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return pickBest(candidates);
}
