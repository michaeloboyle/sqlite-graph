/**
 * PatternNodeBuilder - Intermediate builder for adding node constraints
 * Part of Phase 3 pattern matching fluent API
 */

import { PropertyFilter, PatternMatch, QueryPlan } from '../types/pattern';
import type { PatternQuery } from './PatternQuery';

/**
 * Builder for adding constraints to pattern nodes
 * Transitions back to PatternQuery via through()
 * Also proxies execution methods for single-node patterns
 */
export class PatternNodeBuilder<T extends Record<string, any>> {
  constructor(
    private query: any, // PatternQuery<T> - using any to avoid circular dep
    private currentVariable: string
  ) {}

  /**
   * Add property filter to current node
   */
  where(filter: PropertyFilter): this {
    this.query.addNodeFilter(this.currentVariable, filter);
    return this;
  }

  /**
   * Continue pattern with edge traversal
   */
  through(edgeType: string, direction: 'in' | 'out' | 'both'): any {
    this.query.addEdgeStep(edgeType, direction);
    return this.query;
  }

  // Proxy methods for single-node patterns (start without end)
  // These allow: db.pattern().start('person').exec()

  /**
   * Choose which variables to return (proxy to PatternQuery)
   */
  select(variables: string[]): any {
    return this.query.select(variables);
  }

  /**
   * Limit results (proxy to PatternQuery)
   */
  limit(count: number): any {
    return this.query.limit(count);
  }

  /**
   * Skip results (proxy to PatternQuery)
   */
  offset(count: number): any {
    return this.query.offset(count);
  }

  /**
   * Sort results (proxy to PatternQuery)
   */
  orderBy(variable: string, field: string, direction: 'asc' | 'desc' = 'asc'): any {
    return this.query.orderBy(variable, field, direction);
  }

  /**
   * Execute pattern (proxy to PatternQuery)
   */
  exec(): PatternMatch<T>[] {
    // For single-node patterns, we need to mark this as an end node
    this.query.markAsEnd(this.currentVariable);
    return this.query.exec();
  }

  /**
   * Get first result (proxy to PatternQuery)
   */
  first(): PatternMatch<T> | null {
    this.query.markAsEnd(this.currentVariable);
    return this.query.first();
  }

  /**
   * Count results (proxy to PatternQuery)
   */
  count(): number {
    this.query.markAsEnd(this.currentVariable);
    return this.query.count();
  }

  /**
   * Show query plan (proxy to PatternQuery)
   */
  explain(): QueryPlan {
    this.query.markAsEnd(this.currentVariable);
    return this.query.explain();
  }

  /**
   * Define terminal node (for multi-hop patterns)
   */
  end(varName: string, nodeType?: string): any {
    return this.query.end(varName, nodeType);
  }
}
