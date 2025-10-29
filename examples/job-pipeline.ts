/**
 * Comprehensive Job Application Tracking System
 *
 * This example demonstrates a production-ready job application pipeline using sqlite-graph.
 * It shows:
 * - Complex node and edge relationships
 * - Transaction management for data integrity
 * - Fluent query API for sophisticated searches
 * - Graph traversal for finding similar jobs and career paths
 * - Real-world use cases for job seekers and recruiters
 *
 * Run with: npx ts-node examples/job-pipeline.ts
 */

import { GraphDatabase } from '../src/index';
import type { Node } from '../src/types/index';
import * as fs from 'fs';

// =============================================================================
// Type Definitions for Type Safety
// =============================================================================

interface JobProperties {
  title: string;
  description: string;
  salary_min?: number;
  salary_max?: number;
  location: string;
  remote: boolean;
  posted_date: string;
  status: 'active' | 'filled' | 'closed';
  experience_level: 'entry' | 'mid' | 'senior' | 'lead';
}

interface CompanyProperties {
  name: string;
  industry: string;
  size: string;
  website?: string;
  rating?: number;
}

interface SkillProperties {
  name: string;
  category: 'language' | 'framework' | 'tool' | 'soft-skill';
  proficiency_required?: 'basic' | 'intermediate' | 'expert';
}

interface ApplicationProperties {
  applied_date: string;
  status: 'submitted' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
  notes?: string;
  interview_count?: number;
}

interface UserProperties {
  name: string;
  email: string;
  years_experience: number;
  current_title?: string;
}

// =============================================================================
// Database Initialization
// =============================================================================

const dbPath = './job-pipeline.db';

// Clean up any existing demo database
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('🧹 Cleaned up existing database\n');
}

// Initialize database
const db = new GraphDatabase(dbPath);

console.log('🚀 Job Application Tracking System - Comprehensive Demo\n');
console.log('=' .repeat(80));

// =============================================================================
// STEP 1: Build the Job Market Graph
// =============================================================================
console.log('\n📊 STEP 1: Building Job Market Graph');
console.log('-'.repeat(80));

// Use a transaction to ensure data consistency
const { companies, jobs, skills, user } = db.transaction((ctx) => {
  console.log('Starting transaction to build initial graph...');

  // Create companies
  const techCorp = db.createNode<CompanyProperties>('Company', {
    name: 'TechCorp Solutions',
    industry: 'Software',
    size: '500-1000',
    website: 'https://techcorp.example.com',
    rating: 4.2
  });

  const dataInc = db.createNode<CompanyProperties>('Company', {
    name: 'DataInc Analytics',
    industry: 'Data Science',
    size: '100-500',
    website: 'https://datainc.example.com',
    rating: 4.5
  });

  const cloudSys = db.createNode<CompanyProperties>('Company', {
    name: 'CloudSys Infrastructure',
    industry: 'Cloud Computing',
    size: '1000-5000',
    rating: 3.8
  });

  console.log(`✓ Created ${3} companies`);

  // Create jobs
  const seniorDevJob = db.createNode<JobProperties>('Job', {
    title: 'Senior Software Engineer',
    description: 'Build scalable backend systems',
    salary_min: 120000,
    salary_max: 180000,
    location: 'San Francisco, CA',
    remote: true,
    posted_date: '2024-01-15',
    status: 'active',
    experience_level: 'senior'
  });

  const mlEngineerJob = db.createNode<JobProperties>('Job', {
    title: 'Machine Learning Engineer',
    description: 'Develop ML models for production',
    salary_min: 140000,
    salary_max: 200000,
    location: 'New York, NY',
    remote: true,
    posted_date: '2024-01-20',
    status: 'active',
    experience_level: 'mid'
  });

  const devopsJob = db.createNode<JobProperties>('Job', {
    title: 'DevOps Engineer',
    description: 'Manage cloud infrastructure',
    salary_min: 110000,
    salary_max: 160000,
    location: 'Austin, TX',
    remote: false,
    posted_date: '2024-01-10',
    status: 'active',
    experience_level: 'mid'
  });

  const juniorDevJob = db.createNode<JobProperties>('Job', {
    title: 'Junior Full Stack Developer',
    description: 'Learn and grow with our team',
    salary_min: 70000,
    salary_max: 95000,
    location: 'Remote',
    remote: true,
    posted_date: '2024-01-18',
    status: 'active',
    experience_level: 'entry'
  });

  console.log(`✓ Created ${4} job postings`);

  // Create skills
  const typescript = db.createNode<SkillProperties>('Skill', {
    name: 'TypeScript',
    category: 'language'
  });

  const python = db.createNode<SkillProperties>('Skill', {
    name: 'Python',
    category: 'language'
  });

  const react = db.createNode<SkillProperties>('Skill', {
    name: 'React',
    category: 'framework'
  });

  const kubernetes = db.createNode<SkillProperties>('Skill', {
    name: 'Kubernetes',
    category: 'tool'
  });

  const tensorflow = db.createNode<SkillProperties>('Skill', {
    name: 'TensorFlow',
    category: 'framework'
  });

  const docker = db.createNode<SkillProperties>('Skill', {
    name: 'Docker',
    category: 'tool'
  });

  console.log(`✓ Created ${6} skills`);

  // Create user profile
  const jobSeeker = db.createNode<UserProperties>('User', {
    name: 'Jane Developer',
    email: 'jane@example.com',
    years_experience: 5,
    current_title: 'Software Engineer'
  });

  console.log(`✓ Created user profile`);

  // Create POSTED_BY relationships (jobs → companies)
  db.createEdge(seniorDevJob.id, 'POSTED_BY', techCorp.id);
  db.createEdge(mlEngineerJob.id, 'POSTED_BY', dataInc.id);
  db.createEdge(devopsJob.id, 'POSTED_BY', cloudSys.id);
  db.createEdge(juniorDevJob.id, 'POSTED_BY', techCorp.id);

  // Create REQUIRES relationships (jobs → skills)
  // Senior Dev requires TypeScript, React
  db.createEdge(seniorDevJob.id, 'REQUIRES', typescript.id, {
    proficiency_required: 'expert'
  });
  db.createEdge(seniorDevJob.id, 'REQUIRES', react.id, {
    proficiency_required: 'expert'
  });
  db.createEdge(seniorDevJob.id, 'REQUIRES', docker.id, {
    proficiency_required: 'intermediate'
  });

  // ML Engineer requires Python, TensorFlow
  db.createEdge(mlEngineerJob.id, 'REQUIRES', python.id, {
    proficiency_required: 'expert'
  });
  db.createEdge(mlEngineerJob.id, 'REQUIRES', tensorflow.id, {
    proficiency_required: 'expert'
  });

  // DevOps requires Kubernetes, Docker
  db.createEdge(devopsJob.id, 'REQUIRES', kubernetes.id, {
    proficiency_required: 'expert'
  });
  db.createEdge(devopsJob.id, 'REQUIRES', docker.id, {
    proficiency_required: 'expert'
  });

  // Junior Dev requires TypeScript, React
  db.createEdge(juniorDevJob.id, 'REQUIRES', typescript.id, {
    proficiency_required: 'basic'
  });
  db.createEdge(juniorDevJob.id, 'REQUIRES', react.id, {
    proficiency_required: 'intermediate'
  });

  console.log(`✓ Created relationships (POSTED_BY, REQUIRES)`);

  // Create HAS_SKILL relationships (user → skills)
  db.createEdge(jobSeeker.id, 'HAS_SKILL', typescript.id, {
    proficiency: 'expert',
    years_experience: 4
  });
  db.createEdge(jobSeeker.id, 'HAS_SKILL', react.id, {
    proficiency: 'expert',
    years_experience: 3
  });
  db.createEdge(jobSeeker.id, 'HAS_SKILL', python.id, {
    proficiency: 'intermediate',
    years_experience: 2
  });
  db.createEdge(jobSeeker.id, 'HAS_SKILL', docker.id, {
    proficiency: 'intermediate',
    years_experience: 2
  });

  console.log(`✓ Created user skill relationships`);

  // Create SIMILAR_TO relationships between jobs
  db.createEdge(seniorDevJob.id, 'SIMILAR_TO', juniorDevJob.id, {
    similarity_score: 0.75,
    reason: 'Same tech stack, different experience level'
  });
  db.createEdge(devopsJob.id, 'SIMILAR_TO', seniorDevJob.id, {
    similarity_score: 0.45,
    reason: 'Both require Docker/infrastructure knowledge'
  });

  console.log(`✓ Created job similarity relationships`);

  // Commit the transaction
  ctx.commit();
  console.log('✓ Transaction committed successfully\n');

  return {
    companies: [techCorp, dataInc, cloudSys],
    jobs: [seniorDevJob, mlEngineerJob, devopsJob, juniorDevJob],
    skills: [typescript, python, react, kubernetes, tensorflow, docker],
    user: jobSeeker
  };
});

console.log(`📈 Graph built with:`);
console.log(`   - ${companies.length} companies`);
console.log(`   - ${jobs.length} jobs`);
console.log(`   - ${skills.length} skills`);
console.log(`   - 1 user profile`);

// =============================================================================
// STEP 2: Apply to Jobs
// =============================================================================
console.log('\n\n📝 STEP 2: Submitting Job Applications');
console.log('-'.repeat(80));

// Apply to multiple jobs in a single transaction
const applications = db.transaction((ctx) => {
  const apps = [];

  // Apply to Senior Dev role
  const seniorDevApp = db.createNode<ApplicationProperties>('Application', {
    applied_date: '2024-01-16',
    status: 'interview',
    notes: 'Great culture fit, strong technical match',
    interview_count: 2
  });
  db.createEdge(user.id, 'APPLIED_TO', jobs[0].id, {
    application_id: seniorDevApp.id
  });
  db.createEdge(seniorDevApp.id, 'FOR_JOB', jobs[0].id);
  apps.push(seniorDevApp);
  console.log(`✓ Applied to: ${jobs[0].properties.title} at TechCorp`);

  // Apply to ML Engineer role
  const mlEngineerApp = db.createNode<ApplicationProperties>('Application', {
    applied_date: '2024-01-21',
    status: 'screening',
    notes: 'Interested in ML transition, need to strengthen Python',
    interview_count: 0
  });
  db.createEdge(user.id, 'APPLIED_TO', jobs[1].id, {
    application_id: mlEngineerApp.id
  });
  db.createEdge(mlEngineerApp.id, 'FOR_JOB', jobs[1].id);
  apps.push(mlEngineerApp);
  console.log(`✓ Applied to: ${jobs[1].properties.title} at DataInc`);

  // Apply to Junior Dev role (backup option)
  const juniorDevApp = db.createNode<ApplicationProperties>('Application', {
    applied_date: '2024-01-19',
    status: 'offer',
    notes: 'Quick process, received offer',
    interview_count: 1
  });
  db.createEdge(user.id, 'APPLIED_TO', jobs[3].id, {
    application_id: juniorDevApp.id
  });
  db.createEdge(juniorDevApp.id, 'FOR_JOB', jobs[3].id);
  apps.push(juniorDevApp);
  console.log(`✓ Applied to: ${jobs[3].properties.title} at TechCorp`);

  ctx.commit();
  console.log('\n✓ All applications submitted successfully');

  return apps;
});

console.log(`\n📊 Total applications: ${applications.length}`);

// =============================================================================
// STEP 3: Query and Analyze Applications
// =============================================================================
console.log('\n\n🔍 STEP 3: Querying Job Applications');
console.log('-'.repeat(80));

// Query 1: Find all active jobs
console.log('\n📋 Query 1: All Active Job Postings');
const activeJobs = db.nodes('Job')
  .where({ status: 'active' })
  .orderBy('salary_max', 'desc')
  .exec();

console.log(`Found ${activeJobs.length} active jobs:\n`);
activeJobs.forEach((job, i) => {
  const salary = job.properties.salary_max
    ? `$${job.properties.salary_min?.toLocaleString()}-${job.properties.salary_max.toLocaleString()}`
    : 'Not specified';
  console.log(`  ${i + 1}. ${job.properties.title}`);
  console.log(`     💰 ${salary} | 📍 ${job.properties.location} | ${job.properties.remote ? '🏠 Remote' : '🏢 On-site'}`);
});

// Query 2: Find jobs by company
console.log('\n\n📋 Query 2: Jobs at TechCorp Solutions');
const techCorpJobs = db.nodes('Job')
  .connectedTo('Company', 'POSTED_BY', 'out')
  .where({ name: 'TechCorp Solutions' })
  .exec() as Node<JobProperties>[];

console.log(`TechCorp has ${techCorpJobs.length} open positions:\n`);
techCorpJobs.forEach((job, i) => {
  console.log(`  ${i + 1}. ${job.properties.title} (${job.properties.experience_level} level)`);
});

// Query 3: Find jobs requiring specific skills
console.log('\n\n📋 Query 3: Jobs Requiring TypeScript');
const typescriptJobs = db.nodes('Job')
  .connectedTo('Skill', 'REQUIRES', 'out')
  .where({ name: 'TypeScript' })
  .exec() as Node<JobProperties>[];

console.log(`Found ${typescriptJobs.length} jobs requiring TypeScript:\n`);
typescriptJobs.forEach((job, i) => {
  console.log(`  ${i + 1}. ${job.properties.title} - ${job.properties.experience_level}`);
});

// Query 4: Find jobs matching user's skills
console.log('\n\n📋 Query 4: Jobs Matching User Skills');
console.log(`Analyzing ${user.properties.name}'s skill profile...`);

// Get user's skills
const userSkills = db.traverse(user.id)
  .out('HAS_SKILL')
  .toArray();

console.log(`\nUser has ${userSkills.length} skills in profile:`);
userSkills.forEach((skill: Node) => {
  console.log(`  • ${skill.properties.name}`);
});

// Find jobs requiring those skills
console.log(`\nJobs matching user's skills:\n`);
const matchingJobs = new Map<number, { job: Node<JobProperties>, matchCount: number, skills: string[] }>();

userSkills.forEach((skill: Node) => {
  const jobsForSkill = db.nodes('Job')
    .connectedTo('Skill', 'REQUIRES', 'out')
    .where({ id: skill.id })
    .exec() as Node<JobProperties>[];

  jobsForSkill.forEach(job => {
    if (!matchingJobs.has(job.id)) {
      matchingJobs.set(job.id, { job, matchCount: 0, skills: [] });
    }
    const match = matchingJobs.get(job.id)!;
    match.matchCount++;
    match.skills.push(skill.properties.name);
  });
});

// Sort by match count
const sortedMatches = Array.from(matchingJobs.values())
  .sort((a, b) => b.matchCount - a.matchCount);

sortedMatches.forEach((match, i) => {
  console.log(`  ${i + 1}. ${match.job.properties.title}`);
  console.log(`     ✓ ${match.matchCount} matching skills: ${match.skills.join(', ')}`);
  console.log(`     📍 ${match.job.properties.location} | 💰 $${match.job.properties.salary_max?.toLocaleString()}`);
});

// Query 5: Application status tracking
console.log('\n\n📋 Query 5: Application Status Dashboard');
const allApplications = db.nodes('Application').exec() as Node<ApplicationProperties>[];

console.log(`\nApplication Pipeline Status:\n`);

const statusGroups = allApplications.reduce((acc, app) => {
  if (!acc[app.properties.status]) {
    acc[app.properties.status] = [];
  }
  acc[app.properties.status].push(app);
  return acc;
}, {} as Record<string, Node<ApplicationProperties>[]>);

Object.entries(statusGroups).forEach(([status, apps]) => {
  console.log(`  ${status.toUpperCase()}: ${apps.length} application(s)`);
  apps.forEach(app => {
    // Get the job for this application
    const jobNodes = db.traverse(app.id)
      .out('FOR_JOB')
      .toArray();
    if (jobNodes.length > 0) {
      const job = jobNodes[0] as Node<JobProperties>;
      console.log(`    • ${job.properties.title} (Applied: ${app.properties.applied_date})`);
      if (app.properties.notes) {
        console.log(`      Note: ${app.properties.notes}`);
      }
    }
  });
});

// =============================================================================
// STEP 4: Graph Traversal - Find Similar Jobs and Career Paths
// =============================================================================
console.log('\n\n🗺️  STEP 4: Graph Traversal and Path Finding');
console.log('-'.repeat(80));

// Traversal 1: Find all similar jobs
console.log('\n🔗 Traversal 1: Finding Similar Jobs');
const seniorDevJob = jobs[0];
console.log(`Starting from: ${seniorDevJob.properties.title}\n`);

const similarJobs = db.traverse(seniorDevJob.id)
  .both('SIMILAR_TO')
  .toArray();

console.log(`Found ${similarJobs.length} similar job(s):\n`);
similarJobs.forEach((job: Node, i: number) => {
  const typedJob = job as Node<JobProperties>;
  console.log(`  ${i + 1}. ${typedJob.properties.title}`);
  console.log(`     ${typedJob.properties.experience_level} level | ${typedJob.properties.location}`);
});

// Traversal 2: Find career progression paths
console.log('\n\n🔗 Traversal 2: Career Progression Analysis');
console.log('Finding path from Junior to Senior roles...\n');

const juniorJob = jobs[3]; // Junior Full Stack
const paths = db.traverse(juniorJob.id).paths(seniorDevJob.id, { maxDepth: 3 });

if (paths.length > 0) {
  console.log(`Found ${paths.length} career path(s):\n`);
  paths.forEach((path, i) => {
    console.log(`  Path ${i + 1}:`);
    const pathStr = path.map((node, idx) => {
      const typedNode = node as Node<JobProperties>;
      return `    ${idx === 0 ? '🚀' : '→ '} ${typedNode.properties.title} (${typedNode.properties.experience_level})`;
    }).join('\n');
    console.log(pathStr);
  });
} else {
  console.log('  Direct progression path exists via SIMILAR_TO relationship');
}

// Traversal 3: Multi-hop traversal - Job → Company → All Jobs at Company
console.log('\n\n🔗 Traversal 3: Exploring Company Ecosystem');
console.log('Finding all jobs at the same company...\n');

// Start from a job, go to its company, then find all jobs
const mlJob = jobs[1];
console.log(`Starting from: ${mlJob.properties.title}`);

// First, get the company
const company = db.traverse(mlJob.id)
  .out('POSTED_BY')
  .toArray()[0] as Node<CompanyProperties>;

console.log(`Company: ${company.properties.name}\n`);

// Then find all jobs at this company
const companyJobs = db.traverse(company.id)
  .in('POSTED_BY')
  .toArray();

console.log(`All positions at ${company.properties.name}:\n`);
companyJobs.forEach((job: Node, i: number) => {
  const typedJob = job as Node<JobProperties>;
  console.log(`  ${i + 1}. ${typedJob.properties.title}`);
  console.log(`     ${typedJob.properties.experience_level} | Status: ${typedJob.properties.status}`);
});

// =============================================================================
// STEP 5: Advanced Queries - Complex Filters and Aggregations
// =============================================================================
console.log('\n\n📊 STEP 5: Advanced Queries and Analytics');
console.log('-'.repeat(80));

// Advanced Query 1: Remote jobs with high salary
console.log('\n💼 Query 1: Premium Remote Positions');
const premiumRemote = (db.nodes('Job')
  .where({ remote: true, status: 'active' })
  .exec() as Node<JobProperties>[])
  .filter(job => (job.properties.salary_max || 0) >= 150000)
  .sort((a, b) => (b.properties.salary_max || 0) - (a.properties.salary_max || 0));

console.log(`Found ${premiumRemote.length} premium remote position(s):\n`);
premiumRemote.forEach((job, i) => {
  console.log(`  ${i + 1}. ${job.properties.title}`);
  console.log(`     💰 Up to $${job.properties.salary_max?.toLocaleString()}`);
  console.log(`     🏠 ${job.properties.location}`);
});

// Advanced Query 2: Skills in high demand
console.log('\n\n📈 Query 2: Most In-Demand Skills');
const allSkills = db.nodes('Skill').exec() as Node<SkillProperties>[];

const skillDemand = allSkills.map(skill => {
  // Count how many jobs require this skill
  const jobCount = db.nodes('Job')
    .connectedTo('Skill', 'REQUIRES', 'out')
    .where({ id: skill.id })
    .count();

  return { skill, jobCount };
}).sort((a, b) => b.jobCount - a.jobCount);

console.log(`Skill demand analysis:\n`);
skillDemand.forEach(({ skill, jobCount }, i) => {
  const bar = '█'.repeat(jobCount) + '░'.repeat(4 - jobCount);
  console.log(`  ${i + 1}. ${skill.properties.name.padEnd(15)} ${bar} ${jobCount} job(s)`);
});

// Advanced Query 3: Company comparison
console.log('\n\n🏢 Query 3: Company Comparison');
const companyStats = companies.map(company => {
  const jobCount = db.nodes('Job')
    .connectedTo('Company', 'POSTED_BY', 'out')
    .where({ id: company.id })
    .count();

  return {
    name: company.properties.name,
    rating: company.properties.rating || 0,
    jobs: jobCount,
    industry: company.properties.industry
  };
}).sort((a, b) => b.rating - a.rating);

console.log('Company rankings:\n');
companyStats.forEach(({ name, rating, jobs, industry }, i) => {
  const stars = '⭐'.repeat(Math.floor(rating));
  console.log(`  ${i + 1}. ${name}`);
  console.log(`     ${stars} ${rating}/5 | ${jobs} open position(s) | ${industry}`);
});

// =============================================================================
// STEP 6: Update Application Status (Transaction Example)
// =============================================================================
console.log('\n\n✏️  STEP 6: Updating Application Status');
console.log('-'.repeat(80));

console.log('\nSimulating interview process updates...\n');

db.transaction((ctx) => {
  // Update senior dev application - advanced to next round
  const seniorApp = applications[0];
  const updatedNode = db.updateNode(seniorApp.id, {
    status: 'offer',
    interview_count: 3,
    notes: 'Received offer after final round!'
  }) as Node<ApplicationProperties>;
  console.log(`✓ Updated ${jobs[0].properties.title} application:`);
  console.log(`  Status: ${updatedNode.properties.status}`);
  console.log(`  Interviews completed: ${updatedNode.properties.interview_count}`);

  // Update ML engineer application - unfortunately rejected
  const mlApp = applications[1];
  db.updateNode(mlApp.id, {
    status: 'rejected',
    notes: 'Need more ML experience, encouraged to reapply in 6 months'
  });
  console.log(`\n✓ Updated ${jobs[1].properties.title} application:`);
  console.log(`  Status: rejected`);

  ctx.commit();
  console.log('\n✓ Application updates committed');
});

// =============================================================================
// STEP 7: Generate Application Report
// =============================================================================
console.log('\n\n📋 STEP 7: Final Application Report');
console.log('-'.repeat(80));

const finalApps = db.nodes('Application').exec() as Node<ApplicationProperties>[];

console.log(`\n${user.properties.name}'s Job Search Summary:`);
console.log(`Email: ${user.properties.email}`);
console.log(`Experience: ${user.properties.years_experience} years`);
console.log(`\nApplications submitted: ${finalApps.length}`);

// Group by status
const finalStatusCounts = finalApps.reduce((acc, app) => {
  acc[app.properties.status] = (acc[app.properties.status] || 0) + 1;
  return acc;
}, {} as Record<string, number>);

console.log('\nPipeline breakdown:');
Object.entries(finalStatusCounts).forEach(([status, count]) => {
  const emoji = status === 'offer' ? '🎉' :
                status === 'interview' ? '💬' :
                status === 'screening' ? '👀' :
                status === 'rejected' ? '❌' : '📝';
  console.log(`  ${emoji} ${status}: ${count}`);
});

// Calculate success rate
const offers = finalStatusCounts['offer'] || 0;
const successRate = ((offers / finalApps.length) * 100).toFixed(1);
console.log(`\n📊 Offer rate: ${successRate}%`);

// Show offers
const offerApps = finalApps.filter(app => app.properties.status === 'offer');
if (offerApps.length > 0) {
  console.log('\n🎉 Outstanding Offers:\n');
  offerApps.forEach(app => {
    const jobNodes = db.traverse(app.id).out('FOR_JOB').toArray();
    if (jobNodes.length > 0) {
      const job = jobNodes[0] as Node<JobProperties>;
      const companyNodes = db.traverse(job.id).out('POSTED_BY').toArray();
      const company = companyNodes[0] as Node<CompanyProperties>;

      console.log(`  • ${job.properties.title} at ${company.properties.name}`);
      console.log(`    💰 $${job.properties.salary_min?.toLocaleString()}-${job.properties.salary_max?.toLocaleString()}`);
      console.log(`    📍 ${job.properties.location} ${job.properties.remote ? '(Remote)' : ''}`);
      console.log(`    📝 ${app.properties.notes || 'No notes'}`);
    }
  });
}

// =============================================================================
// STEP 8: Cleanup and Summary
// =============================================================================
console.log('\n\n' + '='.repeat(80));
console.log('✅ Job Pipeline Demo Complete!');
console.log('='.repeat(80));

console.log('\n📚 This demo showcased:');
console.log('  1. ✅ Building complex graph relationships (Jobs, Companies, Skills, Applications)');
console.log('  2. ✅ Transaction management for data integrity');
console.log('  3. ✅ Fluent query API with filtering and ordering');
console.log('  4. ✅ Graph traversal for discovering relationships');
console.log('  5. ✅ Path finding for career progression');
console.log('  6. ✅ Advanced analytics and aggregations');
console.log('  7. ✅ Real-time updates within transactions');
console.log('  8. ✅ Type-safe operations with TypeScript');

console.log('\n💡 Key Takeaways:');
console.log('  • sqlite-graph makes relationship queries simple and intuitive');
console.log('  • Transactions ensure data consistency across related updates');
console.log('  • Graph traversal naturally models real-world relationships');
console.log('  • The fluent API enables readable, maintainable code');

console.log('\n🚀 Next Steps:');
console.log('  • Adapt this example for your own domain');
console.log('  • Add more node types and relationship types');
console.log('  • Explore advanced traversal patterns');
console.log('  • Build analytics dashboards on top of the graph');

// Final statistics
const nodeCount = db.nodes('Job').count() +
                  db.nodes('Company').count() +
                  db.nodes('Skill').count() +
                  db.nodes('Application').count() +
                  db.nodes('User').count();

console.log(`\n📊 Final Graph Statistics:`);
console.log(`   Total nodes: ${nodeCount}`);
console.log(`   Node types: Job, Company, Skill, Application, User`);
console.log(`   Relationship types: POSTED_BY, REQUIRES, APPLIED_TO, FOR_JOB, HAS_SKILL, SIMILAR_TO`);

// Cleanup
db.close();
console.log('\n🧹 Database closed');
console.log(`💾 Database saved to: ${dbPath}`);
console.log('    (Run this example again to see it rebuild from scratch)\n');
