/**
 * Tests for Phase 7: Streaming parser support.
 */

import { describe, it, expect } from 'vitest';
import {
  shaper,
  stream,
  StreamShaper,
  ShapedResult,
} from '../index.js';

// ---------------------------------------------------------------------------
// Helper schemas
// ---------------------------------------------------------------------------

const STRING_SCHEMA = { type: 'string' } as const;
const INT_SCHEMA = { type: 'integer' } as const;

const PERSON_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
  },
  required: ['name', 'age'],
};

const PERSON_LIST_SCHEMA = {
  type: 'array',
  items: PERSON_SCHEMA,
};

const INT_LIST_SCHEMA = {
  type: 'array',
  items: { type: 'integer', minimum: 0 },
  minItems: 1,
};

// ============================================================================
// StreamShaper via shaper().stream()
// ============================================================================

describe('shaper().stream()', () => {
  it('creates a StreamShaper', () => {
    const p = shaper(PERSON_SCHEMA);
    const s = p.stream();
    expect(s).toBeInstanceOf(StreamShaper);
  });

  it('feed returns StreamResult', () => {
    const p = shaper(PERSON_SCHEMA);
    const s = p.stream();
    const r = s.feed('{"name":');
    expect(r).toBeDefined();
    expect(r.raw).toBe('{"name":');
  });

  it('accumulates text across feed calls', () => {
    const p = shaper(PERSON_SCHEMA);
    const s = p.stream();
    s.feed('{"name');
    s.feed('": "Ali');
    s.feed('ce", "age": 30}');
    expect(s.text()).toBe('{"name": "Alice", "age": 30}');
  });

  it('partial JSON converges to full result', () => {
    const p = shaper<{ name: string; age: number }>(PERSON_SCHEMA);
    const s = p.stream();

    // Incomplete JSON
    const r1 = s.feed('{"name": "Alice"');
    // May or may not have partial data depending on fixer

    // Complete JSON
    s.feed(', "age": 30}');
    const r2 = s.current();
    expect(r2.hasData).toBe(true);
    expect((r2.partial as any)?.name).toBe('Alice');
    expect((r2.partial as any)?.age).toBe(30);
  });

  it('close() returns ShapedResult', () => {
    const p = shaper<{ name: string; age: number }>(PERSON_SCHEMA);
    const s = p.stream();
    s.feed('{"name": "Alice", "age": 30}');
    const r = s.close();
    expect(r).toBeInstanceOf(ShapedResult);
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('Alice');
    expect(r.data?.age).toBe(30);
  });

  it('close() runs constraint validation', () => {
    const schema = { type: 'integer', minimum: 0 } as const;
    const p = shaper<number>(schema);
    const s = p.stream();
    s.feed('-5');
    const r = s.close();
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('minimum');
  });

  it('close() runs custom rules', () => {
    const p = shaper<number>(INT_SCHEMA, {
      rules: [(v) => (v as number) > 0 ? true : 'must be positive'],
    });
    const s = p.stream();
    s.feed('-5');
    const r = s.close();
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('must be positive');
  });

  it('throws if feed() called after close()', () => {
    const p = shaper(PERSON_SCHEMA);
    const s = p.stream();
    s.feed('{"name": "Alice", "age": 30}');
    s.close();
    expect(() => s.feed('more')).toThrow('close()');
  });

  it('throws if close() called twice', () => {
    const p = shaper(PERSON_SCHEMA);
    const s = p.stream();
    s.feed('{"name": "Alice", "age": 30}');
    s.close();
    expect(() => s.close()).toThrow('close()');
  });

  it('current() returns last successful result', () => {
    const p = shaper<{ name: string; age: number }>(PERSON_SCHEMA);
    const s = p.stream();
    s.feed('{"name": "Alice", "age": 30}');
    const r = s.current();
    expect(r.hasData).toBe(true);
    expect((r.partial as any)?.name).toBe('Alice');
  });

  it('text() returns accumulated raw text', () => {
    const p = shaper(PERSON_SCHEMA);
    const s = p.stream();
    s.feed('chunk1');
    s.feed('chunk2');
    expect(s.text()).toBe('chunk1chunk2');
  });
});

// ============================================================================
// stream() — standalone function
// ============================================================================

describe('stream()', () => {
  it('creates a StreamShaper directly', () => {
    const s = stream(PERSON_SCHEMA);
    expect(s).toBeInstanceOf(StreamShaper);
  });

  it('works end-to-end', () => {
    const s = stream<{ name: string; age: number }>(PERSON_SCHEMA);
    s.feed('{"name": "Bob", "age": 25}');
    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('Bob');
  });
});

// ============================================================================
// Simulated streaming scenarios
// ============================================================================

describe('Simulated streaming scenarios', () => {
  it('token-by-token JSON object', () => {
    const p = shaper<{ name: string; age: number }>(PERSON_SCHEMA);
    const s = p.stream();

    const tokens = ['{"', 'name', '":', ' "', 'Alice', '",', ' "age', '": ', '30', '}'];
    for (const token of tokens) {
      s.feed(token);
    }

    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('Alice');
    expect(r.data?.age).toBe(30);
  });

  it('streaming markdown-wrapped JSON', () => {
    const p = shaper<{ name: string; age: number }>(PERSON_SCHEMA);
    const s = p.stream();

    s.feed('Here is the result:\n');
    s.feed('```json\n');
    s.feed('{"name": "Charlie"');
    s.feed(', "age": 35}\n');
    s.feed('```');

    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('Charlie');
    expect(r.data?.age).toBe(35);
  });

  it('streaming with prose prefix', () => {
    const p = shaper<{ name: string; age: number }>(PERSON_SCHEMA);
    const s = p.stream();

    s.feed('Based on my analysis, ');
    s.feed('the person is: ');
    s.feed('{"name": "Dave", "age": 40}');

    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe('Dave');
  });

  it('streaming string', () => {
    const p = shaper<string>(STRING_SCHEMA);
    const s = p.stream();

    s.feed('Hello');
    s.feed(' World');

    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data).toBe('Hello World');
  });

  it('streaming integer', () => {
    const p = shaper<number>(INT_SCHEMA);
    const s = p.stream();

    s.feed('4');
    s.feed('2');

    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data).toBe(42);
  });

  it('streaming array', () => {
    const p = shaper<Array<{ name: string; age: number }>>(PERSON_LIST_SCHEMA);
    const s = p.stream();

    s.feed('[{"name": "A", "age": 1}');
    // At this point we have a partial array with one complete element
    const partial = s.current();
    // The fixer/parser may have produced a partial result

    s.feed(', {"name": "B", "age": 2}]');

    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data).toHaveLength(2);
    expect(r.data?.[0].name).toBe('A');
    expect(r.data?.[1].name).toBe('B');
  });

  it('streaming nested arrays accumulate monotonically', () => {
    // Simulates the recipe streaming scenario: an outer object with nested
    // arrays that grow as tokens arrive. The parser must not lose array
    // elements when Stage 3 (multi-JSON) finds complete inner objects.
    const schema = {
      type: 'object',
      properties: {
        dish: { type: 'string' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              amount: { type: 'string' },
            },
            required: ['name', 'amount'],
          },
        },
        steps: { type: 'array', items: { type: 'string' } },
      },
      required: ['dish', 'ingredients', 'steps'],
    };

    type Recipe = {
      dish: string;
      ingredients: { name: string; amount: string }[];
      steps: string[];
    };

    const p = shaper<Recipe>(schema);
    const s = p.stream();

    // Token 1: start of object + first partial ingredient
    s.feed('{"dish": "Pancakes", "ingredients": [{"name": "flour"');
    let r = s.current();
    expect(r.hasData).toBe(true);
    expect((r.partial as any)?.dish).toBe('Pancakes');

    // Token 2: first ingredient complete, second starts
    s.feed(', "amount": "2 cups"}, {"name": "sugar"');
    r = s.current();
    expect((r.partial as any)?.ingredients?.length).toBeGreaterThanOrEqual(1);

    // Token 3: second ingredient complete
    s.feed(', "amount": "1 tbsp"}');
    r = s.current();
    expect((r.partial as any)?.ingredients?.length).toBeGreaterThanOrEqual(2);

    // Token 4: third ingredient complete + array closes
    s.feed(', {"name": "eggs", "amount": "2"}]');
    r = s.current();
    expect((r.partial as any)?.ingredients?.length).toBe(3);

    // Token 5: steps begin
    s.feed(', "steps": ["Mix dry ingredients"');
    r = s.current();
    expect((r.partial as any)?.ingredients?.length).toBe(3);
    expect((r.partial as any)?.steps?.length).toBeGreaterThanOrEqual(1);

    // Token 6: complete
    s.feed(', "Add wet ingredients", "Cook"]}');
    const final = s.close();
    expect(final.ok).toBe(true);
    expect(final.data?.ingredients).toHaveLength(3);
    expect(final.data?.steps).toHaveLength(3);
  });

  it('handles empty stream gracefully', () => {
    const p = shaper<string>(STRING_SCHEMA);
    const s = p.stream();
    // No feed calls
    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data).toBe('');
  });

  it('partial data becomes available progressively', () => {
    const p = shaper<{ name: string; age: number }>(PERSON_SCHEMA);
    const s = p.stream();

    // Feed partial JSON that the fixing parser can handle
    const r1 = s.feed('{"name": "Eve"');
    // At this point, we might have partial data from the fixer

    const r2 = s.feed(', "age": 28}');
    // Now we should have complete data
    expect(r2.hasData).toBe(true);
    expect((r2.partial as any)?.name).toBe('Eve');
    expect((r2.partial as any)?.age).toBe(28);
  });
});

// ============================================================================
// Streaming with constraints and rules
// ============================================================================

describe('Streaming with constraints and rules', () => {
  it('constraints are validated on close() only', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 3 },
        age: { type: 'integer', minimum: 0, maximum: 150 },
      },
      required: ['name', 'age'],
    };
    const p = shaper<{ name: string; age: number }>(schema);
    const s = p.stream();

    // Feed data that violates constraints
    s.feed('{"name": "AB", "age": 200}');

    // Partial results don't check constraints
    const partial = s.current();
    // (partial.hasData may be true but constraints aren't checked)

    // close() checks constraints
    const r = s.close();
    expect(r.ok).toBe(false);
    expect(r.errors).toBeDefined();
  });

  it('rules are applied on close() only', () => {
    const p = shaper<number>(INT_SCHEMA, {
      rules: [(v) => (v as number) % 2 === 0 ? true : 'must be even'],
    });
    const s = p.stream();
    s.feed('3');

    const r = s.close();
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('must be even');
  });

  it('stream-level rules override shaper rules', () => {
    const p = shaper<number>(INT_SCHEMA, {
      rules: [(v) => (v as number) > 0 ? true : 'shaper: must be positive'],
    });
    const s = p.stream({
      rules: [(v) => (v as number) > 10 ? true : 'stream: must be > 10'],
    });
    s.feed('5');

    const r = s.close();
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('stream: must be > 10');
  });

  it('can disable constraints on stream', () => {
    const schema = { type: 'integer', minimum: 0 };
    const p = shaper<number>(schema);
    const s = p.stream({ validateConstraints: false });
    s.feed('-5');

    const r = s.close();
    expect(r.ok).toBe(true);
    expect(r.data).toBe(-5);
  });
});
