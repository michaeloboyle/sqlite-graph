/**
 * Graph Traversal Example
 *
 * This example demonstrates advanced graph traversal patterns:
 * - Outgoing/incoming/bidirectional traversals
 * - Depth-limited searches
 * - Shortest path finding
 * - Finding all paths between nodes
 * - Path filtering and unique node handling
 *
 * Run with: npx ts-node examples/graph-traversal.ts
 */

import { GraphDatabase } from '../src/index';

const db = new GraphDatabase(':memory:');

console.log('=== Graph Traversal Example ===\n');

// Build a sample graph: job recommendation network
console.log('1. Building job similarity network...');

// Create jobs
const job1 = db.createNode('Job', { title: 'Senior TypeScript Engineer', company: 'TechCorp' });
const job2 = db.createNode('Job', { title: 'Full Stack Developer', company: 'StartupInc' });
const job3 = db.createNode('Job', { title: 'Backend Engineer', company: 'BigCo' });
const job4 = db.createNode('Job', { title: 'Frontend Specialist', company: 'DesignHub' });
const job5 = db.createNode('Job', { title: 'TypeScript Consultant', company: 'ConsultCo' });
const job6 = db.createNode('Job', { title: 'Senior Backend Engineer', company: 'DataCorp' });

// Create similarity relationships (jobs similar to each other)
db.createEdge('SIMILAR_TO', job1.id, job2.id);
db.createEdge('SIMILAR_TO', job1.id, job5.id);
db.createEdge('SIMILAR_TO', job2.id, job3.id);
db.createEdge('SIMILAR_TO', job2.id, job4.id);
db.createEdge('SIMILAR_TO', job3.id, job6.id);
db.createEdge('SIMILAR_TO', job5.id, job6.id);

// Create companies
const techCorp = db.createNode('Company', { name: 'TechCorp', industry: 'Tech' });
const startupInc = db.createNode('Company', { name: 'StartupInc', industry: 'Tech' });

// Link jobs to companies
db.createEdge('POSTED_BY', job1.id, techCorp.id);
db.createEdge('POSTED_BY', job2.id, startupInc.id);

console.log('Created 6 jobs with similarity relationships\n');

// 2. Basic Outgoing Traversal
console.log('2. Finding similar jobs (1 hop)...');
const similarJobsDirect = db.traverse(job1.id)
  .out('SIMILAR_TO')
  .toArray();

console.log(`Jobs similar to "${job1.properties.title}":`);
similarJobsDirect.forEach(job => {
  console.log(`  - ${job.properties.title} (${job.properties.company})`);
});
console.log();

// 3. Multi-hop Traversal with Depth Limit
console.log('3. Finding similar jobs (up to 2 hops)...');
const similarJobsDeep = db.traverse(job1.id)
  .out('SIMILAR_TO')
  .maxDepth(2)
  .unique() // Avoid duplicates
  .toArray();

console.log(`Jobs similar within 2 hops of "${job1.properties.title}":`);
similarJobsDeep.forEach(job => {
  console.log(`  - ${job.properties.title} (${job.properties.company})`);
});
console.log();

// 4. Incoming Edge Traversal
console.log('4. Finding which jobs reference this company...');
const jobsFromCompany = db.traverse(techCorp.id)
  .in('POSTED_BY', 'Job')
  .toArray();

console.log(`Jobs posted by "${techCorp.properties.name}":`);
jobsFromCompany.forEach(job => {
  console.log(`  - ${job.properties.title}`);
});
console.log();

// 5. Bidirectional Traversal
console.log('5. Bidirectional traversal (SIMILAR_TO in both directions)...');
const job7 = db.createNode('Job', { title: 'DevOps Engineer', company: 'CloudCo' });
db.createEdge('SIMILAR_TO', job1.id, job7.id);
db.createEdge('SIMILAR_TO', job7.id, job3.id);

const bidirectionalSimilar = db.traverse(job2.id)
  .both('SIMILAR_TO')
  .maxDepth(1)
  .toArray();

console.log(`Jobs connected via SIMILAR_TO (both directions):`);
bidirectionalSimilar.forEach(job => {
  console.log(`  - ${job.properties.title}`);
});
console.log();

// 6. Shortest Path Finding
console.log('6. Finding shortest path between jobs...');
const shortestPath = db.traverse(job1.id)
  .out('SIMILAR_TO')
  .shortestPath(job6.id);

if (shortestPath) {
  console.log('Shortest path:');
  shortestPath.forEach((node, idx) => {
    console.log(`  ${idx + 1}. ${node.properties.title}`);
  });
  console.log(`Path length: ${shortestPath.length - 1} hops\n`);
} else {
  console.log('No path found\n');
}

// 7. Finding All Paths
console.log('7. Finding all paths between jobs...');
const allPaths = db.traverse(job1.id)
  .out('SIMILAR_TO')
  .paths(job6.id, { maxPaths: 5, maxDepth: 4 });

console.log(`Found ${allPaths.length} paths from job1 to job6:`);
allPaths.forEach((path, idx) => {
  console.log(`  Path ${idx + 1}: ${path.map(n => n.properties.title).join(' -> ')}`);
});
console.log();

// 8. Path Analysis with toPaths()
console.log('8. Analyzing all traversal paths...');
const allTraversalPaths = db.traverse(job1.id)
  .out('SIMILAR_TO')
  .maxDepth(2)
  .toPaths();

console.log(`All reachable paths (max depth 2):`);
allTraversalPaths.slice(0, 5).forEach((path, idx) => {
  console.log(`  Path ${idx + 1}: ${path.map(n => n.properties.title).join(' -> ')}`);
});
console.log(`... (${allTraversalPaths.length} total paths)\n`);

// 9. Filtered Traversal
console.log('9. Filtered traversal (only Backend-related jobs)...');
const backendJobs = db.traverse(job1.id)
  .out('SIMILAR_TO')
  .filter(node =>
    node.properties.title &&
    (node.properties.title.includes('Backend') || node.properties.title.includes('Full Stack'))
  )
  .maxDepth(3)
  .toArray();

console.log('Backend-related jobs found:');
backendJobs.forEach(job => {
  console.log(`  - ${job.properties.title}`);
});
console.log();

// 10. Minimum Depth Filtering
console.log('10. Finding jobs at least 2 hops away...');
const distantJobs = db.traverse(job1.id)
  .out('SIMILAR_TO')
  .minDepth(2)
  .maxDepth(3)
  .unique()
  .toArray();

console.log('Jobs at distance 2-3:');
distantJobs.forEach(job => {
  console.log(`  - ${job.properties.title}`);
});
console.log();

// Close database
db.close();
console.log('=== Example Complete ===');
