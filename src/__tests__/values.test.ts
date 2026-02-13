import { describe, it, expect } from 'vitest';
import { JsonishValue, jsonishToString, jsonishTypeName } from '../values.js';

describe('JsonishValue builders', () => {
  it('creates string', () => {
    const v = JsonishValue.string('hello');
    expect(v).toEqual({ type: 'string', value: 'hello' });
  });

  it('creates number', () => {
    const v = JsonishValue.number(42);
    expect(v).toEqual({ type: 'number', value: 42 });
  });

  it('creates boolean', () => {
    expect(JsonishValue.boolean(true)).toEqual({ type: 'boolean', value: true });
    expect(JsonishValue.boolean(false)).toEqual({ type: 'boolean', value: false });
  });

  it('creates null', () => {
    expect(JsonishValue.null()).toEqual({ type: 'null' });
  });

  it('creates object', () => {
    const v = JsonishValue.object([
      ['name', JsonishValue.string('Alice')],
      ['age', JsonishValue.number(30)],
    ]);
    expect(v.type).toBe('object');
    expect(v.fields).toHaveLength(2);
    expect(v.fields[0][0]).toBe('name');
  });

  it('creates array', () => {
    const v = JsonishValue.array([
      JsonishValue.number(1),
      JsonishValue.number(2),
    ]);
    expect(v.type).toBe('array');
    expect(v.items).toHaveLength(2);
  });

  it('creates markdown', () => {
    const inner = JsonishValue.object([['a', JsonishValue.number(1)]]);
    const v = JsonishValue.markdown('json', inner);
    expect(v.type).toBe('markdown');
    expect(v.tag).toBe('json');
    expect(v.inner).toEqual(inner);
  });

  it('creates fixed-json', () => {
    const inner = JsonishValue.object([]);
    const v = JsonishValue.fixedJson(inner, ['grepped-for-json']);
    expect(v.type).toBe('fixed-json');
    expect(v.fixes).toEqual(['grepped-for-json']);
  });

  it('creates any-of', () => {
    const v = JsonishValue.anyOf(
      [JsonishValue.string('42'), JsonishValue.number(42)],
      '42',
    );
    expect(v.type).toBe('any-of');
    expect(v.candidates).toHaveLength(2);
    expect(v.rawString).toBe('42');
  });
});

describe('jsonishToString', () => {
  it('formats string', () => {
    expect(jsonishToString(JsonishValue.string('hi'))).toBe('hi');
  });

  it('formats number', () => {
    expect(jsonishToString(JsonishValue.number(3.14))).toBe('3.14');
  });

  it('formats boolean', () => {
    expect(jsonishToString(JsonishValue.boolean(true))).toBe('true');
  });

  it('formats null', () => {
    expect(jsonishToString(JsonishValue.null())).toBe('null');
  });

  it('formats object', () => {
    const v = JsonishValue.object([
      ['a', JsonishValue.number(1)],
      ['b', JsonishValue.string('x')],
    ]);
    expect(jsonishToString(v)).toBe('{a: 1, b: x}');
  });

  it('formats array', () => {
    const v = JsonishValue.array([
      JsonishValue.number(1),
      JsonishValue.number(2),
    ]);
    expect(jsonishToString(v)).toBe('[1, 2]');
  });

  it('formats any-of', () => {
    const v = JsonishValue.anyOf([], 'raw');
    expect(jsonishToString(v)).toBe('AnyOf[raw]');
  });

  it('formats fixed-json by delegating to inner', () => {
    const v = JsonishValue.fixedJson(JsonishValue.number(5), []);
    expect(jsonishToString(v)).toBe('5');
  });
});

describe('jsonishTypeName', () => {
  it('returns correct type names', () => {
    expect(jsonishTypeName(JsonishValue.string('x'))).toBe('String');
    expect(jsonishTypeName(JsonishValue.number(1))).toBe('Number');
    expect(jsonishTypeName(JsonishValue.boolean(true))).toBe('Boolean');
    expect(jsonishTypeName(JsonishValue.null())).toBe('Null');
    expect(jsonishTypeName(JsonishValue.object([]))).toBe('Object');
    expect(jsonishTypeName(JsonishValue.array([]))).toBe('Array');
    expect(
      jsonishTypeName(JsonishValue.markdown('json', JsonishValue.null())),
    ).toBe('Markdown:json');
    expect(
      jsonishTypeName(JsonishValue.fixedJson(JsonishValue.null(), [])),
    ).toBe('FixedJson');
    expect(jsonishTypeName(JsonishValue.anyOf([], ''))).toBe('AnyOf');
  });
});
