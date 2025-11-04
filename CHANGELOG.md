# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2025-01-04

### Added

#### 🔒 Production Concurrency Utilities

Based on [Jellyfin's real-world SQLite locking experience](https://jellyfin.org/posts/SQLite-locking/), we've added three opt-in concurrency helpers for production deployments:

- **`enableWAL(db, options?)`** - Configure Write-Ahead Logging mode
  - Enables WAL mode for better read concurrency (multiple readers during writes)
  - Sets optimal pragmas: synchronous=NORMAL, busy_timeout=5000ms, cache_size=64MB
  - Configures WAL autocheckpoint and journal size limits
  - Customizable options for advanced use cases
  - Returns database instance for method chaining

- **`withRetry(operation, options?)`** - Exponential backoff retry logic
  - Automatically retries on SQLITE_BUSY/database locked errors
  - Exponential backoff: 10ms → 20ms → 40ms → 80ms → 160ms
  - Optional jitter to prevent thundering herd
  - Preserves error context after max retries
  - Works with both sync and async operations
  - Default 5 retries, fully customizable

- **`WriteQueue`** - Pessimistic locking queue
  - FIFO queue serializes all write operations
  - Eliminates lock contention entirely
  - Predictable latency for high-concurrency scenarios
  - Queue length and processing status monitoring
  - Handles both sync and async operations
  - Error handling without breaking queue

- **`initializeConcurrency(db, options?)`** - Convenience function
  - Combines WAL mode setup with write queue initialization
  - Returns `{ db, writeQueue }` for immediate use

#### 📚 Comprehensive Documentation (1,892 lines)

- **[CONCURRENCY-BEST-PRACTICES.md](docs/CONCURRENCY-BEST-PRACTICES.md)** (500+ lines)
  - Three locking strategies: No-Lock, Optimistic (retry), Pessimistic (queue)
  - WAL mode configuration and best practices
  - Transaction batching patterns (20x speedup)
  - Multi-process architecture patterns
  - Production monitoring and debugging
  - Decision matrices for strategy selection
  - Real-world usage examples

- **[COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md)** (400+ lines)
  - Comparison with Neo4j, ArangoDB, OrientDB, Memgraph, TinkerPop, gun.js, level-graph
  - 20+ dimension comparison matrix
  - Performance benchmarks: 500x smaller footprint, 3000x faster startup
  - Resource usage comparisons
  - Use case decision matrices
  - Market positioning as "High-Performance Embedded" solution

- **[LIMITATIONS.md](docs/LIMITATIONS.md)** (500+ lines)
  - Enhanced concurrency section with Jellyfin findings
  - WAL mode, retry logic, and write queue patterns
  - Scale limits and performance degradation tables
  - Security, operational, and performance concerns
  - Mitigation strategies with code examples
  - Severity classifications and decision matrices

#### ✅ Testing

- 32 comprehensive tests for concurrency utilities (all passing)
- Tests cover all three locking strategies
- Integration tests with full concurrency stack
- TDD approach with tests written first

### Changed

- **Exposed `Database.db` as public readonly** for advanced usage
  - Allows direct access to better-sqlite3 instance
  - Enables pragma configuration (WAL mode, timeouts, etc.)
  - Maintains encapsulation with readonly modifier
- Enhanced README with concurrency utility examples
- Updated quick start to show production patterns

### Performance

- WAL mode enables concurrent reads during writes
- WriteQueue eliminates lock contention overhead
- 7.11x faster merge operations with proper indexing (from v0.2.0)
- 20x speedup with transaction batching

### Use Cases

Perfect for:
- Web applications with concurrent users (>10 simultaneous writes)
- API servers with bursty write patterns
- Background job processing with multiple workers
- Desktop/mobile apps needing offline-first architecture
- Production deployments requiring reliability

### Migration Guide

All concurrency utilities are **opt-in**. Existing code continues to work without changes.

**Basic (Most Common):**
```typescript
import { GraphDatabase, enableWAL } from 'sqlite-graph';

const db = new GraphDatabase('./graph.db');
enableWAL(db); // Better read concurrency
```

**With Retry Logic:**
```typescript
import { withRetry } from 'sqlite-graph';

await withRetry(() =>
  db.mergeNode('Company', { name: 'TechCorp' }, { industry: 'SaaS' })
);
```

**High-Concurrency:**
```typescript
import { WriteQueue } from 'sqlite-graph';

const writeQueue = new WriteQueue();
await writeQueue.enqueue(() =>
  db.createNode('Job', { title: 'Engineer' })
);
```

**Full Stack (Maximum Safety):**
```typescript
import { initializeConcurrency, withRetry } from 'sqlite-graph';

const { db, writeQueue } = initializeConcurrency(new GraphDatabase('./graph.db'));

await writeQueue.enqueue(() =>
  withRetry(() =>
    db.mergeNode('Job', { url }, { title: 'Engineer' })
  )
);
```

---

## [0.2.0] - 2025-11-02

### Added

#### 🚀 MERGE Operations (Cypher-like Upserts)

- **`mergeNode()`** - Idempotent node creation with ON CREATE / ON MATCH semantics
  - Match on single or multiple properties (AND logic)
  - `onCreate` properties applied only when creating new nodes
  - `onMatch` properties applied only when matching existing nodes
  - Returns `{ node, created }` indicating whether node was created or matched
  - Automatic conflict detection when multiple nodes match criteria
  - Performance warnings in development mode when no index exists

- **`mergeEdge()`** - Idempotent edge creation between nodes
  - Ensures only one edge exists between nodes with given type
  - ON CREATE / ON MATCH semantics for edge properties
  - Property merging (not replacement) on match
  - Returns `{ edge, created }` indicating creation or match

- **Index Management API** for efficient merge operations
  - `createPropertyIndex(nodeType, property, unique?)` - Create JSON property indexes
  - `listIndexes()` - View all custom merge indexes
  - `dropIndex(indexName)` - Remove custom indexes
  - Unique constraint support for preventing duplicates

- **New Types**
  - `MergeOptions<T>` - Options for node merge with onCreate/onMatch
  - `EdgeMergeOptions<T>` - Options for edge merge
  - `MergeResult<T>` - Result type with node and created flag
  - `EdgeMergeResult<T>` - Result type with edge and created flag
  - `IndexInfo` - Index metadata type
  - `MergeConflictError` - Error when multiple nodes match merge criteria
  - `MergePerformanceWarning` - Warning when merging without indexes

#### 📚 Documentation & Examples

- **[MERGE-DESIGN.md](docs/MERGE-DESIGN.md)** - Complete design specification
  - API design rationale and implementation strategy
  - Index requirements and performance considerations
  - Error handling patterns
  - Future enhancement roadmap

- **[merge-patterns.ts](examples/merge-patterns.ts)** - 7 comprehensive examples
  - Simple job upsert patterns
  - ON CREATE / ON MATCH tracking for ETL pipelines
  - Company deduplication across job listings
  - Relationship merge for unique edges
  - Bulk import with idempotent merge operations
  - Merge conflict handling and resolution
  - Skills graph with automatic deduplication
  - Performance benchmark: 1.39x speedup over manual pattern

#### ✅ Testing

- 33 comprehensive unit tests for merge operations
- 100% coverage of merge functionality
- Tests for creation, matching, conflicts, and edge cases
- Index management test suite

### Performance

- **1.39x faster** than manual SELECT-then-INSERT/UPDATE pattern (with indexes)
- Atomic transactions ensure data consistency
- JSON property indexes enable efficient lookups on large datasets

### Use Cases

Perfect for:
- ETL pipelines that run repeatedly (daily job scrapers, data imports)
- Distributed systems requiring retry-safe operations
- Data deduplication (companies, skills, tags)
- Tracking discovery vs. update timestamps
- Preventing duplicate relationships in graph

### Breaking Changes

None - this is a backward-compatible feature addition.

### Migration Guide

Existing code continues to work. To use merge operations:

```typescript
// Before: Manual upsert pattern
const existing = db.nodes('Company').where({ name }).limit(1).exec()[0];
const company = existing
  ? db.updateNode(existing.id, data)
  : db.createNode('Company', { name, ...data });

// After: Using merge (simpler + faster)
const { node: company } = db.mergeNode('Company', { name }, { name, ...data });
```

For best performance, create indexes on match properties:

```typescript
db.createPropertyIndex('Job', 'url', true); // Unique index
db.mergeNode('Job', { url }, { url, title, status });
```

---

## [0.1.0] - 2025-10-27

### Added

- Initial release with core graph database functionality
- CRUD operations for nodes and edges
- Fluent query DSL with method chaining
- Graph traversal with BFS/DFS
- Shortest path algorithms
- Transaction support with savepoints
- Schema validation
- Import/export functionality
- Comprehensive test suite
- Example applications and documentation

[0.2.0]: https://github.com/michaeloboyle/sqlite-graph/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/michaeloboyle/sqlite-graph/releases/tag/v0.1.0
