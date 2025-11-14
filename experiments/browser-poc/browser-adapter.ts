/**
 * Browser adapter using wa-sqlite with OPFS persistence
 * Provides async API compatible with the adapter interface
 *
 * Architecture follows NodeAdapter patterns while handling wa-sqlite differences:
 * - All wa-sqlite operations after prepare() are synchronous
 * - Statement must be reset() before each execution
 * - Parameters are 1-indexed in wa-sqlite (SQL standard)
 * - Proper type detection and binding for parameters
 */

import { SQLiteAdapter, Statement, AdapterOptions } from './adapter-interface.js';

// wa-sqlite types (provided by @journeyapps/wa-sqlite)
declare global {
  interface Window {
    sqlite3InitModule: any;
  }
}

/**
 * BrowserStatement implements Statement interface using wa-sqlite APIs
 * Handles parameter binding, result extraction, and statement lifecycle
 */
class BrowserStatement implements Statement {
  private sqlite3: any;    // wa-sqlite module (for method calls)
  private db: any;         // Database handle (for changes/lastInsertRowid)
  private stmt: any;       // Prepared statement handle

  constructor(sqlite3: any, db: any, stmt: any) {
    this.sqlite3 = sqlite3;
    this.db = db;
    this.stmt = stmt;
  }

  /**
   * Execute statement with parameters and return mutation results
   * Follows wa-sqlite pattern: reset -> bind -> step -> read results
   */
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    // Reset statement for clean execution
    this.sqlite3.reset(this.stmt);

    // Bind parameters (1-indexed in wa-sqlite)
    this.bindParameters(params);

    // Execute statement
    this.sqlite3.step(this.stmt);

    // Get mutation results from database handle
    const changes = this.sqlite3.changes(this.db);
    const lastInsertRowid = this.sqlite3.last_insert_rowid(this.db);

    return { changes, lastInsertRowid };
  }

  /**
   * Execute and return single row or undefined
   * Matches NodeAdapter behavior exactly
   */
  get(...params: any[]): any {
    // Reset statement
    this.sqlite3.reset(this.stmt);

    // Bind parameters
    this.bindParameters(params);

    // Execute and check for row
    const result = this.sqlite3.step(this.stmt);

    if (result !== this.sqlite3.SQLITE_ROW) {
      return undefined;
    }

    // Extract row data
    return this.extractRow();
  }

  /**
   * Execute and return all matching rows
   * Returns empty array if no matches
   */
  all(...params: any[]): any[] {
    const rows: any[] = [];

    // Reset statement
    this.sqlite3.reset(this.stmt);

    // Bind parameters
    this.bindParameters(params);

    // Execute until no more rows
    while (this.sqlite3.step(this.stmt) === this.sqlite3.SQLITE_ROW) {
      rows.push(this.extractRow());
    }

    return rows;
  }

  /**
   * Clean up statement resources
   * Idempotent - safe to call multiple times
   */
  finalize(): void {
    if (this.stmt) {
      this.sqlite3.finalize(this.stmt);
      this.stmt = null;  // Prevent double-free
    }
  }

  /**
   * Bind parameters to prepared statement
   * Handles type detection and conversion
   * wa-sqlite uses 1-indexed parameters (SQL standard)
   */
  private bindParameters(params: any[]): void {
    params.forEach((param, i) => {
      const index = i + 1;  // wa-sqlite is 1-indexed

      if (param === null || param === undefined) {
        this.sqlite3.bind_null(this.stmt, index);
      } else if (typeof param === 'number') {
        // Use int64 for integers, double for floats
        if (Number.isInteger(param)) {
          this.sqlite3.bind_int64(this.stmt, index, param);
        } else {
          this.sqlite3.bind_double(this.stmt, index, param);
        }
      } else if (typeof param === 'string') {
        this.sqlite3.bind_text(this.stmt, index, param);
      } else if (param instanceof Uint8Array) {
        this.sqlite3.bind_blob(this.stmt, index, param);
      } else {
        // Fallback: JSON stringify for objects/arrays
        this.sqlite3.bind_text(this.stmt, index, JSON.stringify(param));
      }
    });
  }

  /**
   * Extract current row from statement
   * Handles type conversion based on SQLite column types
   */
  private extractRow(): any {
    const row: any = {};
    const columnCount = this.sqlite3.column_count(this.stmt);

    for (let i = 0; i < columnCount; i++) {
      const name = this.sqlite3.column_name(this.stmt, i);
      const type = this.sqlite3.column_type(this.stmt, i);

      // Map SQLite types to JavaScript types
      switch (type) {
        case 1: // SQLITE_INTEGER
          row[name] = this.sqlite3.column_int64(this.stmt, i);
          break;
        case 2: // SQLITE_FLOAT
          row[name] = this.sqlite3.column_double(this.stmt, i);
          break;
        case 3: // SQLITE_TEXT
          row[name] = this.sqlite3.column_text(this.stmt, i);
          break;
        case 4: // SQLITE_BLOB
          row[name] = this.sqlite3.column_blob(this.stmt, i);
          break;
        case 5: // SQLITE_NULL
          row[name] = null;
          break;
      }
    }

    return row;
  }
}

/**
 * BrowserAdapter implements SQLiteAdapter interface using wa-sqlite
 * Supports OPFS (preferred), IndexedDB (fallback), and in-memory databases
 */
export class BrowserAdapter implements SQLiteAdapter {
  private sqlite3: any;           // wa-sqlite module instance
  private db: any;                // Database handle
  private _isOpen = true;         // Connection state flag
  private vfsModule: string;      // Track which VFS was selected

  private constructor(sqlite3: any, db: any, vfsModule: string) {
    this.sqlite3 = sqlite3;
    this.db = db;
    this.vfsModule = vfsModule;
  }

  /**
   * Factory method to create BrowserAdapter instance
   * Handles wa-sqlite initialization, VFS selection, and database opening
   *
   * @param path Database path or ':memory:' for in-memory database
   * @param options Adapter options (readonly, timeout, etc.)
   * @returns Promise resolving to BrowserAdapter instance
   */
  static async create(
    path: string,
    options?: AdapterOptions & { vfs?: 'opfs' | 'idb' | 'memdb' }
  ): Promise<BrowserAdapter> {
    // 1. Check wa-sqlite is loaded
    if (typeof window === 'undefined' || !window.sqlite3InitModule) {
      throw new Error(
        'wa-sqlite not loaded. Include wa-sqlite script before creating BrowserAdapter.'
      );
    }

    // 2. Initialize wa-sqlite module
    const sqlite3 = await window.sqlite3InitModule();

    // 3. Determine VFS module (OPFS > IndexedDB > memory)
    let vfsModule: string;

    if (path === ':memory:') {
      vfsModule = 'memdb';
    } else if (options?.vfs) {
      // Manual VFS override
      vfsModule = options.vfs;
    } else {
      // Auto-select: OPFS if available, else IndexedDB
      const hasOPFS = typeof navigator?.storage?.getDirectory === 'function';
      vfsModule = hasOPFS ? 'opfs' : 'idb';
    }

    // 4. Set open flags based on options
    let flags = sqlite3.SQLITE_OPEN_READWRITE | sqlite3.SQLITE_OPEN_CREATE;

    if (options?.readonly) {
      flags = sqlite3.SQLITE_OPEN_READONLY;
    }

    // 5. Open database
    try {
      const db = await sqlite3.open_v2(path, flags, vfsModule);

      if (!db) {
        throw new Error('Database handle is null');
      }

      // 6. Create adapter instance
      return new BrowserAdapter(sqlite3, db, vfsModule);
    } catch (error: any) {
      throw new Error(
        `Failed to open database "${path}" with VFS "${vfsModule}": ${error.message}`
      );
    }
  }

  /**
   * Prepare a SQL statement for execution
   * Returns BrowserStatement wrapper that implements Statement interface
   */
  async prepare(sql: string): Promise<Statement> {
    if (!this._isOpen) {
      throw new Error('Database is closed');
    }

    try {
      const stmt = await this.sqlite3.prepare_v2(this.db, sql);

      if (!stmt) {
        throw new Error('Statement handle is null');
      }

      return new BrowserStatement(this.sqlite3, this.db, stmt);
    } catch (error: any) {
      throw new Error(`Failed to prepare statement: ${sql}\nError: ${error.message}`);
    }
  }

  /**
   * Execute SQL without returning results
   * Used for DDL statements (CREATE, DROP, ALTER)
   */
  async exec(sql: string): Promise<void> {
    if (!this._isOpen) {
      throw new Error('Database is closed');
    }

    try {
      await this.sqlite3.exec(this.db, sql);
    } catch (error: any) {
      throw new Error(`Failed to execute SQL: ${sql}\nError: ${error.message}`);
    }
  }

  /**
   * Execute function within a transaction
   * Automatically commits on success, rolls back on error
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.exec('BEGIN');

    try {
      const result = await fn();
      await this.exec('COMMIT');
      return result;
    } catch (error) {
      // Attempt rollback, but prioritize original error
      try {
        await this.exec('ROLLBACK');
      } catch (rollbackError: any) {
        console.error('ROLLBACK failed:', rollbackError.message);
      }
      throw error;
    }
  }

  /**
   * Get or set PRAGMA values
   * Returns current value for both get and set operations
   */
  async pragma(setting: string, value?: any): Promise<any> {
    if (!this._isOpen) {
      throw new Error('Database is closed');
    }

    let stmt: Statement;

    try {
      if (value !== undefined) {
        // Set PRAGMA value
        const sql = `PRAGMA ${setting} = ${value}`;
        stmt = await this.prepare(sql);
        const result = stmt.get();
        stmt.finalize();
        return result;
      } else {
        // Get PRAGMA value
        const sql = `PRAGMA ${setting}`;
        stmt = await this.prepare(sql);
        const result = stmt.get();
        stmt.finalize();
        return result;
      }
    } catch (error: any) {
      throw new Error(`PRAGMA ${setting} failed: ${error.message}`);
    }
  }

  /**
   * Close database connection
   * Idempotent - safe to call multiple times
   */
  async close(): Promise<void> {
    if (this._isOpen && this.db) {
      try {
        await this.sqlite3.close(this.db);
        this._isOpen = false;
      } catch (error: any) {
        throw new Error(`Failed to close database: ${error.message}`);
      }
    }
  }

  /**
   * Check if database connection is open
   * Synchronous check of internal flag
   */
  isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Get diagnostic info about VFS being used
   * Useful for debugging and performance analysis
   */
  getVFS(): string {
    return this.vfsModule;
  }
}
