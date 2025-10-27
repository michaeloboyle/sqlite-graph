# sqlite-graph API Interface Specification

> Complete TypeScript interface definitions with JSDoc for the sqlite-graph public API

**Version:** 1.0.0
**Status:** Specification Phase
**Last Updated:** 2025-10-27

## Table of Contents

1. [GraphDatabase Class](#graphdatabase-class)
2. [NodeQuery Class](#nodequery-class)
3. [TraversalQuery Class](#traversalquery-class)
4. [TransactionContext Class](#transactioncontext-class)
5. [Type Definitions](#type-definitions)
6. [Error Handling](#error-handling)

---

## GraphDatabase Class

The main entry point for interacting with the graph database. Provides methods for CRUD operations on nodes and edges, as well as query builders for complex operations.

### Constructor

```typescript
/**
 * Creates a new GraphDatabase instance
 *
 * @param path - Path to the SQLite database file. Use ':memory:' for in-memory database.
 * @param options - Optional configuration for database initialization
 *
 * @throws {Error} If database file cannot be created or opened
 * @throws {Error} If schema initialization fails
 *
 * @example
 * ```typescript
 * // File-based database
 * const db = new GraphDatabase('./graph.db');
 *
 * // In-memory database
 * const memDb = new GraphDatabase(':memory:');
 *
 * // With schema validation
 * const db = new GraphDatabase('./graph.db', {
 *   schema: {
 *     nodes: {
 *       Job: { properties: ['title', 'url', 'status'] },
 *       Company: { properties: ['name', 'industry'] }
 *     },
 *     edges: {
 *       POSTED_BY: { from: 'Job', to: 'Company' }
 *     }
 *   }
 * });
 *
 * // Read-only mode
 * const readDb = new GraphDatabase('./graph.db', { readonly: true });
 * ```
 */
constructor(path: string, options?: DatabaseOptions);
```

### Node Operations

#### createNode

```typescript
/**
 * Creates a new node in the graph database
 *
 * @template T - Type of the node properties (extends NodeData)
 * @param type - The type/label of the node (e.g., 'Job', 'Company')
 * @param properties - Data to store in the node
 *
 * @returns The created node with generated id and timestamps
 *
 * @throws {ValidationError} If properties don't match schema (when schema is defined)
 * @throws {Error} If database insert fails
 *
 * @example
 * ```typescript
 * interface JobData {
 *   title: string;
 *   url: string;
 *   status: 'discovered' | 'active' | 'rejected';
 * }
 *
 * const job = db.createNode<JobData>('Job', {
 *   title: 'Senior Engineer',
 *   url: 'https://example.com/job/123',
 *   status: 'discovered'
 * });
 * // Returns: { id: 1, type: 'Job', properties: {...}, createdAt: Date, updatedAt: Date }
 * ```
 */
createNode<T extends NodeData = NodeData>(
  type: string,
  properties: T
): Node<T>;
```

#### getNode

```typescript
/**
 * Retrieves a node by its ID
 *
 * @template T - Type of the node properties (extends NodeData)
 * @param id - The unique identifier of the node
 *
 * @returns The node if found, null otherwise
 *
 * @throws {Error} If database query fails
 *
 * @example
 * ```typescript
 * const job = db.getNode<JobData>(1);
 * if (job) {
 *   console.log(job.properties.title); // Type-safe access
 * }
 *
 * // Returns null if not found
 * const missing = db.getNode(999); // null
 * ```
 */
getNode<T extends NodeData = NodeData>(id: number): Node<T> | null;
```

#### updateNode

```typescript
/**
 * Updates a node's properties (partial update)
 *
 * @template T - Type of the node properties (extends NodeData)
 * @param id - The unique identifier of the node to update
 * @param properties - Partial properties to update (merged with existing)
 *
 * @returns The updated node, or null if node doesn't exist
 *
 * @throws {ValidationError} If updated properties don't match schema
 * @throws {Error} If database update fails
 *
 * @example
 * ```typescript
 * // Partial update - only changes status, preserves other properties
 * const updated = db.updateNode<JobData>(1, { status: 'active' });
 *
 * // Multiple property update
 * db.updateNode(1, {
 *   status: 'rejected',
 *   rejectionReason: 'Not a good fit'
 * });
 *
 * // Returns null if node doesn't exist
 * const result = db.updateNode(999, { status: 'active' }); // null
 * ```
 */
updateNode<T extends NodeData = NodeData>(
  id: number,
  properties: Partial<T>
): Node<T> | null;
```

#### deleteNode

```typescript
/**
 * Deletes a node and all its connected edges
 *
 * @param id - The unique identifier of the node to delete
 *
 * @returns true if node was deleted, false if node didn't exist
 *
 * @throws {Error} If database delete fails
 *
 * @example
 * ```typescript
 * const deleted = db.deleteNode(1);
 * if (deleted) {
 *   console.log('Node and all its edges were deleted');
 * }
 *
 * // Cascade delete - removes all edges connected to this node
 * db.createEdge('SIMILAR_TO', 1, 2);
 * db.deleteNode(1); // Also removes the SIMILAR_TO edge
 * ```
 */
deleteNode(id: number): boolean;
```

### Edge Operations

#### createEdge

```typescript
/**
 * Creates a new edge (relationship) between two nodes
 *
 * @template T - Type of the edge properties (extends NodeData)
 * @param type - The type/label of the edge (e.g., 'POSTED_BY', 'REQUIRES')
 * @param fromId - ID of the source node
 * @param toId - ID of the target node
 * @param properties - Optional data to store on the edge
 *
 * @returns The created edge with generated id and timestamp
 *
 * @throws {Error} If source or target node doesn't exist
 * @throws {ValidationError} If edge type not allowed by schema
 * @throws {Error} If database insert fails
 *
 * @example
 * ```typescript
 * // Simple edge without properties
 * const edge = db.createEdge('POSTED_BY', jobId, companyId);
 *
 * // Edge with properties
 * interface ApplicationEdge {
 *   appliedAt: string;
 *   source: string;
 * }
 *
 * const app = db.createEdge<ApplicationEdge>('APPLIED_TO', userId, jobId, {
 *   appliedAt: new Date().toISOString(),
 *   source: 'LinkedIn'
 * });
 * ```
 */
createEdge<T extends NodeData = NodeData>(
  type: string,
  fromId: number,
  toId: number,
  properties?: T
): Edge<T>;
```

#### getEdge

```typescript
/**
 * Retrieves an edge by its ID
 *
 * @template T - Type of the edge properties (extends NodeData)
 * @param id - The unique identifier of the edge
 *
 * @returns The edge if found, null otherwise
 *
 * @throws {Error} If database query fails
 *
 * @example
 * ```typescript
 * const edge = db.getEdge<ApplicationEdge>(1);
 * if (edge) {
 *   console.log(`Applied at: ${edge.properties?.appliedAt}`);
 * }
 * ```
 */
getEdge<T extends NodeData = NodeData>(id: number): Edge<T> | null;
```

#### deleteEdge

```typescript
/**
 * Deletes an edge by its ID
 *
 * @param id - The unique identifier of the edge to delete
 *
 * @returns true if edge was deleted, false if edge didn't exist
 *
 * @throws {Error} If database delete fails
 *
 * @example
 * ```typescript
 * const deleted = db.deleteEdge(1);
 * if (deleted) {
 *   console.log('Edge was removed');
 * }
 * ```
 */
deleteEdge(id: number): boolean;
```

### Query Builders

#### nodes

```typescript
/**
 * Creates a NodeQuery builder for querying nodes
 *
 * @template T - Type of the node properties (extends NodeData)
 * @param type - The type of nodes to query (e.g., 'Job', 'Company')
 *
 * @returns A NodeQuery instance for building and executing queries
 *
 * @example
 * ```typescript
 * // Simple type query
 * const jobs = db.nodes<JobData>('Job').exec();
 *
 * // With filters
 * const activeJobs = db.nodes<JobData>('Job')
 *   .where({ status: 'active' })
 *   .orderBy('created_at', 'desc')
 *   .limit(10)
 *   .exec();
 *
 * // With relationships
 * const jobsFromSaaS = db.nodes<JobData>('Job')
 *   .connectedTo('Company', 'POSTED_BY')
 *   .filter({ industry: 'SaaS' })
 *   .exec();
 * ```
 */
nodes<T extends NodeData = NodeData>(type: string): NodeQuery<T>;
```

#### traverse

```typescript
/**
 * Creates a TraversalQuery builder for graph traversal
 *
 * @param startNodeId - ID of the node to start traversal from
 *
 * @returns A TraversalQuery instance for building traversal operations
 *
 * @throws {Error} If start node doesn't exist
 *
 * @example
 * ```typescript
 * // Outgoing traversal
 * const similar = db.traverse(jobId)
 *   .out('SIMILAR_TO')
 *   .maxDepth(2)
 *   .toArray();
 *
 * // Bidirectional traversal with filters
 * const network = db.traverse(userId)
 *   .both('CONNECTED_TO')
 *   .filter(node => node.properties.active === true)
 *   .maxDepth(3)
 *   .toArray();
 *
 * // Shortest path
 * const path = db.traverse(startId)
 *   .shortestPath(endId);
 * ```
 */
traverse(startNodeId: number): TraversalQuery;
```

### Transaction Management

#### transaction

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
 * // Nested transactions (uses savepoints)
 * db.transaction(() => {
 *   const job = db.createNode('Job', { title: 'Engineer' });
 *
 *   db.transaction(() => {
 *     // Inner transaction
 *     db.createNode('Company', { name: 'TechCorp' });
 *   });
 * });
 * ```
 */
transaction<T>(fn: (ctx: TransactionContext) => T): T;
```

### Utility Methods

#### close

```typescript
/**
 * Closes the database connection
 *
 * @throws {Error} If close operation fails
 *
 * @example
 * ```typescript
 * const db = new GraphDatabase('./graph.db');
 * // ... perform operations
 * db.close();
 * ```
 */
close(): void;
```

---

## NodeQuery Class

Fluent API for building and executing node queries with filters, relationships, and ordering.

### Query Building Methods

#### where

```typescript
/**
 * Filters nodes by exact property matches
 *
 * @param conditions - Object with property key-value pairs to match
 *
 * @returns This query instance for method chaining
 *
 * @example
 * ```typescript
 * // Single condition
 * const jobs = db.nodes('Job')
 *   .where({ status: 'active' })
 *   .exec();
 *
 * // Multiple conditions (AND logic)
 * const filtered = db.nodes('Job')
 *   .where({ status: 'active', remote: true })
 *   .exec();
 *
 * // Nested properties
 * const matched = db.nodes('Job')
 *   .where({ 'location.city': 'San Francisco' })
 *   .exec();
 * ```
 */
where(conditions: Partial<T>): NodeQuery<T>;
```

#### connectedTo

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
 * // Jobs connected to SaaS companies
 * const jobs = db.nodes('Job')
 *   .connectedTo('Company', 'POSTED_BY', 'out')
 *   .exec();
 *
 * // Bidirectional (default is 'out')
 * const similar = db.nodes('Job')
 *   .where({ status: 'active' })
 *   .connectedTo('Job', 'SIMILAR_TO', 'both')
 *   .exec();
 *
 * // Incoming edges
 * const companies = db.nodes('Company')
 *   .connectedTo('Job', 'POSTED_BY', 'in')
 *   .exec();
 * ```
 */
connectedTo(
  nodeType: string,
  edgeType: string,
  direction?: TraversalDirection
): NodeQuery<T>;
```

#### filter

```typescript
/**
 * Filters nodes using a predicate function
 *
 * @param predicate - Function that returns true for nodes to include
 *
 * @returns This query instance for method chaining
 *
 * @example
 * ```typescript
 * // Custom filter logic
 * const jobs = db.nodes<JobData>('Job')
 *   .filter(node => {
 *     const salary = node.properties.salary;
 *     return salary && salary > 100000;
 *   })
 *   .exec();
 *
 * // Complex conditions
 * const filtered = db.nodes('Job')
 *   .filter(node => {
 *     const props = node.properties;
 *     return props.remote || props.location?.city === 'San Francisco';
 *   })
 *   .exec();
 *
 * // Combining with other filters
 * const results = db.nodes('Job')
 *   .where({ status: 'active' })
 *   .filter(node => new Date(node.createdAt) > new Date('2024-01-01'))
 *   .exec();
 * ```
 */
filter(predicate: (node: Node<T>) => boolean): NodeQuery<T>;
```

#### orderBy

```typescript
/**
 * Orders results by a property or timestamp field
 *
 * @param field - Property name or 'created_at'/'updated_at' for timestamps
 * @param direction - Sort direction ('asc' or 'desc')
 *
 * @returns This query instance for method chaining
 *
 * @example
 * ```typescript
 * // Sort by creation time (newest first)
 * const recent = db.nodes('Job')
 *   .orderBy('created_at', 'desc')
 *   .exec();
 *
 * // Sort by property
 * const alphabetical = db.nodes('Company')
 *   .orderBy('name', 'asc')
 *   .exec();
 *
 * // Multiple orderBy calls (secondary sorting)
 * const sorted = db.nodes('Job')
 *   .orderBy('status', 'asc')
 *   .orderBy('created_at', 'desc')
 *   .exec();
 * ```
 */
orderBy(field: string, direction?: 'asc' | 'desc'): NodeQuery<T>;
```

#### limit

```typescript
/**
 * Limits the number of results returned
 *
 * @param count - Maximum number of nodes to return
 *
 * @returns This query instance for method chaining
 *
 * @throws {Error} If count is negative
 *
 * @example
 * ```typescript
 * // Get first 10 results
 * const jobs = db.nodes('Job')
 *   .orderBy('created_at', 'desc')
 *   .limit(10)
 *   .exec();
 *
 * // Pagination with offset (future feature)
 * const page2 = db.nodes('Job')
 *   .limit(10)
 *   .offset(10)
 *   .exec();
 * ```
 */
limit(count: number): NodeQuery<T>;
```

#### offset

```typescript
/**
 * Skips a number of results (for pagination)
 *
 * @param count - Number of nodes to skip
 *
 * @returns This query instance for method chaining
 *
 * @throws {Error} If count is negative
 *
 * @example
 * ```typescript
 * // Pagination
 * const pageSize = 10;
 * const page = 2;
 *
 * const results = db.nodes('Job')
 *   .orderBy('created_at', 'desc')
 *   .limit(pageSize)
 *   .offset((page - 1) * pageSize)
 *   .exec();
 * ```
 */
offset(count: number): NodeQuery<T>;
```

### Query Execution

#### exec

```typescript
/**
 * Executes the query and returns matching nodes
 *
 * @returns Array of nodes matching the query criteria
 *
 * @throws {Error} If query execution fails
 *
 * @example
 * ```typescript
 * // Build and execute query
 * const jobs = db.nodes<JobData>('Job')
 *   .where({ status: 'active' })
 *   .orderBy('created_at', 'desc')
 *   .limit(10)
 *   .exec();
 *
 * jobs.forEach(job => {
 *   console.log(job.properties.title);
 * });
 *
 * // Empty array if no matches
 * const none = db.nodes('Job')
 *   .where({ status: 'nonexistent' })
 *   .exec(); // []
 * ```
 */
exec(): Node<T>[];
```

#### count

```typescript
/**
 * Counts the number of nodes matching the query
 *
 * @returns Number of matching nodes
 *
 * @throws {Error} If count query fails
 *
 * @example
 * ```typescript
 * // Count active jobs
 * const activeCount = db.nodes('Job')
 *   .where({ status: 'active' })
 *   .count();
 *
 * console.log(`Found ${activeCount} active jobs`);
 *
 * // Total count
 * const total = db.nodes('Job').count();
 * ```
 */
count(): number;
```

#### first

```typescript
/**
 * Returns the first node matching the query
 *
 * @returns First matching node, or null if no matches
 *
 * @throws {Error} If query execution fails
 *
 * @example
 * ```typescript
 * // Get most recent job
 * const latest = db.nodes<JobData>('Job')
 *   .orderBy('created_at', 'desc')
 *   .first();
 *
 * if (latest) {
 *   console.log(`Latest job: ${latest.properties.title}`);
 * }
 *
 * // Returns null if no matches
 * const none = db.nodes('Job')
 *   .where({ status: 'impossible' })
 *   .first(); // null
 * ```
 */
first(): Node<T> | null;
```

---

## TraversalQuery Class

Fluent API for graph traversal operations including BFS, DFS, and path finding.

### Traversal Direction Methods

#### out

```typescript
/**
 * Traverse outgoing edges of specified type
 *
 * @param edgeType - Type of edges to follow (e.g., 'SIMILAR_TO')
 *
 * @returns This traversal query instance for method chaining
 *
 * @example
 * ```typescript
 * // Follow SIMILAR_TO edges
 * const similar = db.traverse(jobId)
 *   .out('SIMILAR_TO')
 *   .toArray();
 *
 * // Chain multiple edge types
 * const related = db.traverse(jobId)
 *   .out('POSTED_BY')
 *   .out('LOCATED_IN')
 *   .toArray();
 * ```
 */
out(edgeType: string): TraversalQuery;
```

#### in

```typescript
/**
 * Traverse incoming edges of specified type
 *
 * @param edgeType - Type of edges to follow backwards
 *
 * @returns This traversal query instance for method chaining
 *
 * @example
 * ```typescript
 * // Find all jobs posted by a company
 * const jobs = db.traverse(companyId)
 *   .in('POSTED_BY')
 *   .toArray();
 *
 * // Multi-hop incoming traversal
 * const applicants = db.traverse(jobId)
 *   .in('APPLIED_TO')
 *   .toArray();
 * ```
 */
in(edgeType: string): TraversalQuery;
```

#### both

```typescript
/**
 * Traverse edges in both directions
 *
 * @param edgeType - Type of edges to follow bidirectionally
 *
 * @returns This traversal query instance for method chaining
 *
 * @example
 * ```typescript
 * // Find all similar jobs (bidirectional)
 * const network = db.traverse(jobId)
 *   .both('SIMILAR_TO')
 *   .maxDepth(2)
 *   .toArray();
 *
 * // Social network traversal
 * const connections = db.traverse(userId)
 *   .both('CONNECTED_TO')
 *   .maxDepth(3)
 *   .toArray();
 * ```
 */
both(edgeType: string): TraversalQuery;
```

### Filtering Methods

#### filter

```typescript
/**
 * Filters traversed nodes using a predicate function
 *
 * @param predicate - Function that returns true for nodes to include
 *
 * @returns This traversal query instance for method chaining
 *
 * @example
 * ```typescript
 * // Filter by property
 * const active = db.traverse(jobId)
 *   .out('SIMILAR_TO')
 *   .filter(node => node.properties.status === 'active')
 *   .toArray();
 *
 * // Complex filter
 * const filtered = db.traverse(userId)
 *   .both('CONNECTED_TO')
 *   .filter(node => {
 *     return node.type === 'User' &&
 *            node.properties.active &&
 *            new Date(node.createdAt) > new Date('2024-01-01');
 *   })
 *   .toArray();
 * ```
 */
filter(predicate: (node: Node) => boolean): TraversalQuery;
```

#### maxDepth

```typescript
/**
 * Sets maximum traversal depth (number of hops)
 *
 * @param depth - Maximum number of edges to traverse
 *
 * @returns This traversal query instance for method chaining
 *
 * @throws {Error} If depth is negative
 *
 * @example
 * ```typescript
 * // 1 hop (direct connections only)
 * const direct = db.traverse(jobId)
 *   .out('SIMILAR_TO')
 *   .maxDepth(1)
 *   .toArray();
 *
 * // 3 hops (extended network)
 * const extended = db.traverse(userId)
 *   .both('CONNECTED_TO')
 *   .maxDepth(3)
 *   .toArray();
 *
 * // Unlimited depth (default, use with caution)
 * const all = db.traverse(nodeId)
 *   .out('RELATED_TO')
 *   .toArray();
 * ```
 */
maxDepth(depth: number): TraversalQuery;
```

#### minDepth

```typescript
/**
 * Sets minimum traversal depth (excludes closer nodes)
 *
 * @param depth - Minimum number of edges that must be traversed
 *
 * @returns This traversal query instance for method chaining
 *
 * @throws {Error} If depth is negative
 *
 * @example
 * ```typescript
 * // Only nodes 2+ hops away
 * const distant = db.traverse(jobId)
 *   .out('SIMILAR_TO')
 *   .minDepth(2)
 *   .maxDepth(3)
 *   .toArray();
 * ```
 */
minDepth(depth: number): TraversalQuery;
```

### Execution Methods

#### toArray

```typescript
/**
 * Executes traversal and returns all matching nodes
 *
 * @returns Array of nodes found during traversal
 *
 * @throws {Error} If traversal execution fails
 * @throws {Error} If traversal depth exceeds limits (safety check)
 *
 * @example
 * ```typescript
 * // Get all similar jobs
 * const similar = db.traverse(jobId)
 *   .out('SIMILAR_TO')
 *   .maxDepth(2)
 *   .toArray();
 *
 * similar.forEach(job => {
 *   console.log(job.properties.title);
 * });
 *
 * // Empty array if no matches
 * const none = db.traverse(isolatedNodeId)
 *   .out('NONEXISTENT')
 *   .toArray(); // []
 * ```
 */
toArray(): Node[];
```

#### shortestPath

```typescript
/**
 * Finds the shortest path between start node and target node
 *
 * @param targetNodeId - ID of the destination node
 * @param options - Optional configuration for path finding
 *
 * @returns Array of nodes representing the path, or null if no path exists
 *
 * @throws {Error} If target node doesn't exist
 * @throws {Error} If path finding fails
 *
 * @example
 * ```typescript
 * // Find shortest path between two jobs
 * const path = db.traverse(jobId1)
 *   .shortestPath(jobId2);
 *
 * if (path) {
 *   console.log(`Path length: ${path.length - 1} hops`);
 *   path.forEach((node, i) => {
 *     console.log(`${i}: ${node.type} ${node.id}`);
 *   });
 * } else {
 *   console.log('No path exists');
 * }
 *
 * // With edge type filtering
 * const constrainedPath = db.traverse(nodeId1)
 *   .out('SIMILAR_TO')
 *   .shortestPath(nodeId2);
 *
 * // Returns null if no path exists
 * const isolated = db.traverse(node1)
 *   .shortestPath(isolatedNode); // null
 * ```
 */
shortestPath(targetNodeId: number, options?: PathOptions): Node[] | null;
```

#### paths

```typescript
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
 *   .paths(jobId2, { maxPaths: 10, maxDepth: 5 });
 *
 * console.log(`Found ${allPaths.length} paths`);
 * allPaths.forEach((path, i) => {
 *   console.log(`Path ${i + 1}: ${path.length - 1} hops`);
 * });
 *
 * // Empty array if no paths exist
 * const none = db.traverse(node1)
 *   .paths(isolatedNode); // []
 * ```
 */
paths(targetNodeId: number, options?: PathOptions): Node[][];
```

---

## TransactionContext Class

Context object provided to transaction functions for manual commit/rollback control.

### Methods

#### commit

```typescript
/**
 * Manually commits the current transaction
 *
 * Note: Transactions auto-commit on successful function completion.
 * This method is only needed for explicit early commit.
 *
 * @throws {Error} If commit fails
 * @throws {Error} If called outside a transaction
 *
 * @example
 * ```typescript
 * db.transaction((ctx) => {
 *   const node = db.createNode('Job', { title: 'Engineer' });
 *
 *   // Explicit commit (usually not needed)
 *   ctx.commit();
 *
 *   // Further operations after commit
 *   console.log('Transaction committed');
 * });
 * ```
 */
commit(): void;
```

#### rollback

```typescript
/**
 * Manually rolls back the current transaction
 *
 * Note: Transactions auto-rollback on thrown errors.
 * This method is for explicit rollback without throwing.
 *
 * @throws {Error} If rollback fails
 * @throws {Error} If called outside a transaction
 *
 * @example
 * ```typescript
 * db.transaction((ctx) => {
 *   const node = db.createNode('Job', { title: 'Engineer' });
 *
 *   if (someCondition) {
 *     // Explicit rollback
 *     ctx.rollback();
 *     return; // Exit transaction
 *   }
 *
 *   // Continue with transaction
 *   db.createNode('Company', { name: 'TechCorp' });
 * });
 * ```
 */
rollback(): void;
```

#### savepoint

```typescript
/**
 * Creates a named savepoint for partial rollback
 *
 * @param name - Name of the savepoint
 *
 * @throws {Error} If savepoint creation fails
 *
 * @example
 * ```typescript
 * db.transaction((ctx) => {
 *   const job = db.createNode('Job', { title: 'Engineer' });
 *
 *   ctx.savepoint('before_company');
 *
 *   try {
 *     db.createNode('Company', { name: 'TechCorp' });
 *   } catch (error) {
 *     // Rollback to savepoint
 *     ctx.rollbackTo('before_company');
 *   }
 * });
 * ```
 */
savepoint(name: string): void;
```

#### rollbackTo

```typescript
/**
 * Rolls back to a named savepoint
 *
 * @param name - Name of the savepoint to rollback to
 *
 * @throws {Error} If savepoint doesn't exist
 * @throws {Error} If rollback fails
 *
 * @example
 * ```typescript
 * // See savepoint() example above
 * ```
 */
rollbackTo(name: string): void;
```

---

## Type Definitions

### Core Types

```typescript
/**
 * Base type for node/edge property data
 */
export interface NodeData {
  [key: string]: any;
}

/**
 * Represents a node in the graph database
 */
export interface Node<T extends NodeData = NodeData> {
  id: number;
  type: string;
  properties: T;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents an edge (relationship) in the graph database
 */
export interface Edge<T extends NodeData = NodeData> {
  id: number;
  type: string;
  from: number;
  to: number;
  properties?: T;
  createdAt: Date;
}
```

### Configuration Types

```typescript
/**
 * Options for database initialization
 */
export interface DatabaseOptions {
  /** Optional schema definition for validation */
  schema?: GraphSchema;

  /** Open database in read-only mode */
  readonly?: boolean;

  /** Throw error if database file doesn't exist */
  fileMustExist?: boolean;

  /** Timeout in milliseconds for acquiring locks */
  timeout?: number;

  /** Function to log SQL statements (for debugging) */
  verbose?: (message?: any, ...additionalArgs: any[]) => void;
}

/**
 * Schema definition for the graph database
 */
export interface GraphSchema {
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

### Query Types

```typescript
/**
 * Direction for traversing edges
 */
export type TraversalDirection = 'out' | 'in' | 'both';

/**
 * Options for path finding algorithms
 */
export interface PathOptions {
  /** Maximum number of paths to return */
  maxPaths?: number;

  /** Maximum depth to search */
  maxDepth?: number;

  /** Filter function for valid path nodes */
  nodeFilter?: (node: Node) => boolean;

  /** Filter function for valid path edges */
  edgeFilter?: (edge: Edge) => boolean;
}
```

---

## Error Handling

### Error Types

```typescript
/**
 * Base error class for all sqlite-graph errors
 */
export class GraphError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'GraphError';
  }
}

/**
 * Thrown when validation fails (schema, constraints, etc.)
 */
export class ValidationError extends GraphError {
  constructor(message: string, public details?: any) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

/**
 * Thrown when a node or edge is not found
 */
export class NotFoundError extends GraphError {
  constructor(type: string, id: number) {
    super(`${type} with id ${id} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when a query operation fails
 */
export class QueryError extends GraphError {
  constructor(message: string, public query?: string) {
    super(message, 'QUERY_ERROR');
    this.name = 'QueryError';
  }
}

/**
 * Thrown when a transaction operation fails
 */
export class TransactionError extends GraphError {
  constructor(message: string) {
    super(message, 'TRANSACTION_ERROR');
    this.name = 'TransactionError';
  }
}
```

### Error Handling Examples

```typescript
try {
  const node = db.getNode(999);
  if (!node) {
    throw new NotFoundError('Node', 999);
  }
} catch (error) {
  if (error instanceof NotFoundError) {
    console.error('Node not found:', error.message);
  } else {
    throw error;
  }
}

// Schema validation errors
try {
  db.createNode('Job', {
    // Missing required properties
    status: 'active'
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.details);
  }
}

// Query errors
try {
  db.nodes('Job')
    .where({ invalid: 'field' })
    .exec();
} catch (error) {
  if (error instanceof QueryError) {
    console.error('Query failed:', error.query);
  }
}

// Transaction errors
try {
  db.transaction(() => {
    db.createNode('Job', { title: 'Engineer' });
    throw new Error('Oops');
  });
} catch (error) {
  if (error instanceof TransactionError) {
    console.error('Transaction rolled back');
  }
}
```

---

## Complete Usage Example

```typescript
import { GraphDatabase } from 'sqlite-graph';

// Initialize with schema
const db = new GraphDatabase('./jobs.db', {
  schema: {
    nodes: {
      Job: {
        properties: ['title', 'url', 'status', 'salary'],
        indexes: ['status']
      },
      Company: {
        properties: ['name', 'industry', 'size'],
        indexes: ['industry']
      },
      Skill: {
        properties: ['name', 'category']
      }
    },
    edges: {
      POSTED_BY: { from: 'Job', to: 'Company' },
      REQUIRES: { from: 'Job', to: 'Skill' },
      SIMILAR_TO: { from: 'Job', to: 'Job' }
    }
  }
});

// Transaction with multiple operations
const result = db.transaction(() => {
  // Create nodes
  const job = db.createNode('Job', {
    title: 'Senior Agentic Engineer',
    url: 'https://example.com/job/123',
    status: 'discovered',
    salary: 150000
  });

  const company = db.createNode('Company', {
    name: 'TechCorp',
    industry: 'SaaS',
    size: 'medium'
  });

  const skill1 = db.createNode('Skill', {
    name: 'TypeScript',
    category: 'language'
  });

  const skill2 = db.createNode('Skill', {
    name: 'Graph Databases',
    category: 'database'
  });

  // Create relationships
  db.createEdge('POSTED_BY', job.id, company.id);
  db.createEdge('REQUIRES', job.id, skill1.id);
  db.createEdge('REQUIRES', job.id, skill2.id);

  return { job, company, skills: [skill1, skill2] };
});

// Complex query
const relevantJobs = db.nodes('Job')
  .where({ status: 'discovered' })
  .connectedTo('Company', 'POSTED_BY')
  .filter(node => {
    const salary = node.properties.salary;
    return salary && salary > 120000;
  })
  .orderBy('created_at', 'desc')
  .limit(10)
  .exec();

// Graph traversal
const similarJobs = db.traverse(result.job.id)
  .out('SIMILAR_TO')
  .filter(node => node.properties.status === 'discovered')
  .maxDepth(2)
  .toArray();

// Shortest path
const path = db.traverse(result.job.id)
  .shortestPath(similarJobs[0]?.id);

if (path) {
  console.log(`Path length: ${path.length - 1} hops`);
}

// Cleanup
db.close();
```

---

**Document Version:** 1.0.0
**API Version:** 1.0.0
**Last Updated:** 2025-10-27
**Maintained by:** Michael O'Boyle and Claude Code
