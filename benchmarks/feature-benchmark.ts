/**
 * Feature-Specific Benchmark Suite for sqlite-graph
 *
 * Tests performance of recently added features:
 * - MERGE operations (mergeNode, mergeEdge with ON CREATE/ON MATCH)
 * - Bidirectional queries (both() direction)
 * - Path finding (paths(), shortestPath(), allPaths())
 * - Property indexes (createPropertyIndex with unique constraints)
 *
 * Run with: npx ts-node benchmarks/feature-benchmark.ts
 */

import { GraphDatabase } from '../src/index';
import type { Node } from '../src/types';
import * as fs from 'fs';

// Benchmark configuration
const BENCHMARK_DB = './feature-benchmark.db';
const ITERATIONS = 100;
const WARMUP = 10;

interface BenchmarkResult {
  name: string;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSec: number;
  operations: number;
}

class FeatureBenchmarkSuite {
  private results: BenchmarkResult[] = [];

  private formatTime(ms: number): string {
    if (ms < 1) return `${(ms * 1000).toFixed(2)}µs`;
    if (ms < 1000) return `${ms.toFixed(2)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  private benchmark(
    name: string,
    fn: () => void,
    iterations: number = ITERATIONS,
    warmup: number = WARMUP
  ): BenchmarkResult {
    // Warmup
    for (let i = 0; i < warmup; i++) {
      fn();
    }

    // Benchmark
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
      avgTime,
      minTime,
      maxTime,
      opsPerSec,
      operations: iterations
    };

    this.results.push(result);
    return result;
  }

  private printResult(result: BenchmarkResult): void {
    const nameWidth = 50;
    const name = result.name.padEnd(nameWidth);
    const avg = this.formatTime(result.avgTime).padStart(10);
    const ops = result.opsPerSec.toFixed(0).padStart(8);
    console.log(`  ${name} ${avg}  ${ops} ops/s`);
  }

  private printSection(title: string): void {
    console.log('\n' + '='.repeat(80));
    console.log(`  ${title}`);
    console.log('='.repeat(80));
  }

  /**
   * Benchmark: Property Index Operations
   */
  benchmarkPropertyIndexes(db: GraphDatabase): void {
    this.printSection('Property Index Benchmarks');

    // Create index
    db.createPropertyIndex('Job', 'url', true);
    db.createPropertyIndex('Company', 'name');
    db.createPropertyIndex('Skill', 'name', true);

    // Setup: Create nodes with indexed properties
    db.transaction(() => {
      for (let i = 0; i < 100; i++) {
        db.createNode('Job', {
          url: `https://example.com/job/${i}`,
          title: `Job ${i}`,
          status: 'active'
        });
      }
    });

    this.benchmark('Query with indexed property (unique)', () => {
      db.nodes('Job')
        .where({ url: 'https://example.com/job/50' })
        .first();
    });

    this.benchmark('Query without index', () => {
      db.nodes('Job')
        .where({ status: 'active' })
        .limit(10)
        .exec();
    });

    // Create more companies for non-unique index test
    db.transaction(() => {
      for (let i = 0; i < 100; i++) {
        db.createNode('Company', {
          name: `Company ${i % 10}`, // 10 unique names
          industry: 'Tech'
        });
      }
    });

    this.benchmark('Query with indexed property (non-unique)', () => {
      db.nodes('Company')
        .where({ name: 'Company 5' })
        .exec();
    });

    this.results.slice(-3).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: MERGE Operations (Node)
   */
  benchmarkMergeNodes(db: GraphDatabase): void {
    this.printSection('MERGE Node Operations');

    // Ensure indexes exist
    db.createPropertyIndex('Job', 'url', true);
    db.createPropertyIndex('Company', 'name');

    // Benchmark: mergeNode CREATE path
    this.benchmark('mergeNode() - CREATE (new node)', () => {
      const id = Math.random().toString();
      db.mergeNode(
        'Job',
        { url: `https://example.com/${id}` },
        {
          url: `https://example.com/${id}`,
          title: 'Test Job',
          status: 'active'
        }
      );
    });

    // Setup: Create base job for MATCH tests
    const baseJob = db.mergeNode(
      'Job',
      { url: 'https://example.com/base-job' },
      {
        url: 'https://example.com/base-job',
        title: 'Base Job',
        status: 'active'
      }
    );

    // Benchmark: mergeNode MATCH path
    this.benchmark('mergeNode() - MATCH (existing node)', () => {
      db.mergeNode(
        'Job',
        { url: 'https://example.com/base-job' },
        {
          url: 'https://example.com/base-job',
          title: 'Base Job',
          status: 'active'
        }
      );
    });

    // Benchmark: mergeNode with ON CREATE
    this.benchmark('mergeNode() - with ON CREATE', () => {
      const id = Math.random().toString();
      db.mergeNode(
        'Job',
        { url: `https://example.com/${id}` },
        {
          url: `https://example.com/${id}`,
          title: 'Test Job'
        },
        {
          onCreate: {
            discoveredAt: new Date().toISOString(),
            viewCount: 0
          }
        }
      );
    });

    // Benchmark: mergeNode with ON MATCH
    this.benchmark('mergeNode() - with ON MATCH', () => {
      db.mergeNode(
        'Job',
        { url: 'https://example.com/base-job' },
        undefined,
        {
          onMatch: {
            lastSeenAt: new Date().toISOString(),
            viewCount: Math.floor(Math.random() * 100)
          }
        }
      );
    });

    // Benchmark: mergeNode vs manual pattern
    const manualStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const url = `https://example.com/manual-${i % 10}`;
      const existing = db.nodes('Job').where({ url }).first();
      if (existing) {
        db.updateNode(existing.id, { updatedAt: new Date().toISOString() });
      } else {
        db.createNode('Job', { url, title: 'Manual Job' });
      }
    }
    const manualTime = (performance.now() - manualStart) / ITERATIONS;

    const mergeStart = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      const url = `https://example.com/merge-${i % 10}`;
      db.mergeNode(
        'Job',
        { url },
        { url, title: 'Merge Job' },
        { onMatch: { updatedAt: new Date().toISOString() }, warnOnMissingIndex: false }
      );
    }
    const mergeTime = (performance.now() - mergeStart) / ITERATIONS;

    console.log(`\n  📊 MERGE vs Manual Comparison:`);
    console.log(`     Manual pattern: ${this.formatTime(manualTime)}`);
    console.log(`     MERGE pattern:  ${this.formatTime(mergeTime)}`);
    console.log(`     Speedup:        ${(manualTime / mergeTime).toFixed(2)}x\n`);

    this.results.slice(-4).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: MERGE Operations (Edge)
   */
  benchmarkMergeEdges(db: GraphDatabase): void {
    this.printSection('MERGE Edge Operations');

    // Setup: Create nodes
    const job1 = db.createNode('Job', { title: 'Job 1' });
    const job2 = db.createNode('Job', { title: 'Job 2' });
    const company1 = db.createNode('Company', { name: 'Company 1' });
    const company2 = db.createNode('Company', { name: 'Company 2' });

    // Benchmark: mergeEdge CREATE
    this.benchmark('mergeEdge() - CREATE (new edge)', () => {
      const tempJob = db.createNode('Job', { title: 'Temp' });
      const tempCompany = db.createNode('Company', { name: 'Temp' });
      db.mergeEdge(tempJob.id, 'POSTED_BY', tempCompany.id, {
        source: 'api'
      });
      db.deleteNode(tempJob.id);
      db.deleteNode(tempCompany.id);
    });

    // Create base edge for MATCH tests
    db.mergeEdge(job1.id, 'POSTED_BY', company1.id, { source: 'web' });

    // Benchmark: mergeEdge MATCH
    this.benchmark('mergeEdge() - MATCH (existing edge)', () => {
      db.mergeEdge(job1.id, 'POSTED_BY', company1.id, { source: 'web' });
    });

    // Benchmark: mergeEdge with ON CREATE/ON MATCH
    this.benchmark('mergeEdge() - with ON CREATE', () => {
      const tempJob = db.createNode('Job', { title: 'Temp2' });
      db.mergeEdge(
        tempJob.id,
        'POSTED_BY',
        company2.id,
        { source: 'api' },
        {
          onCreate: { firstSeenAt: new Date().toISOString() }
        }
      );
      db.deleteNode(tempJob.id);
    });

    this.benchmark('mergeEdge() - with ON MATCH', () => {
      db.mergeEdge(
        job1.id,
        'POSTED_BY',
        company1.id,
        undefined,
        {
          onMatch: { lastVerifiedAt: new Date().toISOString() }
        }
      );
    });

    this.results.slice(-4).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Bidirectional Queries
   */
  benchmarkBidirectionalQueries(db: GraphDatabase): void {
    this.printSection('Bidirectional Query Benchmarks');

    // Setup: Create bidirectional graph
    const nodes: Node[] = [];
    db.transaction(() => {
      for (let i = 0; i < 50; i++) {
        nodes.push(db.createNode('Person', { name: `Person ${i}` }));
      }

      // Create various edge types
      for (let i = 0; i < 49; i++) {
        db.createEdge(nodes[i].id, 'KNOWS', nodes[i + 1].id);
        if (i % 2 === 0) {
          db.createEdge(nodes[i + 1].id, 'KNOWS', nodes[i].id); // Reverse
        }
      }
    });

    // Benchmark: out() direction
    this.benchmark('Query - out() direction only', () => {
      db.nodes('Person')
        .connectedTo('Person', 'KNOWS', 'out')
        .exec();
    }, 50, 5);

    // Benchmark: in() direction
    this.benchmark('Query - in() direction only', () => {
      db.nodes('Person')
        .connectedTo('Person', 'KNOWS', 'in')
        .exec();
    }, 50, 5);

    // Benchmark: both() direction
    this.benchmark('Query - both() direction', () => {
      db.nodes('Person')
        .connectedTo('Person', 'KNOWS', 'both')
        .exec();
    }, 50, 5);

    // Benchmark: Traversal both() vs separate out/in
    const bothStart = performance.now();
    for (let i = 0; i < 50; i++) {
      db.traverse(nodes[25].id)
        .both('KNOWS')
        .maxDepth(2)
        .toArray();
    }
    const bothTime = (performance.now() - bothStart) / 50;

    const separateStart = performance.now();
    for (let i = 0; i < 50; i++) {
      const outNodes = db.traverse(nodes[25].id).out('KNOWS').maxDepth(2).toArray();
      const inNodes = db.traverse(nodes[25].id).in('KNOWS').maxDepth(2).toArray();
      // Merge results (simplified)
      [...outNodes, ...inNodes];
    }
    const separateTime = (performance.now() - separateStart) / 50;

    console.log(`\n  📊 both() vs Separate Queries:`);
    console.log(`     both() method:      ${this.formatTime(bothTime)}`);
    console.log(`     Separate queries:   ${this.formatTime(separateTime)}`);
    console.log(`     Efficiency gain:    ${(separateTime / bothTime).toFixed(2)}x\n`);

    this.results.slice(-3).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Path Finding Operations
   */
  benchmarkPathFinding(db: GraphDatabase): void {
    this.printSection('Path Finding Benchmarks');

    // Setup: Create complex graph with multiple paths
    const nodes: Node[] = [];
    db.transaction(() => {
      // Create grid-like structure (10x10)
      for (let i = 0; i < 100; i++) {
        nodes.push(db.createNode('Node', { id: i, x: i % 10, y: Math.floor(i / 10) }));
      }

      // Create edges: horizontal and vertical connections
      for (let i = 0; i < 100; i++) {
        const x = i % 10;
        const y = Math.floor(i / 10);

        // Right
        if (x < 9) {
          db.createEdge(nodes[i].id, 'CONNECTS', nodes[i + 1].id);
        }

        // Down
        if (y < 9) {
          db.createEdge(nodes[i].id, 'CONNECTS', nodes[i + 10].id);
        }

        // Add some diagonal shortcuts
        if (x < 9 && y < 9 && i % 3 === 0) {
          db.createEdge(nodes[i].id, 'CONNECTS', nodes[i + 11].id);
        }
      }
    });

    // Benchmark: shortestPath (short distance)
    this.benchmark('shortestPath() - short (5 hops)', () => {
      db.traverse(nodes[0].id).shortestPath(nodes[5].id);
    }, 50, 5);

    // Benchmark: shortestPath (medium distance)
    this.benchmark('shortestPath() - medium (25 hops)', () => {
      db.traverse(nodes[0].id).shortestPath(nodes[25].id);
    }, 30, 5);

    // Benchmark: shortestPath (long distance)
    this.benchmark('shortestPath() - long (99 hops)', () => {
      db.traverse(nodes[0].id).shortestPath(nodes[99].id);
    }, 20, 5);

    // Benchmark: paths() with maxDepth
    this.benchmark('paths() - maxDepth 3', () => {
      db.traverse(nodes[0].id).paths(nodes[3].id, { maxDepth: 3 });
    }, 30, 5);

    this.benchmark('paths() - maxDepth 5', () => {
      db.traverse(nodes[0].id).paths(nodes[5].id, { maxDepth: 5 });
    }, 20, 5);

    // Benchmark: paths() with maxPaths limit
    this.benchmark('paths() - maxPaths 10', () => {
      db.traverse(nodes[0].id).paths(nodes[22].id, { maxPaths: 10 });
    }, 20, 5);

    this.benchmark('paths() - maxPaths 100', () => {
      db.traverse(nodes[0].id).paths(nodes[22].id, { maxPaths: 100 });
    }, 10, 3);

    // Benchmark: allPaths (unlimited)
    this.benchmark('allPaths() - small graph subset', () => {
      db.traverse(nodes[0].id).paths(nodes[11].id, { maxDepth: 4 });
    }, 10, 3);

    this.results.slice(-8).forEach(r => this.printResult(r));
  }

  /**
   * Benchmark: Complex Feature Combinations
   */
  benchmarkFeatureCombinations(db: GraphDatabase): void {
    this.printSection('Feature Combination Benchmarks');

    // Setup: Job search graph with merge + indexes
    db.createPropertyIndex('Job', 'url', true);
    db.createPropertyIndex('Company', 'name');
    db.createPropertyIndex('Skill', 'name', true);

    // Benchmark: Merge + Index + Bidirectional query
    this.benchmark('Complex: Merge + Index + both() query', () => {
      const jobUrl = `https://example.com/job/${Math.floor(Math.random() * 100)}`;

      // Merge job
      const job = db.mergeNode(
        'Job',
        { url: jobUrl },
        { url: jobUrl, title: 'Engineer' },
        {
          onCreate: { discoveredAt: new Date().toISOString() },
          onMatch: { lastSeenAt: new Date().toISOString() }
        }
      );

      // Merge company
      const company = db.mergeNode(
        'Company',
        { name: 'TechCorp' },
        { name: 'TechCorp', industry: 'Software' }
      );

      // Merge relationship
      db.mergeEdge(job.node.id, 'POSTED_BY', company.node.id);

      // Query similar jobs (bidirectional)
      db.nodes('Job')
        .connectedTo('Company', 'POSTED_BY', 'both')
        .limit(10)
        .exec();
    }, 30, 5);

    // Benchmark: Merge + Path finding
    this.benchmark('Complex: Merge + shortestPath()', () => {
      // Create or find skill nodes
      const ts = db.mergeNode('Skill', { name: 'TypeScript' }, { name: 'TypeScript' });
      const react = db.mergeNode('Skill', { name: 'React' }, { name: 'React' });

      // Find connection path
      db.traverse(ts.node.id).shortestPath(react.node.id);
    }, 30, 5);

    // Benchmark: Real-world ETL scenario
    this.benchmark('Real-world: Daily job scraper (merge-based ETL)', () => {
      db.transaction(() => {
        // Simulate 10 scraped jobs
        for (let i = 0; i < 10; i++) {
          const jobUrl = `https://example.com/scraped/${i}`;
          const companyName = `Company ${i % 3}`;

          // Merge company
          const company = db.mergeNode(
            'Company',
            { name: companyName },
            { name: companyName }
          );

          // Merge job with tracking
          const job = db.mergeNode(
            'Job',
            { url: jobUrl },
            { url: jobUrl, title: `Job ${i}` },
            {
              onCreate: {
                discoveredAt: new Date().toISOString(),
                applicationStatus: 'not_applied'
              },
              onMatch: {
                lastSeenAt: new Date().toISOString(),
                status: 'active'
              },
              warnOnMissingIndex: false
            }
          );

          // Merge relationship
          db.mergeEdge(job.node.id, 'POSTED_BY', company.node.id);
        }
      });
    }, 20, 5);

    this.results.slice(-3).forEach(r => this.printResult(r));
  }

  /**
   * Generate final report
   */
  generateReport(): void {
    console.log('\n\n');
    console.log('═'.repeat(80));
    console.log('  📊 FEATURE BENCHMARK SUMMARY');
    console.log('═'.repeat(80));

    // Group by category
    const categories: { [key: string]: BenchmarkResult[] } = {
      'Property Indexes': [],
      'MERGE Operations': [],
      'Bidirectional Queries': [],
      'Path Finding': [],
      'Feature Combinations': []
    };

    this.results.forEach(result => {
      if (result.name.includes('index') || result.name.includes('indexed')) {
        categories['Property Indexes'].push(result);
      } else if (result.name.includes('merge')) {
        categories['MERGE Operations'].push(result);
      } else if (result.name.includes('both()') || result.name.includes('direction')) {
        categories['Bidirectional Queries'].push(result);
      } else if (result.name.includes('Path') || result.name.includes('path')) {
        categories['Path Finding'].push(result);
      } else if (result.name.includes('Complex') || result.name.includes('Real-world')) {
        categories['Feature Combinations'].push(result);
      }
    });

    // Print category summaries
    console.log('\n📈 Category Performance:\n');
    Object.entries(categories).forEach(([category, results]) => {
      if (results.length === 0) return;

      const avgTime = results.reduce((sum, r) => sum + r.avgTime, 0) / results.length;
      const avgOps = results.reduce((sum, r) => sum + r.opsPerSec, 0) / results.length;

      console.log(`  ${category.padEnd(25)} ${this.formatTime(avgTime).padStart(10)}  ${avgOps.toFixed(0).padStart(8)} ops/s`);
    });

    // Top performers
    console.log('\n🏆 Top 5 Performers:\n');
    const sorted = [...this.results].sort((a, b) => b.opsPerSec - a.opsPerSec);
    sorted.slice(0, 5).forEach((result, i) => {
      console.log(`  ${(i + 1)}. ${result.name.padEnd(50)} ${this.formatTime(result.avgTime).padStart(10)}`);
    });

    // Feature highlights
    console.log('\n✨ Feature Highlights:\n');

    const mergeCreate = this.results.find(r => r.name.includes('mergeNode() - CREATE'));
    const mergeMatch = this.results.find(r => r.name.includes('mergeNode() - MATCH'));
    if (mergeCreate && mergeMatch) {
      console.log(`  MERGE CREATE: ${this.formatTime(mergeCreate.avgTime)} (${mergeCreate.opsPerSec.toFixed(0)} ops/s)`);
      console.log(`  MERGE MATCH:  ${this.formatTime(mergeMatch.avgTime)} (${mergeMatch.opsPerSec.toFixed(0)} ops/s)`);
      console.log(`  Match speedup: ${(mergeCreate.avgTime / mergeMatch.avgTime).toFixed(2)}x faster`);
    }

    const shortPath = this.results.find(r => r.name.includes('shortestPath() - short'));
    const longPath = this.results.find(r => r.name.includes('shortestPath() - long'));
    if (shortPath && longPath) {
      console.log(`\n  Shortest Path (5 hops):  ${this.formatTime(shortPath.avgTime)}`);
      console.log(`  Shortest Path (99 hops): ${this.formatTime(longPath.avgTime)}`);
      console.log(`  Complexity scaling: ${(longPath.avgTime / shortPath.avgTime).toFixed(2)}x for ${99/5}x distance`);
    }

    console.log('\n✅ Performance Goals:\n');
    console.log(`  ✓ MERGE operations: <5ms         ${this.checkGoal('mergeNode', 5)}`);
    console.log(`  ✓ Index queries: <1ms            ${this.checkGoal('indexed property', 1)}`);
    console.log(`  ✓ Shortest path: <10ms           ${this.checkGoal('shortestPath() - short', 10)}`);
    console.log(`  ✓ Bidirectional: <20ms           ${this.checkGoal('both()', 20)}`);

    console.log('\n' + '═'.repeat(80));
    console.log(`  Total Benchmarks: ${this.results.length}`);
    console.log(`  Total Operations: ${this.results.reduce((sum, r) => sum + r.operations, 0).toLocaleString()}`);
    console.log('═'.repeat(80) + '\n');
  }

  private checkGoal(namePattern: string, targetMs: number): string {
    const result = this.results.find(r => r.name.includes(namePattern));
    if (!result) return '⚠️  Not tested';

    if (result.avgTime <= targetMs) {
      return `✅ ${this.formatTime(result.avgTime)}`;
    } else {
      return `❌ ${this.formatTime(result.avgTime)}`;
    }
  }

  /**
   * Run all feature benchmarks
   */
  async runAll(): Promise<void> {
    console.log('\n🚀 sqlite-graph Feature Benchmark Suite\n');
    console.log('Testing: MERGE, Indexes, Bidirectional, Path Finding\n');

    // Cleanup
    if (fs.existsSync(BENCHMARK_DB)) {
      fs.unlinkSync(BENCHMARK_DB);
    }

    const db = new GraphDatabase(BENCHMARK_DB);

    try {
      this.benchmarkPropertyIndexes(db);
      this.benchmarkMergeNodes(db);
      this.benchmarkMergeEdges(db);
      this.benchmarkBidirectionalQueries(db);
      this.benchmarkPathFinding(db);
      this.benchmarkFeatureCombinations(db);

      this.generateReport();

    } finally {
      db.close();

      if (fs.existsSync(BENCHMARK_DB)) {
        fs.unlinkSync(BENCHMARK_DB);
      }
    }
  }
}

// Run benchmarks
const suite = new FeatureBenchmarkSuite();
suite.runAll().catch(console.error);
