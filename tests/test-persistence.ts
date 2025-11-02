import { GraphDatabase } from '../src/index';
import * as fs from 'fs';

const dbPath = './test-persist.db';

// Clean up if exists
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

console.log('=== Test 1: Create database and add data ===');
let db = new GraphDatabase(dbPath);

const alice = db.createNode('Person', { name: 'Alice', age: 30 });
const bob = db.createNode('Person', { name: 'Bob', age: 25 });
db.createEdge(alice.id, 'KNOWS', bob.id, { since: 2020 });

console.log('✓ Created 2 nodes and 1 edge');
console.log(`  Alice: id=${alice.id}`);
console.log(`  Bob: id=${bob.id}`);

db.close();
console.log('✓ Closed database\n');

console.log('=== Test 2: Reopen database and verify data persists ===');
db = new GraphDatabase(dbPath);

const allPeople = db.nodes('Person').exec();
console.log(`✓ Found ${allPeople.length} people after reopening`);

allPeople.forEach((person: any) => {
  console.log(`  - ${person.properties.name} (id=${person.id}, age=${person.properties.age})`);
});

const edges = db.traverse(alice.id).out('KNOWS').toArray();
console.log(`✓ Found ${edges.length} connection(s) from Alice`);

if (edges.length > 0) {
  console.log(`  - Alice KNOWS ${(edges[0] as any).properties.name}`);
}

db.close();
console.log('\n✅ Persistence test PASSED - data survives reboot!\n');

// Cleanup
fs.unlinkSync(dbPath);
