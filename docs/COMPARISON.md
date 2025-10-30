# sqlite-graph: Competitive Analysis

## Overview

This document compares sqlite-graph to other SQLite-based graph databases and JavaScript graph libraries to understand our competitive positioning and unique value proposition.

## SQLite-Based Graph Databases

### simple-graph (Python/Multi-language)

**Repository**: https://github.com/dpapathanasiou/simple-graph

**Approach:**
- Schema-only library providing SQL templates and statements
- Nodes as JSON objects with unique IDs
- Edges as directional pairs of node IDs with optional properties
- Uses SQLite Common Table Expressions (CTEs) for graph traversal
- Inspired by "SQLite as a document database"

**Language Support:**
- Python (PyPI package: `simple-graph-sqlite`)
- Go, Julia, R, Flutter/Dart, Swift

**Philosophy:**
- Provides SQL schema and prepared statements rather than unified API
- Developers integrate into their chosen language using native SQLite bindings
- Trades specialized optimization for accessibility and simplicity

**API Style:**
```python
# SQL-based approach with templates
# Developers write SQL queries using provided schema
```

**Comparison to sqlite-graph:**

| Feature | simple-graph | sqlite-graph |
|---------|--------------|--------------|
| API Style | SQL templates | Fluent TypeScript API |
| Language Focus | Multi-language | TypeScript/JavaScript |
| Abstraction Level | Low (SQL) | High (fluent methods) |
| Type Safety | None | Full TypeScript generics |
| Query DSL | SQL/CTE | Method chaining |
| Developer Experience | Raw SQL | Intuitive API |
| Performance | Depends on SQL skill | Optimized queries |

**Our Advantage:**
- Modern fluent API vs raw SQL templates
- Type-safe TypeScript with generics
- Better developer experience with method chaining
- Built-in graph algorithms (BFS, shortest path)
- Natural relationship syntax: `createEdge(from, 'KNOWS', to)`

---

### LiteGraph (.NET/C#)

**Repository**: https://github.com/jchristn/LiteGraph

**Approach:**
- Property graph database with graph relationships, tags, labels, metadata
- Built for "knowledge and artificial intelligence applications"
- Vector support for embeddings with similarity search
- Both in-process and RESTful server modes

**Language Support:**
- .NET/C# (NuGet package)

**Features:**
- CRUD operations on tenants, graphs, nodes, edges
- Vector embeddings with cosine similarity, distance, inner product
- Depth-first search traversal
- GEXF export for visualization
- Batch operations

**API Style:**
```csharp
// .NET/C# with LiteGraphClient
var client = new LiteGraphClient();
client.CreateGraph("myGraph");
client.CreateNode(graphGuid, nodeData);
```

**Comparison to sqlite-graph:**

| Feature | LiteGraph | sqlite-graph |
|---------|-----------|--------------|
| Language | .NET/C# | TypeScript/JavaScript |
| Ecosystem | NuGet | npm |
| Vector Search | ✅ Yes | ❌ No (future) |
| Multi-tenancy | ✅ Yes | ❌ No |
| Server Mode | ✅ RESTful API | ❌ Embedded only |
| Graph Algorithms | Basic DFS | BFS, shortest path, all paths |
| AI/ML Focus | Yes (vectors) | No (future) |

**Our Advantage:**
- JavaScript/TypeScript ecosystem (wider web adoption)
- Simpler embedded-first architecture
- More intuitive fluent query API
- Better graph algorithm support
- Natural syntax for relationships

**Their Advantage:**
- Vector embeddings for AI/RAG applications
- Multi-tenancy support
- Server mode with REST API
- Enterprise .NET ecosystem

---

## JavaScript Graph Libraries (In-Memory)

### graphology

**Repository**: https://github.com/graphology/graphology

**Approach:**
- Robust in-memory Graph object for JavaScript & TypeScript
- Comprehensive standard library of graph algorithms
- Event-driven for interactive renderers
- Powers sigma.js visualization library

**Features:**
- Directed, undirected, or mixed graphs
- Self-loops and parallel edges support
- Rich algorithm library (shortest path, centrality, clustering, etc.)
- Graph generators for testing
- Layout algorithms
- TypeScript support

**API Style:**
```javascript
import Graph from 'graphology';

const graph = new Graph();
graph.addNode('alice', { name: 'Alice', age: 30 });
graph.addNode('bob', { name: 'Bob', age: 25 });
graph.addEdge('alice', 'bob', { type: 'KNOWS' });

// Traversal
import shortestPath from 'graphology-shortest-path';
const path = shortestPath(graph, 'alice', 'bob');
```

**Comparison to sqlite-graph:**

| Feature | graphology | sqlite-graph |
|---------|------------|--------------|
| Storage | In-memory | SQLite (disk) |
| Persistence | Manual serialization | Automatic (ACID) |
| Dataset Size | Limited by RAM | Limited by disk |
| Query Speed | Nanoseconds-microseconds | Microseconds-milliseconds |
| Algorithms | Extensive library | Core algorithms |
| Visualization | sigma.js integration | None |
| Transactions | No | Yes (ACID) |
| Type Safety | TypeScript support | TypeScript generics |
| API Style | Imperative | Fluent DSL |

**When to Use graphology:**
- In-memory performance critical
- Temporary graph analysis
- Visualization with sigma.js
- Algorithm-heavy workloads
- Small to medium graphs (<100K nodes)

**When to Use sqlite-graph:**
- Persistent storage required
- ACID transactions needed
- Large datasets (>1M nodes)
- Low memory footprint
- File-based portability
- Long-term data storage

---

## Graph Databases (Non-SQLite)

### Neo4j

**Leader in property graph databases**

**Features:**
- Cypher query language
- Native graph storage engine
- Distributed architecture
- ACID transactions
- Rich ecosystem (Neo4j Desktop, Bloom, etc.)

**API Style:**
```cypher
// Cypher query language
MATCH (alice:Person {name: 'Alice'})-[:KNOWS]->(friend)
WHERE friend.age > 25
RETURN friend
```

**Comparison to sqlite-graph:**

| Feature | Neo4j | sqlite-graph |
|---------|-------|--------------|
| Deployment | Server process | Embedded library |
| Setup | Complex | Single file |
| Query Language | Cypher | TypeScript fluent API |
| Performance | Optimized for deep traversal | Good for shallow traversal |
| Cost | Enterprise licensing | MIT open source |
| Learning Curve | Cypher syntax | TypeScript/JavaScript |
| Use Case | Production graph apps | Embedded applications |

**When to Use Neo4j:**
- Production-scale graph applications
- Deep graph traversals (5+ hops)
- Complex pattern matching
- Multi-user concurrent access
- Enterprise support needed

**When to Use sqlite-graph:**
- Embedded applications
- Simple to moderate graph complexity
- File-based portability
- Low operational overhead
- TypeScript/JavaScript ecosystem

---

## Unique Value Proposition of sqlite-graph

### 1. Best of Both Worlds

sqlite-graph combines:
- **SQLite reliability**: ACID transactions, file-based persistence, battle-tested storage
- **Modern API**: Fluent TypeScript DSL with method chaining
- **Graph semantics**: Natural relationship syntax and graph algorithms

### 2. Developer Experience

```typescript
// Natural, readable syntax
const path = db.traverse(alice.id)
  .out('KNOWS')
  .filter(node => node.properties.age > 25)
  .shortestPath(bob.id);

// vs raw SQL in simple-graph
// vs Cypher learning curve in Neo4j
// vs in-memory-only in graphology
```

### 3. Zero Dependencies Beyond SQLite

- No server process to manage
- No additional runtime dependencies
- Single file database portability
- Works in Node.js, Electron, browser (with WASM)

### 4. Type Safety with Generics

```typescript
interface Person {
  name: string;
  age: number;
}

const person = db.createNode<Person>('Person', {
  name: 'Alice',
  age: 30
});
// TypeScript ensures type correctness
```

### 5. Embedded-First Philosophy

- **Use Case**: Personal knowledge management, local-first apps, embedded systems
- **Example**: Obsidian plugins, Electron apps, CLI tools, mobile apps
- **Benefit**: No network latency, works offline, simple deployment

---

## Market Positioning

### Target Users

1. **JavaScript/TypeScript Developers**
   - Building local-first applications
   - Need graph relationships without complexity
   - Value type safety and modern APIs

2. **Embedded Applications**
   - Electron apps (e.g., note-taking, PKM)
   - CLI tools with graph data
   - Mobile apps (React Native with SQLite)
   - Browser extensions

3. **Prototyping & MVPs**
   - Quick graph database setup
   - No infrastructure overhead
   - Easy migration path to Neo4j later

4. **Small to Medium Scale**
   - Personal projects (job search tracking, PKM)
   - Startups with graph data needs
   - Internal tools and dashboards

### Not For

- ❌ Large-scale production graph databases (use Neo4j)
- ❌ Complex pattern matching (Cypher is more expressive)
- ❌ Deep graph traversals (10+ hops with millions of nodes)
- ❌ Multi-user concurrent writes at scale
- ❌ Distributed graph systems

---

## Competitive Matrix

| Feature | sqlite-graph | simple-graph | LiteGraph | graphology | Neo4j |
|---------|--------------|--------------|-----------|------------|-------|
| **Storage** | SQLite | SQLite | SQLite | In-memory | Native graph |
| **Language** | TypeScript/JS | Multi | .NET/C# | TypeScript/JS | Multi |
| **API Style** | Fluent DSL | SQL templates | C# methods | Imperative | Cypher |
| **Type Safety** | ✅ Generics | ❌ None | ✅ C# | ✅ TypeScript | ❌ Schema |
| **Persistence** | ✅ Auto | ✅ Auto | ✅ Auto | ❌ Manual | ✅ Auto |
| **Transactions** | ✅ ACID | ✅ ACID | ✅ ACID | ❌ No | ✅ ACID |
| **Algorithms** | Core | CTEs | Basic | Extensive | Advanced |
| **Vector Search** | ❌ Future | ❌ No | ✅ Yes | ❌ No | ✅ Yes |
| **Server Mode** | ❌ No | ❌ No | ✅ REST | ❌ No | ✅ Bolt |
| **Setup** | npm install | Language-specific | NuGet | npm install | Complex |
| **Learning Curve** | Low | Medium | Low | Low | High |
| **Performance** | 3K ops/sec | Varies | Unknown | 100K+ ops/sec | 10K+ ops/sec |
| **License** | MIT | MIT | Apache 2.0 | MIT | GPL/Commercial |

---

## Feature Gaps & Future Work

### Immediate (Phase 3-4)
- [ ] Bulk operations for better write performance
- [ ] Pattern matching (similar to Cypher MATCH)
- [ ] Graph export/import (GraphML, GEXF)
- [ ] Connection pooling for concurrent access

### Medium-Term (Phase 5)
- [ ] Vector embeddings support (RAG applications)
- [ ] Full-text search integration
- [ ] Query optimization with statistics
- [ ] Prepared statement caching

### Long-Term (Future)
- [ ] WASM hot-path optimization (Rust)
- [ ] Distributed graph support
- [ ] Sharding for large graphs
- [ ] GraphQL integration
- [ ] Visualization library integration (sigma.js, vis.js)

---

## Conclusion

**sqlite-graph occupies a unique niche:**

- **More accessible than Neo4j**: No server, no Cypher learning curve, familiar TypeScript
- **More powerful than simple-graph**: Fluent API, type safety, built-in algorithms
- **More persistent than graphology**: ACID transactions, disk-based storage
- **More JavaScript-native than LiteGraph**: npm ecosystem, TypeScript support

**Ideal for:**
- Embedded graph databases in JavaScript applications
- Rapid prototyping with graph data structures
- Local-first applications with graph relationships
- Developers who value type safety and modern APIs

**Trade-offs:**
- Not optimized for extreme scale (millions of nodes, deep traversals)
- Less expressive than Cypher for complex pattern matching
- Slower than in-memory graphs for pure computation

**Strategic Position:**
sqlite-graph is the **best SQLite-based graph database for TypeScript/JavaScript developers** who need persistent graph storage with a modern, type-safe API.

---

**Last Updated**: 2025-10-30
**Competitors Analyzed**: 5 (simple-graph, LiteGraph, graphology, Neo4j, others)
**Sources**: GitHub, npm, documentation, academic papers
