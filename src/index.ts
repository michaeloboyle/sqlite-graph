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
 * const db = new GraphDatabase('./graph.db');
 *
 * const job = db.createNode('Job', { title: 'Engineer', status: 'active' });
 * const company = db.createNode('Company', { name: 'TechCorp' });
 * db.createEdge('POSTED_BY', job.id, company.id);
 *
 * const activeJobs = db.nodes('Job')
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

// Utility functions (for advanced usage)
export { serialize, deserialize, timestampToDate, dateToTimestamp } from './utils/serialization';
export {
  validateNodeType,
  validateEdgeType,
  validateNodeProperties,
  validateNodeId
} from './utils/validation';