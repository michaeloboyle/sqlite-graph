/**
 * PatternQuery Unit Tests (TDD Red -> Green -> Refactor)
 * Phase 3: Pattern Matching Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GraphDatabase } from '../../src/core/Database';
import { PatternQuery } from '../../src/query/PatternQuery';
import { PatternError } from '../../src/types/pattern';

describe('PatternQuery', () => {
  let db: GraphDatabase;

  beforeEach(() => {
    db = new GraphDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('Pattern Builder - Basic Structure', () => {
    it('should create a pattern query from database', () => {
      const pattern = db.pattern();
      expect(pattern).toBeInstanceOf(PatternQuery);
    });

    it('should support start() method with node type', () => {
      const pattern = db.pattern().start('person', 'Person');
      expect(pattern).toBeDefined();
    });

    it('should support through() method for edge traversal', () => {
      const pattern = db.pattern()
        .start('person', 'Person')
        .through('KNOWS', 'out');
      expect(pattern).toBeDefined();
    });

    it('should support node() method for intermediate nodes', () => {
      const pattern = db.pattern()
        .start('person', 'Person')
        .through('KNOWS', 'out')
        .node('friend', 'Person');
      expect(pattern).toBeDefined();
    });

    it('should support end() method for terminal node', () => {
      const pattern = db.pattern()
        .start('person', 'Person')
        .through('KNOWS', 'out')
        .end('friend', 'Person');
      expect(pattern).toBeDefined();
    });

    it('should support method chaining', () => {
      const pattern = db.pattern()
        .start('person', 'Person')
        .through('WORKS_AT', 'out')
        .end('company', 'Company')
        .where({ person: { age: { $gte: 18 } } })
        .select(['person', 'company'])
        .limit(10);
      expect(pattern).toBeDefined();
    });
  });

  describe('Simple 2-Hop Pattern', () => {
    beforeEach(() => {
      // Create test data: Person -> WORKS_AT -> Company
      const person = db.createNode('Person', { name: 'Alice', age: 30 });
      const company = db.createNode('Company', { name: 'TechCorp' });
      db.createEdge(person.id, 'WORKS_AT', company.id);
    });

    it('should find person connected to company via WORKS_AT', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .through('WORKS_AT', 'out')
        .end('company', 'Company')
        .exec();

      expect(results).toHaveLength(1);
      expect(results[0].person).toBeDefined();
      expect(results[0].company).toBeDefined();
      expect(results[0].person.properties.name).toBe('Alice');
      expect(results[0].company.properties.name).toBe('TechCorp');
    });

    it('should include metadata in results', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .through('WORKS_AT', 'out')
        .end('company', 'Company')
        .exec();

      expect(results[0]._meta).toBeDefined();
      expect(results[0]._meta.pathLength).toBe(1);
      expect(results[0]._meta.executionTime).toBeGreaterThan(0);
    });

    it('should return empty array when no matches', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .through('KNOWS', 'out') // No KNOWS edges exist
        .end('friend', 'Person')
        .exec();

      expect(results).toEqual([]);
    });
  });

  describe('Direction Handling', () => {
    beforeEach(() => {
      const job = db.createNode('Job', { title: 'Engineer' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      db.createEdge(job.id, 'POSTED_BY', company.id);
    });

    it('should traverse edges in "out" direction', () => {
      const results = db.pattern()
        .start('job', 'Job')
        .through('POSTED_BY', 'out')
        .end('company', 'Company')
        .exec();

      expect(results).toHaveLength(1);
      expect(results[0].job.properties.title).toBe('Engineer');
    });

    it('should traverse edges in "in" direction', () => {
      const results = db.pattern()
        .start('company', 'Company')
        .through('POSTED_BY', 'in')
        .end('job', 'Job')
        .exec();

      expect(results).toHaveLength(1);
      expect(results[0].job.properties.title).toBe('Engineer');
    });

    it('should traverse edges in "both" directions', () => {
      const person1 = db.createNode('Person', { name: 'Alice' });
      const person2 = db.createNode('Person', { name: 'Bob' });
      db.createEdge(person1.id, 'KNOWS', person2.id);

      const results = db.pattern()
        .start('person', 'Person')
        .where({ person: { name: 'Bob' } })
        .through('KNOWS', 'both')
        .end('friend', 'Person')
        .exec();

      expect(results).toHaveLength(1);
      expect(results[0].friend.properties.name).toBe('Alice');
    });
  });

  describe('Filtering with where()', () => {
    beforeEach(() => {
      db.createNode('Person', { name: 'Alice', age: 25 });
      db.createNode('Person', { name: 'Bob', age: 35 });
      db.createNode('Person', { name: 'Charlie', age: 45 });
    });

    it('should filter with exact match', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .where({ person: { name: 'Alice' } })
        .exec() as any[];

      expect(results).toHaveLength(1);
      expect(results[0].person.properties.name).toBe('Alice');
    });

    it('should filter with $gte operator', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .where({ person: { age: { $gte: 35 } } })
        .exec() as any[];

      expect(results).toHaveLength(2);
      expect(results.every((r: any) => (r.person.properties.age as number) >= 35)).toBe(true);
    });

    it('should filter with $lt operator', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .where({ person: { age: { $lt: 30 } } })
        .exec() as any[];

      expect(results).toHaveLength(1);
      expect(results[0].person.properties.name).toBe('Alice');
    });

    it('should filter with $in operator', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .where({ person: { name: { $in: ['Alice', 'Charlie'] } } })
        .exec();

      expect(results).toHaveLength(2);
    });

    it('should filter with $ne operator', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .where({ person: { name: { $ne: 'Bob' } } })
        .exec() as any[];

      expect(results).toHaveLength(2);
      expect(results.every((r: any) => r.person.properties.name !== 'Bob')).toBe(true);
    });
  });

  describe('Variable Selection with select()', () => {
    beforeEach(() => {
      const person = db.createNode('Person', { name: 'Alice' });
      const company = db.createNode('Company', { name: 'TechCorp' });
      db.createEdge(person.id, 'WORKS_AT', company.id);
    });

    it('should return all variables when select() not called', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .through('WORKS_AT', 'out')
        .end('company', 'Company')
        .exec();

      expect(results[0]).toHaveProperty('person');
      expect(results[0]).toHaveProperty('company');
      expect(results[0]).toHaveProperty('_meta');
    });

    it('should return only selected variables', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .through('WORKS_AT', 'out')
        .end('company', 'Company')
        .select(['company'])
        .exec();

      expect(results[0]).toHaveProperty('company');
      expect(results[0]).not.toHaveProperty('person');
      expect(results[0]).toHaveProperty('_meta');
    });
  });

  describe('Pagination and Ordering', () => {
    beforeEach(() => {
      for (let i = 1; i <= 10; i++) {
        db.createNode('Person', { name: `Person${i}`, age: 20 + i });
      }
    });

    it('should support limit()', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .limit(5)
        .exec();

      expect(results).toHaveLength(5);
    });

    it('should support offset()', () => {
      const allResults = db.pattern().start('person', 'Person').exec() as any[];
      const offsetResults = db.pattern().start('person', 'Person').offset(5).exec() as any[];

      expect(offsetResults).toHaveLength(5);
      expect(offsetResults[0].person.id).toBe(allResults[5].person.id);
    });

    it('should support orderBy() ascending', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .orderBy('person', 'age', 'asc')
        .exec() as any[];

      expect(results[0].person.properties.age).toBe(21);
      expect(results[results.length - 1].person.properties.age).toBe(30);
    });

    it('should support orderBy() descending', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .orderBy('person', 'age', 'desc')
        .exec() as any[];

      expect(results[0].person.properties.age).toBe(30);
      expect(results[results.length - 1].person.properties.age).toBe(21);
    });
  });

  describe('Helper Methods', () => {
    beforeEach(() => {
      db.createNode('Person', { name: 'Alice' });
      db.createNode('Person', { name: 'Bob' });
    });

    it('should support first() to return single result', () => {
      const result = db.pattern()
        .start('person', 'Person')
        .where({ person: { name: 'Alice' } })
        .first() as any;

      expect(result).not.toBeNull();
      expect(result?.person.properties.name).toBe('Alice');
    });

    it('should return null from first() when no matches', () => {
      const result = db.pattern()
        .start('person', 'Person')
        .where({ person: { name: 'NonExistent' } })
        .first();

      expect(result).toBeNull();
    });

    it('should support count() to return match count', () => {
      const count = db.pattern()
        .start('person', 'Person')
        .count();

      expect(count).toBe(2);
    });

    it('should return 0 from count() when no matches', () => {
      const count = db.pattern()
        .start('person', 'NonExistentType')
        .count();

      expect(count).toBe(0);
    });
  });

  describe('Multi-Hop Patterns', () => {
    beforeEach(() => {
      // Create: Person -> KNOWS -> Friend -> WORKS_AT -> Company
      const person = db.createNode('Person', { name: 'Alice' });
      const friend = db.createNode('Person', { name: 'Bob' });
      const company = db.createNode('Company', { name: 'TechCorp' });

      db.createEdge(person.id, 'KNOWS', friend.id);
      db.createEdge(friend.id, 'WORKS_AT', company.id);
    });

    it('should handle 3-hop pattern', () => {
      const results = db.pattern()
        .start('person', 'Person')
        .where({ person: { name: 'Alice' } })
        .through('KNOWS', 'out')
        .node('friend', 'Person')
        .through('WORKS_AT', 'out')
        .end('company', 'Company')
        .exec();

      expect(results).toHaveLength(1);
      expect(results[0].person.properties.name).toBe('Alice');
      expect(results[0].friend.properties.name).toBe('Bob');
      expect(results[0].company.properties.name).toBe('TechCorp');
      expect(results[0]._meta.pathLength).toBe(2);
    });
  });

  describe('Cyclic Patterns', () => {
    it('should detect mutual relationships', () => {
      const alice = db.createNode('Person', { name: 'Alice' });
      const bob = db.createNode('Person', { name: 'Bob' });

      // Mutual recommendations
      db.createEdge(alice.id, 'RECOMMENDS', bob.id);
      db.createEdge(bob.id, 'RECOMMENDS', alice.id);

      const results = db.pattern()
        .start('personA', 'Person')
        .through('RECOMMENDS', 'out')
        .node('personB', 'Person')
        .through('RECOMMENDS', 'out')
        .end('personA') // Cyclic reference
        .exec();

      expect(results).toHaveLength(1);
      expect(results[0].personA).toBeDefined();
      expect(results[0].personB).toBeDefined();
      expect(results[0].personA.id).not.toBe(results[0].personB.id);
    });
  });

  describe('Error Handling', () => {
    it('should throw PatternError for invalid pattern (missing through)', () => {
      expect(() => {
        db.pattern()
          .start('person', 'Person')
          .end('company', 'Company') // Missing .through()
          .exec();
      }).toThrow(PatternError);
    });

    it('should throw PatternError for undefined variable in select', () => {
      expect(() => {
        db.pattern()
          .start('person', 'Person')
          .select(['nonExistent'])
          .exec();
      }).toThrow(PatternError);
    });

    it('should throw PatternError for invalid direction', () => {
      expect(() => {
        db.pattern()
          .start('person', 'Person')
          .through('KNOWS', 'sideways' as any)
          .exec();
      }).toThrow(PatternError);
    });
  });
});
