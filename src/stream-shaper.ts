/**
 * Stream shaper support.
 *
 * Provides incremental parsing of LLM output as tokens arrive.
 * On each .feed(chunk), the accumulated text is re-parsed and coerced,
 * producing a partial result (DeepPartial<T>).
 *
 * API:
 *   - .feed(chunk)  → { partial } — latest best-effort data
 *   - .close()      → ShapedResult<T> — final validated result
 */

import { parse as structuralParse, type ParseOptions } from './parser/parse.js';
import { coerce } from './coercer/coerce.js';
import { ParsingContext } from './coercer/context.js';
import { totalScore } from './flags.js';
import type { Flag } from './flags.js';
import type { FieldType as FieldTypeT } from './types.js';
import { ShapedResult } from './shaped-result.js';
import { validateSchemaConstraints } from './constraints.js';
import type { ValidationRule } from './api.js';

// ---------------------------------------------------------------------------
// DeepPartial type — makes all nested fields optional
// ---------------------------------------------------------------------------

/**
 * Recursively makes all fields optional, including nested objects and arrays.
 * Arrays become arrays of partial items.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

// ---------------------------------------------------------------------------
// StreamResult — returned by .feed()
// ---------------------------------------------------------------------------

export interface StreamResult<T = unknown> {
  /** The partially-coerced value so far. May be incomplete. */
  partial: DeepPartial<T> | undefined;

  /** Whether parsing produced any usable data. */
  hasData: boolean;

  /** The accumulated raw text so far. */
  raw: string;

  /** Quality score of the current partial parse (0 = perfect). */
  score: number;

  /** Flags from the current parse attempt. */
  flags: Flag[];
}

// ---------------------------------------------------------------------------
// StreamShaper
// ---------------------------------------------------------------------------

export interface StreamShaperOptions {
  /** Options for the structural parser. */
  parse?: ParseOptions;
  /** Custom validation rules (only run on .close()). */
  rules?: ValidationRule[];
  /** Whether to validate constraints (only on .close()). Default: true. */
  validateConstraints?: boolean;
}

export class StreamShaper<T = unknown> {
  private accumulated = '';
  private lastResult: StreamResult<T> = {
    partial: undefined,
    hasData: false,
    raw: '',
    score: Infinity,
    flags: [],
  };

  private readonly targetType: FieldTypeT;
  private readonly definitions: Map<string, FieldTypeT>;
  private readonly jsonSchema: Record<string, unknown>;
  private readonly outputFormat: string;
  private readonly parseOptions: ParseOptions | undefined;
  private readonly rules: ValidationRule[];
  private readonly shouldValidateConstraints: boolean;
  private isClosed = false;

  constructor(opts: {
    targetType: FieldTypeT;
    definitions: Map<string, FieldTypeT>;
    jsonSchema: Record<string, unknown>;
    outputFormat: string;
    parseOptions?: ParseOptions;
    rules?: ValidationRule[];
    validateConstraints?: boolean;
  }) {
    this.targetType = opts.targetType;
    this.definitions = opts.definitions;
    this.jsonSchema = opts.jsonSchema;
    this.outputFormat = opts.outputFormat;
    this.parseOptions = opts.parseOptions;
    this.rules = opts.rules ?? [];
    this.shouldValidateConstraints = opts.validateConstraints ?? true;
  }

  /**
   * Feed a chunk of text from the LLM stream.
   *
   * Returns the current partial parse result. The .partial field improves
   * as more text is accumulated.
   */
  feed(chunk: string): StreamResult<T> {
    if (this.isClosed) {
      throw new Error('StreamShaper.feed() called after close()');
    }

    this.accumulated += chunk;

    // Try to parse the accumulated text
    try {
      const parsed = structuralParse(this.accumulated, this.parseOptions);
      const ctx = new ParsingContext(this.definitions);
      const result = coerce(parsed, this.targetType, ctx);

      if (result !== null) {
        const score = totalScore(result.flags);
        // Only accept the new parse if it's at least as good as (or better
        // than) what we already have. This prevents regressions where a
        // partial stream token causes the parser to pick a worse
        // interpretation (e.g. a tiny inner fragment rather than the full
        // partially-fixed object).
        if (score <= this.lastResult.score) {
          this.lastResult = {
            partial: result.value as DeepPartial<T>,
            hasData: true,
            raw: this.accumulated,
            score,
            flags: result.flags,
          };
        } else {
          this.lastResult = {
            ...this.lastResult,
            raw: this.accumulated,
          };
        }
      } else {
        this.lastResult = {
          ...this.lastResult,
          raw: this.accumulated,
        };
      }
    } catch {
      // Parse failed on partial text — expected during streaming.
      this.lastResult = {
        ...this.lastResult,
        raw: this.accumulated,
      };
    }

    return this.lastResult;
  }

  /**
   * Get the current partial result without feeding new data.
   */
  current(): StreamResult<T> {
    return this.lastResult;
  }

  /**
   * Get the accumulated raw text so far.
   */
  text(): string {
    return this.accumulated;
  }

  /**
   * Finalize the stream and return a full ShapedResult<T>.
   *
   * Runs constraint validation and custom rules on the final value.
   * After calling close(), no more feed() calls are allowed.
   */
  close(): ShapedResult<T> {
    if (this.isClosed) {
      throw new Error('StreamShaper.close() called more than once');
    }
    this.isClosed = true;

    // Final parse on complete accumulated text
    const parsed = structuralParse(this.accumulated, this.parseOptions);
    const ctx = new ParsingContext(this.definitions);
    const result = coerce(parsed, this.targetType, ctx);

    if (result === null) {
      return new ShapedResult<T>({
        ok: false,
        data: undefined,
        errors: ['Failed to coerce value to target type'],
        score: Infinity,
        flags: [],
        raw: this.accumulated,
        outputFormat: this.outputFormat,
      });
    }

    const score = totalScore(result.flags);

    // Run constraint validation
    const constraintErrors: string[] = [];
    if (this.shouldValidateConstraints) {
      const violations = validateSchemaConstraints(result.value, this.jsonSchema);
      for (const v of violations) {
        constraintErrors.push(v.path ? `${v.path}: ${v.message}` : v.message);
      }
    }

    // Run custom rules
    const ruleErrors: string[] = [];
    for (const rule of this.rules) {
      const verdict = rule(result.value);
      if (typeof verdict === 'string') {
        ruleErrors.push(verdict);
      }
    }

    const allErrors = [...constraintErrors, ...ruleErrors];
    const ok = allErrors.length === 0;

    return new ShapedResult<T>({
      ok,
      data: result.value as T | undefined,
      errors: allErrors,
      score,
      flags: result.flags,
      raw: this.accumulated,
      outputFormat: this.outputFormat,
    });
  }
}
