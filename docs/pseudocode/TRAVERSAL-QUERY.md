# TraversalQuery Pseudocode

> Detailed pseudocode for graph traversal algorithms including BFS, DFS, and path finding

**Version:** 1.0.0
**Status:** Specification Phase
**Last Updated:** 2025-10-27

## Table of Contents

1. [Overview](#overview)
2. [Data Structures](#data-structures)
3. [Constructor](#constructor)
4. [Traversal Direction Methods](#traversal-direction-methods)
5. [Filtering Methods](#filtering-methods)
6. [Execution Methods](#execution-methods)
7. [Helper Methods](#helper-methods)
8. [Algorithm Complexity Analysis](#algorithm-complexity-analysis)

---

## Overview

The `TraversalQuery` class implements graph traversal algorithms for exploring relationships in the graph database. It uses a fluent API builder pattern to construct queries and supports multiple traversal strategies:

- **Breadth-First Search (BFS)** - for shortest path and level-order traversal
- **Depth-First Search (DFS)** - for all paths enumeration
- **Bidirectional traversal** - for undirected relationship exploration
- **Filtered traversal** - with predicate-based node filtering
- **Depth-constrained traversal** - with min/max hop limits

---

## Data Structures

### TraversalStep
```typescript
STRUCT TraversalStep:
  edgeType: string           // Type of edge to follow (e.g., 'SIMILAR_TO')
  nodeType?: string          // Optional target node type filter
  direction: 'out' | 'in' | 'both'  // Traversal direction
END STRUCT
```

### TraversalState
```typescript
STRUCT TraversalState:
  startNodeId: number        // Starting point for traversal
  steps: TraversalStep[]     // Ordered sequence of traversal operations
  maxDepthValue?: number     // Maximum hops allowed
  minDepthValue?: number     // Minimum hops required
  uniqueNodes: boolean       // Whether to deduplicate nodes
  filterPredicate?: Function // Optional node filter function
END STRUCT
```

### QueueItem (for BFS)
```typescript
STRUCT QueueItem:
  nodeId: number             // Current node ID
  depth: number              // Distance from start (hop count)
END STRUCT
```

### PathQueueItem (for path tracking)
```typescript
STRUCT PathQueueItem:
  nodeId: number             // Current node ID
  path: Node[]               // Nodes visited so far
  depth: number              // Path length
END STRUCT
```

---

## Constructor

### Algorithm: Initialize TraversalQuery

**Purpose:** Create a new traversal query builder starting from a specific node.

**Input:**
- `db`: Database.Database - SQLite database connection
- `startNodeId`: number - ID of the starting node

**Output:** TraversalQuery instance

**Pseudocode:**
```
FUNCTION TraversalQuery(db, startNodeId):
  // Initialize state
  this.db = db
  this.startNodeId = startNodeId
  this.steps = []              // Empty traversal steps
  this.maxDepthValue = undefined
  this.minDepthValue = undefined
  this.uniqueNodes = false
  this.filterPredicate = undefined

  RETURN this
END FUNCTION
```

**Complexity:**
- **Time:** O(1)
- **Space:** O(1)

---

## Traversal Direction Methods

### Algorithm: out(edgeType, nodeType?)

**Purpose:** Add an outgoing edge traversal step.

**Input:**
- `edgeType`: string - Type of edges to follow
- `nodeType?`: string - Optional target node type filter

**Output:** this (for method chaining)

**Pseudocode:**
```
FUNCTION out(edgeType, nodeType?):
  // Create traversal step for outgoing edges
  step = {
    edgeType: edgeType,
    nodeType: nodeType,
    direction: 'out'
  }

  // Append to traversal sequence
  this.steps.push(step)

  RETURN this  // Enable method chaining
END FUNCTION
```

**Complexity:**
- **Time:** O(1)
- **Space:** O(1)

**Notes:**
- Outgoing edges follow relationships FROM current node TO next node
- Example: Job --POSTED_BY--> Company

---

### Algorithm: in(edgeType, nodeType?)

**Purpose:** Add an incoming edge traversal step.

**Input:**
- `edgeType`: string - Type of edges to follow
- `nodeType?`: string - Optional source node type filter

**Output:** this (for method chaining)

**Pseudocode:**
```
FUNCTION in(edgeType, nodeType?):
  // Create traversal step for incoming edges
  step = {
    edgeType: edgeType,
    nodeType: nodeType,
    direction: 'in'
  }

  // Append to traversal sequence
  this.steps.push(step)

  RETURN this  // Enable method chaining
END FUNCTION
```

**Complexity:**
- **Time:** O(1)
- **Space:** O(1)

**Notes:**
- Incoming edges follow relationships TO current node FROM previous node
- Example: Company <--POSTED_BY-- Job

---

### Algorithm: both(edgeType, nodeType?)

**Purpose:** Add a bidirectional edge traversal step.

**Input:**
- `edgeType`: string - Type of edges to follow
- `nodeType?`: string - Optional connected node type filter

**Output:** this (for method chaining)

**Pseudocode:**
```
FUNCTION both(edgeType, nodeType?):
  // Create traversal step for both directions
  step = {
    edgeType: edgeType,
    nodeType: nodeType,
    direction: 'both'
  }

  // Append to traversal sequence
  this.steps.push(step)

  RETURN this  // Enable method chaining
END FUNCTION
```

**Complexity:**
- **Time:** O(1)
- **Space:** O(1)

**Notes:**
- Follows edges in both directions (outgoing AND incoming)
- Useful for undirected relationships like SIMILAR_TO

---

## Filtering Methods

### Algorithm: filter(predicate)

**Purpose:** Add a node filter to the traversal.

**Input:**
- `predicate`: (node: Node) => boolean - Filter function

**Output:** this (for method chaining)

**Pseudocode:**
```
FUNCTION filter(predicate):
  IF this.filterPredicate is undefined:
    // First filter - set directly
    this.filterPredicate = predicate
  ELSE:
    // Chain with existing filter (AND logic)
    existingPredicate = this.filterPredicate
    this.filterPredicate = (node) => {
      RETURN existingPredicate(node) AND predicate(node)
    }
  END IF

  RETURN this  // Enable method chaining
END FUNCTION
```

**Complexity:**
- **Time:** O(1) for setup, O(k) per node during traversal (k = number of filter conditions)
- **Space:** O(1)

**Notes:**
- Multiple filters are combined with AND logic
- Filters are applied during traversal, not after

---

### Algorithm: maxDepth(depth)

**Purpose:** Set maximum traversal depth (hop limit).

**Input:**
- `depth`: number - Maximum number of edges to traverse

**Output:** this (for method chaining)

**Pseudocode:**
```
FUNCTION maxDepth(depth):
  // Validate input
  IF depth < 0:
    THROW Error('Max depth must be non-negative')
  END IF

  // Store depth limit
  this.maxDepthValue = depth

  RETURN this  // Enable method chaining
END FUNCTION
```

**Complexity:**
- **Time:** O(1)
- **Space:** O(1)

**Notes:**
- Prevents infinite loops in cyclic graphs
- Essential for performance in dense graphs

---

### Algorithm: minDepth(depth)

**Purpose:** Set minimum traversal depth (exclude close nodes).

**Input:**
- `depth`: number - Minimum number of edges required

**Output:** this (for method chaining)

**Pseudocode:**
```
FUNCTION minDepth(depth):
  // Validate input
  IF depth < 0:
    THROW Error('Min depth must be non-negative')
  END IF

  // Store depth requirement
  this.minDepthValue = depth

  RETURN this  // Enable method chaining
END FUNCTION
```

**Complexity:**
- **Time:** O(1)
- **Space:** O(1)

**Notes:**
- Useful for finding distant nodes only
- Example: minDepth(2) excludes immediate neighbors

---

### Algorithm: unique()

**Purpose:** Ensure each node appears only once in results.

**Input:** None

**Output:** this (for method chaining)

**Pseudocode:**
```
FUNCTION unique():
  // Enable deduplication mode
  this.uniqueNodes = true

  RETURN this  // Enable method chaining
END FUNCTION
```

**Complexity:**
- **Time:** O(1)
- **Space:** O(1)

**Notes:**
- Uses Set-based tracking during traversal
- Important for preventing duplicate paths

---

## Execution Methods

### Algorithm: toArray()

**Purpose:** Execute BFS traversal and return all reachable nodes.

**Input:** None (uses instance state)

**Output:** Node[] - Array of nodes reached during traversal

**Pseudocode:**
```
FUNCTION toArray():
  // Initialize tracking structures
  visited = new Set<number>()         // Track visited nodes
  results = []                        // Nodes matching criteria
  queue = [{ nodeId: startNodeId, depth: 0 }]  // BFS queue

  // BFS traversal loop
  WHILE queue is not empty:
    // Dequeue next node
    {nodeId, depth} = queue.shift()

    // Check maximum depth constraint
    IF maxDepthValue is defined AND depth > maxDepthValue:
      CONTINUE to next iteration
    END IF

    // Skip if already visited (for unique mode)
    IF uniqueNodes AND visited.has(nodeId):
      CONTINUE to next iteration
    END IF

    // Mark as visited
    visited.add(nodeId)

    // Fetch node from database
    node = getNode(nodeId)
    IF node is null:
      CONTINUE to next iteration
    END IF

    // Apply filter predicate
    IF filterPredicate exists AND NOT filterPredicate(node):
      CONTINUE to next iteration
    END IF

    // Add to results if within depth range
    IF (minDepthValue is undefined OR depth >= minDepthValue) AND depth > 0:
      results.push(node)
    END IF

    // Explore neighbors based on traversal steps
    IF steps.length > 0:
      // Get appropriate step for current depth
      stepIndex = min(depth, steps.length - 1)
      step = steps[stepIndex]

      // Get neighbors for this step
      neighbors = getNeighbors(nodeId, step)

      // Enqueue neighbors for next level
      FOR EACH neighborId IN neighbors:
        queue.push({ nodeId: neighborId, depth: depth + 1 })
      END FOR
    END IF
  END WHILE

  RETURN results
END FUNCTION
```

**Complexity:**
- **Time:** O(V + E) where V = nodes visited, E = edges traversed
- **Space:** O(V) for visited set and queue

**Algorithm Type:** Breadth-First Search (BFS)

**Notes:**
- BFS guarantees nodes are visited in order of increasing depth
- Does NOT include the start node in results (depth > 0 check)
- Respects min/max depth constraints
- Applies filters during traversal for efficiency

---

### Algorithm: toPaths()

**Purpose:** Execute BFS traversal and return all paths (with full node arrays).

**Input:** None (uses instance state)

**Output:** Node[][] - Array of paths (each path is an array of nodes)

**Pseudocode:**
```
FUNCTION toPaths():
  // Initialize structures
  paths = []                          // Complete paths found
  queue = [{ nodeId: startNodeId, path: [], depth: 0 }]

  // BFS traversal with path tracking
  WHILE queue is not empty:
    // Dequeue next item
    {nodeId, path, depth} = queue.shift()

    // Check maximum depth constraint
    IF maxDepthValue is defined AND depth > maxDepthValue:
      CONTINUE to next iteration
    END IF

    // Fetch node from database
    node = getNode(nodeId)
    IF node is null:
      CONTINUE to next iteration
    END IF

    // Extend current path
    newPath = [...path, node]

    // Apply filter predicate
    IF filterPredicate exists AND NOT filterPredicate(node):
      CONTINUE to next iteration
    END IF

    // Add complete path if we've traversed at least one step
    IF depth > 0:
      paths.push(newPath)
    END IF

    // Explore neighbors
    IF steps.length > 0:
      stepIndex = min(depth, steps.length - 1)
      step = steps[stepIndex]
      neighbors = getNeighbors(nodeId, step)

      // Enqueue neighbors with extended paths
      FOR EACH neighborId IN neighbors:
        queue.push({
          nodeId: neighborId,
          path: newPath,
          depth: depth + 1
        })
      END FOR
    END IF
  END WHILE

  RETURN paths
END FUNCTION
```

**Complexity:**
- **Time:** O(V + E) for traversal + O(P * D) for path copying
  - P = number of paths
  - D = average path depth
- **Space:** O(P * D) for storing all paths

**Algorithm Type:** BFS with path tracking

**Notes:**
- Returns all possible paths, not just nodes
- Can be expensive for highly connected graphs
- Each path is a complete array of nodes from start to end

---

### Algorithm: shortestPath(targetNodeId)

**Purpose:** Find shortest path from start node to target node using BFS.

**Input:**
- `targetNodeId`: number - ID of destination node

**Output:** Node[] | null - Array of nodes in shortest path, or null if no path exists

**Pseudocode:**
```
FUNCTION shortestPath(targetNodeId):
  // Initialize BFS structures
  visited = new Set<number>()           // Visited node tracker
  parent = new Map<number, number>()    // Parent pointers for path reconstruction
  queue = [startNodeId]                 // BFS queue

  // Mark start as visited
  visited.add(startNodeId)

  // BFS loop
  WHILE queue is not empty:
    // Dequeue next node
    currentId = queue.shift()

    // Check if we found the target
    IF currentId equals targetNodeId:
      // Reconstruct and return path
      RETURN reconstructPath(parent, targetNodeId)
    END IF

    // Get neighbors based on traversal steps
    IF steps.length > 0:
      neighbors = getNeighbors(currentId, steps[0])
    ELSE:
      neighbors = getAllNeighbors(currentId)  // Any edge type
    END IF

    // Explore neighbors
    FOR EACH neighborId IN neighbors:
      IF NOT visited.has(neighborId):
        // Mark as visited
        visited.add(neighborId)

        // Record parent for path reconstruction
        parent.set(neighborId, currentId)

        // Enqueue for exploration
        queue.push(neighborId)
      END IF
    END FOR
  END WHILE

  // No path found
  RETURN null
END FUNCTION
```

**Complexity:**
- **Time:** O(V + E) for BFS traversal
- **Space:** O(V) for visited set, parent map, and queue

**Algorithm Type:** Breadth-First Search (BFS)

**Optimality:** Guarantees shortest path in unweighted graphs

**Notes:**
- BFS explores nodes level by level, ensuring shortest path is found first
- Uses parent pointers for efficient path reconstruction
- Returns null if target is unreachable from start node
- Does NOT support weighted edges (all edges assumed weight 1)

---

### Algorithm: allPaths(targetNodeId, maxPaths = 10)

**Purpose:** Find all paths from start node to target node using DFS.

**Input:**
- `targetNodeId`: number - ID of destination node
- `maxPaths`: number - Maximum number of paths to return (default: 10)

**Output:** Node[][] - Array of paths (each path is an array of nodes)

**Pseudocode:**
```
FUNCTION allPaths(targetNodeId, maxPaths = 10):
  // Initialize result storage
  paths = []                            // Complete paths found
  visited = new Set<number>()           // Track nodes in current path (cycle prevention)

  // Get start node
  startNode = getNode(startNodeId)
  IF startNode is null:
    RETURN []
  END IF

  // Recursive DFS helper function
  FUNCTION dfs(currentId, path, depth):
    // Stop if we have enough paths
    IF paths.length >= maxPaths:
      RETURN
    END IF

    // Check maximum depth constraint
    IF maxDepthValue is defined AND depth > maxDepthValue:
      RETURN
    END IF

    // Check if we found target (and not at start)
    IF currentId equals targetNodeId AND depth > 0:
      // Found a complete path
      paths.push([...path])  // Copy path
      RETURN
    END IF

    // Mark current node as visited (in this path)
    visited.add(currentId)

    // Get neighbors for current depth
    IF steps.length > 0:
      stepIndex = min(depth, steps.length - 1)
      step = steps[stepIndex]
      neighbors = getNeighbors(currentId, step)
    ELSE:
      neighbors = getAllNeighbors(currentId)
    END IF

    // Explore each neighbor
    FOR EACH neighborId IN neighbors:
      IF NOT visited.has(neighborId):
        // Get neighbor node
        node = getNode(neighborId)
        IF node is not null:
          // Recursively explore from neighbor
          dfs(neighborId, [...path, node], depth + 1)
        END IF
      END IF
    END FOR

    // Backtrack: remove current node from visited set
    visited.delete(currentId)
  END FUNCTION

  // Start DFS from start node
  dfs(startNodeId, [startNode], 0)

  RETURN paths
END FUNCTION
```

**Complexity:**
- **Time:** O(V * (V-1)!) in worst case (all permutations)
  - Practical: O(b^d) where b = branching factor, d = depth
- **Space:** O(V) for recursion stack and visited set
  - Plus O(P * D) for storing paths

**Algorithm Type:** Depth-First Search (DFS) with backtracking

**Notes:**
- Can be very expensive for densely connected graphs
- Uses `maxPaths` limit to prevent excessive computation
- Backtracking (visited.delete) allows finding all paths, not just shortest
- Cycle prevention ensures no infinite loops

---

## Helper Methods

### Algorithm: getNode(id)

**Purpose:** Fetch a node from the database by ID.

**Input:**
- `id`: number - Node ID to fetch

**Output:** Node | null - Node object or null if not found

**Pseudocode:**
```
FUNCTION getNode(id):
  // Prepare SQL query
  stmt = db.prepare('SELECT * FROM nodes WHERE id = ?')

  // Execute query
  row = stmt.get(id)

  // Check if node exists
  IF row is null:
    RETURN null
  END IF

  // Construct node object
  node = {
    id: row.id,
    type: row.type,
    properties: deserialize(row.properties),  // Parse JSON
    createdAt: timestampToDate(row.created_at),
    updatedAt: timestampToDate(row.updated_at)
  }

  RETURN node
END FUNCTION
```

**Complexity:**
- **Time:** O(1) - indexed lookup by primary key
- **Space:** O(1)

**Notes:**
- Uses prepared statement for efficiency
- Deserializes JSON properties
- Converts timestamps to Date objects

---

### Algorithm: getNeighbors(nodeId, step)

**Purpose:** Get neighbor node IDs for a specific traversal step.

**Input:**
- `nodeId`: number - Current node ID
- `step`: TraversalStep - Traversal step configuration

**Output:** number[] - Array of neighbor node IDs

**Pseudocode:**
```
FUNCTION getNeighbors(nodeId, step):
  // Initialize SQL and parameters
  params = [nodeId, step.edgeType]

  IF step.direction equals 'out':
    // Outgoing edges: current -> neighbor
    sql = '
      SELECT e.to_id as id
      FROM edges e
      WHERE e.from_id = ? AND e.type = ?
    '

    // Add node type filter if specified
    IF step.nodeType is defined:
      sql += ' AND EXISTS (
        SELECT 1 FROM nodes n
        WHERE n.id = e.to_id AND n.type = ?
      )'
      params.push(step.nodeType)
    END IF

  ELSE IF step.direction equals 'in':
    // Incoming edges: neighbor -> current
    sql = '
      SELECT e.from_id as id
      FROM edges e
      WHERE e.to_id = ? AND e.type = ?
    '

    // Add node type filter if specified
    IF step.nodeType is defined:
      sql += ' AND EXISTS (
        SELECT 1 FROM nodes n
        WHERE n.id = e.from_id AND n.type = ?
      )'
      params.push(step.nodeType)
    END IF

  ELSE:  // direction equals 'both'
    // Bidirectional edges
    sql = '
      SELECT e.to_id as id
      FROM edges e
      WHERE e.from_id = ? AND e.type = ?
      UNION
      SELECT e.from_id as id
      FROM edges e
      WHERE e.to_id = ? AND e.type = ?
    '
    params.push(nodeId, step.edgeType)  // Add params for UNION part

    // Add node type filter if specified
    IF step.nodeType is defined:
      sql += ' AND EXISTS (
        SELECT 1 FROM nodes n
        WHERE n.id = id AND n.type = ?
      )'
      params.push(step.nodeType)
    END IF
  END IF

  // Execute query
  stmt = db.prepare(sql)
  rows = stmt.all(...params)

  // Extract node IDs
  neighborIds = rows.map(row => row.id)

  RETURN neighborIds
END FUNCTION
```

**Complexity:**
- **Time:** O(E_node) where E_node = edges connected to node
- **Space:** O(E_node) for result set

**Notes:**
- Uses SQL UNION for bidirectional traversal
- Filters by edge type and optional node type
- Returns IDs only (nodes fetched separately)

---

### Algorithm: getAllNeighbors(nodeId)

**Purpose:** Get all neighbor node IDs (any edge type, bidirectional).

**Input:**
- `nodeId`: number - Current node ID

**Output:** number[] - Array of neighbor node IDs

**Pseudocode:**
```
FUNCTION getAllNeighbors(nodeId):
  // SQL to get all connected nodes (any edge type, both directions)
  sql = '
    SELECT to_id as id FROM edges WHERE from_id = ?
    UNION
    SELECT from_id as id FROM edges WHERE to_id = ?
  '

  // Execute query
  stmt = db.prepare(sql)
  rows = stmt.all(nodeId, nodeId)

  // Extract node IDs
  neighborIds = rows.map(row => row.id)

  RETURN neighborIds
END FUNCTION
```

**Complexity:**
- **Time:** O(E_node) where E_node = total edges connected to node
- **Space:** O(E_node) for result set

**Notes:**
- Used by shortestPath when no traversal steps defined
- Bidirectional by default
- No filtering by edge type or node type

---

### Algorithm: reconstructPath(parent, targetId)

**Purpose:** Reconstruct path from parent map (used by BFS shortest path).

**Input:**
- `parent`: Map<number, number> - Parent pointers from BFS
- `targetId`: number - Destination node ID

**Output:** Node[] - Array of nodes representing the path

**Pseudocode:**
```
FUNCTION reconstructPath(parent, targetId):
  // Initialize path array
  path = []

  // Start from target and work backwards
  currentId = targetId

  // Traverse parent pointers until reaching start (no parent)
  WHILE currentId is defined:
    // Fetch node
    node = getNode(currentId)

    IF node is not null:
      // Add to front of path
      path.unshift(node)  // Add to beginning
    END IF

    // Move to parent
    currentId = parent.get(currentId)
  END WHILE

  RETURN path
END FUNCTION
```

**Complexity:**
- **Time:** O(D) where D = path depth (number of hops)
- **Space:** O(D) for path array

**Notes:**
- Builds path from end to start, then reverses with unshift
- Parent map built during BFS traversal
- Start node has no parent (undefined)

---

## Algorithm Complexity Analysis

### Summary Table

| Method | Algorithm | Time Complexity | Space Complexity | Notes |
|--------|-----------|----------------|------------------|-------|
| `out()`, `in()`, `both()` | Builder | O(1) | O(1) | Appends to steps array |
| `filter()` | Builder | O(1) | O(1) | Chains predicates |
| `maxDepth()`, `minDepth()` | Builder | O(1) | O(1) | Sets constraints |
| `unique()` | Builder | O(1) | O(1) | Sets flag |
| `toArray()` | BFS | O(V + E) | O(V) | V = nodes, E = edges |
| `toPaths()` | BFS + paths | O(V + E + P*D) | O(P*D) | P = paths, D = depth |
| `shortestPath()` | BFS | O(V + E) | O(V) | Optimal for unweighted |
| `allPaths()` | DFS + backtrack | O(b^d) | O(V + P*D) | b = branching, d = depth |
| `getNode()` | DB lookup | O(1) | O(1) | Indexed by primary key |
| `getNeighbors()` | DB query | O(E_node) | O(E_node) | Per-node edges |

### Graph Size Considerations

**Small Graphs (< 1000 nodes):**
- All algorithms perform well
- `allPaths()` is feasible even without maxPaths limit

**Medium Graphs (1000-100k nodes):**
- Use `maxDepth()` to limit traversal
- Set `maxPaths` for `allPaths()`
- Consider `unique()` for dense graphs

**Large Graphs (> 100k nodes):**
- Always use `maxDepth()` (recommended: 2-5)
- Use `shortestPath()` instead of `allPaths()`
- Apply `filter()` early to reduce search space
- Consider indexed edge queries

### Performance Optimization Tips

1. **Use depth limits:** Always set `maxDepth()` for large graphs
2. **Filter early:** Apply predicates that eliminate most nodes first
3. **Limit results:** Use `maxPaths` parameter for `allPaths()`
4. **Index edges:** Database indexes on `from_id`, `to_id`, `type` are critical
5. **Node type filtering:** Use `nodeType` parameter in traversal steps when possible
6. **Unique mode:** Enable `unique()` for cyclic graphs to prevent redundant work

---

## Algorithm Patterns

### Pattern 1: Level-Order Traversal (BFS)
```
START -> Level 0 (depth 0)
  └─> Level 1 (depth 1) [immediate neighbors]
       └─> Level 2 (depth 2) [neighbors of neighbors]
            └─> Level 3 (depth 3) ...
```

**Use cases:** Finding all nodes within N hops, shortest paths

### Pattern 2: Depth-First Exploration (DFS)
```
START -> Path A -> Path A1 -> Path A1a ...
                -> Path A2 -> Path A2a ...
      -> Path B -> Path B1 ...
```

**Use cases:** Enumerating all paths, exploring deeply before broadly

### Pattern 3: Bidirectional Search
```
For edge Job --SIMILAR_TO--> Job2

Direction 'out':  Job1 -> Job2
Direction 'in':   Job2 -> Job1
Direction 'both': Job1 <-> Job2 (explores both)
```

**Use cases:** Undirected relationships, mutual connections

---

## Error Cases and Edge Conditions

### Empty Results
- Start node doesn't exist → empty array
- No matching edges → empty array
- All nodes filtered out → empty array

### Infinite Loops Prevention
- Cycle detection via `visited` set
- Mandatory `maxDepth` for large graphs
- Backtracking in DFS prevents revisiting in same path

### Performance Degradation
- Dense graphs without depth limits → exponential explosion
- Many `filter()` calls → O(k) per node check
- Large `maxPaths` in `allPaths()` → memory exhaustion

---

**Document Version:** 1.0.0
**API Version:** 1.0.0
**Last Updated:** 2025-10-27
**Maintained by:** Michael O'Boyle and Claude Code
