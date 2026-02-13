/**
 * Main coercion dispatcher.
 *
 * Routes coercion requests to the appropriate type-specific coercer.
 * Implements the dual tryCast/coerce pattern:
 *   - tryCast: strict matching, returns null on any mismatch
 *   - coerce: flexible matching, applies transformations with flag recording
 *
 * Analogous to BAML's `TypeCoercer` trait dispatch in `field_type.rs`.
 */

import type { FieldType as FieldTypeT } from '../types.js';
import type { JsonishValue } from '../values.js';
import { totalScore } from '../flags.js';
import type { ParsingContext } from './context.js';
import { pickBest, type CoercedValue } from './pick-best.js';

// Primitives
import {
  coerceString,
  coerceInt,
  coerceFloat,
  coerceBool,
  coerceNull,
  coerceLiteral,
} from './coerce-primitive.js';

// Enum
import { tryCastEnum, coerceEnum } from './coerce-enum.js';

// Class
import { tryCastClass, coerceClass } from './coerce-class.js';

// Array
import { tryCastArray, coerceArray } from './coerce-array.js';

// Map
import { tryCastMap, coerceMap } from './coerce-map.js';

// Union
import { tryCastUnion, coerceUnion } from './coerce-union.js';

// ---------------------------------------------------------------------------
// tryCast dispatcher
// ---------------------------------------------------------------------------

/**
 * Try strict cast: returns a CoercedValue only if the value matches
 * the target type with minimal or no transformation.
 *
 * Handles AnyOf/markdown/fixed-json unwrapping at the top level before
 * dispatching to type-specific handlers.
 */
export function tryCast(
  value: JsonishValue,
  target: FieldTypeT,
  ctx: ParsingContext,
): CoercedValue | null {
  // Unwrap AnyOf: try each candidate with tryCast
  if (value.type === 'any-of') {
    const candidates: CoercedValue[] = [];
    for (const candidate of value.candidates) {
      const r = tryCast(candidate, target, ctx);
      if (r !== null) {
        if (totalScore(r.flags) === 0) return r; // Perfect match: return immediately
        candidates.push(r);
      }
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    return pickBest(candidates);
  }

  // Unwrap markdown / fixed-json
  if (value.type === 'markdown') {
    return tryCast(value.inner, target, ctx);
  }
  if (value.type === 'fixed-json') {
    return tryCast(value.inner, target, ctx);
  }

  // Type-specific dispatch
  switch (target.type) {
    case 'primitive':
      return tryCastPrimitive(value, target.value);

    case 'literal':
      return coerceLiteral(value, target.value);

    case 'enum':
      return tryCastEnum(value, target);

    case 'class':
      return tryCastClass(value, target, ctx, tryCast);

    case 'list':
      return tryCastArray(value, target.items, ctx, tryCast);

    case 'map':
      return tryCastMap(value, target.key, target.values, ctx, tryCast);

    case 'union':
      return tryCastUnion(value, target, ctx, tryCast);

    case 'recursive-ref': {
      const resolved = ctx.resolve(target.name);
      if (!resolved) return null;
      return tryCast(value, resolved, ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// coerce dispatcher
// ---------------------------------------------------------------------------

/**
 * Coerce a JsonishValue to the target FieldType.
 * Applies flexible transformations, recording flags for each one.
 */
export function coerce(
  value: JsonishValue,
  target: FieldTypeT,
  ctx: ParsingContext,
): CoercedValue | null {
  switch (target.type) {
    case 'primitive':
      return coercePrimitive(value, target.value);

    case 'literal':
      return coerceLiteral(value, target.value);

    case 'enum':
      return coerceEnum(value, target);

    case 'class':
      return coerceClass(value, target, ctx, coerce, tryCast);

    case 'list':
      return coerceArray(value, target.items, ctx, coerce);

    case 'map':
      return coerceMap(value, target.key, target.values, ctx, coerce);

    case 'union':
      return coerceUnion(value, target, ctx, coerce, tryCast);

    case 'recursive-ref': {
      const resolved = ctx.resolve(target.name);
      if (!resolved) return null;
      return coerce(value, resolved, ctx);
    }
  }
}

// ---------------------------------------------------------------------------
// Primitive dispatch helpers
// ---------------------------------------------------------------------------

function tryCastPrimitive(
  value: JsonishValue,
  kind: string,
): CoercedValue | null {
  // Strict: for primitives, only accept exact type match
  switch (kind) {
    case 'string':
      if (value.type === 'string') return { value: value.value, flags: [] };
      return null;
    case 'int':
      if (value.type === 'number' && Number.isInteger(value.value))
        return { value: value.value, flags: [] };
      return null;
    case 'float':
      if (value.type === 'number') return { value: value.value, flags: [] };
      return null;
    case 'bool':
      if (value.type === 'boolean') return { value: value.value, flags: [] };
      return null;
    case 'null':
      if (value.type === 'null') return { value: null, flags: [] };
      return null;
    default:
      return null;
  }
}

function coercePrimitive(
  value: JsonishValue,
  kind: string,
): CoercedValue | null {
  switch (kind) {
    case 'string':
      return coerceString(value);
    case 'int':
      return coerceInt(value);
    case 'float':
      return coerceFloat(value);
    case 'bool':
      return coerceBool(value);
    case 'null':
      return coerceNull(value);
    default:
      return null;
  }
}
