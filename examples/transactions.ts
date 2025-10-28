/**
 * Transactions Example
 *
 * This example demonstrates transaction management:
 * - Automatic commit/rollback
 * - Manual transaction control
 * - Savepoints and partial rollbacks
 * - Error handling in transactions
 * - Complex multi-step operations
 *
 * Run with: npx ts-node examples/transactions.ts
 */

import { GraphDatabase } from '../src/index';

const db = new GraphDatabase(':memory:');

console.log('=== Transactions Example ===\n');

// 1. Automatic Transaction (Success)
console.log('1. Automatic transaction with success...');
const result1 = db.transaction(() => {
  const job = db.createNode('Job', { title: 'Engineer', status: 'active' });
  const company = db.createNode('Company', { name: 'TechCorp' });
  const edge = db.createEdge('POSTED_BY', job.id, company.id);

  console.log(`Created job (ID: ${job.id}) and company (ID: ${company.id})`);

  return { job, company, edge };
});

console.log('Transaction committed automatically\n');

// 2. Automatic Rollback on Error
console.log('2. Automatic rollback on error...');
try {
  db.transaction(() => {
    const job = db.createNode('Job', { title: 'Test Job' });
    console.log(`Created job (ID: ${job.id})`);

    // This will fail - trying to create edge to non-existent node
    db.createEdge('POSTED_BY', job.id, 99999);
  });
} catch (error) {
  console.log('Transaction rolled back due to error:', (error as Error).message);
}

// Verify the node wasn't created
const testJobs = db.nodes('Job').where({ title: 'Test Job' }).exec();
console.log(`Test jobs found after rollback: ${testJobs.length}\n`);

// 3. Manual Transaction Control
console.log('3. Manual commit...');
db.transaction((ctx) => {
  const job = db.createNode('Job', { title: 'Manual Commit Job' });
  console.log(`Created job (ID: ${job.id})`);

  // Manually commit the transaction
  ctx.commit();
  console.log('Manually committed transaction\n');
});

// 4. Manual Rollback
console.log('4. Manual rollback...');
db.transaction((ctx) => {
  const job = db.createNode('Job', { title: 'Will Be Rolled Back' });
  console.log(`Created job (ID: ${job.id})`);

  // Decide to rollback
  console.log('Changed mind, rolling back...');
  ctx.rollback();
});

const rolledBackJobs = db.nodes('Job').where({ title: 'Will Be Rolled Back' }).exec();
console.log(`Jobs after manual rollback: ${rolledBackJobs.length}\n`);

// 5. Savepoints - Partial Rollback
console.log('5. Using savepoints for partial rollback...');
db.transaction((ctx) => {
  // Create first job
  const job1 = db.createNode('Job', { title: 'Job 1' });
  console.log(`Created Job 1 (ID: ${job1.id})`);

  // Create savepoint after job1
  ctx.savepoint('after_job1');

  // Create second job
  const job2 = db.createNode('Job', { title: 'Job 2' });
  console.log(`Created Job 2 (ID: ${job2.id})`);

  // Create another savepoint
  ctx.savepoint('after_job2');

  // Create third job
  const job3 = db.createNode('Job', { title: 'Job 3' });
  console.log(`Created Job 3 (ID: ${job3.id})`);

  // Rollback to after job2 was created (removes job3)
  console.log('Rolling back to after_job2...');
  ctx.rollbackTo('after_job2');

  // Create a different job3
  const job3v2 = db.createNode('Job', { title: 'Job 3 v2' });
  console.log(`Created Job 3 v2 (ID: ${job3v2.id})`);

  // Transaction will auto-commit
});

const allJobsAfterSavepoint = db.nodes('Job').exec();
const jobsAfterSavepoint = allJobsAfterSavepoint.filter(j =>
  ['Job 1', 'Job 2', 'Job 3', 'Job 3 v2'].includes(j.properties.title)
);
console.log('\nJobs after savepoint transaction:');
jobsAfterSavepoint.forEach(j => console.log(`  - ${j.properties.title}`));
console.log();

// 6. Complex Multi-Step Transaction with Error Handling
console.log('6. Complex transaction with error recovery...');
db.transaction((ctx) => {
  // Create company
  const company = db.createNode('Company', { name: 'StartupCo' });
  ctx.savepoint('company_created');

  // Create multiple jobs
  const jobs = [];
  for (let i = 1; i <= 3; i++) {
    const job = db.createNode('Job', {
      title: `Position ${i}`,
      status: 'active'
    });
    jobs.push(job);
  }

  ctx.savepoint('jobs_created');

  // Link jobs to company
  console.log('Linking jobs to company...');
  for (const job of jobs) {
    try {
      db.createEdge('POSTED_BY', job.id, company.id);
    } catch (error) {
      console.log(`Error linking job ${job.id}, rolling back to jobs_created`);
      ctx.rollbackTo('jobs_created');
      break;
    }
  }

  // Transaction will auto-commit
  console.log('Complex transaction completed successfully\n');
});

// 7. Savepoint Release
console.log('7. Releasing savepoints...');
db.transaction((ctx) => {
  const job = db.createNode('Job', { title: 'Savepoint Release Test' });

  ctx.savepoint('sp1');
  db.updateNode(job.id, { status: 'draft' });

  ctx.savepoint('sp2');
  db.updateNode(job.id, { status: 'active' });

  ctx.savepoint('sp3');
  db.updateNode(job.id, { status: 'closed' });

  // Release sp3 - can't rollback to it anymore
  ctx.releaseSavepoint('sp3');
  console.log('Released savepoint sp3');

  // Can still rollback to sp2
  ctx.rollbackTo('sp2');
  console.log('Rolled back to sp2 (before active status change)');

  const finalJob = db.getNode(job.id);
  console.log(`Final status: ${finalJob?.properties.status}\n`);
});

// 8. Nested Savepoints with Multiple Recovery Points
console.log('8. Multiple recovery points...');
db.transaction((ctx) => {
  const company = db.createNode('Company', { name: 'RecoveryCo' });
  ctx.savepoint('company');

  const job1 = db.createNode('Job', { title: 'Recovery Job 1' });
  ctx.savepoint('job1');

  const job2 = db.createNode('Job', { title: 'Recovery Job 2' });
  ctx.savepoint('job2');

  const job3 = db.createNode('Job', { title: 'Recovery Job 3' });
  ctx.savepoint('job3');

  // Simulate error on job3, rollback to job2
  console.log('Error on job3, rolling back...');
  ctx.rollbackTo('job2');

  // Continue from job2 state
  const job3Fixed = db.createNode('Job', { title: 'Recovery Job 3 Fixed' });
  console.log(`Created fixed job3: ${job3Fixed.properties.title}\n`);
});

// 9. Transaction Isolation
console.log('9. Demonstrating transaction isolation...');
console.log('Creating base data...');
const isolationJob = db.createNode('Job', { title: 'Isolation Test', views: 0 });

// Simulate concurrent transactions (in practice, use separate connections)
console.log('Transaction 1: Reading and updating views...');
db.transaction(() => {
  const job = db.getNode(isolationJob.id);
  const currentViews = job?.properties.views || 0;
  db.updateNode(isolationJob.id, { views: currentViews + 1 });
  console.log(`  Views updated from ${currentViews} to ${currentViews + 1}`);
});

const finalJob = db.getNode(isolationJob.id);
console.log(`Final view count: ${finalJob?.properties.views}\n`);

// 10. Best Practices Summary
console.log('10. Transaction best practices:');
console.log('  ✓ Use automatic transactions for simple operations');
console.log('  ✓ Use manual control for complex error handling');
console.log('  ✓ Use savepoints for partial rollbacks');
console.log('  ✓ Release savepoints when recovery points no longer needed');
console.log('  ✓ Keep transactions small and fast');
console.log('  ✓ Always handle errors appropriately\n');

// Final statistics
const stats = db.export();
console.log(`Database contains: ${stats.nodes.length} nodes, ${stats.edges.length} edges`);

db.close();
console.log('\n=== Example Complete ===');
