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
   * Add property filter - supports both node-specific and global filter forms
   * Node-specific: .where({ name: 'Alice' })
   * Global: .where({ person: { name: 'Alice' } })
   */
  where(filter: PropertyFilter | Record<string, PropertyFilter>): this {
    // Check if this is a global filter (has variable names as keys)
    const keys = Object.keys(filter);
    if (keys.length > 0 && typeof filter[keys[0]] === 'object' && filter[keys[0]] !== null) {
      // Could be global filter like { person: { name: 'Alice' } }
      // Or could be node filter with operator like { age: { $gt: 25 } }
      const firstValue = filter[keys[0]] as any;
      const hasOperator = Object.keys(firstValue).some(k => k.startsWith('$'));

      if (!hasOperator && keys.includes(this.currentVariable)) {
        // Global filter form - delegate to PatternQuery.where()
        this.query.where(filter);
        return this;
      }
    }

    // Node-specific filter - add to current variable
    this.query.addNodeFilter(this.currentVariable, filter as PropertyFilter);
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
  select(variables: string[]): this {
    this.query.select(variables);
    return this;
  }

  /**
   * Limit results (proxy to PatternQuery)
   */
  limit(count: number): this {
    this.query.limit(count);
    return this;
  }

  /**
   * Skip results (proxy to PatternQuery)
   */
  offset(count: number): this {
    this.query.offset(count);
    return this;
  }

  /**
   * Sort results (proxy to PatternQuery)
   */
  orderBy(variable: string, field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.query.orderBy(variable, field, direction);
    return this;
  }

  /**
   * Apply property filter to current node
   */
  filter(properties: PropertyFilter): this {
    this.query.addNodeFilter(this.currentVariable, properties);
    return this;
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
   * Check if matches exist (proxy to PatternQuery)
   */
  exists(): boolean {
    this.query.markAsEnd(this.currentVariable);
    return this.query.exists();
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
