import { describe, it, expect } from 'vitest';
import { renderOutputFormat } from '../output-format.js';

describe('renderOutputFormat', () => {
  // -----------------------------------------------------------------------
  // Primitives
  // -----------------------------------------------------------------------

  describe('primitives', () => {
    it('renders string', () => {
      expect(renderOutputFormat({ type: 'string' })).toBe(
        'Answer as a string.\nstring',
      );
    });

    it('renders integer', () => {
      expect(renderOutputFormat({ type: 'integer' })).toBe(
        'Answer as an integer.\nint',
      );
    });

    it('renders number', () => {
      expect(renderOutputFormat({ type: 'number' })).toBe(
        'Answer as a number.\nfloat',
      );
    });

    it('renders boolean', () => {
      expect(renderOutputFormat({ type: 'boolean' })).toBe(
        'Answer as a boolean (true or false).\nbool',
      );
    });

    it('renders null', () => {
      expect(renderOutputFormat({ type: 'null' })).toBe(
        'Answer with null.\nnull',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Enum
  // -----------------------------------------------------------------------

  describe('enum', () => {
    it('renders inline enum (<=6 values, no descriptions)', () => {
      const result = renderOutputFormat({ enum: ['Red', 'Green', 'Blue'] });
      expect(result).toContain('Red or Green or Blue');
    });

    it('renders hoisted enum (>6 values)', () => {
      const result = renderOutputFormat({
        enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      });
      // Should contain the hoisted block
      expect(result).toContain('----');
      expect(result).toContain('- A');
      expect(result).toContain('- G');
    });

    it('renders hoisted enum (has descriptions)', () => {
      // We need to use anyOf with const + descriptions or go through FieldType directly.
      // JSON Schema doesn't natively support enum descriptions, so we test via alwaysHoistEnums.
      const result = renderOutputFormat(
        { enum: ['Yes', 'No'] },
        { alwaysHoistEnums: true },
      );
      expect(result).toContain('----');
      expect(result).toContain('- Yes');
      expect(result).toContain('- No');
    });
  });

  // -----------------------------------------------------------------------
  // Class / Object
  // -----------------------------------------------------------------------

  describe('class / object', () => {
    it('renders simple object', () => {
      const result = renderOutputFormat({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name', 'age'],
      });
      expect(result).toContain('Answer in JSON using this schema:');
      expect(result).toContain('name: string,');
      expect(result).toContain('age: int,');
    });

    it('renders optional fields with | null', () => {
      const result = renderOutputFormat({
        type: 'object',
        properties: {
          name: { type: 'string' },
          nickname: { type: 'string' },
        },
        required: ['name'],
      });
      expect(result).toContain('name: string,');
      expect(result).toContain('nickname: string | null,');
    });

    it('renders field descriptions as comments', () => {
      const result = renderOutputFormat({
        type: 'object',
        properties: {
          age: { type: 'integer', description: 'Age in years' },
        },
        required: ['age'],
      });
      expect(result).toContain('age: int, // Age in years');
    });

    it('renders nested objects', () => {
      const result = renderOutputFormat({
        type: 'object',
        properties: {
          address: {
            type: 'object',
            properties: {
              city: { type: 'string' },
            },
            required: ['city'],
          },
        },
        required: ['address'],
      });
      expect(result).toContain('address: {');
      expect(result).toContain('city: string,');
    });

    it('renders single-field object', () => {
      const result = renderOutputFormat({
        type: 'object',
        properties: {
          value: { type: 'string' },
        },
        required: ['value'],
      });
      expect(result).toContain('value: string,');
    });

    it('quotes field names when quoteClassFields=true', () => {
      const result = renderOutputFormat(
        {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        { quoteClassFields: true },
      );
      expect(result).toContain('"name": string,');
    });
  });

  // -----------------------------------------------------------------------
  // Array / List
  // -----------------------------------------------------------------------

  describe('array / list', () => {
    it('renders simple array', () => {
      const result = renderOutputFormat({
        type: 'array',
        items: { type: 'string' },
      });
      expect(result).toContain('string[]');
    });

    it('renders array of objects', () => {
      const result = renderOutputFormat({
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'integer' } },
          required: ['id'],
        },
      });
      expect(result).toContain('Answer with a JSON Array using this schema:');
      expect(result).toContain('id: int,');
      expect(result).toContain('[]');
    });

    it('renders nested arrays', () => {
      const result = renderOutputFormat({
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'integer' },
        },
      });
      expect(result).toContain('int[][]');
    });
  });

  // -----------------------------------------------------------------------
  // Union (anyOf / oneOf)
  // -----------------------------------------------------------------------

  describe('union', () => {
    it('renders two-way union', () => {
      const result = renderOutputFormat({
        anyOf: [{ type: 'string' }, { type: 'integer' }],
      });
      expect(result).toContain('string or int');
    });

    it('renders optional (T | null)', () => {
      const result = renderOutputFormat({
        anyOf: [{ type: 'string' }, { type: 'null' }],
      });
      expect(result).toContain('string | null');
    });

    it('renders three-way union', () => {
      const result = renderOutputFormat({
        anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'boolean' }],
      });
      expect(result).toContain('string or int or bool');
    });

    it('uses custom orSplitter', () => {
      const result = renderOutputFormat(
        { anyOf: [{ type: 'string' }, { type: 'integer' }] },
        { orSplitter: ' | ' },
      );
      expect(result).toContain('string | int');
    });
  });

  // -----------------------------------------------------------------------
  // Map
  // -----------------------------------------------------------------------

  describe('map', () => {
    it('renders map with angle style (default)', () => {
      const result = renderOutputFormat({
        type: 'object',
        additionalProperties: { type: 'integer' },
      });
      expect(result).toContain('map<string, int>');
    });

    it('renders map with object style', () => {
      const result = renderOutputFormat(
        {
          type: 'object',
          additionalProperties: { type: 'integer' },
        },
        { mapStyle: 'object' },
      );
      expect(result).toContain('{[key: string]: int}');
    });
  });

  // -----------------------------------------------------------------------
  // Literal
  // -----------------------------------------------------------------------

  describe('literal', () => {
    it('renders string literal', () => {
      const result = renderOutputFormat({ const: 'hello' });
      expect(result).toContain('"hello"');
    });

    it('renders number literal', () => {
      const result = renderOutputFormat({ const: 42 });
      expect(result).toContain('42');
    });
  });

  // -----------------------------------------------------------------------
  // Recursive types
  // -----------------------------------------------------------------------

  describe('recursive types', () => {
    it('renders recursive type with hoisted definition', () => {
      const result = renderOutputFormat({
        $ref: '#/$defs/TreeNode',
        $defs: {
          TreeNode: {
            type: 'object',
            properties: {
              value: { type: 'integer' },
              children: {
                type: 'array',
                items: { $ref: '#/$defs/TreeNode' },
              },
            },
            required: ['value'],
          },
        },
      });
      // Should have a hoisted definition for TreeNode
      expect(result).toContain('TreeNode {');
      expect(result).toContain('value: int,');
      expect(result).toContain('children: TreeNode[]');
    });
  });

  // -----------------------------------------------------------------------
  // Custom prefix
  // -----------------------------------------------------------------------

  describe('custom prefix', () => {
    it('uses custom prefix', () => {
      const result = renderOutputFormat(
        { type: 'string' },
        { prefix: 'Please respond as:' },
      );
      expect(result).toBe('Please respond as:\nstring');
    });

    it('uses null prefix (no prefix)', () => {
      const result = renderOutputFormat(
        { type: 'string' },
        { prefix: null },
      );
      expect(result).toBe('string');
    });
  });
});
