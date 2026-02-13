import { describe, it, expect } from 'vitest';
import { fixingParse } from '../parser/fixing-parser.js';

describe('fixingParse', () => {
  // -----------------------------------------------------------------------
  // Valid JSON (should still work)
  // -----------------------------------------------------------------------

  it('parses valid JSON object', () => {
    const result = fixingParse('{"a": 1, "b": "hello"}');
    expect(result).toBeDefined();
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]).toEqual(['a', { type: 'number', value: 1 }]);
    }
  });

  it('parses valid JSON array', () => {
    const result = fixingParse('[1, 2, 3]');
    expect(result?.type).toBe('array');
    if (result?.type === 'array') {
      expect(result.items).toHaveLength(3);
    }
  });

  // -----------------------------------------------------------------------
  // Trailing commas
  // -----------------------------------------------------------------------

  it('handles trailing comma in object', () => {
    const result = fixingParse('{"a": 1, "b": 2,}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields).toHaveLength(2);
    }
  });

  it('handles trailing comma in array', () => {
    const result = fixingParse('[1, 2, 3,]');
    expect(result?.type).toBe('array');
    if (result?.type === 'array') {
      expect(result.items).toHaveLength(3);
    }
  });

  // -----------------------------------------------------------------------
  // Single-quoted strings
  // -----------------------------------------------------------------------

  it('handles single-quoted strings', () => {
    const result = fixingParse("{'name': 'Alice'}");
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields[0][0]).toBe('name');
      const val = result.fields[0][1];
      expect(val.type).toBe('string');
      if (val.type === 'string') expect(val.value).toBe('Alice');
    }
  });

  // -----------------------------------------------------------------------
  // Unquoted keys
  // -----------------------------------------------------------------------

  it('handles unquoted keys', () => {
    const result = fixingParse('{name: "Alice", age: 30}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields[0][0]).toBe('name');
      expect(result.fields[1][0]).toBe('age');
    }
  });

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  it('handles trailing line comments', () => {
    const result = fixingParse(
      '{"name": "Alice", // this is the name\n"age": 30}',
    );
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields).toHaveLength(2);
    }
  });

  it('handles block comments', () => {
    const result = fixingParse(
      '{"name": "Alice", /* comment */ "age": 30}',
    );
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields).toHaveLength(2);
    }
  });

  // -----------------------------------------------------------------------
  // Unterminated structures
  // -----------------------------------------------------------------------

  it('handles unterminated object', () => {
    const result = fixingParse('{"name": "Alice"');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0][0]).toBe('name');
    }
  });

  it('handles unterminated array', () => {
    const result = fixingParse('[1, 2, 3');
    expect(result?.type).toBe('array');
    if (result?.type === 'array') {
      expect(result.items).toHaveLength(3);
    }
  });

  it('handles unterminated string in object', () => {
    const result = fixingParse('{"name": "Alice');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields).toHaveLength(1);
    }
  });

  // -----------------------------------------------------------------------
  // Unquoted values
  // -----------------------------------------------------------------------

  it('handles unquoted boolean values', () => {
    const result = fixingParse('{"active": true, "deleted": false}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      const active = result.fields[0][1];
      expect(active.type).toBe('boolean');
      if (active.type === 'boolean') expect(active.value).toBe(true);
    }
  });

  it('handles unquoted null', () => {
    const result = fixingParse('{"value": null}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields[0][1].type).toBe('null');
    }
  });

  it('handles unquoted numbers', () => {
    const result = fixingParse('{"a": 42, "b": 3.14}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      const a = result.fields[0][1];
      expect(a.type).toBe('number');
      if (a.type === 'number') expect(a.value).toBe(42);
      const b = result.fields[1][1];
      expect(b.type).toBe('number');
      if (b.type === 'number') expect(b.value).toBe(3.14);
    }
  });

  // -----------------------------------------------------------------------
  // Nested structures
  // -----------------------------------------------------------------------

  it('handles nested objects', () => {
    const result = fixingParse('{"a": {"b": 1}}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      const inner = result.fields[0][1];
      expect(inner.type).toBe('object');
    }
  });

  it('handles array of objects', () => {
    const result = fixingParse('[{"a": 1}, {"b": 2}]');
    expect(result?.type).toBe('array');
    if (result?.type === 'array') {
      expect(result.items).toHaveLength(2);
      expect(result.items[0].type).toBe('object');
      expect(result.items[1].type).toBe('object');
    }
  });

  // -----------------------------------------------------------------------
  // Triple-backtick blocks
  // -----------------------------------------------------------------------

  it('handles triple-backtick code block', () => {
    const result = fixingParse('```json\n{"a": 1}\n```');
    // The first line (language tag) is skipped, content is returned as string
    expect(result).toBeDefined();
    if (result?.type === 'string') {
      expect(result.value).toContain('"a"');
    }
  });

  // -----------------------------------------------------------------------
  // Escape handling
  // -----------------------------------------------------------------------

  it('handles escaped characters in strings', () => {
    const result = fixingParse('{"msg": "hello\\nworld"}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      const val = result.fields[0][1];
      if (val.type === 'string') {
        expect(val.value).toBe('hello\nworld');
      }
    }
  });

  it('handles escaped quotes in strings', () => {
    const result = fixingParse('{"msg": "she said \\"hi\\""}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      const val = result.fields[0][1];
      if (val.type === 'string') {
        expect(val.value).toBe('she said "hi"');
      }
    }
  });

  // -----------------------------------------------------------------------
  // Prose wrapping
  // -----------------------------------------------------------------------

  it('extracts JSON from surrounding prose', () => {
    const result = fixingParse('Here is the result: {"name": "Alice"}');
    // The fixing parser should find the object
    expect(result).toBeDefined();
    if (result?.type === 'object') {
      expect(result.fields[0][0]).toBe('name');
    }
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('handles empty object', () => {
    const result = fixingParse('{}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      expect(result.fields).toHaveLength(0);
    }
  });

  it('handles empty array', () => {
    const result = fixingParse('[]');
    expect(result?.type).toBe('array');
    if (result?.type === 'array') {
      expect(result.items).toHaveLength(0);
    }
  });

  it('returns undefined for empty input', () => {
    expect(fixingParse('')).toBeUndefined();
  });

  it('returns undefined for whitespace-only input', () => {
    expect(fixingParse('   ')).toBeUndefined();
  });

  it('handles deeply nested structure', () => {
    const result = fixingParse('{"a": {"b": {"c": [1, 2, {"d": true}]}}}');
    expect(result?.type).toBe('object');
    if (result?.type === 'object') {
      const a = result.fields[0][1];
      expect(a.type).toBe('object');
    }
  });
});
