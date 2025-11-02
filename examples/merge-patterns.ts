/**
 * MERGE operation examples demonstrating Cypher-like upsert patterns
 * for job search tracking use cases.
 */

import { GraphDatabase } from '../src';

const db = new GraphDatabase(':memory:');

// ============================================================================
// Setup: Create indexes for efficient merge operations
// ============================================================================

console.log('Setting up indexes for merge operations...\n');

// Create indexes on properties used for matching
db.createPropertyIndex('Job', 'url', true); // Unique: one job per URL
db.createPropertyIndex('Company', 'name'); // Non-unique: companies can have same name
db.createPropertyIndex('Skill', 'name', true); // Unique: one skill per name

console.log('✓ Indexes created\n');

// ============================================================================
// Example 1: Simple Job Upsert
// ============================================================================

console.log('Example 1: Simple Job Upsert');
console.log('================================\n');

// First run: Creates new job
const job1 = db.mergeNode(
  'Job',
  { url: 'https://example.com/job/123' }, // Match on URL
  {
    url: 'https://example.com/job/123',
    title: 'Senior AI Engineer',
    company: 'TechCorp',
    status: 'active'
  }
);

console.log(`First merge: Created=${job1.created}, ID=${job1.node.id}`);

// Second run: Finds existing job (idempotent)
const job2 = db.mergeNode('Job', { url: 'https://example.com/job/123' }, {
  url: 'https://example.com/job/123',
  title: 'Senior AI Engineer',
  company: 'TechCorp',
  status: 'active'
});

console.log(`Second merge: Created=${job2.created}, ID=${job2.node.id}`);
console.log(`Same node: ${job1.node.id === job2.node.id}\n`);

// ============================================================================
// Example 2: ON CREATE / ON MATCH Tracking
// ============================================================================

console.log('Example 2: ON CREATE / ON MATCH Tracking');
console.log('==========================================\n');

// Track when jobs are first discovered vs. last seen
const job3 = db.mergeNode(
  'Job',
  { url: 'https://example.com/job/456' },
  {
    url: 'https://example.com/job/456',
    title: 'ML Engineer',
    status: 'active'
  },
  {
    onCreate: {
      discoveredAt: new Date().toISOString(),
      applicationStatus: 'not_applied',
      viewCount: 0
    } as any,
    onMatch: {
      lastSeenAt: new Date().toISOString()
      // viewCount would be incremented here in real app
    } as any
  }
);

console.log('First merge (CREATE):');
console.log(`  Created: ${job3.created}`);
console.log(`  discoveredAt: ${(job3.node.properties as any).discoveredAt}`);
console.log(`  applicationStatus: ${(job3.node.properties as any).applicationStatus}`);
console.log(`  lastSeenAt: ${(job3.node.properties as any).lastSeenAt || 'undefined'}\n`);

// Immediately merge again to demonstrate MATCH behavior
const job4 = db.mergeNode(
  'Job',
  { url: 'https://example.com/job/456' },
  undefined,
  {
    onMatch: {
      lastSeenAt: new Date().toISOString(),
      viewCount: ((job3.node.properties as any).viewCount || 0) + 1
    }
  } as any
);

console.log('Second merge (MATCH):');
console.log(`  Created: ${job4.created}`);
console.log(`  discoveredAt: ${(job4.node.properties as any).discoveredAt} (preserved)`);
console.log(`  lastSeenAt: ${(job4.node.properties as any).lastSeenAt} (updated)`);
console.log(`  viewCount: ${(job4.node.properties as any).viewCount} (incremented)\n`);

// ============================================================================
// Example 3: Company Deduplication
// ============================================================================

console.log('\nExample 3: Company Deduplication');
console.log('==================================\n');

// Multiple job listings from same company should reuse company node
const companies = ['TechCorp', 'TechCorp', 'StartupCo', 'TechCorp'];

companies.forEach((companyName, i) => {
  const result = db.mergeNode(
    'Company',
    { name: companyName },
    { name: companyName, industry: 'Software' }
  );
  console.log(`Job ${i + 1}: Company "${companyName}" → ${result.created ? 'CREATED' : 'MATCHED'} (ID: ${result.node.id})`);
});

console.log(
  `\nTotal companies created: ${db.nodes('Company').exec().length} (should be 2, not 4)\n`
);

// ============================================================================
// Example 4: Relationship Merge (Unique Edges)
// ============================================================================

console.log('Example 4: Relationship Merge');
console.log('===============================\n');

const engineerJob = db.createNode('Job', { title: 'Engineer', url: 'https://example.com/job/789' });
const techCorp = db.mergeNode('Company', { name: 'TechCorp' }, { name: 'TechCorp' });

// First merge: Creates relationship
const edge1 = db.mergeEdge(
  engineerJob.id,
  'POSTED_BY',
  techCorp.node.id,
  { source: 'web_scraper' },
  {
    onCreate: { firstSeenAt: new Date().toISOString() },
    onMatch: { lastVerifiedAt: new Date().toISOString() }
  } as any
);

console.log(`First edge merge: Created=${edge1.created}`);
console.log(`  firstSeenAt: ${(edge1.edge.properties as any)?.firstSeenAt}`);
console.log(`  lastVerifiedAt: ${(edge1.edge.properties as any)?.lastVerifiedAt || 'undefined'}`);

// Second merge: Finds existing relationship
const edge2 = db.mergeEdge(
  engineerJob.id,
  'POSTED_BY',
  techCorp.node.id,
  undefined,
  {
    onMatch: { lastVerifiedAt: new Date().toISOString() }
  } as any
);

console.log(`\nSecond edge merge: Created=${edge2.created}`);
console.log(`  firstSeenAt: ${(edge2.edge.properties as any)?.firstSeenAt} (preserved)`);
console.log(`  lastVerifiedAt: ${(edge2.edge.properties as any)?.lastVerifiedAt} (updated)\n`);

// ============================================================================
// Example 5: Bulk Import with Merge (Idempotent ETL)
// ============================================================================

console.log('Example 5: Bulk Import with Merge');
console.log('===================================\n');

// Simulated daily job scraper data
const scrapedJobs = [
  { url: 'https://example.com/job/123', title: 'Senior AI Engineer', company: 'TechCorp' },
  { url: 'https://example.com/job/456', title: 'ML Engineer', company: 'StartupCo' },
  { url: 'https://example.com/job/789', title: 'Data Scientist', company: 'BigCorp' },
  // Duplicates from previous run
  { url: 'https://example.com/job/123', title: 'Senior AI Engineer', company: 'TechCorp' }
];

let created = 0;
let matched = 0;

// Note: Each merge operation has its own transaction, so we don't need to wrap
for (const jobData of scrapedJobs) {
  // Merge company
  const company = db.mergeNode(
    'Company',
    { name: jobData.company },
    { name: jobData.company }
  );

  // Merge job with tracking
  const job = db.mergeNode(
    'Job',
    { url: jobData.url },
    {
      url: jobData.url,
      title: jobData.title,
      status: 'active'
    },
    {
      onCreate: {
        discoveredAt: new Date().toISOString(),
        applicationStatus: 'not_applied'
      },
      onMatch: {
        lastSeenAt: new Date().toISOString(),
        status: 'active' // Reactivate if was closed
      }
    } as any
  );

  // Merge relationship
  db.mergeEdge(job.node.id, 'POSTED_BY', company.node.id);

  if (job.created) created++;
  else matched++;
}

console.log(`Processed ${scrapedJobs.length} scraped jobs:`);
console.log(`  ${created} new jobs created`);
console.log(`  ${matched} existing jobs updated`);
console.log(`  Total jobs in DB: ${db.nodes('Job').exec().length}\n`);

// ============================================================================
// Example 6: Handling Merge Conflicts
// ============================================================================

console.log('Example 6: Handling Merge Conflicts');
console.log('=====================================\n');

// Create ambiguous data (multiple companies with same partial info)
db.createNode('Company', { industry: 'SaaS', name: 'Corp A', location: 'NYC' });
db.createNode('Company', { industry: 'SaaS', name: 'Corp B', location: 'SF' });

try {
  // This will fail: industry alone is not unique
  db.mergeNode('Company', { industry: 'SaaS' }, { industry: 'SaaS', size: 'Large' });
} catch (error: any) {
  console.log('❌ Merge conflict detected:');
  console.log(`   ${error.message}`);
  console.log(`   Conflicting nodes: ${error.conflictingNodes?.length}`);
  console.log('\n   Solution: Add more specific match criteria (e.g., name + industry)\n');
}

// ============================================================================
// Example 7: Skills Graph with Merge
// ============================================================================

console.log('Example 7: Skills Graph with Merge');
console.log('====================================\n');

const skillNames = ['Python', 'Machine Learning', 'Python', 'TensorFlow', 'Machine Learning'];

skillNames.forEach((skillName) => {
  const result = db.mergeNode('Skill', { name: skillName }, { name: skillName, category: 'Technical' });

  console.log(`Skill "${skillName}": ${result.created ? 'CREATED' : 'MATCHED'} (ID: ${result.node.id})`);
});

console.log(`\nTotal unique skills: ${db.nodes('Skill').exec().length}\n`);

// ============================================================================
// Performance Comparison
// ============================================================================

console.log('Performance: Merge vs Manual Pattern');
console.log('======================================\n');

const iterations = 1000;

// Manual pattern (with transaction per operation for fair comparison)
const manualStart = Date.now();
for (let i = 0; i < iterations; i++) {
  const existing = db
    .nodes('TestNode')
    .where({ key: `test-${i % 100}` })
    .limit(1)
    .exec()[0];

  if (existing) {
    db.updateNode(existing.id, { updated: true } as any);
  } else {
    db.createNode('TestNode', { key: `test-${i % 100}`, created: true } as any);
  }
}
const manualTime = Date.now() - manualStart;

// Clear for fair comparison
db.nodes('TestNode').exec().forEach((node) => db.deleteNode(node.id));

// Create index first
db.createPropertyIndex('TestNode', 'key');

// Merge pattern
const mergeStart = Date.now();
for (let i = 0; i < iterations; i++) {
  db.mergeNode(
    'TestNode',
    { key: `test-${i % 100}` },
    { key: `test-${i % 100}`, created: true } as any,
    { onMatch: { updated: true }, warnOnMissingIndex: false } as any
  );
}
const mergeTime = Date.now() - mergeStart;

console.log(`Manual pattern: ${manualTime}ms`);
console.log(`Merge pattern:  ${mergeTime}ms`);
console.log(`Speedup:        ${(manualTime / mergeTime).toFixed(2)}x\n`);

// ============================================================================
// Cleanup
// ============================================================================

db.close();
console.log('✓ Examples complete');
