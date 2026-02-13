/**
 * Parsing context — carries state through the coercion tree.
 *
 * Analogous to BAML's `ParsingContext`.
 */

import type { FieldType as FieldTypeT, ClassType, EnumType } from '../types.js';

export class ParsingContext {
  /** Definitions map for resolving recursive refs. */
  readonly definitions: Map<string, FieldTypeT>;
  /** Scope path for error messages, e.g. ["root", "address", "city"]. */
  readonly scope: string[];
  /** Visited (className, valueKey) pairs for circular reference detection. */
  readonly visited: Set<string>;
  /** Union variant hint from a previous array element. */
  readonly unionHint: number | undefined;

  constructor(
    definitions: Map<string, FieldTypeT>,
    scope: string[] = [],
    visited: Set<string> = new Set(),
    unionHint?: number,
  ) {
    this.definitions = definitions;
    this.scope = scope;
    this.visited = visited;
    this.unionHint = unionHint;
  }

  /** Create a child context with an additional scope segment. */
  enterScope(name: string): ParsingContext {
    return new ParsingContext(
      this.definitions,
      [...this.scope, name],
      this.visited,
      this.unionHint,
    );
  }

  /** Create a child context with a union hint for array optimization. */
  withUnionHint(hint: number | undefined): ParsingContext {
    return new ParsingContext(
      this.definitions,
      this.scope,
      this.visited,
      hint,
    );
  }

  /** Create a child context with an additional visited entry. */
  withVisited(key: string): ParsingContext {
    const newVisited = new Set(this.visited);
    newVisited.add(key);
    return new ParsingContext(
      this.definitions,
      this.scope,
      newVisited,
      this.unionHint,
    );
  }

  /** Check if a class+value combination has been visited (circular ref). */
  hasVisited(key: string): boolean {
    return this.visited.has(key);
  }

  /** Resolve a recursive ref to its definition. */
  resolve(name: string): FieldTypeT | undefined {
    return this.definitions.get(name);
  }

  /** Format scope as a dot-separated path. */
  displayScope(): string {
    return this.scope.join('.') || '<root>';
  }
}
