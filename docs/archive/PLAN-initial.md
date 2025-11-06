# sqlite-graph Development Plan

## Project Overview

**Name:** `sqlite-graph`
**License:** MIT
**Language:** TypeScript (Node.js)
**Performance Path:** JavaScript → Rust/WASM when needed
**Primary Use Case:** Job application pipeline tracking with graph relationships

## Core Architecture

### Project Structure
```
sqlite-graph/
├── src/
│   ├── core/
│   │   ├── Database.ts           # Main database class
│   │   ├── Node.ts                # Node operations
│   │   ├── Edge.ts                # Edge operations
│   │   ├── Schema.ts              # Schema management ✅
│   │   └── Transaction.ts         # Transaction wrapper
│   ├── query/
│   │   ├── QueryBuilder.ts        # Fluent query DSL
│   │   ├── NodeQuery.ts           # Node-specific queries
│   │   ├── TraversalQuery.ts      # Graph traversal
│   │   └── PathQuery.ts           # Path finding
│   ├── types/
│   │   ├── index.ts               # Type definitions ✅
│   │   └── schema.ts              # Schema types
│   ├── utils/
│   │   ├── serialization.ts       # JSON serialization ✅
│   │   └── validation.ts          # Input validation ✅
│   └── index.ts                   # Public API exports
├── rust/                          # Future WASM module
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                 # WASM bindings (future)
│       └── traversal.rs           # Hot path algorithms
├── tests/
│   ├── unit/
│   ├── integration/
│   └── performance/
├── examples/
│   ├── job-pipeline.ts            # Job application tracking
│   └── basic-usage.ts
├── benchmarks/
├── docs/
├── package.json ✅
├── tsconfig.json ✅
├── jest.config.js ✅
├── LICENSE (MIT) ✅
└── README.md
```

## Implementation Phases

### Phase 1: Core Functionality (Current)
- [x] Project setup and configuration
- [x] Type definitions
- [x] Utility functions (serialization, validation)
- [x] Database schema initialization
- [ ] Main Database class
- [ ] Node CRUD operations
- [ ] Edge CRUD operations
- [ ] Transaction support
- [ ] Basic tests

### Phase 2: Query DSL
- [ ] NodeQuery class (fluent API)
- [ ] EdgeQuery class
- [ ] TraversalQuery class
- [ ] Graph traversal algorithms
- [ ] Shortest path implementation
- [ ] Integration tests

### Phase 3: Advanced Features
- [ ] All paths finding
- [ ] Pattern matching
- [ ] Bulk operations
- [ ] Export/import functionality
- [ ] Performance optimizations

### Phase 4: Documentation & Examples
- [ ] Comprehensive README
- [ ] API documentation (JSDoc)
- [ ] Job pipeline example
- [ ] Basic usage examples
- [ ] Performance benchmarks

### Phase 5: Future Rust/WASM (Optional)
- [ ] Rust project setup
- [ ] Implement hot-path algorithms in Rust
- [ ] WASM compilation with wasm-pack
- [ ] Automatic fallback mechanism
- [ ] Performance comparisons

## Database Schema

**Universal Schema Approach** (single nodes/edges tables with JSON properties):

```sql
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  properties TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  properties TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
);
```

## Key API Design Principles

### 1. Fluent Query DSL
The unique selling point - intuitive method chaining for graph queries:

```typescript
db.nodes('Job')
  .where({ status: 'discovered' })
  .connectedTo('Company', 'POSTED_BY')
  .filter({ industry: 'SaaS' })
  .orderBy('created_at', 'desc')
  .limit(10)
  .exec();
```

### 2. Type Safety
Full TypeScript support with generic types:

```typescript
interface JobData {
  title: string;
  url: string;
  status: string;
}

const job = db.createNode<JobData>('Job', {
  title: 'Senior Engineer',
  url: 'https://...',
  status: 'active'
});
```

### 3. Graph Traversal
Intuitive traversal API:

```typescript
db.traverse(startNodeId)
  .out('SIMILAR_TO')
  .filter(node => node.properties.status === 'discovered')
  .maxDepth(2)
  .toArray();
```

## Example Use Case: Job Pipeline

```typescript
// Create nodes
const job = db.createNode('Job', {
  title: 'Senior Agentic Engineer',
  url: 'https://example.com/job/123',
  status: 'discovered'
});

const company = db.createNode('Company', {
  name: 'TechCorp',
  industry: 'SaaS'
});

// Create relationships
db.createEdge('POSTED_BY', job.id, company.id);

// Query
const activeJobs = db.nodes('Job')
  .where({ status: 'discovered' })
  .connectedTo('Company', 'POSTED_BY')
  .exec();

// Traversal
const similarJobs = db.traverse(job.id)
  .out('SIMILAR_TO')
  .maxDepth(2)
  .toArray();
```

## Performance Considerations

### JavaScript Implementation (Phase 1-4)
- Prepared statements for all queries
- Smart indexing based on query patterns
- Efficient JSON serialization
- Connection pooling support

### Future Rust/WASM Module (Phase 5)
Hot-path functions to implement in Rust:
- Shortest path finding (Dijkstra's algorithm)
- All paths enumeration
- Complex graph traversal
- Pattern matching
- Large batch operations

## Success Criteria

The project is complete when:
1. ✅ All example code executes without errors
2. ✅ Test coverage >80%
3. ✅ Performance benchmarks show <10ms for simple queries
4. ✅ Job pipeline example works end-to-end
5. ✅ README is comprehensive and clear
6. ✅ Package can be published to npm
7. ✅ TypeScript types work correctly with IDE autocomplete

## Testing Strategy

### Unit Tests
- Node CRUD operations
- Edge CRUD operations
- Query builder methods
- Traversal algorithms
- Utility functions

### Integration Tests
- Complete workflow scenarios
- Job pipeline example
- Complex queries
- Transaction rollback
- Schema validation

### Performance Tests
- Query execution time
- Traversal performance
- Large dataset handling
- Memory usage

## Development Guidelines

- **TDD Approach**: Write tests first when possible
- **Type Safety**: Maintain strict TypeScript types
- **Documentation**: JSDoc comments for all public APIs
- **Performance**: Benchmark critical paths
- **Clean Code**: Follow SOLID principles
- **Git Commits**: Frequent commits after each feature

## Current Status

### Completed ✅
- Project structure and configuration
- Type system design
- Utility functions (serialization, validation)
- Database schema definition
- Git repository initialization
- License (MIT)
- Test infrastructure setup

### In Progress 🚧
- Core Database class implementation
- Node and Edge operations

### Next Steps 📋
1. Complete Database class with CRUD operations
2. Implement transaction support
3. Build NodeQuery fluent API
4. Create TraversalQuery for graph traversal
5. Write comprehensive tests
6. Create job pipeline example
7. Write documentation
8. Add performance benchmarks
9. Publish to npm

---

**Development Team:** Michael O'Boyle and Claude Code
**Start Date:** 2025-10-27
**Target Completion:** Phase 1-4 (MVP)