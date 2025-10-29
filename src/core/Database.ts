import Database from 'better-sqlite3';
import { initializeSchema } from './Schema';
import { NodeQuery } from '../query/NodeQuery';
import { TraversalQuery } from '../query/TraversalQuery';
import { TransactionContext } from './Transaction';
import {
  Node,
  Edge,
  NodeData,
  GraphSchema,
  DatabaseOptions,
  GraphExport
} from '../types';
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
  private db: Database.Database;
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
}