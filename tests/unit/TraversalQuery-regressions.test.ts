import { describe, it, expect, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GraphDatabase } from '../../src/core/Database';

/**
 * Regression specs from the 2026-11-02 benchmark.
 * Issues: #10 (cycle termination), #11 (both() nodeType), #12 (statement reuse), #13 (WAL default)
 */
describe('TraversalQuery regressions', () => {
  describe('#10 non-unique traversal terminates on cycles', () => {
    it('returns on a 2-node cycle with no maxDepth', () => {
      const db = new GraphDatabase(':memory:');
      const x = db.createNode('T', { name: 'x' });
      const y = db.createNode('T', { name: 'y' });
      db.createEdge(x.id, 'CYC', y.id);
      db.createEdge(y.id, 'CYC', x.id);

      const nodes = db.traverse(x.id).out('CYC').toArray();

      expect(nodes.map(n => n.properties.name)).toEqual(['y']);
    });

    it('never returns the start node, even when a cycle leads back to it', () => {
      const db = new GraphDatabase(':memory:');
      const x = db.createNode('T', { name: 'x' });
      const y = db.createNode('T', { name: 'y' });
      db.createEdge(x.id, 'CYC', y.id);
      db.createEdge(y.id, 'CYC', x.id);

      const nodes = db.traverse(x.id).out('CYC').maxDepth(6).toArray();

      expect(nodes.some(n => n.id === x.id)).toBe(false);
    });

    it('still returns a node once per distinct path without unique()', () => {
      const db = new GraphDatabase(':memory:');
      const a = db.createNode('T', { name: 'a' });
      const b = db.createNode('T', { name: 'b' });
      const c = db.createNode('T', { name: 'c' });
      const d = db.createNode('T', { name: 'd' });
      db.createEdge(a.id, 'E', b.id);
      db.createEdge(a.id, 'E', c.id);
      db.createEdge(b.id, 'E', d.id);
      db.createEdge(c.id, 'E', d.id);

      const names = db.traverse(a.id).out('E').maxDepth(2).toArray().map(n => n.properties.name).sort();

      expect(names).toEqual(['b', 'c', 'd', 'd']);
    });

    it('follows each step once when maxDepth is not set', () => {
      const db = new GraphDatabase(':memory:');
      const ids = Array.from({ length: 20 }, (_, i) => db.createNode('T', { i }).id);
      ids.forEach((id, i) => {
        for (let j = 1; j <= 3; j++) db.createEdge(id, 'E', ids[(i + j) % ids.length]);
      });

      expect(db.traverse(ids[0]).out('E').toArray()).toHaveLength(3);
    });

    it('reaches minDepth when maxDepth is not set', () => {
      const db = new GraphDatabase(':memory:');
      const ids = Array.from({ length: 5 }, (_, i) => db.createNode('T', { name: `c${i}` }).id);
      for (let i = 0; i < ids.length - 1; i++) db.createEdge(ids[i], 'NEXT', ids[i + 1]);

      const names = db.traverse(ids[0]).out('NEXT').minDepth(2).toArray().map(n => n.properties.name);

      expect(names).toEqual(['c2']);
    });
  });

  describe('#11 both() honours nodeType', () => {
    it('returns only neighbours of the requested type, in both directions', () => {
      const db = new GraphDatabase(':memory:');
      const a = db.createNode('Person', { name: 'a' });
      const p = db.createNode('Person', { name: 'p' });
      const pIn = db.createNode('Person', { name: 'pIn' });
      const c = db.createNode('Company', { name: 'c' });
      const c2 = db.createNode('Company', { name: 'c2' });
      db.createEdge(a.id, 'LINK', p.id);
      db.createEdge(pIn.id, 'LINK', a.id);
      db.createEdge(a.id, 'LINK', c.id);
      db.createEdge(c2.id, 'LINK', a.id);

      const names = db.traverse(a.id).both('LINK', 'Person').maxDepth(1).toArray()
        .map(n => n.properties.name).sort();

      expect(names).toEqual(['p', 'pIn']);
    });
  });

  describe('#12 traversal reuses prepared statements', () => {
    it('prepares a bounded number of statements regardless of graph size', () => {
      const db = new GraphDatabase(':memory:');
      const ids = Array.from({ length: 50 }, (_, i) => db.createNode('T', { i }).id);
      for (let i = 0; i < ids.length - 1; i++) db.createEdge(ids[i], 'NEXT', ids[i + 1]);

      const raw = db.getRawDb();
      const original = raw.prepare.bind(raw);
      let prepares = 0;
      (raw as any).prepare = (sql: string) => { prepares++; return original(sql); };

      const nodes = db.traverse(ids[0]).out('NEXT').maxDepth(100).toArray();
      db.traverse(ids[0]).shortestPath(ids[49]);

      (raw as any).prepare = original;
      expect(nodes).toHaveLength(49);
      expect(prepares).toBeLessThanOrEqual(4);
    });
  });

  describe('#13 file databases default to WAL', () => {
    const files: string[] = [];
    const tmp = (name: string) => {
      const f = path.join(os.tmpdir(), `sg-wal-${process.pid}-${name}.db`);
      files.push(f, f + '-wal', f + '-shm');
      return f;
    };
    afterEach(() => { for (const f of files.splice(0)) if (fs.existsSync(f)) fs.unlinkSync(f); });

    it('uses WAL and synchronous=NORMAL for a file database', () => {
      const db = new GraphDatabase(tmp('default'));
      const raw = db.getRawDb();
      expect(raw.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(raw.pragma('synchronous', { simple: true })).toBe(1);
      db.close();
    });

    it('keeps the SQLite defaults when wal is false', () => {
      const db = new GraphDatabase(tmp('optout'), { wal: false });
      expect(db.getRawDb().pragma('journal_mode', { simple: true })).toBe('delete');
      db.close();
    });

    it('leaves in-memory databases alone', () => {
      const db = new GraphDatabase(':memory:');
      expect(db.getRawDb().pragma('journal_mode', { simple: true })).toBe('memory');
    });
  });
});
