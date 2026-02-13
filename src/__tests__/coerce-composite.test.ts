import { describe, it, expect } from 'vitest';
import { tryCast, coerce } from '../coercer/coerce.js';
import { ParsingContext } from '../coercer/context.js';
import { JsonishValue as V } from '../values.js';
import { FieldType } from '../types.js';
import type { FieldType as FieldTypeT } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(defs?: Map<string, FieldTypeT>): ParsingContext {
  return new ParsingContext(defs ?? new Map());
}

// ---------------------------------------------------------------------------
// Array coercion
// ---------------------------------------------------------------------------

describe('coerce array', () => {
  const intList = FieldType.list(FieldType.int());
  const stringList = FieldType.list(FieldType.string());

  it('coerces array of ints', () => {
    const arr = V.array([V.number(1), V.number(2), V.number(3)]);
    const r = coerce(arr, intList, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([1, 2, 3]);
  });

  it('coerces array with string-to-int', () => {
    const arr = V.array([V.string('1'), V.string('2')]);
    const r = coerce(arr, intList, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([1, 2]);
  });

  it('single-to-array wrapping', () => {
    const r = coerce(V.number(42), intList, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([42]);
    expect(r!.flags.some((f) => f.kind === 'single-to-array')).toBe(true);
  });

  it('null to empty array', () => {
    const r = coerce(V.null(), intList, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([]);
  });

  it('empty array passes through', () => {
    const r = coerce(V.array([]), intList, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([]);
  });

  it('skips unparseable items with flag', () => {
    const arr = V.array([V.number(1), V.string('not-a-num'), V.number(3)]);
    const r = coerce(arr, intList, ctx());
    expect(r).not.toBeNull();
    // "not-a-num" should still parse via string-to-int... actually it won't
    // Wait: coerceInt("not-a-num") returns null. So it gets skipped with flag.
    const items = r!.value as number[];
    expect(items).toContain(1);
    expect(items).toContain(3);
    expect(r!.flags.some((f) => f.kind === 'array-item-parse-error')).toBe(true);
  });

  it('tryCast array succeeds with exact types', () => {
    const arr = V.array([V.number(1), V.number(2)]);
    const r = tryCast(arr, intList, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([1, 2]);
  });

  it('tryCast array fails on type mismatch', () => {
    const arr = V.array([V.number(1), V.string('hello')]);
    expect(tryCast(arr, intList, ctx())).toBeNull();
  });

  it('nested array', () => {
    const nestedList = FieldType.list(FieldType.list(FieldType.int()));
    const arr = V.array([
      V.array([V.number(1), V.number(2)]),
      V.array([V.number(3)]),
    ]);
    const r = coerce(arr, nestedList, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual([[1, 2], [3]]);
  });
});

// ---------------------------------------------------------------------------
// Union coercion
// ---------------------------------------------------------------------------

describe('coerce union', () => {
  const stringOrInt = FieldType.union([FieldType.string(), FieldType.int()]);
  const optionalString = FieldType.optional(FieldType.string());

  it('picks exact string match', () => {
    const r = coerce(V.string('hello'), stringOrInt, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe('hello');
    expect(r!.flags.some((f) => f.kind === 'union-match')).toBe(true);
  });

  it('picks exact int match', () => {
    const r = coerce(V.number(42), stringOrInt, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe(42);
  });

  it('optional string: null → null', () => {
    const r = coerce(V.null(), optionalString, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBeNull();
  });

  it('optional string: string passes through', () => {
    const r = coerce(V.string('hi'), optionalString, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe('hi');
  });

  it('tryCast union picks perfect match', () => {
    const r = tryCast(V.number(42), stringOrInt, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toBe(42);
  });

  it('tryCast union returns null when no variant matches strictly', () => {
    const intOrBool = FieldType.union([FieldType.int(), FieldType.bool()]);
    expect(tryCast(V.string('hello'), intOrBool, ctx())).toBeNull();
  });

  it('union with class and primitive: prefers class for object', () => {
    const personClass = FieldType.class('Person', [
      { name: 'name', type: FieldType.string(), optional: false },
    ]);
    const classOrString = FieldType.union([personClass, FieldType.string()]);
    const obj = V.object([['name', V.string('Alice')]]);
    const r = coerce(obj, classOrString, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).name).toBe('Alice');
  });

  it('union with class and primitive: prefers string for string', () => {
    const personClass = FieldType.class('Person', [
      { name: 'name', type: FieldType.string(), optional: false },
    ]);
    const classOrString = FieldType.union([personClass, FieldType.string()]);
    const r = coerce(V.string('hello'), classOrString, ctx());
    expect(r).not.toBeNull();
    // Should prefer string (score 0) over implied-key class wrapping
    expect(r!.value).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Map coercion
// ---------------------------------------------------------------------------

describe('coerce map', () => {
  const stringToInt = FieldType.map(FieldType.string(), FieldType.int());

  it('coerces object to string→int map', () => {
    const obj = V.object([
      ['a', V.number(1)],
      ['b', V.number(2)],
    ]);
    const r = coerce(obj, stringToInt, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).a).toBe(1);
    expect((r!.value as any).b).toBe(2);
    expect(r!.flags.some((f) => f.kind === 'object-to-map')).toBe(true);
  });

  it('coerces string values to int in map', () => {
    const obj = V.object([['x', V.string('42')]]);
    const r = coerce(obj, stringToInt, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).x).toBe(42);
  });

  it('flags value parse errors and continues', () => {
    const obj = V.object([
      ['a', V.number(1)],
      ['b', V.string('not-a-num')],
      ['c', V.number(3)],
    ]);
    const r = coerce(obj, stringToInt, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).a).toBe(1);
    expect((r!.value as any).c).toBe(3);
    expect(r!.flags.some((f) => f.kind === 'map-value-parse-error')).toBe(true);
  });

  it('empty object → empty map', () => {
    const r = coerce(V.object([]), stringToInt, ctx());
    expect(r).not.toBeNull();
    expect(r!.value).toEqual({});
  });

  it('tryCast map succeeds with exact types', () => {
    const obj = V.object([['x', V.number(1)]]);
    const r = tryCast(obj, stringToInt, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).x).toBe(1);
  });

  it('tryCast map fails on value mismatch', () => {
    const obj = V.object([['x', V.string('not-int')]]);
    expect(tryCast(obj, stringToInt, ctx())).toBeNull();
  });

  it('rejects non-object', () => {
    expect(coerce(V.string('hello'), stringToInt, ctx())).toBeNull();
  });

  it('map with enum keys', () => {
    const colorEnum = FieldType.enum('Color', [
      { name: 'RED' },
      { name: 'GREEN' },
    ]);
    const enumToInt = FieldType.map(colorEnum, FieldType.int());
    const obj = V.object([
      ['RED', V.number(1)],
      ['GREEN', V.number(2)],
    ]);
    const r = coerce(obj, enumToInt, ctx());
    expect(r).not.toBeNull();
    expect((r!.value as any).RED).toBe(1);
    expect((r!.value as any).GREEN).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// pick-best (tested through union coercion)
// ---------------------------------------------------------------------------

describe('pick-best via union', () => {
  it('prefers lower score', () => {
    // string "42" can match both string (score 0) and int (score 1)
    const stringOrInt = FieldType.union([FieldType.string(), FieldType.int()]);
    const r = coerce(V.string('42'), stringOrInt, ctx());
    expect(r).not.toBeNull();
    // String gets perfect score 0, int needs coercion
    expect(r!.value).toBe('42');
  });

  it('prefers non-default value', () => {
    // null against optional int: should pick null, not default-int
    const optionalInt = FieldType.optional(FieldType.int());
    const r = coerce(V.null(), optionalInt, ctx());
    expect(r!.value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Recursive ref coercion
// ---------------------------------------------------------------------------

describe('recursive ref coercion', () => {
  it('resolves recursive ref through context', () => {
    const treeClass = FieldType.class('Tree', [
      { name: 'value', type: FieldType.int(), optional: false },
      {
        name: 'children',
        type: FieldType.list(FieldType.recursiveRef('Tree')),
        optional: true,
      },
    ]);

    const defs = new Map<string, FieldTypeT>();
    defs.set('Tree', treeClass);

    const obj = V.object([
      ['value', V.number(1)],
      ['children', V.array([
        V.object([
          ['value', V.number(2)],
          ['children', V.array([])],
        ]),
      ])],
    ]);

    const r = coerce(obj, treeClass, ctx(defs));
    expect(r).not.toBeNull();
    const tree = r!.value as any;
    expect(tree.value).toBe(1);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].value).toBe(2);
  });

  it('returns null for unresolvable ref', () => {
    const refType = FieldType.recursiveRef('NonExistent');
    expect(coerce(V.string('hello'), refType, ctx())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full dispatcher (tryCast + coerce)
// ---------------------------------------------------------------------------

describe('coerce dispatcher', () => {
  it('coerces primitive string', () => {
    const r = coerce(V.string('hello'), FieldType.string(), ctx());
    expect(r?.value).toBe('hello');
  });

  it('coerces primitive int', () => {
    const r = coerce(V.number(42), FieldType.int(), ctx());
    expect(r?.value).toBe(42);
  });

  it('coerces literal', () => {
    const r = coerce(V.string('yes'), FieldType.literal('yes'), ctx());
    expect(r?.value).toBe('yes');
  });

  it('coerces enum', () => {
    const color = FieldType.enum('Color', [{ name: 'RED' }, { name: 'GREEN' }]);
    const r = coerce(V.string('RED'), color, ctx());
    expect(r?.value).toBe('RED');
  });

  it('tryCast primitive string', () => {
    const r = tryCast(V.string('hello'), FieldType.string(), ctx());
    expect(r?.value).toBe('hello');
  });

  it('tryCast rejects string for int', () => {
    expect(tryCast(V.string('42'), FieldType.int(), ctx())).toBeNull();
  });

  it('tryCast accepts exact int', () => {
    const r = tryCast(V.number(42), FieldType.int(), ctx());
    expect(r?.value).toBe(42);
  });
});
