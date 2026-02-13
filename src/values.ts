/**
 * Intermediate "jsonish" value representation.
 *
 * This is the output of the structural parser (Phase 1 of parsing).
 * It can represent both well-formed JSON values and ambiguous /
 * partially-repaired values that the coercion engine will resolve.
 *
 * Analogous to BAML's `jsonish::Value`.
 */

// ---------------------------------------------------------------------------
// Fixes — records what structural repairs were applied during parsing
// ---------------------------------------------------------------------------

export type Fix = 'grepped-for-json' | 'inferred-array';

// ---------------------------------------------------------------------------
// JsonishValue — discriminated union
// ---------------------------------------------------------------------------

export type JsonishValue =
  | JsonishString
  | JsonishNumber
  | JsonishBoolean
  | JsonishNull
  | JsonishObject
  | JsonishArray
  | JsonishMarkdown
  | JsonishFixedJson
  | JsonishAnyOf;

// --- Primitives ---

export interface JsonishString {
  type: 'string';
  value: string;
}

export interface JsonishNumber {
  type: 'number';
  value: number;
}

export interface JsonishBoolean {
  type: 'boolean';
  value: boolean;
}

export interface JsonishNull {
  type: 'null';
}

// --- Structured ---

export interface JsonishObject {
  type: 'object';
  /** Key-value pairs in insertion order. */
  fields: Array<[string, JsonishValue]>;
}

export interface JsonishArray {
  type: 'array';
  items: JsonishValue[];
}

// --- Wrappers (parse metadata) ---

/** Value extracted from a markdown code block. */
export interface JsonishMarkdown {
  type: 'markdown';
  /** The language tag (e.g. "json", "typescript", ""). */
  tag: string;
  /** The parsed content of the code block. */
  inner: JsonishValue;
}

/** Value that was repaired by the fixing parser. */
export interface JsonishFixedJson {
  type: 'fixed-json';
  inner: JsonishValue;
  fixes: Fix[];
}

/**
 * Multiple candidate interpretations of the same raw text.
 *
 * This is the key interface between parsing and coercion.
 * The parser says "here are all plausible structural reads";
 * the coercer picks the one that best fits the target schema.
 */
export interface JsonishAnyOf {
  type: 'any-of';
  /** Candidate parsed values. */
  candidates: JsonishValue[];
  /** The original raw string these candidates were derived from. */
  rawString: string;
}

// ---------------------------------------------------------------------------
// Builders — convenience constructors
// ---------------------------------------------------------------------------

export const JsonishValue = {
  string(value: string): JsonishString {
    return { type: 'string', value };
  },
  number(value: number): JsonishNumber {
    return { type: 'number', value };
  },
  boolean(value: boolean): JsonishBoolean {
    return { type: 'boolean', value };
  },
  null(): JsonishNull {
    return { type: 'null' };
  },
  object(fields: Array<[string, JsonishValue]>): JsonishObject {
    return { type: 'object', fields };
  },
  array(items: JsonishValue[]): JsonishArray {
    return { type: 'array', items };
  },
  markdown(tag: string, inner: JsonishValue): JsonishMarkdown {
    return { type: 'markdown', tag, inner };
  },
  fixedJson(inner: JsonishValue, fixes: Fix[]): JsonishFixedJson {
    return { type: 'fixed-json', inner, fixes };
  },
  anyOf(candidates: JsonishValue[], rawString: string): JsonishAnyOf {
    return { type: 'any-of', candidates, rawString };
  },
} as const;

// ---------------------------------------------------------------------------
// Display helper (for debugging / error messages)
// ---------------------------------------------------------------------------

export function jsonishToString(v: JsonishValue): string {
  switch (v.type) {
    case 'string':
      return v.value;
    case 'number':
      return String(v.value);
    case 'boolean':
      return String(v.value);
    case 'null':
      return 'null';
    case 'object': {
      const entries = v.fields
        .map(([k, val]) => `${k}: ${jsonishToString(val)}`)
        .join(', ');
      return `{${entries}}`;
    }
    case 'array':
      return `[${v.items.map(jsonishToString).join(', ')}]`;
    case 'markdown':
      return `${v.tag}\n${jsonishToString(v.inner)}`;
    case 'fixed-json':
      return jsonishToString(v.inner);
    case 'any-of':
      return `AnyOf[${v.rawString}]`;
  }
}

/** Return the "type name" of a JsonishValue (for error messages). */
export function jsonishTypeName(v: JsonishValue): string {
  switch (v.type) {
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'boolean':
      return 'Boolean';
    case 'null':
      return 'Null';
    case 'object':
      return 'Object';
    case 'array':
      return 'Array';
    case 'markdown':
      return `Markdown:${v.tag}`;
    case 'fixed-json':
      return `FixedJson`;
    case 'any-of':
      return `AnyOf`;
  }
}
