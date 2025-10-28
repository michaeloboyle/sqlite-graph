# API Reference

Complete API documentation for sqlite-graph, a SQLite-based graph database for Node.js.

## Table of Contents

1. [Core Classes](#core-classes)
   - [GraphDatabase](#graphdatabase)
   - [NodeQuery](#nodequery)
   - [TraversalQuery](#traversalquery)
   - [TransactionContext](#transactioncontext)
2. [Types](#types)
3. [CRUD Operations](#crud-operations)
4. [Query DSL](#query-dsl)
5. [Graph Traversal](#graph-traversal)
6. [Transactions](#transactions)
7. [Error Handling](#error-handling)

---

## Core Classes

### GraphDatabase

Main graph database class providing CRUD operations for nodes and edges, fluent query DSL, and graph traversal capabilities.

#### Constructor

```typescript
new GraphDatabase(path: string, options?: DatabaseOptions)
```

Creates a new graph database instance.

**Parameters:**
- `path` (string): Path to SQLite database file. Use `:memory:` for in-memory database.
- `options` (DatabaseOptions, optional): Database configuration options
  - `schema` (GraphSchema): Optional graph schema for validation
  - `readonly` (boolean): Open database in read-only mode
  - `fileMustExist` (boolean): Require database file to exist
  - `timeout` (number): Busy timeout in milliseconds
  - `verbose` (function): Function to call for each SQL statement

**Throws:**
- `Error`: If database file doesn't exist and `fileMustExist` is true
- `Error`: If database initialization fails

**Examples:**

```typescript
// In-memory database
const db = new GraphDatabase(':memory:');

// File-based database
const db = new GraphDatabase('./graph.db');

// With schema validation
const db = new GraphDatabase('./graph.db', {
  schema: {
    nodes: {
      Job: { properties: ['title', 'status', 'url'] },
      Company: { properties: ['name', 'url'] },
      Skill: { properties: ['name', 'category'] }
    },
    edges: {
      POSTED_BY: { from: 'Job', to: 'Company' },
      REQUIRES: { from: 'Job', to: 'Skill' }
    }
  }
});
```

---

## CRUD Operations

### createNode()

Create a new node in the graph database.

```typescript
createNode<T extends NodeData = NodeData>(type: string, properties: T): Node<T>
```

**Parameters:**
- `type` (string): Node type (e.g., 'Job', 'Company', 'Skill')
- `properties` (T): Node properties as key-value object

**Returns:** The created node with assigned ID and timestamps

**Throws:**
- `Error`: If node type is invalid
- `Error`: If properties validation fails (when schema is defined)
- `Error`: If database insert fails

**Example:**

```typescript
const job = db.createNode('Job', {
  title: 'Senior Agentic Engineer',
  url: 'https://example.com/job/123',
  status: 'discovered',
  salary: { min: 150000, max: 200000 },
  remote: true
});

console.log(job.id); // 1
console.log(job.createdAt); // 2025-10-28T12:00:00.000Z
console.log(job.properties.title); // "Senior Agentic Engineer"
```

### getNode()

Retrieve a node by its ID.

```typescript
getNode(id: number): Node | null
```

**Parameters:**
- `id` (number): Node ID

**Returns:** The node if found, null otherwise

**Throws:**
- `Error`: If ID is invalid (not a positive integer)

**Example:**

```typescript
const node = db.getNode(1);
if (node) {
  console.log(node.type); // "Job"
  console.log(node.properties.title); // "Senior Agentic Engineer"
}
```

### updateNode()

Update node properties. Merges with existing properties.

```typescript
updateNode(id: number, properties: Partial<NodeData>): Node
```

**Parameters:**
- `id` (number): Node ID
- `properties` (Partial<NodeData>): Partial properties to update

**Returns:** The updated node with new `updatedAt` timestamp

**Throws:**
- `Error`: If node doesn't exist
- `Error`: If ID is invalid

**Example:**

```typescript
const updated = db.updateNode(1, {
  status: 'applied',
  appliedAt: new Date().toISOString()
});

console.log(updated.properties.status); // "applied"
console.log(updated.updatedAt > updated.createdAt); // true
```

### deleteNode()

Delete a node and all connected edges.

```typescript
deleteNode(id: number): boolean
```

**Parameters:**
- `id` (number): Node ID

**Returns:** True if node was deleted, false if not found

**Throws:**
- `Error`: If ID is invalid

**Example:**

```typescript
const deleted = db.deleteNode(1);
console.log(deleted ? 'Deleted' : 'Not found');
```

### createEdge()

Create an edge (relationship) between two nodes.

```typescript
createEdge<T extends NodeData = NodeData>(
  type: string,
  from: number,
  to: number,
  properties?: T
): Edge<T>
```

**Parameters:**
- `type` (string): Edge type (e.g., 'POSTED_BY', 'REQUIRES', 'SIMILAR_TO')
- `from` (number): Source node ID
- `to` (number): Target node ID
- `properties` (T, optional): Edge properties

**Returns:** The created edge with assigned ID and timestamp

**Throws:**
- `Error`: If edge type is invalid
- `Error`: If from/to nodes don't exist
- `Error`: If schema validation fails

**Example:**

```typescript
const job = db.createNode('Job', { title: 'Engineer' });
const skill = db.createNode('Skill', { name: 'TypeScript' });

const edge = db.createEdge('REQUIRES', job.id, skill.id, {
  level: 'expert',
  required: true,
  yearsExperience: 5
});

console.log(edge.from); // job.id
console.log(edge.to); // skill.id
console.log(edge.properties.level); // "expert"
```

### getEdge()

Retrieve an edge by its ID.

```typescript
getEdge(id: number): Edge | null
```

**Parameters:**
- `id` (number): Edge ID

**Returns:** The edge if found, null otherwise

**Example:**

```typescript
const edge = db.getEdge(1);
if (edge) {
  console.log(`${edge.from} -> ${edge.to} (${edge.type})`);
}
```

### deleteEdge()

Delete an edge.

```typescript
deleteEdge(id: number): boolean
```

**Parameters:**
- `id` (number): Edge ID

**Returns:** True if edge was deleted, false if not found

**Example:**

```typescript
const deleted = db.deleteEdge(1);
```

---

## Query DSL

### NodeQuery

Fluent query builder for nodes with method chaining.

#### nodes()

Start a fluent query for nodes of a specific type.

```typescript
nodes(type: string): NodeQuery
```

**Parameters:**
- `type` (string): Node type to query

**Returns:** A NodeQuery builder for method chaining

**Example:**

```typescript
const activeJobs = db.nodes('Job')
  .where({ status: 'active' })
  .orderBy('created_at', 'desc')
  .limit(10)
  .exec();
```

#### where()

Filter nodes by property values. Can be called multiple times - conditions are ANDed together.

```typescript
where(properties: Partial<NodeData>): NodeQuery
```

**Parameters:**
- `properties` (Partial<NodeData>): Key-value pairs to match against node properties

**Returns:** This query builder for chaining

**Example:**

```typescript
db.nodes('Job')
  .where({ status: 'active' })
  .where({ remote: true })
  .exec();
```

#### filter()

Filter nodes by a custom predicate function. Executes in JavaScript after fetching from database.

```typescript
filter(predicate: (node: Node) => boolean): NodeQuery
```

**Parameters:**
- `predicate` (function): Function that returns true for nodes to include

**Returns:** This query builder for chaining

**Example:**

```typescript
db.nodes('Job')
  .filter(node => {
    const salary = node.properties.salary;
    return salary && salary.min >= 150000;
  })
  .exec();
```

#### connectedTo()

Filter nodes that have a connection to nodes of a specific type.

```typescript
connectedTo(
  nodeType: string,
  edgeType: string,
  direction?: TraversalDirection
): NodeQuery
```

**Parameters:**
- `nodeType` (string): Type of connected nodes to filter by
- `edgeType` (string): Type of edge connecting the nodes
- `direction` (TraversalDirection): Direction of edge traversal ('out', 'in', or 'both')

**Returns:** This query builder for chaining

**Example:**

```typescript
// Find jobs posted by SaaS companies
db.nodes('Job')
  .connectedTo('Company', 'POSTED_BY', 'out')
  .exec();

// Find companies that posted active jobs
db.nodes('Company')
  .connectedTo('Job', 'POSTED_BY', 'in')
  .exec();

// Find all nodes connected in either direction
db.nodes('Person')
  .connectedTo('Person', 'KNOWS', 'both')
  .exec();
```

#### notConnectedTo()

Filter nodes that do NOT have a connection to nodes of a specific type.

```typescript
notConnectedTo(nodeType: string, edgeType: string): NodeQuery
```

**Parameters:**
- `nodeType` (string): Type of nodes to exclude connections to
- `edgeType` (string): Type of edge to check

**Returns:** This query builder for chaining

**Example:**

```typescript
// Find jobs with no applications yet
db.nodes('Job')
  .notConnectedTo('Application', 'APPLIED_TO')
  .exec();
```

#### orderBy()

Order results by a property field.

```typescript
orderBy(field: string, direction?: 'asc' | 'desc'): NodeQuery
```

**Parameters:**
- `field` (string): Property field to order by
- `direction` ('asc' | 'desc'): Sort direction (default: 'asc')

**Returns:** This query builder for chaining

**Example:**

```typescript
// Newest jobs first
db.nodes('Job')
  .orderBy('created_at', 'desc')
  .exec();

// Alphabetical by title
db.nodes('Job')
  .orderBy('title', 'asc')
  .exec();
```

#### limit()

Limit the number of results returned.

```typescript
limit(n: number): NodeQuery
```

**Parameters:**
- `n` (number): Maximum number of nodes to return

**Returns:** This query builder for chaining

**Throws:**
- `Error`: If n is not a positive integer

**Example:**

```typescript
db.nodes('Job')
  .orderBy('created_at', 'desc')
  .limit(10)
  .exec(); // Returns at most 10 nodes
```

#### offset()

Skip a number of results (for pagination).

```typescript
offset(n: number): NodeQuery
```

**Parameters:**
- `n` (number): Number of nodes to skip

**Returns:** This query builder for chaining

**Throws:**
- `Error`: If n is negative

**Example:**

```typescript
// Page 3 of results (20 per page)
db.nodes('Job')
  .orderBy('created_at', 'desc')
  .limit(20)
  .offset(40)
  .exec();
```

#### exec()

Execute the query and return all matching nodes.

```typescript
exec(): Node[]
```

**Returns:** Array of nodes matching the query

**Example:**

```typescript
const results = db.nodes('Job')
  .where({ status: 'active' })
  .exec();

console.log(`Found ${results.length} active jobs`);
```

#### first()

Execute the query and return the first matching node.

```typescript
first(): Node | null
```

**Returns:** The first node or null if no matches

**Example:**

```typescript
const job = db.nodes('Job')
  .where({ id: 123 })
  .first();

if (job) {
  console.log(job.properties.title);
}
```

#### count()

Count the number of matching nodes without fetching them.

```typescript
count(): number
```

**Returns:** Number of nodes matching the query

**Example:**

```typescript
const count = db.nodes('Job')
  .where({ status: 'active' })
  .count();

console.log(`${count} active jobs`);
```

#### exists()

Check if any nodes match the query.

```typescript
exists(): boolean
```

**Returns:** True if at least one node matches

**Example:**

```typescript
const hasActive = db.nodes('Job')
  .where({ status: 'active' })
  .exists();

if (hasActive) {
  console.log('Active jobs available!');
}
```

---

## Graph Traversal

### TraversalQuery

Graph traversal query builder for exploring relationships.

#### traverse()

Start a graph traversal from a specific node.

```typescript
traverse(startNodeId: number): TraversalQuery
```

**Parameters:**
- `startNodeId` (number): ID of the node to start traversal from

**Returns:** A TraversalQuery builder for graph operations

**Throws:**
- `Error`: If start node doesn't exist

**Example:**

```typescript
// Find similar jobs up to 2 hops away
const similarJobs = db.traverse(jobId)
  .out('SIMILAR_TO')
  .maxDepth(2)
  .toArray();
```

#### out()

Traverse outgoing edges of a specific type.

```typescript
out(edgeType: string, nodeType?: string): TraversalQuery
```

**Parameters:**
- `edgeType` (string): Type of edges to follow
- `nodeType` (string, optional): Target node type to filter by

**Returns:** This query builder for chaining

**Example:**

```typescript
// Follow SIMILAR_TO edges to Job nodes
db.traverse(jobId)
  .out('SIMILAR_TO', 'Job')
  .toArray();
```

#### in()

Traverse incoming edges of a specific type.

```typescript
in(edgeType: string, nodeType?: string): TraversalQuery
```

**Parameters:**
- `edgeType` (string): Type of edges to follow
- `nodeType` (string, optional): Source node type to filter by

**Returns:** This query builder for chaining

**Example:**

```typescript
// Find jobs that require this skill
db.traverse(skillId)
  .in('REQUIRES', 'Job')
  .toArray();
```

#### both()

Traverse edges in both directions.

```typescript
both(edgeType: string, nodeType?: string): TraversalQuery
```

**Parameters:**
- `edgeType` (string): Type of edges to follow
- `nodeType` (string, optional): Node type to filter by

**Returns:** This query builder for chaining

**Example:**

```typescript
// Find all connected nodes via RELATED edge
db.traverse(nodeId)
  .both('RELATED')
  .toArray();
```

#### filter()

Filter traversed nodes by a predicate function.

```typescript
filter(predicate: (node: Node) => boolean): TraversalQuery
```

**Parameters:**
- `predicate` (function): Function that returns true for nodes to include

**Returns:** This query builder for chaining

**Example:**

```typescript
db.traverse(jobId)
  .out('SIMILAR_TO')
  .filter(node => node.properties.status === 'active')
  .toArray();
```

#### unique()

Ensure each node appears only once in results.

```typescript
unique(): TraversalQuery
```

**Returns:** This query builder for chaining

**Example:**

```typescript
// No duplicate nodes in traversal
db.traverse(jobId)
  .out('SIMILAR_TO')
  .unique()
  .toArray();
```

#### maxDepth()

Set maximum traversal depth (number of hops).

```typescript
maxDepth(depth: number): TraversalQuery
```

**Parameters:**
- `depth` (number): Maximum number of edges to traverse

**Returns:** This query builder for chaining

**Throws:**
- `Error`: If depth is negative

**Example:**

```typescript
// Find jobs up to 2 hops away
db.traverse(jobId)
  .out('SIMILAR_TO')
  .maxDepth(2)
  .toArray();
```

#### minDepth()

Set minimum traversal depth (skip nodes too close).

```typescript
minDepth(depth: number): TraversalQuery
```

**Parameters:**
- `depth` (number): Minimum number of edges from start

**Returns:** This query builder for chaining

**Throws:**
- `Error`: If depth is negative

**Example:**

```typescript
// Skip immediate neighbors, start at 2 hops
db.traverse(jobId)
  .out('SIMILAR_TO')
  .minDepth(2)
  .toArray();
```

#### toArray()

Execute traversal and return all reachable nodes.

```typescript
toArray(): Node[]
```

**Returns:** Array of nodes reached during traversal

**Example:**

```typescript
const nodes = db.traverse(jobId)
  .out('SIMILAR_TO')
  .maxDepth(3)
  .toArray();

console.log(`Found ${nodes.length} similar jobs`);
```

#### toPaths()

Execute traversal and return paths (array of node arrays).

```typescript
toPaths(): Node[][]
```

**Returns:** Array of paths, where each path is an array of nodes

**Example:**

```typescript
const paths = db.traverse(jobId)
  .out('SIMILAR_TO')
  .maxDepth(2)
  .toPaths();

paths.forEach(path => {
  console.log('Path:', path.map(n => n.id).join(' -> '));
});
```

#### shortestPath()

Find the shortest path to a target node using BFS.

```typescript
shortestPath(targetNodeId: number): Node[] | null
```

**Parameters:**
- `targetNodeId` (number): ID of target node to find path to

**Returns:** Array of nodes representing the shortest path, or null if no path exists

**Example:**

```typescript
const path = db.traverse(job1Id)
  .shortestPath(job2Id);

if (path) {
  console.log('Path:', path.map(n => n.properties.title).join(' -> '));
}
```

#### paths()

Find paths to a target node with optional constraints.

```typescript
paths(targetNodeId: number, options?: {
  maxPaths?: number;
  maxDepth?: number;
}): Node[][]
```

**Parameters:**
- `targetNodeId` (number): ID of target node
- `options` (object, optional): Path finding configuration
  - `maxPaths` (number): Maximum number of paths to return
  - `maxDepth` (number): Maximum depth to search

**Returns:** Array of paths, where each path is an array of nodes

**Example:**

```typescript
// Find all paths
const allPaths = db.traverse(job1Id).paths(job2Id);

// Limit number of paths
const limitedPaths = db.traverse(job1Id).paths(job2Id, { maxPaths: 5 });

// With maxDepth constraint
const shortPaths = db.traverse(job1Id).paths(job2Id, { maxDepth: 3 });
```

#### allPaths()

Find all paths to a target node (up to a maximum number).

```typescript
allPaths(targetNodeId: number, maxPaths?: number): Node[][]
```

**Parameters:**
- `targetNodeId` (number): ID of target node
- `maxPaths` (number, optional): Maximum number of paths to return (default: 10)

**Returns:** Array of paths, where each path is an array of nodes

**Example:**

```typescript
const paths = db.traverse(job1Id)
  .allPaths(job2Id, 5);

console.log(`Found ${paths.length} paths`);
```

---

## Transactions

### TransactionContext

Context object provided to transaction callbacks. Allows manual control over transaction lifecycle with commit, rollback, and savepoints.

#### transaction()

Execute a function within a transaction. Automatically commits on success or rolls back on error, unless manually controlled.

```typescript
transaction<T>(fn: (ctx: TransactionContext) => T): T
```

**Parameters:**
- `fn` (function): Function to execute within transaction, receives TransactionContext

**Returns:** The return value of the transaction function

**Throws:**
- `Error`: If transaction function throws (after rollback)

**Example:**

```typescript
// Automatic commit/rollback
const result = db.transaction((ctx) => {
  const job = db.createNode('Job', { title: 'Engineer' });
  const company = db.createNode('Company', { name: 'TechCorp' });
  db.createEdge('POSTED_BY', job.id, company.id);
  return { job, company };
});

// Manual control with savepoints
db.transaction((ctx) => {
  const job = db.createNode('Job', { title: 'Test' });
  ctx.savepoint('job_created');

  try {
    db.createEdge('POSTED_BY', job.id, companyId);
  } catch (err) {
    ctx.rollbackTo('job_created');
  }

  ctx.commit();
});
```

#### commit()

Manually commit the transaction. After calling this, the transaction is finalized.

```typescript
commit(): void
```

**Throws:**
- `TransactionAlreadyFinalizedError`: If transaction was already committed or rolled back

**Example:**

```typescript
db.transaction((ctx) => {
  db.createNode('Job', { title: 'Test' });
  ctx.commit(); // Manual commit
});
```

#### rollback()

Manually rollback the transaction. All changes made in the transaction will be discarded.

```typescript
rollback(): void
```

**Throws:**
- `TransactionAlreadyFinalizedError`: If transaction was already committed or rolled back

**Example:**

```typescript
db.transaction((ctx) => {
  db.createNode('Job', { title: 'Test' });
  if (someCondition) {
    ctx.rollback(); // Discard changes
    return;
  }
});
```

#### savepoint()

Create a named savepoint within the transaction. Allows partial rollback to this point later.

```typescript
savepoint(name: string): void
```

**Parameters:**
- `name` (string): Name for the savepoint

**Throws:**
- `Error`: If savepoint with this name already exists

**Example:**

```typescript
db.transaction((ctx) => {
  db.createNode('Job', { title: 'Job 1' });
  ctx.savepoint('sp1');
  db.createNode('Job', { title: 'Job 2' });
  ctx.rollbackTo('sp1'); // Only Job 1 remains
});
```

#### rollbackTo()

Rollback to a previously created savepoint. All changes after the savepoint are discarded.

```typescript
rollbackTo(name: string): void
```

**Parameters:**
- `name` (string): Name of the savepoint to rollback to

**Throws:**
- `Error`: If savepoint doesn't exist

**Example:**

```typescript
db.transaction((ctx) => {
  db.createNode('Job', { title: 'Job 1' });
  ctx.savepoint('sp1');
  db.createNode('Job', { title: 'Job 2' });
  ctx.rollbackTo('sp1'); // Job 2 is discarded
  db.createNode('Job', { title: 'Job 3' }); // Can continue
});
```

#### releaseSavepoint()

Release a savepoint, making its changes permanent within the transaction.

```typescript
releaseSavepoint(name: string): void
```

**Parameters:**
- `name` (string): Name of the savepoint to release

**Throws:**
- `Error`: If savepoint doesn't exist

**Example:**

```typescript
db.transaction((ctx) => {
  db.createNode('Job', { title: 'Job 1' });
  ctx.savepoint('sp1');
  db.createNode('Job', { title: 'Job 2' });
  ctx.releaseSavepoint('sp1'); // Can't rollback to sp1 anymore
});
```

---

## Import/Export

### export()

Export the entire graph to a portable format.

```typescript
export(): GraphExport
```

**Returns:** Object containing all nodes and edges with metadata

**Example:**

```typescript
const data = db.export();
fs.writeFileSync('graph-backup.json', JSON.stringify(data, null, 2));
```

### import()

Import graph data from export format. Note: This does not clear existing data.

```typescript
import(data: GraphExport): void
```

**Parameters:**
- `data` (GraphExport): Graph export data

**Throws:**
- `Error`: If import fails

**Example:**

```typescript
const data = JSON.parse(fs.readFileSync('graph-backup.json', 'utf8'));
db.import(data);
```

### close()

Close the database connection. After calling this, the database instance should not be used.

```typescript
close(): void
```

**Example:**

```typescript
db.close();
```

---

## Types

### Node

Represents a node in the graph database.

```typescript
interface Node<T extends NodeData = NodeData> {
  id: number;
  type: string;
  properties: T;
  createdAt: Date;
  updatedAt: Date;
}
```

### Edge

Represents an edge (relationship) in the graph database.

```typescript
interface Edge<T extends NodeData = NodeData> {
  id: number;
  type: string;
  from: number;
  to: number;
  properties?: T;
  createdAt: Date;
}
```

### NodeData

Base type for node/edge property data.

```typescript
interface NodeData {
  [key: string]: any;
}
```

### GraphSchema

Schema definition for the graph database.

```typescript
interface GraphSchema {
  nodes: {
    [nodeType: string]: {
      properties?: string[];
      indexes?: string[];
    };
  };
  edges: {
    [edgeType: string]: {
      from: string;
      to: string;
      properties?: string[];
    };
  };
}
```

### DatabaseOptions

Options for database initialization.

```typescript
interface DatabaseOptions {
  schema?: GraphSchema;
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: (message?: any, ...additionalArgs: any[]) => void;
}
```

### TraversalDirection

Direction for traversing edges.

```typescript
type TraversalDirection = 'out' | 'in' | 'both';
```

### GraphExport

Graph export format.

```typescript
interface GraphExport {
  nodes: Node[];
  edges: Edge[];
  metadata?: {
    version: string;
    exportedAt: string;
  };
}
```

---

## Error Handling

### Common Errors

#### TransactionAlreadyFinalizedError

Thrown when attempting to use a transaction that has already been committed or rolled back.

```typescript
class TransactionAlreadyFinalizedError extends Error {
  name: 'TransactionAlreadyFinalizedError';
}
```

#### Validation Errors

The following errors may be thrown during validation:

- **Invalid node type**: Node type is empty or contains invalid characters
- **Invalid edge type**: Edge type is empty or contains invalid characters
- **Invalid node ID**: Node ID is not a positive integer
- **Node not found**: Referenced node does not exist
- **Schema validation failed**: Properties don't match schema requirements

#### Database Errors

SQLite errors are propagated from better-sqlite3:
- **SQLITE_CONSTRAINT**: Constraint violation (e.g., foreign key)
- **SQLITE_BUSY**: Database is locked
- **SQLITE_FULL**: Database or disk is full

---

## Complete Examples

### Job Search Graph

```typescript
import { GraphDatabase } from 'sqlite-graph';

const db = new GraphDatabase('./jobs.db');

// Create nodes
const job = db.createNode('Job', {
  title: 'Senior Agentic Engineer',
  url: 'https://example.com/job/123',
  status: 'discovered',
  salary: { min: 150000, max: 200000 },
  remote: true
});

const company = db.createNode('Company', {
  name: 'TechCorp',
  url: 'https://techcorp.com',
  industry: 'SaaS'
});

const skill1 = db.createNode('Skill', {
  name: 'TypeScript',
  category: 'programming'
});

const skill2 = db.createNode('Skill', {
  name: 'React',
  category: 'framework'
});

// Create relationships
db.createEdge('POSTED_BY', job.id, company.id);
db.createEdge('REQUIRES', job.id, skill1.id, {
  level: 'expert',
  required: true
});
db.createEdge('REQUIRES', job.id, skill2.id, {
  level: 'intermediate',
  required: false
});

// Query: Find all active remote jobs
const remoteJobs = db.nodes('Job')
  .where({ status: 'active', remote: true })
  .exec();

// Query: Find jobs requiring TypeScript
const tsJobs = db.nodes('Job')
  .connectedTo('Skill', 'REQUIRES')
  .filter(job => {
    // Additional filtering in JavaScript
    return job.properties.salary?.min >= 150000;
  })
  .orderBy('created_at', 'desc')
  .limit(20)
  .exec();

// Query: Find all skills required by jobs at TechCorp
const techCorpSkills = db.nodes('Skill')
  .connectedTo('Job', 'REQUIRES', 'in')
  .connectedTo('Company', 'POSTED_BY')
  .exec();

// Traversal: Find similar jobs
const similarJobs = db.traverse(job.id)
  .out('SIMILAR_TO')
  .maxDepth(2)
  .unique()
  .toArray();

// Transaction: Apply to multiple jobs atomically
db.transaction((ctx) => {
  for (const jobId of [1, 2, 3]) {
    db.updateNode(jobId, {
      status: 'applied',
      appliedAt: new Date().toISOString()
    });
  }
  // Auto-commits on success
});

db.close();
```

### Social Network Graph

```typescript
const db = new GraphDatabase(':memory:');

// Create people
const alice = db.createNode('Person', { name: 'Alice', age: 30 });
const bob = db.createNode('Person', { name: 'Bob', age: 28 });
const charlie = db.createNode('Person', { name: 'Charlie', age: 35 });

// Create relationships
db.createEdge('KNOWS', alice.id, bob.id);
db.createEdge('KNOWS', bob.id, charlie.id);
db.createEdge('KNOWS', alice.id, charlie.id);

// Find all of Alice's connections (both directions)
const aliceConnections = db.nodes('Person')
  .connectedTo('Person', 'KNOWS', 'both')
  .where({ id: alice.id })
  .exec();

// Find shortest path between Alice and Charlie
const path = db.traverse(alice.id)
  .shortestPath(charlie.id);

console.log('Path:', path?.map(n => n.properties.name).join(' -> '));

// Find all paths with depth limit
const allPaths = db.traverse(alice.id)
  .paths(charlie.id, { maxPaths: 5, maxDepth: 3 });

db.close();
```

---

## Performance Tips

1. **Use prepared statements**: The database automatically prepares frequently used statements
2. **Batch operations**: Use transactions for bulk inserts/updates
3. **Index properly**: Define indexes in schema for frequently queried properties
4. **Use filters wisely**: SQL `where()` is faster than JavaScript `filter()`
5. **Limit results**: Use `limit()` to reduce memory usage for large result sets
6. **Close connections**: Always call `close()` when done

---

## See Also

- [README.md](../README.md) - Getting started guide
- [examples/](../examples/) - Additional code examples
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Underlying SQLite library
