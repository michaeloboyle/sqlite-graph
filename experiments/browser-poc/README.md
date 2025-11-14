# Browser POC - SQLite Graph Browser Support

This directory contains a proof-of-concept for adding browser support to sqlite-graph using the adapter pattern.

## 📋 Overview

- **Goal**: Enable sqlite-graph to run in web browsers using wa-sqlite
- **Method**: SPARC (Specification, Pseudocode, Architecture, Refinement, Completion)
- **Status**: ✅ Implementation complete, awaiting browser testing

## 🏗️ Architecture

### Adapter Pattern
```
SQLiteAdapter (interface)
    ├── NodeAdapter (better-sqlite3) - ✅ Complete
    └── BrowserAdapter (wa-sqlite) - ✅ Complete
```

Both adapters implement the same interface, enabling runtime selection:
```typescript
let adapter: SQLiteAdapter;

if (typeof window !== 'undefined') {
  adapter = await BrowserAdapter.create('mydb.sqlite');
} else {
  adapter = await NodeAdapter.create('mydb.sqlite');
}
```

## 📁 Project Structure

```
browser-poc/
├── adapter-interface.ts      # SQLiteAdapter & Statement interfaces
├── node-adapter.ts           # Node.js implementation (better-sqlite3)
├── browser-adapter.ts        # Browser implementation (wa-sqlite)
├── adapter.test.ts           # 19 interface compliance tests
├── test.html                 # Manual browser testing page
├── docs/
│   ├── browser-adapter-spec.md         # Requirements specification
│   ├── browser-adapter-architecture.md # Design decisions
│   └── poc-summary.md                  # Implementation summary
└── README.md                 # This file
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build TypeScript
```bash
npm run build
```

### 3. Run Node.js Tests
```bash
npm test
```

**Note**: BrowserAdapter tests cannot run in Node.js (requires browser APIs). Node tests validate NodeAdapter only.

### 4. Manual Browser Testing
```bash
# Serve the directory with a local web server
npx http-server . -p 8080

# Open in browser
open http://localhost:8080/test.html
```

Click "Run All Tests" to validate BrowserAdapter in your browser.

## 🧪 Testing Strategy

### Node.js Tests (19 tests - NodeAdapter only)
```bash
npm test
```

Tests validate:
- ✅ Basic operations (create, close, exec, prepare)
- ✅ CRUD operations (insert, select, update, delete)
- ✅ Transactions (commit, rollback)
- ✅ PRAGMA operations (get, set)
- ✅ Graph operations (nodes, edges, traversal)

### Browser Tests (Manual - test.html)
Open `test.html` in a browser to run:
- Basic operations tests
- CRUD operations tests
- Transaction tests
- Graph operations tests
- Performance benchmarks (1000 row inserts)

### Automated Browser Tests (Future)
Set up Playwright or Vitest browser mode to run same 19 tests in browser automatically.

## 📊 VFS (Virtual File System) Options

BrowserAdapter auto-selects the best VFS:

| VFS | Performance | Availability | Persistence |
|-----|-------------|--------------|-------------|
| **OPFS** | ⚡ Excellent | Chrome 102+, Firefox 111+, Safari 15.2+ | ✅ Yes |
| **IndexedDB** | 🐢 Good | All modern browsers | ✅ Yes |
| **Memory** | 🚀 Best | Always | ❌ No |

### Auto-Selection Logic
```typescript
const adapter = await BrowserAdapter.create('mydb.sqlite');
// Automatically chooses: OPFS > IndexedDB > memory

// Check which VFS was selected
console.log(adapter.getVFS()); // 'opfs', 'idb', or 'memdb'
```

### Manual VFS Override
```typescript
const adapter = await BrowserAdapter.create('mydb.sqlite', { vfs: 'idb' });
```

## 📖 Documentation

### Key Documents
1. **[browser-adapter-spec.md](./docs/browser-adapter-spec.md)** - Requirements and wa-sqlite API analysis
2. **[browser-adapter-architecture.md](./docs/browser-adapter-architecture.md)** - Design decisions and implementation details
3. **[poc-summary.md](./docs/poc-summary.md)** - POC findings and recommendations

### Code Examples

#### Basic Usage
```typescript
import { BrowserAdapter } from './browser-adapter.js';

// Create database
const adapter = await BrowserAdapter.create('mydb.sqlite');

// Same API as NodeAdapter
await adapter.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

const stmt = await adapter.prepare('INSERT INTO users (name) VALUES (?)');
stmt.run('Alice');
stmt.finalize();

await adapter.close();
```

#### Transactions
```typescript
await adapter.transaction(async () => {
  const stmt = await adapter.prepare('INSERT INTO nodes (type) VALUES (?)');
  for (let i = 0; i < 1000; i++) {
    stmt.run('TestNode');
  }
  stmt.finalize();
});
```

#### Universal Factory
```typescript
async function createAdapter(path: string): Promise<SQLiteAdapter> {
  if (typeof window !== 'undefined') {
    const { BrowserAdapter } = await import('./browser-adapter.js');
    return BrowserAdapter.create(path);
  } else {
    const { NodeAdapter } = await import('./node-adapter.js');
    return NodeAdapter.create(path);
  }
}
```

## ✅ Implementation Status

### Completed
- ✅ SQLiteAdapter interface definition
- ✅ NodeAdapter implementation (19 passing tests)
- ✅ BrowserAdapter implementation
- ✅ VFS auto-selection (OPFS/IndexedDB/memory)
- ✅ Transaction management with rollback
- ✅ Parameter binding with type detection
- ✅ Error handling and resource cleanup
- ✅ Documentation (spec, architecture, summary)
- ✅ Manual test HTML page

### Pending
- ⏳ Browser test automation (Playwright/Vitest)
- ⏳ Performance benchmarks (OPFS vs IndexedDB)
- ⏳ Multi-browser compatibility testing
- ⏳ Integration with main sqlite-graph package
- ⏳ Production deployment

## 🎯 Next Steps

### Immediate
1. Test `test.html` in Chrome, Firefox, Safari
2. Validate OPFS detection and IndexedDB fallback
3. Measure performance (1000 insert benchmark)
4. Verify persistence across page reloads

### Short-term
1. Set up Playwright for automated browser testing
2. Port all 19 tests to browser environment
3. Add browser-specific tests (VFS selection, storage quotas)
4. CI/CD integration for browser tests

### Medium-term
1. Integrate adapter pattern into main package
2. Create universal factory function
3. Update documentation with browser examples
4. Publish v1.0 with browser support

## 🐛 Known Limitations

1. **Browser-only execution** - BrowserAdapter requires browser APIs
2. **No Node.js testing** - Cannot run browser tests with jest
3. **VFS availability** - OPFS not universal (Chrome 102+, Firefox 111+)
4. **Performance** - IndexedDB 3-5x slower than OPFS
5. **Type definitions** - wa-sqlite uses `any` types (no official TypeScript support)

## 📚 References

- [wa-sqlite Documentation](https://github.com/rhashimoto/wa-sqlite)
- [OPFS (Origin Private File System)](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

## 🤝 Contributing

This is a proof-of-concept. To contribute:

1. Test `test.html` in your browser
2. Report VFS detection results (OPFS vs IndexedDB)
3. Share performance benchmark results
4. Suggest improvements to adapter interface

## 📄 License

MIT (same as sqlite-graph)

---

**SPARC Status**: Implementation Complete ✅
**Next Phase**: Browser Testing & Validation
**Coordinator**: Claude Code
**Date**: 2025-11-14
