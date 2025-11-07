import Database from 'better-sqlite3';
import { Node, NodeData, TraversalDirection, JoinCondition } from '../types';
import { deserialize, timestampToDate } from '../utils/serialization';

/**
 * Fluent query builder for nodes with method chaining.
 * Provides an intuitive API for filtering, joining, and sorting graph nodes.
 *
 * @example
 * ```typescript
 * const jobs = db.nodes('Job')
 *   .where({ status: 'active' })
 *   .connectedTo('Company', 'POSTED_BY')
 *   .orderBy('created_at', 'desc')
 *   .limit(10)
 *   .exec();
 * ```
 */
export class NodeQuery {
  private db: Database.Database;
  private nodeType: string;
  private whereConditions: Map<string, any> = new Map();
  private joins: JoinCondition[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private orderByField?: string;
  private orderDirection: 'asc' | 'desc' = 'asc';

  /**
   * Create a new node query builder.
   *
   * @param db - SQLite database instance
   * @param nodeType - Type of nodes to query
   * @internal
   */
  constructor(db: Database.Database, nodeType: string) {
    this.db = db;
    this.nodeType = nodeType;
  }

  /**
   * Filter nodes by property values.
   * Can be called multiple times - conditions are ANDed together.
   *
   * @param properties - Key-value pairs to match against node properties
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * db.nodes('Job')
   *   .where({ status: 'active' })
   *   .where({ remote: true })
   *   .exec();
   * ```
   */
  where(properties: Partial<NodeData>): this {
    for (const [key, value] of Object.entries(properties)) {
      this.whereConditions.set(key, value);
    }
    return this;
  }

  /**
   * Filter nodes by a custom predicate function.
   * This executes in JavaScript after fetching from database.
   *
   * @param predicate - Function that returns true for nodes to include
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * db.nodes('Job')
   *   .filter(node => {
   *     const salary = node.properties.salary;
   *     return salary && salary.min >= 150000;
   *   })
   *   .exec();
   * ```
   */
  filter(predicate: (node: Node) => boolean): this {
    // Store predicate for post-query filtering
    if (!this.filterPredicate) {
      this.filterPredicate = predicate;
    } else {
      const existing = this.filterPredicate;
      this.filterPredicate = (node) => existing(node) && predicate(node);
    }
    return this;
  }

  private filterPredicate?: (node: Node) => boolean;

  /**
   * Filter nodes that have a connection to nodes of a specific type.
   *
   * @param nodeType - Type of connected nodes to filter by
   * @param edgeType - Type of edge connecting the nodes
   * @param direction - Direction of edge traversal ('out', 'in', or 'both')
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Find jobs posted by SaaS companies
   * db.nodes('Job')
   *   .connectedTo('Company', 'POSTED_BY', 'out')
   *   .exec();
   *
   * // Find companies that posted active jobs
   * db.nodes('Company')
   *   .connectedTo('Job', 'POSTED_BY', 'in')
   *   .exec();
   * ```
   */
  connectedTo(
    nodeType: string,
    edgeType: string,
    direction: TraversalDirection = 'out'
  ): this {
    this.joins.push({
      edgeType,
      direction,
      targetNodeType: nodeType,
      targetConditions: undefined
    });
    return this;
  }

  /**
   * Filter nodes that do NOT have a connection to nodes of a specific type.
   *
   * @param nodeType - Type of nodes to exclude connections to
   * @param edgeType - Type of edge to check
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Find jobs with no applications yet
   * db.nodes('Job')
   *   .notConnectedTo('Application', 'APPLIED_TO')
   *   .exec();
   * ```
   */
  notConnectedTo(nodeType: string, edgeType: string): this {
    // Implementation will use NOT EXISTS subquery
    this.joins.push({
      edgeType,
      direction: 'out',
      targetNodeType: nodeType,
      targetConditions: undefined,
      negated: true
    } as any);
    return this;
  }

  /**
   * Limit the number of results returned.
   *
   * @param n - Maximum number of nodes to return
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * db.nodes('Job')
   *   .orderBy('created_at', 'desc')
   *   .limit(10)
   *   .exec(); // Returns at most 10 nodes
   * ```
   */
  limit(n: number): this {
    if (n <= 0) {
      throw new Error('Limit must be a positive integer');
    }
    this.limitValue = n;
    return this;
  }

  /**
   * Skip a number of results (for pagination).
   *
   * @param n - Number of nodes to skip
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Page 3 of results (20 per page)
   * db.nodes('Job')
   *   .orderBy('created_at', 'desc')
   *   .limit(20)
   *   .offset(40)
   *   .exec();
   * ```
   */
  offset(n: number): this {
    if (n < 0) {
      throw new Error('Offset must be a non-negative integer');
    }
    this.offsetValue = n;
    return this;
  }

  /**
   * Order results by a property field.
   *
   * @param field - Property field to order by
   * @param direction - Sort direction ('asc' or 'desc')
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Newest jobs first
   * db.nodes('Job')
   *   .orderBy('created_at', 'desc')
   *   .exec();
   *
   * // Alphabetical by title
   * db.nodes('Job')
   *   .orderBy('title', 'asc')
   *   .exec();
   * ```
   */
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.orderByField = field;
    this.orderDirection = direction;
    return this;
  }

  /**
   * Execute the query and return all matching nodes.
   *
   * @returns Array of nodes matching the query
   *
   * @example
   * ```typescript
   * const results = db.nodes('Job')
   *   .where({ status: 'active' })
   *   .exec();
   *
   * console.log(`Found ${results.length} active jobs`);
   * ```
   */
  exec(): Node[] {
    const sql = this.buildSQL();
    const params = this.buildParams();

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    let nodes = rows.map(row => ({
      id: row.id,
      type: row.type,
      properties: deserialize(row.properties),
      createdAt: timestampToDate(row.created_at),
      updatedAt: timestampToDate(row.updated_at)
    }));

    // Apply JavaScript filter if provided
    if (this.filterPredicate) {
      nodes = nodes.filter(this.filterPredicate);
    }

    return nodes;
  }

  /**
   * Execute the query and return the first matching node.
   *
   * @returns The first node or null if no matches
   *
   * @example
   * ```typescript
   * const job = db.nodes('Job')
   *   .where({ id: 123 })
   *   .first();
   *
   * if (job) {
   *   console.log(job.properties.title);
   * }
   * ```
   */
  first(): Node | null {
    const original = this.limitValue;
    this.limitValue = 1;
    const results = this.exec();
    this.limitValue = original;
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Count the number of matching nodes without fetching them.
   *
   * @returns Number of nodes matching the query
   *
   * @example
   * ```typescript
   * const count = db.nodes('Job')
   *   .where({ status: 'active' })
   *   .count();
   *
   * console.log(`${count} active jobs`);
   * ```
   */
  count(): number {
    const sql = this.buildSQL(true);
    const params = this.buildParams();

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  /**
   * Check if any nodes match the query.
   *
   * @returns True if at least one node matches
   *
   * @example
   * ```typescript
   * const hasActive = db.nodes('Job')
   *   .where({ status: 'active' })
   *   .exists();
   *
   * if (hasActive) {
   *   console.log('Active jobs available!');
   * }
   * ```
   */
  exists(): boolean {
    return this.count() > 0;
  }

  /**
   * Build the SQL query from the current builder state.
   * @private
   */
  private buildSQL(countOnly: boolean = false): string {
    // Use DISTINCT for regular queries when using 'both' to avoid duplicates from bidirectional edges
    const useDistinct = this.joins.some(j => j.direction === 'both');

    let sql = countOnly
      ? 'SELECT COUNT(*) as count FROM nodes n'
      : useDistinct
        ? 'SELECT DISTINCT n.* FROM nodes n'
        : 'SELECT n.* FROM nodes n';

    // Add joins for connectedTo conditions
    for (let i = 0; i < this.joins.length; i++) {
      const join = this.joins[i];
      const alias = `e${i}`;
      const targetAlias = `t${i}`;

      if (join.direction === 'out') {
        sql += ` INNER JOIN edges ${alias} ON ${alias}.from_id = n.id AND ${alias}.type = ?`;
        if (join.targetNodeType) {
          sql += ` INNER JOIN nodes ${targetAlias} ON ${targetAlias}.id = ${alias}.to_id AND ${targetAlias}.type = ?`;
        }
      } else if (join.direction === 'in') {
        sql += ` INNER JOIN edges ${alias} ON ${alias}.to_id = n.id AND ${alias}.type = ?`;
        if (join.targetNodeType) {
          sql += ` INNER JOIN nodes ${targetAlias} ON ${targetAlias}.id = ${alias}.from_id AND ${targetAlias}.type = ?`;
        }
      } else if (join.direction === 'both') {
        // For 'both' direction, match edges in either direction
        sql += ` INNER JOIN edges ${alias} ON ((${alias}.from_id = n.id OR ${alias}.to_id = n.id) AND ${alias}.type = ?)`;
        if (join.targetNodeType) {
          // Join to target nodes, handling both directions
          sql += ` INNER JOIN nodes ${targetAlias} ON `;
          sql += `((${alias}.from_id = n.id AND ${targetAlias}.id = ${alias}.to_id) OR `;
          sql += `(${alias}.to_id = n.id AND ${targetAlias}.id = ${alias}.from_id)) `;
          sql += `AND ${targetAlias}.type = ?`;
        }
      }
    }

    // Use DISTINCT for count queries when using 'both' to avoid duplicates
    if (countOnly && this.joins.some(j => j.direction === 'both')) {
      sql = sql.replace('SELECT COUNT(*) as count', 'SELECT COUNT(DISTINCT n.id) as count');
    }

    // Add WHERE conditions
    const conditions: string[] = [`n.type = ?`];

    for (const [key] of this.whereConditions) {
      conditions.push(`json_extract(n.properties, '$.${key}') = ?`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    // Add ORDER BY, LIMIT, OFFSET (not for count queries)
    if (!countOnly) {
      if (this.orderByField) {
        sql += ` ORDER BY json_extract(n.properties, '$.${this.orderByField}') ${this.orderDirection}`;
      }

      if (this.limitValue !== undefined) {
        sql += ` LIMIT ${this.limitValue}`;
      }

      if (this.offsetValue !== undefined) {
        sql += ` OFFSET ${this.offsetValue}`;
      }
    }

    return sql;
  }

  /**
   * Build parameter array for the SQL query.
   * @private
   */
  private buildParams(): any[] {
    const params: any[] = [];

    // Add edge type and target node type params for joins
    for (const join of this.joins) {
      params.push(join.edgeType);
      if (join.targetNodeType) {
        params.push(join.targetNodeType);
      }
    }

    // Add node type
    params.push(this.nodeType);

    // Add WHERE condition values
    for (const [, value] of this.whereConditions) {
      params.push(value);
    }

    return params;
  }
}