// SQLite setup + migration runner (main process only). Local file, no network.
// Migrations are applied in order; each runs once, tracked in schema_migrations.
const path = require('path');
const Database = require('better-sqlite3');

const DB_FILENAME = 'revival.sqlite';

// Ordered list of migrations. To add schema later, append a new entry — never
// edit or reorder an applied one. `up` receives the open database handle.
const MIGRATIONS = [
  {
    name: '001_init',
    up(db) {
      // Generic app key/value store (e.g. schema notes). Not domain/canon schema.
      db.exec(`
        CREATE TABLE app_meta (
          key   TEXT PRIMARY KEY,
          value TEXT
        );
      `);
    },
  },
  {
    name: '002_unsorted',
    up(db) {
      // Unsorted: the general routing queue. Create + list for now;
      // edit/delete/archive arrive in later phases via new migrations.
      db.exec(`
        CREATE TABLE unsorted (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          title      TEXT NOT NULL,
          body       TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
];

function getDbPath(userDataPath) {
  return path.join(userDataPath, DB_FILENAME);
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const markApplied = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)'
  );

  let appliedCount = 0;
  for (const migration of MIGRATIONS) {
    if (isApplied.get(migration.name)) continue;
    const apply = db.transaction(() => {
      migration.up(db);
      markApplied.run(migration.name, new Date().toISOString());
    });
    apply();
    appliedCount += 1;
  }
  return appliedCount;
}

// Module-level singleton so the rest of the main process can run queries.
let _db = null;

function getDb() {
  if (!_db) throw new Error('Database not initialized — call initDatabase() first.');
  return _db;
}

// Opens (creating if needed) the DB at the app data dir and runs pending migrations.
function initDatabase(userDataPath) {
  const dbPath = getDbPath(userDataPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const applied = runMigrations(db);
  _db = db;
  return { db, dbPath, applied };
}

// --- Unsorted repository ---------------------------------------------------
function listUnsorted() {
  return getDb()
    .prepare('SELECT * FROM unsorted ORDER BY created_at DESC, id DESC')
    .all();
}

function getUnsorted(id) {
  return getDb().prepare('SELECT * FROM unsorted WHERE id = ?').get(id);
}

function createUnsorted({ title, body } = {}) {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) throw new Error('Title is required.');
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      'INSERT INTO unsorted (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)'
    )
    .run(cleanTitle, (body || '').trim(), now, now);
  return getUnsorted(info.lastInsertRowid);
}

module.exports = {
  initDatabase,
  getDb,
  getDbPath,
  DB_FILENAME,
  MIGRATIONS,
  listUnsorted,
  getUnsorted,
  createUnsorted,
};
