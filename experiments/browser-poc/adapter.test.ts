/**
 * TDD: Tests for SQLiteAdapter interface
 * Write tests FIRST, then implement adapters to pass these tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SQLiteAdapter } from './adapter-interface.js';
import { NodeAdapter } from './node-adapter.js';
// BrowserAdapter tests will run separately in browser environment

describe('SQLiteAdapter Interface Compliance', () => {
  let adapter: SQLiteAdapter;
  const testDbPath = ':memory:'; // Use in-memory for tests

  afterEach(async () => {
    if (adapter && adapter.isOpen()) {
      await adapter.close();
    }
  });

  describe('NodeAdapter', () => {
    beforeEach(async () => {
      adapter = await NodeAdapter.create(testDbPath);
    });

    describe('Basic Operations', () => {
      it('should create and open a database', async () => {
        expect(adapter.isOpen()).toBe(true);
      });

      it('should close a database', async () => {
        await adapter.close();
        expect(adapter.isOpen()).toBe(false);
      });

      it('should execute SQL statements', async () => {
        await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        // Should not throw
      });

      it('should prepare statements', async () => {
        await adapter.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
        const stmt = await adapter.prepare('INSERT INTO test (name) VALUES (?)');
        expect(stmt).toBeDefined();
        expect(typeof stmt.run).toBe('function');
      });
    });

    describe('CRUD Operations', () => {
      beforeEach(async () => {
        await adapter.exec(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            age INTEGER
          )
        `);
      });

      it('should insert data and return lastInsertRowid', async () => {
        const stmt = await adapter.prepare('INSERT INTO users (name, email, age) VALUES (?, ?, ?)');
        const result = stmt.run('Alice', 'alice@example.com', 30);

        expect(result.changes).toBe(1);
        expect(result.lastInsertRowid).toBeDefined();
        expect(Number(result.lastInsertRowid)).toBeGreaterThan(0);
      });

      it('should select single row with get()', async () => {
        const insertStmt = await adapter.prepare('INSERT INTO users (name, email) VALUES (?, ?)');
        insertStmt.run('Bob', 'bob@example.com');

        const selectStmt = await adapter.prepare('SELECT * FROM users WHERE name = ?');
        const row = selectStmt.get('Bob');

        expect(row).toBeDefined();
        expect(row.name).toBe('Bob');
        expect(row.email).toBe('bob@example.com');
      });

      it('should select multiple rows with all()', async () => {
        const insertStmt = await adapter.prepare('INSERT INTO users (name, age) VALUES (?, ?)');
        insertStmt.run('Charlie', 25);
        insertStmt.run('Diana', 30);
        insertStmt.run('Eve', 35);

        const selectStmt = await adapter.prepare('SELECT * FROM users WHERE age >= ?');
        const rows = selectStmt.all(30);

        expect(rows).toHaveLength(2);
        expect(rows[0].name).toBe('Diana');
        expect(rows[1].name).toBe('Eve');
      });

      it('should update data', async () => {
        const insertStmt = await adapter.prepare('INSERT INTO users (name, age) VALUES (?, ?)');
        insertStmt.run('Frank', 40);

        const updateStmt = await adapter.prepare('UPDATE users SET age = ? WHERE name = ?');
        const result = updateStmt.run(41, 'Frank');

        expect(result.changes).toBe(1);

        const selectStmt = await adapter.prepare('SELECT age FROM users WHERE name = ?');
        const row = selectStmt.get('Frank');
        expect(row.age).toBe(41);
      });

      it('should delete data', async () => {
        const insertStmt = await adapter.prepare('INSERT INTO users (name) VALUES (?)');
        insertStmt.run('Grace');

        const deleteStmt = await adapter.prepare('DELETE FROM users WHERE name = ?');
        const result = deleteStmt.run('Grace');

        expect(result.changes).toBe(1);

        const selectStmt = await adapter.prepare('SELECT * FROM users WHERE name = ?');
        const row = selectStmt.get('Grace');
        expect(row).toBeUndefined();
      });
    });

    describe('Transactions', () => {
      beforeEach(async () => {
        await adapter.exec('CREATE TABLE accounts (id INTEGER PRIMARY KEY, balance INTEGER)');
      });

      it('should commit successful transactions', async () => {
        await adapter.transaction(async () => {
          const stmt = await adapter.prepare('INSERT INTO accounts (balance) VALUES (?)');
          stmt.run(100);
          stmt.run(200);
        });

        const stmt = await adapter.prepare('SELECT COUNT(*) as count FROM accounts');
        const row = stmt.get();
        expect(row.count).toBe(2);
      });

      it('should rollback failed transactions', async () => {
        try {
          await adapter.transaction(async () => {
            const stmt = await adapter.prepare('INSERT INTO accounts (balance) VALUES (?)');
            stmt.run(100);
            throw new Error('Intentional error');
          });
        } catch (error) {
          // Expected error
        }

        const stmt = await adapter.prepare('SELECT COUNT(*) as count FROM accounts');
        const row = stmt.get();
        expect(row.count).toBe(0); // Transaction rolled back
      });

      it('should handle nested operations in transactions', async () => {
        await adapter.transaction(async () => {
          const insertStmt = await adapter.prepare('INSERT INTO accounts (balance) VALUES (?)');
          insertStmt.run(500);

          const updateStmt = await adapter.prepare('UPDATE accounts SET balance = balance + ?');
          updateStmt.run(50);
        });

        const stmt = await adapter.prepare('SELECT balance FROM accounts');
        const row = stmt.get();
        expect(row.balance).toBe(550);
      });
    });

    describe('PRAGMA operations', () => {
      it('should get PRAGMA values', async () => {
        const journalMode = await adapter.pragma('journal_mode');
        expect(journalMode).toBeDefined();
      });

      it('should set PRAGMA values', async () => {
        await adapter.pragma('journal_mode', 'WAL');
        const journalMode = await adapter.pragma('journal_mode');
        expect(journalMode).toBeTruthy();
        // Note: journal_mode might not change for :memory: databases
      });
    });
  });
});

describe('Graph Database Operations (Integration)', () => {
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    adapter = await NodeAdapter.create(':memory:');

    // Create graph schema
    await adapter.exec(`
      CREATE TABLE nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        properties TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        to_id INTEGER NOT NULL,
        properties TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (from_id) REFERENCES nodes(id),
        FOREIGN KEY (to_id) REFERENCES nodes(id)
      );

      CREATE INDEX idx_nodes_type ON nodes(type);
      CREATE INDEX idx_edges_from ON edges(from_id);
      CREATE INDEX idx_edges_to ON edges(to_id);
    `);
  });

  afterEach(async () => {
    if (adapter && adapter.isOpen()) {
      await adapter.close();
    }
  });

  it('should create nodes with JSON properties', async () => {
    const properties = { title: 'Software Engineer', salary: 120000, remote: true };
    const stmt = await adapter.prepare(
      'INSERT INTO nodes (type, properties) VALUES (?, ?)'
    );
    const result = stmt.run('Job', JSON.stringify(properties));

    expect(result.lastInsertRowid).toBeDefined();

    const selectStmt = await adapter.prepare('SELECT * FROM nodes WHERE id = ?');
    const node = selectStmt.get(result.lastInsertRowid);

    expect(node.type).toBe('Job');
    expect(JSON.parse(node.properties)).toEqual(properties);
  });

  it('should create edges between nodes', async () => {
    // Create nodes
    const jobStmt = await adapter.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');
    const jobResult = jobStmt.run('Job', JSON.stringify({ title: 'Engineer' }));

    const companyStmt = await adapter.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');
    const companyResult = companyStmt.run('Company', JSON.stringify({ name: 'TechCorp' }));

    // Create edge
    const edgeStmt = await adapter.prepare(
      'INSERT INTO edges (from_id, type, to_id) VALUES (?, ?, ?)'
    );
    const edgeResult = edgeStmt.run(jobResult.lastInsertRowid, 'POSTED_BY', companyResult.lastInsertRowid);

    expect(edgeResult.lastInsertRowid).toBeDefined();

    // Verify edge
    const selectStmt = await adapter.prepare('SELECT * FROM edges WHERE id = ?');
    const edge = selectStmt.get(edgeResult.lastInsertRowid);

    expect(edge.from_id).toEqual(jobResult.lastInsertRowid);
    expect(edge.type).toBe('POSTED_BY');
    expect(edge.to_id).toEqual(companyResult.lastInsertRowid);
  });

  it('should query connected nodes', async () => {
    // Create graph: Job -> POSTED_BY -> Company
    const jobStmt = await adapter.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');
    const job1 = jobStmt.run('Job', JSON.stringify({ title: 'Engineer' }));
    const job2 = jobStmt.run('Job', JSON.stringify({ title: 'Designer' }));

    const companyStmt = await adapter.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');
    const company = companyStmt.run('Company', JSON.stringify({ name: 'TechCorp' }));

    const edgeStmt = await adapter.prepare('INSERT INTO edges (from_id, type, to_id) VALUES (?, ?, ?)');
    edgeStmt.run(job1.lastInsertRowid, 'POSTED_BY', company.lastInsertRowid);
    edgeStmt.run(job2.lastInsertRowid, 'POSTED_BY', company.lastInsertRowid);

    // Query: Find all jobs posted by company
    const queryStmt = await adapter.prepare(`
      SELECT n.* FROM nodes n
      JOIN edges e ON n.id = e.from_id
      WHERE e.to_id = ? AND e.type = ?
    `);
    const jobs = queryStmt.all(company.lastInsertRowid, 'POSTED_BY');

    expect(jobs).toHaveLength(2);
    expect(jobs.every((j: any) => j.type === 'Job')).toBe(true);
  });

  it('should perform graph traversal (BFS simulation)', async () => {
    // Create chain: A -> B -> C -> D
    const nodeStmt = await adapter.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');
    const a = nodeStmt.run('Node', JSON.stringify({ name: 'A' }));
    const b = nodeStmt.run('Node', JSON.stringify({ name: 'B' }));
    const c = nodeStmt.run('Node', JSON.stringify({ name: 'C' }));
    const d = nodeStmt.run('Node', JSON.stringify({ name: 'D' }));

    const edgeStmt = await adapter.prepare('INSERT INTO edges (from_id, type, to_id) VALUES (?, ?, ?)');
    edgeStmt.run(a.lastInsertRowid, 'CONNECTS', b.lastInsertRowid);
    edgeStmt.run(b.lastInsertRowid, 'CONNECTS', c.lastInsertRowid);
    edgeStmt.run(c.lastInsertRowid, 'CONNECTS', d.lastInsertRowid);

    // Traverse from A to find all connected nodes
    const traverseStmt = await adapter.prepare(`
      WITH RECURSIVE traverse(id, depth) AS (
        SELECT ?, 0
        UNION ALL
        SELECT e.to_id, t.depth + 1
        FROM traverse t
        JOIN edges e ON t.id = e.from_id
        WHERE t.depth < 3
      )
      SELECT DISTINCT n.*, t.depth
      FROM traverse t
      JOIN nodes n ON t.id = n.id
      ORDER BY t.depth
    `);
    const path = traverseStmt.all(a.lastInsertRowid);

    expect(path).toHaveLength(4);
    expect(JSON.parse(path[0].properties).name).toBe('A');
    expect(JSON.parse(path[3].properties).name).toBe('D');
  });

  it('should handle bulk operations in transactions', async () => {
    const startTime = Date.now();

    await adapter.transaction(async () => {
      const stmt = await adapter.prepare('INSERT INTO nodes (type, properties) VALUES (?, ?)');

      for (let i = 0; i < 1000; i++) {
        stmt.run('TestNode', JSON.stringify({ index: i }));
      }
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should complete in reasonable time (< 1 second for 1000 inserts)
    expect(duration).toBeLessThan(1000);

    const countStmt = await adapter.prepare('SELECT COUNT(*) as count FROM nodes');
    const result = countStmt.get();
    expect(result.count).toBe(1000);
  });
});
