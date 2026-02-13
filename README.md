# shapeLM

Parse and validate arbitrary LLM text into structured, typed data using JSON Schema. LLM providers have subtle differences in their native structured output implementations that are a pain to work around, and may have schema size limits.

ShapeLM works with any LLM and any calling convention.

## Requirements

- **Node.js** 18+
- **TypeScript** 5.0+ (recommended; plain JS works too)
- **Zod** 4.0+ (optional — only needed if you pass Zod schemas)

## Installation

```bash
npm install structured-output-coercer
```

If you want to use Zod schemas directly:

```bash
npm install structured-output-coercer zod
```

## Quick start

```typescript
import { shape, prompt } from 'structured-output-coercer';

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age:  { type: 'integer' },
  },
  required: ['name', 'age'],
};

// 1. Generate a format instruction for your LLM prompt
const fmt = prompt(schema);
// => Answer in JSON using this schema:\n{\n  "name": string,\n  "age": int\n}

// 2. Call your LLM however you like, then parse the response
const result = shape(schema, llmResponseText);

if (result.ok) {
  console.log(result.data); // { name: "Ada Lovelace", age: 36 }
} else {
  console.log(result.errors);
}
```

Handles all of these out of the box:

```
{"name": "Ada", "age": 36}              ✓  clean JSON
```json\n{"name": "Ada", "age": 36}\n```  ✓  markdown fenced
Sure! Here's the info: {"name":"Ada"}    ✓  JSON buried in prose
{name: 'Ada', age: 36,}                 ✓  unquoted keys, trailing comma
"Ada"                                    ✓  bare string for string schema
```

## Core concepts

### Pipeline

Every call flows through five stages:

1. **Parse** — Extract JSON-like structure from raw text (handles markdown, embedded objects, malformed JSON, bare strings)
2. **Coerce** — Transform the parsed value to match the target type (string-to-int, single-to-array, fuzzy enum matching, etc.)
3. **Score** — Each transformation incurs a penalty. Lower score = better match. Score 0 means a perfect parse with no coercion.
4. **Validate** — Check JSON Schema constraints (min/max, pattern, format) and custom rules
5. **Return** — A `ShapedResult<T>` with `.ok`, `.data`, `.errors`, `.score`, and more

### Schema input

Every API function accepts either a **JSON Schema** object or a **Zod schema** (v4+). Zod schemas are auto-detected and converted to JSON Schema internally.

```typescript
// JSON Schema
shape({ type: 'string', enum: ['A', 'B'] }, text);

// Zod (identical behavior)
import { z } from 'zod';
shape(z.enum(['A', 'B']), text);
```

### ShapedResult\<T\>

Every parse returns a `ShapedResult<T>`:

| Property     | Type              | Description                                        |
|-------------|-------------------|----------------------------------------------------|
| `ok`        | `boolean`         | `true` if parsing, coercion, and validation passed |
| `data`      | `T \| undefined`  | The coerced value (defined when coercion succeeds)  |
| `errors`    | `string[]`        | Error messages (empty when `ok` is true)           |
| `score`     | `number`          | Quality score — 0 is perfect, higher means more coercion was needed |
| `coercions` | `Coercion[]`      | Type transformations applied (e.g. string to int)  |
| `repairs`   | `Repair[]`        | Structural fixes applied (e.g. JSON repair)        |
| `flags`     | `Flag[]`          | Raw flags from the coercion engine                 |
| `raw`       | `string`          | The original LLM text                              |

Methods:

| Method       | Returns             | Description                                                 |
|-------------|---------------------|-------------------------------------------------------------|
| `assert()`  | `T`                 | Returns `data` or throws `ShapedResultError`               |
| `feedback()`| `string \| undefined` | LLM-readable error description for retry loops            |

### Streaming

`StreamShaper` parses incrementally as tokens arrive. Each `.feed(chunk)` re-parses the accumulated text and returns the best partial result so far.

```typescript
const s = stream(schema);

for await (const chunk of llmStream) {
  const { partial } = s.feed(chunk);
  console.log(partial); // progressively more complete
}

const result = s.close(); // final ShapedResult<T>
```

Constraints and custom rules only run on `.close()`. During streaming, `.partial` is `DeepPartial<T>` — all fields are recursively optional.

### Feedback loop

When validation fails, `.feedback()` returns a message you can send back to the LLM to self-correct:

```typescript
const messages = [
  { role: 'system', content: `You are a helpful assistant. ${p.prompt()}` },
  { role: 'user', content: 'Extract person info from: ...' },
];

for (let attempt = 0; attempt < 3; attempt++) {
  const raw = await callLLM(messages);
  const result = p.shape(raw);

  if (result.ok) return result.data;

  const fb = result.feedback();
  messages.push({ role: 'assistant', content: raw });
  messages.push({ role: 'user', content: fb });
}
```

The feedback includes errors, coercions applied, and a format reminder.

## API

### shape(schema, text, options?)

One-shot parse. Converts schema, parses text, coerces, validates, returns `ShapedResult<T>`.

```typescript
function shape<T = unknown>(
  schema: SchemaInput,
  text: string,
  options?: ShapeOptions,
): ShapedResult<T>
```

### prompt(schema, options?)

Render a human-readable output format instruction from a schema. Include this in your LLM prompt to tell it what structure to output.

```typescript
function prompt(
  schema: SchemaInput,
  options?: RenderOptions,
): string
```

### stream(schema, options?)

Create a `StreamShaper` for incremental parsing.

```typescript
function stream<T = unknown>(
  schema: SchemaInput,
  options?: ShaperOptions,
): StreamShaper<T>
```

#### StreamShaper\<T\>

| Method      | Returns          | Description                              |
|------------|------------------|------------------------------------------|
| `feed(chunk)` | `StreamResult<T>` | Feed a text chunk, get partial result  |
| `current()`   | `StreamResult<T>` | Get current result without new data    |
| `text()`      | `string`          | Get accumulated raw text               |
| `close()`     | `ShapedResult<T>` | Finalize, validate, return full result |

`StreamResult<T>` has: `partial: DeepPartial<T> | undefined`, `hasData: boolean`, `raw: string`, `score: number`, `flags: Flag[]`.

### Options

#### ShapeOptions

```typescript
interface ShapeOptions {
  parse?: ParseOptions;
  schema?: { rootName?: string };
  render?: RenderOptions;
  rules?: ValidationRule[];
  validateConstraints?: boolean; // default: true
}
```

#### ParseOptions

```typescript
interface ParseOptions {
  allowMarkdown?: boolean;       // default: true — extract from ```json blocks
  findAllJsonObjects?: boolean;  // default: true — find {…} / […] in prose
  allowFixes?: boolean;          // default: true — repair malformed JSON
  allowAsString?: boolean;       // default: true — fall back to raw string
}
```

#### RenderOptions

```typescript
interface RenderOptions {
  prefix?: string | null;          // custom prefix (null = no prefix)
  orSplitter?: string;             // default: " or "
  enumValuePrefix?: string;        // default: "- "
  alwaysHoistEnums?: boolean;      // default: false
  hoistClasses?: boolean | 'auto'; // default: "auto"
  quoteClassFields?: boolean;      // default: false
  mapStyle?: 'angle' | 'object';   // default: "angle"
  rootName?: string;               // default: "Root"
}
```

#### ValidationRule

```typescript
type ValidationRule<T = unknown> = (value: T) => true | string | undefined | null;
// Return true (or undefined/null) to pass. Return a string to fail with that message.
```

### Constraint validation

JSON Schema constraints are validated automatically after coercion:

- **Numbers**: `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`
- **Strings**: `minLength`, `maxLength`, `pattern`, `format` (email, date, date-time, time, uri, uuid, ipv4, ipv6)
- **Arrays**: `minItems`, `maxItems`
- **Objects**: `minProperties`, `maxProperties`

Disable with `{ validateConstraints: false }`.

### Coercion behavior

shapeLM applies these transformations when the raw value doesn't exactly match the target type:

| Coercion | Example | Score |
|----------|---------|-------|
| Markdown extraction | `` ```json {...} ``` `` → `{...}` | 5 |
| JSON repair | `{name: 'Ada',}` → `{"name":"Ada"}` | 10 |
| String → int | `"42"` → `42` | 1 |
| String → float | `"3.14"` → `3.14` | 1 |
| String → bool | `"true"` → `true` | 1 |
| Float → int | `3.0` → `3` | 1 |
| Single → array | `{...}` → `[{...}]` | 1 |
| Case-insensitive enum | `"positive"` → `"POSITIVE"` | 1 |
| Substring enum match | `"The answer is POSITIVE"` → `"POSITIVE"` | 2 |
| Implied object key | `"value"` → `{"key": "value"}` (single-field class) | 2 |
| JSON → string | `{...}` → `"{...}"` | 2 |
| Missing optional → null | (absent) → `null` | 0 |
| Missing required → default | (absent) → default | 100 |

Lower total score = better match. Used internally for union disambiguation (best-scoring variant wins).

## shaper(schema, options?)

Factory function. Pre-compiles the schema once, then exposes `.shape()`, `.prompt()`, and `.stream()` without re-compiling on each call. Use this when you'll parse multiple LLM responses against the same schema.

```typescript
function shaper<T = unknown>(
  schema: SchemaInput,
  options?: ShaperOptions,
): Shaper<T>

interface Shaper<T = unknown> {
  shape(text: string): ShapedResult<T>;
  prompt(): string;
  stream(options?: StreamShaperOptions): StreamShaper<T>;
  schema: Record<string, unknown>;
}
```

Example:

```typescript
import { shaper } from 'structured-output-coercer';
import { z } from 'zod';

const MovieReview = z.object({
  title:     z.string().min(1),
  rating:    z.number().min(1).max(10),
  pros:      z.array(z.string()),
  cons:      z.array(z.string()),
  recommend: z.boolean(),
});

type MovieReview = z.infer<typeof MovieReview>;

const p = shaper<MovieReview>(MovieReview, {
  rules: [
    (v) => v.pros.length > 0 ? true : 'Must list at least one pro',
  ],
});

// Use in your LLM prompt
const systemPrompt = `You are a film critic. ${p.prompt()}`;

// Parse responses (schema is already compiled)
const r1 = p.shape(response1);
const r2 = p.shape(response2);

// Stream
const s = p.stream();
for await (const chunk of llmStream) {
  s.feed(chunk);
}
const final = s.close();
```

## License

MIT

