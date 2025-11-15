/**
 * Phase 3: Bulk Operations Type Definitions
 * Efficient batch CRUD operations for graph databases
 */

/**
 * Node specification for bulk creation
 */
export interface NodeSpec {
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Edge specification for bulk creation
 */
export interface EdgeSpec {
  from: number;
  type: string;
  to: number;
  properties?: Record<string, unknown>;
}

/**
 * Result from bulk create operations
 */
export interface BulkCreateResult {
  /** Number of items created */
  created: number;
  /** IDs of created items */
  ids: number[];
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Result from bulk update operations
 */
export interface BulkUpdateResult {
  /** Number of items updated */
  updated: number;
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Result from bulk delete operations
 */
export interface BulkDeleteResult {
  /** Number of items deleted */
  deleted: number;
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Result from bulk upsert operations
 */
export interface BulkUpsertResult {
  /** Number of items created */
  created: number;
  /** Number of items updated */
  updated: number;
  /** IDs of all affected items */
  ids: number[];
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Bulk operation error codes for machine-readable error handling
 */
export type BulkErrorCode =
  | 'MISSING_NODE'
  | 'DUPLICATE_ID'
  | 'CONSTRAINT_VIOLATION'
  | 'TRANSACTION_FAILED'
  | 'INVALID_SPEC';

/**
 * Error class for bulk operation errors
 */
export class BulkOperationError extends Error {
  constructor(
    message: string,
    public code: BulkErrorCode,
    public failedItems?: unknown[]
  ) {
    super(message);
    this.name = 'BulkOperationError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, BulkOperationError.prototype);
  }
}
