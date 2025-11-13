/**
 * Universal SQLite adapter interface
 * Works with both better-sqlite3 (Node.js) and wa-sqlite (browser)
 */

export interface Statement {
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: any[]): any;
  all(...params: any[]): any[];
  finalize(): void;
}

export interface SQLiteAdapter {
  /**
   * Prepare a SQL statement for execution
   */
  prepare(sql: string): Promise<Statement>;

  /**
   * Execute SQL without returning results
   */
  exec(sql: string): Promise<void>;

  /**
   * Execute a transaction
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Get/set PRAGMA values
   */
  pragma(setting: string, value?: any): Promise<any>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;

  /**
   * Check if database is open
   */
  isOpen(): boolean;
}

export interface AdapterOptions {
  readonly?: boolean;
  fileMustExist?: boolean;
  timeout?: number;
  verbose?: (sql: string) => void;
}
