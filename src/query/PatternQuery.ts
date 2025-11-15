/**
 * PatternQuery - Declarative graph pattern matching
 * Phase 3: Fluent API for multi-hop graph traversals
 */

import Database from 'better-sqlite3';
import {
  GraphEntity,
  PatternMatch,
  PropertyFilter,
  PatternStep,
  VariableInfo,
  QueryPlan,
  PatternError,
  PatternDirection
} from '../types/pattern';
import { PatternNodeBuilder } from './PatternNodeBuilder';
import { deserialize, timestampToDate } from '../utils/serialization';

/**
 * Fluent API for declarative graph pattern matching
 * Generates optimized SQL from pattern descriptions
 */
export class PatternQuery<T extends Record<string, GraphEntity>> {
  private patternSteps: PatternStep[] = [];
  private variables: Map<string, VariableInfo> = new Map();
  private filters: Map<string, PropertyFilter> = new Map();
  private selections?: string[];
  private limitValue?: number;
  private offsetValue?: number;
  private orderByClause?: {
    variable: string;
    field: string;
    direction: 'asc' | 'desc';
  };
  private isCyclic = false;
  private cyclicVariable?: string;

  constructor(private db: Database.Database) {}

  /**
   * Define the starting point of the pattern
   */
  start(varName: string, nodeType?: string): PatternNodeBuilder<T> {
    this.patternSteps.push({
      type: 'node',
      variableName: varName,
      nodeType,
      isStart: true
    });

    this.variables.set(varName, {
      variableName: varName,
      nodeType,
      stepIndex: this.patternSteps.length - 1
    });

    return new PatternNodeBuilder<T>(this, varName);
  }

  /**
   * Add an intermediate node in the pattern
   */
  node(varName: string, nodeType?: string): PatternNodeBuilder<T> {
    // Check if this is a cyclic reference
    if (this.variables.has(varName)) {
      this.isCyclic = true;
      this.cyclicVariable = varName;
      this.patternSteps.push({
        type: 'node',
        variableName: varName,
        nodeType,
        isEnd: false
      });
      return new PatternNodeBuilder<T>(this, varName);
    }

    this.patternSteps.push({
      type: 'node',
      variableName: varName,
      nodeType
    });

    this.variables.set(varName, {
      variableName: varName,
      nodeType,
      stepIndex: this.patternSteps.length - 1
    });

    return new PatternNodeBuilder<T>(this, varName);
  }

  /**
   * Define the terminal node of the pattern
   * If varName matches existing variable, creates cyclic constraint
   */
  end(varName: string, nodeType?: string): this {
    // Check if this is a cyclic reference
    if (this.variables.has(varName)) {
      this.isCyclic = true;
      this.cyclicVariable = varName;
      this.patternSteps.push({
        type: 'node',
        variableName: varName,
        nodeType,
        isEnd: true
      });
      return this;
    }

    this.patternSteps.push({
      type: 'node',
      variableName: varName,
      nodeType,
      isEnd: true
    });

    this.variables.set(varName, {
      variableName: varName,
      nodeType,
      stepIndex: this.patternSteps.length - 1
    });

    return this;
  }

  /**
   * Mark a node as the end node (called from PatternNodeBuilder for single-node patterns)
   * @internal
   */
  markAsEnd(varName: string): void {
    const stepIndex = this.variables.get(varName)?.stepIndex;
    if (stepIndex !== undefined) {
      this.patternSteps[stepIndex].isEnd = true;
    }
  }

  /**
   * Add edge traversal step (called from PatternNodeBuilder)
   * @internal
   */
  addEdgeStep(edgeType: string, direction: PatternDirection): void {
    // Validate direction
    if (!['in', 'out', 'both'].includes(direction)) {
      throw new PatternError(
        `Invalid direction: ${direction}. Must be 'in', 'out', or 'both'`,
        'INVALID_DIRECTION'
      );
    }

    this.patternSteps.push({
      type: 'edge',
      edgeType,
      direction
    });
  }

  /**
   * Add node filter (called from PatternNodeBuilder)
   * @internal
   */
  addNodeFilter(varName: string, filter: PropertyFilter): void {
    const existing = this.filters.get(varName) || {};
    this.filters.set(varName, { ...existing, ...filter });
  }

  /**
   * Apply filters to pattern variables
   */
  where(conditions: Partial<{ [K in keyof T]: PropertyFilter }>): this {
    for (const [varName, filter] of Object.entries(conditions)) {
      const existing = this.filters.get(varName) || {};
      this.filters.set(varName, { ...existing, ...(filter as PropertyFilter) });
    }
    return this;
  }

  /**
   * Choose which variables to return in results
   */
  select(variables: string[]): this {
    this.selections = variables;
    return this;
  }

  /**
   * Limit number of results
   */
  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  /**
   * Skip first N results
   */
  offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  /**
   * Sort results by variable property
   */
  orderBy(variable: string, field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderByClause = { variable, field, direction };
    return this;
  }

  /**
   * Execute the pattern match and return results
   */
  exec(): PatternMatch<T>[] {
    this.validatePattern();

    const startTime = performance.now();
    const { sql, params } = this.buildSQL();

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    const results = this.mapResults(rows);
    const executionTime = performance.now() - startTime;

    // Add execution time to metadata
    return results.map((r) => {
      const result = r as any;
      return {
        ...result,
        _meta: {
          ...result._meta,
          executionTime
        }
      } as PatternMatch<T>;
    });
  }

  /**
   * Execute and return only first match
   */
  first(): PatternMatch<T> | null {
    const results = this.limit(1).exec();
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Count matches without retrieving full results
   */
  count(): number {
    this.validatePattern();

    const { sql: fullSql, params } = this.buildSQL();

    // Replace SELECT ... with SELECT COUNT(*)
    const countSql = fullSql.replace(
      /SELECT[\s\S]+?FROM/,
      'SELECT COUNT(*) as count FROM'
    );

    const stmt = this.db.prepare(countSql);
    const row = stmt.get(...params) as any;
    return row.count;
  }

  /**
   * Check if pattern matches exist
   */
  exists(): boolean {
    return this.count() > 0;
  }

  /**
   * Show query execution plan without running query
   */
  explain(): QueryPlan {
    const { sql } = this.buildSQL();

    const explainStmt = this.db.prepare(`EXPLAIN QUERY PLAN ${sql}`);
    explainStmt.all(); // Execute to validate query

    return {
      sql,
      estimatedCost: 0, // SQLite doesn't expose cost
      joinOrder: Array.from(this.variables.keys()),
      indexesUsed: [] // Would require parsing EXPLAIN output
    };
  }

  /**
   * Validate pattern structure
   * @private
   */
  private validatePattern(): void {
    // Check that pattern has at least start and end
    const hasStart = this.patternSteps.some((s) => s.isStart);
    const hasEnd = this.patternSteps.some((s) => s.isEnd);

    if (!hasStart || !hasEnd) {
      throw new PatternError(
        'Pattern must have both start() and end() nodes',
        'INVALID_PATTERN'
      );
    }

    // Single-node patterns ARE valid (no edge requirement)
    // BUT: start and end must reference the SAME variable
    const edgeCount = this.patternSteps.filter((s) => s.type === 'edge').length;
    if (edgeCount === 0) {
      const startVar = this.patternSteps.find((s) => s.isStart)?.variableName;
      const endVar = this.patternSteps.find((s) => s.isEnd)?.variableName;

      if (startVar !== endVar) {
        throw new PatternError(
          'Pattern must have at least one edge traversal using through()',
          'INVALID_PATTERN'
        );
      }
    }

    // Validate selections reference defined variables
    if (this.selections) {
      for (const varName of this.selections) {
        if (!this.variables.has(varName)) {
          throw new PatternError(
            `Variable '${varName}' in select() was never defined in pattern`,
            'UNDEFINED_VARIABLE'
          );
        }
      }
    }
  }

  /**
   * Build SQL query from pattern steps
   * @private
   */
  private buildSQL(): { sql: string; params: any[] } {
    const edgeCount = this.patternSteps.filter((s) => s.type === 'edge').length;

    // Single-node pattern (no edges) - use simplified query
    if (edgeCount === 0) {
      return this.buildSingleNodeSQL();
    }

    // Multi-hop pattern - use CTE-based traversal
    const ctes: string[] = [];
    const params: any[] = [];
    let cteIndex = 0;

    // Build CTEs for each pattern step
    for (let i = 0; i < this.patternSteps.length; i++) {
      const step = this.patternSteps[i];

      if (step.type === 'node' && step.isStart) {
        // Start node CTE
        const varName = step.variableName!;
        const filter = this.filters.get(varName);
        const { whereSql, whereParams } = this.buildFilterSQL(filter || {});

        const sql = `${varName}_start AS (
          SELECT * FROM nodes
          WHERE type = ?${whereSql ? ` AND ${whereSql}` : ''}
        )`;

        ctes.push(sql);
        params.push(step.nodeType || varName);
        params.push(...whereParams);
      } else if (step.type === 'edge') {
        // Edge traversal CTE
        const edgeType = step.edgeType!;
        const direction = step.direction!;
        const prevNode = this.getPreviousNode(i);
        const nextNode = this.getNextNode(i);

        if (!prevNode || !nextNode) continue;

        const prevVarName = prevNode.variableName!;
        const prevCteName = prevNode.isStart
          ? `${prevVarName}_start`
          : `${prevVarName}_node`;

        const edgeCteName = `${edgeType.toLowerCase()}_edges_${cteIndex++}`;

        let joinCondition: string;
        if (direction === 'out') {
          joinCondition = `e.from_id = p.id`;
        } else if (direction === 'in') {
          joinCondition = `e.to_id = p.id`;
        } else {
          // both
          joinCondition = `(e.from_id = p.id OR e.to_id = p.id)`;
        }

        const sql = `${edgeCteName} AS (
          SELECT e.* FROM edges e
          JOIN ${prevCteName} p ON ${joinCondition}
          WHERE e.type = ?
        )`;

        ctes.push(sql);
        params.push(edgeType);
      } else if (step.type === 'node' && !step.isStart) {
        // Intermediate or end node CTE
        const varName = step.variableName!;
        const prevEdge = this.getPreviousEdge(i);

        if (!prevEdge || !prevEdge.edgeType) continue;

        const edgeCteName = `${prevEdge.edgeType.toLowerCase()}_edges_${cteIndex - 1}`;
        const nodeCteName = step.isEnd ? `${varName}_end` : `${varName}_node`;
        const direction = prevEdge.direction!;

        let joinCondition: string;
        if (direction === 'out') {
          joinCondition = `n.id = e.to_id`;
        } else if (direction === 'in') {
          joinCondition = `n.id = e.from_id`;
        } else {
          // both - need to handle either direction
          const prevNode = this.getPreviousNode(i - 1);
          const prevVarName = prevNode?.variableName || 'p';
          joinCondition = `(
            (n.id = e.to_id AND e.from_id IN (SELECT id FROM ${prevVarName}_start)) OR
            (n.id = e.from_id AND e.to_id IN (SELECT id FROM ${prevVarName}_start))
          )`;
        }

        // Skip cyclic end nodes in CTE (handled in WHERE clause)
        if (this.isCyclic && step.isEnd && varName === this.cyclicVariable) {
          continue;
        }

        const filter = this.filters.get(varName);
        const { whereSql, whereParams } = this.buildFilterSQL(filter || {});

        const sql = `${nodeCteName} AS (
          SELECT n.* FROM nodes n
          JOIN ${edgeCteName} e ON ${joinCondition}
          WHERE n.type = ?${whereSql ? ` AND ${whereSql}` : ''}
        )`;

        ctes.push(sql);
        params.push(step.nodeType || varName);
        params.push(...whereParams);
      }
    }

    // Build final SELECT
    const finalSelect = this.buildFinalSelect(params);

    const sql = `WITH ${ctes.join(',\n')}\n${finalSelect}`;

    return { sql, params };
  }

  /**
   * Build SQL for single-node pattern (no edges)
   * @private
   */
  private buildSingleNodeSQL(): { sql: string; params: any[] } {
    const startStep = this.patternSteps.find((s) => s.isStart)!;
    const varName = startStep.variableName!;
    const filter = this.filters.get(varName) || {};

    let sql = `SELECT id as ${varName}_id, type as ${varName}_type, properties as ${varName}_properties, created_at as ${varName}_created_at, updated_at as ${varName}_updated_at FROM nodes WHERE type = ?`;

    const params = [startStep.nodeType || varName];

    // Add property filters
    if (Object.keys(filter).length > 0) {
      const { whereSql, whereParams } = this.buildFilterSQL(filter);
      sql += ` AND ${whereSql}`;
      params.push(...whereParams);
    }

    // Add ORDER BY
    if (this.orderByClause) {
      sql += ` ORDER BY json_extract(properties, '$.${this.orderByClause.field}') ${this.orderByClause.direction.toUpperCase()}`;
    }

    // Add LIMIT/OFFSET (SQLite requires LIMIT if OFFSET is used)
    if (this.limitValue !== undefined) {
      sql += ` LIMIT ${this.limitValue}`;
      if (this.offsetValue !== undefined) {
        sql += ` OFFSET ${this.offsetValue}`;
      }
    } else if (this.offsetValue !== undefined) {
      // OFFSET without LIMIT - use very large LIMIT
      sql += ` LIMIT -1 OFFSET ${this.offsetValue}`;
    }

    return { sql, params };
  }

  /**
   * Build final SELECT statement
   * @private
   */
  private buildFinalSelect(_params: any[]): string {
    const selectVars = this.selections || Array.from(this.variables.keys());
    const selectCols: string[] = [];

    for (const varName of selectVars) {
      const varInfo = this.variables.get(varName);
      if (!varInfo) continue;

      const step = this.patternSteps[varInfo.stepIndex];
      const cteName = step.isStart
        ? `${varName}_start`
        : step.isEnd
          ? `${varName}_end`
          : `${varName}_node`;

      selectCols.push(
        `${cteName}.id as ${varName}_id`,
        `${cteName}.type as ${varName}_type`,
        `${cteName}.properties as ${varName}_properties`,
        `${cteName}.created_at as ${varName}_created_at`,
        `${cteName}.updated_at as ${varName}_updated_at`
      );
    }

    const fromClause = this.buildFromClause();
    const whereClauses: string[] = [];

    // Add cyclic constraint if needed
    if (this.isCyclic && this.cyclicVariable) {
      const startVar = this.cyclicVariable;
      const endVarInfo = this.variables.get(startVar);
      if (endVarInfo) {
        // Find the intermediate node (the one between start and cyclic end)
        const intermediateVar = Array.from(this.variables.keys()).find(
          (v) => v !== startVar
        );
        if (intermediateVar) {
          // Ensure we get the cycle back to start
          const lastEdge = this.patternSteps
            .filter((s) => s.type === 'edge')
            .pop();
          if (lastEdge) {
            const edgeCteName = `${lastEdge.edgeType!.toLowerCase()}_edges_${this.patternSteps.filter((s) => s.type === 'edge').length - 1}`;
            if (lastEdge.direction === 'out') {
              whereClauses.push(`${edgeCteName}.to_id = ${startVar}_start.id`);
            } else if (lastEdge.direction === 'in') {
              whereClauses.push(`${edgeCteName}.from_id = ${startVar}_start.id`);
            }
            // Avoid duplicate pairs (A,B) and (B,A)
            whereClauses.push(
              `${startVar}_start.id < ${intermediateVar}_node.id`
            );
          }
        }
      }
    }

    let sql = `SELECT ${selectCols.join(', ')} FROM ${fromClause}`;

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (this.orderByClause) {
      const { variable, field, direction } = this.orderByClause;
      sql += ` ORDER BY json_extract(${variable}_start.properties, '$.${field}') ${direction.toUpperCase()}`;
    }

    if (this.limitValue !== undefined) {
      sql += ` LIMIT ${this.limitValue}`;
    }

    if (this.offsetValue !== undefined) {
      sql += ` OFFSET ${this.offsetValue}`;
    }

    return sql;
  }

  /**
   * Build FROM clause with joins
   * @private
   */
  private buildFromClause(): string {
    const startStep = this.patternSteps.find((s) => s.isStart);
    if (!startStep || !startStep.variableName) return '';

    const startVar = startStep.variableName;
    let from = `${startVar}_start`;

    // Add joins for each edge and subsequent node
    let edgeIndex = 0;
    for (let i = 0; i < this.patternSteps.length; i++) {
      const step = this.patternSteps[i];

      if (step.type === 'edge') {
        const edgeCteName = `${step.edgeType!.toLowerCase()}_edges_${edgeIndex}`;
        const prevNode = this.getPreviousNode(i);
        const direction = step.direction!;

        if (prevNode) {
          const prevVarName = prevNode.variableName!;
          const prevCteName = prevNode.isStart
            ? `${prevVarName}_start`
            : `${prevVarName}_node`;

          let joinCond: string;
          if (direction === 'out') {
            joinCond = `${edgeCteName}.from_id = ${prevCteName}.id`;
          } else if (direction === 'in') {
            joinCond = `${edgeCteName}.to_id = ${prevCteName}.id`;
          } else {
            joinCond = `(${edgeCteName}.from_id = ${prevCteName}.id OR ${edgeCteName}.to_id = ${prevCteName}.id)`;
          }

          from += ` JOIN ${edgeCteName} ON ${joinCond}`;
        }

        edgeIndex++;
      } else if (step.type === 'node' && !step.isStart) {
        // Skip cyclic end nodes
        if (this.isCyclic && step.isEnd && step.variableName === this.cyclicVariable) {
          continue;
        }

        const varName = step.variableName!;
        const nodeCteName = step.isEnd ? `${varName}_end` : `${varName}_node`;
        const prevEdge = this.getPreviousEdge(i);

        if (prevEdge) {
          const edgeCteName = `${prevEdge.edgeType!.toLowerCase()}_edges_${edgeIndex - 1}`;
          const direction = prevEdge.direction!;

          let joinCond: string;
          if (direction === 'out') {
            joinCond = `${nodeCteName}.id = ${edgeCteName}.to_id`;
          } else if (direction === 'in') {
            joinCond = `${nodeCteName}.id = ${edgeCteName}.from_id`;
          } else {
            joinCond = `(${nodeCteName}.id = ${edgeCteName}.to_id OR ${nodeCteName}.id = ${edgeCteName}.from_id)`;
          }

          from += ` JOIN ${nodeCteName} ON ${joinCond}`;
        }
      }
    }

    return from;
  }

  /**
   * Build WHERE clause SQL from property filter
   * @private
   */
  private buildFilterSQL(filter: PropertyFilter): {
    whereSql: string;
    whereParams: any[];
  } {
    const conditions: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Operator-based filter
        for (const [op, val] of Object.entries(value)) {
          switch (op) {
            case '$gt':
              conditions.push(`json_extract(properties, '$.${key}') > ?`);
              params.push(val);
              break;
            case '$gte':
              conditions.push(`json_extract(properties, '$.${key}') >= ?`);
              params.push(val);
              break;
            case '$lt':
              conditions.push(`json_extract(properties, '$.${key}') < ?`);
              params.push(val);
              break;
            case '$lte':
              conditions.push(`json_extract(properties, '$.${key}') <= ?`);
              params.push(val);
              break;
            case '$ne':
              conditions.push(`json_extract(properties, '$.${key}') != ?`);
              params.push(val);
              break;
            case '$in': {
              const placeholders = (val as any[]).map(() => '?').join(', ');
              conditions.push(
                `json_extract(properties, '$.${key}') IN (${placeholders})`
              );
              params.push(...(val as any[]));
              break;
            }
          }
        }
      } else {
        // Exact match
        conditions.push(`json_extract(properties, '$.${key}') = ?`);
        params.push(value);
      }
    }

    return {
      whereSql: conditions.join(' AND '),
      whereParams: params
    };
  }

  /**
   * Map SQL rows to PatternMatch objects
   * @private
   */
  private mapResults(rows: any[]): PatternMatch<T>[] {
    return rows.map((row) => {
      const result: any = {};
      const vars = this.selections || Array.from(this.variables.keys());

      for (const varName of vars) {
        result[varName] = {
          id: row[`${varName}_id`],
          type: row[`${varName}_type`],
          properties: deserialize(row[`${varName}_properties`]),
          createdAt: timestampToDate(row[`${varName}_created_at`]),
          updatedAt: timestampToDate(row[`${varName}_updated_at`])
        };
      }

      // Calculate path length
      const edgeCount = this.patternSteps.filter((s) => s.type === 'edge').length;

      result._meta = {
        pathLength: edgeCount,
        executionTime: 0 // Will be set by exec()
      };

      return result;
    });
  }

  /**
   * Get previous node step
   * @private
   */
  private getPreviousNode(currentIndex: number): PatternStep | null {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (this.patternSteps[i].type === 'node') {
        return this.patternSteps[i];
      }
    }
    return null;
  }

  /**
   * Get next node step
   * @private
   */
  private getNextNode(currentIndex: number): PatternStep | null {
    for (let i = currentIndex + 1; i < this.patternSteps.length; i++) {
      if (this.patternSteps[i].type === 'node') {
        return this.patternSteps[i];
      }
    }
    return null;
  }

  /**
   * Get previous edge step
   * @private
   */
  private getPreviousEdge(currentIndex: number): PatternStep | null {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (this.patternSteps[i].type === 'edge') {
        return this.patternSteps[i];
      }
    }
    return null;
  }
}
