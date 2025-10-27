# Comprehensive Error Handling Strategy for sqlite-graph

## Research Summary

This document provides a comprehensive error handling specification for the sqlite-graph TypeScript graph database library, based on analysis of the existing codebase and industry best practices.

---

## 1. Current Error Handling State

### Existing Implementation Analysis

**Strengths:**
- Basic validation exists in `/src/utils/validation.ts`
- Simple error messages with context (e.g., "Node with ID 999 not found")
- Transaction rollback on error (automatic via better-sqlite3)
- Documentation includes error handling examples in `docs/ERROR-HANDLING.md`

**Gaps Identified:**
- **No custom error classes** - All errors are generic `Error` instances
- **Inconsistent error context** - Some errors lack structured metadata
- **No error codes** - Cannot programmatically distinguish error types
- **Limited type safety** - Error types not exposed in TypeScript definitions
- **No error recovery mechanisms** - Users must implement retry logic themselves
- **Missing error categories** - No distinction between client errors vs system errors
- **No validation error aggregation** - Single property failure stops entire operation

---

## 2. Custom Error Class Hierarchy

### Base Error Class

```typescript
/**
 * Base error class for all sqlite-graph errors
 * Extends Error with error codes and structured metadata
 */
export abstract class GraphDatabaseError extends Error {
  /**
   * Machine-readable error code for programmatic handling
   */
  public readonly code: string;

  /**
   * HTTP-like status code for error severity
   * - 400-499: Client errors (validation, not found)
   * - 500-599: Server errors (database, system)
   */
  public readonly statusCode: number;

  /**
   * Structured metadata about the error context
   */
  public readonly details?: Record<string, any>;

  /**
   * Timestamp when error occurred
   */
  public readonly timestamp: Date;

  /**
   * Whether this error is retryable
   */
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date();
    this.retryable = retryable;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      retryable: this.retryable,
      stack: this.stack
    };
  }
}
```

### Node Error Classes

```typescript
/**
 * Base class for all node-related errors
 */
export abstract class NodeError extends GraphDatabaseError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    public readonly nodeId?: number,
    public readonly nodeType?: string,
    details?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message, code, statusCode, {
      ...details,
      nodeId,
      nodeType
    }, retryable);
  }
}

/**
 * Thrown when a node is not found by ID
 */
export class NodeNotFoundError extends NodeError {
  constructor(nodeId: number) {
    super(
      `Node with ID ${nodeId} not found`,
      'NODE_NOT_FOUND',
      404,
      nodeId,
      undefined,
      { nodeId },
      false
    );
  }
}

/**
 * Thrown when node type validation fails
 */
export class InvalidNodeTypeError extends NodeError {
  constructor(
    nodeType: string,
    reason?: string,
    public readonly allowedTypes?: string[]
  ) {
    super(
      `Invalid node type '${nodeType}'${reason ? `: ${reason}` : ''}`,
      'INVALID_NODE_TYPE',
      400,
      undefined,
      nodeType,
      { nodeType, reason, allowedTypes },
      false
    );
  }
}

/**
 * Thrown when node property validation fails
 */
export class NodeValidationError extends NodeError {
  constructor(
    nodeType: string,
    public readonly validationErrors: Array<{
      field: string;
      message: string;
      value?: any;
    }>
  ) {
    const errorMessages = validationErrors
      .map(e => `${e.field}: ${e.message}`)
      .join('; ');

    super(
      `Node validation failed for type '${nodeType}': ${errorMessages}`,
      'NODE_VALIDATION_FAILED',
      400,
      undefined,
      nodeType,
      { validationErrors },
      false
    );
  }
}

/**
 * Thrown when node ID format is invalid
 */
export class InvalidNodeIdError extends NodeError {
  constructor(nodeId: any) {
    super(
      `Invalid node ID: must be a positive integer, got ${typeof nodeId} (${nodeId})`,
      'INVALID_NODE_ID',
      400,
      typeof nodeId === 'number' ? nodeId : undefined,
      undefined,
      { providedValue: nodeId },
      false
    );
  }
}
```

### Edge Error Classes

```typescript
/**
 * Base class for all edge-related errors
 */
export abstract class EdgeError extends GraphDatabaseError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    public readonly edgeId?: number,
    public readonly edgeType?: string,
    public readonly fromNodeId?: number,
    public readonly toNodeId?: number,
    details?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message, code, statusCode, {
      ...details,
      edgeId,
      edgeType,
      fromNodeId,
      toNodeId
    }, retryable);
  }
}

/**
 * Thrown when an edge is not found by ID
 */
export class EdgeNotFoundError extends EdgeError {
  constructor(edgeId: number) {
    super(
      `Edge with ID ${edgeId} not found`,
      'EDGE_NOT_FOUND',
      404,
      edgeId,
      undefined,
      undefined,
      undefined,
      { edgeId },
      false
    );
  }
}

/**
 * Thrown when edge type validation fails
 */
export class InvalidEdgeTypeError extends EdgeError {
  constructor(
    edgeType: string,
    reason?: string,
    public readonly allowedTypes?: string[]
  ) {
    super(
      `Invalid edge type '${edgeType}'${reason ? `: ${reason}` : ''}`,
      'INVALID_EDGE_TYPE',
      400,
      undefined,
      edgeType,
      undefined,
      undefined,
      { edgeType, reason, allowedTypes },
      false
    );
  }
}

/**
 * Thrown when edge relationship validation fails (schema mismatch)
 */
export class EdgeRelationshipError extends EdgeError {
  constructor(
    edgeType: string,
    fromNodeType: string,
    toNodeType: string,
    expectedFrom?: string,
    expectedTo?: string
  ) {
    super(
      `Invalid edge relationship: ${fromNodeType} -[${edgeType}]-> ${toNodeType}. ` +
      `Expected: ${expectedFrom || 'any'} -[${edgeType}]-> ${expectedTo || 'any'}`,
      'INVALID_EDGE_RELATIONSHIP',
      400,
      undefined,
      edgeType,
      undefined,
      undefined,
      { fromNodeType, toNodeType, expectedFrom, expectedTo },
      false
    );
  }
}

/**
 * Thrown when attempting to create edge with non-existent source node
 */
export class SourceNodeNotFoundError extends EdgeError {
  constructor(edgeType: string, sourceNodeId: number) {
    super(
      `Cannot create edge: source node with ID ${sourceNodeId} not found`,
      'SOURCE_NODE_NOT_FOUND',
      404,
      undefined,
      edgeType,
      sourceNodeId,
      undefined,
      { sourceNodeId },
      false
    );
  }
}

/**
 * Thrown when attempting to create edge with non-existent target node
 */
export class TargetNodeNotFoundError extends EdgeError {
  constructor(edgeType: string, targetNodeId: number) {
    super(
      `Cannot create edge: target node with ID ${targetNodeId} not found`,
      'TARGET_NODE_NOT_FOUND',
      404,
      undefined,
      edgeType,
      undefined,
      targetNodeId,
      { targetNodeId },
      false
    );
  }
}
```

### Schema Error Classes

```typescript
/**
 * Base class for schema-related errors
 */
export abstract class SchemaError extends GraphDatabaseError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    public readonly schemaType?: 'node' | 'edge',
    public readonly typeName?: string,
    details?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message, code, statusCode, {
      ...details,
      schemaType,
      typeName
    }, retryable);
  }
}

/**
 * Thrown when attempting to use undefined type in strict schema mode
 */
export class SchemaTypeNotDefinedError extends SchemaError {
  constructor(schemaType: 'node' | 'edge', typeName: string) {
    super(
      `${schemaType === 'node' ? 'Node' : 'Edge'} type '${typeName}' is not defined in schema`,
      'SCHEMA_TYPE_NOT_DEFINED',
      400,
      schemaType,
      typeName,
      { schemaType, typeName },
      false
    );
  }
}

/**
 * Thrown when schema validation fails during database initialization
 */
export class InvalidSchemaError extends SchemaError {
  constructor(
    public readonly validationErrors: Array<{
      path: string;
      message: string;
    }>
  ) {
    const errorMessages = validationErrors
      .map(e => `${e.path}: ${e.message}`)
      .join('; ');

    super(
      `Schema validation failed: ${errorMessages}`,
      'INVALID_SCHEMA',
      400,
      undefined,
      undefined,
      { validationErrors },
      false
    );
  }
}
```

### Transaction Error Classes

```typescript
/**
 * Base class for transaction-related errors
 */
export abstract class TransactionError extends GraphDatabaseError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    public readonly cause?: Error,
    details?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message, code, statusCode, {
      ...details,
      causeMessage: cause?.message,
      causeStack: cause?.stack
    }, retryable);
  }
}

/**
 * Thrown when transaction execution fails and is rolled back
 */
export class TransactionRollbackError extends TransactionError {
  constructor(cause: Error, public readonly operationsExecuted?: number) {
    super(
      `Transaction failed and was rolled back: ${cause.message}`,
      'TRANSACTION_ROLLBACK',
      500,
      cause,
      { operationsExecuted },
      true // Transactions can often be retried
    );
  }
}

/**
 * Thrown when attempting to use transaction after it's been finalized
 */
export class TransactionAlreadyFinalizedError extends TransactionError {
  constructor() {
    super(
      'Transaction has already been committed or rolled back',
      'TRANSACTION_ALREADY_FINALIZED',
      409,
      undefined,
      undefined,
      false
    );
  }
}
```

### Query Error Classes

```typescript
/**
 * Base class for query-related errors
 */
export abstract class QueryError extends GraphDatabaseError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    public readonly query?: string,
    public readonly queryType?: 'node' | 'edge' | 'traversal',
    details?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message, code, statusCode, {
      ...details,
      query,
      queryType
    }, retryable);
  }
}

/**
 * Thrown when query execution fails
 */
export class QueryExecutionError extends QueryError {
  constructor(
    queryType: 'node' | 'edge' | 'traversal',
    cause: Error,
    query?: string
  ) {
    super(
      `Query execution failed: ${cause.message}`,
      'QUERY_EXECUTION_FAILED',
      500,
      query,
      queryType,
      { causeMessage: cause.message },
      true
    );
  }
}

/**
 * Thrown when query parameters are invalid
 */
export class InvalidQueryParametersError extends QueryError {
  constructor(
    queryType: 'node' | 'edge' | 'traversal',
    public readonly invalidParams: Record<string, string>
  ) {
    const paramErrors = Object.entries(invalidParams)
      .map(([param, error]) => `${param}: ${error}`)
      .join('; ');

    super(
      `Invalid query parameters: ${paramErrors}`,
      'INVALID_QUERY_PARAMETERS',
      400,
      undefined,
      queryType,
      { invalidParams },
      false
    );
  }
}

/**
 * Thrown when traversal depth exceeds safety limits
 */
export class TraversalDepthExceededError extends QueryError {
  constructor(
    public readonly requestedDepth: number,
    public readonly maxAllowedDepth: number
  ) {
    super(
      `Traversal depth ${requestedDepth} exceeds maximum allowed depth ${maxAllowedDepth}`,
      'TRAVERSAL_DEPTH_EXCEEDED',
      400,
      undefined,
      'traversal',
      { requestedDepth, maxAllowedDepth },
      false
    );
  }
}
```

### Database Error Classes

```typescript
/**
 * Base class for database system errors
 */
export abstract class DatabaseSystemError extends GraphDatabaseError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    public readonly cause?: Error,
    details?: Record<string, any>,
    retryable: boolean = false
  ) {
    super(message, code, statusCode, {
      ...details,
      causeMessage: cause?.message
    }, retryable);
  }
}

/**
 * Thrown when SQLite database operation fails
 */
export class SQLiteError extends DatabaseSystemError {
  constructor(cause: Error, public readonly sqliteCode?: string) {
    super(
      `Database operation failed: ${cause.message}`,
      'SQLITE_ERROR',
      500,
      cause,
      { sqliteCode },
      true // Database errors are often transient
    );
  }
}

/**
 * Thrown when database connection fails
 */
export class DatabaseConnectionError extends DatabaseSystemError {
  constructor(
    public readonly databasePath: string,
    cause?: Error
  ) {
    super(
      `Failed to connect to database at ${databasePath}${cause ? `: ${cause.message}` : ''}`,
      'DATABASE_CONNECTION_FAILED',
      500,
      cause,
      { databasePath },
      true
    );
  }
}

/**
 * Thrown when database file doesn't exist and fileMustExist is true
 */
export class DatabaseNotFoundError extends DatabaseSystemError {
  constructor(public readonly databasePath: string) {
    super(
      `Database file not found: ${databasePath}`,
      'DATABASE_NOT_FOUND',
      404,
      undefined,
      { databasePath },
      false
    );
  }
}

/**
 * Thrown when database is in read-only mode but write operation attempted
 */
export class DatabaseReadOnlyError extends DatabaseSystemError {
  constructor(operation: string) {
    super(
      `Cannot perform write operation '${operation}' on read-only database`,
      'DATABASE_READ_ONLY',
      403,
      undefined,
      { operation },
      false
    );
  }
}

/**
 * Thrown when database constraint is violated (e.g., foreign key)
 */
export class ConstraintViolationError extends DatabaseSystemError {
  constructor(
    public readonly constraintType: 'foreign_key' | 'unique' | 'check' | 'not_null',
    cause: Error
  ) {
    super(
      `Database constraint violation (${constraintType}): ${cause.message}`,
      'CONSTRAINT_VIOLATION',
      409,
      cause,
      { constraintType },
      false
    );
  }
}
```

---

## 3. Error Handling Patterns for Operations

### CRUD Operations

#### Create Node

```typescript
createNode<T extends NodeData = NodeData>(type: string, properties: T): Node<T> {
  try {
    // Validate node type
    validateNodeType(type, this.schema);

    // Validate properties
    validateNodeProperties(type, properties, this.schema);

    // Execute insert
    const stmt = this.preparedStatements.get('insertNode')!;
    const row = stmt.get(type, serialize(properties)) as any;

    return this.deserializeNode<T>(row);

  } catch (error) {
    // Wrap SQLite errors
    if (error instanceof Error && error.message.includes('SQLITE')) {
      throw new SQLiteError(error);
    }

    // Re-throw our custom errors
    if (error instanceof GraphDatabaseError) {
      throw error;
    }

    // Wrap unknown errors
    throw new DatabaseSystemError(
      `Failed to create node: ${error instanceof Error ? error.message : String(error)}`,
      'NODE_CREATE_FAILED',
      500,
      error instanceof Error ? error : undefined
    );
  }
}
```

#### Read Node

```typescript
getNode(id: number): Node | null {
  try {
    validateNodeId(id);

    const stmt = this.preparedStatements.get('getNode')!;
    const row = stmt.get(id) as any;

    // Return null for not found (not an error in read operations)
    if (!row) return null;

    return this.deserializeNode(row);

  } catch (error) {
    if (error instanceof GraphDatabaseError) {
      throw error;
    }

    throw new QueryExecutionError('node', error as Error);
  }
}
```

#### Update Node

```typescript
updateNode(id: number, properties: Partial<NodeData>): Node {
  try {
    validateNodeId(id);

    const existing = this.getNode(id);
    if (!existing) {
      throw new NodeNotFoundError(id);
    }

    // Validate merged properties
    const merged = { ...existing.properties, ...properties };
    validateNodeProperties(existing.type, merged, this.schema);

    const stmt = this.preparedStatements.get('updateNode')!;
    const row = stmt.get(serialize(merged), id) as any;

    return this.deserializeNode(row);

  } catch (error) {
    if (error instanceof GraphDatabaseError) {
      throw error;
    }

    throw new DatabaseSystemError(
      `Failed to update node ${id}: ${error instanceof Error ? error.message : String(error)}`,
      'NODE_UPDATE_FAILED',
      500,
      error instanceof Error ? error : undefined
    );
  }
}
```

#### Delete Node

```typescript
deleteNode(id: number): boolean {
  try {
    validateNodeId(id);

    const stmt = this.preparedStatements.get('deleteNode')!;
    const info = stmt.run(id);

    return info.changes > 0;

  } catch (error) {
    if (error instanceof GraphDatabaseError) {
      throw error;
    }

    // Check for constraint violations (edges still reference this node)
    if (error instanceof Error && error.message.includes('FOREIGN KEY')) {
      throw new ConstraintViolationError('foreign_key', error);
    }

    throw new DatabaseSystemError(
      `Failed to delete node ${id}: ${error instanceof Error ? error.message : String(error)}`,
      'NODE_DELETE_FAILED',
      500,
      error instanceof Error ? error : undefined
    );
  }
}
```

#### Create Edge

```typescript
createEdge<T extends NodeData = NodeData>(
  type: string,
  from: number,
  to: number,
  properties?: T
): Edge<T> {
  try {
    validateEdgeType(type, this.schema);
    validateNodeId(from);
    validateNodeId(to);

    // Verify nodes exist
    const fromNode = this.getNode(from);
    const toNode = this.getNode(to);

    if (!fromNode) {
      throw new SourceNodeNotFoundError(type, from);
    }

    if (!toNode) {
      throw new TargetNodeNotFoundError(type, to);
    }

    // Validate relationship if schema defined
    if (this.schema?.edges?.[type]) {
      const edgeDef = this.schema.edges[type];

      if (edgeDef.from && edgeDef.from !== fromNode.type) {
        throw new EdgeRelationshipError(
          type,
          fromNode.type,
          toNode.type,
          edgeDef.from,
          edgeDef.to
        );
      }

      if (edgeDef.to && edgeDef.to !== toNode.type) {
        throw new EdgeRelationshipError(
          type,
          fromNode.type,
          toNode.type,
          edgeDef.from,
          edgeDef.to
        );
      }
    }

    const stmt = this.preparedStatements.get('insertEdge')!;
    const row = stmt.get(
      type,
      from,
      to,
      properties ? serialize(properties) : null
    ) as any;

    return this.deserializeEdge<T>(row);

  } catch (error) {
    if (error instanceof GraphDatabaseError) {
      throw error;
    }

    throw new DatabaseSystemError(
      `Failed to create edge: ${error instanceof Error ? error.message : String(error)}`,
      'EDGE_CREATE_FAILED',
      500,
      error instanceof Error ? error : undefined
    );
  }
}
```

### Query Execution

```typescript
exec(): Node[] {
  try {
    const sql = this.buildSQL();
    const params = this.buildParams();

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    let nodes = rows.map(row => this.deserializeNode(row));

    // Apply JavaScript filter if provided
    if (this.filterPredicate) {
      nodes = nodes.filter(this.filterPredicate);
    }

    return nodes;

  } catch (error) {
    if (error instanceof GraphDatabaseError) {
      throw error;
    }

    throw new QueryExecutionError(
      'node',
      error as Error,
      this.buildSQL()
    );
  }
}
```

### Transaction Execution

```typescript
transaction<T>(fn: () => T): T {
  try {
    return this.db.transaction(fn)();

  } catch (error) {
    // Wrap transaction errors with context
    throw new TransactionRollbackError(error as Error);
  }
}
```

### Graph Traversal

```typescript
traverse(startNodeId: number): TraversalQuery {
  try {
    validateNodeId(startNodeId);

    const node = this.getNode(startNodeId);
    if (!node) {
      throw new NodeNotFoundError(startNodeId);
    }

    return new TraversalQuery(this.db, startNodeId);

  } catch (error) {
    if (error instanceof GraphDatabaseError) {
      throw error;
    }

    throw new QueryExecutionError('traversal', error as Error);
  }
}
```

---

## 4. Error Message Format and Structure

### Standard Error Message Template

All error messages should follow this structure:

```
<Operation failed>: <Specific reason> [<Context>]

Examples:
- "Node with ID 123 not found"
- "Invalid node type 'InvalidType': not defined in schema"
- "Edge relationship validation failed: Job -[INVALID]-> Company. Expected: Job -[POSTED_BY]-> Company"
- "Transaction failed and was rolled back: Constraint violation"
```

### Error Response Format (for API/logging)

```typescript
interface ErrorResponse {
  error: {
    name: string;           // "NodeNotFoundError"
    message: string;        // Human-readable message
    code: string;           // "NODE_NOT_FOUND"
    statusCode: number;     // 404
    details?: {             // Structured error context
      nodeId?: number;
      nodeType?: string;
      [key: string]: any;
    };
    timestamp: string;      // ISO 8601
    retryable: boolean;     // Whether operation can be retried
    stack?: string;         // Stack trace (development only)
  };
}
```

### Example Error Response

```json
{
  "error": {
    "name": "NodeValidationError",
    "message": "Node validation failed for type 'Job': title: required field missing; salary: must be a number",
    "code": "NODE_VALIDATION_FAILED",
    "statusCode": 400,
    "details": {
      "nodeType": "Job",
      "validationErrors": [
        {
          "field": "title",
          "message": "required field missing"
        },
        {
          "field": "salary",
          "message": "must be a number",
          "value": "high"
        }
      ]
    },
    "timestamp": "2025-10-27T16:30:00.000Z",
    "retryable": false
  }
}
```

---

## 5. Error Recovery Strategies

### Retry Logic with Exponential Backoff

```typescript
/**
 * Retry function with exponential backoff for transient errors
 */
async function retryOperation<T>(
  operation: () => T | Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 100,
    maxDelay = 5000,
    backoffFactor = 2
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();

    } catch (error) {
      lastError = error as Error;

      // Only retry if error is retryable
      if (error instanceof GraphDatabaseError && !error.retryable) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt - 1),
        maxDelay
      );

      console.warn(
        `Attempt ${attempt}/${maxAttempts} failed: ${error instanceof Error ? error.message : String(error)}. ` +
        `Retrying in ${delay}ms...`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// Usage
const node = await retryOperation(
  () => db.createNode('Job', jobData),
  { maxAttempts: 3, initialDelay: 100 }
);
```

### Circuit Breaker Pattern

```typescript
/**
 * Circuit breaker to prevent cascading failures
 */
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if we should try half-open
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime.getTime() >= this.resetTimeout
      ) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN - operation rejected');
      }
    }

    try {
      const result = await operation();

      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        this.reset();
      }

      return result;

    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      console.error(
        `Circuit breaker opened after ${this.failureCount} failures`
      );
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.state = 'closed';
  }
}

// Usage
const breaker = new CircuitBreaker(5, 60000);

try {
  const nodes = await breaker.execute(() =>
    db.nodes('Job').where({ status: 'active' }).exec()
  );
} catch (error) {
  console.error('Operation failed or circuit breaker is open:', error);
}
```

### Graceful Degradation

```typescript
/**
 * Safe wrapper that returns default value on error
 */
function safeExecute<T>(
  operation: () => T,
  defaultValue: T,
  onError?: (error: Error) => void
): T {
  try {
    return operation();
  } catch (error) {
    if (onError) {
      onError(error as Error);
    } else {
      console.error('Operation failed, using default value:', error);
    }
    return defaultValue;
  }
}

// Usage
const nodes = safeExecute(
  () => db.nodes('Job').where({ status: 'active' }).exec(),
  [], // Default to empty array
  (error) => console.error('Failed to fetch jobs:', error)
);
```

---

## 6. Error Propagation Best Practices

### 1. Always Handle Errors at Appropriate Level

```typescript
// ❌ BAD: Swallow errors
try {
  db.createNode('Job', data);
} catch (error) {
  // Silent failure
}

// ✅ GOOD: Handle or propagate
try {
  db.createNode('Job', data);
} catch (error) {
  if (error instanceof NodeValidationError) {
    console.error('Validation failed:', error.details);
    // Show user-friendly message
  } else {
    // Log and re-throw unexpected errors
    console.error('Unexpected error:', error);
    throw error;
  }
}
```

### 2. Add Context When Re-throwing

```typescript
// ✅ GOOD: Add context to errors
try {
  const job = db.createNode('Job', jobData);
  const company = db.createNode('Company', companyData);
  db.createEdge('POSTED_BY', job.id, company.id);
} catch (error) {
  throw new Error(
    `Failed to create job posting: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error }
  );
}
```

### 3. Use Type Guards for Error Handling

```typescript
function handleError(error: unknown): void {
  if (error instanceof NodeNotFoundError) {
    console.log('Node does not exist, creating new one');
    // Handle not found

  } else if (error instanceof NodeValidationError) {
    console.error('Validation errors:', error.details?.validationErrors);
    // Show validation errors to user

  } else if (error instanceof TransactionRollbackError) {
    console.error('Transaction failed, retrying...');
    // Retry transaction

  } else if (error instanceof GraphDatabaseError && error.retryable) {
    console.warn('Transient error, can retry');
    // Implement retry logic

  } else {
    console.error('Unexpected error:', error);
    // Log and escalate
  }
}
```

---

## 7. Testing Error Scenarios

### Unit Tests for Error Classes

```typescript
describe('Error Classes', () => {
  describe('NodeNotFoundError', () => {
    it('should create error with correct properties', () => {
      const error = new NodeNotFoundError(123);

      expect(error).toBeInstanceOf(NodeNotFoundError);
      expect(error).toBeInstanceOf(NodeError);
      expect(error).toBeInstanceOf(GraphDatabaseError);
      expect(error.message).toBe('Node with ID 123 not found');
      expect(error.code).toBe('NODE_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.nodeId).toBe(123);
      expect(error.retryable).toBe(false);
    });

    it('should serialize to JSON correctly', () => {
      const error = new NodeNotFoundError(123);
      const json = error.toJSON();

      expect(json.name).toBe('NodeNotFoundError');
      expect(json.code).toBe('NODE_NOT_FOUND');
      expect(json.details?.nodeId).toBe(123);
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('NodeValidationError', () => {
    it('should aggregate multiple validation errors', () => {
      const validationErrors = [
        { field: 'title', message: 'required field missing' },
        { field: 'salary', message: 'must be a number', value: 'high' }
      ];

      const error = new NodeValidationError('Job', validationErrors);

      expect(error.message).toContain('title: required field missing');
      expect(error.message).toContain('salary: must be a number');
      expect(error.validationErrors).toEqual(validationErrors);
    });
  });
});
```

### Integration Tests for Error Handling

```typescript
describe('Database Error Handling', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    db = new GraphDatabase(':memory:', {
      schema: {
        nodes: {
          Job: { properties: ['title', 'status'] }
        },
        edges: {
          POSTED_BY: { from: 'Job', to: 'Company' }
        }
      }
    });
  });

  describe('Node Operations', () => {
    it('should throw NodeNotFoundError when updating non-existent node', () => {
      expect(() => {
        db.updateNode(999, { status: 'active' });
      }).toThrow(NodeNotFoundError);
    });

    it('should throw InvalidNodeTypeError for invalid type', () => {
      expect(() => {
        db.createNode('', { data: 'value' });
      }).toThrow(InvalidNodeTypeError);
    });

    it('should throw SchemaTypeNotDefinedError for undefined type', () => {
      expect(() => {
        db.createNode('InvalidType', { data: 'value' });
      }).toThrow(SchemaTypeNotDefinedError);
    });
  });

  describe('Edge Operations', () => {
    it('should throw SourceNodeNotFoundError for invalid source', () => {
      const job = db.createNode('Job', { title: 'Engineer' });

      expect(() => {
        db.createEdge('POSTED_BY', 999, job.id);
      }).toThrow(SourceNodeNotFoundError);
    });

    it('should throw TargetNodeNotFoundError for invalid target', () => {
      const job = db.createNode('Job', { title: 'Engineer' });

      expect(() => {
        db.createEdge('POSTED_BY', job.id, 999);
      }).toThrow(TargetNodeNotFoundError);
    });

    it('should throw EdgeRelationshipError for schema mismatch', () => {
      const job1 = db.createNode('Job', { title: 'Engineer' });
      const job2 = db.createNode('Job', { title: 'Designer' });

      expect(() => {
        db.createEdge('POSTED_BY', job1.id, job2.id);
      }).toThrow(EdgeRelationshipError);
    });
  });

  describe('Transaction Handling', () => {
    it('should rollback transaction on error', () => {
      const before = db.nodes('Job').count();

      expect(() => {
        db.transaction(() => {
          db.createNode('Job', { title: 'Engineer' });
          db.createNode('Job', { title: 'Designer' });
          throw new Error('Test error');
        });
      }).toThrow(TransactionRollbackError);

      const after = db.nodes('Job').count();
      expect(after).toBe(before); // No changes
    });

    it('should include operation count in rollback error', () => {
      try {
        db.transaction(() => {
          db.createNode('Job', { title: 'Job 1' });
          db.createNode('Job', { title: 'Job 2' });
          throw new Error('Intentional failure');
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TransactionRollbackError);
        // Note: Tracking operation count requires implementation
      }
    });
  });

  describe('Query Error Handling', () => {
    it('should throw InvalidQueryParametersError for invalid limit', () => {
      expect(() => {
        db.nodes('Job').limit(-1).exec();
      }).toThrow(InvalidQueryParametersError);
    });

    it('should throw InvalidQueryParametersError for invalid offset', () => {
      expect(() => {
        db.nodes('Job').offset(-1).exec();
      }).toThrow(InvalidQueryParametersError);
    });
  });
});
```

---

## 8. Implementation Recommendations

### Phase 1: Core Error Classes (Immediate)
1. Implement `GraphDatabaseError` base class
2. Implement node error classes (`NodeNotFoundError`, `InvalidNodeTypeError`, etc.)
3. Implement edge error classes (`EdgeNotFoundError`, `SourceNodeNotFoundError`, etc.)
4. Update validation utilities to throw new error types

### Phase 2: Error Handling in Operations (Short-term)
1. Update `createNode()`, `updateNode()`, `deleteNode()` with error handling
2. Update `createEdge()`, `deleteEdge()` with error handling
3. Add error wrapping for SQLite errors
4. Update transaction handling with `TransactionRollbackError`

### Phase 3: Query and Traversal Errors (Medium-term)
1. Implement query error classes
2. Update `NodeQuery` and `TraversalQuery` with error handling
3. Add query parameter validation
4. Implement traversal depth safety checks

### Phase 4: Advanced Features (Long-term)
1. Implement retry utilities with exponential backoff
2. Add circuit breaker pattern
3. Create error recovery helpers
4. Add comprehensive error logging and monitoring

### Phase 5: Documentation and Testing (Ongoing)
1. Write unit tests for all error classes
2. Write integration tests for error scenarios
3. Update API documentation with error handling examples
4. Create migration guide for existing users

---

## 9. TypeScript Type Definitions

### Error Type Exports

```typescript
// Add to src/types/index.ts

export type {
  // Base error
  GraphDatabaseError,

  // Node errors
  NodeError,
  NodeNotFoundError,
  InvalidNodeTypeError,
  NodeValidationError,
  InvalidNodeIdError,

  // Edge errors
  EdgeError,
  EdgeNotFoundError,
  InvalidEdgeTypeError,
  EdgeRelationshipError,
  SourceNodeNotFoundError,
  TargetNodeNotFoundError,

  // Schema errors
  SchemaError,
  SchemaTypeNotDefinedError,
  InvalidSchemaError,

  // Transaction errors
  TransactionError,
  TransactionRollbackError,
  TransactionAlreadyFinalizedError,

  // Query errors
  QueryError,
  QueryExecutionError,
  InvalidQueryParametersError,
  TraversalDepthExceededError,

  // Database errors
  DatabaseSystemError,
  SQLiteError,
  DatabaseConnectionError,
  DatabaseNotFoundError,
  DatabaseReadOnlyError,
  ConstraintViolationError
} from './errors';
```

### Error Type Guards

```typescript
// Add to src/utils/errors.ts

export function isGraphDatabaseError(error: unknown): error is GraphDatabaseError {
  return error instanceof GraphDatabaseError;
}

export function isRetryableError(error: unknown): boolean {
  return error instanceof GraphDatabaseError && error.retryable;
}

export function isNodeError(error: unknown): error is NodeError {
  return error instanceof NodeError;
}

export function isEdgeError(error: unknown): error is EdgeError {
  return error instanceof EdgeError;
}

export function isValidationError(error: unknown): error is NodeValidationError | InvalidSchemaError {
  return (
    error instanceof NodeValidationError ||
    error instanceof InvalidSchemaError
  );
}

export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof NodeNotFoundError ||
    error instanceof EdgeNotFoundError ||
    error instanceof DatabaseNotFoundError
  );
}
```

---

## 10. Breaking Changes and Migration

### For Existing Users

#### Before (Current Implementation)
```typescript
try {
  db.createNode('InvalidType', { data: 'value' });
} catch (error) {
  // Generic Error instance
  console.error(error.message); // "Node type 'InvalidType' is not defined in schema"
}
```

#### After (With Custom Errors)
```typescript
try {
  db.createNode('InvalidType', { data: 'value' });
} catch (error) {
  if (error instanceof SchemaTypeNotDefinedError) {
    console.error(`${error.code}: ${error.message}`);
    console.error('Type:', error.typeName); // "InvalidType"
    console.error('Can retry:', error.retryable); // false
  }
}
```

### Migration Strategy

1. **Backward Compatible**: All custom errors extend `Error`, so existing catch blocks still work
2. **Gradual Adoption**: Users can opt-in to typed error handling without breaking changes
3. **Type Safety**: TypeScript users get better type inference and autocomplete

---

## 11. Monitoring and Observability

### Error Logging Format

```typescript
/**
 * Centralized error logger
 */
function logError(error: Error, context?: Record<string, any>): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    message: error.message,
    ...context
  };

  if (error instanceof GraphDatabaseError) {
    Object.assign(logEntry, {
      errorCode: error.code,
      statusCode: error.statusCode,
      retryable: error.retryable,
      details: error.details
    });
  }

  if (process.env.NODE_ENV === 'development') {
    logEntry.stack = error.stack;
  }

  console.error(JSON.stringify(logEntry));

  // Send to monitoring service
  // sendToMonitoring(logEntry);
}
```

### Metrics Collection

```typescript
/**
 * Track error rates by type
 */
class ErrorMetrics {
  private errorCounts = new Map<string, number>();

  recordError(error: Error): void {
    const errorType = error instanceof GraphDatabaseError
      ? error.code
      : 'UNKNOWN_ERROR';

    this.errorCounts.set(
      errorType,
      (this.errorCounts.get(errorType) || 0) + 1
    );
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }

  reset(): void {
    this.errorCounts.clear();
  }
}
```

---

## Summary

This comprehensive error handling strategy provides:

✅ **Structured error hierarchy** with 20+ custom error classes
✅ **Machine-readable error codes** for programmatic handling
✅ **Rich error context** with metadata and stack traces
✅ **Retryability indicators** for automated recovery
✅ **Type-safe error handling** for TypeScript users
✅ **Clear error messages** following consistent patterns
✅ **Error recovery patterns** (retry, circuit breaker, graceful degradation)
✅ **Comprehensive testing strategy** with unit and integration tests
✅ **Backward compatibility** with existing error handling
✅ **Monitoring and observability** best practices

**Next Steps**: Implement Phase 1 (core error classes) and update validation utilities.
