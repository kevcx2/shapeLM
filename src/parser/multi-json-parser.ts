/**
 * Multi-JSON object extractor.
 *
 * Scans text for balanced JSON structures ({...} and [...]) embedded
 * in surrounding prose, and returns them as individually parsed values.
 */

import { type JsonishValue, JsonishValue as V } from '../values.js';

/**
 * Find all balanced JSON-like structures in text.
 * Returns the raw substrings that look like JSON objects or arrays.
 */
export function findJsonSubstrings(text: string): string[] {
  const results: string[] = [];
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      const closing = ch === '{' ? '}' : ']';
      const end = findMatchingClose(text, i, ch, closing);
      if (end !== -1) {
        results.push(text.substring(i, end + 1));
        i = end; // Skip past this structure
      }
    }
  }

  return results;
}

/**
 * Find the matching closing delimiter, respecting nesting and strings.
 * Returns the index of the closing delimiter, or -1 if not found.
 */
function findMatchingClose(
  text: string,
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (inString) {
      if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Attempt to parse each found JSON substring with JSON.parse.
 * Returns successfully parsed values.
 */
export function parseJsonSubstrings(text: string): JsonishValue[] {
  const substrings = findJsonSubstrings(text);
  const results: JsonishValue[] = [];

  for (const sub of substrings) {
    try {
      const parsed = JSON.parse(sub);
      results.push(jsonToJsonish(parsed));
    } catch {
      // Skip unparseable substrings — they'll be handled by the fixing parser.
    }
  }

  return results;
}

/** Convert a native JS value (from JSON.parse) into a JsonishValue. */
export function jsonToJsonish(value: unknown): JsonishValue {
  if (value === null) return V.null();
  if (typeof value === 'string') return V.string(value);
  if (typeof value === 'number') return V.number(value);
  if (typeof value === 'boolean') return V.boolean(value);
  if (Array.isArray(value)) return V.array(value.map(jsonToJsonish));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return V.object(entries.map(([k, v]) => [k, jsonToJsonish(v)]));
  }
  return V.string(String(value));
}
