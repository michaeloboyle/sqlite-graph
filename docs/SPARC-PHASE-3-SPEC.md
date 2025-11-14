# SPARC Phase 3 Specification: Pattern Matching & Bulk Operations

**Project**: sqlite-graph
**Version**: 2.0.0
**Phase**: 3 (Final)
**Status**: Specification
**Authors**: Michael O'Boyle, Claude Code
**Date**: 2025-01-14

---

## Executive Summary

Phase 3 completes sqlite-graph by adding two critical enterprise features:
1. **Pattern Matching**: Cypher-like declarative graph queries
2. **Bulk Operations**: High-performance batch processing

These features enable complex graph queries and efficient data loading for production use cases.

---

## Table of Contents

1. [Requirements Analysis](#requirements-analysis)
2. [Pattern Matching Specification](#pattern-matching-specification)
3. [Bulk Operations Specification](#bulk-operations-specification)
4. [API Design](#api-design)
5. [Implementation Constraints](#implementation-constraints)
6. [Success Criteria](#success-criteria)
7. [Testing Strategy](#testing-strategy)
8. [Performance Requirements](#performance-requirements)

---

## Requirements Analysis

### Functional Requirements

#### FR-3.1: Pattern Matching
- **FR-3.1.1**: Support node patterns: `(variable:Type {property: value})`
- **FR-3.1.2**: Support relationship patterns: `-[variable:TYPE]->`, `<-[:TYPE]-`, `-[:TYPE]-`
- **FR-3.1.3**: Support path patterns: `(a)-[:KNOWS]->(b)-[:WORKS_AT]->(c)`
- **FR-3.1.4**: Support WHERE clause for filtering matched patterns
- **FR-3.1.5**: Support RETURN clause for selecting matched variables
- **FR-3.1.6**: Support variable-length paths: `-[:KNOWS*1..3]->`
- **FR-3.1.7**: Support optional pattern matching
- **FR-3.1.8**: Return matched nodes, edges, and paths as structured results

#### FR-3.2: Bulk Operations
- **FR-3.2.1**: Batch node creation (`createNodes`)
- **FR-3.2.2**: Batch edge creation (`createEdges`)
- **FR-3.2.3**: Batch node updates (`updateNodes`)
- **FR-3.2.4**: Batch edge updates (`updateEdges`)
- **FR-3.2.5**: Batch node deletion (`deleteNodes`)
- **FR-3.2.6**: Batch edge deletion (`deleteEdges`)
- **FR-3.2.7**: Automatic transaction wrapping for atomic operations
- **FR-3.2.8**: Return detailed results with created/updated IDs

### Non-Functional Requirements

#### NFR-3.1: Performance
- **NFR-3.1.1**: Pattern matching queries execute in <100ms for graphs with <10k nodes
- **NFR-3.1.2**: Bulk operations process 10k+ records/second
- **NFR-3.1.3**: Memory usage remains O(n) for bulk operations
- **NFR-3.1.4**: Pattern matching uses optimized SQL with proper indexes

#### NFR-3.2: Reliability
- **NFR-3.2.1**: All bulk operations are atomic (rollback on any error)
- **NFR-3.2.2**: Pattern matching handles malformed queries gracefully
- **NFR-3.2.3**: Input validation for all bulk operation arrays
- **NFR-3.2.4**: Clear error messages with context (which record failed)

#### NFR-3.3: Usability
- **NFR-3.3.1**: Pattern syntax matches Cypher subset (familiar to graph DB users)
- **NFR-3.3.2**: TypeScript type safety for all APIs
- **NFR-3.3.3**: Fluent API design consistent with existing query builders
- **NFR-3.3.4**: Comprehensive documentation with examples

---

## Pattern Matching Specification

### Overview

Pattern matching enables declarative graph queries using a Cypher-inspired syntax. Users describe the graph structure they want to find, and the system returns all matching subgraphs.

### Pattern Syntax

#### Node Patterns

```typescript
// Basic node pattern
(n)                           // Any node
(n:Job)                       // Node with type 'Job'
(n:Job {status: 'active'})    // Node with type and property filter
(:Job {status: 'active'})     // Node without variable binding
```

#### Relationship Patterns

```typescript
// Directed relationships
-[r:POSTED_BY]->              // Outgoing edge with type
<-[r:POSTED_BY]-              // Incoming edge with type
-[:POSTED_BY]->               // Edge without variable

// Undirected relationships
-[r:KNOWS]-                   // Either direction

// Variable-length paths
-[:KNOWS*1..3]->              // 1 to 3 hops
-[:KNOWS*]->                  // Unlimited hops (dangerous!)
-[:KNOWS*..3]->               // Up to 3 hops
```

#### Path Patterns

```typescript
// Simple path
(j:Job)-[:POSTED_BY]->(c:Company)

// Multi-hop path
(j:Job)-[:POSTED_BY]->(c:Company)-[:LOCATED_IN]->(city:Location)

// Mixed directions
(a:Person)-[:KNOWS]->(b:Person)<-[:KNOWS]-(c:Person)

// Variable-length paths
(a:Person)-[:KNOWS*1..3]->(b:Person)
```

### MATCH Query API

#### Basic Structure

```typescript
interface MatchQuery {
  // Build pattern
  match(pattern: string): this;

  // Add WHERE filters
  where(conditions: PatternConditions): this;

  // Optional matching (may return null)
  optionalMatch(pattern: string): this;

  // Return specific variables
  return(variables: string[]): this;

  // Execute query
  exec<T = PatternResult>(): T[];
}

interface PatternResult {
  [variable: string]: Node | Edge | Path | null;
}

interface Path {
  nodes: Node[];
  edges: Edge[];
  length: number;
}

interface PatternConditions {
  [variable: string]: {
    [property: string]: any;
  };
}
```

#### Usage Examples

```typescript
// Find jobs posted by TechCorp
const results = db.match('(j:Job)-[:POSTED_BY]->(c:Company)')
  .where({ c: { name: 'TechCorp' } })
  .return(['j', 'c'])
  .exec();
// Returns: [{ j: Node, c: Node }, ...]

// Find friends of friends
const friends = db.match('(a:Person)-[:KNOWS]->(b:Person)-[:KNOWS]->(c:Person)')
  .where({ a: { id: userId } })
  .return(['c'])
  .exec();
// Returns: [{ c: Node }, ...]

// Optional pattern (may not match)
const withOptional = db.match('(j:Job)')
  .optionalMatch('(j)-[:POSTED_BY]->(c:Company)')
  .return(['j', 'c'])
  .exec();
// Returns: [{ j: Node, c: Node | null }, ...]

// Variable-length paths
const connections = db.match('(a:Person)-[path:KNOWS*1..3]->(b:Person)')
  .where({ a: { name: 'Alice' }, b: { name: 'Bob' } })
  .return(['path'])
  .exec();
// Returns: [{ path: Path }, ...]
```

### Pattern Parser

```typescript
interface PatternParser {
  parse(pattern: string): ParsedPattern;
}

interface ParsedPattern {
  nodes: NodePattern[];
  edges: EdgePattern[];
  paths: PathPattern[];
}

interface NodePattern {
  variable?: string;
  type?: string;
  properties?: Record<string, any>;
}

interface EdgePattern {
  variable?: string;
  type?: string;
  direction: 'out' | 'in' | 'both';
  minHops?: number;
  maxHops?: number;
}

interface PathPattern {
  start: NodePattern;
  edges: EdgePattern[];
  intermediate: NodePattern[];
  end: NodePattern;
}
```

### SQL Query Generation

Pattern matching queries compile to optimized SQL:

```typescript
// Pattern: (j:Job)-[:POSTED_BY]->(c:Company)
// WHERE: c.name = 'TechCorp'

// Generated SQL:
SELECT
  j.id as j_id, j.type as j_type, j.properties as j_properties,
  c.id as c_id, c.type as c_type, c.properties as c_properties,
  e.id as e_id, e.type as e_type
FROM nodes j
JOIN edges e ON e.from_id = j.id
JOIN nodes c ON e.to_id = c.id
WHERE j.type = 'Job'
  AND e.type = 'POSTED_BY'
  AND c.type = 'Company'
  AND json_extract(c.properties, '$.name') = 'TechCorp'
```

### Error Handling

```typescript
class PatternSyntaxError extends Error {
  constructor(
    message: string,
    public pattern: string,
    public position: number
  ) {
    super(message);
  }
}

class PatternValidationError extends Error {
  constructor(
    message: string,
    public issues: string[]
  ) {
    super(message);
  }
}

// Examples:
// PatternSyntaxError: "Expected '>' after edge type at position 23"
// PatternValidationError: "Node type 'InvalidType' not in schema"
```

---

## Bulk Operations Specification

### Overview

Bulk operations enable efficient batch processing of nodes and edges with automatic transaction management and prepared statement optimization.

### Bulk Node Operations

#### createNodes

```typescript
interface BulkNodeInput<T extends NodeData = NodeData> {
  type: string;
  properties: T;
}

interface BulkNodeResult<T extends NodeData = NodeData> {
  created: Node<T>[];
  errors: BulkOperationError[];
  stats: {
    total: number;
    successful: number;
    failed: number;
    durationMs: number;
  };
}

createNodes<T extends NodeData = NodeData>(
  nodes: BulkNodeInput<T>[]
): BulkNodeResult<T>
```

**Example:**

```typescript
const result = db.createNodes([
  { type: 'Job', properties: { title: 'Engineer 1', status: 'active' } },
  { type: 'Job', properties: { title: 'Engineer 2', status: 'active' } },
  { type: 'Company', properties: { name: 'TechCorp' } }
]);

// result.created: Array of created nodes with IDs
// result.stats: { total: 3, successful: 3, failed: 0, durationMs: 45 }
```

#### updateNodes

```typescript
interface BulkNodeUpdate {
  id: number;
  properties: Partial<NodeData>;
}

interface BulkUpdateResult {
  updated: Node[];
  notFound: number[];
  errors: BulkOperationError[];
  stats: {
    total: number;
    successful: number;
    failed: number;
    durationMs: number;
  };
}

updateNodes(updates: BulkNodeUpdate[]): BulkUpdateResult
```

**Example:**

```typescript
const result = db.updateNodes([
  { id: 1, properties: { status: 'applied' } },
  { id: 2, properties: { status: 'rejected' } },
  { id: 3, properties: { status: 'interviewing' } }
]);

// result.updated: Array of updated nodes
// result.notFound: [3] (if node 3 doesn't exist)
```

#### deleteNodes

```typescript
interface BulkDeleteResult {
  deleted: number[];
  notFound: number[];
  errors: BulkOperationError[];
  stats: {
    total: number;
    successful: number;
    failed: number;
    durationMs: number;
  };
}

deleteNodes(ids: number[]): BulkDeleteResult
```

**Example:**

```typescript
const result = db.deleteNodes([1, 2, 3, 4, 5]);

// result.deleted: [1, 2, 4, 5]
// result.notFound: [3]
// Cascade deletes all edges connected to deleted nodes
```

### Bulk Edge Operations

#### createEdges

```typescript
interface BulkEdgeInput<T extends NodeData = NodeData> {
  from: number;
  type: string;
  to: number;
  properties?: T;
}

interface BulkEdgeResult<T extends NodeData = NodeData> {
  created: Edge<T>[];
  errors: BulkOperationError[];
  stats: {
    total: number;
    successful: number;
    failed: number;
    durationMs: number;
  };
}

createEdges<T extends NodeData = NodeData>(
  edges: BulkEdgeInput<T>[]
): BulkEdgeResult<T>
```

**Example:**

```typescript
const result = db.createEdges([
  { from: 1, type: 'POSTED_BY', to: 10 },
  { from: 2, type: 'POSTED_BY', to: 10 },
  { from: 3, type: 'REQUIRES', to: 20, properties: { level: 'expert' } }
]);

// result.created: Array of created edges with IDs
```

#### updateEdges

```typescript
interface BulkEdgeUpdate {
  id: number;
  properties: Partial<NodeData>;
}

updateEdges(updates: BulkEdgeUpdate[]): BulkUpdateResult
```

#### deleteEdges

```typescript
deleteEdges(ids: number[]): BulkDeleteResult
```

### Transaction Management

All bulk operations automatically wrap operations in transactions:

```typescript
// Automatic transaction wrapping
db.createNodes([...1000 nodes...]);
// Internally: BEGIN -> INSERT x1000 -> COMMIT
// On error: ROLLBACK (no partial inserts)

// Manual transaction control (advanced)
db.transaction(() => {
  const nodes = db.createNodes([...]);
  const edges = db.createEdges([...]);
  // Both succeed or both rollback
});
```

### Performance Optimization

#### Prepared Statement Reuse

```typescript
// Single prepared statement, multiple executions
const stmt = db.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');

for (const node of nodes) {
  stmt.run(node.type, serialize(node.properties));
}
```

#### Batch Insert

```typescript
// Use SQLite's compound INSERT for better performance
INSERT INTO nodes (type, properties) VALUES
  ('Job', '{"title": "Engineer 1"}'),
  ('Job', '{"title": "Engineer 2"}'),
  ('Job', '{"title": "Engineer 3"}')
```

#### Memory Management

```typescript
// Process large batches in chunks to avoid memory issues
const CHUNK_SIZE = 1000;

function createNodesChunked(nodes: BulkNodeInput[]): BulkNodeResult {
  const results: Node[] = [];

  for (let i = 0; i < nodes.length; i += CHUNK_SIZE) {
    const chunk = nodes.slice(i, i + CHUNK_SIZE);
    const chunkResult = createNodesChunk(chunk);
    results.push(...chunkResult.created);
  }

  return { created: results, ... };
}
```

### Error Handling

```typescript
interface BulkOperationError {
  index: number;
  input: any;
  error: string;
  code?: string;
}

// Example error result
{
  created: [node1, node2],
  errors: [
    {
      index: 2,
      input: { type: 'InvalidType', properties: {} },
      error: 'Node type "InvalidType" not in schema',
      code: 'SCHEMA_VALIDATION_ERROR'
    }
  ],
  stats: { total: 3, successful: 2, failed: 1, durationMs: 12 }
}
```

#### Error Modes

```typescript
enum BulkErrorMode {
  FAIL_FAST = 'fail_fast',        // Stop on first error, rollback all
  CONTINUE = 'continue',            // Skip errors, commit successful
  COLLECT = 'collect'               // Collect all errors, rollback all
}

createNodes(nodes: BulkNodeInput[], options?: {
  errorMode?: BulkErrorMode;
}): BulkNodeResult
```

---

## API Design

### Integration with GraphDatabase

```typescript
export class GraphDatabase {
  // ... existing methods ...

  // Pattern matching
  match(pattern: string): MatchQuery;

  // Bulk operations - nodes
  createNodes<T extends NodeData = NodeData>(
    nodes: BulkNodeInput<T>[],
    options?: BulkOptions
  ): BulkNodeResult<T>;

  updateNodes(
    updates: BulkNodeUpdate[],
    options?: BulkOptions
  ): BulkUpdateResult;

  deleteNodes(
    ids: number[],
    options?: BulkOptions
  ): BulkDeleteResult;

  // Bulk operations - edges
  createEdges<T extends NodeData = NodeData>(
    edges: BulkEdgeInput<T>[],
    options?: BulkOptions
  ): BulkEdgeResult<T>;

  updateEdges(
    updates: BulkEdgeUpdate[],
    options?: BulkOptions
  ): BulkUpdateResult;

  deleteEdges(
    ids: number[],
    options?: BulkOptions
  ): BulkDeleteResult;
}
```

### Type Exports

```typescript
// Add to src/types/index.ts
export {
  MatchQuery,
  PatternResult,
  PatternConditions,
  Path,
  BulkNodeInput,
  BulkEdgeInput,
  BulkNodeResult,
  BulkEdgeResult,
  BulkUpdateResult,
  BulkDeleteResult,
  BulkOperationError,
  BulkOptions,
  BulkErrorMode
} from './pattern';

export {
  PatternSyntaxError,
  PatternValidationError
} from './errors';
```

---

## Implementation Constraints

### Phase 3A: Pattern Matching

1. **Parser Implementation**
   - Use regex-based parser for pattern syntax
   - Validate against schema if defined
   - Generate AST for query planning

2. **Query Compiler**
   - Translate patterns to SQL JOINs
   - Optimize for common cases (simple paths)
   - Use CTEs for variable-length paths

3. **Result Mapper**
   - Map SQL rows back to typed results
   - Handle optional matches (null values)
   - Deserialize JSON properties

### Phase 3B: Bulk Operations

1. **Prepared Statements**
   - Reuse prepared statements for batches
   - Use compound INSERT when possible
   - Validate all inputs before execution

2. **Transaction Strategy**
   - Default: Single transaction per bulk operation
   - Optional: Chunked transactions for large batches
   - Error modes: fail-fast, continue, collect

3. **Performance Monitoring**
   - Track operation duration
   - Report stats (records/second)
   - Memory profiling for large batches

---

## Success Criteria

### Pattern Matching

- [ ] Parse and execute node patterns
- [ ] Parse and execute relationship patterns
- [ ] Parse and execute path patterns
- [ ] Support WHERE clause filtering
- [ ] Support RETURN clause variable selection
- [ ] Support optional pattern matching
- [ ] Support variable-length paths (*1..3)
- [ ] Type-safe TypeScript API
- [ ] 90%+ test coverage
- [ ] Documentation with 10+ examples

### Bulk Operations

- [ ] createNodes processes 10k+ nodes/second
- [ ] createEdges processes 10k+ edges/second
- [ ] updateNodes, updateEdges work correctly
- [ ] deleteNodes, deleteEdges cascade properly
- [ ] All operations atomic (transaction wrapped)
- [ ] Error handling with detailed results
- [ ] Memory-safe for 100k+ record batches
- [ ] Type-safe TypeScript API
- [ ] 90%+ test coverage
- [ ] Performance benchmarks documented

---

## Testing Strategy

### Unit Tests

#### Pattern Matching

```typescript
describe('MatchQuery', () => {
  describe('Node patterns', () => {
    it('should match nodes by type');
    it('should match nodes by properties');
    it('should match nodes with variable binding');
    it('should match anonymous nodes');
  });

  describe('Relationship patterns', () => {
    it('should match outgoing edges');
    it('should match incoming edges');
    it('should match undirected edges');
    it('should match edges with properties');
  });

  describe('Path patterns', () => {
    it('should match simple paths');
    it('should match multi-hop paths');
    it('should match variable-length paths');
    it('should match optional patterns');
  });

  describe('WHERE clause', () => {
    it('should filter by node properties');
    it('should filter by edge properties');
    it('should combine multiple conditions');
  });

  describe('RETURN clause', () => {
    it('should return specified variables');
    it('should return paths');
    it('should handle null in optional matches');
  });
});
```

#### Bulk Operations

```typescript
describe('Bulk Operations', () => {
  describe('createNodes', () => {
    it('should create multiple nodes in transaction');
    it('should rollback on error in fail-fast mode');
    it('should continue on error in continue mode');
    it('should return detailed stats');
    it('should handle 10k+ nodes efficiently');
  });

  describe('createEdges', () => {
    it('should create multiple edges in transaction');
    it('should validate from/to nodes exist');
    it('should handle properties correctly');
  });

  describe('updateNodes', () => {
    it('should update multiple nodes');
    it('should report not found IDs');
    it('should merge properties correctly');
  });

  describe('deleteNodes', () => {
    it('should delete multiple nodes');
    it('should cascade delete edges');
    it('should report not found IDs');
  });
});
```

### Integration Tests

```typescript
describe('Pattern Matching Integration', () => {
  it('should execute complex job search query', () => {
    // (j:Job)-[:POSTED_BY]->(c:Company)-[:LOCATED_IN]->(city:Location)
    // WHERE city.name = 'San Francisco'
  });

  it('should find social network connections', () => {
    // (a:Person)-[:KNOWS*1..3]->(b:Person)
  });

  it('should handle optional patterns', () => {
    // MATCH (j:Job) OPTIONAL MATCH (j)-[:POSTED_BY]->(c:Company)
  });
});

describe('Bulk Operations Integration', () => {
  it('should import large graph dataset', () => {
    // 10k nodes + 50k edges
  });

  it('should update job statuses in batch', () => {
    // 1000 job status updates
  });
});
```

### Performance Tests

```typescript
describe('Performance', () => {
  it('should match patterns in <100ms for 10k node graph');
  it('should create 10k nodes in <1s');
  it('should create 50k edges in <5s');
  it('should update 10k nodes in <1s');
  it('should handle variable-length paths efficiently');
});
```

---

## Performance Requirements

### Pattern Matching

| Graph Size | Pattern Type | Target Latency |
|------------|--------------|----------------|
| 1k nodes   | Simple path  | <10ms          |
| 10k nodes  | Simple path  | <100ms         |
| 10k nodes  | 3-hop path   | <500ms         |
| 10k nodes  | Variable-length (1..3) | <1s   |

### Bulk Operations

| Operation    | Records | Target Throughput | Target Latency |
|--------------|---------|-------------------|----------------|
| createNodes  | 10k     | 10k/s             | <1s            |
| createEdges  | 50k     | 10k/s             | <5s            |
| updateNodes  | 10k     | 10k/s             | <1s            |
| deleteNodes  | 10k     | 10k/s             | <1s            |

### Memory Usage

- Pattern matching: O(n) where n = result set size
- Bulk operations: O(b) where b = batch size
- Maximum memory per operation: 100MB
- Streaming results for large pattern matches (future enhancement)

---

## Edge Cases

### Pattern Matching

1. **Malformed Patterns**
   ```typescript
   db.match('(a:Job-[:POSTED_BY')->(c:Company)'); // Missing ]
   // Throws: PatternSyntaxError at position 12
   ```

2. **Circular Patterns**
   ```typescript
   db.match('(a:Person)-[:KNOWS]->(b:Person)-[:KNOWS]->(a)');
   // Should match cycles in graph
   ```

3. **Empty Results**
   ```typescript
   db.match('(j:Job)-[:POSTED_BY]->(c:Company)')
     .where({ c: { name: 'NonExistent' } })
     .exec();
   // Returns: []
   ```

4. **Variable-Length Path Limits**
   ```typescript
   db.match('(a)-[:KNOWS*]->(b)'); // Unbounded
   // Should throw: "Variable-length paths must have max depth"
   ```

### Bulk Operations

1. **Empty Arrays**
   ```typescript
   db.createNodes([]); // Empty input
   // Returns: { created: [], errors: [], stats: { total: 0, ... } }
   ```

2. **Partial Failures**
   ```typescript
   db.createNodes([
     { type: 'Job', properties: { title: 'Valid' } },
     { type: '', properties: {} }, // Invalid type
     { type: 'Job', properties: { title: 'Also Valid' } }
   ], { errorMode: 'continue' });
   // created: [node1, node3], errors: [{ index: 1, ... }]
   ```

3. **Large Batches**
   ```typescript
   db.createNodes(Array(100000).fill({
     type: 'Job',
     properties: { title: 'Test' }
   }));
   // Should chunk internally to avoid memory issues
   ```

4. **Concurrent Bulk Operations**
   ```typescript
   // Two processes running createNodes simultaneously
   // SQLite busy timeout should handle gracefully
   ```

---

## Future Enhancements

### Pattern Matching

1. **Aggregations in RETURN**
   ```typescript
   db.match('(c:Company)<-[:POSTED_BY]-(j:Job)')
     .return(['c.name', 'COUNT(j)'])
     .exec();
   ```

2. **Pattern Negation**
   ```typescript
   db.match('(j:Job)')
     .where({ NOT: { pattern: '(j)-[:APPLIED_TO]->(a:Application)' } })
     .exec();
   ```

3. **Subquery Support**
   ```typescript
   db.match('(j:Job)')
     .where({
       j: {
         id: db.match('(j2:Job)').return(['j2.id']).exec()
       }
     })
     .exec();
   ```

### Bulk Operations

1. **Streaming API**
   ```typescript
   const stream = db.createNodesStream(nodeGenerator());
   stream.on('data', (node) => console.log('Created:', node.id));
   stream.on('end', () => console.log('Complete'));
   ```

2. **Bulk Merge Operations**
   ```typescript
   db.mergeNodes([
     { match: { url: '...' }, create: { ... }, update: { ... } },
     // ...
   ]);
   ```

3. **Progress Reporting**
   ```typescript
   db.createNodes(nodes, {
     onProgress: (completed, total) => {
       console.log(`Progress: ${completed}/${total}`);
     }
   });
   ```

---

## Acceptance Criteria

### Definition of Done

Phase 3 is complete when:

- ✅ All functional requirements (FR-3.x) implemented
- ✅ All non-functional requirements (NFR-3.x) met
- ✅ Test coverage ≥90% for new code
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Performance benchmarks meet targets
- ✅ API documentation complete with examples
- ✅ Type definitions exported correctly
- ✅ No TypeScript compilation errors
- ✅ No linting errors
- ✅ Code reviewed and approved
- ✅ Changelog updated
- ✅ README updated with new features
- ✅ Version bumped to 2.0.0

### Validation Checklist

**Pattern Matching:**
- [ ] Can parse node patterns: `(a:Type {prop: value})`
- [ ] Can parse edge patterns: `-[:TYPE]->`
- [ ] Can parse paths: `(a)-[:T1]->(b)-[:T2]->(c)`
- [ ] WHERE filtering works correctly
- [ ] RETURN clause selects variables
- [ ] Optional patterns return null
- [ ] Variable-length paths work: `-[:T*1..3]->`
- [ ] Type-safe API with proper TypeScript types
- [ ] Error messages are clear and actionable
- [ ] Performance meets targets

**Bulk Operations:**
- [ ] createNodes creates 10k+ nodes/second
- [ ] createEdges creates 10k+ edges/second
- [ ] updateNodes updates correctly
- [ ] deleteNodes cascades edges
- [ ] All operations atomic (transaction wrapped)
- [ ] Error handling comprehensive
- [ ] Stats reporting accurate
- [ ] Memory safe for large batches
- [ ] Type-safe API
- [ ] Performance meets targets

---

## Dependencies

### External

- `better-sqlite3` - SQLite interface
- Existing: Already integrated

### Internal

- `src/core/Database.ts` - Add new methods
- `src/query/MatchQuery.ts` - New file
- `src/query/PatternParser.ts` - New file
- `src/bulk/BulkOperations.ts` - New file
- `src/types/pattern.ts` - New file
- `src/types/bulk.ts` - New file
- `src/utils/sql-generator.ts` - New file (for pattern→SQL)

---

## Implementation Plan

### Phase 3A: Pattern Matching (Week 1-2)

**Day 1-2: Pattern Parser**
- Parse node patterns
- Parse edge patterns
- Parse path patterns
- Unit tests for parser

**Day 3-4: SQL Generator**
- Generate SELECT for node patterns
- Generate JOINs for edge patterns
- Generate CTEs for variable-length paths
- Unit tests for SQL generation

**Day 5-7: MatchQuery Implementation**
- Implement fluent API
- WHERE clause support
- RETURN clause support
- Optional match support
- Integration tests

**Day 8-10: Testing & Refinement**
- Comprehensive test suite
- Performance optimization
- Documentation
- Examples

### Phase 3B: Bulk Operations (Week 3)

**Day 1-2: Bulk Create**
- createNodes implementation
- createEdges implementation
- Transaction wrapping
- Unit tests

**Day 3-4: Bulk Update/Delete**
- updateNodes implementation
- updateEdges implementation
- deleteNodes implementation
- deleteEdges implementation
- Unit tests

**Day 5-6: Error Handling & Options**
- Error modes (fail-fast, continue, collect)
- Detailed error reporting
- Stats tracking
- Unit tests

**Day 7: Testing & Refinement**
- Integration tests
- Performance benchmarks
- Documentation
- Examples

### Phase 3C: Integration & Release (Week 4)

**Day 1-2: Integration**
- Integrate with GraphDatabase
- Update type exports
- Update README
- Update CHANGELOG

**Day 3-4: Testing**
- Full test suite
- Performance regression tests
- Browser compatibility tests

**Day 5: Documentation**
- API documentation
- Usage examples
- Migration guide
- Performance guide

**Day 6-7: Release**
- Version bump to 2.0.0
- npm publish
- GitHub release
- Announcement

---

## Glossary

**Pattern**: Graph structure to match (nodes + edges)
**Variable**: Named reference in pattern (`a`, `b`, `job`)
**Path**: Sequence of connected nodes and edges
**Variable-length path**: Path with flexible hop count (`-[:T*1..3]->`)
**Bulk operation**: Batch processing multiple records
**Prepared statement**: Pre-compiled SQL for reuse
**Transaction**: Atomic database operation
**Cascade delete**: Delete related records automatically

---

## References

- Cypher Query Language: https://neo4j.com/docs/cypher-manual/
- SQLite JSON Functions: https://www.sqlite.org/json1.html
- better-sqlite3 API: https://github.com/WiseLibs/better-sqlite3/wiki/API
- Graph Query Languages: https://arxiv.org/abs/1102.1481

---

**End of Specification**

This specification will guide TDD implementation of Phase 3 features. All requirements are testable and measurable. Implementation will follow SPARC methodology: Specification → Pseudocode → Architecture → Refinement → Completion.
