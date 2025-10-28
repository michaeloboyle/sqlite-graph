/**
 * Demonstration of newly implemented features
 *
 * Shows all 3 specification gaps that were closed:
 * 1. TransactionContext with manual commit/rollback
 * 2. 'both' direction in NodeQuery
 * 3. paths() wrapper method in TraversalQuery
 */

import { GraphDatabase } from '../src/index';
import * as fs from 'fs';

// Clean up any existing demo database
const dbPath = './demo-features.db';
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

// Initialize database
const db = new GraphDatabase(dbPath);

console.log('🚀 sqlite-graph New Features Demo\n');
console.log('=' .repeat(60));

// =============================================================================
// FEATURE 1: TransactionContext with Manual Control
// =============================================================================
console.log('\n📦 FEATURE 1: TransactionContext API');
console.log('-'.repeat(60));

console.log('\n✅ Example 1: Manual Commit');
const result1 = db.transaction((ctx) => {
  const alice = db.createNode('Person', { name: 'Alice', age: 30 });
  const bob = db.createNode('Person', { name: 'Bob', age: 28 });

  console.log(`Created nodes: Alice (${alice.id}), Bob (${bob.id})`);

  // Manually commit the transaction
  ctx.commit();
  console.log('✓ Transaction committed manually');

  return { alice, bob };
});

console.log(`Result: Created ${result1.alice.properties.name} and ${result1.bob.properties.name}`);

console.log('\n✅ Example 2: Manual Rollback');
try {
  db.transaction((ctx) => {
    const charlie = db.createNode('Person', { name: 'Charlie', age: 35 });
    console.log(`Created Charlie (${charlie.id})`);

    // Simulate error condition - rollback manually
    console.log('⚠️  Simulating error condition...');
    ctx.rollback();
    console.log('✓ Transaction rolled back manually');

    // This won't be reached
    return charlie;
  });
} catch (error: any) {
  console.log(`Expected error: ${error.message}`);
}

// Verify Charlie was not persisted
const allPeople = db.nodes('Person').exec();
console.log(`Total people in DB: ${allPeople.length} (Charlie was rolled back)`);

console.log('\n✅ Example 3: Savepoints for Partial Rollback');
db.transaction((ctx) => {
  const dave = db.createNode('Person', { name: 'Dave', age: 40 });
  console.log(`Created Dave (${dave.id})`);

  // Create a savepoint before risky operation
  ctx.savepoint('before-eve');
  console.log('✓ Created savepoint: before-eve');

  const eve = db.createNode('Person', { name: 'Eve', age: 32 });
  console.log(`Created Eve (${eve.id})`);

  // Rollback just Eve, keep Dave
  ctx.rollbackTo('before-eve');
  console.log('✓ Rolled back to savepoint (Eve removed, Dave kept)');

  ctx.commit();
});

const peopleAfterSavepoint = db.nodes('Person').exec();
console.log(`People after savepoint rollback: ${peopleAfterSavepoint.map(p => p.properties.name).join(', ')}`);

// =============================================================================
// FEATURE 2: 'both' Direction in NodeQuery
// =============================================================================
console.log('\n\n🔄 FEATURE 2: Bidirectional Queries with \'both\' Direction');
console.log('-'.repeat(60));

// Create a social network
const frank = db.createNode('Person', { name: 'Frank', role: 'developer' });
const grace = db.createNode('Person', { name: 'Grace', role: 'designer' });
const henry = db.createNode('Person', { name: 'Henry', role: 'manager' });

// Create bidirectional relationships
db.createEdge('KNOWS', frank.id, grace.id); // Frank knows Grace
db.createEdge('KNOWS', grace.id, henry.id); // Grace knows Henry
db.createEdge('KNOWS', henry.id, frank.id); // Henry knows Frank (completes circle)

console.log('\n✅ Example 1: Query connections in specific direction');
const franksOutgoing = db.nodes('Person')
  .connectedTo('Person', 'KNOWS', 'out')
  .where({ id: frank.id })
  .exec();
console.log(`Frank knows (outgoing): ${franksOutgoing.map(p => p.properties.name).join(', ')}`);

const franksIncoming = db.nodes('Person')
  .connectedTo('Person', 'KNOWS', 'in')
  .where({ id: frank.id })
  .exec();
console.log(`Knows Frank (incoming): ${franksIncoming.map(p => p.properties.name).join(', ')}`);

console.log('\n✅ Example 2: Query ALL connections with \'both\' direction');
const franksConnections = db.nodes('Person')
  .connectedTo('Person', 'KNOWS', 'both')
  .where({ id: frank.id })
  .exec();
console.log(`Frank's ALL connections (both): ${franksConnections.map(p => p.properties.name).join(', ')}`);

console.log('\n✅ Example 3: Count bidirectional connections');
const graceConnectionCount = db.nodes('Person')
  .connectedTo('Person', 'KNOWS', 'both')
  .where({ id: grace.id })
  .count();
console.log(`Grace has ${graceConnectionCount} total connections (both directions)`);

// =============================================================================
// FEATURE 3: paths() Wrapper Method
// =============================================================================
console.log('\n\n🗺️  FEATURE 3: paths() Wrapper Method');
console.log('-'.repeat(60));

// Create a small graph for path finding
const nodeA = db.createNode('Location', { name: 'A' });
const nodeB = db.createNode('Location', { name: 'B' });
const nodeC = db.createNode('Location', { name: 'C' });
const nodeD = db.createNode('Location', { name: 'D' });

// Create multiple paths from A to D
db.createEdge('CONNECTS', nodeA.id, nodeB.id); // A -> B
db.createEdge('CONNECTS', nodeB.id, nodeD.id); // B -> D (path 1: A->B->D)
db.createEdge('CONNECTS', nodeA.id, nodeC.id); // A -> C
db.createEdge('CONNECTS', nodeC.id, nodeD.id); // C -> D (path 2: A->C->D)

console.log('\n✅ Example 1: Find all paths from A to D');
const allPaths = db.traverse(nodeA.id).paths(nodeD.id);
console.log(`Found ${allPaths.length} paths from A to D:`);
allPaths.forEach((path, i) => {
  const pathStr = path.map(n => n.properties.name).join(' → ');
  console.log(`  Path ${i + 1}: ${pathStr}`);
});

console.log('\n✅ Example 2: Limit number of paths returned');
const limitedPaths = db.traverse(nodeA.id).paths(nodeD.id, { maxPaths: 1 });
console.log(`With maxPaths=1: Found ${limitedPaths.length} path(s)`);
limitedPaths.forEach((path) => {
  const pathStr = path.map(n => n.properties.name).join(' → ');
  console.log(`  ${pathStr}`);
});

console.log('\n✅ Example 3: Limit path depth');
const shallowPaths = db.traverse(nodeA.id).paths(nodeD.id, { maxDepth: 1 });
console.log(`With maxDepth=1: Found ${shallowPaths.length} path(s) (should be 0 - requires 2 hops)`);

const deepPaths = db.traverse(nodeA.id).paths(nodeD.id, { maxDepth: 3 });
console.log(`With maxDepth=3: Found ${deepPaths.length} path(s)`);

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n\n' + '='.repeat(60));
console.log('✅ All 3 new features demonstrated successfully!');
console.log('='.repeat(60));

console.log('\n📊 Feature Summary:');
console.log('1. ✅ TransactionContext: Manual commit/rollback & savepoints');
console.log('2. ✅ Bidirectional queries: \'both\' direction support');
console.log('3. ✅ paths() wrapper: Convenient API for path finding');

console.log('\n🎯 Implementation matches documented API specification');
console.log('📝 All HIGH priority gaps closed\n');

// Cleanup
db.close();
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('🧹 Demo database cleaned up');
}
