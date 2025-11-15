# sqlite-graph Performance Benchmarks

## Overview

This document describes the performance characteristics of sqlite-graph, including benchmark methodology, results, and hardware specifications for both Node.js (better-sqlite3) and browser (wa-sqlite) implementations.

## 🆕 Browser Adapter Benchmarks (November 2024)

**Status:** Node.js baseline complete ✅ | Browser testing ready ⏳

See [experiments/browser-poc/BENCHMARK-SUMMARY.md](../experiments/browser-poc/BENCHMARK-SUMMARY.md) for detailed browser adapter performance analysis.

### Node.js Baseline (Better-sqlite3)

**All operations < 1ms average** ✅

| Operation | Avg Time | Ops/Sec | Category |
|-----------|----------|---------|----------|
| Delete Single Row | 0.01ms | 94,341 | Ultra-Fast |
| Select Single Row | 0.02ms | 59,289 | Ultra-Fast |
| Single Insert | 0.02ms | 60,000 | Ultra-Fast |
| Transaction Rollback | 0.03ms | 36,563 | Fast |
| Graph Traversal (BFS) | 0.05ms | 20,367 | Fast |
| Update Single Row | 0.05ms | 18,459 | Fast |
| Batch Insert (100 rows) | 0.12ms | 8,232 | Batch |
| Select All (1000 rows) | 0.40ms | 2,494 | Batch |
| Database Creation | 0.54ms | 1,847 | Batch |
| Transaction (1000 rows) | 0.58ms | 1,713 | Batch |

**Key Characteristics:**
- Point queries: 0.01-0.05ms (excellent)
- Bulk operations: 0.12-0.58ms (scales linearly)
- Graph algorithms: 0.05ms (20k ops/sec)
- Transaction overhead: Minimal (0.03ms for rollback)

### Browser Performance Targets

| VFS Backend | Target vs Node.js | Expected Performance |
|-------------|-------------------|---------------------|
| OPFS | 1.2-1.8x slower | ✅ Excellent |
| IndexedDB | 1.8-2.5x slower | ✅ Acceptable |
| Memory | 1.1-1.5x slower | ✅ Best case |

**Testing:** Run `npm run bench` for Node.js baseline, then open `benchmark.html` in browser for comparison.

---

## Original Comprehensive Benchmarks (October 2024)

## Quick Results

### Performance Goals - All Met ✅

| Goal | Target | Actual | Status |
|------|--------|--------|--------|
| Simple queries | <10ms | 2.18ms | ✅ PASS |
| Graph traversal | <50ms | 2.68ms | ✅ PASS |
| Node creation | <1ms | 286.79µs | ✅ PASS |

### Top Performers

| Operation | Ops/Second | Avg Time |
|-----------|------------|----------|
| Update node (multiple properties) | 38,353 | 26.07µs |
| Query with limit | 38,107 | 26.24µs |
| Find all paths (maxDepth 5) | 32,648 | 30.63µs |
| Update node (single property) | 20,601 | 48.54µs |
| Find shortest path (50 hops) | 12,494 | 80.04µs |

### Category Averages

| Category | Avg Time | Ops/Second |
|----------|----------|------------|
| Updates | 37.31µs | 29,477 |
| Queries | 1.28ms | 10,382 |
| Traversal | 647.48µs | 11,056 |
| Creation | 441.08µs | 2,744 |
| Transactions | 330.08µs | 3,030 |
| Real-World | 801.72µs | 1,251 |
| Deletes | 1.12ms | 1,121 |

## Testing Methodology

### Benchmark Structure

Each benchmark follows this pattern:

1. **Warmup Phase**: 2-5 iterations to warm up V8 JIT compiler and SQLite caches
2. **Measurement Phase**: 10-100 iterations depending on operation cost
3. **Statistics Collection**: Min, max, average times and operations/second

```typescript
benchmark(name: string, operation: () => void, iterations: number, warmup: number)
```

### Data Generation

- **Nodes**: Created with realistic properties (name, age, active status)
- **Edges**: Created with typed relationships (KNOWS, REQUIRES, HAS_SKILL)
- **Properties**: Mix of strings, numbers, and integers (SQLite uses integers for booleans)
- **Dataset Sizes**: 100, 1,000, and 10,000 nodes for query benchmarks

### Timing Precision

- Uses Node.js `performance.now()` for microsecond precision
- Results reported in microseconds (µs) and milliseconds (ms)
- Operations per second calculated as: `1,000,000 / avgTimeInMicroseconds`

### Database Configuration

- **File-based**: `benchmarks/benchmark.db` (persistent storage)
- **SQLite Mode**: Default settings (no special optimizations)
- **Transaction Mode**: ACID-compliant with savepoint support
- **Database Size**: 344 KB for benchmark test dataset

## Hardware Specifications

**Test Environment:**
- **Platform**: macOS (Darwin 24.6.0)
- **Node.js**: v22.x (or current LTS version)
- **SQLite**: Version included with better-sqlite3
- **Storage**: SSD (file-based persistence)

**Note**: Your results may vary based on:
- CPU speed and architecture
- Available RAM
- Storage type (SSD vs HDD vs NVMe)
- Operating system and I/O scheduler
- Other running processes

## Benchmark Categories

### 1. Node Creation

Tests the performance of creating nodes with various property configurations.

```typescript
// Simple node
db.createNode('Person', { name: 'Alice' });

// Complex properties
db.createNode('Person', {
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
  active: 1  // SQLite uses integers for booleans
});
```

**Results:**
- Simple: 286.79µs (3,487 ops/sec)
- Complex: 306.30µs (3,265 ops/sec)

### 2. Edge Creation

Tests relationship creation with and without properties.

```typescript
// Natural syntax: from RELATIONSHIP to
db.createEdge(alice.id, 'KNOWS', bob.id);
db.createEdge(job.id, 'REQUIRES', skill.id, { proficiency: 'expert' });
```

**Results:**
- No properties: 339.17µs (2,948 ops/sec)
- With properties: 348.16µs (2,872 ops/sec)

### 3. Queries

Tests various query patterns including filtering, sorting, and limiting.

```typescript
db.nodes('Person').exec();                           // Full scan
db.nodes('Person').where({ active: 1 }).exec();      // Filtered
db.nodes('Person').orderBy('age', 'desc').exec();    // Sorted
db.nodes('Person').limit(10).exec();                 // Limited
```

**Results (100 nodes):**
- All nodes: 2.18ms (459 ops/sec)
- Where clause: 389.75µs (2,566 ops/sec)
- Order by: 2.51ms (398 ops/sec)
- Limit: 26.24µs (38,107 ops/sec)
- Complex: 358.93µs (2,786 ops/sec)

### 4. Graph Traversal

Tests BFS/DFS traversal at various depths and path-finding algorithms.

```typescript
db.traverseFrom(alice.id, 'KNOWS').exec();           // 1 hop
db.traverseFrom(alice.id, 'KNOWS').maxDepth(5).exec();  // 5 hops
db.shortestPath(alice.id, bob.id, 'KNOWS');         // Shortest path
db.allPaths(alice.id, bob.id, 'KNOWS', 5);          // All paths
```

**Results:**
- 1 hop: 2.68ms (373 ops/sec)
- 5 hops: 158.93µs (6,292 ops/sec)
- 10 hops: 287.88µs (3,474 ops/sec)
- Shortest path: 80.04µs (12,494 ops/sec)
- All paths: 30.63µs (32,648 ops/sec)

### 5. Updates

Tests single and multiple property updates.

```typescript
db.updateNode(alice.id, { age: 31 });                // Single property
db.updateNode(alice.id, { age: 31, active: 1 });    // Multiple properties
```

**Results:**
- Single property: 48.54µs (20,601 ops/sec)
- Multiple properties: 26.07µs (38,353 ops/sec) ⚡ **Fastest operation**

### 6. Deletes

Tests node deletion with and without cascading edge removal.

```typescript
db.deleteNode(alice.id);                             // Simple delete
// Node with edges triggers CASCADE delete
```

**Results:**
- Simple: 613.24µs (1,631 ops/sec)
- With edges: 1.63ms (612 ops/sec)

### 7. Transactions

Tests transactional operations including savepoint rollback.

```typescript
db.transaction(() => {
  // Create 10 or 100 nodes
  for (let i = 0; i < count; i++) {
    db.createNode('Person', { name: `Person ${i}` });
  }
});

// With savepoint rollback
db.transaction((ctx) => {
  db.createNode('Person', { name: 'Test' });
  ctx.savepoint('sp1');
  db.createNode('Person', { name: 'Test2' });
  ctx.rollbackTo('sp1');  // Only first node persists
  ctx.commit();
});
```

**Results:**
- 10 nodes: 343.19µs (2,914 ops/sec)
- 100 nodes: 1.02ms (978 ops/sec)
- With savepoint: 330.08µs (3,030 ops/sec)

### 8. Real-World Scenarios

Tests realistic application patterns combining multiple operations.

**Job Search Scenario:**
```typescript
// Create job, company, skills, requirements, and query matches
```
- **Result**: 759.28µs (1,317 ops/sec)

**Social Network Scenario:**
```typescript
// Create users, friendships, and query friends-of-friends
```
- **Result**: 844.17µs (1,185 ops/sec)

## Performance Characteristics

### What's Fast

- **Updates**: Extremely fast (38K ops/sec) - SQLite UPDATE operations are optimized
- **Queries with LIMIT**: Very fast (38K ops/sec) - SQLite can skip scanning all rows
- **Path finding**: Fast (12-32K ops/sec) - Efficient graph algorithms
- **Simple operations**: Sub-millisecond for most single-node operations

### What's Slower

- **Full table scans**: Query all nodes without WHERE clause (459 ops/sec)
- **Sorting**: ORDER BY requires full scan and sort (398 ops/sec)
- **Cascading deletes**: Deleting nodes with many edges (612 ops/sec)
- **Large transactions**: Linear scaling with operation count

### Scaling Considerations

1. **Node count**: Query performance degrades linearly with dataset size
2. **Edge count**: Traversal performance depends on graph density
3. **Transaction size**: Larger transactions are more efficient per-operation but have higher latency
4. **Index usage**: WHERE clauses benefit from SQLite indexes on node properties

## Running Benchmarks

### Prerequisites

```bash
npm install
npm run build
```

### Run Full Suite

```bash
npx ts-node benchmarks/comprehensive-benchmark.ts
```

### Output Format

```
📝 Node Creation Benchmarks
────────────────────────────────────────────────────────────────────────────────
  Create single node
    Avg: 286.79µs | Ops/sec: 3487
    Min: 228.83µs | Max: 501.96µs
```

### Interpreting Results

- **Avg**: Average time per operation (lower is better)
- **Ops/sec**: Operations per second (higher is better)
- **Min/Max**: Best and worst case times (shows variance)
- **Variance**: High variance (max >> avg) suggests:
  - JIT compilation effects (first few iterations)
  - OS scheduling interference
  - SQLite cache effects

## Comparison to Other Graph Databases

### sqlite-graph vs Neo4j

| Feature | sqlite-graph | Neo4j |
|---------|--------------|-------|
| Deployment | Single file, embedded | Server process |
| Query syntax | TypeScript fluent API | Cypher query language |
| Node creation | ~3,500 ops/sec | ~10,000 ops/sec (depends on config) |
| Traversal | Microseconds for shallow | Optimized for deep traversals |
| ACID | Yes (SQLite) | Yes (configurable) |

### sqlite-graph vs Property Graphs in Memory

| Feature | sqlite-graph | In-Memory (e.g., graphology) |
|---------|--------------|------------------------------|
| Persistence | File-based (automatic) | Manual serialization required |
| Memory usage | Constant (disk-backed) | All data in RAM |
| Query speed | Microseconds-milliseconds | Nanoseconds-microseconds |
| Dataset size | Limited by disk | Limited by RAM |

## Future Optimization Opportunities

### Potential Improvements

1. **Index optimization**: Add indexes on frequently queried properties
2. **Prepared statements**: Cache compiled SQL for repeated queries
3. **Batch operations**: Bulk insert/update APIs
4. **Connection pooling**: For concurrent access patterns
5. **WAL mode**: Write-Ahead Logging for better concurrent reads
6. **Graph-specific indexes**: Adjacency list optimizations

### Expected Impact

- Indexes: 10-100x speedup for filtered queries
- Prepared statements: 2-5x speedup for repeated queries
- WAL mode: Better concurrent read performance
- Bulk operations: Linear scaling improvement

## Contributing Benchmarks

To add new benchmarks:

1. Add method to `BenchmarkSuite` class in [comprehensive-benchmark.ts](../benchmarks/comprehensive-benchmark.ts)
2. Follow existing pattern: warmup + measurement + statistics
3. Include realistic data and query patterns
4. Update this documentation with results

### Benchmark Checklist

- [ ] Warmup iterations (2-5)
- [ ] Sufficient measurement iterations (10-100)
- [ ] Realistic data patterns
- [ ] Clean database state between runs
- [ ] Document expected performance characteristics
- [ ] Update hardware specs if significantly different

## References

- [SQLite Performance Tuning](https://www.sqlite.org/speed.html)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3)
- Node.js [performance.now()](https://nodejs.org/api/perf_hooks.html#perf_hooksperformancenow)

---

**Last Updated**: 2025-10-29
**Benchmark Version**: 1.0.0
**Test Dataset**: 344 KB (100-10,000 nodes)
**Total Benchmarks**: 23
**Total Operations Tested**: 1,320
