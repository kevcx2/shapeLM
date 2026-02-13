/**
 * Enum type coercion.
 *
 * Uses fuzzy string matching to resolve enum variants from LLM output.
 *
 * Analogous to BAML's `coerce_enum.rs`.
 */

import type { EnumType, EnumValue } from '../types.js';
import type { JsonishValue } from '../values.js';
import { jsonishToString } from '../values.js';
import type { Flag } from '../flags.js';
import { matchString, type MatchCandidate } from './match-string.js';

export interface CoercedEnum {
  value: string; // The canonical variant name
  flags: Flag[];
}

/**
 * Build match candidates from an enum definition.
 * Each variant's candidates include: rendered name, description, "name: desc".
 */
function enumMatchCandidates(enumType: EnumType): MatchCandidate[] {
  return enumType.values.map((v) => {
    const aliases: string[] = [v.alias ?? v.name];
    if (v.description && v.description.trim()) {
      aliases.push(v.description);
      aliases.push(`${v.alias ?? v.name}: ${v.description}`);
    }
    return { name: v.name, aliases };
  });
}

/**
 * Try strict cast: only accept exact string match against a variant name.
 */
export function tryCastEnum(
  value: JsonishValue,
  enumType: EnumType,
): CoercedEnum | null {
  if (value.type !== 'string') return null;

  for (const v of enumType.values) {
    const rendered = v.alias ?? v.name;
    if (value.value === rendered) {
      return { value: v.name, flags: [] };
    }
  }
  return null;
}

/**
 * Coerce a value to an enum variant using fuzzy matching.
 */
export function coerceEnum(
  value: JsonishValue,
  enumType: EnumType,
): CoercedEnum | null {
  // Extract the string to match against
  let text: string;
  switch (value.type) {
    case 'string':
      text = value.value;
      break;
    case 'any-of':
      // Prefer the raw string for enum matching
      text = value.rawString;
      break;
    case 'markdown':
    case 'fixed-json':
      return coerceEnum(
        value.type === 'markdown' ? value.inner : value.inner,
        enumType,
      );
    default:
      text = jsonishToString(value);
      break;
  }

  const candidates = enumMatchCandidates(enumType);
  const result = matchString(text, candidates, true);

  if (result === null) return null;

  return {
    value: result.name,
    flags: result.flags,
  };
}
