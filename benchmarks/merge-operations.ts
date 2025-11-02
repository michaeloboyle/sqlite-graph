/**
 * Benchmark suite for merge operations (MERGE-style upserts)
 *
 * Tests performance of:
 * - mergeNode() with and without indexes
 * - mergeEdge() operations
 * - Index creation and management
 * - Conflict detection on large datasets
 */

import { GraphDatabase } from '../src/core/Database';
import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';

interface BenchmarkResult {
  name: string;
  description: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  opsPerSec: number;
  minTimeMs: number;
  maxTimeMs: number;
}

const ITERATIONS = 1000;
const WARMUP_ITERATIONS = 100;

function benchmark(name: string, description: string, fn: () => void, iterations = ITERATIONS): BenchmarkResult {
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    fn();
  }

  // Actual benchmark
  const times: number[] = [];
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const iterStart = performance.now();
    fn();
    const iterEnd = performance.now();
    times.push(iterEnd - iterStart);
  }

  const end = performance.now();
  const totalTimeMs = end - start;
  const avgTimeMs = totalTimeMs / iterations;
  const opsPerSec = 1000 / avgTimeMs;

  return {
    name,
    description,
    iterations,
    totalTimeMs,
    avgTimeMs,
    opsPerSec,
    minTimeMs: Math.min(...times),
    maxTimeMs: Math.max(...times)
  };
}

function formatResult(result: BenchmarkResult): string {
  return [
    `\n${result.name}`,
    `  Description: ${result.description}`,
    `  Iterations: ${result.iterations}`,
    `  Total time: ${result.totalTimeMs.toFixed(2)}ms`,
    `  Average: ${result.avgTimeMs.toFixed(4)}ms`,
    `  Ops/sec: ${result.opsPerSec.toFixed(2)}`,
    `  Min: ${result.minTimeMs.toFixed(4)}ms`,
    `  Max: ${result.maxTimeMs.toFixed(4)}ms`
  ].join('\n');
}

function runBenchmarks() {
  // Suppress console.warn during benchmarks to avoid spam
  const originalWarn = console.warn;
  console.warn = () => {};

  console.log('='.repeat(80));
  console.log('Merge Operations Benchmark Suite');
  console.log('='.repeat(80));

  const results: BenchmarkResult[] = [];

  // Benchmark 1: mergeNode CREATE (no existing node)
  {
    let counter = 0;
    const db = new GraphDatabase(':memory:');

    const result = benchmark(
      'mergeNode - CREATE new nodes',
      'Creating new nodes via merge (no match found)',
      () => {
        db.mergeNode('Job', { url: `https://example.com/job/${counter++}` } as any, { title: 'Engineer' } as any);
      }
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 2: mergeNode MATCH (existing node, no index)
  {
    const db = new GraphDatabase(':memory:');
    const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/job/${i}`);

    // Pre-populate database
    urls.forEach(url => {
      db.createNode('Job', { url, title: 'Engineer', status: 'active' });
    });

    let counter = 0;
    const result = benchmark(
      'mergeNode - MATCH existing (no index)',
      'Matching existing nodes without property index (full table scan)',
      () => {
        const url = urls[counter % urls.length];
        db.mergeNode('Job', { url } as any, undefined, { onMatch: { lastSeen: Date.now() } as any });
        counter++;
      }
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 3: mergeNode MATCH (existing node, with index)
  {
    const db = new GraphDatabase(':memory:');
    const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/job/${i}`);

    // Pre-populate database
    urls.forEach(url => {
      db.createNode('Job', { url, title: 'Engineer', status: 'active' });
    });

    // Create index
    db.createPropertyIndex('Job', 'url');

    let counter = 0;
    const result = benchmark(
      'mergeNode - MATCH existing (with index)',
      'Matching existing nodes with property index (indexed lookup)',
      () => {
        const url = urls[counter % urls.length];
        db.mergeNode('Job', { url } as any, undefined, { onMatch: { lastSeen: Date.now() } as any });
        counter++;
      }
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 4: mergeNode with onCreate properties
  {
    let counter = 0;
    const db = new GraphDatabase(':memory:');

    const result = benchmark(
      'mergeNode - CREATE with onCreate',
      'Creating nodes with onCreate properties',
      () => {
        db.mergeNode(
          'Job',
          { url: `https://example.com/job/${counter++}` } as any,
          { title: 'Engineer' } as any,
          { onCreate: { discovered: Date.now(), status: 'new' } as any }
        );
      }
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 5: mergeNode with onMatch properties
  {
    const db = new GraphDatabase(':memory:');
    db.createPropertyIndex('Job', 'url');

    // Pre-create a single node
    db.createNode('Job', { url: 'https://example.com/job/1', title: 'Engineer' });

    const result = benchmark(
      'mergeNode - MATCH with onMatch',
      'Updating existing node with onMatch properties',
      () => {
        db.mergeNode(
          'Job',
          { url: 'https://example.com/job/1' } as any,
          undefined,
          { onMatch: { lastSeen: Date.now(), viewCount: Math.random() } as any }
        );
      }
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 6: mergeEdge CREATE
  {
    const db = new GraphDatabase(':memory:');
    const jobId = db.createNode('Job', { title: 'Engineer' }).id;
    const companyIds = Array.from({ length: 100 }, (_, i) =>
      db.createNode('Company', { name: `Company${i}` }).id
    );

    let counter = 0;
    const result = benchmark(
      'mergeEdge - CREATE new edges',
      'Creating new edges via merge',
      () => {
        const companyId = companyIds[counter % companyIds.length];
        db.mergeEdge(jobId, 'POSTED_BY', companyId, { source: 'scraper' } as any);
        counter++;
      }
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 7: mergeEdge MATCH
  {
    const db = new GraphDatabase(':memory:');
    const jobId = db.createNode('Job', { title: 'Engineer' }).id;
    const companyId = db.createNode('Company', { name: 'TechCorp' }).id;

    // Pre-create edge
    db.createEdge(jobId, 'POSTED_BY', companyId, { status: 'draft' });

    const result = benchmark(
      'mergeEdge - MATCH existing',
      'Matching and updating existing edges',
      () => {
        db.mergeEdge(
          jobId,
          'POSTED_BY',
          companyId,
          undefined,
          { onMatch: { updated: Date.now(), status: 'published' } as any }
        );
      }
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 8: Index creation
  {
    const db = new GraphDatabase(':memory:');

    // Pre-populate with nodes
    for (let i = 0; i < 1000; i++) {
      db.createNode('Job', { url: `https://example.com/job/${i}`, title: 'Engineer', priority: i });
    }

    let counter = 0;
    const result = benchmark(
      'createPropertyIndex',
      'Creating property index on existing data (1000 nodes)',
      () => {
        db.createPropertyIndex('Job', `prop${counter++}`);
      },
      10 // Fewer iterations for index creation
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 9: Large dataset merge without index
  {
    const db = new GraphDatabase(':memory:');

    // Pre-populate with 1000 nodes
    for (let i = 0; i < 1000; i++) {
      db.createNode('Job', { url: `https://example.com/job/${i}`, title: 'Engineer' });
    }

    let counter = 0;
    const result = benchmark(
      'mergeNode - Large dataset (no index)',
      'Merge on 1000-node dataset without index',
      () => {
        db.mergeNode('Job', { url: `https://example.com/job/${counter % 1000}` } as any);
        counter++;
      },
      100 // Fewer iterations for large dataset
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Benchmark 10: Large dataset merge with index
  {
    const db = new GraphDatabase(':memory:');

    // Pre-populate with 1000 nodes
    for (let i = 0; i < 1000; i++) {
      db.createNode('Job', { url: `https://example.com/job/${i}`, title: 'Engineer' });
    }

    // Create index
    db.createPropertyIndex('Job', 'url');

    let counter = 0;
    const result = benchmark(
      'mergeNode - Large dataset (with index)',
      'Merge on 1000-node dataset with index',
      () => {
        db.mergeNode('Job', { url: `https://example.com/job/${counter % 1000}` } as any);
        counter++;
      },
      100 // Fewer iterations for large dataset
    );

    results.push(result);
    console.log(formatResult(result));
    db.close();
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));

  const sortedResults = [...results].sort((a, b) => b.opsPerSec - a.opsPerSec);

  console.log('\nTop 5 Fastest Operations:');
  sortedResults.slice(0, 5).forEach((result, index) => {
    console.log(`  ${index + 1}. ${result.name}: ${result.opsPerSec.toFixed(2)} ops/sec`);
  });

  console.log('\nIndex Impact Analysis:');
  const noIndexResult = results.find(r => r.name === 'mergeNode - Large dataset (no index)');
  const withIndexResult = results.find(r => r.name === 'mergeNode - Large dataset (with index)');

  if (noIndexResult && withIndexResult) {
    const speedup = withIndexResult.opsPerSec / noIndexResult.opsPerSec;
    console.log(`  Without index: ${noIndexResult.opsPerSec.toFixed(2)} ops/sec`);
    console.log(`  With index: ${withIndexResult.opsPerSec.toFixed(2)} ops/sec`);
    console.log(`  Speedup: ${speedup.toFixed(2)}x faster with index`);
  }

  // Save results to JSON
  const outputPath = path.join(__dirname, 'results', 'merge-operations.json');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(
    outputPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      results
    }, null, 2)
  );

  console.log(`\nResults saved to: ${outputPath}`);

  // Restore console.warn
  console.warn = originalWarn;
}

// Run benchmarks
runBenchmarks();
