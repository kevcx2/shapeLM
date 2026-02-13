/**
 * Primitive type coercion.
 *
 * Coerces JsonishValues into primitive types (string, int, float, bool, null).
 * Each coercion records flags for every transformation applied.
 *
 * Analogous to BAML's `coerce_primitive.rs`.
 */

import type { JsonishValue } from '../values.js';
import { jsonishToString } from '../values.js';
import type { Flag } from '../flags.js';

export interface CoercedValue {
  value: unknown;
  flags: Flag[];
}

// ---------------------------------------------------------------------------
// Currency / number parsing regex
// ---------------------------------------------------------------------------

// Matches: optional sign, optional currency symbol, digits with optional
// comma/dot grouping, optional decimal portion, optional percentage.
// Handles: $1,234.56, €1.234,56, -$100, 1234, 50%
const CURRENCY_RE =
  /^[+-]?\s*[\p{Sc}]?\s*([0-9][0-9,._]*[0-9]|[0-9]+)\s*%?\s*$/u;

// ---------------------------------------------------------------------------
// String coercion
// ---------------------------------------------------------------------------

export function coerceString(value: JsonishValue): CoercedValue {
  const flags: Flag[] = [];

  switch (value.type) {
    case 'string':
      return { value: value.value, flags };
    case 'number':
      flags.push({ kind: 'json-to-string' });
      return { value: String(value.value), flags };
    case 'boolean':
      flags.push({ kind: 'json-to-string' });
      return { value: String(value.value), flags };
    case 'null':
      flags.push({ kind: 'json-to-string' });
      return { value: 'null', flags };
    case 'object':
    case 'array':
      flags.push({ kind: 'json-to-string' });
      return { value: jsonishToString(value), flags };
    case 'markdown':
      return coerceString(value.inner);
    case 'fixed-json':
      return coerceString(value.inner);
    case 'any-of':
      // Prefer parsed candidates for string coercion (they have JSON-level
      // escapes resolved, quotes stripped, etc.). Fall back to rawString.
      for (const candidate of value.candidates) {
        if (candidate.type === 'string') {
          return { value: candidate.value, flags };
        }
      }
      return { value: value.rawString, flags };
  }
}

// ---------------------------------------------------------------------------
// Int coercion
// ---------------------------------------------------------------------------

export function coerceInt(value: JsonishValue): CoercedValue | null {
  const flags: Flag[] = [];

  switch (value.type) {
    case 'number': {
      const n = value.value;
      if (Number.isInteger(n)) {
        return { value: n, flags };
      }
      // Float → round to int
      flags.push({ kind: 'float-to-int', original: n });
      return { value: Math.round(n), flags };
    }

    case 'string': {
      const result = parseNumberFromString(value.value);
      if (result === null) return null;
      flags.push(...result.flags);
      const n = result.value;
      if (Number.isInteger(n)) {
        return { value: n, flags };
      }
      flags.push({ kind: 'float-to-int', original: n });
      return { value: Math.round(n), flags };
    }

    case 'boolean':
      return { value: value.value ? 1 : 0, flags: [{ kind: 'json-to-string' }] };

    case 'null':
      return null;

    case 'markdown':
    case 'fixed-json':
      return coerceInt(value.type === 'markdown' ? value.inner : value.inner);

    case 'any-of': {
      // Try each candidate; pick the first that works
      for (const candidate of value.candidates) {
        const result = coerceInt(candidate);
        if (result !== null) return result;
      }
      // Try the raw string
      return coerceInt({ type: 'string', value: value.rawString });
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Float coercion
// ---------------------------------------------------------------------------

export function coerceFloat(value: JsonishValue): CoercedValue | null {
  const flags: Flag[] = [];

  switch (value.type) {
    case 'number':
      return { value: value.value, flags };

    case 'string': {
      const result = parseNumberFromString(value.value);
      if (result === null) return null;
      return { value: result.value, flags: result.flags };
    }

    case 'boolean':
      return { value: value.value ? 1.0 : 0.0, flags: [{ kind: 'json-to-string' }] };

    case 'null':
      return null;

    case 'markdown':
    case 'fixed-json':
      return coerceFloat(value.type === 'markdown' ? value.inner : value.inner);

    case 'any-of': {
      for (const candidate of value.candidates) {
        const result = coerceFloat(candidate);
        if (result !== null) return result;
      }
      return coerceFloat({ type: 'string', value: value.rawString });
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Bool coercion
// ---------------------------------------------------------------------------

export function coerceBool(value: JsonishValue): CoercedValue | null {
  const flags: Flag[] = [];

  switch (value.type) {
    case 'boolean':
      return { value: value.value, flags };

    case 'string': {
      const lower = value.value.trim().toLowerCase();
      if (lower === 'true' || lower === 'yes' || lower === '1') {
        flags.push({ kind: 'string-to-bool', original: value.value });
        return { value: true, flags };
      }
      if (lower === 'false' || lower === 'no' || lower === '0') {
        flags.push({ kind: 'string-to-bool', original: value.value });
        return { value: false, flags };
      }
      return null;
    }

    case 'number': {
      flags.push({ kind: 'string-to-bool', original: String(value.value) });
      return { value: value.value !== 0, flags };
    }

    case 'null':
      return null;

    case 'markdown':
    case 'fixed-json':
      return coerceBool(value.type === 'markdown' ? value.inner : value.inner);

    case 'any-of': {
      // For bools, prefer the raw string (case-insensitive matching)
      const rawResult = coerceBool({ type: 'string', value: value.rawString });
      if (rawResult !== null) return rawResult;
      for (const candidate of value.candidates) {
        const result = coerceBool(candidate);
        if (result !== null) return result;
      }
      return null;
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Null coercion
// ---------------------------------------------------------------------------

export function coerceNull(value: JsonishValue): CoercedValue | null {
  const flags: Flag[] = [];

  switch (value.type) {
    case 'null':
      return { value: null, flags };

    case 'string': {
      const lower = value.value.trim().toLowerCase();
      if (lower === 'null' || lower === 'none' || lower === '') {
        flags.push({ kind: 'string-to-null', original: value.value });
        return { value: null, flags };
      }
      return null;
    }

    case 'any-of': {
      const rawResult = coerceNull({ type: 'string', value: value.rawString });
      if (rawResult !== null) return rawResult;
      for (const candidate of value.candidates) {
        const result = coerceNull(candidate);
        if (result !== null) return result;
      }
      return null;
    }

    case 'markdown':
    case 'fixed-json':
      return coerceNull(value.type === 'markdown' ? value.inner : value.inner);

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Literal coercion
// ---------------------------------------------------------------------------

export function coerceLiteral(
  value: JsonishValue,
  expected: string | number | boolean,
): CoercedValue | null {
  const flags: Flag[] = [];

  // Direct match
  switch (value.type) {
    case 'string':
      if (typeof expected === 'string' && value.value === expected) {
        return { value: expected, flags };
      }
      if (typeof expected === 'number') {
        const n = parseFloat(value.value);
        if (!isNaN(n) && n === expected) {
          flags.push({ kind: 'string-to-float', original: value.value });
          return { value: expected, flags };
        }
      }
      if (typeof expected === 'boolean') {
        const lower = value.value.trim().toLowerCase();
        if ((expected && (lower === 'true')) || (!expected && (lower === 'false'))) {
          flags.push({ kind: 'string-to-bool', original: value.value });
          return { value: expected, flags };
        }
      }
      return null;

    case 'number':
      if (typeof expected === 'number' && value.value === expected) {
        return { value: expected, flags };
      }
      if (typeof expected === 'string' && String(value.value) === expected) {
        flags.push({ kind: 'json-to-string' });
        return { value: expected, flags };
      }
      return null;

    case 'boolean':
      if (typeof expected === 'boolean' && value.value === expected) {
        return { value: expected, flags };
      }
      return null;

    case 'null':
      return null;

    case 'any-of': {
      // Try raw string first for string literals
      if (typeof expected === 'string') {
        const rawResult = coerceLiteral(
          { type: 'string', value: value.rawString },
          expected,
        );
        if (rawResult !== null) return rawResult;
      }
      for (const candidate of value.candidates) {
        const result = coerceLiteral(candidate, expected);
        if (result !== null) return result;
      }
      return null;
    }

    case 'markdown':
    case 'fixed-json':
      return coerceLiteral(
        value.type === 'markdown' ? value.inner : value.inner,
        expected,
      );

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Number parsing from string (handles fractions, currency)
// ---------------------------------------------------------------------------

function parseNumberFromString(
  s: string,
): { value: number; flags: Flag[] } | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;

  const flags: Flag[] = [];

  // Try direct parse
  const direct = Number(trimmed);
  if (!isNaN(direct) && trimmed !== '') {
    flags.push({ kind: 'string-to-float', original: s });
    return { value: direct, flags };
  }

  // Try fraction: "3/4", "1/2"
  const fractionMatch = trimmed.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1], 10);
    const den = parseInt(fractionMatch[2], 10);
    if (den !== 0) {
      flags.push({ kind: 'string-to-float', original: s });
      return { value: num / den, flags };
    }
  }

  // Try currency / comma-separated: "$1,234.56", "1.234,56", "€100"
  const currencyMatch = trimmed.match(CURRENCY_RE);
  if (currencyMatch) {
    const numPart = currencyMatch[1];
    // Determine decimal separator: if last separator is ',' and there are
    // exactly 1-2 digits after it, treat ',' as decimal separator (European).
    const lastComma = numPart.lastIndexOf(',');
    const lastDot = numPart.lastIndexOf('.');

    let cleaned: string;
    if (
      lastComma > lastDot &&
      // Only treat comma as decimal separator if there are 1-2 digits after it
      // (European format: "1.234,56"). Otherwise it's a grouping separator
      // (US format: "$1,234" → no dot, comma has 3 digits after).
      numPart.length - lastComma - 1 <= 2
    ) {
      // Comma is the decimal separator (European format: 1.234,56)
      cleaned = numPart.replace(/\./g, '').replace(',', '.');
    } else {
      // Dot is the decimal separator or commas are grouping (US format: 1,234.56 or 1,234)
      cleaned = numPart.replace(/,/g, '');
    }

    // Also strip underscores (some formats use _ as grouping)
    cleaned = cleaned.replace(/_/g, '');

    const parsed = Number(cleaned);
    if (!isNaN(parsed)) {
      const isNegative = trimmed.startsWith('-');
      flags.push({ kind: 'string-to-float', original: s });
      return { value: isNegative ? -Math.abs(parsed) : parsed, flags };
    }
  }

  return null;
}
