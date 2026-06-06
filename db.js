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
const conflicts = makeEntryRepo('conflicts');
const decisions = makeEntryRepo('decisions');
const brainstorm = makeEntryRepo('brainstorm_items');
const research = makeEntryRepo('research_items');
// Backed by `characters_workspace` / `episodes_workspace` (renamed from
// `characters` / `episodes` in migration 033 to match the FINAL canon schema).
// Repo variable names — and the IPC channel prefixes that consume them — are
// intentionally left as `characters` / `episodes` so renderer wiring doesn't
// need to change for a table rename. (Same pattern PR5 used for brainstorm /
// research → brainstorm_items / research_items.)
const characters = makeEntryRepo('characters_workspace');
const episodes = makeEntryRepo('episodes_workspace');

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

const canonProposals = {
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
    return getDb()
      .prepare('SELECT * FROM canon_proposals WHERE id = ?')
      .get(info.lastInsertRowid);
  },
  pendingCount: () =>
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM canon_proposals WHERE status = 'pending'`)
      .get().n,
};

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

module.exports = {
  initDatabase,
  getDb,
  exportAll,
  settings,
  dashboard,
  canon,
  canonProposals,
  tags,
  search,
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
