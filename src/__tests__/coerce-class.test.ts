import { describe, it, expect } from 'vitest';
import { tryCastClass, coerceClass } from '../coercer/coerce-class.js';
import { tryCast, coerce } from '../coercer/coerce.js';
import { ParsingContext } from '../coercer/context.js';
import { JsonishValue as V } from '../values.js';
import { FieldType } from '../types.js';
import type { ClassType, FieldType as FieldTypeT } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ctx(defs?: Map<string, FieldTypeT>): ParsingContext {
  return new ParsingContext(defs ?? new Map());
}

// ---------------------------------------------------------------------------
// Test class definitions
// ---------------------------------------------------------------------------

const ADDRESS_CLASS: ClassType = FieldType.class('Address', [
  { name: 'street', type: FieldType.string(), optional: false },
  { name: 'city', type: FieldType.string(), optional: false },
  { name: 'zip', type: FieldType.string(), optional: true },
]);

const PERSON_CLASS: ClassType = FieldType.class('Person', [
  { name: 'name', type: FieldType.string(), optional: false },
  { name: 'age', type: FieldType.int(), optional: false },
]);

const WRAPPER_CLASS: ClassType = FieldType.class('Wrapper', [
  { name: 'data', type: FieldType.string(), optional: false },
]);

// ---------------------------------------------------------------------------
// tryCastClass
// ---------------------------------------------------------------------------

describe('tryCastClass', () => {
  it('matches exact object', () => {
    const obj = V.object([
      ['street', V.string('123 Main')],
      ['city', V.string('Springfield')],
    ]);
    const r = tryCastClass(obj, ADDRESS_CLASS, ctx(), tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).street).toBe('123 Main');
    expect((r!.value as any).city).toBe('Springfield');
    expect((r!.value as any).zip).toBeNull(); // optional field defaulted
  });

  it('rejects object with extra keys', () => {
    const obj = V.object([
      ['street', V.string('123 Main')],
      ['city', V.string('Springfield')],
      ['country', V.string('US')],
    ]);
    expect(tryCastClass(obj, ADDRESS_CLASS, ctx(), tryCast)).toBeNull();
  });

  it('rejects when required field missing', () => {
    const obj = V.object([['street', V.string('123 Main')]]);
    expect(tryCastClass(obj, ADDRESS_CLASS, ctx(), tryCast)).toBeNull();
  });

  it('rejects non-object', () => {
    expect(tryCastClass(V.string('hello'), ADDRESS_CLASS, ctx(), tryCast)).toBeNull();
  });

  it('rejects when field type mismatch', () => {
    const obj = V.object([
      ['name', V.string('Alice')],
      ['age', V.string('not-a-number')],
    ]);
    expect(tryCastClass(obj, PERSON_CLASS, ctx(), tryCast)).toBeNull();
  });

  it('unwraps markdown', () => {
    const obj = V.markdown('json', V.object([
      ['name', V.string('Bob')],
      ['age', V.number(30)],
    ]));
    const r = tryCastClass(obj, PERSON_CLASS, ctx(), tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).name).toBe('Bob');
  });
});

// ---------------------------------------------------------------------------
// coerceClass
// ---------------------------------------------------------------------------

describe('coerceClass', () => {
  it('coerces object with all fields', () => {
    const obj = V.object([
      ['name', V.string('Alice')],
      ['age', V.number(30)],
    ]);
    const r = coerceClass(obj, PERSON_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).name).toBe('Alice');
    expect((r!.value as any).age).toBe(30);
  });

  it('coerces with string-to-int for age', () => {
    const obj = V.object([
      ['name', V.string('Alice')],
      ['age', V.string('30')],
    ]);
    const r = coerceClass(obj, PERSON_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).age).toBe(30);
    expect(r!.flags.some((f) => f.kind === 'string-to-float')).toBe(true);
  });

  it('fills optional field with null', () => {
    const obj = V.object([
      ['street', V.string('Main St')],
      ['city', V.string('NYC')],
    ]);
    const r = coerceClass(obj, ADDRESS_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).zip).toBeNull();
    expect(r!.flags.some((f) => f.kind === 'optional-default-from-no-value')).toBe(true);
  });

  it('fills required field with default-from-no-value flag', () => {
    const obj = V.object([['name', V.string('Alice')]]);
    const r = coerceClass(obj, PERSON_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).age).toBeNull();
    expect(r!.flags.some((f) => f.kind === 'default-from-no-value')).toBe(true);
  });

  it('flags extra keys', () => {
    const obj = V.object([
      ['name', V.string('Alice')],
      ['age', V.number(30)],
      ['email', V.string('alice@test.com')],
    ]);
    const r = coerceClass(obj, PERSON_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect(r!.flags.some((f) => f.kind === 'extra-key')).toBe(true);
  });

  it('fuzzy key matching (case-insensitive)', () => {
    const obj = V.object([
      ['Name', V.string('Alice')],
      ['Age', V.number(30)],
    ]);
    const r = coerceClass(obj, PERSON_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).name).toBe('Alice');
  });

  it('implied key wrapping for single-field class', () => {
    const r = coerceClass(V.string('hello'), WRAPPER_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).data).toBe('hello');
    expect(r!.flags.some((f) => f.kind === 'implied-key')).toBe(true);
  });

  it('implied key wrapping from object with no matching keys', () => {
    const obj = V.object([['value', V.string('hello')]]);
    // WRAPPER_CLASS has field "data", not "value"
    const r = coerceClass(obj, WRAPPER_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    // Should either match "value"→"data" via implied-key or extra-key + default
    // The implied key path wraps the whole object as the field value
  });

  it('unwraps any-of and picks best', () => {
    const obj = V.anyOf(
      [
        V.object([
          ['name', V.string('Bob')],
          ['age', V.number(25)],
        ]),
        V.string('irrelevant'),
      ],
      '{"name":"Bob","age":25}',
    );
    const r = coerceClass(obj, PERSON_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).name).toBe('Bob');
    expect((r!.value as any).age).toBe(25);
  });

  it('unwraps markdown', () => {
    const obj = V.markdown('json', V.object([
      ['name', V.string('Charlie')],
      ['age', V.number(40)],
    ]));
    const r = coerceClass(obj, PERSON_CLASS, ctx(), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).name).toBe('Charlie');
    expect(r!.flags.some((f) => f.kind === 'object-from-markdown')).toBe(true);
  });

  it('handles circular reference gracefully', () => {
    // A class that references itself
    const treeClass: ClassType = FieldType.class('Tree', [
      { name: 'value', type: FieldType.string(), optional: false },
      {
        name: 'child',
        type: FieldType.optional(FieldType.recursiveRef('Tree')),
        optional: true,
      },
    ]);

    const defs = new Map<string, FieldTypeT>();
    defs.set('Tree', treeClass);

    const obj = V.object([
      ['value', V.string('root')],
      ['child', V.object([
        ['value', V.string('leaf')],
        ['child', V.null()],
      ])],
    ]);

    const r = coerceClass(obj, treeClass, ctx(defs), coerce, tryCast);
    expect(r).not.toBeNull();
    expect((r!.value as any).value).toBe('root');
    expect((r!.value as any).child.value).toBe('leaf');
  });
});
