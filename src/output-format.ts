/**
 * Output format renderer.
 *
 * Given a JSON Schema (or FieldType), produces a human-readable text snippet
 * to append to an LLM prompt that instructs the model on the expected
 * output structure.
 *
 * Analogous to BAML's `OutputFormatContent::render()`.
 */

import { schemaToType } from './schema-to-types.js';
import {
  FieldType,
  isOptional,
  stripNull,
  type FieldType as FieldTypeT,
  type ClassType,
  type EnumType,
} from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Custom prefix text. Defaults to a sensible per-type prefix. */
  prefix?: string | null;
  /** Separator between union alternatives. Default: " or ". */
  orSplitter?: string;
  /** Prefix for each enum value line. Default: "- ". */
  enumValuePrefix?: string;
  /** Whether to always hoist enums (define them separately). Default: false. */
  alwaysHoistEnums?: boolean;
  /** Whether to hoist classes. "auto" = hoist if recursive. Default: "auto". */
  hoistClasses?: boolean | 'auto';
  /** Whether to quote class field names. Default: false. */
  quoteClassFields?: boolean;
  /**
   * Map rendering style.
   *   "angle": `map<string, int>`
   *   "object": `{[key: string]: int}`
   * Default: "angle".
   */
  mapStyle?: 'angle' | 'object';
  /** Root type name for unnamed schemas. Default: "Root". */
  rootName?: string;
}

const DEFAULT_OPTIONS: Required<RenderOptions> = {
  prefix: undefined as unknown as string,
  orSplitter: ' or ',
  enumValuePrefix: '- ',
  alwaysHoistEnums: false,
  hoistClasses: 'auto',
  quoteClassFields: false,
  mapStyle: 'angle',
  rootName: 'Root',
};

/**
 * Render an output format prompt snippet from a JSON Schema.
 */
export function renderOutputFormat(
  schema: Record<string, unknown>,
  options?: RenderOptions,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { type, definitions } = schemaToType(schema, {
    rootName: opts.rootName,
  });

  const ctx = new RenderContext(opts, definitions);
  return ctx.render(type);
}

/**
 * Render an output format prompt snippet from an already-converted FieldType.
 * Useful when you've already called `schemaToType` yourself.
 */
export function renderOutputFormatFromType(
  type: FieldTypeT,
  definitions?: Map<string, FieldTypeT>,
  options?: RenderOptions,
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ctx = new RenderContext(opts, definitions ?? new Map());
  return ctx.render(type);
}

// ---------------------------------------------------------------------------
// Render context
// ---------------------------------------------------------------------------

class RenderContext {
  private readonly opts: Required<RenderOptions>;
  private readonly definitions: Map<string, FieldTypeT>;
  /** Types that need to be "hoisted" — defined before the main schema. */
  private readonly hoisted = new Map<string, string>();
  /** Track which types are already being rendered (cycle protection). */
  private readonly rendering = new Set<string>();

  constructor(opts: Required<RenderOptions>, definitions: Map<string, FieldTypeT>) {
    this.opts = opts;
    this.definitions = definitions;
  }

  render(type: FieldTypeT): string {
    // First pass: collect hoisted definitions.
    this.collectHoisted(type);

    // Build the main type string.
    const mainType = this.renderType(type);

    // Assemble: hoisted definitions + prefix + main type.
    const sections: string[] = [];

    if (this.hoisted.size > 0) {
      for (const [, block] of this.hoisted) {
        sections.push(block);
      }
      sections.push('');
    }

    const prefix = this.getPrefix(type);
    if (prefix !== null) {
      sections.push(prefix);
    }

    sections.push(mainType);

    return sections.join('\n');
  }

  // -----------------------------------------------------------------------
  // Prefix logic
  // -----------------------------------------------------------------------

  private getPrefix(type: FieldTypeT): string | null {
    if (this.opts.prefix !== undefined) return this.opts.prefix;

    switch (type.type) {
      case 'primitive':
        switch (type.value) {
          case 'string':
            return 'Answer as a string.';
          case 'int':
            return 'Answer as an integer.';
          case 'float':
            return 'Answer as a number.';
          case 'bool':
            return 'Answer as a boolean (true or false).';
          case 'null':
            return 'Answer with null.';
        }
        break;
      case 'enum':
        return null; // Enum block is self-describing.
      case 'class':
        return 'Answer in JSON using this schema:';
      case 'list':
        return 'Answer with a JSON Array using this schema:';
      case 'map':
        return 'Answer in JSON using this schema:';
      case 'union':
        return 'Answer in JSON using this schema:';
      case 'literal':
        return `Answer with the value: ${JSON.stringify(type.value)}`;
      case 'recursive-ref':
        return 'Answer in JSON using this schema:';
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Hoisting — collect types that must be defined before the main schema
  // -----------------------------------------------------------------------

  private collectHoisted(type: FieldTypeT): void {
    switch (type.type) {
      case 'enum':
        if (this.shouldHoistEnum(type)) {
          this.hoistEnum(type);
        }
        break;
      case 'class':
        // Recurse into fields first.
        for (const field of type.fields) {
          this.collectHoisted(field.type);
        }
        if (this.shouldHoistClass(type)) {
          this.hoistClass(type);
        }
        break;
      case 'list':
        this.collectHoisted(type.items);
        break;
      case 'map':
        this.collectHoisted(type.values);
        break;
      case 'union':
        for (const opt of type.options) {
          this.collectHoisted(opt);
        }
        break;
      case 'recursive-ref': {
        const resolved = this.definitions.get(type.name);
        if (resolved && !this.hoisted.has(type.name) && !this.rendering.has(type.name)) {
          this.rendering.add(type.name);
          this.collectHoisted(resolved);
          if (resolved.type === 'class') {
            this.hoistClass(resolved);
          } else if (resolved.type === 'enum') {
            this.hoistEnum(resolved);
          }
          this.rendering.delete(type.name);
        }
        break;
      }
      default:
        break;
    }
  }

  private shouldHoistEnum(type: EnumType): boolean {
    if (this.opts.alwaysHoistEnums) return true;
    // Hoist if > 6 values or any value has a description.
    if (type.values.length > 6) return true;
    if (type.values.some((v) => v.description)) return true;
    return false;
  }

  private shouldHoistClass(type: ClassType): boolean {
    if (this.opts.hoistClasses === true) return true;
    if (this.opts.hoistClasses === false) return false;
    // "auto": hoist if the class is referenced by a recursive-ref.
    return this.isReferencedRecursively(type.name);
  }

  private isReferencedRecursively(name: string): boolean {
    return this.definitions.has(name);
  }

  private hoistEnum(type: EnumType): void {
    if (this.hoisted.has(type.name)) return;
    const lines = [type.name, '----'];
    for (const v of type.values) {
      if (v.description) {
        lines.push(`${this.opts.enumValuePrefix}${v.alias ?? v.name}: ${v.description}`);
      } else {
        lines.push(`${this.opts.enumValuePrefix}${v.alias ?? v.name}`);
      }
    }
    this.hoisted.set(type.name, lines.join('\n'));
  }

  private hoistClass(type: ClassType): void {
    if (this.hoisted.has(type.name)) return;
    // Temporarily mark as hoisted to prevent infinite recursion.
    this.hoisted.set(type.name, '');
    const body = this.renderClassBody(type);
    this.hoisted.set(type.name, `${type.name} {\n${body}\n}`);
  }

  // -----------------------------------------------------------------------
  // Type rendering
  // -----------------------------------------------------------------------

  renderType(type: FieldTypeT): string {
    switch (type.type) {
      case 'primitive':
        return type.value;
      case 'enum':
        return this.renderEnum(type);
      case 'class':
        return this.renderClass(type);
      case 'list':
        return this.renderList(type);
      case 'map':
        return this.renderMap(type);
      case 'union':
        return this.renderUnion(type);
      case 'literal':
        return JSON.stringify(type.value);
      case 'recursive-ref':
        return type.name;
    }
  }

  private renderEnum(type: EnumType): string {
    if (this.hoisted.has(type.name)) {
      return type.name;
    }
    // Inline enum: just list the values.
    const values = type.values.map((v) => v.alias ?? v.name);
    return values.join(this.opts.orSplitter);
  }

  private renderClass(type: ClassType): string {
    if (this.hoisted.has(type.name)) {
      return type.name;
    }
    const body = this.renderClassBody(type);
    return `{\n${body}\n}`;
  }

  private renderClassBody(type: ClassType): string {
    return type.fields
      .map((field) => {
        const fieldName = this.opts.quoteClassFields
          ? `"${field.name}"`
          : field.name;
        const typeStr = this.renderFieldType(field.type, field.optional);
        const desc = field.description ? ` // ${field.description}` : '';
        return `  ${fieldName}: ${typeStr},${desc}`;
      })
      .join('\n');
  }

  private renderFieldType(type: FieldTypeT, optional: boolean): string {
    let typeStr = this.renderType(type);

    if (optional && !isOptional(type)) {
      typeStr = `${typeStr} | null`;
    }

    return typeStr;
  }

  private renderList(type: { items: FieldTypeT }): string {
    const inner = this.renderType(type.items);
    // For simple types, use `type[]`. For complex, use `type[]`.
    return `${inner}[]`;
  }

  private renderMap(type: { key: FieldTypeT; values: FieldTypeT }): string {
    const keyStr = this.renderType(type.key);
    const valStr = this.renderType(type.values);
    if (this.opts.mapStyle === 'object') {
      return `{[key: ${keyStr}]: ${valStr}}`;
    }
    return `map<${keyStr}, ${valStr}>`;
  }

  private renderUnion(type: { options: FieldTypeT[] }): string {
    const nonNull = type.options.filter(
      (o) => !(o.type === 'primitive' && o.value === 'null'),
    );
    const hasNull = type.options.some(
      (o) => o.type === 'primitive' && o.value === 'null',
    );

    const parts = (nonNull.length > 0 ? nonNull : type.options).map((o) =>
      this.renderType(o),
    );

    let result = parts.join(this.opts.orSplitter);
    if (hasNull && nonNull.length > 0) {
      result += ' | null';
    }
    return result;
  }
}
