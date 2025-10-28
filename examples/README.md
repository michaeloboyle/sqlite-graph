# sqlite-graph Examples

This directory contains comprehensive examples demonstrating the capabilities of sqlite-graph. Examples are ordered from basic to advanced, making it easy to learn progressively.

## Prerequisites

```bash
# Install dependencies (from repository root)
npm install

# Build the library
npm run build
```

## Running Examples

Each example is a standalone TypeScript file that can be executed with `ts-node`:

```bash
# Run from repository root
npx ts-node examples/basic-usage.ts
npx ts-node examples/graph-traversal.ts
npx ts-node examples/transactions.ts
npx ts-node examples/schema-validation.ts
```

Or run all examples:

```bash
# From repository root
for example in examples/*.ts; do
  echo "=== Running $example ==="
  npx ts-node "$example"
  echo ""
done
```

## Examples Overview

### 1. Basic Usage (`basic-usage.ts`)

**Difficulty:** Beginner
**Topics:** Core operations, CRUD, simple queries

Start here if you're new to sqlite-graph. This example covers:
- Creating an in-memory or file-based database
- Creating and retrieving nodes
- Creating edges (relationships)
- Updating and deleting nodes
- Basic queries with filtering
- Querying with relationships
- Exporting and importing data

**Key Concepts:**
```typescript
// Create database
const db = new GraphDatabase(':memory:');

// Create nodes
const job = db.createNode('Job', { title: 'Engineer', status: 'active' });

// Create relationships
db.createEdge('POSTED_BY', jobId, companyId);

// Query nodes
const activeJobs = db.nodes('Job')
  .where({ status: 'active' })
  .exec();
```

### 2. Graph Traversal (`graph-traversal.ts`)

**Difficulty:** Intermediate
**Topics:** Graph walking, pathfinding, advanced traversals

Learn how to navigate your graph data structure:
- Outgoing edge traversal (`.out()`)
- Incoming edge traversal (`.in()`)
- Bidirectional traversal (`.both()`)
- Depth-limited searches (`.maxDepth()`, `.minDepth()`)
- Finding shortest paths
- Finding all paths between nodes
- Filtering traversal results
- Unique node handling

**Key Concepts:**
```typescript
// Find similar jobs up to 2 hops away
const similar = db.traverse(jobId)
  .out('SIMILAR_TO')
  .maxDepth(2)
  .unique()
  .toArray();

// Find shortest path
const path = db.traverse(job1Id)
  .shortestPath(job2Id);

// Find all paths
const allPaths = db.traverse(job1Id)
  .paths(job2Id, { maxPaths: 5 });
```

### 3. Transactions (`transactions.ts`)

**Difficulty:** Intermediate
**Topics:** ACID operations, error handling, savepoints

Master transaction management for data consistency:
- Automatic commit on success
- Automatic rollback on error
- Manual transaction control
- Savepoints for partial rollbacks
- Release savepoints
- Complex multi-step operations
- Error recovery strategies
- Transaction best practices

**Key Concepts:**
```typescript
// Automatic transaction
const result = db.transaction(() => {
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

### 4. Schema Validation (`schema-validation.ts`)

**Difficulty:** Advanced
**Topics:** Type safety, validation, data modeling

Build type-safe graph databases with schema validation:
- Defining node types and properties
- Defining edge types with constraints
- Property validation
- Handling schema violations
- Working with typed data
- Schema benefits for IDE support
- Extra properties flexibility
- Real-world job application workflow

**Key Concepts:**
```typescript
// Define schema
const schema: GraphSchema = {
  nodes: {
    Job: {
      properties: ['title', 'company', 'salary'],
      indexes: ['company']
    },
    Company: {
      properties: ['name', 'industry'],
      indexes: ['name']
    }
  },
  edges: {
    POSTED_BY: {
      from: 'Job',
      to: 'Company',
      properties: ['postedAt']
    }
  }
};

// Create database with schema
const db = new GraphDatabase(':memory:', { schema });

// Schema prevents invalid operations
db.createNode('InvalidType', {}); // Throws error
```

## Common Patterns

### Pattern 1: Job Search Graph

Many examples use a job search domain model:
- **Job** nodes: Represent job postings
- **Company** nodes: Represent employers
- **Skill** nodes: Represent required skills
- **Person** nodes: Represent candidates
- **POSTED_BY** edges: Job → Company
- **REQUIRES** edges: Job → Skill
- **HAS_SKILL** edges: Person → Skill
- **APPLIED_TO** edges: Person → Job

### Pattern 2: Progressive Complexity

Examples build on each other:
1. **Basic Usage**: Learn the fundamentals
2. **Graph Traversal**: Navigate relationships
3. **Transactions**: Ensure data consistency
4. **Schema Validation**: Add type safety

### Pattern 3: Real-World Scenarios

Each example includes practical use cases:
- Job recommendation systems
- Skill matching
- Application tracking
- Company research
- Path analysis

## Tips for Learning

1. **Start Sequential**: Work through examples 1→2→3→4
2. **Experiment**: Modify examples to explore variations
3. **Use TypeScript**: Examples leverage TypeScript for better IDE support
4. **Read Comments**: Each example has detailed inline documentation
5. **Check Output**: Run examples to see results in action

## Example Output

When you run an example, you'll see output like:

```
=== Basic Usage Example ===

1. Creating nodes...
Created job: Senior Software Engineer (ID: 1)
Created TypeScript, Node.js, React skills

2. Creating relationships...
Linked job to required skills

3. Retrieving nodes by ID...
Retrieved: Senior Software Engineer
Created at: 2025-10-28T...
Updated at: 2025-10-28T...

[... more output ...]

=== Example Complete ===
```

## Next Steps

After working through these examples:

1. **Read the API Documentation**: Check the main README.md
2. **Review Tests**: See `tests/` directory for edge cases
3. **Build Your Own**: Create a graph for your domain
4. **Check Performance**: See `benchmarks/` for optimization tips

## Common Issues

### TypeScript Errors

If you see TypeScript compilation errors:
```bash
npm run build  # Rebuild the library
```

### Import Errors

Make sure you're running from the repository root:
```bash
pwd  # Should be /path/to/sqlite-graph
npx ts-node examples/basic-usage.ts
```

### Database Already Exists

Examples use `:memory:` databases (temporary). If you modify examples to use file paths, remember to delete old database files between runs:
```bash
rm -f example.db  # If you created a file-based database
```

## Contributing Examples

Have a useful pattern or use case? Consider contributing an example:

1. Follow the existing format and style
2. Include comprehensive inline comments
3. Cover a specific topic in depth
4. Add entry to this README
5. Test that it runs successfully

## Additional Resources

- **Main Documentation**: `../README.md`
- **API Reference**: `../docs/API.md` (if available)
- **Test Suite**: `../tests/`
- **Benchmarks**: `../benchmarks/`
- **GitHub Issues**: Report bugs or request examples

---

**Happy Coding!** If you have questions, check the main README or open an issue.
