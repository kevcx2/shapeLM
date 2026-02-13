/**
 * Public result types returned by the coercion API.
 */

import type { Flag } from './flags.js';

// ---------------------------------------------------------------------------
// Parse errors
// ---------------------------------------------------------------------------

export interface ParseError {
  /** Dot-separated scope path, e.g. "root.address.city". */
  scope: string;
  /** Human-readable explanation. */
  message: string;
  /** Nested causes. */
  causes: ParseError[];
}

// ---------------------------------------------------------------------------
// Coercion result
// ---------------------------------------------------------------------------

export interface CoercionResult {
  /**
   * The coerced JavaScript value, shaped to match the target schema.
   * Present even when `success` is false if partial coercion was possible.
   */
  value: unknown;

  /** Whether coercion fully succeeded. */
  success: boolean;

  /**
   * Aggregate quality score (0 = perfect match, higher = more coercion applied).
   * Useful for comparing alternative parses or deciding whether to retry.
   */
  score: number;

  /**
   * Every transformation / flag applied during coercion.
   * Enables callers to inspect exactly what happened.
   */
  flags: Flag[];

  /**
   * Errors encountered during parsing / coercion.
   * A non-empty list does NOT necessarily mean failure — some errors are
   * recoverable (e.g. an extra key in an object is flagged but not fatal).
   */
  errors: ParseError[];
}
