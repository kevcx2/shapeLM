/**
 * Markdown code block extractor.
 *
 * Finds fenced code blocks (```lang ... ```) in LLM output and
 * returns the content for further parsing.
 */

export interface MarkdownBlock {
  /** The language tag (e.g. "json", "typescript", ""). */
  tag: string;
  /** The raw content inside the code fence. */
  content: string;
}

/**
 * Extract all fenced code blocks from text.
 * Handles both ``` and ~~~ fences.
 */
export function extractMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  // Match fenced code blocks: ```lang\n...\n``` or ~~~lang\n...\n~~~
  const fenceRegex = /(?:^|\n)\s*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(?:\n\s*\1|$)/g;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(text)) !== null) {
    const tag = match[2].trim().split(/\s/)[0] ?? '';
    const content = match[3];
    blocks.push({ tag, content });
  }

  return blocks;
}

/**
 * Get the text outside of code blocks (the "prose" portion).
 */
export function getProseOutsideBlocks(text: string): string {
  const fenceRegex = /(?:^|\n)\s*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(?:\n\s*\1|$)/g;
  return text.replace(fenceRegex, '\n').trim();
}
