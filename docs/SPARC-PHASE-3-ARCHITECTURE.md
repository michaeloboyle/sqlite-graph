# SPARC Phase 3 Architecture: Pattern Matching & Bulk Operations

**Project**: sqlite-graph
**Version**: 2.0.0
**Phase**: 3 - Architecture
**Status**: Design Complete
**Authors**: Michael O'Boyle, Claude Code
**Date**: 2025-01-14

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Pattern Matching Architecture](#pattern-matching-architecture)
3. [Bulk Operations Architecture](#bulk-operations-architecture)
4. [Type System](#type-system)
5. [Database Schema Enhancements](#database-schema-enhancements)
6. [Integration Points](#integration-points)
7. [Implementation Sequence](#implementation-sequence)
8. [Testing Architecture](#testing-architecture)

---

## Architecture Overview

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                       GraphDatabase API                         │
├─────────────────────────────────────────────────────────────────┤
│  Existing:          │  Phase 3A:           │  Phase 3B:         │
│  - createNode()     │  - match()           │  - createNodes()   │
│  - createEdge()     │  - PatternQuery      │  - createEdges()   │
│  - nodes()          │                      │  - updateNodes()   │
│  - traverse()       │                      │  - deleteNodes()   │
│  - transaction()    │                      │  - etc.            │
└─────────────────────────────────────────────────────────────────┘
           │                    │                      │
           ▼                    ▼                      ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   NodeQuery      │  │  PatternQuery    │  │ BulkOperations   │
│   TraversalQuery │  │  (new)           │  │ (new)            │
└──────────────────┘  └──────────────────┘  └──────────────────┘
           │                    │                      │
           └────────────────────┴──────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
           ┌─────────────────┐   ┌─────────────────┐
           │ PatternParser   │   │ SQLGenerator    │
           │ (new)           │   │ (new)           │
           └─────────────────┘   └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
           ┌─────────────────┐   ┌─────────────────┐
           │  SQLite DB      │   │ Prepared Stmts  │
           │  (nodes/edges)  │   │ Cache           │
           └─────────────────┘   └─────────────────┘
```

### Module Organization

```
src/
├── core/
│   ├── Database.ts         # Main API (existing + new bulk methods)
│   ├── Schema.ts           # Schema initialization (existing)
│   └── Transaction.ts      # Transaction handling (existing)
├── query/
│   ├── NodeQuery.ts        # Fluent node queries (existing)
│   ├── TraversalQuery.ts   # Graph traversal (existing)
│   └── PatternQuery.ts     # Pattern matching (NEW)
├── pattern/                # NEW MODULE
│   ├── PatternParser.ts    # Parse pattern strings to AST
│   ├── PatternMatcher.ts   # Execute pattern matching
│   ├── SQLGenerator.ts     # Convert patterns to SQL
│   └── ResultBuilder.ts    # Build typed results
├── bulk/                   # NEW MODULE
│   ├── BulkOperations.ts   # Bulk create/update/delete
│   ├── BulkProcessor.ts    # Transaction & batching
│   └── BulkValidator.ts    # Input validation
├── types/
│   ├── index.ts            # Core types (existing)
│   ├── pattern.ts          # Pattern matching types (NEW)
│   └── bulk.ts             # Bulk operation types (NEW)
└── utils/
    ├── serialization.ts    # JSON serialization (existing)
    ├── validation.ts       # Input validation (existing)
    └── sql-helpers.ts      # SQL query helpers (NEW)
```

---

## Pattern Matching Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        PatternQuery (Fluent API)                │
├─────────────────────────────────────────────────────────────────┤
│  .match(pattern: string)                                        │
│  .where(conditions: PatternConditions)                          │
│  .optionalMatch(pattern: string)                                │
│  .return(variables: string[])                                   │
│  .exec<T>(): T[]                                                │
└─────────────────────────────────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│    PatternParser         │      │    PatternMatcher        │
├──────────────────────────┤      ├──────────────────────────┤
│ parse(pattern): AST      │      │ execute(query): Result[] │
│                          │      │                          │
│ - parseNodePattern()     │      │ - buildSQL()             │
│ - parseEdgePattern()     │      │ - executeQuery()         │
│ - parsePathPattern()     │      │ - mapResults()           │
│ - validatePattern()      │      │                          │
└──────────────────────────┘      └──────────────────────────┘
                │                             │
                │                             ▼
                │                  ┌──────────────────────────┐
                │                  │    SQLGenerator          │
                │                  ├──────────────────────────┤
                │                  │ generateSQL(ast): string │
                │                  │                          │
                │                  │ - buildNodeJoin()        │
                │                  │ - buildEdgeJoin()        │
                │                  │ - buildWhereClause()     │
                │                  │ - buildReturnClause()    │
                │                  └──────────────────────────┘
                │                             │
                └─────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│    ResultBuilder         │      │    SQLite Database       │
├──────────────────────────┤      └──────────────────────────┘
│ buildResult(rows): T[]   │
│                          │
│ - mapToNodes()           │
│ - mapToEdges()           │
│ - mapToPaths()           │
│ - handleOptional()       │
└──────────────────────────┘
```

### PatternQuery Class (src/query/PatternQuery.ts)

```typescript
/**
 * Fluent query builder for Cypher-style pattern matching.
 *
 * @example
 * db.match('(j:Job)-[:POSTED_BY]->(c:Company)')
 *   .where({ c: { name: 'TechCorp' } })
 *   .return(['j', 'c'])
 *   .exec();
 */
export class PatternQuery {
  private db: Database.Database;
  private patterns: ParsedPattern[] = [];
  private optionalPatterns: ParsedPattern[] = [];
  private whereConditions: PatternConditions = {};
  private returnVars: string[] = [];

  constructor(db: Database.Database, initialPattern: string) {
    this.db = db;
    this.patterns.push(PatternParser.parse(initialPattern));
  }

  match(pattern: string): this {
    this.patterns.push(PatternParser.parse(pattern));
    return this;
  }

  optionalMatch(pattern: string): this {
    this.optionalPatterns.push(PatternParser.parse(pattern));
    return this;
  }

  where(conditions: PatternConditions): this {
    // Merge conditions
    for (const [variable, props] of Object.entries(conditions)) {
      this.whereConditions[variable] = {
        ...(this.whereConditions[variable] || {}),
        ...props
      };
    }
    return this;
  }

  return(variables: string[]): this {
    this.returnVars = variables;
    return this;
  }

  exec<T = PatternResult>(): T[] {
    // Delegate to PatternMatcher
    const matcher = new PatternMatcher(this.db);
    return matcher.execute({
      patterns: this.patterns,
      optionalPatterns: this.optionalPatterns,
      where: this.whereConditions,
      return: this.returnVars
    });
  }
}
```

### PatternParser (src/pattern/PatternParser.ts)

**Responsibility**: Convert pattern strings to AST

```typescript
/**
 * Parser for Cypher-style graph patterns.
 * Converts pattern strings to structured AST for SQL generation.
 */
export class PatternParser {
  /**
   * Parse a pattern string into an AST.
   *
   * Pattern syntax:
   * - Node: (variable:Type {property: value})
   * - Edge: -[variable:TYPE]->
   * - Path: (a)-[:TYPE]->(b)-[:TYPE2]->(c)
   */
  static parse(pattern: string): ParsedPattern {
    // Remove whitespace for easier parsing
    const normalized = pattern.replace(/\s+/g, ' ').trim();

    const nodes: NodePattern[] = [];
    const edges: EdgePattern[] = [];

    // Regex patterns for matching
    const nodeRegex = /\(([a-z]+)?(?::([A-Z][a-zA-Z]*))?(?:\s*\{([^}]+)\})?\)/g;
    const edgeRegex = /(-\[([a-z]+)?(?::([A-Z_]+))(?:\*([0-9]+)\.\.([0-9]+))?\]-?>|<-\[([a-z]+)?(?::([A-Z_]+))(?:\*([0-9]+)\.\.([0-9]+))?\]-)/g;

    // Parse nodes
    let match;
    while ((match = nodeRegex.exec(normalized)) !== null) {
      nodes.push({
        variable: match[1],
        type: match[2],
        properties: match[3] ? this.parseProperties(match[3]) : undefined
      });
    }

    // Parse edges
    while ((match = edgeRegex.exec(normalized)) !== null) {
      edges.push({
        variable: match[2] || match[6],
        type: match[3] || match[7],
        direction: match[0].startsWith('<-') ? 'in' : 'out',
        minHops: match[4] || match[8] ? parseInt(match[4] || match[8]) : undefined,
        maxHops: match[5] || match[9] ? parseInt(match[5] || match[9]) : undefined
      });
    }

    // Validate pattern structure
    this.validatePattern(nodes, edges);

    return { nodes, edges, paths: this.buildPaths(nodes, edges) };
  }

  private static parseProperties(propsStr: string): Record<string, any> {
    // Parse {key: value, key2: value2} syntax
    const props: Record<string, any> = {};
    const pairs = propsStr.split(',');

    for (const pair of pairs) {
      const [key, value] = pair.split(':').map(s => s.trim());
      props[key] = this.parseValue(value);
    }

    return props;
  }

  private static parseValue(value: string): any {
    // Parse quoted strings, numbers, booleans
    if (value.startsWith("'") && value.endsWith("'")) {
      return value.slice(1, -1);
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value))) return Number(value);
    return value;
  }

  private static buildPaths(
    nodes: NodePattern[],
    edges: EdgePattern[]
  ): PathPattern[] {
    // Build path structures from nodes and edges
    // A path is: startNode -> edge -> intermediateNode -> edge -> endNode
    const paths: PathPattern[] = [];

    if (nodes.length === 0 || edges.length === 0) {
      return paths;
    }

    // For now, assume linear paths (future: support branching)
    for (let i = 0; i < edges.length; i++) {
      paths.push({
        start: nodes[i],
        edges: [edges[i]],
        intermediate: i + 1 < nodes.length - 1 ? [nodes[i + 1]] : [],
        end: nodes[i + 1] || nodes[i]
      });
    }

    return paths;
  }

  private static validatePattern(
    nodes: NodePattern[],
    edges: EdgePattern[]
  ): void {
    // Ensure pattern is valid
    if (edges.length > 0 && nodes.length < 2) {
      throw new PatternSyntaxError(
        'Pattern with edges must have at least 2 nodes',
        '',
        0
      );
    }

    // Validate variable-length paths have max depth
    for (const edge of edges) {
      if (edge.maxHops === undefined && edge.minHops !== undefined) {
        throw new PatternSyntaxError(
          'Variable-length paths must have maximum depth',
          '',
          0
        );
      }
    }
  }
}
```

### SQLGenerator (src/pattern/SQLGenerator.ts)

**Responsibility**: Convert parsed patterns to optimized SQL

```typescript
/**
 * Generate optimized SQL from parsed pattern AST.
 */
export class SQLGenerator {
  /**
   * Generate SQL SELECT statement for pattern matching.
   */
  static generate(
    pattern: ParsedPattern,
    whereConditions: PatternConditions,
    returnVars: string[]
  ): { sql: string; params: any[] } {
    const { nodes, edges } = pattern;
    const params: any[] = [];

    // Build SELECT clause
    const selectCols = this.buildSelectClause(nodes, edges, returnVars);

    // Build FROM clause (start with first node)
    let sql = `SELECT ${selectCols} FROM nodes ${this.varAlias(nodes[0].variable || 'n0')}`;

    // Build JOINs for edges and nodes
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const sourceNode = nodes[i];
      const targetNode = nodes[i + 1];

      const edgeAlias = this.varAlias(edge.variable || `e${i}`);
      const targetAlias = this.varAlias(targetNode?.variable || `n${i + 1}`);

      if (edge.direction === 'out') {
        sql += ` JOIN edges ${edgeAlias} ON ${edgeAlias}.from_id = ${this.varAlias(sourceNode.variable || `n${i}`)}.id`;
        sql += ` JOIN nodes ${targetAlias} ON ${targetAlias}.id = ${edgeAlias}.to_id`;
      } else if (edge.direction === 'in') {
        sql += ` JOIN edges ${edgeAlias} ON ${edgeAlias}.to_id = ${this.varAlias(sourceNode.variable || `n${i}`)}.id`;
        sql += ` JOIN nodes ${targetAlias} ON ${targetAlias}.id = ${edgeAlias}.from_id`;
      }

      // Add edge type constraint
      sql += ` AND ${edgeAlias}.type = ?`;
      params.push(edge.type);
    }

    // Build WHERE clause
    const whereClauses = this.buildWhereClause(nodes, whereConditions, params);
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    return { sql, params };
  }

  private static buildSelectClause(
    nodes: NodePattern[],
    edges: EdgePattern[],
    returnVars: string[]
  ): string {
    const cols: string[] = [];

    // If no return vars specified, return all
    const varsToReturn = returnVars.length > 0 ? returnVars : this.getAllVars(nodes, edges);

    for (const varName of varsToReturn) {
      // Check if it's a node or edge variable
      const node = nodes.find(n => n.variable === varName);
      const edge = edges.find(e => e.variable === varName);

      if (node) {
        const alias = this.varAlias(varName);
        cols.push(`${alias}.id as ${varName}_id`);
        cols.push(`${alias}.type as ${varName}_type`);
        cols.push(`${alias}.properties as ${varName}_properties`);
        cols.push(`${alias}.created_at as ${varName}_created_at`);
        cols.push(`${alias}.updated_at as ${varName}_updated_at`);
      } else if (edge) {
        const alias = this.varAlias(varName);
        cols.push(`${alias}.id as ${varName}_id`);
        cols.push(`${alias}.type as ${varName}_type`);
        cols.push(`${alias}.from_id as ${varName}_from`);
        cols.push(`${alias}.to_id as ${varName}_to`);
        cols.push(`${alias}.properties as ${varName}_properties`);
      }
    }

    return cols.join(', ');
  }

  private static buildWhereClause(
    nodes: NodePattern[],
    whereConditions: PatternConditions,
    params: any[]
  ): string[] {
    const clauses: string[] = [];

    // Add node type constraints from pattern
    for (const node of nodes) {
      if (node.type) {
        const alias = this.varAlias(node.variable || 'n');
        clauses.push(`${alias}.type = ?`);
        params.push(node.type);
      }
    }

    // Add property constraints from WHERE clause
    for (const [variable, props] of Object.entries(whereConditions)) {
      const alias = this.varAlias(variable);
      for (const [key, value] of Object.entries(props)) {
        clauses.push(`json_extract(${alias}.properties, '$.${key}') = ?`);
        params.push(value);
      }
    }

    return clauses;
  }

  private static varAlias(variable: string): string {
    return variable.replace(/[^a-zA-Z0-9_]/g, '');
  }

  private static getAllVars(nodes: NodePattern[], edges: EdgePattern[]): string[] {
    const vars = new Set<string>();
    nodes.forEach(n => n.variable && vars.add(n.variable));
    edges.forEach(e => e.variable && vars.add(e.variable));
    return Array.from(vars);
  }
}
```

### PatternMatcher (src/pattern/PatternMatcher.ts)

**Responsibility**: Execute pattern queries and build results

```typescript
/**
 * Execute pattern matching queries and map results.
 */
export class PatternMatcher {
  constructor(private db: Database.Database) {}

  execute<T = PatternResult>(query: {
    patterns: ParsedPattern[];
    optionalPatterns: ParsedPattern[];
    where: PatternConditions;
    return: string[];
  }): T[] {
    // For now, support single pattern (future: multiple patterns = AND)
    const pattern = query.patterns[0];

    // Generate SQL
    const { sql, params } = SQLGenerator.generate(
      pattern,
      query.where,
      query.return
    );

    // Execute query
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    // Map results
    return ResultBuilder.build<T>(rows, query.return, pattern);
  }
}
```

### ResultBuilder (src/pattern/ResultBuilder.ts)

**Responsibility**: Map SQL rows to typed results

```typescript
/**
 * Build typed results from SQL rows.
 */
export class ResultBuilder {
  static build<T = PatternResult>(
    rows: any[],
    returnVars: string[],
    pattern: ParsedPattern
  ): T[] {
    return rows.map(row => {
      const result: any = {};

      for (const varName of returnVars) {
        // Check if variable is a node or edge
        const isNode = pattern.nodes.some(n => n.variable === varName);
        const isEdge = pattern.edges.some(e => e.variable === varName);

        if (isNode) {
          result[varName] = {
            id: row[`${varName}_id`],
            type: row[`${varName}_type`],
            properties: deserialize(row[`${varName}_properties`]),
            createdAt: timestampToDate(row[`${varName}_created_at`]),
            updatedAt: timestampToDate(row[`${varName}_updated_at`])
          };
        } else if (isEdge) {
          result[varName] = {
            id: row[`${varName}_id`],
            type: row[`${varName}_type`],
            from: row[`${varName}_from`],
            to: row[`${varName}_to`],
            properties: row[`${varName}_properties`]
              ? deserialize(row[`${varName}_properties`])
              : undefined
          };
        }
      }

      return result as T;
    });
  }
}
```

---

## Bulk Operations Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    GraphDatabase (Bulk Methods)                 │
├─────────────────────────────────────────────────────────────────┤
│  createNodes(nodes[], options?)                                 │
│  createEdges(edges[], options?)                                 │
│  updateNodes(updates[], options?)                               │
│  deleteNodes(ids[], options?)                                   │
└─────────────────────────────────────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│   BulkOperations         │      │   BulkProcessor          │
├──────────────────────────┤      ├──────────────────────────┤
│ executeCreate()          │      │ processBatch()           │
│ executeUpdate()          │      │ wrapTransaction()        │
│ executeDelete()          │      │ chunk()                  │
│                          │      │ reportStats()            │
│ Returns:                 │      │                          │
│ - BulkNodeResult         │      │ Handles:                 │
│ - BulkEdgeResult         │      │ - Batching               │
│ - BulkUpdateResult       │      │ - Transaction mgmt       │
│ - BulkDeleteResult       │      │ - Error collection       │
└──────────────────────────┘      └──────────────────────────┘
                │                             │
                └─────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│   BulkValidator          │      │   Prepared Statements    │
├──────────────────────────┤      ├──────────────────────────┤
│ validateNodeInput()      │      │ INSERT (reused)          │
│ validateEdgeInput()      │      │ UPDATE (reused)          │
│ validateUpdateInput()    │      │ DELETE (reused)          │
│ checkSchema()            │      │                          │
└──────────────────────────┘      └──────────────────────────┘
```

### BulkOperations Class (src/bulk/BulkOperations.ts)

```typescript
/**
 * High-performance bulk operations for nodes and edges.
 * All operations are atomic (wrapped in transactions).
 */
export class BulkOperations {
  constructor(
    private db: Database.Database,
    private schema?: GraphSchema
  ) {}

  /**
   * Create multiple nodes in a single transaction.
   * Uses prepared statements for performance.
   */
  createNodes<T extends NodeData = NodeData>(
    nodes: BulkNodeInput<T>[],
    options: BulkOptions = {}
  ): BulkNodeResult<T> {
    const startTime = Date.now();
    const errorMode = options.errorMode || BulkErrorMode.FAIL_FAST;

    // Validate inputs
    BulkValidator.validateNodeInputs(nodes, this.schema);

    // Process in transaction
    return BulkProcessor.wrapTransaction(this.db, () => {
      const created: Node<T>[] = [];
      const errors: BulkOperationError[] = [];

      // Prepare statement (reused for all inserts)
      const stmt = this.db.prepare(
        'INSERT INTO nodes (type, properties) VALUES (?, ?) RETURNING *'
      );

      for (let i = 0; i < nodes.length; i++) {
        const input = nodes[i];

        try {
          const row = stmt.get(input.type, serialize(input.properties)) as any;
          created.push({
            id: row.id,
            type: row.type,
            properties: deserialize<T>(row.properties),
            createdAt: timestampToDate(row.created_at),
            updatedAt: timestampToDate(row.updated_at)
          });
        } catch (error) {
          const err: BulkOperationError = {
            index: i,
            input,
            error: (error as Error).message,
            code: 'INSERT_FAILED'
          };

          errors.push(err);

          if (errorMode === BulkErrorMode.FAIL_FAST) {
            throw new Error(`Bulk operation failed at index ${i}: ${err.error}`);
          }
        }
      }

      const durationMs = Date.now() - startTime;

      return {
        created,
        errors,
        stats: {
          total: nodes.length,
          successful: created.length,
          failed: errors.length,
          durationMs
        }
      };
    });
  }

  /**
   * Update multiple nodes in a single transaction.
   */
  updateNodes(
    updates: BulkNodeUpdate[],
    options: BulkOptions = {}
  ): BulkUpdateResult {
    const startTime = Date.now();

    return BulkProcessor.wrapTransaction(this.db, () => {
      const updated: Node[] = [];
      const notFound: number[] = [];
      const errors: BulkOperationError[] = [];

      const getStmt = this.db.prepare('SELECT * FROM nodes WHERE id = ?');
      const updateStmt = this.db.prepare(
        "UPDATE nodes SET properties = ?, updated_at = strftime('%s', 'now') WHERE id = ? RETURNING *"
      );

      for (let i = 0; i < updates.length; i++) {
        const { id, properties } = updates[i];

        try {
          // Get existing node
          const existing = getStmt.get(id) as any;

          if (!existing) {
            notFound.push(id);
            continue;
          }

          // Merge properties
          const existingProps = deserialize(existing.properties);
          const merged = { ...existingProps, ...properties };

          // Update
          const row = updateStmt.get(serialize(merged), id) as any;
          updated.push({
            id: row.id,
            type: row.type,
            properties: deserialize(row.properties),
            createdAt: timestampToDate(row.created_at),
            updatedAt: timestampToDate(row.updated_at)
          });
        } catch (error) {
          errors.push({
            index: i,
            input: updates[i],
            error: (error as Error).message,
            code: 'UPDATE_FAILED'
          });
        }
      }

      return {
        updated,
        notFound,
        errors,
        stats: {
          total: updates.length,
          successful: updated.length,
          failed: errors.length + notFound.length,
          durationMs: Date.now() - startTime
        }
      };
    });
  }

  /**
   * Delete multiple nodes in a single transaction.
   * Cascade deletes all connected edges.
   */
  deleteNodes(
    ids: number[],
    options: BulkOptions = {}
  ): BulkDeleteResult {
    const startTime = Date.now();

    return BulkProcessor.wrapTransaction(this.db, () => {
      const deleted: number[] = [];
      const notFound: number[] = [];
      const errors: BulkOperationError[] = [];

      const stmt = this.db.prepare('DELETE FROM nodes WHERE id = ?');

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];

        try {
          const result = stmt.run(id);

          if (result.changes > 0) {
            deleted.push(id);
          } else {
            notFound.push(id);
          }
        } catch (error) {
          errors.push({
            index: i,
            input: id,
            error: (error as Error).message,
            code: 'DELETE_FAILED'
          });
        }
      }

      return {
        deleted,
        notFound,
        errors,
        stats: {
          total: ids.length,
          successful: deleted.length,
          failed: errors.length,
          durationMs: Date.now() - startTime
        }
      };
    });
  }

  // Similar methods for edges...
  createEdges<T extends NodeData = NodeData>(
    edges: BulkEdgeInput<T>[],
    options: BulkOptions = {}
  ): BulkEdgeResult<T> {
    // Similar structure to createNodes
    // ... implementation
  }
}
```

### BulkProcessor (src/bulk/BulkProcessor.ts)

**Responsibility**: Transaction management and batching

```typescript
/**
 * Handle transaction wrapping and batch processing for bulk operations.
 */
export class BulkProcessor {
  /**
   * Wrap operation in transaction with automatic commit/rollback.
   */
  static wrapTransaction<T>(
    db: Database.Database,
    operation: () => T
  ): T {
    db.prepare('BEGIN').run();

    try {
      const result = operation();
      db.prepare('COMMIT').run();
      return result;
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
  }

  /**
   * Process large arrays in chunks to manage memory.
   */
  static chunk<T>(array: T[], chunkSize: number = 1000): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Compound INSERT for better performance (SQLite supports VALUES (...), (...)).
   */
  static compoundInsert(
    db: Database.Database,
    table: string,
    columns: string[],
    values: any[][]
  ): void {
    if (values.length === 0) return;

    const placeholders = values.map(() =>
      `(${columns.map(() => '?').join(', ')})`
    ).join(', ');

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`;
    const params = values.flat();

    db.prepare(sql).run(...params);
  }
}
```

### BulkValidator (src/bulk/BulkValidator.ts)

**Responsibility**: Input validation for bulk operations

```typescript
/**
 * Validate bulk operation inputs before execution.
 */
export class BulkValidator {
  static validateNodeInputs<T extends NodeData>(
    nodes: BulkNodeInput<T>[],
    schema?: GraphSchema
  ): void {
    if (!Array.isArray(nodes)) {
      throw new Error('Bulk node input must be an array');
    }

    if (nodes.length === 0) {
      return; // Empty array is valid (no-op)
    }

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];

      if (!node.type || typeof node.type !== 'string') {
        throw new Error(`Invalid node type at index ${i}`);
      }

      if (schema) {
        validateNodeType(node.type, schema);
        validateNodeProperties(node.type, node.properties, schema);
      }
    }
  }

  static validateEdgeInputs<T extends NodeData>(
    edges: BulkEdgeInput<T>[],
    schema?: GraphSchema
  ): void {
    if (!Array.isArray(edges)) {
      throw new Error('Bulk edge input must be an array');
    }

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];

      if (!edge.type || typeof edge.type !== 'string') {
        throw new Error(`Invalid edge type at index ${i}`);
      }

      if (!Number.isInteger(edge.from) || edge.from <= 0) {
        throw new Error(`Invalid 'from' node ID at index ${i}`);
      }

      if (!Number.isInteger(edge.to) || edge.to <= 0) {
        throw new Error(`Invalid 'to' node ID at index ${i}`);
      }

      if (schema) {
        validateEdgeType(edge.type, schema);
      }
    }
  }
}
```

---

## Type System

### Pattern Matching Types (src/types/pattern.ts)

```typescript
/**
 * Parsed node pattern from match query.
 */
export interface NodePattern {
  variable?: string;          // Variable name (e.g., 'j' from (j:Job))
  type?: string;              // Node type (e.g., 'Job')
  properties?: Record<string, any>;  // Inline property filters
}

/**
 * Parsed edge pattern from match query.
 */
export interface EdgePattern {
  variable?: string;          // Variable name (e.g., 'r' from -[r:POSTED_BY]->)
  type: string;               // Edge type (e.g., 'POSTED_BY')
  direction: 'out' | 'in' | 'both';
  minHops?: number;           // For variable-length paths (*1..3)
  maxHops?: number;
}

/**
 * Parsed path pattern (sequence of nodes and edges).
 */
export interface PathPattern {
  start: NodePattern;
  edges: EdgePattern[];
  intermediate: NodePattern[];
  end: NodePattern;
}

/**
 * Complete parsed pattern AST.
 */
export interface ParsedPattern {
  nodes: NodePattern[];
  edges: EdgePattern[];
  paths: PathPattern[];
}

/**
 * WHERE clause conditions for pattern matching.
 */
export interface PatternConditions {
  [variable: string]: {
    [property: string]: any;
  };
}

/**
 * Result of pattern matching query.
 */
export interface PatternResult {
  [variable: string]: Node | Edge | Path | null;
}

/**
 * Path result from pattern matching.
 */
export interface Path {
  nodes: Node[];
  edges: Edge[];
  length: number;
}

/**
 * Pattern syntax error.
 */
export class PatternSyntaxError extends Error {
  constructor(
    message: string,
    public pattern: string,
    public position: number
  ) {
    super(`Pattern syntax error: ${message} at position ${position}`);
    this.name = 'PatternSyntaxError';
  }
}

/**
 * Pattern validation error (schema mismatch).
 */
export class PatternValidationError extends Error {
  constructor(
    message: string,
    public issues: string[]
  ) {
    super(`Pattern validation error: ${message}`);
    this.name = 'PatternValidationError';
  }
}
```

### Bulk Operations Types (src/types/bulk.ts)

```typescript
/**
 * Input for bulk node creation.
 */
export interface BulkNodeInput<T extends NodeData = NodeData> {
  type: string;
  properties: T;
}

/**
 * Input for bulk edge creation.
 */
export interface BulkEdgeInput<T extends NodeData = NodeData> {
  from: number;
  type: string;
  to: number;
  properties?: T;
}

/**
 * Input for bulk node update.
 */
export interface BulkNodeUpdate {
  id: number;
  properties: Partial<NodeData>;
}

/**
 * Input for bulk edge update.
 */
export interface BulkEdgeUpdate {
  id: number;
  properties: Partial<NodeData>;
}

/**
 * Result of bulk node creation.
 */
export interface BulkNodeResult<T extends NodeData = NodeData> {
  created: Node<T>[];
  errors: BulkOperationError[];
  stats: BulkStats;
}

/**
 * Result of bulk edge creation.
 */
export interface BulkEdgeResult<T extends NodeData = NodeData> {
  created: Edge<T>[];
  errors: BulkOperationError[];
  stats: BulkStats;
}

/**
 * Result of bulk update operation.
 */
export interface BulkUpdateResult {
  updated: (Node | Edge)[];
  notFound: number[];
  errors: BulkOperationError[];
  stats: BulkStats;
}

/**
 * Result of bulk delete operation.
 */
export interface BulkDeleteResult {
  deleted: number[];
  notFound: number[];
  errors: BulkOperationError[];
  stats: BulkStats;
}

/**
 * Bulk operation statistics.
 */
export interface BulkStats {
  total: number;
  successful: number;
  failed: number;
  durationMs: number;
}

/**
 * Error information for failed bulk operation.
 */
export interface BulkOperationError {
  index: number;              // Index in input array
  input: any;                 // Original input that failed
  error: string;              // Error message
  code?: string;              // Error code
}

/**
 * Options for bulk operations.
 */
export interface BulkOptions {
  errorMode?: BulkErrorMode;
  chunkSize?: number;         // For processing large batches
}

/**
 * Error handling mode for bulk operations.
 */
export enum BulkErrorMode {
  FAIL_FAST = 'fail_fast',    // Stop on first error, rollback all
  CONTINUE = 'continue',       // Skip errors, commit successful
  COLLECT = 'collect'          // Collect all errors, rollback all
}
```

---

## Database Schema Enhancements

### Indexes for Pattern Matching

Pattern matching performance relies on proper indexes:

```sql
-- Existing indexes (from Phase 1)
CREATE INDEX idx_nodes_type ON nodes(type);
CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to ON edges(to_id);
CREATE INDEX idx_edges_type ON edges(type);

-- New indexes for pattern matching (Phase 3)
-- Composite index for edge type + direction lookups
CREATE INDEX idx_edges_type_from ON edges(type, from_id);
CREATE INDEX idx_edges_type_to ON edges(type, to_id);

-- Property indexes (created on demand via createPropertyIndex)
CREATE INDEX idx_merge_Job_url ON nodes(
  type,
  json_extract(properties, '$.url')
) WHERE type = 'Job';
```

### No Schema Changes Required

Phase 3 does not require any changes to the core schema. All pattern matching and bulk operations work with the existing `nodes` and `edges` tables.

---

## Integration Points

### GraphDatabase API Updates (src/core/Database.ts)

```typescript
export class GraphDatabase {
  // ... existing methods ...

  /**
   * Start a pattern matching query.
   *
   * @param pattern - Cypher-style pattern string
   * @returns PatternQuery builder for chaining
   */
  match(pattern: string): PatternQuery {
    return new PatternQuery(this.db, pattern);
  }

  /**
   * Create multiple nodes in a single transaction.
   */
  createNodes<T extends NodeData = NodeData>(
    nodes: BulkNodeInput<T>[],
    options?: BulkOptions
  ): BulkNodeResult<T> {
    const bulkOps = new BulkOperations(this.db, this.schema);
    return bulkOps.createNodes(nodes, options);
  }

  /**
   * Create multiple edges in a single transaction.
   */
  createEdges<T extends NodeData = NodeData>(
    edges: BulkEdgeInput<T>[],
    options?: BulkOptions
  ): BulkEdgeResult<T> {
    const bulkOps = new BulkOperations(this.db, this.schema);
    return bulkOps.createEdges(edges, options);
  }

  /**
   * Update multiple nodes in a single transaction.
   */
  updateNodes(
    updates: BulkNodeUpdate[],
    options?: BulkOptions
  ): BulkUpdateResult {
    const bulkOps = new BulkOperations(this.db, this.schema);
    return bulkOps.updateNodes(updates, options);
  }

  /**
   * Delete multiple nodes in a single transaction.
   */
  deleteNodes(
    ids: number[],
    options?: BulkOptions
  ): BulkDeleteResult {
    const bulkOps = new BulkOperations(this.db, this.schema);
    return bulkOps.deleteNodes(ids, options);
  }

  // Similar methods for edge bulk operations...
}
```

### Type Exports (src/types/index.ts)

```typescript
// Existing exports...
export * from './index';
export * from './merge';

// New Phase 3 exports
export * from './pattern';
export * from './bulk';
```

---

## Implementation Sequence

### Phase 3A: Pattern Matching (Days 1-10)

**Day 1-2: Pattern Parser**
1. Implement `PatternParser.parse()`
2. Node pattern parsing
3. Edge pattern parsing
4. Path pattern construction
5. Unit tests (90%+ coverage)

**Files to create:**
- `src/pattern/PatternParser.ts`
- `src/types/pattern.ts`
- `tests/pattern/PatternParser.test.ts`

**Dependencies:** None (standalone module)

---

**Day 3-4: SQL Generator**
1. Implement `SQLGenerator.generate()`
2. SELECT clause generation
3. JOIN clause generation
4. WHERE clause generation
5. Unit tests with SQL verification

**Files to create:**
- `src/pattern/SQLGenerator.ts`
- `tests/pattern/SQLGenerator.test.ts`

**Dependencies:** PatternParser (for AST types)

---

**Day 5-7: PatternQuery Implementation**
1. Implement `PatternQuery` fluent API
2. `match()`, `where()`, `return()` methods
3. Implement `PatternMatcher`
4. Implement `ResultBuilder`
5. Integration with `GraphDatabase.match()`
6. Integration tests

**Files to create:**
- `src/query/PatternQuery.ts`
- `src/pattern/PatternMatcher.ts`
- `src/pattern/ResultBuilder.ts`
- `tests/query/PatternQuery.test.ts`
- Update `src/core/Database.ts`

**Dependencies:** PatternParser, SQLGenerator

---

**Day 8-10: Testing & Refinement**
1. Edge case testing (malformed patterns, empty results)
2. Performance testing (10k node graph)
3. Variable-length paths implementation
4. Optional match implementation
5. Documentation and examples

**Files to update:**
- All pattern matching files (optimizations)
- `docs/API.md` (pattern matching section)
- `README.md` (pattern matching examples)

---

### Phase 3B: Bulk Operations (Days 11-17)

**Day 11-12: Bulk Create**
1. Implement `BulkOperations.createNodes()`
2. Implement `BulkOperations.createEdges()`
3. Prepared statement optimization
4. Transaction wrapping
5. Unit tests

**Files to create:**
- `src/bulk/BulkOperations.ts`
- `src/bulk/BulkProcessor.ts`
- `src/types/bulk.ts`
- `tests/bulk/BulkOperations.test.ts`

**Dependencies:** Core Database, Transaction

---

**Day 13-14: Bulk Update/Delete**
1. Implement `updateNodes()`, `updateEdges()`
2. Implement `deleteNodes()`, `deleteEdges()`
3. Cascade delete handling
4. Unit tests

**Files to update:**
- `src/bulk/BulkOperations.ts`
- `tests/bulk/BulkOperations.test.ts`

---

**Day 15-16: Error Handling & Options**
1. Implement error modes (fail-fast, continue, collect)
2. Implement `BulkValidator`
3. Statistics tracking
4. Unit tests

**Files to create:**
- `src/bulk/BulkValidator.ts`
- `tests/bulk/BulkValidator.test.ts`

---

**Day 17: Testing & Integration**
1. Integration tests (10k+ records)
2. Performance benchmarks
3. Documentation
4. Integration with `GraphDatabase`

**Files to update:**
- `src/core/Database.ts` (add bulk methods)
- `tests/integration/bulk-performance.test.ts`
- `docs/API.md` (bulk operations section)

---

### Phase 3C: Integration & Release (Days 18-24)

**Day 18-19: Integration**
1. Integrate PatternQuery with GraphDatabase
2. Integrate BulkOperations with GraphDatabase
3. Update type exports
4. Update README
5. Update CHANGELOG

**Files to update:**
- `src/core/Database.ts`
- `src/types/index.ts`
- `README.md`
- `CHANGELOG.md`

---

**Day 20-21: Testing**
1. Full regression test suite
2. Performance benchmarks
3. Browser compatibility tests
4. Memory leak tests

---

**Day 22: Documentation**
1. API documentation
2. Usage examples
3. Migration guide
4. Performance guide

---

**Day 23-24: Release**
1. Version bump to 2.0.0
2. Build and publish to npm
3. GitHub release
4. Announcement

---

## Testing Architecture

### Unit Test Structure

```
tests/
├── pattern/
│   ├── PatternParser.test.ts      # Parser unit tests
│   ├── SQLGenerator.test.ts       # SQL generation tests
│   ├── PatternMatcher.test.ts     # Matcher unit tests
│   └── ResultBuilder.test.ts      # Result mapping tests
├── bulk/
│   ├── BulkOperations.test.ts     # Bulk CRUD tests
│   ├── BulkProcessor.test.ts      # Transaction tests
│   └── BulkValidator.test.ts      # Validation tests
├── query/
│   └── PatternQuery.test.ts       # Fluent API tests
└── integration/
    ├── pattern-matching.test.ts   # End-to-end pattern tests
    ├── bulk-performance.test.ts   # Performance benchmarks
    └── phase-3-integration.test.ts # Full integration tests
```

### Test Coverage Targets

- **Unit tests**: 90%+ coverage for all new modules
- **Integration tests**: Cover all user-facing APIs
- **Performance tests**: Validate NFR requirements
- **Edge case tests**: Malformed input, empty results, errors

### Performance Test Metrics

```typescript
describe('Performance', () => {
  it('should match patterns in <100ms for 10k node graph', async () => {
    // Create 10k node graph
    const db = new GraphDatabase(':memory:');
    // ... populate ...

    const start = performance.now();
    const results = db.match('(j:Job)-[:POSTED_BY]->(c:Company)')
      .where({ c: { name: 'TechCorp' } })
      .exec();
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('should create 10k nodes in <1s', () => {
    const db = new GraphDatabase(':memory:');
    const nodes = Array(10000).fill(null).map((_, i) => ({
      type: 'Job',
      properties: { title: `Job ${i}` }
    }));

    const start = performance.now();
    const result = db.createNodes(nodes);
    const duration = performance.now() - start;

    expect(result.stats.successful).toBe(10000);
    expect(duration).toBeLessThan(1000);
  });
});
```

---

## Summary

### Key Architectural Decisions

1. **Pattern Matching**: Three-stage pipeline (Parse → Generate SQL → Map Results)
2. **Bulk Operations**: Transaction-wrapped with prepared statement reuse
3. **Type Safety**: Full TypeScript support with generics
4. **Performance First**: Optimized SQL, indexes, prepared statements
5. **Minimal Breaking Changes**: Additive API, existing code unaffected

### Module Boundaries

- **Pattern matching**: Self-contained in `src/pattern/`
- **Bulk operations**: Self-contained in `src/bulk/`
- **Integration**: Minimal changes to `GraphDatabase` class
- **Type exports**: Centralized in `src/types/index.ts`

### Implementation Priorities

**Week 1-2**: Pattern Matching (high complexity, high value)
**Week 3**: Bulk Operations (medium complexity, high value)
**Week 4**: Integration, testing, release

### Success Metrics

- ✅ 90%+ test coverage
- ✅ <100ms pattern matching (10k nodes)
- ✅ 10k+ records/sec bulk operations
- ✅ Type-safe APIs
- ✅ Zero breaking changes
- ✅ Complete documentation

---

**Next Step**: Proceed to Refinement phase (TDD implementation)
