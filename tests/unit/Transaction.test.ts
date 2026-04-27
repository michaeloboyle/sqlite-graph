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

  afterEach(async () => {
    await db.close();
  });

  describe('Automatic commit/rollback', () => {
    it('should automatically commit successful transactions', async () => {
      let contextReceived: TransactionContext | null = null;

      await db.transaction(async (ctx) => {
        contextReceived = ctx;
        await db.createNode('Job', { title: 'Test Job' });
      });

      expect(contextReceived).toBeInstanceOf(TransactionContext);

      // Verify node was committed
      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(1);
      expect(jobs[0].properties.title).toBe('Test Job');
    });

    it('should automatically rollback on error', async () => {
      await expect(db.transaction(async (ctx) => {
          await db.createNode('Job', { title: 'Test Job' });
          throw new Error('Intentional error');
        })).rejects.toThrow('Intentional error');

      // Verify node was NOT committed
      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(0);
    });
  });

  describe('Manual commit', () => {
    it('should allow manual commit with ctx.commit()', async () => {
      await db.transaction(async (ctx) => {
        await db.createNode('Job', { title: 'Job 1' });
        ctx.commit();
        // Transaction is now finalized
      });

      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(1);
    });

    it('should throw error if commit() called twice', async () => {
      await expect(db.transaction(async (ctx) => {
          await db.createNode('Job', { title: 'Job 1' });
          ctx.commit();
          ctx.commit(); // Second commit should fail
        })).rejects.toThrow('Transaction already finalized');
    });

    it('should throw error if commit() called after rollback()', async () => {
      await expect(db.transaction(async (ctx) => {
          await db.createNode('Job', { title: 'Job 1' });
          ctx.rollback();
          ctx.commit(); // Should fail
        })).rejects.toThrow('Transaction already finalized');
    });
  });

  describe('Manual rollback', () => {
    it('should allow manual rollback with ctx.rollback()', async () => {
      await db.transaction(async (ctx) => {
        await db.createNode('Job', { title: 'Job 1' });
        ctx.rollback();
        // Transaction rolled back, no automatic commit
      });

      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(0);
    });

    it('should throw error if rollback() called twice', async () => {
      await expect(db.transaction(async (ctx) => {
          await db.createNode('Job', { title: 'Job 1' });
          ctx.rollback();
          ctx.rollback(); // Second rollback should fail
        })).rejects.toThrow('Transaction already finalized');
    });

    it('should throw error if rollback() called after commit()', async () => {
      await expect(db.transaction(async (ctx) => {
          await db.createNode('Job', { title: 'Job 1' });
          ctx.commit();
          ctx.rollback(); // Should fail
        })).rejects.toThrow('Transaction already finalized');
    });
  });

  describe('Savepoints', () => {
    it('should create and rollback to savepoints', async () => {
      await db.transaction(async (ctx) => {
        await db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('sp1');

        await db.createNode('Job', { title: 'Job 2' });
        ctx.savepoint('sp2');

        await db.createNode('Job', { title: 'Job 3' });

        // Rollback to sp2 - Job 3 should disappear
        ctx.rollbackTo('sp2');

        await db.createNode('Job', { title: 'Job 4' });

        // Rollback to sp1 - Job 2 and Job 4 should disappear
        ctx.rollbackTo('sp1');

        await db.createNode('Job', { title: 'Job 5' });
      });

      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(2);
      expect(jobs.map(j => j.properties.title).sort()).toEqual(['Job 1', 'Job 5']);
    });

    it('should release savepoints', async () => {
      await db.transaction(async (ctx) => {
        await db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('sp1');

        await db.createNode('Job', { title: 'Job 2' });
        ctx.releaseSavepoint('sp1');

        // Can't rollback to released savepoint
        expect(() => {
          ctx.rollbackTo('sp1');
        }).toThrow();
      });

      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(2);
    });

    it('should handle nested savepoints correctly', async () => {
      await db.transaction(async (ctx) => {
        await db.createNode('Job', { title: 'Job 1' });
        ctx.savepoint('outer');

        await db.createNode('Job', { title: 'Job 2' });
        ctx.savepoint('inner');

        await db.createNode('Job', { title: 'Job 3' });

        // Rollback inner only
        ctx.rollbackTo('inner');

        await db.createNode('Job', { title: 'Job 4' });
      });

      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(3);
      expect(jobs.map(j => j.properties.title).sort()).toEqual(['Job 1', 'Job 2', 'Job 4']);
    });
  });

  describe('Return values', () => {
    it('should return value from transaction function', async () => {
      const result = await db.transaction(async (ctx) => {
        const job = await db.createNode('Job', { title: 'Test Job' });
        return job.id;
      });

      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('should return complex objects from transaction', async () => {
      interface Result {
        jobId: number;
        companyId: number;
      }

      const result = await db.transaction(async (ctx) => {
        const job = await db.createNode('Job', { title: 'Test Job' });
        const company = await db.createNode('Company', { name: 'TestCo' });
        return { jobId: job.id, companyId: company.id };
      });

      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('companyId');
      expect(result.jobId).toBeGreaterThan(0);
      expect(result.companyId).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should preserve original error message and stack', async () => {
      const originalError = new Error('Original error');

      try {
        await db.transaction(async (ctx) => {
          throw originalError;
        });
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toBe('Original error');
        expect(err).toBe(originalError);
      }
    });

    it('should handle errors after savepoint creation', async () => {
      await expect(db.transaction(async (ctx) => {
          await db.createNode('Job', { title: 'Job 1' });
          ctx.savepoint('sp1');
          await db.createNode('Job', { title: 'Job 2' });
          throw new Error('Error after savepoint');
        })).rejects.toThrow('Error after savepoint');

      // All changes should be rolled back
      const jobs = await db.nodes('Job').exec();
      expect(jobs).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty transaction', async () => {
      const result = await db.transaction(async (ctx) => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should handle transaction with only reads', async () => {
      await db.createNode('Job', { title: 'Existing Job' });

      const result = await db.transaction(async (ctx) => {
        const jobs = await db.nodes('Job').exec();
        return jobs.length;
      });

      expect(result).toBe(1);
    });

    it('should not allow savepoint with duplicate name', async () => {
      await db.transaction(async (ctx) => {
        ctx.savepoint('sp1');
        expect(() => {
          ctx.savepoint('sp1');
        }).toThrow('Savepoint sp1 already exists');
      });
    });

    it('should throw on rollbackTo non-existent savepoint', async () => {
      await db.transaction(async (ctx) => {
        expect(() => {
          ctx.rollbackTo('nonexistent');
        }).toThrow('Savepoint nonexistent does not exist');
      });
    });

    it('should throw on release non-existent savepoint', async () => {
      await db.transaction(async (ctx) => {
        expect(() => {
          ctx.releaseSavepoint('nonexistent');
        }).toThrow('Savepoint nonexistent does not exist');
      });
    });
  });
});
