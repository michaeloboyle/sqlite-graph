# Database.ts Pseudocode

> Detailed algorithm specifications for the GraphDatabase class implementation

**Version:** 1.0.0
**Status:** Implementation-Ready
**Last Updated:** 2025-10-27
**Created by:** Michael O'Boyle and Claude Code

---

## Table of Contents

1. [Constructor](#constructor)
2. [Statement Preparation](#statement-preparation)
3. [Node Operations](#node-operations)
4. [Edge Operations](#edge-operations)
5. [Query Builders](#query-builders)
6. [Transaction Management](#transaction-management)
7. [Import/Export Operations](#importexport-operations)
8. [Utility Methods](#utility-methods)

---

## Constructor

### Algorithm: `constructor(path: string, options?: DatabaseOptions)`

**Purpose**: Initialize database connection, schema, and prepared statements

**Input Validation**:
```
1. Validate path parameter:
   - Must be non-empty string OR ':memory:'
   - If fileMustExist option is true:
     - Check if file exists at path
     - Throw Error if not found

2. Validate options (if provided):
   - schema: Must match GraphSchema interface shape
   - readonly: Must be boolean
   - fileMustExist: Must be boolean
   - timeout: Must be positive integer
   - verbose: Must be function
```

**Database Connection**:
```
1. Create better-sqlite3 Database instance:
   - Pass path to Database constructor
   - Pass options object to Database constructor
   - Store in this.db

2. Handle connection errors:
   - Try-catch around Database creation
   - If error, throw with context:
     "Failed to initialize database at {path}: {error.message}"
```

**Schema Storage**:
```
1. Store schema if provided:
   - this.schema = options?.schema
   - Used later for validation in CRUD operations
```

**Prepared Statements Map**:
```
1. Initialize empty Map:
   - this.preparedStatements = new Map<string, Statement>()
   - Will hold frequently-used SQL statements
```

**Schema Initialization**:
```
1. Call initializeSchema(this.db):
   - Creates 'nodes' table if not exists
   - Creates 'edges' table if not exists
   - Creates indexes on type columns
   - Creates indexes on foreign keys
   - Enables foreign key constraints
   - Sets WAL mode for better concurrency
```

**Statement Preparation**:
```
1. Call this.prepareStatements():
   - Prepares all frequently-used SQL statements
   - Stores in preparedStatements Map
   - See Statement Preparation section below
```

**Return**:
```
Return the initialized GraphDatabase instance
```

---

## Statement Preparation

### Algorithm: `prepareStatements(): void`

**Purpose**: Pre-compile frequently used SQL statements for performance

**Node Statements**:
```
1. Prepare INSERT statement:
   Key: 'insertNode'
   SQL: INSERT INTO nodes (type, properties) VALUES (?, ?) RETURNING *
   Purpose: Create new node with type and serialized properties
   Returns: Full row with auto-generated id and timestamps

2. Prepare SELECT by ID statement:
   Key: 'getNode'
   SQL: SELECT * FROM nodes WHERE id = ?
   Purpose: Retrieve single node by primary key
   Returns: Full node row or undefined

3. Prepare UPDATE statement:
   Key: 'updateNode'
   SQL: UPDATE nodes
        SET properties = ?, updated_at = strftime("%s", "now")
        WHERE id = ?
        RETURNING *
   Purpose: Update node properties and auto-update timestamp
   Returns: Full updated row

4. Prepare DELETE statement:
   Key: 'deleteNode'
   SQL: DELETE FROM nodes WHERE id = ?
   Purpose: Remove node (CASCADE deletes connected edges)
   Returns: RunResult with changes count
```

**Edge Statements**:
```
1. Prepare INSERT statement:
   Key: 'insertEdge'
   SQL: INSERT INTO edges (type, from_id, to_id, properties)
        VALUES (?, ?, ?, ?)
        RETURNING *
   Purpose: Create edge between two nodes
   Returns: Full edge row with auto-generated id

2. Prepare SELECT by ID statement:
   Key: 'getEdge'
   SQL: SELECT * FROM edges WHERE id = ?
   Purpose: Retrieve single edge by primary key
   Returns: Full edge row or undefined

3. Prepare DELETE statement:
   Key: 'deleteEdge'
   SQL: DELETE FROM edges WHERE id = ?
   Purpose: Remove edge
   Returns: RunResult with changes count
```

**Storage**:
```
For each statement:
  1. Call this.db.prepare(sql)
  2. Store result in Map: this.preparedStatements.set(key, statement)
```

---

## Node Operations

### Algorithm: `createNode<T>(type: string, properties: T): Node<T>`

**Purpose**: Create and persist a new node in the graph

**Input Validation**:
```
1. Validate node type:
   - Call validateNodeType(type, this.schema)
   - Checks: type is non-empty string
   - If schema defined: type exists in schema.nodes
   - Throw Error if invalid

2. Validate properties:
   - Call validateNodeProperties(type, properties, this.schema)
   - Checks: properties is object (not null/array)
   - If schema defined: all required properties present
   - Throw Error if invalid
```

**Serialization**:
```
1. Serialize properties to JSON:
   - Call serialize(properties)
   - Converts JavaScript object to JSON string
   - Handles nested objects, arrays, dates
   - Returns: string representation
```

**Database Insert**:
```
1. Get prepared statement:
   - stmt = this.preparedStatements.get('insertNode')

2. Execute INSERT:
   - row = stmt.get(type, serializedProperties)
   - get() returns first row (RETURNING clause)
   - Database auto-generates:
     * id (auto-increment primary key)
     * created_at (current Unix timestamp)
     * updated_at (current Unix timestamp)
```

**Result Transformation**:
```
1. Deserialize properties:
   - props = deserialize<T>(row.properties)
   - Converts JSON string back to typed object

2. Convert timestamps:
   - createdAt = timestampToDate(row.created_at)
   - updatedAt = timestampToDate(row.updated_at)
   - Converts Unix timestamps to Date objects

3. Construct Node object:
   Return {
     id: row.id,
     type: row.type,
     properties: props,
     createdAt: createdAt,
     updatedAt: updatedAt
   }
```

**Error Handling**:
```
If any error occurs:
  - Validation errors: Re-throw with context
  - SQLite errors: Wrap with descriptive message
  - Include node type in error for debugging
```

---

### Algorithm: `getNode(id: number): Node | null`

**Purpose**: Retrieve a node by its unique identifier

**Input Validation**:
```
1. Validate node ID:
   - Call validateNodeId(id)
   - Checks: id is positive integer (> 0)
   - Throw Error if invalid
```

**Database Query**:
```
1. Get prepared statement:
   - stmt = this.preparedStatements.get('getNode')

2. Execute SELECT:
   - row = stmt.get(id)
   - Returns row object or undefined
```

**Null Handling**:
```
1. Check if node exists:
   If row is undefined:
     Return null
```

**Result Transformation**:
```
1. Deserialize properties:
   - props = deserialize(row.properties)
   - Parse JSON string to object

2. Convert timestamps:
   - createdAt = timestampToDate(row.created_at)
   - updatedAt = timestampToDate(row.updated_at)

3. Construct Node object:
   Return {
     id: row.id,
     type: row.type,
     properties: props,
     createdAt: createdAt,
     updatedAt: updatedAt
   }
```

---

### Algorithm: `updateNode(id: number, properties: Partial<NodeData>): Node`

**Purpose**: Update node properties with partial merge

**Input Validation**:
```
1. Validate node ID:
   - Call validateNodeId(id)
   - Checks: id is positive integer
   - Throw Error if invalid

2. Validate properties object:
   - Must be object (not null/array)
   - Can be empty object {}
   - Throw Error if invalid
```

**Existence Check**:
```
1. Retrieve current node:
   - existing = this.getNode(id)

2. Verify node exists:
   If existing is null:
     Throw Error: "Node with ID {id} not found"
```

**Property Merge**:
```
1. Merge properties (shallow merge):
   - merged = { ...existing.properties, ...properties }
   - Spread existing properties first
   - Overlay new properties (overwrite duplicates)
   - Result: combined object
```

**Serialization**:
```
1. Serialize merged properties:
   - serialized = serialize(merged)
   - Converts to JSON string
```

**Database Update**:
```
1. Get prepared statement:
   - stmt = this.preparedStatements.get('updateNode')

2. Execute UPDATE:
   - row = stmt.get(serialized, id)
   - SQL automatically updates updated_at timestamp
   - RETURNING clause returns updated row
```

**Result Transformation**:
```
1. Deserialize properties:
   - props = deserialize(row.properties)

2. Convert timestamps:
   - createdAt = timestampToDate(row.created_at)
   - updatedAt = timestampToDate(row.updated_at)
   - Note: updatedAt will be newer than before

3. Construct Node object:
   Return {
     id: row.id,
     type: row.type,
     properties: props,
     createdAt: createdAt,
     updatedAt: updatedAt
   }
```

---

### Algorithm: `deleteNode(id: number): boolean`

**Purpose**: Delete node and all connected edges (CASCADE)

**Input Validation**:
```
1. Validate node ID:
   - Call validateNodeId(id)
   - Checks: id is positive integer
   - Throw Error if invalid
```

**Database Delete**:
```
1. Get prepared statement:
   - stmt = this.preparedStatements.get('deleteNode')

2. Execute DELETE:
   - info = stmt.run(id)
   - SQLite CASCADE behavior:
     * Automatically deletes edges where from_id = id
     * Automatically deletes edges where to_id = id
   - Returns: RunResult with changes count
```

**Result Interpretation**:
```
1. Check deletion success:
   If info.changes > 0:
     Return true (node was deleted)
   Else:
     Return false (node didn't exist)
```

**Note on CASCADE**:
```
Foreign key constraints defined in schema ensure:
  - All edges FROM this node are deleted
  - All edges TO this node are deleted
  - Maintains referential integrity
  - No orphaned edges remain
```

---

## Edge Operations

### Algorithm: `createEdge<T>(type: string, from: number, to: number, properties?: T): Edge<T>`

**Purpose**: Create relationship between two existing nodes

**Input Validation**:
```
1. Validate edge type:
   - Call validateEdgeType(type, this.schema)
   - Checks: type is non-empty string
   - If schema defined: type exists in schema.edges
   - Throw Error if invalid

2. Validate node IDs:
   - Call validateNodeId(from)
   - Call validateNodeId(to)
   - Both must be positive integers
   - Throw Error if invalid

3. Validate properties (if provided):
   - Must be object (not null/array)
   - If schema defined: validate against edge schema
```

**Node Existence Verification**:
```
1. Verify source node exists:
   - fromNode = this.getNode(from)
   - If fromNode is null:
     Throw Error: "Source node with ID {from} not found"

2. Verify target node exists:
   - toNode = this.getNode(to)
   - If toNode is null:
     Throw Error: "Target node with ID {to} not found"
```

**Schema Relationship Checking** (if schema defined):
```
1. Get edge schema definition:
   - edgeSchema = this.schema.edges[type]

2. Verify node types match schema:
   - Expected: edgeSchema.from and edgeSchema.to
   - Actual: fromNode.type and toNode.type
   - If mismatch:
     Throw Error: "Edge type {type} requires {expected} but got {actual}"
```

**Serialization**:
```
1. Handle optional properties:
   If properties provided:
     serialized = serialize(properties)
   Else:
     serialized = null
```

**Database Insert**:
```
1. Get prepared statement:
   - stmt = this.preparedStatements.get('insertEdge')

2. Execute INSERT:
   - row = stmt.get(type, from, to, serialized)
   - Foreign key constraints ensure from/to exist
   - Database auto-generates:
     * id (auto-increment primary key)
     * created_at (current Unix timestamp)
   - RETURNING clause returns full row
```

**Result Transformation**:
```
1. Deserialize properties (if present):
   If row.properties is not null:
     props = deserialize<T>(row.properties)
   Else:
     props = undefined

2. Convert timestamp:
   - createdAt = timestampToDate(row.created_at)

3. Construct Edge object:
   Return {
     id: row.id,
     type: row.type,
     from: row.from_id,
     to: row.to_id,
     properties: props,
     createdAt: createdAt
   }
```

---

### Algorithm: `getEdge(id: number): Edge | null`

**Purpose**: Retrieve an edge by its unique identifier

**Input Validation**:
```
1. Validate edge ID:
   - Call validateNodeId(id)
   - Reuses node validation (both are positive integers)
   - Throw Error if invalid
```

**Database Query**:
```
1. Get prepared statement:
   - stmt = this.preparedStatements.get('getEdge')

2. Execute SELECT:
   - row = stmt.get(id)
   - Returns row object or undefined
```

**Null Handling**:
```
1. Check if edge exists:
   If row is undefined:
     Return null
```

**Result Transformation**:
```
1. Deserialize properties (if present):
   If row.properties is not null:
     props = deserialize(row.properties)
   Else:
     props = undefined

2. Convert timestamp:
   - createdAt = timestampToDate(row.created_at)

3. Construct Edge object:
   Return {
     id: row.id,
     type: row.type,
     from: row.from_id,
     to: row.to_id,
     properties: props,
     createdAt: createdAt
   }
```

---

### Algorithm: `deleteEdge(id: number): boolean`

**Purpose**: Remove an edge from the graph

**Input Validation**:
```
1. Validate edge ID:
   - Call validateNodeId(id)
   - Checks: id is positive integer
   - Throw Error if invalid
```

**Database Delete**:
```
1. Get prepared statement:
   - stmt = this.preparedStatements.get('deleteEdge')

2. Execute DELETE:
   - info = stmt.run(id)
   - Removes edge record from edges table
   - Does NOT affect connected nodes
   - Returns: RunResult with changes count
```

**Result Interpretation**:
```
1. Check deletion success:
   If info.changes > 0:
     Return true (edge was deleted)
   Else:
     Return false (edge didn't exist)
```

---

## Query Builders

### Algorithm: `nodes(type: string): NodeQuery`

**Purpose**: Create fluent query builder for nodes of specific type

**Implementation**:
```
1. Validate type (basic check):
   - Type should be non-empty string
   - Full validation deferred to NodeQuery

2. Instantiate NodeQuery:
   - query = new NodeQuery(this.db, type)
   - Pass raw database instance
   - Pass node type for filtering

3. Return query builder:
   - Return query
   - Enables method chaining:
     .where()
     .connectedTo()
     .filter()
     .orderBy()
     .limit()
     .offset()
     .exec()
```

**Query Builder State**:
```
NodeQuery maintains:
  - db: Reference to SQLite database
  - type: Node type to filter by
  - conditions: WHERE clause conditions (from .where())
  - relationships: JOIN conditions (from .connectedTo())
  - filters: JavaScript predicates (from .filter())
  - ordering: ORDER BY clause (from .orderBy())
  - limitCount: LIMIT value (from .limit())
  - offsetCount: OFFSET value (from .offset())
```

**Lazy Evaluation**:
```
Query is NOT executed until:
  - .exec() is called (returns Node[])
  - .count() is called (returns number)
  - .first() is called (returns Node | null)

All other methods just build query state
```

---

### Algorithm: `traverse(startNodeId: number): TraversalQuery`

**Purpose**: Create graph traversal query starting from specific node

**Input Validation**:
```
1. Validate start node ID:
   - Call validateNodeId(startNodeId)
   - Checks: id is positive integer
   - Throw Error if invalid
```

**Existence Verification**:
```
1. Verify start node exists:
   - node = this.getNode(startNodeId)

2. Check existence:
   If node is null:
     Throw Error: "Start node with ID {startNodeId} not found"
```

**Instantiation**:
```
1. Create TraversalQuery:
   - query = new TraversalQuery(this.db, startNodeId)
   - Pass raw database instance
   - Pass validated start node ID

2. Return query builder:
   - Return query
   - Enables method chaining:
     .out(edgeType)
     .in(edgeType)
     .both(edgeType)
     .filter(predicate)
     .maxDepth(depth)
     .minDepth(depth)
     .toArray()
     .shortestPath(targetId)
     .paths(targetId)
```

**Traversal Query State**:
```
TraversalQuery maintains:
  - db: Reference to SQLite database
  - startNodeId: Starting point for traversal
  - edgeTypes: Array of edge types to follow
  - directions: Array of directions (out/in/both)
  - filterFns: Array of predicate functions
  - maxDepthLimit: Maximum hops (default: unlimited)
  - minDepthLimit: Minimum hops (default: 0)
```

**Lazy Evaluation**:
```
Traversal is NOT executed until:
  - .toArray() is called (returns Node[])
  - .shortestPath(targetId) is called (returns Node[] | null)
  - .paths(targetId) is called (returns Node[][])

All other methods just build traversal configuration
```

---

## Transaction Management

### Algorithm: `transaction<T>(fn: () => T): T`

**Purpose**: Execute function in ACID transaction with automatic commit/rollback

**better-sqlite3 Transaction Wrapper**:
```
1. Leverage better-sqlite3 transaction API:
   - this.db.transaction(fn)
   - Returns a function that executes fn in transaction
   - Call immediately with ()

2. Full call:
   - return this.db.transaction(fn)()
```

**Transaction Flow**:
```
1. BEGIN TRANSACTION:
   - Executed automatically by better-sqlite3
   - Acquires RESERVED lock on first write
   - Allows subsequent reads and writes

2. Execute function fn:
   - All operations inside fn share transaction context
   - Database methods (createNode, etc.) work normally
   - Can throw errors to trigger rollback

3. COMMIT or ROLLBACK:
   If fn completes successfully:
     - Auto-COMMIT all changes
     - Release locks
     - Return fn's return value

   If fn throws error:
     - Auto-ROLLBACK all changes
     - Release locks
     - Re-throw error to caller
```

**Nested Transaction Behavior**:
```
SQLite doesn't support true nested transactions.

If transaction() called within transaction:
  - better-sqlite3 uses SAVEPOINT mechanism
  - Inner transaction becomes savepoint:
    * SAVEPOINT sp_1
    * Execute inner operations
    * RELEASE sp_1 (success) or ROLLBACK TO sp_1 (error)
  - Outer transaction continues
  - Only outer COMMIT/ROLLBACK affects database
```

**Example Flow**:
```
Successful transaction:
  1. BEGIN TRANSACTION
  2. createNode('Job', {...})    → INSERT
  3. createNode('Company', {...}) → INSERT
  4. createEdge(...)              → INSERT
  5. return result
  6. COMMIT
  7. Return result to caller

Failed transaction:
  1. BEGIN TRANSACTION
  2. createNode('Job', {...})    → INSERT
  3. createNode('Invalid', {...}) → Validation Error
  4. ROLLBACK (automatic)
  5. Throw error to caller
  6. First node INSERT was undone
```

**Error Handling**:
```
Transaction errors propagate:
  - Validation errors from createNode/createEdge
  - SQLite constraint violations
  - Application errors thrown in fn
  - All trigger automatic ROLLBACK
  - Original error re-thrown after rollback
```

---

## Import/Export Operations

### Algorithm: `export(): GraphExport`

**Purpose**: Serialize entire graph to portable JSON format

**Node Export**:
```
1. Prepare SELECT statement:
   - stmt = this.db.prepare('SELECT * FROM nodes ORDER BY id')
   - Orders by id for reproducible exports

2. Execute query:
   - rows = stmt.all()
   - Returns array of all node rows

3. Transform each row:
   For each row in rows:
     a. Deserialize properties:
        props = deserialize(row.properties)

     b. Convert timestamps:
        createdAt = timestampToDate(row.created_at)
        updatedAt = timestampToDate(row.updated_at)

     c. Build node object:
        {
          id: row.id,
          type: row.type,
          properties: props,
          createdAt: createdAt,
          updatedAt: updatedAt
        }

4. Result:
   - nodes = array of transformed node objects
```

**Edge Export**:
```
1. Prepare SELECT statement:
   - stmt = this.db.prepare('SELECT * FROM edges ORDER BY id')
   - Orders by id for reproducible exports

2. Execute query:
   - rows = stmt.all()
   - Returns array of all edge rows

3. Transform each row:
   For each row in rows:
     a. Deserialize properties (if present):
        If row.properties is not null:
          props = deserialize(row.properties)
        Else:
          props = undefined

     b. Convert timestamp:
        createdAt = timestampToDate(row.created_at)

     c. Build edge object:
        {
          id: row.id,
          type: row.type,
          from: row.from_id,
          to: row.to_id,
          properties: props,
          createdAt: createdAt
        }

4. Result:
   - edges = array of transformed edge objects
```

**Metadata Generation**:
```
1. Create metadata object:
   metadata = {
     version: '1',
     exportedAt: new Date().toISOString()
   }
```

**Result Assembly**:
```
Return {
  nodes: nodes,
  edges: edges,
  metadata: metadata
}
```

---

### Algorithm: `import(data: GraphExport): void`

**Purpose**: Load graph data from export format into database

**Input Validation**:
```
1. Validate export structure:
   - data must have 'nodes' array
   - data must have 'edges' array
   - data must have 'metadata' object
   - Throw Error if structure invalid

2. Validate version compatibility:
   - Check metadata.version
   - Warn if version mismatch
```

**Transaction Wrapper**:
```
1. Wrap entire import in transaction:
   - Ensures atomicity
   - All-or-nothing import
   - Rollback on any error
```

**Node Import**:
```
Within transaction:
  For each node in data.nodes:
    1. Extract node data:
       - type = node.type
       - properties = node.properties

    2. Create node:
       - this.createNode(type, properties)
       - Validation runs automatically
       - New ID assigned (may differ from original)

    3. Handle errors:
       - Validation failures throw
       - Transaction rolls back entire import
```

**Edge Import**:
```
Within transaction:
  For each edge in data.edges:
    1. Extract edge data:
       - type = edge.type
       - from = edge.from
       - to = edge.to
       - properties = edge.properties

    2. Create edge:
       - this.createEdge(type, from, to, properties)
       - Validates node existence
       - Validates schema compliance

    3. Handle errors:
       - Node not found errors throw
       - Transaction rolls back entire import
```

**ID Mapping Consideration**:
```
Import does NOT preserve original IDs:
  - Auto-increment generates new IDs
  - Edge references must use same import session
  - For ID preservation, use different approach:
    * Explicit INSERT with original IDs
    * Disable auto-increment temporarily
    * Reset sequence after import
```

**Error Handling**:
```
Any error during import:
  1. Transaction automatically rolls back
  2. Database state unchanged
  3. Error propagates to caller
  4. Caller can retry or handle gracefully
```

---

## Utility Methods

### Algorithm: `close(): void`

**Purpose**: Release database connection and resources

**Implementation**:
```
1. Close database connection:
   - this.db.close()
   - Releases file locks
   - Flushes pending writes
   - Frees memory

2. Cleanup:
   - Prepared statements automatically invalidated
   - No explicit cleanup needed for Map
   - Database instance unusable after close
```

**Post-Close Behavior**:
```
After close() called:
  - All database operations will fail
  - Error: "Database is not open"
  - Must create new GraphDatabase instance
  - Recommended pattern: use in try-finally
```

**Best Practice**:
```
try {
  const db = new GraphDatabase('./graph.db');
  // Perform operations
} finally {
  db.close();
}
```

---

### Algorithm: `getRawDb(): Database.Database`

**Purpose**: Access underlying better-sqlite3 instance for advanced operations

**Implementation**:
```
1. Return raw database:
   - return this.db
   - Direct access to better-sqlite3 API
```

**Use Cases**:
```
1. Custom SQL queries:
   - db.getRawDb().prepare('CUSTOM SQL').all()

2. Advanced better-sqlite3 features:
   - Pragma statements
   - Custom functions
   - Backup operations
   - Performance tuning

3. Testing and debugging:
   - Inspect database state
   - Run diagnostic queries
   - Verify schema
```

**Caution**:
```
Using raw database bypasses:
  - Query builder abstractions
  - Type safety
  - Validation logic
  - Serialization/deserialization

Use only when necessary
Prefer high-level API for normal operations
```

---

## Error Handling Patterns

### Validation Errors

**Input Validation Pattern**:
```
For every public method:
  1. Validate all inputs BEFORE database operations
  2. Use validation utilities:
     - validateNodeType()
     - validateNodeId()
     - validateEdgeType()
     - validateNodeProperties()
  3. Throw descriptive errors:
     - Include parameter name
     - Include expected vs actual
     - Include helpful hints
```

**Example**:
```
createNode(type, properties):
  If type is empty string:
    Throw Error: "Node type must be a non-empty string"

  If type not in schema.nodes:
    Throw Error: "Node type '{type}' is not defined in schema.
                  Available types: {Object.keys(schema.nodes).join(', ')}"
```

---

### Existence Errors

**Not Found Pattern**:
```
For operations requiring existing entities:
  1. Check existence BEFORE main operation
  2. Return null for read operations
  3. Throw error for write operations
  4. Include entity type and ID in error
```

**Example**:
```
updateNode(id, properties):
  existing = this.getNode(id)
  If existing is null:
    Throw Error: "Node with ID {id} not found.
                  Cannot update non-existent node."
```

---

### Database Errors

**SQLite Error Handling**:
```
Wrap database operations in try-catch:
  1. Catch SQLite errors
  2. Interpret error codes:
     - SQLITE_CONSTRAINT: Foreign key violation
     - SQLITE_BUSY: Database locked
     - SQLITE_READONLY: Read-only database
  3. Throw user-friendly errors
  4. Include original error for debugging
```

**Example**:
```
createEdge(type, from, to, properties):
  try:
    row = stmt.get(type, from, to, properties)
  catch error:
    If error.code === 'SQLITE_CONSTRAINT':
      Throw Error: "Foreign key constraint failed.
                    One or both nodes (from={from}, to={to}) do not exist."
    Else:
      Re-throw with context
```

---

### Transaction Errors

**Automatic Rollback**:
```
transaction(fn):
  try:
    result = this.db.transaction(fn)()
    return result
  catch error:
    // Rollback already done by better-sqlite3
    // Just propagate error
    throw error
```

**Nested Transaction Errors**:
```
Savepoint errors:
  - Inner transaction errors rollback to savepoint
  - Outer transaction can continue
  - Or outer can catch and rollback entirely
  - Error bubbles up through call stack
```

---

## Performance Optimizations

### Prepared Statement Caching

**Why**:
```
1. SQL parsing is expensive
2. Query plan compilation takes time
3. Same queries executed repeatedly
4. Prepared statements reuse compiled plan
```

**How**:
```
1. Prepare statements once in constructor
2. Store in Map for O(1) lookup
3. Reuse same statement for all calls
4. better-sqlite3 handles parameter binding
```

**Benefit**:
```
10-50x faster than re-parsing SQL each time
Especially important for CRUD operations
```

---

### Serialization Strategy

**JSON Serialization**:
```
Why JSON:
  1. Native SQLite TEXT storage
  2. Flexible schema (store any object)
  3. Human-readable in database
  4. Easy to export/import

Performance:
  - Serialization: ~1-5μs per object
  - Deserialization: ~1-5μs per object
  - Acceptable overhead for flexibility
```

**Optimization Techniques**:
```
1. Use JSON.stringify/parse directly:
   - Fastest built-in option
   - No external dependencies

2. Avoid serialization for simple types:
   - Store primitives as-is when possible
   - Only serialize complex objects

3. Lazy deserialization:
   - Deserialize only when accessed
   - Not implemented yet, future optimization
```

---

### Index Usage

**Automatic Indexes**:
```
Created by initializeSchema():
  1. Primary key indexes:
     - nodes(id)
     - edges(id)

  2. Type indexes:
     - nodes(type)
     - edges(type)

  3. Foreign key indexes:
     - edges(from_id)
     - edges(to_id)
```

**Query Optimization**:
```
SQLite uses indexes for:
  - WHERE id = ? (primary key)
  - WHERE type = ? (type index)
  - Joins on from_id/to_id (FK indexes)

O(log n) lookup instead of O(n) scan
```

---

### Transaction Batching

**Bulk Operations**:
```
Instead of:
  for each item:
    db.createNode(type, item) // N transactions

Use:
  db.transaction(() => {
    for each item:
      db.createNode(type, item) // 1 transaction
  })
```

**Performance Impact**:
```
Single transaction for 1000 inserts:
  - 50-100x faster than 1000 individual transactions
  - Reduces disk I/O
  - Reduces lock acquisition overhead
  - Reduces WAL synchronization
```

---

## Testing Considerations

### Unit Test Coverage

**Constructor Tests**:
```
1. Test database creation:
   - In-memory database
   - File-based database
   - Database with schema
   - Read-only database

2. Test error cases:
   - Invalid path
   - Missing file with fileMustExist
   - Invalid schema structure
```

**CRUD Operation Tests**:
```
1. Node operations:
   - Create valid node
   - Get existing node
   - Get non-existent node (null)
   - Update existing node
   - Update non-existent node (error)
   - Delete existing node
   - Delete non-existent node (false)

2. Edge operations:
   - Create valid edge
   - Create edge with invalid from node (error)
   - Create edge with invalid to node (error)
   - Get existing edge
   - Get non-existent edge (null)
   - Delete edge
```

**Query Builder Tests**:
```
1. NodeQuery:
   - Filter by type
   - Filter by properties
   - Filter by relationships
   - Order by field
   - Limit results
   - Offset results
   - Count results
   - First result

2. TraversalQuery:
   - Outgoing traversal
   - Incoming traversal
   - Bidirectional traversal
   - Max depth limiting
   - Min depth limiting
   - Shortest path
   - All paths
```

**Transaction Tests**:
```
1. Success cases:
   - Simple transaction commits
   - Nested transactions with savepoints
   - Transaction return values

2. Failure cases:
   - Transaction rollback on error
   - Partial rollback with savepoints
   - Database unchanged after rollback
```

---

## Implementation Checklist

- [ ] Constructor with database initialization
- [ ] Statement preparation for performance
- [ ] createNode with validation and serialization
- [ ] getNode with null handling
- [ ] updateNode with property merging
- [ ] deleteNode with CASCADE
- [ ] createEdge with node existence check
- [ ] getEdge with null handling
- [ ] deleteEdge operation
- [ ] nodes() query builder factory
- [ ] traverse() traversal builder factory
- [ ] transaction() with auto-commit/rollback
- [ ] export() with complete graph serialization
- [ ] import() with transaction wrapping
- [ ] close() for cleanup
- [ ] getRawDb() for advanced access
- [ ] Comprehensive error handling
- [ ] Full test coverage (unit + integration)
- [ ] Performance benchmarks
- [ ] Documentation examples

---

**Status**: Ready for implementation
**Next Steps**:
1. Implement GraphDatabase class following this pseudocode
2. Create comprehensive test suite
3. Add integration tests for complex scenarios
4. Benchmark performance optimizations

**Created by**: Michael O'Boyle and Claude Code
**Date**: 2025-10-27
