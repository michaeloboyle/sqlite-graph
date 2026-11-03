import Database from 'better-sqlite3';
import { Node, TraversalStep } from '../types';
import { deserialize, timestampToDate } from '../utils/serialization';

/**
 * BFS queue entry. `prev` links back along the path for cycle detection.
 */
interface QueueEntry {
  nodeId: number;
  depth: number;
  prev?: QueueEntry;
}

/**
 * True if nodeId already appears on the path ending at entry.
 */
function isOnPath(entry: QueueEntry | undefined, nodeId: number): boolean {
  for (let e = entry; e; e = e.prev) {
    if (e.nodeId === nodeId) return true;
  }
  return false;
}

/**
 * Prepared statements are reused per connection; traversal runs the same
 * few queries once per hop.
 */
const statementCache = new WeakMap<Database.Database, Map<string, Database.Statement>>();

function cachedPrepare(db: Database.Database, sql: string): Database.Statement {
  let cache = statementCache.get(db);
  if (!cache) {
    cache = new Map();
    statementCache.set(db, cache);
  }
  let stmt = cache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    cache.set(sql, stmt);
  }
  return stmt;
}

/**
 * Graph traversal query builder for exploring relationships.
 * Provides methods for walking the graph in various directions and finding paths.
 *
 * @example
 * ```typescript
 * // Find similar jobs
 * const similar = db.traverse(jobId)
 *   .out('SIMILAR_TO')
 *   .maxDepth(2)
 *   .toArray();
 *
 * // Find shortest path
 * const path = db.traverse(job1Id)
 *   .shortestPath(job2Id);
 * ```
 */
export class TraversalQuery {
  private db: Database.Database;
  private startNodeId: number;
  private steps: TraversalStep[] = [];
  private maxDepthValue?: number;
  private minDepthValue?: number;
  private uniqueNodes: boolean = false;
  private filterPredicate?: (node: Node) => boolean;

  /**
   * Create a new traversal query builder.
   *
   * @param db - SQLite database instance
   * @param startNodeId - ID of node to start traversal from
   * @internal
   */
  constructor(db: Database.Database, startNodeId: number) {
    this.db = db;
    this.startNodeId = startNodeId;
  }

  /**
   * Traverse outgoing edges of a specific type.
   *
   * @param edgeType - Type of edges to follow
   * @param nodeType - Optional target node type to filter by
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Follow SIMILAR_TO edges to Job nodes
   * db.traverse(jobId)
   *   .out('SIMILAR_TO', 'Job')
   *   .toArray();
   * ```
   */
  out(edgeType: string, nodeType?: string): this {
    this.steps.push({
      edgeType,
      nodeType,
      direction: 'out'
    });
    return this;
  }

  /**
   * Traverse incoming edges of a specific type.
   *
   * @param edgeType - Type of edges to follow
   * @param nodeType - Optional source node type to filter by
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Find jobs that require this skill
   * db.traverse(skillId)
   *   .in('REQUIRES', 'Job')
   *   .toArray();
   * ```
   */
  in(edgeType: string, nodeType?: string): this {
    this.steps.push({
      edgeType,
      nodeType,
      direction: 'in'
    });
    return this;
  }

  /**
   * Traverse edges in both directions.
   *
   * @param edgeType - Type of edges to follow
   * @param nodeType - Optional node type to filter by
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Find all connected nodes via RELATED edge
   * db.traverse(nodeId)
   *   .both('RELATED')
   *   .toArray();
   * ```
   */
  both(edgeType: string, nodeType?: string): this {
    this.steps.push({
      edgeType,
      nodeType,
      direction: 'both'
    });
    return this;
  }

  /**
   * Filter traversed nodes by a predicate function.
   *
   * @param predicate - Function that returns true for nodes to include
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * db.traverse(jobId)
   *   .out('SIMILAR_TO')
   *   .filter(node => node.properties.status === 'active')
   *   .toArray();
   * ```
   */
  filter(predicate: (node: Node) => boolean): this {
    if (!this.filterPredicate) {
      this.filterPredicate = predicate;
    } else {
      const existing = this.filterPredicate;
      this.filterPredicate = (node) => existing(node) && predicate(node);
    }
    return this;
  }

  /**
   * Ensure each node appears only once in results.
   *
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // No duplicate nodes in traversal
   * db.traverse(jobId)
   *   .out('SIMILAR_TO')
   *   .unique()
   *   .toArray();
   * ```
   */
  unique(): this {
    this.uniqueNodes = true;
    return this;
  }

  /**
   * Set maximum traversal depth (number of hops).
   *
   * @param depth - Maximum number of edges to traverse
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Find jobs up to 2 hops away
   * db.traverse(jobId)
   *   .out('SIMILAR_TO')
   *   .maxDepth(2)
   *   .toArray();
   * ```
   */
  maxDepth(depth: number): this {
    if (depth < 0) {
      throw new Error('Max depth must be non-negative');
    }
    this.maxDepthValue = depth;
    return this;
  }

  /**
   * Set minimum traversal depth (skip nodes too close).
   *
   * @param depth - Minimum number of edges from start
   * @returns This query builder for chaining
   *
   * @example
   * ```typescript
   * // Skip immediate neighbors, start at 2 hops
   * db.traverse(jobId)
   *   .out('SIMILAR_TO')
   *   .minDepth(2)
   *   .toArray();
   * ```
   */
  minDepth(depth: number): this {
    if (depth < 0) {
      throw new Error('Min depth must be non-negative');
    }
    this.minDepthValue = depth;
    return this;
  }

  /**
   * Execute traversal and return all reachable nodes.
   *
   * Without maxDepth(), each defined step is followed once (`.out('X')` is one hop),
   * extended to minDepth() when that is deeper.
   * Without unique(), a node is returned once per distinct path; a path never
   * revisits a node, so cycles terminate.
   *
   * @returns Array of nodes reached during traversal
   *
   * @example
   * ```typescript
   * const nodes = db.traverse(jobId)
   *   .out('SIMILAR_TO')
   *   .maxDepth(3)
   *   .toArray();
   *
   * console.log(`Found ${nodes.length} similar jobs`);
   * ```
   */
  toArray(): Node[] {
    const results: Node[] = [];
    const seen = new Set<number>([this.startNodeId]);
    const queue: QueueEntry[] = [{ nodeId: this.startNodeId, depth: 0 }];

    // Head index instead of queue.shift(), which is O(n) per dequeue
    for (let head = 0; head < queue.length; head++) {
      const entry = queue[head];
      const { nodeId, depth } = entry;

      const node = this.getNode(nodeId);
      if (!node) continue;

      // The start node is never returned or filtered
      if (depth > 0) {
        if (this.filterPredicate && !this.filterPredicate(node)) {
          continue;
        }
        if (this.minDepthValue === undefined || depth >= this.minDepthValue) {
          results.push(node);
        }
      }

      if (this.steps.length === 0) continue;
      // Without maxDepth(), follow each defined step once, but reach minDepth()
      const limit = this.maxDepthValue ?? Math.max(this.steps.length, this.minDepthValue ?? 0);
      if (depth >= limit) continue;

      const step = this.steps[Math.min(depth, this.steps.length - 1)];
      for (const neighborId of this.getNeighbors(nodeId, step)) {
        if (this.uniqueNodes) {
          // Mark on enqueue so duplicates never enter the queue
          if (seen.has(neighborId)) continue;
          seen.add(neighborId);
        } else if (isOnPath(entry, neighborId)) {
          // Without unique(), nodes repeat once per distinct path,
          // but never along one path, so cycles terminate
          continue;
        }
        queue.push({ nodeId: neighborId, depth: depth + 1, prev: entry });
      }
    }

    return results;
  }

  /**
   * Execute traversal and return paths (array of node arrays).
   *
   * @returns Array of paths, where each path is an array of nodes
   *
   * @example
   * ```typescript
   * const paths = db.traverse(jobId)
   *   .out('SIMILAR_TO')
   *   .maxDepth(2)
   *   .toPaths();
   *
   * paths.forEach(path => {
   *   console.log('Path:', path.map(n => n.id).join(' -> '));
   * });
   * ```
   */
  toPaths(): Node[][] {
    const paths: Node[][] = [];
    const queue: Array<QueueEntry & { path: Node[] }> = [
      { nodeId: this.startNodeId, depth: 0, path: [] }
    ];

    for (let head = 0; head < queue.length; head++) {
      const entry = queue[head];
      const { nodeId, path, depth } = entry;

      const node = this.getNode(nodeId);
      if (!node) continue;

      // Apply filter
      if (this.filterPredicate && !this.filterPredicate(node)) {
        continue;
      }

      const newPath = [...path, node];

      // Add complete path if we've traversed at least one step
      if (depth > 0) {
        paths.push(newPath);
      }

      if (this.steps.length === 0) continue;
      if (this.maxDepthValue !== undefined && depth >= this.maxDepthValue) continue;

      const step = this.steps[Math.min(depth, this.steps.length - 1)];
      for (const neighborId of this.getNeighbors(nodeId, step)) {
        // Cycle detection: skip nodes already on this path
        if (isOnPath(entry, neighborId)) continue;
        queue.push({ nodeId: neighborId, depth: depth + 1, path: newPath, prev: entry });
      }
    }

    return paths;
  }

  /**
   * Find the shortest path to a target node using BFS.
   *
   * @param targetNodeId - ID of target node to find path to
   * @returns Array of nodes representing the shortest path, or null if no path exists
   *
   * @example
   * ```typescript
   * const path = db.traverse(job1Id)
   *   .shortestPath(job2Id);
   *
   * if (path) {
   *   console.log('Path:', path.map(n => n.properties.title).join(' -> '));
   * }
   * ```
   */
  shortestPath(targetNodeId: number): Node[] | null {
    const visited = new Set<number>();
    const parent = new Map<number, number>();
    const queue: number[] = [this.startNodeId];

    visited.add(this.startNodeId);

    for (let head = 0; head < queue.length; head++) {
      const currentId = queue[head];

      // Found target
      if (currentId === targetNodeId) {
        return this.reconstructPath(parent, targetNodeId);
      }

      // Get all neighbors (using any edge type if no steps defined)
      const neighbors = this.steps.length > 0
        ? this.getNeighbors(currentId, this.steps[0])
        : this.getAllNeighbors(currentId);

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          parent.set(neighborId, currentId);
          queue.push(neighborId);
        }
      }
    }

    return null; // No path found
  }

  /**
   * Find paths to a target node with optional constraints.
   * Wrapper that delegates to toPaths() or allPaths() based on options.
   *
   * @param targetNodeId - ID of target node
   * @param options - Optional path finding configuration
   * @param options.maxPaths - Maximum number of paths to return (uses allPaths if specified)
   * @param options.maxDepth - Maximum depth to search (overrides traversal maxDepth)
   * @returns Array of paths, where each path is an array of nodes
   *
   * @example
   * ```typescript
   * // Find all paths (uses toPaths internally)
   * const allPaths = db.traverse(job1Id).paths(job2Id);
   *
   * // Limit number of paths (uses allPaths internally)
   * const limitedPaths = db.traverse(job1Id).paths(job2Id, { maxPaths: 5 });
   *
   * // With maxDepth constraint
   * const shortPaths = db.traverse(job1Id).paths(job2Id, { maxDepth: 3 });
   * ```
   */
  paths(targetNodeId: number, options?: {
    maxPaths?: number;
    maxDepth?: number;
  }): Node[][] {
    // Apply maxDepth if provided in options
    if (options?.maxDepth !== undefined) {
      this.maxDepth(options.maxDepth);
    }

    // Use allPaths if maxPaths is specified, otherwise use toPaths logic
    if (options?.maxPaths !== undefined) {
      return this.allPaths(targetNodeId, options.maxPaths);
    }

    // Filter toPaths() results to only include paths ending at target
    const allPaths = this.toPaths();
    return allPaths.filter(path =>
      path.length > 0 && path[path.length - 1].id === targetNodeId
    );
  }

  /**
   * Find all paths to a target node (up to a maximum number).
   *
   * @param targetNodeId - ID of target node
   * @param maxPaths - Maximum number of paths to return (default: 10)
   * @returns Array of paths, where each path is an array of nodes
   *
   * @example
   * ```typescript
   * const paths = db.traverse(job1Id)
   *   .allPaths(job2Id, 5);
   *
   * console.log(`Found ${paths.length} paths`);
   * ```
   */
  allPaths(targetNodeId: number, maxPaths: number = 10): Node[][] {
    const paths: Node[][] = [];
    const visited = new Set<number>();

    const dfs = (currentId: number, path: Node[], depth: number) => {
      if (paths.length >= maxPaths) return;
      if (this.maxDepthValue !== undefined && depth > this.maxDepthValue) return;

      if (currentId === targetNodeId && depth > 0) {
        paths.push([...path]);
        return;
      }

      visited.add(currentId);

      const neighbors = this.steps.length > 0
        ? this.getNeighbors(currentId, this.steps[Math.min(depth, this.steps.length - 1)])
        : this.getAllNeighbors(currentId);

      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          const node = this.getNode(neighborId);
          if (node) {
            dfs(neighborId, [...path, node], depth + 1);
          }
        }
      }

      visited.delete(currentId);
    };

    const startNode = this.getNode(this.startNodeId);
    if (startNode) {
      dfs(this.startNodeId, [startNode], 0);
    }

    return paths;
  }

  /**
   * Get a node by ID.
   * @private
   */
  private getNode(id: number): Node | null {
    const stmt = cachedPrepare(this.db, 'SELECT * FROM nodes WHERE id = ?');
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
   * Get neighbor node IDs for a traversal step.
   * @private
   */
  private getNeighbors(nodeId: number, step: TraversalStep): number[] {
    let sql: string;
    const params: any[] = [nodeId, step.edgeType];

    if (step.direction === 'out') {
      sql = `
        SELECT e.to_id as id
        FROM edges e
        WHERE e.from_id = ? AND e.type = ?
      `;
      if (step.nodeType) {
        sql += ` AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = e.to_id AND n.type = ?)`;
        params.push(step.nodeType);
      }
    } else if (step.direction === 'in') {
      sql = `
        SELECT e.from_id as id
        FROM edges e
        WHERE e.to_id = ? AND e.type = ?
      `;
      if (step.nodeType) {
        sql += ` AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = e.from_id AND n.type = ?)`;
        params.push(step.nodeType);
      }
    } else {
      // both directions; the node type filter must cover both UNION branches
      sql = `
        SELECT u.id FROM (
          SELECT e.to_id AS id FROM edges e WHERE e.from_id = ? AND e.type = ?
          UNION
          SELECT e.from_id AS id FROM edges e WHERE e.to_id = ? AND e.type = ?
        ) u
      `;
      params.push(nodeId, step.edgeType);
      if (step.nodeType) {
        sql += ` WHERE EXISTS (SELECT 1 FROM nodes n WHERE n.id = u.id AND n.type = ?)`;
        params.push(step.nodeType);
      }
    }

    const stmt = cachedPrepare(this.db, sql);
    const rows = stmt.all(...params) as Array<{ id: number }>;
    return rows.map(row => row.id);
  }

  /**
   * Get all neighbor node IDs (any edge type).
   * @private
   */
  private getAllNeighbors(nodeId: number): number[] {
    const sql = `
      SELECT to_id as id FROM edges WHERE from_id = ?
      UNION
      SELECT from_id as id FROM edges WHERE to_id = ?
    `;
    const stmt = cachedPrepare(this.db, sql);
    const rows = stmt.all(nodeId, nodeId) as Array<{ id: number }>;
    return rows.map(row => row.id);
  }

  /**
   * Reconstruct path from parent map (for BFS shortest path).
   * @private
   */
  private reconstructPath(parent: Map<number, number>, targetId: number): Node[] {
    const path: Node[] = [];
    let currentId: number | undefined = targetId;

    while (currentId !== undefined) {
      const node = this.getNode(currentId);
      if (node) {
        path.unshift(node);
      }
      currentId = parent.get(currentId);
    }

    return path;
  }
}