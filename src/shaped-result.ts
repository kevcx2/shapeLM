/**
 * ShapedResult<T> — the user-facing result type.
 *
 * Wraps the internal CoercionResult with a clean DX:
 *   - .ok / .data / .errors — status + value
 *   - .assert()             — throw on failure
 *   - .feedback()           — LLM-readable repair prompt
 *   - .coercions            — type transformations applied
 *   - .repairs              — structural fixes applied (JSON repair, markdown extraction)
 *   - .score                — numeric quality score
 */

import type { Flag } from './flags.js';
import { flagScore } from './flags.js';

// ---------------------------------------------------------------------------
// Coercion — a type transformation (string→int, object→string, etc.)
// ---------------------------------------------------------------------------

export interface Coercion {
  /** Dot-path to the value that was coerced, e.g. "person.age". */
  path: string;
  /** Human-readable description of the transformation. */
  message: string;
  /** Penalty score for this coercion. */
  penalty: number;
}

// ---------------------------------------------------------------------------
// Repair — a structural fix (JSON repair, markdown extraction, etc.)
// ---------------------------------------------------------------------------

export interface Repair {
  /** Human-readable description of the repair. */
  message: string;
  /** Penalty score for this repair. */
  penalty: number;
}

// ---------------------------------------------------------------------------
// Flag classification
// ---------------------------------------------------------------------------

/** Flags that represent structural repairs (not type coercions). */
const REPAIR_FLAGS = new Set([
  'object-from-markdown',
  'object-from-fixed-json',
  'inferred-object',
]);

// ---------------------------------------------------------------------------
// ShapedResult
// ---------------------------------------------------------------------------

export class ShapedResult<T = unknown> {
  /** Whether parsing + coercion + validation fully succeeded. */
  readonly ok: boolean;

  /**
   * The coerced value, shaped to match the target schema.
   * Defined when `ok` is true. May be partially defined when `ok` is false.
   */
  readonly data: T | undefined;

  /**
   * Error messages. Empty array when `ok` is true.
   */
  readonly errors: string[];

  /**
   * Aggregate quality score (0 = perfect match, higher = more coercion).
   */
  readonly score: number;

  /**
   * Type transformations applied during coercion (string→int, etc.).
   */
  readonly coercions: Coercion[];

  /**
   * Structural repairs applied (JSON fix, markdown extraction, etc.).
   */
  readonly repairs: Repair[];

  /**
   * Raw flags from the coercion engine (for advanced introspection).
   */
  readonly flags: Flag[];

  /**
   * The original raw LLM text that was parsed.
   */
  readonly raw: string;

  /**
   * The output format prompt that was used (if available).
   * Set by the parser() factory so .feedback() can include it.
   */
  readonly _outputFormat: string | undefined;

  constructor(opts: {
    ok: boolean;
    data: T | undefined;
    errors: string[];
    score: number;
    flags: Flag[];
    raw: string;
    outputFormat?: string;
  }) {
    this.ok = opts.ok;
    this.data = opts.data;
    this.errors = opts.errors;
    this.score = opts.score;
    this.flags = opts.flags;
    this.raw = opts.raw;
    this._outputFormat = opts.outputFormat;

    const { coercions, repairs } = classifyFlags(opts.flags);
    this.coercions = coercions;
    this.repairs = repairs;
  }

  /**
   * Assert that parsing succeeded. Throws if it did not.
   *
   * @returns The coerced data value (typed as T).
   */
  assert(): T {
    if (!this.ok || this.data === undefined) {
      throw new ShapedResultError(
        this.errors.length > 0
          ? this.errors.join('; ')
          : 'Structuring failed with no error message',
        this,
      );
    }
    return this.data;
  }

  /**
   * Generate an LLM-readable feedback prompt describing what went wrong
   * and what the expected format is. Useful for retry loops.
   *
   * Returns undefined if the result is perfect (no coercions, no errors).
   */
  feedback(): string | undefined {
    if (this.ok && this.score === 0) {
      return undefined;
    }

    const sections: string[] = [];

    // Section 1: What went wrong
    if (!this.ok && this.errors.length > 0) {
      for (const e of this.errors) {
        sections.push(`Error: ${e}`);
      }
    }

    const allTransforms = [...this.repairs, ...this.coercions];
    if (allTransforms.length > 0) {
      sections.push('The following corrections were needed:');
      for (const c of allTransforms) {
        const path = 'path' in c && (c as Coercion).path
          ? ` at "${(c as Coercion).path}"`
          : '';
        sections.push(`  - ${c.message}${path}`);
      }
    }

    // Section 2: Expected format reminder
    if (this._outputFormat) {
      sections.push('');
      sections.push('Please respond using exactly this format:');
      sections.push(this._outputFormat);
    }

    if (sections.length === 0) {
      return undefined;
    }

    return sections.join('\n');
  }
}

// ---------------------------------------------------------------------------
// ShapedResultError — thrown by .assert()
// ---------------------------------------------------------------------------

export class ShapedResultError extends Error {
  readonly result: ShapedResult;

  constructor(message: string, result: ShapedResult) {
    super(message);
    this.name = 'ShapedResultError';
    this.result = result;
  }
}

// ---------------------------------------------------------------------------
// Flag → Coercion / Repair classification
// ---------------------------------------------------------------------------

function classifyFlags(flags: Flag[]): {
  coercions: Coercion[];
  repairs: Repair[];
} {
  const coercions: Coercion[] = [];
  const repairs: Repair[] = [];

  for (const flag of flags) {
    const penalty = flagScore(flag);

    if (REPAIR_FLAGS.has(flag.kind)) {
      repairs.push({ message: flagMessage(flag), penalty });
    } else {
      coercions.push({ path: flagPath(flag), message: flagMessage(flag), penalty });
    }
  }

  return { coercions, repairs };
}

function flagPath(flag: Flag): string {
  switch (flag.kind) {
    case 'array-item-parse-error':
      return `[${flag.index}]`;
    case 'map-key-parse-error':
      return `[key ${flag.index}]`;
    case 'map-value-parse-error':
      return flag.key;
    default:
      return '';
  }
}

function flagMessage(flag: Flag): string {
  switch (flag.kind) {
    case 'object-from-markdown':
      return 'Extracted JSON from markdown code block';
    case 'object-from-fixed-json':
      return `Repaired malformed JSON (fixes: ${flag.fixes.join(', ')})`;
    case 'inferred-object':
      return 'Inferred object structure';
    case 'default-but-had-unparseable-value':
      return `Used default: ${flag.reason}`;
    case 'object-to-string':
      return 'Converted object to string';
    case 'object-to-primitive':
      return 'Converted object to primitive';
    case 'object-to-map':
      return 'Converted typed object to map';
    case 'extra-key':
      return `Ignored extra key "${flag.key}"`;
    case 'stripped-non-alphanumeric':
      return `Stripped non-alphanumeric characters from "${flag.original}"`;
    case 'substring-match':
      return `Matched substring "${flag.original}" to enum value`;
    case 'single-to-array':
      return 'Wrapped single value into array';
    case 'array-item-parse-error':
      return `Array item parse error: ${flag.reason}`;
    case 'map-key-parse-error':
      return `Map key parse error: ${flag.reason}`;
    case 'map-value-parse-error':
      return `Map value parse error: ${flag.reason}`;
    case 'json-to-string':
      return 'Serialized JSON value to string';
    case 'implied-key':
      return `Inferred object key "${flag.key}"`;
    case 'first-match':
      return `Picked first match (index ${flag.index})`;
    case 'union-match':
      return `Matched union variant ${flag.index}`;
    case 'str-match-one-from-many':
      return `Ambiguous string matched from ${flag.matches.length} candidates`;
    case 'default-from-no-value':
      return 'Used default value (required field missing)';
    case 'default-but-had-value':
      return 'Used default (could not parse provided value)';
    case 'optional-default-from-no-value':
      return 'Used null for missing optional field';
    case 'string-to-bool':
      return `Converted "${flag.original}" to boolean`;
    case 'string-to-null':
      return `Converted "${flag.original}" to null`;
    case 'string-to-char':
      return `Converted "${flag.original}" to char`;
    case 'string-to-float':
      return `Converted "${flag.original}" to number`;
    case 'float-to-int':
      return `Rounded ${flag.original} to integer`;
    case 'no-fields':
      return 'Object has no fields';
  }
}
