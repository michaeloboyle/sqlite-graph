import { describe, it, expect } from '@jest/globals';
import { GraphDatabase } from '../../src/core/Database';

/**
 * #17: transaction() inside an open transaction uses a savepoint instead of BEGIN.
 * This is what lets callers wrap many mergeNode()/mergeEdge() calls in one transaction.
 */
describe('#17 nested transactions', () => {
  it('commits inner and outer work together', () => {
    const db = new GraphDatabase(':memory:');
    db.transaction(() => {
      db.createNode('Outer', { n: 1 });
      db.transaction(() => { db.createNode('Inner', { n: 2 }); });
    });
    expect(db.nodes('Outer').count()).toBe(1);
    expect(db.nodes('Inner').count()).toBe(1);
  });

  it('rolls back only the inner work when the inner transaction throws', () => {
    const db = new GraphDatabase(':memory:');
    db.transaction(() => {
      db.createNode('Outer', { n: 1 });
      expect(() => db.transaction(() => {
        db.createNode('Inner', { n: 2 });
        throw new Error('inner failure');
      })).toThrow('inner failure');
      db.createNode('Outer', { n: 3 });
    });
    expect(db.nodes('Outer').count()).toBe(2);
    expect(db.nodes('Inner').count()).toBe(0);
  });

  it('rolls back everything when the outer transaction throws', () => {
    const db = new GraphDatabase(':memory:');
    expect(() => db.transaction(() => {
      db.transaction(() => { db.createNode('Inner', { n: 1 }); });
      throw new Error('outer failure');
    })).toThrow('outer failure');
    expect(db.nodes('Inner').count()).toBe(0);
  });

  it('lets merges run inside a caller transaction', () => {
    const db = new GraphDatabase(':memory:');
    db.transaction(() => {
      const a = db.mergeNode('Person', { key: 'a' }, { key: 'a' }).node;
      const b = db.mergeNode('Person', { key: 'b' }, { key: 'b' }).node;
      db.mergeEdge(a.id, 'KNOWS', b.id);
    });
    expect(db.nodes('Person').count()).toBe(2);
  });

  it('supports manual rollback of a nested transaction', () => {
    const db = new GraphDatabase(':memory:');
    db.transaction(() => {
      db.createNode('Outer', { n: 1 });
      db.transaction((ctx) => {
        db.createNode('Inner', { n: 2 });
        ctx.rollback();
      });
    });
    expect(db.nodes('Outer').count()).toBe(1);
    expect(db.nodes('Inner').count()).toBe(0);
  });

  it('leaves no transaction open afterwards', () => {
    const db = new GraphDatabase(':memory:');
    db.transaction(() => { db.transaction(() => { db.createNode('X', {}); }); });
    expect(db.getRawDb().inTransaction).toBe(false);
  });
});
