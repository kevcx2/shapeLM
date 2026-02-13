import { describe, it, expect } from 'vitest';
import { schemaToType } from '../schema-to-types.js';
import { FieldType } from '../types.js';

describe('schemaToType', () => {
  // -----------------------------------------------------------------------
  // Primitives
  // -----------------------------------------------------------------------

  describe('primitives', () => {
    it('converts string', () => {
      const { type } = schemaToType({ type: 'string' });
      expect(type).toEqual(FieldType.string());
    });

    it('converts integer', () => {
      const { type } = schemaToType({ type: 'integer' });
      expect(type).toEqual(FieldType.int());
    });

    it('converts number', () => {
      const { type } = schemaToType({ type: 'number' });
      expect(type).toEqual(FieldType.float());
    });

    it('converts boolean', () => {
      const { type } = schemaToType({ type: 'boolean' });
      expect(type).toEqual(FieldType.bool());
    });

    it('converts null', () => {
      const { type } = schemaToType({ type: 'null' });
      expect(type).toEqual(FieldType.null());
    });
  });

  // -----------------------------------------------------------------------
  // Const / Literal
  // -----------------------------------------------------------------------

  describe('const / literal', () => {
    it('converts string const', () => {
      const { type } = schemaToType({ const: 'hello' });
      expect(type).toEqual(FieldType.literal('hello'));
    });

    it('converts number const', () => {
      const { type } = schemaToType({ const: 42 });
      expect(type).toEqual(FieldType.literal(42));
    });

    it('converts boolean const', () => {
      const { type } = schemaToType({ const: true });
      expect(type).toEqual(FieldType.literal(true));
    });

    it('converts null const', () => {
      const { type } = schemaToType({ const: null });
      expect(type).toEqual(FieldType.null());
    });
  });

  // -----------------------------------------------------------------------
  // Enum
  // -----------------------------------------------------------------------

  describe('enum', () => {
    it('converts string enum', () => {
      const { type } = schemaToType({ enum: ['Red', 'Green', 'Blue'] });
      expect(type.type).toBe('enum');
      if (type.type === 'enum') {
        expect(type.values.map((v) => v.name)).toEqual([
          'Red',
          'Green',
          'Blue',
        ]);
      }
    });

    it('converts mixed enum as union of literals', () => {
      const { type } = schemaToType({ enum: ['a', 1, true, null] });
      expect(type.type).toBe('union');
      if (type.type === 'union') {
        expect(type.options).toHaveLength(4);
        expect(type.options[0]).toEqual(FieldType.literal('a'));
        expect(type.options[1]).toEqual(FieldType.literal(1));
        expect(type.options[2]).toEqual(FieldType.literal(true));
        expect(type.options[3]).toEqual(FieldType.null());
      }
    });
  });

  // -----------------------------------------------------------------------
  // Object / Class
  // -----------------------------------------------------------------------

  describe('object / class', () => {
    it('converts simple object with required fields', () => {
      const { type } = schemaToType({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name', 'age'],
      });
      expect(type.type).toBe('class');
      if (type.type === 'class') {
        expect(type.fields).toHaveLength(2);
        expect(type.fields[0].name).toBe('name');
        expect(type.fields[0].type).toEqual(FieldType.string());
        expect(type.fields[0].optional).toBe(false);
        expect(type.fields[1].name).toBe('age');
        expect(type.fields[1].type).toEqual(FieldType.int());
        expect(type.fields[1].optional).toBe(false);
      }
    });

    it('marks fields not in required as optional', () => {
      const { type } = schemaToType({
        type: 'object',
        properties: {
          name: { type: 'string' },
          nickname: { type: 'string' },
        },
        required: ['name'],
      });
      if (type.type === 'class') {
        expect(type.fields[0].optional).toBe(false);
        expect(type.fields[1].optional).toBe(true);
      }
    });

    it('preserves field descriptions', () => {
      const { type } = schemaToType({
        type: 'object',
        properties: {
          age: { type: 'integer', description: 'Age in years' },
        },
        required: ['age'],
      });
      if (type.type === 'class') {
        expect(type.fields[0].description).toBe('Age in years');
      }
    });

    it('converts object with no required array (all optional)', () => {
      const { type } = schemaToType({
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'integer' },
        },
      });
      if (type.type === 'class') {
        expect(type.fields.every((f) => f.optional)).toBe(true);
      }
    });

    it('converts object with additionalProperties as map', () => {
      const { type } = schemaToType({
        type: 'object',
        additionalProperties: { type: 'integer' },
      });
      expect(type.type).toBe('map');
      if (type.type === 'map') {
        expect(type.key).toEqual(FieldType.string());
        expect(type.values).toEqual(FieldType.int());
      }
    });
  });

  // -----------------------------------------------------------------------
  // Array / List
  // -----------------------------------------------------------------------

  describe('array / list', () => {
    it('converts array with items', () => {
      const { type } = schemaToType({
        type: 'array',
        items: { type: 'string' },
      });
      expect(type).toEqual(FieldType.list(FieldType.string()));
    });

    it('converts array of objects', () => {
      const { type } = schemaToType({
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'integer' } },
          required: ['id'],
        },
      });
      expect(type.type).toBe('list');
      if (type.type === 'list') {
        expect(type.items.type).toBe('class');
      }
    });

    it('converts array without items as list of strings', () => {
      const { type } = schemaToType({ type: 'array' });
      expect(type).toEqual(FieldType.list(FieldType.string()));
    });
  });

  // -----------------------------------------------------------------------
  // Type array (e.g. ["string", "null"])
  // -----------------------------------------------------------------------

  describe('type array', () => {
    it('converts ["string", "null"] to optional string', () => {
      const { type } = schemaToType({ type: ['string', 'null'] });
      expect(type).toEqual(FieldType.optional(FieldType.string()));
    });

    it('converts ["integer", "string"] to union', () => {
      const { type } = schemaToType({ type: ['integer', 'string'] });
      expect(type.type).toBe('union');
      if (type.type === 'union') {
        expect(type.options).toHaveLength(2);
        expect(type.options[0]).toEqual(FieldType.int());
        expect(type.options[1]).toEqual(FieldType.string());
      }
    });

    it('converts single-element type array', () => {
      const { type } = schemaToType({ type: ['boolean'] });
      expect(type).toEqual(FieldType.bool());
    });
  });

  // -----------------------------------------------------------------------
  // anyOf / oneOf (Union)
  // -----------------------------------------------------------------------

  describe('anyOf / oneOf', () => {
    it('converts anyOf to union', () => {
      const { type } = schemaToType({
        anyOf: [{ type: 'string' }, { type: 'integer' }],
      });
      expect(type.type).toBe('union');
      if (type.type === 'union') {
        expect(type.options).toEqual([FieldType.string(), FieldType.int()]);
      }
    });

    it('converts oneOf to union', () => {
      const { type } = schemaToType({
        oneOf: [{ type: 'boolean' }, { type: 'number' }],
      });
      expect(type.type).toBe('union');
      if (type.type === 'union') {
        expect(type.options).toEqual([FieldType.bool(), FieldType.float()]);
      }
    });

    it('converts anyOf with null as optional', () => {
      const { type } = schemaToType({
        anyOf: [{ type: 'string' }, { type: 'null' }],
      });
      expect(type).toEqual(FieldType.optional(FieldType.string()));
    });

    it('unwraps single-option anyOf', () => {
      const { type } = schemaToType({
        anyOf: [{ type: 'string' }],
      });
      expect(type).toEqual(FieldType.string());
    });
  });

  // -----------------------------------------------------------------------
  // $ref
  // -----------------------------------------------------------------------

  describe('$ref', () => {
    it('resolves $ref to $defs', () => {
      const { type, definitions } = schemaToType({
        $ref: '#/$defs/User',
        $defs: {
          User: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
      });
      expect(type.type).toBe('class');
      if (type.type === 'class') {
        expect(type.name).toBe('User');
        expect(type.fields[0].name).toBe('name');
      }
      expect(definitions.has('User')).toBe(true);
    });

    it('resolves $ref to definitions (draft-07)', () => {
      const { type } = schemaToType({
        $ref: '#/definitions/Item',
        definitions: {
          Item: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
        },
      });
      expect(type.type).toBe('class');
    });

    it('handles nested $ref', () => {
      const { type } = schemaToType({
        type: 'object',
        properties: {
          address: { $ref: '#/$defs/Address' },
        },
        required: ['address'],
        $defs: {
          Address: {
            type: 'object',
            properties: { city: { type: 'string' } },
            required: ['city'],
          },
        },
      });
      if (type.type === 'class') {
        const addressField = type.fields[0];
        expect(addressField.type.type).toBe('class');
        if (addressField.type.type === 'class') {
          expect(addressField.type.name).toBe('Address');
        }
      }
    });

    it('handles recursive $ref without infinite loop', () => {
      const { type, definitions } = schemaToType({
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

      // The root should resolve to a class.
      expect(type.type).toBe('class');
      if (type.type === 'class') {
        expect(type.name).toBe('TreeNode');
        // children field should contain a list of recursive refs
        const childrenField = type.fields.find((f) => f.name === 'children');
        expect(childrenField).toBeDefined();
        if (childrenField && childrenField.type.type === 'list') {
          expect(childrenField.type.items.type).toBe('recursive-ref');
          if (childrenField.type.items.type === 'recursive-ref') {
            expect(childrenField.type.items.name).toBe('TreeNode');
          }
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // Inferred structure (no explicit type)
  // -----------------------------------------------------------------------

  describe('inferred structure', () => {
    it('infers object from properties without type', () => {
      const { type } = schemaToType({
        properties: {
          x: { type: 'number' },
        },
        required: ['x'],
      });
      expect(type.type).toBe('class');
    });

    it('infers array from items without type', () => {
      const { type } = schemaToType({
        items: { type: 'string' },
      });
      expect(type).toEqual(FieldType.list(FieldType.string()));
    });

    it('infers map from additionalProperties without type', () => {
      const { type } = schemaToType({
        additionalProperties: { type: 'boolean' },
      });
      expect(type.type).toBe('map');
    });

    it('falls back to string for empty schema', () => {
      const { type } = schemaToType({});
      expect(type).toEqual(FieldType.string());
    });
  });

  // -----------------------------------------------------------------------
  // Root naming
  // -----------------------------------------------------------------------

  describe('root naming', () => {
    it('uses default root name', () => {
      const { type } = schemaToType({
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a'],
      });
      if (type.type === 'class') {
        expect(type.name).toBe('Root');
      }
    });

    it('uses custom root name', () => {
      const { type } = schemaToType(
        {
          type: 'object',
          properties: { a: { type: 'string' } },
          required: ['a'],
        },
        { rootName: 'MyResponse' },
      );
      if (type.type === 'class') {
        expect(type.name).toBe('MyResponse');
      }
    });
  });
});
