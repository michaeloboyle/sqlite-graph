# NodeQuery Pseudocode Specification

**Version:** 1.0.0
**Created:** 2025-10-27
**Purpose:** Fluent query builder for node operations with method chaining

---

## Architecture Overview

NodeQuery implements the **Builder Pattern** with:
- Immutable query state (returns new instance or this for chaining)
- Lazy execution (only runs SQL on exec/count/first)
- SQL generation from accumulated state
- Type-safe generic properties

---

## Class Structure

```typescript
class NodeQuery<T extends NodeData = NodeData> {
  private database: Database;          // Reference to parent database
  private nodeType: string;             // Node type filter
  private whereConditions: WhereClause[]; // Accumulated WHERE clauses
  private joins: JoinClause[];          // JOIN statements for connectedTo
  private filterPredicates: FilterFn[]; // Post-SQL filter functions
  private orderClauses: OrderClause[];  // ORDER BY clauses
  private limitValue: number | null;    // LIMIT value
  private offsetValue: number | null;   // OFFSET value
}
```

---

## Algorithm 1: Constructor

```
FUNCTION Constructor(database: Database, nodeType: string)
  INPUT:
    database: GraphDatabase instance
    nodeType: string (e.g., 'Job', 'Company')

  ALGORITHM:
    1. Validate inputs
       IF nodeType is empty string OR not string
         THROW Error("Node type must be a non-empty string")
       END IF

    2. Initialize query state
       SET this.database = database
       SET this.nodeType = nodeType
       SET this.whereConditions = []
       SET this.joins = []
       SET this.filterPredicates = []
       SET this.orderClauses = []
       SET this.limitValue = null
       SET this.offsetValue = null

  OUTPUT: NodeQuery instance

  COMPLEXITY: O(1)
```

---

## Algorithm 2: where(conditions)

```
FUNCTION where(conditions: Partial<T>)
  INPUT:
    conditions: object with property key-value pairs
    Example: { status: 'active', remote: true }

  ALGORITHM:
    1. Validate conditions
       IF conditions is null OR not object
         THROW Error("Where conditions must be an object")
       END IF

       IF conditions is empty object
         RETURN this  // No-op for empty conditions
       END IF

    2. Parse conditions into WHERE clauses
       FOR EACH key, value IN conditions
         CREATE WhereClause:
           field = key
           operator = '='
           value = value
           sqlFragment = buildJsonExtractClause(key, value)

         // Handle nested properties (e.g., 'location.city')
         IF key contains '.'
           parts = key.split('.')
           sqlFragment = "json_extract(properties, '$." + parts.join('.') + "') = ?"
         ELSE
           sqlFragment = "json_extract(properties, '$." + key + "') = ?"
         END IF

         ADD WhereClause to this.whereConditions
       END FOR

    3. Return for chaining
       RETURN this

  OUTPUT: NodeQuery instance (for chaining)

  COMPLEXITY: O(k) where k = number of conditions

  SQL GENERATION:
    WHERE json_extract(properties, '$.status') = 'active'
      AND json_extract(properties, '$.remote') = true
```

---

## Algorithm 3: connectedTo(nodeType, edgeType, direction?)

```
FUNCTION connectedTo(nodeType: string, edgeType: string, direction: 'out' | 'in' | 'both' = 'out')
  INPUT:
    nodeType: type of connected nodes (e.g., 'Company')
    edgeType: edge type connecting nodes (e.g., 'POSTED_BY')
    direction: traversal direction (default: 'out')

  ALGORITHM:
    1. Validate inputs
       IF nodeType is empty OR edgeType is empty
         THROW Error("Node type and edge type are required")
       END IF

       IF direction NOT IN ['out', 'in', 'both']
         THROW Error("Direction must be 'out', 'in', or 'both'")
       END IF

    2. Generate JOIN clause based on direction
       SET joinAlias = 'e' + this.joins.length  // e0, e1, e2...
       SET targetAlias = 'n' + this.joins.length // n0, n1, n2...

       IF direction == 'out'
         // nodes JOIN edges ON nodes.id = edges.from_id
         // JOIN target_nodes ON edges.to_id = target_nodes.id
         CREATE JoinClause:
           type = 'INNER JOIN'
           table = 'edges AS ' + joinAlias
           condition = 'nodes.id = ' + joinAlias + '.from_id'
           edgeTypeFilter = joinAlias + '.type = ?'
           params = [edgeType]

         ADD second JoinClause:
           type = 'INNER JOIN'
           table = 'nodes AS ' + targetAlias
           condition = joinAlias + '.to_id = ' + targetAlias + '.id'
           nodeTypeFilter = targetAlias + '.type = ?'
           params = [nodeType]

       ELSE IF direction == 'in'
         // nodes JOIN edges ON nodes.id = edges.to_id
         // JOIN source_nodes ON edges.from_id = source_nodes.id
         CREATE JoinClause:
           type = 'INNER JOIN'
           table = 'edges AS ' + joinAlias
           condition = 'nodes.id = ' + joinAlias + '.to_id'
           edgeTypeFilter = joinAlias + '.type = ?'
           params = [edgeType]

         ADD second JoinClause:
           type = 'INNER JOIN'
           table = 'nodes AS ' + targetAlias
           condition = joinAlias + '.from_id = ' + targetAlias + '.id'
           nodeTypeFilter = targetAlias + '.type = ?'
           params = [nodeType]

       ELSE IF direction == 'both'
         // Use LEFT JOIN with OR conditions
         CREATE JoinClause:
           type = 'INNER JOIN'
           table = 'edges AS ' + joinAlias
           condition = '(nodes.id = ' + joinAlias + '.from_id OR nodes.id = ' + joinAlias + '.to_id)'
           edgeTypeFilter = joinAlias + '.type = ?'
           params = [edgeType]

         ADD second JoinClause:
           type = 'INNER JOIN'
           table = 'nodes AS ' + targetAlias
           condition = '(' + joinAlias + '.to_id = ' + targetAlias + '.id OR ' + joinAlias + '.from_id = ' + targetAlias + '.id)'
           nodeTypeFilter = targetAlias + '.type = ?'
           params = [nodeType]
       END IF

    3. Add to join list
       ADD JoinClause(s) to this.joins

    4. Return for chaining
       RETURN this

  OUTPUT: NodeQuery instance (for chaining)

  COMPLEXITY: O(1)

  SQL GENERATION (direction='out'):
    SELECT DISTINCT nodes.*
    FROM nodes
    INNER JOIN edges AS e0 ON nodes.id = e0.from_id
    INNER JOIN nodes AS n0 ON e0.to_id = n0.id
    WHERE nodes.type = 'Job'
      AND e0.type = 'POSTED_BY'
      AND n0.type = 'Company'
```

---

## Algorithm 4: filter(predicateFn)

```
FUNCTION filter(predicate: (node: Node<T>) => boolean)
  INPUT:
    predicate: function that returns true for nodes to include

  ALGORITHM:
    1. Validate predicate
       IF predicate is not a function
         THROW Error("Filter predicate must be a function")
       END IF

    2. Store predicate for post-processing
       ADD predicate to this.filterPredicates

       // Note: Filter predicates are applied AFTER SQL execution
       // This allows for complex JavaScript logic that can't be expressed in SQL

    3. Return for chaining
       RETURN this

  OUTPUT: NodeQuery instance (for chaining)

  COMPLEXITY: O(1) - execution deferred until exec()

  EXECUTION (in exec()):
    results = executeSQLQuery()
    FOR EACH node IN results
      FOR EACH predicate IN this.filterPredicates
        IF NOT predicate(node)
          REMOVE node from results
          BREAK  // Skip to next node
        END IF
      END FOR
    END FOR
```

---

## Algorithm 5: orderBy(field, direction)

```
FUNCTION orderBy(field: string, direction: 'asc' | 'desc' = 'asc')
  INPUT:
    field: property name or 'created_at'/'updated_at'
    direction: sort direction (default: 'asc')

  ALGORITHM:
    1. Validate inputs
       IF field is empty string
         THROW Error("Order field cannot be empty")
       END IF

       IF direction NOT IN ['asc', 'desc']
         SET direction = 'asc'  // Default to ascending
       END IF

    2. Create ORDER BY clause
       IF field == 'created_at' OR field == 'updated_at'
         // Use timestamp column directly
         CREATE OrderClause:
           field = field
           direction = direction
           sqlFragment = field + ' ' + direction.toUpperCase()
       ELSE
         // Extract from JSON properties
         CREATE OrderClause:
           field = field
           direction = direction
           sqlFragment = "json_extract(properties, '$." + field + "') " + direction.toUpperCase()
       END IF

    3. Add to order clauses
       ADD OrderClause to this.orderClauses

       // Note: Multiple orderBy calls create secondary sorting
       // Example: .orderBy('status', 'asc').orderBy('created_at', 'desc')
       // SQL: ORDER BY status ASC, created_at DESC

    4. Return for chaining
       RETURN this

  OUTPUT: NodeQuery instance (for chaining)

  COMPLEXITY: O(1)

  SQL GENERATION:
    ORDER BY json_extract(properties, '$.status') ASC,
             created_at DESC
```

---

## Algorithm 6: limit(count)

```
FUNCTION limit(count: number)
  INPUT:
    count: maximum number of results to return

  ALGORITHM:
    1. Validate count
       IF count is not an integer OR count < 0
         THROW Error("Limit must be a non-negative integer")
       END IF

    2. Store limit value
       SET this.limitValue = count

    3. Return for chaining
       RETURN this

  OUTPUT: NodeQuery instance (for chaining)

  COMPLEXITY: O(1)

  SQL GENERATION:
    LIMIT 10
```

---

## Algorithm 7: offset(count)

```
FUNCTION offset(count: number)
  INPUT:
    count: number of results to skip

  ALGORITHM:
    1. Validate count
       IF count is not an integer OR count < 0
         THROW Error("Offset must be a non-negative integer")
       END IF

    2. Store offset value
       SET this.offsetValue = count

    3. Return for chaining
       RETURN this

  OUTPUT: NodeQuery instance (for chaining)

  COMPLEXITY: O(1)

  SQL GENERATION:
    OFFSET 20

  NOTE: Typically used with limit() for pagination:
    .limit(10).offset(20)  // Page 3, 10 items per page
```

---

## Algorithm 8: exec()

```
FUNCTION exec()
  OUTPUT: Node<T>[]

  ALGORITHM:
    1. Build SQL query from accumulated state
       CALL buildSQLQuery() -> (sql, params)

    2. Execute prepared statement
       statement = this.database.prepare(sql)
       rawRows = statement.all(...params)

    3. Deserialize and transform rows
       results = []
       FOR EACH row IN rawRows
         node = {
           id: row.id,
           type: row.type,
           properties: deserialize<T>(row.properties),
           createdAt: timestampToDate(row.created_at),
           updatedAt: timestampToDate(row.updated_at)
         }
         ADD node to results
       END FOR

    4. Apply filter predicates (post-SQL filtering)
       IF this.filterPredicates is not empty
         filteredResults = []
         FOR EACH node IN results
           passesAllFilters = true
           FOR EACH predicate IN this.filterPredicates
             IF NOT predicate(node)
               passesAllFilters = false
               BREAK
             END IF
           END FOR

           IF passesAllFilters
             ADD node to filteredResults
           END IF
         END FOR
         results = filteredResults
       END IF

    5. Return results
       RETURN results

  COMPLEXITY:
    O(n) where n = number of results
    + O(m) for filter predicates where m = filtered results
    Total: O(n + m*p) where p = number of predicates
```

---

## Algorithm 9: buildSQLQuery() (Internal Helper)

```
FUNCTION buildSQLQuery()
  OUTPUT: (sql: string, params: any[])

  ALGORITHM:
    1. Initialize query parts
       params = []

    2. Build SELECT clause
       sql = "SELECT DISTINCT nodes.* FROM nodes"

       // Use DISTINCT to avoid duplicates from JOINs

    3. Add JOIN clauses
       FOR EACH join IN this.joins
         sql += ' ' + join.type + ' ' + join.table
         sql += ' ON ' + join.condition

         IF join.edgeTypeFilter exists
           // Add to WHERE clause later
         END IF

         IF join.nodeTypeFilter exists
           // Add to WHERE clause later
         END IF

         ADD join.params to params
       END FOR

    4. Build WHERE clause
       whereFragments = []

       // Add node type filter
       ADD "nodes.type = ?" to whereFragments
       ADD this.nodeType to params

       // Add where conditions
       FOR EACH condition IN this.whereConditions
         ADD condition.sqlFragment to whereFragments
         ADD condition.value to params
       END FOR

       // Add JOIN filters
       FOR EACH join IN this.joins
         IF join.edgeTypeFilter exists
           ADD join.edgeTypeFilter to whereFragments
         END IF
         IF join.nodeTypeFilter exists
           ADD join.nodeTypeFilter to whereFragments
         END IF
       END FOR

       IF whereFragments is not empty
         sql += ' WHERE ' + whereFragments.join(' AND ')
       END IF

    5. Build ORDER BY clause
       IF this.orderClauses is not empty
         orderFragments = []
         FOR EACH order IN this.orderClauses
           ADD order.sqlFragment to orderFragments
         END FOR
         sql += ' ORDER BY ' + orderFragments.join(', ')
       END IF

    6. Add LIMIT and OFFSET
       IF this.limitValue is not null
         sql += ' LIMIT ?'
         ADD this.limitValue to params
       END IF

       IF this.offsetValue is not null
         sql += ' OFFSET ?'
         ADD this.offsetValue to params
       END IF

    7. Return SQL and parameters
       RETURN (sql, params)

  COMPLEXITY: O(w + j + o) where
    w = number of where conditions
    j = number of joins
    o = number of order clauses

  EXAMPLE OUTPUT:
    sql = "
      SELECT DISTINCT nodes.*
      FROM nodes
      INNER JOIN edges AS e0 ON nodes.id = e0.from_id
      INNER JOIN nodes AS n0 ON e0.to_id = n0.id
      WHERE nodes.type = ?
        AND json_extract(properties, '$.status') = ?
        AND e0.type = ?
        AND n0.type = ?
      ORDER BY created_at DESC
      LIMIT ?
      OFFSET ?
    "
    params = ['Job', 'active', 'POSTED_BY', 'Company', 10, 0]
```

---

## Algorithm 10: count()

```
FUNCTION count()
  OUTPUT: number

  ALGORITHM:
    1. Build count query (optimization)
       CALL buildCountSQLQuery() -> (sql, params)

       // Similar to buildSQLQuery but with SELECT COUNT(DISTINCT nodes.id)

    2. Execute query
       statement = this.database.prepare(sql)
       result = statement.get(...params)

    3. Return count
       RETURN result.count

  COMPLEXITY: O(1) - Database handles counting

  SQL EXAMPLE:
    SELECT COUNT(DISTINCT nodes.id) as count
    FROM nodes
    WHERE nodes.type = 'Job'
      AND json_extract(properties, '$.status') = 'active'
```

---

## Algorithm 11: first()

```
FUNCTION first()
  OUTPUT: Node<T> | null

  ALGORITHM:
    1. Temporarily set limit to 1
       originalLimit = this.limitValue
       this.limitValue = 1

    2. Execute query
       results = CALL this.exec()

    3. Restore original limit
       this.limitValue = originalLimit

    4. Return first result or null
       IF results.length > 0
         RETURN results[0]
       ELSE
         RETURN null
       END IF

  COMPLEXITY: O(1) - Limited to single row

  OPTIMIZATION:
    Uses LIMIT 1 in SQL for performance
```

---

## SQL Query Examples

### Example 1: Simple where query
```typescript
db.nodes('Job').where({ status: 'active' }).exec()
```
```sql
SELECT DISTINCT nodes.*
FROM nodes
WHERE nodes.type = ?
  AND json_extract(properties, '$.status') = ?

params: ['Job', 'active']
```

### Example 2: Connected nodes with filters
```typescript
db.nodes('Job')
  .where({ status: 'active' })
  .connectedTo('Company', 'POSTED_BY', 'out')
  .orderBy('created_at', 'desc')
  .limit(10)
  .exec()
```
```sql
SELECT DISTINCT nodes.*
FROM nodes
INNER JOIN edges AS e0 ON nodes.id = e0.from_id
INNER JOIN nodes AS n0 ON e0.to_id = n0.id
WHERE nodes.type = ?
  AND json_extract(properties, '$.status') = ?
  AND e0.type = ?
  AND n0.type = ?
ORDER BY created_at DESC
LIMIT ?

params: ['Job', 'active', 'POSTED_BY', 'Company', 10]
```

### Example 3: Multiple conditions with JavaScript filter
```typescript
db.nodes('Job')
  .where({ status: 'active', remote: true })
  .filter(node => node.properties.salary > 100000)
  .orderBy('salary', 'desc')
  .exec()
```
```sql
SELECT DISTINCT nodes.*
FROM nodes
WHERE nodes.type = ?
  AND json_extract(properties, '$.status') = ?
  AND json_extract(properties, '$.remote') = ?
ORDER BY json_extract(properties, '$.salary') DESC

params: ['Job', 'active', true]

// Then apply JavaScript filter:
results.filter(node => node.properties.salary > 100000)
```

---

## Performance Characteristics

### Time Complexity
- **where()**: O(1) per call, deferred until exec
- **connectedTo()**: O(1) per call, deferred until exec
- **filter()**: O(1) per call, O(n*p) on exec where n=results, p=predicates
- **orderBy()**: O(1) per call, O(n log n) on exec (database sorting)
- **limit()**: O(1)
- **offset()**: O(1)
- **exec()**: O(n + m*p) where n=raw results, m=filtered, p=predicates
- **count()**: O(1) - database optimization
- **first()**: O(1) - uses LIMIT 1

### Space Complexity
- Query state: O(w + j + f + o) where
  - w = where conditions
  - j = joins
  - f = filter predicates
  - o = order clauses
- Results: O(n) where n = number of matched nodes

### Database Optimization Notes
1. **Indexes**: Create indexes on frequently queried JSON properties
   ```sql
   CREATE INDEX idx_job_status ON nodes(json_extract(properties, '$.status'))
     WHERE type = 'Job';
   ```

2. **DISTINCT**: Used to avoid duplicates from JOINs, but adds overhead
   - Consider removing if duplicate handling not needed

3. **JSON extraction**: Can be slow for large datasets
   - Consider materializing frequently queried properties

4. **Filter predicates**: Applied in JavaScript, not SQL
   - Use WHERE clauses when possible for better performance

---

## Error Handling

### Validation Errors
```
- Empty node type
- Invalid conditions object
- Invalid direction in connectedTo
- Non-function filter predicate
- Negative limit/offset values
```

### Database Errors
```
- SQL syntax errors
- Foreign key violations
- Database connection issues
- JSON parsing errors
```

### Error Propagation
```
All methods return this for chaining, except:
- exec() -> throws on SQL error
- count() -> throws on SQL error
- first() -> throws on SQL error
```

---

## Thread Safety
- **Not thread-safe**: Query builders maintain mutable state
- **Usage**: Create new query per operation
- **Database**: Uses better-sqlite3 synchronous API (inherently thread-safe at DB level)

---

## Testing Strategy

### Unit Tests
1. Constructor validation
2. Each method in isolation
3. Method chaining combinations
4. SQL generation correctness
5. Parameter binding validation

### Integration Tests
1. End-to-end query execution
2. Complex multi-join queries
3. Filter predicate application
4. Pagination scenarios
5. Performance benchmarks

### Edge Cases
1. Empty results
2. NULL/undefined property values
3. Nested JSON property extraction
4. Large result sets
5. Complex filter logic

---

**Document Version:** 1.0.0
**Last Updated:** 2025-10-27
**Maintained by:** Michael O'Boyle and Claude Code
