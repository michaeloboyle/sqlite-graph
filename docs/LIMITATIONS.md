# Limitations and Areas of Concern

## Overview

sqlite-graph is designed for embedded use cases with small to medium-sized graphs. While it provides excellent performance and developer experience within its intended scope, there are important limitations to understand before adoption.

## Critical Limitations

### 1. Concurrency Model

**Issue:** SQLite's single-writer limitation

**Impact:**
- Only one write transaction at a time
- Multiple readers allowed, but writers block all operations
- No true concurrent writes from multiple processes
- Lock contention can cause "database is locked" errors under load

**Real-world context:** [Jellyfin experienced significant SQLite locking issues](https://jellyfin.org/posts/SQLite-locking/) with thousands of simultaneous write requests causing database lock failures and crashes. They implemented three locking strategies to address this.

**Manifestation:**
```typescript
// ❌ This will fail or block with multiple processes
const db1 = new GraphDatabase('./graph.db'); // Process 1
const db2 = new GraphDatabase('./graph.db'); // Process 2

// Both try to write simultaneously
db1.createNode('Job', { title: 'Engineer' }); // Blocks
db2.createNode('Job', { title: 'Developer' }); // Blocks or fails with SQLITE_BUSY

// ❌ High-concurrency scenarios can cause lock failures
for (let i = 0; i < 1000; i++) {
  // Multiple processes trying this simultaneously = lock contention
  db.mergeNode('Job', { url: `https://example.com/job/${i}` });
}
```

**Recommended Workarounds:**

**1. Enable WAL Mode (Essential for Production):**
```typescript
// ✅ ALWAYS enable WAL mode for production use
const db = new GraphDatabase('./graph.db');
db.db.pragma('journal_mode = WAL');

// WAL allows multiple readers during writes
// Provides better concurrency for read-heavy workloads
```

**2. Implement Retry Logic (Optimistic Locking):**
```typescript
// ✅ Add retry logic for write operations
async function withRetry<T>(operation: () => T, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return operation();
    } catch (error: any) {
      if (error.message.includes('SQLITE_BUSY') && attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 10 * Math.pow(2, attempt)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

await withRetry(() => db.createNode('Job', { title: 'Engineer' }));
```

**3. Use Write Queue (Pessimistic Locking):**
```typescript
// ✅ For high-concurrency scenarios, use a write queue
class WriteQueue {
  private queue: Array<() => void> = [];
  private processing = false;

  async enqueue<T>(operation: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => {
        try { resolve(operation()); }
        catch (error) { reject(error); }
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const operation = this.queue.shift()!;
      operation();
    }
    this.processing = false;
  }
}

const writeQueue = new WriteQueue();
await writeQueue.enqueue(() => db.createNode('Job', { title: 'Engineer' }));
```

**4. Other Workarounds:**
- Use in-memory database (`:memory:`) for single-process
- Implement application-level write queue
- Set busy timeout: `db.db.pragma('busy_timeout = 5000')` (5 second wait)
- Consider upgrading to client-server database if multi-writer needed

**When this matters:**
- Web applications with concurrent users (>10 simultaneous writes)
- Multi-process architectures
- High write throughput requirements (>100 writes/sec)
- Background job processing with multiple workers
- Real-time systems with bursty write patterns

**See also:** [CONCURRENCY-BEST-PRACTICES.md](./CONCURRENCY-BEST-PRACTICES.md) for comprehensive guidance on handling concurrency in production.

---

### 2. Scale Limits

**Issue:** Performance degrades with graph size

**Impact:**
- Performance optimal for graphs < 1M nodes
- Memory usage grows with graph size
- Query performance degrades without proper indexing

**Benchmarks by Scale:**

| Nodes | Edges | Query Time | Memory | Status |
|-------|-------|------------|--------|--------|
| 1K | 5K | <1ms | <10MB | ✅ Excellent |
| 10K | 50K | <5ms | <50MB | ✅ Good |
| 100K | 500K | <20ms | <200MB | ⚠️ Acceptable |
| 1M | 5M | <100ms | <1GB | ⚠️ Slow |
| 10M+ | 50M+ | >500ms | >2GB | ❌ Not Recommended |

**SQLite Hard Limits:**
- Database size: 281 TB (theoretical)
- Table size: 2^63 bytes
- Rows per table: 2^64
- Practical limit: ~1M nodes before significant degradation

**Mitigation:**
```typescript
// ✅ Always index match properties for merge operations
db.createPropertyIndex('Job', 'url');
db.createPropertyIndex('Company', 'name');

// ✅ Use transactions for bulk operations
db.transaction(() => {
  jobs.forEach(job => db.createNode('Job', job));
});

// ⚠️ Monitor graph size
const stats = db.export();
console.log(`Nodes: ${stats.nodes.length}, Edges: ${stats.edges.length}`);
```

---

### 3. No Distributed System Support

**Issue:** Single-node architecture only

**Impact:**
- Cannot scale horizontally
- No built-in replication
- No high availability
- Single point of failure

**What's Missing:**
- Cluster management
- Automatic failover
- Cross-datacenter replication
- Sharding/partitioning
- Consensus protocols

**Workarounds:**
- Application-level replication (rsync, litestream)
- Read replicas via WAL streaming
- Cloud storage with backups
- Manual export/import for data migration

**When this matters:**
- Mission-critical applications requiring 99.99% uptime
- Need for geographic distribution
- Regulatory requirements for data redundancy
- Scale beyond single server capacity

---

### 4. Limited Graph Algorithms

**Issue:** Basic algorithm set only

**Currently Implemented:**
- ✅ Breadth-First Search (BFS)
- ✅ Shortest path (unweighted)
- ✅ Cycle detection
- ✅ Path enumeration

**Not Implemented:**
- ❌ Weighted shortest path (Dijkstra, A*)
- ❌ All paths finding
- ❌ Centrality algorithms (PageRank, Betweenness)
- ❌ Community detection (Louvain, Label Propagation)
- ❌ Graph pattern matching
- ❌ Subgraph isomorphism
- ❌ Minimum spanning tree
- ❌ Maximum flow

**Impact:**
```typescript
// ✅ Can do this
const path = db.traverse(startId).shortestPath(endId);

// ❌ Cannot do this (yet)
const path = db.traverse(startId)
  .shortestPath(endId, {
    weighted: true,
    property: 'distance'
  });

// ❌ Cannot do this (yet)
const pageRank = db.algorithms.pageRank({ iterations: 100 });
```

**Workarounds:**
- Export to specialized tools (NetworkX, igraph)
- Implement custom algorithms using traversal API
- Use external graph analytics services

---

### 5. No Full-Text Search

**Issue:** Limited text search capabilities

**Current Capabilities:**
```typescript
// ✅ Exact match only
db.nodes('Job').where({ title: 'Engineer' }).exec();

// ❌ No fuzzy search
db.nodes('Job').where({ title: { $search: 'engin*' } }); // Not supported

// ❌ No full-text search
db.nodes('Job')
  .search('machine learning engineer') // Not supported
  .exec();
```

**Impact:**
- Cannot do fuzzy matching
- No relevance scoring
- No stemming or tokenization
- No language-specific search
- No phonetic matching

**Workarounds:**
```typescript
// Use SQLite FTS5 extension (requires custom SQL)
db.db.prepare(`
  CREATE VIRTUAL TABLE jobs_fts USING fts5(title, description);
`).run();

// Or use external search (Elasticsearch, MeiliSearch)
// Or implement manual filtering
const results = db.nodes('Job')
  .exec()
  .filter(job => job.properties.title.toLowerCase().includes('engineer'));
```

---

### 6. JSON Property Limitations

**Issue:** Properties stored as JSON text

**Impact:**
- No partial property indexing
- Type information lost in storage
- Date objects become strings
- Query performance on nested properties

**Example Issues:**
```typescript
// ❌ Date becomes string
const job = db.createNode('Job', {
  title: 'Engineer',
  posted: new Date('2024-01-01') // Serialized as ISO string
});

// ⚠️ Retrieved as string, not Date
const retrieved = db.getNode(job.id);
console.log(typeof retrieved.properties.posted); // "string", not Date

// ❌ Cannot index nested properties efficiently
db.createPropertyIndex('Job', 'salary.min'); // Not supported

// ⚠️ Must query entire property
const jobs = db.nodes('Job')
  .exec()
  .filter(j => (j.properties as any).salary?.min > 100000);
```

**Workarounds:**
```typescript
// ✅ Flatten important nested properties
interface JobProperties {
  title: string;
  salary_min: number; // Flattened
  salary_max: number; // Flattened
  posted_date: string; // Store as ISO string
}

// ✅ Use custom (de)serialization for dates
const job = db.createNode('Job', {
  title: 'Engineer',
  posted: dateToTimestamp(new Date())
});

const retrieved = db.getNode(job.id);
const posted = timestampToDate(retrieved.properties.posted);
```

---

### 7. No Query Optimization Hints

**Issue:** Cannot influence query planner

**What's Missing:**
- Query execution plans
- Index usage analysis
- Query hints (FORCE INDEX, USE INDEX)
- Cost-based optimization feedback
- Automatic index recommendations

**Current Limitations:**
```typescript
// ❌ Cannot see execution plan
const jobs = db.nodes('Job')
  .where({ status: 'active' })
  .connectedTo('Company', 'POSTED_BY')
  .exec(); // No way to see if indexes are used

// ❌ Cannot force index usage
db.nodes('Job').useIndex('idx_status').where(...); // Not supported

// ❌ No query stats
console.log(jobs.stats()); // Not available
```

**Workarounds:**
```typescript
// Use SQLite EXPLAIN QUERY PLAN manually
const plan = db.db.prepare(`
  EXPLAIN QUERY PLAN
  SELECT * FROM nodes WHERE type = 'Job' AND json_extract(properties, '$.status') = 'active'
`).all();

console.log(plan);
```

---

### 8. Memory-Only Mode Limitations

**Issue:** In-memory databases cannot exceed RAM

**Impact:**
```typescript
// ⚠️ Everything in memory
const db = new GraphDatabase(':memory:');

// If graph exceeds RAM, crashes with OOM
for (let i = 0; i < 10_000_000; i++) {
  db.createNode('Job', { title: `Job ${i}` }); // Eventually OOM
}
```

**Considerations:**
- No persistence by default
- Lost on process exit
- RAM limits graph size
- No paging to disk

**Workarounds:**
```typescript
// ✅ Use file-based database for large graphs
const db = new GraphDatabase('./graph.db');

// ✅ Or implement manual checkpointing
const memDb = new GraphDatabase(':memory:');
setInterval(() => {
  const data = memDb.export();
  fs.writeFileSync('checkpoint.json', JSON.stringify(data));
}, 60000);
```

---

### 9. Type Safety Limitations

**Issue:** Runtime type safety only

**Current Behavior:**
```typescript
interface JobProperties {
  title: string;
  salary: number;
  remote: boolean;
}

// ✅ Compile-time type checking
const job = db.createNode<JobProperties>('Job', {
  title: 'Engineer',
  salary: 150000,
  remote: true
});

// ❌ But runtime allows anything
const badJob = db.createNode('Job', {
  title: 123, // Should be string, but accepted
  invalid: 'property' // Not in type, but stored
});

// ⚠️ Query results need casting
const jobs = db.nodes('Job').exec();
jobs[0].properties.title; // Typed as string, but could be anything at runtime
```

**No Runtime Validation:**
- Type guards not enforced
- Schema validation optional
- Property types not validated
- No automatic type coercion

**Workarounds:**
```typescript
// ✅ Use Zod for runtime validation
import { z } from 'zod';

const JobSchema = z.object({
  title: z.string(),
  salary: z.number().positive(),
  remote: z.boolean()
});

function createValidatedJob(properties: unknown) {
  const validated = JobSchema.parse(properties);
  return db.createNode('Job', validated);
}

// ✅ Or use GraphSchema with validation
const db = new GraphDatabase('./graph.db', {
  schema: {
    nodes: {
      Job: { properties: ['title', 'salary', 'remote'] }
    }
  }
});
```

---

## Security Concerns

### 1. SQL Injection (Low Risk)

**Issue:** User input in queries

**Current Mitigation:**
- All queries use prepared statements
- Properties serialized as JSON (not interpolated)
- Type validation prevents injection

**Still Vulnerable:**
```typescript
// ❌ NEVER do this (bypass prepared statements)
const userInput = req.query.type; // "Job' OR '1'='1"
const sql = `SELECT * FROM nodes WHERE type = '${userInput}'`;
db.db.prepare(sql).all(); // SQL injection possible

// ✅ Always use parameterized queries (library does this)
db.nodes(userInput).exec(); // Safe
```

---

### 2. File System Access

**Issue:** Database file permissions

**Concerns:**
- Database file readable by anyone with file access
- No encryption at rest
- Backup files expose data
- Temporary files may leak data

**Mitigation:**
```typescript
// ✅ Set proper file permissions
const db = new GraphDatabase('./graph.db');
fs.chmodSync('./graph.db', 0o600); // Owner read/write only

// ✅ Use encrypted file system
// ✅ Encrypt backups before storage
// ✅ Use tmpfs for temporary databases
```

---

### 3. Denial of Service

**Issue:** Resource exhaustion attacks

**Attack Vectors:**
```typescript
// ❌ Unbounded query results
const allJobs = db.nodes('Job').exec(); // Could return millions

// ❌ Deep traversals
const connections = db.traverse(userId)
  .out('FRIEND')
  .maxDepth(100) // Could traverse entire graph
  .toArray();

// ❌ Large property values
db.createNode('Job', {
  description: 'x'.repeat(100_000_000) // 100MB string
});
```

**Mitigation:**
```typescript
// ✅ Always use limits
const jobs = db.nodes('Job').limit(100).exec();

// ✅ Limit traversal depth
const connections = db.traverse(userId)
  .out('FRIEND')
  .maxDepth(3) // Reasonable limit
  .toArray();

// ✅ Validate property sizes
function createNodeSafe(type: string, properties: any) {
  const size = JSON.stringify(properties).length;
  if (size > 1_000_000) throw new Error('Properties too large');
  return db.createNode(type, properties);
}
```

---

## Performance Concerns

### 1. Unindexed Merge Operations

**Issue:** Full table scans without indexes

**Impact:**
```typescript
// ⚠️ 7x slower without index
db.mergeNode('Job', { url: 'https://...' }); // 4,196 ops/sec

// ✅ 7x faster with index
db.createPropertyIndex('Job', 'url');
db.mergeNode('Job', { url: 'https://...' }); // 29,844 ops/sec
```

**Warning System:**
```
MERGE on Job.url without index. This will cause full table scans
on large datasets. Create index with: db.createPropertyIndex('Job', 'url')
```

---

### 2. Large Property Objects

**Issue:** JSON serialization overhead

**Impact:**
```typescript
// ⚠️ Slow: Large JSON object
db.createNode('Job', {
  title: 'Engineer',
  fullDescription: 'x'.repeat(100000), // 100KB text
  metadata: { /* large object */ }
}); // Serialization overhead

// ✅ Better: Store large blobs separately
db.createNode('Job', {
  title: 'Engineer',
  descriptionPath: '/blobs/job-1-description.txt'
});
```

---

### 3. Missing Transaction Batching

**Issue:** Individual writes are slow

**Impact:**
```typescript
// ❌ Slow: 1000 individual writes
for (let i = 0; i < 1000; i++) {
  db.createNode('Job', { title: `Job ${i}` });
} // ~1 second

// ✅ Fast: Batched in transaction
db.transaction(() => {
  for (let i = 0; i < 1000; i++) {
    db.createNode('Job', { title: `Job ${i}` });
  }
}); // ~50ms (20x faster)
```

---

## Operational Concerns

### 1. Backup and Recovery

**Current State:**
- No built-in backup mechanism
- No point-in-time recovery
- No incremental backups
- Manual export required

**Manual Backup:**
```typescript
// Export to JSON
const data = db.export();
fs.writeFileSync('backup.json', JSON.stringify(data));

// Or use SQLite backup API
db.db.backup('./backup.db');
```

**Recommended:** Use [litestream](https://litestream.io/) for continuous backups

---

### 2. Migration and Versioning

**Current State:**
- No migration system
- Schema changes manual
- No version tracking (beyond basic metadata)
- Data transformation manual

**Manual Migration:**
```typescript
// Check version
const version = db.db.prepare(
  "SELECT value FROM _metadata WHERE key = 'schema_version'"
).get();

// Run migration
if (version.value === '1') {
  db.db.exec(`
    -- Add new index
    CREATE INDEX idx_new ON nodes(type, created_at);

    -- Update version
    UPDATE _metadata SET value = '2' WHERE key = 'schema_version';
  `);
}
```

---

### 3. Monitoring and Observability

**What's Missing:**
- Query performance metrics
- Slow query logging
- Resource usage tracking
- Health checks
- Alerting integration

**Manual Monitoring:**
```typescript
// Track query time
const start = Date.now();
const results = db.nodes('Job').exec();
const duration = Date.now() - start;
console.log(`Query took ${duration}ms`);

// Check database size
const stats = fs.statSync('./graph.db');
console.log(`Database size: ${stats.size} bytes`);
```

---

## Known Bugs and Issues

### 1. Concurrent Read/Write Deadlocks

**Status:** ⚠️ Mitigation Available

**Issue:** Multiple readers can block writer indefinitely

**Workaround:** Use WAL mode
```typescript
const db = new GraphDatabase('./graph.db');
db.db.pragma('journal_mode = WAL');
```

---

### 2. Very Large Transactions

**Status:** ⚠️ Known Limitation

**Issue:** Transactions > 100K operations may cause OOM

**Workaround:** Batch into smaller transactions
```typescript
// ❌ Too large
db.transaction(() => {
  for (let i = 0; i < 1_000_000; i++) {
    db.createNode('Job', { title: `Job ${i}` });
  }
});

// ✅ Batched
for (let batch = 0; batch < 10; batch++) {
  db.transaction(() => {
    for (let i = 0; i < 100_000; i++) {
      db.createNode('Job', { title: `Job ${i}` });
    }
  });
}
```

---

## Future Improvements

### Planned (Roadmap)
- All paths finding algorithm
- Pattern matching queries
- Bulk operation APIs
- Query performance analyzer
- Automatic index recommendations

### Under Consideration
- Read replicas support
- Query result streaming
- Pluggable storage backends
- Graph visualization export
- GraphQL API adapter

### Not Planned
- Distributed clustering (architectural limitation)
- Built-in sharding (use multiple databases)
- Multi-master replication (SQLite limitation)

---

## Decision Matrix: When to Use sqlite-graph

### ✅ Use sqlite-graph when:
- Embedded applications (desktop, mobile, CLI)
- Small to medium graphs (<1M nodes)
- Single-process architectures
- Development and testing
- Offline-first applications
- TypeScript-first projects
- Zero DevOps requirement

### ⚠️ Consider alternatives when:
- Need concurrent writes (>100/sec)
- Graph size > 1M nodes
- Require distributed clustering
- Need advanced graph algorithms
- High availability required (99.99%+)
- Geographic distribution needed

### ❌ Do NOT use when:
- Multi-datacenter deployment required
- Graph size > 10M nodes
- Need horizontal scaling
- Require sub-millisecond queries at scale
- Mission-critical with strict SLAs

---

## Mitigation Summary

| Limitation | Severity | Mitigation | Effort |
|------------|----------|------------|--------|
| Single writer | High | Application queue, WAL mode | Medium |
| Scale limits | High | Index properly, shard data | Low |
| No distribution | High | Upgrade to Neo4j/ArangoDB | High |
| Limited algorithms | Medium | Export to specialized tools | Medium |
| No FTS | Medium | Use FTS5 extension | Low |
| JSON properties | Medium | Flatten important properties | Low |
| No query hints | Low | Manual EXPLAIN analysis | Low |
| Memory limits | Low | Use file-based storage | Low |
| Type safety | Low | Add runtime validation (Zod) | Low |

---

## Conclusion

sqlite-graph is purpose-built for **embedded graph databases** in TypeScript applications. Its limitations are intentional trade-offs for simplicity, portability, and zero-dependency deployment.

**Know your limits:**
- Graph size < 1M nodes
- Single-process architecture
- Basic graph algorithms sufficient
- ACID transactions required

**Stay within these boundaries** and sqlite-graph provides excellent performance and developer experience. **Exceed these boundaries** and you'll need to upgrade to a client-server graph database like Neo4j or ArangoDB.

The key is understanding these limitations upfront and designing your application accordingly.
