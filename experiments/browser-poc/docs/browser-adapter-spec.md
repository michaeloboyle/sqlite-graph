# BrowserAdapter Specification

## Overview
This document specifies requirements for implementing a browser-compatible SQLite adapter using wa-sqlite, providing the same interface as NodeAdapter but running in web browsers.

## Reference Implementation
**NodeAdapter** (`node-adapter.ts`) serves as the reference implementation:
- Uses better-sqlite3 (synchronous SQLite bindings)
- Wraps synchronous API in Promises for consistency
- Passes all 19 interface compliance tests
- Supports in-memory and file-based databases

## Target Environment
- **Primary**: Modern browsers with OPFS support (Chrome 102+, Firefox 111+, Safari 15.2+)
- **Fallback**: Browsers with IndexedDB (all modern browsers)
- **Library**: @journeyapps/wa-sqlite v1.3.1

## Interface Requirements

### SQLiteAdapter Interface Compliance
BrowserAdapter MUST implement all methods defined in `adapter-interface.ts`:

1. **prepare(sql: string): Promise<Statement>**
   - Parse and prepare SQL statement
   - Return BrowserStatement wrapper
   - Must be reusable for multiple executions

2. **exec(sql: string): Promise<void>**
   - Execute SQL without returning results
   - Used for DDL (CREATE, DROP, ALTER)
   - No parameter binding needed

3. **transaction<T>(fn: () => Promise<T>): Promise<T>**
   - Execute function within BEGIN/COMMIT transaction
   - ROLLBACK on any error
   - Support nested async operations

4. **pragma(setting: string, value?: any): Promise<any>**
   - Get PRAGMA values when value not provided
   - Set PRAGMA values when value provided
   - Return current value after SET

5. **close(): Promise<void>**
   - Clean up database connection
   - Idempotent (safe to call multiple times)
   - Set _isOpen = false

6. **isOpen(): boolean**
   - Return current connection state
   - Synchronous check
   - False after close()

### Statement Interface Compliance
BrowserStatement MUST implement:

1. **run(...params: any[]): { changes: number; lastInsertRowid: number | bigint }**
   - Execute with parameters
   - Return mutation results
   - Support string, number, null parameters

2. **get(...params: any[]): any**
   - Return single row or undefined
   - Bind parameters before execution
   - Parse column types correctly

3. **all(...params: any[]): any[]**
   - Return array of all matching rows
   - Empty array if no matches
   - Support same parameter types as get()

4. **finalize(): void**
   - Clean up statement resources
   - Called automatically or manually
   - Idempotent

## wa-sqlite API Analysis

### Key wa-sqlite APIs (from @journeyapps/wa-sqlite)

**Module Initialization:**
```typescript
// Global function provided by wa-sqlite script
const sqlite3 = await window.sqlite3InitModule();
```

**Database Operations:**
```typescript
// Open database with VFS
const db = await sqlite3.open_v2(
  filename: string,
  flags: number,  // SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE
  vfsModule: string  // 'opfs' | 'idb' | 'memdb'
);

// Close database
await sqlite3.close(db);

// Execute SQL
await sqlite3.exec(db, sql: string);
```

**Statement Lifecycle:**
```typescript
// Prepare statement
const stmt = await sqlite3.prepare_v2(db, sql: string);

// Bind parameters (1-indexed)
sqlite3.bind_text(stmt, index: number, value: string);
sqlite3.bind_double(stmt, index: number, value: number);
sqlite3.bind_int64(stmt, index: number, value: number);
sqlite3.bind_null(stmt, index: number);

// Execute
const result = sqlite3.step(stmt);
// Returns: SQLITE_ROW (100), SQLITE_DONE (101)

// Reset for re-execution
sqlite3.reset(stmt);

// Finalize
sqlite3.finalize(stmt);
```

**Reading Results:**
```typescript
// Column metadata
const count = sqlite3.column_count(stmt);
const name = sqlite3.column_name(stmt, index);
const type = sqlite3.column_type(stmt, index);
// Types: 1=INTEGER, 2=FLOAT, 3=TEXT, 4=BLOB, 5=NULL

// Extract values
const intValue = sqlite3.column_int64(stmt, index);
const doubleValue = sqlite3.column_double(stmt, index);
const textValue = sqlite3.column_text(stmt, index);
const blobValue = sqlite3.column_blob(stmt, index);
```

**Database Info:**
```typescript
// Get changes from last operation
const changes = sqlite3.changes(db);

// Get last inserted row ID
const rowid = sqlite3.last_insert_rowid(db);
```

## Browser-Specific Requirements

### 1. VFS Selection Strategy
Priority order for database persistence:

1. **OPFS (Origin Private File System)** - Preferred
   - Check: `typeof navigator.storage?.getDirectory === 'function'`
   - Best performance (real filesystem)
   - Available: Chrome 102+, Firefox 111+, Safari 15.2+
   - Module name: `'opfs'`

2. **IndexedDB** - Fallback
   - Universal browser support
   - Slower than OPFS but reliable
   - Module name: `'idb'`

3. **In-Memory** - For `:memory:` databases
   - No persistence
   - Module name: `'memdb'`

### 2. Async API Handling
All wa-sqlite operations are async, unlike better-sqlite3:
- Use `await` for all database operations
- BrowserStatement methods must handle async internally
- Statement reuse requires `reset()` before each execution

### 3. Parameter Binding
wa-sqlite uses 1-indexed parameter binding (SQL standard):
- Parameters start at index 1 (not 0)
- Must call `reset()` before binding new parameters
- Type-specific binding functions required

### 4. Result Type Mapping
Map SQLite column types to JavaScript:
- Type 1 (INTEGER) → `column_int64()` → number
- Type 2 (FLOAT) → `column_double()` → number
- Type 3 (TEXT) → `column_text()` → string
- Type 4 (BLOB) → `column_blob()` → Uint8Array
- Type 5 (NULL) → null

### 5. Error Handling
wa-sqlite error patterns:
- Check return codes from `step()`, `prepare_v2()`, etc.
- Use try/catch for async operations
- Ensure proper cleanup in finally blocks
- ROLLBACK transactions on any error

## Test Requirements

### Existing Tests (19 total)
All tests in `adapter.test.ts` MUST pass:

**Basic Operations (4 tests):**
- ✅ Create and open database
- ✅ Close database
- ✅ Execute SQL statements
- ✅ Prepare statements

**CRUD Operations (5 tests):**
- ✅ Insert with lastInsertRowid
- ✅ Select single row with get()
- ✅ Select multiple rows with all()
- ✅ Update data
- ✅ Delete data

**Transactions (3 tests):**
- ✅ Commit successful transactions
- ✅ Rollback failed transactions
- ✅ Handle nested operations

**PRAGMA (2 tests):**
- ✅ Get PRAGMA values
- ✅ Set PRAGMA values

**Graph Operations (5 integration tests):**
- ✅ Create nodes with JSON properties
- ✅ Create edges between nodes
- ✅ Query connected nodes
- ✅ Graph traversal (recursive CTE)
- ✅ Bulk operations in transactions

### Browser-Specific Testing
Additional testing considerations:
- Run tests in actual browser environment (Playwright, Puppeteer)
- Test OPFS availability detection
- Test IndexedDB fallback
- Verify persistence across page reloads
- Measure performance vs NodeAdapter

## Success Criteria

### Functional Requirements
1. ✅ All 19 existing tests pass with BrowserAdapter
2. ✅ Works in `:memory:` mode
3. ✅ OPFS persistence when available
4. ✅ IndexedDB fallback when OPFS unavailable
5. ✅ Proper transaction rollback on errors
6. ✅ Accurate lastInsertRowid values
7. ✅ Correct parameter binding for all types

### Performance Requirements
1. Transaction bulk inserts < 2 seconds for 1000 rows
2. Graph traversal queries complete in reasonable time
3. No memory leaks (proper statement finalization)

### Quality Requirements
1. TypeScript type safety maintained
2. Error messages clear and actionable
3. Code follows NodeAdapter patterns
4. Proper resource cleanup

## Implementation Notes

### Critical Differences from NodeAdapter
1. **All operations are async** in wa-sqlite
   - BrowserStatement methods call async wa-sqlite APIs
   - Must use `await` internally even though interface is synchronous

2. **Statement reuse requires reset()**
   - Call `reset()` before each execution
   - NodeAdapter doesn't need this (better-sqlite3 handles it)

3. **1-indexed parameter binding**
   - wa-sqlite: parameters start at 1
   - Loop indices need `i + 1` when binding

4. **VFS module must be loaded**
   - OPFS and IDB modules come with wa-sqlite
   - Must select appropriate VFS at database open time

5. **No automatic type coercion**
   - Must explicitly choose bind_text vs bind_double vs bind_int64
   - Must check column_type before reading values

### Known Limitations
1. **Browser environment required**
   - Cannot test with Node.js jest (needs browser APIs)
   - Need browser test runner (Playwright/Puppeteer)

2. **OPFS availability varies**
   - Older browsers fall back to IndexedDB
   - Performance difference is significant

3. **No direct file access**
   - Cannot open arbitrary filesystem paths
   - Database names are virtual (stored in OPFS/IndexedDB)

## Next Phase: Architecture
After this specification is approved, the Architecture phase will:
1. Design BrowserStatement implementation details
2. Design initialization and VFS selection logic
3. Plan error handling strategy
4. Define testing approach for browser environment
5. Document integration patterns

---

**Status**: ✅ Specification Complete
**Next**: Architecture Design
**Author**: SPARC Coordinator (Claude Code)
**Date**: 2025-11-14
