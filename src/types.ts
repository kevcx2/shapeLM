/**
 * Internal type representation — analogous to BAML's TypeIR.
 *
 * This is the canonical type system used throughout the library.
 * JSON Schema is converted into these types (see schema-to-types.ts),
 * and all coercion / rendering logic operates on them.
 */

// ---------------------------------------------------------------------------
// Enum & Class metadata
// ---------------------------------------------------------------------------

export interface EnumValue {
  /** The canonical name of this variant. */
  name: string;
  /** Optional alias the LLM may use instead of the canonical name. */
  alias?: string;
  /** Optional human-readable description (also used as a fuzzy-match candidate). */
  description?: string;
}

export interface ClassField {
  /** The canonical field name. */
  name: string;
  /** The field's type. */
  type: FieldType;
  /** Whether the field is optional (i.e. may be absent / null). */
  optional: boolean;
  /** Optional alias the LLM may use for this key. */
  alias?: string;
  /** Optional human-readable description. */
  description?: string;
}

// ---------------------------------------------------------------------------
// FieldType — discriminated union
// ---------------------------------------------------------------------------

export type FieldType =
  | PrimitiveType
  | EnumType
  | ClassType
  | ListType
  | MapType
  | UnionType
  | LiteralType
  | RecursiveRef;

// --- Primitives ---

export type PrimitiveKind = 'string' | 'int' | 'float' | 'bool' | 'null';

export interface PrimitiveType {
  type: 'primitive';
  value: PrimitiveKind;
}

// --- Enum ---

export interface EnumType {
  type: 'enum';
  name: string;
  values: EnumValue[];
}

// --- Class ---

export interface ClassType {
  type: 'class';
  name: string;
  fields: ClassField[];
}

// --- List ---

export interface ListType {
  type: 'list';
  items: FieldType;
}

// --- Map ---

export interface MapType {
  type: 'map';
  key: FieldType;
  values: FieldType;
}

// --- Union ---

export interface UnionType {
  type: 'union';
  options: FieldType[];
}

// --- Literal ---

export interface LiteralType {
  type: 'literal';
  value: string | number | boolean;
}

// --- Recursive reference (placeholder resolved at coercion time) ---

export interface RecursiveRef {
  type: 'recursive-ref';
  name: string;
}

// ---------------------------------------------------------------------------
// Builders — convenience constructors
// ---------------------------------------------------------------------------

export const FieldType = {
  string(): PrimitiveType {
    return { type: 'primitive', value: 'string' };
  },
  int(): PrimitiveType {
    return { type: 'primitive', value: 'int' };
  },
  float(): PrimitiveType {
    return { type: 'primitive', value: 'float' };
  },
  bool(): PrimitiveType {
    return { type: 'primitive', value: 'bool' };
  },
  null(): PrimitiveType {
    return { type: 'primitive', value: 'null' };
  },

  enum(name: string, values: EnumValue[]): EnumType {
    return { type: 'enum', name, values };
  },

  class(name: string, fields: ClassField[]): ClassType {
    return { type: 'class', name, fields };
  },

  list(items: FieldType): ListType {
    return { type: 'list', items };
  },

  map(key: FieldType, values: FieldType): MapType {
    return { type: 'map', key, values };
  },

  union(options: FieldType[]): UnionType {
    return { type: 'union', options };
  },

  optional(inner: FieldType): UnionType {
    // If inner is already a union containing null, don't double-wrap.
    if (inner.type === 'union') {
      const hasNull = inner.options.some(
        (o) => o.type === 'primitive' && o.value === 'null',
      );
      if (hasNull) return inner;
      return { type: 'union', options: [...inner.options, FieldType.null()] };
    }
    if (inner.type === 'primitive' && inner.value === 'null') {
      return { type: 'union', options: [inner] };
    }
    return { type: 'union', options: [inner, FieldType.null()] };
  },

  literal(value: string | number | boolean): LiteralType {
    return { type: 'literal', value };
  },

  recursiveRef(name: string): RecursiveRef {
    return { type: 'recursive-ref', name };
  },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether a FieldType is optional (is or contains null). */
export function isOptional(ft: FieldType): boolean {
  if (ft.type === 'primitive' && ft.value === 'null') return true;
  if (ft.type === 'union') {
    return ft.options.some((o) => o.type === 'primitive' && o.value === 'null');
  }
  return false;
}

/** Strip the null branch from a union, returning the non-null type(s). */
export function stripNull(ft: FieldType): FieldType {
  if (ft.type !== 'union') return ft;
  const nonNull = ft.options.filter(
    (o) => !(o.type === 'primitive' && o.value === 'null'),
  );
  if (nonNull.length === 0) return FieldType.null();
  if (nonNull.length === 1) return nonNull[0];
  return FieldType.union(nonNull);
}
