import { describe, it, expect } from 'vitest';
import { tryCastEnum, coerceEnum } from '../coercer/coerce-enum.js';
import { matchString, keysMatch, stripAccents, stripPunctuation } from '../coercer/match-string.js';
import { JsonishValue as V } from '../values.js';
import type { EnumType } from '../types.js';

// ---------------------------------------------------------------------------
// Test enum definitions
// ---------------------------------------------------------------------------

const COLOR_ENUM: EnumType = {
  type: 'enum',
  name: 'Color',
  values: [
    { name: 'RED' },
    { name: 'GREEN' },
    { name: 'BLUE' },
  ],
};

const SENTIMENT_ENUM: EnumType = {
  type: 'enum',
  name: 'Sentiment',
  values: [
    { name: 'POSITIVE', description: 'Good feeling' },
    { name: 'NEGATIVE', description: 'Bad feeling' },
    { name: 'NEUTRAL', description: 'No strong feeling' },
  ],
};

const ALIASED_ENUM: EnumType = {
  type: 'enum',
  name: 'Status',
  values: [
    { name: 'ACTIVE', alias: 'active' },
    { name: 'INACTIVE', alias: 'disabled' },
  ],
};

// ---------------------------------------------------------------------------
// matchString
// ---------------------------------------------------------------------------

describe('matchString', () => {
  const candidates = [
    { name: 'RED', aliases: ['RED'] },
    { name: 'GREEN', aliases: ['GREEN'] },
    { name: 'BLUE', aliases: ['BLUE'] },
  ];

  it('exact match', () => {
    const r = matchString('RED', candidates, false);
    expect(r?.name).toBe('RED');
    expect(r?.flags).toHaveLength(0);
  });

  it('case-insensitive match', () => {
    const r = matchString('red', candidates, false);
    expect(r?.name).toBe('RED');
    expect(r?.flags[0]?.kind).toBe('stripped-non-alphanumeric');
  });

  it('returns null for no match', () => {
    expect(matchString('YELLOW', candidates, false)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(matchString('', candidates, false)).toBeNull();
  });

  it('substring match', () => {
    const r = matchString('I think the color is RED because', candidates, true);
    expect(r?.name).toBe('RED');
    expect(r?.flags[0]?.kind).toBe('substring-match');
  });

  it('ambiguous substring match returns null', () => {
    const r = matchString('RED and GREEN', candidates, true);
    expect(r).toBeNull();
  });

  it('no substring match when disabled', () => {
    const r = matchString('I think RED', candidates, false);
    expect(r).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// keysMatch
// ---------------------------------------------------------------------------

describe('keysMatch', () => {
  it('exact match', () => expect(keysMatch('name', 'name')).toBe(true));
  it('case-insensitive', () => expect(keysMatch('Name', 'name')).toBe(true));
  it('strips punctuation', () => expect(keysMatch('user_name', 'user_name')).toBe(true));
  it('different keys', () => expect(keysMatch('name', 'age')).toBe(false));
});

// ---------------------------------------------------------------------------
// stripAccents
// ---------------------------------------------------------------------------

describe('stripAccents', () => {
  it('strips diacritics', () => expect(stripAccents('café')).toBe('cafe'));
  it('expands ß', () => expect(stripAccents('straße')).toBe('strasse'));
  it('expands æ', () => expect(stripAccents('Æon')).toBe('AEon'));
  it('expands ø', () => expect(stripAccents('fjørd')).toBe('fjord'));
  it('no-op on ASCII', () => expect(stripAccents('hello')).toBe('hello'));
});

// ---------------------------------------------------------------------------
// tryCastEnum
// ---------------------------------------------------------------------------

describe('tryCastEnum', () => {
  it('matches exact variant name', () => {
    const r = tryCastEnum(V.string('RED'), COLOR_ENUM);
    expect(r?.value).toBe('RED');
    expect(r?.flags).toHaveLength(0);
  });

  it('rejects wrong variant', () => {
    expect(tryCastEnum(V.string('YELLOW'), COLOR_ENUM)).toBeNull();
  });

  it('rejects case-different (strict)', () => {
    expect(tryCastEnum(V.string('red'), COLOR_ENUM)).toBeNull();
  });

  it('rejects non-string', () => {
    expect(tryCastEnum(V.number(42), COLOR_ENUM)).toBeNull();
  });

  it('matches alias', () => {
    const r = tryCastEnum(V.string('active'), ALIASED_ENUM);
    expect(r?.value).toBe('ACTIVE');
  });

  it('does not match canonical name when alias differs', () => {
    // "INACTIVE" is the canonical name, but alias is "disabled"
    expect(tryCastEnum(V.string('INACTIVE'), ALIASED_ENUM)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// coerceEnum (fuzzy)
// ---------------------------------------------------------------------------

describe('coerceEnum', () => {
  it('matches exact variant', () => {
    const r = coerceEnum(V.string('RED'), COLOR_ENUM);
    expect(r?.value).toBe('RED');
  });

  it('case-insensitive match', () => {
    const r = coerceEnum(V.string('green'), COLOR_ENUM);
    expect(r?.value).toBe('GREEN');
  });

  it('matches via description', () => {
    const r = coerceEnum(V.string('Good feeling'), SENTIMENT_ENUM);
    expect(r?.value).toBe('POSITIVE');
  });

  it('substring match from prose', () => {
    const r = coerceEnum(
      V.string('I would say the sentiment is POSITIVE in this case'),
      SENTIMENT_ENUM,
    );
    expect(r?.value).toBe('POSITIVE');
  });

  it('returns null for unmatchable text', () => {
    expect(coerceEnum(V.string('xyz123'), COLOR_ENUM)).toBeNull();
  });

  it('coerces from number (uses string conversion)', () => {
    // Number 42 → "42" which won't match any color
    expect(coerceEnum(V.number(42), COLOR_ENUM)).toBeNull();
  });

  it('coerces any-of using rawString', () => {
    const r = coerceEnum(
      V.anyOf([V.number(1)], 'RED'),
      COLOR_ENUM,
    );
    expect(r?.value).toBe('RED');
  });

  it('unwraps markdown', () => {
    const r = coerceEnum(V.markdown('', V.string('BLUE')), COLOR_ENUM);
    expect(r?.value).toBe('BLUE');
  });

  it('unwraps fixed-json', () => {
    const r = coerceEnum(V.fixedJson(V.string('GREEN'), []), COLOR_ENUM);
    expect(r?.value).toBe('GREEN');
  });
});
