import { describe, it, expect } from 'vitest';
import { parse } from '../parser/parse.js';
import { extractMarkdownBlocks } from '../parser/markdown-parser.js';
import { findJsonSubstrings, jsonToJsonish } from '../parser/multi-json-parser.js';

// ---------------------------------------------------------------------------
// Markdown parser
// ---------------------------------------------------------------------------

describe('extractMarkdownBlocks', () => {
  it('extracts a single json code block', () => {
    const text = '```json\n{"a": 1}\n```';
    const blocks = extractMarkdownBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tag).toBe('json');
    expect(blocks[0].content).toBe('{"a": 1}');
  });

  it('extracts a code block without language tag', () => {
    const text = '```\n{"a": 1}\n```';
    const blocks = extractMarkdownBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tag).toBe('');
    expect(blocks[0].content).toBe('{"a": 1}');
  });

  it('extracts multiple code blocks', () => {
    const text = '```json\n{"a": 1}\n```\nSome text\n```json\n{"b": 2}\n```';
    const blocks = extractMarkdownBlocks(text);
    expect(blocks).toHaveLength(2);
  });

  it('returns empty for text without code blocks', () => {
    expect(extractMarkdownBlocks('Hello world')).toHaveLength(0);
  });

  it('handles tilde fences', () => {
    const text = '~~~json\n{"a": 1}\n~~~';
    const blocks = extractMarkdownBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].tag).toBe('json');
  });
});

// ---------------------------------------------------------------------------
// Multi-JSON parser
// ---------------------------------------------------------------------------

describe('findJsonSubstrings', () => {
  it('finds a single object in prose', () => {
    const text = 'The answer is: {"name": "Alice"} as shown.';
    const results = findJsonSubstrings(text);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe('{"name": "Alice"}');
  });

  it('finds a single array in prose', () => {
    const text = 'Result: [1, 2, 3] done.';
    const results = findJsonSubstrings(text);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe('[1, 2, 3]');
  });

  it('finds multiple objects', () => {
    const text = '{"a": 1} and {"b": 2}';
    const results = findJsonSubstrings(text);
    expect(results).toHaveLength(2);
  });

  it('handles nested structures', () => {
    const text = '{"a": {"b": [1, 2]}}';
    const results = findJsonSubstrings(text);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe('{"a": {"b": [1, 2]}}');
  });

  it('handles strings with braces inside', () => {
    const text = '{"msg": "hello {world}"}';
    const results = findJsonSubstrings(text);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe('{"msg": "hello {world}"}');
  });

  it('returns empty for text without JSON', () => {
    expect(findJsonSubstrings('Hello world')).toHaveLength(0);
  });
});

describe('jsonToJsonish', () => {
  it('converts null', () => {
    expect(jsonToJsonish(null)).toEqual({ type: 'null' });
  });

  it('converts string', () => {
    expect(jsonToJsonish('hello')).toEqual({ type: 'string', value: 'hello' });
  });

  it('converts number', () => {
    expect(jsonToJsonish(42)).toEqual({ type: 'number', value: 42 });
  });

  it('converts boolean', () => {
    expect(jsonToJsonish(true)).toEqual({ type: 'boolean', value: true });
  });

  it('converts array', () => {
    const result = jsonToJsonish([1, 'a']);
    expect(result.type).toBe('array');
    if (result.type === 'array') {
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({ type: 'number', value: 1 });
      expect(result.items[1]).toEqual({ type: 'string', value: 'a' });
    }
  });

  it('converts object', () => {
    const result = jsonToJsonish({ x: 1, y: 'z' });
    expect(result.type).toBe('object');
    if (result.type === 'object') {
      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]).toEqual(['x', { type: 'number', value: 1 }]);
      expect(result.fields[1]).toEqual([
        'y',
        { type: 'string', value: 'z' },
      ]);
    }
  });
});

// ---------------------------------------------------------------------------
// Main parse() function
// ---------------------------------------------------------------------------

describe('parse', () => {
  // --- Stage 1: Valid JSON ---

  it('parses valid JSON object', () => {
    const result = parse('{"name": "Alice", "age": 30}');
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].type).toBe('object');
    }
  });

  it('parses valid JSON array', () => {
    const result = parse('[1, 2, 3]');
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      expect(result.candidates[0].type).toBe('array');
    }
  });

  it('parses valid JSON string', () => {
    const result = parse('"hello"');
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      expect(result.candidates[0]).toEqual({ type: 'string', value: 'hello' });
    }
  });

  it('parses valid JSON number', () => {
    const result = parse('42');
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      expect(result.candidates[0]).toEqual({ type: 'number', value: 42 });
    }
  });

  it('parses valid JSON boolean', () => {
    const result = parse('true');
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      expect(result.candidates[0]).toEqual({ type: 'boolean', value: true });
    }
  });

  it('parses valid JSON null', () => {
    const result = parse('null');
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      expect(result.candidates[0]).toEqual({ type: 'null' });
    }
  });

  it('preserves raw string in AnyOf', () => {
    const raw = '  {"a": 1}  ';
    const result = parse(raw);
    if (result.type === 'any-of') {
      expect(result.rawString).toBe(raw);
    }
  });

  // --- Stage 2: Markdown extraction ---

  it('extracts JSON from markdown code block', () => {
    const text = 'Here is the result:\n```json\n{"name": "Alice"}\n```\nDone.';
    const result = parse(text);
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      // Should have markdown candidate
      const md = result.candidates.find((c) => c.type === 'markdown');
      expect(md).toBeDefined();
      if (md?.type === 'markdown') {
        expect(md.tag).toBe('json');
        expect(md.inner.type).toBe('object');
      }
    }
  });

  it('extracts JSON from markdown without language tag', () => {
    const text = '```\n[1, 2, 3]\n```';
    const result = parse(text);
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      const md = result.candidates.find((c) => c.type === 'markdown');
      expect(md).toBeDefined();
    }
  });

  // --- Stage 3: Multi-JSON extraction ---

  it('extracts JSON from surrounding prose', () => {
    const text = 'The answer is: {"name": "Alice"} as shown above.';
    const result = parse(text);
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      const fixed = result.candidates.find((c) => c.type === 'fixed-json');
      expect(fixed).toBeDefined();
    }
  });

  it('extracts multiple JSON objects from prose', () => {
    const text = 'First: {"a": 1} and second: {"b": 2}';
    const result = parse(text);
    expect(result.type).toBe('any-of');
    if (result.type === 'any-of') {
      // Should include individual objects + an array of both
      expect(result.candidates.length).toBeGreaterThanOrEqual(3);
      const arr = result.candidates.find((c) => c.type === 'array');
      expect(arr).toBeDefined();
    }
  });

  // --- Stage 5: Raw string fallback ---

  it('falls back for unparseable text (raw string preserved)', () => {
    const text = 'Hello world, no JSON here.';
    const result = parse(text);
    // The fixing parser may extract something, so it could be any-of.
    // Either way the raw text is preserved.
    if (result.type === 'any-of') {
      expect(result.rawString).toBe(text);
    } else {
      expect(result.type).toBe('string');
      if (result.type === 'string') {
        expect(result.value).toBe(text);
      }
    }
  });

  it('returns string when all stages disabled except allowAsString', () => {
    const text = '{"a": 1}';
    const result = parse(text, {
      allowMarkdown: false,
      findAllJsonObjects: false,
      allowFixes: false,
      allowAsString: true,
    });
    // Stage 1 still runs (JSON.parse always runs), so it should parse.
    expect(result.type).toBe('any-of');
  });

  it('handles whitespace-only input as string', () => {
    const result = parse('   ');
    expect(result.type).toBe('string');
  });

  it('handles empty string as string', () => {
    const result = parse('');
    expect(result.type).toBe('string');
  });
});
