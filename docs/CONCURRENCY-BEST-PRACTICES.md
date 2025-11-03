# SQLite Concurrency Best Practices for sqlite-graph

## Overview

This document outlines best practices for handling concurrency in sqlite-graph, informed by real-world production experience from projects like [Jellyfin's SQLite implementation](https://jellyfin.org/posts/SQLite-locking/).

## Understanding SQLite's Concurrency Model

### Core Limitations

SQLite's concurrency model has fundamental constraints:

1. **Single Writer**: Only one write transaction at a time
2. **Multiple Readers**: Unlimited concurrent reads (with WAL mode)
3. **Lock Contention**: Writers block readers in rollback mode, but not in WAL mode

### Lock Types

| Lock Type | Scope | Impact | Duration |
|-----------|-------|--------|----------|
| SHARED | Read operations | Blocks writes | Query duration |
| RESERVED | Intent to write | Blocks other writers | Transaction duration |
| PENDING | Waiting for write | Blocks new readers | Short (transition) |
| EXCLUSIVE | Active write | Blocks all operations | Write completion |

## WAL Mode (Write-Ahead Logging)

### What is WAL Mode?

WAL (Write-Ahead Logging) changes how SQLite handles transactions:

**Traditional Rollback Mode:**
- Writes directly to database file
- Creates rollback journal for recovery
- Writers block readers
- Readers block writers

**WAL Mode:**
- Writes go to separate WAL file first
- Multiple readers can proceed during writes
- WAL periodically checkpointed to main database
- Better concurrency for read-heavy workloads

### Enabling WAL Mode

```typescript
import { GraphDatabase } from 'sqlite-graph';

const db = new GraphDatabase('./graph.db');

// Enable WAL mode for better concurrency
db.db.pragma('journal_mode = WAL');

// Verify it's enabled
const mode = db.db.pragma('journal_mode', { simple: true });
console.log(`Journal mode: ${mode}`); // Should output: "wal"
```

### WAL Mode Configuration

```typescript
// Full WAL optimization
db.db.pragma('journal_mode = WAL');
db.db.pragma('synchronous = NORMAL'); // Faster, still safe with WAL
db.db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
db.db.pragma('journal_size_limit = 6144000'); // 6MB WAL size limit
```

### When to Use WAL Mode

**✅ Use WAL when:**
- Read-heavy workloads (80%+ reads)
- Multiple concurrent readers expected
- Write latency is acceptable
- Disk space available for WAL file (can grow to ~2x database size)

**❌ Avoid WAL when:**
- Write-heavy workloads (>50% writes)
- Network filesystems (NFS, SMB) - WAL requires local filesystem
- Very small databases (<100KB) - overhead not worth it
- Multiple processes need to write simultaneously (use client-server DB instead)

## Locking Strategies

Based on Jellyfin's experience, there are three primary strategies for handling lock contention:

### 1. No-Lock Strategy (Default)

**When to use:** 99% of use cases with low contention

**Characteristics:**
- No synchronization overhead
- Fast for single-writer scenarios
- Relies on SQLite's internal locking
- Fails fast on lock conflicts

**Implementation:**
```typescript
// sqlite-graph uses this by default
const db = new GraphDatabase('./graph.db');
db.db.pragma('journal_mode = WAL');

try {
  db.createNode('Job', { title: 'Engineer' });
} catch (error) {
  if (error.message.includes('SQLITE_BUSY')) {
    console.error('Database locked, try again later');
  }
  throw error;
}
```

**Best for:**
- Single-process applications
- Low write concurrency (<10 writes/sec)
- Embedded applications (desktop, mobile)
- Background processing with single writer

### 2. Optimistic Locking with Retry

**When to use:** Moderate write contention, can tolerate brief delays

**Characteristics:**
- "Try and Retry" approach
- Automatic retry on lock conflicts
- Exponential backoff
- Maximum retry attempts

**Implementation:**
```typescript
/**
 * Retry wrapper for write operations
 */
async function withRetry<T>(
  operation: () => T,
  maxRetries: number = 5,
  initialDelayMs: number = 10
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return operation();
    } catch (error: any) {
      lastError = error;

      // Only retry on lock errors
      if (!error.message.includes('SQLITE_BUSY') &&
          !error.message.includes('database is locked')) {
        throw error;
      }

      // Exponential backoff: 10ms, 20ms, 40ms, 80ms, 160ms
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delayMs));

      console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`);
    }
  }

  throw new Error(`Operation failed after ${maxRetries} retries: ${lastError?.message}`);
}

// Usage
await withRetry(() => {
  db.createNode('Job', { title: 'Engineer' });
});

await withRetry(() => {
  db.mergeNode('Company', { name: 'TechCorp' }, { industry: 'SaaS' });
});
```

**Advanced Retry with jitter:**
```typescript
function exponentialBackoffWithJitter(attempt: number, baseMs: number = 10): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * exponential * 0.1; // ±10% jitter
  return exponential + jitter;
}
```

**Best for:**
- Web applications with moderate concurrency (10-100 concurrent users)
- Background job processing with multiple workers
- API servers with bursty write patterns
- Batch import operations

### 3. Pessimistic Locking with Queue

**When to use:** High write contention, strict ordering requirements

**Characteristics:**
- Single write queue
- Guaranteed write ordering
- Higher latency but predictable
- Prevents lock conflicts entirely

**Implementation:**
```typescript
/**
 * Write queue for pessimistic locking
 */
class WriteQueue {
  private queue: Array<() => void> = [];
  private processing = false;

  async enqueue<T>(operation: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => {
        try {
          const result = operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const operation = this.queue.shift()!;
      operation();

      // Small delay between operations to allow checkpoint
      await new Promise(resolve => setTimeout(resolve, 1));
    }

    this.processing = false;
  }
}

// Usage
const writeQueue = new WriteQueue();

// All writes go through queue
await writeQueue.enqueue(() => {
  db.createNode('Job', { title: 'Engineer' });
});

await writeQueue.enqueue(() => {
  db.mergeNode('Company', { name: 'TechCorp' }, { industry: 'SaaS' });
});
```

**Best for:**
- High-concurrency web applications (100+ concurrent users)
- Real-time systems requiring strict ordering
- Financial systems requiring ACID guarantees
- Multi-tenant applications with shared database

## Transaction Best Practices

### Batch Operations in Transactions

**Problem:** Individual writes are slow

```typescript
// ❌ SLOW: 1000 individual transactions
for (let i = 0; i < 1000; i++) {
  db.createNode('Job', { title: `Job ${i}` });
} // ~1000ms

// ✅ FAST: Single transaction
db.transaction(() => {
  for (let i = 0; i < 1000; i++) {
    db.createNode('Job', { title: `Job ${i}` });
  }
}); // ~50ms (20x faster!)
```

### Keep Transactions Short

**Problem:** Long transactions increase lock contention

```typescript
// ❌ BAD: Long-running transaction blocks other operations
db.transaction(() => {
  const jobs = db.nodes('Job').exec(); // Fast

  jobs.forEach(job => {
    // Slow operation inside transaction
    const analysis = expensiveAnalysis(job); // 100ms each
    db.updateNode(job.id, { analysis });
  });
}); // Holds lock for seconds!

// ✅ GOOD: Do expensive work outside transaction
const jobs = db.nodes('Job').exec();

const updates = jobs.map(job => ({
  id: job.id,
  analysis: expensiveAnalysis(job) // Outside transaction
}));

// Fast batch update
db.transaction(() => {
  updates.forEach(({ id, analysis }) => {
    db.updateNode(id, { analysis });
  });
}); // Holds lock for milliseconds
```

### Use Savepoints for Partial Rollback

```typescript
db.transaction(() => {
  // Create base data
  const company = db.createNode('Company', { name: 'TechCorp' });

  // Savepoint before risky operation
  const sp = db.savepoint();

  try {
    // Risky operation that might fail
    const job = db.createNode('Job', { title: 'Engineer' });
    db.createEdge(job.id, 'POSTED_BY', company.id);
  } catch (error) {
    // Rollback just the risky part
    db.rollbackTo(sp);
    console.warn('Job creation failed, keeping company');
  }

  // Transaction continues with company created
});
```

## Index Strategy for Merge Operations

Indexes are critical for merge operation performance (7.11x speedup):

```typescript
// ❌ Without index: 4,196 ops/sec
db.mergeNode('Job', { url: 'https://example.com/job/123' });

// ✅ With index: 29,844 ops/sec (7.11x faster!)
db.createPropertyIndex('Job', 'url');
db.mergeNode('Job', { url: 'https://example.com/job/123' });
```

### Index Creation Strategy

```typescript
/**
 * Create indexes for frequently merged properties
 */
function setupProductionIndexes(db: GraphDatabase): void {
  // Indexes for unique identifiers
  db.createPropertyIndex('Job', 'url');
  db.createPropertyIndex('Company', 'name');
  db.createPropertyIndex('Company', 'domain');
  db.createPropertyIndex('User', 'email');

  // Indexes for frequently queried properties
  db.createPropertyIndex('Job', 'status');
  db.createPropertyIndex('Application', 'status');

  console.log('Production indexes created');
}

// Run on database initialization
const db = new GraphDatabase('./graph.db');
db.db.pragma('journal_mode = WAL');
setupProductionIndexes(db);
```

## Multi-Process Architecture Patterns

### Pattern 1: Single Writer, Multiple Readers

**Use case:** API server with read replicas

```typescript
// writer.ts (single process)
const writerDb = new GraphDatabase('./graph.db');
writerDb.db.pragma('journal_mode = WAL');

app.post('/jobs', async (req, res) => {
  const job = writerDb.createNode('Job', req.body);
  res.json(job);
});

// reader.ts (multiple processes)
const readerDb = new GraphDatabase('./graph.db');
readerDb.db.pragma('journal_mode = WAL');

app.get('/jobs', async (req, res) => {
  const jobs = readerDb.nodes('Job').where(req.query).exec();
  res.json(jobs);
});
```

### Pattern 2: Write Queue Service

**Use case:** Multiple services need to write

```typescript
// write-service.ts (dedicated write process)
import express from 'express';

const db = new GraphDatabase('./graph.db');
db.db.pragma('journal_mode = WAL');
const writeQueue = new WriteQueue();

app.post('/write', async (req, res) => {
  const result = await writeQueue.enqueue(() => {
    return db.createNode(req.body.type, req.body.properties);
  });
  res.json(result);
});

// application-service.ts (calls write service)
async function createJob(data: JobProperties) {
  const response = await fetch('http://write-service/write', {
    method: 'POST',
    body: JSON.stringify({ type: 'Job', properties: data })
  });
  return response.json();
}
```

### Pattern 3: Message Queue with Worker Pool

**Use case:** High-throughput batch processing

```typescript
import { Worker } from 'worker_threads';

// main.ts
const writeWorker = new Worker('./write-worker.ts');

messageQueue.on('message', async (msg) => {
  writeWorker.postMessage({ operation: 'createNode', data: msg });
});

// write-worker.ts (single thread owns database connection)
import { parentPort } from 'worker_threads';

const db = new GraphDatabase('./graph.db');
db.db.pragma('journal_mode = WAL');

parentPort?.on('message', (msg) => {
  db.transaction(() => {
    const result = db.createNode(msg.data.type, msg.data.properties);
    parentPort?.postMessage({ success: true, result });
  });
});
```

## Monitoring and Debugging

### Detect Lock Contention

```typescript
/**
 * Monitor database lock wait times
 */
function monitorLockWaits(db: GraphDatabase): void {
  let lockWaits = 0;

  const originalExec = db.db.prepare.bind(db.db);
  db.db.prepare = function(sql: string) {
    const stmt = originalExec(sql);
    const originalRun = stmt.run.bind(stmt);

    stmt.run = function(...args: any[]) {
      const start = Date.now();
      try {
        return originalRun(...args);
      } catch (error: any) {
        if (error.message.includes('SQLITE_BUSY')) {
          lockWaits++;
          console.warn(`Lock wait detected (${lockWaits} total)`);
        }
        throw error;
      } finally {
        const duration = Date.now() - start;
        if (duration > 100) {
          console.warn(`Slow query: ${sql} took ${duration}ms`);
        }
      }
    };

    return stmt;
  };
}
```

### WAL Checkpoint Monitoring

```typescript
/**
 * Monitor WAL file size and checkpoint frequency
 */
function monitorWAL(db: GraphDatabase): void {
  setInterval(() => {
    const walSize = db.db.pragma('wal_checkpoint(PASSIVE)', { simple: true });
    console.log(`WAL checkpoint: ${walSize} pages`);
  }, 60000); // Check every minute
}
```

### Performance Metrics

```typescript
interface ConcurrencyMetrics {
  totalWrites: number;
  lockWaits: number;
  avgWriteTime: number;
  maxWriteTime: number;
  retryCount: number;
}

class MetricsCollector {
  private metrics: ConcurrencyMetrics = {
    totalWrites: 0,
    lockWaits: 0,
    avgWriteTime: 0,
    maxWriteTime: 0,
    retryCount: 0
  };

  recordWrite(durationMs: number, hadRetry: boolean): void {
    this.metrics.totalWrites++;
    this.metrics.avgWriteTime =
      (this.metrics.avgWriteTime * (this.metrics.totalWrites - 1) + durationMs) /
      this.metrics.totalWrites;
    this.metrics.maxWriteTime = Math.max(this.metrics.maxWriteTime, durationMs);
    if (hadRetry) this.metrics.retryCount++;
  }

  recordLockWait(): void {
    this.metrics.lockWaits++;
  }

  report(): ConcurrencyMetrics {
    return { ...this.metrics };
  }
}
```

## Production Recommendations

### Startup Configuration

```typescript
/**
 * Production-ready database initialization
 */
function initProductionDatabase(path: string): GraphDatabase {
  const db = new GraphDatabase(path);

  // Enable WAL mode for better concurrency
  db.db.pragma('journal_mode = WAL');

  // Optimize for mixed workload
  db.db.pragma('synchronous = NORMAL'); // Safe with WAL
  db.db.pragma('cache_size = -64000'); // 64MB cache
  db.db.pragma('temp_store = MEMORY'); // Temp tables in RAM
  db.db.pragma('mmap_size = 30000000000'); // 30GB mmap
  db.db.pragma('page_size = 4096'); // Standard page size

  // WAL-specific optimizations
  db.db.pragma('wal_autocheckpoint = 1000'); // Checkpoint every 1000 pages
  db.db.pragma('journal_size_limit = 6144000'); // 6MB WAL limit

  // Set busy timeout (milliseconds to wait on lock)
  db.db.pragma('busy_timeout = 5000'); // 5 second timeout

  return db;
}
```

### Error Handling

```typescript
/**
 * Handle database errors with appropriate retry logic
 */
async function executeWithRetry<T>(
  db: GraphDatabase,
  operation: () => T,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return operation();
    } catch (error: any) {
      // Handle specific SQLite errors
      if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
        if (attempt < maxRetries - 1) {
          await new Promise(resolve =>
            setTimeout(resolve, exponentialBackoffWithJitter(attempt))
          );
          continue;
        }
      }

      // Non-retryable error or max retries reached
      console.error(`Database operation failed:`, error);
      throw error;
    }
  }

  throw new Error('Unreachable');
}
```

## Decision Matrix

| Scenario | Write Frequency | Concurrency | Recommended Strategy |
|----------|----------------|-------------|---------------------|
| Desktop app | Low (<1/sec) | Single process | No-Lock + WAL |
| CLI tool | Batch | Single process | No-Lock + Transactions |
| API server | Medium (1-10/sec) | 10-50 users | Optimistic + WAL |
| API server | High (10-100/sec) | 50-500 users | Pessimistic Queue + WAL |
| Background jobs | Batch | 2-10 workers | Optimistic + WAL + Batch transactions |
| Real-time system | High (>100/sec) | >500 users | ⚠️ Consider client-server DB |
| Multi-tenant SaaS | Variable | >1000 users | ⚠️ Consider client-server DB |

## When to Upgrade

If you're hitting these limits, consider upgrading to a client-server database (PostgreSQL, Neo4j):

**Upgrade signals:**
- Lock waits >5% of operations
- Write latency >100ms consistently
- Need true multi-writer (not just read concurrency)
- Need horizontal scaling/replication
- Database size >10GB
- Write throughput >1000 ops/sec sustained

## Summary

**Key Takeaways:**

1. **Enable WAL mode** for production use - it's free performance for read-heavy workloads
2. **Choose locking strategy** based on write concurrency:
   - No-Lock: Single process, low contention
   - Optimistic: Moderate concurrency, retry acceptable
   - Pessimistic: High concurrency, strict ordering
3. **Batch operations** in transactions for 10-20x speedup
4. **Index merge properties** for 7x speedup on merge operations
5. **Keep transactions short** to minimize lock contention
6. **Monitor metrics** to detect when you're approaching limits
7. **Know when to upgrade** to a client-server database

## References

- [Jellyfin SQLite Locking Post](https://jellyfin.org/posts/SQLite-locking/)
- [SQLite WAL Mode Documentation](https://www.sqlite.org/wal.html)
- [SQLite Locking Documentation](https://www.sqlite.org/lockingv3.html)
- [sqlite-graph Performance Benchmarks](./BENCHMARKS.md)
- [sqlite-graph Limitations](./LIMITATIONS.md)
