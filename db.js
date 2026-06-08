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

  // -------------------------------------------------------------------------
  // P31 — Canon Bible schema. Implements the approved P30 schema
  // (docs/CANON_SCHEMA_FINAL.md). Read-only UI lands in this phase; create/
  // edit/lock/supersede/review arrive in P32–P35. Existing workspace tables
  // (unsorted, source_material, etc.) keep their current P5–P29 shape — the
  // FINAL schema reshape for those is deliberately out of scope here.
  // -------------------------------------------------------------------------

  {
    name: '016_sessions',
    up(db) {
      // Provenance — working/decision sessions whose outputs may land in canon.
      // Referenced by canon_entries.origin_session_id and canon_locked_decisions
      // via session_id. Standalone log; no app UI yet.
      db.exec(`
        CREATE TABLE sessions (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          session_date TEXT NOT NULL,
          label        TEXT NOT NULL,
          description  TEXT,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
      `);
    },
  },

  {
    name: '017_sources_provenance',
    up(db) {
      // Provenance — the canonical "where this came from" registry. Distinct
      // from the source_material workspace (which is user-facing reference
      // input attachable to Chat). This table carries the SQ-15 authority
      // hierarchy as metadata rows, not relational edges.
      db.exec(`
        CREATE TABLE sources (
          id                       INTEGER PRIMARY KEY AUTOINCREMENT,
          title                    TEXT NOT NULL,
          citation                 TEXT,
          authority_tier           TEXT,
          current_authority_state  TEXT,
          description              TEXT,
          created_at               TEXT NOT NULL,
          updated_at               TEXT NOT NULL
        );
      `);
    },
  },

  {
    name: '018_canon_entries',
    up(db) {
      // canon_entries — the typed spine of the Bible. One row per canon item;
      // entry_type drives which 1:1 detail table (canon_characters, etc.) holds
      // the type-specific fields. SQ-1: no draft columns here — all canon
      // changes flow through canon_proposals.
      db.exec(`
        CREATE TABLE canon_entries (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL,

          entry_type   TEXT NOT NULL CHECK(entry_type IN (
            'character','season','episode','locked_scene','locked_line',
            'locked_decision','knowledge_state','timeline_event',
            'viral_phase','virus_rule','institution','location',
            'motif','theme','production_rule','principle','rewatch_beat',
            'relationship'
          )),

          title        TEXT NOT NULL,
          body         TEXT,

          -- Lock state. Lock = currently accepted, editable-with-warning.
          locked       INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
          locked_at    TEXT,
          locked_label TEXT,

          -- Supersede chain. Both pointers stay NULL until a supersede happens.
          retired              INTEGER NOT NULL DEFAULT 0 CHECK(retired IN (0,1)),
          retired_at           TEXT,
          replaces_entry_id    INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,
          replaced_by_entry_id INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,

          -- SQ-8: all six status signals kept as separate columns. Provisional
          -- is a boolean flag; canon_status / certainty / review_state are the
          -- richer triplet shown on the entry.
          provisional  INTEGER NOT NULL DEFAULT 0 CHECK(provisional IN (0,1)),
          canon_status TEXT NOT NULL DEFAULT 'draft'
            CHECK(canon_status IN ('draft','speculative','implied','provisional','confirmed','retired','struck')),
          certainty    TEXT CHECK(certainty IN ('low','medium','high')),
          review_state TEXT CHECK(review_state IN
            ('placement_ready','needs_review','unresolved','deferred','re_confirmation_flagged','open_for_revision')),

          -- Provenance — forward-facing only (canon → origin). origin_entry_id
          -- is the row id inside whichever workspace table origin_kind names;
          -- it's polymorphic so no FK.
          origin_kind       TEXT CHECK(origin_kind IN
            ('characters_workspace','episodes_workspace','open_questions','conflicts',
             'decisions','brainstorm_items','research_items','unsorted_items',
             'documents','source_material','writing_lab_drafts','chat','manual','import')),
          origin_entry_id   INTEGER,
          origin_session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
          origin_lock_code  TEXT
        );

        CREATE INDEX canon_entries_entry_type_idx   ON canon_entries(entry_type);
        CREATE INDEX canon_entries_locked_idx       ON canon_entries(locked);
        CREATE INDEX canon_entries_retired_idx      ON canon_entries(retired);
        CREATE INDEX canon_entries_replaced_by_idx  ON canon_entries(replaced_by_entry_id);
        CREATE INDEX canon_entries_origin_idx       ON canon_entries(origin_kind, origin_entry_id);
      `);
    },
  },

  {
    name: '019_canon_entry_legacy_ids',
    up(db) {
      // Verbatim T/Q/A/CF/C/LINE/REL/PHASE/SLOT/UQ/OQ/NEW-B/ANCHOR codes —
      // multiple per entry, preserved exactly (case, hyphens, suffixes).
      // SQ-3: on supersede, codes migrate to the new row (is_primary=1) and
      // the retired row keeps is_primary=0 copies, so historical search still
      // resolves. SQ-6: cross-tracker aliases (e.g. Q-006/Q-008 drift) live
      // here via alias_of_code, NOT in canon_entry_relationships.
      // Uniqueness relaxed to (scheme, code, canon_entry_id) — single-primary
      // per (scheme, code) is enforced at the application layer.
      db.exec(`
        CREATE TABLE canon_entry_legacy_ids (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          canon_entry_id INTEGER NOT NULL REFERENCES canon_entries(id) ON DELETE CASCADE,
          scheme         TEXT NOT NULL,
          code           TEXT NOT NULL,
          is_primary     INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
          parent_code    TEXT,
          alias_of_code  TEXT,
          note           TEXT,
          created_at     TEXT NOT NULL,
          UNIQUE(scheme, code, canon_entry_id)
        );

        CREATE INDEX canon_entry_legacy_ids_entry_idx       ON canon_entry_legacy_ids(canon_entry_id);
        CREATE INDEX canon_entry_legacy_ids_parent_code_idx ON canon_entry_legacy_ids(parent_code);
      `);
    },
  },

  {
    name: '020_canon_entry_relationships',
    up(db) {
      // Typed edges between canon entries — e.g. supersedes/superseded_by for
      // the multi-supersede/split case (entry-level supersede pointers on
      // canon_entries cover the simple case). Also used for character↔character
      // ad-hoc edges that don't warrant a full entry_type='relationship' row.
      // relation_type is intentionally NOT CHECK-constrained — the vocabulary
      // grows as Canon Review evolves, and a CHECK would force a migration
      // for every new edge kind. Aliases are NOT a relation value (SQ-6).
      db.exec(`
        CREATE TABLE canon_entry_relationships (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          from_entry_id INTEGER NOT NULL REFERENCES canon_entries(id) ON DELETE CASCADE,
          to_entry_id   INTEGER NOT NULL REFERENCES canon_entries(id) ON DELETE CASCADE,
          relation_type TEXT NOT NULL,
          note          TEXT,
          created_at    TEXT NOT NULL,
          updated_at    TEXT NOT NULL,
          UNIQUE(from_entry_id, to_entry_id, relation_type)
        );

        CREATE INDEX canon_entry_relationships_from_idx ON canon_entry_relationships(from_entry_id);
        CREATE INDEX canon_entry_relationships_to_idx   ON canon_entry_relationships(to_entry_id);
      `);
    },
  },

  {
    name: '021_canon_detail_tables',
    up(db) {
      // 1:1 detail tables — one per entry_type that needs typed columns.
      // canon_entry_id is both PK and FK to canon_entries so lock/supersede/
      // legacy-id/provenance live uniformly on canon_entries and the detail
      // row carries only entity-specific fields. ON DELETE CASCADE means
      // dropping a canon_entries row clears the detail row with it.
      //
      // Three entry_types are intentionally non-1:1 and have NO detail table
      // here: knowledge_state (lives in canon_knowledge_states, multiple per
      // character), rewatch_beat (lives in canon_rewatch_beats), and
      // relationship (lives in canon_entry_relationships edges).
      db.exec(`
        -- Characters (SQ-16, SQ-17)
        CREATE TABLE canon_characters (
          canon_entry_id      INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          full_name           TEXT NOT NULL,
          display_name        TEXT NOT NULL,
          role                TEXT,
          dossier_tier        TEXT NOT NULL DEFAULT 'holding'
                                CHECK(dossier_tier IN ('full','holding','locked_unnamed')),
          age_at_series_start INTEGER,
          demographics        TEXT,
          sobriety_at_open    TEXT,
          absolute_exclusions TEXT,
          biography           TEXT,
          arc_resolution      TEXT,
          shadow_doc_entry_id INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL
        );

        CREATE TABLE canon_seasons (
          canon_entry_id INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          season_number  INTEGER NOT NULL UNIQUE,
          summary        TEXT
        );

        CREATE TABLE canon_episodes (
          canon_entry_id    INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          season_entry_id   INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,
          episode_number    INTEGER,
          episode_code      TEXT,
          working_title     TEXT,
          summary           TEXT,
          opening_register  TEXT,
          closing_image     TEXT
        );

        CREATE TABLE canon_locked_scenes (
          canon_entry_id     INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          episode_entry_id   INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,
          code               TEXT,
          scene_description  TEXT NOT NULL,
          locked_label       TEXT
        );

        -- Locked lines (SQ-7)
        CREATE TABLE canon_locked_lines (
          canon_entry_id     INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          episode_entry_id   INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,
          character_entry_id INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,
          code               TEXT,
          line_state         TEXT NOT NULL DEFAULT 'locked'
                              CHECK(line_state IN ('locked','texture_locked_words_open','architecture_locked','open')),
          line_text          TEXT,
          description        TEXT
        );

        -- Locked decisions (SQ-4: prose downstream_corrections moved to its own
        -- table, see migration 022). code is unique across decisions.
        CREATE TABLE canon_locked_decisions (
          canon_entry_id      INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          code                TEXT NOT NULL UNIQUE,
          scheme              TEXT NOT NULL CHECK(scheme IN ('T','A','CF')),
          parent_code         TEXT,
          session_id          INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
          session_date        TEXT,
          body                TEXT NOT NULL,
          supersedes_text     TEXT,
          confirms_text       TEXT,
          duplicates_closed   TEXT,
          categorical_section INTEGER
        );

        -- Knowledge states (SQ-5) — non-1:1, multiple per character.
        CREATE TABLE canon_knowledge_states (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          character_entry_id  INTEGER NOT NULL REFERENCES canon_entries(id) ON DELETE CASCADE,
          season_point        TEXT NOT NULL CHECK(season_point IN (
                                'PRE_SERIES','PRE_SERIES_REVIVAL',
                                'S1E1','S1E2','S1E3_S1E7','S1E8',
                                'S2E1','S2E2_S2E6','S2E7','S2E8',
                                'S3E1_S3E5','S3E6','S3E7_S3E8'
                              )),
          knowledge_item      TEXT NOT NULL,
          state               TEXT NOT NULL CHECK(state IN ('knows','does_not_know','learns','open','never')),
          note                TEXT,
          related_line_code   TEXT,
          created_at          TEXT NOT NULL,
          updated_at          TEXT NOT NULL
        );
        CREATE INDEX canon_knowledge_states_char_point_idx
          ON canon_knowledge_states(character_entry_id, season_point);

        CREATE TABLE canon_timeline_events (
          canon_entry_id INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          season_point  TEXT,
          sort_order    INTEGER,
          description   TEXT
        );

        CREATE TABLE canon_viral_phases (
          canon_entry_id INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          phase_number   INTEGER NOT NULL CHECK(phase_number BETWEEN 1 AND 5),
          phase_label    TEXT,
          description    TEXT,
          time_window    TEXT
        );

        CREATE TABLE canon_virus_rules (
          canon_entry_id     INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          rule_text          TEXT NOT NULL,
          applies_to_phase   INTEGER
        );

        CREATE TABLE canon_institutions (
          canon_entry_id INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          name           TEXT NOT NULL,
          description    TEXT
        );

        CREATE TABLE canon_locations (
          canon_entry_id INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          name           TEXT NOT NULL,
          location_type  TEXT,
          description    TEXT
        );

        CREATE TABLE canon_motifs (
          canon_entry_id INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          motif_name     TEXT NOT NULL,
          description    TEXT,
          recurrence     TEXT
        );

        -- Themes (SQ-14: spines stay here as theme_kind='spine')
        CREATE TABLE canon_themes (
          canon_entry_id INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          theme_kind     TEXT NOT NULL CHECK(theme_kind IN ('theme','buried_truth','spine','core_question','argument')),
          register       TEXT CHECK(register IN ('system','self','both')),
          statement      TEXT,
          spoken_in_show INTEGER NOT NULL DEFAULT 0 CHECK(spoken_in_show IN (0,1))
        );

        CREATE TABLE canon_production_rules (
          canon_entry_id INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          rule_text      TEXT NOT NULL,
          scope          TEXT
        );

        CREATE TABLE canon_principles (
          canon_entry_id  INTEGER PRIMARY KEY REFERENCES canon_entries(id) ON DELETE CASCADE,
          principle_text  TEXT NOT NULL,
          attribution     TEXT
        );

        -- Rewatch beats — non-1:1, multiple per entry.
        CREATE TABLE canon_rewatch_beats (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          canon_entry_id    INTEGER NOT NULL REFERENCES canon_entries(id) ON DELETE CASCADE,
          episode_entry_id  INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,
          season_point      TEXT,
          beat_text         TEXT NOT NULL,
          created_at        TEXT NOT NULL,
          updated_at        TEXT NOT NULL
        );
        CREATE INDEX canon_rewatch_beats_entry_idx ON canon_rewatch_beats(canon_entry_id);
      `);
    },
  },

  {
    name: '022_canon_downstream_corrections',
    up(db) {
      // SQ-4 — first-class child of canon_locked_decisions. Replaces the prose
      // downstream_corrections column. Active corrections shown by default;
      // completed ones collapse at the bottom (same archive/retire pattern
      // used everywhere). FK targets canon_entries.id because that's the PK
      // canon_locked_decisions reuses — functionally identical.
      db.exec(`
        CREATE TABLE canon_downstream_corrections (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          canon_entry_id  INTEGER NOT NULL REFERENCES canon_entries(id) ON DELETE CASCADE,
          correction_text TEXT NOT NULL,
          completed       INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
          completed_at    TEXT,
          ordinal         INTEGER NOT NULL,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );

        CREATE INDEX canon_downstream_corrections_entry_idx
          ON canon_downstream_corrections(canon_entry_id, completed);
      `);
    },
  },

  {
    name: '023_canon_proposals',
    up(db) {
      // The Canon Review queue — every proposed canon change lands here first.
      // P31 only creates the table; the review UI arrives in P35. SQ-10:
      // sent-back proposals overwrite in place — no revision-history child.
      // target_entry_id is NULL for proposal_intent='new_entry'.
      db.exec(`
        CREATE TABLE canon_proposals (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at           TEXT NOT NULL,
          updated_at           TEXT NOT NULL,

          target_entry_id      INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,
          proposal_intent      TEXT NOT NULL CHECK(proposal_intent IN
                                ('new_entry','update_entry','supersede_entry',
                                 'retire_entry','add_legacy_id','attach_relationship')),
          proposed_fields_json TEXT NOT NULL DEFAULT '{}',

          source_kind          TEXT,
          source_entry_id      INTEGER,
          proposer_note        TEXT,

          status               TEXT NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','approved','rejected','sent_back')),
          reviewed_at          TEXT,
          review_note          TEXT
        );

        CREATE INDEX canon_proposals_status_idx       ON canon_proposals(status);
        CREATE INDEX canon_proposals_target_idx       ON canon_proposals(target_entry_id);
      `);
    },
  },

  {
    name: '024_cross_workspace_attachments',
    up(db) {
      // SQ-2 — one polymorphic join table. Characters/Episodes attaching the
      // original five sources remains the core P36 use; the extension lets
      // Decisions/Open Questions/Conflicts act as hosts too, and adds
      // source_material as a permitted source. Host/source kinds use the
      // ACTUAL table names in this codebase (characters, episodes, brainstorm,
      // research), not the schema doc's "_workspace"/"_items" suffixes —
      // the FK targets need to match the row IDs we'd look up. Triggers in
      // the next migration enforce INSERT validity + DELETE cascade.
      db.exec(`
        CREATE TABLE cross_workspace_attachments (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at  TEXT NOT NULL,
          host_kind   TEXT NOT NULL CHECK(host_kind IN
                        ('characters','episodes','decisions','open_questions','conflicts')),
          host_id     INTEGER NOT NULL,
          source_kind TEXT NOT NULL CHECK(source_kind IN
                        ('decisions','open_questions','conflicts','brainstorm','research','source_material')),
          source_id   INTEGER NOT NULL,
          note        TEXT,
          UNIQUE(host_kind, host_id, source_kind, source_id)
        );

        CREATE INDEX cross_workspace_attachments_host_idx   ON cross_workspace_attachments(host_kind, host_id);
        CREATE INDEX cross_workspace_attachments_source_idx ON cross_workspace_attachments(source_kind, source_id);
      `);
    },
  },

  {
    name: '025_cross_workspace_attachments_triggers',
    up(db) {
      // SQ-9 — polymorphic FKs aren't native, so:
      //   1. BEFORE INSERT validity: host_id must exist in host_kind's table,
      //      and source_id in source_kind's table. RAISE(ABORT) on miss.
      //   2. AFTER DELETE on every host/source table: drop orphan attachment
      //      rows. Delete is authoritative.
      // UPDATE-side integrity is left to the app layer (SQ-9 explicitly).
      db.exec(`
        CREATE TRIGGER cross_workspace_attachments_insert_validity
        BEFORE INSERT ON cross_workspace_attachments
        BEGIN
          SELECT CASE
            WHEN NEW.host_kind = 'characters'
                 AND NOT EXISTS (SELECT 1 FROM characters     WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host characters row missing')
            WHEN NEW.host_kind = 'episodes'
                 AND NOT EXISTS (SELECT 1 FROM episodes       WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host episodes row missing')
            WHEN NEW.host_kind = 'decisions'
                 AND NOT EXISTS (SELECT 1 FROM decisions      WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host decisions row missing')
            WHEN NEW.host_kind = 'open_questions'
                 AND NOT EXISTS (SELECT 1 FROM open_questions WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host open_questions row missing')
            WHEN NEW.host_kind = 'conflicts'
                 AND NOT EXISTS (SELECT 1 FROM conflicts      WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host conflicts row missing')
          END;
          SELECT CASE
            WHEN NEW.source_kind = 'decisions'
                 AND NOT EXISTS (SELECT 1 FROM decisions       WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source decisions row missing')
            WHEN NEW.source_kind = 'open_questions'
                 AND NOT EXISTS (SELECT 1 FROM open_questions  WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source open_questions row missing')
            WHEN NEW.source_kind = 'conflicts'
                 AND NOT EXISTS (SELECT 1 FROM conflicts       WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source conflicts row missing')
            WHEN NEW.source_kind = 'brainstorm'
                 AND NOT EXISTS (SELECT 1 FROM brainstorm      WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source brainstorm row missing')
            WHEN NEW.source_kind = 'research'
                 AND NOT EXISTS (SELECT 1 FROM research        WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source research row missing')
            WHEN NEW.source_kind = 'source_material'
                 AND NOT EXISTS (SELECT 1 FROM source_material WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source source_material row missing')
          END;
        END;

        -- Delete cascades. Each row covers one workspace table; tables that
        -- are both host AND source (decisions, open_questions, conflicts) get
        -- two DELETEs so neither role leaves an orphan.
        CREATE TRIGGER characters_cwa_cascade AFTER DELETE ON characters BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE host_kind = 'characters' AND host_id = OLD.id;
        END;
        CREATE TRIGGER episodes_cwa_cascade AFTER DELETE ON episodes BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE host_kind = 'episodes' AND host_id = OLD.id;
        END;
        CREATE TRIGGER decisions_cwa_cascade AFTER DELETE ON decisions BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE (host_kind   = 'decisions' AND host_id   = OLD.id)
               OR (source_kind = 'decisions' AND source_id = OLD.id);
        END;
        CREATE TRIGGER open_questions_cwa_cascade AFTER DELETE ON open_questions BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE (host_kind   = 'open_questions' AND host_id   = OLD.id)
               OR (source_kind = 'open_questions' AND source_id = OLD.id);
        END;
        CREATE TRIGGER conflicts_cwa_cascade AFTER DELETE ON conflicts BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE (host_kind   = 'conflicts' AND host_id   = OLD.id)
               OR (source_kind = 'conflicts' AND source_id = OLD.id);
        END;
        CREATE TRIGGER brainstorm_cwa_cascade AFTER DELETE ON brainstorm BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE source_kind = 'brainstorm' AND source_id = OLD.id;
        END;
        CREATE TRIGGER research_cwa_cascade AFTER DELETE ON research BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE source_kind = 'research' AND source_id = OLD.id;
        END;
        CREATE TRIGGER source_material_cwa_cascade AFTER DELETE ON source_material BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE source_kind = 'source_material' AND source_id = OLD.id;
        END;
      `);
    },
  },

  {
    name: '026_tags',
    up(db) {
      // SQ-8 — hybrid tag library: a seeded starter set (is_seed=1) loads in
      // 028_seed_tags, and the user can add freeform tags after launch.
      // taggable_tags is intentionally polymorphic across ALL entities — its
      // entity_kind is NOT CHECK-constrained, so new taggable tables won't
      // need a migration. Integrity of entity_kind/entity_id is left to the
      // app (deliberate looseness per §3.7).
      db.exec(`
        CREATE TABLE tags (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL UNIQUE,
          category   TEXT,
          is_seed    INTEGER NOT NULL DEFAULT 0 CHECK(is_seed IN (0,1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE taggable_tags (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          entity_kind TEXT NOT NULL,
          entity_id   INTEGER NOT NULL,
          created_at  TEXT NOT NULL,
          UNIQUE(tag_id, entity_kind, entity_id)
        );

        CREATE INDEX taggable_tags_entity_idx ON taggable_tags(entity_kind, entity_id);
        CREATE INDEX taggable_tags_tag_idx    ON taggable_tags(tag_id);
      `);
    },
  },

  {
    name: '027_seed_tags',
    up(db) {
      // Idempotent: if any rows already exist in tags, do nothing. (The
      // migration-applied check already guarantees one-shot execution, but
      // this guard means re-seeding after a manual clear remains safe.)
      const existing = db.prepare('SELECT COUNT(*) AS n FROM tags').get().n;
      if (existing > 0) return;

      // 133 verbatim tags from the FINAL schema's TAGS — SEED LIST. The prose
      // in the schema says "134 tags" but the listed items sum to 133; we
      // preserve the list as written rather than fabricate an extra entry.
      const SEED_TAGS = [
        // Canon & Story (21)
        ['character','Canon & Story'],['relationship','Canon & Story'],['episode','Canon & Story'],
        ['season','Canon & Story'],['timeline','Canon & Story'],['location','Canon & Story'],
        ['institution','Canon & Story'],['motif','Canon & Story'],['theme','Canon & Story'],
        ['spine','Canon & Story'],['virus-rule','Canon & Story'],['viral-phase','Canon & Story'],
        ['treatment','Canon & Story'],['physical-marker','Canon & Story'],['production-rule','Canon & Story'],
        ['flanagan-principle','Canon & Story'],['locked-line','Canon & Story'],['locked-scene','Canon & Story'],
        ['locked-decision','Canon & Story'],['rewatch-beat','Canon & Story'],['knowledge-state','Canon & Story'],

        // Status / Review Signals (17)
        ['canon-candidate','Status / Review Signals'],['needs-review','Status / Review Signals'],
        ['provisional','Status / Review Signals'],['confirmed','Status / Review Signals'],
        ['retired','Status / Review Signals'],['superseded','Status / Review Signals'],
        ['struck','Status / Review Signals'],['flagged','Status / Review Signals'],
        ['open','Status / Review Signals'],['resolved','Status / Review Signals'],
        ['deferred','Status / Review Signals'],['possible-duplicate','Status / Review Signals'],
        ['possible-conflict','Status / Review Signals'],['confirmed-conflict','Status / Review Signals'],
        ['possible-canon','Status / Review Signals'],['possible-question','Status / Review Signals'],
        ['possible-decision','Status / Review Signals'],

        // Workflow / Routing (8)
        ['send-to-canon-review','Workflow / Routing'],['send-to-unsorted','Workflow / Routing'],
        ['route-to-decisions','Workflow / Routing'],['route-to-open-questions','Workflow / Routing'],
        ['route-to-conflicts','Workflow / Routing'],['route-to-brainstorm','Workflow / Routing'],
        ['route-to-research','Workflow / Routing'],['route-to-documents','Workflow / Routing'],

        // Creative Work (11)
        ['brainstorm','Creative Work'],['what-if','Creative Work'],['scene-concept','Creative Work'],
        ['dialogue','Creative Work'],['character-arc','Creative Work'],['plot-logic','Creative Work'],
        ['continuity','Creative Work'],['contradiction','Creative Work'],['conflict','Creative Work'],
        ['decision','Creative Work'],['open-question','Creative Work'],

        // Characters (7)
        ['megan','Characters'],['caroline','Characters'],['diane','Characters'],
        ['jordan','Characters'],['marcus','Characters'],['ray','Characters'],['renee','Characters'],

        // Seasons (3)
        ['s1','Seasons'],['s2','Seasons'],['s3','Seasons'],

        // NA / Recovery (7)
        ['na-fellowship','NA / Recovery'],['sponsorship','NA / Recovery'],['step-work','NA / Recovery'],
        ['meeting','NA / Recovery'],['sobriety','NA / Recovery'],['relapse','NA / Recovery'],
        ['recovery-house','NA / Recovery'],

        // Virus / Biology (10)
        ['phase-1','Virus / Biology'],['phase-2','Virus / Biology'],['phase-3','Virus / Biology'],
        ['phase-4','Virus / Biology'],['phase-5','Virus / Biology'],['transmission','Virus / Biology'],
        ['susceptibility','Virus / Biology'],['arrest-treatment','Virus / Biology'],
        ['72-hour-window','Virus / Biology'],['proximity-seeking','Virus / Biology'],

        // Episode Structure (9)
        ['opening-register','Episode Structure'],['closing-image','Episode Structure'],
        ['rewatch-seed','Episode Structure'],['title-open','Episode Structure'],
        ['title-locked','Episode Structure'],['title-option-a','Episode Structure'],
        ['title-option-b','Episode Structure'],['absolute-exclusion','Episode Structure'],
        ['standing-lock','Episode Structure'],

        // Relationships (11)
        ['sponsor-sponsee','Relationships'],['mother-daughter','Relationships'],['mother-son','Relationships'],
        ['chain-of-care','Relationships'],['estranged-repair','Relationships'],['institutional-ally','Relationships'],
        ['institutional-adversary','Relationships'],['professional-partnership','Relationships'],
        ['grief-carrier','Relationships'],['recovery-family','Relationships'],['architect-subject','Relationships'],

        // Writing / Craft (8)
        ['style-note','Writing / Craft'],['flanagan-filter','Writing / Craft'],['camera-rule','Writing / Craft'],
        ['score-rule','Writing / Craft'],['mirror-imagery','Writing / Craft'],['two-scene-rule','Writing / Craft'],
        ['diegetic-time','Writing / Craft'],['non-negotiable','Writing / Craft'],

        // Diane / Shadow Discipline (2)
        ['diane-shadow','Diane / Shadow Discipline'],['ambiguity-discipline','Diane / Shadow Discipline'],

        // Provenance / Audit (8)
        ['t-code','Provenance / Audit'],['q-code','Provenance / Audit'],['a-code','Provenance / Audit'],
        ['cf-code','Provenance / Audit'],['audit-pass','Provenance / Audit'],
        ['downstream-correction','Provenance / Audit'],['supersedes-prior','Provenance / Audit'],
        ['dead-archive','Provenance / Audit'],

        // Uncertainty Markers (6)
        ['needs-confirmation','Uncertainty Markers'],['inconsistent','Uncertainty Markers'],
        ['gap','Uncertainty Markers'],['placeholder','Uncertainty Markers'],
        ['locked-by-design','Uncertainty Markers'],['intentionally-absent','Uncertainty Markers'],

        // Source / Provenance (5)
        ['source-backed','Source / Provenance'],['session-note','Source / Provenance'],
        ['ai-suggested','Source / Provenance'],['imported','Source / Provenance'],
        ['manual-entry','Source / Provenance'],
      ];

      const now = new Date().toISOString();
      const insert = db.prepare(
        'INSERT INTO tags (name, category, is_seed, created_at, updated_at) VALUES (?, ?, 1, ?, ?)'
      );
      for (const [name, category] of SEED_TAGS) {
        insert.run(name, category, now, now);
      }
    },
  },

  // -------------------------------------------------------------------------
  // Workspace reshape (PR1–PR6) — bring existing workspace tables in line with
  // the approved FINAL canon schema (docs/CANON_SCHEMA_APPROVED.md). No new
  // features; renames/columns only, plus the SQLite-table-recreate cases
  // (CHECK constraints, etc.) that ALTER TABLE can't express.
  // -------------------------------------------------------------------------

  {
    name: '028_settings_reshape',
    up(db) {
      // PR1 — Reshape: app_meta → settings.
      //
      // The old key/value store had a single key ('project_rules') and no other
      // consumers. The FINAL schema replaces it with a single-row config table:
      // explicit columns for project_rules, claude_api_key (P39, local only),
      // and home_dismissed_suggestions_json (SQ-11), plus a CHECK(id = 1)
      // singleton constraint. SQLite can't add a CHECK to an existing table, so
      // this migration creates the new shape, copies the one value that
      // existed, and drops app_meta.
      const existing = db
        .prepare("SELECT value FROM app_meta WHERE key = 'project_rules'")
        .get();
      const projectRules = existing && existing.value != null ? existing.value : '';

      const now = new Date().toISOString();

      db.exec(`
        CREATE TABLE settings (
          id                              INTEGER PRIMARY KEY CHECK(id = 1),
          project_rules                   TEXT NOT NULL DEFAULT '',
          claude_api_key                  TEXT NULL,
          home_dismissed_suggestions_json TEXT NOT NULL DEFAULT '[]',
          created_at                      TEXT NOT NULL,
          updated_at                      TEXT NOT NULL
        );
      `);

      db.prepare(
        `INSERT INTO settings (id, project_rules, created_at, updated_at)
         VALUES (1, ?, ?, ?)`
      ).run(projectRules, now, now);

      db.exec('DROP TABLE app_meta;');
    },
  },

  {
    name: '029_unsorted_documents_source_material_reshape',
    up(db) {
      // PR2 — Reshape: unsorted + documents + source_material.
      //
      // Aligns these three workspace tables with the FINAL canon schema
      // (docs/CANON_SCHEMA_APPROVED.md):
      //   - Rename `unsorted` → `unsorted_items` (canon_entries.origin_kind
      //     already names 'unsorted_items'; no FK; no data migration needed).
      //   - Add the draft_*/last_drafted_at trio so the upcoming Canon Review
      //     flow can stage in-progress edits per workspace entry without
      //     touching the committed title/body.
      //   - Add file_kind + file_path on source_material so future P11
      //     uploads can record the on-disk artifact alongside the textual body.
      //
      // ALTER TABLE only — no recreates. SQLite 3.25+ allows ADD COLUMN with a
      // self-referencing CHECK constraint, which file_kind needs. draft_* and
      // file_path are simple nullable TEXT, so ADD COLUMN handles them
      // directly. Existing rows get NULL for the draft fields and 'text' for
      // file_kind (the schema default).
      db.exec(`
        ALTER TABLE unsorted RENAME TO unsorted_items;

        ALTER TABLE unsorted_items ADD COLUMN draft_title TEXT;
        ALTER TABLE unsorted_items ADD COLUMN draft_body TEXT;
        ALTER TABLE unsorted_items ADD COLUMN last_drafted_at TEXT;

        ALTER TABLE documents ADD COLUMN draft_title TEXT;
        ALTER TABLE documents ADD COLUMN draft_body TEXT;
        ALTER TABLE documents ADD COLUMN last_drafted_at TEXT;

        ALTER TABLE source_material ADD COLUMN draft_title TEXT;
        ALTER TABLE source_material ADD COLUMN draft_body TEXT;
        ALTER TABLE source_material ADD COLUMN last_drafted_at TEXT;

        ALTER TABLE source_material
          ADD COLUMN file_kind TEXT NOT NULL DEFAULT 'text'
            CHECK(file_kind IN ('text','pdf','image','other'));
        ALTER TABLE source_material ADD COLUMN file_path TEXT;
      `);
    },
  },

  {
    name: '030_chats_chat_source_attachments_reshape',
    up(db) {
      // PR3 — Reshape: chats + chat_source_attachments.
      //
      // Aligns the chat tables with the FINAL canon schema
      // (docs/CANON_SCHEMA_APPROVED.md):
      //   - Rename `chat_sources` → `chat_source_attachments` (link table; no
      //     data migration needed — the rename preserves rows, PK, and FKs).
      //   - Add draft_title on chats so the upcoming Canon Review flow can stage
      //     an in-progress chat title without touching the committed one.
      //
      // ALTER TABLE only — no recreates. RENAME TO carries the existing rows and
      // constraints; draft_title is a simple nullable TEXT, so ADD COLUMN
      // handles it directly. Existing chats get NULL for draft_title.
      db.exec(`
        ALTER TABLE chat_sources RENAME TO chat_source_attachments;

        ALTER TABLE chats ADD COLUMN draft_title TEXT;
      `);
    },
  },

  {
    name: '031_open_questions_conflicts_decisions_reshape',
    up(db) {
      // PR4 — Reshape: open_questions + conflicts + decisions.
      //
      // Aligns these three queue/decision workspaces with the FINAL canon
      // schema (docs/CANON_SCHEMA_APPROVED.md). Additive only — every new
      // column is nullable, no renames, no FKs, no recreates. Existing rows
      // get NULL for every added column.
      //
      //   - draft_*/last_drafted_at trio on all three: stages in-progress
      //     edits for the upcoming Canon Review flow without touching the
      //     committed title/body. Same shape PR2 added to unsorted_items/
      //     documents/source_material.
      //   - open_questions only:
      //       tier INTEGER NULL CHECK(tier IN (1,2,3))   — question importance
      //       category TEXT NULL                          — free-text grouping
      //       canon_promoted_entry_id INTEGER NULL        — populated when a
      //         question is promoted to canon via Canon Review; plain INTEGER
      //         per BUILD_PLAN PR4 (no FK — wire-up arrives later).
      //       resolved_by_decision_id INTEGER NULL        — populated when a
      //         question is resolved by a Decision; same — plain INTEGER for
      //         now, FK wiring deferred.
      //   - decisions only:
      //       decided_at TEXT NULL                        — timestamp of the
      //         settled-decision moment, distinct from created_at/updated_at.
      //
      // ALTER TABLE ADD COLUMN with a self-referencing CHECK is supported by
      // the SQLite version better-sqlite3 ships (same form already used for
      // file_kind in migration 029).
      db.exec(`
        ALTER TABLE open_questions ADD COLUMN draft_title TEXT;
        ALTER TABLE open_questions ADD COLUMN draft_body TEXT;
        ALTER TABLE open_questions ADD COLUMN last_drafted_at TEXT;
        ALTER TABLE open_questions ADD COLUMN tier INTEGER CHECK(tier IN (1,2,3));
        ALTER TABLE open_questions ADD COLUMN category TEXT;
        ALTER TABLE open_questions ADD COLUMN canon_promoted_entry_id INTEGER;
        ALTER TABLE open_questions ADD COLUMN resolved_by_decision_id INTEGER;

        ALTER TABLE conflicts ADD COLUMN draft_title TEXT;
        ALTER TABLE conflicts ADD COLUMN draft_body TEXT;
        ALTER TABLE conflicts ADD COLUMN last_drafted_at TEXT;

        ALTER TABLE decisions ADD COLUMN draft_title TEXT;
        ALTER TABLE decisions ADD COLUMN draft_body TEXT;
        ALTER TABLE decisions ADD COLUMN last_drafted_at TEXT;
        ALTER TABLE decisions ADD COLUMN decided_at TEXT;
      `);
    },
  },

  {
    name: '032_brainstorm_research_reshape',
    up(db) {
      // PR5 — Reshape: brainstorm + research.
      //
      // Aligns these two creative-work workspaces with the FINAL canon schema
      // (docs/CANON_SCHEMA_APPROVED.md):
      //   - Rename `brainstorm` → `brainstorm_items` and `research` →
      //     `research_items`. RENAME TO preserves rows, PK, and constraints.
      //   - Add the draft_*/last_drafted_at trio to both, staging in-progress
      //     edits for the upcoming Canon Review flow without touching the
      //     committed title/body — same shape PR2/PR4 added elsewhere.
      //   - research_items only: external_url TEXT NULL for an outbound link.
      //
      // ALTER TABLE only — no recreates. With legacy_alter_table off (the
      // better-sqlite3 default), RENAME TO rewrites the table references inside
      // the cross-workspace-attachment triggers automatically: the
      // brainstorm_cwa_cascade / research_cwa_cascade triggers and the
      // `FROM brainstorm` / `FROM research` lookups in
      // cross_workspace_attachments_insert_validity all follow the rename. The
      // `'brainstorm'` / `'research'` source_kind string literals are values,
      // not table references, so they stay — the logical source kinds are
      // unchanged. Every added column is nullable; existing rows get NULL.
      db.exec(`
        ALTER TABLE brainstorm RENAME TO brainstorm_items;
        ALTER TABLE research   RENAME TO research_items;

        ALTER TABLE brainstorm_items ADD COLUMN draft_title TEXT;
        ALTER TABLE brainstorm_items ADD COLUMN draft_body TEXT;
        ALTER TABLE brainstorm_items ADD COLUMN last_drafted_at TEXT;

        ALTER TABLE research_items ADD COLUMN draft_title TEXT;
        ALTER TABLE research_items ADD COLUMN draft_body TEXT;
        ALTER TABLE research_items ADD COLUMN last_drafted_at TEXT;
        ALTER TABLE research_items ADD COLUMN external_url TEXT;
      `);
    },
  },

  {
    name: '033_characters_episodes_writing_lab_reshape',
    up(db) {
      // PR6 — Reshape: characters + episodes + writing_lab.
      //
      // Aligns the three working-surface tables with the FINAL canon schema
      // (docs/CANON_SCHEMA_APPROVED.md):
      //   - Rename `characters` → `characters_workspace`,
      //     `episodes`   → `episodes_workspace`,
      //     `writing_lab`→ `writing_lab_drafts`.
      //     RENAME TO preserves rows, PK, constraints, and (with
      //     legacy_alter_table off — the better-sqlite3 default) rewrites the
      //     table references inside the cross-workspace-attachment triggers
      //     `characters_cwa_cascade` / `episodes_cwa_cascade` and the
      //     `FROM characters` / `FROM episodes` lookups in
      //     `cross_workspace_attachments_insert_validity` automatically. The
      //     `'characters'` / `'episodes'` host_kind string literals are values,
      //     not table references, so they stay — the logical host kinds are
      //     unchanged. (Same approach PR5 used for brainstorm/research.)
      //   - Add the draft_*/last_drafted_at trio to all three so the upcoming
      //     Canon Review flow can stage in-progress edits without touching the
      //     committed title/body. Same shape PR2/PR4/PR5 added elsewhere.
      //   - characters_workspace only:
      //       short_description TEXT NULL    — quick blurb shown in the list
      //         view alongside the title.
      //       canon_character_id INTEGER NULL — populated once a workspace
      //         character is promoted to a canon entry. Plain INTEGER (no FK)
      //         per the reshape rule: link wiring lands in a later phase, this
      //         migration only carves out the column.
      //   - episodes_workspace only:
      //       canon_episode_id INTEGER NULL  — same shape as
      //         canon_character_id; populated on canon promotion, no FK yet.
      //
      // ALTER TABLE only — no recreates. Every added column is nullable;
      // existing rows get NULL.
      db.exec(`
        ALTER TABLE characters  RENAME TO characters_workspace;
        ALTER TABLE episodes    RENAME TO episodes_workspace;
        ALTER TABLE writing_lab RENAME TO writing_lab_drafts;

        ALTER TABLE characters_workspace ADD COLUMN draft_title TEXT;
        ALTER TABLE characters_workspace ADD COLUMN draft_body TEXT;
        ALTER TABLE characters_workspace ADD COLUMN last_drafted_at TEXT;
        ALTER TABLE characters_workspace ADD COLUMN short_description TEXT;
        ALTER TABLE characters_workspace ADD COLUMN canon_character_id INTEGER;

        ALTER TABLE episodes_workspace ADD COLUMN draft_title TEXT;
        ALTER TABLE episodes_workspace ADD COLUMN draft_body TEXT;
        ALTER TABLE episodes_workspace ADD COLUMN last_drafted_at TEXT;
        ALTER TABLE episodes_workspace ADD COLUMN canon_episode_id INTEGER;

        ALTER TABLE writing_lab_drafts ADD COLUMN draft_title TEXT;
        ALTER TABLE writing_lab_drafts ADD COLUMN draft_body TEXT;
        ALTER TABLE writing_lab_drafts ADD COLUMN last_drafted_at TEXT;
      `);
    },
  },

  {
    name: '034_canon_proposals_add_deferred_status',
    up(db) {
      // P35 — Canon Review queue surfaces 'deferred' as a first-class status
      // (collapsed bottom section, like Retired in Canon Bible). The 023
      // migration's CHECK only allowed pending/approved/rejected/sent_back, so
      // we recreate the table with the wider CHECK. Nothing references
      // canon_proposals from outside, so the standard "create new → copy →
      // drop → rename → reindex" dance is safe even with foreign_keys=ON.
      db.exec(`
        CREATE TABLE canon_proposals_new (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at           TEXT NOT NULL,
          updated_at           TEXT NOT NULL,

          target_entry_id      INTEGER REFERENCES canon_entries(id) ON DELETE SET NULL,
          proposal_intent      TEXT NOT NULL CHECK(proposal_intent IN
                                ('new_entry','update_entry','supersede_entry',
                                 'retire_entry','add_legacy_id','attach_relationship')),
          proposed_fields_json TEXT NOT NULL DEFAULT '{}',

          source_kind          TEXT,
          source_entry_id      INTEGER,
          proposer_note        TEXT,

          status               TEXT NOT NULL DEFAULT 'pending'
                                CHECK(status IN ('pending','approved','rejected','sent_back','deferred')),
          reviewed_at          TEXT,
          review_note          TEXT
        );

        INSERT INTO canon_proposals_new
          (id, created_at, updated_at, target_entry_id, proposal_intent,
           proposed_fields_json, source_kind, source_entry_id, proposer_note,
           status, reviewed_at, review_note)
        SELECT id, created_at, updated_at, target_entry_id, proposal_intent,
               proposed_fields_json, source_kind, source_entry_id, proposer_note,
               status, reviewed_at, review_note
          FROM canon_proposals;

        DROP TABLE canon_proposals;
        ALTER TABLE canon_proposals_new RENAME TO canon_proposals;

        CREATE INDEX canon_proposals_status_idx ON canon_proposals(status);
        CREATE INDEX canon_proposals_target_idx ON canon_proposals(target_entry_id);
      `);
    },
  },
  {
    name: '035_canon_conflict_flags',
    up(db) {
      // PCONFLICT — sidecar linking a Conflicts workspace row back to the
      // canon-bible collision that produced it. Lets the next scan() decide
      // whether the routed Conflict is now stale (collision no longer
      // surfaced) and auto-archive it. One flag per conflicts row; cascades
      // on conflict delete so manual cleanup stays clean.
      //
      // signature is a stable identifier of the collision (kind + key facts +
      // sorted entry-id list). entry_ids_json keeps the involved canon ids
      // for debugging / future linkback UI. auto_archived_at is the latch:
      // once we've auto-archived a flag we never touch it again, so a manual
      // Restore in the Conflicts workspace isn't fought on the next scan.
      db.exec(`
        CREATE TABLE canon_conflict_flags (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          conflict_id      INTEGER NOT NULL UNIQUE REFERENCES conflicts(id) ON DELETE CASCADE,
          kind             TEXT NOT NULL,
          signature        TEXT NOT NULL,
          entry_ids_json   TEXT NOT NULL,
          created_at       TEXT NOT NULL,
          auto_archived_at TEXT
        );
        CREATE INDEX canon_conflict_flags_signature_idx ON canon_conflict_flags(signature);
        CREATE INDEX canon_conflict_flags_open_idx
          ON canon_conflict_flags(auto_archived_at);
      `);
    },
  },

  {
    name: '036_character_relationships',
    up(db) {
      // P37 — directed typed edges between characters_workspace entries.
      // relation_type is free text (e.g. "ally", "rival", "mentor", "family")
      // and intentionally NOT CHECK-constrained so the vocabulary can grow
      // without migrations. The UNIQUE constraint is on (from, to) — one edge
      // per ordered pair; the UI treats the pair as undirected for display but
      // preserves direction so "A is mentor of B" stays distinct from "B is
      // mentor of A". ON DELETE CASCADE keeps the table clean when a character
      // is deleted.
      db.exec(`
        CREATE TABLE character_relationships (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          from_char_id INTEGER NOT NULL REFERENCES characters_workspace(id) ON DELETE CASCADE,
          to_char_id   INTEGER NOT NULL REFERENCES characters_workspace(id) ON DELETE CASCADE,
          relation_type TEXT NOT NULL DEFAULT 'related',
          note         TEXT,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL,
          UNIQUE(from_char_id, to_char_id)
        );
        CREATE INDEX character_relationships_from_idx ON character_relationships(from_char_id);
        CREATE INDEX character_relationships_to_idx   ON character_relationships(to_char_id);
      `);
    },
  },

  {
    name: '037_character_relationships_multi',
    up(db) {
      // Remove UNIQUE(from_char_id, to_char_id) so the same pair can carry
      // multiple relationship types (e.g. "mentor" AND "rival" as separate
      // rows, each with its own note). SQLite can't drop a constraint
      // in-place, so we recreate the table and copy existing data.
      db.exec(`
        CREATE TABLE character_relationships_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          from_char_id INTEGER NOT NULL REFERENCES characters_workspace(id) ON DELETE CASCADE,
          to_char_id   INTEGER NOT NULL REFERENCES characters_workspace(id) ON DELETE CASCADE,
          relation_type TEXT NOT NULL DEFAULT 'related',
          note         TEXT,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
        INSERT INTO character_relationships_new
          SELECT id, from_char_id, to_char_id, relation_type, note, created_at, updated_at
          FROM   character_relationships;
        DROP TABLE character_relationships;
        ALTER TABLE character_relationships_new RENAME TO character_relationships;
        CREATE INDEX character_relationships_from_idx ON character_relationships(from_char_id);
        CREATE INDEX character_relationships_to_idx   ON character_relationships(to_char_id);
      `);
    },
  },
  {
    name: '038_api_key',
    up(db) {
      // P39 — store the Claude API key in the settings singleton row. Guard
      // against duplicate-column if the column was added outside the migration
      // system during development.
      const cols = db.prepare('PRAGMA table_info(settings)').all();
      if (!cols.some((c) => c.name === 'claude_api_key')) {
        db.exec(`ALTER TABLE settings ADD COLUMN claude_api_key TEXT NOT NULL DEFAULT ''`);
      }
    },
  },
  {
    name: '039_chat_messages',
    up(db) {
      // P40 — persisted conversation history. Each row is one turn (user or
      // assistant). ON DELETE CASCADE keeps cleanup automatic when a chat is
      // deleted. The index makes loading a chat's history fast.
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          role       TEXT    NOT NULL CHECK(role IN ('user','assistant')),
          content    TEXT    NOT NULL DEFAULT '',
          created_at TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id
          ON chat_messages(chat_id, id);
      `);
    },
  },
  {
    name: '041_cwa_expand',
    up(db) {
      // Expand cross-workspace attachments to all remaining workspaces.
      // The INSERT validity trigger (migration 025) uses CASE…WHEN and silently
      // passes unknown kinds, so no trigger recreation needed. We only add the
      // missing ON DELETE CASCADE triggers so orphan rows are cleaned up when
      // any of the new host/source entries are deleted.
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS brainstorm_items_host_cwa_cascade
        AFTER DELETE ON brainstorm_items BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE host_kind = 'brainstorm' AND host_id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS research_items_host_cwa_cascade
        AFTER DELETE ON research_items BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE host_kind = 'research' AND host_id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS writing_lab_cwa_cascade
        AFTER DELETE ON writing_lab_drafts BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE (host_kind = 'writing_lab' AND host_id = OLD.id)
               OR (source_kind = 'writing_lab' AND source_id = OLD.id);
        END;

        CREATE TRIGGER IF NOT EXISTS documents_cwa_cascade
        AFTER DELETE ON documents BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE (host_kind = 'documents' AND host_id = OLD.id)
               OR (source_kind = 'documents' AND source_id = OLD.id);
        END;

        CREATE TRIGGER IF NOT EXISTS source_material_host_cwa_cascade
        AFTER DELETE ON source_material BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE host_kind = 'source_material' AND host_id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS unsorted_items_host_cwa_cascade
        AFTER DELETE ON unsorted_items BEGIN
          DELETE FROM cross_workspace_attachments
            WHERE host_kind = 'unsorted' AND host_id = OLD.id;
        END;
      `);
    },
  },
  {
    name: '040_flanagan_analyses',
    up(db) {
      // P46-B — saved Flanagan Filter analyses attached to Open Questions entries.
      // ON DELETE CASCADE keeps cleanup automatic when a question is deleted.
      db.exec(`
        CREATE TABLE IF NOT EXISTS flanagan_analyses (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          question_id      INTEGER NOT NULL REFERENCES open_questions(id) ON DELETE CASCADE,
          scan_mode        TEXT    NOT NULL DEFAULT '',
          flanagan_version TEXT    NOT NULL DEFAULT '',
          summary          TEXT    NOT NULL DEFAULT '',
          breakdown        TEXT    NOT NULL DEFAULT '',
          north_star       TEXT    NOT NULL DEFAULT '',
          confidence       TEXT    NOT NULL DEFAULT '',
          is_stale         INTEGER NOT NULL DEFAULT 0,
          created_at       TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_flanagan_analyses_question
          ON flanagan_analyses(question_id, id);
      `);
    },
  },
  {
    name: '042_chat_message_archive',
    up(db) {
      db.exec(`ALTER TABLE chat_messages ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;`);
    },
  },
  {
    name: '043_flanagan_analyses_expand',
    up(db) {
      // PFLAN-EXPAND — generalise flanagan_analyses from Open Questions-only to any
      // workspace. Recreate the table to make question_id nullable (was NOT NULL
      // with FK) and add entity_kind + entity_id as the primary lookup keys.
      // Existing rows are backfilled: entity_kind = 'open_questions', entity_id = question_id.
      db.exec(`
        CREATE TABLE flanagan_analyses_new (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          question_id      INTEGER REFERENCES open_questions(id) ON DELETE CASCADE,
          entity_kind      TEXT    NOT NULL DEFAULT 'open_questions',
          entity_id        INTEGER NOT NULL DEFAULT 0,
          scan_mode        TEXT    NOT NULL DEFAULT '',
          flanagan_version TEXT    NOT NULL DEFAULT '',
          summary          TEXT    NOT NULL DEFAULT '',
          breakdown        TEXT    NOT NULL DEFAULT '',
          north_star       TEXT    NOT NULL DEFAULT '',
          confidence       TEXT    NOT NULL DEFAULT '',
          is_stale         INTEGER NOT NULL DEFAULT 0,
          created_at       TEXT    NOT NULL
        );

        INSERT INTO flanagan_analyses_new
          (id, question_id, entity_kind, entity_id, scan_mode, flanagan_version,
           summary, breakdown, north_star, confidence, is_stale, created_at)
        SELECT id, question_id, 'open_questions', question_id,
               scan_mode, flanagan_version, summary, breakdown, north_star,
               confidence, is_stale, created_at
          FROM flanagan_analyses;

        DROP TABLE flanagan_analyses;
        ALTER TABLE flanagan_analyses_new RENAME TO flanagan_analyses;

        CREATE INDEX idx_flanagan_analyses_question
          ON flanagan_analyses(question_id, id);
        CREATE INDEX idx_flanagan_analyses_entity
          ON flanagan_analyses(entity_kind, entity_id, id);
      `);
    },
  },
  {
    name: '045_cwa_expand_check_constraint',
    up(db) {
      // PDOC-WIRE (bugfix) — migration 041 added cascade triggers for 'documents'
      // and other new workspace kinds but never removed the table-level CHECK
      // constraint that only permits the original five host_kinds / six source_kinds.
      // INSERT OR IGNORE silently dropped any row whose kind wasn't in that list,
      // so Documents (and other post-041 kinds) could never be linked.
      //
      // Fix: use writable_schema to patch the stored CREATE TABLE statement in
      // sqlite_master, removing the restrictive CHECK clauses. This avoids a
      // DROP TABLE (which, inside a transaction with foreign_keys=ON, can mis-fire
      // the cascade triggers on other tables). The table structure is otherwise
      // unchanged; existing rows remain valid; no data is moved.
      //
      // Then drop + recreate the BEFORE INSERT validity trigger to add 'documents'
      // (and the other post-041 kinds) so referential integrity is still enforced.
      // With legacy_alter_table = OFF (SQLite default), DROP TABLE validates all
      // triggers that reference the table, which fires an error in the cascade
      // triggers from migration 025. Temporarily enable legacy mode so DROP TABLE
      // skips that reference-rewriting step, then restore immediately after rename.
      db.pragma('legacy_alter_table = ON');
      db.exec(`
        CREATE TABLE cross_workspace_attachments_new (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at  TEXT NOT NULL,
          host_kind   TEXT NOT NULL,
          host_id     INTEGER NOT NULL,
          source_kind TEXT NOT NULL,
          source_id   INTEGER NOT NULL,
          note        TEXT,
          UNIQUE(host_kind, host_id, source_kind, source_id)
        );
        INSERT INTO cross_workspace_attachments_new
          (id, created_at, host_kind, host_id, source_kind, source_id, note)
        SELECT id, created_at, host_kind, host_id, source_kind, source_id, note
          FROM cross_workspace_attachments;
        DROP TABLE cross_workspace_attachments;
        ALTER TABLE cross_workspace_attachments_new
          RENAME TO cross_workspace_attachments;
        CREATE INDEX cross_workspace_attachments_host_idx
          ON cross_workspace_attachments(host_kind, host_id);
        CREATE INDEX cross_workspace_attachments_source_idx
          ON cross_workspace_attachments(source_kind, source_id);
      `);
      db.pragma('legacy_alter_table = OFF');
      // Drop old trigger (covers only original six source kinds) and replace.
      db.exec(`
        DROP TRIGGER IF EXISTS cross_workspace_attachments_insert_validity;

        CREATE TRIGGER cross_workspace_attachments_insert_validity
        BEFORE INSERT ON cross_workspace_attachments
        BEGIN
          SELECT CASE
            WHEN NEW.host_kind = 'characters'
                 AND NOT EXISTS (SELECT 1 FROM characters_workspace WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host characters row missing')
            WHEN NEW.host_kind = 'episodes'
                 AND NOT EXISTS (SELECT 1 FROM episodes_workspace   WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host episodes row missing')
            WHEN NEW.host_kind = 'decisions'
                 AND NOT EXISTS (SELECT 1 FROM decisions             WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host decisions row missing')
            WHEN NEW.host_kind = 'open_questions'
                 AND NOT EXISTS (SELECT 1 FROM open_questions        WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host open_questions row missing')
            WHEN NEW.host_kind = 'conflicts'
                 AND NOT EXISTS (SELECT 1 FROM conflicts             WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host conflicts row missing')
            WHEN NEW.host_kind = 'brainstorm'
                 AND NOT EXISTS (SELECT 1 FROM brainstorm_items      WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host brainstorm row missing')
            WHEN NEW.host_kind = 'research'
                 AND NOT EXISTS (SELECT 1 FROM research_items        WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host research row missing')
            WHEN NEW.host_kind = 'documents'
                 AND NOT EXISTS (SELECT 1 FROM documents             WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host documents row missing')
            WHEN NEW.host_kind = 'source_material'
                 AND NOT EXISTS (SELECT 1 FROM source_material       WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host source_material row missing')
            WHEN NEW.host_kind = 'writing_lab'
                 AND NOT EXISTS (SELECT 1 FROM writing_lab_drafts    WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host writing_lab row missing')
            WHEN NEW.host_kind = 'unsorted'
                 AND NOT EXISTS (SELECT 1 FROM unsorted_items        WHERE id = NEW.host_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: host unsorted row missing')
          END;
          SELECT CASE
            WHEN NEW.source_kind = 'decisions'
                 AND NOT EXISTS (SELECT 1 FROM decisions             WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source decisions row missing')
            WHEN NEW.source_kind = 'open_questions'
                 AND NOT EXISTS (SELECT 1 FROM open_questions        WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source open_questions row missing')
            WHEN NEW.source_kind = 'conflicts'
                 AND NOT EXISTS (SELECT 1 FROM conflicts             WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source conflicts row missing')
            WHEN NEW.source_kind = 'brainstorm'
                 AND NOT EXISTS (SELECT 1 FROM brainstorm_items      WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source brainstorm row missing')
            WHEN NEW.source_kind = 'research'
                 AND NOT EXISTS (SELECT 1 FROM research_items        WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source research row missing')
            WHEN NEW.source_kind = 'source_material'
                 AND NOT EXISTS (SELECT 1 FROM source_material       WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source source_material row missing')
            WHEN NEW.source_kind = 'documents'
                 AND NOT EXISTS (SELECT 1 FROM documents             WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source documents row missing')
            WHEN NEW.source_kind = 'writing_lab'
                 AND NOT EXISTS (SELECT 1 FROM writing_lab_drafts    WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source writing_lab row missing')
            WHEN NEW.source_kind = 'characters'
                 AND NOT EXISTS (SELECT 1 FROM characters_workspace  WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source characters row missing')
            WHEN NEW.source_kind = 'episodes'
                 AND NOT EXISTS (SELECT 1 FROM episodes_workspace    WHERE id = NEW.source_id)
              THEN RAISE(ABORT, 'cross_workspace_attachments: source episodes row missing')
          END;
        END;
      `);
    },
  },
  {
    name: '044_chat_document_attachments',
    up(db) {
      // PDOC-WIRE — Documents now attachable to Chat (keep-active / next-message-only).
      // Parallel to chat_source_attachments but joined to the documents table.
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_document_attachments (
          chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (chat_id, document_id)
        );

        CREATE INDEX idx_chat_document_attachments_chat
          ON chat_document_attachments(chat_id);
      `);
    },
  },
  {
    name: '046_session_logs',
    up(db) {
      // PSESSION-LOG — audit trail of actions per session.
      db.exec(`
        CREATE TABLE IF NOT EXISTS session_logs (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at TEXT NOT NULL,
          ended_at   TEXT NOT NULL,
          events     TEXT NOT NULL
        );
      `);
    },
  },
  {
    name: '045_chat_entity_attachments',
    up(db) {
      // PCHAT-ATTACH — Canon Bible entries, Characters, and Episodes now attachable to Chat.
      // Same keep-active / next-message-only semantics as source_material / documents.
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_canon_attachments (
          chat_id        INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          canon_entry_id INTEGER NOT NULL REFERENCES canon_entries(id) ON DELETE CASCADE,
          created_at     TEXT NOT NULL,
          PRIMARY KEY (chat_id, canon_entry_id)
        );
        CREATE INDEX IF NOT EXISTS idx_chat_canon_attachments_chat
          ON chat_canon_attachments(chat_id);

        CREATE TABLE IF NOT EXISTS chat_characters_attachments (
          chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          character_id INTEGER NOT NULL REFERENCES characters_workspace(id) ON DELETE CASCADE,
          created_at   TEXT NOT NULL,
          PRIMARY KEY (chat_id, character_id)
        );
        CREATE INDEX IF NOT EXISTS idx_chat_characters_attachments_chat
          ON chat_characters_attachments(chat_id);

        CREATE TABLE IF NOT EXISTS chat_episodes_attachments (
          chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          episode_id INTEGER NOT NULL REFERENCES episodes_workspace(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL,
          PRIMARY KEY (chat_id, episode_id)
        );
        CREATE INDEX IF NOT EXISTS idx_chat_episodes_attachments_chat
          ON chat_episodes_attachments(chat_id);
      `);
    },
  },
  {
    name: '047_pblock',
    up(db) {
      // PBLOCK — blocking flag, tier escalation, promote-to-decision.
      db.exec(`
        ALTER TABLE open_questions ADD COLUMN is_blocking       INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE open_questions ADD COLUMN blocking_target   TEXT;
        ALTER TABLE open_questions ADD COLUMN blocking_type     TEXT CHECK(blocking_type IN ('episode','character','arc'));
        ALTER TABLE open_questions ADD COLUMN tier_escalated_at TEXT;
        ALTER TABLE open_questions ADD COLUMN tier_escalated_from INTEGER;

        ALTER TABLE decisions ADD COLUMN source_question_id INTEGER REFERENCES open_questions(id) ON DELETE SET NULL;
      `);
    },
  },

  {
    name: '048_pbrain_struct',
    up(db) {
      // PBRAIN-STRUCT — brainstorm internal structure.
      // - brainstorm_threads: named collapsible groups for brainstorm_items.
      // - thread_id FK on brainstorm_items (ON DELETE SET NULL — threads can be
      //   archived/deleted without losing their entries).
      // - dev_into_kind / dev_into_id: "developed into" pointer to any other
      //   workspace entry (link-don't-copy, bi-directional via links.for query).
      // - bs_status: Rough / Developing / Ready to Route — user-set badge.
      db.exec(`
        CREATE TABLE brainstorm_threads (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT NOT NULL,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          archived_at TEXT
        );

        ALTER TABLE brainstorm_items ADD COLUMN thread_id      INTEGER REFERENCES brainstorm_threads(id) ON DELETE SET NULL;
        ALTER TABLE brainstorm_items ADD COLUMN dev_into_kind  TEXT;
        ALTER TABLE brainstorm_items ADD COLUMN dev_into_id    INTEGER;
        ALTER TABLE brainstorm_items ADD COLUMN bs_status      TEXT CHECK(bs_status IN ('rough','developing','ready'));
      `);
    },
  },

  {
    name: '049_pchar_status',
    up(db) {
      // PCHAR-STATUS — Active / Recurring / Departed / Deceased status field
      // on every Character entry. Nullable — existing rows get NULL (no status).
      // Feeds the character arc tracker and episode continuity checker.
      db.exec(`
        ALTER TABLE characters_workspace ADD COLUMN char_status TEXT CHECK(char_status IN ('active','recurring','departed','deceased'));
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
// Backed by `unsorted_items` (renamed from `unsorted` in migration 029 to
// match the FINAL canon schema). The exported helpers keep their original
// names so callers (main.js IPC, exports list) don't need to change.
function listUnsorted() {
  return getDb()
    .prepare(
      'SELECT * FROM unsorted_items WHERE archived_at IS NULL ORDER BY created_at DESC, id DESC'
    )
    .all();
}

function listArchivedUnsorted() {
  return getDb()
    .prepare(
      'SELECT * FROM unsorted_items WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC'
    )
    .all();
}

function getUnsorted(id) {
  return getDb().prepare('SELECT * FROM unsorted_items WHERE id = ?').get(id);
}

function createUnsorted({ title, body } = {}) {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) throw new Error('Title is required.');
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      'INSERT INTO unsorted_items (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)'
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
      'UPDATE unsorted_items SET title = ?, body = ?, updated_at = ? WHERE id = ?'
    )
    .run(cleanTitle, (body || '').trim(), new Date().toISOString(), id);
  return getUnsorted(id);
}

function deleteUnsorted(id) {
  const info = getDb().prepare('DELETE FROM unsorted_items WHERE id = ?').run(id);
  return { deleted: info.changes > 0 };
}

function archiveUnsorted(id) {
  const existing = getUnsorted(id);
  if (!existing) throw new Error('Entry not found.');
  getDb()
    .prepare('UPDATE unsorted_items SET archived_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
  return getUnsorted(id);
}

function restoreUnsorted(id) {
  const existing = getUnsorted(id);
  if (!existing) throw new Error('Entry not found.');
  getDb()
    .prepare('UPDATE unsorted_items SET archived_at = NULL WHERE id = ?')
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

// PBLOCK — escalate tier and set blocking flag.
openQuestions.escalateTier = (id) => {
  const db = getDb();
  const q = db.prepare('SELECT * FROM open_questions WHERE id = ?').get(id);
  if (!q) throw new Error('Entry not found.');
  if (!q.tier || q.tier === 1) throw new Error('Already Tier 1 or tier not set.');
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE open_questions
        SET tier = 1, tier_escalated_at = ?, tier_escalated_from = ?, updated_at = ?
      WHERE id = ?`
  ).run(now, q.tier, now, id);
  return db.prepare('SELECT * FROM open_questions WHERE id = ?').get(id);
};

openQuestions.setBlocking = (id, { is_blocking = false, blocking_target = null, blocking_type = null } = {}) => {
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM open_questions WHERE id = ?').get(id)) throw new Error('Entry not found.');
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE open_questions
        SET is_blocking = ?, blocking_target = ?, blocking_type = ?, updated_at = ?
      WHERE id = ?`
  ).run(is_blocking ? 1 : 0, is_blocking ? (blocking_target || null) : null, is_blocking ? (blocking_type || null) : null, now, id);
  return db.prepare('SELECT * FROM open_questions WHERE id = ?').get(id);
};

const conflicts = makeEntryRepo('conflicts');
const decisions = makeEntryRepo('decisions');

// PBLOCK — create a Decision from an Open Question (promote-to-decision).
decisions.createFromQuestion = (questionId, { title, body } = {}) => {
  const db = getDb();
  const q = db.prepare('SELECT * FROM open_questions WHERE id = ?').get(questionId);
  if (!q) throw new Error('Question not found.');
  const cleanTitle = (title || q.title || '').trim();
  if (!cleanTitle) throw new Error('Title is required.');
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO decisions (title, body, created_at, updated_at, source_question_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(cleanTitle, (body || q.body || '').trim(), now, now, questionId);
  const decision = db.prepare('SELECT * FROM decisions WHERE id = ?').get(info.lastInsertRowid);
  db.prepare(
    `UPDATE open_questions SET resolved_by_decision_id = ?, updated_at = ? WHERE id = ?`
  ).run(decision.id, now, questionId);
  return decision;
};
const brainstorm = makeEntryRepo('brainstorm_items');

// PBRAIN-STRUCT — thread management and item-level metadata mutations.
const brainstormThreads = {
  list() {
    return getDb()
      .prepare('SELECT * FROM brainstorm_threads WHERE archived_at IS NULL ORDER BY created_at ASC, id ASC')
      .all();
  },
  listArchived() {
    return getDb()
      .prepare('SELECT * FROM brainstorm_threads WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC')
      .all();
  },
  create(title) {
    const clean = (title || '').trim();
    if (!clean) throw new Error('Thread title is required.');
    const now = new Date().toISOString();
    const info = getDb()
      .prepare('INSERT INTO brainstorm_threads (title, created_at, updated_at) VALUES (?, ?, ?)')
      .run(clean, now, now);
    return getDb().prepare('SELECT * FROM brainstorm_threads WHERE id = ?').get(info.lastInsertRowid);
  },
  update(id, title) {
    const clean = (title || '').trim();
    if (!clean) throw new Error('Thread title is required.');
    const now = new Date().toISOString();
    getDb()
      .prepare('UPDATE brainstorm_threads SET title = ?, updated_at = ? WHERE id = ?')
      .run(clean, now, id);
    return getDb().prepare('SELECT * FROM brainstorm_threads WHERE id = ?').get(id);
  },
  archive(id) {
    const now = new Date().toISOString();
    getDb()
      .prepare('UPDATE brainstorm_threads SET archived_at = ? WHERE id = ?')
      .run(now, id);
    // Ungroup entries so they are not stranded in an invisible thread.
    getDb()
      .prepare('UPDATE brainstorm_items SET thread_id = NULL WHERE thread_id = ?')
      .run(id);
    return getDb().prepare('SELECT * FROM brainstorm_threads WHERE id = ?').get(id);
  },
  restore(id) {
    getDb()
      .prepare('UPDATE brainstorm_threads SET archived_at = NULL WHERE id = ?')
      .run(id);
    return getDb().prepare('SELECT * FROM brainstorm_threads WHERE id = ?').get(id);
  },
  delete(id) {
    getDb().prepare('UPDATE brainstorm_items SET thread_id = NULL WHERE thread_id = ?').run(id);
    const info = getDb().prepare('DELETE FROM brainstorm_threads WHERE id = ?').run(id);
    return { deleted: info.changes > 0 };
  },
};

brainstorm.setThread = (id, threadId) => {
  getDb()
    .prepare('UPDATE brainstorm_items SET thread_id = ?, updated_at = ? WHERE id = ?')
    .run(threadId || null, new Date().toISOString(), id);
  return getDb().prepare('SELECT * FROM brainstorm_items WHERE id = ?').get(id);
};

brainstorm.setDevInto = (id, kind, targetId) => {
  getDb()
    .prepare('UPDATE brainstorm_items SET dev_into_kind = ?, dev_into_id = ?, updated_at = ? WHERE id = ?')
    .run(kind || null, targetId || null, new Date().toISOString(), id);
  return getDb().prepare('SELECT * FROM brainstorm_items WHERE id = ?').get(id);
};

brainstorm.setStatus = (id, status) => {
  const valid = ['rough', 'developing', 'ready', null];
  if (!valid.includes(status)) throw new Error('Invalid status value.');
  getDb()
    .prepare('UPDATE brainstorm_items SET bs_status = ?, updated_at = ? WHERE id = ?')
    .run(status || null, new Date().toISOString(), id);
  return getDb().prepare('SELECT * FROM brainstorm_items WHERE id = ?').get(id);
};

brainstorm.devIntoBackRefs = (kind, targetId) => {
  return getDb()
    .prepare(
      'SELECT id, title FROM brainstorm_items WHERE dev_into_kind = ? AND dev_into_id = ? AND archived_at IS NULL'
    )
    .all(kind, targetId);
};

const research = makeEntryRepo('research_items');
// Backed by `characters_workspace` / `episodes_workspace` (renamed from
// `characters` / `episodes` in migration 033 to match the FINAL canon schema).
// Repo variable names — and the IPC channel prefixes that consume them — are
// intentionally left as `characters` / `episodes` so renderer wiring doesn't
// need to change for a table rename. (Same pattern PR5 used for brainstorm /
// research → brainstorm_items / research_items.)
const characters = makeEntryRepo('characters_workspace');
// PCHAR-STATUS — set char_status on a character entry.
characters.setStatus = function(id, status) {
  getDb()
    .prepare('UPDATE characters_workspace SET char_status = ?, updated_at = ? WHERE id = ?')
    .run(status || null, new Date().toISOString(), id);
  return characters.get(id);
};
const episodes = makeEntryRepo('episodes_workspace');

// --- Character relationships repository (P37) ------------------------------
// Typed edges between characters_workspace entries. Queries join both sides
// so the renderer gets character names without a second round-trip.
const characterRelationships = {
  _rowWithNames: (db) =>
    db.prepare(`
      SELECT cr.*,
             fa.title AS from_name,
             ta.title AS to_name
      FROM   character_relationships cr
      JOIN   characters_workspace fa ON fa.id = cr.from_char_id
      JOIN   characters_workspace ta ON ta.id = cr.to_char_id
    `),

  listAll() {
    return getDb()
      .prepare(`
        SELECT cr.*,
               fa.title AS from_name,
               ta.title AS to_name
        FROM   character_relationships cr
        JOIN   characters_workspace fa ON fa.id = cr.from_char_id
        JOIN   characters_workspace ta ON ta.id = cr.to_char_id
        ORDER  BY cr.created_at
      `)
      .all();
  },

  listForChar(charId) {
    return getDb()
      .prepare(`
        SELECT cr.*,
               fa.title AS from_name,
               ta.title AS to_name
        FROM   character_relationships cr
        JOIN   characters_workspace fa ON fa.id = cr.from_char_id
        JOIN   characters_workspace ta ON ta.id = cr.to_char_id
        WHERE  cr.from_char_id = ? OR cr.to_char_id = ?
        ORDER  BY cr.created_at
      `)
      .all(charId, charId);
  },

  create(fromId, toId, relationType, note) {
    const now = new Date().toISOString();
    const info = getDb()
      .prepare(
        `INSERT INTO character_relationships
           (from_char_id, to_char_id, relation_type, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(fromId, toId, relationType || 'related', note || null, now, now);
    return getDb()
      .prepare(`
        SELECT cr.*, fa.title AS from_name, ta.title AS to_name
        FROM   character_relationships cr
        JOIN   characters_workspace fa ON fa.id = cr.from_char_id
        JOIN   characters_workspace ta ON ta.id = cr.to_char_id
        WHERE  cr.id = ?
      `)
      .get(info.lastInsertRowid);
  },

  update(id, relationType, note) {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE character_relationships
         SET    relation_type = ?, note = ?, updated_at = ?
         WHERE  id = ?`
      )
      .run(relationType, note || null, now, id);
    return getDb()
      .prepare(`
        SELECT cr.*, fa.title AS from_name, ta.title AS to_name
        FROM   character_relationships cr
        JOIN   characters_workspace fa ON fa.id = cr.from_char_id
        JOIN   characters_workspace ta ON ta.id = cr.to_char_id
        WHERE  cr.id = ?
      `)
      .get(id);
  },

  delete(id) {
    const info = getDb()
      .prepare('DELETE FROM character_relationships WHERE id = ?')
      .run(id);
    return { deleted: info.changes > 0 };
  },
};

// --- Writing Lab repository ------------------------------------------------
// Long-form drafting (P28). Same shape as the entry workspaces, but bespoke
// because it is written by continuous autosave: a title is never required
// (untitled drafts get a placeholder name) and the body is stored verbatim —
// NOT trimmed — so prose whitespace and trailing newlines are preserved exactly
// as the user typed them. This is draft preservation, not finalization.
//
// Backed by `writing_lab_drafts` (renamed from `writing_lab` in migration 033
// to match the FINAL canon schema). The exported `writingLab` repo and its
// IPC channel prefix (`writingLab:*`) are intentionally unchanged so renderer
// wiring doesn't need to move for a table rename.
const writingLab = {
  list: () =>
    getDb()
      .prepare(
        'SELECT * FROM writing_lab_drafts WHERE archived_at IS NULL ORDER BY updated_at DESC, id DESC'
      )
      .all(),
  listArchived: () =>
    getDb()
      .prepare(
        'SELECT * FROM writing_lab_drafts WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id DESC'
      )
      .all(),
  get: (id) =>
    getDb().prepare('SELECT * FROM writing_lab_drafts WHERE id = ?').get(id),
  create: ({ title, body } = {}) => {
    const cleanTitle = (title || '').trim() || 'Untitled draft';
    const now = new Date().toISOString();
    const info = getDb()
      .prepare(
        'INSERT INTO writing_lab_drafts (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(cleanTitle, body || '', now, now);
    return writingLab.get(info.lastInsertRowid);
  },
  update: (id, { title, body } = {}) => {
    if (!writingLab.get(id)) throw new Error('Draft not found.');
    const cleanTitle = (title || '').trim() || 'Untitled draft';
    getDb()
      .prepare(
        'UPDATE writing_lab_drafts SET title = ?, body = ?, updated_at = ? WHERE id = ?'
      )
      .run(cleanTitle, body || '', new Date().toISOString(), id);
    return writingLab.get(id);
  },
  delete: (id) => {
    const info = getDb()
      .prepare('DELETE FROM writing_lab_drafts WHERE id = ?')
      .run(id);
    return { deleted: info.changes > 0 };
  },
  archive: (id) => {
    if (!writingLab.get(id)) throw new Error('Draft not found.');
    getDb()
      .prepare('UPDATE writing_lab_drafts SET archived_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    return writingLab.get(id);
  },
  restore: (id) => {
    if (!writingLab.get(id)) throw new Error('Draft not found.');
    getDb()
      .prepare('UPDATE writing_lab_drafts SET archived_at = NULL WHERE id = ?')
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
  delete: (id) => {
    if (!chats.get(id)) throw new Error('Chat not found.');
    getDb().prepare('DELETE FROM chats WHERE id = ?').run(id);
  },
  listWithMeta: () =>
    getDb()
      .prepare(
        `SELECT c.*,
           m.content    AS last_message,
           m.role       AS last_role,
           m.created_at AS last_message_at
         FROM chats c
         LEFT JOIN chat_messages m ON m.id = (
           SELECT id FROM chat_messages
           WHERE chat_id = c.id AND is_archived = 0
           ORDER BY id DESC LIMIT 1
         )
         WHERE c.archived_at IS NULL
         ORDER BY COALESCE(m.created_at, c.created_at) DESC, c.id DESC`
      )
      .all(),
  listArchivedWithMeta: () =>
    getDb()
      .prepare(
        `SELECT c.*,
           m.content    AS last_message,
           m.role       AS last_role,
           m.created_at AS last_message_at
         FROM chats c
         LEFT JOIN chat_messages m ON m.id = (
           SELECT id FROM chat_messages
           WHERE chat_id = c.id AND is_archived = 0
           ORDER BY id DESC LIMIT 1
         )
         WHERE c.archived_at IS NOT NULL
         ORDER BY c.archived_at DESC, c.id DESC`
      )
      .all(),
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
           FROM chat_source_attachments cs
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
        'INSERT OR IGNORE INTO chat_source_attachments (chat_id, source_id, created_at) VALUES (?, ?, ?)'
      )
      .run(chatId, sourceId, new Date().toISOString());
    return chatSources.list(chatId);
  },
  // One-click remove (P19): drop a keep-active attachment. Idempotent — removing
  // a source that isn't attached is a harmless no-op. Returns the fresh list so
  // the drawer re-renders from the source of truth.
  detach: (chatId, sourceId) => {
    getDb()
      .prepare('DELETE FROM chat_source_attachments WHERE chat_id = ? AND source_id = ?')
      .run(chatId, sourceId);
    return chatSources.list(chatId);
  },
};

// --- Chat document attachments (PDOC-WIRE) ------------------------------------
// Parallel to chatSources but joins against the documents table.
const chatDocuments = {
  list: (chatId) =>
    getDb()
      .prepare(
        `SELECT d.id, d.title, d.body, d.archived_at,
                cda.created_at AS attached_at
           FROM chat_document_attachments cda
           JOIN documents d ON d.id = cda.document_id
          WHERE cda.chat_id = ?
          ORDER BY cda.created_at ASC, d.id ASC`
      )
      .all(chatId),
  attach: (chatId, documentId) => {
    if (!chats.get(chatId)) throw new Error('Chat not found.');
    const doc = getDb()
      .prepare('SELECT id FROM documents WHERE id = ?')
      .get(documentId);
    if (!doc) throw new Error('Document not found.');
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO chat_document_attachments (chat_id, document_id, created_at) VALUES (?, ?, ?)'
      )
      .run(chatId, documentId, new Date().toISOString());
    return chatDocuments.list(chatId);
  },
  detach: (chatId, documentId) => {
    getDb()
      .prepare('DELETE FROM chat_document_attachments WHERE chat_id = ? AND document_id = ?')
      .run(chatId, documentId);
    return chatDocuments.list(chatId);
  },
};

// --- Chat canon attachments (PCHAT-ATTACH) ------------------------------------
// Canon Bible entries attachable to Chat. keep-active mode persisted here;
// next-message-only lives in renderer memory only (same pattern as chatSources).
const chatCanon = {
  list: (chatId) =>
    getDb()
      .prepare(
        `SELECT ce.id, ce.title, ce.body, ce.entry_type, ce.locked,
                cca.created_at AS attached_at
           FROM chat_canon_attachments cca
           JOIN canon_entries ce ON ce.id = cca.canon_entry_id
          WHERE cca.chat_id = ?
          ORDER BY cca.created_at ASC, ce.id ASC`
      )
      .all(chatId),
  attach: (chatId, canonEntryId) => {
    if (!chats.get(chatId)) throw new Error('Chat not found.');
    const entry = getDb()
      .prepare('SELECT id FROM canon_entries WHERE id = ?')
      .get(canonEntryId);
    if (!entry) throw new Error('Canon entry not found.');
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO chat_canon_attachments (chat_id, canon_entry_id, created_at) VALUES (?, ?, ?)'
      )
      .run(chatId, canonEntryId, new Date().toISOString());
    return chatCanon.list(chatId);
  },
  detach: (chatId, canonEntryId) => {
    getDb()
      .prepare('DELETE FROM chat_canon_attachments WHERE chat_id = ? AND canon_entry_id = ?')
      .run(chatId, canonEntryId);
    return chatCanon.list(chatId);
  },
};

// --- Chat characters attachments (PCHAT-ATTACH) -------------------------------
const chatCharacters = {
  list: (chatId) =>
    getDb()
      .prepare(
        `SELECT cw.id, cw.title, cw.body, cw.archived_at,
                cca.created_at AS attached_at
           FROM chat_characters_attachments cca
           JOIN characters_workspace cw ON cw.id = cca.character_id
          WHERE cca.chat_id = ?
          ORDER BY cca.created_at ASC, cw.id ASC`
      )
      .all(chatId),
  attach: (chatId, characterId) => {
    if (!chats.get(chatId)) throw new Error('Chat not found.');
    const char = getDb()
      .prepare('SELECT id FROM characters_workspace WHERE id = ?')
      .get(characterId);
    if (!char) throw new Error('Character not found.');
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO chat_characters_attachments (chat_id, character_id, created_at) VALUES (?, ?, ?)'
      )
      .run(chatId, characterId, new Date().toISOString());
    return chatCharacters.list(chatId);
  },
  detach: (chatId, characterId) => {
    getDb()
      .prepare('DELETE FROM chat_characters_attachments WHERE chat_id = ? AND character_id = ?')
      .run(chatId, characterId);
    return chatCharacters.list(chatId);
  },
};

// --- Chat episodes attachments (PCHAT-ATTACH) ---------------------------------
const chatEpisodes = {
  list: (chatId) =>
    getDb()
      .prepare(
        `SELECT ew.id, ew.title, ew.body, ew.archived_at,
                cea.created_at AS attached_at
           FROM chat_episodes_attachments cea
           JOIN episodes_workspace ew ON ew.id = cea.episode_id
          WHERE cea.chat_id = ?
          ORDER BY cea.created_at ASC, ew.id ASC`
      )
      .all(chatId),
  attach: (chatId, episodeId) => {
    if (!chats.get(chatId)) throw new Error('Chat not found.');
    const ep = getDb()
      .prepare('SELECT id FROM episodes_workspace WHERE id = ?')
      .get(episodeId);
    if (!ep) throw new Error('Episode not found.');
    getDb()
      .prepare(
        'INSERT OR IGNORE INTO chat_episodes_attachments (chat_id, episode_id, created_at) VALUES (?, ?, ?)'
      )
      .run(chatId, episodeId, new Date().toISOString());
    return chatEpisodes.list(chatId);
  },
  detach: (chatId, episodeId) => {
    getDb()
      .prepare('DELETE FROM chat_episodes_attachments WHERE chat_id = ? AND episode_id = ?')
      .run(chatId, episodeId);
    return chatEpisodes.list(chatId);
  },
};

// --- Chat messages repository (P40) ----------------------------------------
// Persisted conversation turns for the global Chat drawer. Each row is one
// user or assistant turn. History is loaded in insertion order and passed
// verbatim to the Claude API as the messages array.
const chatMessages = {
  list: (chatId) =>
    getDb()
      .prepare('SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY id ASC')
      .all(chatId),
  add: (chatId, role, content) => {
    const now = new Date().toISOString();
    const info = getDb()
      .prepare(
        'INSERT INTO chat_messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)'
      )
      .run(chatId, role, content, now);
    return getDb()
      .prepare('SELECT * FROM chat_messages WHERE id = ?')
      .get(info.lastInsertRowid);
  },
  archive: (id) =>
    getDb().prepare('UPDATE chat_messages SET is_archived = 1 WHERE id = ?').run(id),
  unarchive: (id) =>
    getDb().prepare('UPDATE chat_messages SET is_archived = 0 WHERE id = ?').run(id),
};

// --- Flanagan analyses repository (P46-B) ----------------------------------
// Saved Flanagan Filter analysis records attached to Open Questions entries.
const flanaganAnalyses = {
  create(entityKind, entityId, { scanMode, flanaganVersion, summary, breakdown, northStar, confidence }) {
    const now = new Date().toISOString();
    const qId = entityKind === 'open_questions' ? entityId : null;
    const info = getDb()
      .prepare(`
        INSERT INTO flanagan_analyses
          (question_id, entity_kind, entity_id, scan_mode, flanagan_version,
           summary, breakdown, north_star, confidence, is_stale, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `)
      .run(
        qId,
        entityKind || 'open_questions',
        entityId,
        scanMode || '',
        flanaganVersion || '',
        summary || '',
        breakdown || '',
        northStar || '',
        confidence || '',
        now
      );
    return getDb()
      .prepare('SELECT * FROM flanagan_analyses WHERE id = ?')
      .get(info.lastInsertRowid);
  },
  listFor(entityKind, entityId) {
    return getDb()
      .prepare('SELECT * FROM flanagan_analyses WHERE entity_kind = ? AND entity_id = ? ORDER BY id DESC')
      .all(entityKind || 'open_questions', entityId);
  },
  markStale(id) {
    getDb()
      .prepare('UPDATE flanagan_analyses SET is_stale = 1 WHERE id = ?')
      .run(id);
    return getDb()
      .prepare('SELECT * FROM flanagan_analyses WHERE id = ?')
      .get(id);
  },
  delete(id) {
    getDb().prepare('DELETE FROM flanagan_analyses WHERE id = ?').run(id);
  },
};

// --- App settings ----------------------------------------------------------
// Backed by the single-row `settings` table (migration 028). Project Rules
// (P20) are the first real consumer: always-on, visible guidance Claude
// receives. Stored here so they persist across restarts. No hidden memory —
// the renderer always shows the stored value verbatim, and nothing else
// reads/writes this without the user clicking Save. Migration 028 guarantees
// the singleton row (id = 1) exists, so reads/writes never have to upsert.
const settings = {
  getProjectRules: () => {
    const row = getDb()
      .prepare('SELECT project_rules FROM settings WHERE id = 1')
      .get();
    return row ? row.project_rules : '';
  },
  setProjectRules: (text) => {
    const value = typeof text === 'string' ? text : '';
    getDb()
      .prepare(
        'UPDATE settings SET project_rules = ?, updated_at = ? WHERE id = 1'
      )
      .run(value, new Date().toISOString());
    return { value };
  },
  // P39 — Claude API key. Stored as plain text in the settings singleton;
  // it is local-only and only leaves the machine in outgoing Claude API calls.
  getClaudeApiKey: () => {
    const row = getDb()
      .prepare('SELECT claude_api_key FROM settings WHERE id = 1')
      .get();
    return row ? row.claude_api_key : '';
  },
  setClaudeApiKey: (key) => {
    const value = typeof key === 'string' ? key.trim() : '';
    getDb()
      .prepare(
        'UPDATE settings SET claude_api_key = ?, updated_at = ? WHERE id = 1'
      )
      .run(value, new Date().toISOString());
    return { ok: true };
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

  // 4. Each Canon entry as its own .txt — one file per entry, grouped by type.
  const canonEntries = db
    .prepare(
      `SELECT id, entry_type, title, body, canon_status, certainty, review_state,
              locked, locked_label, provisional, retired, created_at, updated_at
         FROM canon_entries
        ORDER BY entry_type ASC, id ASC`
    )
    .all();
  const canonDir = path.join(destFolder, 'canon');
  fs.mkdirSync(canonDir, { recursive: true });
  for (const ce of canonEntries) {
    const safeTitle =
      String(ce.title || 'untitled')
        .replace(/[^a-z0-9-_ ]/gi, '_')
        .trim()
        .slice(0, 80) || 'untitled';
    const fname = `${ce.entry_type}_${String(ce.id).padStart(4, '0')}_${safeTitle}.txt`;
    const meta = [
      `Type:   ${ce.entry_type}`,
      `Title:  ${ce.title || ''}`,
      `Status: ${ce.canon_status || ''}${ce.certainty ? ` (${ce.certainty})` : ''}`,
      ce.review_state ? `Review: ${ce.review_state}` : null,
      ce.locked ? `Locked: ${ce.locked_label || 'yes'}` : null,
      ce.provisional ? 'Provisional: yes' : null,
      ce.retired ? 'Retired: yes' : null,
      `Created: ${ce.created_at}`,
      `Updated: ${ce.updated_at}`,
    ]
      .filter(Boolean)
      .join('\n');
    fs.writeFileSync(
      path.join(canonDir, fname),
      `${meta}\n\n${ce.body || ''}`,
      'utf8'
    );
  }

  // 5. All Canon proposals as proposals.json.
  const proposals = db
    .prepare(
      `SELECT id, created_at, updated_at, target_entry_id, proposal_intent,
              proposed_fields_json, source_kind, source_entry_id, proposer_note,
              status, reviewed_at, review_note
         FROM canon_proposals
        ORDER BY status ASC, id ASC`
    )
    .all()
    .map((p) => ({
      ...p,
      proposed_fields: (() => {
        try { return JSON.parse(p.proposed_fields_json); } catch { return {}; }
      })(),
    }));
  fs.writeFileSync(
    path.join(destFolder, 'proposals.json'),
    JSON.stringify(proposals, null, 2),
    'utf8'
  );

  // 6. All tags + their usage counts as tags.json.
  const tags = db
    .prepare(
      `SELECT t.id, t.name, t.category, t.is_seed,
              COUNT(tt.id) AS usage_count
         FROM tags t
         LEFT JOIN taggable_tags tt ON tt.tag_id = t.id
        GROUP BY t.id
        ORDER BY t.category ASC, t.name ASC`
    )
    .all();
  fs.writeFileSync(
    path.join(destFolder, 'tags.json'),
    JSON.stringify(tags, null, 2),
    'utf8'
  );

  return {
    db: DB_FILENAME,
    tables: tables.length,
    sources: sources.length,
    canonEntries: canonEntries.length,
    proposals: proposals.length,
    tags: tags.length,
  };
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
  { key: 'writing_lab',     label: 'Writing Lab',     table: 'writing_lab_drafts',   route: 'Writing Lab' },
  { key: 'unsorted',        label: 'Unsorted',        table: 'unsorted_items',       route: 'Unsorted' },
  { key: 'source_material', label: 'Source Material', table: 'source_material',      route: 'Source Material' },
  { key: 'documents',       label: 'Documents',       table: 'documents',            route: 'Documents' },
  { key: 'open_questions',  label: 'Open Questions',  table: 'open_questions',       route: 'Open Questions' },
  { key: 'conflicts',       label: 'Conflicts',       table: 'conflicts',            route: 'Conflicts' },
  { key: 'decisions',       label: 'Decisions',       table: 'decisions',            route: 'Decisions' },
  { key: 'brainstorm',      label: 'Brainstorm',      table: 'brainstorm_items',     route: 'Brainstorm' },
  { key: 'research',        label: 'Research',        table: 'research_items',       route: 'Research' },
  { key: 'characters',      label: 'Characters',      table: 'characters_workspace', route: 'Characters' },
  { key: 'episodes',        label: 'Episodes',        table: 'episodes_workspace',   route: 'Episodes' },
  { key: 'chats',           label: 'Chats',           table: 'chats',                route: 'Chat' },
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
  // PHOME-NEEDS: items that need attention based on staleness + tier.
  // thresholds: { tier1QuestionDays, conflictDays, canonReviewDays }
  // Dates stored as ISO strings — JS cutoff strings compare correctly via
  // SQLite lexicographic order.
  needsAttention: ({ tier1QuestionDays = 14, conflictDays = 30, canonReviewDays = 7 } = {}) => {
    const db = getDb();
    const cutoff = (days) => new Date(Date.now() - days * 864e5).toISOString();

    const tier1Questions = db
      .prepare(
        `SELECT id, title, updated_at FROM open_questions
          WHERE archived_at IS NULL AND tier = 1 AND updated_at < ?
          ORDER BY updated_at ASC`
      )
      .all(cutoff(tier1QuestionDays));

    const stalledConflicts = db
      .prepare(
        `SELECT id, title, created_at FROM conflicts
          WHERE archived_at IS NULL AND created_at < ?
          ORDER BY created_at ASC`
      )
      .all(cutoff(conflictDays));

    const pendingProposals = db
      .prepare(
        `SELECT id, proposal_intent, proposer_note, created_at FROM canon_proposals
          WHERE status = 'pending' AND created_at < ?
          ORDER BY created_at ASC`
      )
      .all(cutoff(canonReviewDays));

    // PBLOCK: blocking questions always surface regardless of staleness.
    const blockingQuestions = db
      .prepare(
        `SELECT id, title, updated_at, blocking_target, blocking_type FROM open_questions
          WHERE archived_at IS NULL AND is_blocking = 1
          ORDER BY updated_at ASC`
      )
      .all();

    return { tier1Questions, stalledConflicts, pendingProposals, blockingQuestions };
  },
  // PHOME: the three nav badge counts. Unsorted = total active items; Canon
  // Review = proposals still awaiting a decision (pending); Open Questions =
  // active tier-1 questions (the highest-importance tier). Read-only.
  navBadges: () => {
    const db = getDb();
    return {
      unsorted: db
        .prepare(`SELECT COUNT(*) AS n FROM unsorted_items WHERE archived_at IS NULL`)
        .get().n,
      canonReview: db
        .prepare(`SELECT COUNT(*) AS n FROM canon_proposals WHERE status = 'pending'`)
        .get().n,
      openQuestions: db
        .prepare(
          `SELECT COUNT(*) AS n FROM open_questions WHERE archived_at IS NULL AND tier = 1`
        )
        .get().n,
      conflicts: db
        .prepare(`SELECT COUNT(*) AS n FROM conflicts WHERE archived_at IS NULL`)
        .get().n,
    };
  },
};

// --- Canon Bible (P31, read-only) ------------------------------------------
// First UI surface on top of the canon schema. P31 only reads — create/edit/
// lock/supersede/review flow in via Canon Review starting at P32. Provenance
// fields (origin_*, sessions, legacy IDs) are surfaced so the smoke test can
// confirm them visibly.
//
// Two queries per list call: one for entries (with the origin_session join),
// one for the entry's legacy IDs in a single batched fetch. This avoids N+1
// without forcing a JSON aggregation in SQL.
function attachLegacyIds(entries) {
  if (entries.length === 0) return entries;
  const ids = entries.map((e) => e.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT canon_entry_id, scheme, code, is_primary, parent_code, alias_of_code, note
         FROM canon_entry_legacy_ids
        WHERE canon_entry_id IN (${placeholders})
        ORDER BY is_primary DESC, scheme ASC, code ASC, id ASC`
    )
    .all(...ids);
  const byEntry = new Map();
  for (const r of rows) {
    if (!byEntry.has(r.canon_entry_id)) byEntry.set(r.canon_entry_id, []);
    byEntry.get(r.canon_entry_id).push({
      scheme: r.scheme,
      code: r.code,
      isPrimary: r.is_primary === 1,
      parentCode: r.parent_code,
      aliasOfCode: r.alias_of_code,
      note: r.note,
    });
  }
  return entries.map((e) => ({ ...e, legacy_ids: byEntry.get(e.id) || [] }));
}

const CANON_LIST_COLUMNS = `
  ce.id, ce.entry_type, ce.title, ce.body,
  ce.locked, ce.locked_at, ce.locked_label,
  ce.retired, ce.retired_at, ce.replaces_entry_id, ce.replaced_by_entry_id,
  ce.provisional, ce.canon_status, ce.certainty, ce.review_state,
  ce.origin_kind, ce.origin_entry_id, ce.origin_session_id, ce.origin_lock_code,
  ce.created_at, ce.updated_at,
  s.label AS origin_session_label, s.session_date AS origin_session_date
`;

// PUI3: Canon Review is one of the route targets for the highlight + extract
// flow. The full Canon Review queue UI arrives in P35; here we only need a
// minimal write path so an extracted snippet can land as a pending new_entry
// proposal with source attribution. proposed_fields_json carries the snippet
// title + body so the future P35 UI can hydrate the proposal without losing
// the original wording. source_kind is left free-form (workspace name) to
// match how extract callers identify themselves; tighten in P35.
// PTAG — tag library + polymorphic taggable_tags join.
//
// Schema lives in migrations 026_tags + 027_seed_tags. `entity_kind` matches
// the workspace's DB table name (e.g. 'unsorted', 'source_material',
// 'canon_entries') so each workspace's UI passes its own constant when it
// reads/writes tags. Tag uniqueness is enforced at the DB (UNIQUE on name),
// and taggable_tags has UNIQUE(tag_id, entity_kind, entity_id) so attaching
// the same tag twice is a no-op rather than a duplicate row.
const tags = {
  listAll: () =>
    getDb()
      .prepare(
        `SELECT id, name, category, is_seed
           FROM tags
          ORDER BY (category IS NULL), category COLLATE NOCASE, name COLLATE NOCASE`
      )
      .all(),

  // One entity's tags. Used by the popout + detail panels.
  listFor: (entityKind, entityId) =>
    getDb()
      .prepare(
        `SELECT t.id, t.name, t.category, t.is_seed
           FROM tags t
           JOIN taggable_tags tt ON tt.tag_id = t.id
          WHERE tt.entity_kind = ? AND tt.entity_id = ?
          ORDER BY (t.category IS NULL), t.category COLLATE NOCASE, t.name COLLATE NOCASE`
      )
      .all(entityKind, entityId),

  // Bulk variant for list rendering: returns a plain object id -> tag[] so
  // workspaces can render badges without N round-trips.
  bulkListFor: (entityKind, entityIds) => {
    const ids = (entityIds || []).map(Number).filter(Number.isFinite);
    const out = {};
    for (const id of ids) out[id] = [];
    if (ids.length === 0) return out;
    const placeholders = ids.map(() => '?').join(',');
    const rows = getDb()
      .prepare(
        `SELECT tt.entity_id AS entity_id, t.id, t.name, t.category, t.is_seed
           FROM taggable_tags tt
           JOIN tags t ON t.id = tt.tag_id
          WHERE tt.entity_kind = ? AND tt.entity_id IN (${placeholders})
          ORDER BY (t.category IS NULL), t.category COLLATE NOCASE, t.name COLLATE NOCASE`
      )
      .all(entityKind, ...ids);
    for (const r of rows) {
      const { entity_id, ...tag } = r;
      (out[entity_id] = out[entity_id] || []).push(tag);
    }
    return out;
  },

  attach: (entityKind, entityId, tagId) => {
    if (!entityKind) throw new Error('entity kind is required');
    const eid = Number(entityId);
    const tid = Number(tagId);
    if (!Number.isFinite(eid) || !Number.isFinite(tid)) {
      throw new Error('entity id and tag id are required');
    }
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO taggable_tags
           (tag_id, entity_kind, entity_id, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(tid, entityKind, eid, now);
    return tags.listFor(entityKind, eid);
  },

  detach: (entityKind, entityId, tagId) => {
    const eid = Number(entityId);
    const tid = Number(tagId);
    getDb()
      .prepare(
        `DELETE FROM taggable_tags
          WHERE tag_id = ? AND entity_kind = ? AND entity_id = ?`
      )
      .run(tid, entityKind, eid);
    return tags.listFor(entityKind, eid);
  },

  // Clear every tag from one entity. Only removes the taggable_tags links for
  // this entity — the tags themselves and their links to other entities are
  // untouched. Returns the now-empty tag list for symmetry with detach.
  clearFor: (entityKind, entityId) => {
    if (!entityKind) throw new Error('entity kind is required');
    const eid = Number(entityId);
    if (!Number.isFinite(eid)) throw new Error('entity id is required');
    getDb()
      .prepare(
        `DELETE FROM taggable_tags
          WHERE entity_kind = ? AND entity_id = ?`
      )
      .run(entityKind, eid);
    return tags.listFor(entityKind, eid);
  },

  // Create a user tag. Returns the existing row when the name is already
  // taken (case-insensitive) so the picker's "Add as new tag" flow degrades
  // to "select existing" without erroring on duplicates.
  create: ({ name, category } = {}) => {
    // Normalize: lowercase + trim so `Canon`, `canon`, and `canon ` collapse
    // to one tag. Matches the seed tags, which are all lowercase.
    const clean = String(name || '').trim().toLowerCase();
    if (!clean) throw new Error('Tag name is required.');
    const cat = (category || '').trim() || null;
    const existing = getDb()
      .prepare('SELECT id, name, category, is_seed FROM tags WHERE name = ? COLLATE NOCASE')
      .get(clean);
    if (existing) return existing;
    const now = new Date().toISOString();
    const info = getDb()
      .prepare(
        `INSERT INTO tags (name, category, is_seed, created_at, updated_at)
         VALUES (?, ?, 0, ?, ?)`
      )
      .run(clean, cat, now, now);
    return getDb()
      .prepare('SELECT id, name, category, is_seed FROM tags WHERE id = ?')
      .get(info.lastInsertRowid);
  },

  // PTAGDEL — usage summary for the delete confirmation. Returns the number of
  // entries the tag is on and how many distinct workspaces (entity_kinds) those
  // entries span, so the UI can show "used on N entries across X workspaces".
  usage: (tagId) => {
    const tid = Number(tagId);
    if (!Number.isFinite(tid)) throw new Error('tag id is required');
    const row = getDb()
      .prepare(
        `SELECT COUNT(*)                       AS entries,
                COUNT(DISTINCT entity_kind)     AS workspaces
           FROM taggable_tags
          WHERE tag_id = ?`
      )
      .get(tid);
    return { entries: row.entries || 0, workspaces: row.workspaces || 0 };
  },

  // PTAGDEL — delete a user-created tag. Seeded tags can never be deleted (the
  // UI hides the affordance; this is the backend guard). Unlinks the tag from
  // every entity, then removes the tag itself. The ON DELETE CASCADE on
  // taggable_tags would do the unlink, but we delete links explicitly so the
  // behavior is independent of the foreign_keys pragma.
  remove: (tagId) => {
    const tid = Number(tagId);
    if (!Number.isFinite(tid)) throw new Error('tag id is required');
    const tag = getDb()
      .prepare('SELECT id, is_seed FROM tags WHERE id = ?')
      .get(tid);
    if (!tag) throw new Error('Tag not found.');
    if (tag.is_seed) throw new Error('Seeded tags cannot be deleted.');
    const tx = getDb().transaction((id) => {
      getDb().prepare('DELETE FROM taggable_tags WHERE tag_id = ?').run(id);
      getDb().prepare('DELETE FROM tags WHERE id = ?').run(id);
    });
    tx(tid);
    return { deleted: true };
  },

  // PTAGDEL — rename a user-created tag in place. Seeded tags are immutable.
  // The new name is normalized (lowercased + trimmed) like create(); renaming
  // to a name that already exists (case-insensitive, different tag) is blocked
  // to preserve duplicate prevention. No links are touched — every entry that
  // carries this tag now shows the new name automatically.
  rename: (tagId, newName) => {
    const tid = Number(tagId);
    if (!Number.isFinite(tid)) throw new Error('tag id is required');
    const clean = String(newName || '').trim().toLowerCase();
    if (!clean) throw new Error('Tag name is required.');
    const tag = getDb()
      .prepare('SELECT id, name, category, is_seed FROM tags WHERE id = ?')
      .get(tid);
    if (!tag) throw new Error('Tag not found.');
    if (tag.is_seed) throw new Error('Seeded tags cannot be renamed.');
    const clash = getDb()
      .prepare('SELECT id FROM tags WHERE name = ? COLLATE NOCASE AND id != ?')
      .get(clean, tid);
    if (clash) throw new Error(`A tag named “${clean}” already exists.`);
    const now = new Date().toISOString();
    getDb()
      .prepare('UPDATE tags SET name = ?, updated_at = ? WHERE id = ?')
      .run(clean, now, tid);
    return getDb()
      .prepare('SELECT id, name, category, is_seed FROM tags WHERE id = ?')
      .get(tid);
  },
};

// P35 — Canon Review queue. The renderer reads proposals (pending /
// sent_back / deferred) through `list`, edits the JSON fields in place with
// `updateFields`, and ends each proposal with one of approve/sendBack/defer/
// reject/delete. Approve is the only path that mutates canon_entries; the
// other terminal verbs only stamp the proposal row. createFromExtract stays
// as the PUI3 staging write — nothing else writes to canon_proposals.
//
// Why JSON for proposed fields: SQ-10 of the approved schema keeps proposals
// schemaless on purpose so we don't have to migrate the proposal table every
// time a canon detail table grows a column. The renderer parses the JSON,
// the approve path forwards it straight to canon.create().

// `pending` and `sent_back` are the actionable queue; `deferred` is the
// collapsed bottom section. approved/rejected are terminal and not surfaced
// in the queue list (they live in the DB for audit only).
const CANON_PROPOSAL_QUEUE_STATUSES = ['pending', 'sent_back', 'deferred'];

function parseProposalRow(row) {
  if (!row) return null;
  let proposed = {};
  try {
    proposed = JSON.parse(row.proposed_fields_json || '{}') || {};
  } catch {
    proposed = {};
  }
  return { ...row, proposed_fields: proposed };
}

const canonProposals = {
  // Used by extract.js (PUI3) to stage a snippet as a pending proposal.
  createFromExtract: ({
    title,
    body,
    source_kind,
    source_entry_id,
    proposer_note,
  } = {}) => {
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) throw new Error('Title is required.');
    const now = new Date().toISOString();
    const proposed = JSON.stringify({
      title: cleanTitle,
      body: (body || '').trim(),
    });
    const info = getDb()
      .prepare(
        `INSERT INTO canon_proposals
           (created_at, updated_at, proposal_intent, proposed_fields_json,
            source_kind, source_entry_id, proposer_note, status)
         VALUES (?, ?, 'new_entry', ?, ?, ?, ?, 'pending')`
      )
      .run(
        now,
        now,
        proposed,
        source_kind || null,
        source_entry_id == null ? null : Number(source_entry_id),
        (proposer_note || '').trim() || null
      );
    return parseProposalRow(
      getDb()
        .prepare('SELECT * FROM canon_proposals WHERE id = ?')
        .get(info.lastInsertRowid)
    );
  },

  // P41 — Stage a structured canon proposal generated by the AI assistant.
  // entry_type goes into proposed_fields_json alongside title + body so the
  // Canon Review bulk-actions bar and quick-approve path can read it directly.
  createFromAI: ({ entry_type, title, body, proposer_note, chat_id } = {}) => {
    const cleanTitle = (title || '').trim();
    if (!cleanTitle) throw new Error('Title is required.');
    const now = new Date().toISOString();
    const proposed = JSON.stringify({
      ...(entry_type ? { entry_type: String(entry_type).trim() } : {}),
      title: cleanTitle,
      body: (body || '').trim(),
    });
    const info = getDb()
      .prepare(
        `INSERT INTO canon_proposals
           (created_at, updated_at, proposal_intent, proposed_fields_json,
            source_kind, source_entry_id, proposer_note, status)
         VALUES (?, ?, 'new_entry', ?, 'chat', ?, ?, 'pending')`
      )
      .run(
        now,
        now,
        proposed,
        chat_id == null ? null : Number(chat_id),
        (proposer_note || '').trim() || null
      );
    return parseProposalRow(
      getDb()
        .prepare('SELECT * FROM canon_proposals WHERE id = ?')
        .get(info.lastInsertRowid)
    );
  },

  pendingCount: () =>
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM canon_proposals WHERE status = 'pending'`)
      .get().n,

  // P35 — queue read. Returns proposals grouped by status as a flat array,
  // ordered status-first (pending → sent_back → deferred) then newest-first
  // within each status. Approved / rejected proposals are out of scope for
  // the queue UI and excluded here.
  list: () => {
    const rows = getDb()
      .prepare(
        `SELECT * FROM canon_proposals
          WHERE status IN ('pending','sent_back','deferred')
          ORDER BY
            CASE status
              WHEN 'pending'   THEN 0
              WHEN 'sent_back' THEN 1
              WHEN 'deferred'  THEN 2
              ELSE 3
            END,
            updated_at DESC, id DESC`
      )
      .all();
    return rows.map(parseProposalRow);
  },

  getById: (id) => {
    const pid = Number(id);
    if (!Number.isFinite(pid)) throw new Error('Proposal id is required.');
    return parseProposalRow(
      getDb()
        .prepare('SELECT * FROM canon_proposals WHERE id = ?')
        .get(pid)
    );
  },

  // P35 — edit the proposed content while the proposal is still in the
  // queue. Only the JSON payload and the proposer's note are user-mutable;
  // status / reviewed_at / target_entry_id are owned by the terminal verbs.
  // SQ-10: sent-back edits overwrite in place — no revision history child.
  updateFields: (id, payload = {}) => {
    const pid = Number(id);
    if (!Number.isFinite(pid)) throw new Error('Proposal id is required.');
    const existing = getDb()
      .prepare('SELECT * FROM canon_proposals WHERE id = ?')
      .get(pid);
    if (!existing) throw new Error('Proposal not found.');
    if (!CANON_PROPOSAL_QUEUE_STATUSES.includes(existing.status)) {
      throw new Error(
        `Cannot edit a ${existing.status} proposal — it has already been resolved.`
      );
    }

    let proposed = {};
    try {
      proposed = JSON.parse(existing.proposed_fields_json || '{}') || {};
    } catch {
      proposed = {};
    }
    if (payload.proposed_fields && typeof payload.proposed_fields === 'object') {
      proposed = { ...proposed, ...payload.proposed_fields };
    }

    const now = new Date().toISOString();
    const note =
      payload.proposer_note === undefined
        ? existing.proposer_note
        : payload.proposer_note == null
        ? null
        : String(payload.proposer_note).trim() || null;

    getDb()
      .prepare(
        `UPDATE canon_proposals
            SET proposed_fields_json = ?, proposer_note = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(JSON.stringify(proposed), note, now, pid);

    return canonProposals.getById(pid);
  },

  // P35 — Approve = create a canon_entries row from the proposal, then mark
  // the proposal approved with target_entry_id pointing at the new row. The
  // queue UI gathers the entry_type + per-type detail fields before calling
  // here (createFromExtract only stages a title + body snippet, so a fresh
  // approval almost always supplies a wider payload). For now only the
  // 'new_entry' intent is wired — supersede / retire / etc. land in later
  // phases when the queue grows those affordances.
  approve: (id, payload = {}) => {
    const pid = Number(id);
    if (!Number.isFinite(pid)) throw new Error('Proposal id is required.');
    const existing = getDb()
      .prepare('SELECT * FROM canon_proposals WHERE id = ?')
      .get(pid);
    if (!existing) throw new Error('Proposal not found.');
    if (!CANON_PROPOSAL_QUEUE_STATUSES.includes(existing.status)) {
      throw new Error(
        `Cannot approve a ${existing.status} proposal — it has already been resolved.`
      );
    }
    if (existing.proposal_intent !== 'new_entry') {
      throw new Error(
        `Approving ${existing.proposal_intent} proposals isn't wired yet — ` +
          'only new_entry proposals can be approved in P35.'
      );
    }

    const reviewNote =
      payload.review_note == null
        ? null
        : String(payload.review_note).trim() || null;

    const db = getDb();
    let newEntry;
    db.transaction(() => {
      // canon.create runs its own validation (entry_type, title, required
      // detail fields). Any error bubbles and aborts the transaction so the
      // proposal stays pending — no half-finished approvals.
      newEntry = canon.create({
        entry_type: payload.entry_type,
        title: payload.title,
        body: payload.body,
        canon_status: payload.canon_status,
        certainty: payload.certainty,
        review_state: payload.review_state,
        provisional: payload.provisional,
        detail: payload.detail,
      });
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE canon_proposals
            SET status = 'approved', reviewed_at = ?, review_note = ?,
                target_entry_id = ?, updated_at = ?
          WHERE id = ?`
      ).run(now, reviewNote, newEntry.id, now, pid);
    })();

    return { proposal: canonProposals.getById(pid), entry: newEntry };
  },

  // P35 — non-terminal review actions. Each one stamps reviewed_at +
  // review_note and updates the status flag; the proposal stays editable in
  // the queue (sent_back and deferred are both queue states).
  sendBack: (id, payload = {}) =>
    setProposalStatus(id, 'sent_back', payload.review_note),
  defer: (id, payload = {}) =>
    setProposalStatus(id, 'deferred', payload.review_note),
  // Reject is terminal — the proposal exits the queue. We do not hard-delete
  // it so the audit trail (source_kind / source_entry_id / proposer_note) is
  // preserved.
  reject: (id, payload = {}) =>
    setProposalStatus(id, 'rejected', payload.review_note),

  // P35 — hard delete. Used when a proposal was created in error and should
  // leave no audit trace (the user explicitly chose this over Reject).
  delete: (id) => {
    const pid = Number(id);
    if (!Number.isFinite(pid)) throw new Error('Proposal id is required.');
    const info = getDb()
      .prepare('DELETE FROM canon_proposals WHERE id = ?')
      .run(pid);
    return { deleted: info.changes > 0 };
  },
};

function setProposalStatus(id, status, rawNote) {
  const pid = Number(id);
  if (!Number.isFinite(pid)) throw new Error('Proposal id is required.');
  const existing = getDb()
    .prepare('SELECT id, status FROM canon_proposals WHERE id = ?')
    .get(pid);
  if (!existing) throw new Error('Proposal not found.');
  // Allowed transitions: only from a queue status. sendBack/defer/reject
  // from approved would invalidate the canon entry already created — reject
  // that explicitly so the renderer can't silently re-resolve a proposal.
  if (!CANON_PROPOSAL_QUEUE_STATUSES.includes(existing.status)) {
    throw new Error(
      `Cannot ${status} a ${existing.status} proposal — it has already been resolved.`
    );
  }
  const note = rawNote == null ? null : String(rawNote).trim() || null;
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE canon_proposals
          SET status = ?, reviewed_at = ?, review_note = ?, updated_at = ?
        WHERE id = ?`
    )
    .run(status, now, note, now, pid);
  return canonProposals.getById(pid);
}

// P32 — typed config for every entry_type. One source of truth for the
// renderer's create/edit forms, the view-mode field list, and the DB-side
// detail-row insert/update. `table` is the 1:1 detail table; entry types
// without a 1:1 child (knowledge_state, rewatch_beat, relationship — their
// structured rows live in their own non-1:1 tables) set table=null and only
// carry the canon_entries common columns. `fields` lists detail-table columns
// in display order with input kind, options, default, and required flag.
const CANON_TYPE_CONFIG = {
  character: {
    label: 'Character',
    table: 'canon_characters',
    fields: [
      { col: 'full_name',           label: 'Full name',           kind: 'text',     required: true },
      { col: 'display_name',        label: 'Display name',        kind: 'text',     required: true },
      { col: 'role',                label: 'Role',                kind: 'text' },
      { col: 'dossier_tier',        label: 'Dossier tier',        kind: 'select',
        options: ['full', 'holding', 'locked_unnamed'], default: 'holding', required: true },
      { col: 'age_at_series_start', label: 'Age at series start', kind: 'number' },
      { col: 'demographics',        label: 'Demographics',        kind: 'text' },
      { col: 'sobriety_at_open',    label: 'Sobriety at open',    kind: 'text' },
      { col: 'absolute_exclusions', label: 'Absolute exclusions', kind: 'textarea' },
      { col: 'biography',           label: 'Biography',           kind: 'textarea' },
      { col: 'arc_resolution',      label: 'Arc resolution',      kind: 'textarea' },
    ],
  },
  season: {
    label: 'Season',
    table: 'canon_seasons',
    fields: [
      { col: 'season_number', label: 'Season number', kind: 'number', required: true },
      { col: 'summary',       label: 'Summary',       kind: 'textarea' },
    ],
  },
  episode: {
    label: 'Episode',
    table: 'canon_episodes',
    fields: [
      { col: 'season_entry_id',  label: 'Season entry ID',  kind: 'number',
        hint: 'canon_entries.id of the season this episode belongs to (optional).' },
      { col: 'episode_number',   label: 'Episode number',   kind: 'number' },
      { col: 'episode_code',     label: 'Episode code',     kind: 'text', hint: 'e.g. S1E1' },
      { col: 'working_title',    label: 'Working title',    kind: 'text' },
      { col: 'summary',          label: 'Summary',          kind: 'textarea' },
      { col: 'opening_register', label: 'Opening register', kind: 'textarea' },
      { col: 'closing_image',    label: 'Closing image',    kind: 'textarea' },
    ],
  },
  locked_scene: {
    label: 'Locked scene',
    table: 'canon_locked_scenes',
    fields: [
      { col: 'episode_entry_id',  label: 'Episode entry ID', kind: 'number',
        hint: 'canon_entries.id of the episode this scene belongs to (optional).' },
      { col: 'code',              label: 'Scene code',       kind: 'text' },
      { col: 'scene_description', label: 'Scene description', kind: 'textarea', required: true },
      { col: 'locked_label',      label: 'Locked label',     kind: 'text' },
    ],
  },
  locked_line: {
    label: 'Locked line',
    table: 'canon_locked_lines',
    fields: [
      { col: 'episode_entry_id',   label: 'Episode entry ID',   kind: 'number' },
      { col: 'character_entry_id', label: 'Character entry ID', kind: 'number' },
      { col: 'code',               label: 'Line code',          kind: 'text' },
      { col: 'line_state',         label: 'Line state',         kind: 'select',
        options: ['locked', 'texture_locked_words_open', 'architecture_locked', 'open'],
        default: 'locked', required: true },
      { col: 'line_text',          label: 'Line text',          kind: 'textarea' },
      { col: 'description',        label: 'Description',        kind: 'textarea' },
    ],
  },
  locked_decision: {
    label: 'Locked decision',
    table: 'canon_locked_decisions',
    fields: [
      { col: 'code',                label: 'Decision code',  kind: 'text',     required: true,
        hint: 'Unique across decisions (e.g. A-04, T-001, CF-12).' },
      { col: 'scheme',              label: 'Scheme',         kind: 'select',
        options: ['T', 'A', 'CF'], default: 'A', required: true },
      { col: 'parent_code',         label: 'Parent code',    kind: 'text' },
      { col: 'session_id',          label: 'Session ID',     kind: 'number' },
      { col: 'session_date',        label: 'Session date',   kind: 'text',
        hint: 'YYYY-MM-DD.' },
      { col: 'body',                label: 'Decision body',  kind: 'textarea', required: true },
      { col: 'supersedes_text',     label: 'Supersedes',     kind: 'textarea' },
      { col: 'confirms_text',       label: 'Confirms',       kind: 'textarea' },
      { col: 'duplicates_closed',   label: 'Duplicates closed', kind: 'textarea' },
      { col: 'categorical_section', label: 'Categorical section', kind: 'number' },
    ],
  },
  knowledge_state: {
    label: 'Knowledge state',
    table: null,
    fields: [],
    note:
      'Structured per-character/per-season-point rows live in canon_knowledge_states ' +
      '(not yet editable here — title/body summary only for now).',
  },
  timeline_event: {
    label: 'Timeline event',
    table: 'canon_timeline_events',
    fields: [
      { col: 'season_point', label: 'Season point', kind: 'text',
        hint: 'e.g. S1E1, S2E2_S2E6, PRE_SERIES.' },
      { col: 'sort_order',   label: 'Sort order',   kind: 'number' },
      { col: 'description',  label: 'Description',  kind: 'textarea' },
    ],
  },
  viral_phase: {
    label: 'Viral phase',
    table: 'canon_viral_phases',
    fields: [
      { col: 'phase_number', label: 'Phase number (1–5)', kind: 'number', required: true },
      { col: 'phase_label',  label: 'Phase label',        kind: 'text' },
      { col: 'description',  label: 'Description',        kind: 'textarea' },
      { col: 'time_window',  label: 'Time window',        kind: 'text' },
    ],
  },
  virus_rule: {
    label: 'Virus rule',
    table: 'canon_virus_rules',
    fields: [
      { col: 'rule_text',        label: 'Rule text',        kind: 'textarea', required: true },
      { col: 'applies_to_phase', label: 'Applies to phase', kind: 'number' },
    ],
  },
  institution: {
    label: 'Institution',
    table: 'canon_institutions',
    fields: [
      { col: 'name',        label: 'Name',        kind: 'text',     required: true },
      { col: 'description', label: 'Description', kind: 'textarea' },
    ],
  },
  location: {
    label: 'Location',
    table: 'canon_locations',
    fields: [
      { col: 'name',          label: 'Name',          kind: 'text', required: true },
      { col: 'location_type', label: 'Location type', kind: 'text' },
      { col: 'description',   label: 'Description',   kind: 'textarea' },
    ],
  },
  motif: {
    label: 'Motif',
    table: 'canon_motifs',
    fields: [
      { col: 'motif_name',  label: 'Motif name',  kind: 'text', required: true },
      { col: 'description', label: 'Description', kind: 'textarea' },
      { col: 'recurrence',  label: 'Recurrence',  kind: 'text' },
    ],
  },
  theme: {
    label: 'Theme',
    table: 'canon_themes',
    fields: [
      { col: 'theme_kind',     label: 'Theme kind', kind: 'select',
        options: ['theme', 'buried_truth', 'spine', 'core_question', 'argument'],
        default: 'theme', required: true },
      { col: 'register',       label: 'Register',   kind: 'select',
        options: ['', 'system', 'self', 'both'], default: '' },
      { col: 'statement',      label: 'Statement',  kind: 'textarea' },
      { col: 'spoken_in_show', label: 'Spoken in show?', kind: 'boolean', default: 0 },
    ],
  },
  production_rule: {
    label: 'Production rule',
    table: 'canon_production_rules',
    fields: [
      { col: 'rule_text', label: 'Rule text', kind: 'textarea', required: true },
      { col: 'scope',     label: 'Scope',     kind: 'text' },
    ],
  },
  principle: {
    label: 'Principle',
    table: 'canon_principles',
    fields: [
      { col: 'principle_text', label: 'Principle text', kind: 'textarea', required: true },
      { col: 'attribution',    label: 'Attribution',    kind: 'text' },
    ],
  },
  rewatch_beat: {
    label: 'Rewatch beat',
    table: null,
    fields: [],
    note:
      'Structured rows live in canon_rewatch_beats (not yet editable here — ' +
      'title/body summary only for now).',
  },
  relationship: {
    label: 'Relationship',
    table: null,
    fields: [],
    note:
      'Edges live in canon_entry_relationships (not yet editable here — ' +
      'title/body summary only for now).',
  },
};

const CANON_STATUS_VALUES = [
  'draft', 'speculative', 'implied', 'provisional', 'confirmed', 'retired', 'struck',
];
const CANON_CERTAINTY_VALUES = ['low', 'medium', 'high'];
const CANON_REVIEW_STATE_VALUES = [
  'placement_ready', 'needs_review', 'unresolved', 'deferred',
  're_confirmation_flagged', 'open_for_revision',
];

// Coerce a form value to the SQL value its column expects. Empty strings on
// non-text columns become NULL; booleans collapse to 0/1; numbers parse.
function coerceCanonField(field, value) {
  if (value === undefined) return undefined;
  if (field.kind === 'boolean') return value ? 1 : 0;
  if (value === null || value === '') {
    return field.kind === 'text' || field.kind === 'textarea' ? null : null;
  }
  if (field.kind === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (field.kind === 'select' && Array.isArray(field.options)) {
    const allowed = field.options;
    if (!allowed.includes(String(value))) return null;
  }
  return value;
}

function pickDetailColumns(entryType, raw) {
  const cfg = CANON_TYPE_CONFIG[entryType];
  if (!cfg || !cfg.table) return null;
  const out = {};
  for (const f of cfg.fields) {
    const v = coerceCanonField(f, raw ? raw[f.col] : undefined);
    if (v === undefined) {
      if (f.default !== undefined) out[f.col] = f.kind === 'boolean' ? (f.default ? 1 : 0) : f.default;
      else out[f.col] = null;
    } else {
      out[f.col] = v;
    }
  }
  return out;
}

function ensureRequiredFields(entryType, columns) {
  const cfg = CANON_TYPE_CONFIG[entryType];
  if (!cfg || !cfg.table) return;
  for (const f of cfg.fields) {
    if (!f.required) continue;
    const v = columns[f.col];
    const missing =
      v === null || v === undefined ||
      (typeof v === 'string' && v.trim() === '');
    if (missing) throw new Error(`${f.label} is required.`);
  }
}

// Bulk-load 1:1 detail rows for a set of entries and graft them on. Groups by
// entry_type so each detail table is queried at most once per list call.
function attachDetails(entries) {
  if (entries.length === 0) return entries;
  const byType = new Map();
  for (const e of entries) {
    if (!byType.has(e.entry_type)) byType.set(e.entry_type, []);
    byType.get(e.entry_type).push(e.id);
  }
  const detailById = new Map();
  for (const [type, ids] of byType.entries()) {
    const cfg = CANON_TYPE_CONFIG[type];
    if (!cfg || !cfg.table || cfg.fields.length === 0) continue;
    const cols = ['canon_entry_id', ...cfg.fields.map((f) => f.col)].join(', ');
    const placeholders = ids.map(() => '?').join(',');
    const rows = getDb()
      .prepare(`SELECT ${cols} FROM ${cfg.table} WHERE canon_entry_id IN (${placeholders})`)
      .all(...ids);
    for (const r of rows) {
      const { canon_entry_id, ...detail } = r;
      detailById.set(canon_entry_id, detail);
    }
  }
  return entries.map((e) => ({ ...e, detail: detailById.get(e.id) || null }));
}

const canon = {
  typeConfig: () => CANON_TYPE_CONFIG,

  // Active = not retired. Newest first so just-added entries are visible.
  list: () => {
    const entries = getDb()
      .prepare(
        `SELECT ${CANON_LIST_COLUMNS}
           FROM canon_entries ce
           LEFT JOIN sessions s ON s.id = ce.origin_session_id
          WHERE ce.retired = 0
          ORDER BY ce.created_at DESC, ce.id DESC`
      )
      .all();
    return attachDetails(attachLegacyIds(entries));
  },
  // Retired = superseded/withdrawn. Lives in the collapsed section of the
  // page so the supersede chain stays visible without dominating the view.
  listRetired: () => {
    const entries = getDb()
      .prepare(
        `SELECT ${CANON_LIST_COLUMNS}
           FROM canon_entries ce
           LEFT JOIN sessions s ON s.id = ce.origin_session_id
          WHERE ce.retired = 1
          ORDER BY ce.retired_at DESC, ce.id DESC`
      )
      .all();
    return attachDetails(attachLegacyIds(entries));
  },
  count: () =>
    getDb().prepare('SELECT COUNT(*) AS n FROM canon_entries').get().n,

  // Dev affordance for the P31 smoke test only. Idempotent: if any
  // canon_entries already exist, this is a no-op and reports 0 inserted.
  // Inserts four entries spanning origin_kind values, lock/provisional state,
  // and a session-backed locked_decision so provenance is visible end-to-end.
  // Later phases replace this with real Canon Review approvals — no UI shown
  // outside the Canon Bible read view, and the button hides once entries exist.
  devSeed: () => {
    const db = getDb();
    if (canon.count() > 0) return { inserted: 0, alreadySeeded: true };

    const now = new Date().toISOString();
    let inserted = 0;

    db.transaction(() => {
      const session = db
        .prepare(
          `INSERT INTO sessions (session_date, label, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          '2025-09-12',
          'Lock session — 2025-09-12',
          'Working session that produced the A-04 locked decision.',
          now,
          now
        );
      const sessionId = session.lastInsertRowid;

      const insertEntry = db.prepare(
        `INSERT INTO canon_entries
           (created_at, updated_at, entry_type, title, body,
            locked, locked_at, locked_label,
            provisional, canon_status, certainty, review_state,
            origin_kind, origin_entry_id, origin_session_id, origin_lock_code)
         VALUES
           (?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?)`
      );

      const insertLegacy = db.prepare(
        `INSERT INTO canon_entry_legacy_ids
           (canon_entry_id, scheme, code, is_primary, created_at)
         VALUES (?, ?, ?, 1, ?)`
      );

      // 1) Character — fully locked, originated in Characters workspace.
      const ch = insertEntry.run(
        now, now, 'character', 'Megan Whitfield', 'Series protagonist.',
        1, now, 'S1 standing lock',
        0, 'confirmed', 'high', null,
        'characters_workspace', null, null, 'T-001'
      );
      db.prepare(
        `INSERT INTO canon_characters
           (canon_entry_id, full_name, display_name, role, dossier_tier,
            absolute_exclusions)
         VALUES (?, ?, ?, ?, 'full', ?)`
      ).run(
        ch.lastInsertRowid,
        'Megan Whitfield',
        'Megan',
        'Protagonist',
        null
      );
      insertLegacy.run(ch.lastInsertRowid, 'T', 'T-001', now);
      inserted += 1;

      // 2) Episode — provisional, needs review, originated in Episodes workspace.
      const ep = insertEntry.run(
        now, now, 'episode', 'S1E1 — Opening Lock', 'Working title; opening register set.',
        0, null, null,
        1, 'provisional', 'medium', 'needs_review',
        'episodes_workspace', null, null, null
      );
      db.prepare(
        `INSERT INTO canon_episodes
           (canon_entry_id, episode_number, episode_code, working_title,
            opening_register, closing_image)
         VALUES (?, 1, 'S1E1', ?, 'cold morning, sponsor call', 'mirror cut to S1E2 cold open')`
      ).run(ep.lastInsertRowid, 'Opening Lock');
      insertLegacy.run(ep.lastInsertRowid, 'Q', 'Q-013', now);
      inserted += 1;

      // 3) Locked decision — session-backed, demonstrates origin_session_id +
      // origin_lock_code provenance and a downstream correction child.
      const dec = insertEntry.run(
        now, now, 'locked_decision',
        'A-04 — Standing lock on opening register',
        'Opening register of S1E1 is locked to the cold-morning sponsor call.',
        1, now, 'A-04',
        0, 'confirmed', 'high', null,
        'decisions', null, sessionId, 'A-04'
      );
      db.prepare(
        `INSERT INTO canon_locked_decisions
           (canon_entry_id, code, scheme, session_id, session_date, body)
         VALUES (?, 'A-04', 'A', ?, '2025-09-12', ?)`
      ).run(
        dec.lastInsertRowid,
        sessionId,
        'Opening register of S1E1 is locked to the cold-morning sponsor call.'
      );
      db.prepare(
        `INSERT INTO canon_downstream_corrections
           (canon_entry_id, correction_text, ordinal, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?)`
      ).run(
        dec.lastInsertRowid,
        'Update S1E2 cold open notes to reference S1E1 opening register lock.',
        now,
        now
      );
      insertLegacy.run(dec.lastInsertRowid, 'A', 'A-04', now);
      inserted += 1;

      // 4) Motif — implied/low-certainty, originated as a brainstorm item.
      const mo = insertEntry.run(
        now, now, 'motif', 'Mirror imagery', 'Recurring mirror beats across S1.',
        0, null, null,
        0, 'implied', 'low', 'placement_ready',
        'brainstorm_items', null, null, null
      );
      db.prepare(
        `INSERT INTO canon_motifs (canon_entry_id, motif_name, description, recurrence)
         VALUES (?, 'Mirror imagery', 'Reflective surfaces echo across S1 cold opens.', 'each S1 episode')`
      ).run(mo.lastInsertRowid);
      inserted += 1;
    })();

    return { inserted, alreadySeeded: false };
  },

  // P32 — full single-entry fetch including 1:1 detail row. Used by the
  // edit form so it can populate every detail-table column without having to
  // re-derive them from list().
  getDetail: (id) => {
    const eid = Number(id);
    if (!Number.isFinite(eid)) throw new Error('canon id is required');
    const row = getDb()
      .prepare(
        `SELECT ${CANON_LIST_COLUMNS}
           FROM canon_entries ce
           LEFT JOIN sessions s ON s.id = ce.origin_session_id
          WHERE ce.id = ?`
      )
      .get(eid);
    if (!row) return null;
    const [withLegacy] = attachLegacyIds([row]);
    const [withDetail] = attachDetails([withLegacy]);
    return withDetail;
  },

  // P32 — create a new canon entry. The renderer always provides entry_type,
  // title, and a detail object keyed to the type's detail-table column names.
  // canon_status/certainty/review_state/provisional are common columns and
  // default to a sane draft state if not supplied. origin_kind defaults to
  // 'manual' since this path is direct-editor-driven (Canon Review flow is
  // separate, see P35).
  create: (payload = {}) => {
    const entryType = String(payload.entry_type || '').trim();
    if (!CANON_TYPE_CONFIG[entryType]) {
      throw new Error(`Unknown canon entry_type: ${entryType || '(empty)'}.`);
    }
    const title = String(payload.title || '').trim();
    if (!title) throw new Error('Title is required.');
    const body = payload.body == null ? null : String(payload.body);

    const canonStatus = CANON_STATUS_VALUES.includes(payload.canon_status)
      ? payload.canon_status
      : 'draft';
    const certainty = CANON_CERTAINTY_VALUES.includes(payload.certainty)
      ? payload.certainty
      : null;
    const reviewState = CANON_REVIEW_STATE_VALUES.includes(payload.review_state)
      ? payload.review_state
      : null;
    const provisional = payload.provisional ? 1 : 0;

    const detailColumns = pickDetailColumns(entryType, payload.detail);
    if (detailColumns) ensureRequiredFields(entryType, detailColumns);

    const now = new Date().toISOString();
    const db = getDb();
    const insertEntry = db.prepare(
      `INSERT INTO canon_entries
         (created_at, updated_at, entry_type, title, body,
          locked, locked_at, locked_label,
          retired, retired_at,
          provisional, canon_status, certainty, review_state,
          origin_kind, origin_entry_id, origin_session_id, origin_lock_code)
       VALUES
         (?, ?, ?, ?, ?,
          0, NULL, NULL,
          0, NULL,
          ?, ?, ?, ?,
          'manual', NULL, NULL, NULL)`
    );

    let newId;
    db.transaction(() => {
      const info = insertEntry.run(
        now, now, entryType, title, body,
        provisional, canonStatus, certainty, reviewState
      );
      newId = info.lastInsertRowid;
      if (detailColumns) {
        const cfg = CANON_TYPE_CONFIG[entryType];
        const cols = ['canon_entry_id', ...Object.keys(detailColumns)];
        const placeholders = cols.map(() => '?').join(', ');
        const vals = [newId, ...Object.values(detailColumns)];
        db.prepare(
          `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`
        ).run(...vals);
      }
    })();

    return canon.getDetail(newId);
  },

  // P32 — partial update. Only the supplied keys are touched. entry_type is
  // intentionally NOT mutable here (changing it would invalidate the 1:1
  // detail row); supersede/replace is the right path for "this is now a
  // different kind of entry", and that's P34.
  update: (id, payload = {}) => {
    const eid = Number(id);
    if (!Number.isFinite(eid)) throw new Error('canon id is required');
    const existing = getDb()
      .prepare('SELECT id, entry_type FROM canon_entries WHERE id = ?')
      .get(eid);
    if (!existing) throw new Error('Canon entry not found.');

    const sets = [];
    const params = [];

    if (payload.title !== undefined) {
      const t = String(payload.title || '').trim();
      if (!t) throw new Error('Title is required.');
      sets.push('title = ?');
      params.push(t);
    }
    if (payload.body !== undefined) {
      sets.push('body = ?');
      params.push(payload.body == null ? null : String(payload.body));
    }
    if (payload.canon_status !== undefined) {
      if (!CANON_STATUS_VALUES.includes(payload.canon_status)) {
        throw new Error(`Invalid canon_status: ${payload.canon_status}.`);
      }
      sets.push('canon_status = ?');
      params.push(payload.canon_status);
    }
    if (payload.certainty !== undefined) {
      const v = payload.certainty || null;
      if (v !== null && !CANON_CERTAINTY_VALUES.includes(v)) {
        throw new Error(`Invalid certainty: ${v}.`);
      }
      sets.push('certainty = ?');
      params.push(v);
    }
    if (payload.review_state !== undefined) {
      const v = payload.review_state || null;
      if (v !== null && !CANON_REVIEW_STATE_VALUES.includes(v)) {
        throw new Error(`Invalid review_state: ${v}.`);
      }
      sets.push('review_state = ?');
      params.push(v);
    }
    if (payload.provisional !== undefined) {
      sets.push('provisional = ?');
      params.push(payload.provisional ? 1 : 0);
    }

    const now = new Date().toISOString();
    const db = getDb();
    db.transaction(() => {
      if (sets.length > 0) {
        sets.push('updated_at = ?');
        params.push(now, eid);
        db.prepare(
          `UPDATE canon_entries SET ${sets.join(', ')} WHERE id = ?`
        ).run(...params);
      } else {
        // Touch updated_at so the timestamp tracks detail-only edits too.
        db.prepare('UPDATE canon_entries SET updated_at = ? WHERE id = ?').run(now, eid);
      }

      if (payload.detail !== undefined) {
        const cfg = CANON_TYPE_CONFIG[existing.entry_type];
        if (cfg && cfg.table) {
          const detailColumns = pickDetailColumns(existing.entry_type, payload.detail);
          ensureRequiredFields(existing.entry_type, detailColumns);
          const existingDetail = db
            .prepare(`SELECT canon_entry_id FROM ${cfg.table} WHERE canon_entry_id = ?`)
            .get(eid);
          if (existingDetail) {
            const sets2 = Object.keys(detailColumns).map((c) => `${c} = ?`);
            const vals = [...Object.values(detailColumns), eid];
            db.prepare(
              `UPDATE ${cfg.table} SET ${sets2.join(', ')} WHERE canon_entry_id = ?`
            ).run(...vals);
          } else {
            const cols = ['canon_entry_id', ...Object.keys(detailColumns)];
            const placeholders = cols.map(() => '?').join(', ');
            const vals = [eid, ...Object.values(detailColumns)];
            db.prepare(
              `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`
            ).run(...vals);
          }
        }
      }
    })();

    return canon.getDetail(eid);
  },

  // P32 — hard delete. ON DELETE CASCADE on every detail table, legacy_ids,
  // relationships, knowledge_states, rewatch_beats, downstream_corrections,
  // and taggable_tags handles the children. canon_proposals.target_entry_id
  // uses ON DELETE SET NULL so any open proposal pointing at this row is
  // detached rather than dropped.
  delete: (id) => {
    const eid = Number(id);
    if (!Number.isFinite(eid)) throw new Error('canon id is required');
    // Tags are polymorphic (entity_kind = 'canon_entries', no FK), so unlink
    // them explicitly — the migration's cascade only covers FK-linked rows.
    const db = getDb();
    db.transaction(() => {
      db.prepare(
        `DELETE FROM taggable_tags
          WHERE entity_kind = 'canon_entries' AND entity_id = ?`
      ).run(eid);
      db.prepare('DELETE FROM canon_entries WHERE id = ?').run(eid);
    })();
    return { deleted: true };
  },

  // P33 — toggle the locked flag. Lock = currently accepted, edits still
  // allowed but the UI warns before opening the editor. Unlock clears the
  // companion locked_at + locked_label fields so the next lock starts clean.
  // locked_label is optional shorthand (e.g. an "A-04" code) shown next to
  // the lock chip; empty strings are stored as NULL so the chip stays terse.
  setLocked: (id, payload = {}) => {
    const eid = Number(id);
    if (!Number.isFinite(eid)) throw new Error('canon id is required');
    const existing = getDb()
      .prepare('SELECT id FROM canon_entries WHERE id = ?')
      .get(eid);
    if (!existing) throw new Error('Canon entry not found.');
    const lock = payload.locked ? 1 : 0;
    const now = new Date().toISOString();
    if (lock) {
      const rawLabel = payload.locked_label;
      const label =
        rawLabel == null ? null : String(rawLabel).trim() || null;
      getDb()
        .prepare(
          `UPDATE canon_entries
              SET locked = 1, locked_at = ?, locked_label = ?, updated_at = ?
            WHERE id = ?`
        )
        .run(now, label, now, eid);
    } else {
      getDb()
        .prepare(
          `UPDATE canon_entries
              SET locked = 0, locked_at = NULL, locked_label = NULL, updated_at = ?
            WHERE id = ?`
        )
        .run(now, eid);
    }
    return canon.getDetail(eid);
  },

  // P34 — supersede. Creates a new active entry that takes the prior row's
  // place, then retires the prior row and wires the chain pointers in both
  // directions (new.replaces_entry_id = old.id; old.replaced_by_entry_id =
  // new.id). Per SQ-3 of the approved schema, legacy IDs migrate to the new
  // row as is_primary=1; the retired row keeps is_primary=0 copies so
  // historical lookups by T-/A-/Q-/CF- codes still resolve.
  //
  // Payload mirrors update(): any of title/body/canon_status/certainty/
  // review_state/provisional/detail can be overridden. Anything not in the
  // payload is cloned from the existing row, so a no-op supersede is valid
  // (rare, but useful for status-only versioning). Lock state is NOT cloned —
  // the new row starts unlocked so the supersede is itself a deliberate fresh
  // accept; user re-locks if appropriate. Provenance (origin_*) IS cloned so
  // the source trail isn't lost.
  //
  // Tags are duplicated onto the new row so the new canonical version inherits
  // categorical labels without stripping them from the historical retired row.
  // Detail-table UNIQUE columns (e.g. canon_locked_decisions.code) that aren't
  // overridden in payload will surface a SQL error to the form — the user
  // then provides a fresh code and retries.
  supersede: (id, payload = {}) => {
    const eid = Number(id);
    if (!Number.isFinite(eid)) throw new Error('canon id is required');

    const db = getDb();
    const existing = db
      .prepare(
        `SELECT id, entry_type, title, body,
                provisional, canon_status, certainty, review_state,
                origin_kind, origin_entry_id, origin_session_id, origin_lock_code,
                retired
           FROM canon_entries
          WHERE id = ?`
      )
      .get(eid);
    if (!existing) throw new Error('Canon entry not found.');
    if (existing.retired === 1) {
      throw new Error('Cannot supersede a retired entry. Restore it first.');
    }

    const entryType = existing.entry_type;
    const cfg = CANON_TYPE_CONFIG[entryType];

    const newTitle =
      payload.title !== undefined
        ? String(payload.title || '').trim()
        : existing.title;
    if (!newTitle) throw new Error('Title is required.');

    const newBody =
      payload.body !== undefined
        ? payload.body == null
          ? null
          : String(payload.body)
        : existing.body;

    const newStatus =
      payload.canon_status !== undefined &&
      CANON_STATUS_VALUES.includes(payload.canon_status)
        ? payload.canon_status
        : existing.canon_status;
    const newCertainty =
      payload.certainty !== undefined
        ? payload.certainty && CANON_CERTAINTY_VALUES.includes(payload.certainty)
          ? payload.certainty
          : null
        : existing.certainty;
    const newReviewState =
      payload.review_state !== undefined
        ? payload.review_state &&
          CANON_REVIEW_STATE_VALUES.includes(payload.review_state)
          ? payload.review_state
          : null
        : existing.review_state;
    const newProvisional =
      payload.provisional !== undefined
        ? payload.provisional
          ? 1
          : 0
        : existing.provisional;

    let mergedDetail = null;
    if (cfg && cfg.table) {
      const existingDetail =
        db
          .prepare(`SELECT * FROM ${cfg.table} WHERE canon_entry_id = ?`)
          .get(eid) || {};
      const merged = {};
      for (const f of cfg.fields) {
        if (
          payload.detail &&
          Object.prototype.hasOwnProperty.call(payload.detail, f.col)
        ) {
          const v = coerceCanonField(f, payload.detail[f.col]);
          merged[f.col] = v === undefined ? null : v;
        } else {
          merged[f.col] =
            existingDetail[f.col] === undefined ? null : existingDetail[f.col];
        }
      }
      ensureRequiredFields(entryType, merged);
      mergedDetail = merged;
    }

    const now = new Date().toISOString();
    let newId;

    db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO canon_entries
             (created_at, updated_at, entry_type, title, body,
              locked, locked_at, locked_label,
              retired, retired_at,
              replaces_entry_id, replaced_by_entry_id,
              provisional, canon_status, certainty, review_state,
              origin_kind, origin_entry_id, origin_session_id, origin_lock_code)
           VALUES
             (?, ?, ?, ?, ?,
              0, NULL, NULL,
              0, NULL,
              ?, NULL,
              ?, ?, ?, ?,
              ?, ?, ?, ?)`
        )
        .run(
          now, now, entryType, newTitle, newBody,
          eid,
          newProvisional, newStatus, newCertainty, newReviewState,
          existing.origin_kind, existing.origin_entry_id,
          existing.origin_session_id, existing.origin_lock_code
        );
      newId = info.lastInsertRowid;

      if (mergedDetail) {
        const cols = ['canon_entry_id', ...Object.keys(mergedDetail)];
        const placeholders = cols.map(() => '?').join(', ');
        const vals = [newId, ...Object.values(mergedDetail)];
        db.prepare(
          `INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`
        ).run(...vals);
      }

      // SQ-3: legacy IDs migrate to the new row (is_primary=1); the retired
      // row keeps is_primary=0 copies so historical-code searches still hit it.
      const legacyRows = db
        .prepare(
          `SELECT scheme, code, is_primary, parent_code, alias_of_code, note
             FROM canon_entry_legacy_ids
            WHERE canon_entry_id = ?`
        )
        .all(eid);
      if (legacyRows.length) {
        db.prepare(
          `UPDATE canon_entry_legacy_ids
              SET canon_entry_id = ?, is_primary = 1
            WHERE canon_entry_id = ?`
        ).run(newId, eid);
        const insertCopy = db.prepare(
          `INSERT INTO canon_entry_legacy_ids
             (canon_entry_id, scheme, code, is_primary, parent_code, alias_of_code, note, created_at)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?)`
        );
        for (const r of legacyRows) {
          insertCopy.run(
            eid, r.scheme, r.code, r.parent_code, r.alias_of_code, r.note, now
          );
        }
      }

      db.prepare(
        `UPDATE canon_entries
            SET retired = 1, retired_at = ?, replaced_by_entry_id = ?,
                updated_at = ?
          WHERE id = ?`
      ).run(now, newId, now, eid);

      // taggable_tags is polymorphic (no FK on entity_id), so we explicitly
      // copy. INSERT OR IGNORE because (tag_id, entity_kind, entity_id) is
      // UNIQUE — never duplicates if a user re-runs the supersede flow.
      const tagRows = db
        .prepare(
          `SELECT tag_id FROM taggable_tags
            WHERE entity_kind = 'canon_entries' AND entity_id = ?`
        )
        .all(eid);
      if (tagRows.length) {
        const insertTag = db.prepare(
          `INSERT OR IGNORE INTO taggable_tags
             (tag_id, entity_kind, entity_id, created_at)
           VALUES (?, 'canon_entries', ?, ?)`
        );
        for (const t of tagRows) insertTag.run(t.tag_id, newId, now);
      }
    })();

    return canon.getDetail(newId);
  },

  // PHIST — walk the full supersede chain from any entry id and return every
  // version oldest → newest, each as a full canon.getDetail() record. P34 only
  // exposed adjacent links (Replaces / Replaced by); PHIST surfaces the whole
  // chain so a History UI can render the lineage and pick any two versions to
  // compare side by side.
  //
  // Walk backward via replaces_entry_id, then forward via replaced_by_entry_id,
  // dedupe through a visited set as belt-and-suspenders against any malformed
  // pointer cycle. Each version is hydrated through getDetail() so the caller
  // gets the same shape (detail, legacy_ids, origin_session_label, …) as the
  // list view — no second fetch needed to render the comparison.
  versionChain: (id) => {
    const eid = Number(id);
    if (!Number.isFinite(eid)) throw new Error('canon id is required');
    const db = getDb();
    const ptr = db.prepare(
      `SELECT id, replaces_entry_id, replaced_by_entry_id
         FROM canon_entries
        WHERE id = ?`
    );
    const start = ptr.get(eid);
    if (!start) return [];

    const visited = new Set([start.id]);
    const ids = [start.id];

    let backId = start.replaces_entry_id;
    while (backId && !visited.has(backId)) {
      const row = ptr.get(backId);
      if (!row) break;
      visited.add(row.id);
      ids.unshift(row.id);
      backId = row.replaces_entry_id;
    }

    let fwdId = start.replaced_by_entry_id;
    while (fwdId && !visited.has(fwdId)) {
      const row = ptr.get(fwdId);
      if (!row) break;
      visited.add(row.id);
      ids.push(row.id);
      fwdId = row.replaced_by_entry_id;
    }

    return ids.map((vid) => canon.getDetail(vid)).filter(Boolean);
  },

  // P32 — archive == retire flag. We reuse the existing retired/retired_at
  // columns rather than inventing a parallel archived state, because the read
  // view already collapses retired entries to the bottom of the page (and
  // P34 supersede will write the same flag). Restore clears it.
  archive: (id) => {
    const eid = Number(id);
    if (!Number.isFinite(eid)) throw new Error('canon id is required');
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE canon_entries
            SET retired = 1, retired_at = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(now, now, eid);
    return canon.getDetail(eid);
  },
  restore: (id) => {
    const eid = Number(id);
    if (!Number.isFinite(eid)) throw new Error('canon id is required');
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE canon_entries
            SET retired = 0, retired_at = NULL, updated_at = ?
          WHERE id = ?`
      )
      .run(now, eid);
    return canon.getDetail(eid);
  },
};

// PSEARCH — global search across workspaces, canon entries, chats, and tags.
//
// Returns results grouped by source so the UI can render one section per
// kind. Each group's hits are limited (PER_GROUP_LIMIT) so a generic term
// doesn't dump the whole DB into a dropdown.
//
// Filters:
//   - workspace  : restricts to a single source kind (e.g. 'unsorted',
//                  'canon_entries', 'chats', 'tags'). Empty/null = all.
//   - tagId      : restricts entry-bearing sources to rows that carry this
//                  tag in taggable_tags. Doesn't apply to chats or tags.
//   - entryType  : canon_entries only — filters by entry_type enum.
//   - canonStatus: canon_entries only — filters by canon_status enum.
//   - lockStatus : canon_entries only — 'locked' / 'unlocked' (NULL = both).
//
// Active rows only (archived_at IS NULL where the column exists; retired = 0
// for canon_entries). Title matches outrank body matches inside each source
// so the most relevant hit is the one shown first.
const PER_GROUP_LIMIT = 25;

const SEARCH_SOURCES = [
  { kind: 'unsorted',         label: 'Unsorted',        workspace: 'Unsorted',        table: 'unsorted_items',       entityKind: 'unsorted' },
  { kind: 'source_material',  label: 'Source Material', workspace: 'Source Material', table: 'source_material',      entityKind: 'source_material' },
  { kind: 'documents',        label: 'Documents',       workspace: 'Documents',       table: 'documents',            entityKind: 'documents' },
  { kind: 'open_questions',   label: 'Open Questions',  workspace: 'Open Questions',  table: 'open_questions',       entityKind: 'open_questions' },
  { kind: 'conflicts',        label: 'Conflicts',       workspace: 'Conflicts',       table: 'conflicts',            entityKind: 'conflicts' },
  { kind: 'decisions',        label: 'Decisions',       workspace: 'Decisions',       table: 'decisions',            entityKind: 'decisions' },
  { kind: 'brainstorm',       label: 'Brainstorm',      workspace: 'Brainstorm',      table: 'brainstorm_items',     entityKind: 'brainstorm' },
  { kind: 'research',         label: 'Research',        workspace: 'Research',        table: 'research_items',       entityKind: 'research' },
  { kind: 'characters',       label: 'Characters',      workspace: 'Characters',      table: 'characters_workspace', entityKind: 'characters' },
  { kind: 'episodes',         label: 'Episodes',        workspace: 'Episodes',        table: 'episodes_workspace',   entityKind: 'episodes' },
  { kind: 'writing_lab',      label: 'Writing Lab',     workspace: 'Writing Lab',     table: 'writing_lab_drafts',   entityKind: null },
];

function snippet(body, term, span = 80) {
  if (!body) return '';
  const text = String(body).replace(/\s+/g, ' ');
  if (!term) return text.slice(0, span);
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return text.slice(0, span);
  const start = Math.max(0, i - Math.floor(span / 3));
  return (start > 0 ? '…' : '') + text.slice(start, start + span);
}

const search = {
  run: ({
    q,
    workspace,
    tagId,
    entryType,
    canonStatus,
    lockStatus,
  } = {}) => {
    const term = String(q || '').trim();
    if (!term) return { groups: [], totals: { hits: 0 } };
    const like = `%${term.replace(/[%_]/g, (c) => '\\' + c)}%`;
    const db = getDb();
    const groups = [];
    let totalHits = 0;

    // Entry-bearing workspaces (title + body LIKE; optional tag filter).
    for (const src of SEARCH_SOURCES) {
      if (workspace && workspace !== src.kind) continue;
      let sql;
      const params = [];
      if (tagId && src.entityKind) {
        sql = `
          SELECT t.id, t.title, t.body
            FROM ${src.table} t
            JOIN taggable_tags tt
              ON tt.entity_kind = ? AND tt.entity_id = t.id
           WHERE t.archived_at IS NULL
             AND tt.tag_id = ?
             AND (t.title LIKE ? ESCAPE '\\' OR t.body LIKE ? ESCAPE '\\')
           ORDER BY (t.title LIKE ? ESCAPE '\\') DESC,
                    t.updated_at DESC, t.id DESC
           LIMIT ?
        `;
        params.push(src.entityKind, Number(tagId), like, like, like, PER_GROUP_LIMIT);
      } else if (tagId && !src.entityKind) {
        // Tag filter excludes sources with no entity_kind (e.g. writing_lab).
        continue;
      } else {
        sql = `
          SELECT id, title, body
            FROM ${src.table}
           WHERE archived_at IS NULL
             AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
           ORDER BY (title LIKE ? ESCAPE '\\') DESC,
                    updated_at DESC, id DESC
           LIMIT ?
        `;
        params.push(like, like, like, PER_GROUP_LIMIT);
      }
      const rows = db.prepare(sql).all(...params);
      if (rows.length === 0) continue;
      const hits = rows.map((r) => ({
        id: r.id,
        title: r.title || '(untitled)',
        snippet: snippet(r.body, term),
      }));
      groups.push({
        kind: src.kind,
        label: src.label,
        workspace: src.workspace,
        hits,
      });
      totalHits += hits.length;
    }

    // Canon entries — its own filters (entry_type / canon_status / lock).
    if (!workspace || workspace === 'canon_entries') {
      const where = [
        'ce.retired = 0',
        "(ce.title LIKE ? ESCAPE '\\' OR ce.body LIKE ? ESCAPE '\\')",
      ];
      const params = [like, like];
      if (tagId) {
        where.unshift(
          `EXISTS (SELECT 1 FROM taggable_tags tt
                    WHERE tt.entity_kind = 'canon_entries'
                      AND tt.entity_id = ce.id
                      AND tt.tag_id = ?)`
        );
        params.unshift(Number(tagId));
      }
      if (entryType) {
        where.push('ce.entry_type = ?');
        params.push(entryType);
      }
      if (canonStatus) {
        where.push('ce.canon_status = ?');
        params.push(canonStatus);
      }
      if (lockStatus === 'locked') where.push('ce.locked = 1');
      else if (lockStatus === 'unlocked') where.push('ce.locked = 0');
      params.push(like, PER_GROUP_LIMIT);
      const sql = `
        SELECT ce.id, ce.title, ce.body, ce.entry_type,
               ce.locked, ce.canon_status
          FROM canon_entries ce
         WHERE ${where.join(' AND ')}
         ORDER BY (ce.title LIKE ? ESCAPE '\\') DESC,
                  ce.updated_at DESC, ce.id DESC
         LIMIT ?
      `;
      const rows = db.prepare(sql).all(...params);
      if (rows.length > 0) {
        groups.push({
          kind: 'canon_entries',
          label: 'Canon Bible',
          workspace: 'Canon Bible',
          hits: rows.map((r) => ({
            id: r.id,
            title: r.title || '(untitled)',
            snippet: snippet(r.body, term),
            entry_type: r.entry_type,
            locked: !!r.locked,
            canon_status: r.canon_status,
          })),
        });
        totalHits += rows.length;
      }
    }

    // Chats — title only (no body column on chats). Active chats only.
    if (!workspace || workspace === 'chats') {
      if (!tagId) {
        const rows = db
          .prepare(
            `SELECT id, title FROM chats
              WHERE archived_at IS NULL AND title LIKE ? ESCAPE '\\'
              ORDER BY updated_at DESC, id DESC
              LIMIT ?`
          )
          .all(like, PER_GROUP_LIMIT);
        if (rows.length > 0) {
          groups.push({
            kind: 'chats',
            label: 'Chats',
            workspace: 'Chat',
            hits: rows.map((r) => ({ id: r.id, title: r.title })),
          });
          totalHits += rows.length;
        }
      }
    }

    // Tags — match by name. Clicking a tag hit applies it as a filter in the UI.
    if (!workspace || workspace === 'tags') {
      if (!tagId) {
        const rows = db
          .prepare(
            `SELECT id, name, category, is_seed
               FROM tags
              WHERE name LIKE ? ESCAPE '\\'
              ORDER BY (name LIKE ? ESCAPE '\\') DESC, name COLLATE NOCASE
              LIMIT ?`
          )
          .all(like, like, PER_GROUP_LIMIT);
        if (rows.length > 0) {
          groups.push({
            kind: 'tags',
            label: 'Tags',
            workspace: null,
            hits: rows.map((r) => ({
              id: r.id,
              title: r.name,
              category: r.category,
              is_seed: !!r.is_seed,
            })),
          });
          totalHits += rows.length;
        }
      }
    }

    return { groups, totals: { hits: totalHits } };
  },

  // Static metadata for the renderer's filter dropdowns. Kept here so the UI
  // doesn't hard-code workspace names independently of the server side.
  sources: () =>
    SEARCH_SOURCES.map((s) => ({
      kind: s.kind,
      label: s.label,
      workspace: s.workspace,
    })),
};

// --- PPASSIVE: linked-entries indicator ------------------------------------
// Read-only count + list of everything that references a given workspace
// entry. Two relationship kinds, both already in the schema:
//   • attachments — rows in cross_workspace_attachments where this entry is
//     either the host OR an attached source (link table, P31 schema).
//   • canon links — canon_entries whose origin_kind/origin_entry_id point back
//     at this entry (forward provenance on canon_entries).
// No writes; purely passive. The picker that creates attachments lands in P36.

// cross_workspace_attachments host/source kinds are the logical names — map
// each to the actual table so we can resolve a title for the expandable list.
const CWA_TABLE_BY_KIND = {
  characters: 'characters_workspace',
  episodes: 'episodes_workspace',
  decisions: 'decisions',
  open_questions: 'open_questions',
  conflicts: 'conflicts',
  brainstorm: 'brainstorm_items',
  research: 'research_items',
  source_material: 'source_material',
  documents: 'documents',
  writing_lab: 'writing_lab_drafts',
  unsorted: 'unsorted_items',
};

// Renderer entityKind (logical name) → canon_entries.origin_kind enum value.
const CANON_ORIGIN_BY_KIND = {
  unsorted: 'unsorted_items',
  source_material: 'source_material',
  documents: 'documents',
  open_questions: 'open_questions',
  conflicts: 'conflicts',
  decisions: 'decisions',
  brainstorm: 'brainstorm_items',
  research: 'research_items',
  characters: 'characters_workspace',
  episodes: 'episodes_workspace',
  writing_lab: 'writing_lab_drafts',
};

const WORKSPACE_LABEL_BY_KIND = {
  characters: 'Characters',
  episodes: 'Episodes',
  decisions: 'Decisions',
  open_questions: 'Open Questions',
  conflicts: 'Conflicts',
  brainstorm: 'Brainstorm',
  research: 'Research',
  source_material: 'Source Material',
  documents: 'Documents',
  writing_lab: 'Writing Lab',
  unsorted: 'Unsorted',
};

const links = {
  // kind = renderer entityKind (e.g. 'characters', 'decisions'); id = row id.
  for(kind, id) {
    const db = getDb();
    const attachments = [];

    // Only the eight cross-workspace kinds can be a host or a source; the
    // others (unsorted, documents, writing_lab) never appear in the link
    // table, so skip the query entirely for them.
    if (CWA_TABLE_BY_KIND[kind]) {
      const rows = [
        // This entry as host → the sources it has attached.
        ...db
          .prepare(
            `SELECT source_kind AS kind, source_id AS id
               FROM cross_workspace_attachments
              WHERE host_kind = ? AND host_id = ?`
          )
          .all(kind, id),
        // This entry as source → the hosts that attached it.
        ...db
          .prepare(
            `SELECT host_kind AS kind, host_id AS id
               FROM cross_workspace_attachments
              WHERE source_kind = ? AND source_id = ?`
          )
          .all(kind, id),
      ];
      for (const row of rows) {
        const table = CWA_TABLE_BY_KIND[row.kind];
        const item = table
          ? db.prepare(`SELECT title FROM ${table} WHERE id = ?`).get(row.id)
          : null;
        attachments.push({
          kind: row.kind,
          id: row.id,
          title: (item && item.title) || '(untitled)',
          workspace: WORKSPACE_LABEL_BY_KIND[row.kind] || row.kind,
        });
      }
    }

    const canonLinks = [];
    const originKind = CANON_ORIGIN_BY_KIND[kind];
    if (originKind) {
      const rows = db
        .prepare(
          `SELECT id, title, entry_type FROM canon_entries
            WHERE origin_kind = ? AND origin_entry_id = ?
            ORDER BY created_at DESC, id DESC`
        )
        .all(originKind, id);
      for (const r of rows) {
        canonLinks.push({
          id: r.id,
          title: r.title || '(untitled)',
          entry_type: r.entry_type,
        });
      }
    }

    // PBRAIN-STRUCT — back-references from brainstorm items that were
    // "developed into" this entry (bi-directional visibility).
    const brainstormDevFrom = getDb()
      .prepare(
        'SELECT id, title FROM brainstorm_items WHERE dev_into_kind = ? AND dev_into_id = ? AND archived_at IS NULL'
      )
      .all(kind, id)
      .map((r) => ({ id: r.id, title: r.title || '(untitled)' }));

    return {
      attachments,
      canonLinks,
      brainstormDevFrom,
      counts: {
        attachments: attachments.length,
        canonLinks: canonLinks.length,
        brainstormDevFrom: brainstormDevFrom.length,
      },
    };
  },
};

// P36 — cross-workspace attachment writes. attach/detach create and remove
// rows in cross_workspace_attachments; candidates lists active entries from a
// source workspace so the picker can display them.
const crossWorkspace = {
  attach(hostKind, hostId, sourceKind, sourceId) {
    const db = getDb();
    db.prepare(
      `INSERT OR IGNORE INTO cross_workspace_attachments
         (host_kind, host_id, source_kind, source_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(hostKind, hostId, sourceKind, sourceId, new Date().toISOString());
  },
  detach(hostKind, hostId, sourceKind, sourceId) {
    const db = getDb();
    db.prepare(
      `DELETE FROM cross_workspace_attachments
        WHERE host_kind = ? AND host_id = ?
          AND source_kind = ? AND source_id = ?`
    ).run(hostKind, hostId, sourceKind, sourceId);
  },
  candidates(sourceKind) {
    const db = getDb();
    const table = CWA_TABLE_BY_KIND[sourceKind];
    if (!table) return [];
    return db
      .prepare(
        `SELECT id, title FROM ${table}
          WHERE archived_at IS NULL
          ORDER BY updated_at DESC, id DESC`
      )
      .all();
  },
};

// PCONFLICT — deterministic conflict detection for the Canon Bible.
//
// Runs on demand, never automatically. Surfaces *pairs / groups* of active
// canon entries whose values collide on something that should be unique:
//
//   1. Duplicate title within an entry_type (case/whitespace-insensitive).
//   2. Duplicate primary legacy id (same scheme + code, is_primary = 1).
//   3. Structural-key duplicates the schema does NOT already enforce:
//        - (season_entry_id, episode_number) across episode entries
//        - phase_number across viral_phase entries
//      season_number and locked-decision code are skipped — they carry UNIQUE
//      constraints (migration 018), so duplicates can't reach the DB.
//
// All checks read only active (retired = 0) rows — retired/superseded entries
// don't count as "conflicting" with their replacements. No AI, no fuzzy text
// matching: a contradiction is a key collision the schema doesn't enforce.
//
// routeToConflicts writes ONE row into `conflicts` with the pair / group
// summarized in the body so the user can take it from there. We don't touch
// canon_entries; per CLAUDE.md all canon mutation goes through Canon Review.
const canonConflicts = (() => {
  function toSummary(row) {
    return {
      id: row.id,
      entry_type: row.entry_type,
      title: row.title || '(untitled)',
      locked: !!row.locked,
      canon_status: row.canon_status || null,
    };
  }
  function typeLabel(t) {
    return (CANON_TYPE_CONFIG[t] && CANON_TYPE_CONFIG[t].label) || t;
  }

  return {
    scan: () => {
      const db = getDb();
      const active = db
        .prepare(
          `SELECT id, entry_type, title, locked, canon_status
             FROM canon_entries
            WHERE retired = 0
            ORDER BY id ASC`
        )
        .all();

      const result = {
        scannedAt: new Date().toISOString(),
        totalActiveEntries: active.length,
        conflicts: [],
      };
      if (active.length === 0) return result;

      const byId = new Map(active.map((e) => [e.id, e]));

      // 1) Duplicate titles within the same entry_type.
      function sortedIds(rows) {
        return rows.map((r) => Number(r.id)).sort((a, b) => a - b);
      }

      const byTitleKey = new Map();
      for (const e of active) {
        const norm = String(e.title || '').trim().toLowerCase();
        if (!norm) continue;
        const key = `${e.entry_type}::${norm}`;
        if (!byTitleKey.has(key)) byTitleKey.set(key, []);
        byTitleKey.get(key).push(e);
      }
      for (const group of byTitleKey.values()) {
        if (group.length < 2) continue;
        const tl = typeLabel(group[0].entry_type);
        const ids = sortedIds(group);
        const norm = String(group[0].title || '').trim().toLowerCase();
        result.conflicts.push({
          kind: 'duplicate_title',
          signature: `duplicate_title|${group[0].entry_type}|${norm}|${ids.join(',')}`,
          label: `Duplicate title "${group[0].title}" within ${tl}`,
          detail: `${group.length} active ${tl} entries share this title (case-insensitive).`,
          entries: group.map(toSummary),
        });
      }

      // 2) Duplicate primary legacy ids among active entries.
      const legacyRows = db
        .prepare(
          `SELECT l.scheme, l.code, l.canon_entry_id
             FROM canon_entry_legacy_ids l
             JOIN canon_entries e ON e.id = l.canon_entry_id
            WHERE l.is_primary = 1 AND e.retired = 0`
        )
        .all();
      const byLegacyKey = new Map();
      for (const r of legacyRows) {
        const key = `${r.scheme}::${r.code}`;
        if (!byLegacyKey.has(key)) byLegacyKey.set(key, { scheme: r.scheme, code: r.code, ids: [] });
        byLegacyKey.get(key).ids.push(r.canon_entry_id);
      }
      for (const v of byLegacyKey.values()) {
        const group = v.ids.map((id) => byId.get(id)).filter(Boolean);
        if (group.length < 2) continue;
        const ids = sortedIds(group);
        result.conflicts.push({
          kind: 'duplicate_legacy_id',
          signature: `duplicate_legacy_id|${v.scheme}|${v.code}|${ids.join(',')}`,
          label: `Duplicate primary legacy id ${v.scheme}:${v.code}`,
          detail: `${group.length} active canon entries hold ${v.scheme}:${v.code} as a primary id.`,
          entries: group.map(toSummary),
        });
      }

      // 3a) (season_entry_id, episode_number) across episode entries.
      const episodeRows = db
        .prepare(
          `SELECT e.id, e.entry_type, e.title, e.locked, e.canon_status,
                  ep.season_entry_id, ep.episode_number
             FROM canon_entries e
             JOIN canon_episodes ep ON ep.canon_entry_id = e.id
            WHERE e.retired = 0
              AND ep.season_entry_id IS NOT NULL
              AND ep.episode_number IS NOT NULL`
        )
        .all();
      const byEpisodeKey = new Map();
      for (const r of episodeRows) {
        const key = `${r.season_entry_id}::${r.episode_number}`;
        if (!byEpisodeKey.has(key)) byEpisodeKey.set(key, { seasonId: r.season_entry_id, epNum: r.episode_number, rows: [] });
        byEpisodeKey.get(key).rows.push(r);
      }
      for (const v of byEpisodeKey.values()) {
        if (v.rows.length < 2) continue;
        const seasonEntry = byId.get(Number(v.seasonId));
        const seasonLabel = seasonEntry ? `"${seasonEntry.title}"` : `entry #${v.seasonId}`;
        const ids = sortedIds(v.rows);
        result.conflicts.push({
          kind: 'duplicate_episode_number',
          signature: `duplicate_episode_number|${v.seasonId}|${v.epNum}|${ids.join(',')}`,
          label: `Duplicate episode ${v.epNum} in season ${seasonLabel}`,
          detail: `${v.rows.length} Episode entries share (season_entry_id=${v.seasonId}, episode_number=${v.epNum}).`,
          entries: v.rows.map(toSummary),
        });
      }

      // 3b) phase_number across viral_phase entries.
      const phaseRows = db
        .prepare(
          `SELECT e.id, e.entry_type, e.title, e.locked, e.canon_status, v.phase_number
             FROM canon_entries e
             JOIN canon_viral_phases v ON v.canon_entry_id = e.id
            WHERE e.retired = 0 AND v.phase_number IS NOT NULL`
        )
        .all();
      const byPhase = new Map();
      for (const r of phaseRows) {
        if (!byPhase.has(r.phase_number)) byPhase.set(r.phase_number, []);
        byPhase.get(r.phase_number).push(r);
      }
      for (const [n, group] of byPhase.entries()) {
        if (group.length < 2) continue;
        const ids = sortedIds(group);
        result.conflicts.push({
          kind: 'duplicate_phase_number',
          signature: `duplicate_phase_number|${n}|${ids.join(',')}`,
          label: `Duplicate viral phase number ${n}`,
          detail: `${group.length} Viral Phase entries share phase_number ${n}.`,
          entries: group.map(toSummary),
        });
      }

      result.conflicts.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return a.label.localeCompare(b.label);
      });

      // PCONFLICT auto-archive — for every flagged Conflicts row that's still
      // open (not manually archived, not previously auto-archived), check
      // whether its original collision signature still appears in this scan.
      // If not, archive the conflicts row and stamp auto_archived_at on the
      // flag so a later manual Restore + rescan won't re-archive it.
      const currentSigs = new Set(result.conflicts.map((c) => c.signature));
      const openFlags = db
        .prepare(
          `SELECT f.id AS flag_id, f.conflict_id, f.signature, c.title
             FROM canon_conflict_flags f
             JOIN conflicts c ON c.id = f.conflict_id
            WHERE f.auto_archived_at IS NULL
              AND c.archived_at IS NULL`
        )
        .all();

      const autoArchived = [];
      if (openFlags.length) {
        const stamp = result.scannedAt;
        const archiveStmt = db.prepare(
          `UPDATE conflicts SET archived_at = ?, updated_at = ? WHERE id = ?`
        );
        const flagStmt = db.prepare(
          `UPDATE canon_conflict_flags SET auto_archived_at = ? WHERE id = ?`
        );
        db.transaction(() => {
          for (const f of openFlags) {
            if (currentSigs.has(f.signature)) continue;
            archiveStmt.run(stamp, stamp, f.conflict_id);
            flagStmt.run(stamp, f.flag_id);
            autoArchived.push({ id: f.conflict_id, title: f.title });
          }
        })();
      }
      result.autoArchived = autoArchived;
      return result;
    },

    // PCONFLICT-2 (auto-route) — run a normal scan, then for every detected
    // group that doesn't already have an open routed Conflicts row with the
    // same signature, create one. Dedup is per-signature so re-running the
    // scan never piles up duplicate Conflicts rows for the same collision.
    //
    // Returns the scan result enriched with:
    //   - each conflict gets `routedRowId` (existing or freshly created)
    //   - `routedNew`: [{ id, title, signature }] for rows created this run
    //   - `alreadyTracked`: [{ id, title, signature }] for rows skipped
    //
    // `autoArchived` and `conflicts` come straight from scan(). This is the
    // path the UI uses — explicit `routeToConflicts` stays in the API for
    // ad-hoc / programmatic callers but the Canon Bible + Conflicts surfaces
    // no longer ask the user to route per-card.
    scanAndRoute: function () {
      const result = this.scan();
      if (!result.conflicts.length) {
        result.routedNew = [];
        result.alreadyTracked = [];
        return result;
      }

      const db = getDb();
      const openFlags = db
        .prepare(
          `SELECT f.signature, f.conflict_id, c.title
             FROM canon_conflict_flags f
             JOIN conflicts c ON c.id = f.conflict_id
            WHERE f.auto_archived_at IS NULL
              AND c.archived_at IS NULL`
        )
        .all();
      const openBySig = new Map(openFlags.map((r) => [r.signature, r]));

      const routedNew = [];
      const alreadyTracked = [];
      for (const c of result.conflicts) {
        const existing = openBySig.get(c.signature);
        if (existing) {
          c.routedRowId = existing.conflict_id;
          alreadyTracked.push({
            id: existing.conflict_id,
            title: existing.title,
            signature: c.signature,
          });
          continue;
        }
        const row = this.routeToConflicts({
          kind: c.kind,
          signature: c.signature,
          label: c.label,
          detail: c.detail,
          entries: c.entries,
        });
        c.routedRowId = row.id;
        routedNew.push({ id: row.id, title: row.title, signature: c.signature });
      }
      result.routedNew = routedNew;
      result.alreadyTracked = alreadyTracked;
      return result;
    },

    // PCONFLICT-2 — canon_entries.id[] currently referenced by any open
    // conflict flag (flag not auto-archived AND parent conflicts row not
    // archived). Lets the Canon Bible toast on mutations to load-bearing
    // entries without forcing a full scan on every click.
    openFlagEntryIds: () => {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT f.entry_ids_json
             FROM canon_conflict_flags f
             JOIN conflicts c ON c.id = f.conflict_id
            WHERE f.auto_archived_at IS NULL
              AND c.archived_at IS NULL`
        )
        .all();
      const ids = new Set();
      for (const r of rows) {
        try {
          const arr = JSON.parse(r.entry_ids_json || '[]');
          for (const id of arr) {
            const n = Number(id);
            if (Number.isFinite(n)) ids.add(n);
          }
        } catch {
          // Bad row — skip. The flag is still tracked elsewhere; missing
          // ids only means we won't toast for those mutations.
        }
      }
      return Array.from(ids);
    },

    // Write one row into `conflicts` summarizing a flagged group, plus a
    // sidecar `canon_conflict_flags` row carrying the signature so a later
    // scan() can auto-archive this Conflicts row when the underlying
    // collision is resolved. Not idempotent — clicking Route twice writes
    // two rows, by design: the user may have already started annotating an
    // earlier one and a re-click should land cleanly without silently
    // merging into it. Stale ones get cleaned up by the next scan.
    routeToConflicts: (payload = {}) => {
      const kind = String(payload.kind || '').trim();
      const signature = String(payload.signature || '').trim();
      const label = String(payload.label || '').trim();
      const detail = payload.detail ? String(payload.detail).trim() : '';
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      if (!label) throw new Error('Conflict label is required.');
      if (!signature) throw new Error('Conflict signature is required.');
      if (entries.length < 2) {
        throw new Error('A conflict needs at least two canon entries.');
      }

      const title = `Conflict: ${label}`.slice(0, 200);
      const lines = ['Auto-flagged by Canon Bible conflict detection.', ''];
      if (kind) lines.push(`Kind: ${kind}`);
      if (detail) lines.push(detail);
      lines.push('', 'Canon entries involved:');
      for (const e of entries) {
        const t = e.title || '(untitled)';
        const ty = e.entry_type || 'entry';
        lines.push(`  • Canon Bible #${e.id} — ${t} (${ty})`);
      }

      const db = getDb();
      const entryIds = entries
        .map((e) => Number(e.id))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      const now = new Date().toISOString();

      let row;
      db.transaction(() => {
        row = conflicts.create({ title, body: lines.join('\n') });
        db.prepare(
          `INSERT INTO canon_conflict_flags
             (conflict_id, kind, signature, entry_ids_json, created_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(row.id, kind || 'unknown', signature, JSON.stringify(entryIds), now);
      })();
      return row;
    },
  };
})();

// PEXPORT — Canon Bible export. Queries non-retired canon entries filtered by
// all / entry_type / character / season, then renders a markdown string and a
// minimal HTML page (for PDF generation in the main process). Returns
// { markdown, html, count, title } — no file I/O here.
function canonExport(params) {
  const db = getDb();
  const { filterBy = 'all', filterId } = params || {};
  let entries = [];
  let title = '';

  if (filterBy === 'entry_type' && filterId) {
    entries = db
      .prepare(
        `SELECT ${CANON_LIST_COLUMNS}
           FROM canon_entries ce
           LEFT JOIN sessions s ON s.id = ce.origin_session_id
          WHERE ce.retired = 0 AND ce.entry_type = ?
          ORDER BY ce.title ASC, ce.id ASC`
      )
      .all(String(filterId));
    const cfg = CANON_TYPE_CONFIG[filterId];
    title = `Canon Bible — ${cfg ? cfg.label : String(filterId)}`;
  } else if (filterBy === 'character' && filterId) {
    const charId = Number(filterId);
    entries = db
      .prepare(
        `SELECT ${CANON_LIST_COLUMNS}
           FROM canon_entries ce
           LEFT JOIN sessions s ON s.id = ce.origin_session_id
          WHERE ce.retired = 0
            AND (
              ce.id = ?
              OR (ce.entry_type = 'locked_line' AND EXISTS (
                SELECT 1 FROM canon_locked_lines cll
                 WHERE cll.canon_entry_id = ce.id AND cll.character_entry_id = ?
              ))
            )
          ORDER BY ce.entry_type ASC, ce.title ASC, ce.id ASC`
      )
      .all(charId, charId);
    const charEntry = entries.find(
      (e) => e.id === charId && e.entry_type === 'character'
    );
    title = `Canon Bible — Character: ${charEntry ? charEntry.title : `#${charId}`}`;
  } else if (filterBy === 'season' && filterId) {
    const seasonId = Number(filterId);
    entries = db
      .prepare(
        `SELECT ${CANON_LIST_COLUMNS}
           FROM canon_entries ce
           LEFT JOIN sessions s ON s.id = ce.origin_session_id
          WHERE ce.retired = 0
            AND (
              ce.id = ?
              OR (ce.entry_type = 'episode' AND EXISTS (
                SELECT 1 FROM canon_episodes ep
                 WHERE ep.canon_entry_id = ce.id AND ep.season_entry_id = ?
              ))
            )
          ORDER BY ce.entry_type ASC, ce.title ASC, ce.id ASC`
      )
      .all(seasonId, seasonId);
    const seasonEntry = entries.find(
      (e) => e.id === seasonId && e.entry_type === 'season'
    );
    title = `Canon Bible — Season: ${seasonEntry ? seasonEntry.title : `#${seasonId}`}`;
  } else {
    entries = db
      .prepare(
        `SELECT ${CANON_LIST_COLUMNS}
           FROM canon_entries ce
           LEFT JOIN sessions s ON s.id = ce.origin_session_id
          WHERE ce.retired = 0
          ORDER BY ce.entry_type ASC, ce.title ASC, ce.id ASC`
      )
      .all();
    title = 'Canon Bible — All Approved Entries';
  }

  entries = attachDetails(attachLegacyIds(entries));

  // --- Markdown ----------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10);
  const mdLines = [
    `# ${title}`,
    `_Exported: ${today} · ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}_`,
    '',
    '---',
    '',
  ];

  const byType = new Map();
  for (const e of entries) {
    if (!byType.has(e.entry_type)) byType.set(e.entry_type, []);
    byType.get(e.entry_type).push(e);
  }

  for (const [type, typeEntries] of byType.entries()) {
    const cfg = CANON_TYPE_CONFIG[type];
    mdLines.push(`## ${cfg ? cfg.label : type} (${typeEntries.length})`);
    mdLines.push('');

    for (const entry of typeEntries) {
      mdLines.push(`### ${entry.title || '(untitled)'}`);
      mdLines.push('');

      const meta = [`**Status:** ${entry.canon_status || 'draft'}`];
      if (entry.certainty) meta.push(`**Certainty:** ${entry.certainty}`);
      if (entry.locked) meta.push(`**Locked:** ${entry.locked_label || 'yes'}`);
      if (entry.provisional) meta.push(`**Provisional**`);
      if (entry.legacy_ids && entry.legacy_ids.length > 0) {
        const primary = entry.legacy_ids.find((l) => l.isPrimary);
        if (primary) meta.push(`**Code:** ${primary.scheme}-${primary.code}`);
      }
      mdLines.push(meta.join(' · '));
      mdLines.push('');

      if (entry.detail && cfg && cfg.fields.length > 0) {
        for (const field of cfg.fields) {
          const v = entry.detail[field.col];
          if (v === null || v === undefined || v === '') continue;
          if (field.kind === 'boolean') {
            if (v) mdLines.push(`**${field.label}:** Yes`);
            continue;
          }
          if (field.kind === 'textarea') {
            mdLines.push(`**${field.label}:**`);
            mdLines.push('');
            mdLines.push(String(v).trim());
            mdLines.push('');
          } else {
            mdLines.push(`**${field.label}:** ${v}`);
          }
        }
        if (!mdLines[mdLines.length - 1] === '') mdLines.push('');
      }

      if (entry.body && entry.body.trim()) {
        mdLines.push('**Notes:**');
        mdLines.push('');
        mdLines.push(entry.body.trim());
        mdLines.push('');
      }

      mdLines.push('---');
      mdLines.push('');
    }
  }

  const markdown = mdLines.join('\n');

  // --- HTML (for PDF rendering in main process) --------------------------
  const esc = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const mdToHtml = (line) =>
    esc(line)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');

  const htmlParts = [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    `<title>${esc(title)}</title>`,
    '<style>',
    'body{font-family:Georgia,serif;font-size:13px;line-height:1.6;max-width:780px;margin:40px auto;color:#111;padding:0 20px}',
    'h1{font-size:22px;border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:4px}',
    'h2{font-size:16px;margin-top:2.2em;border-bottom:1px solid #bbb;padding-bottom:2px;color:#222}',
    'h3{font-size:14px;margin-top:1.6em;margin-bottom:2px}',
    'p{margin:3px 0 8px}',
    'hr{border:none;border-top:1px solid #ddd;margin:1.4em 0}',
    '@media print{body{max-width:100%;margin:0.5in;padding:0}h3{page-break-after:avoid}}',
    '</style></head><body>',
  ];

  for (const raw of mdLines) {
    if (raw.startsWith('# ')) {
      htmlParts.push(`<h1>${esc(raw.slice(2))}</h1>`);
    } else if (raw.startsWith('## ')) {
      htmlParts.push(`<h2>${esc(raw.slice(3))}</h2>`);
    } else if (raw.startsWith('### ')) {
      htmlParts.push(`<h3>${esc(raw.slice(4))}</h3>`);
    } else if (raw === '---') {
      htmlParts.push('<hr>');
    } else if (raw.trim() !== '') {
      htmlParts.push(`<p>${mdToHtml(raw)}</p>`);
    }
  }

  htmlParts.push('</body></html>');

  return { markdown, html: htmlParts.join('\n'), count: entries.length, title };
}

// --- PImp1 — Worldbuilding file import --------------------------------------
// Stages parsed worldbuilding file entries as pending Canon Review proposals.
// The renderer handles file reading and parsing; these two functions handle
// the DB side: conflict pre-check and proposal creation.
const canonImport = {
  // Compare proposed entries (array of { title, entry_type? }) against existing
  // active (non-retired) canon entries. Returns each proposal annotated with a
  // conflicts array so the import preview UI can flag them before staging.
  checkConflicts: (proposals) => {
    const db = getDb();
    const active = db
      .prepare(`SELECT id, entry_type, title FROM canon_entries WHERE retired = 0`)
      .all();

    // Index by normalised title for O(1) lookup.
    const byTitle = new Map();
    for (const e of active) {
      const norm = (e.title || '').trim().toLowerCase();
      if (!norm) continue;
      if (!byTitle.has(norm)) byTitle.set(norm, []);
      byTitle.get(norm).push(e);
    }

    return proposals.map((p) => {
      const norm = (p.title || '').trim().toLowerCase();
      const matches = norm ? (byTitle.get(norm) || []) : [];
      // When a type was detected, flag only same-type matches — different
      // types sharing a title are suspicious but not always a contradiction.
      const relevant = (p.entry_type && matches.length)
        ? matches.filter((e) => e.entry_type === p.entry_type)
        : matches;
      return {
        ...p,
        conflicts: relevant.map((e) => ({
          id: e.id,
          entry_type: e.entry_type,
          title: e.title,
        })),
      };
    });
  },

  // Create one pending canon_proposal per entry. source_kind='import' +
  // the file name in proposer_note give each proposal full source attribution.
  // Skips entries with no title. Returns { staged } count.
  stageEntries: (entries, fileName) => {
    const db = getDb();
    const now = new Date().toISOString();
    let staged = 0;

    const insertStmt = db.prepare(
      `INSERT INTO canon_proposals
         (created_at, updated_at, proposal_intent, proposed_fields_json,
          source_kind, proposer_note, status)
       VALUES (?, ?, 'new_entry', ?, 'import', ?, 'pending')`
    );

    db.transaction(() => {
      for (const entry of entries) {
        const cleanTitle = (entry.title || '').trim();
        if (!cleanTitle) continue;

        const fields = { title: cleanTitle, body: (entry.body || '').trim() };
        if (entry.entry_type) fields.entry_type = entry.entry_type;

        const noteParts = [`Source file: ${fileName}`];
        if (entry.conflictNote) noteParts.push(entry.conflictNote);

        insertStmt.run(now, now, JSON.stringify(fields), noteParts.join('\n'));
        staged++;
      }
    })();

    return { staged };
  },
};

// PSESSION-LOG — session audit trail.
const sessionLogs = {
  save(startedAt, endedAt, events) {
    getDb()
      .prepare('INSERT INTO session_logs (started_at, ended_at, events) VALUES (?, ?, ?)')
      .run(startedAt, endedAt, JSON.stringify(events));
  },
  list() {
    return getDb()
      .prepare('SELECT id, started_at, ended_at, events FROM session_logs ORDER BY id DESC')
      .all()
      .map((r) => ({ ...r, events: JSON.parse(r.events) }));
  },
  get(id) {
    const r = getDb().prepare('SELECT * FROM session_logs WHERE id = ?').get(id);
    return r ? { ...r, events: JSON.parse(r.events) } : null;
  },
};

module.exports = {
  initDatabase,
  getDb,
  exportAll,
  canonExport,
  settings,
  dashboard,
  canon,
  canonConflicts,
  canonProposals,
  tags,
  search,
  links,
  crossWorkspace,
  getDbPath,
  DB_FILENAME,
  MIGRATIONS,
  sourceMaterial,
  documents,
  openQuestions,
  conflicts,
  decisions,
  brainstorm,
  brainstormThreads,
  research,
  characters,
  characterRelationships,
  episodes,
  writingLab,
  chats,
  chatSources,
  chatDocuments,
  chatCanon,
  chatCharacters,
  chatEpisodes,
  chatMessages,
  flanaganAnalyses,
  listUnsorted,
  listArchivedUnsorted,
  getUnsorted,
  createUnsorted,
  updateUnsorted,
  deleteUnsorted,
  archiveUnsorted,
  restoreUnsorted,
  canonImport,
  sessionLogs,
};
