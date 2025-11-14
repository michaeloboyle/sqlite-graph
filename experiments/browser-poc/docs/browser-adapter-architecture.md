# BrowserAdapter Architecture Design

## Overview
This document defines the architecture for BrowserAdapter implementation, detailing class structure, VFS selection logic, error handling, and testing strategy.

## Architecture Decisions

### Decision 1: Direct wa-sqlite API Usage (No Heavy Wrapper)
**Rationale**: Keep implementation simple and maintainable
- BrowserStatement directly calls wa-sqlite APIs
- No abstraction layer between adapter and wa-sqlite
- Follows NodeAdapter's direct usage of better-sqlite3

**Alternative Considered**: Abstract wa-sqlite behind a facade
- **Rejected**: Adds complexity without clear benefit
- wa-sqlite API is stable and well-documented

### Decision 2: Synchronous Statement Interface Over Async
**Rationale**: Maintain interface compatibility with NodeAdapter
- Statement methods (run, get, all) are synchronous in interface
- wa-sqlite async operations handled internally
- Enables drop-in replacement between Node/Browser adapters

**Implementation Strategy**:
```typescript
// Interface expects synchronous
run(...params: any[]): { changes: number; lastInsertRowid: number }

// But wa-sqlite is async, so we need to bridge this gap
// Solution: Use sync-like API that wa-sqlite provides via step()
```

**Note**: wa-sqlite's `step()`, `bind_*()`, and `column_*()` are actually synchronous after the initial `prepare_v2()` async call. Only database open/close and prepare are async.

### Decision 3: VFS Auto-Selection with Manual Override
**Architecture**:
```typescript
static async create(path: string, options?: AdapterOptions & { vfs?: 'opfs' | 'idb' | 'memdb' }): Promise<BrowserAdapter>
```

**Selection Logic**:
1. If `path === ':memory:'` → use `'memdb'`
2. If `options.vfs` specified → use that VFS
3. If OPFS available → use `'opfs'`
4. Else → use `'idb'`

**OPFS Detection**:
```typescript
const hasOPFS = typeof navigator?.storage?.getDirectory === 'function';
```

### Decision 4: Statement Reuse Pattern
**Challenge**: wa-sqlite requires `reset()` before re-execution
**Solution**: Always call `reset()` at start of run/get/all

```typescript
run(...params: any[]) {
  this.sqlite3.reset(this.stmt);  // Always reset first
  // Then bind parameters
  // Then step()
}
```

**Benefit**: Ensures statement is clean before each use

### Decision 5: Error Handling Strategy
**Principle**: Fail fast, clean up resources

**Transaction Rollback**:
```typescript
async transaction<T>(fn: () => Promise<T>): Promise<T> {
  await this.exec('BEGIN');
  try {
    const result = await fn();
    await this.exec('COMMIT');
    return result;
  } catch (error) {
    await this.exec('ROLLBACK');
    throw error;  // Re-throw original error
  }
}
```

**Statement Finalization**:
- BrowserStatement stores reference to sqlite3 and stmt
- finalize() calls sqlite3.finalize(stmt) if stmt exists
- Set stmt to null after finalization to prevent double-free

**Database Close**:
- Check `_isOpen` flag before closing
- Set `_isOpen = false` immediately
- Don't throw if already closed (idempotent)

## Class Architecture

### BrowserAdapter Class
```typescript
export class BrowserAdapter implements SQLiteAdapter {
  private sqlite3: any;           // wa-sqlite module instance
  private db: any;                // Database handle from sqlite3.open_v2()
  private _isOpen = true;         // Connection state flag
  private vfsModule: string;      // Track which VFS was selected

  private constructor(sqlite3: any, db: any, vfsModule: string) {
    this.sqlite3 = sqlite3;
    this.db = db;
    this.vfsModule = vfsModule;
  }

  // Factory method (async initialization required)
  static async create(
    path: string,
    options?: AdapterOptions & { vfs?: 'opfs' | 'idb' | 'memdb' }
  ): Promise<BrowserAdapter>

  // Interface implementation
  async prepare(sql: string): Promise<Statement>
  async exec(sql: string): Promise<void>
  async transaction<T>(fn: () => Promise<T>): Promise<T>
  async pragma(setting: string, value?: any): Promise<any>
  async close(): Promise<void>
  isOpen(): boolean
}
```

**Key Properties**:
- `sqlite3`: Stores the wa-sqlite module for use in prepare()
- `db`: Database handle needed for all operations
- `_isOpen`: Local flag for quick isOpen() checks
- `vfsModule`: Diagnostic info about which VFS was used

### BrowserStatement Class
```typescript
class BrowserStatement implements Statement {
  private sqlite3: any;    // wa-sqlite module (for method calls)
  private db: any;         // Database handle (for changes/lastInsertRowid)
  private stmt: any;       // Prepared statement handle

  constructor(sqlite3: any, db: any, stmt: any) {
    this.sqlite3 = sqlite3;
    this.db = db;
    this.stmt = stmt;
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number }
  get(...params: any[]): any
  all(...params: any[]): any[]
  finalize(): void

  // Helper methods (private)
  private bindParameters(params: any[]): void
  private extractRow(): any
}
```

**Helper Methods**:

```typescript
private bindParameters(params: any[]): void {
  params.forEach((param, i) => {
    const index = i + 1;  // wa-sqlite uses 1-indexed parameters

    if (param === null || param === undefined) {
      this.sqlite3.bind_null(this.stmt, index);
    } else if (typeof param === 'number') {
      if (Number.isInteger(param)) {
        this.sqlite3.bind_int64(this.stmt, index, param);
      } else {
        this.sqlite3.bind_double(this.stmt, index, param);
      }
    } else if (typeof param === 'string') {
      this.sqlite3.bind_text(this.stmt, index, param);
    } else if (param instanceof Uint8Array) {
      this.sqlite3.bind_blob(this.stmt, index, param);
    } else {
      // Fallback: JSON stringify for objects/arrays
      this.sqlite3.bind_text(this.stmt, index, JSON.stringify(param));
    }
  });
}

private extractRow(): any {
  const row: any = {};
  const columnCount = this.sqlite3.column_count(this.stmt);

  for (let i = 0; i < columnCount; i++) {
    const name = this.sqlite3.column_name(this.stmt, i);
    const type = this.sqlite3.column_type(this.stmt, i);

    switch (type) {
      case 1: // INTEGER
        row[name] = this.sqlite3.column_int64(this.stmt, i);
        break;
      case 2: // FLOAT
        row[name] = this.sqlite3.column_double(this.stmt, i);
        break;
      case 3: // TEXT
        row[name] = this.sqlite3.column_text(this.stmt, i);
        break;
      case 4: // BLOB
        row[name] = this.sqlite3.column_blob(this.stmt, i);
        break;
      case 5: // NULL
        row[name] = null;
        break;
    }
  }

  return row;
}
```

## Method Implementation Details

### BrowserAdapter.create()
```typescript
static async create(
  path: string,
  options?: AdapterOptions & { vfs?: 'opfs' | 'idb' | 'memdb' }
): Promise<BrowserAdapter> {
  // 1. Check wa-sqlite is loaded
  if (typeof window === 'undefined' || !window.sqlite3InitModule) {
    throw new Error(
      'wa-sqlite not loaded. Include wa-sqlite script before creating BrowserAdapter.'
    );
  }

  // 2. Initialize wa-sqlite module
  const sqlite3 = await window.sqlite3InitModule();

  // 3. Determine VFS module
  let vfsModule: string;

  if (path === ':memory:') {
    vfsModule = 'memdb';
  } else if (options?.vfs) {
    vfsModule = options.vfs;
  } else {
    const hasOPFS = typeof navigator?.storage?.getDirectory === 'function';
    vfsModule = hasOPFS ? 'opfs' : 'idb';
  }

  // 4. Set open flags based on options
  let flags = sqlite3.SQLITE_OPEN_READWRITE | sqlite3.SQLITE_OPEN_CREATE;

  if (options?.readonly) {
    flags = sqlite3.SQLITE_OPEN_READONLY;
  }

  // 5. Open database
  const db = await sqlite3.open_v2(path, flags, vfsModule);

  // 6. Create adapter instance
  return new BrowserAdapter(sqlite3, db, vfsModule);
}
```

### BrowserAdapter.prepare()
```typescript
async prepare(sql: string): Promise<Statement> {
  if (!this._isOpen) {
    throw new Error('Database is closed');
  }

  const stmt = await this.sqlite3.prepare_v2(this.db, sql);

  if (!stmt) {
    throw new Error(`Failed to prepare statement: ${sql}`);
  }

  return new BrowserStatement(this.sqlite3, this.db, stmt);
}
```

### BrowserAdapter.exec()
```typescript
async exec(sql: string): Promise<void> {
  if (!this._isOpen) {
    throw new Error('Database is closed');
  }

  await this.sqlite3.exec(this.db, sql);
}
```

### BrowserAdapter.pragma()
```typescript
async pragma(setting: string, value?: any): Promise<any> {
  if (!this._isOpen) {
    throw new Error('Database is closed');
  }

  if (value !== undefined) {
    // Set PRAGMA
    const sql = `PRAGMA ${setting} = ${value}`;
    const stmt = await this.prepare(sql);
    const result = stmt.get();
    stmt.finalize();
    return result;
  } else {
    // Get PRAGMA
    const sql = `PRAGMA ${setting}`;
    const stmt = await this.prepare(sql);
    const result = stmt.get();
    stmt.finalize();
    return result;
  }
}
```

### BrowserStatement.run()
```typescript
run(...params: any[]): { changes: number; lastInsertRowid: number } {
  // Reset statement for clean execution
  this.sqlite3.reset(this.stmt);

  // Bind parameters
  this.bindParameters(params);

  // Execute
  this.sqlite3.step(this.stmt);

  // Get mutation results
  const changes = this.sqlite3.changes(this.db);
  const lastInsertRowid = this.sqlite3.last_insert_rowid(this.db);

  return { changes, lastInsertRowid };
}
```

### BrowserStatement.get()
```typescript
get(...params: any[]): any {
  // Reset statement
  this.sqlite3.reset(this.stmt);

  // Bind parameters
  this.bindParameters(params);

  // Execute
  const result = this.sqlite3.step(this.stmt);

  // Check if row returned
  if (result !== this.sqlite3.SQLITE_ROW) {
    return undefined;
  }

  // Extract row data
  return this.extractRow();
}
```

### BrowserStatement.all()
```typescript
all(...params: any[]): any[] {
  const rows: any[] = [];

  // Reset statement
  this.sqlite3.reset(this.stmt);

  // Bind parameters
  this.bindParameters(params);

  // Execute until no more rows
  while (this.sqlite3.step(this.stmt) === this.sqlite3.SQLITE_ROW) {
    rows.push(this.extractRow());
  }

  return rows;
}
```

### BrowserStatement.finalize()
```typescript
finalize(): void {
  if (this.stmt) {
    this.sqlite3.finalize(this.stmt);
    this.stmt = null;  // Prevent double-free
  }
}
```

## Error Handling Patterns

### Database Open Errors
```typescript
try {
  const db = await sqlite3.open_v2(path, flags, vfsModule);
} catch (error) {
  throw new Error(
    `Failed to open database "${path}" with VFS "${vfsModule}": ${error.message}`
  );
}
```

### Statement Preparation Errors
```typescript
const stmt = await this.sqlite3.prepare_v2(this.db, sql);
if (!stmt) {
  throw new Error(`Failed to prepare SQL statement: ${sql}`);
}
```

### Execution Errors
```typescript
// wa-sqlite may throw or return error codes
// Wrap in try/catch and provide context
try {
  this.sqlite3.step(this.stmt);
} catch (error) {
  throw new Error(`SQL execution failed: ${error.message}`);
}
```

### Transaction Errors
```typescript
async transaction<T>(fn: () => Promise<T>): Promise<T> {
  await this.exec('BEGIN');
  try {
    const result = await fn();
    await this.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      await this.exec('ROLLBACK');
    } catch (rollbackError) {
      // Log but don't throw - original error more important
      console.error('ROLLBACK failed:', rollbackError);
    }
    throw error;  // Original error
  }
}
```

## Testing Strategy

### Node.js Testing (Current)
**Limitation**: Cannot test BrowserAdapter in Node.js jest
- wa-sqlite requires browser APIs (window, navigator)
- OPFS and IndexedDB are browser-only

**Solution for POC**:
1. Keep NodeAdapter tests as-is (19 passing tests)
2. Document that BrowserAdapter needs browser testing
3. Create parallel test suite for browser environment

### Browser Testing (Future)
**Recommended Tools**:
- Playwright or Puppeteer for automated browser testing
- Vitest with browser mode
- Web Test Runner

**Test Structure**:
```typescript
// browser-adapter.browser.test.ts
import { describe, it, expect } from '@playwright/test';
import { BrowserAdapter } from './browser-adapter.js';

describe('BrowserAdapter in Browser', () => {
  // Same 19 tests as adapter.test.ts
  // But running in actual browser environment
});
```

### Manual Testing (POC Phase)
For proof-of-concept, create simple HTML test page:
```html
<!DOCTYPE html>
<html>
<head>
  <script src="node_modules/@journeyapps/wa-sqlite/dist/wa-sqlite.js"></script>
  <script type="module">
    import { BrowserAdapter } from './browser-adapter.js';

    // Run tests and log results
    async function runTests() {
      const adapter = await BrowserAdapter.create(':memory:');
      // ... run basic operations ...
      console.log('✅ All tests passed');
    }

    runTests().catch(console.error);
  </script>
</head>
<body>
  <h1>BrowserAdapter Manual Tests</h1>
  <div id="results"></div>
</body>
</html>
```

## Performance Considerations

### OPFS vs IndexedDB Performance
**OPFS Benefits**:
- Real filesystem I/O (faster)
- Better support for concurrent access
- Lower overhead

**Expected Performance**:
- OPFS: ~10-50ms for 1000 insert transaction
- IndexedDB: ~50-200ms for same operation
- Memory: ~5-10ms (fastest)

### Statement Reuse
**Pattern**: Reuse prepared statements for repeated operations
```typescript
const stmt = await adapter.prepare('INSERT INTO users (name) VALUES (?)');

for (const name of names) {
  stmt.run(name);  // Reuses same prepared statement
}

stmt.finalize();  // Clean up when done
```

**Benefit**: Avoid repeated statement compilation

### Transaction Batching
**Pattern**: Wrap bulk operations in transactions
```typescript
await adapter.transaction(async () => {
  const stmt = await adapter.prepare('INSERT INTO nodes (type) VALUES (?)');
  for (let i = 0; i < 10000; i++) {
    stmt.run('TestNode');
  }
  stmt.finalize();
});
```

**Benefit**: Single commit vs 10,000 individual commits

## Integration Patterns

### Shared Interface Usage
Both adapters implement same interface:
```typescript
import { SQLiteAdapter } from './adapter-interface.js';

// Runtime adapter selection
let adapter: SQLiteAdapter;

if (typeof window !== 'undefined') {
  // Browser environment
  adapter = await BrowserAdapter.create('mydb.sqlite');
} else {
  // Node.js environment
  adapter = await NodeAdapter.create('mydb.sqlite');
}

// Same API regardless of adapter
await adapter.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
```

### Factory Pattern
```typescript
export async function createAdapter(
  path: string,
  options?: AdapterOptions
): Promise<SQLiteAdapter> {
  if (typeof window !== 'undefined') {
    const { BrowserAdapter } = await import('./browser-adapter.js');
    return BrowserAdapter.create(path, options);
  } else {
    const { NodeAdapter } = await import('./node-adapter.js');
    return NodeAdapter.create(path, options);
  }
}
```

## Migration Path

### Phase 1: POC (Current)
- Implement BrowserAdapter
- Manual browser testing
- Validate interface compliance

### Phase 2: Automated Testing
- Set up Playwright/Puppeteer
- Port all 19 tests to browser environment
- CI/CD integration

### Phase 3: Production Integration
- Update sqlite-graph to use adapter pattern
- Create factory for Node/Browser selection
- Update documentation

### Phase 4: Advanced Features
- Web Worker support for background queries
- Shared Worker for cross-tab persistence
- Service Worker caching strategies

## Security Considerations

### OPFS Security
- Origin-scoped (cannot access other sites' data)
- No direct file system access
- Automatic cleanup when origin storage cleared

### Parameter Binding
- Always use parameterized queries
- Never concatenate user input into SQL
- wa-sqlite handles escaping in bind_* functions

### XSS Prevention
- Don't use user input in SQL without binding
- Sanitize data before displaying query results
- CSP headers recommended

## Known Limitations

### 1. No Synchronous API
- BrowserAdapter methods are async (except isOpen)
- Cannot use in synchronous contexts
- May impact some sync-dependent code

### 2. Browser-Only Testing
- Cannot run browser tests in Node.js
- Need separate test infrastructure
- CI/CD requires browser automation

### 3. VFS Compatibility
- OPFS not available in all browsers
- IndexedDB performance varies by browser
- Safari OPFS support is partial

### 4. No File Path Access
- Cannot open arbitrary filesystem paths
- Database names are logical, not physical
- Export/import requires manual implementation

## Next Phase: Implementation
With architecture defined, the Implementation phase will:
1. Update browser-adapter.ts with complete implementation
2. Add helper methods to BrowserStatement
3. Implement robust error handling
4. Create manual test HTML page
5. Validate against interface requirements

---

**Status**: ✅ Architecture Complete
**Next**: TDD Implementation
**Author**: SPARC Coordinator (Claude Code)
**Date**: 2025-11-14
