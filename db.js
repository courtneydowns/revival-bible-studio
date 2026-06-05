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
  {
    name: '003_unsorted_archive',
    up(db) {
      // Archive is reversible: a non-null archived_at hides an entry from the
      // active list and shows it in the collapsed "Archived" section. NULL = active.
      db.exec(`ALTER TABLE unsorted ADD COLUMN archived_at TEXT;`);
    },
  },
  {
    name: '004_source_material',
    up(db) {
      // Source Material: reference inputs (the only thing attachable to Chat).
      // Same lifecycle/shape as unsorted; kept in its own table so the two
      // workspaces stay visibly separate (per CLAUDE.md).
      db.exec(`
        CREATE TABLE source_material (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT NOT NULL,
          body        TEXT NOT NULL DEFAULT '',
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          archived_at TEXT
        );
      `);
    },
  },
  {
    name: '005_documents',
    up(db) {
      // Documents: working/finished documents. Same lifecycle/shape as the
      // others; its own table keeps it visibly separate from Source Material
      // (per CLAUDE.md — the two must not be blended).
      db.exec(`
        CREATE TABLE documents (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT NOT NULL,
          body        TEXT NOT NULL DEFAULT '',
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          archived_at TEXT
        );
      `);
    },
  },
  {
    name: '006_chats',
    up(db) {
      // Chats: named conversation containers in the global Chat drawer. Shell
      // only — no messages and no AI yet (those arrive in later phases). The
      // archived_at column is included now for the standard reversible-archive
      // shape; rename/archive/restore wiring comes in a later phase.
      db.exec(`
        CREATE TABLE chats (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT NOT NULL,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          archived_at TEXT
        );
      `);
    },
  },
  {
    name: '007_chat_sources',
    up(db) {
      // Chat ↔ Source attachments (P18, "keep active" mode). A link table:
      // a chat can keep several Source Material entries active, always visible
      // so the user knows exactly what Claude would use. Source Material is the
      // only attachable type (per CLAUDE.md) — hence the FK to source_material
      // and nothing else. ON DELETE CASCADE drops the link when either the chat
      // or the source is deleted, so no dangling attachments. The PK makes
      // attaching idempotent (a source can't be attached twice to one chat).
      db.exec(`
        CREATE TABLE chat_sources (
          chat_id    INTEGER NOT NULL,
          source_id  INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (chat_id, source_id),
          FOREIGN KEY (chat_id)   REFERENCES chats(id)            ON DELETE CASCADE,
          FOREIGN KEY (source_id) REFERENCES source_material(id)  ON DELETE CASCADE
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
    .prepare(
      'SELECT * FROM unsorted WHERE archived_at IS NULL ORDER BY created_at DESC, id DESC'
    )
    .all();
}

function listArchivedUnsorted() {
  return getDb()
    .prepare(
      'SELECT * FROM unsorted WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC'
    )
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

function updateUnsorted(id, { title, body } = {}) {
  const existing = getUnsorted(id);
  if (!existing) throw new Error('Entry not found.');
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) throw new Error('Title is required.');
  getDb()
    .prepare(
      'UPDATE unsorted SET title = ?, body = ?, updated_at = ? WHERE id = ?'
    )
    .run(cleanTitle, (body || '').trim(), new Date().toISOString(), id);
  return getUnsorted(id);
}

function deleteUnsorted(id) {
  const info = getDb().prepare('DELETE FROM unsorted WHERE id = ?').run(id);
  return { deleted: info.changes > 0 };
}

function archiveUnsorted(id) {
  const existing = getUnsorted(id);
  if (!existing) throw new Error('Entry not found.');
  getDb()
    .prepare('UPDATE unsorted SET archived_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
  return getUnsorted(id);
}

function restoreUnsorted(id) {
  const existing = getUnsorted(id);
  if (!existing) throw new Error('Entry not found.');
  getDb()
    .prepare('UPDATE unsorted SET archived_at = NULL WHERE id = ?')
    .run(id);
  return getUnsorted(id);
}

// --- Generic entry repository ----------------------------------------------
// Builds the standard create/list/edit/delete/archive/restore API for any
// table that shares the unsorted shape (title, body, timestamps, archived_at).
// `table` is a trusted constant from this module — never user input.
function makeEntryRepo(table) {
  const getOne = (id) =>
    getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

  return {
    list: () =>
      getDb()
        .prepare(
          `SELECT * FROM ${table} WHERE archived_at IS NULL ORDER BY created_at DESC, id DESC`
        )
        .all(),
    listArchived: () =>
      getDb()
        .prepare(
          `SELECT * FROM ${table} WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC`
        )
        .all(),
    get: getOne,
    create: ({ title, body } = {}) => {
      const cleanTitle = (title || '').trim();
      if (!cleanTitle) throw new Error('Title is required.');
      const now = new Date().toISOString();
      const info = getDb()
        .prepare(
          `INSERT INTO ${table} (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)`
        )
        .run(cleanTitle, (body || '').trim(), now, now);
      return getOne(info.lastInsertRowid);
    },
    update: (id, { title, body } = {}) => {
      if (!getOne(id)) throw new Error('Entry not found.');
      const cleanTitle = (title || '').trim();
      if (!cleanTitle) throw new Error('Title is required.');
      getDb()
        .prepare(
          `UPDATE ${table} SET title = ?, body = ?, updated_at = ? WHERE id = ?`
        )
        .run(cleanTitle, (body || '').trim(), new Date().toISOString(), id);
      return getOne(id);
    },
    delete: (id) => {
      const info = getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      return { deleted: info.changes > 0 };
    },
    archive: (id) => {
      if (!getOne(id)) throw new Error('Entry not found.');
      getDb()
        .prepare(`UPDATE ${table} SET archived_at = ? WHERE id = ?`)
        .run(new Date().toISOString(), id);
      return getOne(id);
    },
    restore: (id) => {
      if (!getOne(id)) throw new Error('Entry not found.');
      getDb()
        .prepare(`UPDATE ${table} SET archived_at = NULL WHERE id = ?`)
        .run(id);
      return getOne(id);
    },
  };
}

const sourceMaterial = makeEntryRepo('source_material');
const documents = makeEntryRepo('documents');

// --- Chats repository ------------------------------------------------------
// Chats are conversation containers for the global Chat drawer. Bespoke (no
// body field). P16 adds rename + archive + restore on top of P15's create/list.
// Archive is reversible: non-null archived_at hides a chat from the active
// dropdown and shows it in the collapsed "Archived chats" section.
const chats = {
  list: () =>
    getDb()
      .prepare(
        'SELECT * FROM chats WHERE archived_at IS NULL ORDER BY created_at ASC, id ASC'
      )
      .all(),
  listArchived: () =>
    getDb()
      .prepare(
        'SELECT * FROM chats WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC'
      )
      .all(),
  get: (id) => getDb().prepare('SELECT * FROM chats WHERE id = ?').get(id),
  create: ({ title } = {}) => {
    const cleanTitle = (title || '').trim() || 'New chat';
    const now = new Date().toISOString();
    const info = getDb()
      .prepare(
        'INSERT INTO chats (title, created_at, updated_at) VALUES (?, ?, ?)'
      )
      .run(cleanTitle, now, now);
    return chats.get(info.lastInsertRowid);
  },
  rename: (id, { title } = {}) => {
    if (!chats.get(id)) throw new Error('Chat not found.');
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) throw new Error('Title is required.');
    getDb()
      .prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?')
      .run(cleanTitle, new Date().toISOString(), id);
    return chats.get(id);
  },
  archive: (id) => {
    if (!chats.get(id)) throw new Error('Chat not found.');
    getDb()
      .prepare('UPDATE chats SET archived_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    return chats.get(id);
  },
  restore: (id) => {
    if (!chats.get(id)) throw new Error('Chat not found.');
    getDb().prepare('UPDATE chats SET archived_at = NULL WHERE id = ?').run(id);
    return chats.get(id);
  },
};

// --- Chat ↔ Source attachments repository ----------------------------------
// "Keep active" mode (P18): the sources a chat keeps attached and always
// visible. Source Material is the only attachable type. Joined on read so the
// drawer has titles without a second query. P19 adds one-click detach below.
// The other P19 mode — "next message only" — is intentionally NOT stored here:
// it's ephemeral (cleared on send, never surviving a restart), so it lives in
// renderer memory only. This table is exclusively the persistent keep-active set.
const chatSources = {
  list: (chatId) =>
    getDb()
      .prepare(
        `SELECT s.id, s.title, s.body, s.archived_at,
                cs.created_at AS attached_at
           FROM chat_sources cs
           JOIN source_material s ON s.id = cs.source_id
          WHERE cs.chat_id = ?
          ORDER BY cs.created_at ASC, s.id ASC`
      )
      .all(chatId),
  attach: (chatId, sourceId) => {
    if (!chats.get(chatId)) throw new Error('Chat not found.');
    const src = getDb()
      .prepare('SELECT id FROM source_material WHERE id = ?')
      .get(sourceId);
    if (!src) throw new Error('Source not found.');
    // Idempotent: INSERT OR IGNORE leans on the (chat_id, source_id) PK so
    // attaching an already-active source is a harmless no-op.
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO chat_sources (chat_id, source_id, created_at) VALUES (?, ?, ?)'
      )
      .run(chatId, sourceId, new Date().toISOString());
    return chatSources.list(chatId);
  },
  // One-click remove (P19): drop a keep-active attachment. Idempotent — removing
  // a source that isn't attached is a harmless no-op. Returns the fresh list so
  // the drawer re-renders from the source of truth.
  detach: (chatId, sourceId) => {
    getDb()
      .prepare('DELETE FROM chat_sources WHERE chat_id = ? AND source_id = ?')
      .run(chatId, sourceId);
    return chatSources.list(chatId);
  },
};

// --- App settings (key/value) ----------------------------------------------
// Backed by the app_meta table (migration 001). Project Rules (P20) are the
// first real consumer: always-on, visible guidance Claude receives. Stored
// here so they persist across restarts. No hidden memory — the renderer always
// shows the stored value verbatim, and nothing else reads/writes this without
// the user clicking Save.
const PROJECT_RULES_KEY = 'project_rules';

const settings = {
  getProjectRules: () => {
    const row = getDb()
      .prepare('SELECT value FROM app_meta WHERE key = ?')
      .get(PROJECT_RULES_KEY);
    return row ? row.value : '';
  },
  setProjectRules: (text) => {
    const value = typeof text === 'string' ? text : '';
    getDb()
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(PROJECT_RULES_KEY, value);
    return { value };
  },
};

module.exports = {
  initDatabase,
  getDb,
  settings,
  getDbPath,
  DB_FILENAME,
  MIGRATIONS,
  sourceMaterial,
  documents,
  chats,
  chatSources,
  listUnsorted,
  listArchivedUnsorted,
  getUnsorted,
  createUnsorted,
  updateUnsorted,
  deleteUnsorted,
  archiveUnsorted,
  restoreUnsorted,
};
