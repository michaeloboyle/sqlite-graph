import Database from 'better-sqlite3';
import { initializeSchema } from './Schema';
import { NodeQuery } from '../query/NodeQuery';
import { TraversalQuery } from '../query/TraversalQuery';
import { PatternQuery } from '../query/PatternQuery';
import { TransactionContext } from './Transaction';
import {
  Node,
  Edge,
  NodeData,
  GraphSchema,
  DatabaseOptions,
  GraphExport
} from '../types';
import {
  MergeOptions,
  EdgeMergeOptions,
  MergeResult,
  EdgeMergeResult,
  MergeConflictError,
  MergePerformanceWarning,
  IndexInfo
} from '../types/merge';
import { serialize, deserialize, timestampToDate } from '../utils/serialization';
import {
  validateNodeType,
  validateEdgeType,
  validateNodeProperties,
  validateNodeId
} from '../utils/validation';

/**
 * Main graph database class providing CRUD operations for nodes and edges,
 * fluent query DSL, and graph traversal capabilities.
 *
 * @example
 * ```typescript
 * const db = new GraphDatabase('./graph.db');
 *
 * const job = db.createNode('Job', {
 *   title: 'Senior Engineer',
 *   status: 'active'
 * });
 *
 * const company = db.createNode('Company', {
 *   name: 'TechCorp'
 * });
 *
 * db.createEdge(job.id, 'POSTED_BY', company.id);
 *
 * const activeJobs = db.nodes('Job')
 *   .where({ status: 'active' })
 *   .exec();
 * ```
 */
export class GraphDatabase {
  /**
   * Underlying better-sqlite3 database instance
   * Exposed for advanced usage (pragma settings, WAL mode, etc.)
   * @readonly
   */
  public readonly db: Database.Database;
  private schema?: GraphSchema;
  private preparedStatements: Map<string, Database.Statement>;

  /**
   * Creates a new graph database instance.
   *
   * @param path - Path to SQLite database file. Use ':memory:' for in-memory database.
   * @param options - Database configuration options
   * @param options.schema - Optional graph schema for validation
   * @param options.readonly - Open database in read-only mode
   * @param options.fileMustExist - Require database file to exist
   * @param options.timeout - Busy timeout in milliseconds
   * @param options.verbose - Function to call for each SQL statement
   *
   * @throws {Error} If database file doesn't exist and fileMustExist is true
   * @throws {Error} If database initialization fails
   *
   * @example
   * ```typescript
   * // In-memory database
   * const db = new GraphDatabase(':memory:');
   *
   * // File-based with schema
   * const db = new GraphDatabase('./graph.db', {
   *   schema: {
   *     nodes: {
   *       Job: { properties: ['title', 'status'] },
   *       Company: { properties: ['name'] }
   *     },
   *     edges: {
   *       POSTED_BY: { from: 'Job', to: 'Company' }
   *     }
   *   }
   * });
   * ```
   */
  constructor(path: string, options?: DatabaseOptions) {
    this.db = new Database(path, options);
    this.schema = options?.schema;
    this.preparedStatements = new Map();

    // Initialize database schema
    initializeSchema(this.db);

    // Prepare common statements for performance
    this.prepareStatements();
  }

  /**
   * Prepare frequently used SQL statements for better performance.
   * @private
   */
  private prepareStatements(): void {
    this.preparedStatements.set(
      'insertNode',
      this.db.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?) RETURNING *')
    );
    this.preparedStatements.set(
      'getNode',
      this.db.prepare('SELECT * FROM nodes WHERE id = ?')
    );
    this.preparedStatements.set(
      'updateNode',
      this.db.prepare(
        "UPDATE nodes SET properties = ?, updated_at = strftime('%s', 'now') WHERE id = ? RETURNING *"
      )
    );
    this.preparedStatements.set(
      'deleteNode',
      this.db.prepare('DELETE FROM nodes WHERE id = ?')
    );
    this.preparedStatements.set(
      'insertEdge',
      this.db.prepare(
        'INSERT INTO edges (type, from_id, to_id, properties) VALUES (?, ?, ?, ?) RETURNING *'
      )
    );
    this.preparedStatements.set(
      'getEdge',
      this.db.prepare('SELECT * FROM edges WHERE id = ?')
    );
    this.preparedStatements.set(
      'deleteEdge',
      this.db.prepare('DELETE FROM edges WHERE id = ?')
    );
  }

  /**
   * Create a new node in the graph database.
   *
   * @template T - Type of the node properties
   * @param type - Node type (e.g., 'Job', 'Company', 'Skill')
   * @param properties - Node properties as key-value object
   * @returns The created node with assigned ID and timestamps
   *
   * @throws {Error} If node type is invalid
   * @throws {Error} If properties validation fails (when schema is defined)
   * @throws {Error} If database insert fails
   *
   * @example
   * ```typescript
   * const job = db.createNode('Job', {
   *   title: 'Senior Agentic Engineer',
   *   url: 'https://example.com/job/123',
   *   status: 'discovered',
   *   salary: { min: 150000, max: 200000 }
   * });
   *
   * console.log(job.id); // 1
   * console.log(job.createdAt); // 2025-10-27T...
   * ```
   */
  createNode<T extends NodeData = NodeData>(type: string, properties: T): Node<T> {
    validateNodeType(type, this.schema);
    validateNodeProperties(type, properties, this.schema);

    const stmt = this.preparedStatements.get('insertNode')!;
    const row = stmt.get(type, serialize(properties)) as any;

    return {
      id: row.id,
      type: row.type,
      properties: deserialize<T>(row.properties),
      createdAt: timestampToDate(row.created_at),
      updatedAt: timestampToDate(row.updated_at)
    };
  }

  /**
   * Retrieve a node by its ID.
   *
   * @param id - Node ID
   * @returns The node if found, null otherwise
   *
   * @throws {Error} If ID is invalid (not a positive integer)
   *
   * @example
   * ```typescript
   * const node = db.getNode(1);
   * if (node) {
   *   console.log(node.type, node.properties);
   * }
   * ```
   */
  getNode(id: number): Node | null {
    validateNodeId(id);

    const stmt = this.preparedStatements.get('getNode')!;
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      properties: deserialize(row.properties),
      createdAt: timestampToDate(row.created_at),
      updatedAt: timestampToDate(row.updated_at)
    };
  }

  /**
   * Update node properties. Merges with existing properties.
   *
   * @param id - Node ID
   * @param properties - Partial properties to update
   * @returns The updated node
   *
   * @throws {Error} If node doesn't exist
   * @throws {Error} If ID is invalid
   *
   * @example
   * ```typescript
   * const updated = db.updateNode(1, {
   *   status: 'applied',
   *   appliedAt: new Date().toISOString()
   * });
   * ```
   */
  updateNode(id: number, properties: Partial<NodeData>): Node {
    validateNodeId(id);

    const existing = this.getNode(id);
    if (!existing) {
      throw new Error(`Node with ID ${id} not found`);
    }

    const merged = { ...existing.properties, ...properties };
    const stmt = this.preparedStatements.get('updateNode')!;
    const row = stmt.get(serialize(merged), id) as any;

    return {
      id: row.id,
      type: row.type,
      properties: deserialize(row.properties),
      createdAt: timestampToDate(row.created_at),
      updatedAt: timestampToDate(row.updated_at)
    };
  }

  /**
   * Delete a node and all connected edges.
   *
   * @param id - Node ID
   * @returns True if node was deleted, false if not found
   *
   * @throws {Error} If ID is invalid
   *
   * @example
   * ```typescript
   * const deleted = db.deleteNode(1);
   * console.log(deleted ? 'Deleted' : 'Not found');
   * ```
   */
  deleteNode(id: number): boolean {
    validateNodeId(id);

    const stmt = this.preparedStatements.get('deleteNode')!;
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Create an edge (relationship) between two nodes.
   *
   * @template T - Type of the edge properties
   * @param from - Source node ID
   * @param type - Edge type (e.g., 'POSTED_BY', 'REQUIRES', 'SIMILAR_TO')
   * @param to - Target node ID
   * @param properties - Optional edge properties
   * @returns The created edge with assigned ID
   *
   * @throws {Error} If edge type is invalid
   * @throws {Error} If from/to nodes don't exist
   * @throws {Error} If schema validation fails
   *
   * @example
   * ```typescript
   * // Natural reading: "job REQUIRES skill"
   * const edge = db.createEdge(jobId, 'REQUIRES', skillId, {
   *   level: 'expert',
   *   required: true
   * });
   * ```
   */
  createEdge<T extends NodeData = NodeData>(
    from: number,
    type: string,
    to: number,
    properties?: T
  ): Edge<T> {
    validateEdgeType(type, this.schema);
    validateNodeId(from);
    validateNodeId(to);

    // Verify nodes exist
    const fromNode = this.getNode(from);
    const toNode = this.getNode(to);

    if (!fromNode) {
      throw new Error(`Source node with ID ${from} not found`);
    }
    if (!toNode) {
      throw new Error(`Target node with ID ${to} not found`);
    }

    const stmt = this.preparedStatements.get('insertEdge')!;
    const row = stmt.get(
      type,
      from,
      to,
      properties ? serialize(properties) : null
    ) as any;

    return {
      id: row.id,
      type: row.type,
      from: row.from_id,
      to: row.to_id,
      properties: row.properties ? deserialize<T>(row.properties) : undefined,
      createdAt: timestampToDate(row.created_at)
    };
  }

  /**
   * Retrieve an edge by its ID.
   *
   * @param id - Edge ID
   * @returns The edge if found, null otherwise
   *
   * @example
   * ```typescript
   * const edge = db.getEdge(1);
   * if (edge) {
   *   console.log(`${edge.from} -> ${edge.to} (${edge.type})`);
   * }
   * ```
   */
  getEdge(id: number): Edge | null {
    validateNodeId(id);

    const stmt = this.preparedStatements.get('getEdge')!;
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      from: row.from_id,
      to: row.to_id,
      properties: row.properties ? deserialize(row.properties) : undefined,
      createdAt: timestampToDate(row.created_at)
    };
  }

  /**
   * Delete an edge.
   *
   * @param id - Edge ID
   * @returns True if edge was deleted, false if not found
   *
   * @example
   * ```typescript
   * const deleted = db.deleteEdge(1);
   * ```
   */
  deleteEdge(id: number): boolean {
    validateNodeId(id);

    const stmt = this.preparedStatements.get('deleteEdge')!;
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Start a fluent query for nodes of a specific type.
   *
   * @param type - Node type to query
   * @returns A NodeQuery builder for method chaining
   *
   * @example
   * ```typescript
   * const activeJobs = db.nodes('Job')
   *   .where({ status: 'active' })
   *   .connectedTo('Company', 'POSTED_BY')
   *   .orderBy('created_at', 'desc')
   *   .limit(10)
   *   .exec();
   * ```
   */
  nodes(type: string): NodeQuery {
    return new NodeQuery(this.db, type);
  }

  /**
   * Start a graph traversal from a specific node.
   *
   * @param startNodeId - ID of the node to start traversal from
   * @returns A TraversalQuery builder for graph operations
   *
   * @throws {Error} If start node doesn't exist
   *
   * @example
   * ```typescript
   * // Find similar jobs up to 2 hops away
   * const similarJobs = db.traverse(jobId)
   *   .out('SIMILAR_TO')
   *   .maxDepth(2)
   *   .toArray();
   *
   * // Find shortest path between two jobs
   * const path = db.traverse(job1Id)
   *   .shortestPath(job2Id);
   * ```
   */
  traverse(startNodeId: number): TraversalQuery {
    validateNodeId(startNodeId);

    const node = this.getNode(startNodeId);
    if (!node) {
      throw new Error(`Start node with ID ${startNodeId} not found`);
    }

    return new TraversalQuery(this.db, startNodeId);
  }

  /**
   * Start a declarative pattern matching query (Phase 3).
   *
   * @returns A PatternQuery builder for fluent pattern matching
   *
   * @example
   * ```typescript
   * // Find jobs posted by companies where friends work
   * const results = db.pattern()
   *   .start('person', 'Person')
   *   .where({ person: { id: userId } })
   *   .through('KNOWS', 'both')
   *   .node('friend', 'Person')
   *   .through('WORKS_AT', 'out')
   *   .node('company', 'Company')
   *   .through('POSTED_BY', 'in')
   *   .end('job', 'Job')
   *   .select(['job', 'company'])
   *   .exec();
   * ```
   */
  pattern<T extends Record<string, unknown> = Record<string, unknown>>(): PatternQuery<T> {
    return new PatternQuery<T>(this.db);
  }

  /**
   * Execute a function within a transaction.
   * Automatically commits on success or rolls back on error, unless manually controlled.
   *
   * @template T - Return type of the transaction function
   * @param fn - Function to execute within transaction, receives TransactionContext
   * @returns The return value of the transaction function
   *
   * @throws {Error} If transaction function throws (after rollback)
   *
   * @example
   * ```typescript
   * // Automatic commit/rollback
   * const result = db.transaction((ctx) => {
   *   const job = db.createNode('Job', { title: 'Engineer' });
   *   const company = db.createNode('Company', { name: 'TechCorp' });
   *   db.createEdge(job.id, 'POSTED_BY', company.id);
   *   return { job, company };
   * });
   *
   * // Manual control with savepoints
   * db.transaction((ctx) => {
   *   const job = db.createNode('Job', { title: 'Test' });
   *   ctx.savepoint('job_created');
   *   try {
   *     db.createEdge(job.id, 'POSTED_BY', companyId);
   *   } catch (err) {
   *     ctx.rollbackTo('job_created');
   *   }
   *   ctx.commit();
   * });
   * ```
   */
  transaction<T>(fn: (ctx: TransactionContext) => T): T {
    // Start transaction
    this.db.prepare('BEGIN').run();

    const ctx = new TransactionContext(this.db);

    try {
      const result = fn(ctx);

      // Auto-commit if not manually finalized
      if (!ctx.isFinalized()) {
        ctx.commit();
      }

      return result;
    } catch (error) {
      // Auto-rollback on error if not manually finalized
      if (!ctx.isFinalized()) {
        ctx.rollback();
      }
      throw error;
    }
  }

  /**
   * Export the entire graph to a portable format.
   *
   * @returns Object containing all nodes and edges with metadata
   *
   * @example
   * ```typescript
   * const data = db.export();
   * fs.writeFileSync('graph-backup.json', JSON.stringify(data, null, 2));
   * ```
   */
  export(): GraphExport {
    const nodesStmt = this.db.prepare('SELECT * FROM nodes ORDER BY id');
    const edgesStmt = this.db.prepare('SELECT * FROM edges ORDER BY id');

    const nodes = nodesStmt.all().map((row: any) => ({
      id: row.id,
      type: row.type,
      properties: deserialize(row.properties),
      createdAt: timestampToDate(row.created_at),
      updatedAt: timestampToDate(row.updated_at)
    }));

    const edges = edgesStmt.all().map((row: any) => ({
      id: row.id,
      type: row.type,
      from: row.from_id,
      to: row.to_id,
      properties: row.properties ? deserialize(row.properties) : undefined,
      createdAt: timestampToDate(row.created_at)
    }));

    return {
      nodes,
      edges,
      metadata: {
        version: '1',
        exportedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Import graph data from export format.
   * Note: This does not clear existing data.
   *
   * @param data - Graph export data
   *
   * @throws {Error} If import fails
   *
   * @example
   * ```typescript
   * const data = JSON.parse(fs.readFileSync('graph-backup.json', 'utf8'));
   * db.import(data);
   * ```
   */
  import(data: GraphExport): void {
    this.transaction(() => {
      for (const node of data.nodes) {
        this.createNode(node.type, node.properties);
      }

      for (const edge of data.edges) {
        this.createEdge(edge.from, edge.type, edge.to, edge.properties);
      }
    });
  }

  /**
   * Close the database connection.
   * After calling this, the database instance should not be used.
   *
   * @example
   * ```typescript
   * db.close();
   * ```
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get the underlying better-sqlite3 database instance.
   * Use with caution - direct access bypasses query builder abstractions.
   *
   * @returns The raw SQLite database instance
   * @internal
   */
  getRawDb(): Database.Database {
    return this.db;
  }

  /**
   * Merge a node - create if not exists, update if exists.
   * Provides Cypher MERGE-like semantics with ON CREATE / ON MATCH support.
   *
   * @template T - Type of the node properties
   * @param type - Node type
   * @param matchProperties - Properties to match on (lookup criteria)
   * @param baseProperties - Properties for creation (merged with matchProperties)
   * @param options - Merge options with onCreate/onMatch semantics
   * @returns Result containing the node and whether it was created
   *
   * @throws {MergeConflictError} If multiple nodes match criteria
   * @throws {Error} If validation fails
   *
   * @example
   * ```typescript
   * // Simple upsert
   * const { node, created } = db.mergeNode('Company',
   *   { name: 'TechCorp' },
   *   { name: 'TechCorp', industry: 'Software' }
   * );
   *
   * // With ON CREATE / ON MATCH
   * const { node, created } = db.mergeNode('Job',
   *   { url: 'https://example.com/job/123' },
   *   { title: 'Engineer', status: 'active' },
   *   {
   *     onCreate: { discovered: new Date(), applicationStatus: 'not_applied' },
   *     onMatch: { lastSeen: new Date() }
   *   }
   * );
   * ```
   */
  mergeNode<T extends NodeData = NodeData>(
    type: string,
    matchProperties: Partial<T>,
    baseProperties?: T,
    options?: MergeOptions<T>
  ): MergeResult<T> {
    validateNodeType(type, this.schema);

    // Build WHERE clause for all match properties
    const matchKeys = Object.keys(matchProperties);
    if (matchKeys.length === 0) {
      throw new Error('Match properties cannot be empty for merge operation');
    }

    // Check for index on first match property (performance warning)
    if (options?.warnOnMissingIndex !== false && process.env.NODE_ENV !== 'production') {
      const firstMatchKey = matchKeys[0];
      const hasIndex = this.hasPropertyIndex(type, firstMatchKey);
      if (!hasIndex) {
        console.warn(new MergePerformanceWarning(type, firstMatchKey).message);
      }
    }

    return this.transaction(() => {
      // Build SQL to find matching node
      const whereConditions = matchKeys.map(
        (key) => `json_extract(properties, '$.${key}') = ?`
      );
      const sql = `
        SELECT * FROM nodes
        WHERE type = ? AND ${whereConditions.join(' AND ')}
      `;
      const matchValues = matchKeys.map((key) => (matchProperties as any)[key]);

      const stmt = this.db.prepare(sql);
      const rows = stmt.all(type, ...matchValues) as any[];

      if (rows.length > 1) {
        const nodes = rows.map((row) => ({
          id: row.id,
          type: row.type,
          properties: deserialize<T>(row.properties),
          createdAt: timestampToDate(row.created_at),
          updatedAt: timestampToDate(row.updated_at)
        }));
        throw new MergeConflictError(type, matchProperties as NodeData, nodes);
      }

      if (rows.length === 1) {
        // MATCH: Update with onMatch properties
        const existing = rows[0];
        const existingProps = deserialize<T>(existing.properties);
        const updateProps = options?.onMatch || {};
        const mergedProps = { ...existingProps, ...updateProps };

        validateNodeProperties(type, mergedProps as T, this.schema);

        const updateStmt = this.preparedStatements.get('updateNode')!;
        const updatedRow = updateStmt.get(serialize(mergedProps), existing.id) as any;

        return {
          node: {
            id: updatedRow.id,
            type: updatedRow.type,
            properties: deserialize<T>(updatedRow.properties),
            createdAt: timestampToDate(updatedRow.created_at),
            updatedAt: timestampToDate(updatedRow.updated_at)
          },
          created: false
        };
      } else {
        // CREATE: Insert with onCreate properties
        const createProps = {
          ...matchProperties,
          ...baseProperties,
          ...options?.onCreate
        } as T;

        validateNodeProperties(type, createProps, this.schema);

        const insertStmt = this.preparedStatements.get('insertNode')!;
        const newRow = insertStmt.get(type, serialize(createProps)) as any;

        return {
          node: {
            id: newRow.id,
            type: newRow.type,
            properties: deserialize<T>(newRow.properties),
            createdAt: timestampToDate(newRow.created_at),
            updatedAt: timestampToDate(newRow.updated_at)
          },
          created: true
        };
      }
    });
  }

  /**
   * Merge an edge - create if not exists, update if exists.
   * Ensures only one edge exists between two nodes with the given type.
   *
   * @template T - Type of the edge properties
   * @param from - Source node ID
   * @param type - Edge type
   * @param to - Target node ID
   * @param properties - Base edge properties
   * @param options - Edge merge options with onCreate/onMatch
   * @returns Result containing the edge and whether it was created
   *
   * @throws {Error} If nodes don't exist
   *
   * @example
   * ```typescript
   * // Simple edge merge
   * const { edge, created } = db.mergeEdge(jobId, 'POSTED_BY', companyId);
   *
   * // With timestamps
   * const { edge, created } = db.mergeEdge(
   *   jobId, 'POSTED_BY', companyId,
   *   { source: 'scraper' },
   *   {
   *     onCreate: { firstSeen: Date.now() },
   *     onMatch: { lastVerified: Date.now() }
   *   }
   * );
   * ```
   */
  mergeEdge<T extends NodeData = NodeData>(
    from: number,
    type: string,
    to: number,
    properties?: T,
    options?: EdgeMergeOptions<T>
  ): EdgeMergeResult<T> {
    validateEdgeType(type, this.schema);
    validateNodeId(from);
    validateNodeId(to);

    // Verify nodes exist
    const fromNode = this.getNode(from);
    const toNode = this.getNode(to);

    if (!fromNode) {
      throw new Error(`Source node with ID ${from} not found`);
    }
    if (!toNode) {
      throw new Error(`Target node with ID ${to} not found`);
    }

    return this.transaction(() => {
      // Find existing edges
      const stmt = this.db.prepare(`
        SELECT * FROM edges
        WHERE from_id = ? AND type = ? AND to_id = ?
      `);
      const rows = stmt.all(from, type, to) as any[];

      // Check for conflicts
      if (rows.length > 1) {
        const edges = rows.map((row) => ({
          id: row.id,
          type: row.type,
          from: row.from_id,
          to: row.to_id,
          properties: row.properties ? deserialize<T>(row.properties) : undefined,
          createdAt: timestampToDate(row.created_at)
        }));
        throw new MergeConflictError(
          `Edge ${type}`,
          { from, to } as any,
          edges as any
        );
      }

      const existing = rows[0];

      if (existing) {
        // MATCH: Merge baseProperties and onMatch properties
        const shouldUpdate = (properties && Object.keys(properties).length > 0) ||
                            (options?.onMatch && Object.keys(options.onMatch).length > 0);

        if (shouldUpdate) {
          const existingProps = existing.properties ? deserialize<T>(existing.properties) : {};
          const mergedProps = {
            ...existingProps,
            ...(properties || {}),
            ...options?.onMatch
          };

          const updateStmt = this.db.prepare(
            'UPDATE edges SET properties = ? WHERE id = ? RETURNING *'
          );
          const updatedRow = updateStmt.get(serialize(mergedProps), existing.id) as any;

          return {
            edge: {
              id: updatedRow.id,
              type: updatedRow.type,
              from: updatedRow.from_id,
              to: updatedRow.to_id,
              properties: deserialize<T>(updatedRow.properties),
              createdAt: timestampToDate(updatedRow.created_at)
            },
            created: false
          };
        }

        // Return existing unchanged
        return {
          edge: {
            id: existing.id,
            type: existing.type,
            from: existing.from_id,
            to: existing.to_id,
            properties: existing.properties ? deserialize<T>(existing.properties) : undefined,
            createdAt: timestampToDate(existing.created_at)
          },
          created: false
        };
      } else {
        // CREATE: Insert with onCreate properties
        const createProps = {
          ...properties,
          ...options?.onCreate
        } as T;

        const insertStmt = this.preparedStatements.get('insertEdge')!;
        const newRow = insertStmt.get(
          type,
          from,
          to,
          Object.keys(createProps).length > 0 ? serialize(createProps) : null
        ) as any;

        return {
          edge: {
            id: newRow.id,
            type: newRow.type,
            from: newRow.from_id,
            to: newRow.to_id,
            properties: newRow.properties ? deserialize<T>(newRow.properties) : undefined,
            createdAt: timestampToDate(newRow.created_at)
          },
          created: true
        };
      }
    });
  }

  /**
   * Create a property index for efficient merge operations.
   * Required for good performance when using mergeNode() on large datasets.
   *
   * @param nodeType - Node type to index
   * @param property - Property name to index
   * @param unique - Whether to enforce uniqueness (default: false)
   *
   * @example
   * ```typescript
   * // Create index for URL lookups
   * db.createPropertyIndex('Job', 'url');
   *
   * // Create unique index to prevent duplicates
   * db.createPropertyIndex('Job', 'url', true);
   *
   * // Now mergeNode is efficient
   * db.mergeNode('Job', { url: 'https://...' }, ...);
   * ```
   */
  createPropertyIndex(nodeType: string, property: string, unique = false): void {
    const indexName = `idx_merge_${nodeType}_${property}`;
    const uniqueClause = unique ? 'UNIQUE' : '';

    // Note: SQLite doesn't allow parameters in partial index WHERE clauses
    // Must use string concatenation (safe here as nodeType is validated)
    const sql = `
      CREATE ${uniqueClause} INDEX IF NOT EXISTS ${indexName}
      ON nodes(type, json_extract(properties, '$.${property}'))
      WHERE type = '${nodeType}'
    `;

    this.db.prepare(sql).run();
  }

  /**
   * Check if a property index exists for merge operations.
   *
   * @param nodeType - Node type
   * @param property - Property name
   * @returns True if index exists
   * @private
   */
  private hasPropertyIndex(nodeType: string, property: string): boolean {
    const indexName = `idx_merge_${nodeType}_${property}`;
    const stmt = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name = ?
    `);
    const result = stmt.get(indexName);
    return result !== undefined;
  }

  /**
   * List all custom indexes in the database.
   *
   * @returns Array of index information
   *
   * @example
   * ```typescript
   * const indexes = db.listIndexes();
   * indexes.forEach(idx => {
   *   console.log(`${idx.name}: ${idx.unique ? 'UNIQUE' : ''} ${idx.columns.join(', ')}`);
   * });
   * ```
   */
  listIndexes(): IndexInfo[] {
    const stmt = this.db.prepare(`
      SELECT name, tbl_name as 'table', sql
      FROM sqlite_master
      WHERE type = 'index' AND name LIKE 'idx_merge_%'
      ORDER BY name
    `);
    const rows = stmt.all() as any[];

    return rows.map((row) => {
      const isUnique = row.sql && row.sql.includes('UNIQUE');
      const whereMatch = row.sql ? row.sql.match(/WHERE\s+(.+)$/i) : null;

      return {
        name: row.name,
        table: row.table as 'nodes' | 'edges',
        columns: [row.name.replace('idx_merge_', '')],
        unique: isUnique,
        partial: whereMatch ? whereMatch[1] : undefined
      };
    });
  }

  /**
   * Drop a custom index.
   *
   * @param indexName - Name of the index to drop
   *
   * @example
   * ```typescript
   * db.dropIndex('idx_merge_Job_url');
   * ```
   */
  dropIndex(indexName: string): void {
    this.db.prepare(`DROP INDEX IF EXISTS ${indexName}`).run();
  }
}