/**
 * Coercion module re-exports.
 */

// Main dispatcher
export { tryCast, coerce } from './coerce.js';

// Shared types
export type { CoercedValue, CoerceFn, TryCastFn } from './pick-best.js';
export { pickBest } from './pick-best.js';

// Context
export { ParsingContext } from './context.js';

// Sub-modules
export { tryCastEnum, coerceEnum } from './coerce-enum.js';
export { tryCastClass, coerceClass } from './coerce-class.js';
export { tryCastArray, coerceArray } from './coerce-array.js';
export { tryCastUnion, coerceUnion } from './coerce-union.js';
export { tryCastMap, coerceMap } from './coerce-map.js';
export { matchString, keysMatch } from './match-string.js';
export {
  coerceString,
  coerceInt,
  coerceFloat,
  coerceBool,
  coerceNull,
  coerceLiteral,
} from './coerce-primitive.js';
