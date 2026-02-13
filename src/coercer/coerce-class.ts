/**
 * Class/object type coercion.
 *
 * Coerces JsonishValues into class instances by matching object keys to field
 * names. Supports: fuzzy key matching, implied key wrapping (single-field
 * classes), circular reference detection, and default values for missing
 * optional fields.
 *
 * Analogous to BAML's `coerce_class.rs`.
 */

import type { ClassType, ClassField, FieldType as FieldTypeT } from '../types.js';
import type { JsonishValue } from '../values.js';
import type { Flag } from '../flags.js';
import type { ParsingContext } from './context.js';
import { keysMatch } from './match-string.js';
import { pickBest, type CoercedValue, type CoerceFn, type TryCastFn } from './pick-best.js';

// ---------------------------------------------------------------------------
// tryCast (strict)
// ---------------------------------------------------------------------------

/**
 * Try strict cast to a class: all keys must match field names,
 * no extra keys allowed, all required fields must be present.
 */
export function tryCastClass(
  value: JsonishValue,
  classType: ClassType,
  ctx: ParsingContext,
  tryCastFn: TryCastFn,
): CoercedValue | null {
  // Unwrap markdown / fixed-json
  if (value.type === 'markdown' || value.type === 'fixed-json') {
    return tryCastClass(value.inner, classType, ctx, tryCastFn);
  }

  // Only accept objects for strict cast
  if (value.type !== 'object') return null;

  // Circular reference check (scope-based to allow legitimate recursion
  // at different nesting levels while preventing infinite loops)
  const visitKey = `try:${classType.name}@${ctx.displayScope()}`;
  if (ctx.hasVisited(visitKey)) return null;
  const childCtx = ctx.withVisited(visitKey);

  const fields = value.fields;
  const result: Record<string, unknown> = {};
  const flags: Flag[] = [];
  const matchedFieldNames = new Set<string>();

  // Match each object key to a class field
  for (const [key, val] of fields) {
    let matched = false;
    for (const field of classType.fields) {
      const fieldName = field.alias ?? field.name;
      if (keysMatch(key, fieldName)) {
        const coerced = tryCastFn(val, field.type, childCtx.enterScope(field.name));
        if (coerced === null) return null; // Strict: fail on any mismatch
        result[field.name] = coerced.value;
        flags.push(...coerced.flags);
        matchedFieldNames.add(field.name);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Extra key — strict cast fails
      return null;
    }
  }

  // Check all required fields are present
  for (const field of classType.fields) {
    if (!matchedFieldNames.has(field.name)) {
      if (field.optional) {
        result[field.name] = null;
        flags.push({ kind: 'optional-default-from-no-value' });
      } else {
        return null; // Required field missing in strict mode
      }
    }
  }

  return { value: result, flags };
}

// ---------------------------------------------------------------------------
// coerce (flexible)
// ---------------------------------------------------------------------------

/**
 * Coerce a value to a class instance using flexible matching.
 * Supports: fuzzy key matching, implied key wrapping, default values.
 */
export function coerceClass(
  value: JsonishValue,
  classType: ClassType,
  ctx: ParsingContext,
  coerceFn: CoerceFn,
  tryCastFn: TryCastFn,
): CoercedValue | null {
  // Unwrap markdown
  if (value.type === 'markdown') {
    const inner = coerceClass(value.inner, classType, ctx, coerceFn, tryCastFn);
    if (inner !== null) {
      inner.flags.push({ kind: 'object-from-markdown', penalty: 0 });
    }
    return inner;
  }
  // Unwrap fixed-json
  if (value.type === 'fixed-json') {
    const inner = coerceClass(value.inner, classType, ctx, coerceFn, tryCastFn);
    if (inner !== null) {
      inner.flags.push({ kind: 'object-from-fixed-json', fixes: value.fixes });
    }
    return inner;
  }

  // Handle any-of: try each candidate, pick best
  if (value.type === 'any-of') {
    const candidates: CoercedValue[] = [];
    for (const candidate of value.candidates) {
      const r = coerceClass(candidate, classType, ctx, coerceFn, tryCastFn);
      if (r !== null) candidates.push(r);
    }
    // Also try the raw string
    const rawResult = coerceClass(
      { type: 'string', value: value.rawString },
      classType, ctx, coerceFn, tryCastFn,
    );
    if (rawResult !== null) candidates.push(rawResult);

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    return pickBest(candidates);
  }

  // Circular reference check (scope-based to allow legitimate recursion
  // at different nesting levels while preventing infinite loops)
  const visitKey = `coerce:${classType.name}@${ctx.displayScope()}`;
  if (ctx.hasVisited(visitKey)) return null;
  const childCtx = ctx.withVisited(visitKey);

  // Object matching (primary path)
  if (value.type === 'object') {
    return coerceObjectToClass(value.fields, classType, childCtx, coerceFn);
  }

  // Implied key wrapping for single-field classes
  if (classType.fields.length === 1) {
    const field = classType.fields[0];
    const coerced = coerceFn(value, field.type, childCtx.enterScope(field.name));
    if (coerced !== null) {
      return {
        value: { [field.name]: coerced.value },
        flags: [...coerced.flags, { kind: 'implied-key', key: field.name }],
      };
    }
  }

  // Array to single-field class: wrap the array as the field value
  if (value.type === 'array' && classType.fields.length === 1) {
    const field = classType.fields[0];
    const coerced = coerceFn(value, field.type, childCtx.enterScope(field.name));
    if (coerced !== null) {
      return {
        value: { [field.name]: coerced.value },
        flags: [...coerced.flags, { kind: 'implied-key', key: field.name }],
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Core: match object key-value pairs to class fields
// ---------------------------------------------------------------------------

function coerceObjectToClass(
  fields: Array<[string, JsonishValue]>,
  classType: ClassType,
  ctx: ParsingContext,
  coerceFn: CoerceFn,
): CoercedValue | null {
  const result: Record<string, unknown> = {};
  const flags: Flag[] = [];
  const matchedFieldNames = new Set<string>();

  // Match each object key to a class field (fuzzy key matching)
  for (const [key, val] of fields) {
    let matched = false;
    for (const field of classType.fields) {
      const fieldName = field.alias ?? field.name;
      if (keysMatch(key, fieldName)) {
        const coerced = coerceFn(val, field.type, ctx.enterScope(field.name));
        if (coerced !== null) {
          result[field.name] = coerced.value;
          flags.push(...coerced.flags);
          matchedFieldNames.add(field.name);
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      flags.push({ kind: 'extra-key', key });
    }
  }

  // Fill missing fields with defaults
  for (const field of classType.fields) {
    if (!matchedFieldNames.has(field.name)) {
      if (field.optional) {
        result[field.name] = null;
        flags.push({ kind: 'optional-default-from-no-value' });
      } else {
        // Required field missing
        result[field.name] = null;
        flags.push({ kind: 'default-from-no-value' });
      }
    }
  }

  // If no fields matched but we had object keys, try implied-key wrapping
  // for single-field class
  if (matchedFieldNames.size === 0 && fields.length > 0 && classType.fields.length === 1) {
    const field = classType.fields[0];
    const objValue: JsonishValue = { type: 'object', fields };
    const coerced = coerceFn(objValue, field.type, ctx.enterScope(field.name));
    if (coerced !== null) {
      return {
        value: { [field.name]: coerced.value },
        flags: [...coerced.flags, { kind: 'implied-key', key: field.name }],
      };
    }
  }

  return { value: result, flags };
}
