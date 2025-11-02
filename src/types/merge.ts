import { NodeData, Node, Edge } from './index';

/**
 * Options for merge operations with ON CREATE / ON MATCH semantics
 */
export interface MergeOptions<T extends NodeData = NodeData> {
  /**
   * Properties to set only when creating a new node.
   * These properties are NOT applied when matching an existing node.
   *
   * @example
   * ```typescript
   * db.mergeNode('Job',
   *   { url: 'https://example.com/job/123' },
   *   { title: 'Engineer' },
   *   {
   *     onCreate: {
   *       discovered: new Date(),
   *       applicationStatus: 'not_applied'
   *     }
   *   }
   * );
   * ```
   */
  onCreate?: Partial<T>;

  /**
   * Properties to set only when matching an existing node.
   * These properties are NOT applied when creating a new node.
   *
   * @example
   * ```typescript
   * db.mergeNode('Job',
   *   { url: 'https://example.com/job/123' },
   *   { title: 'Engineer' },
   *   {
   *     onMatch: {
   *       lastSeen: new Date(),
   *       viewCount: /* increment logic *\/
   *     }
   *   }
   * );
   * ```
   */
  onMatch?: Partial<T>;

  /**
   * Warn if no index exists on match properties (default: true in dev).
   * Set to false to suppress performance warnings.
   *
   * @default true
   */
  warnOnMissingIndex?: boolean;
}

/**
 * Options for edge merge operations
 */
export interface EdgeMergeOptions<T extends NodeData = NodeData> {
  /**
   * Properties to set only when creating a new edge
   */
  onCreate?: Partial<T>;

  /**
   * Properties to set only when matching an existing edge
   */
  onMatch?: Partial<T>;
}

/**
 * Information about a database index
 */
export interface IndexInfo {
  /** Index name (e.g., 'idx_merge_Job_url') */
  name: string;

  /** Table the index applies to */
  table: 'nodes' | 'edges';

  /** Columns or expressions included in the index */
  columns: string[];

  /** Whether the index enforces uniqueness */
  unique: boolean;

  /** Optional WHERE clause for partial indexes */
  partial?: string;
}

/**
 * Error thrown when multiple nodes match merge criteria.
 * Indicates ambiguous match conditions that should be made more specific.
 *
 * @example
 * ```typescript
 * try {
 *   db.mergeNode('Company', { name: 'Tech' }, ...);
 * } catch (err) {
 *   if (err instanceof MergeConflictError) {
 *     console.log(`Found ${err.conflictingNodes.length} companies named "Tech"`);
 *     // Add more specific match criteria (e.g., location, url)
 *   }
 * }
 * ```
 */
export class MergeConflictError extends Error {
  constructor(
    public nodeType: string,
    public matchProperties: NodeData,
    public conflictingNodes: Node[]
  ) {
    super(
      `Multiple nodes match merge criteria for ${nodeType}: ` +
        `${JSON.stringify(matchProperties)}. Found ${conflictingNodes.length} matches. ` +
        `Ensure match properties uniquely identify nodes or add uniqueness constraints.`
    );
    this.name = 'MergeConflictError';
    Object.setPrototypeOf(this, MergeConflictError.prototype);
  }
}

/**
 * Warning issued when performing merge without an index on match properties.
 * This causes full table scans and degrades performance on large datasets.
 *
 * @example
 * ```typescript
 * // Warning issued here (no index on Job.url)
 * db.mergeNode('Job', { url: 'https://...' }, ...);
 *
 * // Fix: Create index before merging
 * db.createPropertyIndex('Job', 'url');
 * db.mergeNode('Job', { url: 'https://...' }, ...);  // Now efficient
 * ```
 */
export class MergePerformanceWarning extends Error {
  constructor(public nodeType: string, public property: string) {
    super(
      `MERGE on ${nodeType}.${property} without index. ` +
        `This will cause full table scans on large datasets. ` +
        `Create index with: db.createPropertyIndex('${nodeType}', '${property}')`
    );
    this.name = 'MergePerformanceWarning';
    Object.setPrototypeOf(this, MergePerformanceWarning.prototype);
  }
}

/**
 * Result of a merge operation indicating whether node was created or matched
 */
export interface MergeResult<T extends NodeData = NodeData> {
  /** The resulting node (created or matched) */
  node: Node<T>;

  /** Whether the node was newly created (true) or matched existing (false) */
  created: boolean;
}

/**
 * Result of an edge merge operation
 */
export interface EdgeMergeResult<T extends NodeData = NodeData> {
  /** The resulting edge (created or matched) */
  edge: Edge<T>;

  /** Whether the edge was newly created (true) or matched existing (false) */
  created: boolean;
}