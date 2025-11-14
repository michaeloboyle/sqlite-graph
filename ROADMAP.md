# sqlite-graph Roadmap

**Vision:** The only TypeScript graph database that works everywhere - Node.js, browser, edge - with full ACID transactions and graph algorithms.

**Current Version:** v0.3.0
**Next Major Release:** v1.0.0 (Browser Support) - ~6 weeks
**Status:** Phase 3 Complete, pivoting to universal browser support

---

## Strategic Pivot (November 2024)

### Decision: Browser Support is THE Differentiator

**Why this matters:**
- **ONLY** TypeScript graph DB with ACID + algorithms + browser support
- 5-10x larger addressable market (web apps vs Node.js only)
- Competitive moat vs level-graph and gun.js
- Notion proves WASM SQLite works in production browsers

**What changes:**
- Universal async/await API (breaking change from v0.x)
- wa-sqlite adapter for browser (OPFS + IndexedDB)
- Better-sqlite3 adapter for Node.js (native performance)
- Single codebase, dual runtime

---

## Completed Phases ✅

### Phase 1: Core Functionality (Complete)
- [x] Project setup and configuration
- [x] Type system design
- [x] Database schema (nodes, edges, metadata)
- [x] Database class implementation
- [x] Node/Edge CRUD operations
- [x] Transaction support with savepoints
- [x] Path finding with cycle detection
- [x] Export/import functionality
- [x] **201 tests passing**

### Phase 2: Query DSL (Complete)
- [x] NodeQuery fluent API
- [x] TraversalQuery implementation
- [x] Graph algorithms (BFS, shortest path)
- [x] Path enumeration wrapper
- [x] Cycle detection
- [x] **13 integration tests**

### Phase 3: Advanced Features (Complete)
- [x] Merge operations (mergeNode, mergeEdge)
- [x] Index management (create, drop, list)
- [x] Index performance optimization (7.11x speedup)
- [x] Merge conflict handling
- [x] Performance warnings for unindexed merges
- [x] **33 merge operation tests**
- [x] **234 total tests across 7 suites**

**Performance Validated:**
- ✅ Simple queries: 2.18ms (target: <10ms)
- ✅ Graph traversal: 2.68ms (target: <50ms)
- ✅ Node creation: 286µs (target: <1ms)
- ✅ mergeNode (indexed): 29,974 ops/sec
- ✅ Index speedup: 7.11x

---

## Current Phase: Browser Support (v1.0)

**Timeline:** 6 weeks from November 13, 2024
**Target Release:** Late December 2024 / Early January 2025

### Week 1: Research & Prototype ⏳ (In Progress)
- [x] Research wa-sqlite vs official SQLite WASM
- [x] Design SQLiteAdapter interface
- [x] Create proof-of-concept directory
- [x] Write comprehensive TDD tests (19 tests)
- [x] Implement NodeAdapter (better-sqlite3 wrapper)
- [x] **All NodeAdapter tests passing ✅**
- [ ] Implement BrowserAdapter (wa-sqlite wrapper)
- [ ] Test OPFS persistence in browser
- [ ] Benchmark Node.js vs browser performance
- [ ] Document findings and decision

**Deliverables:**
- Proof-of-concept validating adapter pattern
- Performance comparison (Node vs browser)
- Decision document on proceeding

### Week 2-3: Adapter Pattern Implementation
**Goals:**
- Convert Database class to use adapter abstraction
- Implement universal async/await API
- Support both Node.js and browser from same codebase

**Tasks:**
- [ ] Refactor Database class to accept SQLiteAdapter
- [ ] Convert all methods to async (breaking change)
- [ ] Update NodeQuery to async
- [ ] Update TraversalQuery to async
- [ ] Update Transaction to async
- [ ] Update merge operations to async
- [ ] Add environment detection (Node vs browser)
- [ ] Create browser build configuration

**Breaking Changes:**
```typescript
// v0.x (sync)
const db = new GraphDatabase('./graph.db');
const node = db.createNode('Job', { title: 'Engineer' });

// v1.0 (async - works in Node.js AND browser)
const db = await GraphDatabase.create('./graph.db');
const node = await db.createNode('Job', { title: 'Engineer' });
```

### Week 4: Testing
**Goals:**
- Comprehensive test coverage for both environments
- Browser testing with Playwright
- Performance validation

**Tasks:**
- [ ] Extend existing test suite for async API
- [ ] Setup Playwright for browser testing
- [ ] Test NodeAdapter with all 234 existing tests
- [ ] Test BrowserAdapter with same test suite
- [ ] Test OPFS persistence (Chrome, Firefox, Safari)
- [ ] Test IndexedDB fallback
- [ ] Test cross-tab synchronization
- [ ] Benchmark browser performance vs Node.js
- [ ] Validate <2x performance degradation

### Week 5: Documentation & Examples
**Goals:**
- Complete documentation for browser support
- Demo applications
- Migration guide

**Tasks:**
- [ ] Update README with browser support
- [ ] Create browser getting-started guide
- [ ] Document adapter pattern architecture
- [ ] Document bundle size optimization strategies
- [ ] Create migration guide (v0.x → v1.0)
- [ ] Update API documentation (all async)
- [ ] Create demo: Offline-first React app
- [ ] Create demo: Chrome extension example
- [ ] Create demo: Interactive graph visualization (PWA)
- [ ] Deploy demo to GitHub Pages

### Week 6: Release & Launch
**Goals:**
- npm v1.0.0 release
- Community launch
- Marketing

**Tasks:**
- [ ] Bundle size optimization (<350 KB gzipped)
- [ ] Tree-shaking verification
- [ ] Cross-browser final testing
- [ ] Security audit (CSP compatibility)
- [ ] Update competitive analysis
- [ ] Publish v1.0.0 to npm
- [ ] Tag GitHub release
- [ ] Write launch blog post
- [ ] Announce on Twitter/X
- [ ] Post to Hacker News
- [ ] Post to Reddit (r/javascript, r/webdev)
- [ ] Submit to JavaScript Weekly

---

## Phase 4: Post-v1.0 Improvements

**Priority:** Polish and adoption

### Documentation (Ongoing)
- [ ] Comprehensive API reference
- [ ] More usage examples
- [ ] Video tutorials
- [ ] Performance optimization guide
- [ ] Best practices guide

### Missing Phase 3 Features (Optional)
- [ ] All paths finding algorithm
- [ ] Pattern matching queries
- [ ] Bulk operation APIs
- [ ] Query performance analyzer
- [ ] Automatic index recommendations

### Community & Adoption
- [ ] Respond to GitHub issues
- [ ] Community support
- [ ] Collect usage feedback
- [ ] Plan v1.1 features based on real-world usage

---

## Phase 5: Future Enhancements (v1.x)

**When:** Based on community demand

### Performance Optimizations
- [ ] Query result streaming
- [ ] Lazy loading for large graphs
- [ ] Custom SQLite build (reduced WASM size)
- [ ] Worker thread support for Node.js
- [ ] Web Worker support for browser

### Developer Experience
- [ ] Schema validation at runtime
- [ ] Migration system
- [ ] CLI tools
- [ ] Graph visualization export
- [ ] GraphQL adapter

### Advanced Features
- [ ] Read replicas support (Node.js)
- [ ] Pluggable storage backends
- [ ] Computed properties
- [ ] Graph views (virtual subgraphs)
- [ ] Versioned graphs (time-travel queries)

### Enterprise Features (if requested)
- [ ] Encryption at rest
- [ ] Audit logging
- [ ] Access control (row-level security)
- [ ] Multi-tenancy support

---

## Not Planned (Architectural Limitations)

These features are **out of scope** due to SQLite's single-node architecture:

- ❌ Distributed clustering
- ❌ Multi-master replication
- ❌ Horizontal scaling across nodes
- ❌ Built-in sharding

**Upgrade Path:** When you outgrow sqlite-graph, export to Neo4j or ArangoDB.

---

## Success Metrics

### v1.0 Launch Targets
- **Week 1:** 100+ GitHub stars, 10+ HN upvotes
- **Month 1:** 500+ npm downloads, 3+ production users
- **Quarter 1:** 2000+ npm downloads, 10+ production users, featured in JavaScript Weekly

### Technical Targets
- ✅ Node.js performance unchanged (within 1%)
- ✅ Browser performance <2x slower than Node.js
- ✅ Browser bundle <350 KB gzipped
- ✅ Works in Chrome 102+, Firefox 111+, Safari 15.2+
- ✅ All 234+ tests passing in both environments

### Competitive Position
- ✅ ONLY TypeScript graph DB with ACID + algorithms + browser support
- ✅ Better DX than level-graph (fluent API vs triple store)
- ✅ Stronger consistency than gun.js (ACID vs eventual)
- ✅ Smaller footprint than Neo4j (310 KB vs 300+ MB)

---

## Decision Log

### November 13, 2024: Browser Support Pivot
**Decision:** Make browser support the primary v1.0 focus

**Rationale:**
- Competitive moat vs all current competitors
- 5-10x larger addressable market
- Notion proves WASM SQLite works in production
- wa-sqlite is mature (v1.0 July 2024)
- No existing adoption to break with async API

**Trade-offs:**
- Breaking API change (sync → async)
- Larger bundle size (310 KB vs competitors' 30-100 KB)
- More complex testing (Node + 3 browsers)

**Alternative Considered:** Separate packages (@sqlite-graph/node, @sqlite-graph/browser)
**Rejected Because:** Maintenance burden, code duplication, confusing for users

### November 13, 2024: wa-sqlite Over Official SQLite WASM
**Decision:** Use @journeyapps/wa-sqlite (actively maintained fork)

**Rationale:**
- Smaller bundle: 250 KB gzipped (vs 400 KB official)
- Better API design (native async/await)
- Active maintenance (v1.3.1 published 3 days ago)
- Built-in OPFS + IndexedDB support
- Good community usage

**Alternative:** Official SQLite WASM
**May Add Later:** v1.1 could support both adapters as option

---

## Release Schedule

| Version | Feature | Target Date | Status |
|---------|---------|-------------|--------|
| v0.1.0 | Core CRUD | ✅ Oct 2024 | Complete |
| v0.2.0 | Query DSL | ✅ Oct 2024 | Complete |
| v0.3.0 | Merge Ops | ✅ Nov 2024 | Complete |
| **v1.0.0** | **Browser Support** | **Late Dec 2024** | **In Progress** |
| v1.1.0 | Polish & Adoption | Q1 2025 | Planned |
| v1.x | Community-driven | 2025 | TBD |
| v2.0.0 | Breaking changes (if needed) | TBD | Future |

---

## How to Contribute

We welcome contributions! Current priorities:

**High Priority (v1.0):**
- Browser testing help (Playwright expertise)
- Bundle size optimization
- Documentation improvements
- Demo applications

**Medium Priority (v1.1):**
- All paths finding algorithm
- Pattern matching queries
- Performance optimization ideas

**Low Priority (Future):**
- Feature requests for v1.x
- Advanced use cases

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## Questions?

- **Issues:** https://github.com/michaeloboyle/sqlite-graph/issues
- **Discussions:** https://github.com/michaeloboyle/sqlite-graph/discussions
- **Twitter:** [@oboyle_co](https://twitter.com/oboyle_co)

---

**Last Updated:** November 14, 2024
**Next Review:** After v1.0.0 launch (Late December 2024)
