# Browser Support Implementation Plan

**Goal:** Add browser support to sqlite-graph using wa-sqlite, making it the only TypeScript graph database with ACID + algorithms + browser support.

**Timeline:** 6 weeks to v1.0
**Status:** Phase 1 - Research & Prototype ✅ COMPLETE (POC Implementation Done)
**Next:** Manual browser validation in Chrome, Firefox, Safari

---

## Executive Summary

### Current State
- ✅ Node.js only (better-sqlite3)
- ✅ Full ACID transactions
- ✅ Graph algorithms (BFS, shortest path)
- ✅ TypeScript-native fluent API
- ❌ No browser support

### Target State (v1.0)
- ✅ Node.js (better-sqlite3 for native performance)
- ✅ Browser (wa-sqlite with OPFS persistence)
- ✅ Universal async/await API
- ✅ Same code works everywhere
- ✅ Full ACID in both environments
- ✅ ~310 KB gzipped browser bundle

---

## Strategic Value

### Competitive Position After Browser Support

**Before:**
```
sqlite-graph: ❌ Browser, ✅ ACID, ✅ Algorithms, ✅ TypeScript
level-graph:  ✅ Browser, ❌ ACID, ❌ Algorithms, ⚠️ Basic TS
gun.js:       ✅ Browser, ❌ ACID, ❌ Algorithms, ⚠️ Basic TS
```

**After:**
```
sqlite-graph: ✅ Browser, ✅ ACID, ✅ Algorithms, ✅ TypeScript
→ ONLY library with all four ⭐
```

### Market Expansion

**Current addressable market:**
- Desktop apps (Electron, Tauri)
- Mobile apps (React Native)
- CLI tools
- Node.js servers
- Serverless (Lambda)

**New markets with browser support:**
- ✅ Web applications (local-first)
- ✅ Progressive Web Apps (PWA)
- ✅ Chrome extensions
- ✅ Offline-first web apps
- ✅ Browser-based tools
- ✅ Electron (browser renderer process)

**5-10x larger total addressable market**

---

## Technical Architecture

### Adapter Pattern Design

```typescript
// Universal interface
interface SQLiteAdapter {
  prepare(sql: string): Promise<Statement>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  pragma(setting: string): Promise<any>;
  close(): Promise<void>;
}

// Node.js adapter (native performance)
class NodeAdapter implements SQLiteAdapter {
  private db: Database.Database;

  async prepare(sql: string): Promise<Statement> {
    // Wrap better-sqlite3 sync API in Promise for consistency
    return Promise.resolve(this.db.prepare(sql));
  }
}

// Browser adapter (WASM + OPFS)
class BrowserAdapter implements SQLiteAdapter {
  private db: any; // wa-sqlite instance

  async prepare(sql: string): Promise<Statement> {
    // wa-sqlite native async API
    const stmt = await this.db.prepare(sql);
    return stmt;
  }
}

// Auto-detect environment
export class GraphDatabase {
  private adapter: SQLiteAdapter;

  static async create(path: string, options?: DatabaseOptions): Promise<GraphDatabase> {
    const instance = new GraphDatabase();

    if (typeof window !== 'undefined') {
      instance.adapter = await BrowserAdapter.create(path, options);
    } else {
      instance.adapter = await NodeAdapter.create(path, options);
    }

    await instance.initialize();
    return instance;
  }

  // All methods now async
  async createNode<T>(type: string, properties: T): Promise<Node<T>> {
    const stmt = await this.adapter.prepare(
      'INSERT INTO nodes (type, properties) VALUES (?, ?)'
    );
    // ... rest of implementation
  }
}
```

### Breaking Changes (v0.x → v1.0)

**Before (sync):**
```typescript
const db = new GraphDatabase('./graph.db');
const node = db.createNode('Job', { title: 'Engineer' });
```

**After (async):**
```typescript
const db = await GraphDatabase.create('./graph.db');
const node = await db.createNode('Job', { title: 'Engineer' });
```

**Rationale:**
- Browser WASM requires async (no sync file I/O)
- Universal API works everywhere
- No breaking changes concern (pre-v1.0, zero adoption)

---

## Implementation Phases

### Phase 1: Research & Prototype (Week 1) ✅ COMPLETE

**Goals:**
- [x] Research wa-sqlite vs official SQLite WASM
- [x] Build minimal proof-of-concept
- [x] Validate adapter pattern works
- [x] Benchmark performance (Node vs browser) - Node.js baseline complete
- [x] Create comprehensive test suite

**Deliverables:**
- [x] Working POC in `experiments/browser-poc/` ✅
- [x] Performance comparison document ✅
- [x] Adapter interface design document ✅
- [x] NodeAdapter implementation (19/19 tests) ✅
- [x] BrowserAdapter implementation (374 lines) ✅
- [x] Benchmark suite (Node.js + Browser HTML) ✅

**Success Criteria:**
- [x] POC runs same code in Node.js ✅
- [x] Node.js baseline: All operations < 1ms ✅
- [ ] ⏳ Browser testing pending (manual validation next)
- [ ] ⏳ OPFS persistence validation pending

**Performance Results (Node.js Baseline):**
- ⚡ Ultra-Fast Operations: Delete (94k ops/sec), Select (59k ops/sec), Insert (60k ops/sec)
- ✅ Transaction throughput: 1,713 ops/sec (1000 row inserts)
- ✅ Graph traversal: 20,367 ops/sec (recursive CTE)
- ✅ All operations < 1ms average

**Next Steps:**
1. Serve `experiments/browser-poc/` with HTTP server
2. Open `test.html` in Chrome, Firefox, Safari
3. Run all 19 tests in each browser
4. Open `benchmark.html` and run performance benchmarks
5. Validate OPFS detection and persistence
6. Compare browser results with Node.js baseline
7. Document findings in benchmark-results.md

---

### Phase 2: Adapter Pattern Implementation (Weeks 2-3)

**Week 2: Core Adapter Infrastructure**

Tasks:
- [ ] Create `src/adapters/SQLiteAdapter.ts` interface
- [ ] Create `src/adapters/NodeAdapter.ts` (better-sqlite3 wrapper)
- [ ] Create `src/adapters/BrowserAdapter.ts` (wa-sqlite wrapper)
- [ ] Add wa-sqlite as optional dependency
- [ ] Refactor Database class to use adapter
- [ ] Convert all methods to async/await

**Week 3: Query & Algorithm Updates**

Tasks:
- [ ] Update NodeQuery to async
- [ ] Update TraversalQuery to async
- [ ] Update Transaction to async
- [ ] Update merge operations to async
- [ ] Ensure all graph algorithms work with async adapter

---

### Phase 3: Testing (Week 4)

**Unit Tests:**
- [ ] Test NodeAdapter with existing test suite
- [ ] Test BrowserAdapter with same test suite
- [ ] Test adapter switching logic
- [ ] Test OPFS persistence
- [ ] Test IndexedDB fallback

**Browser Integration Tests:**
- [ ] Setup Playwright for browser testing
- [ ] Test in Chrome (OPFS support)
- [ ] Test in Firefox (OPFS support)
- [ ] Test in Safari (OPFS support)
- [ ] Test cross-tab synchronization
- [ ] Test large graph performance (1000+ nodes)

**Performance Benchmarks:**
- [ ] Node.js (better-sqlite3) baseline
- [ ] Browser (wa-sqlite + OPFS)
- [ ] Browser (wa-sqlite + IndexedDB fallback)
- [ ] Document acceptable performance ranges

---

### Phase 4: Documentation & Examples (Week 5)

**Documentation:**
- [ ] Update README with browser support
- [ ] Create browser getting-started guide
- [ ] Document adapter pattern
- [ ] Document bundle size optimization
- [ ] Document OPFS vs IndexedDB trade-offs
- [ ] Update API docs (all async)
- [ ] Create migration guide (v0.x → v1.0)

**Examples:**
- [ ] Browser demo app (React + sqlite-graph)
- [ ] Offline-first todo app (PWA example)
- [ ] Chrome extension example
- [ ] Node.js example (showing same API)
- [ ] Code splitting example (lazy-load WASM)

**Demo Application:**
- Interactive graph visualization (vis.js)
- Works offline (PWA)
- OPFS persistence
- Shows performance metrics
- Deploy to GitHub Pages

---

### Phase 5: Release & Launch (Week 6)

**Pre-Release:**
- [ ] Bundle size optimization
- [ ] Tree-shaking verification
- [ ] Final performance validation
- [ ] Security audit (CSP compatibility, etc.)
- [ ] Cross-browser testing
- [ ] Update competitive analysis

**Release:**
- [ ] Publish v1.0.0 to npm
- [ ] Tag release on GitHub
- [ ] Update landing page
- [ ] Create announcement blog post
- [ ] Tweet launch announcement
- [ ] Post to Hacker News
- [ ] Post to Reddit (r/javascript, r/webdev)

**Post-Launch:**
- [ ] Monitor GitHub issues
- [ ] Respond to community feedback
- [ ] Collect real-world usage data
- [ ] Plan v1.1 features

---

## Technical Decisions

### Why wa-sqlite over Official SQLite WASM?

| Factor | wa-sqlite | Official WASM | Winner |
|--------|-----------|---------------|---------|
| **Bundle Size** | 566 KB → 250 KB gzipped | 897 KB → 400 KB gzipped | wa-sqlite ✅ |
| **API Design** | Clean async/await | Sync wrapper needed | wa-sqlite ✅ |
| **OPFS Support** | Excellent | Good | Tie |
| **IndexedDB Fallback** | Built-in | Manual | wa-sqlite ✅ |
| **Community** | Active, responsive | Official but slower | Tie |
| **Production Use** | Several apps | Notion, others | Tie |
| **Documentation** | Good | Official docs | Official ✅ |

**Decision:** Start with wa-sqlite for better bundle size and API. Can add official WASM as alternative later.

### Storage Strategy

**Primary:** OPFS (Origin Private File System)
- Near-native performance
- True file system semantics
- Supported in Chrome 102+, Firefox 111+, Safari 15.2+

**Fallback:** IndexedDB
- Universal browser support
- 10-100x slower than OPFS
- For older browsers

**Development:** In-memory (`:memory:`)
- Fastest for testing
- No persistence

### Async API Design

**All database operations become async:**

```typescript
// Before
const node = db.createNode('Job', { title: 'Engineer' });
const nodes = db.nodes('Job').where({ status: 'active' }).exec();

// After
const node = await db.createNode('Job', { title: 'Engineer' });
const nodes = await db.nodes('Job').where({ status: 'active' }).exec();
```

**Rationale:**
- Browser WASM requires async
- Node.js can wrap sync in Promise (no perf cost)
- Consistent API across environments
- Modern JavaScript standard (async/await everywhere)

---

## Bundle Size Strategy

### Target Sizes

**Node.js (unchanged):**
- Package: ~50 KB
- better-sqlite3: Native binary (~2 MB)

**Browser:**
- sqlite-graph code: ~60 KB
- wa-sqlite WASM: ~250 KB gzipped
- **Total: ~310 KB gzipped**

### Optimization Techniques

**1. Code Splitting:**
```typescript
// Lazy load for browser
const { GraphDatabase } = await import('sqlite-graph/browser');
```

**2. Tree Shaking:**
- ESM-only for browser build
- Ensure all imports are tree-shakeable

**3. CDN Caching:**
```html
<!-- WASM cached across all sites -->
<script src="https://cdn.jsdelivr.net/npm/wa-sqlite@1.0.0/wa-sqlite.wasm"></script>
```

**4. Service Worker Pre-cache:**
- Pre-download WASM during SW install
- Available instantly on repeat visits

### Bundle Analysis

```bash
# Analyze browser bundle
npx vite-bundle-visualizer
npx webpack-bundle-analyzer

# Target breakdown:
# - sqlite-graph code: 60 KB
# - wa-sqlite.wasm: 250 KB (gzipped)
# - Total: 310 KB ✅ (smaller than React)
```

---

## Risk Mitigation

### Risk 1: Performance Degradation

**Risk:** Browser version slower than Node.js

**Mitigation:**
- Benchmark early and often
- Target: <2x slowdown acceptable
- OPFS gives near-native performance
- Document performance characteristics
- Provide optimization guide

### Risk 2: Browser Compatibility Issues

**Risk:** OPFS not supported in all browsers

**Mitigation:**
- IndexedDB fallback for older browsers
- Feature detection on startup
- Clear browser support matrix in docs
- Graceful degradation

### Risk 3: Bundle Size Concerns

**Risk:** 310 KB too large for some use cases

**Mitigation:**
- Code splitting (lazy load WASM)
- Clear documentation of size trade-offs
- Compare to React (280 KB), not level-graph (30 KB)
- Emphasize value: "Full database engine in 310 KB"

### Risk 4: Adapter Pattern Complexity

**Risk:** Abstraction layer causes bugs or performance issues

**Mitigation:**
- Comprehensive test suite (Node + browser)
- Keep adapter interface minimal
- Benchmark adapter overhead (<1% target)
- Fallback: Remove abstraction if problematic

### Risk 5: Async API Breaking Changes

**Risk:** Existing users affected by sync → async migration

**Mitigation:**
- ✅ Zero adoption currently (pre-v1.0)
- Clear migration guide
- Version bump to v1.0 signals breaking change
- Keep v0.x branch for hypothetical legacy users

---

## Success Metrics

### Technical Metrics

**Performance:**
- [ ] Node.js performance unchanged (within 1%)
- [ ] Browser performance <2x slower than Node.js
- [ ] OPFS persistence works reliably
- [ ] All 234 tests passing in both environments

**Bundle Size:**
- [ ] Browser bundle <350 KB gzipped
- [ ] Tree-shaking works correctly
- [ ] No duplicate dependencies

**Compatibility:**
- [ ] Works in Chrome 102+
- [ ] Works in Firefox 111+
- [ ] Works in Safari 15.2+
- [ ] Graceful degradation in older browsers

### Adoption Metrics (Post-Launch)

**Week 1:**
- [ ] 100+ GitHub stars
- [ ] 10+ Hacker News upvotes
- [ ] 5+ community questions/issues

**Month 1:**
- [ ] 500+ npm downloads
- [ ] 3+ production users
- [ ] Featured in JavaScript Weekly

**Quarter 1:**
- [ ] 2000+ npm downloads
- [ ] 10+ production users
- [ ] 1+ major company using it

---

## Competitive Messaging

### Before Browser Support

**Positioning:**
> "TypeScript-native graph database for Node.js applications"

**Target:** Desktop apps, CLI tools, servers

### After Browser Support

**Positioning:**
> "The only graph database that works everywhere: Node.js, browser, edge. Full ACID, graph algorithms, and TypeScript—in 310 KB."

**Target:** All JavaScript developers

### Key Messages

**1. Universal JavaScript:**
```typescript
// Same code, works everywhere
import { GraphDatabase } from 'sqlite-graph';

const db = await GraphDatabase.create('./graph.db');
// Runs in Node.js, browser, Deno, Bun, Cloudflare Workers
```

**2. Full-Featured:**
- ✅ ACID transactions (not eventual consistency)
- ✅ Graph algorithms (BFS, shortest path, cycle detection)
- ✅ Fluent TypeScript API (not Cypher/AQL)
- ✅ 310 KB (smaller than React)

**3. Local-First:**
- No server required
- Works offline
- Data stays on device
- Privacy by default

**4. Production-Ready:**
- Built on SQLite (battle-tested since 2000)
- Used by Notion (WASM SQLite in production)
- Comprehensive test suite (234 tests)
- MIT licensed

---

## Timeline & Milestones

```
Week 1 (Current):     Phase 1 - Research & POC
Week 2-3:             Phase 2 - Adapter Implementation
Week 4:               Phase 3 - Testing
Week 5:               Phase 4 - Documentation & Examples
Week 6:               Phase 5 - Release v1.0

Launch Date:          ~6 weeks from now
```

### Weekly Check-ins

**Every Friday:**
- Review progress against plan
- Update risk register
- Adjust timeline if needed
- Document learnings

---

## Open Questions

**Q1: Should we support both wa-sqlite AND official SQLite WASM?**
- **Decision:** Start with wa-sqlite only. Add official as option in v1.1 if requested.

**Q2: Should we keep sync API for Node.js and async for browser?**
- **Decision:** No. Universal async API for consistency.

**Q3: Should we create separate packages (@sqlite-graph/node, @sqlite-graph/browser)?**
- **Decision:** No. Single package with environment detection.

**Q4: What's the minimum browser version to support?**
- **Decision:** Chrome 102+, Firefox 111+, Safari 15.2+ (OPFS support). IndexedDB fallback for older.

**Q5: Should we optimize bundle size with custom SQLite build?**
- **Decision:** Phase 2. Start with standard wa-sqlite, optimize later if needed.

---

## Resources

### Documentation
- [wa-sqlite GitHub](https://github.com/rhashimoto/wa-sqlite)
- [Official SQLite WASM](https://sqlite.org/wasm)
- [OPFS Spec](https://fs.spec.whatwg.org/)
- [Notion WASM SQLite Blog](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)

### Tools
- Playwright (browser testing)
- vite-bundle-visualizer (bundle analysis)
- Lighthouse (performance testing)

### Reference Implementations
- Notion (production WASM SQLite)
- sql.js (established WASM SQLite)
- wa-sqlite examples

---

## Next Actions

**Immediate (This Week):**
1. ✅ Create this plan document
2. [ ] Setup `experiments/browser-poc/` directory
3. [ ] Install wa-sqlite and create minimal POC
4. [ ] Test POC in both Node.js and browser
5. [ ] Validate adapter pattern approach
6. [ ] Document findings

**Week 2 Prep:**
- [ ] Design SQLiteAdapter interface
- [ ] Plan Database class refactoring
- [ ] Identify all sync operations that need async conversion

---

**Status:** Ready to begin Phase 1 - Research & Prototype

**Owner:** Michael O'Boyle + Claude Code

**Target Launch:** v1.0 in ~6 weeks

Let's build the only TypeScript graph database that works everywhere! 🚀
