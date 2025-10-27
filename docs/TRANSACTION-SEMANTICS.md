# Transaction Semantics for sqlite-graph

## Overview

sqlite-graph provides comprehensive transaction support built on SQLite's ACID properties and better-sqlite3's transaction API. This document specifies the transaction behavior, isolation guarantees, and usage patterns for the library.

## ACID Properties Implementation

### Atomicity
All operations within a transaction execute as a single unit. If any operation fails, the entire transaction is rolled back, leaving the database in its original state.

```typescript
// Either ALL operations succeed, or NONE do
db.transaction(() => {
  const job = db.createNode('Job', { title: 'Engineer' });
  const company = db.createNode('Company', { name: 'TechCorp' });
  db.createEdge('POSTED_BY', job.id, company.id);
  // If createEdge fails, both nodes are rolled back
});
```

### Consistency
Transactions maintain database integrity through:
- Foreign key constraints (enforced by SQLite)
- Schema validation (enforced by sqlite-graph)
- Check constraints on valid types
- Automatic timestamp updates

```typescript
// Schema validation ensures consistency
db.transaction(() => {
  const node = db.createNode('Job', { title: 'Engineer' });
  // This will fail and rollback if 'InvalidType' not in schema
  db.createNode('InvalidType', { data: 'test' });
});
```

### Isolation
SQLite provides serializable isolation by default through its locking mechanism:

**Read Operations**: Acquire SHARED lock
- Multiple readers can access database concurrently
- Readers block writers, but not other readers

**Write Operations**: Acquire RESERVED → EXCLUSIVE lock
- Only one writer at a time
- Writers block all other writers
- Pending writers queue behind RESERVED lock

**Lock Progression**:
```
UNLOCKED → SHARED → RESERVED → PENDING → EXCLUSIVE
```

### Durability
Changes are persisted to disk upon successful commit:
- WAL (Write-Ahead Logging) mode provides durability with minimal latency
- Synchronous mode ensures data safety (configurable)
- Automatic checkpoint management

## Transaction API

### Basic Transaction Execution

```typescript
interface TransactionFunction<T> {
  (): T;
}

class GraphDatabase {
  /**
   * Execute function within a transaction
   *
   * @param fn - Function to execute transactionally
   * @returns Result of the transaction function
   * @throws Error if transaction fails (automatic rollback)
   */
  transaction<T>(fn: TransactionFunction<T>): T;
}
```

**Usage Example**:
```typescript
const result = db.transaction(() => {
  const node1 = db.createNode('Job', { title: 'Engineer' });
  const node2 = db.createNode('Company', { name: 'Corp' });
  const edge = db.createEdge('POSTED_BY', node1.id, node2.id);

  return { node1, node2, edge };
});

console.log('Transaction succeeded:', result);
```

### Automatic Rollback on Error

```typescript
try {
  db.transaction(() => {
    db.createNode('Job', { title: 'Test Job' });
    db.createNode('Company', { name: 'Test Corp' });

    // Simulate error
    throw new Error('Validation failed');
  });
} catch (error) {
  // Transaction automatically rolled back
  // No nodes were created
  console.error('Transaction failed:', error.message);
}
```

### Return Values from Transactions

```typescript
// Transaction returns the value from the callback
const nodeId = db.transaction(() => {
  const node = db.createNode('Job', { title: 'Engineer' });
  return node.id;
});

console.log('Created node ID:', nodeId);
```

## Transaction Nesting Strategy

SQLite does **NOT** support true nested transactions. Instead, we use savepoints for pseudo-nesting.

### Savepoint Implementation

```typescript
class GraphDatabase {
  /**
   * Create a savepoint for nested transaction-like behavior
   *
   * @param name - Savepoint identifier
   */
  savepoint(name: string): void;

  /**
   * Release (commit) a savepoint
   *
   * @param name - Savepoint identifier
   */
  releaseSavepoint(name: string): void;

  /**
   * Rollback to a savepoint
   *
   * @param name - Savepoint identifier
   */
  rollbackToSavepoint(name: string): void;
}
```

### Nested Transaction Pattern

```typescript
db.transaction(() => {
  const job = db.createNode('Job', { title: 'Engineer' });

  // Create savepoint for nested operation
  db.savepoint('company_creation');

  try {
    const company = db.createNode('Company', { name: 'TechCorp' });
    const dept = db.createNode('Department', { name: 'Engineering' });
    db.createEdge('HAS_DEPARTMENT', company.id, dept.id);

    // Nested operation succeeded - release savepoint
    db.releaseSavepoint('company_creation');
  } catch (error) {
    // Rollback just the nested operation
    db.rollbackToSavepoint('company_creation');
    console.warn('Company creation failed, continuing with job');
  }

  // Job still exists, even if company creation failed
  return job;
});
```

### Auto-managed Savepoints

```typescript
class GraphDatabase {
  /**
   * Execute a nested transaction using automatic savepoint management
   *
   * @param fn - Function to execute in nested context
   * @returns Result of the function
   * @throws Error if nested transaction fails
   */
  nestedTransaction<T>(fn: TransactionFunction<T>): T;
}
```

**Usage**:
```typescript
db.transaction(() => {
  const job = db.createNode('Job', { title: 'Engineer' });

  // Automatic savepoint creation and management
  try {
    db.nestedTransaction(() => {
      const company = db.createNode('Company', { name: 'Corp' });
      db.createEdge('POSTED_BY', job.id, company.id);
    });
  } catch (error) {
    // Nested transaction rolled back automatically
    // But outer transaction continues
  }

  return job;
});
```

## Auto-commit vs Explicit Transactions

### Auto-commit Mode (Default)

Single operations auto-commit immediately:

```typescript
// Each operation is an implicit transaction
const node = db.createNode('Job', { title: 'Engineer' }); // AUTO-COMMIT
db.updateNode(node.id, { status: 'active' });            // AUTO-COMMIT
db.deleteNode(node.id);                                   // AUTO-COMMIT
```

**Behavior**:
- Each statement is wrapped in BEGIN/COMMIT
- Changes visible immediately
- No manual commit required
- Performance overhead for multiple operations

### Explicit Transaction Mode

Multiple operations in a single transaction:

```typescript
// All operations in one transaction
db.transaction(() => {
  const node1 = db.createNode('Job', { title: 'Engineer' });
  const node2 = db.createNode('Company', { name: 'Corp' });
  db.createEdge('POSTED_BY', node1.id, node2.id);
  // Single COMMIT at end
});
```

**Behavior**:
- BEGIN at start, COMMIT at end
- Changes atomic (all-or-nothing)
- Better performance for bulk operations
- Explicit error handling

### Performance Comparison

```typescript
// ❌ SLOW: 1000 auto-commits (1000 transactions)
for (let i = 0; i < 1000; i++) {
  db.createNode('Job', { title: `Job ${i}` });
}

// ✅ FAST: 1 commit (1 transaction)
db.transaction(() => {
  for (let i = 0; i < 1000; i++) {
    db.createNode('Job', { title: `Job ${i}` });
  }
});
```

**Benchmark**: Explicit transaction is ~50-100x faster for bulk operations.

## Transaction Error Handling

### Error Types in Transactions

**1. Validation Errors**:
```typescript
try {
  db.transaction(() => {
    db.createNode('', { data: 'invalid' }); // Empty type
  });
} catch (error) {
  // ValidationError: Node type must be a non-empty string
  // Transaction rolled back
}
```

**2. Constraint Violations**:
```typescript
try {
  db.transaction(() => {
    const node = db.createNode('Job', { title: 'Test' });
    db.deleteNode(node.id);
    // Try to create edge to deleted node
    db.createEdge('POSTED_BY', node.id, 999);
  });
} catch (error) {
  // SQLite error: FOREIGN KEY constraint failed
  // Transaction rolled back
}
```

**3. Application Errors**:
```typescript
try {
  db.transaction(() => {
    const node = db.createNode('Job', { title: 'Test' });

    // Application logic error
    if (someCondition) {
      throw new Error('Business logic validation failed');
    }

    return node;
  });
} catch (error) {
  // Custom error
  // Transaction rolled back
}
```

### Error Handling Best Practices

**1. Catch Specific Errors**:
```typescript
try {
  db.transaction(() => {
    // Operations
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid data:', error.message);
  } else if (error.message.includes('FOREIGN KEY')) {
    console.error('Reference constraint violated');
  } else {
    console.error('Transaction failed:', error.message);
  }
}
```

**2. Partial Rollback with Savepoints**:
```typescript
db.transaction(() => {
  const job = db.createNode('Job', { title: 'Engineer' });

  db.savepoint('optional_relations');
  try {
    // Try to create optional relationships
    db.createEdge('SIMILAR_TO', job.id, similarJobId);
  } catch (error) {
    // Rollback just the failed edge
    db.rollbackToSavepoint('optional_relations');
    console.warn('Could not create similarity edge');
  }

  // Job still created successfully
  return job;
});
```

**3. Cleanup Actions**:
```typescript
let tempNode: Node | null = null;

try {
  db.transaction(() => {
    tempNode = db.createNode('Temp', { data: 'test' });

    // Some operations
    performComplexOperation(tempNode.id);

    // Cleanup temp data
    db.deleteNode(tempNode.id);
  });
} catch (error) {
  // Transaction auto-rolled back, temp node gone
  console.error('Operation failed:', error.message);
}
```

## Transaction Usage Patterns

### Pattern 1: Simple Transaction

**Use Case**: Atomic creation of related entities

```typescript
function createJobApplication(jobData: JobData, companyData: CompanyData) {
  return db.transaction(() => {
    const job = db.createNode('Job', jobData);
    const company = db.createNode('Company', companyData);
    const edge = db.createEdge('POSTED_BY', job.id, company.id);

    return { job, company, edge };
  });
}
```

### Pattern 2: Conditional Transaction

**Use Case**: Create or update based on existence

```typescript
function upsertCompany(name: string, data: CompanyData) {
  return db.transaction(() => {
    // Check if exists
    const existing = db.nodes('Company')
      .where({ name })
      .first();

    if (existing) {
      // Update
      db.updateNode(existing.id, data);
      return existing;
    } else {
      // Create
      return db.createNode('Company', { name, ...data });
    }
  });
}
```

### Pattern 3: Batch Import

**Use Case**: Import large dataset atomically

```typescript
function importJobs(jobs: JobData[]) {
  return db.transaction(() => {
    const imported: Node[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    for (let i = 0; i < jobs.length; i++) {
      try {
        const node = db.createNode('Job', jobs[i]);
        imported.push(node);
      } catch (error) {
        errors.push({ index: i, error });
        // Could use savepoint here for partial rollback
      }
    }

    if (errors.length > 0) {
      // Rollback entire import on any error
      throw new Error(`Import failed: ${errors.length} errors`);
    }

    return imported;
  });
}
```

### Pattern 4: Complex Workflow

**Use Case**: Multi-step pipeline with rollback points

```typescript
function processJobDiscovery(jobData: JobData) {
  return db.transaction(() => {
    // Step 1: Create job node
    const job = db.createNode('Job', jobData);

    // Step 2: Extract and link company (optional)
    db.savepoint('company_extraction');
    try {
      const companyData = extractCompanyFromJob(jobData);
      const company = db.createNode('Company', companyData);
      db.createEdge('POSTED_BY', job.id, company.id);
      db.releaseSavepoint('company_extraction');
    } catch (error) {
      db.rollbackToSavepoint('company_extraction');
      console.warn('Company extraction failed, continuing...');
    }

    // Step 3: Find similar jobs (optional)
    db.savepoint('similarity_matching');
    try {
      const similarJobs = findSimilarJobs(job);
      similarJobs.forEach(similarJob => {
        db.createEdge('SIMILAR_TO', job.id, similarJob.id);
      });
      db.releaseSavepoint('similarity_matching');
    } catch (error) {
      db.rollbackToSavepoint('similarity_matching');
      console.warn('Similarity matching failed, continuing...');
    }

    // Job creation always succeeds, optional steps may fail
    return job;
  });
}
```

### Pattern 5: Graph Traversal with Updates

**Use Case**: Update nodes based on traversal results

```typescript
function propagateStatus(startNodeId: number, newStatus: string) {
  return db.transaction(() => {
    // Traverse graph to find affected nodes
    const affectedNodes = db.traverse(startNodeId)
      .out('DEPENDS_ON')
      .maxDepth(3)
      .toArray();

    // Update all nodes atomically
    affectedNodes.forEach(node => {
      db.updateNode(node.id, {
        status: newStatus,
        updated_by: 'propagation'
      });
    });

    return affectedNodes.length;
  });
}
```

## Edge Cases and Special Scenarios

### 1. Concurrent Access

**SQLite Locking Behavior**:
```typescript
// Writer 1 (holds RESERVED lock)
db.transaction(() => {
  db.createNode('Job', { title: 'Job 1' });
  // Long-running operation
  performComplexCalculation();
});

// Writer 2 (waits for RESERVED lock)
db.transaction(() => {
  db.createNode('Job', { title: 'Job 2' }); // BLOCKED
});
```

**Handling Lock Timeouts**:
```typescript
const db = new GraphDatabase('db.sqlite', {
  timeout: 5000 // Wait 5 seconds for locks
});

try {
  db.transaction(() => {
    // Operations
  });
} catch (error) {
  if (error.message.includes('SQLITE_BUSY')) {
    console.error('Database locked, retry later');
  }
}
```

### 2. Long-Running Transactions

**Problem**: Long transactions block other writers

```typescript
// ❌ BAD: Holds lock during I/O
db.transaction(() => {
  const jobs = fetchJobsFromAPI(); // Network I/O
  jobs.forEach(job => db.createNode('Job', job));
});

// ✅ GOOD: Fetch outside transaction
const jobs = fetchJobsFromAPI(); // Network I/O
db.transaction(() => {
  jobs.forEach(job => db.createNode('Job', job));
});
```

### 3. Transaction Deadlocks

SQLite uses lock escalation to prevent deadlocks:
- No true deadlocks possible (single-writer model)
- But timeout errors can occur if lock not acquired

```typescript
// Set reasonable timeout
const db = new GraphDatabase('db.sqlite', {
  timeout: 5000
});

// Retry logic for busy errors
function transactionWithRetry<T>(fn: () => T, maxRetries = 3): T {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return db.transaction(fn);
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        // Exponential backoff
        const delay = Math.pow(2, i) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

### 4. Connection Pooling

SQLite has limited concurrency:
- **Single writer** at a time
- **Multiple readers** allowed
- Connection pooling less beneficial than in PostgreSQL/MySQL

```typescript
// Not recommended for SQLite
const pool = new ConnectionPool(10); // Overkill for SQLite

// Recommended approach
const db = new GraphDatabase('db.sqlite'); // Single connection
```

**For multi-process scenarios**:
```typescript
// Use WAL mode for better concurrency
const db = new GraphDatabase('db.sqlite', {
  enableWAL: true // Readers don't block writers
});
```

### 5. Memory Databases

In-memory databases lose transactions on crash:

```typescript
// No durability
const memDb = new GraphDatabase(':memory:');

memDb.transaction(() => {
  // Data lost if process crashes
  db.createNode('Job', { title: 'Test' });
});

// For testing: Use disk with automatic cleanup
const testDb = new GraphDatabase('test.db');
// ... run tests ...
fs.unlinkSync('test.db'); // Cleanup
```

## Transaction Flow Diagrams

### Simple Transaction Flow

```
┌─────────────────────────────────────────────────┐
│ transaction(() => {                             │
│   ↓                                             │
│   BEGIN TRANSACTION                             │
│   ↓                                             │
│   createNode('Job', {...})  ───► INSERT         │
│   ↓                                             │
│   createNode('Company', {...}) ───► INSERT      │
│   ↓                                             │
│   createEdge(...)  ───► INSERT                  │
│   ↓                                             │
│   return result                                 │
│   ↓                                             │
│   COMMIT ──────────────────────► SUCCESS        │
│ })                                              │
└─────────────────────────────────────────────────┘
```

### Transaction with Error

```
┌─────────────────────────────────────────────────┐
│ transaction(() => {                             │
│   ↓                                             │
│   BEGIN TRANSACTION                             │
│   ↓                                             │
│   createNode('Job', {...})  ───► INSERT ✓       │
│   ↓                                             │
│   createNode('Invalid', {...}) ───► ERROR ✗     │
│   ↓                                             │
│   ROLLBACK ─────────────────► UNDO INSERT       │
│   ↓                                             │
│   throw Error                                   │
│ })                                              │
└─────────────────────────────────────────────────┘
```

### Nested Transaction with Savepoints

```
┌──────────────────────────────────────────────────────┐
│ transaction(() => {                                  │
│   ↓                                                  │
│   BEGIN TRANSACTION                                  │
│   ↓                                                  │
│   createNode('Job') ───► INSERT ✓                    │
│   ↓                                                  │
│   savepoint('company')                               │
│   ↓                                                  │
│   ┌────────────────────────────────────┐            │
│   │ createNode('Company') ───► INSERT  │            │
│   │ ↓                                  │            │
│   │ createEdge(...) ───► ERROR ✗       │            │
│   └────────────────────────────────────┘            │
│   ↓                                                  │
│   rollbackToSavepoint('company') ───► UNDO          │
│   ↓                                                  │
│   continue with Job...                               │
│   ↓                                                  │
│   COMMIT ───────────────────────────► SUCCESS       │
│ })                                                   │
└──────────────────────────────────────────────────────┘
```

### Lock Acquisition Flow

```
┌─────────────────────────────────────────────────────┐
│ Process A (Writer)                                  │
├─────────────────────────────────────────────────────┤
│ BEGIN TRANSACTION                                   │
│   ↓                                                 │
│ Acquire SHARED lock ──────► Read operations OK      │
│   ↓                                                 │
│ First write ──────► Upgrade to RESERVED lock        │
│   ↓                           ↓                     │
│ More writes ─────► Block new writers                │
│   ↓                           ↓                     │
│ COMMIT ──────────► EXCLUSIVE lock (brief)           │
│   ↓                           ↓                     │
│ Release all locks ────────► UNLOCKED                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Process B (Reader during Process A)                 │
├─────────────────────────────────────────────────────┤
│ SELECT query                                        │
│   ↓                                                 │
│ Acquire SHARED lock ───► OK (concurrent read)       │
│   ↓                                                 │
│ Read data ─────────────► Sees pre-transaction state │
│   ↓                                                 │
│ Release SHARED lock ───► UNLOCKED                   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Process C (Writer during Process A)                 │
├─────────────────────────────────────────────────────┤
│ BEGIN TRANSACTION                                   │
│   ↓                                                 │
│ First write ──────► Try RESERVED lock               │
│   ↓                           ↓                     │
│ BLOCKED ──────────────────► WAIT (PENDING state)    │
│   ↓                                                 │
│ (waits until Process A commits)                     │
│   ↓                                                 │
│ Acquire RESERVED lock ────► Continue                │
└─────────────────────────────────────────────────────┘
```

## Performance Optimization

### Batch Operations

```typescript
// ❌ SLOW: Many small transactions
async function importJobsSlow(jobs: JobData[]) {
  for (const job of jobs) {
    db.createNode('Job', job); // Auto-commit each
  }
}

// ✅ FAST: Single large transaction
function importJobsFast(jobs: JobData[]) {
  return db.transaction(() => {
    return jobs.map(job => db.createNode('Job', job));
  });
}

// ⚡ OPTIMAL: Batched transactions
function importJobsOptimal(jobs: JobData[], batchSize = 100) {
  const results: Node[] = [];

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);

    const batchResults = db.transaction(() => {
      return batch.map(job => db.createNode('Job', job));
    });

    results.push(...batchResults);
  }

  return results;
}
```

### WAL Mode for Concurrency

```typescript
// Enable WAL mode
const db = new GraphDatabase('db.sqlite', {
  enableWAL: true
});

// Benefits:
// - Readers don't block writers
// - Writers don't block readers
// - Better concurrency
// - Atomic commits
```

### Prepared Statements (Internal)

better-sqlite3 automatically prepares and caches statements:

```typescript
// Automatically prepared and cached
db.transaction(() => {
  for (let i = 0; i < 1000; i++) {
    db.createNode('Job', { title: `Job ${i}` });
    // Same prepared statement reused
  }
});
```

## Testing Transaction Behavior

### Unit Tests

```typescript
describe('Transactions', () => {
  test('atomic commit on success', () => {
    const result = db.transaction(() => {
      const n1 = db.createNode('Job', { title: 'Job 1' });
      const n2 = db.createNode('Job', { title: 'Job 2' });
      return [n1, n2];
    });

    expect(result).toHaveLength(2);
    expect(db.getNode(result[0].id)).toBeDefined();
    expect(db.getNode(result[1].id)).toBeDefined();
  });

  test('automatic rollback on error', () => {
    const before = db.nodes('Job').count();

    expect(() => {
      db.transaction(() => {
        db.createNode('Job', { title: 'Job 1' });
        throw new Error('Test error');
      });
    }).toThrow('Test error');

    const after = db.nodes('Job').count();
    expect(after).toBe(before); // No change
  });

  test('savepoint rollback preserves outer transaction', () => {
    const result = db.transaction(() => {
      const job = db.createNode('Job', { title: 'Job' });

      db.savepoint('nested');
      try {
        db.createNode('Invalid', { data: 'test' });
      } catch (error) {
        db.rollbackToSavepoint('nested');
      }

      return job;
    });

    expect(db.getNode(result.id)).toBeDefined();
  });
});
```

### Concurrency Tests

```typescript
describe('Concurrent Access', () => {
  test('multiple readers allowed', async () => {
    const promises = Array(5).fill(null).map(() =>
      Promise.resolve(db.nodes('Job').count())
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(5);
  });

  test('writer blocks other writers', async () => {
    let writer1Started = false;
    let writer2Blocked = true;

    const writer1 = new Promise(resolve => {
      db.transaction(() => {
        writer1Started = true;
        // Simulate long operation
        const start = Date.now();
        while (Date.now() - start < 100) {}
        resolve(true);
      });
    });

    // Wait for writer1 to start
    while (!writer1Started) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const writer2 = new Promise(resolve => {
      try {
        db.transaction(() => {
          writer2Blocked = false;
          resolve(true);
        });
      } catch (error) {
        resolve(false);
      }
    });

    await Promise.all([writer1, writer2]);
    expect(writer2Blocked).toBe(true); // Was blocked
  });
});
```

## Summary

### Transaction Guarantees

✅ **Atomicity**: All-or-nothing execution
✅ **Consistency**: Schema and constraint validation
✅ **Isolation**: Serializable isolation via locking
✅ **Durability**: Persisted to disk on commit

### Best Practices

1. **Use transactions for multi-step operations**
2. **Keep transactions short** (minimize lock time)
3. **Fetch data outside transactions** (no I/O in transactions)
4. **Use savepoints for partial rollback**
5. **Enable WAL mode** for better concurrency
6. **Handle SQLITE_BUSY errors** with retry logic
7. **Batch large imports** for better performance

### Key Takeaways

- SQLite provides **serializable isolation** through locking
- **Single writer** at a time (multiple readers allowed)
- **Automatic rollback** on any error
- **Savepoints** enable nested transaction-like behavior
- **WAL mode** improves concurrency significantly
- **better-sqlite3** provides synchronous API with automatic preparation

---

**Implementation Status**: Specification complete, ready for Transaction.ts implementation
**Next Steps**: Implement Transaction class in src/core/Transaction.ts following this specification
