#!/usr/bin/env npx tsx
/**
 * Comprehensive performance benchmark for the structuring library.
 *
 * Measures: schema compilation, parsing, coercion, constraint validation,
 * streaming, and end-to-end throughput under realistic conditions.
 *
 * Run:  npx tsx perf-bench.ts
 */

import { shape, shaper, prompt, stream } from './src/index.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bench(name: string, fn: () => void, iterations: number): {
  name: string;
  iterations: number;
  totalMs: number;
  avgUs: number;
  opsPerSec: number;
  p50Us: number;
  p99Us: number;
} {
  // Warmup
  for (let i = 0; i < Math.min(iterations, 100); i++) fn();

  // Collect individual timings
  const timings: number[] = [];
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    timings.push((performance.now() - t0) * 1000); // µs
  }
  const totalMs = performance.now() - start;

  timings.sort((a, b) => a - b);
  return {
    name,
    iterations,
    totalMs,
    avgUs: (totalMs * 1000) / iterations,
    opsPerSec: Math.round(iterations / (totalMs / 1000)),
    p50Us: timings[Math.floor(timings.length * 0.5)],
    p99Us: timings[Math.floor(timings.length * 0.99)],
  };
}

function formatResult(r: ReturnType<typeof bench>): string {
  const avg = r.avgUs < 1000 ? `${r.avgUs.toFixed(1)}µs` : `${(r.avgUs / 1000).toFixed(2)}ms`;
  const p50 = r.p50Us < 1000 ? `${r.p50Us.toFixed(1)}µs` : `${(r.p50Us / 1000).toFixed(2)}ms`;
  const p99 = r.p99Us < 1000 ? `${r.p99Us.toFixed(1)}µs` : `${(r.p99Us / 1000).toFixed(2)}ms`;
  const ops = r.opsPerSec > 1000
    ? `${(r.opsPerSec / 1000).toFixed(1)}k`
    : `${r.opsPerSec}`;
  return `  ${r.name.padEnd(50)} avg: ${avg.padEnd(10)} p50: ${p50.padEnd(10)} p99: ${p99.padEnd(10)} ${ops.padStart(7)} ops/s`;
}

function hr(title: string) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(70)}`);
}

// ---------------------------------------------------------------------------
// Test schemas (range of complexity)
// ---------------------------------------------------------------------------

const SIMPLE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' },
  },
  required: ['name', 'age'],
};

const MEDIUM_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1 },
    rating: { type: 'number', minimum: 1, maximum: 10 },
    tags: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
    author: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        verified: { type: 'boolean' },
      },
      required: ['name'],
    },
  },
  required: ['title', 'rating', 'tags', 'author'],
};

const COMPLEX_SCHEMA = {
  type: 'object',
  properties: {
    dish: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'string' },
          unit: { type: 'string', enum: ['cups', 'tbsp', 'tsp', 'oz', 'g', 'ml', 'pieces'] },
          optional: { type: 'boolean' },
        },
        required: ['name', 'amount', 'unit'],
      },
      minItems: 3,
    },
    steps: { type: 'array', items: { type: 'string' }, minItems: 3 },
    prep_time_minutes: { type: 'integer', minimum: 1 },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    nutrition: {
      type: 'object',
      properties: {
        calories: { type: 'integer', minimum: 0 },
        protein_g: { type: 'number', minimum: 0 },
        fat_g: { type: 'number', minimum: 0 },
        carbs_g: { type: 'number', minimum: 0 },
      },
      required: ['calories'],
    },
  },
  required: ['dish', 'ingredients', 'steps', 'prep_time_minutes', 'difficulty'],
};

const UNION_SCHEMA = {
  type: 'object',
  properties: {
    result: {
      anyOf: [
        {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'success' },
            data: { type: 'string' },
          },
          required: ['type', 'data'],
        },
        {
          type: 'object',
          properties: {
            type: { type: 'string', const: 'error' },
            message: { type: 'string' },
            code: { type: 'integer' },
          },
          required: ['type', 'message', 'code'],
        },
      ],
    },
  },
  required: ['result'],
};

const ENUM_SCHEMA = {
  type: 'string',
  enum: ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED', 'STRONGLY_POSITIVE', 'STRONGLY_NEGATIVE'],
};

// Zod schema equivalent of MEDIUM_SCHEMA
const ZOD_MEDIUM = z.object({
  title: z.string().min(1),
  rating: z.number().min(1).max(10),
  tags: z.array(z.string()).min(1).max(10),
  author: z.object({
    name: z.string(),
    verified: z.boolean().optional(),
  }),
});

// ---------------------------------------------------------------------------
// Test inputs (realistic LLM output)
// ---------------------------------------------------------------------------

const SIMPLE_PERFECT_JSON = '{"name": "Marie Curie", "age": 66}';
const SIMPLE_MARKDOWN_JSON = '```json\n{"name": "Marie Curie", "age": 66}\n```';
const SIMPLE_PROSE_JSON = 'Here is the information:\n\n{"name": "Marie Curie", "age": 66}\n\nShe was a physicist.';
const SIMPLE_MALFORMED_JSON = '{name: "Marie Curie", age: 66}';

const MEDIUM_PERFECT_JSON = JSON.stringify({
  title: "Interstellar",
  rating: 9.2,
  tags: ["sci-fi", "space", "time-travel"],
  author: { name: "Christopher Nolan", verified: true },
});

const COMPLEX_PERFECT_JSON = JSON.stringify({
  dish: "Pancakes",
  ingredients: [
    { name: "flour", amount: "2", unit: "cups", optional: false },
    { name: "sugar", amount: "2", unit: "tbsp", optional: false },
    { name: "baking powder", amount: "2", unit: "tsp", optional: false },
    { name: "salt", amount: "0.5", unit: "tsp", optional: false },
    { name: "milk", amount: "1.5", unit: "cups", optional: false },
    { name: "eggs", amount: "2", unit: "pieces", optional: false },
    { name: "butter", amount: "3", unit: "tbsp", optional: false },
    { name: "vanilla", amount: "1", unit: "tsp", optional: true },
  ],
  steps: [
    "Mix dry ingredients in a large bowl.",
    "Whisk wet ingredients separately.",
    "Combine wet and dry, stirring until just mixed.",
    "Heat griddle to 375°F, grease lightly.",
    "Pour 1/4 cup batter per pancake.",
    "Flip when bubbles form on surface.",
    "Cook until golden brown on both sides.",
  ],
  prep_time_minutes: 15,
  difficulty: "easy",
  nutrition: { calories: 350, protein_g: 8, fat_g: 12, carbs_g: 48 },
});

const COMPLEX_MARKDOWN_JSON = `Here's a delicious recipe:\n\n\`\`\`json\n${COMPLEX_PERFECT_JSON}\n\`\`\`\n\nEnjoy!`;

const COMPLEX_MALFORMED_JSON = `{
  dish: 'Pancakes',
  ingredients: [
    {name: "flour", amount: "2", unit: "cups"},
    {name: "sugar", amount: "2", unit: "tbsp"},
    {name: "baking powder", amount: "2", unit: "tsp"},
  ],
  steps: [
    "Mix dry ingredients",
    "Add wet ingredients",
    "Cook on griddle",
  ],
  prep_time_minutes: 15,
  difficulty: "easy"
}`;

const UNION_JSON = '{"result": {"type": "success", "data": "Operation completed"}}';
const ENUM_PERFECT = '"POSITIVE"';
const ENUM_FUZZY = 'The sentiment is positive';

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

function runBenchmarks() {
  const N_FAST = 10_000;    // For fast operations
  const N_MEDIUM = 5_000;   // For moderate operations
  const N_SLOW = 2_000;     // For slower operations
  const N_STREAM = 1_000;   // For streaming simulations
  const results: ReturnType<typeof bench>[] = [];

  // ==========================================================================
  // 1. Schema compilation (shaper factory)
  // ==========================================================================
  hr('1. Schema Compilation (shaper factory)');

  results.push(bench('compile simple schema (2 fields)', () => {
    shaper(SIMPLE_SCHEMA);
  }, N_FAST));

  results.push(bench('compile medium schema (4 fields, nested)', () => {
    shaper(MEDIUM_SCHEMA);
  }, N_FAST));

  results.push(bench('compile complex schema (6 fields, arrays)', () => {
    shaper(COMPLEX_SCHEMA);
  }, N_MEDIUM));

  results.push(bench('compile union schema (anyOf)', () => {
    shaper(UNION_SCHEMA);
  }, N_FAST));

  results.push(bench('compile Zod schema (medium, with conversion)', () => {
    shaper(ZOD_MEDIUM as any);
  }, N_MEDIUM));

  for (const r of results.slice(-5)) console.log(formatResult(r));

  // ==========================================================================
  // 2. Prompt rendering
  // ==========================================================================
  hr('2. Prompt Rendering');

  const simpleShaper = shaper(SIMPLE_SCHEMA);
  const medShaper = shaper(MEDIUM_SCHEMA);
  const complexShaper = shaper(COMPLEX_SCHEMA);

  results.push(bench('render simple prompt', () => {
    simpleShaper.prompt();
  }, N_FAST));

  results.push(bench('render medium prompt', () => {
    medShaper.prompt();
  }, N_FAST));

  results.push(bench('render complex prompt', () => {
    complexShaper.prompt();
  }, N_FAST));

  for (const r of results.slice(-3)) console.log(formatResult(r));

  // ==========================================================================
  // 3. One-shot parsing (shape) — various input formats
  // ==========================================================================
  hr('3. One-Shot Parsing — Simple Schema');

  results.push(bench('simple: perfect JSON', () => {
    shape(SIMPLE_SCHEMA, SIMPLE_PERFECT_JSON);
  }, N_FAST));

  results.push(bench('simple: markdown-wrapped JSON', () => {
    shape(SIMPLE_SCHEMA, SIMPLE_MARKDOWN_JSON);
  }, N_FAST));

  results.push(bench('simple: JSON in prose', () => {
    shape(SIMPLE_SCHEMA, SIMPLE_PROSE_JSON);
  }, N_FAST));

  results.push(bench('simple: malformed JSON (fixing parser)', () => {
    shape(SIMPLE_SCHEMA, SIMPLE_MALFORMED_JSON);
  }, N_FAST));

  for (const r of results.slice(-4)) console.log(formatResult(r));

  // ==========================================================================
  // 4. One-shot parsing — complex schemas
  // ==========================================================================
  hr('4. One-Shot Parsing — Complex Schemas');

  results.push(bench('medium: perfect JSON (4 fields)', () => {
    shape(MEDIUM_SCHEMA, MEDIUM_PERFECT_JSON);
  }, N_FAST));

  results.push(bench('complex: perfect JSON (8 ingredients)', () => {
    shape(COMPLEX_SCHEMA, COMPLEX_PERFECT_JSON);
  }, N_MEDIUM));

  results.push(bench('complex: markdown-wrapped', () => {
    shape(COMPLEX_SCHEMA, COMPLEX_MARKDOWN_JSON);
  }, N_MEDIUM));

  results.push(bench('complex: malformed JSON (fixing parser)', () => {
    shape(COMPLEX_SCHEMA, COMPLEX_MALFORMED_JSON);
  }, N_MEDIUM));

  results.push(bench('union: perfect JSON (anyOf dispatch)', () => {
    shape(UNION_SCHEMA, UNION_JSON);
  }, N_FAST));

  results.push(bench('enum: perfect (quoted string)', () => {
    shape(ENUM_SCHEMA, ENUM_PERFECT);
  }, N_FAST));

  results.push(bench('enum: fuzzy (substring match from prose)', () => {
    shape(ENUM_SCHEMA, ENUM_FUZZY);
  }, N_FAST));

  for (const r of results.slice(-7)) console.log(formatResult(r));

  // ==========================================================================
  // 5. Pre-compiled vs one-shot
  // ==========================================================================
  hr('5. Pre-compiled shaper.shape() vs one-shot shape()');

  results.push(bench('one-shot shape() medium schema', () => {
    shape(MEDIUM_SCHEMA, MEDIUM_PERFECT_JSON);
  }, N_FAST));

  results.push(bench('pre-compiled shaper.shape() medium schema', () => {
    medShaper.shape(MEDIUM_PERFECT_JSON);
  }, N_FAST));

  results.push(bench('one-shot shape() complex schema', () => {
    shape(COMPLEX_SCHEMA, COMPLEX_PERFECT_JSON);
  }, N_MEDIUM));

  results.push(bench('pre-compiled shaper.shape() complex schema', () => {
    complexShaper.shape(COMPLEX_PERFECT_JSON);
  }, N_MEDIUM));

  for (const r of results.slice(-4)) console.log(formatResult(r));

  // ==========================================================================
  // 6. Constraint validation cost
  // ==========================================================================
  hr('6. Constraint Validation Impact');

  results.push(bench('complex: with constraints (default)', () => {
    shape(COMPLEX_SCHEMA, COMPLEX_PERFECT_JSON);
  }, N_MEDIUM));

  results.push(bench('complex: without constraints', () => {
    shape(COMPLEX_SCHEMA, COMPLEX_PERFECT_JSON, { validateConstraints: false });
  }, N_MEDIUM));

  results.push(bench('complex: with custom rules', () => {
    shape(COMPLEX_SCHEMA, COMPLEX_PERFECT_JSON, {
      rules: [
        (v: any) => v.ingredients.length >= 3 ? true : 'Need 3+ ingredients',
        (v: any) => v.steps.length >= 3 ? true : 'Need 3+ steps',
        (v: any) => v.prep_time_minutes > 0 ? true : 'Prep time must be positive',
      ],
    });
  }, N_MEDIUM));

  for (const r of results.slice(-3)) console.log(formatResult(r));

  // ==========================================================================
  // 7. Streaming simulation
  // ==========================================================================
  hr('7. Streaming Simulation');

  // Simulate token-by-token streaming of the complex recipe JSON
  const complexTokens = simulateTokenStream(COMPLEX_PERFECT_JSON, 5); // ~5 chars per token

  results.push(bench(`streaming: complex recipe (${complexTokens.length} tokens)`, () => {
    const s = complexShaper.stream();
    for (const token of complexTokens) {
      s.feed(token);
    }
    s.close();
  }, N_STREAM));

  // Per-token cost
  {
    const s = complexShaper.stream();
    const tokenTimings: number[] = [];
    for (const token of complexTokens) {
      const t0 = performance.now();
      s.feed(token);
      tokenTimings.push((performance.now() - t0) * 1000);
    }
    s.close();
    tokenTimings.sort((a, b) => a - b);
    const avgTokenUs = tokenTimings.reduce((a, b) => a + b, 0) / tokenTimings.length;
    const p50 = tokenTimings[Math.floor(tokenTimings.length * 0.5)];
    const p99 = tokenTimings[Math.floor(tokenTimings.length * 0.99)];
    console.log(`  Per-token feed() cost (${complexTokens.length} tokens):`);
    console.log(`    avg: ${avgTokenUs.toFixed(1)}µs  p50: ${p50.toFixed(1)}µs  p99: ${p99.toFixed(1)}µs`);

    // Show early vs late token cost
    const earlyAvg = tokenTimings.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    const lateAvg = tokenTimings.slice(-10).reduce((a, b) => a + b, 0) / 10;
    console.log(`    early tokens: ~${earlyAvg.toFixed(0)}µs  late tokens: ~${lateAvg.toFixed(0)}µs`);
  }

  // Simple schema streaming
  const simpleTokens = simulateTokenStream(SIMPLE_PERFECT_JSON, 3);
  results.push(bench(`streaming: simple person (${simpleTokens.length} tokens)`, () => {
    const s = simpleShaper.stream();
    for (const token of simpleTokens) {
      s.feed(token);
    }
    s.close();
  }, N_MEDIUM));

  for (const r of results.slice(-2)) console.log(formatResult(r));

  // ==========================================================================
  // 8. Input size scaling
  // ==========================================================================
  hr('8. Input Size Scaling');

  // Generate arrays of increasing size
  const sizes = [1, 5, 10, 25, 50, 100];
  const arraySchema = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['id', 'name', 'value'],
    },
  };

  for (const size of sizes) {
    const items = Array.from({ length: size }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
      value: Math.random() * 100,
    }));
    const json = JSON.stringify(items);
    const iters = Math.max(500, Math.floor(N_MEDIUM / size));
    const r = bench(`array[${size}] objects (${json.length} bytes)`, () => {
      shape(arraySchema, json);
    }, iters);
    results.push(r);
    console.log(formatResult(r));
  }

  // ==========================================================================
  // 9. Error/failure paths
  // ==========================================================================
  hr('9. Error/Failure Paths');

  results.push(bench('type mismatch (string where int expected)', () => {
    shape({ type: 'integer' }, '"not a number"');
  }, N_FAST));

  results.push(bench('constraint violation (min/max)', () => {
    shape({ type: 'integer', minimum: 0, maximum: 100 }, '150');
  }, N_FAST));

  results.push(bench('completely unparseable (random text)', () => {
    shape(COMPLEX_SCHEMA, 'This is just some random text with no JSON at all.');
  }, N_MEDIUM));

  results.push(bench('feedback() generation on failure', () => {
    const r = shape(COMPLEX_SCHEMA, 'random text', {
      rules: [(v: any) => 'always fails'],
    });
    r.feedback();
  }, N_MEDIUM));

  for (const r of results.slice(-4)) console.log(formatResult(r));

  // ==========================================================================
  // Summary
  // ==========================================================================
  hr('SUMMARY');

  // Group results by category
  const categories = [
    { label: 'Schema compilation', pattern: /compile/ },
    { label: 'Prompt rendering', pattern: /render/ },
    { label: 'Simple parsing', pattern: /simple:/ },
    { label: 'Complex parsing', pattern: /complex:|medium:|union:|enum:/ },
    { label: 'Streaming', pattern: /streaming:/ },
    { label: 'Error paths', pattern: /mismatch|constraint|unparseable|feedback/ },
  ];

  for (const cat of categories) {
    const matching = results.filter((r) => cat.pattern.test(r.name));
    if (matching.length === 0) continue;
    const avgOps = Math.round(matching.reduce((s, r) => s + r.opsPerSec, 0) / matching.length);
    const maxAvg = Math.max(...matching.map((r) => r.avgUs));
    const fmtOps = avgOps > 1000 ? `${(avgOps / 1000).toFixed(1)}k` : `${avgOps}`;
    const fmtMax = maxAvg < 1000 ? `${maxAvg.toFixed(0)}µs` : `${(maxAvg / 1000).toFixed(2)}ms`;
    console.log(`  ${cat.label.padEnd(25)} avg: ${fmtOps.padEnd(8)} ops/s   worst-case: ${fmtMax}`);
  }

  // Production context
  console.log(`\n  Context: typical LLM response takes 500ms–5s to generate.`);
  const complexAvg = results.find((r) => r.name.includes('complex: perfect'))?.avgUs ?? 0;
  const streamingTotal = results.find((r) => r.name.includes('streaming: complex'))?.avgUs ?? 0;
  console.log(`  Parsing a complex response: ~${(complexAvg / 1000).toFixed(2)}ms (${((complexAvg / 1000) / 500 * 100).toFixed(3)}% of fastest LLM response)`);
  console.log(`  Full streaming parse: ~${(streamingTotal / 1000).toFixed(1)}ms total across all tokens`);
  console.log();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a string into chunks of ~chunkSize characters, simulating token streaming. */
function simulateTokenStream(text: string, chunkSize: number): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    tokens.push(text.substring(i, i + chunkSize));
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  Performance Benchmark                                             ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');

runBenchmarks();
