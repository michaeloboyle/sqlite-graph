/**
 * SQLite Concurrency Utilities
 *
 * Production-ready utilities for handling SQLite concurrency:
 * - enableWAL: Configure Write-Ahead Logging for better concurrency
 * - withRetry: Exponential backoff retry logic for SQLITE_BUSY errors
 * - WriteQueue: Pessimistic locking via operation queue
 *
 * @module concurrency
 */

import type { GraphDatabase } from '../core/Database';

/**
 * Configuration options for WAL mode
 */
export interface WALOptions {
  /**
   * Synchronous mode: OFF, NORMAL, FULL, EXTRA
   * @default 'NORMAL' - Safe with WAL, faster than FULL
   */
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';

  /**
   * Number of pages before automatic checkpoint
   * @default 1000
   */
  walAutocheckpoint?: number;

  /**
   * Busy timeout in milliseconds (how long to wait on lock)
   * @default 5000 (5 seconds)
   */
  busyTimeout?: number;

  /**
   * Journal size limit in bytes (controls WAL file size)
   * @default 6144000 (6MB)
   */
  journalSizeLimit?: number;

  /**
   * Cache size in pages (negative = KB, e.g., -64000 = 64MB)
   * @default -64000 (64MB)
   */
  cacheSize?: number;
}

/**
 * Enable Write-Ahead Logging (WAL) mode with production-optimized settings
 *
 * WAL mode provides better concurrency:
 * - Multiple readers can proceed during writes
 * - Readers don't block writers
 * - Writers don't block readers
 *
 * **When to use WAL:**
 * - Read-heavy workloads (80%+ reads)
 * - Multiple concurrent readers
 * - Production deployments
 *
 * **When to avoid WAL:**
 * - Network filesystems (NFS, SMB) - requires local FS
 * - Very small databases (<100KB) - overhead not worth it
 *
 * @param db - GraphDatabase instance
 * @param options - WAL configuration options
 * @returns The database instance (for chaining)
 *
 * @example
 * ```typescript
 * const db = new GraphDatabase('./graph.db');
 * enableWAL(db); // Use defaults
 *
 * // Or with custom settings
 * enableWAL(db, {
 *   synchronous: 'FULL',      // Extra safety
 *   walAutocheckpoint: 500,   // More frequent checkpoints
 *   busyTimeout: 10000        // 10 second timeout
 * });
 * ```
 */
export function enableWAL(
  db: GraphDatabase,
  options: WALOptions = {}
): GraphDatabase {
  const {
    synchronous = 'NORMAL',
    walAutocheckpoint = 1000,
    busyTimeout = 5000,
    journalSizeLimit = 6144000,
    cacheSize = -64000
  } = options;

  // Enable WAL mode
  db.db.pragma('journal_mode = WAL');

  // Set synchronous mode (NORMAL is safe with WAL)
  db.db.pragma(`synchronous = ${synchronous}`);

  // Configure WAL autocheckpoint
  db.db.pragma(`wal_autocheckpoint = ${walAutocheckpoint}`);

  // Set busy timeout (how long to wait on lock)
  db.db.pragma(`busy_timeout = ${busyTimeout}`);

  // Set journal size limit
  db.db.pragma(`journal_size_limit = ${journalSizeLimit}`);

  // Set cache size
  db.db.pragma(`cache_size = ${cacheSize}`);

  return db;
}

/**
 * Options for retry logic
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * @default 5
   */
  maxRetries?: number;

  /**
   * Initial delay in milliseconds before first retry
   * @default 10
   */
  initialDelayMs?: number;

  /**
   * Whether to add random jitter to delays (reduces thundering herd)
   * @default false
   */
  useJitter?: boolean;
}

/**
 * Execute operation with exponential backoff retry on SQLITE_BUSY errors
 *
 * Implements optimistic locking strategy - assumes success, retries on conflict.
 *
 * **Retry schedule (initialDelayMs = 10):**
 * - Attempt 1: Immediate
 * - Attempt 2: 10ms delay
 * - Attempt 3: 20ms delay
 * - Attempt 4: 40ms delay
 * - Attempt 5: 80ms delay
 *
 * @param operation - Function to execute (sync or async)
 * @param options - Retry configuration
 * @returns Result of successful operation
 * @throws Error after max retries or non-retryable error
 *
 * @example
 * ```typescript
 * // Basic usage
 * const node = await withRetry(() =>
 *   db.createNode('Job', { title: 'Engineer' })
 * );
 *
 * // With custom retry settings
 * const result = await withRetry(
 *   () => db.mergeNode('Company', { name: 'TechCorp' }),
 *   { maxRetries: 10, initialDelayMs: 20 }
 * );
 *
 * // Works with any database operation
 * await withRetry(() => {
 *   db.transaction(() => {
 *     // Multiple operations in transaction
 *     const job = db.createNode('Job', { title: 'Developer' });
 *     const company = db.createNode('Company', { name: 'Acme' });
 *     db.createEdge(job.id, 'POSTED_BY', company.id);
 *   });
 * });
 * ```
 */
export async function withRetry<T>(
  operation: () => T | Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    initialDelayMs = 10,
    useJitter = false
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Execute operation (handles both sync and async)
      const result = operation();
      return result instanceof Promise ? await result : result;
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const isLockError =
        error.code === 'SQLITE_BUSY' ||
        error.code === 'SQLITE_LOCKED' ||
        error.message?.includes('database is locked') ||
        error.message?.includes('SQLITE_BUSY');

      // Don't retry non-lock errors
      if (!isLockError) {
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt >= maxRetries - 1) {
        break;
      }

      // Calculate exponential backoff delay
      let delayMs = initialDelayMs * Math.pow(2, attempt);

      // Add jitter if requested (±10% random variation)
      if (useJitter) {
        const jitterPercent = (Math.random() - 0.5) * 0.2; // -10% to +10%
        delayMs = delayMs * (1 + jitterPercent);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // All retries exhausted
  throw new Error(
    `Operation failed after ${maxRetries} retries: ${lastError?.message}`
  );
}

/**
 * Write queue for pessimistic locking
 *
 * Serializes all write operations through a FIFO queue to prevent lock contention.
 * Use this when you have high write concurrency and need guaranteed ordering.
 *
 * **Trade-offs:**
 * - ✅ Eliminates lock contention
 * - ✅ Guarantees FIFO ordering
 * - ✅ Predictable latency
 * - ❌ Higher latency per operation
 * - ❌ Single bottleneck point
 *
 * @example
 * ```typescript
 * const writeQueue = new WriteQueue();
 *
 * // All writes go through queue
 * const job = await writeQueue.enqueue(() =>
 *   db.createNode('Job', { title: 'Engineer' })
 * );
 *
 * // Handles async operations
 * const result = await writeQueue.enqueue(async () => {
 *   const company = db.createNode('Company', { name: 'TechCorp' });
 *   await externalApiCall();
 *   return company;
 * });
 *
 * // Works with transactions
 * await writeQueue.enqueue(() => {
 *   db.transaction(() => {
 *     // Multiple writes as one atomic operation
 *   });
 * });
 *
 * // Queue status
 * console.log(`Queue length: ${writeQueue.length}`);
 * console.log(`Processing: ${writeQueue.isProcessing}`);
 * ```
 */
export class WriteQueue {
  private queue: Array<() => void> = [];
  private processing = false;

  /**
   * Number of operations waiting in queue
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Whether the queue is currently processing an operation
   */
  get isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Enqueue an operation for execution
   *
   * Operations are executed in FIFO order (first in, first out).
   * Each operation waits for the previous one to complete.
   *
   * @param operation - Function to execute (sync or async)
   * @returns Promise that resolves with operation result
   *
   * @example
   * ```typescript
   * const queue = new WriteQueue();
   *
   * // Enqueue multiple operations
   * const op1 = queue.enqueue(() => db.createNode('Job', { title: 'A' }));
   * const op2 = queue.enqueue(() => db.createNode('Job', { title: 'B' }));
   * const op3 = queue.enqueue(() => db.createNode('Job', { title: 'C' }));
   *
   * // All execute in order
   * const results = await Promise.all([op1, op2, op3]);
   * ```
   */
  async enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = operation();
          const finalResult = result instanceof Promise ? await result : result;
          resolve(finalResult);
        } catch (error) {
          reject(error);
        }
      });

      // Start processing if not already running
      this.processQueue();
    });
  }

  /**
   * Process queued operations sequentially
   * @private
   */
  private async processQueue(): Promise<void> {
    // Already processing or queue empty
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const operation = this.queue.shift()!;

      try {
        await operation();
      } catch (error) {
        // Error already handled in enqueue's promise rejection
        // Continue processing remaining operations
      }
    }

    this.processing = false;
  }
}

/**
 * Production-ready database initialization with full concurrency stack
 *
 * Convenience function that combines all concurrency best practices:
 * - Enables WAL mode
 * - Configures optimal pragmas
 * - Returns configured database and write queue
 *
 * @param db - GraphDatabase instance
 * @param options - WAL configuration options
 * @returns Object with database and write queue
 *
 * @example
 * ```typescript
 * const db = new GraphDatabase('./graph.db');
 * const { writeQueue } = initializeConcurrency(db);
 *
 * // Use write queue for all writes
 * await writeQueue.enqueue(() =>
 *   withRetry(() =>
 *     db.createNode('Job', { title: 'Engineer' })
 *   )
 * );
 * ```
 */
export function initializeConcurrency(
  db: GraphDatabase,
  options: WALOptions = {}
): { db: GraphDatabase; writeQueue: WriteQueue } {
  enableWAL(db, options);
  const writeQueue = new WriteQueue();

  return { db, writeQueue };
}
