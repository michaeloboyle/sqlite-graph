/**
 * sqlite-graph - High-performance graph database built on SQLite with fluent query DSL
 *
 * @packageDocumentation
 * @module sqlite-graph
 *
 * @example
 * ```typescript
 * import { GraphDatabase } from 'sqlite-graph';
 *
 * const db = await GraphDatabase.create('./graph.db');
 *
 * const job = await db.createNode('Job', { title: 'Engineer', status: 'active' });
 * const company = await db.createNode('Company', { name: 'TechCorp' });
 * await db.createEdge(job.id, 'POSTED_BY', company.id);
 *
 * const activeJobs = await db.nodes('Job')
 *   .where({ status: 'active' })
 *   .exec();
 * ```
 */

// Core classes
export { GraphDatabase } from './core/Database';

// Query builders
export { NodeQuery } from './query/NodeQuery';
export { TraversalQuery } from './query/TraversalQuery';

// Type definitions
export type {
  Node,
  Edge,
  NodeData,
  GraphSchema,
  DatabaseOptions,
  QueryOptions,
  TraversalOptions,
  TraversalDirection,
  GraphExport
} from './types';

// Merge operation types
export type {
  MergeOptions,
  EdgeMergeOptions,
  MergeResult,
  EdgeMergeResult,
  MergeConflictError,
  MergePerformanceWarning,
  IndexInfo
} from './types/merge';

// Utility functions (for advanced usage)
export { serialize, deserialize, timestampToDate, dateToTimestamp } from './utils/serialization';
export {
  validateNodeType,
  validateEdgeType,
  validateNodeProperties,
  validateNodeId
} from './utils/validation';

// Concurrency utilities (production best practices)
export {
  enableWAL,
  withRetry,
  WriteQueue,
  initializeConcurrency
} from './utils/concurrency';

export type {
  WALOptions,
  RetryOptions
} from './utils/concurrency';