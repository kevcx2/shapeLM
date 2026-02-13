/**
 * Array type coercion.
 *
 * Handles: array-to-array element coercion, single-to-array wrapping,
 * union hint extraction and propagation between array elements.
 *
 * Analogous to BAML's `coerce_array.rs`.
 */

import type { FieldType as FieldTypeT } from '../types.js';
import type { JsonishValue } from '../values.js';
import type { Flag } from '../flags.js';
import type { ParsingContext } from './context.js';
import type { CoercedValue, CoerceFn, TryCastFn } from './pick-best.js';

// ---------------------------------------------------------------------------
// Union hint extraction
// ---------------------------------------------------------------------------

/**
 * Extract the winning union variant index from flags.
 * Iterates in REVERSE to get the outermost UnionMatch flag
 * (important for nested unions like `(A | B)[]` where B = `(C | D)`).
 */
function extractUnionHint(flags: Flag[]): number | undefined {
  for (let i = flags.length - 1; i >= 0; i--) {
    if (flags[i].kind === 'union-match') {
      return (flags[i] as { kind: 'union-match'; index: number }).index;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// tryCast (strict)
// ---------------------------------------------------------------------------

/**
 * Try strict cast to an array: all elements must pass tryCast.
 */
export function tryCastArray(
  value: JsonishValue,
  itemType: FieldTypeT,
  ctx: ParsingContext,
  tryCastFn: TryCastFn,
): CoercedValue | null {
  // Unwrap markdown / fixed-json
  if (value.type === 'markdown' || value.type === 'fixed-json') {
    return tryCastArray(value.inner, itemType, ctx, tryCastFn);
  }

  if (value.type !== 'array') return null;

  const items = value.items;
  if (items.length === 0) {
    return { value: [], flags: [] };
  }

  const result: unknown[] = [];
  const flags: Flag[] = [];
  let hint = ctx.unionHint;

  for (let i = 0; i < items.length; i++) {
    const elemCtx = ctx.enterScope(`[${i}]`).withUnionHint(hint);
    const coerced = tryCastFn(items[i], itemType, elemCtx);
    if (coerced === null) return null; // Strict: fail on any element
    result.push(coerced.value);
    flags.push(...coerced.flags);
    hint = extractUnionHint(coerced.flags);
  }

  return { value: result, flags };
}

// ---------------------------------------------------------------------------
// coerce (flexible)
// ---------------------------------------------------------------------------

/**
 * Coerce a value to an array using flexible matching.
 * Supports: array-to-array, single-to-array wrapping, null-to-empty.
 */
export function coerceArray(
  value: JsonishValue,
  itemType: FieldTypeT,
  ctx: ParsingContext,
  coerceFn: CoerceFn,
): CoercedValue | null {
  // Unwrap markdown
  if (value.type === 'markdown') {
    const inner = coerceArray(value.inner, itemType, ctx, coerceFn);
    if (inner !== null) {
      inner.flags.push({ kind: 'object-from-markdown', penalty: 0 });
    }
    return inner;
  }
  // Unwrap fixed-json
  if (value.type === 'fixed-json') {
    return coerceArray(value.inner, itemType, ctx, coerceFn);
  }

  // Handle any-of: try each candidate
  if (value.type === 'any-of') {
    for (const candidate of value.candidates) {
      const r = coerceArray(candidate, itemType, ctx, coerceFn);
      if (r !== null) return r;
    }
    // Try raw string as single element
    return coerceArray(
      { type: 'string', value: value.rawString },
      itemType, ctx, coerceFn,
    );
  }

  // Array → array: coerce each element
  if (value.type === 'array') {
    const items = value.items;
    if (items.length === 0) {
      return { value: [], flags: [] };
    }

    const result: unknown[] = [];
    const flags: Flag[] = [];
    let hint = ctx.unionHint;

    for (let i = 0; i < items.length; i++) {
      const elemCtx = ctx.enterScope(`[${i}]`).withUnionHint(hint);
      const coerced = coerceFn(items[i], itemType, elemCtx);
      if (coerced !== null) {
        result.push(coerced.value);
        flags.push(...coerced.flags);
        hint = extractUnionHint(coerced.flags);
      } else {
        flags.push({
          kind: 'array-item-parse-error',
          index: i,
          reason: `Failed to coerce item at index ${i}`,
        });
      }
    }

    return { value: result, flags };
  }

  // Null → empty array
  if (value.type === 'null') {
    return { value: [], flags: [{ kind: 'single-to-array' }] };
  }

  // Single value → wrap in array (SingleToArray)
  const coerced = coerceFn(value, itemType, ctx.enterScope('<implied>'));
  if (coerced !== null) {
    return {
      value: [coerced.value],
      flags: [...coerced.flags, { kind: 'single-to-array' }],
    };
  }

  return null;
}
