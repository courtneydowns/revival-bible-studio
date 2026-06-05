// SQLite setup + migration runner (main process only). Local file, no network.
// Migrations are applied in order; each runs once, tracked in schema_migrations.
const fs = require('fs');
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
  {
    name: '008_open_questions',
    up(db) {
      // Open Questions: unresolved questions about the project. Same lifecycle/
      // shape as the other entry workspaces; its own table keeps it visibly
      // separate from Conflicts (per CLAUDE.md — the two must not be blended).
      db.exec(`
        CREATE TABLE open_questions (
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
    name: '009_conflicts',
    up(db) {
      // Conflicts: contradictions that need resolving. Same lifecycle/shape as
      // the other entry workspaces, but kept in its own table — per CLAUDE.md
      // Conflicts and Open Questions are separate workspaces and must not be
      // blended.
      db.exec(`
        CREATE TABLE conflicts (
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
    name: '010_decisions',
    up(db) {
      // Decisions: settled decisions for the Revival project. Same
      // lifecycle/shape as the other entry workspaces, own table.
      db.exec(`
        CREATE TABLE decisions (
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
    name: '011_brainstorm',
    up(db) {
      // Brainstorm: open idea generation, kept separate from Research. Same
      // lifecycle/shape as the other entry workspaces, own table.
      db.exec(`
        CREATE TABLE brainstorm (
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
    name: '012_research',
    up(db) {
      // Research: background and external research, kept separate from
      // Brainstorm. Same lifecycle/shape as the other entry workspaces, own
      // table.
      db.exec(`
        CREATE TABLE research (
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
    name: '013_characters',
    up(db) {
      // Characters (P26): the working surface for character development. For
      // now it shares the standard entry shape (title = character name, body =
      // development notes) and the same reversible-archive lifecycle. The
      // relational view, cross-workspace attachments, and canon flow are
      // explicitly later phases (P36+) — own table now so that wiring has a
      // home to grow into. No direct writes to Canon Bible (per CLAUDE.md).
      db.exec(`
        CREATE TABLE characters (
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
    name: '014_episodes',
    up(db) {
      // Episodes (P27): the working surface for episode drafting and outlining
      // (title = episode name, body = outline/scene list/beats/draft notes). It
      // shares the standard entry shape and the same reversible-archive
      // lifecycle. Cross-workspace attachments and canon flow are explicitly
      // later phases — own table now so that wiring has a home to grow into. No
      // direct writes to Canon Bible (per CLAUDE.md).
      db.exec(`
        CREATE TABLE episodes (
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
    name: '015_writing_lab',
    up(db) {
      // Writing Lab (P28): the long-form drafting surface. Shares the standard
      // entry shape (title + body + timestamps + reversible archive), but body
      // here holds long-form prose and is written by continuous autosave rather
      // than an explicit Save click — preservation, not finalization (per
      // CLAUDE.md). Drafts stay in Writing Lab; nothing flows to canon or any
      // other workspace without the user doing it explicitly in a later phase.
      db.exec(`
        CREATE TABLE writing_lab (
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
const openQuestions = makeEntryRepo('open_questions');
const conflicts = makeEntryRepo('conflicts');
const decisions = makeEntryRepo('decisions');
const brainstorm = makeEntryRepo('brainstorm');
const research = makeEntryRepo('research');
const characters = makeEntryRepo('characters');
const episodes = makeEntryRepo('episodes');

// --- Writing Lab repository ------------------------------------------------
// Long-form drafting (P28). Same shape as the entry workspaces, but bespoke
// because it is written by continuous autosave: a title is never required
// (untitled drafts get a placeholder name) and the body is stored verbatim —
// NOT trimmed — so prose whitespace and trailing newlines are preserved exactly
// as the user typed them. This is draft preservation, not finalization.
const writingLab = {
  list: () =>
    getDb()
      .prepare(
        'SELECT * FROM writing_lab WHERE archived_at IS NULL ORDER BY updated_at DESC, id DESC'
      )
      .all(),
  listArchived: () =>
    getDb()
      .prepare(
        'SELECT * FROM writing_lab WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC'
      )
      .all(),
  get: (id) => getDb().prepare('SELECT * FROM writing_lab WHERE id = ?').get(id),
  create: ({ title, body } = {}) => {
    const cleanTitle = (title || '').trim() || 'Untitled draft';
    const now = new Date().toISOString();
    const info = getDb()
      .prepare(
        'INSERT INTO writing_lab (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(cleanTitle, body || '', now, now);
    return writingLab.get(info.lastInsertRowid);
  },
  update: (id, { title, body } = {}) => {
    if (!writingLab.get(id)) throw new Error('Draft not found.');
    const cleanTitle = (title || '').trim() || 'Untitled draft';
    getDb()
      .prepare(
        'UPDATE writing_lab SET title = ?, body = ?, updated_at = ? WHERE id = ?'
      )
      .run(cleanTitle, body || '', new Date().toISOString(), id);
    return writingLab.get(id);
  },
  delete: (id) => {
    const info = getDb().prepare('DELETE FROM writing_lab WHERE id = ?').run(id);
    return { deleted: info.changes > 0 };
  },
  archive: (id) => {
    if (!writingLab.get(id)) throw new Error('Draft not found.');
    getDb()
      .prepare('UPDATE writing_lab SET archived_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    return writingLab.get(id);
  },
  restore: (id) => {
    if (!writingLab.get(id)) throw new Error('Draft not found.');
    getDb()
      .prepare('UPDATE writing_lab SET archived_at = NULL WHERE id = ?')
      .run(id);
    return writingLab.get(id);
  },
};

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

// --- Panic Export (P21) ----------------------------------------------------
// One-shot safety dump of EVERYTHING into a folder the user chose. This only
// copies — nothing is deleted, archived, or finalized (per CLAUDE.md: Panic
// Export is preservation). Writes three things into destFolder:
//   1. revival.sqlite      — a clean binary copy of the whole DB (safe under WAL
//                            via better-sqlite3's online backup).
//   2. database.json       — a human-readable dump of every table.
//   3. sources/*.txt       — each Source Material entry (active + archived) as
//                            its own text file, since uploaded source content
//                            lives in source_material.body, not on disk.
// Returns counts so the UI can confirm what was written.
async function exportAll(destFolder) {
  const db = getDb();

  // 1. Clean binary copy of the whole DB.
  await db.backup(path.join(destFolder, DB_FILENAME));

  // 2. Human-readable JSON dump of every user table. Table names come from
  // sqlite_master (trusted), never user input, so interpolation is safe.
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all();
  const dump = {};
  for (const { name } of tables) {
    dump[name] = db.prepare(`SELECT * FROM ${name}`).all();
  }
  fs.writeFileSync(
    path.join(destFolder, 'database.json'),
    JSON.stringify(dump, null, 2),
    'utf8'
  );

  // 3. Each Source Material entry as its own .txt (active + archived).
  const sourcesDir = path.join(destFolder, 'sources');
  fs.mkdirSync(sourcesDir, { recursive: true });
  const sources = db
    .prepare('SELECT id, title, body FROM source_material ORDER BY id ASC')
    .all();
  for (const s of sources) {
    const safeTitle =
      String(s.title || 'untitled')
        .replace(/[^a-z0-9-_ ]/gi, '_')
        .trim()
        .slice(0, 80) || 'untitled';
    const fname = `${String(s.id).padStart(4, '0')}_${safeTitle}.txt`;
    fs.writeFileSync(path.join(sourcesDir, fname), s.body || '', 'utf8');
  }

  return { db: DB_FILENAME, tables: tables.length, sources: sources.length };
}

// --- Home dashboard (P27) --------------------------------------------------
// Read-only aggregation for the Home overview: a count per workspace and a
// single recent-activity feed across every storage-backed workspace. Nothing
// here mutates anything — Home only summarizes what lives elsewhere (per
// CLAUDE.md). The section list is a trusted constant (table/label/route are
// never user input), so interpolating them into the count + UNION queries is
// safe. Only workspaces with real storage appear; Canon Bible/Review have no
// tables yet and are intentionally omitted.
const DASHBOARD_SECTIONS = [
  { key: 'writing_lab',     label: 'Writing Lab',     table: 'writing_lab',     route: 'Writing Lab' },
  { key: 'unsorted',        label: 'Unsorted',        table: 'unsorted',        route: 'Unsorted' },
  { key: 'source_material', label: 'Source Material', table: 'source_material', route: 'Source Material' },
  { key: 'documents',       label: 'Documents',       table: 'documents',       route: 'Documents' },
  { key: 'open_questions',  label: 'Open Questions',  table: 'open_questions',  route: 'Open Questions' },
  { key: 'conflicts',       label: 'Conflicts',       table: 'conflicts',       route: 'Conflicts' },
  { key: 'decisions',       label: 'Decisions',       table: 'decisions',       route: 'Decisions' },
  { key: 'brainstorm',      label: 'Brainstorm',      table: 'brainstorm',      route: 'Brainstorm' },
  { key: 'research',        label: 'Research',        table: 'research',        route: 'Research' },
  { key: 'characters',      label: 'Characters',      table: 'characters',      route: 'Characters' },
  { key: 'episodes',        label: 'Episodes',        table: 'episodes',        route: 'Episodes' },
  { key: 'chats',           label: 'Chats',           table: 'chats',           route: 'Chat' },
];

const dashboard = {
  // One row per workspace: active (live) and archived counts. These are the
  // numbers Home shows and must match each workspace's own lists exactly.
  counts: () => {
    const db = getDb();
    return DASHBOARD_SECTIONS.map((s) => {
      const active = db
        .prepare(`SELECT COUNT(*) AS n FROM ${s.table} WHERE archived_at IS NULL`)
        .get().n;
      const archived = db
        .prepare(`SELECT COUNT(*) AS n FROM ${s.table} WHERE archived_at IS NOT NULL`)
        .get().n;
      return { key: s.key, label: s.label, route: s.route, active, archived };
    });
  },
  // Most-recently-touched active entries across all workspaces, newest first.
  // updated_at carries the latest touch (create or edit); the renderer decides
  // the "created vs edited" wording. Archived entries are excluded so the feed
  // reflects what's actively being worked on.
  recent: (limit = 8) => {
    const unionSql = DASHBOARD_SECTIONS.map(
      (s) =>
        `SELECT '${s.label}' AS workspace, '${s.route}' AS route, id, title, ` +
        `created_at, updated_at FROM ${s.table} WHERE archived_at IS NULL`
    ).join(' UNION ALL ');
    return getDb()
      .prepare(`${unionSql} ORDER BY updated_at DESC, id DESC LIMIT ?`)
      .all(limit);
  },
  summary: (limit = 8) => ({
    counts: dashboard.counts(),
    recent: dashboard.recent(limit),
  }),
};

module.exports = {
  initDatabase,
  getDb,
  exportAll,
  settings,
  dashboard,
  getDbPath,
  DB_FILENAME,
  MIGRATIONS,
  sourceMaterial,
  documents,
  openQuestions,
  conflicts,
  decisions,
  brainstorm,
  research,
  characters,
  episodes,
  writingLab,
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
