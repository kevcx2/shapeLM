/**
 * Map type coercion.
 *
 * Coerces object values into maps with typed keys and values.
 *
 * Analogous to BAML's `coerce_map.rs`.
 */

import type { FieldType as FieldTypeT } from '../types.js';
import type { JsonishValue } from '../values.js';
import type { Flag } from '../flags.js';
import type { ParsingContext } from './context.js';
import type { CoercedValue, CoerceFn, TryCastFn } from './pick-best.js';

// ---------------------------------------------------------------------------
// tryCast (strict)
// ---------------------------------------------------------------------------

/**
 * Try strict cast to a map: all keys and values must pass tryCast.
 */
export function tryCastMap(
  value: JsonishValue,
  keyType: FieldTypeT,
  valueType: FieldTypeT,
  ctx: ParsingContext,
  tryCastFn: TryCastFn,
): CoercedValue | null {
  // Unwrap markdown / fixed-json
  if (value.type === 'markdown' || value.type === 'fixed-json') {
    return tryCastMap(value.inner, keyType, valueType, ctx, tryCastFn);
  }

  if (value.type !== 'object') return null;

  const fields = value.fields;
  const flags: Flag[] = [{ kind: 'object-to-map' }];

  if (fields.length === 0) {
    return { value: {}, flags };
  }

  const result: Record<string, unknown> = {};

  for (const [key, val] of fields) {
    // Try cast value
    const coercedVal = tryCastFn(val, valueType, ctx.enterScope(key));
    if (coercedVal === null) return null;

    // Try cast key
    const coercedKey = tryCastFn(
      { type: 'string', value: key },
      keyType,
      ctx.enterScope(`<key:${key}>`),
    );
    if (coercedKey === null) return null;

    result[String(coercedKey.value)] = coercedVal.value;
    flags.push(...coercedKey.flags, ...coercedVal.flags);
  }

  return { value: result, flags };
}

// ---------------------------------------------------------------------------
// coerce (flexible)
// ---------------------------------------------------------------------------

/**
 * Coerce a value to a map using flexible matching.
 * Individual key/value failures are recorded as flags rather than aborting.
 */
export function coerceMap(
  value: JsonishValue,
  keyType: FieldTypeT,
  valueType: FieldTypeT,
  ctx: ParsingContext,
  coerceFn: CoerceFn,
): CoercedValue | null {
  // Unwrap markdown
  if (value.type === 'markdown') {
    const inner = coerceMap(value.inner, keyType, valueType, ctx, coerceFn);
    if (inner !== null) {
      inner.flags.push({ kind: 'object-from-markdown', penalty: 0 });
    }
    return inner;
  }
  // Unwrap fixed-json
  if (value.type === 'fixed-json') {
    return coerceMap(value.inner, keyType, valueType, ctx, coerceFn);
  }

  // Handle any-of
  if (value.type === 'any-of') {
    for (const candidate of value.candidates) {
      const r = coerceMap(candidate, keyType, valueType, ctx, coerceFn);
      if (r !== null) return r;
    }
    return null;
  }

  if (value.type !== 'object') return null;

  const fields = value.fields;
  const flags: Flag[] = [{ kind: 'object-to-map' }];
  const result: Record<string, unknown> = {};

  for (let i = 0; i < fields.length; i++) {
    const [key, val] = fields[i];

    // Coerce value
    const coercedVal = coerceFn(val, valueType, ctx.enterScope(key));
    if (coercedVal === null) {
      flags.push({
        kind: 'map-value-parse-error',
        key,
        reason: `Failed to coerce value for key "${key}"`,
      });
      continue;
    }

    // Coerce key
    const coercedKey = coerceFn(
      { type: 'string', value: key },
      keyType,
      ctx.enterScope(`<key:${key}>`),
    );
    if (coercedKey === null) {
      flags.push({
        kind: 'map-key-parse-error',
        index: i,
        reason: `Failed to coerce key "${key}"`,
      });
      continue;
    }

    result[String(coercedKey.value)] = coercedVal.value;
    flags.push(...coercedKey.flags, ...coercedVal.flags);
  }

  return { value: result, flags };
}
