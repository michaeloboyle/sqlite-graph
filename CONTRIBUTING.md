# Contributing to sqlite-graph

Thank you for considering contributing to sqlite-graph! This document provides guidelines and information to help you contribute effectively.

## Table of Contents

- [Project Vision](#project-vision)
- [Development Approach](#development-approach)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Architecture Overview](#architecture-overview)
- [Areas Needing Help](#areas-needing-help)
- [Community Guidelines](#community-guidelines)

## Project Vision

sqlite-graph aims to be a **production-ready graph database** that combines:
- The reliability and simplicity of SQLite
- The expressiveness of a fluent query API
- Type-safe TypeScript interfaces
- High performance (<10ms simple queries)
- ACID transaction guarantees

### Design Principles

1. **Simplicity First** - Clear API over clever abstractions
2. **Performance Matters** - Benchmark-driven optimization
3. **Type Safety** - Full TypeScript with strict mode
4. **Test Coverage** - 80%+ coverage requirement
5. **Documentation** - Every public API documented

## Development Approach

### SPARC Methodology

This project uses **SPARC** (Specification, Pseudocode, Architecture, Refinement, Completion) methodology with AI-assisted development through [claude-flow](https://github.com/ruvnet/claude-flow).

**Development Phases:**
1. **Specification** - Define requirements and behavior
2. **Pseudocode** - Design algorithms and interfaces
3. **Architecture** - Plan implementation structure
4. **Refinement** - TDD implementation
5. **Completion** - Integration and documentation

See [SPARC-DEVELOPMENT.md](docs/SPARC-DEVELOPMENT.md) for detailed methodology.

### Test-Driven Development (TDD)

All features follow strict TDD:
1. Write failing test
2. Implement minimal code to pass
3. Refactor for clarity/performance
4. Repeat

**Current Status**: 188 passing tests across 8 test files

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Git
- TypeScript knowledge
- SQLite basics (helpful but not required)

### Setup Development Environment

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/sqlite-graph.git
cd sqlite-graph

# 3. Add upstream remote
git remote add upstream https://github.com/oboyle/sqlite-graph.git

# 4. Install dependencies
npm install

# 5. Run tests to verify setup
npm test

# 6. Build the project
npm run build

# 7. Try the examples
npx ts-node examples/basic-usage.ts
```

### VSCode Integration (Recommended)

The repository includes `.vscode/` configuration for test integration:

1. Install recommended extensions (Jest, Jest Runner)
2. Open Testing panel: `Cmd+Shift+T` (Mac) or `Ctrl+Shift+T` (Windows/Linux)
3. Run tests from the UI with breakpoint support

See [.vscode/README.md](.vscode/README.md) for complete setup.

## Development Workflow

### Branch Strategy

- `main` - Stable, production-ready code
- `feature/your-feature` - New features
- `fix/issue-description` - Bug fixes
- `docs/description` - Documentation updates

### Workflow Steps

```bash
# 1. Update your fork
git checkout main
git pull upstream main

# 2. Create feature branch
git checkout -b feature/my-new-feature

# 3. Make changes with frequent commits
git add src/core/MyFeature.ts tests/unit/MyFeature.test.ts
git commit -m "Add MyFeature with basic functionality"

# 4. Run tests and ensure they pass
npm test

# 5. Run linter
npm run lint

# 6. Check code coverage
npm run test:coverage

# 7. Push to your fork
git push origin feature/my-new-feature

# 8. Open Pull Request on GitHub
```

### Commit Message Format

Follow conventional commits:

```
type(scope): Brief description

Longer description if needed.

Refs: #issue-number
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test additions/changes
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `chore:` - Build/tooling changes

**Examples:**
```
feat(query): Add bidirectional edge traversal support

Implements 'both' direction in TraversalQuery to traverse edges
in both directions simultaneously. Includes tests and documentation.

Refs: #42

---

fix(transaction): Prevent nested transaction deadlock

Adds validation to prevent creating nested transactions which
can cause SQLite BUSY errors.

Refs: #38

---

docs(api): Update README with new transaction API examples

Adds examples for savepoint usage and rollback behavior.
```

## Code Style Guidelines

### TypeScript Style

```typescript
// ✅ GOOD: Clear, typed, documented
/**
 * Creates a new graph node with the specified label and properties.
 *
 * @param label - Node type/category (e.g., 'User', 'Job')
 * @param properties - Key-value pairs for node data
 * @returns Created node with assigned ID
 * @throws {ValidationError} If label is empty or properties invalid
 */
export function createNode(
  label: string,
  properties: Record<string, unknown>
): Node {
  validateLabel(label);
  validateProperties(properties);

  const id = generateNodeId();
  const node = { id, label, properties };

  insertNode(node);
  return node;
}

// ❌ BAD: No types, no docs, unclear
export function createNode(label, props) {
  const id = getId();
  insert({ id, label, props });
  return { id, label, props };
}
```

### File Organization

```typescript
// File structure template
// 1. Imports (external, then internal)
import Database from 'better-sqlite3';
import { Node, Edge } from '../types';

// 2. Type definitions
export interface QueryOptions {
  limit?: number;
  offset?: number;
}

// 3. Class/function exports
export class NodeQuery {
  // Public methods first
  public where(condition: Condition): this { }

  // Private methods last
  private executeQuery(): Node[] { }
}

// 4. Helper functions (not exported)
function validateCondition(cond: Condition): void { }
```

### Naming Conventions

- **Classes**: `PascalCase` (e.g., `GraphDatabase`, `NodeQuery`)
- **Functions/Methods**: `camelCase` (e.g., `createNode`, `findPath`)
- **Interfaces/Types**: `PascalCase` (e.g., `Node`, `EdgeType`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_DEPTH`, `DEFAULT_LIMIT`)
- **Private fields**: `_prefixed` (e.g., `_database`, `_cache`)

## Testing Requirements

### Test Coverage Standards

- **Minimum**: 80% overall coverage
- **Critical paths**: 100% coverage (Database, Transaction)
- **New features**: Must include tests before merge
- **Bug fixes**: Must include regression test

### Test Structure

```typescript
import { GraphDatabase } from '../../src/core/Database';

describe('NodeQuery', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    db = new GraphDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('where()', () => {
    it('should filter nodes by single property', () => {
      // Arrange
      const alice = db.createNode('User', { name: 'Alice', age: 30 });
      const bob = db.createNode('User', { name: 'Bob', age: 25 });

      // Act
      const results = db.nodes('User').where({ age: 30 }).exec();

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(alice.id);
    });

    it('should return empty array when no matches', () => {
      db.createNode('User', { name: 'Alice' });

      const results = db.nodes('User').where({ name: 'Bob' }).exec();

      expect(results).toHaveLength(0);
    });

    it('should throw ValidationError for invalid property', () => {
      expect(() => {
        db.nodes('User').where({ '': 'value' }).exec();
      }).toThrow(ValidationError);
    });
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/unit/Database.test.ts

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run only unit tests
npm test -- tests/unit/

# Run with verbose output
npm test -- --verbose
```

## Pull Request Process

### Before Opening a PR

1. ✅ All tests pass (`npm test`)
2. ✅ Linter passes (`npm run lint`)
3. ✅ Coverage meets 80% threshold
4. ✅ Documentation updated (if API changed)
5. ✅ Examples updated (if user-facing change)
6. ✅ CHANGELOG.md updated (for releases)
7. ✅ Commits follow conventional format
8. ✅ Branch is up to date with `main`

### PR Description Template

```markdown
## Description
Brief summary of changes and motivation.

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Testing
Describe the tests you added/modified and how to run them.

## Performance Impact
- [ ] No performance impact
- [ ] Performance improvement (include benchmarks)
- [ ] Potential performance regression (explain why acceptable)

## Checklist
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Documentation updated
- [ ] Code follows style guidelines
- [ ] Commit messages follow conventional format

## Related Issues
Fixes #issue-number
```

### Review Process

1. **Automated Checks** - CI runs tests and linting
2. **Code Review** - Maintainer reviews code quality, design, tests
3. **Discussion** - Address feedback through comments/commits
4. **Approval** - PR approved by maintainer
5. **Merge** - Squash merge to `main` with clean commit message

## Architecture Overview

### Core Components

```
src/
├── core/
│   ├── Database.ts       # Main database interface
│   ├── Transaction.ts    # Transaction management with savepoints
│   └── Schema.ts         # Schema validation
├── query/
│   ├── NodeQuery.ts      # Fluent node query builder
│   └── TraversalQuery.ts # Graph traversal and path finding
├── types/
│   └── index.ts          # TypeScript type definitions
└── utils/
    └── validators.ts     # Input validation utilities
```

### Key Abstractions

1. **GraphDatabase** - Main entry point, manages SQLite connection
2. **Transaction** - ACID transactions with savepoint support
3. **NodeQuery** - Fluent API for querying nodes (WHERE, ORDER BY, LIMIT)
4. **TraversalQuery** - Graph algorithms (BFS, DFS, shortest path)

### Database Schema

```sql
-- Nodes table
CREATE TABLE nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  properties TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Edges table
CREATE TABLE edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  to_id INTEGER NOT NULL,
  properties TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL,
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_nodes_label ON nodes(label);
CREATE INDEX idx_edges_from ON edges(from_id, type);
CREATE INDEX idx_edges_to ON edges(to_id);
```

### Query DSL Design

The fluent API uses method chaining with immutable builders:

```typescript
// Each method returns a new query builder instance
db.nodes('Job')           // Select nodes by label
  .where({ status: 'active' })  // Filter by properties
  .connectedTo('Company', 'POSTED_BY')  // Filter by edges
  .orderBy('created_at', 'desc')  // Sort results
  .limit(10)              // Limit count
  .exec();                // Execute and return results
```

## Areas Needing Help

### High Priority

1. **Pattern Matching** - Cypher-style pattern matching (`MATCH (a)-[r]->(b)`)
2. **Performance Tests** - Comprehensive benchmarks for large graphs
3. **CI/CD Pipeline** - GitHub Actions for automated testing
4. **Integration Tests** - More complex real-world scenarios

### Medium Priority

5. **Bulk Operations** - Batch insert/update with transactions
6. **Export/Import** - GraphML, JSON, CSV support
7. **Query Optimization** - Query planner and execution analysis
8. **Documentation** - More usage examples and tutorials

### Good First Issues

- Add validation for edge type names
- Improve error messages with context
- Add JSDoc comments to utility functions
- Write additional integration tests
- Create more examples (social network, knowledge graph)

### Advanced Contributions

- Implement A* pathfinding algorithm
- Add support for directed/undirected graph modes
- Implement graph isomorphism detection
- Add support for temporal graphs (time-based edges)

## Community Guidelines

### Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

**In Summary:**
- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Assume good intentions
- Report unacceptable behavior

### Communication

- **Issues** - Bug reports, feature requests, questions
- **Pull Requests** - Code contributions with discussion
- **GitHub Discussions** - General questions and ideas (coming soon)

### Getting Help

- Check [README.md](README.md) for quick start and overview
- Review [docs/API.md](docs/API.md) for API reference
- Look at [examples/](examples/) for usage patterns
- Search existing issues before creating new ones
- Ask questions in issue comments or PR discussions

## Credits

**Development Team:** Michael O'Boyle and Claude Code
**Methodology:** SPARC with [claude-flow](https://github.com/ruvnet/claude-flow)
**Built With:** TypeScript, SQLite (better-sqlite3), Jest

## License

By contributing to sqlite-graph, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to sqlite-graph!** 🚀

Your contributions help make graph databases more accessible and powerful for everyone.
