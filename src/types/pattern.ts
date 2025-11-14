/**
 * Phase 3: Pattern Matching Type Definitions
 * IP-Safe original design for declarative graph pattern matching
 */

/**
 * Base entity type for nodes and edges in pattern results
 */
export interface GraphEntity {
  id: number;
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Graph node entity with timestamps
 */
export interface GraphNode extends GraphEntity {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Graph edge entity with from/to references
 */
export interface GraphEdge extends GraphEntity {
  from: number;
  to: number;
  createdAt: Date;
}

/**
 * Direction for edge traversal in patterns
 */
export type PatternDirection = 'in' | 'out' | 'both';

/**
 * Property filter for WHERE clauses with operator support
 */
export type PropertyFilter = {
  [key: string]:
    | unknown
    | {
        $gt?: unknown;
        $gte?: unknown;
        $lt?: unknown;
        $lte?: unknown;
        $in?: unknown[];
        $ne?: unknown;
      };
};

/**
 * Internal representation of a pattern step
 * @internal
 */
export interface PatternStep {
  type: 'node' | 'edge';
  variableName?: string; // For nodes
  nodeType?: string; // For nodes
  edgeType?: string; // For edges
  direction?: PatternDirection; // For edges
  isStart?: boolean;
  isEnd?: boolean;
}

/**
 * Variable information for tracking in patterns
 * @internal
 */
export interface VariableInfo {
  variableName: string;
  nodeType?: string;
  stepIndex: number;
  isCyclicReference?: boolean;
}

/**
 * Pattern match result containing variable bindings and metadata
 */
export type PatternMatch<T extends Record<string, GraphEntity>> = T & {
  // Metadata about the match
  _meta: {
    pathLength: number;
    executionTime: number;
  };
};

/**
 * Query execution plan information
 */
export interface QueryPlan {
  sql: string;
  estimatedCost: number;
  joinOrder: string[];
  indexesUsed: string[];
}

/**
 * Pattern error codes for machine-readable error handling
 */
export type PatternErrorCode =
  | 'INVALID_PATTERN'
  | 'UNDEFINED_VARIABLE'
  | 'CYCLIC_TYPE_MISMATCH'
  | 'INVALID_DIRECTION'
  | 'INVALID_FILTER';

/**
 * Error class for pattern matching errors
 */
export class PatternError extends Error {
  constructor(
    message: string,
    public code: PatternErrorCode
  ) {
    super(message);
    this.name = 'PatternError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PatternError.prototype);
  }
}
