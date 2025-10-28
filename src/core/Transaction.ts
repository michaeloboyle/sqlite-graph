import Database from 'better-sqlite3';

/**
 * Error thrown when attempting to use a transaction that has already been committed or rolled back
 */
export class TransactionAlreadyFinalizedError extends Error {
  constructor(message: string = 'Transaction already finalized') {
    super(message);
    this.name = 'TransactionAlreadyFinalizedError';
  }
}

/**
 * Context object provided to transaction callbacks.
 * Allows manual control over transaction lifecycle with commit, rollback, and savepoints.
 *
 * @example
 * ```typescript
 * db.transaction((ctx) => {
 *   const job = db.createNode('Job', { title: 'Test' });
 *   ctx.savepoint('job_created');
 *
 *   try {
 *     db.createEdge('POSTED_BY', job.id, companyId);
 *   } catch (err) {
 *     ctx.rollbackTo('job_created');
 *   }
 *
 *   ctx.commit(); // Manual commit
 * });
 * ```
 */
export class TransactionContext {
  private db: Database.Database;
  private finalized: boolean = false;
  private savepoints: Set<string> = new Set();

  /**
   * Create a new transaction context
   * @param db - SQLite database instance
   * @internal
   */
  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Manually commit the transaction.
   * After calling this, the transaction is finalized and no further operations are allowed.
   *
   * @throws {TransactionAlreadyFinalizedError} If transaction was already committed or rolled back
   *
   * @example
   * ```typescript
   * db.transaction((ctx) => {
   *   db.createNode('Job', { title: 'Test' });
   *   ctx.commit(); // Manual commit
   * });
   * ```
   */
  commit(): void {
    if (this.finalized) {
      throw new TransactionAlreadyFinalizedError();
    }
    this.db.prepare('COMMIT').run();
    this.finalized = true;
  }

  /**
   * Manually rollback the transaction.
   * After calling this, the transaction is finalized and no further operations are allowed.
   * All changes made in the transaction will be discarded.
   *
   * @throws {TransactionAlreadyFinalizedError} If transaction was already committed or rolled back
   *
   * @example
   * ```typescript
   * db.transaction((ctx) => {
   *   db.createNode('Job', { title: 'Test' });
   *   if (someCondition) {
   *     ctx.rollback(); // Discard changes
   *     return;
   *   }
   * });
   * ```
   */
  rollback(): void {
    if (this.finalized) {
      throw new TransactionAlreadyFinalizedError();
    }
    this.db.prepare('ROLLBACK').run();
    this.finalized = true;
  }

  /**
   * Create a named savepoint within the transaction.
   * Allows partial rollback to this point later using rollbackTo().
   *
   * @param name - Name for the savepoint
   * @throws {Error} If savepoint with this name already exists
   *
   * @example
   * ```typescript
   * db.transaction((ctx) => {
   *   db.createNode('Job', { title: 'Job 1' });
   *   ctx.savepoint('sp1');
   *   db.createNode('Job', { title: 'Job 2' });
   *   ctx.rollbackTo('sp1'); // Only Job 1 remains
   * });
   * ```
   */
  savepoint(name: string): void {
    if (this.savepoints.has(name)) {
      throw new Error(`Savepoint ${name} already exists`);
    }
    // Quote identifier to allow hyphens and special characters
    this.db.prepare(`SAVEPOINT "${name}"`).run();
    this.savepoints.add(name);
  }

  /**
   * Rollback to a previously created savepoint.
   * All changes made after the savepoint was created will be discarded.
   *
   * @param name - Name of the savepoint to rollback to
   * @throws {Error} If savepoint doesn't exist
   *
   * @example
   * ```typescript
   * db.transaction((ctx) => {
   *   db.createNode('Job', { title: 'Job 1' });
   *   ctx.savepoint('sp1');
   *   db.createNode('Job', { title: 'Job 2' });
   *   ctx.rollbackTo('sp1'); // Job 2 is discarded
   *   db.createNode('Job', { title: 'Job 3' }); // Can continue after rollback
   * });
   * ```
   */
  rollbackTo(name: string): void {
    if (!this.savepoints.has(name)) {
      throw new Error(`Savepoint ${name} does not exist`);
    }
    // Quote identifier to allow hyphens and special characters
    this.db.prepare(`ROLLBACK TO "${name}"`).run();
    // Note: SQLite keeps the savepoint after ROLLBACK TO, unlike RELEASE
  }

  /**
   * Release a savepoint, making its changes permanent within the transaction.
   * The savepoint can no longer be rolled back to after being released.
   *
   * @param name - Name of the savepoint to release
   * @throws {Error} If savepoint doesn't exist
   *
   * @example
   * ```typescript
   * db.transaction((ctx) => {
   *   db.createNode('Job', { title: 'Job 1' });
   *   ctx.savepoint('sp1');
   *   db.createNode('Job', { title: 'Job 2' });
   *   ctx.releaseSavepoint('sp1'); // Can't rollback to sp1 anymore
   * });
   * ```
   */
  releaseSavepoint(name: string): void {
    if (!this.savepoints.has(name)) {
      throw new Error(`Savepoint ${name} does not exist`);
    }
    this.db.prepare(`RELEASE SAVEPOINT ${name}`).run();
    this.savepoints.delete(name);
  }

  /**
   * Check if the transaction has been finalized (committed or rolled back)
   * @internal
   */
  isFinalized(): boolean {
    return this.finalized;
  }
}