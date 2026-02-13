/**
 * Main structural parser entry point.
 *
 * Implements the cascading fallback strategy:
 *   Stage 1: JSON.parse() — strict JSON
 *   Stage 2: Markdown code block extraction
 *   Stage 3: Multi-JSON object extraction from prose
 *   Stage 4: Fixing parser (state machine) — added in Phase 5
 *   Stage 5: Raw string fallback
 *
 * Analogous to BAML's `jsonish::parse()`.
 */

import { type JsonishValue, JsonishValue as V } from '../values.js';
import { extractMarkdownBlocks, getProseOutsideBlocks } from './markdown-parser.js';
import { findJsonSubstrings, jsonToJsonish, parseJsonSubstrings } from './multi-json-parser.js';
import { fixingParse } from './fixing-parser.js';

// ---------------------------------------------------------------------------
// Parse options
// ---------------------------------------------------------------------------

export interface ParseOptions {
  /** Try to extract JSON from markdown code blocks. Default: true. */
  allowMarkdown?: boolean;
  /** Try to find JSON objects embedded in prose. Default: true. */
  findAllJsonObjects?: boolean;
  /** Try the fixing parser for malformed JSON. Default: true. */
  allowFixes?: boolean;
  /** Fall back to treating the whole input as a string. Default: true. */
  allowAsString?: boolean;
}

const DEFAULT_OPTIONS: Required<ParseOptions> = {
  allowMarkdown: true,
  findAllJsonObjects: true,
  allowFixes: true,
  allowAsString: true,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse raw LLM text into a JsonishValue.
 *
 * Returns an `AnyOf` when multiple interpretations are plausible,
 * deferring the choice to the schema-aware coercion engine.
 */
export function parse(
  text: string,
  options?: ParseOptions,
): JsonishValue {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // --- Stage 1: Strict JSON.parse ---
  {
    const result = tryJsonParse(text);
    if (result !== undefined) {
      // Wrap in AnyOf: the parsed structure + the raw string.
      // This lets the coercer choose between them based on target type.
      return V.anyOf([result], text);
    }
  }

  // --- Stage 2: Markdown code block extraction ---
  if (opts.allowMarkdown) {
    const blocks = extractMarkdownBlocks(text);
    if (blocks.length > 0) {
      const candidates: JsonishValue[] = [];

      for (const block of blocks) {
        // Try to parse each block's content.
        const parsed = tryJsonParse(block.content);
        if (parsed !== undefined) {
          candidates.push(V.markdown(block.tag, parsed));
        } else {
          // Try the fixing parser on the block content.
          const fixed = fixingParse(block.content);
          if (fixed) {
            candidates.push(V.markdown(block.tag, V.fixedJson(fixed, [])));
          } else {
            candidates.push(V.markdown(block.tag, V.string(block.content)));
          }
        }
      }

      // Also include any prose outside the blocks.
      const prose = getProseOutsideBlocks(text);
      if (prose) {
        const proseParsed = tryJsonParse(prose);
        if (proseParsed !== undefined) {
          candidates.push(proseParsed);
        }
      }

      if (candidates.length === 1) {
        return V.anyOf([candidates[0]], text);
      }
      if (candidates.length > 1) {
        // Also add all markdown blocks as an array.
        candidates.push(V.array(candidates.map((c) => c)));
        return V.anyOf(candidates, text);
      }
    }
  }

  // --- Stages 3 + 4: Multi-JSON extraction + Fixing parser ---
  // Both stages run and their candidates are combined in a single AnyOf.
  // This is critical for streaming: Stage 3 may find complete inner fragments
  // (e.g. a single ingredient object) while Stage 4 (fixing parser) produces
  // the correct partial outer object. The coercer picks the best match.
  {
    const candidates: JsonishValue[] = [];

    // Stage 3: Multi-JSON object extraction
    if (opts.findAllJsonObjects) {
      const found = parseJsonSubstrings(text);
      if (found.length > 0) {
        for (const v of found) {
          candidates.push(V.fixedJson(v, ['grepped-for-json']));
        }
        if (found.length > 1) {
          candidates.push(V.array(found));
        }
      }
    }

    // Stage 4: Fixing parser
    if (opts.allowFixes) {
      const fixed = tryFixingParser(text);
      if (fixed !== undefined) {
        candidates.push(fixed);
      }
    }

    if (candidates.length > 0) {
      return V.anyOf(candidates, text);
    }
  }

  // --- Stage 5: Raw string fallback ---
  if (opts.allowAsString) {
    return V.string(text);
  }

  // Nothing worked.
  return V.string(text);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Try strict JSON.parse. Returns undefined on failure. */
function tryJsonParse(text: string): JsonishValue | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;

  try {
    const parsed = JSON.parse(trimmed);
    return jsonToJsonish(parsed);
  } catch {
    return undefined;
  }
}

/**
 * Try the fixing parser on raw text.
 * Returns undefined if no usable structure could be extracted.
 */
export function tryFixingParser(text: string): JsonishValue | undefined {
  return fixingParse(text);
}
