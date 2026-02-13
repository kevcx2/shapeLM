# Port Plan: BAML Structured Output Validation → TypeScript Library

## Input Contract
- Uses **JSON Schema** (draft 2020-12 / draft-07 compatible) as the type definition format
- No dependency on BAML's custom `.baml` language

## Output Contract
1. `renderOutputFormat(schema): string` — prompt snippet for LLMs
2. `coerceToSchema(text, schema): Result` — parse + validate LLM text against schema

---

## Phase 1: Project Scaffolding + Core Types

**Create**: `/port/` directory with TypeScript project structure.

**Deliverables**:
- `package.json`, `tsconfig.json`, test runner config (vitest)
- `src/types.ts` — Internal type representation (`FieldType` enum, analogous to BAML's `TypeIR`):
  - `string`, `int`, `float`, `bool`, `null` primitives
  - `enum` with name + values (each with optional description/alias)
  - `class` with name + fields (each with name, type, optional flag, description)
  - `list(innerType)`
  - `map(keyType, valueType)`
  - `union(options[])`
  - `literal(string | int | bool)`
  - `optional(innerType)` — sugar for `union(innerType, null)`
- `src/values.ts` — The intermediate `JsonishValue` type (analogous to BAML's `jsonish::Value`):
  - `String`, `Number`, `Boolean`, `Null`, `Object`, `Array`
  - `Markdown(tag, inner)`, `FixedJson(inner, fixes[])`, `AnyOf(candidates[], rawString)`
- `src/flags.ts` — `Flag` enum + `score()` function for each flag
- `src/result.ts` — Public result types for the coercion output

**Verifiable**: `npm test` passes. Types compile. Score function unit tests pass (flag scores match BAML's values).

---

## Phase 2: JSON Schema → Internal Types

**Deliverables**:
- `src/schema-to-types.ts` — Converts a JSON Schema object to `FieldType`
  - `{"type": "string"}` → `FieldType.string()`
  - `{"type": "integer"}` → `FieldType.int()`
  - `{"type": "number"}` → `FieldType.float()`
  - `{"type": "boolean"}` → `FieldType.bool()`
  - `{"type": "null"}` → `FieldType.null()`
  - `{"type": "object", "properties": {...}, "required": [...]}` → `FieldType.class(...)`
  - `{"type": "array", "items": {...}}` → `FieldType.list(...)`
  - `{"enum": [...]}` → `FieldType.enum(...)`
  - `{"anyOf": [...]}` / `{"oneOf": [...]}` → `FieldType.union(...)`
  - `{"const": value}` → `FieldType.literal(...)`
  - `{"$ref": "#/$defs/Foo"}` → resolved reference
  - `{"type": ["string", "null"]}` → `FieldType.optional(FieldType.string())`
  - `{"additionalProperties": {...}}` → `FieldType.map(string, ...)`
- Handle `$defs` / `definitions` with cycle detection for recursive types
- `src/__tests__/schema-to-types.test.ts`

**Verifiable**: Unit tests convert ~20 JSON Schema fixtures to internal types and assert structure. Round-trip: schema → types → check properties. Recursive schemas don't infinite-loop.

---

## Phase 3: Output Format Renderer

**Deliverables**:
- `src/output-format.ts` — `renderOutputFormat(schema, options?): string`
  - Converts JSON Schema → internal types → prompt text
  - Handles all type shapes:
    - Primitives: `"Answer as an int"`
    - Enums: `"Answer with any of the categories:\nColor\n----\n- Red\n- Green\n- Blue"`
    - Classes: `"Answer in JSON using this schema:\n{\n  name: string,\n  age: int,\n}"`
    - Arrays: `"Answer with a JSON Array using this schema:\nstring[]"`
    - Unions: `"Answer in JSON using any of these schemas:\n{...} or {...}"`
    - Maps: `"Answer in JSON using this schema:\nmap<string, int>"`
    - Recursive: Hoisted definitions with name references
  - Options: `prefix`, `orSplitter`, `enumValuePrefix`, `alwaysHoistEnums`, `hoistClasses`, `quoteClassFields`
- `src/__tests__/output-format.test.ts`

**Verifiable**: Snapshot tests for ~15 type shapes. Each test asserts exact string output. Tests cover: primitives, enums (inline + hoisted), classes (with descriptions, nested, single-field), arrays (simple + nested), unions (2-way, 3-way, optional), maps, recursive types, literal types.

---

## Phase 4: Jsonish Structural Parser — Core

**Deliverables**:
- `src/parser/parse.ts` — Main `parse(text, options, isDone): JsonishValue` entry point
  - Stage 1: `JSON.parse()` attempt → wrap in `AnyOf`
  - Stage 2: Markdown code block extraction (regex-based)
  - Stage 3: Multi-JSON object extraction (balanced delimiter scanning)
  - Stage 5: Raw string fallback
  - Cascading fallback with `ParseOptions` controlling which stages run
- `src/parser/markdown-parser.ts` — Extract ```json blocks
- `src/parser/multi-json-parser.ts` — Find embedded `{...}` / `[...]`
- `src/__tests__/parser-core.test.ts`

**Verifiable**: Tests for: valid JSON, JSON in markdown, JSON in prose, multiple JSON objects, raw string fallback. Each test asserts the shape of the `JsonishValue` tree.

---

## Phase 5: Fixing Parser (State Machine)

**Deliverables**:
- `src/parser/fixing-parser.ts` — Character-by-character JSON repair
  - Collection types: `Object`, `Array`, `QuotedString`, `SingleQuotedString`, `TripleQuotedString`, `BacktickString`, `TripleBacktickString`, `UnquotedString`, `TrailingComment`, `BlockComment`
  - Handles: unquoted strings, single-quoted strings, unterminated structures (close them), trailing/leading commas, `//` and `/* */` comments, bad escape sequences, unquoted object keys
  - Context-aware string termination (knows if in object key vs. value vs. array)
  - Smart quote closing (look-ahead to decide if `"` ends the string)
- Wire into `parse.ts` as Stage 4
- `src/__tests__/fixing-parser.test.ts`

**Verifiable**: ~30 tests for malformed JSON inputs. Each test provides broken input + expected repaired `JsonishValue`. Tests cover: trailing commas, missing quotes, single quotes, unterminated objects/arrays/strings, comments, mixed prose+JSON, triple backtick blocks.

---

## Phase 6: Primitive Type Coercion

**Deliverables**:
- `src/coercer/coerce-primitive.ts`
  - `coerceString(ctx, target, value)` — any value → string (via toString). AnyOf → prefer String variant
  - `coerceInt(ctx, target, value)` — number → int, string → parse int, float → round, fraction → divide+round, currency → strip+parse
  - `coerceFloat(ctx, target, value)` — number → float, string → parse, fraction → divide, currency → strip+parse
  - `coerceBool(ctx, target, value)` — boolean pass-through, string → case-insensitive match, fuzzy match
  - `coerceNull(ctx, target, value)` — null/undefined pass-through
- `src/coercer/coerce-literal.ts` — exact value matching for `{"const": ...}`
- Each coercion sets appropriate `Flag`s
- `src/__tests__/coerce-primitive.test.ts`

**Verifiable**: ~40 tests. Covers: string passthrough, int from float (rounds), int from string, int from currency string `"$1,234"`, int from fraction `"3/4"`, float from comma-separated `"1,234.56"`, bool from `"TRUE"` / `"False"`, null coercion, literal matching. Each test asserts both the output value AND the flags set.

---

## Phase 7: Enum Coercion + Fuzzy String Matching

**Deliverables**:
- `src/coercer/match-string.ts` — The 4-stage heuristic matching algorithm:
  1. Exact case-sensitive match
  2. Accent-stripped exact match (Unicode NFKD normalization + ligature expansion)
  3. Punctuation-stripped match
  4. Case-insensitive match
  5. Substring matching with overlap filtering and count-based disambiguation
- `src/coercer/coerce-enum.ts` — Enum variant matching using `matchString`
  - Candidates include: variant name, description, `"name: description"` form
  - Ambiguity detection (multiple variants tie → error)
- `src/__tests__/match-string.test.ts`
- `src/__tests__/coerce-enum.test.ts`

**Verifiable**: ~30 tests. Match-string tests: exact match, accent stripping (`"étude"` → `"etude"`), substring match, ambiguous match detection, punctuation stripping. Enum tests: direct match, description match, substring in prose, case-insensitive, multiple enum values in text.

---

## Phase 8: Object / Class Coercion

**Deliverables**:
- `src/coercer/coerce-class.ts`
  - Field matching via fuzzy key comparison (case-insensitive, punctuation-stripped)
  - Required vs. optional field handling (missing optional → null with flag, missing required → error or default)
  - Extra key handling (recorded as `ExtraKey` flag, not an error)
  - Single-field class: implied key wrapping (bare value → `{fieldName: value}`)
  - Array input → try coercing each element, or try singular extraction
  - Circular reference detection via visited-set in context
- `src/coercer/context.ts` — `ParsingContext` with scope tracking, visited sets, union hints
- `src/__tests__/coerce-class.test.ts`

**Verifiable**: ~25 tests. Covers: exact key match, fuzzy key match (`firstName` vs `first_name`), missing optional field, missing required field, extra keys, single-field class with bare value, nested classes, recursive class (cycle detection), array of objects.

---

## Phase 9: Composite Type Coercion (Arrays, Unions, Maps)

**Deliverables**:
- `src/coercer/coerce-array.ts`
  - Array input → coerce each element
  - Non-array input → wrap in array (`SingleToArray` flag)
  - Error accumulation per element (`ArrayItemParseError` flag)
  - Union variant hint propagation between elements
- `src/coercer/coerce-union.ts`
  - `tryCast` all variants, short-circuit on score-0 match
  - `coerce` all variants, pick best by score
  - Union variant hint optimization for arrays of unions
- `src/coercer/coerce-map.ts`
  - Object → map with key/value coercion
- `src/coercer/pick-best.ts` — The multi-criteria sorting algorithm:
  - Prefer non-SingleToArray lists
  - Prefer non-default classes over all-default classes
  - Prefer composite types over JsonToString'd primitives
  - Tie-break by score, then position
- `src/__tests__/coerce-composite.test.ts`

**Verifiable**: ~30 tests. Array: array passthrough, single-to-array, element parse errors. Union: exact match wins, score-based disambiguation, optional (T|null), multi-type union, nested union. Map: object-to-map, key coercion. Pick-best: verify sorting for various flag combinations.

---

## Phase 10: Integration + Public API

**Deliverables**:
- `src/coercer/coerce.ts` — Main coercion dispatcher (equivalent to `TypeCoercer` impl on `TypeIR`):
  - Handles `AnyOf` values: string-like targets use raw string, structural targets try each candidate
  - Handles `Markdown` values: unwrap and recurse
  - Handles `FixedJson` values: unwrap and recurse with fix flags
  - Dispatches to appropriate sub-coercer by target type
  - Runs `tryCast` first for early exit, falls back to `coerce`
- `src/index.ts` — Public API:
  ```ts
  function renderOutputFormat(schema: JSONSchema, options?: RenderOptions): string
  function coerceToSchema(text: string, schema: JSONSchema): CoercionResult
  ```
- `src/result.ts` — `CoercionResult`:
  ```ts
  type CoercionResult = {
    value: unknown;         // The coerced JS value
    success: boolean;
    score: number;          // 0 = perfect, higher = more coercion needed
    flags: Flag[];          // Every transformation applied
    errors: ParseError[];   // Errors encountered (may still succeed)
  }
  ```
- `src/__tests__/integration.test.ts`

**Verifiable**: ~20 end-to-end tests. Raw JSON → schema → value. Markdown-wrapped JSON. Malformed JSON. Enum in prose. Nested objects with type coercion. Union disambiguation. Full error case.

---

## Phase 11: Comprehensive Edge-Case Test Suite

**Deliverables**:
- `src/__tests__/edge-cases.test.ts` — Exhaustive test coverage organized by category:

**Category: JSON Extraction**
- JSON in markdown with language tag
- JSON in markdown without language tag
- Multiple JSON blocks in markdown
- JSON embedded in prose paragraphs
- JSON with surrounding explanation
- JSON with trailing comma
- JSON with comments (// and /* */)
- JSON with single-quoted strings
- JSON with unquoted keys
- JSON with unterminated string/object/array

**Category: Type Coercion**
- String "42" → int 42
- String "3.14" → float 3.14
- String "$1,234.56" → float 1234.56
- String "3/4" → int 1 (rounded), float 0.75
- String "true" → bool true (case variants)
- Number 42 → string "42"
- Float 3.0 → int 3
- Single value → array wrapping
- Bare value → single-field class wrapping
- Object with wrong-case keys → class with correct fields

**Category: Enum Matching**
- Exact match
- Case-insensitive match
- Substring in prose: "I think the answer is POSITIVE"
- Accented characters: "café" matching "cafe"
- Description match
- Ambiguous multiple matches → error
- Enum value with punctuation

**Category: Union Disambiguation**
- `int | string`: `42` → int, `"hello"` → string
- `ClassA | ClassB`: object matches one by fields
- `string | ClassA`: bare string vs. JSON object
- `int | null`: `null` → null, `5` → int
- Nested union: `(A | B)[]` with mixed elements

**Category: Recursive Types**
- Self-referential class (tree node)
- Recursive type alias
- Deeply nested recursive structure

**Category: Real-World LLM Outputs**
- GPT-style: `"```json\n{...}\n```"`
- Claude-style: prose then JSON
- LLM that wraps in explanation: `"Here is the result:\n{...}\nI hope this helps!"`
- LLM that returns bare enum: `"POSITIVE"`
- LLM that returns number as string: `"42"`
- LLM that uses single quotes: `{'name': 'Alice'}`
- LLM that forgets closing brace: `{"name": "Alice"`
- LLM that adds comments: `{"name": "Alice" // the user's name}`
- LLM that double-wraps in markdown

**Verifiable**: Every test has explicit expected output (value + success + score range + key flags). Aim for 100+ test cases total across the suite.

---

## Dependency Order

```
Phase 1 ──► Phase 2 ──► Phase 3
                │
                ▼
Phase 4 ──► Phase 5
                │
                ▼
Phase 6 ──► Phase 7 ──► Phase 8 ──► Phase 9
                                        │
                                        ▼
                                   Phase 10 ──► Phase 11
```

Phases 3 and 4-5 are independent tracks (output format vs. parsing) that converge at Phase 10.
