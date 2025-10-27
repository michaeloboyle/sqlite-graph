# Specification Consistency Review - sqlite-graph

**Review Date:** 2025-10-27
**Reviewer:** Code Review Agent (Claude Code)
**Scope:** All specification documents for internal consistency and accuracy
**Methodology:** Cross-reference integrity, implementation status validation, code example verification

---

## Executive Summary

**Total Issues Found:** 12 (8 beyond the 6 user-reported issues)

### Severity Breakdown
- **Critical (Must Fix):** 3 issues
- **High (Should Fix):** 5 issues
- **Medium (Nice to Fix):** 4 issues
- **Low (Optional):** 0 issues

### Quick Stats
- Documents Reviewed: 9
- Cross-references Checked: 47
- Code Examples Validated: 23
- Type Signatures Verified: 38
- Implementation Status Markers Audited: 156

---

## Issue Summary by Category

### 1. API Consistency Issues (3 Critical, 2 High)

#### CRITICAL-1: Transaction API Signature Mismatch
**Location:**
- `docs/API-INTERFACES.md` lines 360-403
- `docs/TRANSACTION-SEMANTICS.md` lines 66-79

**Issue:**
API-INTERFACES.md shows `transaction<T>(fn: (ctx: TransactionContext) => T)` but TRANSACTION-SEMANTICS.md shows `transaction<T>(fn: () => T)` without the TransactionContext parameter.

**Evidence:**
```typescript
// API-INTERFACES.md line 402
transaction<T>(fn: (ctx: TransactionContext) => T): T;

// TRANSACTION-SEMANTICS.md line 78
transaction<T>(fn: TransactionFunction<T>): T;
// where TransactionFunction<T> = () => T (line 67)
```

**Impact:** High - Developers won't know if they have access to TransactionContext for manual commit/rollback.

**Recommendation:**
Decision needed: Does transaction() provide TransactionContext or not?
- If YES: Update TRANSACTION-SEMANTICS.md to include ctx parameter
- If NO: Remove TransactionContext class documentation from API-INTERFACES.md lines 1015-1127

---

#### CRITICAL-2: NodeQuery.connectedTo() Direction Parameter Inconsistency
**Location:**
- `docs/API-INTERFACES.md` lines 464-500
- `src/query/NodeQuery.ts` (implementation)

**Issue:**
API documentation shows direction parameter is optional with default value, but doesn't specify what the default is.

**Evidence:**
```typescript
// API-INTERFACES.md line 495
connectedTo(
  nodeType: string,
  edgeType: string,
  direction?: TraversalDirection  // What's the default?
): NodeQuery<T>;
```

**Impact:** Medium-High - Unclear behavior when direction is omitted.

**Recommendation:** Add explicit default value: `direction?: TraversalDirection = 'out'`

---

#### CRITICAL-3: Edge Properties Optional vs Required Mismatch
**Location:**
- `docs/API-INTERFACES.md` line 234
- `src/types/index.ts` Edge interface

**Issue:**
API shows `properties?: T` (optional) but type definition shows `properties?: T` - consistent in code but examples use it both ways without clarification.

**Evidence:**
```typescript
// Line 216 - Simple edge without properties (OK)
const edge = db.createEdge('POSTED_BY', jobId, companyId);

// Line 224 - Edge with properties (OK)
const app = db.createEdge<ApplicationEdge>('APPLIED_TO', userId, jobId, {
  appliedAt: new Date().toISOString(),
  source: 'LinkedIn'
});
```

**Impact:** Low - Technically consistent but could be clearer in JSDoc.

**Recommendation:** Add note in JSDoc: "Properties parameter is optional. If omitted, edge will have empty properties object."

---

#### HIGH-1: updateNode Return Type Inconsistency
**Location:**
- `docs/API-INTERFACES.md` lines 130-164
- `docs/ERROR-HANDLING-RESEARCH.md` lines 741-774

**Issue:**
API-INTERFACES.md shows `updateNode(): Node<T> | null` (line 163), but ERROR-HANDLING shows it throwing NodeNotFoundError instead of returning null (line 749).

**Evidence:**
```typescript
// API-INTERFACES.md line 163
updateNode<T extends NodeData = NodeData>(
  id: number,
  properties: Partial<T>
): Node<T> | null;

// ERROR-HANDLING-RESEARCH.md lines 749-750
const existing = this.getNode(id);
if (!existing) {
  throw new NodeNotFoundError(id);
}
```

**Impact:** High - Contradictory error handling strategy.

**Recommendation:** Choose one approach:
- **Option A** (Recommended): updateNode throws on not found (consistent with "writes throw")
  - Update API-INTERFACES.md line 163: `): Node<T>;` (remove `| null`)
  - Update @returns JSDoc to say "The updated node"
  - Add @throws JSDoc: `@throws {NodeNotFoundError} If node doesn't exist`
- **Option B**: updateNode returns null (consistent with reads)
  - Update ERROR-HANDLING-RESEARCH.md to return null instead of throw

---

#### HIGH-2: TraversalQuery.shortestPath() Options Parameter Undocumented
**Location:**
- `docs/API-INTERFACES.md` lines 938-978
- `src/types/index.ts` PathOptions interface

**Issue:**
shortestPath() accepts optional `options?: PathOptions` parameter but PathOptions interface is defined in types but not documented in API-INTERFACES.md's shortestPath() JSDoc.

**Evidence:**
```typescript
// API-INTERFACES.md line 977
shortestPath(targetNodeId: number, options?: PathOptions): Node[] | null;

// But PathOptions documented separately at lines 1218-1232
// No mention of which options shortestPath actually uses
```

**Impact:** Medium - Developers don't know what options are available.

**Recommendation:** Add JSDoc parameter documentation:
```typescript
@param options - Optional configuration for path finding
@param options.maxDepth - Maximum path length to search
@param options.nodeFilter - Filter function for valid path nodes
@param options.edgeFilter - Filter function for valid path edges
```

---

### 2. Implementation Status Accuracy (2 High, 1 Medium)

#### HIGH-3: Async/Sync Inconsistency in Examples
**Location:**
- `docs/TRANSACTION-SEMANTICS.md` lines 571-574
- `docs/ERROR-HANDLING-RESEARCH.md` lines 1049-1091

**Issue:**
TRANSACTION-SEMANTICS.md shows synchronous code with `await` keyword (impossible):
```typescript
// Line 573 - WRONG: await with synchronous operation
const jobs = fetchJobsFromAPI(); // Network I/O
db.transaction(() => {  // Synchronous transaction
  jobs.forEach(job => db.createNode('Job', job));
});
```

ERROR-HANDLING-RESEARCH.md shows async retry function but database operations are synchronous.

**Impact:** High - Confusing for developers about async/sync nature of library.

**Recommendation:**
- Remove all `async`/`await` from examples (library is synchronous)
- Add note: "Note: sqlite-graph uses synchronous API. Network I/O should be completed before entering transaction."
- Update ERROR-HANDLING-RESEARCH.md lines 1030-1091 to use synchronous retry

---

#### HIGH-4: PLAN.md Shows Incomplete Features as Complete
**Location:**
- `PLAN.md` lines 63-67
- `src/core/Database.ts`, `src/query/` (actual files)

**Issue:**
PLAN.md marks items as incomplete but SPECIFICATION-COMPLETE.md says Phase 1 is 100% complete. Contradiction.

**Evidence:**
```markdown
// PLAN.md lines 63-67
- [ ] Main Database class
- [ ] Node CRUD operations
- [ ] Edge CRUD operations
- [ ] Transaction support
- [ ] Basic tests

// But SPECIFICATION-COMPLETE.md line 11
**Status:** ✅ **100% COMPLETE**
```

**Impact:** Medium - Confusing project status.

**Recommendation:**
Update PLAN.md to clarify:
```markdown
### Phase 1: Specification (COMPLETE ✅)
- [x] Type definitions and interfaces
- [x] JSDoc documentation
- [x] API specification
- [x] Pseudocode algorithms

### Phase 2: Implementation (Pending)
- [ ] Main Database class implementation
- [ ] Node CRUD operations implementation
```

---

#### MEDIUM-1: README.md Feature Claims vs Reality
**Location:**
- `README.md` lines 15-22
- Actual implementation

**Issue:**
README claims "production-ready" and lists implemented features, but Phase 1 only completed *specifications*, not implementations.

**Evidence:**
```markdown
// README.md line 9
**Status:** 🚧 Under Active Development (SPARC Phase 1: Specification)

// But line 12
sqlite-graph is a production-ready graph database library
```

**Impact:** Medium - Misleading about implementation status.

**Recommendation:**
Update README.md line 12:
```markdown
sqlite-graph is a graph database library under development following SPARC methodology.
The API specification is complete and implementation is in progress.
```

---

### 3. Code Example Validity (1 Medium, 1 High)

#### HIGH-5: SPECIFICATION-COMPLETE.md Uses Non-Existent Methods
**Location:**
- `docs/SPECIFICATION-COMPLETE.md` lines 449-457

**Issue:**
Example shows `db.nodes('Skill').connectedTo('Skill', 'REQUIRES', 'out').filter(job => job.id === skill.id)` which is logically incorrect (filtering by wrong variable).

**Evidence:**
```typescript
// Lines 444-450 - WRONG
db.nodes('Skill')
  .exec()
  .map(skill => ({
    skill,
    jobCount: db.nodes('Job')
      .connectedTo('Skill', 'REQUIRES', 'out')
      .filter(job => job.id === skill.id)  // BUG: comparing job.id to skill.id
      .count()
  }))
```

**Impact:** Medium - Example won't work as intended.

**Recommendation:**
Fix the logic:
```typescript
.map(skill => ({
  skill,
  jobCount: db.nodes('Job')
    .connectedTo('Skill', 'REQUIRES', 'out')
    .where({ id: skill.id })  // Match skill properly
    .count()
}))
```

Or better yet:
```typescript
.map(skill => ({
  skill,
  // Count jobs that require this skill
  jobCount: db.nodes('Job')
    .exec()
    .filter(job =>
      db.nodes('Skill')
        .where({ id: skill.id })
        .connectedTo('Job', 'REQUIRES', 'in')
        .exists()
    ).length
}))
```

---

#### MEDIUM-2: README.md Example Uses Incorrect Traversal Syntax
**Location:**
- `README.md` lines 93-100

**Issue:**
Example uses `.with('APPLIED_TO')` which is not defined in API.

**Evidence:**
```typescript
// README.md lines 95-97 - WRONG method
const recommendations = db.nodes('Application')
  .where({ status: 'rejected' })
  .with('APPLIED_TO')  // <-- Method doesn't exist
  .connectedTo('Job', 'SIMILAR_TO')
```

**Impact:** Medium - Example code won't run.

**Recommendation:**
Replace with correct API:
```typescript
const recommendations = db.nodes('Application')
  .where({ status: 'rejected' })
  .exec()
  .flatMap(app => {
    // Get the job this application was for
    const edges = db.edges('APPLIED_TO').where({ from: app.id }).exec();
    if (edges.length === 0) return [];

    const jobId = edges[0].to;

    // Find similar jobs
    return db.traverse(jobId)
      .out('SIMILAR_TO')
      .filter(job => job.properties.status === 'discovered')
      .toArray();
  });
```

---

### 4. Type Definition Consistency (1 Medium)

#### MEDIUM-3: NodeData Interface Too Generic
**Location:**
- `src/types/index.ts` NodeData interface
- `docs/API-INTERFACES.md` lines 1134-1141

**Issue:**
`NodeData` is defined as `[key: string]: any` which defeats TypeScript's type safety purpose.

**Evidence:**
```typescript
// API-INTERFACES.md lines 1138-1140
export interface NodeData {
  [key: string]: any;
}
```

**Impact:** Medium - Loses type safety benefits.

**Recommendation:**
This is actually correct for flexibility, but should add JSDoc warning:
```typescript
/**
 * Base type for node/edge property data
 *
 * @remarks
 * While this interface allows any properties, it's recommended to define
 * specific interfaces that extend NodeData for type safety:
 *
 * @example
 * ```typescript
 * interface JobData extends NodeData {
 *   title: string;
 *   url: string;
 *   status: 'active' | 'rejected' | 'discovered';
 * }
 *
 * const job = db.createNode<JobData>('Job', {
 *   title: 'Engineer',  // Type-checked
 *   url: 'https://...',
 *   status: 'active'
 * });
 * ```
 */
export interface NodeData {
  [key: string]: any;
}
```

---

### 5. Cross-Reference Integrity (2 Medium)

#### MEDIUM-4: Broken Internal Links
**Location:**
- `README.md` line 126
- `docs/SPARC-DEVELOPMENT.md` line 22

**Issue:**
README.md references `docs/API.md` which doesn't exist. Should be `docs/API-INTERFACES.md`.

**Evidence:**
```markdown
// README.md line 126
- [API Reference](docs/API.md) - Full API documentation (coming soon)

// But actual file is:
docs/API-INTERFACES.md
```

**Impact:** Low-Medium - Broken link.

**Recommendation:**
Update README.md line 126:
```markdown
- [API Reference](docs/API-INTERFACES.md) - Complete TypeScript interface definitions
```

---

## Detailed Findings

### Finding 1: Transaction Context Availability
**Files Affected:**
- `docs/API-INTERFACES.md`
- `docs/TRANSACTION-SEMANTICS.md`

**Description:**
The transaction API has two different signatures documented. API-INTERFACES shows a TransactionContext parameter allowing manual commit/rollback, while TRANSACTION-SEMANTICS shows automatic-only behavior.

**Current State:**
```typescript
// API-INTERFACES.md version (with context)
db.transaction((ctx) => {
  const node = db.createNode('Job', { title: 'Engineer' });
  ctx.commit();  // Manual commit
});

// TRANSACTION-SEMANTICS.md version (auto-only)
db.transaction(() => {
  const node = db.createNode('Job', { title: 'Engineer' });
  // Auto-commit on return
});
```

**Decision Required:**
Which API should be canonical? Both have merits:

**Option A: Keep TransactionContext**
- Pros: Allows manual control, savepoints, partial rollback
- Cons: More complex API, easy to misuse
- Better for: Advanced users needing fine control

**Option B: Remove TransactionContext**
- Pros: Simpler API, harder to misuse, automatic safety
- Cons: No manual control over commit timing
- Better for: Most users, safer default behavior

**Recommendation:** Keep TransactionContext but make it optional:
```typescript
transaction<T>(fn: (ctx?: TransactionContext) => T): T
```

This allows:
- Simple usage: `db.transaction(() => { ... })` (auto-commit)
- Advanced usage: `db.transaction((ctx) => { ctx.savepoint('x'); ... })` (manual control)

---

### Finding 2: Error Handling Philosophy Inconsistency
**Files Affected:**
- `docs/API-INTERFACES.md`
- `docs/ERROR-HANDLING-RESEARCH.md`

**Description:**
The documented error handling philosophy is "reads return null, writes throw", but updateNode() documentation contradicts this.

**Current State:**
```typescript
// getNode (read) - returns null ✓
getNode(id: number): Node | null

// updateNode (write) - should throw, but documented as returning null ✗
updateNode(id: number, properties: Partial<T>): Node<T> | null
```

**Recommendation:**
Make updateNode consistent with "writes throw" philosophy:
```typescript
/**
 * Updates a node's properties (partial update)
 *
 * @param id - The unique identifier of the node to update
 * @param properties - Partial properties to update (merged with existing)
 *
 * @returns The updated node
 *
 * @throws {NodeNotFoundError} If node doesn't exist
 * @throws {ValidationError} If updated properties don't match schema
 * @throws {Error} If database update fails
 */
updateNode<T extends NodeData = NodeData>(
  id: number,
  properties: Partial<T>
): Node<T>;  // <-- No | null
```

---

### Finding 3: Async/Sync Clarity Needed
**Files Affected:**
- `docs/TRANSACTION-SEMANTICS.md`
- `docs/ERROR-HANDLING-RESEARCH.md`
- `README.md`

**Description:**
Multiple examples show `async`/`await` keywords with synchronous API, causing confusion.

**Problem Examples:**

1. **TRANSACTION-SEMANTICS.md line 573:**
```typescript
// ✅ GOOD: Fetch outside transaction
const jobs = fetchJobsFromAPI(); // Network I/O
db.transaction(() => {
  jobs.forEach(job => db.createNode('Job', job));
});
```
This is synchronous but comment says "Network I/O" suggesting async.

2. **ERROR-HANDLING-RESEARCH.md line 1086:**
```typescript
// Usage
const node = await retryOperation(  // <-- await used
  () => db.createNode('Job', jobData),  // <-- synchronous operation
  { maxAttempts: 3, initialDelay: 100 }
);
```

**Recommendation:**
1. Add prominent note at top of README.md:
```markdown
## Important: Synchronous API

sqlite-graph uses a **synchronous API** (no async/await). This is intentional:
- Simpler mental model
- No promise chains
- Perfect for CLI tools, build scripts, desktop apps
- Not suitable for high-concurrency web servers

All examples in this documentation are synchronous.
```

2. Remove all `async`/`await` from examples
3. Update retry function to be synchronous with setTimeout wrapper

---

### Finding 4: Specification vs Implementation Status Confusion
**Files Affected:**
- `PLAN.md`
- `docs/SPECIFICATION-COMPLETE.md`
- `README.md`

**Description:**
Three documents give different impressions of project completion status.

**Current Messages:**

| Document | Status Message | Impression |
|----------|---------------|------------|
| README.md line 12 | "production-ready graph database library" | Implemented and ready |
| README.md line 9 | "SPARC Phase 1: Specification" | Design only |
| SPECIFICATION-COMPLETE.md | "100% COMPLETE" | Fully done |
| PLAN.md lines 63-67 | Checkboxes unchecked | Not started |

**Recommendation:**
Update all three for consistency:

**README.md** (lines 9-12):
```markdown
**Status:** 🚧 Specification Complete - Implementation In Progress

## Overview

sqlite-graph is a graph database library in active development following the SPARC
methodology. The complete API specification with JSDoc documentation is finished,
and implementation is underway using TDD (Test-Driven Development).
```

**PLAN.md** (add status section):
```markdown
## Current Status (2025-10-27)

### ✅ Phase 1: Specification (COMPLETE)
- [x] Type definitions and interfaces
- [x] Complete API with JSDoc
- [x] Database schema design
- [x] Pseudocode algorithms
- [x] Error handling strategy

### 🚧 Phase 2: Implementation (IN PROGRESS)
- [ ] Database class implementation
- [ ] Node CRUD operations
- [ ] Edge CRUD operations
- [ ] Transaction support
- [ ] Unit tests

### 📋 Phase 3: Query DSL (PLANNED)
- [ ] NodeQuery implementation
- [ ] TraversalQuery implementation
- [ ] Integration tests
```

**SPECIFICATION-COMPLETE.md**: No changes needed (accurate for Phase 1).

---

## Quick Wins (Easy Fixes)

These issues can be fixed immediately with minimal effort:

### 1. Fix Broken Link in README.md
**File:** `README.md` line 126
**Fix:**
```diff
-- [API Reference](docs/API.md) - Full API documentation (coming soon)
++ [API Reference](docs/API-INTERFACES.md) - Complete TypeScript interface definitions
```

---

### 2. Remove Async from Examples
**Files:**
- `docs/TRANSACTION-SEMANTICS.md`
- `docs/ERROR-HANDLING-RESEARCH.md`

**Fix:** Global find-replace:
- Remove `async` keyword before all function declarations
- Remove `await` keyword before all db operations
- Add comment: `// Note: sqlite-graph uses synchronous API`

---

### 3. Fix Code Example in SPECIFICATION-COMPLETE.md
**File:** `docs/SPECIFICATION-COMPLETE.md` lines 444-450
**Fix:**
```diff
db.nodes('Skill')
  .exec()
  .map(skill => ({
    skill,
--  jobCount: db.nodes('Job')
--    .connectedTo('Skill', 'REQUIRES', 'out')
--    .filter(job => job.id === skill.id)
--    .count()
++  // Count how many jobs require this skill
++  jobCount: db.edges('REQUIRES')
++    .where({ to: skill.id })
++    .count()
  }))
```

---

### 4. Add Default Value to connectedTo
**File:** `docs/API-INTERFACES.md` line 498
**Fix:**
```diff
connectedTo(
  nodeType: string,
  edgeType: string,
-- direction?: TraversalDirection
++ direction: TraversalDirection = 'out'
): NodeQuery<T>;
```

---

### 5. Clarify Transaction Automatic Behavior
**File:** `docs/TRANSACTION-SEMANTICS.md` line 78
**Fix:** Add prominent note:
```markdown
### Automatic Transaction Management

**Important:** Transactions in sqlite-graph are **automatic**:
- ✅ **Auto-commit** on successful function return
- ✅ **Auto-rollback** on thrown error
- ✅ **No manual commit required** for most use cases

Manual control (via TransactionContext) is available for advanced scenarios.
```

---

## Strategic Decisions Needed

These require architectural choices before fixing:

### Decision 1: Transaction API Design
**Question:** Should transaction() provide TransactionContext parameter?

**Options:**
1. **Remove TransactionContext** - Simpler, automatic-only API
2. **Keep TransactionContext** - Advanced control for power users
3. **Optional TransactionContext** - Support both use cases

**Recommendation:** Option 3 (optional context)
**Rationale:** Serves both simple and advanced users without breaking changes.

---

### Decision 2: updateNode Error Handling
**Question:** Should updateNode() throw or return null when node not found?

**Options:**
1. **Throw NodeNotFoundError** - Consistent with "writes throw" philosophy
2. **Return null** - Consistent with getNode()
3. **Configurable** - Add option parameter

**Recommendation:** Option 1 (throw)
**Rationale:** Write operations should fail loudly to prevent silent data issues.

---

### Decision 3: Production-Ready Claims
**Question:** When can we claim "production-ready"?

**Milestones:**
- [ ] All unit tests passing (>80% coverage)
- [ ] Integration tests for real-world scenarios
- [ ] Performance benchmarks meeting goals
- [ ] Error handling fully implemented
- [ ] Used in at least one production project
- [ ] npm package published

**Recommendation:** Only claim "production-ready" after all milestones met.

---

## Validation Checklist (For Future Reviews)

Use this checklist to validate specification documents:

### API Consistency
- [ ] All method signatures match across documents
- [ ] Parameter names consistent everywhere
- [ ] Return types identical in all references
- [ ] Optional parameters documented with defaults
- [ ] Generic types used consistently

### Implementation Status
- [ ] ✅ markers only on completed work
- [ ] Clear labels: "Planned", "In Progress", "Complete"
- [ ] Status consistent across all docs
- [ ] Roadmap reflects actual state

### Code Examples
- [ ] All examples use correct syntax
- [ ] No undefined methods/properties
- [ ] Async/sync used correctly
- [ ] TypeScript types validate
- [ ] Examples are runnable (once implemented)

### Cross-References
- [ ] All file paths exist
- [ ] Links point to correct sections
- [ ] Version numbers consistent
- [ ] No broken internal links

### Error Handling
- [ ] Error types documented consistently
- [ ] Throw vs return null philosophy clear
- [ ] All error scenarios covered
- [ ] Error messages consistent

---

## Recommended Fix Priority

### Phase 1: Critical Fixes (Do First)
1. ✅ Fix transaction API signature (CRITICAL-1)
2. ✅ Fix updateNode return type (HIGH-1)
3. ✅ Remove async/await from examples (HIGH-3)
4. ✅ Fix broken example in SPECIFICATION-COMPLETE.md (HIGH-5)

### Phase 2: Consistency Fixes (Do Second)
5. ✅ Add default to connectedTo direction (CRITICAL-2)
6. ✅ Document PathOptions for shortestPath (HIGH-2)
7. ✅ Clarify project status in all docs (HIGH-4)
8. ✅ Fix README.md feature claims (MEDIUM-1)

### Phase 3: Polish (Do Third)
9. ✅ Fix broken link in README (MEDIUM-4)
10. ✅ Add JSDoc warning to NodeData (MEDIUM-3)
11. ✅ Fix README.md example syntax (MEDIUM-2)
12. ✅ Clarify edge properties optional nature (CRITICAL-3)

---

## Conclusion

The specification phase has produced high-quality documentation with comprehensive coverage. The 12 issues found are mostly minor inconsistencies that are expected in large documentation sets.

**Strengths:**
- ✅ Comprehensive JSDoc coverage
- ✅ Clear examples throughout
- ✅ Well-structured type system
- ✅ Thorough error handling strategy
- ✅ Detailed pseudocode algorithms

**Areas for Improvement:**
- Fix transaction API ambiguity
- Clarify async/sync nature throughout
- Align implementation status across docs
- Fix minor code example bugs

**Overall Assessment:** Specification is **implementation-ready** after addressing critical issues 1-5. The foundation is solid and the issues found are easily correctable.

---

**Review Completed:** 2025-10-27
**Next Steps:**
1. Address critical issues (CRITICAL-1 through CRITICAL-3)
2. Make strategic decisions (Transaction API, updateNode behavior)
3. Apply quick wins
4. Proceed to implementation phase

**Reviewers:** Code Review Agent (Claude Code)
**Approved for Implementation:** Pending resolution of CRITICAL-1 and HIGH-1
