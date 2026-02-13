import { describe, it, expect } from 'vitest';
import { FieldType, isOptional, stripNull } from '../types.js';

describe('FieldType builders', () => {
  it('creates primitives', () => {
    expect(FieldType.string()).toEqual({ type: 'primitive', value: 'string' });
    expect(FieldType.int()).toEqual({ type: 'primitive', value: 'int' });
    expect(FieldType.float()).toEqual({ type: 'primitive', value: 'float' });
    expect(FieldType.bool()).toEqual({ type: 'primitive', value: 'bool' });
    expect(FieldType.null()).toEqual({ type: 'primitive', value: 'null' });
  });

  it('creates an enum', () => {
    const e = FieldType.enum('Color', [
      { name: 'Red' },
      { name: 'Green', description: 'The green one' },
      { name: 'Blue', alias: 'BLU' },
    ]);
    expect(e.type).toBe('enum');
    expect(e.name).toBe('Color');
    expect(e.values).toHaveLength(3);
    expect(e.values[1].description).toBe('The green one');
    expect(e.values[2].alias).toBe('BLU');
  });

  it('creates a class', () => {
    const c = FieldType.class('User', [
      { name: 'name', type: FieldType.string(), optional: false },
      {
        name: 'age',
        type: FieldType.int(),
        optional: true,
        description: 'Years',
      },
    ]);
    expect(c.type).toBe('class');
    expect(c.name).toBe('User');
    expect(c.fields).toHaveLength(2);
    expect(c.fields[0].optional).toBe(false);
    expect(c.fields[1].optional).toBe(true);
  });

  it('creates a list', () => {
    const l = FieldType.list(FieldType.string());
    expect(l.type).toBe('list');
    expect(l.items).toEqual(FieldType.string());
  });

  it('creates a map', () => {
    const m = FieldType.map(FieldType.string(), FieldType.int());
    expect(m.type).toBe('map');
    expect(m.key).toEqual(FieldType.string());
    expect(m.values).toEqual(FieldType.int());
  });

  it('creates a union', () => {
    const u = FieldType.union([FieldType.string(), FieldType.int()]);
    expect(u.type).toBe('union');
    expect(u.options).toHaveLength(2);
  });

  it('creates a literal', () => {
    expect(FieldType.literal('hello')).toEqual({
      type: 'literal',
      value: 'hello',
    });
    expect(FieldType.literal(42)).toEqual({ type: 'literal', value: 42 });
    expect(FieldType.literal(true)).toEqual({ type: 'literal', value: true });
  });

  it('creates a recursive ref', () => {
    const r = FieldType.recursiveRef('TreeNode');
    expect(r.type).toBe('recursive-ref');
    expect(r.name).toBe('TreeNode');
  });
});

describe('FieldType.optional', () => {
  it('wraps a primitive in a union with null', () => {
    const opt = FieldType.optional(FieldType.string());
    expect(opt.type).toBe('union');
    expect(opt.options).toHaveLength(2);
    expect(opt.options[0]).toEqual(FieldType.string());
    expect(opt.options[1]).toEqual(FieldType.null());
  });

  it('does not double-wrap if already optional', () => {
    const opt1 = FieldType.optional(FieldType.string());
    const opt2 = FieldType.optional(opt1);
    expect(opt2.options).toHaveLength(2);
    expect(opt2).toEqual(opt1);
  });

  it('adds null to an existing union without null', () => {
    const u = FieldType.union([FieldType.string(), FieldType.int()]);
    const opt = FieldType.optional(u);
    expect(opt.options).toHaveLength(3);
    expect(opt.options[2]).toEqual(FieldType.null());
  });

  it('does not add null to a union that already has null', () => {
    const u = FieldType.union([FieldType.string(), FieldType.null()]);
    const opt = FieldType.optional(u);
    expect(opt.options).toHaveLength(2);
  });

  it('wraps bare null as a single-option union', () => {
    const opt = FieldType.optional(FieldType.null());
    expect(opt.type).toBe('union');
    expect(opt.options).toHaveLength(1);
    expect(opt.options[0]).toEqual(FieldType.null());
  });
});

describe('isOptional', () => {
  it('returns true for null primitive', () => {
    expect(isOptional(FieldType.null())).toBe(true);
  });

  it('returns true for union containing null', () => {
    expect(isOptional(FieldType.optional(FieldType.string()))).toBe(true);
  });

  it('returns false for non-null primitive', () => {
    expect(isOptional(FieldType.string())).toBe(false);
  });

  it('returns false for union without null', () => {
    expect(
      isOptional(FieldType.union([FieldType.string(), FieldType.int()])),
    ).toBe(false);
  });
});

describe('stripNull', () => {
  it('strips null from an optional, returning the inner type', () => {
    const opt = FieldType.optional(FieldType.string());
    const stripped = stripNull(opt);
    expect(stripped).toEqual(FieldType.string());
  });

  it('strips null from a multi-option union', () => {
    const u = FieldType.union([
      FieldType.string(),
      FieldType.int(),
      FieldType.null(),
    ]);
    const stripped = stripNull(u);
    expect(stripped).toEqual(
      FieldType.union([FieldType.string(), FieldType.int()]),
    );
  });

  it('returns null if the union is only null', () => {
    const u = FieldType.union([FieldType.null()]);
    expect(stripNull(u)).toEqual(FieldType.null());
  });

  it('returns non-union types unchanged', () => {
    expect(stripNull(FieldType.string())).toEqual(FieldType.string());
  });
});
