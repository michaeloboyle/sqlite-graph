# Phase 3: Fluent Pattern Matching & Bulk Operations - Architecture

**Version:** 1.0.0
**Status:** Implementation-Ready Architecture
**Authors:** Michael O'Boyle, Claude Code
**Date:** 2025-11-14

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagrams](#architecture-diagrams)
3. [Component Architecture](#component-architecture)
4. [SQL Generation Strategy](#sql-generation-strategy)
5. [Type System Design](#type-system-design)
6. [Integration Points](#integration-points)
7. [Implementation Sequence](#implementation-sequence)
8. [Performance Optimizations](#performance-optimizations)

---

## System Overview

Phase 3 extends sqlite-graph with two major capabilities:

1. **Pattern Matching API** - Declarative multi-hop graph queries
2. **Bulk Operations API** - Efficient batch CRUD operations

Both maintain the existing fluent TypeScript API style and require zero schema changes.

### Design Constraints

- **No Breaking Changes**: All existing APIs remain functional
- **IP-Safe**: No Cypher-like syntax or external query language patterns
- **Performance-First**: Target >10,000 bulk ops/sec, <50ms for 2-hop patterns
- **Type-Safe**: Full TypeScript inference throughout

---

## Architecture Diagrams

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     GraphDatabase                           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  Existing  │  │   Phase 3  │  │   Phase 3  │           │
│  │    API     │  │  Pattern   │  │    Bulk    │           │
│  │            │  │  Matching  │  │Operations  │           │
│  │ createNode │  │  pattern() │  │createNodes │           │
│  │  getNode   │  │            │  │createEdges │           │
│  │  nodes()   │  │            │  │updateNodes │           │
│  │ traverse() │  │            │  │deleteNodes │           │
│  └────────────┘  └────────────┘  └────────────┘           │
└─────────────────────────────────────────────────────────────┘
         │                 │                  │
         │                 │                  │
         ▼                 ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ NodeQuery    │  │PatternQuery  │  │BulkProcessor │
│TraversalQuery│  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
         │                 │                  │
         └─────────────────┴──────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │  better-sqlite3 (WAL)  │
              │                        │
              │  ┌──────┐  ┌───────┐  │
              │  │nodes │  │ edges │  │
              │  └──────┘  └───────┘  │
              └────────────────────────┘
```

### PatternQuery Class Architecture

```
PatternQuery<T extends Record<string, GraphEntity>>
┌─────────────────────────────────────────────────────┐
│ State Management                                    │
│  - patternSteps: PatternStep[]                     │
│  - variables: Map<string, VariableInfo>            │
│  - filters: Map<string, PropertyFilter>            │
│  - selections: string[]                            │
│  - orderBy: { variable, field, direction }         │
│  - limit/offset: number                            │
├─────────────────────────────────────────────────────┤
│ Builder Methods                                     │
│  + start(name, type): PatternNodeBuilder<T>        │
│  + node(name, type): PatternNodeBuilder<T>         │
│  + end(name, type): PatternQuery<T>                │
│  + where(conditions): this                         │
│  + select(vars): this                              │
│  + limit(n): this                                  │
│  + offset(n): this                                 │
│  + orderBy(var, field, dir): this                  │
├─────────────────────────────────────────────────────┤
│ Execution Methods                                   │
│  + exec(): PatternMatch<T>[]                       │
│  + first(): PatternMatch<T> | null                 │
│  + count(): number                                 │
│  + explain(): QueryPlan                            │
├─────────────────────────────────────────────────────┤
│ Internal Methods                                    │
│  - buildSQL(): string                              │
│  - buildParams(): any[]                            │
│  - buildCTEs(): string[]                           │
│  - buildFinalSelect(): string                      │
│  - mapResults(rows): PatternMatch<T>[]             │
│  - detectCyclicPattern(): boolean                  │
│  - validatePattern(): void                         │
└─────────────────────────────────────────────────────┘
              │
              │ creates
              ▼
PatternNodeBuilder<T>
┌─────────────────────────────────────────────────────┐
│  + through(edgeType, direction): PatternQuery<T>   │
│  + where(filter): this                             │
└─────────────────────────────────────────────────────┘
```

### BulkOperations Module Architecture

```
BulkProcessor
┌─────────────────────────────────────────────────────┐
│ State                                               │
│  - db: Database.Database                           │
│  - batchSize: number                               │
├─────────────────────────────────────────────────────┤
│ Create Operations                                   │
│  + createNodes(specs): BulkCreateResult            │
│  + createEdges(specs): BulkCreateResult            │
├─────────────────────────────────────────────────────┤
│ Update Operations                                   │
│  + updateNodes(type, filter, updates): Result      │
│  + updateEdges(type, filter, updates): Result      │
├─────────────────────────────────────────────────────┤
│ Delete Operations                                   │
│  + deleteNodes(type, filter): BulkDeleteResult     │
│  + deleteEdges(type, filter): BulkDeleteResult     │
├─────────────────────────────────────────────────────┤
│ Upsert Operations                                   │
│  + upsertNodes(specs, matchOn): BulkUpsertResult   │
├─────────────────────────────────────────────────────┤
│ Internal Methods                                    │
│  - executeBatch<T>(fn, items): T[]                 │
│  - buildFilterSQL(type, filter): string            │
│  - validateSpecs(specs): void                      │
│  - prepareStatement(sql): Statement                │
└─────────────────────────────────────────────────────┘
```

---

## Component Architecture

### 1. PatternQuery Class (`src/query/PatternQuery.ts`)

#### Responsibilities

- Fluent API for building declarative graph patterns
- SQL generation from pattern steps
- Result mapping from SQL rows to pattern variables
- Pattern validation and error reporting

#### State Management

```typescript
class PatternQuery<T extends Record<string, GraphEntity>> {
  private db: Database.Database;

  // Pattern structure
  private patternSteps: PatternStep[] = [];
  private variables: Map<string, VariableInfo> = new Map();

  // Filters and constraints
  private filters: Map<string, PropertyFilter> = new Map();

  // Result control
  private selections?: string[];
  private limitValue?: number;
  private offsetValue?: number;
  private orderByClause?: { variable: string; field: string; direction: 'asc' | 'desc' };

  // Pattern metadata
  private isCyclic: boolean = false;
  private cyclicVariable?: string;
}

interface PatternStep {
  type: 'node' | 'edge';
  variableName?: string;  // For nodes
  nodeType?: string;      // For nodes
  edgeType?: string;      // For edges
  direction?: 'in' | 'out' | 'both';  // For edges
  isStart?: boolean;
  isEnd?: boolean;
}

interface VariableInfo {
  variableName: string;
  nodeType?: string;
  stepIndex: number;
  isCyclicReference?: boolean;
}
```

#### SQL Generation Flow

```
PatternQuery
    │
    ├─ buildSQL()
    │   │
    │   ├─ buildCTEs()
    │   │   │
    │   │   ├─ CTE 1: Start Node(s)
    │   │   │   SELECT * FROM nodes WHERE type = ? AND [filters]
    │   │   │
    │   │   ├─ CTE 2: First Edge Traversal
    │   │   │   SELECT e.* FROM edges e
    │   │   │   JOIN start_cte ON [direction-based join]
    │   │   │   WHERE e.type = ?
    │   │   │
    │   │   ├─ CTE 3: Intermediate Node(s)
    │   │   │   SELECT n.* FROM nodes n
    │   │   │   JOIN edge_cte ON n.id = e.[from_id|to_id]
    │   │   │   WHERE n.type = ?
    │   │   │
    │   │   └─ ... (repeat for each hop)
    │   │
    │   ├─ buildFinalSelect()
    │   │   SELECT
    │   │     var1.id as var1_id, var1.type as var1_type, ...
    │   │     var2.id as var2_id, var2.type as var2_type, ...
    │   │   FROM [CTEs joined together]
    │   │   WHERE [cyclic constraints if applicable]
    │   │   ORDER BY [orderBy clause]
    │   │   LIMIT ? OFFSET ?
    │   │
    │   └─ return complete SQL
    │
    ├─ buildParams()
    │   return [param1, param2, ...]
    │
    └─ exec()
        │
        ├─ Execute SQL with params
        ├─ mapResults(rows)
        │   └─ Transform SQL rows into PatternMatch objects
        └─ return PatternMatch<T>[]
```

#### Example SQL Generation

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
-- CTE 1: Start nodes
WITH person_start AS (
  SELECT id, type, properties, created_at, updated_at
  FROM nodes
  WHERE type = 'Person' AND id = ?
),

-- CTE 2: Edge traversal
works_at_edges AS (
  SELECT e.*
  FROM edges e
  JOIN person_start p ON e.from_id = p.id
  WHERE e.type = 'WORKS_AT'
),

-- CTE 3: End nodes
company_end AS (
  SELECT n.*
  FROM nodes n
  JOIN works_at_edges e ON n.id = e.to_id
  WHERE n.type = 'Company'
)

-- Final select
SELECT
  p.id as person_id,
  p.type as person_type,
  p.properties as person_properties,
  p.created_at as person_created_at,
  p.updated_at as person_updated_at,
  c.id as company_id,
  c.type as company_type,
  c.properties as company_properties,
  c.created_at as company_created_at,
  c.updated_at as company_updated_at
FROM person_start p
JOIN works_at_edges e ON e.from_id = p.id
JOIN company_end c ON c.id = e.to_id
```

**Parameters:** `[1]`

**Result Mapping:**
```typescript
{
  person: { id: 1, type: 'Person', properties: {...}, ... },
  company: { id: 10, type: 'Company', properties: {...}, ... },
  _meta: { pathLength: 1, executionTime: 23 }
}
```

### 2. PatternNodeBuilder Class (`src/query/PatternNodeBuilder.ts`)

#### Responsibilities

- Intermediate builder for adding constraints to nodes
- Transitions back to PatternQuery via `through()`

#### Structure

```typescript
class PatternNodeBuilder<T extends Record<string, GraphEntity>> {
  private query: PatternQuery<T>;
  private currentVariable: string;

  constructor(query: PatternQuery<T>, variableName: string) {
    this.query = query;
    this.currentVariable = variableName;
  }

  /**
   * Add property filter to current node
   */
  where(filter: PropertyFilter): this {
    this.query.addNodeFilter(this.currentVariable, filter);
    return this;
  }

  /**
   * Continue pattern with edge traversal
   */
  through(edgeType: string, direction: 'in' | 'out' | 'both'): PatternQuery<T> {
    this.query.addEdgeStep(edgeType, direction);
    return this.query;
  }
}
```

### 3. BulkProcessor Class (`src/bulk/BulkProcessor.ts`)

#### Responsibilities

- Atomic batch operations within transactions
- Prepared statement reuse for performance
- Input validation and error reporting
- Result counting and metrics

#### Implementation Strategy

```typescript
class BulkProcessor {
  private db: Database.Database;
  private batchSize: number;

  constructor(db: Database.Database, batchSize = 1000) {
    this.db = db;
    this.batchSize = batchSize;
  }

  /**
   * Create multiple nodes in a single transaction
   */
  createNodes(specs: NodeSpec[]): BulkCreateResult {
    const startTime = performance.now();
    const ids: number[] = [];

    // Validate all specs first
    this.validateNodeSpecs(specs);

    // Execute in transaction
    this.db.transaction(() => {
      const stmt = this.db.prepare(
        'INSERT INTO nodes (type, properties) VALUES (?, ?) RETURNING id'
      );

      for (const spec of specs) {
        const row = stmt.get(spec.type, serialize(spec.properties)) as any;
        ids.push(row.id);
      }
    })();

    const executionTime = performance.now() - startTime;

    return {
      created: ids.length,
      ids,
      executionTime
    };
  }

  /**
   * Create multiple edges in a single transaction
   */
  createEdges(specs: EdgeSpec[]): BulkCreateResult {
    const startTime = performance.now();
    const ids: number[] = [];

    // Validate all specs first
    this.validateEdgeSpecs(specs);

    // Execute in transaction
    this.db.transaction(() => {
      const stmt = this.db.prepare(
        'INSERT INTO edges (from_id, type, to_id, properties) VALUES (?, ?, ?, ?) RETURNING id'
      );

      for (const spec of specs) {
        const row = stmt.get(
          spec.from,
          spec.type,
          spec.to,
          spec.properties ? serialize(spec.properties) : null
        ) as any;
        ids.push(row.id);
      }
    })();

    const executionTime = performance.now() - startTime;

    return {
      created: ids.length,
      ids,
      executionTime
    };
  }

  /**
   * Update all nodes matching filter
   */
  updateNodes(
    type: string,
    filter: PropertyFilter,
    updates: Record<string, unknown>
  ): BulkUpdateResult {
    const startTime = performance.now();

    // Build WHERE clause
    const { sql: whereSql, params: whereParams } = this.buildFilterSQL(filter);

    // Build update SQL
    const updateSql = `
      UPDATE nodes
      SET properties = json_patch(properties, ?),
          updated_at = strftime('%s', 'now')
      WHERE type = ? AND ${whereSql}
    `;

    const stmt = this.db.prepare(updateSql);
    const info = stmt.run(serialize(updates), type, ...whereParams);

    const executionTime = performance.now() - startTime;

    return {
      updated: info.changes,
      executionTime
    };
  }

  /**
   * Delete all nodes matching filter (cascades edges)
   */
  deleteNodes(type: string, filter: PropertyFilter): BulkDeleteResult {
    const startTime = performance.now();

    const { sql: whereSql, params: whereParams } = this.buildFilterSQL(filter);

    const deleteSql = `
      DELETE FROM nodes
      WHERE type = ? AND ${whereSql}
    `;

    const stmt = this.db.prepare(deleteSql);
    const info = stmt.run(type, ...whereParams);

    const executionTime = performance.now() - startTime;

    return {
      deleted: info.changes,
      executionTime
    };
  }

  /**
   * Upsert nodes (update if exists, create if not)
   */
  upsertNodes(specs: NodeSpec[], matchOn: string[]): BulkUpsertResult {
    const startTime = performance.now();
    let created = 0;
    let updated = 0;
    const ids: number[] = [];

    this.db.transaction(() => {
      for (const spec of specs) {
        // Build match conditions
        const matchConditions = matchOn.map(
          key => `json_extract(properties, '$.${key}') = ?`
        ).join(' AND ');

        const matchValues = matchOn.map(key => (spec.properties as any)[key]);

        // Find existing node
        const findSql = `
          SELECT id, properties FROM nodes
          WHERE type = ? AND ${matchConditions}
        `;
        const findStmt = this.db.prepare(findSql);
        const existing = findStmt.get(spec.type, ...matchValues) as any;

        if (existing) {
          // Update
          const merged = { ...deserialize(existing.properties), ...spec.properties };
          const updateStmt = this.db.prepare(
            "UPDATE nodes SET properties = ?, updated_at = strftime('%s', 'now') WHERE id = ?"
          );
          updateStmt.run(serialize(merged), existing.id);
          ids.push(existing.id);
          updated++;
        } else {
          // Create
          const insertStmt = this.db.prepare(
            'INSERT INTO nodes (type, properties) VALUES (?, ?) RETURNING id'
          );
          const row = insertStmt.get(spec.type, serialize(spec.properties)) as any;
          ids.push(row.id);
          created++;
        }
      }
    })();

    const executionTime = performance.now() - startTime;

    return {
      created,
      updated,
      ids,
      executionTime
    };
  }

  /**
   * Build WHERE clause SQL from property filter
   */
  private buildFilterSQL(filter: PropertyFilter): { sql: string; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Operator-based filter
        for (const [op, val] of Object.entries(value)) {
          switch (op) {
            case '$gt':
              conditions.push(`json_extract(properties, '$.${key}') > ?`);
              params.push(val);
              break;
            case '$lt':
              conditions.push(`json_extract(properties, '$.${key}') < ?`);
              params.push(val);
              break;
            case '$gte':
              conditions.push(`json_extract(properties, '$.${key}') >= ?`);
              params.push(val);
              break;
            case '$lte':
              conditions.push(`json_extract(properties, '$.${key}') <= ?`);
              params.push(val);
              break;
            case '$ne':
              conditions.push(`json_extract(properties, '$.${key}') != ?`);
              params.push(val);
              break;
            case '$in':
              const placeholders = (val as any[]).map(() => '?').join(', ');
              conditions.push(`json_extract(properties, '$.${key}') IN (${placeholders})`);
              params.push(...(val as any[]));
              break;
          }
        }
      } else {
        // Exact match
        conditions.push(`json_extract(properties, '$.${key}') = ?`);
        params.push(value);
      }
    }

    return {
      sql: conditions.join(' AND '),
      params
    };
  }
}
```

---

## SQL Generation Strategy

### Pattern Matching SQL Generation

#### Strategy: CTE-Based Join Chain

**Why CTEs?**
- Clear separation of each pattern step
- Better query plan optimization by SQLite
- Easier to debug and maintain
- Supports complex multi-hop patterns

#### Join Direction Handling

| Direction | SQL Logic |
|-----------|-----------|
| `'out'` | `JOIN edges e ON e.from_id = current_node.id` |
| `'in'` | `JOIN edges e ON e.to_id = current_node.id` |
| `'both'` | `JOIN edges e ON (e.from_id = current_node.id OR e.to_id = current_node.id)` |

#### Cyclic Pattern Detection

When `end(varName)` references an existing variable:

```sql
-- Add constraint in final SELECT
WHERE end_node.id = start_node.id
  AND start_node.id < intermediate_node.id  -- Avoid duplicate (A,B) and (B,A)
```

#### Filter Application Strategy

**Push filters as early as possible:**

```sql
-- GOOD: Filter in node CTE
WITH person_start AS (
  SELECT * FROM nodes
  WHERE type = 'Person'
    AND json_extract(properties, '$.age') >= 18  -- Early filter
)

-- BAD: Filter in final SELECT
WITH person_start AS (
  SELECT * FROM nodes WHERE type = 'Person'
)
SELECT * FROM person_start
WHERE json_extract(properties, '$.age') >= 18  -- Late filter
```

### Bulk Operations SQL Strategy

#### Prepared Statement Reuse

```typescript
// Create once, reuse many times
const stmt = db.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');

db.transaction(() => {
  for (const spec of specs) {
    stmt.run(spec.type, serialize(spec.properties));
  }
})();
```

**Performance gain:** ~10x faster than rebuilding statement each iteration

#### Transaction Wrapping

All bulk operations MUST use transactions:

```typescript
db.transaction(() => {
  // All operations here
})();
```

**Benefits:**
- Atomicity (all-or-nothing)
- Performance (single fsync at commit)
- Consistency (intermediate states not visible)

#### Batch Size Optimization

For extremely large operations (>100K items), split into batches:

```typescript
const BATCH_SIZE = 10000;

for (let i = 0; i < specs.length; i += BATCH_SIZE) {
  const batch = specs.slice(i, i + BATCH_SIZE);

  db.transaction(() => {
    for (const spec of batch) {
      stmt.run(...);
    }
  })();
}
```

**Trade-off:** Multiple transactions vs single giant transaction

---

## Type System Design

### 1. Pattern Types (`src/types/pattern.ts`)

```typescript
/**
 * Base entity type for nodes and edges
 */
export interface GraphEntity {
  id: number;
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Graph node entity
 */
export interface GraphNode extends GraphEntity {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Graph edge entity
 */
export interface GraphEdge extends GraphEntity {
  from: number;
  to: number;
  createdAt: Date;
}

/**
 * Property filter for WHERE clauses
 */
export type PropertyFilter = {
  [key: string]: unknown | {
    $gt?: unknown;
    $gte?: unknown;
    $lt?: unknown;
    $lte?: unknown;
    $in?: unknown[];
    $ne?: unknown;
  };
};

/**
 * Pattern match result
 */
export interface PatternMatch<T extends Record<string, GraphEntity>> {
  // Variable bindings (e.g., { person: GraphNode, company: GraphNode })
  [K in keyof T]: T[K];

  // Metadata
  _meta: {
    pathLength: number;
    executionTime: number;
  };
}

/**
 * Query plan information
 */
export interface QueryPlan {
  sql: string;
  estimatedCost: number;
  joinOrder: string[];
  indexesUsed: string[];
}

/**
 * Error classes
 */
export class PatternError extends Error {
  constructor(message: string, public code: PatternErrorCode) {
    super(message);
    this.name = 'PatternError';
  }
}

export type PatternErrorCode =
  | 'INVALID_PATTERN'
  | 'UNDEFINED_VARIABLE'
  | 'CYCLIC_TYPE_MISMATCH'
  | 'INVALID_DIRECTION'
  | 'INVALID_FILTER';
```

### 2. Bulk Types (`src/types/bulk.ts`)

```typescript
/**
 * Node specification for bulk creation
 */
export interface NodeSpec {
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Edge specification for bulk creation
 */
export interface EdgeSpec {
  from: number;
  type: string;
  to: number;
  properties?: Record<string, unknown>;
}

/**
 * Bulk create result
 */
export interface BulkCreateResult {
  created: number;
  ids: number[];
  executionTime: number;
}

/**
 * Bulk update result
 */
export interface BulkUpdateResult {
  updated: number;
  executionTime: number;
}

/**
 * Bulk delete result
 */
export interface BulkDeleteResult {
  deleted: number;
  executionTime: number;
}

/**
 * Bulk upsert result
 */
export interface BulkUpsertResult {
  created: number;
  updated: number;
  ids: number[];
  executionTime: number;
}

/**
 * Error class
 */
export class BulkOperationError extends Error {
  constructor(
    message: string,
    public code: BulkErrorCode,
    public failedItems?: unknown[]
  ) {
    super(message);
    this.name = 'BulkOperationError';
  }
}

export type BulkErrorCode =
  | 'MISSING_NODE'
  | 'DUPLICATE_ID'
  | 'CONSTRAINT_VIOLATION'
  | 'TRANSACTION_FAILED'
  | 'INVALID_SPEC';
```

---

## Integration Points

### GraphDatabase Class Extensions

```typescript
// src/core/Database.ts

import { PatternQuery } from '../query/PatternQuery';
import { BulkProcessor } from '../bulk/BulkProcessor';
import {
  NodeSpec,
  EdgeSpec,
  BulkCreateResult,
  BulkUpdateResult,
  BulkDeleteResult,
  BulkUpsertResult,
  PropertyFilter
} from '../types/bulk';

export class GraphDatabase {
  // Existing methods
  createNode<T>(type: string, properties: T): Node<T>;
  getNode(id: number): Node | null;
  nodes(type: string): NodeQuery;
  traverse(startNodeId: number): TraversalQuery;
  // ... etc

  // NEW: Pattern matching entry point
  pattern(): PatternQuery<{}> {
    return new PatternQuery(this.db);
  }

  // NEW: Bulk operations
  private bulkProcessor: BulkProcessor;

  createNodes(specs: NodeSpec[]): BulkCreateResult {
    return this.bulkProcessor.createNodes(specs);
  }

  createEdges(specs: EdgeSpec[]): BulkCreateResult {
    return this.bulkProcessor.createEdges(specs);
  }

  updateNodes(
    type: string,
    filter: PropertyFilter,
    updates: Record<string, unknown>
  ): BulkUpdateResult {
    return this.bulkProcessor.updateNodes(type, filter, updates);
  }

  updateEdges(
    type: string,
    filter: PropertyFilter,
    updates: Record<string, unknown>
  ): BulkUpdateResult {
    return this.bulkProcessor.updateEdges(type, filter, updates);
  }

  deleteNodes(type: string, filter: PropertyFilter): BulkDeleteResult {
    return this.bulkProcessor.deleteNodes(type, filter);
  }

  deleteEdges(type: string, filter: PropertyFilter): BulkDeleteResult {
    return this.bulkProcessor.deleteEdges(type, filter);
  }

  upsertNodes(specs: NodeSpec[], matchOn: string[]): BulkUpsertResult {
    return this.bulkProcessor.upsertNodes(specs, matchOn);
  }
}
```

### Initialization in Constructor

```typescript
constructor(path: string, options?: DatabaseOptions) {
  this.db = new Database(path, options);
  this.schema = options?.schema;
  this.preparedStatements = new Map();

  // Initialize database schema
  initializeSchema(this.db);

  // Prepare common statements
  this.prepareStatements();

  // NEW: Initialize bulk processor
  this.bulkProcessor = new BulkProcessor(this.db);
}
```

---

## Implementation Sequence

### Phase 3.1: Type System & Foundations (Week 1, Days 1-2)

**Files to create:**
- `src/types/pattern.ts`
- `src/types/bulk.ts`

**Implementation:**
1. Define all TypeScript interfaces
2. Create error classes
3. Add exports to `src/types/index.ts`
4. Write type tests (compilation checks)

**Tests:**
- Type inference works correctly
- Error classes instantiate properly
- Generic constraints enforce correctly

**Deliverable:** Complete type system with zero compilation errors

---

### Phase 3.2: Pattern Query Core (Week 1, Days 3-5)

**Files to create:**
- `src/query/PatternQuery.ts`
- `src/query/PatternNodeBuilder.ts`
- `tests/query/pattern-query.test.ts`

**Implementation sequence:**

1. **PatternQuery skeleton** (Day 3)
   - Class structure
   - State management (patternSteps, variables, filters)
   - Method signatures (no implementation)

2. **Builder methods** (Day 3-4)
   - `start()`, `node()`, `end()`
   - `through()`
   - `where()`, `select()`, `limit()`, `offset()`, `orderBy()`
   - PatternNodeBuilder integration

3. **SQL generation** (Day 4-5)
   - `buildSQL()` - CTE construction
   - `buildParams()` - parameter ordering
   - Direction handling (out/in/both)
   - Filter application

4. **Execution** (Day 5)
   - `exec()` - run query
   - `first()` - single result
   - `count()` - count matches
   - Result mapping

**Tests (TDD approach):**
- Simple 2-hop pattern
- Multi-hop (3-5 hops)
- Cyclic pattern
- Bidirectional edges
- Complex filters
- Empty results

**Deliverable:** Working pattern query with comprehensive tests

---

### Phase 3.3: Bulk Operations (Week 2, Days 1-3)

**Files to create:**
- `src/bulk/BulkProcessor.ts`
- `tests/bulk/bulk-operations.test.ts`

**Implementation sequence:**

1. **BulkProcessor skeleton** (Day 1)
   - Class structure
   - Transaction wrapper
   - Statement preparation

2. **Create operations** (Day 1-2)
   - `createNodes()`
   - `createEdges()`
   - Validation helpers
   - Error handling

3. **Update/Delete operations** (Day 2)
   - `updateNodes()`, `updateEdges()`
   - `deleteNodes()`, `deleteEdges()`
   - `buildFilterSQL()` helper

4. **Upsert operation** (Day 3)
   - `upsertNodes()`
   - Match logic
   - Merge strategy

**Tests (TDD approach):**
- Bulk create 1000+ nodes
- Bulk create edges with validation
- Bulk update with filters
- Bulk delete with cascading
- Upsert (50% create, 50% update)
- Transaction rollback on error
- Performance benchmarks

**Deliverable:** Complete bulk operations module with tests

---

### Phase 3.4: Integration & Polish (Week 2, Days 4-5)

**Files to modify:**
- `src/core/Database.ts`
- `src/index.ts`

**Implementation:**

1. **GraphDatabase integration** (Day 4)
   - Add `pattern()` method
   - Add bulk operation methods
   - Initialize BulkProcessor in constructor
   - Update exports

2. **Integration tests** (Day 4-5)
   - Pattern + Bulk workflows
   - Existing API compatibility
   - Transaction interaction
   - Error propagation

3. **Documentation** (Day 5)
   - TSDoc comments
   - Usage examples
   - Migration guide

**Tests:**
- All existing tests pass
- Integration scenarios
- Backward compatibility

**Deliverable:** Fully integrated Phase 3 with passing test suite

---

### Phase 3.5: Advanced Features (Week 3)

**Optional enhancements:**

1. **Query optimization** (Days 1-2)
   - `explain()` implementation
   - Index recommendations
   - Query plan analysis

2. **Performance tuning** (Days 3-4)
   - Benchmark suite
   - Prepared statement caching
   - Batch size optimization

3. **Advanced patterns** (Day 5)
   - Variable-length paths helper
   - Path ranking
   - Streaming large results

**Deliverable:** Performance-optimized implementation with advanced features

---

## Performance Optimizations

### 1. Prepared Statement Caching

```typescript
// PatternQuery caches generated SQL
private statementCache: Map<string, Database.Statement> = new Map();

private getStatement(sql: string): Database.Statement {
  if (!this.statementCache.has(sql)) {
    this.statementCache.set(sql, this.db.prepare(sql));
  }
  return this.statementCache.get(sql)!;
}
```

### 2. Index Strategy

**Required indexes** (already exist):
```sql
CREATE INDEX idx_edges_from ON edges(from_id, type);
CREATE INDEX idx_edges_to ON edges(to_id, type);
CREATE INDEX idx_nodes_type ON nodes(type);
```

**Recommended for pattern matching:**
```sql
-- For complex property filters
CREATE INDEX idx_nodes_type_props ON nodes(
  type,
  json_extract(properties, '$.frequently_filtered_field')
);
```

### 3. CTE Optimization

SQLite optimizes CTEs by inlining where possible. Pattern queries benefit from:
- Filter pushdown (apply WHERE in CTEs, not final SELECT)
- Type filtering early (in node CTEs)
- Edge type filtering in join conditions

### 4. Bulk Operation Batching

For operations >10K items:

```typescript
const BATCH_SIZE = 10000;

for (let i = 0; i < specs.length; i += BATCH_SIZE) {
  const batch = specs.slice(i, i + BATCH_SIZE);
  this.createNodes(batch);  // Separate transaction per batch
}
```

### 5. WAL Mode for Concurrency

Enable Write-Ahead Logging:

```typescript
db.pragma('journal_mode = WAL');
```

**Benefits for bulk operations:**
- Readers don't block writers
- Better concurrency
- Faster commits

---

## File Structure Summary

```
src/
├── core/
│   ├── Database.ts              # MODIFIED: Add pattern() and bulk methods
│   ├── Schema.ts                # Unchanged
│   └── Transaction.ts           # Unchanged
│
├── query/
│   ├── NodeQuery.ts             # Unchanged
│   ├── TraversalQuery.ts        # Unchanged
│   ├── PatternQuery.ts          # NEW: Pattern matching implementation
│   └── PatternNodeBuilder.ts    # NEW: Node builder for patterns
│
├── bulk/
│   └── BulkProcessor.ts         # NEW: Bulk operations module
│
├── types/
│   ├── index.ts                 # MODIFIED: Export new types
│   ├── pattern.ts               # NEW: Pattern matching types
│   └── bulk.ts                  # NEW: Bulk operation types
│
├── utils/
│   ├── serialization.ts         # Unchanged
│   └── validation.ts            # Unchanged
│
└── index.ts                     # MODIFIED: Export new APIs

tests/
└── phase3/
    ├── pattern-query.test.ts    # NEW: Pattern matching tests
    ├── bulk-operations.test.ts  # NEW: Bulk operation tests
    ├── integration.test.ts      # NEW: Integration tests
    └── performance.test.ts      # NEW: Performance benchmarks
```

---

## Testing Strategy

### Unit Tests

**Pattern Query:**
- Builder method chaining
- SQL generation correctness
- Parameter ordering
- Result mapping
- Error handling

**Bulk Operations:**
- Create operations
- Update operations
- Delete operations
- Upsert logic
- Transaction behavior

### Integration Tests

- Pattern + Bulk workflows
- Existing API interaction
- Transaction nesting
- Error propagation

### Performance Tests

- 2-hop pattern <50ms (10K nodes)
- 4-hop pattern <200ms (10K nodes)
- Bulk create >10K nodes/sec
- Bulk create >15K edges/sec
- Bulk update >20K nodes/sec

### Edge Case Tests

- Empty patterns
- Single-node patterns
- Cyclic patterns
- Complex filters
- Large result sets
- Transaction failures

---

## Success Criteria

### Functional
- ✅ All pattern matching examples from spec work
- ✅ All bulk operation examples from spec work
- ✅ Existing API unchanged and functional
- ✅ Error handling comprehensive
- ✅ Type safety enforced

### Performance
- ✅ Meet all performance targets in spec
- ✅ No regression in existing API performance
- ✅ Bulk operations use transactions
- ✅ Prepared statements cached

### Quality
- ✅ 90%+ code coverage
- ✅ Zero TypeScript errors
- ✅ All tests pass
- ✅ Documentation complete

---

**END OF ARCHITECTURE DOCUMENT**
