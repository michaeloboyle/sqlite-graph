# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
