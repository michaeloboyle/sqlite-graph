/**
 * Node.js adapter using better-sqlite3
 * Wraps synchronous API in Promises for consistency with browser adapter
 */

import Database from 'better-sqlite3';
import { SQLiteAdapter, Statement, AdapterOptions } from './adapter-interface.js';

class NodeStatement implements Statement {
  constructor(private stmt: Database.Statement) {}

  run(...params: any[]) {
    return this.stmt.run(...params);
  }

  get(...params: any[]) {
    return this.stmt.get(...params);
  }

  all(...params: any[]) {
    return this.stmt.all(...params);
  }

  finalize() {
    // better-sqlite3 doesn't require explicit finalization
  }
}

export class NodeAdapter implements SQLiteAdapter {
  private db: Database.Database;
  private _isOpen = true;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static async create(path: string, options?: AdapterOptions): Promise<NodeAdapter> {
    const db = new Database(path, options);
    return new NodeAdapter(db);
  }

  async prepare(sql: string): Promise<Statement> {
    const stmt = this.db.prepare(sql);
    return new NodeStatement(stmt);
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // better-sqlite3 transactions are sync, wrap in async
    const txn = this.db.transaction(async () => {
      return await fn();
    });
    return txn();
  }

  async pragma(setting: string, value?: any): Promise<any> {
    if (value !== undefined) {
      return this.db.pragma(`${setting} = ${value}`);
    }
    return this.db.pragma(setting);
  }

  async close(): Promise<void> {
    if (this._isOpen) {
      this.db.close();
      this._isOpen = false;
    }
  }

  isOpen(): boolean {
    return this._isOpen && this.db.open;
  }
}
