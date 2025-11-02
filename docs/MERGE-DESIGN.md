# MERGE Operation Design

## Overview

This document specifies the design for Cypher-like MERGE operations in sqlite-graph, enabling idempotent graph operations similar to Neo4j's MERGE clause.

## Motivation

### Problems Solved

1. **Duplicate Prevention**: Prevent creating duplicate nodes/edges when running import scripts multiple times
2. **Idempotency**: Allow safe retry logic in distributed systems and ETL pipelines
3. **Upsert Pattern**: Simplify "create if missing, update if exists" logic
4. **Data Import**: Handle external data sources where existence is unknown

### Use Cases

```typescript
// Job scraping - run daily without duplicates
db.mergeNode('Job',
  { url: 'https://example.com/job/123' },  // Match on URL
  { title: 'Senior Engineer', status: 'active' },  // Create with these
  { lastSeen: Date.now() }  // Update on match
);

// Company deduplication
db.mergeNode('Company',
  { name: 'TechCorp' },  // Match criteria
  { name: 'TechCorp', founded: 2020 },  // ON CREATE
  { lastUpdated: Date.now() }  // ON MATCH
);

// Unique relationships
db.mergeEdge(jobId, 'POSTED_BY', companyId);  // Only create once
```

## API Design

### Node Merge

```typescript
interface MergeOptions<T extends NodeData = NodeData> {
  onCreate?: Partial<T>;  // Properties to set only on creation
  onMatch?: Partial<T>;   // Properties to set only on match
}

mergeNode<T extends NodeData = NodeData>(
  type: string,
  matchProperties: Partial<T>,
  baseProperties?: T,
  options?: MergeOptions<T>
): Node<T>
```

**Parameters:**
- `type`: Node type (e.g., 'Job', 'Company')
- `matchProperties`: Properties to match on (lookup criteria)
- `baseProperties`: Properties for creation (merged with matchProperties)
- `options.onCreate`: Additional properties set only on CREATE
- `options.onMatch`: Additional properties set only on MATCH

**Returns:** The matched or created node

**Behavior:**
1. Search for node matching `type` AND all `matchProperties`
2. If found (MATCH):
   - Merge `onMatch` properties with existing
   - Update `updated_at` timestamp
   - Return existing node
3. If not found (CREATE):
   - Merge `matchProperties`, `baseProperties`, and `onCreate`
   - Set `created_at` and `updated_at` timestamps
   - Return new node

### Edge Merge

```typescript
interface EdgeMergeOptions<T extends NodeData = NodeData> {
  onCreate?: Partial<T>;
  onMatch?: Partial<T>;
}

mergeEdge<T extends NodeData = NodeData>(
  from: number,
  type: string,
  to: number,
  properties?: T,
  options?: EdgeMergeOptions<T>
): Edge<T>
```

**Parameters:**
- `from`: Source node ID
- `type`: Edge type
- `to`: Target node ID
- `properties`: Base edge properties
- `options.onCreate`: Properties set only on creation
- `options.onMatch`: Properties set only on match

**Returns:** The matched or created edge

**Behavior:**
1. Search for edge matching `from`, `type`, AND `to`
2. If found: merge `onMatch` properties, return existing
3. If not found: create with `properties` + `onCreate`, return new

## Index Requirements

### Critical for Performance

MERGE operations REQUIRE indexes on match properties to avoid full table scans:

```typescript
// BEFORE using mergeNode with URL matching
db.createPropertyIndex('Job', 'url');  // Required!

// Then safe to merge
db.mergeNode('Job', { url: 'https://example.com/job/123' }, ...);
```

### Index Management API

```typescript
// Create JSON property index for fast lookups
createPropertyIndex(
  nodeType: string,
  property: string,
  unique?: boolean
): void

// List all custom indexes
listIndexes(): Array<{
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}>

// Drop a custom index
dropIndex(indexName: string): void
```

**Index Names:** Generated as `idx_merge_${nodeType}_${property}`

### Warning System

```typescript
// If no index exists, log warning:
console.warn(
  `⚠️  MERGE on Job.url without index. Performance will degrade on large datasets.
   Run: db.createPropertyIndex('Job', 'url') to fix.`
);
```

## Implementation Strategy

### SQL Approach: INSERT ... ON CONFLICT

SQLite 3.24+ supports `INSERT ... ON CONFLICT` which is atomic and efficient:

```sql
-- For nodes
INSERT INTO nodes (type, properties)
VALUES (?, ?)
ON CONFLICT(type, json_extract(properties, '$.url'))
DO UPDATE SET
  properties = json_patch(properties, ?),
  updated_at = strftime('%s', 'now')
RETURNING *;
```

**Challenge:** SQLite requires unique constraints/indexes on ON CONFLICT columns.

### Alternative: SELECT + INSERT in Transaction

More compatible approach using transactions:

```typescript
db.transaction(() => {
  // 1. Try to find existing
  const stmt = db.prepare(`
    SELECT * FROM nodes
    WHERE type = ?
    AND json_extract(properties, '$.url') = ?
    LIMIT 1
  `);
  const existing = stmt.get(type, matchProperties.url);

  if (existing) {
    // 2a. MATCH: Update with onMatch properties
    const merged = {
      ...deserialize(existing.properties),
      ...options?.onMatch
    };
    return updateNode(existing.id, merged);
  } else {
    // 2b. CREATE: Insert with onCreate properties
    const merged = {
      ...matchProperties,
      ...baseProperties,
      ...options?.onCreate
    };
    return createNode(type, merged);
  }
});
```

**Advantages:**
- Works without schema changes
- Uses existing transaction infrastructure
- Clear semantics

**Disadvantages:**
- Two queries (not atomic at SQL level)
- Requires manual transaction wrapper

## Schema Changes

### Option 1: Virtual Columns (Recommended)

Add generated columns for commonly merged properties:

```sql
-- Migration to support merge indexes
ALTER TABLE nodes ADD COLUMN url_generated TEXT
  GENERATED ALWAYS AS (json_extract(properties, '$.url')) VIRTUAL;

CREATE UNIQUE INDEX idx_merge_job_url
  ON nodes(type, url_generated)
  WHERE type = 'Job';
```

**Pros:** Fast, efficient, enforces uniqueness
**Cons:** Requires migration, schema complexity

### Option 2: JSON Indexes (Simpler)

Use SQLite's JSON expression indexes:

```sql
CREATE UNIQUE INDEX idx_merge_job_url
  ON nodes(type, json_extract(properties, '$.url'))
  WHERE type = 'Job';
```

**Pros:** No schema changes, flexible
**Cons:** May be slower than virtual columns

## Error Handling

### Merge Conflicts

```typescript
class MergeConflictError extends Error {
  constructor(
    public nodeType: string,
    public matchProperties: NodeData,
    public conflictingNodes: Node[]
  ) {
    super(
      `Multiple nodes match merge criteria for ${nodeType}: ` +
      `${JSON.stringify(matchProperties)}. Found ${conflictingNodes.length} matches. ` +
      `Ensure match properties uniquely identify nodes or add uniqueness constraints.`
    );
  }
}
```

**When thrown:** Multiple nodes match the merge criteria

**Resolution:**
- Add more specific match properties
- Create unique index/constraint
- Use `getNode()` to find and delete duplicates

### Missing Index Warning

```typescript
class MergePerformanceWarning extends Error {
  constructor(
    public nodeType: string,
    public property: string
  ) {
    super(
      `MERGE on ${nodeType}.${property} without index. ` +
      `This will cause full table scans. ` +
      `Create index with: db.createPropertyIndex('${nodeType}', '${property}')`
    );
  }
}
```

**When thrown:** Optional warning in development mode

## Type Definitions

```typescript
// Add to src/types/index.ts

export interface MergeOptions<T extends NodeData = NodeData> {
  onCreate?: Partial<T>;
  onMatch?: Partial<T>;
  warnOnMissingIndex?: boolean;  // Default: true in dev, false in prod
}

export interface EdgeMergeOptions<T extends NodeData = NodeData> {
  onCreate?: Partial<T>;
  onMatch?: Partial<T>;
}

export interface IndexInfo {
  name: string;
  table: 'nodes' | 'edges';
  columns: string[];
  unique: boolean;
  partial?: string;  // WHERE clause for partial indexes
}

export class MergeConflictError extends Error {
  constructor(
    public nodeType: string,
    public matchProperties: NodeData,
    public conflictingNodes: Node[]
  );
}

export class MergePerformanceWarning extends Error {
  constructor(
    public nodeType: string,
    public property: string
  );
}
```

## Examples

### Basic Merge

```typescript
// Simple upsert
const company = db.mergeNode('Company',
  { name: 'TechCorp' },
  { name: 'TechCorp', industry: 'Software' }
);
```

### WITH ON CREATE / ON MATCH

```typescript
// Track creation vs update timestamps
const job = db.mergeNode('Job',
  { url: 'https://example.com/job/123' },  // Match on URL
  {
    url: 'https://example.com/job/123',
    title: 'Senior Engineer',
    status: 'active'
  },
  {
    onCreate: {
      discovered: new Date(),
      applicationStatus: 'not_applied'
    },
    onMatch: {
      lastSeen: new Date(),
      scrapedCount: db.getRawDb()
        .prepare('SELECT json_extract(properties, "$.scrapedCount") + 1 FROM nodes WHERE id = ?')
    }
  }
);
```

### Relationship Merge

```typescript
// Ensure unique relationship
db.mergeEdge(
  job.id,
  'POSTED_BY',
  company.id,
  { source: 'scraper' },
  {
    onCreate: { firstSeen: Date.now() },
    onMatch: { lastVerified: Date.now() }
  }
);
```

### Bulk Import with Merge

```typescript
// Safe daily job import
db.transaction(() => {
  for (const jobData of externalJobList) {
    const company = db.mergeNode('Company',
      { name: jobData.companyName },
      { name: jobData.companyName, url: jobData.companyUrl }
    );

    const job = db.mergeNode('Job',
      { url: jobData.url },
      {
        url: jobData.url,
        title: jobData.title,
        description: jobData.description
      },
      {
        onCreate: { discovered: Date.now() },
        onMatch: { lastSeen: Date.now() }
      }
    );

    db.mergeEdge(job.id, 'POSTED_BY', company.id);
  }
});
```

## Testing Requirements

### Unit Tests

- [x] mergeNode creates when not exists
- [x] mergeNode matches when exists
- [x] mergeNode applies onCreate only on create
- [x] mergeNode applies onMatch only on match
- [x] mergeNode throws on multiple matches
- [x] mergeNode warns on missing index
- [x] mergeEdge creates when not exists
- [x] mergeEdge matches when exists
- [x] mergeEdge applies onCreate/onMatch
- [x] createPropertyIndex creates JSON index
- [x] createPropertyIndex creates unique index
- [x] listIndexes returns all custom indexes
- [x] dropIndex removes custom index

### Integration Tests

- [x] Bulk import with merge (idempotent)
- [x] Concurrent merge operations
- [x] Performance with/without indexes
- [x] Complex match criteria (multiple properties)
- [x] Schema validation with merge

### Performance Tests

- [x] Merge with index vs without (100k nodes)
- [x] Bulk merge operations (10k+ records)
- [x] Compare to manual transaction pattern

## Migration Guide

### For Existing Users

```typescript
// Before (manual pattern)
const existing = db.nodes('Company').where({ name }).limit(1).exec()[0];
const company = existing
  ? db.updateNode(existing.id, data)
  : db.createNode('Company', { name, ...data });

// After (merge)
const company = db.mergeNode('Company', { name }, { name, ...data });
```

### Breaking Changes

None - MERGE is additive feature.

### Deprecation Plan

Consider deprecating manual upsert pattern in favor of merge in documentation.

## Future Enhancements

1. **Multi-property Merge**: Composite match criteria
   ```typescript
   db.mergeNode('Job', { url, companyId }, ...)
   ```

2. **Pattern Merge**: Full graph pattern matching
   ```typescript
   db.mergePattern([
     { type: 'Job', match: { url }, ... },
     { type: 'Company', match: { name }, ... },
     { edge: 'POSTED_BY', from: 0, to: 1 }
   ])
   ```

3. **Conditional Merge**: Only merge if condition met
   ```typescript
   db.mergeNode('Job', { url }, data, {
     condition: { status: 'active' }
   })
   ```

4. **Batch Merge**: Optimize bulk operations
   ```typescript
   db.bulkMergeNodes('Job', jobList, { matchOn: 'url' })
   ```

## References

- Neo4j MERGE: https://neo4j.com/docs/cypher-manual/current/clauses/merge/
- SQLite INSERT ON CONFLICT: https://www.sqlite.org/lang_UPSERT.html
- SQLite JSON Functions: https://www.sqlite.org/json1.html