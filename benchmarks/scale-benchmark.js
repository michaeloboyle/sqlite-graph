// Scale benchmark: sqlite-graph vs raw better-sqlite3 doing the same work.
// Usage: npm run build && node benchmarks/scale-benchmark.js
// Env: SCALES=1000,10000,100000  OUT=<dir for temp DB files, default os tmpdir>
const path = require('path');
const fs = require('fs');
const os = require('os');
const { GraphDatabase } = require('../dist');
const Database = require('better-sqlite3');

const OUT = process.env.OUT || os.tmpdir();
const SCALES = (process.env.SCALES || '1000,10000,100000').split(',').map(Number);
const DEG = 5;

// mulberry32: a plain LCG mod 2^31 produced correlated query pairs (all at distance 2)
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const ri = (n) => 1 + Math.floor(rnd() * n);

function time(fn, iters) {
  const t = [];
  for (let i = 0; i < iters; i++) {
    const s = process.hrtime.bigint();
    fn(i);
    t.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  t.sort((a, b) => a - b);
  return { med: t[Math.floor(t.length / 2)], p95: t[Math.floor(t.length * 0.95)], n: iters };
}
const fmt = (r) => `${r.med.toFixed(3)}ms (p95 ${r.p95.toFixed(3)}, n=${r.n})`;
const results = [];
function rec(scale, op, impl, r, extra = {}) {
  results.push({ scale, op, impl, ...r, ...extra });
  console.log(`[${scale}] ${op.padEnd(34)} ${impl.padEnd(10)} ${fmt(r)} ${Object.keys(extra).length ? JSON.stringify(extra) : ''}`);
}

function buildGraph(file, N) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const g = new GraphDatabase(file);
  const raw = g.getRawDb();
  const cities = ['Scranton', 'Boston', 'Austin', 'Denver', 'Miami', 'Seattle', 'Chicago', 'Portland'];
  const insN = raw.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');
  const insE = raw.prepare('INSERT INTO edges (type, from_id, to_id) VALUES (?, ?, ?)');
  raw.transaction(() => {
    for (let i = 1; i <= N; i++) {
      insN.run(i % 10 === 0 ? 'Company' : 'Person',
        JSON.stringify({ name: `n${i}`, age: 18 + (i % 60), city: cities[i % cities.length], email: `u${i}@x.io` }));
    }
    for (let i = 1; i <= N; i++) for (let d = 0; d < DEG; d++) insE.run('KNOWS', i, ri(N));
  })();
  return g;
}

// --- baselines in raw SQL with cached statements ---
function rawBfs(raw, start, maxDepth, hyd) {
  const nb = raw.prepare("SELECT to_id AS id FROM edges WHERE from_id = ? AND type = 'KNOWS'").pluck();
  const seen = new Set([start]); let frontier = [start]; const out = [];
  for (let d = 0; d < maxDepth; d++) {
    const next = [];
    for (const id of frontier) for (const n of nb.all(id)) if (!seen.has(n)) { seen.add(n); next.push(n); out.push(hyd ? JSON.parse(hyd.get(n).properties) : n); }
    frontier = next;
  }
  return out.length;
}
function cteBfs(raw, start, maxDepth) {
  return raw.prepare(`WITH RECURSIVE r(id, d) AS (SELECT ?, 0 UNION SELECT e.to_id, r.d + 1 FROM edges e JOIN r ON e.from_id = r.id WHERE e.type='KNOWS' AND r.d < ?)
    SELECT COUNT(DISTINCT id) - 1 AS c FROM r`).get(start, maxDepth).c;
}
function rawShortest(raw, a, b) {
  const nb = raw.prepare('SELECT to_id AS id FROM edges WHERE from_id = ? UNION SELECT from_id FROM edges WHERE to_id = ?').pluck();
  const parent = new Map([[a, 0]]); let q = [a], h = 0;
  while (h < q.length) { const c = q[h++]; if (c === b) return true; for (const n of nb.all(c, c)) if (!parent.has(n)) { parent.set(n, c); q.push(n); } }
  return false;
}

for (const N of SCALES) {
  const file = path.join(OUT, `bench-${N}.db`);
  const t0 = Date.now();
  const g = buildGraph(file, N);
  const raw = g.getRawDb();
  console.log(`\n=== N=${N} nodes, ${N * DEG} edges, build ${Date.now() - t0}ms, journal=${raw.pragma('journal_mode', { simple: true })} sync=${raw.pragma('synchronous', { simple: true })}`);
  const it = N >= 100000 ? 200 : 500;

  // Point lookup
  rec(N, 'getNode', 'lib', time(() => g.getNode(ri(N)), 2000));
  const gn = raw.prepare('SELECT * FROM nodes WHERE id = ?');
  rec(N, 'getNode', 'raw', time(() => { const r = gn.get(ri(N)); JSON.parse(r.properties); }, 2000));

  // Property filter, unindexed then indexed
  const city = () => ['Scranton', 'Boston', 'Austin'][ri(3) - 1];
  const em = () => `u${ri(N)}@x.io`;
  rec(N, 'where(email) unindexed', 'lib', time(() => g.nodes('Person').where({ email: em() }).exec(), 50));
  rec(N, 'where(city).limit(20) unindexed', 'lib', time(() => g.nodes('Person').where({ city: city() }).limit(20).exec(), 200));
  rec(N, 'where(city).count() unindexed', 'lib', time(() => g.nodes('Person').where({ city: city() }).count(), 50));
  g.createPropertyIndex('Person', 'email');
  const plan = raw.prepare(`EXPLAIN QUERY PLAN SELECT n.* FROM nodes n WHERE n.type = ? AND json_extract(n.properties, '$.email') = ?`).all('Person', 'x').map(r => r.detail).join(' | ');
  rec(N, 'where(email) indexed', 'lib', time(() => g.nodes('Person').where({ email: em() }).exec(), 500), { plan });

  // Traversal depth 2 and 3
  for (const depth of [2, 3]) {
    const its = depth === 3 && N >= 100000 ? 50 : (depth === 3 ? 100 : it);
    let cnt = 0; const st = Array.from({ length: its }, () => ri(N));
    rec(N, `traverse.out.unique d=${depth}`, 'lib', time((i) => { cnt = g.traverse(st[i]).out('KNOWS').unique().maxDepth(depth).toArray().length; }, its), { reached: cnt });
    rec(N, `traverse.out.unique d=${depth}`, 'raw-js', time((i) => { cnt = rawBfs(raw, st[i], depth); }, its), { reached: cnt });
    rec(N, `traverse.out.unique d=${depth}`, 'raw+hydr', time((i) => { cnt = rawBfs(raw, st[i], depth, gn); }, its), { reached: cnt });
    if (N <= 10000) rec(N, `traverse.out.unique d=${depth}`, 'raw-cte', time((i) => { cnt = cteBfs(raw, st[i], depth); }, Math.min(its, 50)), { reached: cnt });
  }
  // Non-unique traversal (default): result inflation on a cyclic graph
  {
    let cnt = 0; const s = ri(N);
    rec(N, 'traverse.out NON-unique d=3', 'lib', time(() => { cnt = g.traverse(s).out('KNOWS').maxDepth(3).toArray().length; }, 20), { returned: cnt, distinct: g.traverse(s).out('KNOWS').unique().maxDepth(3).toArray().length });
  }

  // Shortest path between random pairs
  const pairs = Array.from({ length: 30 }, () => [ri(N), ri(N)]);
  rec(N, 'shortestPath (any edge)', 'lib', time((i) => g.traverse(pairs[i][0]).shortestPath(pairs[i][1]), pairs.length));
  rec(N, 'shortestPath (any edge)', 'raw-js', time((i) => rawShortest(raw, pairs[i][0], pairs[i][1]), pairs.length));

  // Statement prepare overhead in isolation
  rec(N, 'prepare+get per call', 'lib-style', time(() => raw.prepare('SELECT * FROM nodes WHERE id = ?').get(ri(N)), 5000));
  rec(N, 'cached stmt get', 'raw', time(() => gn.get(ri(N)), 5000));

  g.close();
  for (const f of [file, file + '-wal', file + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
}

// --- Write path: journal mode x transaction ---
{
  const N = 2000;
  for (const mode of ['no-wal', 'wal']) {
    const file = path.join(OUT, `w-${mode}.db`);
    for (const f of [file, file + '-wal', file + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
    const g = new GraphDatabase(file, { wal: mode === 'wal' });
    let s = Date.now();
    for (let i = 0; i < N; i++) g.createNode('Person', { name: `p${i}` });
    const auto = Date.now() - s;
    s = Date.now();
    g.transaction(() => { for (let i = 0; i < N; i++) g.createNode('Person', { name: `q${i}` }); });
    const tx = Date.now() - s;
    s = Date.now();
    for (let i = 0; i < N; i++) g.createEdge(i + 1, 'KNOWS', N + i + 1);
    const edges = Date.now() - s;
    console.log(`[write ${mode}] createNode x${N} autocommit ${auto}ms (${(N / auto * 1000).toFixed(0)}/s) | in transaction ${tx}ms (${(N / tx * 1000).toFixed(0)}/s) | createEdge autocommit ${edges}ms`);
    results.push({ scale: N, op: 'write', impl: mode, autocommit_ms: auto, tx_ms: tx, edge_autocommit_ms: edges });
    g.close();
    for (const f of [file, file + '-wal', file + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

fs.writeFileSync(path.join(OUT, 'sqlite-graph-scale-results.json'), JSON.stringify(results, null, 2));
console.log('\nwrote', path.join(OUT, 'sqlite-graph-scale-results.json'));
