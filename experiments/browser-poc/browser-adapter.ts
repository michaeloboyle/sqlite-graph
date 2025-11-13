/**
 * Browser adapter using wa-sqlite with OPFS persistence
 * Provides async API compatible with the adapter interface
 */

import { SQLiteAdapter, Statement, AdapterOptions } from './adapter-interface.js';

// wa-sqlite types (will be imported from actual package)
declare global {
  interface Window {
    sqlite3InitModule: any;
  }
}

class BrowserStatement implements Statement {
  constructor(
    private db: any,
    private stmt: any
  ) {}

  run(...params: any[]) {
    // Execute statement with parameters
    this.db.reset(this.stmt);

    params.forEach((param, i) => {
      if (typeof param === 'string') {
        this.db.bind_text(this.stmt, i + 1, param);
      } else if (typeof param === 'number') {
        this.db.bind_double(this.stmt, i + 1, param);
      } else if (param === null) {
        this.db.bind_null(this.stmt, i + 1);
      } else {
        this.db.bind_text(this.stmt, i + 1, JSON.stringify(param));
      }
    });

    const result = this.db.step(this.stmt);
    const changes = this.db.changes(this.db);
    const lastInsertRowid = this.db.last_insert_rowid(this.db);

    return { changes, lastInsertRowid };
  }

  get(...params: any[]) {
    this.db.reset(this.stmt);

    params.forEach((param, i) => {
      if (typeof param === 'string') {
        this.db.bind_text(this.stmt, i + 1, param);
      } else if (typeof param === 'number') {
        this.db.bind_double(this.stmt, i + 1, param);
      }
    });

    const result = this.db.step(this.stmt);
    if (result !== this.db.SQLITE_ROW) {
      return undefined;
    }

    const row: any = {};
    const columnCount = this.db.column_count(this.stmt);

    for (let i = 0; i < columnCount; i++) {
      const name = this.db.column_name(this.stmt, i);
      const type = this.db.column_type(this.stmt, i);

      switch (type) {
        case 1: // INTEGER
          row[name] = this.db.column_int64(this.stmt, i);
          break;
        case 2: // FLOAT
          row[name] = this.db.column_double(this.stmt, i);
          break;
        case 3: // TEXT
          row[name] = this.db.column_text(this.stmt, i);
          break;
        case 4: // BLOB
          row[name] = this.db.column_blob(this.stmt, i);
          break;
        case 5: // NULL
          row[name] = null;
          break;
      }
    }

    return row;
  }

  all(...params: any[]) {
    const rows: any[] = [];
    this.db.reset(this.stmt);

    params.forEach((param, i) => {
      if (typeof param === 'string') {
        this.db.bind_text(this.stmt, i + 1, param);
      } else if (typeof param === 'number') {
        this.db.bind_double(this.stmt, i + 1, param);
      }
    });

    while (this.db.step(this.stmt) === this.db.SQLITE_ROW) {
      const row: any = {};
      const columnCount = this.db.column_count(this.stmt);

      for (let i = 0; i < columnCount; i++) {
        const name = this.db.column_name(this.stmt, i);
        const type = this.db.column_type(this.stmt, i);

        switch (type) {
          case 1: // INTEGER
            row[name] = this.db.column_int64(this.stmt, i);
            break;
          case 2: // FLOAT
            row[name] = this.db.column_double(this.stmt, i);
            break;
          case 3: // TEXT
            row[name] = this.db.column_text(this.stmt, i);
            break;
          case 4: // BLOB
            row[name] = this.db.column_blob(this.stmt, i);
            break;
          case 5: // NULL
            row[name] = null;
            break;
        }
      }

      rows.push(row);
    }

    return rows;
  }

  finalize() {
    if (this.stmt) {
      this.db.finalize(this.stmt);
    }
  }
}

export class BrowserAdapter implements SQLiteAdapter {
  private sqlite3: any;
  private db: any;
  private _isOpen = true;

  private constructor(sqlite3: any, db: any) {
    this.sqlite3 = sqlite3;
    this.db = db;
  }

  static async create(path: string, options?: AdapterOptions): Promise<BrowserAdapter> {
    // Initialize wa-sqlite
    const sqlite3InitModule = (window as any).sqlite3InitModule;
    if (!sqlite3InitModule) {
      throw new Error('wa-sqlite not loaded. Include wa-sqlite script before initializing BrowserAdapter.');
    }

    const sqlite3 = await sqlite3InitModule();

    // Open database with OPFS if available, fallback to IndexedDB
    const vfsModule = path === ':memory:'
      ? 'memdb'
      : typeof (navigator as any).storage?.getDirectory === 'function'
        ? 'opfs' // Use OPFS if available (Chrome 102+, Firefox 111+, Safari 15.2+)
        : 'idb';  // Fallback to IndexedDB

    const db = await sqlite3.open_v2(
      path,
      sqlite3.SQLITE_OPEN_READWRITE | sqlite3.SQLITE_OPEN_CREATE,
      vfsModule
    );

    return new BrowserAdapter(sqlite3, db);
  }

  async prepare(sql: string): Promise<Statement> {
    const stmt = await this.sqlite3.prepare_v2(this.db, sql);
    return new BrowserStatement(this.sqlite3, stmt);
  }

  async exec(sql: string): Promise<void> {
    await this.sqlite3.exec(this.db, sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.exec('BEGIN');
    try {
      const result = await fn();
      await this.exec('COMMIT');
      return result;
    } catch (error) {
      await this.exec('ROLLBACK');
      throw error;
    }
  }

  async pragma(setting: string, value?: any): Promise<any> {
    if (value !== undefined) {
      const stmt = await this.prepare(`PRAGMA ${setting} = ?`);
      return stmt.get(value);
    } else {
      const stmt = await this.prepare(`PRAGMA ${setting}`);
      return stmt.get();
    }
  }

  async close(): Promise<void> {
    if (this._isOpen && this.db) {
      await this.sqlite3.close(this.db);
      this._isOpen = false;
    }
  }

  isOpen(): boolean {
    return this._isOpen;
  }
}
