import Database from 'better-sqlite3';

/**
 * SQL schema for the graph database
 */
const SCHEMA_SQL = `
-- Core tables
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  properties TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  properties TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_from_type ON edges(from_id, type);
CREATE INDEX IF NOT EXISTS idx_edges_to_type ON edges(to_id, type);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_edges_created ON edges(created_at);

-- Metadata table for versioning/migrations
CREATE TABLE IF NOT EXISTS _metadata (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

/**
 * Initialize database schema
 */
export function initializeSchema(db: Database.Database): void {
  // Execute schema creation
  db.exec(SCHEMA_SQL);

  // Set schema version if not exists
  const versionStmt = db.prepare('SELECT value FROM _metadata WHERE key = ?');
  const version = versionStmt.get('schema_version');

  if (!version) {
    const insertStmt = db.prepare('INSERT INTO _metadata (key, value) VALUES (?, ?)');
    insertStmt.run('schema_version', '1');
  }

  // Enable foreign keys
  db.pragma('foreign_keys = ON');
}

/**
 * Get current schema version
 */
export function getSchemaVersion(db: Database.Database): string {
  const stmt = db.prepare('SELECT value FROM _metadata WHERE key = ?');
  const row = stmt.get('schema_version') as { value: string } | undefined;
  return row?.value || '0';
}