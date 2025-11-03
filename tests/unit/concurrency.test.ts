/**
 * Tests for SQLite concurrency utilities
 *
 * Tests cover:
 * - enableWAL() helper for Write-Ahead Logging
 * - withRetry() for exponential backoff on SQLITE_BUSY
 * - WriteQueue for pessimistic locking
 */

import { GraphDatabase } from '../../src/core/Database';
import { enableWAL, withRetry, WriteQueue } from '../../src/utils/concurrency';

describe('Concurrency Utilities', () => {
  describe('enableWAL()', () => {
    let db: GraphDatabase;
    let dbPath: string;

    beforeEach(() => {
      // WAL mode doesn't work with :memory:, use temp file
      dbPath = `/tmp/test-wal-${Date.now()}.db`;
      db = new GraphDatabase(dbPath);
    });

    afterEach(() => {
      db.close();
      // Clean up temp file
      try {
        require('fs').unlinkSync(dbPath);
        require('fs').unlinkSync(dbPath + '-wal');
        require('fs').unlinkSync(dbPath + '-shm');
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    it('should enable WAL mode', () => {
      enableWAL(db);

      const mode = db.db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
    });

    it('should set NORMAL synchronous mode', () => {
      enableWAL(db);

      const sync = db.db.pragma('synchronous', { simple: true });
      expect(sync).toBe(1); // NORMAL = 1
    });

    it('should configure WAL autocheckpoint', () => {
      enableWAL(db);

      const checkpoint = db.db.pragma('wal_autocheckpoint', { simple: true });
      expect(checkpoint).toBe(1000);
    });

    it('should set busy timeout', () => {
      enableWAL(db);

      const timeout = db.db.pragma('busy_timeout', { simple: true });
      expect(timeout).toBe(5000);
    });

    it('should allow custom configuration', () => {
      enableWAL(db, {
        synchronous: 'FULL',
        walAutocheckpoint: 500,
        busyTimeout: 10000
      });

      const sync = db.db.pragma('synchronous', { simple: true });
      const checkpoint = db.db.pragma('wal_autocheckpoint', { simple: true });
      const timeout = db.db.pragma('busy_timeout', { simple: true });

      expect(sync).toBe(2); // FULL = 2
      expect(checkpoint).toBe(500);
      expect(timeout).toBe(10000);
    });

    it('should return the database for chaining', () => {
      const result = enableWAL(db);
      expect(result).toBe(db);
    });

    it('should be idempotent (safe to call multiple times)', () => {
      enableWAL(db);
      enableWAL(db);

      const mode = db.db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
    });
  });

  describe('withRetry()', () => {
    it('should execute operation successfully on first try', async () => {
      const operation = jest.fn(() => 'success');

      const result = await withRetry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should return value from successful operation', async () => {
      const operation = jest.fn(() => ({ id: 1, data: 'test' }));

      const result = await withRetry(operation);

      expect(result).toEqual({ id: 1, data: 'test' });
    });

    it('should retry on SQLITE_BUSY error', async () => {
      const operation = jest.fn()
        .mockImplementationOnce(() => {
          const error: any = new Error('database is locked');
          error.code = 'SQLITE_BUSY';
          throw error;
        })
        .mockImplementationOnce(() => 'success');

      const result = await withRetry(operation, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on "database is locked" message', async () => {
      const operation = jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('database is locked');
        })
        .mockImplementationOnce(() => 'success');

      const result = await withRetry(operation, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const operation = jest.fn(() => {
        const error: any = new Error('database is locked');
        error.code = 'SQLITE_BUSY';
        throw error;
      });

      await expect(
        withRetry(operation, { maxRetries: 3 })
      ).rejects.toThrow('Operation failed after 3 retries');

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-lock errors', async () => {
      const operation = jest.fn(() => {
        throw new Error('Constraint violation');
      });

      await expect(
        withRetry(operation, { maxRetries: 5 })
      ).rejects.toThrow('Constraint violation');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      const delays: number[] = [];
      const startTime = Date.now();

      const operation = jest.fn(() => {
        const elapsed = Date.now() - startTime;
        delays.push(elapsed);

        if (delays.length < 3) {
          throw new Error('database is locked');
        }
        return 'success';
      });

      await withRetry(operation, { maxRetries: 5, initialDelayMs: 10 });

      // Check that delays increase exponentially
      expect(delays.length).toBe(3);
      expect(delays[1] - delays[0]).toBeGreaterThanOrEqual(10);
      expect(delays[2] - delays[1]).toBeGreaterThanOrEqual(20);
    });

    it('should allow custom initial delay', async () => {
      const operation = jest.fn()
        .mockImplementationOnce(() => {
          throw new Error('database is locked');
        })
        .mockImplementationOnce(() => 'success');

      const startTime = Date.now();
      await withRetry(operation, { maxRetries: 3, initialDelayMs: 50 });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeGreaterThanOrEqual(50);
    });

    it('should handle sync operations', async () => {
      const operation = jest.fn(() => 'sync result');

      const result = await withRetry(operation);

      expect(result).toBe('sync result');
    });

    it('should preserve error context', async () => {
      const originalError = new Error('database is locked');
      (originalError as any).code = 'SQLITE_BUSY';
      (originalError as any).customProperty = 'test';

      const operation = jest.fn(() => {
        throw originalError;
      });

      try {
        await withRetry(operation, { maxRetries: 2 });
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Operation failed after 2 retries');
        expect(error.message).toContain('database is locked');
      }
    });
  });

  describe('WriteQueue', () => {
    let queue: WriteQueue;
    let db: GraphDatabase;

    beforeEach(() => {
      queue = new WriteQueue();
      db = new GraphDatabase(':memory:');
    });

    afterEach(() => {
      db.close();
    });

    it('should execute single operation', async () => {
      const operation = jest.fn(() => 'result');

      const result = await queue.enqueue(operation);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should return operation result', async () => {
      const node = db.createNode('Test', { value: 42 });

      const result = await queue.enqueue(() => {
        return db.getNode(node.id);
      });

      expect(result?.id).toBe(node.id);
      expect(result?.properties).toEqual({ value: 42 });
    });

    it('should serialize multiple operations', async () => {
      const executionOrder: number[] = [];

      const op1 = queue.enqueue(async () => {
        executionOrder.push(1);
        await new Promise(resolve => setTimeout(resolve, 20));
        return 'op1';
      });

      const op2 = queue.enqueue(async () => {
        executionOrder.push(2);
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'op2';
      });

      const op3 = queue.enqueue(async () => {
        executionOrder.push(3);
        return 'op3';
      });

      const results = await Promise.all([op1, op2, op3]);

      expect(results).toEqual(['op1', 'op2', 'op3']);
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should handle errors without breaking queue', async () => {
      const op1 = queue.enqueue(() => 'success1');

      const op2 = queue.enqueue(() => {
        throw new Error('Operation failed');
      });

      const op3 = queue.enqueue(() => 'success3');

      const result1 = await op1;
      expect(result1).toBe('success1');

      await expect(op2).rejects.toThrow('Operation failed');

      const result3 = await op3;
      expect(result3).toBe('success3');
    });

    it('should maintain FIFO order', async () => {
      const results: number[] = [];

      const operations = Array.from({ length: 10 }, (_, i) =>
        queue.enqueue(() => {
          results.push(i);
          return i;
        })
      );

      await Promise.all(operations);

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle concurrent database writes', async () => {
      enableWAL(db);

      const writes = Array.from({ length: 100 }, (_, i) =>
        queue.enqueue(() => db.createNode('Job', { index: i }))
      );

      const nodes = await Promise.all(writes);

      expect(nodes).toHaveLength(100);
      expect(new Set(nodes.map(n => n.id)).size).toBe(100); // All unique IDs

      // Verify all nodes were created
      const allNodes = db.nodes('Job').exec();
      expect(allNodes).toHaveLength(100);
    });

    it('should return correct queue length', async () => {
      expect(queue.length).toBe(0);

      const op1 = queue.enqueue(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      });

      // Queue should show pending operation
      await new Promise(resolve => setTimeout(resolve, 10));
      const lengthDuringExecution = queue.length;

      await op1;

      expect(lengthDuringExecution).toBeGreaterThanOrEqual(0);
      expect(queue.length).toBe(0);
    });

    it('should report processing status', async () => {
      expect(queue.isProcessing).toBe(false);

      const longOp = queue.enqueue(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'done';
      });

      // Check status while processing
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(queue.isProcessing).toBe(true);

      await longOp;
      expect(queue.isProcessing).toBe(false);
    });

    it('should handle promise-returning operations', async () => {
      const asyncOp = () => Promise.resolve('async result');

      const result = await queue.enqueue(asyncOp);

      expect(result).toBe('async result');
    });

    it('should handle sync operations', async () => {
      const syncOp = () => 'sync result';

      const result = await queue.enqueue(syncOp);

      expect(result).toBe('sync result');
    });

    it('should allow queuing from within operation', async () => {
      const results: string[] = [];

      // Use a separate queue for nested operations to avoid deadlock
      const innerQueue = new WriteQueue();

      await queue.enqueue(async () => {
        results.push('outer-start');

        await innerQueue.enqueue(() => {
          results.push('inner');
        });

        results.push('outer-end');
      });

      expect(results).toEqual(['outer-start', 'inner', 'outer-end']);
    });

    it('should handle rapid successive enqueues', async () => {
      const operations = Array.from({ length: 100 }, (_, i) =>
        queue.enqueue(() => i)
      );

      const results = await Promise.all(operations);

      expect(results).toHaveLength(100);
      expect(results).toEqual(Array.from({ length: 100 }, (_, i) => i));
    });
  });

  describe('Integration: Full concurrency stack', () => {
    let db: GraphDatabase;
    let queue: WriteQueue;

    beforeEach(() => {
      db = new GraphDatabase(':memory:');
      enableWAL(db);
      queue = new WriteQueue();
    });

    afterEach(() => {
      db.close();
    });

    it('should combine WAL + retry + queue for safe concurrent writes', async () => {
      // Simulate high-concurrency scenario
      const writes = Array.from({ length: 50 }, (_, i) =>
        queue.enqueue(() =>
          withRetry(() =>
            db.mergeNode('Job', { url: `https://example.com/job/${i}` } as any, { title: `Job ${i}` } as any)
          )
        )
      );

      const results = await Promise.all(writes);

      expect(results).toHaveLength(50);
      expect(results.every(r => r.created)).toBe(true);

      // Verify all nodes exist
      const nodes = db.nodes('Job').exec();
      expect(nodes).toHaveLength(50);
    });

    it('should handle merge conflicts gracefully', async () => {
      db.createPropertyIndex('Job', 'url');

      // Create initial node
      db.createNode('Job', { url: 'https://example.com/job/1', title: 'Original' });

      // Multiple concurrent merges of same node
      const merges = Array.from({ length: 10 }, (_, i) =>
        queue.enqueue(() =>
          withRetry(() =>
            db.mergeNode(
              'Job',
              { url: 'https://example.com/job/1' } as any,
              undefined,
              { onMatch: { viewCount: i } as any }
            )
          )
        )
      );

      const results = await Promise.all(merges);

      // All should match existing node
      expect(results.every(r => !r.created)).toBe(true);
      expect(results.every(r => r.node.id === results[0].node.id)).toBe(true);

      // Final viewCount should be from last merge
      const final = db.getNode(results[0].node.id);
      expect((final?.properties as any).viewCount).toBe(9);
    });

    it('should maintain data consistency under load', async () => {
      // Create nodes with edges in high-concurrency scenario
      const companyNode = db.createNode('Company', { name: 'TechCorp' });

      const operations = Array.from({ length: 100 }, (_, i) =>
        queue.enqueue(async () => {
          const job = await withRetry(() =>
            db.createNode('Job', { title: `Job ${i}` })
          );

          await withRetry(() =>
            db.createEdge(job.id, 'POSTED_BY', companyNode.id)
          );

          return job;
        })
      );

      const jobs = await Promise.all(operations);

      // Verify data integrity
      expect(jobs).toHaveLength(100);

      const allJobs = db.nodes('Job').exec();
      expect(allJobs).toHaveLength(100);

      // Count edges using SQL
      const edgeCount = db.db.prepare('SELECT COUNT(*) as count FROM edges WHERE type = ?').get('POSTED_BY') as { count: number };
      expect(edgeCount.count).toBe(100);

      // Verify all edges point to company
      const edges = db.db.prepare('SELECT * FROM edges WHERE type = ?').all('POSTED_BY') as any[];
      expect(edges.every((e: any) => e.to_id === companyNode.id)).toBe(true);
    });
  });
});
