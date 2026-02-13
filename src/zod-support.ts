/**
 * Zod schema support.
 *
 * Detects Zod schemas via duck-typing and converts them to JSON Schema.
 * Requires Zod v4+ (which ships z.toJSONSchema built-in).
 *
 * Zod is an optional peer dependency — this module is the only place
 * that interacts with Zod, keeping the core library Zod-free.
 */

import { createRequire } from 'node:module';

// ---------------------------------------------------------------------------
// Lazy zod module loading
// ---------------------------------------------------------------------------

let _zod: any;
let _zodLoaded = false;

/**
 * Lazily load the consumer's installed `zod` module (synchronous).
 * Returns the module or null if not installed.
 */
function loadZod(): any {
  if (_zodLoaded) return _zod;
  _zodLoaded = true;
  try {
    const req = createRequire(import.meta.url);
    _zod = req('zod');
  } catch {
    _zod = null;
  }
  return _zod;
}

// ---------------------------------------------------------------------------
// Schema type detection
// ---------------------------------------------------------------------------

/**
 * Check whether a value looks like a Zod schema.
 *
 * We duck-type it: if it has a `_def` property and a `parse` method,
 * it's probably a Zod schema. This avoids requiring `instanceof` checks
 * which break across package versions.
 */
export function isZodSchema(schema: unknown): boolean {
  return (
    schema !== null &&
    typeof schema === 'object' &&
    '_def' in (schema as Record<string, unknown>) &&
    'parse' in (schema as Record<string, unknown>) &&
    typeof (schema as Record<string, unknown>)['parse'] === 'function'
  );
}

/**
 * Check whether a Zod-like schema object comes from Zod v4+.
 *
 * Zod v4 schemas carry a `_zod` property on every schema instance.
 * Zod v3 (and earlier) schemas do not.
 */
function isZodV4Schema(schema: unknown): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '_zod' in (schema as Record<string, unknown>)
  );
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a Zod schema to a JSON Schema object.
 *
 * Requires Zod v4+ (uses `z.toJSONSchema()` which is built into v4).
 * Throws a clear error if the consumer is on an older version.
 *
 * @param zodSchema  A Zod schema (z.string(), z.object({...}), etc.)
 * @returns          A JSON Schema object suitable for passing to parseSchema/parser.
 */
export function zodSchemaToJsonSchema(zodSchema: unknown): Record<string, unknown> {
  // ---- Version gate ----
  if (!isZodV4Schema(zodSchema)) {
    throw new Error(
      'shapeLM requires Zod v4 or later. The schema you passed appears to be from ' +
      'an older version of Zod (v3 or earlier). Please upgrade or use a JSON schema.',
    );
  }

  // ---- Load the consumer's zod module ----
  const z = loadZod();

  if (!z || typeof z.toJSONSchema !== 'function') {
    throw new Error(
      'shapeLM could not load the `zod` module, or the installed version does not ' +
      'export `toJSONSchema`. Ensure Zod v4+ is installed: npm install zod@latest',
    );
  }

  return z.toJSONSchema(zodSchema) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Unified schema normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a schema input: if it's a Zod schema, convert to JSON Schema.
 * If it's already a plain object, return it as-is.
 */
export function normalizeSchema(schema: unknown): Record<string, unknown> {
  if (isZodSchema(schema)) {
    return zodSchemaToJsonSchema(schema);
  }
  return schema as Record<string, unknown>;
}
