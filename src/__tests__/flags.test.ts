import { describe, it, expect } from 'vitest';
import { flagScore, totalScore, type Flag } from '../flags.js';

describe('flagScore', () => {
  it('scores zero-penalty flags', () => {
    expect(flagScore({ kind: 'inferred-object' })).toBe(0);
    expect(flagScore({ kind: 'object-from-fixed-json', fixes: [] })).toBe(0);
    expect(flagScore({ kind: 'union-match', index: 0 })).toBe(0);
  });

  it('scores low-penalty flags at 1', () => {
    expect(flagScore({ kind: 'optional-default-from-no-value' })).toBe(1);
    expect(flagScore({ kind: 'object-to-map' })).toBe(1);
    expect(flagScore({ kind: 'extra-key', key: 'foo' })).toBe(1);
    expect(flagScore({ kind: 'single-to-array' })).toBe(1);
    expect(flagScore({ kind: 'first-match', index: 0 })).toBe(1);
    expect(flagScore({ kind: 'string-to-bool', original: 'true' })).toBe(1);
    expect(flagScore({ kind: 'string-to-null', original: 'null' })).toBe(1);
    expect(flagScore({ kind: 'string-to-char', original: 'a' })).toBe(1);
    expect(flagScore({ kind: 'string-to-float', original: '3.14' })).toBe(1);
    expect(flagScore({ kind: 'float-to-int', original: 3.14 })).toBe(1);
    expect(flagScore({ kind: 'no-fields' })).toBe(1);
    expect(
      flagScore({ kind: 'map-key-parse-error', index: 0, reason: '' }),
    ).toBe(1);
    expect(
      flagScore({ kind: 'map-value-parse-error', key: 'x', reason: '' }),
    ).toBe(1);
  });

  it('scores medium-penalty flags at 2', () => {
    expect(flagScore({ kind: 'object-to-string' })).toBe(2);
    expect(flagScore({ kind: 'object-to-primitive' })).toBe(2);
    expect(flagScore({ kind: 'substring-match', original: 'x' })).toBe(2);
    expect(flagScore({ kind: 'implied-key', key: 'k' })).toBe(2);
    expect(flagScore({ kind: 'json-to-string' })).toBe(2);
    expect(
      flagScore({
        kind: 'default-but-had-unparseable-value',
        reason: 'bad',
      }),
    ).toBe(2);
  });

  it('scores stripped-non-alphanumeric at 3', () => {
    expect(
      flagScore({ kind: 'stripped-non-alphanumeric', original: 'x!' }),
    ).toBe(3);
  });

  it('scores object-from-markdown using its penalty field', () => {
    expect(flagScore({ kind: 'object-from-markdown', penalty: 0 })).toBe(0);
    expect(flagScore({ kind: 'object-from-markdown', penalty: 5 })).toBe(5);
  });

  it('scores array-item-parse-error as 1 + index', () => {
    expect(
      flagScore({ kind: 'array-item-parse-error', index: 0, reason: '' }),
    ).toBe(1);
    expect(
      flagScore({ kind: 'array-item-parse-error', index: 3, reason: '' }),
    ).toBe(4);
    expect(
      flagScore({ kind: 'array-item-parse-error', index: 10, reason: '' }),
    ).toBe(11);
  });

  it('scores str-match-one-from-many as sum of counts', () => {
    expect(
      flagScore({
        kind: 'str-match-one-from-many',
        matches: [
          ['A', 2],
          ['B', 3],
        ],
      }),
    ).toBe(5);
    expect(
      flagScore({ kind: 'str-match-one-from-many', matches: [] }),
    ).toBe(0);
  });

  it('scores high-penalty defaults', () => {
    expect(flagScore({ kind: 'default-from-no-value' })).toBe(100);
    expect(flagScore({ kind: 'default-but-had-value' })).toBe(110);
  });
});

describe('totalScore', () => {
  it('sums individual flag scores', () => {
    const flags: Flag[] = [
      { kind: 'single-to-array' }, // 1
      { kind: 'implied-key', key: 'x' }, // 2
      { kind: 'extra-key', key: 'y' }, // 1
    ];
    expect(totalScore(flags)).toBe(4);
  });

  it('returns 0 for empty flags', () => {
    expect(totalScore([])).toBe(0);
  });

  it('returns 0 for all-zero flags', () => {
    const flags: Flag[] = [
      { kind: 'union-match', index: 0 },
      { kind: 'object-from-fixed-json', fixes: [] },
    ];
    expect(totalScore(flags)).toBe(0);
  });
});
