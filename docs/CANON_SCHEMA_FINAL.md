# REVIVAL STUDIO — P30 CANON SCHEMA (FINAL / RESOLVED)

**Stage:** P30 design only. No SQL. No code. Requires explicit written approval before P31.
**Status of this document:** This is the *resolved* schema. Every Section 11 open question (SQ-1 … SQ-17) has been answered per user decision. Three additions not in the original proposal — the tags system, the seed tag list, and the first-class downstream-corrections table — are integrated. Table count is now **42**.
**Authority:** Structure is derived from the worldbuilding files. Worldbuilding *content* is not seeded into the schema. The only seed data anywhere is the tag library (§Tags). Canon content enters via the app after approval — never baked into migrations.

> **Resolution legend**
> ✅ DECIDED — locked by user decision in the handoff.
> ⚖️ JUDGMENT CALL — a detail the decisions implied but did not state explicitly; I made the call and flagged it here for your eyes. These are the only places you need to scan for surprises.

---

## SECTION 1 — BIBLE-PASS AUDIT

Unchanged from the proposal. 36 record types identified across the worldbuilding files; field candidates per type; verbatim ID/tagging conventions; immutable presentation markers; flagged contradictions for in-app Canon Review.

Two resolutions land against §1 material:

- **Status-vocabulary contradictions (§1.5).** Resolved structurally by the normalized status model on `canon_entries` (lock/provisional/retired booleans + `canon_status`/`certainty`/`review_state` triplet) confirmed under **SQ-8**. Legacy values map into that model on import; the individual contradictions (Diane fate framing, Step 5 inversion, Marta/Danny retired residue, Q-006/Q-008 drift, Q-014 partial lock, "cure window" stale terminology) remain Canon-Review items, not schema-time decisions.
- **"Cure window" stale-terminology surfacing (§1.5).** ⚖️ JUDGMENT CALL: no dedicated banned-term table is added at P30. Stale-terminology warnings during edits are deferred to a later phase. For P30 the need is met informally by tagging affected entries `locked-by-design` / `needs-confirmation` (see Tags). Flagged so you can override if you want a `canon_glossary_flags` table now.

---

## SECTION 2 — TABLE LIST

**Total: 42 tables.** (40 from the proposal + `tags` + `taggable_tags`.) Grouped by purpose. snake_case.

### Workspace-entity tables (working surfaces — not canon)
1. `chats`
2. `chat_messages`
3. `chat_source_attachments`
4. `writing_lab_drafts`
5. `source_material`
6. `documents`
7. `characters_workspace`
8. `episodes_workspace`
9. `unsorted_items`
10. `open_questions`
11. `open_question_options`
12. `conflicts`
13. `decisions`
14. `brainstorm_items`
15. `research_items`

### Canon-Bible tables
16. `canon_entries` — typed spine of the Bible
17. `canon_entry_legacy_ids` — T/Q/A/CF/C/LINE/REL/PHASE/SLOT/UQ/OQ/NEW-B/ANCHOR codes, verbatim, multiple per entry
18. `canon_entry_relationships` — typed edges between canon entries
19. `canon_characters`
20. `canon_episodes`
21. `canon_seasons`
22. `canon_locked_lines`
23. `canon_locked_scenes`
24. `canon_locked_decisions`
25. `canon_knowledge_states`
26. `canon_timeline_events`
27. `canon_viral_phases`
28. `canon_virus_rules`
29. `canon_institutions`
30. `canon_locations`
31. `canon_motifs`
32. `canon_themes`
33. `canon_production_rules`
34. `canon_principles`
35. `canon_rewatch_beats`
36. **`canon_downstream_corrections`** — ✅ NEW (SQ-4). First-class child of `canon_locked_decisions`.

### Canon Review queue
37. `canon_proposals`

### Cross-workspace attachments (polymorphic)
38. `cross_workspace_attachments`

### Provenance
39. `sources`
40. `sessions`

### System
41. `settings`

### Tags (✅ NEW — SQ-8)
42a. **`tags`** — reusable tag library; hybrid (seeded set + user-created)
42b. **`taggable_tags`** — polymorphic join; tags ↔ any entity in the app

> Numbering note: the proposal's "40" plus the downstream-corrections table plus the two tag tables = **42 distinct tables**. (`canon_downstream_corrections` slots in as #36 above; `tags`/`taggable_tags` close the list.)

Tables deliberately **not** created (unchanged): no global archive table, no drafts table, no project-memory table, no provider/model abstraction table, no context-packets table, no separate Home table.

---

## SECTION 3 — COLUMNS PER TABLE

SQLite affinity types. Timestamps ISO8601 TEXT. `id INTEGER PRIMARY KEY` unless noted.

### Common lifecycle column set
Every lifecycle-enabled table carries:
```
id              INTEGER PK
created_at      TEXT NOT NULL
updated_at      TEXT NOT NULL
archived_at     TEXT NULL                  -- NULL = active; non-NULL = archived
draft_title     TEXT NULL                  -- autosave
draft_body      TEXT NULL                  -- autosave
last_drafted_at TEXT NULL
```
Restore = `archived_at → NULL`. Delete is a real DELETE. Cross-workspace attachments to a deleted row handled per §7.

### 3.1 — Workspace-entity tables
Unchanged from the proposal: `chats`, `chat_messages`, `chat_source_attachments`, `writing_lab_drafts`, `documents`, `characters_workspace`, `episodes_workspace`, `unsorted_items`, `open_question_options`, `decisions`, `brainstorm_items`, `research_items` — all as proposed.

**`source_material`** — ✅ SQ-12: `file_kind` **kept**.
```
…standard lifecycle…
title           TEXT NOT NULL
body            TEXT NOT NULL DEFAULT ''
file_kind       TEXT NOT NULL DEFAULT 'text' CHECK(file_kind IN ('text','pdf','image','other'))
file_path       TEXT NULL                  -- richer kinds deferred to P42+
```

**`open_questions`** — as proposed (status enum includes `deferred`).
**`conflicts`** — as proposed (status enum: open/resolved/retired/closed/unresolved).

> ✅ SQ-13: `documents` and `unsorted_items` stay **separate tables**. Not folded.

### 3.2 — Canon Bible tables

**`canon_entries`** — ✅ SQ-1 and SQ-8 both land here.
```
id              INTEGER PK
created_at      TEXT NOT NULL
updated_at      TEXT NOT NULL

entry_type      TEXT NOT NULL CHECK(entry_type IN (
                  'character','season','episode','locked_scene','locked_line',
                  'locked_decision','knowledge_state','timeline_event',
                  'viral_phase','virus_rule','institution','location',
                  'motif','theme','production_rule','principle','rewatch_beat',
                  'relationship'
                ))

title           TEXT NOT NULL
body            TEXT NULL

-- ✅ SQ-1: NO draft_body / draft_title on canon_entries.
--    All canon changes flow through canon_proposals. There is no direct-edit autosave path on canon.

-- Lock state
locked          INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1))
locked_at       TEXT NULL
locked_label    TEXT NULL

-- Supersede chain
retired         INTEGER NOT NULL DEFAULT 0 CHECK(retired IN (0,1))
retired_at      TEXT NULL
replaces_entry_id    INTEGER NULL  FK -> canon_entries.id  ON DELETE SET NULL
replaced_by_entry_id INTEGER NULL  FK -> canon_entries.id  ON DELETE SET NULL

-- Provisional + status triplet  (✅ SQ-8: all six kept as separate signals)
provisional     INTEGER NOT NULL DEFAULT 0 CHECK(provisional IN (0,1))
canon_status    TEXT NOT NULL DEFAULT 'draft'
                  CHECK(canon_status IN ('draft','speculative','implied','provisional','confirmed','retired','struck'))
certainty       TEXT NULL CHECK(certainty IN ('low','medium','high'))
review_state    TEXT NULL CHECK(review_state IN
                  ('placement_ready','needs_review','unresolved','deferred','re_confirmation_flagged','open_for_revision'))

-- Provenance
origin_kind     TEXT NULL CHECK(origin_kind IN
                  ('characters_workspace','episodes_workspace','open_questions','conflicts',
                   'decisions','brainstorm_items','research_items','unsorted_items',
                   'documents','source_material','writing_lab_drafts','chat','manual','import'))
origin_entry_id INTEGER NULL
origin_session_id INTEGER NULL  FK -> sessions.id  ON DELETE SET NULL
origin_lock_code  TEXT NULL

INDEX(entry_type) / INDEX(locked) / INDEX(retired)
INDEX(replaced_by_entry_id) / INDEX(origin_kind, origin_entry_id)
```

**`canon_entry_legacy_ids`** — ✅ SQ-3 and SQ-6 land here.
```
id              INTEGER PK
canon_entry_id  INTEGER NOT NULL  FK -> canon_entries.id  ON DELETE CASCADE
scheme          TEXT NOT NULL
code            TEXT NOT NULL
is_primary      INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1))
parent_code     TEXT NULL
alias_of_code   TEXT NULL          -- ✅ SQ-6: aliases live HERE, not in canon_entry_relationships
note            TEXT NULL
created_at      TEXT NOT NULL
UNIQUE(scheme, code)
INDEX(canon_entry_id) / INDEX(parent_code)
```
> ✅ SQ-3 (supersede behavior): on supersede, legacy codes **migrate to the new row** (`canon_entry_id` re-pointed, `is_primary=1`). The retired row keeps **copies** of those codes marked `is_primary=0`, so historical search still resolves to the retired version. This means a `(scheme, code)` value can exist on both the current and retired rows — therefore `UNIQUE(scheme, code)` is **relaxed** to `UNIQUE(scheme, code, canon_entry_id)`. ⚖️ JUDGMENT CALL: this relaxation is required to satisfy SQ-3-with-copies; the "a code re-issued is an integrity error" guarantee is now enforced at the `is_primary=1` level instead (app/trigger ensures at most one primary row per `(scheme, code)`). Flagged because it changes the proposal's stated uniqueness rule.

**`canon_entry_relationships`** — unchanged. (Note: `alias` is intentionally **not** a relation value — SQ-6 keeps aliases on the legacy-ids table.)

**`canon_characters`** — ✅ SQ-16 and SQ-17 land here.
```
canon_entry_id  INTEGER PK  FK -> canon_entries.id  ON DELETE CASCADE
full_name       TEXT NOT NULL
display_name    TEXT NOT NULL
role            TEXT NULL
dossier_tier    TEXT NOT NULL DEFAULT 'holding' CHECK(dossier_tier IN ('full','holding','locked_unnamed'))
age_at_series_start INTEGER NULL
demographics    TEXT NULL
sobriety_at_open TEXT NULL
absolute_exclusions TEXT NULL     -- ✅ SQ-17: free-text on the character. Renee's "never learns" lives here.
biography       TEXT NULL
arc_resolution  TEXT NULL
shadow_doc_entry_id INTEGER NULL  FK -> canon_entries.id  ON DELETE SET NULL
```
> ✅ SQ-16 (Pat & provisional named characters): handled with `dossier_tier='holding'` + `canon_entries.provisional=1` + a legacy Q-code reference (e.g. Q-013) on `canon_entry_legacy_ids`. No dedicated columns added.

**`canon_seasons`**, **`canon_episodes`**, **`canon_locked_scenes`**, **`canon_timeline_events`**, **`canon_viral_phases`**, **`canon_virus_rules`**, **`canon_institutions`**, **`canon_locations`**, **`canon_motifs`**, **`canon_production_rules`**, **`canon_principles`**, **`canon_rewatch_beats`** — unchanged from the proposal.

**`canon_locked_lines`** — ✅ SQ-7: four-value `line_state` confirmed.
```
…as proposed…
line_state      TEXT NOT NULL DEFAULT 'locked'
                  CHECK(line_state IN ('locked','texture_locked_words_open','architecture_locked','open'))
line_text       TEXT NULL          -- NULL when words open
…
```

**`canon_themes`** — ✅ SQ-14: Spines stay inside this table.
```
canon_entry_id  INTEGER PK  FK -> canon_entries.id  ON DELETE CASCADE
theme_kind      TEXT NOT NULL CHECK(theme_kind IN ('theme','buried_truth','spine','core_question','argument'))
register        TEXT NULL CHECK(register IN ('system','self','both'))
statement       TEXT NULL
spoken_in_show  INTEGER NOT NULL DEFAULT 0 CHECK(spoken_in_show IN (0,1))
```
> ✅ SQ-14: Spine 1/2/3 are `entry_type='theme'` + `theme_kind='spine'`. No separate spine table.

**`canon_knowledge_states`** — ✅ SQ-5: season-point locked to controlled vocab.
```
id              INTEGER PK
character_entry_id INTEGER NOT NULL  FK -> canon_entries.id  ON DELETE CASCADE
season_point    TEXT NOT NULL CHECK(season_point IN (
                  'PRE_SERIES','PRE_SERIES_REVIVAL',
                  'S1E1','S1E2','S1E3_S1E7','S1E8',
                  'S2E1','S2E2_S2E6','S2E7','S2E8',
                  'S3E1_S3E5','S3E6','S3E7_S3E8'
                ))
knowledge_item  TEXT NOT NULL
state           TEXT NOT NULL CHECK(state IN ('knows','does_not_know','learns','open','never'))
note            TEXT NULL
related_line_code TEXT NULL
created_at TEXT NOT NULL / updated_at TEXT NOT NULL
INDEX(character_entry_id, season_point)
```
> ✅ SQ-5: per-character season-point variants are normalized into this single vocabulary on import. No per-character override. ⚖️ JUDGMENT CALL: `PRE_SERIES_REVIVAL` is retained alongside `PRE_SERIES` inside the locked vocabulary (rather than collapsing the two) because both appear in the ledger and may be semantically distinct; collapsing can happen in-app later if they prove identical.

**`canon_locked_decisions`** — ✅ SQ-4: prose `downstream_corrections` column **removed**; replaced by child table.
```
canon_entry_id  INTEGER PK  FK -> canon_entries.id  ON DELETE CASCADE
code            TEXT NOT NULL UNIQUE
scheme          TEXT NOT NULL CHECK(scheme IN ('T','A','CF'))
parent_code     TEXT NULL
session_id      INTEGER NULL  FK -> sessions.id  ON DELETE SET NULL
session_date    TEXT NULL
body            TEXT NOT NULL
supersedes_text TEXT NULL
confirms_text   TEXT NULL
-- downstream_corrections  REMOVED  (✅ SQ-4 → moved to canon_downstream_corrections)
duplicates_closed TEXT NULL
categorical_section INTEGER NULL
```

**`canon_downstream_corrections`** — ✅ NEW (SQ-4).
```
id              INTEGER PK
created_at      TEXT NOT NULL
updated_at      TEXT NOT NULL
canon_entry_id  INTEGER NOT NULL  FK -> canon_entries.id  ON DELETE CASCADE
correction_text TEXT NOT NULL
completed       INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1))
completed_at    TEXT NULL
ordinal         INTEGER NOT NULL
INDEX(canon_entry_id, completed)
```
> UI: active corrections shown by default; completed ones collapse at the bottom — same archive/retire pattern used everywhere. ⚖️ JUDGMENT CALL: FK targets `canon_entries.id` (matching the handoff text "child of `canon_locked_decisions`," whose PK *is* `canon_entry_id`). Functionally identical; named against `canon_entries` for FK clarity.

### 3.3 — Canon Review queue
**`canon_proposals`** — unchanged from the proposal (incl. `source_kind`, `proposal_intent`, `proposed_fields_json`, status lifecycle). ✅ SQ-10: **no** revision-history child table for P30 — sent-back proposals overwrite in place.

### 3.4 — Cross-workspace attachments
**`cross_workspace_attachments`** — ✅ SQ-2: host and source kinds **extended**.
```
id              INTEGER PK
created_at      TEXT NOT NULL
host_kind       TEXT NOT NULL CHECK(host_kind IN
                  ('characters_workspace','episodes_workspace',
                   'decisions','open_questions','conflicts'))     -- ✅ SQ-2 extension
host_id         INTEGER NOT NULL
source_kind     TEXT NOT NULL CHECK(source_kind IN
                  ('decisions','open_questions','conflicts','brainstorm_items','research_items',
                   'source_material'))                             -- ✅ SQ-2: source_material added
source_id       INTEGER NOT NULL
note            TEXT NULL
UNIQUE(host_kind, host_id, source_kind, source_id)
INDEX(host_kind, host_id) / INDEX(source_kind, source_id)
```
> ✅ SQ-2: the extension is **optional, not required** — Characters/Episodes attaching the original five sources remains the core P36 use; decisions/open_questions/conflicts as hosts and source_material as a source are permitted but never mandatory. One polymorphic table does all attachment work; the parallel `source_references` alternative is rejected.
> ⚖️ JUDGMENT CALL: with `decisions`/`open_questions`/`conflicts` now able to be *both* host and source, the app should prevent self-attachment (a decision attaching itself) and is free to allow decision↔decision links. The `UNIQUE` + triggers don't forbid same-kind links; a same-row self-link guard is **app-level**. Flagged.

### 3.5 — Provenance
**`sources`** — unchanged. ✅ SQ-15: authority hierarchy stays as metadata here (`authority_tier`, `current_authority_state`); per-file declarations are **not** modeled as relational rows.
**`sessions`** — unchanged.

### 3.6 — System
**`settings`** — ✅ SQ-11: dismissed-suggestion state is a JSON column here.
```
id              INTEGER PK CHECK(id = 1)
project_rules   TEXT NOT NULL DEFAULT ''
claude_api_key  TEXT NULL                     -- P39, local only
home_dismissed_suggestions_json TEXT NOT NULL DEFAULT '[]'   -- ✅ SQ-11
created_at TEXT NOT NULL / updated_at TEXT NOT NULL
```

### 3.7 — Tags (✅ NEW — SQ-8)

**`tags`**
```
id              INTEGER PK
created_at      TEXT NOT NULL
updated_at      TEXT NOT NULL
name            TEXT NOT NULL UNIQUE          -- kebab-case; e.g. "canon-candidate"
category        TEXT NULL                     -- grouping label; e.g. "Status / Review Signals"
is_seed         INTEGER NOT NULL DEFAULT 0 CHECK(is_seed IN (0,1))   -- 1 = seeded at launch
```

**`taggable_tags`** (polymorphic join)
```
id              INTEGER PK
created_at      TEXT NOT NULL
tag_id          INTEGER NOT NULL  FK -> tags.id  ON DELETE CASCADE
entity_kind     TEXT NOT NULL                 -- table name; e.g. 'canon_entries','unsorted_items','decisions'
entity_id       INTEGER NOT NULL
UNIQUE(tag_id, entity_kind, entity_id)
INDEX(entity_kind, entity_id) / INDEX(tag_id)
```
> Tags apply to **all** entities across the app — canon entries, every workspace item, proposals, sources, sessions. Hybrid model: freeform tags the user types are saved and become reusable; a seeded starter set loads at first launch.
> ⚖️ JUDGMENT CALL: `entity_kind` is **not** CHECK-constrained to an enum (unlike the attachment table's kinds), because tags are meant to apply universally and new taggable tables shouldn't require a migration. Integrity of `entity_kind`/`entity_id` is left to the app — a deliberate looseness consistent with "tags apply to everything." Flagged in case you want a CHECK list instead.

---

## TAGS — SEED LIST (✅ NEW — SQ-8)

Seeded at first launch via one idempotent seed migration (P31, file `027_seed_tags`). `is_seed=1` on all. User can add/edit/delete any tag after launch. Re-running the migration is a no-op if the table already has rows. **134 tags** across the categories below. The `category` column stores the group label shown here.

**Canon & Story** — character, relationship, episode, season, timeline, location, institution, motif, theme, spine, virus-rule, viral-phase, treatment, physical-marker, production-rule, flanagan-principle, locked-line, locked-scene, locked-decision, rewatch-beat, knowledge-state

**Status / Review Signals** — canon-candidate, needs-review, provisional, confirmed, retired, superseded, struck, flagged, open, resolved, deferred, possible-duplicate, possible-conflict, confirmed-conflict, possible-canon, possible-question, possible-decision

**Workflow / Routing** — send-to-canon-review, send-to-unsorted, route-to-decisions, route-to-open-questions, route-to-conflicts, route-to-brainstorm, route-to-research, route-to-documents

**Creative Work** — brainstorm, what-if, scene-concept, dialogue, character-arc, plot-logic, continuity, contradiction, conflict, decision, open-question

**Characters** — megan, caroline, diane, jordan, marcus, ray, renee

**Seasons** — s1, s2, s3

**NA / Recovery** — na-fellowship, sponsorship, step-work, meeting, sobriety, relapse, recovery-house

**Virus / Biology** — phase-1, phase-2, phase-3, phase-4, phase-5, transmission, susceptibility, arrest-treatment, 72-hour-window, proximity-seeking

**Episode Structure** — opening-register, closing-image, rewatch-seed, title-open, title-locked, title-option-a, title-option-b, absolute-exclusion, standing-lock

**Relationships** — sponsor-sponsee, mother-daughter, mother-son, chain-of-care, estranged-repair, institutional-ally, institutional-adversary, professional-partnership, grief-carrier, recovery-family, architect-subject

**Writing / Craft** — style-note, flanagan-filter, camera-rule, score-rule, mirror-imagery, two-scene-rule, diegetic-time, non-negotiable

**Diane / Shadow Discipline** — diane-shadow, ambiguity-discipline

**Provenance / Audit** — t-code, q-code, a-code, cf-code, audit-pass, downstream-correction, supersedes-prior, dead-archive

**Uncertainty Markers** — needs-confirmation, inconsistent, gap, placeholder, locked-by-design, intentionally-absent

**Source / Provenance** — source-backed, session-note, ai-suggested, imported, manual-entry

---

## SECTION 4 — FOREIGN KEYS / RELATIONSHIPS

All proposal FKs stand. Additions/changes from the resolution:

- `canon_downstream_corrections.canon_entry_id` → `canon_entries.id` **CASCADE**.
- `taggable_tags.tag_id` → `tags.id` **CASCADE**. (No FK on `entity_id` — polymorphic; app-enforced.)
- `cross_workspace_attachments` host/source FKs remain trigger-enforced (no native polymorphic FK), now over the **extended** kind lists (SQ-2).
- `canon_locked_decisions` loses no FK from the SQ-4 change (the dropped column was prose, not a key).
- The dual character↔character relationship structures (entry_type='relationship' canon row vs. ad-hoc `canon_entry_relationships` edges) are retained exactly as in the proposal.

ON DELETE behaviors continue to honor "link, don't copy" and "unlink never touches the original."

---

## SECTION 5 — CANON ENTITY TAXONOMY

Eighteen `entry_type` values, unchanged. `knowledge_state`, `rewatch_beat`, and `relationship` remain non-1:1 (their data lives in `canon_knowledge_states` / `canon_rewatch_beats` / `canon_entry_relationships`; the `canon_entries` row still carries lock/supersede/legacy-id/provenance so those behaviors are uniform). Single-spine rationale unchanged.

---

## SECTION 6 — LIFECYCLE STATES

- **Archive (workspaces):** `archived_at` NULL/non-NULL; collapsed in-page section; no global archive.
- **Lock (canon):** `locked` + `locked_at` + `locked_label`. ✅ Lock = currently accepted, editable-with-warning, not immutable.
- **Supersede + retire (canon):** original row `retired=1` + `replaced_by_entry_id`; new row `replaces_entry_id`. ✅ SQ-3: legacy IDs migrate to the new row (`is_primary=1`); retired row keeps `is_primary=0` copies. Multi-supersede / split uses `canon_entry_relationships` (`supersedes`/`superseded_by`). Diane case (DIES → A-11 off-screen Completion) is the worked example; both rows persist, UI surfaces the current one with a "prior versions" affordance.
- **Autosave:** `draft_*` columns on workspace tables only. ✅ SQ-1: canon entries have **no** draft path — canon edits flow through `canon_proposals`.
- **Downstream corrections:** ✅ SQ-4 — completion tracked via the `completed` boolean on `canon_downstream_corrections`; completed items collapse, same as archive.
- **Triggers:** one BEFORE UPDATE `updated_at` trigger per lifecycle table (per SQ-9, below).

---

## SECTION 7 — CROSS-WORKSPACE ATTACHMENTS

Single polymorphic `cross_workspace_attachments` table, now with the SQ-2 extended kind lists.

✅ SQ-9 — integrity enforcement:
- **Triggers** for INSERT validity (verify `source_id` exists in `source_kind`'s table, `host_id` in `host_kind`'s table) and for DELETE cascade (deleting a workspace row removes its matching attachment rows).
- **App-level** for UPDATE sanity (re-pointing `host_id`/`source_id`), since UPDATE-side trigger logic gets unwieldy.

Behavioral rules unchanged:
- **Unlink:** DELETE the join row only; no outward cascade.
- **Original archived:** attachment persists; UI decorates with archived state (no schema column needed).
- **Original deleted:** per-source trigger removes orphan attachments (delete treated as authoritative).

---

## SECTION 8 — CANON REVIEW PROPOSALS

`canon_proposals` lifecycle unchanged: `pending → approved / rejected / sent_back`. Six `proposal_intent` values (new_entry, update_entry, supersede_entry, retire_entry, add_legacy_id, attach_relationship). Approve actions run in one transaction with the status change and, for supersede, perform the SQ-3 legacy-ID migration-with-copies. ✅ SQ-10: sent-back proposals overwrite in place; no revision-history table for P30.

---

## SECTION 9 — PROVENANCE FIELDS

Forward-facing only (canon → origin). `canon_entries` carries `origin_kind` / `origin_entry_id` / `origin_session_id` / `origin_lock_code`. ✅ SQ-15: source authority hierarchy is metadata on `sources`, not relational rows. ✅ SQ-2 reconciles the "decisions/open-questions/conflicts may reference Source Material" requirement via the extended `cross_workspace_attachments` rather than a separate references table. Not audit logging — no per-edit diff table at P30 (a `canon_edit_log` remains a future option).

---

## SECTION 10 — HARMONIZING EXISTING ID CONVENTIONS

Surrogate INTEGER PKs + `canon_entry_legacy_ids` preserving every code verbatim (case, hyphens, suffixes, sub-prefixes — no transforms). `scheme` is the parsed prefix; `parent_code` denormalizes sub-code parents; ✅ SQ-6: `alias_of_code` carries cross-tracker aliases (Q-006/Q-008 drift) — aliases are **not** relationship rows. Uniqueness is enforced per the SQ-3 resolution: `UNIQUE(scheme, code, canon_entry_id)` at the table level, with at-most-one `is_primary=1` per `(scheme, code)` guaranteed by app/trigger (see the ⚖️ note under `canon_entry_legacy_ids` in §3.2).

---

## SECTION 11 — RESOLUTION SUMMARY (all SQ answered)

| SQ | Decision |
|---|---|
| SQ-1 | ✅ No draft column on canon. All canon changes via `canon_proposals`. |
| SQ-2 | ✅ Extend attachment host_kind to add decisions/open_questions/conflicts; add source_material as a source. Optional, not required. |
| SQ-3 | ✅ Migrate legacy IDs to the new row on supersede; retired row keeps `is_primary=0` copies for historical search. (→ uniqueness relaxed to `(scheme, code, canon_entry_id)`.) |
| SQ-4 | ✅ First-class `canon_downstream_corrections` child table; remove prose column. Completed items collapse. |
| SQ-5 | ✅ Lock `season_point` to the controlled vocabulary via CHECK. |
| SQ-6 | ✅ Keep `alias_of_code` on `canon_entry_legacy_ids`. |
| SQ-7 | ✅ Four-value `line_state`: locked / texture_locked_words_open / architecture_locked / open. |
| SQ-8 | ✅ Add hybrid tags system (`tags` + `taggable_tags`) + 134 seed tags. Keep all six status signals on `canon_entries`. |
| SQ-9 | ✅ Triggers for INSERT validity + DELETE cascade; app-level for UPDATE. |
| SQ-10 | ✅ Defer proposal revision history; overwrite on send-back. |
| SQ-11 | ✅ Dismissed-suggestion state as JSON column on `settings`. |
| SQ-12 | ✅ Keep `file_kind` on `source_material`. |
| SQ-13 | ✅ `documents` and `unsorted_items` separate tables; do not fold. |
| SQ-14 | ✅ Spines stay `theme` + `theme_kind='spine'`. |
| SQ-15 | ✅ Authority hierarchy as metadata on `sources`. |
| SQ-16 | ✅ Provisional named characters: `dossier_tier='holding'` + `provisional=1` + legacy Q-code. |
| SQ-17 | ✅ Absolute exclusions free-text on `canon_characters`. |

**Judgment calls flagged for your review** (the only non-explicit decisions I made):
1. `canon_entry_legacy_ids` uniqueness relaxed to `(scheme, code, canon_entry_id)` to allow SQ-3 retired-row copies; single-primary enforced by app/trigger. (§3.2, §10)
2. No banned-term/`canon_glossary_flags` table at P30 for stale "cure window" terminology; deferred. (§1)
3. `PRE_SERIES_REVIVAL` retained alongside `PRE_SERIES` in the locked vocab rather than collapsed. (§3.2 knowledge_states)
4. `canon_downstream_corrections` FK named against `canon_entries.id` (= the locked_decisions PK). (§3.2)
5. `taggable_tags.entity_kind` deliberately **not** CHECK-constrained (tags apply universally). (§3.7)
6. Same-kind self-attachment in `cross_workspace_attachments` guarded at app level, not by constraint. (§3.4)

---

## SECTION 12 — MIGRATION ORDER

P31 writes one migration file per step. Order respects dependencies. **Changes from the proposal: two inserts** — `canon_downstream_corrections` after the canon detail tables, and `tags`/`taggable_tags` near the end, plus the `027_seed_tags` seed migration.

1. `001_sessions`
2. `002_sources`
3. `003_settings`
4. `004_canon_entries`
5. `005_canon_entry_legacy_ids`
6. `006_canon_entry_relationships`
7. `007_canon_detail_tables` (the fifteen 1:1 canon tables) — *or one file per table; pick at P31*
8. `008_canon_knowledge_states`
9. `009_canon_rewatch_beats`
10. **`010_canon_downstream_corrections`** ✅ NEW (after locked_decisions exists via step 7)
11. `011_chats` (chats + chat_messages)
12. `012_source_material`
13. `013_chat_source_attachments`
14. `014_writing_lab_drafts`
15. `015_documents`
16. `016_characters_workspace`
17. `017_episodes_workspace`
18. `018_unsorted_items`
19. `019_decisions`
20. `020_open_questions` (+ open_question_options)
21. `021_conflicts`
22. `022_brainstorm_items`
23. `023_research_items`
24. `024_canon_proposals`
25. `025_cross_workspace_attachments` (extended kinds per SQ-2)
26. **`026_tags`** ✅ NEW (tags + taggable_tags)
27. `027_lifecycle_triggers` (per-table BEFORE UPDATE `updated_at`) — *or fold into each table's migration*
28. `028_polymorphic_integrity_triggers` (cross_workspace_attachments INSERT/DELETE per SQ-9; taggable_tags left app-enforced)
29. **`029_seed_tags`** ✅ NEW — idempotent insert of the 134 seed tags (`is_seed=1`); no-op if `tags` already populated

> File numbers are indicative; renumber freely at P31 as long as dependency order holds. The seed-tags migration is the **only** migration that writes any data, and it writes tags only — no canon, no characters, no episodes. Everything else creates empty tables.

Dependencies that still matter: sessions + canon_entries first; canon_entries before its detail tables; locked_decisions (in step 7) before downstream_corrections; decisions before open_questions/conflicts; source_material before chat_source_attachments; attachments after all host/source tables; triggers last; seed-tags last of all.

---

## STOP

This is the resolved schema. No tables exist yet. No code written. All seventeen SQ open questions are decided; the tags system, seed list, and downstream-corrections table are integrated; six judgment calls are flagged in §11 for your eyes.

**Awaiting your written approval** — reply "I approve this schema" to unlock P31, or list changes (especially against the six flagged judgment calls) and I'll revise before anything is built.
