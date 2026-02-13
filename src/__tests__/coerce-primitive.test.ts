import { describe, it, expect } from 'vitest';
import {
  coerceString,
  coerceInt,
  coerceFloat,
  coerceBool,
  coerceNull,
  coerceLiteral,
} from '../coercer/coerce-primitive.js';
import { JsonishValue as V } from '../values.js';

// ---------------------------------------------------------------------------
// String coercion
// ---------------------------------------------------------------------------

describe('coerceString', () => {
  it('passes through string', () => {
    const r = coerceString(V.string('hello'));
    expect(r.value).toBe('hello');
    expect(r.flags).toHaveLength(0);
  });

  it('converts number to string', () => {
    const r = coerceString(V.number(42));
    expect(r.value).toBe('42');
    expect(r.flags[0].kind).toBe('json-to-string');
  });

  it('converts boolean to string', () => {
    const r = coerceString(V.boolean(true));
    expect(r.value).toBe('true');
  });

  it('converts null to string', () => {
    const r = coerceString(V.null());
    expect(r.value).toBe('null');
  });

  it('converts object to string', () => {
    const r = coerceString(V.object([['a', V.number(1)]]));
    expect(r.value).toContain('a');
  });

  it('uses rawString for any-of', () => {
    const r = coerceString(V.anyOf([V.number(42)], 'original text'));
    expect(r.value).toBe('original text');
    expect(r.flags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Int coercion
// ---------------------------------------------------------------------------

describe('coerceInt', () => {
  it('passes through integer', () => {
    const r = coerceInt(V.number(42));
    expect(r?.value).toBe(42);
    expect(r?.flags).toHaveLength(0);
  });

  it('rounds float to int', () => {
    const r = coerceInt(V.number(3.7));
    expect(r?.value).toBe(4);
    expect(r?.flags[0].kind).toBe('float-to-int');
  });

  it('parses string to int', () => {
    const r = coerceInt(V.string('42'));
    expect(r?.value).toBe(42);
  });

  it('parses string float to int', () => {
    const r = coerceInt(V.string('3.14'));
    expect(r?.value).toBe(3);
    expect(r?.flags.some((f) => f.kind === 'float-to-int')).toBe(true);
  });

  it('parses currency string', () => {
    const r = coerceInt(V.string('$1,234'));
    expect(r?.value).toBe(1234);
  });

  it('parses fraction to int', () => {
    const r = coerceInt(V.string('3/4'));
    expect(r?.value).toBe(1); // 0.75 rounded
  });

  it('returns null for non-numeric string', () => {
    expect(coerceInt(V.string('hello'))).toBeNull();
  });

  it('returns null for null', () => {
    expect(coerceInt(V.null())).toBeNull();
  });

  it('tries candidates in any-of', () => {
    const r = coerceInt(V.anyOf([V.string('hello'), V.number(42)], '42'));
    expect(r?.value).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Float coercion
// ---------------------------------------------------------------------------

describe('coerceFloat', () => {
  it('passes through number', () => {
    const r = coerceFloat(V.number(3.14));
    expect(r?.value).toBe(3.14);
    expect(r?.flags).toHaveLength(0);
  });

  it('parses string to float', () => {
    const r = coerceFloat(V.string('3.14'));
    expect(r?.value).toBe(3.14);
  });

  it('parses currency string', () => {
    const r = coerceFloat(V.string('$1,234.56'));
    expect(r?.value).toBe(1234.56);
  });

  it('parses European format', () => {
    const r = coerceFloat(V.string('1.234,56'));
    expect(r?.value).toBeCloseTo(1234.56);
  });

  it('parses fraction', () => {
    const r = coerceFloat(V.string('3/4'));
    expect(r?.value).toBe(0.75);
  });

  it('parses negative number', () => {
    const r = coerceFloat(V.string('-42.5'));
    expect(r?.value).toBe(-42.5);
  });

  it('returns null for non-numeric string', () => {
    expect(coerceFloat(V.string('hello'))).toBeNull();
  });

  it('returns null for null', () => {
    expect(coerceFloat(V.null())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bool coercion
// ---------------------------------------------------------------------------

describe('coerceBool', () => {
  it('passes through boolean', () => {
    const r = coerceBool(V.boolean(true));
    expect(r?.value).toBe(true);
    expect(r?.flags).toHaveLength(0);
  });

  it('coerces "true" string', () => {
    const r = coerceBool(V.string('true'));
    expect(r?.value).toBe(true);
    expect(r?.flags[0].kind).toBe('string-to-bool');
  });

  it('coerces "TRUE" string (case-insensitive)', () => {
    const r = coerceBool(V.string('TRUE'));
    expect(r?.value).toBe(true);
  });

  it('coerces "False" string', () => {
    const r = coerceBool(V.string('False'));
    expect(r?.value).toBe(false);
  });

  it('coerces "yes"', () => {
    const r = coerceBool(V.string('yes'));
    expect(r?.value).toBe(true);
  });

  it('coerces "no"', () => {
    const r = coerceBool(V.string('no'));
    expect(r?.value).toBe(false);
  });

  it('coerces "1" to true', () => {
    const r = coerceBool(V.string('1'));
    expect(r?.value).toBe(true);
  });

  it('coerces "0" to false', () => {
    const r = coerceBool(V.string('0'));
    expect(r?.value).toBe(false);
  });

  it('coerces number 0 to false', () => {
    const r = coerceBool(V.number(0));
    expect(r?.value).toBe(false);
  });

  it('coerces number 1 to true', () => {
    const r = coerceBool(V.number(1));
    expect(r?.value).toBe(true);
  });

  it('returns null for null', () => {
    expect(coerceBool(V.null())).toBeNull();
  });

  it('returns null for non-boolean string', () => {
    expect(coerceBool(V.string('maybe'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Null coercion
// ---------------------------------------------------------------------------

describe('coerceNull', () => {
  it('passes through null', () => {
    const r = coerceNull(V.null());
    expect(r?.value).toBeNull();
    expect(r?.flags).toHaveLength(0);
  });

  it('coerces "null" string', () => {
    const r = coerceNull(V.string('null'));
    expect(r?.value).toBeNull();
    expect(r?.flags[0].kind).toBe('string-to-null');
  });

  it('coerces "none" string', () => {
    const r = coerceNull(V.string('none'));
    expect(r?.value).toBeNull();
  });

  it('coerces empty string', () => {
    const r = coerceNull(V.string(''));
    expect(r?.value).toBeNull();
  });

  it('returns null for non-null string', () => {
    expect(coerceNull(V.string('hello'))).toBeNull();
  });

  it('returns null for number', () => {
    expect(coerceNull(V.number(42))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Literal coercion
// ---------------------------------------------------------------------------

describe('coerceLiteral', () => {
  it('matches string literal', () => {
    const r = coerceLiteral(V.string('hello'), 'hello');
    expect(r?.value).toBe('hello');
    expect(r?.flags).toHaveLength(0);
  });

  it('rejects wrong string literal', () => {
    expect(coerceLiteral(V.string('world'), 'hello')).toBeNull();
  });

  it('matches number literal', () => {
    const r = coerceLiteral(V.number(42), 42);
    expect(r?.value).toBe(42);
  });

  it('matches boolean literal', () => {
    const r = coerceLiteral(V.boolean(true), true);
    expect(r?.value).toBe(true);
  });

  it('coerces string to number literal', () => {
    const r = coerceLiteral(V.string('42'), 42);
    expect(r?.value).toBe(42);
  });

  it('coerces string to boolean literal', () => {
    const r = coerceLiteral(V.string('true'), true);
    expect(r?.value).toBe(true);
  });

  it('returns null for null input', () => {
    expect(coerceLiteral(V.null(), 'hello')).toBeNull();
  });
});
