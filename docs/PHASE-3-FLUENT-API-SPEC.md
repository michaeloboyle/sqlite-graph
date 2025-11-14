# Phase 3: Fluent Pattern Matching & Bulk Operations Specification

**Version:** 1.0.0
**Status:** IP-Safe Original Design
**Authors:** Michael O'Boyle, Claude Code
**Date:** 2025-11-14

## Table of Contents

1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [Pattern Matching API](#pattern-matching-api)
4. [Bulk Operations API](#bulk-operations-api)
5. [Type Safety](#type-safety)
6. [Performance Targets](#performance-targets)
7. [Error Handling](#error-handling)
8. [Integration](#integration)
9. [Success Criteria](#success-criteria)

---

## Overview

Phase 3 adds advanced graph traversal capabilities to sqlite-graph through two complementary APIs:

1. **Pattern Matching API** - Declarative multi-hop graph traversals
2. **Bulk Operations API** - Efficient batch CRUD operations

Both APIs maintain sqlite-graph's original fluent TypeScript design philosophy and avoid any Cypher-like syntax to ensure IP safety.

### Key Principles

- **Fluent & Chainable** - Consistent with existing NodeQuery/TraversalQuery style
- **Type-Safe** - Full TypeScript inference and compile-time checks
- **Performance-First** - Optimized SQL generation, minimal overhead
- **Original Design** - No external query language syntax or patterns
- **Pragmatic** - Solves real-world graph querying needs

---

## Design Philosophy

### Consistency with Existing API

sqlite-graph already has a fluent API pattern:

```typescript
// Existing NodeQuery
const jobs = db.nodes('Job')
  .where({ status: 'active' })
  .limit(10)
  .exec();

// Existing TraversalQuery
const neighbors = db.traverse(startId, 'KNOWS', 'out')
  .depth(2)
  .exec();
```

Phase 3 extends this pattern with pattern matching:

```typescript
// New PatternQuery - SAME fluent style
const matches = db.pattern()
  .start('job', 'Job')
  .through('POSTED_BY', 'out')
  .end('company', 'Company')
  .where({ job: { status: 'active' } })
  .exec();
```

### IP-Safe Design Constraints

**What We AVOID:**
- ASCII art syntax (`()-[]->()`)
- Query language keywords resembling Cypher (`MATCH`, `RETURN`, `CREATE`)
- Pattern syntax from any existing graph database

**What We USE:**
- Standard fluent method chaining
- TypeScript method names (`start`, `through`, `end`, `node`)
- JavaScript object literals for filters
- Familiar SQL-like semantics where applicable

---

## Pattern Matching API

### Core Concept

A pattern is a declarative description of a graph structure you want to find. Instead of writing imperative traversal logic, you describe the "shape" and let sqlite-graph generate optimized queries.

### API Surface

#### PatternQuery Class

```typescript
class PatternQuery<T extends Record<string, GraphEntity>> {
  // Define pattern structure
  start(varName: string, nodeType?: string): PatternNodeBuilder<T>;
  node(varName: string, nodeType?: string): PatternNodeBuilder<T>;
  end(varName: string, nodeType?: string): PatternNodeBuilder<T>;

  // Apply filters
  where(conditions: Partial<{ [K in keyof T]: PropertyFilter }>): this;

  // Control results
  select(variables: (keyof T)[]): this;
  limit(count: number): this;
  offset(count: number): this;
  orderBy(variable: keyof T, field: string, dir?: 'asc' | 'desc'): this;

  // Execute
  exec(): PatternMatch<T>[];
  first(): PatternMatch<T> | null;
  count(): number;

  // Explain query plan
  explain(): QueryPlan;
}

class PatternNodeBuilder<T> {
  // Continue pattern with edge traversal
  through(edgeType: string, direction: 'in' | 'out' | 'both'): PatternQuery<T>;

  // Add constraints to current node
  where(filter: PropertyFilter): this;
}

interface PatternMatch<T> {
  // Variable bindings
  [varName: string]: GraphNode | GraphEdge;

  // Metadata
  _meta: {
    pathLength: number;
    executionTime: number;
  };
}

interface GraphEntity {
  id: number;
  type: string;
  properties: Record<string, unknown>;
}

interface GraphNode extends GraphEntity {}

interface GraphEdge extends GraphEntity {
  from: number;
  to: number;
}

type PropertyFilter = {
  [key: string]: unknown | { $gt?: unknown; $lt?: unknown; $in?: unknown[] };
};
```

### Usage Examples

#### Example 1: Simple Two-Hop Pattern

Find all jobs posted by companies where a person works:

```typescript
const jobsAtMyCompanies = db.pattern()
  .start('person', 'Person')
  .where({ person: { name: 'Alice' } })
  .through('WORKS_AT', 'out')
  .node('company', 'Company')
  .through('POSTED_BY', 'in')  // Reverse direction
  .end('job', 'Job')
  .where({ job: { status: 'active' } })
  .select(['job', 'company'])
  .exec();

// Result type: Array<{ job: GraphNode, company: GraphNode, _meta: {...} }>
```

**Generated SQL (conceptual):**

```sql
WITH person_nodes AS (
  SELECT id FROM nodes WHERE type = 'Person' AND json_extract(properties, '$.name') = 'Alice'
),
company_edges AS (
  SELECT e.* FROM edges e
  JOIN person_nodes p ON e.from_id = p.id
  WHERE e.type = 'WORKS_AT'
),
company_nodes AS (
  SELECT n.* FROM nodes n
  JOIN company_edges e ON n.id = e.to_id
  WHERE n.type = 'Company'
),
job_edges AS (
  SELECT e.* FROM edges e
  JOIN company_nodes c ON e.to_id = c.id
  WHERE e.type = 'POSTED_BY'
)
SELECT
  job.id as job_id, job.type as job_type, job.properties as job_properties,
  company.id as company_id, company.type as company_type, company.properties as company_properties
FROM nodes job
JOIN job_edges je ON job.id = je.from_id
JOIN company_nodes company ON company.id = je.to_id
WHERE job.type = 'Job' AND json_extract(job.properties, '$.status') = 'active'
```

#### Example 2: Multi-Hop Social Network

Find friends of friends who work at tech companies:

```typescript
const friendsOfFriendsAtTech = db.pattern()
  .start('me', 'Person')
  .where({ me: { id: userId } })
  .through('KNOWS', 'both')  // Undirected friendship
  .node('friend', 'Person')
  .through('KNOWS', 'both')
  .node('friendOfFriend', 'Person')
  .through('WORKS_AT', 'out')
  .end('company', 'Company')
  .where({
    company: { industry: 'Technology' },
    friendOfFriend: { id: { $ne: userId } }  // Exclude self
  })
  .select(['friendOfFriend', 'company'])
  .limit(50)
  .exec();
```

#### Example 3: Cyclic Pattern Detection

Find recommendation loops (A recommends B, B recommends A):

```typescript
const mutualRecommendations = db.pattern()
  .start('personA', 'Person')
  .through('RECOMMENDS', 'out')
  .node('personB', 'Person')
  .through('RECOMMENDS', 'out')
  .end('personA')  // Same variable = cyclic constraint
  .select(['personA', 'personB'])
  .exec();

// Result: Only pairs where both people recommend each other
```

#### Example 4: Variable-Length Paths

Express "friends within 3 hops" using chaining:

```typescript
// Helper method for repeated patterns
const friendsWithinHops = (startId: number, maxHops: number) => {
  let query = db.pattern().start('person', 'Person').where({ person: { id: startId } });

  for (let i = 0; i < maxHops; i++) {
    query = query.through('KNOWS', 'both').node(`friend${i}`, 'Person');
  }

  return query.select([`friend${maxHops - 1}`]).exec();
};

const friends = friendsWithinHops(userId, 3);
```

#### Example 5: Complex Filtering

Find senior engineers at well-funded startups:

```typescript
const seniorEngineersAtFundedStartups = db.pattern()
  .start('person', 'Person')
  .where({ person: { title: 'Senior Engineer', yearsExperience: { $gte: 5 } } })
  .through('WORKS_AT', 'out')
  .end('company', 'Company')
  .where({
    company: {
      stage: 'Series A',
      funding: { $gte: 1000000 },
      founded: { $gte: 2020 }
    }
  })
  .orderBy('company', 'funding', 'desc')
  .limit(25)
  .exec();
```

### Method Specifications

#### `start(varName, nodeType?)`

**Purpose:** Define the starting point of the pattern.

**Parameters:**
- `varName` - Variable name for this node in results
- `nodeType` - Optional node type filter

**Returns:** `PatternNodeBuilder` for adding constraints

**Example:**
```typescript
db.pattern().start('user', 'Person')  // Type-filtered start
db.pattern().start('node')            // Any node type
```

#### `node(varName, nodeType?)`

**Purpose:** Add an intermediate node in the pattern.

**Parameters:**
- `varName` - Variable name for this node
- `nodeType` - Optional node type filter

**Returns:** `PatternNodeBuilder`

**Example:**
```typescript
.through('KNOWS', 'out')
.node('friend', 'Person')  // Intermediate node
.through('WORKS_AT', 'out')
```

#### `end(varName, nodeType?)`

**Purpose:** Define the terminal node of the pattern. If `varName` matches an existing variable, creates a cyclic constraint.

**Parameters:**
- `varName` - Variable name for terminal node
- `nodeType` - Optional node type filter (ignored for cyclic patterns)

**Returns:** `PatternQuery` for final operations

**Example:**
```typescript
.end('company', 'Company')     // New terminal node
.end('user')                   // Cyclic - same as start variable
```

#### `through(edgeType, direction)`

**Purpose:** Add an edge traversal between nodes.

**Parameters:**
- `edgeType` - Edge type to traverse
- `direction` - `'in'` | `'out'` | `'both'`

**Returns:** `PatternQuery`

**Direction semantics:**
- `'out'` - Follow edges where current node is source (`from_id`)
- `'in'` - Follow edges where current node is target (`to_id`)
- `'both'` - Follow edges in either direction (undirected)

**Example:**
```typescript
.through('POSTED_BY', 'out')   // Job -> Company
.through('POSTED_BY', 'in')    // Company -> Job
.through('KNOWS', 'both')      // Friendship (undirected)
```

#### `where(conditions)`

**Purpose:** Apply filters to pattern variables.

**Parameters:**
- `conditions` - Object mapping variable names to property filters

**Returns:** `this` for chaining

**Filter operators:**
```typescript
{
  varName: {
    property: value,                    // Exact match
    property: { $gt: 5, $lt: 10 },     // Range
    property: { $in: ['A', 'B'] },     // Set membership
    property: { $ne: 'exclude' }       // Not equal
  }
}
```

**Example:**
```typescript
.where({
  person: { age: { $gte: 18 } },
  company: { name: 'TechCorp', active: true }
})
```

#### `select(variables)`

**Purpose:** Choose which variables to return in results.

**Parameters:**
- `variables` - Array of variable names to include

**Returns:** `this`

**Default:** All variables included if not specified

**Example:**
```typescript
.select(['person', 'company'])  // Only these two
```

#### `exec()`

**Purpose:** Execute the pattern match and return results.

**Returns:** `PatternMatch<T>[]`

**Result structure:**
```typescript
[
  {
    person: { id: 1, type: 'Person', properties: {...} },
    company: { id: 10, type: 'Company', properties: {...} },
    _meta: { pathLength: 2, executionTime: 45 }
  },
  ...
]
```

#### `first()`

**Purpose:** Execute and return only the first match.

**Returns:** `PatternMatch<T> | null`

**Example:**
```typescript
const match = db.pattern()
  .start('user', 'Person')
  .where({ user: { email: 'alice@example.com' } })
  .through('WORKS_AT', 'out')
  .end('company', 'Company')
  .first();

if (match) {
  console.log(`${match.user.properties.name} works at ${match.company.properties.name}`);
}
```

#### `count()`

**Purpose:** Count matches without retrieving full results.

**Returns:** `number`

**Example:**
```typescript
const friendCount = db.pattern()
  .start('me', 'Person')
  .where({ me: { id: userId } })
  .through('KNOWS', 'both')
  .end('friend', 'Person')
  .count();
```

#### `orderBy(variable, field, direction?)`

**Purpose:** Sort results by a property of a variable.

**Parameters:**
- `variable` - Variable name to sort by
- `field` - Property name within that variable
- `direction` - `'asc'` | `'desc'` (default: `'asc'`)

**Returns:** `this`

**Example:**
```typescript
.orderBy('company', 'foundedYear', 'desc')
.orderBy('person', 'lastName', 'asc')
```

#### `explain()`

**Purpose:** Show query execution plan without running the query.

**Returns:** `QueryPlan`

**Example:**
```typescript
interface QueryPlan {
  sql: string;
  estimatedCost: number;
  joinOrder: string[];
  indexesUsed: string[];
}

const plan = db.pattern()
  .start('person', 'Person')
  .through('KNOWS', 'both')
  .end('friend', 'Person')
  .explain();

console.log(`Query will execute in ~${plan.estimatedCost}ms`);
console.log(`Join order: ${plan.joinOrder.join(' -> ')}`);
```

---

## Bulk Operations API

### Core Concept

Efficient batch operations for common CRUD tasks. Instead of calling `db.createNode()` in a loop, pass arrays for atomic, optimized execution.

### API Surface

```typescript
interface BulkOperations {
  // Batch create
  createNodes(specs: NodeSpec[]): BulkCreateResult;
  createEdges(specs: EdgeSpec[]): BulkCreateResult;

  // Batch update
  updateNodes(type: string, filter: PropertyFilter, updates: Record<string, unknown>): BulkUpdateResult;
  updateEdges(type: string, filter: PropertyFilter, updates: Record<string, unknown>): BulkUpdateResult;

  // Batch delete
  deleteNodes(type: string, filter: PropertyFilter): BulkDeleteResult;
  deleteEdges(type: string, filter: PropertyFilter): BulkDeleteResult;

  // Batch upsert (update if exists, create if not)
  upsertNodes(specs: NodeSpec[], matchOn: string[]): BulkUpsertResult;
}

interface NodeSpec {
  type: string;
  properties: Record<string, unknown>;
}

interface EdgeSpec {
  from: number;
  type: string;
  to: number;
  properties?: Record<string, unknown>;
}

interface BulkCreateResult {
  created: number;
  ids: number[];
  executionTime: number;
}

interface BulkUpdateResult {
  updated: number;
  executionTime: number;
}

interface BulkDeleteResult {
  deleted: number;
  executionTime: number;
}

interface BulkUpsertResult {
  created: number;
  updated: number;
  ids: number[];
  executionTime: number;
}
```

### Usage Examples

#### Example 1: Import Job Listings

```typescript
// Scrape 100 jobs from an API
const jobData = await fetchJobListings();

// Bulk create nodes
const result = db.createNodes(
  jobData.map(job => ({
    type: 'Job',
    properties: {
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      postedDate: job.postedDate,
      status: 'discovered'
    }
  }))
);

console.log(`Created ${result.created} jobs in ${result.executionTime}ms`);
// Created 100 jobs in 23ms

// Link to companies (assuming companies already exist)
const companyMap = new Map(); // Map company names to IDs
const edgeSpecs = result.ids.map((jobId, i) => {
  const companyId = companyMap.get(jobData[i].company);
  return {
    from: jobId,
    type: 'POSTED_BY',
    to: companyId
  };
}).filter(spec => spec.to); // Only link if company exists

const edgeResult = db.createEdges(edgeSpecs);
console.log(`Created ${edgeResult.created} edges in ${edgeResult.executionTime}ms`);
```

#### Example 2: Batch Status Updates

```typescript
// Mark all "discovered" jobs as "reviewed" after daily review
const updateResult = db.updateNodes(
  'Job',
  { status: 'discovered', reviewedDate: null },  // Filter
  { status: 'reviewed', reviewedDate: Date.now() }  // Updates
);

console.log(`Updated ${updateResult.updated} jobs`);
```

#### Example 3: Cleanup Old Data

```typescript
// Delete jobs older than 90 days
const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

const deleteResult = db.deleteNodes(
  'Job',
  { postedDate: { $lt: ninetyDaysAgo } }
);

console.log(`Deleted ${deleteResult.deleted} old jobs`);
```

#### Example 4: Upsert for Incremental Updates

```typescript
// Daily sync: update existing companies, create new ones
const companies = await fetchCompanies();

const upsertResult = db.upsertNodes(
  companies.map(c => ({
    type: 'Company',
    properties: {
      name: c.name,
      industry: c.industry,
      size: c.size,
      lastUpdated: Date.now()
    }
  })),
  ['name']  // Match on 'name' property
);

console.log(`Created ${upsertResult.created}, updated ${upsertResult.updated}`);
```

#### Example 5: Batch Edge Creation for Graph Import

```typescript
// Import a social network from CSV
const connections = parseCsv('connections.csv');

// Create all people first
const people = db.createNodes(
  connections.map(c => ({ type: 'Person', properties: { name: c.name } }))
);

// Build edge specs
const edges: EdgeSpec[] = [];
connections.forEach((c, i) => {
  c.friendIds.forEach(friendIdx => {
    edges.push({
      from: people.ids[i],
      type: 'KNOWS',
      to: people.ids[friendIdx],
      properties: { since: c.friendshipDates[friendIdx] }
    });
  });
});

const edgeResult = db.createEdges(edges);
console.log(`Created ${edgeResult.created} friendships`);
```

### Method Specifications

#### `createNodes(specs)`

**Purpose:** Create multiple nodes atomically.

**Parameters:**
- `specs` - Array of node specifications

**Returns:** `BulkCreateResult`

**Implementation notes:**
- Uses single SQLite transaction
- Generates sequential IDs
- All-or-nothing: fails if any node invalid
- Optimized with prepared statements

**Performance target:** >10,000 nodes/second

**Example:**
```typescript
const result = db.createNodes([
  { type: 'Person', properties: { name: 'Alice' } },
  { type: 'Person', properties: { name: 'Bob' } }
]);
// result.ids = [1, 2]
```

#### `createEdges(specs)`

**Purpose:** Create multiple edges atomically.

**Parameters:**
- `specs` - Array of edge specifications

**Returns:** `BulkCreateResult`

**Validation:**
- Throws if `from` or `to` node doesn't exist
- All edges created in single transaction

**Performance target:** >15,000 edges/second

**Example:**
```typescript
const result = db.createEdges([
  { from: 1, type: 'KNOWS', to: 2 },
  { from: 1, type: 'KNOWS', to: 3, properties: { since: 2020 } }
]);
```

#### `updateNodes(type, filter, updates)`

**Purpose:** Update all nodes matching criteria.

**Parameters:**
- `type` - Node type to update
- `filter` - Property conditions to match
- `updates` - New property values

**Returns:** `BulkUpdateResult`

**Behavior:**
- Updates existing properties, adds new ones
- Does NOT remove properties not mentioned
- Returns count of affected nodes

**Example:**
```typescript
const result = db.updateNodes(
  'Job',
  { status: 'active', company: 'TechCorp' },
  { status: 'closed', closedDate: Date.now() }
);
```

#### `deleteNodes(type, filter)`

**Purpose:** Delete all nodes matching criteria.

**Parameters:**
- `type` - Node type to delete
- `filter` - Property conditions to match

**Returns:** `BulkDeleteResult`

**Side effects:**
- Cascades to connected edges (deletes them too)
- Irreversible operation

**Example:**
```typescript
const result = db.deleteNodes('Job', { status: 'rejected' });
```

#### `upsertNodes(specs, matchOn)`

**Purpose:** Update existing nodes or create new ones based on key properties.

**Parameters:**
- `specs` - Array of node specifications
- `matchOn` - Property names to match on

**Returns:** `BulkUpsertResult`

**Logic:**
```
For each spec:
  Find existing node WHERE type = spec.type AND matchOn properties match
  If found: UPDATE properties
  If not found: INSERT new node
```

**Example:**
```typescript
const result = db.upsertNodes(
  [{ type: 'Company', properties: { name: 'ACME', industry: 'Tech' } }],
  ['name']  // Match on 'name' property
);
// If 'ACME' exists: updates industry
// If not: creates new company
```

---

## Type Safety

### Generic Type Inference

Pattern queries infer types from variable declarations:

```typescript
// Type is inferred as { person: GraphNode, job: GraphNode }
const result = db.pattern()
  .start('person', 'Person')
  .through('APPLIED_TO', 'out')
  .end('job', 'Job')
  .exec();

// TypeScript knows these properties exist:
result[0].person.id;        // number
result[0].person.type;      // 'Person'
result[0].person.properties; // Record<string, unknown>
result[0].job;              // GraphNode

// Compile error: variable doesn't exist in pattern
result[0].company;          // ❌ TypeScript error
```

### Custom Property Types

For stronger typing, use generic constraints:

```typescript
interface PersonProps {
  name: string;
  age: number;
  email: string;
}

interface JobProps {
  title: string;
  salary: number;
  status: 'active' | 'closed';
}

type TypedNode<T> = GraphNode & { properties: T };

// Manual type assertion for property access
const result = db.pattern()
  .start('person', 'Person')
  .through('APPLIED_TO', 'out')
  .end('job', 'Job')
  .exec();

const person = result[0].person as TypedNode<PersonProps>;
const job = result[0].job as TypedNode<JobProps>;

// Now TypeScript knows property types
console.log(person.properties.name);      // string
console.log(job.properties.salary);       // number
```

### Builder Pattern Type Safety

Each builder method returns the correct type:

```typescript
const query = db.pattern()           // PatternQuery<{}>
  .start('a', 'Person')              // PatternNodeBuilder<{ a: GraphNode }>
  .through('KNOWS', 'out')           // PatternQuery<{ a: GraphNode }>
  .end('b', 'Person');               // PatternQuery<{ a: GraphNode, b: GraphNode }>

// TypeScript ensures you can't call builder methods out of order:
query.start('c');  // ❌ Error: start() not available after end()
```

---

## Performance Targets

### Pattern Matching

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Simple 2-hop pattern | <50ms | 10K node graph |
| Complex 4-hop pattern | <200ms | 10K node graph |
| Cyclic pattern detection | <100ms | 1K cycles |
| Variable-length (3 hops) | <150ms | 10K node graph |
| Pattern with complex filters | <100ms | 10K node graph |

### Bulk Operations

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Bulk node creation | >10,000 nodes/sec | Sequential IDs |
| Bulk edge creation | >15,000 edges/sec | Existing nodes |
| Bulk updates | >20,000 nodes/sec | Property modifications |
| Bulk deletes | >25,000 nodes/sec | With cascade |
| Upsert operations | >8,000 nodes/sec | 50% create, 50% update |

### Optimization Strategies

1. **Query Plan Optimization**
   - Use CTEs for multi-hop patterns
   - Index on `type`, `from_id`, `to_id`
   - Push filters as early as possible

2. **Prepared Statements**
   - Cache compiled SQL for bulk operations
   - Reuse statement handles within transactions

3. **Transaction Batching**
   - Group bulk operations in single transaction
   - Use `PRAGMA journal_mode=WAL` for concurrency

4. **Index Utilization**
   - Create covering indexes for common patterns
   - Use JSON indexes for frequently filtered properties

5. **Memory Management**
   - Stream large result sets
   - Limit intermediate materialization

---

## Error Handling

### Error Types

```typescript
class PatternError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'PatternError';
  }
}

class BulkOperationError extends Error {
  constructor(
    message: string,
    public code: string,
    public failedItems?: unknown[]
  ) {
    super(message);
    this.name = 'BulkOperationError';
  }
}
```

### Error Scenarios

#### Pattern Matching Errors

| Error Code | Scenario | Example |
|------------|----------|---------|
| `INVALID_PATTERN` | Pattern has no path | `.start('a').end('b')` without `.through()` |
| `UNDEFINED_VARIABLE` | Variable used but not defined | `.select(['x'])` when 'x' never declared |
| `CYCLIC_TYPE_MISMATCH` | Cyclic constraint with wrong type | `.start('a', 'Person').end('a', 'Company')` |
| `INVALID_DIRECTION` | Bad direction value | `.through('KNOWS', 'sideways')` |
| `INVALID_FILTER` | Malformed filter object | `.where({ a: { $invalid: 5 } })` |

**Example:**
```typescript
try {
  const result = db.pattern()
    .start('person')
    .end('job')  // Missing .through()
    .exec();
} catch (err) {
  if (err instanceof PatternError && err.code === 'INVALID_PATTERN') {
    console.error('Pattern has no connecting edge:', err.message);
  }
}
```

#### Bulk Operation Errors

| Error Code | Scenario | Example |
|------------|----------|---------|
| `MISSING_NODE` | Edge references non-existent node | `createEdges([{ from: 999, type: 'X', to: 1 }])` |
| `DUPLICATE_ID` | ID collision in create | Internal integrity check |
| `CONSTRAINT_VIOLATION` | Type/property constraint | Creating node with invalid type |
| `TRANSACTION_FAILED` | Atomic operation failed | Disk full, transaction rollback |
| `INVALID_SPEC` | Malformed spec object | `createNodes([{ no_type: true }])` |

**Example:**
```typescript
try {
  db.createEdges([
    { from: 1, type: 'KNOWS', to: 99999 }  // 99999 doesn't exist
  ]);
} catch (err) {
  if (err instanceof BulkOperationError && err.code === 'MISSING_NODE') {
    console.error('Referenced node not found:', err.message);
    console.log('Failed items:', err.failedItems);
  }
}
```

### Partial Failure Handling

Bulk operations are atomic - either all succeed or all fail:

```typescript
try {
  db.createNodes([
    { type: 'Person', properties: { name: 'Alice' } },  // ✓ Valid
    { type: 'InvalidType', properties: {} },            // ✗ Invalid
    { type: 'Person', properties: { name: 'Bob' } }     // ✓ Valid
  ]);
} catch (err) {
  // Transaction rolled back - NO nodes created (not even Alice)
  console.error('Bulk create failed, no changes made');
}
```

For partial success, split into smaller batches and handle individually.

---

## Integration

### GraphDatabase Class Extension

```typescript
class GraphDatabase {
  // Existing methods
  createNode(type: string, properties: Record<string, unknown>): GraphNode;
  getNode(id: number): GraphNode | null;
  traverse(from: number, edgeType: string, direction: 'in' | 'out' | 'both'): TraversalQuery;
  nodes(type: string): NodeQuery;

  // NEW: Pattern matching
  pattern(): PatternQuery<{}>;

  // NEW: Bulk operations
  createNodes(specs: NodeSpec[]): BulkCreateResult;
  createEdges(specs: EdgeSpec[]): BulkCreateResult;
  updateNodes(type: string, filter: PropertyFilter, updates: Record<string, unknown>): BulkUpdateResult;
  updateEdges(type: string, filter: PropertyFilter, updates: Record<string, unknown>): BulkUpdateResult;
  deleteNodes(type: string, filter: PropertyFilter): BulkDeleteResult;
  deleteEdges(type: string, filter: PropertyFilter): BulkDeleteResult;
  upsertNodes(specs: NodeSpec[], matchOn: string[]): BulkUpsertResult;
}
```

### Backward Compatibility

All existing APIs remain unchanged. Phase 3 additions are purely additive:

```typescript
// Phase 1 & 2 - Still works
const node = db.createNode('Person', { name: 'Alice' });
const neighbors = db.traverse(node.id, 'KNOWS', 'both').exec();

// Phase 3 - New capabilities
const pattern = db.pattern()
  .start('person', 'Person')
  .through('KNOWS', 'both')
  .end('friend', 'Person')
  .exec();
```

### Database Schema

No schema changes required. Pattern matching and bulk operations use existing `nodes` and `edges` tables:

```sql
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  properties TEXT NOT NULL  -- JSON
);

CREATE TABLE edges (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  properties TEXT,
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX idx_edges_from ON edges(from_id, type);
CREATE INDEX idx_edges_to ON edges(to_id, type);
CREATE INDEX idx_nodes_type ON nodes(type);
```

### File Structure

```
src/
├── core/
│   ├── GraphDatabase.ts         # Extended with pattern() and bulk methods
│   ├── PatternQuery.ts          # NEW: Pattern matching implementation
│   ├── PatternNodeBuilder.ts    # NEW: Builder for node constraints
│   └── BulkOperations.ts        # NEW: Bulk CRUD implementations
├── types/
│   ├── PatternTypes.ts          # NEW: Type definitions
│   └── BulkTypes.ts             # NEW: Bulk operation types
└── utils/
    ├── PatternCompiler.ts       # NEW: Translate patterns to SQL
    └── BulkExecutor.ts          # NEW: Optimized batch executor

tests/
└── phase3/
    ├── pattern-matching.test.ts
    ├── bulk-operations.test.ts
    ├── performance.test.ts
    └── integration.test.ts
```

---

## Success Criteria

### Functional Requirements

#### Pattern Matching

- [ ] **PM-1:** Single-hop patterns execute correctly
- [ ] **PM-2:** Multi-hop patterns (2-5 hops) return valid paths
- [ ] **PM-3:** Cyclic patterns detect loops correctly
- [ ] **PM-4:** Bidirectional edges (`'both'`) work as expected
- [ ] **PM-5:** Variable filtering with `where()` applies correctly
- [ ] **PM-6:** `select()` returns only specified variables
- [ ] **PM-7:** `limit()` and `offset()` pagination works
- [ ] **PM-8:** `orderBy()` sorts results correctly
- [ ] **PM-9:** `first()` returns single result or null
- [ ] **PM-10:** `count()` returns accurate match count
- [ ] **PM-11:** `explain()` shows valid query plan
- [ ] **PM-12:** Empty patterns return empty arrays (no errors)
- [ ] **PM-13:** Complex filters (`$gt`, `$lt`, `$in`, `$ne`) work
- [ ] **PM-14:** Pattern with no matches returns `[]`

#### Bulk Operations

- [ ] **BO-1:** `createNodes()` creates all nodes atomically
- [ ] **BO-2:** `createEdges()` creates all edges atomically
- [ ] **BO-3:** `updateNodes()` updates all matching nodes
- [ ] **BO-4:** `deleteNodes()` deletes all matching nodes and cascades edges
- [ ] **BO-5:** `upsertNodes()` updates existing and creates new
- [ ] **BO-6:** Bulk operations use single transaction
- [ ] **BO-7:** Failed bulk operation rolls back completely
- [ ] **BO-8:** `createEdges()` throws if node doesn't exist
- [ ] **BO-9:** Bulk operations return accurate counts
- [ ] **BO-10:** Empty bulk operations return zero results (no errors)

### Performance Requirements

- [ ] **PERF-1:** 2-hop pattern <50ms on 10K nodes
- [ ] **PERF-2:** 4-hop pattern <200ms on 10K nodes
- [ ] **PERF-3:** Cyclic detection <100ms on 1K cycles
- [ ] **PERF-4:** Bulk create >10,000 nodes/sec
- [ ] **PERF-5:** Bulk create >15,000 edges/sec
- [ ] **PERF-6:** Bulk update >20,000 nodes/sec
- [ ] **PERF-7:** Bulk delete >25,000 nodes/sec
- [ ] **PERF-8:** Pattern with filters <100ms on 10K nodes

### Type Safety Requirements

- [ ] **TS-1:** Pattern variables have correct inferred types
- [ ] **TS-2:** Builder methods return correct types
- [ ] **TS-3:** Invalid variable access causes compile error
- [ ] **TS-4:** Filter objects type-check correctly
- [ ] **TS-5:** Bulk operation specs type-check

### Error Handling Requirements

- [ ] **ERR-1:** Invalid patterns throw `PatternError`
- [ ] **ERR-2:** Bulk failures throw `BulkOperationError`
- [ ] **ERR-3:** Error messages are descriptive
- [ ] **ERR-4:** Error codes are machine-readable
- [ ] **ERR-5:** Failed items are reported in bulk errors

### Integration Requirements

- [ ] **INT-1:** New APIs don't break existing functionality
- [ ] **INT-2:** No schema changes required
- [ ] **INT-3:** Works with existing index strategy
- [ ] **INT-4:** Compatible with current transaction model
- [ ] **INT-5:** Documentation includes migration examples

### Documentation Requirements

- [ ] **DOC-1:** API reference complete for all methods
- [ ] **DOC-2:** Usage examples for common scenarios
- [ ] **DOC-3:** Performance tuning guide
- [ ] **DOC-4:** Error handling guide
- [ ] **DOC-5:** Migration guide from imperative traversals

### Testing Requirements

- [ ] **TEST-1:** 90%+ code coverage
- [ ] **TEST-2:** All example code in docs is executable
- [ ] **TEST-3:** Performance benchmarks automated
- [ ] **TEST-4:** Edge cases tested (empty graphs, single nodes, etc.)
- [ ] **TEST-5:** Concurrency tests for bulk operations

---

## Acceptance Tests

### Pattern Matching Scenarios

```typescript
describe('Pattern Matching', () => {
  it('finds jobs at companies where friends work', () => {
    const result = db.pattern()
      .start('me', 'Person')
      .where({ me: { id: 1 } })
      .through('KNOWS', 'both')
      .node('friend', 'Person')
      .through('WORKS_AT', 'out')
      .node('company', 'Company')
      .through('POSTED_BY', 'in')
      .end('job', 'Job')
      .exec();

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('me');
    expect(result[0]).toHaveProperty('friend');
    expect(result[0]).toHaveProperty('company');
    expect(result[0]).toHaveProperty('job');
  });

  it('detects mutual recommendations', () => {
    const result = db.pattern()
      .start('personA', 'Person')
      .through('RECOMMENDS', 'out')
      .node('personB', 'Person')
      .through('RECOMMENDS', 'out')
      .end('personA')  // Cyclic
      .exec();

    // Every result should have A recommends B and B recommends A
    result.forEach(match => {
      expect(match.personA.id).toBeDefined();
      expect(match.personB.id).toBeDefined();
      expect(match.personA.id).not.toBe(match.personB.id);
    });
  });

  it('returns empty array when no matches', () => {
    const result = db.pattern()
      .start('person', 'NonExistentType')
      .through('KNOWS', 'out')
      .end('friend', 'Person')
      .exec();

    expect(result).toEqual([]);
  });
});
```

### Bulk Operations Scenarios

```typescript
describe('Bulk Operations', () => {
  it('creates 1000 nodes in <100ms', () => {
    const specs = Array.from({ length: 1000 }, (_, i) => ({
      type: 'Person',
      properties: { name: `Person ${i}` }
    }));

    const start = Date.now();
    const result = db.createNodes(specs);
    const elapsed = Date.now() - start;

    expect(result.created).toBe(1000);
    expect(result.ids.length).toBe(1000);
    expect(elapsed).toBeLessThan(100);
  });

  it('updates all matching nodes', () => {
    const result = db.updateNodes(
      'Job',
      { status: 'active' },
      { status: 'reviewed', reviewedAt: Date.now() }
    );

    expect(result.updated).toBeGreaterThan(0);

    // Verify updates
    const jobs = db.nodes('Job').where({ status: 'reviewed' }).exec();
    jobs.forEach(job => {
      expect(job.properties.reviewedAt).toBeDefined();
    });
  });

  it('rolls back on failure', () => {
    const beforeCount = db.nodes('Person').count();

    try {
      db.createNodes([
        { type: 'Person', properties: { name: 'Alice' } },
        { type: 'InvalidType', properties: {} },  // Invalid
      ]);
    } catch (err) {
      // Expected error
    }

    const afterCount = db.nodes('Person').count();
    expect(afterCount).toBe(beforeCount);  // No change
  });
});
```

---

## Implementation Roadmap

### Phase 3.1: Pattern Matching Core (Week 1)

- [ ] Implement `PatternQuery` class
- [ ] Implement `PatternNodeBuilder` class
- [ ] Basic SQL generation for 2-hop patterns
- [ ] Unit tests for core functionality
- [ ] Type definitions

### Phase 3.2: Pattern Matching Advanced (Week 2)

- [ ] Multi-hop pattern support (3-5 hops)
- [ ] Cyclic pattern detection
- [ ] Complex filtering (`$gt`, `$lt`, etc.)
- [ ] Query optimization (CTE generation)
- [ ] Performance benchmarks

### Phase 3.3: Bulk Operations (Week 3)

- [ ] `createNodes()` implementation
- [ ] `createEdges()` implementation
- [ ] `updateNodes()` and `updateEdges()`
- [ ] `deleteNodes()` and `deleteEdges()`
- [ ] Transaction management
- [ ] Error handling and rollback

### Phase 3.4: Integration & Polish (Week 4)

- [ ] Integrate into `GraphDatabase` class
- [ ] Documentation and examples
- [ ] Integration tests
- [ ] Performance tuning
- [ ] API refinement based on testing

### Phase 3.5: Advanced Features (Week 5)

- [ ] `upsertNodes()` implementation
- [ ] `explain()` query plan analysis
- [ ] Streaming large result sets
- [ ] Index recommendations
- [ ] Migration guide

---

## Appendix A: SQL Generation Examples

### Example 1: Simple 2-Hop Pattern

**Pattern:**
```typescript
db.pattern()
  .start('person', 'Person')
  .where({ person: { id: 1 } })
  .through('WORKS_AT', 'out')
  .end('company', 'Company')
```

**Generated SQL:**
```sql
WITH person_start AS (
  SELECT * FROM nodes
  WHERE type = 'Person' AND id = 1
),
works_at_edges AS (
  SELECT e.* FROM edges e
  JOIN person_start p ON e.from_id = p.id
  WHERE e.type = 'WORKS_AT'
),
company_end AS (
  SELECT n.* FROM nodes n
  JOIN works_at_edges e ON n.id = e.to_id
  WHERE n.type = 'Company'
)
SELECT
  person_start.id as person_id,
  person_start.type as person_type,
  person_start.properties as person_properties,
  company_end.id as company_id,
  company_end.type as company_type,
  company_end.properties as company_properties
FROM person_start
JOIN works_at_edges ON works_at_edges.from_id = person_start.id
JOIN company_end ON company_end.id = works_at_edges.to_id;
```

### Example 2: Cyclic Pattern

**Pattern:**
```typescript
db.pattern()
  .start('personA', 'Person')
  .through('RECOMMENDS', 'out')
  .node('personB', 'Person')
  .through('RECOMMENDS', 'out')
  .end('personA')  // Same variable
```

**Generated SQL:**
```sql
WITH person_a_start AS (
  SELECT * FROM nodes WHERE type = 'Person'
),
rec1_edges AS (
  SELECT e.* FROM edges e
  JOIN person_a_start a ON e.from_id = a.id
  WHERE e.type = 'RECOMMENDS'
),
person_b AS (
  SELECT n.* FROM nodes n
  JOIN rec1_edges e ON n.id = e.to_id
  WHERE n.type = 'Person'
),
rec2_edges AS (
  SELECT e.* FROM edges e
  JOIN person_b b ON e.from_id = b.id
  WHERE e.type = 'RECOMMENDS'
)
SELECT
  a.id as personA_id, a.properties as personA_properties,
  b.id as personB_id, b.properties as personB_properties
FROM person_a_start a
JOIN rec1_edges e1 ON e1.from_id = a.id
JOIN person_b b ON b.id = e1.to_id
JOIN rec2_edges e2 ON e2.from_id = b.id
WHERE e2.to_id = a.id  -- Cyclic constraint
  AND a.id < b.id;      -- Avoid duplicates (A,B) and (B,A)
```

---

## Appendix B: Comparison with Existing APIs

### Before Phase 3 (Imperative Traversal)

```typescript
// Find jobs at companies where friends work (imperative)
const me = db.getNode(1);
const friendEdges = db.traverse(me.id, 'KNOWS', 'both').exec();
const friendIds = friendEdges.map(e => e.to);

const jobs: GraphNode[] = [];
for (const friendId of friendIds) {
  const workEdges = db.traverse(friendId, 'WORKS_AT', 'out').exec();
  for (const workEdge of workEdges) {
    const companyId = workEdge.to;
    const jobEdges = db.traverse(companyId, 'POSTED_BY', 'in').exec();
    for (const jobEdge of jobEdges) {
      const job = db.getNode(jobEdge.from);
      if (job && job.type === 'Job') {
        jobs.push(job);
      }
    }
  }
}
```

### After Phase 3 (Declarative Pattern)

```typescript
// Same query, declarative
const results = db.pattern()
  .start('me', 'Person')
  .where({ me: { id: 1 } })
  .through('KNOWS', 'both')
  .node('friend', 'Person')
  .through('WORKS_AT', 'out')
  .node('company', 'Company')
  .through('POSTED_BY', 'in')
  .end('job', 'Job')
  .select(['job', 'company'])
  .exec();

// Results include full path context
results.forEach(({ job, company }) => {
  console.log(`${job.properties.title} at ${company.properties.name}`);
});
```

**Benefits:**
- 90% less code
- Declarative intent
- Optimized SQL generation
- Full path context in results
- Type-safe variable access

---

## Appendix C: Real-World Use Cases

### Use Case 1: Job Pipeline Management

```typescript
// Track application workflow
const myApplications = db.pattern()
  .start('me', 'Person')
  .where({ me: { id: userId } })
  .through('APPLIED_TO', 'out')
  .node('job', 'Job')
  .through('POSTED_BY', 'out')
  .end('company', 'Company')
  .where({ job: { status: { $in: ['applied', 'interviewing'] } } })
  .orderBy('job', 'appliedDate', 'desc')
  .exec();

// Bulk update after interview
const interviewed = db.updateNodes(
  'Job',
  { status: 'applied', id: { $in: interviewedJobIds } },
  { status: 'interviewing', interviewDate: Date.now() }
);
```

### Use Case 2: Social Network Analysis

```typescript
// Find mutual connections between two people
const mutualFriends = db.pattern()
  .start('alice', 'Person')
  .where({ alice: { id: aliceId } })
  .through('KNOWS', 'both')
  .node('mutual', 'Person')
  .through('KNOWS', 'both')
  .end('bob', 'Person')
  .where({ bob: { id: bobId } })
  .select(['mutual'])
  .exec();

// Import friend graph from external source
const people = db.createNodes(
  friendData.map(f => ({ type: 'Person', properties: f }))
);

const friendships = db.createEdges(
  connections.map(c => ({
    from: people.ids[c.fromIdx],
    type: 'KNOWS',
    to: people.ids[c.toIdx]
  }))
);
```

### Use Case 3: Recommendation Engine

```typescript
// Find jobs similar to ones you've liked
const recommendations = db.pattern()
  .start('me', 'Person')
  .where({ me: { id: userId } })
  .through('LIKED', 'out')
  .node('likedJob', 'Job')
  .through('SIMILAR_TO', 'both')
  .end('recommended', 'Job')
  .where({ recommended: { status: 'active' } })
  .orderBy('recommended', 'score', 'desc')
  .limit(20)
  .exec();
```

---

**END OF SPECIFICATION**
