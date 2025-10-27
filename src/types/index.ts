/**
 * Base type for node/edge property data
 */
export interface NodeData {
  [key: string]: any;
}

/**
 * Represents a node in the graph database
 */
export interface Node<T extends NodeData = NodeData> {
  id: number;
  type: string;
  properties: T;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents an edge (relationship) in the graph database
 */
export interface Edge<T extends NodeData = NodeData> {
  id: number;
  type: string;
  from: number;
  to: number;
  properties?: T;
  createdAt: Date;
}

/**
 * Schema definition for the graph database
 */
export interface GraphSchema {
  nodes: {
    [nodeType: string]: {
      properties?: string[];
      indexes?: string[];
    };
  };
  edges: {
    [edgeType: string]: {
      from: string;
      to: string;
      properties?: string[];
    };
  };
}

/**
 * Options for database initialization
 */
export interface DatabaseOptions {
  schema?: GraphSchema;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: (message?: any, ...additionalArgs: any[]) => void;
}

/**
 * Options for query execution
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  direction?: 'asc' | 'desc';
}

/**
 * Options for graph traversal
 */
export interface TraversalOptions {
  maxDepth?: number;
  minDepth?: number;
  direction?: 'out' | 'in' | 'both';
  edgeTypes?: string[];
  unique?: boolean;
}

/**
 * Direction for traversing edges
 */
export type TraversalDirection = 'out' | 'in' | 'both';

/**
 * Internal representation of a traversal step
 */
export interface TraversalStep {
  edgeType: string;
  nodeType?: string;
  direction: TraversalDirection;
}

/**
 * Internal query condition representation
 */
export interface Condition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in';
  value: any;
}

/**
 * Internal join condition for relationship queries
 */
export interface JoinCondition {
  edgeType: string;
  direction: TraversalDirection;
  targetNodeType?: string;
  targetConditions?: Partial<NodeData>;
}

/**
 * Graph export format
 */
export interface GraphExport {
  nodes: Node[];
  edges: Edge[];
  metadata?: {
    version: string;
    exportedAt: string;
  };
}