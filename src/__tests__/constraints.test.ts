/**
 * Tests for Phase 4: JSON Schema constraint validation.
 */

import { describe, it, expect } from 'vitest';
import {
  shape,
  shaper,
  extractConstraints,
  validateConstraints,
  validateSchemaConstraints,
} from '../index.js';

// ============================================================================
// extractConstraints()
// ============================================================================

describe('extractConstraints()', () => {
  it('extracts numeric constraints', () => {
    const c = extractConstraints({ minimum: 0, maximum: 100 });
    expect(c.numeric?.minimum).toBe(0);
    expect(c.numeric?.maximum).toBe(100);
  });

  it('extracts exclusive numeric constraints', () => {
    const c = extractConstraints({ exclusiveMinimum: 0, exclusiveMaximum: 100 });
    expect(c.numeric?.exclusiveMinimum).toBe(0);
    expect(c.numeric?.exclusiveMaximum).toBe(100);
  });

  it('extracts multipleOf', () => {
    const c = extractConstraints({ multipleOf: 5 });
    expect(c.numeric?.multipleOf).toBe(5);
  });

  it('extracts string constraints', () => {
    const c = extractConstraints({ minLength: 1, maxLength: 100, pattern: '^[A-Z]' });
    expect(c.string?.minLength).toBe(1);
    expect(c.string?.maxLength).toBe(100);
    expect(c.string?.pattern).toBe('^[A-Z]');
  });

  it('extracts format', () => {
    const c = extractConstraints({ format: 'email' });
    expect(c.string?.format).toBe('email');
  });

  it('extracts array constraints', () => {
    const c = extractConstraints({ minItems: 1, maxItems: 10 });
    expect(c.array?.minItems).toBe(1);
    expect(c.array?.maxItems).toBe(10);
  });

  it('extracts object constraints', () => {
    const c = extractConstraints({ minProperties: 1, maxProperties: 5 });
    expect(c.object?.minProperties).toBe(1);
    expect(c.object?.maxProperties).toBe(5);
  });

  it('returns empty for no constraints', () => {
    const c = extractConstraints({ type: 'string' });
    expect(c.numeric).toBeUndefined();
    expect(c.string).toBeUndefined();
    expect(c.array).toBeUndefined();
    expect(c.object).toBeUndefined();
  });
});

// ============================================================================
// validateConstraints()
// ============================================================================

describe('validateConstraints()', () => {
  describe('numeric', () => {
    it('passes within range', () => {
      const c = extractConstraints({ minimum: 0, maximum: 100 });
      expect(validateConstraints(50, c)).toHaveLength(0);
    });

    it('fails below minimum', () => {
      const c = extractConstraints({ minimum: 0 });
      const v = validateConstraints(-1, c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('minimum');
    });

    it('fails above maximum', () => {
      const c = extractConstraints({ maximum: 100 });
      const v = validateConstraints(101, c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('maximum');
    });

    it('passes at boundary (inclusive)', () => {
      const c = extractConstraints({ minimum: 0, maximum: 100 });
      expect(validateConstraints(0, c)).toHaveLength(0);
      expect(validateConstraints(100, c)).toHaveLength(0);
    });

    it('fails at exclusive boundary', () => {
      const c = extractConstraints({ exclusiveMinimum: 0, exclusiveMaximum: 100 });
      expect(validateConstraints(0, c)).toHaveLength(1);
      expect(validateConstraints(100, c)).toHaveLength(1);
      expect(validateConstraints(1, c)).toHaveLength(0);
      expect(validateConstraints(99, c)).toHaveLength(0);
    });

    it('fails multipleOf', () => {
      const c = extractConstraints({ multipleOf: 5 });
      expect(validateConstraints(10, c)).toHaveLength(0);
      expect(validateConstraints(7, c)).toHaveLength(1);
    });
  });

  describe('string', () => {
    it('passes within length range', () => {
      const c = extractConstraints({ minLength: 1, maxLength: 10 });
      expect(validateConstraints('hello', c)).toHaveLength(0);
    });

    it('fails below minLength', () => {
      const c = extractConstraints({ minLength: 5 });
      const v = validateConstraints('hi', c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('minLength');
    });

    it('fails above maxLength', () => {
      const c = extractConstraints({ maxLength: 3 });
      const v = validateConstraints('hello', c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('maxLength');
    });

    it('passes matching pattern', () => {
      const c = extractConstraints({ pattern: '^[A-Z]' });
      expect(validateConstraints('Hello', c)).toHaveLength(0);
    });

    it('fails non-matching pattern', () => {
      const c = extractConstraints({ pattern: '^[A-Z]' });
      const v = validateConstraints('hello', c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('pattern');
    });

    it('handles invalid regex gracefully', () => {
      const c = extractConstraints({ pattern: '[invalid(' });
      expect(validateConstraints('anything', c)).toHaveLength(0);
    });
  });

  describe('format', () => {
    it('email: valid', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('user@example.com', c)).toHaveLength(0);
    });

    it('email: valid with dots', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('user.name@example.com', c)).toHaveLength(0);
    });

    it('email: invalid (no @)', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('not-an-email', c)).toHaveLength(1);
    });

    it('email: rejects consecutive dots in domain', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('user@example..com', c)).toHaveLength(1);
    });

    it('email: rejects consecutive dots in local part', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('user..name@example.com', c)).toHaveLength(1);
    });

    it('email: rejects leading dot in local part', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('.user@example.com', c)).toHaveLength(1);
    });

    it('email: rejects trailing dot in local part', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('user.@example.com', c)).toHaveLength(1);
    });

    it('email: rejects leading dot in domain', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('user@.example.com', c)).toHaveLength(1);
    });

    it('email: rejects trailing dot in domain', () => {
      const c = extractConstraints({ format: 'email' });
      expect(validateConstraints('user@example.com.', c)).toHaveLength(1);
    });

    it('date: valid', () => {
      const c = extractConstraints({ format: 'date' });
      expect(validateConstraints('2024-01-15', c)).toHaveLength(0);
    });

    it('date: invalid', () => {
      const c = extractConstraints({ format: 'date' });
      expect(validateConstraints('01-15-2024', c)).toHaveLength(1);
    });

    it('date-time: valid', () => {
      const c = extractConstraints({ format: 'date-time' });
      expect(validateConstraints('2024-01-15T10:30:00Z', c)).toHaveLength(0);
    });

    it('date-time: invalid', () => {
      const c = extractConstraints({ format: 'date-time' });
      expect(validateConstraints('not-a-datetime', c)).toHaveLength(1);
    });

    it('uuid: valid', () => {
      const c = extractConstraints({ format: 'uuid' });
      expect(validateConstraints('550e8400-e29b-41d4-a716-446655440000', c)).toHaveLength(0);
    });

    it('uuid: invalid', () => {
      const c = extractConstraints({ format: 'uuid' });
      expect(validateConstraints('not-a-uuid', c)).toHaveLength(1);
    });

    it('ipv4: valid', () => {
      const c = extractConstraints({ format: 'ipv4' });
      expect(validateConstraints('192.168.1.1', c)).toHaveLength(0);
    });

    it('ipv4: invalid (out of range)', () => {
      const c = extractConstraints({ format: 'ipv4' });
      expect(validateConstraints('999.999.999.999', c)).toHaveLength(1);
    });

    it('ipv4: invalid (not an ip)', () => {
      const c = extractConstraints({ format: 'ipv4' });
      expect(validateConstraints('not-an-ip', c)).toHaveLength(1);
    });

    it('uri: valid', () => {
      const c = extractConstraints({ format: 'uri' });
      expect(validateConstraints('https://example.com', c)).toHaveLength(0);
    });

    it('uri: invalid', () => {
      const c = extractConstraints({ format: 'uri' });
      expect(validateConstraints('not a uri', c)).toHaveLength(1);
    });

    it('unknown format passes', () => {
      const c = extractConstraints({ format: 'custom-unknown' });
      expect(validateConstraints('anything', c)).toHaveLength(0);
    });

    // Date edge cases: impossible calendar dates should fail
    it('date: rejects Feb 31 (impossible date)', () => {
      const c = extractConstraints({ format: 'date' });
      expect(validateConstraints('2024-02-31', c)).toHaveLength(1);
    });

    it('date: rejects Feb 29 in non-leap year', () => {
      const c = extractConstraints({ format: 'date' });
      expect(validateConstraints('2023-02-29', c)).toHaveLength(1);
    });

    it('date: accepts Feb 29 in leap year', () => {
      const c = extractConstraints({ format: 'date' });
      expect(validateConstraints('2024-02-29', c)).toHaveLength(0);
    });

    it('date: rejects June 31 (June has 30 days)', () => {
      const c = extractConstraints({ format: 'date' });
      expect(validateConstraints('2024-06-31', c)).toHaveLength(1);
    });

    it('date: rejects April 31 (April has 30 days)', () => {
      const c = extractConstraints({ format: 'date' });
      expect(validateConstraints('2024-04-31', c)).toHaveLength(1);
    });

    // Time edge cases: out-of-range values should fail
    it('time: valid', () => {
      const c = extractConstraints({ format: 'time' });
      expect(validateConstraints('10:30:00', c)).toHaveLength(0);
    });

    it('time: rejects hour 25', () => {
      const c = extractConstraints({ format: 'time' });
      expect(validateConstraints('25:00:00', c)).toHaveLength(1);
    });

    it('time: rejects 99:99:99', () => {
      const c = extractConstraints({ format: 'time' });
      expect(validateConstraints('99:99:99', c)).toHaveLength(1);
    });

    it('time: accepts time with Z suffix', () => {
      const c = extractConstraints({ format: 'time' });
      expect(validateConstraints('10:30:00Z', c)).toHaveLength(0);
    });

    it('time: accepts time with +offset', () => {
      const c = extractConstraints({ format: 'time' });
      expect(validateConstraints('10:30:00+05:30', c)).toHaveLength(0);
    });

    it('time: accepts time with -offset', () => {
      const c = extractConstraints({ format: 'time' });
      expect(validateConstraints('10:30:00-05:00', c)).toHaveLength(0);
    });

    // Date-time edge cases
    it('date-time: rejects impossible date in datetime', () => {
      const c = extractConstraints({ format: 'date-time' });
      expect(validateConstraints('2024-02-31T10:30:00Z', c)).toHaveLength(1);
    });
  });

  describe('array', () => {
    it('passes within item range', () => {
      const c = extractConstraints({ minItems: 1, maxItems: 5 });
      expect(validateConstraints([1, 2, 3], c)).toHaveLength(0);
    });

    it('fails below minItems', () => {
      const c = extractConstraints({ minItems: 2 });
      const v = validateConstraints([1], c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('minItems');
    });

    it('fails above maxItems', () => {
      const c = extractConstraints({ maxItems: 2 });
      const v = validateConstraints([1, 2, 3], c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('maxItems');
    });
  });

  describe('object', () => {
    it('passes within property range', () => {
      const c = extractConstraints({ minProperties: 1, maxProperties: 5 });
      expect(validateConstraints({ a: 1, b: 2 }, c)).toHaveLength(0);
    });

    it('fails below minProperties', () => {
      const c = extractConstraints({ minProperties: 2 });
      const v = validateConstraints({ a: 1 }, c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('minProperties');
    });

    it('fails above maxProperties', () => {
      const c = extractConstraints({ maxProperties: 1 });
      const v = validateConstraints({ a: 1, b: 2 }, c);
      expect(v).toHaveLength(1);
      expect(v[0].keyword).toBe('maxProperties');
    });
  });

  describe('null/undefined handling', () => {
    it('passes for null value', () => {
      const c = extractConstraints({ minimum: 0 });
      expect(validateConstraints(null, c)).toHaveLength(0);
    });

    it('passes for undefined value', () => {
      const c = extractConstraints({ minimum: 0 });
      expect(validateConstraints(undefined, c)).toHaveLength(0);
    });
  });
});

// ============================================================================
// validateSchemaConstraints() — deep recursive validation
// ============================================================================

describe('validateSchemaConstraints()', () => {
  it('validates nested object field constraints', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'integer', minimum: 0, maximum: 150 },
      },
      required: ['name', 'age'],
    };
    expect(validateSchemaConstraints({ name: 'Alice', age: 30 }, schema)).toHaveLength(0);
    const v = validateSchemaConstraints({ name: '', age: 200 }, schema);
    expect(v.length).toBe(2);
    expect(v.some(x => x.path === 'name')).toBe(true);
    expect(v.some(x => x.path === 'age')).toBe(true);
  });

  it('validates array item constraints', () => {
    const schema = {
      type: 'array',
      items: { type: 'integer', minimum: 0 },
      minItems: 1,
    };
    expect(validateSchemaConstraints([1, 2, 3], schema)).toHaveLength(0);
    const v = validateSchemaConstraints([1, -1, 3], schema);
    expect(v).toHaveLength(1);
    expect(v[0].path).toBe('[1]');
  });

  it('validates empty array against minItems', () => {
    const schema = {
      type: 'array',
      items: { type: 'integer' },
      minItems: 1,
    };
    const v = validateSchemaConstraints([], schema);
    expect(v).toHaveLength(1);
    expect(v[0].keyword).toBe('minItems');
  });

  it('validates deeply nested constraints', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            zip: { type: 'string', pattern: '^\\d{5}$' },
          },
        },
      },
    };
    const v = validateSchemaConstraints({ address: { zip: 'abcde' } }, schema);
    expect(v).toHaveLength(1);
    expect(v[0].path).toBe('address.zip');
  });

  it('validates root-level string constraints', () => {
    const schema = { type: 'string', minLength: 5 };
    expect(validateSchemaConstraints('hello', schema)).toHaveLength(0);
    expect(validateSchemaConstraints('hi', schema)).toHaveLength(1);
  });

  it('validates root-level numeric constraints', () => {
    const schema = { type: 'integer', minimum: 0 };
    expect(validateSchemaConstraints(5, schema)).toHaveLength(0);
    expect(validateSchemaConstraints(-1, schema)).toHaveLength(1);
  });

  it('handles null values', () => {
    const schema = { type: 'string', minLength: 1 };
    expect(validateSchemaConstraints(null, schema)).toHaveLength(0);
  });

  it('validates map value constraints', () => {
    const schema = {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
    };
    expect(validateSchemaConstraints({ a: 1, b: 2 }, schema)).toHaveLength(0);
    const v = validateSchemaConstraints({ a: 1, b: -1 }, schema);
    expect(v).toHaveLength(1);
    expect(v[0].path).toBe('b');
  });
});

// ============================================================================
// Integration: shape() with constraints
// ============================================================================

describe('shape() with constraints', () => {
  it('fails when integer violates minimum', () => {
    const schema = { type: 'integer', minimum: 0 };
    const r = shape(schema, '-5');
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('minimum');
  });

  it('passes when integer satisfies minimum', () => {
    const schema = { type: 'integer', minimum: 0 };
    const r = shape(schema, '5');
    expect(r.ok).toBe(true);
  });

  it('fails when string violates minLength', () => {
    const schema = { type: 'string', minLength: 10 };
    const r = shape(schema, '"hi"');
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('less than minimum');
  });

  it('fails when string violates pattern', () => {
    const schema = { type: 'string', pattern: '^[A-Z]+$' };
    const r = shape(schema, '"hello"');
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('pattern');
  });

  it('passes when string matches pattern', () => {
    const schema = { type: 'string', pattern: '^[A-Z]+$' };
    const r = shape(schema, '"HELLO"');
    expect(r.ok).toBe(true);
  });

  it('fails when string violates email format', () => {
    const schema = { type: 'string', format: 'email' };
    const r = shape(schema, '"not-email"');
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('email');
  });

  it('passes when string is valid email', () => {
    const schema = { type: 'string', format: 'email' };
    const r = shape(schema, '"user@example.com"');
    expect(r.ok).toBe(true);
  });

  it('fails when array violates minItems', () => {
    const schema = { type: 'array', items: { type: 'integer' }, minItems: 3 };
    const r = shape(schema, '[1, 2]');
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('less than minimum');
  });

  it('validates nested field constraints', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        age: { type: 'integer', minimum: 0, maximum: 150 },
      },
      required: ['name', 'age'],
    };
    const r = shape(schema, '{"name": "", "age": 200}');
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('name');
    expect(r.errors.join('; ')).toContain('age');
  });

  it('constraint errors show in feedback()', () => {
    const schema = { type: 'integer', minimum: 0 };
    const r = shape(schema, '-5');
    const fb = r.feedback()!;
    expect(fb).toContain('minimum');
  });

  it('can disable constraint validation', () => {
    const schema = { type: 'integer', minimum: 0 };
    const r = shape(schema, '-5', { validateConstraints: false });
    expect(r.ok).toBe(true);
    expect(r.data).toBe(-5);
  });

  it('constraints + rules both run', () => {
    const schema = { type: 'integer', minimum: 0 };
    const r = shape(schema, '5', {
      rules: [(v) => (v as number) > 10 ? true : 'must be > 10'],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('must be > 10');
  });

  it('constraints fail before rules', () => {
    const schema = { type: 'integer', minimum: 0 };
    let ruleRan = false;
    const r = shape(schema, '-5', {
      rules: [() => { ruleRan = true; return true; }],
    });
    // Rules still run since coercion succeeded — constraints are separate
    expect(r.ok).toBe(false);
    expect(r.errors.join('; ')).toContain('minimum');
  });
});

// ============================================================================
// Integration: shaper() factory with constraints
// ============================================================================

describe('shaper() with constraints', () => {
  it('validates constraints on each shape call', () => {
    const p = shaper<number>({ type: 'integer', minimum: 0, maximum: 100 });
    expect(p.shape('50').ok).toBe(true);
    expect(p.shape('-1').ok).toBe(false);
    expect(p.shape('101').ok).toBe(false);
  });

  it('validates string format constraints', () => {
    const p = shaper<string>({ type: 'string', format: 'email' });
    expect(p.shape('"user@example.com"').ok).toBe(true);
    expect(p.shape('"not-an-email"').ok).toBe(false);
  });

  it('validates array item constraints', () => {
    const p = shaper<number[]>({
      type: 'array',
      items: { type: 'integer', minimum: 0 },
      minItems: 1,
    });
    expect(p.shape('[1, 2, 3]').ok).toBe(true);
    expect(p.shape('[]').ok).toBe(false);
    expect(p.shape('[1, -1, 3]').ok).toBe(false);
  });

  it('shaper with constraints disabled', () => {
    const p = shaper<number>(
      { type: 'integer', minimum: 0 },
      { validateConstraints: false },
    );
    expect(p.shape('-5').ok).toBe(true);
  });
});
