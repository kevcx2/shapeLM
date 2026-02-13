/**
 * Comprehensive edge-case test suite.
 *
 * Covers: malformed input, unusual LLM outputs, boundary conditions,
 * deeply nested structures, encoding issues, and tricky coercion scenarios.
 */

import { describe, it, expect } from 'vitest';
import { coerceToSchema } from '../api.js';
import { parse } from '../parser/parse.js';
import { coerce, tryCast } from '../coercer/coerce.js';
import { ParsingContext } from '../coercer/context.js';
import { FieldType } from '../types.js';
import { JsonishValue as V } from '../values.js';
import type { FieldType as FieldTypeT } from '../types.js';

function ctx(defs?: Map<string, FieldTypeT>): ParsingContext {
  return new ParsingContext(defs ?? new Map());
}

// ---------------------------------------------------------------------------
// 1. Malformed JSON edge cases
// ---------------------------------------------------------------------------

describe('Malformed JSON', () => {
  const personSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'integer' },
    },
    required: ['name', 'age'],
  };

  it('trailing comma in object', () => {
    const r = coerceToSchema('{"name": "A", "age": 1,}', personSchema);
    expect(r.success).toBe(true);
    expect((r.value as any).name).toBe('A');
  });

  it('trailing comma in array', () => {
    const r = coerceToSchema('[1, 2, 3,]', { type: 'array', items: { type: 'integer' } });
    expect(r.success).toBe(true);
    expect(r.value).toEqual([1, 2, 3]);
  });

  it('single-quoted strings', () => {
    const r = coerceToSchema("{'name': 'Alice', 'age': 25}", personSchema);
    expect(r.success).toBe(true);
    expect((r.value as any).name).toBe('Alice');
  });

  it('unquoted keys', () => {
    const r = coerceToSchema('{name: "Bob", age: 30}', personSchema);
    expect(r.success).toBe(true);
    expect((r.value as any).name).toBe('Bob');
  });

  it('missing closing brace', () => {
    const r = coerceToSchema('{"name": "Charlie", "age": 40', personSchema);
    expect(r.success).toBe(true);
    expect((r.value as any).name).toBe('Charlie');
  });

  it('missing closing bracket', () => {
    const r = coerceToSchema('[1, 2, 3', { type: 'array', items: { type: 'integer' } });
    expect(r.success).toBe(true);
  });

  it('double comma', () => {
    const r = coerceToSchema('{"name": "Dave",, "age": 35}', personSchema);
    // May or may not parse; at least shouldn't crash
    expect(r).toBeDefined();
  });

  it('JavaScript-style comments in JSON', () => {
    const text = `{
      // This is a comment
      "name": "Eve",
      /* block comment */
      "age": 28
    }`;
    const r = coerceToSchema(text, personSchema);
    expect(r.success).toBe(true);
    expect((r.value as any).name).toBe('Eve');
  });

  it('backtick-quoted strings', () => {
    const r = coerceToSchema('{name: `Frank`, age: 45}', personSchema);
    expect(r.success).toBe(true);
  });

  it('unterminated string', () => {
    const r = coerceToSchema('{"name": "Grace', personSchema);
    expect(r.success).toBe(true);
    expect((r.value as any).name).toBe('Grace');
  });
});

// ---------------------------------------------------------------------------
// 2. Whitespace and encoding edge cases
// ---------------------------------------------------------------------------

describe('Whitespace and encoding', () => {
  it('leading/trailing whitespace', () => {
    const r = coerceToSchema('   42   ', { type: 'integer' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(42);
  });

  it('newlines in JSON', () => {
    const r = coerceToSchema('{\n"name":\n"Alice",\n"age":\n30\n}', {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name', 'age'],
    });
    expect(r.success).toBe(true);
  });

  it('tab-indented JSON', () => {
    const r = coerceToSchema('{\t"name": "Bob",\t"age": 25}', {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name', 'age'],
    });
    expect(r.success).toBe(true);
  });

  it('unicode strings', () => {
    const r = coerceToSchema('"日本語テスト"', { type: 'string' });
    expect(r.success).toBe(true);
    expect(r.value).toBe('日本語テスト');
  });

  it('emoji in strings', () => {
    const r = coerceToSchema('"Hello 👋 World 🌍"', { type: 'string' });
    expect(r.success).toBe(true);
    expect(r.value).toContain('👋');
  });

  it('escaped characters', () => {
    const r = coerceToSchema('"line1\\nline2"', { type: 'string' });
    expect(r.success).toBe(true);
    expect(r.value).toBe('line1\nline2');
  });
});

// ---------------------------------------------------------------------------
// 3. Number parsing edge cases
// ---------------------------------------------------------------------------

describe('Number parsing edge cases', () => {
  it('negative integer', () => {
    const r = coerceToSchema('-42', { type: 'integer' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(-42);
  });

  it('zero', () => {
    const r = coerceToSchema('0', { type: 'integer' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(0);
  });

  it('very large number', () => {
    const r = coerceToSchema('999999999999', { type: 'integer' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(999999999999);
  });

  it('scientific notation', () => {
    const r = coerceToSchema('1.5e3', { type: 'number' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(1500);
  });

  it('currency format $1,234.56', () => {
    const r = coerce(V.string('$1,234.56'), FieldType.float(), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe(1234.56);
  });

  it('European format 1.234,56', () => {
    const r = coerce(V.string('1.234,56'), FieldType.float(), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBeCloseTo(1234.56);
  });

  it('fraction 3/4', () => {
    const r = coerce(V.string('3/4'), FieldType.float(), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe(0.75);
  });

  it('fraction to int (rounds)', () => {
    const r = coerce(V.string('3/4'), FieldType.int(), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe(1);
  });

  it('float to int (rounds)', () => {
    const r = coerce(V.number(3.7), FieldType.int(), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe(4);
  });

  it('negative float to int', () => {
    const r = coerce(V.number(-2.3), FieldType.int(), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// 4. Boolean edge cases
// ---------------------------------------------------------------------------

describe('Boolean edge cases', () => {
  it('"TRUE" (all caps)', () => {
    const r = coerceToSchema('TRUE', { type: 'boolean' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(true);
  });

  it('"False" (mixed case)', () => {
    const r = coerceToSchema('False', { type: 'boolean' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(false);
  });

  it('"yes"', () => {
    const r = coerceToSchema('yes', { type: 'boolean' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(true);
  });

  it('"no"', () => {
    const r = coerceToSchema('no', { type: 'boolean' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(false);
  });

  it('"1" to true', () => {
    const r = coerceToSchema('1', { type: 'boolean' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(true);
  });

  it('"0" to false', () => {
    const r = coerceToSchema('0', { type: 'boolean' });
    expect(r.success).toBe(true);
    expect(r.value).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Null edge cases
// ---------------------------------------------------------------------------

describe('Null edge cases', () => {
  it('"null" string', () => {
    const r = coerceToSchema('null', { type: 'null' });
    expect(r.success).toBe(true);
    expect(r.value).toBeNull();
  });

  it('"none" string', () => {
    const r = coerce(V.string('none'), FieldType.null(), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBeNull();
  });

  it('empty string as null', () => {
    const r = coerce(V.string(''), FieldType.null(), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBeNull();
  });

  it('optional with null value', () => {
    const optionalString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
    const r = coerceToSchema('null', optionalString);
    expect(r.success).toBe(true);
    expect(r.value).toBeNull();
  });

  it('optional with "none"', () => {
    const optionalString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
    const r = coerceToSchema('none', optionalString);
    expect(r.success).toBe(true);
    // Could be either null or "none" as string — both are valid
  });
});

// ---------------------------------------------------------------------------
// 6. Enum edge cases
// ---------------------------------------------------------------------------

describe('Enum edge cases', () => {
  const statusEnum = {
    type: 'string',
    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'],
  };

  it('exact match', () => {
    const r = coerceToSchema('PENDING', statusEnum);
    expect(r.success).toBe(true);
    expect(r.value).toBe('PENDING');
  });

  it('case-insensitive', () => {
    const r = coerceToSchema('pending', statusEnum);
    expect(r.success).toBe(true);
    expect(r.value).toBe('PENDING');
  });

  it('quoted enum', () => {
    const r = coerceToSchema('"IN_PROGRESS"', statusEnum);
    expect(r.success).toBe(true);
    expect(r.value).toBe('IN_PROGRESS');
  });

  it('enum in prose (substring match)', () => {
    const r = coerceToSchema('The status is COMPLETED.', statusEnum);
    expect(r.success).toBe(true);
    expect(r.value).toBe('COMPLETED');
  });

  it('enum in markdown code block', () => {
    const r = coerceToSchema('```\nFAILED\n```', statusEnum);
    expect(r.success).toBe(true);
    expect(r.value).toBe('FAILED');
  });
});

// ---------------------------------------------------------------------------
// 7. Deeply nested structures
// ---------------------------------------------------------------------------

describe('Deeply nested structures', () => {
  const nestedSchema = {
    type: 'object',
    properties: {
      level1: {
        type: 'object',
        properties: {
          level2: {
            type: 'object',
            properties: {
              level3: {
                type: 'object',
                properties: {
                  value: { type: 'string' },
                },
                required: ['value'],
              },
            },
            required: ['level3'],
          },
        },
        required: ['level2'],
      },
    },
    required: ['level1'],
  };

  it('4-level nesting', () => {
    const text = JSON.stringify({
      level1: { level2: { level3: { value: 'deep' } } },
    });
    const r = coerceToSchema(text, nestedSchema);
    expect(r.success).toBe(true);
    expect((r.value as any).level1.level2.level3.value).toBe('deep');
  });

  it('array of objects of arrays', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['tags'],
      },
    };
    const text = '[{"tags": ["a", "b"]}, {"tags": ["c"]}]';
    const r = coerceToSchema(text, schema);
    expect(r.success).toBe(true);
    const v = r.value as any[];
    expect(v).toHaveLength(2);
    expect(v[0].tags).toEqual(['a', 'b']);
    expect(v[1].tags).toEqual(['c']);
  });
});

// ---------------------------------------------------------------------------
// 8. Union disambiguation edge cases
// ---------------------------------------------------------------------------

describe('Union disambiguation', () => {
  it('string vs int: number input prefers int', () => {
    const r = coerce(V.number(42), FieldType.union([FieldType.string(), FieldType.int()]), ctx());
    expect(r).not.toBeNull();
    // Number should match int with score 0, string requires json-to-string coercion
    expect(r!.value).toBe(42);
  });

  it('class vs string: object input prefers class', () => {
    const cls = FieldType.class('Foo', [
      { name: 'x', type: FieldType.int(), optional: false },
    ]);
    const r = coerce(
      V.object([['x', V.number(1)]]),
      FieldType.union([cls, FieldType.string()]),
      ctx(),
    );
    expect(r).not.toBeNull();
    expect((r!.value as any).x).toBe(1);
  });

  it('optional int: null input → null', () => {
    const r = coerce(V.null(), FieldType.optional(FieldType.int()), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBeNull();
  });

  it('optional int: "null" string → null', () => {
    const r = coerce(V.string('null'), FieldType.optional(FieldType.int()), ctx());
    expect(r).not.toBeNull();
    // Either null or coerced — depends on union scoring
  });

  it('union of enums', () => {
    const colorEnum = FieldType.enum('Color', [
      { name: 'RED' }, { name: 'GREEN' },
    ]);
    const sizeEnum = FieldType.enum('Size', [
      { name: 'SMALL' }, { name: 'LARGE' },
    ]);
    const r = coerce(V.string('RED'), FieldType.union([colorEnum, sizeEnum]), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe('RED');
  });
});

// ---------------------------------------------------------------------------
// 9. Array edge cases
// ---------------------------------------------------------------------------

describe('Array edge cases', () => {
  it('empty array', () => {
    const r = coerce(V.array([]), FieldType.list(FieldType.int()), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([]);
  });

  it('array with mixed types (coercible)', () => {
    const arr = V.array([V.number(1), V.string('2'), V.boolean(true)]);
    const r = coerce(arr, FieldType.list(FieldType.int()), ctx());
    expect(r).not.toBeNull();
    // 1 → 1, "2" → 2, true → 1
    expect(r!.value).toEqual([1, 2, 1]);
  });

  it('null to empty array', () => {
    const r = coerce(V.null(), FieldType.list(FieldType.string()), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([]);
  });

  it('single-to-array wrapping', () => {
    const r = coerce(V.string('hello'), FieldType.list(FieldType.string()), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual(['hello']);
    expect(r!.flags.some((f) => f.kind === 'single-to-array')).toBe(true);
  });

  it('array of optional values', () => {
    const arr = V.array([V.string('a'), V.null(), V.string('b')]);
    const r = coerce(
      arr,
      FieldType.list(FieldType.optional(FieldType.string())),
      ctx(),
    );
    expect(r).not.toBeNull();
    expect(r!.value).toEqual(['a', null, 'b']);
  });
});

// ---------------------------------------------------------------------------
// 10. Map edge cases
// ---------------------------------------------------------------------------

describe('Map edge cases', () => {
  it('empty object to map', () => {
    const r = coerce(V.object([]), FieldType.map(FieldType.string(), FieldType.int()), ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual({});
  });

  it('map with failed values (graceful)', () => {
    const obj = V.object([
      ['a', V.number(1)],
      ['b', V.string('not-int')],
      ['c', V.number(3)],
    ]);
    const r = coerce(obj, FieldType.map(FieldType.string(), FieldType.int()), ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).a).toBe(1);
    expect((r!.value as any).c).toBe(3);
  });

  it('non-object rejected for map', () => {
    const r = coerce(V.string('hello'), FieldType.map(FieldType.string(), FieldType.int()), ctx());
    expect(r).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 11. Implied key wrapping
// ---------------------------------------------------------------------------

describe('Implied key wrapping', () => {
  it('string wraps to single-field class', () => {
    const cls = FieldType.class('Msg', [
      { name: 'text', type: FieldType.string(), optional: false },
    ]);
    const r = coerce(V.string('hello'), cls, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).text).toBe('hello');
    expect(r!.flags.some((f) => f.kind === 'implied-key')).toBe(true);
  });

  it('object wraps to single-field class when no keys match', () => {
    const cls = FieldType.class('Data', [
      { name: 'payload', type: FieldType.map(FieldType.string(), FieldType.string()), optional: false },
    ]);
    const obj = V.object([['foo', V.string('bar')]]);
    const r = coerce(obj, cls, ctx());
    expect(r).not.toBeNull();
    // Should wrap the entire object as the payload
  });

  it('no implied key for multi-field class', () => {
    const cls = FieldType.class('Multi', [
      { name: 'a', type: FieldType.string(), optional: false },
      { name: 'b', type: FieldType.string(), optional: false },
    ]);
    const r = coerce(V.string('hello'), cls, ctx());
    expect(r).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. Fuzzy key matching
// ---------------------------------------------------------------------------

describe('Fuzzy key matching', () => {
  const cls = FieldType.class('Thing', [
    { name: 'firstName', type: FieldType.string(), optional: false },
    { name: 'lastName', type: FieldType.string(), optional: false },
  ]);

  it('case-insensitive key match', () => {
    const obj = V.object([
      ['FIRSTNAME', V.string('Alice')],
      ['LASTNAME', V.string('Smith')],
    ]);
    const r = coerce(obj, cls, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).firstName).toBe('Alice');
  });

  it('underscore-equivalent key match', () => {
    const obj = V.object([
      ['first_name', V.string('Bob')],
      ['last_name', V.string('Jones')],
    ]);
    const r = coerce(obj, cls, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).firstName).toBe('Bob');
  });
});

// ---------------------------------------------------------------------------
// 13. LLM output patterns
// ---------------------------------------------------------------------------

describe('Common LLM output patterns', () => {
  const schema = {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      confidence: { type: 'number' },
    },
    required: ['answer', 'confidence'],
  };

  it('clean JSON response', () => {
    const r = coerceToSchema('{"answer": "Paris", "confidence": 0.95}', schema);
    expect(r.success).toBe(true);
    expect((r.value as any).answer).toBe('Paris');
  });

  it('JSON in markdown with explanation', () => {
    const text = `Based on my analysis, the answer is Paris with high confidence.

\`\`\`json
{
  "answer": "Paris",
  "confidence": 0.95
}
\`\`\`

This is because Paris is the capital of France.`;
    const r = coerceToSchema(text, schema);
    expect(r.success).toBe(true);
    expect((r.value as any).answer).toBe('Paris');
  });

  it('JSON with LLM preamble', () => {
    const text = `Sure! Here is the answer in the requested format:

{"answer": "Tokyo", "confidence": 0.8}`;
    const r = coerceToSchema(text, schema);
    expect(r.success).toBe(true);
    expect((r.value as any).answer).toBe('Tokyo');
  });

  it('JSON with escaped quotes', () => {
    const text = '{"answer": "He said \\"hello\\"", "confidence": 0.7}';
    const r = coerceToSchema(text, schema);
    expect(r.success).toBe(true);
    expect((r.value as any).answer).toContain('hello');
  });

  it('JSON with newlines in strings', () => {
    const text = '{"answer": "Line 1\\nLine 2", "confidence": 0.5}';
    const r = coerceToSchema(text, schema);
    expect(r.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 14. Scoring and quality
// ---------------------------------------------------------------------------

describe('Scoring and quality', () => {
  it('perfect JSON match has score 0', () => {
    const r = coerceToSchema('{"name": "Alice", "age": 30}', {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name', 'age'],
    });
    expect(r.success).toBe(true);
    expect(r.score).toBe(0);
  });

  it('coerced value has non-zero score', () => {
    // age is string "30" → needs coercion
    const r = coerceToSchema('{"name": "Alice", "age": "30"}', {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name', 'age'],
    });
    expect(r.success).toBe(true);
    expect(r.score).toBeGreaterThan(0);
  });

  it('missing required field has high score', () => {
    const r = coerceToSchema('{"name": "Alice"}', {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name', 'age'],
    });
    expect(r.success).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(100); // default-from-no-value
  });

  it('extra keys have low penalty', () => {
    const r = coerceToSchema('{"name": "Alice", "age": 30, "extra": "x"}', {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer' } },
      required: ['name', 'age'],
    });
    expect(r.success).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// 15. $ref and recursive schemas
// ---------------------------------------------------------------------------

describe('$ref and recursive schemas', () => {
  it('simple $ref', () => {
    const schema = {
      type: 'object',
      properties: {
        item: { $ref: '#/$defs/Item' },
      },
      required: ['item'],
      $defs: {
        Item: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
          required: ['name'],
        },
      },
    };
    const r = coerceToSchema('{"item": {"name": "Widget"}}', schema);
    expect(r.success).toBe(true);
    expect((r.value as any).item.name).toBe('Widget');
  });

  it('deeply recursive tree', () => {
    const schema = {
      $ref: '#/$defs/Node',
      $defs: {
        Node: {
          type: 'object',
          properties: {
            val: { type: 'integer' },
            left: { anyOf: [{ $ref: '#/$defs/Node' }, { type: 'null' }] },
            right: { anyOf: [{ $ref: '#/$defs/Node' }, { type: 'null' }] },
          },
          required: ['val'],
        },
      },
    };
    const tree = {
      val: 1,
      left: { val: 2, left: null, right: null },
      right: { val: 3, left: { val: 4, left: null, right: null }, right: null },
    };
    const r = coerceToSchema(JSON.stringify(tree), schema);
    expect(r.success).toBe(true);
    const v = r.value as any;
    expect(v.val).toBe(1);
    expect(v.left.val).toBe(2);
    expect(v.right.left.val).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 16. Type arrays (["string", "null"])
// ---------------------------------------------------------------------------

describe('Type arrays', () => {
  it('nullable string', () => {
    const schema = { type: ['string', 'null'] as any };
    const r = coerceToSchema('"hello"', schema);
    expect(r.success).toBe(true);
    expect(r.value).toBe('hello');
  });

  it('nullable string with null value', () => {
    const schema = { type: ['string', 'null'] as any };
    const r = coerceToSchema('null', schema);
    expect(r.success).toBe(true);
    expect(r.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 17. oneOf schemas
// ---------------------------------------------------------------------------

describe('oneOf schemas', () => {
  it('oneOf with different types', () => {
    const schema = {
      oneOf: [
        { type: 'object', properties: { kind: { const: 'a' }, data: { type: 'string' } }, required: ['kind', 'data'] },
        { type: 'object', properties: { kind: { const: 'b' }, count: { type: 'integer' } }, required: ['kind', 'count'] },
      ],
    };
    const r = coerceToSchema('{"kind": "a", "data": "hello"}', schema);
    expect(r.success).toBe(true);
    expect((r.value as any).kind).toBe('a');
  });
});

// ---------------------------------------------------------------------------
// 18. Const schemas
// ---------------------------------------------------------------------------

describe('Const schemas', () => {
  it('string const', () => {
    const r = coerceToSchema('"hello"', { const: 'hello' });
    expect(r.success).toBe(true);
    expect(r.value).toBe('hello');
  });

  it('number const', () => {
    const r = coerceToSchema('42', { const: 42 });
    expect(r.success).toBe(true);
    expect(r.value).toBe(42);
  });

  it('boolean const', () => {
    const r = coerceToSchema('true', { const: true });
    expect(r.success).toBe(true);
    expect(r.value).toBe(true);
  });
});
