/**
 * Fixing parser — a character-by-character state machine that repairs
 * malformed JSON from LLM output.
 *
 * Handles:
 *   - Unquoted keys and values
 *   - Single-quoted strings
 *   - Triple-quoted strings (""" ... """)
 *   - Triple-backtick code blocks (```lang ... ```)
 *   - Trailing and leading commas
 *   - Comments (// and /* ... *​/)
 *   - Unterminated strings, objects, arrays
 *   - Badly escaped characters
 *
 * Analogous to BAML's `fixing_parser` module.
 */

import { type JsonishValue, JsonishValue as V, type Fix } from '../values.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to parse malformed JSON text using the fixing parser.
 * Returns undefined if no usable structure could be extracted.
 */
export function fixingParse(text: string): JsonishValue | undefined {
  const state = new FixingParserState();
  const chars = [...text];

  let i = 0;
  while (i < chars.length) {
    const skip = state.processToken(chars, i);
    if (skip < 0) return undefined; // Fatal error
    i += 1 + skip;
  }

  // Close any unterminated collections
  while (state.stack.length > 0) {
    state.completeTop();
  }

  if (state.completed.length === 0) return undefined;
  if (state.completed.length === 1) return state.completed[0];

  // Multiple top-level values: if all strings, return as array
  if (state.completed.every((v) => v.type === 'string')) {
    return V.array(state.completed);
  }

  // Filter for objects and arrays
  const structured = state.completed.filter(
    (v) => v.type === 'object' || v.type === 'array',
  );
  if (structured.length === 1) return structured[0];
  if (structured.length > 1) return V.array(structured);

  return state.completed[0];
}

// ---------------------------------------------------------------------------
// Collection types on the stack
// ---------------------------------------------------------------------------

type Collection =
  | { kind: 'object'; keys: string[]; values: JsonishValue[] }
  | { kind: 'array'; items: JsonishValue[] }
  | { kind: 'quoted-string'; content: string; quote: '"' | "'" | '`' }
  | { kind: 'triple-quoted-string'; content: string }
  | { kind: 'triple-backtick'; content: string; firstLine: boolean }
  | { kind: 'unquoted-string'; content: string }
  | { kind: 'line-comment'; content: string }
  | { kind: 'block-comment'; content: string };

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

class FixingParserState {
  stack: Collection[] = [];
  completed: JsonishValue[] = [];

  /** Process one token. Returns number of extra chars to skip. */
  processToken(chars: string[], pos: number): number {
    const ch = chars[pos];
    const top = this.stack[this.stack.length - 1];

    if (!top) {
      return this.findStartingValue(chars, pos);
    }

    switch (top.kind) {
      case 'object':
        return this.processInObject(chars, pos, top);
      case 'array':
        return this.processInArray(chars, pos);
      case 'quoted-string':
        return this.processInQuotedString(chars, pos, top);
      case 'triple-quoted-string':
        return this.processInTripleQuoted(chars, pos, top);
      case 'triple-backtick':
        return this.processInTripleBacktick(chars, pos, top);
      case 'unquoted-string':
        return this.processInUnquotedString(chars, pos, top);
      case 'line-comment':
        if (ch === '\n') {
          this.stack.pop(); // Discard comment
          return 0;
        }
        top.content += ch;
        return 0;
      case 'block-comment':
        if (ch === '*' && chars[pos + 1] === '/') {
          this.stack.pop(); // Discard comment
          return 1;
        }
        top.content += ch;
        return 0;
    }
  }

  completeTop(): void {
    const top = this.stack.pop();
    if (!top) return;

    const value = this.collectionToValue(top);
    if (value === undefined) return;

    const parent = this.stack[this.stack.length - 1];
    if (!parent) {
      this.completed.push(value);
      return;
    }

    this.pushValueToParent(parent, value);
  }

  // -----------------------------------------------------------------------
  // Process helpers
  // -----------------------------------------------------------------------

  private processInObject(
    chars: string[],
    pos: number,
    obj: Extract<Collection, { kind: 'object' }>,
  ): number {
    const ch = chars[pos];
    switch (ch) {
      case '}':
        this.completeTop();
        return 0;
      case ',':
      case ':':
        return 0;
      default:
        return this.findStartingValue(chars, pos);
    }
  }

  private processInArray(chars: string[], pos: number): number {
    const ch = chars[pos];
    switch (ch) {
      case ']':
        this.completeTop();
        return 0;
      case ',':
        return 0;
      default:
        return this.findStartingValue(chars, pos);
    }
  }

  private processInQuotedString(
    chars: string[],
    pos: number,
    str: Extract<Collection, { kind: 'quoted-string' }>,
  ): number {
    const ch = chars[pos];

    if (ch === '\\') {
      const next = chars[pos + 1];
      if (next === undefined) {
        str.content += ch;
        return 0;
      }
      switch (next) {
        case 'n':
          str.content += '\n';
          return 1;
        case 't':
          str.content += '\t';
          return 1;
        case 'r':
          str.content += '\r';
          return 1;
        case '\\':
          str.content += '\\';
          return 1;
        case '"':
          str.content += '"';
          return 1;
        case "'":
          str.content += "'";
          return 1;
        case '/':
          str.content += '/';
          return 1;
        case 'b':
          str.content += '\b';
          return 1;
        case 'f':
          str.content += '\f';
          return 1;
        case 'u': {
          // Unicode escape: \uXXXX
          const hex = chars.slice(pos + 2, pos + 6).join('');
          if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
            str.content += String.fromCharCode(parseInt(hex, 16));
            return 5;
          }
          str.content += ch;
          return 0;
        }
        default:
          // Unknown escape: just include the backslash
          str.content += ch;
          return 0;
      }
    }

    if (ch === str.quote) {
      if (this.shouldCloseString(chars, pos)) {
        this.completeTop();
        return 0;
      }
      // Don't close — treat quote as part of the string content
      str.content += ch;
      return 0;
    }

    str.content += ch;
    return 0;
  }

  private processInTripleQuoted(
    chars: string[],
    pos: number,
    str: Extract<Collection, { kind: 'triple-quoted-string' }>,
  ): number {
    const ch = chars[pos];
    if (ch === '"' && chars[pos + 1] === '"' && chars[pos + 2] === '"') {
      this.completeTop();
      return 2;
    }
    str.content += ch;
    return 0;
  }

  private processInTripleBacktick(
    chars: string[],
    pos: number,
    block: Extract<Collection, { kind: 'triple-backtick' }>,
  ): number {
    const ch = chars[pos];
    if (ch === '`' && chars[pos + 1] === '`' && chars[pos + 2] === '`') {
      this.completeTop();
      return 2;
    }
    // Skip the first line (language tag)
    if (block.firstLine) {
      if (ch === '\n') {
        block.firstLine = false;
      }
      return 0;
    }
    block.content += ch;
    return 0;
  }

  private processInUnquotedString(
    chars: string[],
    pos: number,
    str: Extract<Collection, { kind: 'unquoted-string' }>,
  ): number {
    const ch = chars[pos];

    // Check if this character terminates the unquoted string
    const parent = this.stack[this.stack.length - 2];

    if (parent?.kind === 'object') {
      const obj = parent;
      const isKey = obj.keys.length === obj.values.length;
      if (isKey && (ch === ':' || ch === '}')) {
        this.completeTop();
        // Re-process structural delimiters in parent context
        if (ch === '}') return this.processToken(chars, pos);
        return 0;
      }
      if (!isKey && (ch === ',' || ch === '}')) {
        this.completeTop();
        if (ch === '}') return this.processToken(chars, pos);
        return 0;
      }
    } else if (parent?.kind === 'array') {
      if (ch === ',' || ch === ']') {
        this.completeTop();
        if (ch === ']') return this.processToken(chars, pos);
        return 0;
      }
    } else if (!parent) {
      // Top-level: terminate on { or [
      if (ch === '{' || ch === '[') {
        this.completeTop();
        return this.findStartingValue(chars, pos);
      }
    }

    str.content += ch;
    return 0;
  }

  // -----------------------------------------------------------------------
  // Start a new value
  // -----------------------------------------------------------------------

  private findStartingValue(chars: string[], pos: number): number {
    const ch = chars[pos];

    switch (ch) {
      case '{':
        this.stack.push({ kind: 'object', keys: [], values: [] });
        return 0;

      case '[':
        this.stack.push({ kind: 'array', items: [] });
        return 0;

      case '"':
        // Check for triple-quoted
        if (chars[pos + 1] === '"' && chars[pos + 2] === '"') {
          this.stack.push({ kind: 'triple-quoted-string', content: '' });
          return 2;
        }
        this.stack.push({ kind: 'quoted-string', content: '', quote: '"' });
        return 0;

      case "'":
        this.stack.push({ kind: 'quoted-string', content: '', quote: "'" });
        return 0;

      case '`':
        // Check for triple-backtick
        if (chars[pos + 1] === '`' && chars[pos + 2] === '`') {
          this.stack.push({
            kind: 'triple-backtick',
            content: '',
            firstLine: true,
          });
          return 2;
        }
        this.stack.push({ kind: 'quoted-string', content: '', quote: '`' });
        return 0;

      case '/':
        if (chars[pos + 1] === '/') {
          this.stack.push({ kind: 'line-comment', content: '' });
          return 1;
        }
        if (chars[pos + 1] === '*') {
          this.stack.push({ kind: 'block-comment', content: '' });
          return 1;
        }
        // Might be start of an unquoted string (e.g. a path)
        this.stack.push({ kind: 'unquoted-string', content: ch });
        return 0;

      default:
        if (/\s/.test(ch)) return 0; // Skip whitespace
        // Start an unquoted string
        this.stack.push({ kind: 'unquoted-string', content: ch });
        // Check if it immediately terminates
        return this.checkUnquotedTermination(chars, pos);
    }
  }

  private checkUnquotedTermination(chars: string[], pos: number): number {
    // For unquoted strings that start mid-object/array, we need to scan ahead
    // to find termination. But the main processToken loop handles this.
    return 0;
  }

  // -----------------------------------------------------------------------
  // Smart string closing
  // -----------------------------------------------------------------------

  private shouldCloseString(chars: string[], pos: number): boolean {
    const next = chars[pos + 1];
    if (next === undefined) return true; // End of input

    const grandparent = this.stack[this.stack.length - 2];
    if (!grandparent) {
      // Not inside any structure — close if we see a structural char
      return next === '{' || next === '[' || next === undefined;
    }

    if (grandparent.kind === 'object') {
      const obj = grandparent;
      const isKey = obj.keys.length === obj.values.length;
      if (isKey) {
        return this.lookAheadForClose(chars, pos + 1, [':', '}']);
      }
      return this.lookAheadForClose(chars, pos + 1, [',', '}']);
    }

    if (grandparent.kind === 'array') {
      return this.lookAheadForClose(chars, pos + 1, [',', ']']);
    }

    return true;
  }

  private lookAheadForClose(
    chars: string[],
    start: number,
    closers: string[],
  ): boolean {
    for (let i = start; i < chars.length; i++) {
      const ch = chars[i];
      if (closers.includes(ch)) return true;
      if (ch === '/' && (chars[i + 1] === '/' || chars[i + 1] === '*'))
        return true;
      if (/\s/.test(ch)) continue;
      // Non-whitespace, non-closer
      return false;
    }
    return true; // End of input
  }

  // -----------------------------------------------------------------------
  // Convert collection to value
  // -----------------------------------------------------------------------

  private collectionToValue(col: Collection): JsonishValue | undefined {
    switch (col.kind) {
      case 'object': {
        const pairs: Array<[string, JsonishValue]> = [];
        for (let i = 0; i < col.keys.length && i < col.values.length; i++) {
          pairs.push([col.keys[i], col.values[i]]);
        }
        return V.object(pairs);
      }
      case 'array':
        return V.array(col.items);
      case 'quoted-string':
        return V.string(col.content);
      case 'triple-quoted-string':
        return V.string(col.content);
      case 'triple-backtick': {
        const content = col.content.replace(/^\n/, '');
        return V.string(content);
      }
      case 'unquoted-string':
        return this.parseUnquotedString(col.content.trim());
      case 'line-comment':
      case 'block-comment':
        return undefined; // Discard comments
    }
  }

  private parseUnquotedString(s: string): JsonishValue {
    if (s === 'true') return V.boolean(true);
    if (s === 'false') return V.boolean(false);
    if (s === 'null') return V.null();

    // Try parsing as a number
    const n = Number(s);
    if (!isNaN(n) && s !== '') return V.number(n);

    return V.string(s);
  }

  // -----------------------------------------------------------------------
  // Push value to parent collection
  // -----------------------------------------------------------------------

  private pushValueToParent(parent: Collection, value: JsonishValue): void {
    switch (parent.kind) {
      case 'object': {
        if (parent.keys.length === parent.values.length) {
          // Expecting a key
          if (value.type === 'string') {
            parent.keys.push(value.value);
          } else {
            parent.keys.push(String(value.type === 'number' ? value.value : ''));
          }
        } else {
          // Expecting a value
          parent.values.push(value);
        }
        break;
      }
      case 'array':
        parent.items.push(value);
        break;
      default:
        // Shouldn't happen, but push to completed
        this.completed.push(value);
        break;
    }
  }
}
