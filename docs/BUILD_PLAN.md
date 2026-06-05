# Revival Studio — Build Plan

One concept per phase. Each phase = one Claude Code session, ideally short.

**Phase completion ritual:** Claude Code finishes → user runs smoke test → user reports pass → commit + push → user says "go" → next phase. No exceptions.

**Polish log:** Add observations to `POLISH_NOTES.md` during every smoke test. Polish phases consume that log.

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

### PR1 — Reshape: settings ✅
### PR2 — Reshape: unsorted + documents + source_material ✅
### PR3 — Reshape: chats + chat_source_attachments ✅
### PR4 — Reshape: open_questions + conflicts + decisions ✅
### PR5 — Reshape: brainstorm + research ✅
### PR6 — Reshape: characters + episodes + writing_lab ✅

---

## UI Foundation

### PUI1 — Two-column layout component
- Reusable left-list / right-detail component dropped into every workspace
- Left: title, type/status badge, preview line
- Right: full content, editable, actions
- Retrofit all existing workspaces (Unsorted, Open Questions, Conflicts, Decisions, Brainstorm, Research, Characters, Episodes, Documents, Source Material, Writing Lab)
- **Smoke:** Open every workspace, confirm two-column layout, click an entry, detail panel opens

### PUI2 — Full-screen popout window
- Global popout available from any entry detail panel
- Full edit, rename, delete, archive/restore all available within the popout
- Independent window — rest of app remains usable
- Opens in Reference Mode by default (see PCBREF for Canon Bible; same principle applies)
- **Smoke:** Open a popout from three different workspaces, edit and save from within it, confirm changes persist

### PUI3 — Highlight + extract + route
- Select any text in a detail panel or popout → extract menu appears
- Route extracted text to: Unsorted, Brainstorm, Open Questions, Decisions, Conflicts, Research, Canon Review
- Creates a new entry in the target workspace pre-filled with the selection and a source attribution
- **Smoke:** Highlight text in a Source Material entry, route to Brainstorm, confirm new entry exists with attribution

---

## Quick Capture + Navigation

### PCAP — Global quick-capture
- Cmd+Shift+N from anywhere opens a minimal modal
- Title + body, one-click save → drops to Unsorted
- Dismissable with Escape
- **Smoke:** Trigger from three different workspaces, save an entry, confirm it appears in Unsorted

### PKEY — Command palette + keyboard navigation
- Cmd+K opens command palette: jump to any workspace, any recent entry, any action
- Full keyboard navigation throughout: tab through list items, Enter to open detail, keyboard shortcuts for approve/defer/route/archive in queues
- **Smoke:** Navigate to three workspaces, open three entries, perform two actions — all without mouse

---

## Tags

### PTAG — Tag UI ✅
- Apply and remove tags on any entry across all workspaces and canon
- Remove a tag from an entry (unlinks only; tag still exists; no confirmation needed)
- Tag picker shows seeded tags + user-created tags, grouped by category; inline "Create new tag" when search has no exact match
- Browse by tag: filter any workspace or Canon Bible by one or more tags (AND semantics)
- Tags visible as badges on list items and as chips on detail panels (and in popouts)
- **Smoke passed.**

### PTAG+ — Tag quality: autocomplete, normalization, duplicate prevention
- Tag input autocompletes against all existing tags (seeded + user-created), case-insensitive
- Tags normalized: lowercased and trimmed on save
- Creating a duplicate tag (after normalization) is blocked; input selects existing tag instead
- Clear all tags from a single entry (bulk remove on that entry only; no global effect)
- **Smoke:** Type a partial tag name and confirm autocomplete; try to create a duplicate with different casing and confirm it's blocked; clear all tags from one entry and confirm others are untouched

### PTAGDEL — Tag delete + rename (user-created tags only)
- Delete a user-created tag: shows usage count before confirmation ("used on N entries across X workspaces"); on confirm, tag unlinked from all entries and deleted; seeded tags have no delete affordance
- Rename a user-created tag: renames in place across all entries; no unlinking
- **Smoke:** Delete a user-created tag used on 3+ entries, confirm usage count shown, confirm tag gone from all entries after delete; rename a tag, confirm new name appears everywhere; confirm seeded tags show no delete option

---

## Search

### PSEARCH — Global search
- Search across all workspaces, canon entries, chats, tags
- Filterable by: workspace, entry type, tag, canon status, lock status
- Results grouped by source
- **Smoke:** Search a term that exists in three different workspaces, confirm results from each; filter by workspace, confirm narrowing

---

## Home + Navigation upgrades

### PHOME — Home upgrade
- Nav badge counts: Unsorted (total active), Canon Review (pending proposals), Open Questions (open tier-1)
- Recently viewed: last 8 entries opened across any workspace, session-persistent, one-click return
- **Smoke:** Open 8 entries across different workspaces, confirm recently viewed list; confirm badge counts match reality

---

## Passive UI layer

### PPASSIVE — Status bar + linked entries indicator
- Thin persistent status bar at bottom of every detail panel: workspace, entry type, created date, last edited, lock status
- Linked entries indicator on every detail panel: passive count ("3 attachments / 2 canon links"), expandable on click
- **Smoke:** Open entries with and without links, confirm counts are correct and expandable

---

## Canon Bible UI

### P32 — Canon entries: create + edit
- Entry-type picker (all 18 types from schema)
- Detail table fields rendered per entry type
- **Smoke:** Create one entry of three different types, edit each, changes persist

### P33 — Canon lock / unlock
- Lock = currently accepted, edits still allowed but warn user
- Deliberate mode switch required to edit locked entries
- **Smoke:** Lock an entry, attempt edit, warning appears, proceed, change saved; unlock and edit without warning

### P34 — Canon supersede + retired section
- Superseding creates new entry, marks prior retired, sets chain pointers
- Retired entries visible in collapsed section with full prior content
- **Smoke:** Supersede an entry, find old version in collapsed retired section, confirm chain is navigable

### P35 — Canon Review queue
- Two-column layout: left = proposal list with status badges; right = full proposed content
- Edit proposed content before approving
- Actions: Approve / Send Back / Defer / Delete / Reject
- Deferred proposals collapse to bottom section
- Filter by status (pending / sent back / deferred)
- Full edit and actions available in popout
- **Smoke:** Submit a proposal, edit it in queue, approve it, confirm it appears in Canon Bible; defer one, confirm it collapses; filter by status

### P35b — Canon Bible filter + browse
- Filter Canon Bible by: entry type, tag, lock status, character, season
- Filters combinable
- **Smoke:** Filter by entry type, confirm results; combine with tag filter, confirm narrowing

### PCBREF — Canon Bible reference mode
- Default mode on Canon Bible page: read-only, no edit affordances, clean layout
- Edit Mode toggle (top right): deliberate switch, reveals all edit affordances
- Popout has independent mode state
- **Smoke:** Confirm Canon Bible opens in Reference Mode; toggle Edit Mode, confirm affordances appear; open popout, confirm independent state

### PHIST — Canon entry version history
- Walk back through supersede chain from any canon entry
- View prior versions side by side with current
- **Smoke:** Supersede an entry twice, walk back through all three versions, view two side by side

### PCONFLICT — Conflict detection UI
- Surface canon entries that appear to contradict each other
- Route flagged pairs to Conflicts workspace or Canon Review
- Runs on demand, not automatically
- **Smoke:** Create two contradicting entries, run conflict detection, confirm pair is surfaced, route to Conflicts

---

## Cross-workspace wiring

### P36 — Cross-workspace attachments: picker + linked view
- "Attached" section on Characters and Episodes entries
- Picker attaches resolved items from Decisions, Open Questions, Conflicts, Brainstorm, Research
- Link-don't-copy: references with click-through to original
- Bi-directional visibility
- **Smoke:** Attach a Decision to a Character, see it on the Character page, click through, see back-reference; unlink, confirm original untouched

### P37 — Characters: relational view
- Visual showing how characters connect (relationships, factions, arcs, conflicts)
- **Smoke:** Define a relationship between two characters, see it in relational view

### P38 — Characters/Episodes → Canon Review
- Propose a canon change from a Character or Episode entry
- Lands in Canon Review queue
- **Smoke:** Propose from a Character, see it in Canon Review, approve it, confirm in Canon Bible

---

## Writing Lab → Canon

### PWLAB — Writing Lab → Canon Review connection
- From any Writing Lab draft, select text or use an action to propose a canon change
- Proposal lands in Canon Review with source attribution to the draft
- **Smoke:** Propose from a draft, confirm it appears in Canon Review with attribution

---

## UI Polish (pre-import)

### PPOL1 — UI Polish: pre-import
- Work through all items logged in `POLISH_NOTES.md` up to this point
- No new features. Fixes, consistency, rough edges only.
- **Smoke:** Every item in POLISH_NOTES.md marked resolved

---

## Safety + Export

### P20v2 — Panic Export v2
- Extend existing Panic Export to include canon tables, tags, proposals
- **Smoke:** Run export, confirm output includes canon entries, tags, proposals

### PEXPORT — Canon Bible export
- Clean readable export of approved canon by entry type / character / season
- Output formats: markdown and PDF
- **Smoke:** Export by character, confirm output contains only that character's canon entries in readable format

---

## Import

### PImp1 — Worldbuilding file import
- File picker points at worldbuilding files folder
- Parser reads and stages entries as pending proposals in Canon Review
- Conflict flagging before staging: entries that appear to contradict existing canon are flagged
- Source attribution on every proposal (which file it came from)
- **Smoke:** Point at one worldbuilding file, confirm proposals appear in Canon Review with source attribution; confirm a known contradiction is flagged

### PImp2 — Import review tools
- Filter Canon Review by entry type during import
- Keyboard navigation through queue (tab, approve, defer without mouse)
- Bulk defer by category
- Bulk approve by category (requires explicit confirmation)
- **Smoke:** Bulk defer all entries of one type, confirm they collapse; keyboard-navigate through 10 entries approving each

---

## UI Polish (pre-AI)

### PPOL2 — UI Polish: pre-AI
- Work through all items logged in `POLISH_NOTES.md` since PPOL1
- No new features. Fixes, consistency, rough edges only.
- **Smoke:** Every item in POLISH_NOTES.md marked resolved

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
- Claude-proposed structured canon changes land in Canon Review (never directly in Canon Bible)
- **Smoke:** Ask Claude to propose a canon addition, confirm it appears in Canon Review, approve it, confirm in Canon Bible

### P42 — AI canon search assistant
- Natural language queries against approved canon ("what does Jordan know about the virus at S2E1?")
- Returns grounded answers with source citations (T-code, canon entry)
- Reads only approved canon_entries — no hallucination from general knowledge
- **Smoke:** Ask a question answerable from seeded canon, confirm answer cites the correct entry

### P43 — AI conflict detector
- On demand before approving a canon proposal: Claude reviews it against existing locked entries and flags contradictions
- User still approves or ignores the flag
- Never runs automatically
- **Smoke:** Submit a proposal that contradicts a locked entry, run conflict check, confirm flag appears with the conflicting entry cited

### P44 — AI draft assistant in Writing Lab
- Claude can see active Writing Lab draft and attached sources
- Assists with scene drafting, dialogue, continuity checks
- Suggestions only — nothing writes to canon without Canon Review
- **Smoke:** Open a draft with attached source, ask Claude a continuity question, confirm response references the source

### P45 — AI import assistant
- During PImp, Claude suggests entry type and field mapping for ambiguous worldbuilding file entries
- Flags entries that look like duplicates of existing proposals
- User reviews and approves every suggestion before it stages
- **Smoke:** Import an ambiguous entry, confirm Claude suggests a type, confirm suggestion is editable before accepting

### P46 — AI open questions analyst
- Given an open question and its options, Claude applies the Flanagan filter and gives a recommendation with reasoning
- No auto-resolution — user decides
- Available as an action from any Open Questions entry
- **Smoke:** Open a tier-1 question with options A and B, request analysis, confirm Claude returns a reasoned recommendation referencing the Flanagan filter

---

## Deferred (P47+)

Held until base is stable: chat search, chat pop-out, chat export, additional Source file types, performance, themes.
