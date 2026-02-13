/**
 * Converts a JSON Schema object into the internal FieldType representation.
 *
 * Supports JSON Schema draft-07 / 2020-12 features:
 *   - type: string, integer, number, boolean, null, object, array
 *   - type as array (e.g. ["string", "null"])
 *   - enum
 *   - const
 *   - properties / required / additionalProperties
 *   - items
 *   - anyOf / oneOf
 *   - $ref with $defs / definitions
 *   - Recursive schemas (cycle detection)
 */

import {
  FieldType,
  type ClassField,
  type EnumValue,
  type FieldType as FieldTypeT,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SchemaConversionOptions {
  /**
   * Name to use for the root type when the schema is an unnamed object.
   * Defaults to "Root".
   */
  rootName?: string;
}

/**
 * Convert a JSON Schema to the internal FieldType representation.
 *
 * The returned `definitions` map contains all named types extracted from
 * `$defs`/`definitions`, keyed by name.  Callers that need to resolve
 * `RecursiveRef` nodes should look them up here.
 */
export function schemaToType(
  schema: Record<string, unknown>,
  options?: SchemaConversionOptions,
): { type: FieldTypeT; definitions: Map<string, FieldTypeT> } {
  const rootName = options?.rootName ?? 'Root';
  const definitions = new Map<string, FieldTypeT>();
  const ctx = new ConversionContext(schema, definitions, rootName);
  const type = ctx.convert(schema, rootName);
  return { type, definitions };
}

// ---------------------------------------------------------------------------
// Internal conversion context
// ---------------------------------------------------------------------------

class ConversionContext {
  /** All named definitions extracted from $defs / definitions. */
  readonly definitions: Map<string, FieldTypeT>;
  /** The root schema, used for resolving $ref. */
  private readonly rootSchema: Record<string, unknown>;
  /** Tracks refs currently being resolved to detect cycles. */
  private readonly resolving = new Set<string>();
  /** Counter for generating unique anonymous type names. */
  private anonCounter = 0;
  private readonly rootName: string;

  constructor(
    rootSchema: Record<string, unknown>,
    definitions: Map<string, FieldTypeT>,
    rootName: string,
  ) {
    this.rootSchema = rootSchema;
    this.definitions = definitions;
    this.rootName = rootName;

    // Pre-register all definition names so we can detect cycles.
    const defs =
      (rootSchema['$defs'] as Record<string, unknown> | undefined) ??
      (rootSchema['definitions'] as Record<string, unknown> | undefined);
    if (defs && typeof defs === 'object') {
      for (const name of Object.keys(defs)) {
        // Placeholder; will be replaced during conversion.
        this.definitions.set(name, FieldType.recursiveRef(name));
      }
      // Now actually convert each definition.
      // We mark each name as "resolving" so that self-references
      // encountered during conversion return a RecursiveRef.
      for (const [name, defSchema] of Object.entries(defs)) {
        if (defSchema && typeof defSchema === 'object') {
          this.resolving.add(name);
          const converted = this.convert(
            defSchema as Record<string, unknown>,
            name,
          );
          this.resolving.delete(name);
          this.definitions.set(name, converted);
        }
      }
    }
  }

  /**
   * Convert a single JSON Schema node to a FieldType.
   *
   * @param schema  The JSON Schema node.
   * @param name    Optional name hint (used for object / enum naming).
   */
  convert(schema: Record<string, unknown>, name?: string): FieldTypeT {
    // --- $ref ---
    if (typeof schema['$ref'] === 'string') {
      return this.resolveRef(schema['$ref']);
    }

    // --- const ---
    if ('const' in schema) {
      const val = schema['const'];
      if (
        typeof val === 'string' ||
        typeof val === 'number' ||
        typeof val === 'boolean'
      ) {
        return FieldType.literal(val);
      }
      // null const
      if (val === null) return FieldType.null();
      // Fallback: treat as string
      return FieldType.literal(String(val));
    }

    // --- enum ---
    if (Array.isArray(schema['enum'])) {
      return this.convertEnum(schema['enum'] as unknown[], name);
    }

    // --- anyOf / oneOf ---
    if (Array.isArray(schema['anyOf'])) {
      return this.convertUnion(
        schema['anyOf'] as Record<string, unknown>[],
        name,
      );
    }
    if (Array.isArray(schema['oneOf'])) {
      return this.convertUnion(
        schema['oneOf'] as Record<string, unknown>[],
        name,
      );
    }

    // --- type (may be string or array) ---
    const rawType = schema['type'];

    if (Array.isArray(rawType)) {
      return this.convertTypeArray(rawType as string[], schema, name);
    }

    if (typeof rawType === 'string') {
      return this.convertSingleType(rawType, schema, name);
    }

    // --- No type, no ref, no enum, no anyOf ---
    // If it has properties, treat as object.
    if (schema['properties'] && typeof schema['properties'] === 'object') {
      return this.convertObject(schema, name);
    }

    // If it has items, treat as array.
    if (schema['items'] && typeof schema['items'] === 'object') {
      return FieldType.list(
        this.convert(schema['items'] as Record<string, unknown>),
      );
    }

    // If it has additionalProperties, treat as map.
    if (
      schema['additionalProperties'] &&
      typeof schema['additionalProperties'] === 'object'
    ) {
      return FieldType.map(
        FieldType.string(),
        this.convert(
          schema['additionalProperties'] as Record<string, unknown>,
        ),
      );
    }

    // Catch-all: treat as string.
    return FieldType.string();
  }

  // -----------------------------------------------------------------------
  // Single type keyword
  // -----------------------------------------------------------------------

  private convertSingleType(
    typeName: string,
    schema: Record<string, unknown>,
    name?: string,
  ): FieldTypeT {
    switch (typeName) {
      case 'string':
        return FieldType.string();
      case 'integer':
        return FieldType.int();
      case 'number':
        return FieldType.float();
      case 'boolean':
        return FieldType.bool();
      case 'null':
        return FieldType.null();
      case 'object':
        return this.convertObject(schema, name);
      case 'array':
        return this.convertArray(schema);
      default:
        return FieldType.string();
    }
  }

  // -----------------------------------------------------------------------
  // Type array (e.g. ["string", "null"])
  // -----------------------------------------------------------------------

  private convertTypeArray(
    types: string[],
    schema: Record<string, unknown>,
    name?: string,
  ): FieldTypeT {
    if (types.length === 1) {
      return this.convertSingleType(types[0], schema, name);
    }

    const options = types.map((t) => this.convertSingleType(t, schema, name));

    // Flatten: if exactly one non-null type + null, use optional().
    const nonNull = options.filter(
      (o) => !(o.type === 'primitive' && o.value === 'null'),
    );
    const hasNull = options.some(
      (o) => o.type === 'primitive' && o.value === 'null',
    );

    if (hasNull && nonNull.length === 1) {
      return FieldType.optional(nonNull[0]);
    }

    return FieldType.union(options);
  }

  // -----------------------------------------------------------------------
  // Object → Class or Map
  // -----------------------------------------------------------------------

  private convertObject(
    schema: Record<string, unknown>,
    name?: string,
  ): FieldTypeT {
    const properties = schema['properties'] as
      | Record<string, unknown>
      | undefined;

    // If no properties but additionalProperties, it's a map.
    if (
      !properties &&
      schema['additionalProperties'] &&
      typeof schema['additionalProperties'] === 'object'
    ) {
      return FieldType.map(
        FieldType.string(),
        this.convert(
          schema['additionalProperties'] as Record<string, unknown>,
        ),
      );
    }

    // If no properties at all, it's an unstructured map<string, unknown>.
    if (!properties || typeof properties !== 'object') {
      return FieldType.map(FieldType.string(), FieldType.string());
    }

    const required = new Set(
      Array.isArray(schema['required'])
        ? (schema['required'] as string[])
        : [],
    );

    const typeName = name ?? this.generateName();

    const fields: ClassField[] = Object.entries(properties).map(
      ([fieldName, fieldSchema]) => {
        const fieldType = this.convert(
          (fieldSchema && typeof fieldSchema === 'object'
            ? fieldSchema
            : {}) as Record<string, unknown>,
          `${typeName}_${fieldName}`,
        );

        const isRequired = required.has(fieldName);
        const description =
          fieldSchema &&
          typeof fieldSchema === 'object' &&
          'description' in fieldSchema
            ? String((fieldSchema as Record<string, unknown>)['description'])
            : undefined;

        return {
          name: fieldName,
          type: fieldType,
          optional: !isRequired,
          description,
        };
      },
    );

    return FieldType.class(typeName, fields);
  }

  // -----------------------------------------------------------------------
  // Array → List
  // -----------------------------------------------------------------------

  private convertArray(schema: Record<string, unknown>): FieldTypeT {
    const items = schema['items'];
    if (items && typeof items === 'object') {
      return FieldType.list(this.convert(items as Record<string, unknown>));
    }
    // No items schema: list of strings (safe default).
    return FieldType.list(FieldType.string());
  }

  // -----------------------------------------------------------------------
  // Enum
  // -----------------------------------------------------------------------

  private convertEnum(values: unknown[], name?: string): FieldTypeT {
    // Check if all values are strings → model as named enum.
    const allStrings = values.every((v) => typeof v === 'string');
    if (allStrings) {
      const enumValues: EnumValue[] = (values as string[]).map((v) => ({
        name: v,
      }));
      return FieldType.enum(name ?? this.generateName(), enumValues);
    }

    // Mixed values: model as union of literals.
    const options: FieldTypeT[] = values.map((v) => {
      if (v === null) return FieldType.null();
      if (
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        return FieldType.literal(v);
      }
      return FieldType.literal(String(v));
    });

    return FieldType.union(options);
  }

  // -----------------------------------------------------------------------
  // Union (anyOf / oneOf)
  // -----------------------------------------------------------------------

  private convertUnion(
    schemas: Record<string, unknown>[],
    name?: string,
  ): FieldTypeT {
    const options = schemas.map((s, i) =>
      this.convert(s, name ? `${name}_option${i}` : undefined),
    );

    // Flatten: if the result is a single option, unwrap.
    if (options.length === 1) return options[0];

    // Check if it's just T | null (optional).
    const nonNull = options.filter(
      (o) => !(o.type === 'primitive' && o.value === 'null'),
    );
    const hasNull = options.some(
      (o) => o.type === 'primitive' && o.value === 'null',
    );

    if (hasNull && nonNull.length === 1) {
      return FieldType.optional(nonNull[0]);
    }

    return FieldType.union(options);
  }

  // -----------------------------------------------------------------------
  // $ref resolution
  // -----------------------------------------------------------------------

  private resolveRef(ref: string): FieldTypeT {
    // Support: #/$defs/Foo, #/definitions/Foo
    const match = ref.match(
      /^#\/(?:\$defs|definitions)\/(.+)$/,
    );
    if (!match) {
      // Unsupported ref format; treat as string.
      return FieldType.string();
    }

    const defName = match[1];

    // Cycle detection: if we're already resolving this ref, return a recursive ref.
    if (this.resolving.has(defName)) {
      return FieldType.recursiveRef(defName);
    }

    // If already fully resolved, return it.
    const existing = this.definitions.get(defName);
    if (existing && existing.type !== 'recursive-ref') {
      return existing;
    }

    // Resolve from root schema.
    const defs =
      (this.rootSchema['$defs'] as Record<string, unknown> | undefined) ??
      (this.rootSchema['definitions'] as Record<string, unknown> | undefined);
    if (!defs || typeof defs !== 'object') {
      return FieldType.string();
    }

    const defSchema = defs[defName];
    if (!defSchema || typeof defSchema !== 'object') {
      return FieldType.string();
    }

    this.resolving.add(defName);
    const converted = this.convert(
      defSchema as Record<string, unknown>,
      defName,
    );
    this.resolving.delete(defName);

    this.definitions.set(defName, converted);
    return converted;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private generateName(): string {
    return `Anon${++this.anonCounter}`;
  }
}
