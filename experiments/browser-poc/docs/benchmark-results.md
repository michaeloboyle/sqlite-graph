# Browser Adapter Performance Benchmarks

**Date:** 2025-11-14
**Node.js Baseline:** Completed ✅
**Browser Testing:** Pending manual validation

---

## Executive Summary

Node.js adapter performance baseline established with **10 comprehensive benchmarks** across 5 iterations each:

- ✅ **All operations < 1ms average** (excellent performance)
- ✅ **Transaction throughput: 1,713 ops/sec** (1000 row inserts)
- ✅ **Single operations: 18,000-94,000 ops/sec** (CRUD operations)
- ✅ **Graph traversal: 20,367 ops/sec** (recursive CTE)

**Target for Browser:** <2x slower than Node.js baseline

---

## Node.js Performance Baseline (better-sqlite3)

**Hardware:** macOS (Darwin 24.6.0)
**Node.js:** Current LTS
**Iterations:** 5 per test

| Operation | Avg Time | Ops/Sec | Description |
|-----------|----------|---------|-------------|
| Database Creation | 0.54ms | 1,847 | CREATE TABLE statement |
| Single Insert | 0.02ms | 60,000 | Single row INSERT |
| Batch Insert (100 rows) | 0.12ms | 8,232 | 100 sequential INSERTs |
| Transaction Insert (1000 rows) | 0.58ms | 1,713 | 1000 rows in transaction |
| Select Single Row | 0.02ms | 59,289 | SELECT with WHERE clause |
| Select All (1000 rows) | 0.40ms | 2,494 | SELECT * from 1000 rows |
| Update Single Row | 0.05ms | 18,459 | UPDATE with WHERE clause |
| Delete Single Row | 0.01ms | 94,341 | DELETE with WHERE clause |
| Graph Traversal (BFS) | 0.05ms | 20,367 | Recursive CTE traversal |
| Transaction Rollback | 0.03ms | 36,563 | BEGIN → Error → ROLLBACK |

### Performance Characteristics

**Fastest Operations:**
1. Delete Single Row: 94,341 ops/sec
2. Select Single Row: 59,289 ops/sec
3. Single Insert: 60,000 ops/sec

**Slowest Operations:**
1. Transaction Insert (1000 rows): 0.58ms (bulk operation)
2. Database Creation: 0.54ms (DDL overhead)
3. Select All (1000 rows): 0.40ms (bulk read)

**Key Insights:**
- Point operations (single row) are extremely fast (0.01-0.05ms)
- Bulk operations scale linearly with row count
- Graph traversal uses recursive CTEs efficiently
- Transaction overhead is minimal (0.03ms for rollback)

---

## Browser Adapter Performance (wa-sqlite)

**Status:** ⏳ Awaiting manual browser testing

### Testing Instructions

1. **Start local server:**
   ```bash
   cd experiments/browser-poc
   npx http-server . -p 8080
   ```

2. **Open benchmark page:**
   ```
   http://localhost:8080/benchmark.html
   ```

3. **Run benchmarks in each browser:**
   - Chrome (latest)
   - Firefox (latest)
   - Safari (latest)

4. **Export results:**
   - Click "Export Results as JSON"
   - Save as `benchmark-browser-[browser]-[date].json`

5. **Compare with Node.js:**
   - Ensure `benchmark-node.json` exists in same directory
   - Click "Compare with Node.js"
   - Review performance ratios

### Expected Results

Based on wa-sqlite characteristics and WASM performance:

| VFS Backend | Expected Performance vs Node.js |
|-------------|--------------------------------|
| **OPFS** | 1.2-1.8x slower (✅ target) |
| **IndexedDB** | 1.8-2.5x slower (⚠️ acceptable) |
| **Memory** | 1.1-1.5x slower (✅ best case) |

**Pass Criteria:**
- ✅ Average ratio across all tests < 2.0x
- ✅ No individual test > 3.0x slower
- ✅ Graph operations < 2.5x slower
- ✅ Transaction operations < 2.5x slower

---

## VFS Backend Comparison

### OPFS (Origin Private File System)

**Availability:**
- Chrome 102+ ✅
- Firefox 111+ ✅
- Safari 15.2+ ✅

**Characteristics:**
- ⚡ Near-native file system performance
- ✅ True persistence across sessions
- ✅ No storage quota issues (up to device capacity)
- ✅ Atomic operations
- ⚠️ Not available in incognito/private mode

**Expected Performance:** 1.2-1.8x slower than Node.js

### IndexedDB (Fallback)

**Availability:**
- All modern browsers ✅
- Works in incognito mode ✅

**Characteristics:**
- 🐢 Slower than OPFS (3-5x)
- ✅ Reliable persistence
- ⚠️ Storage quotas apply
- ⚠️ Write amplification (more disk I/O)

**Expected Performance:** 1.8-2.5x slower than Node.js

### Memory (In-Memory)

**Availability:**
- Always available ✅

**Characteristics:**
- 🚀 Fastest option
- ❌ No persistence
- ✅ Perfect for temporary/session data

**Expected Performance:** 1.1-1.5x slower than Node.js

---

## Testing Matrix

| Browser | VFS | Status | Avg Ratio | Pass/Fail |
|---------|-----|--------|-----------|-----------|
| Chrome (latest) | OPFS | ⏳ Pending | - | - |
| Chrome (latest) | IndexedDB | ⏳ Pending | - | - |
| Chrome (latest) | Memory | ⏳ Pending | - | - |
| Firefox (latest) | OPFS | ⏳ Pending | - | - |
| Firefox (latest) | IndexedDB | ⏳ Pending | - | - |
| Safari (latest) | OPFS | ⏳ Pending | - | - |
| Safari (latest) | IndexedDB | ⏳ Pending | - | - |

---

## Benchmark Methodology

### Test Structure

Each benchmark:
1. **Setup:** Create database, tables, seed data
2. **Operation:** Execute timed operation
3. **Teardown:** Clean up resources
4. **Iterations:** 5 runs per test
5. **Metrics:** Average, min, max, ops/sec

### Timing Precision

- **Node.js:** `performance.now()` (microsecond precision)
- **Browser:** `performance.now()` (microsecond precision)
- Both use same measurement approach for fair comparison

### Statistical Analysis

- **Average:** Mean of 5 samples
- **Min/Max:** Range for variance detection
- **Ops/Sec:** `1000 / avgTimeMs`
- **Ratio:** `browserAvg / nodeAvg`

---

## Performance Targets

### v1.0 Release Criteria

| Metric | Target | Reason |
|--------|--------|--------|
| Average ratio | <2.0x | Acceptable trade-off for browser support |
| Max ratio | <3.0x | No single operation should be prohibitive |
| OPFS ratio | <1.8x | OPFS should be competitive |
| IndexedDB ratio | <2.5x | Acceptable fallback performance |

### Stretch Goals

| Metric | Goal | Impact |
|--------|------|--------|
| Average ratio | <1.5x | Excellent performance |
| OPFS ratio | <1.3x | Near-native speed |
| Transaction ratio | <2.0x | Bulk operations efficient |

---

## Known Performance Considerations

### WASM Overhead

- **Startup:** Initial WASM module load (~50-100ms)
- **Crossing boundary:** JS ↔ WASM calls have small overhead
- **Memory:** WASM memory is linear (no GC pauses)

### Browser-Specific

- **Tab throttling:** Background tabs may be throttled
- **Storage I/O:** File system writes go through browser APIs
- **Main thread:** All operations on main thread (no workers yet)

### Optimization Opportunities (Future)

- [ ] Move to Web Worker for background processing
- [ ] Batch statement compilation
- [ ] Custom SQLite build (smaller WASM)
- [ ] Statement caching
- [ ] Connection pooling

---

## Automated Testing (Future)

### Playwright Integration

```bash
# Run automated browser benchmarks
npm run bench:browser

# Run cross-browser comparison
npm run bench:all

# Generate comparison report
npm run bench:report
```

**Planned for:** v1.1 post-release

---

## Results Archive

Browser benchmark results will be stored in:
```
experiments/browser-poc/results/
├── benchmark-node.json (baseline)
├── benchmark-chrome-opfs-2025-11-14.json
├── benchmark-firefox-opfs-2025-11-14.json
├── benchmark-safari-opfs-2025-11-14.json
└── comparison-report-2025-11-14.md
```

---

## Next Steps

1. ✅ **Complete:** Node.js baseline benchmarks
2. ⏳ **Pending:** Manual browser testing (Chrome, Firefox, Safari)
3. ⏳ **Pending:** Document results in this file
4. ⏳ **Pending:** Update POC summary with performance findings
5. ⏳ **Future:** Automate with Playwright

---

**Last Updated:** 2025-11-14
**Status:** Node.js baseline complete, browser testing ready
