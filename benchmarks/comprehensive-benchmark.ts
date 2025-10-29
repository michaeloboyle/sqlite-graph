/**
 * Comprehensive Performance Benchmark Suite for sqlite-graph
 *
 * Tests performance across various operations and dataset sizes:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Query operations (where, connectedTo, orderBy, limit)
 * - Graph traversal (BFS, DFS, shortest path)
 * - Transaction performance
 * - Large dataset handling
 *
 * Run with: npx ts-node benchmarks/comprehensive-benchmark.ts
 */

import { GraphDatabase } from '../src/index';
import type { Node } from '../src/types';
import * as fs from 'fs';

// Benchmark configuration
const BENCHMARK_DB = './benchmark-test.db';
const WARMUP_ITERATIONS = 10;
const TEST_ITERATIONS = 100;

// Dataset sizes to test
const DATASET_SIZES = {
  SMALL: 100,
  MEDIUM: 1000,
  LARGE: 10000
};

interface BenchmarkResult {
  name: string;
  operations: number;
  totalTime: number;
  avgTime: number;
  opsPerSec: number;
  minTime: number;
  maxTime: number;
}

class BenchmarkSuite {
  private results: BenchmarkResult[] = [];

  /**
   * Run a benchmark function multiple times and collect statistics
   */
  private benchmark(
    name: string,
    fn: () => void,
    iterations: number = TEST_ITERATIONS,
    warmup: number = WARMUP_ITERATIONS
  ): BenchmarkResult {
    // Warmup
    for (let i = 0; i < warmup; i++) {
      fn();
    }

    // Actual benchmark
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      fn();
      const end = performance.now();
      times.push(end - start);
    }

    const totalTime = times.reduce((sum, t) => sum + t, 0);
    const avgTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const opsPerSec = 1000 / avgTime;

    const result: BenchmarkResult = {
      name,
      operations: iterations,
      totalTime,
      avgTime,
      opsPerSec,
      minTime,
      maxTime
    };

    this.results.push(result);
    return result;
  }

  /**
   * Format time in appropriate unit
   */
  private formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)}µs`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * Print a single benchmark result
   */
  private printResult(result: BenchmarkResult): void {
    console.log(`  ${result.name}`);
    console.log(`    Avg: ${this.formatTime(result.avgTime)} | Ops/sec: ${result.opsPerSec.toFixed(0)}`);
    console.log(`    Min: ${this.formatTime(result.minTime)} | Max: ${this.formatTime(result.maxTime)}`);
  }

  /**
   * Benchmark: Node creation
   */
  benchmarkNodeCreation(db: GraphDatabase): void {
    console.log('\n📝 Node Creation Benchmarks');
    console.log('─'.repeat(80));

    this.benchmark('Create single node', () => {
      db.createNode('Person', { name: 'Test User', age: 30 });
    });

    this.benchmark('Create node with complex properties', () => {
      db.createNode('Job', {
        title: 'Senior Engineer',
        salary: { min: 120000, max: 180000 },
        skills: ['TypeScript', 'React', 'Node.js'],
        remote: true,
        metadata: { posted: new Date().toISOString() }
      });
    });

    this.results.slice(-2).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Edge creation
   */
  benchmarkEdgeCreation(db: GraphDatabase): void {
    console.log('\n🔗 Edge Creation Benchmarks');
    console.log('─'.repeat(80));

    // Setup: Create some nodes
    const node1 = db.createNode('Person', { name: 'Alice' });
    const node2 = db.createNode('Person', { name: 'Bob' });

    this.benchmark('Create edge (no properties)', () => {
      db.createEdge(node1.id, 'KNOWS', node2.id);
    });

    this.benchmark('Create edge (with properties)', () => {
      db.createEdge(node1.id, 'KNOWS', node2.id, {
        since: 2020,
        strength: 0.85,
        metadata: { source: 'test' }
      });
    });

    this.results.slice(-2).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Node queries
   */
  benchmarkNodeQueries(db: GraphDatabase, datasetSize: number): void {
    console.log(`\n🔍 Query Benchmarks (${datasetSize} nodes)`);
    console.log('─'.repeat(80));

    // Setup: Create dataset
    console.log('  Setting up dataset...');
    const nodes: Node[] = [];
    db.transaction(() => {
      for (let i = 0; i < datasetSize; i++) {
        nodes.push(db.createNode('Person', {
          name: `Person ${i}`,
          age: 20 + (i % 50),
          active: i % 2 === 0 ? 1 : 0  // SQLite uses integers for booleans
        }));
      }
    });

    // Benchmark queries
    this.benchmark('Query all nodes', () => {
      db.nodes('Person').exec();
    }, 10, 2);

    this.benchmark('Query with where clause', () => {
      db.nodes('Person').where({ active: 1 }).exec();  // Use integer for boolean
    }, 10, 2);

    this.benchmark('Query with orderBy', () => {
      db.nodes('Person').orderBy('age', 'desc').exec();
    }, 10, 2);

    this.benchmark('Query with limit', () => {
      db.nodes('Person').limit(10).exec();
    }, 10, 2);

    this.benchmark('Complex query (where + orderBy + limit)', () => {
      db.nodes('Person')
        .where({ active: 1 })  // Use integer for boolean
        .orderBy('age', 'desc')
        .limit(10)
        .exec();
    }, 10, 2);

    this.results.slice(-5).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Graph traversal
   */
  benchmarkTraversal(db: GraphDatabase): void {
    console.log('\n🗺️  Graph Traversal Benchmarks');
    console.log('─'.repeat(80));

    // Setup: Create a graph with paths
    console.log('  Setting up graph...');
    const nodes: Node[] = [];
    db.transaction(() => {
      for (let i = 0; i < 100; i++) {
        nodes.push(db.createNode('Node', { id: i }));
      }

      // Create chain: 0 -> 1 -> 2 -> ... -> 99
      for (let i = 0; i < 99; i++) {
        db.createEdge(nodes[i].id, 'NEXT', nodes[i + 1].id);
      }

      // Create some branches
      for (let i = 0; i < 50; i += 5) {
        db.createEdge(nodes[i].id, 'BRANCH', nodes[i + 50].id);
      }
    });

    this.benchmark('Traverse 1 hop', () => {
      db.traverse(nodes[0].id).out('NEXT').toArray();
    });

    this.benchmark('Traverse 5 hops', () => {
      db.traverse(nodes[0].id).out('NEXT').maxDepth(5).toArray();
    });

    this.benchmark('Traverse 10 hops', () => {
      db.traverse(nodes[0].id).out('NEXT').maxDepth(10).toArray();
    });

    this.benchmark('Find shortest path (50 hops)', () => {
      db.traverse(nodes[0].id).shortestPath(nodes[50].id);
    }, 10, 2);

    this.benchmark('Find all paths (maxDepth 5)', () => {
      db.traverse(nodes[0].id).paths(nodes[5].id, { maxDepth: 5 });
    }, 10, 2);

    this.results.slice(-5).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Transactions
   */
  benchmarkTransactions(db: GraphDatabase): void {
    console.log('\n💾 Transaction Benchmarks');
    console.log('─'.repeat(80));

    this.benchmark('Create 10 nodes in transaction', () => {
      db.transaction(() => {
        for (let i = 0; i < 10; i++) {
          db.createNode('Person', { name: `Person ${i}` });
        }
      });
    }, 50, 5);

    this.benchmark('Create 100 nodes in transaction', () => {
      db.transaction(() => {
        for (let i = 0; i < 100; i++) {
          db.createNode('Person', { name: `Person ${i}` });
        }
      });
    }, 10, 2);

    this.benchmark('Transaction with rollback (savepoint)', () => {
      db.transaction((ctx) => {
        db.createNode('Person', { name: 'Test' });
        ctx.savepoint('sp1');
        db.createNode('Person', { name: 'Test2' });
        ctx.rollbackTo('sp1');
        ctx.commit();
      });
    }, 50, 5);

    this.results.slice(-3).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Update operations
   */
  benchmarkUpdates(db: GraphDatabase): void {
    console.log('\n✏️  Update Benchmarks');
    console.log('─'.repeat(80));

    const node = db.createNode('Person', { name: 'Test', age: 30 });

    this.benchmark('Update node (single property)', () => {
      db.updateNode(node.id, { age: 31 });
    });

    this.benchmark('Update node (multiple properties)', () => {
      db.updateNode(node.id, {
        age: 32,
        name: 'Updated Name',
        active: true,
        metadata: { updated: Date.now() }
      });
    });

    this.results.slice(-2).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Delete operations
   */
  benchmarkDeletes(db: GraphDatabase): void {
    console.log('\n🗑️  Delete Benchmarks');
    console.log('─'.repeat(80));

    this.benchmark('Delete node', () => {
      const node = db.createNode('Person', { name: 'Temp' });
      db.deleteNode(node.id);
    });

    this.benchmark('Delete node with edges', () => {
      const node1 = db.createNode('Person', { name: 'Temp1' });
      const node2 = db.createNode('Person', { name: 'Temp2' });
      db.createEdge(node1.id, 'KNOWS', node2.id);
      db.deleteNode(node1.id);
      db.deleteNode(node2.id);
    });

    this.results.slice(-2).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Complex real-world scenarios
   */
  benchmarkRealWorld(db: GraphDatabase): void {
    console.log('\n🌐 Real-World Scenario Benchmarks');
    console.log('─'.repeat(80));

    this.benchmark('Job search scenario (create + query)', () => {
      db.transaction(() => {
        const job = db.createNode('Job', {
          title: 'Senior Engineer',
          salary: 150000
        });
        const company = db.createNode('Company', { name: 'TechCorp' });
        const skill = db.createNode('Skill', { name: 'TypeScript' });

        db.createEdge(job.id, 'POSTED_BY', company.id);
        db.createEdge(job.id, 'REQUIRES', skill.id);

        // Query similar jobs
        db.nodes('Job')
          .where({ title: 'Senior Engineer' })
          .connectedTo('Company', 'POSTED_BY')
          .exec();
      });
    }, 20, 5);

    this.benchmark('Social network scenario (friends of friends)', () => {
      db.transaction(() => {
        const users: Node[] = [];
        for (let i = 0; i < 10; i++) {
          users.push(db.createNode('User', { name: `User ${i}` }));
        }

        // Create friend connections
        for (let i = 0; i < 9; i++) {
          db.createEdge(users[i].id, 'FRIEND', users[i + 1].id);
        }

        // Find friends of friends
        db.traverse(users[0].id)
          .out('FRIEND')
          .maxDepth(2)
          .toArray();
      });
    }, 20, 5);

    this.results.slice(-2).forEach(r => this.printResult(r));
  }

  /**
   * Generate final report
   */
  generateReport(): void {
    console.log('\n\n');
    console.log('═'.repeat(80));
    console.log('📊 BENCHMARK SUMMARY REPORT');
    console.log('═'.repeat(80));

    // Group results by category
    const categories: { [key: string]: BenchmarkResult[] } = {};

    this.results.forEach(result => {
      const category = result.name.includes('Create') ? 'Creation' :
                      result.name.includes('Query') ? 'Queries' :
                      result.name.includes('Traverse') || result.name.includes('path') ? 'Traversal' :
                      result.name.includes('Transaction') ? 'Transactions' :
                      result.name.includes('Update') ? 'Updates' :
                      result.name.includes('Delete') ? 'Deletes' :
                      result.name.includes('scenario') ? 'Real-World' : 'Other';

      if (!categories[category]) categories[category] = [];
      categories[category].push(result);
    });

    // Print summary table
    console.log('\n🏆 Top Performers (Operations/Second):\n');

    const sorted = [...this.results].sort((a, b) => b.opsPerSec - a.opsPerSec);
    sorted.slice(0, 10).forEach((result, i) => {
      const opsStr = result.opsPerSec.toFixed(0).padStart(10);
      const avgStr = this.formatTime(result.avgTime).padStart(10);
      console.log(`  ${(i + 1).toString().padStart(2)}. ${result.name.padEnd(45)} ${opsStr} ops/s (${avgStr})`);
    });

    console.log('\n📈 Performance Categories:\n');
    Object.entries(categories).forEach(([category, results]) => {
      const avgOpsPerSec = results.reduce((sum, r) => sum + r.opsPerSec, 0) / results.length;
      const avgTime = results.reduce((sum, r) => sum + r.avgTime, 0) / results.length;

      console.log(`  ${category.padEnd(20)} Avg: ${this.formatTime(avgTime).padStart(10)} | ${avgOpsPerSec.toFixed(0).padStart(10)} ops/s`);
    });

    console.log('\n✅ Performance Goals:');
    console.log('  ✓ Simple queries: <10ms           ', this.checkGoal('Query', 10));
    console.log('  ✓ Graph traversal: <50ms          ', this.checkGoal('Traverse', 50));
    console.log('  ✓ Node creation: <1ms             ', this.checkGoal('Create single', 1));

    console.log('\n💾 Database Information:');
    if (fs.existsSync(BENCHMARK_DB)) {
      const stats = fs.statSync(BENCHMARK_DB);
      console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`Total benchmarks: ${this.results.length}`);
    console.log(`Total operations tested: ${this.results.reduce((sum, r) => sum + r.operations, 0).toLocaleString()}`);
    console.log('═'.repeat(80) + '\n');
  }

  /**
   * Check if a benchmark meets a performance goal
   */
  private checkGoal(namePattern: string, targetMs: number): string {
    const result = this.results.find(r => r.name.includes(namePattern));
    if (!result) return '⚠️  Not tested';

    if (result.avgTime <= targetMs) {
      return `✅ PASS (${this.formatTime(result.avgTime)})`;
    } else {
      return `❌ FAIL (${this.formatTime(result.avgTime)})`;
    }
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<void> {
    console.log('\n🚀 sqlite-graph Comprehensive Benchmark Suite\n');
    console.log('═'.repeat(80));
    console.log('Running performance benchmarks...');
    console.log('═'.repeat(80));

    // Clean up any existing benchmark database
    if (fs.existsSync(BENCHMARK_DB)) {
      fs.unlinkSync(BENCHMARK_DB);
    }

    const db = new GraphDatabase(BENCHMARK_DB);

    try {
      this.benchmarkNodeCreation(db);
      this.benchmarkEdgeCreation(db);
      this.benchmarkUpdates(db);
      this.benchmarkDeletes(db);
      this.benchmarkTransactions(db);

      // Query benchmarks with different dataset sizes
      this.benchmarkNodeQueries(db, DATASET_SIZES.SMALL);

      this.benchmarkTraversal(db);
      this.benchmarkRealWorld(db);

      this.generateReport();

    } finally {
      db.close();

      // Cleanup
      if (fs.existsSync(BENCHMARK_DB)) {
        fs.unlinkSync(BENCHMARK_DB);
      }
    }
  }
}

// Run benchmarks
const suite = new BenchmarkSuite();
suite.runAll().catch(console.error);
