# AgentDB Storage Methods Comparison Matrix

**Date:** November 16, 2025
**Purpose:** Strategic guide for selecting optimal storage approaches for AI agent systems

## Overview

This document compares different storage methods available when working with AgentDB, sqlite-graph, and traditional databases. It helps architects choose the right storage strategy based on their specific use cases.

## Storage Methods Comparison

| Storage Method | Query Capabilities | Performance | Memory | Complexity | Best For |
|----------------|-------------------|-------------|---------|------------|----------|
| **Vector-Only (Pure AgentDB)** | Semantic similarity, k-NN search, clustering | 150x faster search, <1ms retrieval | High (embeddings in RAM) | Low | RAG, semantic search, similarity matching |
| **Graph-Only (Pure sqlite-graph)** | Pattern matching, multi-hop traversal, path finding | <100ms traversal (10k nodes), 12,494 paths/sec | Low (disk-based) | Medium | Knowledge graphs, relationship mapping, dependency analysis |
| **Hybrid (AgentDB + sqlite-graph)** | Semantic + structural queries, intelligent routing | Best of both (150x search + <100ms traversal) | Medium-High | High | Agent networks, reasoning systems, knowledge correlation |
| **Traditional SQL (SQLite)** | Relational queries, JOINs, aggregations | Fast for indexed queries | Low | Low | CRUD apps, transactional systems, reporting |
| **Document Store (JSON in SQLite)** | JSON property queries, full-text search | Moderate (depends on indexes) | Low | Low | Schema-less data, flexible properties, rapid prototyping |

## Detailed Comparison

### 1. Vector-Only Storage (Pure AgentDB)

**Architecture:**
```typescript
import { AgentDB } from 'agentdb';

const db = new AgentDB({ dimensions: 1536 });

// Store embeddings with metadata
await db.insert({
  vector: embedding,
  metadata: {
    type: 'decision',
    agent: 'optimizer',
    context: 'performance-tuning'
  }
});

// Semantic search (150x faster than sequential)
const similar = await db.search(queryEmbedding, { k: 10 });
```

**Strengths:**
- ✅ **Ultra-fast semantic search** (150x faster than alternatives)
- ✅ **Low query latency** (<1ms for k-NN with HNSW index)
- ✅ **Natural language understanding** (embeddings capture meaning)
- ✅ **Scalable to millions** of vectors with quantization (4-32x memory reduction)
- ✅ **Built-in clustering** and similarity metrics

**Weaknesses:**
- ❌ **High memory usage** (embeddings stored in RAM for speed)
- ❌ **No structural queries** (can't express "find all agents connected to X")
- ❌ **No relationship traversal** (embeddings don't capture graph topology)
- ❌ **Embedding cost** (requires LLM API calls to generate vectors)
- ❌ **Limited explainability** (similarity scores don't show reasoning paths)

**Use Cases:**
- RAG (Retrieval-Augmented Generation) systems
- Semantic document search
- Agent memory retrieval (find similar past experiences)
- Clustering agent behaviors or patterns
- Content recommendation engines

**Performance Characteristics:**
- Search: <1ms for k=10 with HNSW index
- Insert: ~0.5ms per vector
- Memory: ~6KB per 1536-dim vector (1.5KB with 4-bit quantization)
- Scale: Tested to 10M+ vectors

---

### 2. Graph-Only Storage (Pure sqlite-graph)

**Architecture:**
```typescript
import { GraphDatabase } from 'sqlite-graph';

const db = new GraphDatabase('./agents.db');

// Create nodes and edges
const agent1 = db.createNode('Agent', { name: 'Optimizer', role: 'performance' });
const agent2 = db.createNode('Agent', { name: 'Researcher', role: 'analysis' });
db.createEdge(agent1.id, 'DELEGATES_TO', agent2.id);

// Pattern matching
const network = db.pattern()
  .start('coordinator', 'Agent')
  .through('DELEGATES_TO', 'out')
  .node('worker', 'Agent')
  .where({ worker: { role: 'analysis' } })
  .exec();
```

**Strengths:**
- ✅ **Explicit relationships** (edges capture agent coordination, task flow)
- ✅ **Multi-hop traversal** (find indirect connections, delegation chains)
- ✅ **Path finding** (shortest path, all paths between agents)
- ✅ **Pattern matching** (declarative queries for complex graph structures)
- ✅ **Low memory footprint** (disk-based, not in-memory)
- ✅ **ACID transactions** (built on SQLite)
- ✅ **Type-safe API** (full TypeScript support)

**Weaknesses:**
- ❌ **No semantic search** (can't find "agents similar to X" based on behavior)
- ❌ **Manual relationship modeling** (must explicitly define edges)
- ❌ **Slower for similarity** (no embedding-based fuzzy matching)
- ❌ **Query complexity** (pattern matching requires graph thinking)

**Use Cases:**
- Agent coordination networks (who delegates to whom)
- Task dependency graphs (what depends on what)
- Knowledge graphs (entities and relationships)
- Workflow orchestration (task → subtask → agent mapping)
- Organizational hierarchies (reporting structures)
- Skill prerequisite trees (learning paths)

**Performance Characteristics:**
- Pattern matching: <100ms for 10k nodes
- Path finding: 12,494 ops/sec
- Traversal: 2.68ms avg (BFS/DFS)
- Node creation: 3,487 ops/sec
- Storage: ~500 bytes per node (with JSON properties)

---

### 3. Hybrid Storage (AgentDB + sqlite-graph)

**Architecture:**
```typescript
import { GraphDatabase } from 'sqlite-graph';
import { AgentDB } from 'agentdb';

class HybridAgentDB {
  constructor() {
    this.graph = new GraphDatabase('./agents.db');
    this.vectors = new AgentDB({ dimensions: 1536 });
  }

  // Store decision with both graph structure and semantic embedding
  async storeDecision(decision) {
    // Graph: Store decision node and relationships
    const node = this.graph.createNode('Decision', {
      action: decision.action,
      outcome: decision.outcome,
      timestamp: Date.now()
    });

    // Link to agent node
    this.graph.createEdge(decision.agentId, 'MADE_DECISION', node.id);

    // Vector: Store semantic embedding for similarity search
    const embedding = await this.generateEmbedding(decision.reasoning);
    await this.vectors.insert({
      vector: embedding,
      metadata: { graphNodeId: node.id, type: 'decision' }
    });

    return node;
  }

  // Hybrid query: Find similar decisions, then traverse graph for context
  async findSimilarWithContext(query, k = 5) {
    // Step 1: Vector search for semantic similarity
    const queryEmbedding = await this.generateEmbedding(query);
    const similar = await this.vectors.search(queryEmbedding, { k });

    // Step 2: Graph traversal for structural context
    const results = [];
    for (const match of similar) {
      const graphNodeId = match.metadata.graphNodeId;

      // Get decision node and its agent context
      const context = this.graph.pattern()
        .start('agent', 'Agent')
        .through('MADE_DECISION', 'out')
        .node('decision', 'Decision')
        .where({ decision: { id: graphNodeId } })
        .through('RELATED_TO', 'both')
        .node('related', 'Decision')
        .exec();

      results.push({
        similarity: match.score,
        decision: context[0].decision,
        agent: context[0].agent,
        relatedDecisions: context.map(c => c.related)
      });
    }

    return results;
  }
}
```

**Strengths:**
- ✅ **Best of both worlds** (semantic search + structural queries)
- ✅ **Intelligent query routing** (use vectors for similarity, graph for relationships)
- ✅ **Richer context** (find similar + understand connections)
- ✅ **Cross-domain insights** (correlate semantic patterns with graph topology)
- ✅ **Adaptive learning** (vector similarity reveals patterns, graph shows causation)

**Weaknesses:**
- ❌ **Higher complexity** (two storage systems to manage)
- ❌ **Synchronization overhead** (keep graph nodes and vector metadata in sync)
- ❌ **Increased memory** (embeddings in RAM + graph on disk)
- ❌ **Dual query planning** (must decide when to use which system)

**Use Cases:**
- **Agent reasoning systems** (find similar past reasoning, understand decision chains)
- **Knowledge correlation** (semantic similarity + explicit relationships)
- **Experience replay** (find similar trajectories, analyze path context)
- **Multi-agent coordination** (semantic task matching + delegation graph)
- **Adaptive learning** (cluster behaviors via vectors, model interactions via graph)

**Performance Characteristics:**
- Hybrid query: ~10-50ms (1ms vector search + 10-50ms graph traversal)
- Insert: ~1.5ms (0.5ms vector + 1ms graph node/edge)
- Memory: Medium-high (embeddings in RAM, graph on disk)
- Scale: Limited by vector RAM requirements (use quantization for 10M+ vectors)

**Example Use Case: Agent Network with ReasoningBank**

```typescript
// Store agent trajectory with reasoning
const trajectory = {
  agent: 'optimizer',
  task: 'reduce latency',
  actions: ['profile code', 'identify bottleneck', 'apply caching'],
  reasoning: 'High latency traced to database queries. Caching reduces repeated lookups.',
  outcome: 'success',
  performance: { before: 500, after: 50 } // ms
};

// Hybrid storage
await hybridDB.storeDecision(trajectory);

// Later: Find similar challenges and learn from successful patterns
const similar = await hybridDB.findSimilarWithContext(
  'How to optimize slow API responses?',
  k: 5
);

// Returns:
// 1. Semantically similar past decisions (via vector search)
// 2. Agent who made each decision (via graph traversal)
// 3. Related decisions in same optimization chain (via graph pattern)
// 4. Success patterns across agents (correlation analysis)
```

---

### 4. Traditional SQL (SQLite)

**Architecture:**
```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY,
  name TEXT,
  role TEXT,
  created_at TIMESTAMP
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  agent_id INTEGER,
  description TEXT,
  status TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Join query
SELECT a.name, COUNT(t.id) as task_count
FROM agents a
LEFT JOIN tasks t ON a.id = t.agent_id
WHERE t.status = 'completed'
GROUP BY a.id;
```

**Strengths:**
- ✅ **Simple mental model** (tables, rows, columns)
- ✅ **Mature ecosystem** (decades of tooling, ORMs, GUIs)
- ✅ **Fast indexed queries** (B-tree indexes for equality/range)
- ✅ **ACID guarantees** (transactions, consistency)
- ✅ **Low learning curve** (SQL is universal)

**Weaknesses:**
- ❌ **Poor for relationships** (JOINs don't scale for multi-hop traversal)
- ❌ **No semantic search** (can't do similarity matching)
- ❌ **Schema rigidity** (ALTER TABLE is expensive)
- ❌ **Complex graph queries** (recursive CTEs are hard to write/optimize)

**Use Cases:**
- CRUD applications (create, read, update, delete)
- Transactional systems (orders, payments, inventory)
- Reporting and analytics (aggregations, grouping)
- Configuration storage (key-value with structure)

**Performance Characteristics:**
- Indexed SELECT: <1ms for simple queries
- JOIN: Depends on cardinality (can degrade with complexity)
- INSERT: ~0.5ms per row
- Storage: Compact (optimized binary format)

---

### 5. Document Store (JSON in SQLite)

**Architecture:**
```typescript
// SQLite with JSON1 extension
db.exec(`
  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    type TEXT,
    properties JSON
  )
`);

// Insert flexible documents
db.run(`
  INSERT INTO documents (id, type, properties)
  VALUES (?, ?, json(?))
`, [uuid(), 'agent', JSON.stringify({
  name: 'Optimizer',
  skills: ['performance', 'caching'],
  metadata: { version: 2 }
})]);

// JSON query
db.all(`
  SELECT properties->>'name' as name
  FROM documents
  WHERE type = 'agent'
  AND json_extract(properties, '$.skills') LIKE '%caching%'
`);
```

**Strengths:**
- ✅ **Schema flexibility** (each document can have different fields)
- ✅ **Rapid prototyping** (no migrations needed)
- ✅ **Nested data** (JSON supports hierarchical structures)
- ✅ **Partial updates** (json_set for surgical changes)

**Weaknesses:**
- ❌ **Poor indexing** (JSON queries can't use B-tree indexes well)
- ❌ **Type safety** (JSON is stringly-typed)
- ❌ **Query complexity** (json_extract syntax is verbose)
- ❌ **No relationships** (still need JOINs for connections)

**Use Cases:**
- Prototyping (evolving schema)
- Configuration management (nested settings)
- Event logging (variable event properties)
- User preferences (personalized settings)

**Performance Characteristics:**
- JSON query: 10-100x slower than indexed columns
- Storage: ~20% overhead vs normalized tables
- Flexibility: High (schema-less)

---

## Decision Matrix

### Choose **Vector-Only (AgentDB)** when:
- ✅ Primary need is semantic similarity search
- ✅ Working with natural language or embeddings
- ✅ Relationships are implicit (similarity) not explicit (edges)
- ✅ Performance is critical (<1ms retrieval required)
- ✅ Memory is available (can fit embeddings in RAM)

**Example:** RAG system retrieving relevant documents for LLM context.

---

### Choose **Graph-Only (sqlite-graph)** when:
- ✅ Relationships are explicit and important (who reports to whom)
- ✅ Need multi-hop traversal (friend-of-friend, transitive dependencies)
- ✅ Pattern matching required (find all paths matching structure)
- ✅ Low memory footprint needed (disk-based storage)
- ✅ ACID transactions required (consistency guarantees)

**Example:** Task orchestration system modeling agent delegation chains.

---

### Choose **Hybrid (AgentDB + sqlite-graph)** when:
- ✅ Need both semantic and structural queries
- ✅ Building intelligent agent systems with learning
- ✅ Want to correlate similarity patterns with causal relationships
- ✅ Implementing ReasoningBank or experience replay
- ✅ Can manage dual-system complexity and memory requirements

**Example:** Self-learning agent network that finds similar past decisions AND understands decision context through graph traversal.

---

### Choose **Traditional SQL** when:
- ✅ Data is tabular and relational (not graph-heavy)
- ✅ CRUD operations dominate (not complex traversals)
- ✅ Schema is stable and well-defined
- ✅ Standard SQL tooling is required
- ✅ No semantic or graph needs

**Example:** Order management system with products, customers, invoices.

---

### Choose **Document Store** when:
- ✅ Schema is evolving rapidly
- ✅ Each record has different fields (heterogeneous)
- ✅ Prototyping phase (not production-optimized yet)
- ✅ Nested hierarchical data (configurations, settings)
- ✅ Query performance is less critical

**Example:** Event logging with variable event properties.

---

## Performance Benchmarks Summary

| Operation | Vector-Only | Graph-Only | Hybrid | SQL | Document |
|-----------|-------------|------------|--------|-----|----------|
| **Semantic search (k=10)** | <1ms ✅ | N/A | ~1ms ✅ | N/A | N/A |
| **Multi-hop traversal (3 hops)** | N/A | <100ms ✅ | <100ms ✅ | ~500ms | N/A |
| **Simple CRUD** | ~0.5ms | ~1ms | ~1.5ms | ~0.5ms ✅ | ~2ms |
| **Pattern matching** | N/A | <100ms ✅ | <100ms ✅ | ~1000ms | N/A |
| **Aggregation (10k rows)** | N/A | ~50ms | ~50ms | ~10ms ✅ | ~100ms |
| **Insert throughput** | ~2000/s | ~3500/s ✅ | ~700/s | ~5000/s ✅ | ~1000/s |

**Key:**
- ✅ = Best-in-class for this operation
- Times are approximate, hardware-dependent
- N/A = Operation not supported

---

## Memory Requirements

| Storage Type | Memory per 10k Records | Scalability Limit |
|--------------|------------------------|-------------------|
| **Vector-Only** | ~60 MB (1536-dim) / ~15 MB (4-bit quantized) | 10M+ vectors with quantization |
| **Graph-Only** | ~5 MB (disk-based) | 100M+ nodes (limited by disk) |
| **Hybrid** | ~65 MB (vectors in RAM + graph on disk) | Vector RAM is bottleneck |
| **SQL** | ~2 MB (normalized tables) | Billions of rows (disk-limited) |
| **Document** | ~3 MB (JSON overhead) | Billions of documents (disk) |

---

## Complexity Assessment

| Aspect | Vector-Only | Graph-Only | Hybrid | SQL | Document |
|--------|-------------|------------|--------|-----|----------|
| **Learning curve** | Medium | Medium-High | High | Low | Low |
| **Query complexity** | Low | Medium | High | Low | Medium |
| **Maintenance** | Low | Medium | High | Low | Medium |
| **Debugging** | Medium | Medium | Hard | Easy | Medium |
| **Ecosystem maturity** | Medium | Low | Experimental | Very High | High |

---

## Real-World Hybrid Architecture Example

### PKM (Personal Knowledge Management) Intelligence System

**Requirements:**
- Store agent decisions with reasoning (graph structure)
- Find similar past experiences (semantic search)
- Analyze decision patterns across agents (correlation)
- Learn from successful trajectories (ReasoningBank)

**Architecture:**

```typescript
class PKMIntelligence {
  constructor() {
    this.graph = new GraphDatabase('./pkm.db');
    this.vectors = new AgentDB({ dimensions: 1536 });
  }

  // Store agent decision with dual representation
  async recordDecision(agent, task, reasoning, outcome) {
    // 1. Graph: Store structured decision
    const decisionNode = this.graph.createNode('Decision', {
      task,
      outcome,
      timestamp: Date.now()
    });

    const agentNode = this.graph.nodes('Agent')
      .where({ name: agent })
      .first() || this.graph.createNode('Agent', { name: agent });

    this.graph.createEdge(agentNode.id, 'MADE_DECISION', decisionNode.id);

    // 2. Vector: Store semantic embedding
    const embedding = await this.embed(reasoning);
    await this.vectors.insert({
      vector: embedding,
      metadata: {
        graphNodeId: decisionNode.id,
        agent,
        outcome
      }
    });

    return decisionNode;
  }

  // Hybrid query: Learn from similar successful decisions
  async learnFromSimilar(currentTask) {
    // Step 1: Vector search for semantically similar tasks
    const taskEmbedding = await this.embed(currentTask);
    const similar = await this.vectors.search(taskEmbedding, {
      k: 10,
      filter: { outcome: 'success' }
    });

    // Step 2: Graph traversal to understand decision context
    const insights = [];
    for (const match of similar) {
      // Find the agent who made this decision
      const context = this.graph.pattern()
        .start('agent', 'Agent')
        .through('MADE_DECISION', 'out')
        .node('decision', 'Decision')
        .where({ decision: { id: match.metadata.graphNodeId } })
        .exec();

      insights.push({
        similarity: match.score,
        agent: context[0].agent,
        decision: context[0].decision,
        reasoning: match.metadata.reasoning
      });
    }

    return insights;
  }

  // Cross-agent pattern analysis
  async analyzeSuccessPatterns() {
    // Step 1: Get all successful decisions from graph
    const successful = this.graph.pattern()
      .start('agent', 'Agent')
      .through('MADE_DECISION', 'out')
      .node('decision', 'Decision')
      .where({ decision: { outcome: 'success' } })
      .exec();

    // Step 2: Cluster successful decisions by semantic similarity
    const embeddings = await Promise.all(
      successful.map(s => this.getEmbedding(s.decision.id))
    );

    const clusters = await this.vectors.cluster(embeddings, { k: 5 });

    // Step 3: For each cluster, find common graph patterns
    const patterns = clusters.map(cluster => {
      const clusterNodes = cluster.members.map(m => successful[m]);

      // Analyze which agents contribute to this success pattern
      const agents = [...new Set(clusterNodes.map(n => n.agent.name))];

      return {
        pattern: cluster.centroid,
        frequency: cluster.members.length,
        contributingAgents: agents,
        examples: clusterNodes.slice(0, 3)
      };
    });

    return patterns;
  }
}
```

**Benefits:**
1. **Semantic retrieval** - Find similar past decisions instantly (vector search)
2. **Contextual understanding** - Understand who/what/when via graph traversal
3. **Pattern discovery** - Cluster similar behaviors, analyze graph topology
4. **Cross-agent learning** - Correlate success patterns across agent network
5. **Explainable AI** - Graph shows reasoning chains, vectors show similarity

**Performance:**
- Store decision: ~2ms (1ms graph + 1ms vector)
- Find similar + context: ~10ms (1ms vector search + 9ms graph traversal)
- Analyze patterns: ~100ms (batch vector clustering + graph aggregation)

---

## Conclusion

**General Guidance:**

1. **Start simple** - Use the simplest storage that meets your needs
2. **Scale up** - Add complexity only when requirements demand it
3. **Hybrid is powerful but complex** - Only use when you truly need both semantic and structural queries
4. **Measure, don't guess** - Benchmark your specific workload before committing to architecture

**Quick Decision Tree:**

```
Do you need semantic similarity search?
├─ NO → Is your data graph-like with relationships?
│       ├─ YES → Use sqlite-graph (Graph-Only)
│       └─ NO → Use traditional SQL
└─ YES → Do you also need explicit relationship traversal?
         ├─ NO → Use AgentDB (Vector-Only)
         └─ YES → Use Hybrid (AgentDB + sqlite-graph)
```

**Future-Proofing:**

- **sqlite-graph** is stable and production-ready for graph workloads
- **AgentDB** is proven for vector search (150x faster, tested to 10M+ vectors)
- **Hybrid approach** is experimental but powerful for AI agent systems
- **Start with one system**, add the other only when clear need emerges

---

**Last Updated:** November 16, 2025
**Related Documents:**
- [sqlite-graph API Documentation](API.md)
- [sqlite-graph Performance Benchmarks](BENCHMARKS.md)
- [Phase 3 Pattern Matching Implementation](PHASE-3-PROGRESS.md)
- [Competitive Analysis](COMPETITIVE-ANALYSIS.md)
