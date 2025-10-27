import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GraphDatabase } from '../../src/core/Database';
import { TransactionContext } from '../../src/core/Transaction';
import * as fs from 'fs';

describe('TransactionContext', () => {
  let db: GraphDatabase;
  const testDbPath = ':memory:';

  beforeEach(() => {
    db = new GraphDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
  });

  describe('Automatic commit/rollback', () => {
    it('should automatically commit successful transactions', () => {
      let contextReceived: TransactionContext | null = null;

      db.transaction((ctx) => {
        contextReceived = ctx;
        db.createNode('Job', { title: 'Test Job' });
      });

      expect(contextReceived).toBeInstanceOf(TransactionContext);

      // Verify node was committed
      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].properties.title).toBe('Test Job');
    });

    it('should automatically rollback on error', () => {
      expect(() => {
        db.transaction((ctx) => {
          db.createNode('Job', { title: 'Test Job' });
          throw new Error('Intentional error');
        });
      }).toThrow('Intentional error');

      // Verify node was NOT committed
      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(0);
    });
  });

  describe('Manual commit', () => {
    it('should allow manual commit with ctx.commit()', () => {
      db.transaction((ctx) => {
        db.createNode('Job', { title: 'Job 1' });
        ctx.commit();
        // Transaction is now finalized
      });

      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(1);
    });

    it('should throw error if commit() called twice', () => {
      expect(() => {
        db.transaction((ctx) => {
          db.createNode('Job', { title: 'Job 1' });
          ctx.commit();
          ctx.commit(); // Second commit should fail
        });
      }).toThrow('Transaction already finalized');
    });

    it('should throw error if commit() called after rollback()', () => {
      expect(() => {
        db.transaction((ctx) => {
          db.createNode('Job', { title: 'Job 1' });
          ctx.rollback();
          ctx.commit(); // Should fail
        });
      }).toThrow('Transaction already finalized');
    });
  });

  describe('Manual rollback', () => {
    it('should allow manual rollback with ctx.rollback()', () => {
      db.transaction((ctx) => {
        db.createNode('Job', { title: 'Job 1' });
        ctx.rollback();
        // Transaction rolled back, no automatic commit
      });

      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(0);
    });

    it('should throw error if rollback() called twice', () => {
      expect(() => {
        db.transaction((ctx) => {
          db.createNode('Job', { title: 'Job 1' });
          ctx.rollback();
          ctx.rollback(); // Second rollback should fail
        });
      }).toThrow('Transaction already finalized');
    });

    it('should throw error if rollback() called after commit()', () => {
      expect(() => {
        db.transaction((ctx) => {
          db.createNode('Job', { title: 'Job 1' });
          ctx.commit();
          ctx.rollback(); // Should fail
        });
      }).toThrow('Transaction already finalized');
    });
  });

  describe('Savepoints', () => {
    it('should create and rollback to savepoints', () => {
      db.transaction((ctx) => {
        db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('sp1');

        db.createNode('Job', { title: 'Job 2' });
        ctx.savepoint('sp2');

        db.createNode('Job', { title: 'Job 3' });

        // Rollback to sp2 - Job 3 should disappear
        ctx.rollbackTo('sp2');

        db.createNode('Job', { title: 'Job 4' });

        // Rollback to sp1 - Job 2 and Job 4 should disappear
        ctx.rollbackTo('sp1');

        db.createNode('Job', { title: 'Job 5' });
      });

      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.properties.title).sort()).toEqual(['Job 1', 'Job 5']);
    });

    it('should release savepoints', () => {
      db.transaction((ctx) => {
        db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('sp1');

        db.createNode('Job', { title: 'Job 2' });
        ctx.releaseSavepoint('sp1');

        // Can't rollback to released savepoint
        expect(() => {
          ctx.rollbackTo('sp1');
        }).toThrow();
      });

      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(2);
    });

    it('should handle nested savepoints correctly', () => {
      db.transaction((ctx) => {
        db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('outer');

        db.createNode('Job', { title: 'Job 2' });
        ctx.savepoint('inner');

        db.createNode('Job', { title: 'Job 3' });

        // Rollback inner only
        ctx.rollbackTo('inner');

        db.createNode('Job', { title: 'Job 4' });
      });

      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(3);
      expect(jobs.map(j => j.properties.title).sort()).toEqual(['Job 1', 'Job 2', 'Job 4']);
    });
  });

  describe('Return values', () => {
    it('should return value from transaction function', () => {
      const result = db.transaction((ctx) => {
        const job = db.createNode('Job', { title: 'Test Job' });
        return job.id;
      });

      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should return complex objects from transaction', () => {
      interface Result {
        jobId: number;
        companyId: number;
      }

      const result = db.transaction<Result>((ctx) => {
        const job = db.createNode('Job', { title: 'Test Job' });
        const company = db.createNode('Company', { name: 'TestCo' });
        return { jobId: job.id, companyId: company.id };
      });

      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('companyId');
      expect(result.jobId).toBeGreaterThan(0);
      expect(result.companyId).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should preserve original error message and stack', () => {
      const originalError = new Error('Original error');

      try {
        db.transaction((ctx) => {
          throw originalError;
        });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toBe('Original error');
        expect(err).toBe(originalError);
      }
    });

    it('should handle errors after savepoint creation', () => {
      expect(() => {
        db.transaction((ctx) => {
          db.createNode('Job', { title: 'Job 1' });
          ctx.savepoint('sp1');
          db.createNode('Job', { title: 'Job 2' });
          throw new Error('Error after savepoint');
        });
      }).toThrow('Error after savepoint');

      // All changes should be rolled back
      const jobs = db.nodes('Job').exec();
      expect(jobs).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty transaction', () => {
      const result = db.transaction((ctx) => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should handle transaction with only reads', () => {
      db.createNode('Job', { title: 'Existing Job' });

      const result = db.transaction((ctx) => {
        const jobs = db.nodes('Job').exec();
        return jobs.length;
      });

      expect(result).toBe(1);
    });

    it('should not allow savepoint with duplicate name', () => {
      db.transaction((ctx) => {
        ctx.savepoint('sp1');
        expect(() => {
          ctx.savepoint('sp1');
        }).toThrow('Savepoint sp1 already exists');
      });
    });

    it('should throw on rollbackTo non-existent savepoint', () => {
      db.transaction((ctx) => {
        expect(() => {
          ctx.rollbackTo('nonexistent');
        }).toThrow('Savepoint nonexistent does not exist');
      });
    });

    it('should throw on release non-existent savepoint', () => {
      db.transaction((ctx) => {
        expect(() => {
          ctx.releaseSavepoint('nonexistent');
        }).toThrow('Savepoint nonexistent does not exist');
      });
    });
  });
});
