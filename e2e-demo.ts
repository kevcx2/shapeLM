#!/usr/bin/env npx tsx
/**
 * E2E Demo: Real OpenAI API calls structured with our library.
 *
 * Shows both static (full response) and streaming structuring.
 * No OpenAI structured output mode — we DIY it with prompt + parse.
 *
 * Run:  npx tsx e2e-demo.ts
 */

import OpenAI from 'openai';
import { z } from 'zod';
import {
  shaper,
  shape,
  prompt,
  stream,
  type ShapedResult,
} from './src/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY environment variable first.');
  console.error('  export OPENAI_API_KEY="sk-proj-..."');
  console.error('  npx tsx e2e-demo.ts');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const MODEL = 'gpt-4o-mini';

function hr(title: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(70)}\n`);
}

function printResult(r: ShapedResult<any>) {
  console.log(`  ok:     ${r.ok}`);
  console.log(`  score:  ${r.score}`);
  console.log(`  data:   ${JSON.stringify(r.data, null, 2)}`);
  if (r.coercions.length > 0) {
    console.log(`  coercions:`);
    for (const c of r.coercions) {
      console.log(`    - ${c.message} (penalty: ${c.penalty})`);
    }
  }
  if (r.errors.length > 0) {
    console.log(`  error:  ${r.errors.join('; ')}`);
  }
}

// ============================================================================
// Test 1: Static — Extract a Person (JSON Schema)
// ============================================================================

async function test1_staticPerson() {
  hr('Test 1: Static Parse — Extract a Person (JSON Schema)');

  const personSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'integer', minimum: 0, maximum: 150 },
      occupation: { type: 'string' },
    },
    required: ['name', 'age', 'occupation'],
  };

  const outputFmt = prompt(personSchema);
  console.log('  Prompt format sent to LLM:');
  console.log('  ' + outputFmt.replace(/\n/g, '\n  '));
  console.log();

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant. ${outputFmt}`,
      },
      {
        role: 'user',
        content: 'Tell me about Marie Curie.',
      },
    ],
  });

  const raw = response.choices[0].message.content ?? '';
  console.log('  Raw LLM output:');
  console.log('  ' + raw.replace(/\n/g, '\n  '));
  console.log();

  const result = shape<{ name: string; age: number; occupation: string }>(
    personSchema,
    raw,
  );

  console.log('  Parsed result:');
  printResult(result);

  const data = result.assert();
  console.log(`\n  ✓ ${data.name}, age ${data.age}, ${data.occupation}`);
}

// ============================================================================
// Test 2: Static — Extract with Zod schema + constraints
// ============================================================================

async function test2_staticZod() {
  hr('Test 2: Static Parse — Zod Schema with Constraints');

  const MovieReview = z.object({
    title: z.string().min(1),
    rating: z.number().min(1).max(10),
    pros: z.array(z.string()).min(1).max(5),
    cons: z.array(z.string()).min(1).max(5),
    recommend: z.boolean(),
  });

  type MovieReview = z.infer<typeof MovieReview>;

  const p = shaper<MovieReview>(MovieReview as any, {
    rules: [
      (v: any) => v.pros.length > 0 ? true : 'Must list at least one pro',
      (v: any) => v.cons.length > 0 ? true : 'Must list at least one con',
    ],
  });

  console.log('  Prompt format:');
  console.log('  ' + p.prompt().replace(/\n/g, '\n  '));
  console.log();

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a film critic. ${p.prompt()}`,
      },
      {
        role: 'user',
        content: 'Review the movie "Interstellar" by Christopher Nolan.',
      },
    ],
  });

  const raw = response.choices[0].message.content ?? '';
  console.log('  Raw LLM output:');
  console.log('  ' + raw.replace(/\n/g, '\n  '));
  console.log();

  const result = p.shape(raw);
  console.log('  Parsed result:');
  printResult(result);

  if (result.ok) {
    const data = result.data!;
    console.log(`\n  ✓ "${data.title}" — ${data.rating}/10, recommend: ${data.recommend}`);
    console.log(`    Pros: ${data.pros.join(', ')}`);
    console.log(`    Cons: ${data.cons.join(', ')}`);
  }
}

// ============================================================================
// Test 3: Static — Enum extraction
// ============================================================================

async function test3_staticEnum() {
  hr('Test 3: Static Parse — Enum (Sentiment Analysis)');

  const sentimentSchema = {
    type: 'string',
    enum: ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'],
  };

  const outputFmt = prompt(sentimentSchema);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a sentiment classifier. ${outputFmt}`,
      },
      {
        role: 'user',
        content: 'Classify: "The food was amazing but the service was terrible and slow."',
      },
    ],
  });

  const raw = response.choices[0].message.content ?? '';
  console.log('  Raw LLM output: ' + raw);

  const result = shape<string>(sentimentSchema, raw);
  console.log('  Parsed result:');
  printResult(result);
  console.log(`\n  ✓ Sentiment: ${result.assert()}`);
}

// ============================================================================
// Test 4: Streaming — Watch a Person object build up token by token
// ============================================================================

async function test4_streamingPerson() {
  hr('Test 4: Streaming Parse — Watch a Person build up');

  const personSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      birth_year: { type: 'integer' },
      achievements: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
      },
      field: { type: 'string' },
    },
    required: ['name', 'birth_year', 'achievements', 'field'],
  };

  const p = shaper<{
    name: string;
    birth_year: number;
    achievements: string[];
    field: string;
  }>(personSchema);

  console.log('  Prompt format:');
  console.log('  ' + p.prompt().replace(/\n/g, '\n  '));
  console.log();

  const responseStream = await openai.chat.completions.create({
    model: MODEL,
    stream: true,
    messages: [
      {
        role: 'system',
        content: `You are a helpful assistant. ${p.prompt()}`,
      },
      {
        role: 'user',
        content: 'Tell me about Alan Turing.',
      },
    ],
  });

  const s = p.stream();
  let tokenCount = 0;
  let lastSnapshot = '';

  console.log('  Streaming tokens...\n');

  for await (const chunk of responseStream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;

    tokenCount++;
    const partial = s.feed(delta).partial;

    // Print a snapshot every ~15 tokens (if data changed)
    const snapshot = JSON.stringify(partial);
    if (tokenCount % 15 === 0 && snapshot !== lastSnapshot && partial) {
      console.log(`  [token ${tokenCount}] partial: ${snapshot}`);
      lastSnapshot = snapshot;
    }
  }

  console.log(`\n  Total tokens: ${tokenCount}`);
  console.log(`  Accumulated text: ${s.text().slice(0, 120)}...`);
  console.log();

  const finalResult = s.close();
  console.log('  Final result:');
  printResult(finalResult);

  if (finalResult.ok) {
    const data = finalResult.data!;
    console.log(`\n  ✓ ${data.name} (born ${data.birth_year}), field: ${data.field}`);
    console.log(`    Achievements: ${data.achievements.join(' | ')}`);
  }
}

// ============================================================================
// Test 5: Streaming — Array of items building up
// ============================================================================

async function test5_streamingArray() {
  hr('Test 5: Streaming Parse — Array of items building up');

  const RecipeSchema = z.object({
    dish: z.string(),
    ingredients: z.array(z.object({
      name: z.string(),
      amount: z.string(),
    })).min(3),
    steps: z.array(z.string()).min(3),
    prep_time_minutes: z.number().min(1),
  });

  type Recipe = z.infer<typeof RecipeSchema>;

  const p = shaper<Recipe>(RecipeSchema as any);

  console.log('  Prompt format:');
  console.log('  ' + p.prompt().replace(/\n/g, '\n  '));
  console.log();

  const responseStream = await openai.chat.completions.create({
    model: MODEL,
    stream: true,
    messages: [
      {
        role: 'system',
        content: `You are a chef. ${p.prompt()}`,
      },
      {
        role: 'user',
        content: 'Give me a recipe for pancakes.',
      },
    ],
  });

  const s = p.stream();
  let tokenCount = 0;

  console.log('  Streaming...\n');

  for await (const chunk of responseStream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;

    tokenCount++;
    const partial = s.feed(delta).partial;

    // Log ingredient count as it grows
    if (tokenCount % 20 === 0 && partial) {
      const d = partial as any;
      const ingredientCount = d?.ingredients?.length ?? 0;
      const stepCount = d?.steps?.length ?? 0;
      console.log(`  [token ${tokenCount}] ingredients: ${ingredientCount}, steps: ${stepCount}`);
    }
  }

  console.log(`\n  Total tokens: ${tokenCount}`);

  const finalResult = s.close();
  console.log('\n  Final result:');
  printResult(finalResult);

  if (finalResult.ok) {
    const data = finalResult.data!;
    console.log(`\n  ✓ ${data.dish} (${data.prep_time_minutes} min)`);
    console.log(`    ${data.ingredients.length} ingredients, ${data.steps.length} steps`);
    for (const ing of data.ingredients) {
      console.log(`      - ${ing.amount} ${ing.name}`);
    }
  }
}

// ============================================================================
// Test 6: Feedback loop — retry on validation failure
// ============================================================================

async function test6_feedbackLoop() {
  hr('Test 6: Feedback Loop — Retry on constraint failure');

  // Schema for a haiku with a "mood" field constrained to a closed vocabulary.
  // The LLM won't know the valid moods on attempt 1, so the constraint will
  // fail. The feedback loop tells the LLM the allowed values, and it fixes it.
  const ALLOWED_MOODS = ['contemplative', 'joyful', 'melancholic'] as const;

  const schema = {
    type: 'object',
    properties: {
      haiku_line1: { type: 'string', description: 'First line, exactly 5 syllables' },
      haiku_line2: { type: 'string', description: 'Second line, exactly 7 syllables' },
      haiku_line3: { type: 'string', description: 'Third line, exactly 5 syllables' },
      topic: { type: 'string' },
      mood: { type: 'string', description: 'The overall mood of the haiku' },
    },
    required: ['haiku_line1', 'haiku_line2', 'haiku_line3', 'topic', 'mood'],
  };

  type Haiku = {
    haiku_line1: string;
    haiku_line2: string;
    haiku_line3: string;
    topic: string;
    mood: string;
  };

  const p = shaper<Haiku>(schema, {
    rules: [
      (v: any) => ALLOWED_MOODS.includes(v.mood)
        ? true
        : `"mood" must be one of: ${ALLOWED_MOODS.join(', ')} (got "${v.mood}")`,
      (v: any) => v.topic === 'code'
        ? true
        : `"topic" must be exactly "code" (got "${v.topic}")`,
    ],
  });

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are a haiku poet. ${p.prompt()}`,
    },
    {
      role: 'user',
      content: 'Write a haiku about programming.',
    },
  ];

  const MAX_RETRIES = 2;
  let result: ShapedResult<any> | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    console.log(`  Attempt ${attempt}...`);

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages,
    });

    const raw = response.choices[0].message.content ?? '';
    console.log(`  Raw: ${raw.slice(0, 100)}...`);

    result = p.shape(raw);
    console.log(`  ok: ${result.ok}, score: ${result.score}`);

    if (result.ok) {
      break;
    }

    // Show the errors
    for (const e of result.errors) {
      console.log(`  ✗ ${e}`);
    }

    // Use feedback to retry
    const fb = result.feedback();
    if (fb && attempt <= MAX_RETRIES) {
      console.log(`\n  → Sending feedback to LLM for retry...`);
      console.log(`  ${fb.split('\n').join('\n  ')}\n`);
      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: fb });
    }
  }

  if (result?.ok) {
    const data = result.data!;
    console.log(`\n  ✓ Haiku about "${data.topic}" (mood: ${data.mood}):`);
    console.log(`    ${data.haiku_line1}`);
    console.log(`    ${data.haiku_line2}`);
    console.log(`    ${data.haiku_line3}`);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  E2E Demo: Real OpenAI calls + DIY structured output               ║');
  console.log('║  Model: ' + MODEL.padEnd(59) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  try {
    await test1_staticPerson();
    await test2_staticZod();
    await test3_staticEnum();
    await test4_streamingPerson();
    await test5_streamingArray();
    await test6_feedbackLoop();

    hr('ALL TESTS COMPLETE');
    console.log('  All 6 E2E tests ran successfully.\n');
  } catch (err: any) {
    console.error('\n  ✗ FAILED:', err.message);
    if (err.status) console.error('    HTTP status:', err.status);
    if (err.result) {
      console.error('    Parse result:', JSON.stringify(err.result.data, null, 2));
    }
    process.exit(1);
  }
}

main();
