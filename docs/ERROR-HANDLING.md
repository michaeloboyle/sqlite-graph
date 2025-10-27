## Error Handling Strategy

sqlite-graph uses a comprehensive error handling approach with clear error messages and proper error propagation.

### Error Categories

#### 1. Validation Errors
Thrown when input data doesn't meet requirements.

```typescript
// Invalid node type
try {
  db.createNode('', { data: 'value' });
} catch (error) {
  // Error: Node type must be a non-empty string
}

// Invalid node ID
try {
  db.getNode(-1);
} catch (error) {
  // Error: Node ID must be a positive integer
}

// Schema validation failure
try {
  db.createNode('InvalidType', { data: 'value' });
} catch (error) {
  // Error: Node type 'InvalidType' is not defined in schema
}
```

#### 2. Not Found Errors
Thrown when referenced entities don't exist.

```typescript
// Node not found
try {
  db.updateNode(999, { status: 'updated' });
} catch (error) {
  // Error: Node with ID 999 not found
}

// Edge creation with invalid node
try {
  db.createEdge('RELATES_TO', 1, 999);
} catch (error) {
  // Error: Target node with ID 999 not found
}

// Traversal from non-existent node
try {
  db.traverse(999).toArray();
} catch (error) {
  // Error: Start node with ID 999 not found
}
```

#### 3. Database Errors
Errors from SQLite operations.

```typescript
// Foreign key constraint violation
try {
  db.getRawDb().prepare('DELETE FROM nodes WHERE id = ?').run(1);
} catch (error) {
  // SQLite error: FOREIGN KEY constraint failed
}

// File system errors
try {
  const db = new GraphDatabase('/invalid/path/db.sqlite', {
    fileMustExist: true
  });
} catch (error) {
  // Error: ENOENT: no such file or directory
}
```

#### 4. Transaction Errors
Errors during transaction execution result in automatic rollback.

```typescript
try {
  db.transaction(() => {
    const node1 = db.createNode('Job', { title: 'Engineer' });
    const node2 = db.createNode('Company', { name: 'Corp' });

    // This will throw an error
    db.createEdge('INVALID', node1.id, node2.id);
  });
} catch (error) {
  // Error: Edge type 'INVALID' is not defined in schema
  // Transaction automatically rolled back - no nodes created
}
```

### Error Handling Best Practices

#### 1. Always Handle Errors

```typescript
// ❌ BAD: Unhandled errors
const node = db.createNode('Job', invalidData);

// ✅ GOOD: Explicit error handling
try {
  const node = db.createNode('Job', data);
  console.log('Node created:', node.id);
} catch (error) {
  console.error('Failed to create node:', error.message);
  // Handle error appropriately
}
```

#### 2. Check Existence Before Operations

```typescript
// ✅ GOOD: Check before update
const existing = db.getNode(nodeId);
if (existing) {
  db.updateNode(nodeId, { status: 'updated' });
} else {
  console.log('Node not found');
}

// ✅ GOOD: Verify nodes exist before creating edge
const from = db.getNode(fromId);
const to = db.getNode(toId);
if (from && to) {
  db.createEdge('RELATES_TO', fromId, toId);
}
```

#### 3. Use Transactions for Multi-Step Operations

```typescript
// ✅ GOOD: Atomic operations
try {
  const result = db.transaction(() => {
    const job = db.createNode('Job', { title: 'Engineer' });
    const company = db.createNode('Company', { name: 'TechCorp' });
    const edge = db.createEdge('POSTED_BY', job.id, company.id);
    return { job, company, edge };
  });

  console.log('All operations succeeded');
} catch (error) {
  console.error('Transaction failed, changes rolled back:', error.message);
}
```

#### 4. Validate Data Before Database Operations

```typescript
// ✅ GOOD: Pre-validation
function createJobWithValidation(data: any) {
  // Validate required fields
  if (!data.title || typeof data.title !== 'string') {
    throw new Error('Job title is required and must be a string');
  }

  if (!data.status || !['active', 'closed', 'draft'].includes(data.status)) {
    throw new Error('Invalid job status');
  }

  // Create node only if validation passes
  return db.createNode('Job', data);
}
```

### Error Recovery Strategies

#### 1. Retry Logic for Transient Errors

```typescript
function createNodeWithRetry(type: string, properties: NodeData, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return db.createNode(type, properties);
    } catch (error) {
      if (attempt === maxRetries) throw error;

      console.warn(`Attempt ${attempt} failed, retrying...`);
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}
```

#### 2. Graceful Degradation

```typescript
function getNodeSafely(id: number): Node | null {
  try {
    return db.getNode(id);
  } catch (error) {
    console.error(`Failed to get node ${id}:`, error.message);
    return null;
  }
}
```

#### 3. Logging and Monitoring

```typescript
class LoggedGraphDatabase extends GraphDatabase {
  createNode<T extends NodeData>(type: string, properties: T): Node<T> {
    try {
      const node = super.createNode(type, properties);
      console.log(`✓ Created ${type} node #${node.id}`);
      return node;
    } catch (error) {
      console.error(`✗ Failed to create ${type} node:`, error.message);
      throw error;
    }
  }
}
```

### Custom Error Classes

For more structured error handling, you can extend Error:

```typescript
class GraphDatabaseError extends Error {
  constructor(message: string, public code: string, public details?: any) {
    super(message);
    this.name = 'GraphDatabaseError';
  }
}

class NodeNotFoundError extends GraphDatabaseError {
  constructor(nodeId: number) {
    super(
      `Node with ID ${nodeId} not found`,
      'NODE_NOT_FOUND',
      { nodeId }
    );
    this.name = 'NodeNotFoundError';
  }
}

class ValidationError extends GraphDatabaseError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

// Usage
try {
  db.updateNode(999, { status: 'updated' });
} catch (error) {
  if (error instanceof NodeNotFoundError) {
    console.log('Node does not exist, creating new one');
    db.createNode('Job', { status: 'updated' });
  } else {
    throw error;
  }
}
```

### Testing Error Scenarios

Always test error paths in your application:

```typescript
describe('Error Handling', () => {
  it('should throw error for invalid node type', () => {
    expect(() => {
      db.createNode('', { data: 'value' });
    }).toThrow('Node type must be a non-empty string');
  });

  it('should throw error when node not found', () => {
    expect(() => {
      db.updateNode(99999, { status: 'updated' });
    }).toThrow('Node with ID 99999 not found');
  });

  it('should rollback transaction on error', () => {
    const before = db.nodes('Job').count();

    expect(() => {
      db.transaction(() => {
        db.createNode('Job', { title: 'Test' });
        throw new Error('Test error');
      });
    }).toThrow('Test error');

    const after = db.nodes('Job').count();
    expect(after).toBe(before); // No change due to rollback
  });
});
```

---

**Summary**: sqlite-graph provides clear, actionable error messages and automatic transaction rollback for safety. Always use try-catch blocks, validate inputs, and leverage transactions for multi-step operations.