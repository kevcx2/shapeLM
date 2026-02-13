/**
 * shapeLM
 *
 * Parse and validate arbitrary LLM text into structured data using JSON Schema.
 *
 * Primary API:
 *   - `prompt(s)`        — Render an output format prompt snippet
 *   - `shape(s, text)`   — Parse + validate LLM text → ShapedResult<T>
 *   - `stream(s)`        — Streaming parser with .feed() / .close()
 *   - `shaper(s)`        — Factory: pre-compiled schema, .shape() / .prompt() / .stream()
 */

// ---------------------------------------------------------------------------
// Primary public API
// ---------------------------------------------------------------------------

export {
  shape,
  prompt,
  shaper,
  stream,
  type Shaper,
  type ShapeOptions,
  type ShaperOptions,
  type ValidationRule,
  type SchemaInput,
  coerceToSchema,
  renderOutputFormat,
  renderOutputFormatFromType,
  type CoerceOptions,
  type RenderOptions,
} from './api.js';

// ---------------------------------------------------------------------------
// ShapedResult
// ---------------------------------------------------------------------------

export { ShapedResult, ShapedResultError } from './shaped-result.js';
export type { Coercion, Repair } from './shaped-result.js';

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

export {
  extractConstraints,
  validateConstraints,
  validateSchemaConstraints,
} from './constraints.js';
export type {
  Constraints,
  NumericConstraints,
  StringConstraints,
  ArrayConstraints,
  ObjectConstraints,
  ConstraintViolation,
} from './constraints.js';

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type {
  FieldType,
  PrimitiveType,
  PrimitiveKind,
  EnumType,
  EnumValue,
  ClassType,
  ClassField,
  ListType,
  MapType,
  UnionType,
  LiteralType,
  RecursiveRef,
} from './types.js';
export { FieldType as F, isOptional, stripNull } from './types.js';

// ---------------------------------------------------------------------------
// Intermediate values (for advanced users)
// ---------------------------------------------------------------------------

export type { JsonishValue, Fix } from './values.js';
export { JsonishValue as V } from './values.js';

// ---------------------------------------------------------------------------
// Flags & scoring
// ---------------------------------------------------------------------------

export type { Flag } from './flags.js';
export { flagScore, totalScore } from './flags.js';

// ---------------------------------------------------------------------------
// Result types (legacy)
// ---------------------------------------------------------------------------

export type { CoercionResult, ParseError } from './result.js';

// ---------------------------------------------------------------------------
// Schema conversion (for advanced users)
// ---------------------------------------------------------------------------

export {
  schemaToType,
  type SchemaConversionOptions,
} from './schema-to-types.js';

// ---------------------------------------------------------------------------
// Parser (for advanced users)
// ---------------------------------------------------------------------------

export { parse, type ParseOptions } from './parser/parse.js';

// ---------------------------------------------------------------------------
// Coercion internals (for advanced users)
// ---------------------------------------------------------------------------

export { tryCast, coerce } from './coercer/coerce.js';
export { ParsingContext } from './coercer/context.js';
export type { CoercedValue } from './coercer/pick-best.js';

// ---------------------------------------------------------------------------
// Zod support
// ---------------------------------------------------------------------------

export {
  isZodSchema,
  zodSchemaToJsonSchema,
  normalizeSchema,
} from './zod-support.js';

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export { StreamShaper } from './stream-shaper.js';
export type {
  DeepPartial,
  StreamResult,
  StreamShaperOptions,
} from './stream-shaper.js';
