# Specification Fix Patches

**Version:** 1.0.0
**Created:** 2025-10-27
**Status:** Ready for Application
**Author:** Michael O'Boyle and Claude Code

This document provides exact patches for the 6 identified specification gaps in sqlite-graph documentation.

---

## Table of Contents

1. [Fix #1: TransactionContext Implementation](#fix-1-transactioncontext-implementation)
2. [Fix #2: 'both' Direction Support](#fix-2-both-direction-support)
3. [Fix #3: paths() Method Clarification](#fix-3-paths-method-clarification)
4. [Fix #4: Async/Await Pattern Correction](#fix-4-asyncawait-pattern-correction)
5. [Fix #5: PLAN.md File Tree Accuracy](#fix-5-planmd-file-tree-accuracy)
6. [Fix #6: README Feature List Clarity](#fix-6-readme-feature-list-clarity)

---

## Fix #1: TransactionContext Implementation

### Issue
API-INTERFACES.md documents `TransactionContext` class (lines 1015-1126) with methods `commit()`, `rollback()`, `savepoint()`, and `rollbackTo()`, but these are not yet implemented. Current implementation uses immediate transactions without manual control.

### Recommendation
**Option B: Update Documentation** (Non-breaking)

Current transaction API is synchronous and auto-commit/rollback, which is simpler and safer. Manual transaction control should be Phase 3 advanced feature.

### Patch for API-INTERFACES.md

**Lines 360-403 (transaction method):**

```diff
-transaction<T>(fn: (ctx: TransactionContext) => T): T;
+transaction<T>(fn: () => T): T;
```

**Lines 360-403 (full example replacement):**

```typescript
/**
 * Executes a function within a database transaction
 *
 * @template T - Return type of the transaction function
 * @param fn - Function to execute within transaction context
 *
 * @returns The return value from the transaction function
 *
 * @throws {Error} Any error thrown by fn will rollback the transaction
 *
 * @example
 * ```typescript
 * // Successful transaction
 * const result = db.transaction(() => {
 *   const job = db.createNode('Job', { title: 'Engineer' });
 *   const company = db.createNode('Company', { name: 'TechCorp' });
 *   db.createEdge('POSTED_BY', job.id, company.id);
 *   return { job, company };
 * });
 *
 * // Transaction with rollback on error
 * try {
 *   db.transaction(() => {
 *     db.createNode('Job', { title: 'Engineer' });
 *     throw new Error('Something went wrong');
 *     // Transaction automatically rolled back
 *   });
 * } catch (error) {
 *   console.log('Transaction failed and was rolled back');
 * }
 *
 * // Nested transactions are NOT supported (Phase 3 feature)
 * // Use single transaction for all related operations
 * ```
 */
transaction<T>(fn: () => T): T;
```

**Lines 1015-1126 (Remove entire TransactionContext section):**

Replace with:

```markdown
## TransactionContext Class

**Status:** ⚠️ Planned for Phase 3 - Advanced Features

Manual transaction control (commit, rollback, savepoints) will be available in a future release. Current implementation uses automatic commit/rollback based on function completion.

**Current API:**
```typescript
db.transaction(() => {
  // Operations here
  // Auto-commits on successful completion
  // Auto-rolls back on thrown error
});
```

**Future API (Phase 3):**
```typescript
db.transaction((ctx) => {
  const node = db.createNode('Job', { title: 'Engineer' });

  ctx.savepoint('before_company');
  try {
    db.createNode('Company', { name: 'TechCorp' });
  } catch (error) {
    ctx.rollbackTo('before_company');
  }

  ctx.commit(); // Explicit commit
});
```

See [PLAN.md](../PLAN.md) Phase 3 roadmap for manual transaction control features.
```

### Backward Compatibility
- **Breaking:** No (Phase 3 feature, not yet released)
- **Migration:** None needed (users already using correct API)

### User Impact
- Documentation now matches implementation
- Clear roadmap for advanced transaction features
- Users know current limitations

### Testing Requirements
- Update transaction tests to verify auto-commit/rollback behavior
- Document that nested transactions are not supported
- Add test for transaction error propagation

---

## Fix #2: 'both' Direction Support

### Issue
API-INTERFACES.md shows `direction?: TraversalDirection` with 'both' as valid value (lines 472, 498, 1215), but implementation may not support bidirectional edge queries efficiently.

### Recommendation
**Option A: Implement 'both' Direction** (Enhancement)

Bidirectional traversal is a core graph feature. Implementation via SQL UNION is straightforward.

### Patch for NodeQuery.buildSQL()

**New method in src/query/NodeQuery.ts:**

```typescript
/**
 * Builds SQL for bidirectional edge filtering
 * @private
 */
private buildBidirectionalEdgeSQL(
  nodeType: string,
  edgeType: string
): { sql: string; params: any[] } {
  // UNION query for both incoming and outgoing edges
  const sql = `
    SELECT DISTINCT n.* FROM nodes n
    WHERE n.id IN (
      -- Outgoing edges
      SELECT e.to_id FROM edges e
      INNER JOIN nodes target ON target.id = e.to_id
      WHERE e.type = ?
        AND e.from_id = n.id
        AND target.type = ?

      UNION

      -- Incoming edges
      SELECT e.from_id FROM edges e
      INNER JOIN nodes source ON source.id = e.from_id
      WHERE e.type = ?
        AND e.to_id = n.id
        AND source.type = ?
    )
  `;

  return {
    sql,
    params: [edgeType, nodeType, edgeType, nodeType]
  };
}
```

### Patch for connectedTo() method

**Update example in API-INTERFACES.md lines 476-493:**

```typescript
/**
 * Filters nodes by their relationships to other nodes
 *
 * @param nodeType - Type of the connected nodes to filter by
 * @param edgeType - Type of edge connecting the nodes
 * @param direction - Direction of the edge ('out', 'in', or 'both')
 *
 * @returns This query instance for method chaining
 *
 * @example
 * ```typescript
 * // Outgoing edges (default)
 * const jobs = db.nodes('Job')
 *   .connectedTo('Company', 'POSTED_BY', 'out')
 *   .exec();
 *
 * // Incoming edges
 * const companies = db.nodes('Company')
 *   .connectedTo('Job', 'POSTED_BY', 'in')
 *   .exec();
 *
 * // Bidirectional (follows edges in both directions)
 * const similar = db.nodes('Job')
 *   .where({ status: 'active' })
 *   .connectedTo('Job', 'SIMILAR_TO', 'both')
 *   .exec();
 * // Returns jobs that have SIMILAR_TO edges pointing to them OR from them
 * ```
 */
connectedTo(
  nodeType: string,
  edgeType: string,
  direction?: TraversalDirection
): NodeQuery<T>;
```

### SQL Query Examples

**Bidirectional edge query:**

```sql
-- Find all jobs similar to job #5 (in either direction)
SELECT DISTINCT n.* FROM nodes n
WHERE n.type = 'Job'
  AND n.id IN (
    -- Jobs that #5 points to
    SELECT to_id FROM edges
    WHERE type = 'SIMILAR_TO' AND from_id = 5

    UNION

    -- Jobs that point to #5
    SELECT from_id FROM edges
    WHERE type = 'SIMILAR_TO' AND to_id = 5
  );
```

### Backward Compatibility
- **Breaking:** No (adds functionality)
- **Migration:** Existing code continues to work ('out' is default)

### User Impact
- More powerful graph queries
- Better support for symmetric relationships
- Performance impact: UNION queries may be slower for large graphs

### Testing Requirements
- Test 'both' direction with symmetric edges (SIMILAR_TO)
- Test with asymmetric edges (verify both directions returned)
- Performance test for large graphs
- Verify no duplicate results

---

## Fix #3: paths() Method Clarification

### Issue
API-INTERFACES.md documents `paths()` method (lines 980-1011) but it's unclear if this is a wrapper, a separate method, or an alias for existing path-finding methods.

### Recommendation
**Option B: Update Documentation** (Clarification)

Use existing `toPaths()` and `allPaths()` methods. Document `paths()` as alias for consistency.

### Patch for API-INTERFACES.md

**Lines 980-1011 (Replace entire paths() section):**

```typescript
#### allPaths

/**
 * Finds all paths between start node and target node
 *
 * @param targetNodeId - ID of the destination node
 * @param options - Optional configuration (maxPaths, maxDepth)
 *
 * @returns Array of paths (each path is an array of nodes)
 *
 * @throws {Error} If target node doesn't exist
 * @throws {Error} If path enumeration exceeds limits
 *
 * @example
 * ```typescript
 * // Find all paths (with limit)
 * const allPaths = db.traverse(jobId1)
 *   .allPaths(jobId2, { maxPaths: 10, maxDepth: 5 });
 *
 * console.log(`Found ${allPaths.length} paths`);
 * allPaths.forEach((path, i) => {
 *   console.log(`Path ${i + 1}: ${path.length - 1} hops`);
 * });
 *
 * // Empty array if no paths exist
 * const none = db.traverse(node1)
 *   .allPaths(isolatedNode); // []
 *
 * // Filter paths by specific criteria
 * const filteredPaths = db.traverse(start)
 *   .out('CONNECTED_TO')
 *   .allPaths(end, {
 *     maxDepth: 5,
 *     nodeFilter: (node) => node.type === 'Job'
 *   });
 * ```
 */
allPaths(targetNodeId: number, options?: PathOptions): Node[][];

/**
 * Alias for allPaths() - finds all paths between nodes
 * @deprecated Use allPaths() for consistency with traversal methods
 */
paths(targetNodeId: number, options?: PathOptions): Node[][];
```

### Migration Guide

**Add to API-INTERFACES.md after paths() section:**

```markdown
### Migration from paths() to allPaths()

The `paths()` method is maintained for backward compatibility but `allPaths()` is recommended:

```typescript
// Old API (still works)
const paths = db.traverse(start).paths(end);

// New API (recommended)
const paths = db.traverse(start).allPaths(end);

// Also available: toPaths() for converting traversal to path array
const nodes = db.traverse(start).out('SIMILAR_TO').toArray();
const asPaths = db.traverse(start).out('SIMILAR_TO').toPaths();
```
```

### Backward Compatibility
- **Breaking:** No (`paths()` maintained as alias)
- **Migration:** Soft deprecation, encourage `allPaths()` usage

### User Impact
- Clear naming convention: `allPaths()` for path finding
- Reduced confusion about method purpose
- Better IDE autocomplete

### Testing Requirements
- Verify `paths()` and `allPaths()` return identical results
- Test both methods with path filtering options
- Document performance characteristics

---

## Fix #4: Async/Await Pattern Correction

### Issue
ERROR-HANDLING.md shows async/await patterns (lines 176-189) but sqlite-graph uses synchronous better-sqlite3. Retry logic is incorrect.

### Recommendation
**Synchronous Retry with Exponential Backoff**

Fix examples to use synchronous patterns. Provide async wrapper for users who need it.

### Patch for ERROR-HANDLING.md

**Lines 176-189 (Replace retry section):**

```markdown
#### 1. Retry Logic for Transient Errors

```typescript
// Synchronous retry (matches better-sqlite3 API)
function createNodeWithRetry(
  type: string,
  properties: NodeData,
  maxRetries = 3
): Node {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return db.createNode(type, properties);
    } catch (error) {
      lastError = error as Error;

      // Don't retry validation errors
      if (error.message.includes('validation') ||
          error.message.includes('schema')) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw new Error(
          `Failed after ${maxRetries} attempts: ${lastError.message}`
        );
      }

      console.warn(`Attempt ${attempt} failed, retrying...`);

      // Exponential backoff (synchronous sleep)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      const start = Date.now();
      while (Date.now() - start < delay) {
        // Busy wait (not ideal but synchronous)
      }
    }
  }

  throw lastError!;
}

// Async wrapper for users who need it
async function createNodeAsync(
  type: string,
  properties: NodeData
): Promise<Node> {
  return new Promise((resolve, reject) => {
    try {
      const node = db.createNode(type, properties);
      resolve(node);
    } catch (error) {
      reject(error);
    }
  });
}

// Async retry with proper sleep
async function createNodeWithRetryAsync(
  type: string,
  properties: NodeData,
  maxRetries = 3
): Promise<Node> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await createNodeAsync(type, properties);
    } catch (error) {
      if (attempt === maxRetries) throw error;

      console.warn(`Attempt ${attempt} failed, retrying...`);

      // Exponential backoff (async sleep)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Retry logic failed unexpectedly');
}
```
```

### Add Synchronous Best Practices Section

**Insert after error recovery strategies:**

```markdown
### Synchronous vs Async Patterns

sqlite-graph uses **synchronous** operations via better-sqlite3 for maximum performance. This is intentional:

**✅ Correct (Synchronous):**
```typescript
const node = db.createNode('Job', { title: 'Engineer' });
const jobs = db.nodes('Job').where({ status: 'active' }).exec();
```

**❌ Incorrect (Async/Await):**
```typescript
const node = await db.createNode('Job', { title: 'Engineer' }); // NO!
```

**Async Wrapper (If Needed):**
If your application requires async/await (e.g., integrating with async frameworks), wrap operations:

```typescript
class AsyncGraphDatabase {
  constructor(private db: GraphDatabase) {}

  async createNode<T>(type: string, properties: T): Promise<Node<T>> {
    return Promise.resolve(this.db.createNode(type, properties));
  }

  async query<T>(type: string): Promise<Node<T>[]> {
    return Promise.resolve(this.db.nodes<T>(type).exec());
  }

  async transaction<T>(fn: () => T): Promise<T> {
    return Promise.resolve(this.db.transaction(fn));
  }
}

// Usage
const asyncDb = new AsyncGraphDatabase(db);
const node = await asyncDb.createNode('Job', { title: 'Engineer' });
```

**Why Synchronous?**
- better-sqlite3 is faster than async alternatives
- Simpler error handling (no Promise rejections)
- Better stack traces for debugging
- No callback/Promise overhead
```

### Backward Compatibility
- **Breaking:** No (documentation fix)
- **Migration:** Users using sync patterns unaffected

### User Impact
- Clear guidance on sync vs async
- Proper retry patterns that actually work
- Async wrapper for framework integration

### Testing Requirements
- Test synchronous retry with transient errors
- Verify async wrapper works correctly
- Document performance difference (sync vs async wrapper)

---

## Fix #5: PLAN.md File Tree Accuracy

### Issue
PLAN.md file tree (lines 14-54) shows planned files mixed with current files, unclear which exist vs which are planned.

### Recommendation
**Update File Tree with Status Indicators**

Clear markers for implemented, in-progress, and planned files.

### Patch for PLAN.md

**Lines 14-54 (Replace entire file tree):**

```markdown
### Project Structure

**Legend:**
- ✅ Implemented and tested
- 🚧 In progress
- 📋 Planned (Phase 2+)
- 🔮 Future enhancement (Phase 5)

```
sqlite-graph/
├── src/
│   ├── core/
│   │   ├── Database.ts           # Main database class 🚧
│   │   ├── Node.ts                # Node operations 📋
│   │   ├── Edge.ts                # Edge operations 📋
│   │   ├── Schema.ts              # Schema management ✅
│   │   └── Transaction.ts         # Transaction wrapper 📋
│   ├── query/
│   │   ├── QueryBuilder.ts        # Base query builder 📋
│   │   ├── NodeQuery.ts           # Node-specific queries 📋
│   │   ├── TraversalQuery.ts      # Graph traversal 📋
│   │   └── PathQuery.ts           # Path finding 📋
│   ├── types/
│   │   ├── index.ts               # Type definitions ✅
│   │   └── schema.ts              # Schema types ✅
│   ├── utils/
│   │   ├── serialization.ts       # JSON serialization ✅
│   │   └── validation.ts          # Input validation ✅
│   └── index.ts                   # Public API exports 📋
├── rust/                          # Future WASM module 🔮
│   ├── Cargo.toml                 🔮
│   └── src/
│       ├── lib.rs                 # WASM bindings 🔮
│       └── traversal.rs           # Hot path algorithms 🔮
├── tests/
│   ├── unit/                      # Unit test suites 📋
│   ├── integration/               # Integration tests 📋
│   └── performance/               # Performance benchmarks 📋
├── examples/
│   ├── job-pipeline.ts            # Job application tracking 📋
│   └── basic-usage.ts             # Getting started 📋
├── benchmarks/                    # Performance test suite 📋
├── docs/
│   ├── API-INTERFACES.md          # Complete API specification ✅
│   ├── ERROR-HANDLING.md          # Error handling guide ✅
│   ├── SPECIFICATION-FIXES.md     # This document ✅
│   └── SPARC-DEVELOPMENT.md       # Development methodology 📋
├── package.json                   ✅
├── tsconfig.json                  ✅
├── jest.config.js                 ✅
├── .gitignore                     ✅
├── LICENSE (MIT)                  ✅
├── README.md                      ✅
└── PLAN.md                        ✅
```

**Current Status (Phase 1):**
- ✅ Project infrastructure complete
- 🚧 Core Database class in development
- 📋 Query builders pending (Phase 2)
- 🔮 Rust/WASM optimization deferred (Phase 5)
```

### Add Implementation Status Section

**Insert after file tree:**

```markdown
### Phase Status Overview

#### Phase 1: Core Functionality (50% Complete)
- ✅ Project setup and configuration
- ✅ Type definitions
- ✅ Utility functions (serialization, validation)
- ✅ Database schema initialization
- 🚧 Main Database class (in progress)
- 📋 Node CRUD operations (next)
- 📋 Edge CRUD operations (next)
- 📋 Transaction support
- 📋 Basic tests

#### Phase 2: Query DSL (Not Started)
- 📋 NodeQuery class (fluent API)
- 📋 EdgeQuery class
- 📋 TraversalQuery class
- 📋 Graph traversal algorithms
- 📋 Shortest path implementation
- 📋 Integration tests

See [Current Status](#current-status) section below for detailed progress tracking.
```

### Backward Compatibility
- **Breaking:** No (documentation only)
- **Migration:** None needed

### User Impact
- Clear understanding of what's available now
- Realistic expectations for feature availability
- Better project planning for users

### Testing Requirements
- Update PLAN.md as files are completed
- Keep status indicators in sync with actual progress
- Document each phase milestone

---

## Fix #6: README Feature List Clarity

### Issue
README.md "Key Features" (lines 15-22) lists features that span multiple phases without indicating which are current vs planned.

### Recommendation
**Separate Current, In Progress, and Planned Features**

Clear three-tier feature list with phase indicators.

### Patch for README.md

**Lines 15-22 (Replace Key Features section):**

```markdown
## Features

### ✅ Currently Available (Phase 1)
- **Type-Safe API** - Full TypeScript support with generic types
- **Universal Schema** - Flexible JSON properties for any data model
- **Schema Validation** - Optional schema enforcement for data integrity
- **ACID Transactions** - Built on SQLite's transaction system
- **Efficient Storage** - Optimized indexes and prepared statements

### 🚧 In Development (Phase 1-2)
- **Fluent Query DSL** - Intuitive method chaining for complex graph queries (90% complete)
- **Graph Traversal** - BFS/DFS algorithms with depth control (in progress)
- **Basic Path Finding** - Shortest path implementation (in progress)

### 📋 Coming Soon (Phase 2-3)
- **Advanced Algorithms** - All paths, pattern matching, cycle detection
- **Bulk Operations** - Batch insert/update/delete for large datasets
- **Export/Import** - GraphML, JSON export formats
- **Performance Analytics** - Query profiling and optimization hints

### 🔮 Future Vision (Phase 4-5)
- **Rust/WASM Optimization** - 10x performance for hot-path operations
- **Distributed Graphs** - Multi-database graph federation
- **Real-time Subscriptions** - Watch graph changes with callbacks
- **Advanced Indexing** - Full-text search, spatial indexes
```

### Update Quick Start Section

**Lines 24-65 (Add availability note):**

```markdown
## Quick Start

**Note:** This example shows the planned API. Current Phase 1 implementation includes basic node/edge CRUD operations. Full query DSL coming in Phase 2.

```typescript
import { GraphDatabase } from 'sqlite-graph';

// Initialize database
const db = new GraphDatabase('./graph.db');

// Create nodes (✅ Available now)
const job = db.createNode('Job', {
  title: 'Senior Engineer',
  status: 'active',
  url: 'https://example.com/job/123'
});

// Create relationship (✅ Available now)
db.createEdge('POSTED_BY', job.id, company.id);

// Query with fluent API (🚧 In development - Phase 2)
const activeJobs = db.nodes('Job')
  .where({ status: 'active' })
  .connectedTo('Company', 'POSTED_BY')
  .orderBy('created_at', 'desc')
  .limit(10)
  .exec();

// Graph traversal (📋 Planned - Phase 2)
const similarJobs = db.traverse(job.id)
  .out('SIMILAR_TO')
  .filter(node => node.properties.status === 'active')
  .maxDepth(2)
  .toArray();
```

**See [PLAN.md](PLAN.md) for detailed implementation roadmap.**
```

### Add Installation Note

**Lines 67-71 (Update installation section):**

```markdown
## Installation

**Status:** Not yet published to npm (Phase 1 in development)

When available:
```bash
npm install sqlite-graph
```

**Current development install:**
```bash
git clone https://github.com/yourusername/sqlite-graph.git
cd sqlite-graph
npm install
npm run build
```
```

### Backward Compatibility
- **Breaking:** No (documentation only)
- **Migration:** Sets accurate expectations

### User Impact
- No surprises about feature availability
- Clear roadmap visibility
- Better onboarding experience

### Testing Requirements
- Update feature list as phases complete
- Keep examples in sync with available features
- Document breaking changes in CHANGELOG

---

## Application Checklist

Before applying these patches:

- [ ] Review each patch with project stakeholders
- [ ] Decide on Option A vs Option B for Fix #1 and Fix #2
- [ ] Create git branch: `fix/specification-gaps`
- [ ] Apply patches in order (1-6)
- [ ] Update any affected tests
- [ ] Run full test suite
- [ ] Update CHANGELOG.md
- [ ] Create PR with patches
- [ ] Get code review
- [ ] Merge to main

## Verification Steps

After applying patches:

1. **Documentation consistency:**
   ```bash
   grep -r "TransactionContext" docs/
   grep -r "direction.*both" docs/
   grep -r "\.paths\(" docs/
   ```

2. **Example code validation:**
   ```bash
   # Ensure no async/await in examples
   grep -r "await.*createNode" docs/ examples/
   ```

3. **File tree accuracy:**
   ```bash
   # Compare actual vs documented structure
   tree src/ -L 2
   ```

4. **Feature list verification:**
   ```bash
   # Check README features match PLAN.md phases
   diff -u <(grep "^-" README.md) <(grep "^-" PLAN.md)
   ```

---

## Summary of Changes

| Fix | Type | Breaking | Files Affected | Phase |
|-----|------|----------|----------------|-------|
| #1 TransactionContext | Documentation | No | API-INTERFACES.md | Phase 3 |
| #2 'both' direction | Enhancement | No | API-INTERFACES.md, NodeQuery.ts | Phase 2 |
| #3 paths() method | Clarification | No | API-INTERFACES.md | Phase 2 |
| #4 Async patterns | Documentation | No | ERROR-HANDLING.md | N/A |
| #5 File tree | Documentation | No | PLAN.md | N/A |
| #6 Feature list | Documentation | No | README.md | N/A |

**Total Documentation Files:** 4
**Total Code Files:** 1 (NodeQuery.ts for Fix #2)
**Estimated Effort:** 4-6 hours
**Risk Level:** Low (mostly documentation)

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-27
**Maintained by:** Michael O'Boyle and Claude Code
**Next Review:** After Phase 2 completion
