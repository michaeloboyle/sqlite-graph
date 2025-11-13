# Browser Support Proof of Concept

**Goal:** Validate adapter pattern works with wa-sqlite before refactoring main codebase.

## Objectives

1. ✅ Get wa-sqlite running in both Node.js and browser
2. ✅ Test OPFS persistence in browser
3. ✅ Validate adapter abstraction pattern
4. ✅ Benchmark performance (Node vs browser)
5. ✅ Confirm same code can run in both environments

## Structure

```
browser-poc/
├── README.md              # This file
├── package.json           # Dependencies (wa-sqlite, better-sqlite3)
├── adapter-test.ts        # Adapter pattern POC
├── node-test.ts           # Node.js test harness
├── browser-test.html      # Browser test harness
└── results.md             # Performance & findings
```

## Setup

```bash
cd experiments/browser-poc
npm init -y
npm install wa-sqlite better-sqlite3 typescript @types/node
npx tsc --init
```

## Tests to Run

### 1. Adapter Interface Validation

- [ ] Create SQLiteAdapter interface
- [ ] Implement NodeAdapter (better-sqlite3)
- [ ] Implement BrowserAdapter (wa-sqlite)
- [ ] Run same test code with both adapters

### 2. Core Operations

- [ ] CREATE TABLE
- [ ] INSERT rows
- [ ] SELECT queries
- [ ] UPDATE operations
- [ ] DELETE operations
- [ ] Transactions (BEGIN/COMMIT/ROLLBACK)

### 3. Graph-Specific Operations

- [ ] Create nodes table
- [ ] Create edges table
- [ ] Insert nodes with JSON properties
- [ ] Insert edges
- [ ] Query connected nodes
- [ ] BFS traversal simulation

### 4. Persistence Testing

**Node.js:**
- [ ] Write to file
- [ ] Close database
- [ ] Reopen and verify data persists

**Browser (OPFS):**
- [ ] Write to OPFS
- [ ] Close database
- [ ] Reopen and verify data persists
- [ ] Test across page reloads

### 5. Performance Benchmarks

Measure operations/second:
- [ ] Node.js (better-sqlite3) - baseline
- [ ] Browser (wa-sqlite + OPFS)
- [ ] Browser (wa-sqlite + IndexedDB)

Target: Browser <2x slower than Node.js

## Expected Results

### Performance Expectations

| Operation | Node.js (baseline) | Browser (OPFS) | Browser (IndexedDB) |
|-----------|-------------------|----------------|---------------------|
| INSERT | ~40,000 ops/sec | >20,000 ops/sec | >5,000 ops/sec |
| SELECT | ~100,000 ops/sec | >50,000 ops/sec | >10,000 ops/sec |
| Transaction | ~50,000 ops/sec | >25,000 ops/sec | >5,000 ops/sec |

### Bundle Size

- wa-sqlite WASM: ~566 KB uncompressed → ~250 KB gzipped
- wa-sqlite JS: ~229 KB uncompressed → ~50 KB gzipped

### Success Criteria

- ✅ Same code runs in Node.js and browser
- ✅ Adapter pattern adds <1% performance overhead
- ✅ OPFS persistence works reliably
- ✅ Browser performance within 2x of Node.js
- ✅ No major blockers identified

## Next Steps After POC

If successful:
1. Refactor main Database class to use adapter
2. Convert all operations to async/await
3. Add browser build configuration
4. Create comprehensive browser test suite

If issues found:
1. Document blockers
2. Explore alternatives (official SQLite WASM, sql.js)
3. Re-evaluate approach
