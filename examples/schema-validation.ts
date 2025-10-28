/**
 * Schema Validation Example
 *
 * This example demonstrates schema definition and validation:
 * - Defining node types with properties
 * - Defining edge types with constraints
 * - Property validation
 * - Error handling for schema violations
 * - Working with typed data
 *
 * Run with: npx ts-node examples/schema-validation.ts
 */

import { GraphDatabase, GraphSchema } from '../src/index';

console.log('=== Schema Validation Example ===\n');

// 1. Define a schema
console.log('1. Defining graph schema...');
const schema: GraphSchema = {
  nodes: {
    Job: {
      properties: ['title', 'company', 'location', 'salary', 'status', 'url'],
      indexes: ['status', 'company']
    },
    Company: {
      properties: ['name', 'industry', 'size', 'founded'],
      indexes: ['name']
    },
    Skill: {
      properties: ['name', 'category', 'level'],
      indexes: ['name', 'category']
    },
    Person: {
      properties: ['name', 'email', 'title', 'yearsExperience'],
      indexes: ['email']
    }
  },
  edges: {
    POSTED_BY: {
      from: 'Job',
      to: 'Company',
      properties: ['postedAt', 'expiresAt']
    },
    REQUIRES: {
      from: 'Job',
      to: 'Skill',
      properties: ['required', 'yearsNeeded', 'level']
    },
    HAS_SKILL: {
      from: 'Person',
      to: 'Skill',
      properties: ['yearsExperience', 'lastUsed']
    },
    APPLIED_TO: {
      from: 'Person',
      to: 'Job',
      properties: ['appliedAt', 'status', 'notes']
    }
  }
};

// Create database with schema
const db = new GraphDatabase(':memory:', { schema });
console.log('Database created with schema validation enabled\n');

// 2. Creating Valid Nodes
console.log('2. Creating valid nodes...');
const techCorp = db.createNode('Company', {
  name: 'TechCorp',
  industry: 'Technology',
  size: 'large',
  founded: 2010
});
console.log(`✓ Created company: ${techCorp.properties.name}`);

const seniorJob = db.createNode('Job', {
  title: 'Senior TypeScript Engineer',
  company: 'TechCorp',
  location: 'San Francisco, CA',
  salary: { min: 150000, max: 200000 },
  status: 'active',
  url: 'https://example.com/job/1'
});
console.log(`✓ Created job: ${seniorJob.properties.title}`);

const typescript = db.createNode('Skill', {
  name: 'TypeScript',
  category: 'Programming Language',
  level: 'expert'
});
console.log(`✓ Created skill: ${typescript.properties.name}\n`);

// 3. Creating Valid Edges
console.log('3. Creating valid edges...');
const postedEdge = db.createEdge('POSTED_BY', seniorJob.id, techCorp.id, {
  postedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
});
console.log(`✓ Created edge: Job ${seniorJob.id} POSTED_BY Company ${techCorp.id}`);

const requiresEdge = db.createEdge('REQUIRES', seniorJob.id, typescript.id, {
  required: true,
  yearsNeeded: 4,
  level: 'expert'
});
console.log(`✓ Created edge: Job ${seniorJob.id} REQUIRES Skill ${typescript.id}\n`);

// 4. Attempting Invalid Node Type
console.log('4. Testing invalid node type...');
try {
  db.createNode('InvalidType', { foo: 'bar' });
  console.log('✗ Should have failed!');
} catch (error) {
  console.log(`✓ Caught expected error: ${(error as Error).message}\n`);
}

// 5. Working with Extra Properties (Not Validated)
console.log('5. Working with extra properties...');
const jobWithExtra = db.createNode('Job', {
  title: 'Backend Engineer',
  company: 'StartupInc',
  location: 'Remote',
  salary: { min: 120000, max: 160000 },
  status: 'active',
  url: 'https://example.com/job/2',
  // Extra properties not in schema - these are allowed
  remote: true,
  benefits: ['health', 'dental', '401k'],
  tags: ['backend', 'golang', 'kubernetes']
});
console.log(`✓ Created job with extra properties`);
console.log(`  Remote: ${jobWithExtra.properties.remote}`);
console.log(`  Benefits: ${jobWithExtra.properties.benefits.join(', ')}\n`);

// 6. Invalid Edge Types
console.log('6. Testing invalid edge types...');
try {
  db.createEdge('INVALID_EDGE', seniorJob.id, techCorp.id);
  console.log('✗ Should have failed!');
} catch (error) {
  console.log(`✓ Caught expected error: ${(error as Error).message}\n`);
}

// 7. Type-Safe Queries with Schema
console.log('7. Type-safe queries...');

// Find all active jobs
const activeJobs = db.nodes('Job')
  .where({ status: 'active' })
  .exec();
console.log(`Found ${activeJobs.length} active jobs`);

// Find jobs in technology companies
const techJobs = db.nodes('Job')
  .connectedTo('Company', 'POSTED_BY')
  .exec();
console.log(`Found ${techJobs.length} jobs from companies\n`);

// 8. Complex Schema Example - Job Application Workflow
console.log('8. Job application workflow...');

const john = db.createNode('Person', {
  name: 'John Doe',
  email: 'john@example.com',
  title: 'Software Engineer',
  yearsExperience: 5
});

const nodejs = db.createNode('Skill', {
  name: 'Node.js',
  category: 'Runtime',
  level: 'expert'
});

// John has skills
db.createEdge('HAS_SKILL', john.id, typescript.id, {
  yearsExperience: 4,
  lastUsed: new Date().toISOString()
});

db.createEdge('HAS_SKILL', john.id, nodejs.id, {
  yearsExperience: 5,
  lastUsed: new Date().toISOString()
});

// John applies to job
db.createEdge('APPLIED_TO', john.id, seniorJob.id, {
  appliedAt: new Date().toISOString(),
  status: 'pending',
  notes: 'Strong TypeScript background, 5 years experience'
});

console.log(`✓ ${john.properties.name} applied to ${seniorJob.properties.title}`);

// Find John's applications
const applications = db.traverse(john.id)
  .out('APPLIED_TO', 'Job')
  .toArray();
console.log(`Found ${applications.length} job applications for ${john.properties.name}\n`);

// 9. Schema Benefits Summary
console.log('9. Schema validation benefits:');
console.log('  ✓ Prevents invalid node types');
console.log('  ✓ Prevents invalid edge types');
console.log('  ✓ Documents expected graph structure');
console.log('  ✓ Helps with IDE autocomplete (when using TypeScript)');
console.log('  ✓ Allows extra properties for flexibility');
console.log('  ✓ Supports indexed properties for faster queries\n');

// 10. Exporting Schema-Validated Data
console.log('10. Exporting data...');
const exportData = db.export();
console.log(`Exported graph:`);
console.log(`  - Nodes: ${exportData.nodes.length}`);
console.log(`  - Edges: ${exportData.edges.length}`);
console.log(`  - Node types: ${[...new Set(exportData.nodes.map(n => n.type))].join(', ')}`);
console.log(`  - Edge types: ${[...new Set(exportData.edges.map(e => e.type))].join(', ')}\n`);

// Example: Finding matching candidates
console.log('11. Finding matching candidates...');
const requiredSkills = db.traverse(seniorJob.id)
  .out('REQUIRES', 'Skill')
  .toArray();

console.log(`Job requires: ${requiredSkills.map(s => s.properties.name).join(', ')}`);

const candidates = db.nodes('Person')
  .exec()
  .filter(person => {
    const personSkills = db.traverse(person.id)
      .out('HAS_SKILL', 'Skill')
      .toArray();

    const hasAllRequired = requiredSkills.every(required =>
      personSkills.some(has => has.properties.name === required.properties.name)
    );

    return hasAllRequired;
  });

console.log(`Matching candidates: ${candidates.length}`);
candidates.forEach(c => {
  console.log(`  - ${c.properties.name} (${c.properties.yearsExperience} years experience)`);
});

db.close();
console.log('\n=== Example Complete ===');
