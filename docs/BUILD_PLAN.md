# Revival Studio — Build Plan

One concept per phase. Each phase = one Claude Code session, ideally short.

**Phase completion ritual:** Claude Code finishes → user runs smoke test → user reports pass → commit + push → user says "go" → next phase. No exceptions.

---

## Foundation

### P0 — Git connect ✅
### P1 — Electron window ✅
### P2 — Left nav placeholders ✅
### P3 — UI principle template ✅

---

## Data layer

### P4 — SQLite + migrations ✅

---

## Unsorted (the pattern workspace)

### P5 — Unsorted: create + list ✅
### P6 — Unsorted: edit ✅
### P7 — Unsorted: delete ✅
### P8 — Unsorted: archive + restore ✅
### P9 — Autosave system ✅

---

## Source Material + Documents

### P10 — Source Material CRUD ✅
### P11 — Source Material file upload ✅
### P12 — Documents CRUD ✅

---

## Chat shell (no AI)

### P13 — Chat drawer shell ✅
### P14 — Multiple chats + title dropdown ✅
### P15 — Rename + archive + restore chats ✅
### P16 — Chat expand mode ✅

---

## Chat ↔ Source attachments (still no AI)

### P17 — Attach Source: keep active mode ✅
### P18 — Attach Source: next message only + manual remove ✅

---

## Settings + Safety

### P19 — Settings: Project Rules editor ✅
### P20 — Panic Export v1 ✅

---

## Remaining queue/decision workspaces

### P21 — Open Questions ✅
### P22 — Conflicts ✅
### P23 — Decisions ✅
### P24 — Brainstorm ✅
### P25 — Research ✅

---

## Characters + Episodes

### P26 — Characters: CRUD lifecycle ✅
### P27 — Episodes: CRUD lifecycle ✅

---

## Home + Writing Lab

### P28 — Home dashboard ✅
### P29 — Writing Lab ✅

---

## Canon Bible — schema first, then build

### P30 — Canon schema design (CHECKPOINT, no code) ✅
- Completed in claude.ai (Opus). Approved schema saved as `docs/CANON_SCHEMA_APPROVED.md`.

### P31 — Canon tables + read view ✅
- 27 migrations (016–027) applied cleanly. 42 tables + 9 triggers. Dev seed button on Canon Bible page.
- **Smoke passed.**

---

## Workspace reshape — align existing tables to FINAL schema

These phases run before Canon UI. Each ALTERs existing workspace tables to match
`docs/CANON_SCHEMA_APPROVED.md` (add `draft_*` columns, renames, new FKs).
No new features. No CRUD rewrites unless a rename breaks existing code — fix only what breaks.

**Why now:** Canon UI (P32+) references workspace table names and `draft_*` columns.
Building on the old names creates patching debt across every canon phase.

### PR1 — Reshape: settings
- Rename `app_meta` → `settings`
- Add columns: `project_rules TEXT NOT NULL DEFAULT ''`, `claude_api_key TEXT NULL`, `home_dismissed_suggestions_json TEXT NOT NULL DEFAULT '[]'`
- Recreate with `CHECK(id = 1)` single-row constraint (requires table recreate in SQLite)
- Update all references from `app_meta` to `settings` in renderer + main process
- **Smoke:** App boots, Project Rules still visible and editable, value persists across restart

### PR2 — Reshape: unsorted + documents + source_material
- Rename `unsorted` → `unsorted_items`
- Add to `unsorted_items`, `documents`, `source_material`: `draft_title TEXT NULL`, `draft_body TEXT NULL`, `last_drafted_at TEXT NULL`
- Add to `source_material`: `file_kind TEXT NOT NULL DEFAULT 'text' CHECK(file_kind IN ('text','pdf','image','other'))`, `file_path TEXT NULL`
- Update all `unsorted` table references to `unsorted_items` in renderer + CRUD code
- **Smoke:** All three workspaces load, existing entries visible, create/edit/archive/restore still works

### PR3 — Reshape: chats + chat_source_attachments
- Rename `chat_sources` → `chat_source_attachments`
- Add to `chats`: `draft_title TEXT NULL`
- Update all `chat_sources` references to `chat_source_attachments`
- **Smoke:** Chat drawer opens, existing chats visible, source attach/detach still works

### PR4 — Reshape: open_questions + conflicts + decisions
- Add to `open_questions`: `draft_title TEXT NULL`, `draft_body TEXT NULL`, `last_drafted_at TEXT NULL`, `tier INTEGER NULL CHECK(tier IN (1,2,3))`, `category TEXT NULL`, `canon_promoted_entry_id INTEGER NULL`, `resolved_by_decision_id INTEGER NULL`
- Add to `conflicts`: `draft_title TEXT NULL`, `draft_body TEXT NULL`, `last_drafted_at TEXT NULL`
- Add to `decisions`: `draft_title TEXT NULL`, `draft_body TEXT NULL`, `last_drafted_at TEXT NULL`, `decided_at TEXT NULL`
- **Smoke:** All three workspaces load, existing entries visible, full lifecycle still works on each

### PR5 — Reshape: brainstorm + research
- Rename `brainstorm` → `brainstorm_items`
- Rename `research` → `research_items`
- Add to both: `draft_title TEXT NULL`, `draft_body TEXT NULL`, `last_drafted_at TEXT NULL`
- Add to `research_items`: `external_url TEXT NULL`
- Update all table name references in renderer + CRUD code
- **Smoke:** Both workspaces load, existing entries visible, full lifecycle still works

### PR6 — Reshape: characters + episodes + writing_lab
- Rename `characters` → `characters_workspace`
- Rename `episodes` → `episodes_workspace`
- Rename `writing_lab` → `writing_lab_drafts`
- Add to `characters_workspace`: `draft_title TEXT NULL`, `draft_body TEXT NULL`, `last_drafted_at TEXT NULL`, `short_description TEXT NULL`, `canon_character_id INTEGER NULL`
- Add to `episodes_workspace`: `draft_title TEXT NULL`, `draft_body TEXT NULL`, `last_drafted_at TEXT NULL`, `canon_episode_id INTEGER NULL`
- Add to `writing_lab_drafts`: `draft_title TEXT NULL`, `draft_body TEXT NULL`, `last_drafted_at TEXT NULL` (if not already present)
- Update all table name references
- **Smoke:** All three workspaces load, existing entries visible, full lifecycle still works on each

---

## Canon Bible UI

### P32 — Canon entries: create + edit
- **Smoke:** Add an entry, edit it, changes persist

### P33 — Canon lock / unlock
- Lock = currently accepted, edits still allowed but warn user
- **Smoke:** Lock an entry, attempt edit, warning appears, proceed, change saved

### P34 — Canon supersede + retired collapsed section
- Superseding marks prior version retired and visible under collapsed section
- **Smoke:** Supersede an entry, find old version in collapsed retired section

### P35 — Canon Review queue
- Approval queue for proposed changes (approve / reject / send back). No AI yet.
- **Smoke:** Manually submit a change to the queue, approve it, see it in Canon Bible

---

## Cross-workspace wiring (Characters + Episodes)

### P36 — Cross-workspace attachments: picker + linked view
- Add "Attached" section to Characters and Episodes entries
- Picker attaches resolved items from Decisions, Open Questions, Conflicts, Brainstorm, Research
- Link-don't-copy: attached items show as references with click-through to original
- Bi-directional: original item shows which Characters/Episodes it's linked to
- **Smoke:** Attach a Decision to a Character, see it on the Character page, click through to original, see back-reference on the Decision; unlink and confirm original is untouched

### P37 — Characters: relational view
- Visual showing how characters connect (relationships, factions, arcs, conflicts)
- **Smoke:** Define a relationship between two characters, see it in the relational view

### P38 — Characters/Episodes → Canon Review (manual propose, still no AI)
- From a Character or Episode entry, propose a canon change to Canon Review
- Lands in the same review queue as everything else
- **Smoke:** Propose a canon fact from a Character, see it in Canon Review, approve it, confirm it appears in Canon Bible

---

## AI integration (Claude only)

### P39 — Claude API config + request preview
- API key field in Settings (Claude only — no provider picker, no OpenAI scaffolding)
- Request preview UI shows exact payload that would be sent
- **Smoke:** Enter key, draft a message, preview shows expected payload (user msg + Project Rules + active sources, nothing else)

### P40 — Chat AI send/receive
- Send a message, receive Claude's response, display in chat
- **Smoke:** Send a message, get a response back, conversation history persists

### P41 — AI suggestion → Canon Review pipeline
- If Claude proposes a structured canon change, it lands in Canon Review (never directly in Canon Bible)
- **Smoke:** Ask Claude to propose a canon addition, confirm it appears in Canon Review, approve it, then see it in Canon Bible

---

## Deferred (P42+)

Held until base is stable: chat search, chat pop-out, chat export, expanded Panic Export, additional Source file types, performance, themes.
