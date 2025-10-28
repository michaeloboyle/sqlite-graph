/**
 * Basic Usage Example
 *
 * This example demonstrates the fundamental operations of sqlite-graph:
 * - Creating an in-memory database
 * - Creating nodes and edges
 * - Basic queries
 * - Retrieving and updating nodes
 *
 * Run with: npx ts-node examples/basic-usage.ts
 */

import { GraphDatabase } from '../src/index';

// Create an in-memory database (use file path for persistent storage)
const db = new GraphDatabase(':memory:');

console.log('=== Basic Usage Example ===\n');

// 1. Creating Nodes
console.log('1. Creating nodes...');
const job = db.createNode('Job', {
  title: 'Senior Software Engineer',
  company: 'TechCorp',
  location: 'San Francisco, CA',
  salary: { min: 150000, max: 200000 },
  status: 'active'
});

const skill1 = db.createNode('Skill', {
  name: 'TypeScript',
  level: 'expert'
});

const skill2 = db.createNode('Skill', {
  name: 'Node.js',
  level: 'expert'
});

const skill3 = db.createNode('Skill', {
  name: 'React',
  level: 'intermediate'
});

console.log(`Created job: ${job.properties.title} (ID: ${job.id})`);
console.log(`Created ${skill1.properties.name}, ${skill2.properties.name}, ${skill3.properties.name} skills\n`);

// 2. Creating Edges (Relationships)
console.log('2. Creating relationships...');
db.createEdge('REQUIRES', job.id, skill1.id, { required: true, yearsNeeded: 3 });
db.createEdge('REQUIRES', job.id, skill2.id, { required: true, yearsNeeded: 4 });
db.createEdge('REQUIRES', job.id, skill3.id, { required: false, yearsNeeded: 2 });
console.log('Linked job to required skills\n');

// 3. Retrieving Nodes
console.log('3. Retrieving nodes by ID...');
const retrievedJob = db.getNode(job.id);
if (retrievedJob) {
  console.log(`Retrieved: ${retrievedJob.properties.title}`);
  console.log(`Created at: ${retrievedJob.createdAt.toISOString()}`);
  console.log(`Updated at: ${retrievedJob.updatedAt.toISOString()}\n`);
}

// 4. Updating Nodes
console.log('4. Updating nodes...');
const updatedJob = db.updateNode(job.id, {
  status: 'applied',
  appliedAt: new Date().toISOString()
});
console.log(`Status changed to: ${updatedJob.properties.status}\n`);

// 5. Basic Queries
console.log('5. Querying nodes...');

// Find all active jobs (will be empty now since we updated status)
const activeJobs = db.nodes('Job')
  .where({ status: 'active' })
  .exec();
console.log(`Active jobs: ${activeJobs.length}`);

// Find all jobs (any status)
const allJobs = db.nodes('Job').exec();
console.log(`Total jobs: ${allJobs.length}`);

// Find all expert-level skills
const expertSkills = db.nodes('Skill')
  .where({ level: 'expert' })
  .exec();
console.log(`Expert skills: ${expertSkills.length}`);
console.log('Skills:', expertSkills.map(s => s.properties.name).join(', ') + '\n');

// 6. Querying with Relationships
console.log('6. Querying with relationships...');
const jobsNeedingTypeScript = db.nodes('Job')
  .connectedTo('Skill', 'REQUIRES')
  .exec();
console.log(`Jobs requiring TypeScript: ${jobsNeedingTypeScript.length}\n`);

// 7. Complex Queries
console.log('7. Complex queries...');
const jobsWithFilters = db.nodes('Job')
  .orderBy('created_at', 'desc')
  .limit(10)
  .exec();
console.log(`Recent jobs (limited to 10): ${jobsWithFilters.length}\n`);

// 8. Deleting Data
console.log('8. Cleanup...');
const skillDeleted = db.deleteNode(skill3.id);
console.log(`Deleted skill: ${skillDeleted ? 'success' : 'not found'}`);

const edgeDeleted = db.deleteEdge(1);
console.log(`Deleted edge: ${edgeDeleted ? 'success' : 'not found'}\n`);

// 9. Export Data
console.log('9. Exporting graph...');
const exportData = db.export();
console.log(`Exported ${exportData.nodes.length} nodes and ${exportData.edges.length} edges`);
console.log(`Export metadata:`, exportData.metadata);

// Close database when done
db.close();
console.log('\n=== Example Complete ===');
