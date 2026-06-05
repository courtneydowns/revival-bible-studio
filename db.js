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

const canon = {
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
    return attachLegacyIds(entries);
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
    return attachLegacyIds(entries);
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
};

module.exports = {
  initDatabase,
  getDb,
  exportAll,
  settings,
  dashboard,
  canon,
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
