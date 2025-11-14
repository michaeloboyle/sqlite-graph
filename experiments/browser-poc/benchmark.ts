/**
 * Benchmark suite for NodeAdapter vs BrowserAdapter
 * Tests performance of various SQLite operations
 */

import { NodeAdapter } from './node-adapter.js';
import { SQLiteAdapter } from './adapter-interface.js';

interface BenchmarkResult {
  name: string;
  nodeAdapter: {
    avgTime: number;
    opsPerSec: number;
    samples: number[];
  };
  comparison?: {
    ratio: number;
    verdict: string;
  };
}

class Benchmarker {
  private results: BenchmarkResult[] = [];

  /**
   * Run a benchmark multiple times and calculate statistics
   */
  async runBenchmark(
    name: string,
    setup: (adapter: SQLiteAdapter) => Promise<void>,
    operation: (adapter: SQLiteAdapter) => Promise<void>,
    teardown: (adapter: SQLiteAdapter) => Promise<void>,
    iterations: number = 5
  ): Promise<void> {
    console.log(`\n📊 Running: ${name}`);

    const nodeSamples: number[] = [];

    // Run Node.js benchmarks
    for (let i = 0; i < iterations; i++) {
      const adapter = await NodeAdapter.create(':memory:');

      await setup(adapter);

      const start = performance.now();
      await operation(adapter);
      const elapsed = performance.now() - start;

      await teardown(adapter);
      await adapter.close();

      nodeSamples.push(elapsed);
      process.stdout.write('.');
    }

    const nodeAvg = nodeSamples.reduce((a, b) => a + b, 0) / nodeSamples.length;
    const nodeOps = 1000 / nodeAvg;

    console.log(`\n  Node.js: ${nodeAvg.toFixed(2)}ms avg (${nodeOps.toFixed(0)} ops/sec)`);

    this.results.push({
      name,
      nodeAdapter: {
        avgTime: nodeAvg,
        opsPerSec: nodeOps,
        samples: nodeSamples
      }
    });
  }

  /**
   * Print summary of all benchmark results
   */
  printSummary(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📈 BENCHMARK SUMMARY');
    console.log('='.repeat(80));

    console.log('\nNode.js Performance:');
    console.log('-'.repeat(80));
    console.log('Operation'.padEnd(40) + 'Avg Time'.padEnd(15) + 'Ops/Sec');
    console.log('-'.repeat(80));

    for (const result of this.results) {
      const name = result.name.padEnd(40);
      const time = `${result.nodeAdapter.avgTime.toFixed(2)}ms`.padEnd(15);
      const ops = result.nodeAdapter.opsPerSec.toFixed(0);
      console.log(`${name}${time}${ops}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('Note: Browser adapter benchmarks require manual testing via test.html');
    console.log('Expected browser performance: <2x slower than Node.js (target threshold)');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Export results as JSON for comparison with browser results
   */
  exportJSON(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      platform: 'node',
      results: this.results
    }, null, 2);
  }
}

async function main() {
  const bench = new Benchmarker();

  // 1. Database creation
  await bench.runBenchmark(
    'Database Creation',
    async () => {},
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    },
    async () => {}
  );

  // 2. Single insert
  await bench.runBenchmark(
    'Single Insert',
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    },
    async (adapter) => {
      const stmt = await adapter.prepare('INSERT INTO test (value) VALUES (?)');
      stmt.run('test value');
      stmt.finalize();
    },
    async () => {}
  );

  // 3. Batch insert (100 rows)
  await bench.runBenchmark(
    'Batch Insert (100 rows)',
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    },
    async (adapter) => {
      const stmt = await adapter.prepare('INSERT INTO test (value) VALUES (?)');
      for (let i = 0; i < 100; i++) {
        stmt.run(`value ${i}`);
      }
      stmt.finalize();
    },
    async () => {}
  );

  // 4. Transactional insert (1000 rows)
  await bench.runBenchmark(
    'Transaction Insert (1000 rows)',
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    },
    async (adapter) => {
      await adapter.transaction(async () => {
        const stmt = await adapter.prepare('INSERT INTO test (value) VALUES (?)');
        for (let i = 0; i < 1000; i++) {
          stmt.run(`value ${i}`);
        }
        stmt.finalize();
      });
    },
    async () => {}
  );

  // 5. Select single row
  await bench.runBenchmark(
    'Select Single Row',
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      const stmt = await adapter.prepare('INSERT INTO test (value) VALUES (?)');
      for (let i = 0; i < 1000; i++) {
        stmt.run(`value ${i}`);
      }
      stmt.finalize();
    },
    async (adapter) => {
      const stmt = await adapter.prepare('SELECT * FROM test WHERE id = ?');
      stmt.get(500);
      stmt.finalize();
    },
    async () => {}
  );

  // 6. Select all rows (1000 rows)
  await bench.runBenchmark(
    'Select All (1000 rows)',
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      const stmt = await adapter.prepare('INSERT INTO test (value) VALUES (?)');
      for (let i = 0; i < 1000; i++) {
        stmt.run(`value ${i}`);
      }
      stmt.finalize();
    },
    async (adapter) => {
      const stmt = await adapter.prepare('SELECT * FROM test');
      stmt.all();
      stmt.finalize();
    },
    async () => {}
  );

  // 7. Update operation
  await bench.runBenchmark(
    'Update Single Row',
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      const stmt = await adapter.prepare('INSERT INTO test (value) VALUES (?)');
      for (let i = 0; i < 1000; i++) {
        stmt.run(`value ${i}`);
      }
      stmt.finalize();
    },
    async (adapter) => {
      const stmt = await adapter.prepare('UPDATE test SET value = ? WHERE id = ?');
      stmt.run('updated', 500);
      stmt.finalize();
    },
    async () => {}
  );

  // 8. Delete operation
  await bench.runBenchmark(
    'Delete Single Row',
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      const stmt = await adapter.prepare('INSERT INTO test (value) VALUES (?)');
      for (let i = 0; i < 1000; i++) {
        stmt.run(`value ${i}`);
      }
      stmt.finalize();
    },
    async (adapter) => {
      const stmt = await adapter.prepare('DELETE FROM test WHERE id = ?');
      stmt.run(500);
      stmt.finalize();
    },
    async () => {}
  );

  // 9. Graph traversal (recursive CTE)
  await bench.runBenchmark(
    'Graph Traversal (BFS)',
    async (adapter) => {
      await adapter.exec(`
        CREATE TABLE nodes (id INTEGER PRIMARY KEY, type TEXT);
        CREATE TABLE edges (source INTEGER, target INTEGER);
      `);

      // Create a simple tree: 1 -> 2, 1 -> 3, 2 -> 4, 2 -> 5
      const nodeStmt = await adapter.prepare('INSERT INTO nodes (type) VALUES (?)');
      for (let i = 0; i < 5; i++) {
        nodeStmt.run('TestNode');
      }
      nodeStmt.finalize();

      const edgeStmt = await adapter.prepare('INSERT INTO edges (source, target) VALUES (?, ?)');
      edgeStmt.run(1, 2);
      edgeStmt.run(1, 3);
      edgeStmt.run(2, 4);
      edgeStmt.run(2, 5);
      edgeStmt.finalize();
    },
    async (adapter) => {
      const stmt = await adapter.prepare(`
        WITH RECURSIVE traverse(id, depth) AS (
          SELECT 1 as id, 0 as depth
          UNION ALL
          SELECT e.target, t.depth + 1
          FROM traverse t
          JOIN edges e ON e.source = t.id
          WHERE t.depth < 10
        )
        SELECT * FROM traverse JOIN nodes ON traverse.id = nodes.id
      `);
      stmt.all();
      stmt.finalize();
    },
    async () => {}
  );

  // 10. Transaction rollback
  await bench.runBenchmark(
    'Transaction Rollback',
    async (adapter) => {
      await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    },
    async (adapter) => {
      try {
        await adapter.transaction(async () => {
          const stmt = await adapter.prepare('INSERT INTO test (value) VALUES (?)');
          stmt.run('test');
          stmt.finalize();
          throw new Error('Intentional rollback');
        });
      } catch (e) {
        // Expected
      }
    },
    async () => {}
  );

  // Print summary
  bench.printSummary();

  // Export JSON for browser comparison
  const jsonPath = './benchmark-node.json';
  const fs = await import('fs');
  fs.writeFileSync(jsonPath, bench.exportJSON());
  console.log(`\n✅ Node.js benchmark results exported to: ${jsonPath}`);
  console.log('   Use this file to compare with browser benchmark results\n');
}

main().catch(console.error);
