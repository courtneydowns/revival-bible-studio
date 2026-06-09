# Revival Studio — Build Plan

One concept per phase. Each phase = one Claude Code session, ideally short.

**Phase completion ritual:** Claude Code finishes → user runs smoke test → user reports pass → commit + push → user says "go" → next phase. No exceptions.

**Polish log:** Add observations to `POLISH_NOTES_ONGOING.md` during every smoke test. Polish phases consume that log.

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

### PUI1 — Two-column layout component ✅
### PUI2 — Full-screen popout window ✅
### PUI3 — Highlight + extract + route ✅

---

## Quick Capture + Navigation

### PCAP — Global quick-capture ✅
### PKEY — Command palette + keyboard navigation ✅

---

## Tags

### PTAG — Tag UI ✅

---

## Search

### PSEARCH — Global search ✅

---

## Home + Navigation upgrades

### PHOME — Home upgrade ✅

---

## Passive UI layer

### PPASSIVE — Status bar + linked entries indicator ✅

---

## Canon Bible UI

### P32 — Canon entries: create + edit ✅
### P33 — Canon lock / unlock ✅
### P34 — Canon supersede + retired section ✅
### P35 — Canon Review queue ✅
### P35b — Canon Bible filter + browse ✅
### PCBREF — Canon Bible reference mode ✅
### PHIST — Canon entry version history ✅
### PCONFLICT — Conflict detection UI ✅
### PCONFLICT-2 — Auto-route detected conflicts + re-check nudges ✅
### PCONFLICT-3 — Canon Bible contradiction scan + conflict lifecycle ✅

---

## Cross-workspace wiring

### P36 — Cross-workspace attachments: picker + linked view ✅
### P37 — Characters: relational view ✅
### P38 — Characters/Episodes → Canon Review ✅

---

## Writing Lab → Canon

### PWLAB — Writing Lab → Canon Review connection ✅

---

## UI Polish (pre-import)

### PPOL1 — UI Polish: pre-import ✅

---

## Safety + Export

### P20v2 — Panic Export v2 ✅
### PEXPORT — Canon Bible export ✅

---

## Import

### PImp1 — Worldbuilding file import ✅
### PImp2 — Import review tools ✅

---

## UI Polish (pre-AI)

### PPOL2 — UI Polish: pre-AI ✅

---

## AI integration (Claude only)

### P39 — Claude API config + request preview ✅
### P40 — Chat AI send/receive ✅
### P41 — AI suggestion → Canon Review pipeline ✅
### P42 — AI canon search assistant ✅
### P43 — AI conflict detector ✅
### P44 — AI draft assistant in Writing Lab ✅
### P45 — AI import assistant ✅

---

## UI Polish (deferred items from PPOL2)

### PPOL2b — UI Polish: deferred PPOL2 items ✅

---

## AI open questions analyst — The Flanagan Filter

### P46-A — Flanagan Filter: foundation ✅
### P46-B — Flanagan Filter: save + history ✅
### P46-C — Flanagan Filter: routing + tags ✅

---

## Chat routing

### PCHAT-ROUTE — Chat: route full chat to workspace ✅
- **Known gap:** "Route entire chat" action (distinct from highlight-extract-route) is missing or broken. Expected: a button in chat toolbar routing the full transcript as a single entry with attribution. Logged in POLISH_NOTES_ONGOING.md (PCHAT-ROUTE-GAP). Fix in PPOL3 or PPOL-ONGOING.
- **Note:** Flanagan Filter on chat is not supported by design — Flanagan runs on workspace entries only. Intended workflow: route chat content to an OQ entry first, then run Flanagan on the OQ.

---

## Home upgrade

### PHOME-NEEDS — Home: Needs Attention panel ✅

---

## Undo

### PUNDO — App-level undo ✅
- Cmd+Z undo for destructive actions: archive, delete, resolve, approve, reject
- Not for autosave content edits (draft preservation already handled)
- Undo history: last 20 actions, session-only (does not persist across restarts)
- Canon Bible lock/supersede/retire excluded — those have chain history
- Visual indicator in status bar when undo is available
- **Smoke passed.**

---

## Writing Lab versioning

### PWLAB-VERSIONS — Writing Lab draft versioning ✅
- Manual "save version" action — user decides when a version is worth keeping
- Named versions (user-supplied label: "Before the Diane rewrite")
- Side-by-side diff view between any two versions
- Restore from any prior version (with confirmation)
- Version history in collapsed section on the draft entry
- **Smoke passed.**

---

## Session log

### PSESSION-LOG — Session / work log ✅
- Auto-generated log at session end (app close or explicit "end session" action)
- Records: entries created, entries approved/resolved/archived, canon changes made, analyses run — grouped by workspace
- Viewable from Settings or a dedicated log panel on Home
- Not editable — audit trail only
- Exportable as plain text
- **Smoke passed.**

---

## Open Questions enhancements

### PBLOCK — Open Questions: blocking flag + escalation ✅
- **Blocking flag:** mark a question as blocking a named episode/character/arc. Surfaces in Needs Attention panel.
- **Tier escalation:** promote Tier-2 → Tier-1 with confirmation. Escalation logged in question history.
- **Promote to Decision:** when resolved, one-click creates a linked Decision entry pre-filled with the resolution and source question. Link-don't-copy.
- **Smoke passed.**

---

## Brainstorm structure

### PBRAIN-STRUCT — Brainstorm internal structure ✅
- **Thread / cluster:** group related entries under a named thread (collapsible, one level only)
- **"Developed into" link:** mark a brainstorm entry as developed into a specific entry in another workspace. Link-don't-copy. Bi-directional.
- **Status badges:** Rough / Developing / Ready to Route — user-set
- **Smoke passed.**

---

## Chat attachment expansion

### PCHAT-ATTACH — Chat attachment expansion ✅
- Expand Chat attachment beyond Source Material to: Canon Bible entries, Characters entries, Episodes entries, Documents entries
- Same keep-active / next-message-only modes as Source Material
- Active attachments always visible — same transparency as Source Material
- Permitted list is fixed — no other workspaces attachable to Chat
- **Smoke passed.**

---

## Status fields

### PCHAR-STATUS — Character status field ✅
- Add **Active / Recurring / Departed / Deceased** status field to every Character entry
- Visible as a badge on list items and detail panel
- Filterable in Characters list
- Feeds character arc tracker and episode continuity checker
- **Smoke passed.**

### PEPISODE-STATUS — Episode status field ✅
- Add **Outline / Draft / Locked** status field to every Episode entry
- Visible as a badge on list items and detail panel
- Filterable in Episodes list
- Feeds Needs Attention panel (Outline-stage episodes surface there)
- **Smoke passed.**

---

## Audit fixes

### PAUDIT-1 — Undo apiName bug ✅
**Tool:** VS Code ext
- `apiName` resolves to `undefined` in `makeEntryWorkspace` UndoStack (renderer.js ~L1365 and ~L1477)
- Fix: replace bare `apiName` shorthand with `config.apiName` in both the archive and delete undo action objects
- **Smoke passed.**

### PAUDIT-2a — Chat response truncation fix ✅
**Tool:** VS Code ext
- `max_tokens` set to `8192` caused Claude to cut responses mid-sentence with no warning
- Fix 1: raised `max_tokens` to `32768`
- Fix 2: stop-reason detection — if `stop_reason === 'max_tokens'`, appends "⚠ Response cut short — send a follow-up to continue" in the chat bubble
- **Smoke passed.**

### PAUDIT-2b — Preview payload sync ✅
**Tool:** VS Code ext
- `buildPreviewPayload` omitted Canon Bible, Characters, and Episodes attachments that `buildSystemPrompt` included
- Fix: synced `buildPreviewPayload` to include all attachment types that `buildSystemPrompt` sends
- **Smoke passed.**

### PAUDIT-3 — Canon Bible popout + Decisions back-link ✅
**Tool:** VS Code ext
Two plain UI omissions, same file, grouped:
- **Canon Bible popout:** Add "Pop out ↗" button to Canon Bible detail panel. Popout already handles the canon path in popout.js — just needs the trigger button wired in.
- **Decisions source_question_id back-link:** When a Decision was promoted from an Open Question, `source_question_id` is stored in the DB but never rendered. Display it as a navigable back-link in the Decisions detail panel ("From question: [title]").
- **Smoke passed.**

### PAUDIT-4 — P46-B analysis lock fix ✅
**Tool:** VS Code ext
- Flanagan analyses lock when an OQ is archived, but not when it is resolved via `resolved_by_decision_id`
- A question promoted to a Decision but not yet archived still shows active re-run buttons on locked-spec analyses
- Fix: pass `item.resolved_by_decision_id` as a second lock condition alongside `archivedAtStart`
- **Smoke passed.**

### PAUDIT-5 — Omitted UI fields + Brainstorm archived threads ✅
**Tool:** VS Code ext / CLI (multi-file)
Plain implementation omissions surfaced by the audit — data exists in the DB, UI never renders it:
- **Writing Lab word count:** move from action bar to status bar (spec location). Add scene/section count to status bar (currently absent entirely).
- **Source Material file_kind / file_path:** surface both fields in the Source Material detail panel (display + editable).
- **Open Questions category field:** add display, editor, and filter for the `category` column (added in migration 031, never exposed in UI).
- **Unsorted "Route this entry" action:** add a route action button to Unsorted entry detail panels — routes to Brainstorm, Open Questions, Decisions, Conflicts, Research, Canon Review (same picker as highlight-extract-route). Spec describes Unsorted as a routing queue; no action currently exists on entries.
- **Canon Review source attribution back-link:** render source attribution (e.g. "from Characters #5") as a navigable click-through to the originating entry, not plain text.
- **Brainstorm archived threads section:** `brainstorm:threads.listArchived` IPC exists but archived threads have no UI section. Add collapsed archived threads section to Brainstorm, matching the archive pattern used across all other workspaces.
- **Smoke:** (1) Open a Writing Lab draft; confirm word count and section count both appear in status bar. (2) Open a Source Material entry; confirm file_kind and file_path visible and editable. (3) Open an Open Questions entry; confirm category field visible, editable, and filterable in list. (4) Open an Unsorted entry; confirm "Route to…" action button present; route it; confirm entry created in target workspace. (5) Open a Canon Review proposal created from a Characters entry; click source attribution; confirm navigation to the originating Character entry. (6) Archive a Brainstorm thread; confirm it appears in collapsed archived threads section; restore it.
- Smoke passed 2026-06-08. Also fixed Canon Review approve FK constraint error (invalid season/episode/character IDs now silently nulled instead of blocking with cryptic SQLite error).

### PAUDIT-6 — Research external_url + Open Questions tier setter ✅
**Tool:** VS Code ext
Two DB columns that exist but have no UI — same pattern as PAUDIT-5:
- **Research external_url:** surface the `external_url` column in the Research detail panel — display and editable. Add to list item preview line if populated.
- **Open Questions tier setter:** `tier` is shown passively in Flanagan but has no setter anywhere in the OQ entry itself. Add a tier field (Tier 1 / Tier 2 / Tier 3) to the OQ create and edit forms. PBLOCK's tier escalation action already works — this fills the gap for initial set and direct edit.
- **Smoke passed 2026-06-08.**

### PAUDIT-7 — Command palette regression fix ✅
**Tool:** CLI
PKEY was marked ✅ complete and the command palette (Cmd+K) previously worked, but the audit found it is currently not implemented — likely a regression from a later phase. Multi-file touches (global event listener, palette component, renderer wiring).
- Restore Cmd+K command palette to working state matching the original PKEY spec: jump to any workspace, recent entries, actions; full keyboard navigation; tab through list items, Enter to open
- Do not add new functionality — restore only
- **Smoke:** Cmd+K opens palette; type a workspace name, confirm it appears; press Enter, confirm navigation; tab through results with keyboard; Escape closes palette.
- **Smoke passed.**

### PAUDIT-8 — Dead IPC cleanup ✅
**Tool:** CLI
Remove dead IPC bridges confirmed by the audit as having no renderer callers. Multi-file (main.js + preload.js). Run after PAUDIT-5 — do not run before archived threads UI exists.

**Remove from both main.js and preload.js:**
- `canon:count`
- `characterRelationships:update`
- `brainstorm:threads.restore`
- `brainstorm:threads.delete`
- `brainstorm:threads.listArchived` — remove only after PAUDIT-5 adds the archived threads UI

**Do NOT remove:**
- `canon:getDetail` — used internally in db.js JS logic, not a dead bridge

**Also:** add a code comment to the migration array documenting the `045`/`046` out-of-order naming. Do not renumber.

**DB columns:** leave all schema-forward columns in place (`category`, `canon_promoted_entry_id`, `external_url`, `canon_character_id`, `canon_episode_id`, `decided_at`). These are planned features; SQLite column drops require table recreation.

- **Smoke passed 2026-06-08.**

---

## Cancel button fix (app-wide)

### PPOL-CANCEL — Cancel / dismiss / close button fix ✅
**Tool:** CLI
Cancel buttons do not work reliably in virtually every modal, form, dialog, and edit state across the app.

- Audit every cancel / close / dismiss button and ensure it reliably: (1) dismisses the UI element, (2) discards unsaved changes without touching the data layer, (3) returns focus to the prior view without stale state or partial writes
- Scope: entry create/edit forms, archive/delete confirmation dialogs, Canon Review approve/reject dialogs, import review dialogs, diff-on-save modal, Canon lock/unlock confirmations, tag pickers, route pickers, quick-capture modal
- No new features. No layout changes. Touch only cancel/dismiss/close handlers.
- After fixing, log any cancel buttons that were wired to wrong handlers or missing handlers entirely in a comment block at the top of each file touched.
- **Smoke:** Open and cancel the entry create form in: Unsorted, Characters, Episodes, Open Questions, Canon Bible (Edit Mode), Writing Lab. Open and cancel the archive confirmation on one entry. Open and cancel the delete confirmation on one entry. Open and cancel the Canon Review approve dialog. Open and cancel the quick-capture modal (Cmd+Shift+N). Confirm no partial data written in any case. Confirm no stale state lingers after cancel (reopening the same form shows blank/original state).

- **Audit result 2026-06-08:** All cancel/close/dismiss handlers verified correct via live Playwright testing. Scope covered: Unsorted/Characters/Episodes/Open Questions/Canon Bible/Writing Lab create cancel ✓; edit cancel ✓; delete confirm cancel ✓; Canon Review approve/reject/send-back/defer confirm cancel ✓; Canon lock form cancel ✓; quick-capture modal cancel ✓; tag picker close ✓; route picker dismiss ✓; Writing Lab delete confirm cancel ✓. No wrong handlers, no missing handlers, no partial writes, no stale state on reopen. Note: Archive in regular workspaces has no confirmation dialog (immediate with undo) — no cancel button exists or is needed. Note: diff-on-save modal built as PCANON-DIFF (done 2026-06-09). Writing Lab explicit create-cancel not yet built (future feature). No files required changes.

- **Smoke passed 2026-06-08.**

---

## Status fields (continued)

### PDECISION-STATUS — Decision status badges ✅
- Add **Open / Tentative / Final** status field to every Decision entry
- Visible as a badge on list items and detail panel
- Filterable in Decisions list
- **Smoke:** Set status on three decisions; filter by Final, confirm only Final decisions show; confirm badge visible in list and detail panel
- **Smoke passed.**

---

## Decisions → Canon Review

### PDECISION-PROMOTE — Decisions: promote to Canon Review ✅
- "Promote to Canon Review" action on any Decision entry
- Creates a Canon Review proposal pre-filled with the decision content and a back-link to the source Decision
- Source Decision shows a passive indicator that a proposal exists
- Link-don't-copy — same discipline as all other Canon Review paths
- **Smoke passed 2026-06-09.**

---

## Canon Bible enhancements

### PCANON-CONFIDENCE — Canon entry confidence level ✅
- Add **Confirmed / Probable / Speculative** confidence field to every canon entry
- Distinct from lock status — passive badge only, no workflow gate
- Visible on list items and detail panel
- Filterable in Canon Bible browse
- **Smoke passed 2026-06-09.**

### PCANON-DIFF — Canon edit diff on save ✅
- When saving an edit to a canon entry in Edit Mode, show a before/after diff before the save completes
- User must confirm the diff before changes persist
- **Smoke:** Edit a canon entry, confirm diff appears before save; confirm save completes on confirmation; confirm cancel aborts the change
- **Audit result 2026-06-09:** Implemented and verified via live Playwright testing. `showCanonSaveConfirm(before, after)` in renderer.js intercepts `makeEditCard.onSubmit`; shows `#canon-diff-overlay` modal with before/after table of changed fields only (reuses `.canon-history-diff-*` styles). Cancel/Escape/overlay-click aborts; "Save changes" proceeds. All three smoke cases passed.
- **Smoke passed.**

### PCANON-AFFECTED — Affected-by reverse lookup on superseded entries ✅
- When viewing a retired or superseded canon entry, a collapsed read-only panel lists all downstream entries (Characters, Episodes, Decisions) that were linked to it at time of retirement
- Source attribution ("from: Characters #X") also surfaces as a clickable back-link on every canon entry that was created via Canon Review approval — loads asynchronously from `canon_proposals` since `canon.create()` always writes `origin_kind='manual'`
- **Note:** Each Canon Review approval creates a separate canon entry, so Character and Decision links are tested independently (one per entry) — the system supports at most one source attribution per canon entry
- **Smoke passed 2026-06-09.**

---

## Conflicts enhancements

### PCONFLICT-SEV — Conflict severity badge ✅
- Add **Minor / Significant / Blocking** severity field to every Conflicts entry — user-set
- Visible as a badge on list items and detail panel
- Filterable in Conflicts list
- Blocking conflicts surface in the Needs Attention panel
- **Smoke:** Set severity on three conflicts; filter by Blocking, confirm results; set one to Blocking, confirm it appears in Needs Attention panel
- **Done:** migration `054_pconflict_sev`, `conflicts.setSeverity`, severity selector on detail panel (`showViewTop`), severity filter bar in left column (`leftColExtra`), list item badge (`listItemExtra`), `blockingConflicts` in `needsAttention` + Needs Attention panel section.
- **Smoke passed.**

---

## Stale item nudges

### PSTALE — Stale item nudges ✅
- Nav badge aging: badges show count + age of oldest unresolved item ("3 · 45d")
- Staleness indicator on list items not touched in 30+ days (subtle visual marker)
- Thresholds configurable in Settings (defaults: 14d Tier-1 questions, 30d conflicts, 7d Canon Review)
- Never auto-resolves or auto-archives — surfacing only
- **Implementation:** `navBadges()` in db.js returns `*OldestDays` per badge via combined COUNT/MIN queries. Nav badges use two inner spans (`.nb-count`, `.nb-age`) — age hidden on collapsed rail via CSS. `makeEntryWorkspace.buildListItem` checks `config.staleThresholdDays` (lazy function); Open Questions uses `tier1QuestionDays`, Conflicts uses `conflictDays`. Canon Review `buildListItem` checks `canonReviewDays` on pending proposals. Settings description updated to reflect all three uses.
- **Smoke:** Lower a threshold in Settings to 1d; confirm nav badge shows "N · Xd" on that workspace; confirm list items in that workspace show a small age marker; restore threshold.
- **Smoke passed.**

---

## Open Questions enhancements

### POQ-DEPENDS — Open Question dependencies ✅
- Mark one Open Question as "depends on" another
- Dependency shown as a soft block indicator on the dependent question's list item
- Blocked questions surface with reduced visual priority while the blocker is unresolved
- Removing the dependency requires confirmation
- **Smoke passed.**

---

## Writing Lab enhancements

### PWLAB-SECTIONS — Writing Lab scene/section markers
- User inserts named section markers within a draft body
- Section names appear in a jump-to list on the draft detail panel
- Click a section name to scroll to it within the draft
- No hierarchy — flat named anchors only
- Word count and scene/section count shown passively in status bar
- **Smoke:** Insert three section markers; confirm jump-to list appears with all three; click each, confirm scroll; confirm section count in status bar

### PWLAB-CANON-COMPARE — Writing Lab draft vs. canon comparison ✅
- On-demand action from any Writing Lab draft: Claude reads the draft body and surfaces details that diverge from locked canon entries
- Results as a flagged list with source citations (canon entry + approximate draft location)
- User reviews each flag; can route to Conflicts or Open Questions, or dismiss
- Never runs automatically; never touches canon
- **Smoke:** Write a draft with a deliberate canon divergence; run comparison; confirm flag surfaces with correct canon entry cited; route flag to Conflicts, confirm entry created; dismiss another flag, confirm it clears
- **Smoke passed 2026-06-09.**

---

## Episode enhancements

### PEPISODE-PREVON — "Previously on" canon snapshot ✅
- On any Episode entry, one-click generates a read-only summary of what canon facts are locked as of the prior episode
- Generated from existing canon data — no new input required
- Displayed in a collapsed panel on the episode detail
- Exportable as plain text
- **Implementation:** `episodes.previouslyOn(id)` in db.js queries locked non-retired canon entries with `locked_at < episode.created_at`; also surfaces the prior episode (by created_at) for label context. IPC: `episodes:previouslyOn` + `episodes:previouslyOnExport`. UI: `mountPreviouslyOnPanel` collapsed `<details>` section on episode detail — Generate button on first open, Refresh + Export .txt after results load. Export writes to `~/Documents/revival-bible-studio/previously_on/`.
- **Smoke passed 2026-06-09.**

---

## Research enhancements

### PRESEARCH-USED — Research "Used in" indicator ✅
- Passive badge on every Research entry showing whether it has been linked or routed anywhere ("linked" vs. "unused")
- Filterable: filter Research by used vs. unused
- **Implementation:** `research.list()` / `research.listArchived()` in db.js overridden with EXISTS subquery on `cross_workspace_attachments` (source_kind='research') to add `used` boolean. Research workspace wrapped in IIFE; `matchesExtra` / `isFilterActive` filter hooks added; All/Linked/Unused filter bar in `leftColExtra`; linked/unused badge on every list item title row via `listItemExtra`. CSS in index.html.
- **Smoke passed.**

---

## Character/Episode draft lock

### PDRAFT-LOCK — Character/Episode "locked for this draft" state
- Draft Lock: marks a Character or Episode entry as stable for a named draft/season
- Read-only until explicitly unlocked — distinct from Canon Bible locking
- Locked entries show draft-lock badge; visible and searchable, not editable without unlock
- Unlock requires confirmation + optional note
- **Smoke:** Draft-lock a Character entry, attempt edit, confirm blocked; unlock with note, confirm editable; confirm lock badge visible in list and detail panel

---

## Character arc tracker

### PARC-A — Character arc tracker: written timeline ✅
- Episode-by-episode structured list per character
- Shows: canon facts locked at this point in their arc, open questions unresolved at this point, decisions affecting them
- Reads character status field
- Read-only display generated from existing data — no new data entry
- Updates automatically as canon and episode entries change
- Filterable by character, season, arc status
- **Implementation:** `characters.arcTimeline(charId)` in db.js returns episodes + per-episode canon facts (locked_at ≤ episode.created_at), linked OQs (unresolved at that point via cross_workspace_attachments), and linked decisions. IPC: `characters:arcTimeline`. UI: `setupCharArcTracker` toggle button in Characters left column — hides left col, shows full-width arc panel with character selector dropdown, status filter chips, season filter chips (auto-detected from episode titles), and episode rows (collapsible details). Also fixed pre-existing syntax error: `mountDraftLockPanel` was inside `CONTENT_RENDERERS` object literal; moved to top-level.
- **Smoke passed 2026-06-09.**

### PARC-B — Character arc tracker: visual timeline ✅
- Horizontal scroll, season/episode markers on X axis
- Character state plotted at each marker
- Color-coded by character; multiple characters togglable
- Locked canon events: fixed markers; working/draft events: softer markers
- Click any marker to open the source entry
- **Implementation:** `setupCharVisualTimeline` in renderer.js; CSS `.vt-*` in index.html. Episodes on X, one row per toggled character. Canon facts: solid filled circle; OQs: outlined rotated square (softer/working); Decisions: solid square if final, outlined if open/tentative. All markers clickable → `route(workspace, id)`. Character chips (All/None/individual) toggle rows live. Arc data cached per character to avoid redundant IPC calls.
- **Smoke passed 2026-06-09.**

---

## Episode structure

### PEPISODE-STRUCT — Episode structure checklist ✅
- Per-episode checklist panel derived from Flanagan Master episodic structure rules:
  - [ ] Cold open: in medias res
  - [ ] Act Two: rewatch-layer scene identified
  - [ ] Act Three: consequence scene present
  - [ ] Coda: quiet devastation candidate identified
  - [ ] Quiet devastation: satisfies structural signature
- Manually checked by user — not auto-evaluated
- AI-assist option: "Evaluate with AI" — Claude reads episode entry + gives verdict per item. User confirms or overrides each.
- **Implementation:** Migration `057_pepisode_struct` creates `episode_struct_checklist` table (episode_id, item_key, checked, ai_verdict, ai_rationale, user_override). `db.episodeStruct` repo: get/setChecked/setAiVerdicts/setOverride. IPC: `episodes:structGet`, `episodes:structSetChecked`, `episodes:structSetOverride`, `claude:episodeStructEval`. UI: `mountEpisodeStructPanel` collapsed `<details>` on episode detail — 5 checkboxes (manually checkable, persists immediately), "Evaluate with AI" button triggers Claude, per-item verdict badge + rationale + Confirm/Override buttons. Overrides clear on next AI run. Panel mounted before "Previously on" in detailExtra.
- **Smoke:** Open an episode entry, manually check three checklist items; run AI assist, confirm it returns per-item verdict; override one AI verdict, confirm override persists

---

## Quiet devastation tracker

### PQUIET — Quiet devastation tracker
- Per-episode status: No candidate / Candidate identified / Locked
- Four pre-seeded locked quiet devastations from THE_FLANAGAN_MASTER (Episodes 1, 4, 6, 8) — seeded at migration, not editable
- Add candidate: link to Writing Lab draft, scene note, or freeform description
- Lock a quiet devastation: marks it final, read-only
- Dashboard view: all 24 episodes in a grid showing QD status at a glance
- Surfaces in Needs Attention panel for any episode without a candidate
- **Smoke:** Confirm four pre-seeded QDs appear locked; add a candidate to Episode 2, confirm status updates; lock it, confirm read-only; view dashboard, confirm grid reflects all statuses

---

## Locked specifics panel

### PLOCKED-SPECIFICS — Locked specifics reference panel
- Passive reference panel surfacing non-negotiable locked items from THE_FLANAGAN_MASTER
- Locked specifics included: two physical markers (T-015), mirror motif (T-227), virus-is-not-a-metaphor rule, Spirituality Principle, Found Family Principle, Jordan's no-arrest rule, closing line, Recovery Authenticity Mandate
- **Where it surfaces:** Characters entries (character-relevant only), Episodes entries, Writing Lab drafts, Canon Bible entries in Edit Mode, Canon Review proposals
- Displayed as collapsed reference panel — not modal, not blocking. Always available, never intrusive.
- Filterable: show only specifics relevant to the entry's characters/themes
- **Smoke:** Open a Characters entry, confirm locked specifics panel present and collapsed; expand it, confirm relevant specifics shown; open a Writing Lab draft, confirm panel present; confirm panel does NOT appear on Source Material or Settings

---

## Episode continuity checker

### PEPISODE-CONT — AI episode continuity checker
- On-demand per episode entry: Claude reads episode content + linked character entries (including status field) + relevant canon + prior episode entries
- Flags: timeline contradictions, character state inconsistencies, arc breaks
- Results surface as a flagged list with source citations
- User reviews each flag; can route to Conflicts, Open Questions, or dismiss
- Never auto-resolves; never touches canon; runs only when user triggers it
- **Smoke:** Create an episode with a deliberate character state inconsistency vs. prior episode; run checker, confirm flag surfaces with correct source citation; route flag to Conflicts, confirm entry created; dismiss another flag, confirm it clears

---

## Research citation

### PRESEARCH-CITE — Research source citation
- Source field on Research entries: freeform text OR link to a Source Material entry (picker)
- If linked to Source Material: bi-directional visibility
- Citation visible on list item preview line
- Filterable: filter Research by cited vs. uncited
- Exportable: Research export includes citation
- **Smoke:** Add a freeform citation to a Research entry, confirm visible in list; link to a Source Material entry, confirm bi-directional visibility; filter by cited, confirm only cited entries show

---

## Empty state + onboarding

### PEMPTY-STATE — Empty state + onboarding
- Empty state copy for every workspace: what it's for, what to do first
- First-session guide: non-modal walkthrough available from Home on first launch
- Suggested start sequence: Settings (API key + Project Rules) → Source Material → Canon Bible → Open Questions
- Dismissable; never re-surfaces after dismissed
- **Smoke:** Launch app with empty database; confirm empty state copy on three workspaces; trigger first-session guide from Home; dismiss, relaunch, confirm it does not re-appear

---

## App health

### PHEALTH — App health indicator
- In Settings: migration count + last migration run, SQLite file size, record counts by workspace (read-only)
- Orphan detection: flag any orphaned records (linked entries whose parent no longer exists)
- One-click orphan cleanup with confirmation + preview of what will be removed
- **Smoke:** Confirm health panel shows correct migration count and file size; manually create an orphan in dev; confirm detection flags it; run cleanup with confirmation, confirm orphan removed

---

## Config backup

### PCONFIG-BACKUP — Settings config backup/restore
- Export: Project Rules text, staleness thresholds, tag library (user-created tags only). API key excluded from export for security.
- Import: restore config from export file
- Separate from Panic Export (which covers data)
- **Smoke:** Export config, wipe Settings, import from export file, confirm Project Rules and thresholds restored; confirm API key was NOT exported

---

## Workflow continuity

### PSESSION-RESUME — Session resume on launch
- On app launch, surface the last entry the user had open rather than defaulting to Home
- If the last entry was deleted or archived, fall back to Home
- Opt-out available in Settings for users who prefer to start at Home
- **Smoke:** Open an entry; quit app; relaunch; confirm the same entry is open; archive that entry; relaunch; confirm fallback to Home

### PSCRATCHPAD — Entry-level scratchpad
- Every entry across all workspaces gets a freeform scratchpad section, collapsed by default
- Not autosaved to body, not canon, not routable, not exported as part of the entry
- Persists with the entry across app restarts
- Clearly visually distinct from the entry body
- **Smoke:** Add scratchpad text to three entries across different workspaces; quit and relaunch; confirm scratchpad content persists; confirm scratchpad text does not appear in search results or exports

---

## Navigation enhancements

### PBREADCRUMB — Back-reference breadcrumb
- When clicking through to an entry from a linked-entries panel or back-reference, a one-line breadcrumb appears at the top of the detail panel ("← Jordan (Characters)")
- Single back-step — clicking returns to the origin entry
- Breadcrumb clears on any other navigation action
- **Smoke:** Click through from a Character's back-reference to a linked Decision; confirm breadcrumb shows "← Jordan (Characters)"; click breadcrumb, confirm return to Jordan; navigate elsewhere, confirm breadcrumb clears

### PWHERE-REF — "Where is this referenced?" panel
- Expands the existing linked entries indicator into a full read-only panel listing every workspace and entry that references this entry
- Grouped by workspace; each item click-through to the referencing entry
- Read-only — no actions in this panel
- **Smoke:** Link an entry from three different workspaces; open the linked entries panel; confirm all three appear grouped by workspace; click through to one, confirm navigation

### PNAV-ACTIVITY — Workspace activity indicator
- Subtle visual recency signal on each nav item — not a badge count, not a number
- Shows when you were last active in that workspace
- Aids reorientation at session start
- **Smoke:** Visit three workspaces; quit and relaunch; confirm activity indicators reflect the three visited workspaces; confirm unvisited workspaces show no indicator

---

## Global UX

### PKEYSHEET — Keyboard shortcut cheat sheet
- Cmd+? opens a non-modal overlay listing all keyboard shortcuts
- Organized by context (Global, Canon Bible, Queues, Navigation, etc.)
- Dismissable with Escape or Cmd+?
- Also accessible from Help menu
- No new shortcuts — surfaces what PKEY built
- **Smoke:** Open cheat sheet, confirm all PKEY shortcuts appear; dismiss with Escape, confirm closes; open from Help menu, confirm same overlay

### PPALETTE-RECENTS — Command palette recents
- Last 5 entries opened appear at top of Cmd+K palette before typing, labeled "Recent"
- Typing immediately hides recents and shows search results
- Session-scoped — clears on app quit
- **Smoke:** Open 5 entries; open Cmd+K; confirm all 5 appear as recents; type a query, confirm recents hide and search results show

### PROUTE-HISTORY — "Send to" picker history
- Last 3 route destinations appear at top of the highlight-extract-route picker, labeled "Recent"
- Session-scoped — clears on app quit
- **Smoke:** Route three times to three different destinations; trigger picker a fourth time; confirm all three appear at top; select a new destination, confirm it becomes the newest recent

---

## Flanagan Filter expansion

### PFLAN-EXPAND — Flanagan Filter: workspace expansion
- Expand Flanagan Filter to all creative/narrative workspaces beyond Open Questions
- **Full five-mode filter** (Editorial Filter, Six Tensions, WWFD, Full Diagnostic, Production Check) available on: Brainstorm entries, Writing Lab drafts, Characters entries, Episodes entries, Canon Review proposals, Canon Bible entries (Edit Mode only)
- **Lightweight filter** (Editorial Filter + North Star only) available on: Conflicts entries, Decisions entries
- **Production Check** (fifth scan mode — Tier 3 of THE_FLANAGAN_MASTER only): camera positions, color palette, sound philosophy, performance direction, location design, episodic structure. Named citations: "Camera Rule One," "Companion Position," "Music Rule." "Not ready" gate when no scene/visual content present. Kept separate from Full Diagnostic.
- All filter rules from P46-A apply (summary line, named citations, confidence signal, North Star, save/history, routing/tags)
- **Smoke:** Run Editorial Filter from a Brainstorm entry; run Production Check from a Writing Lab draft with scene content; run lightweight filter from a Decisions entry; confirm Production Check "not ready" gate fires on an entry with no visual content

---

## Cross-AI routing

### PAI-WIRE — Cross-AI routing
- Wire AI feature outputs so they can trigger other AI actions or Canon Review proposals without workspace-hopping
- **P44 → P41:** Claude flags a canon fact in a Writing Lab draft conversation → "Propose to Canon Review" action appears in response → user confirms → routes to Canon Review with draft attribution. No automatic routing.
- **P42 → P43:** From a P42 canon search result, one-click "Run conflict check on this entry" → triggers P43 against that specific entry. No workspace switch.
- **P46 → P41:** Flanagan Filter analysis recommends an option involving a canon fact → "Propose to Canon Review" action on analysis output → pre-filled with recommended option + analysis as supporting context.
- **P45 → P43:** Import assistant flags a possible duplicate → one-click "Run conflict check" against the suspected duplicate before staging.
- **Smoke:** Trigger each of the four cross-AI connections; confirm proposals route to Canon Review with correct attribution; confirm no automatic routing fires without user action

---

## Documents wiring

### PDOC-WIRE — Documents workspace wiring
- Documents promoted to first-class workspace with full wiring
- Attachable to Chat (keep active / next message only, same as Source Material)
- Added to highlight-extract-route target list
- Linkable to Characters and Episodes entries (same picker pattern as P36)
- Flanagan Filter available (full five modes)
- Canon proposal path: select text in a Document → propose to Canon Review with Document attribution
- Documents attachable to Decisions, Open Questions, Conflicts as supporting reference
- Bi-directional visibility on all links
- **Smoke:** Attach a Document to Chat, confirm it's visible as active source; link a Document to a Character, confirm bi-directional visibility; highlight text in a Document, route to Brainstorm, confirm attribution; propose to Canon Review from a Document, confirm attribution

---

## UI Polish (post-PBRAIN-STRUCT)

### PPOL3 — UI Polish: post-PBRAIN-STRUCT
- Work through all items logged in `POLISH_NOTES_ONGOING.md` since PPOL2b
- Print/PDF export for single entries: Source Material, Brainstorm, Research, Writing Lab, Open Questions analysis history
- No new features — polish and print/PDF only
- **Smoke:** Every logged item marked resolved; print/PDF confirmed from each listed workspace

---

## Ongoing polish

### PPOL-ONGOING — Ongoing polish (open-ended)
- Permanent catch-all for polish items that surface after the full feature set is built and in active use
- Items logged in `POLISH_NOTES_ONGOING.md` as they are discovered
- No scope gate — this phase never closes
- Work through items in order; one Claude Code session per batch
- No new features — fixes, consistency, and rough edges only
- **Pattern:** Log item → batch with similar items → one session → mark resolved in POLISH_NOTES_ONGOING.md

---

## Inline search/filter

### PPOL2b-SEARCH — Inline search/filter on all workspace left columns
**Tool:** CLI
- Text input above the left-column list in every workspace to narrow visible entries by title or body
- Local filter only — no API call; clears on workspace navigation
- **Workspaces:** Unsorted, Source Material, Documents, Open Questions, Conflicts, Decisions, Brainstorm, Research, Characters, Episodes, Writing Lab, Canon Bible (title keyword — P42 covers semantic), Canon Review proposals
- **Smoke:** Type in the filter on three workspaces; confirm list narrows live; clear filter, confirm full list restored

---

## Blocking specificity + blocking system

### PBLOCK-LABEL — Specific blocking/blocked labels on entries
**Tool:** VS Code ext
**Requires:** PBLOCK ✅, PCONFLICT-SEV ✅, POQ-DEPENDS ✅
- Blocking and blocked indicators throughout the app show generic badges. Replace with specific labels naming exactly what is blocking or blocked.
- **Blocking OQ (POQ-DEPENDS):** "Blocked by: [Q title]" on dependent question; "Blocking: [Q title]" on the blocker
- **Blocking flag (PBLOCK):** "Blocking: [named episode/character/arc]" — target already stored; surface it in the badge
- **Blocking Conflict (PCONFLICT-SEV):** "Blocking: [linked entry title or freeform description]" on list item badge and detail panel
- Applies everywhere a blocking/blocked state is rendered: list item badges, detail panel indicators, Needs Attention panel entries
- Display-layer change only — no schema changes required
- **Smoke:** Set a blocking OQ dependency; confirm list item reads "Blocked by: [Q title]" not just "Blocked"; set a Blocking-severity conflict; confirm badge reads "Blocking: [description]"; check Needs Attention panel entries show same specific labels

### PBLOCK-CROSS — Cross-workspace blocking relationships
**Tool:** VS Code ext / CLI
**Requires:** PBLOCK-LABEL
- Any entry in Decisions, Brainstorm, Canon Bible (Edit Mode), Characters, or Episodes can be marked as blocking a named target (episode, character, arc, draft, or another entry via picker)
- Blocking entries surface in Needs Attention panel with specific label per PBLOCK-LABEL
- Removing a blocking relationship requires confirmation
- Link-don't-copy — blocked target is a reference, not a copy
- Bi-directional visibility: blocked entry shows what is blocking it; blocker shows what it is blocking
- **Smoke:** Mark a Decision as blocking "S1E4 draft"; confirm it surfaces in Needs Attention with specific label; resolve the Decision; confirm block clears; confirm bi-directional visibility on both entries

### PBLOCK-RESOLVE-PROMPT — Blocking resolution prompt
**Tool:** VS Code ext
**Requires:** PBLOCK-CROSS
- When a blocker is resolved, archived, or closed, a prompt surfaces: "This was blocking [X] — do you want to review or update [X]?"
- One-click navigation to the downstream entry from the prompt
- Dismiss without action always available — no forced workflow
- Applies to: OQ resolved (POQ-DEPENDS), Conflict severity changed away from Blocking, blocking flag cleared (PBLOCK), cross-workspace block cleared (PBLOCK-CROSS)
- **Smoke:** Resolve a blocking OQ; confirm prompt appears naming the downstream entry; click through, confirm navigation; dismiss another, confirm no action taken

### PBLOCK-DASHBOARD — Blocking dashboard
**Tool:** CLI
**Requires:** PBLOCK-CROSS, PBLOCK-LABEL
- Read-only panel on Home alongside Needs Attention showing everything currently blocking or blocked across all workspaces
- Grouped by workspace; each item click-through to the entry
- Shows: blocker title, workspace, what it's blocking, age of the block
- Filters: Blocking only / Blocked only / All
- Never auto-resolves anything — display only
- **Smoke:** Create blocking entries across three workspaces; open dashboard; confirm all appear grouped with correct labels and ages; click through to one, confirm navigation; test each filter

### PBLOCK-HISTORY — Blocking history on entries
**Tool:** CLI
**Requires:** PBLOCK-CROSS
- Passive collapsed log on every entry showing all blocking relationships over time, including resolved ones
- Each record: relationship type, other entry title + workspace, date set, date resolved (if resolved)
- Read-only — not editable; collapsed by default; matches archive section pattern
- **Smoke:** Create and resolve two blocking relationships on one entry; open blocking history; confirm both appear with set and resolved dates; confirm active blocks also appear

---

## AI metadata assistance

### PAI-STATUS-SUGGEST — AI-suggested status values
**Tool:** VS Code ext
- On demand, Claude recommends a status value based on entry content
- Decisions: Open / Tentative / Final; OQ: Tier 1/2/3; Brainstorm: Rough / Developing / Ready to Route; Episodes: Outline / Draft / Locked
- Trigger: "Suggest status" button on detail panel — never automatic
- User confirms or overrides; never applied silently
- **Smoke:** Trigger on a Decision, OQ, and Brainstorm entry; confirm suggestion + rationale appears; confirm value; confirm only confirmed status written

### PAI-ENTRY-ROUTE-SUGGEST — AI-suggested workspace routing on entry creation
**Tool:** VS Code ext
- When creating via quick-capture or Unsorted, Claude suggests which workspace the content belongs in with one-line reason
- Trigger: "Where should this go?" button — never automatic
- User routes or dismisses; nothing moves without confirmation
- **Smoke:** Create an entry in quick-capture; trigger suggestion; confirm recommendation + reason; route to suggested workspace; confirm entry created there

### PAI-TAG-SUGGEST-EDIT — AI tag suggestions with pre-apply editing
**Tool:** VS Code ext
**Requires:** PAI-TAGS (must be built first)
- AI proposes tags from existing library; user edits the proposed set before confirming — remove suggestions, add tags manually
- Edit step always present; no tag ever applied without deliberate review
- App-wide — all workspaces covered by PAI-TAGS
- **Smoke:** Trigger tag suggestion on an entry; remove one suggested tag, add one manually; confirm; confirm only confirmed tags applied

### PAI-BLOCK-SUGGEST — AI-suggested blocking relationships between Open Questions
**Tool:** VS Code ext
**Requires:** POQ-DEPENDS ✅
- On demand, Claude reviews Open Questions and suggests directed dependency pairs with one-line rationale
- Trigger: "Suggest dependencies" button on OQ entry or batch mode from OQ toolbar
- User confirms or dismisses each pair individually; confirmed pairs create POQ-DEPENDS links
- **Smoke:** Run on a set of OQs; confirm dependency suggestions appear with rationale; confirm one, dismiss one; confirm confirmed pair creates dependency link

### PAI-RELATIONSHIP-SUGGEST — AI-suggested cross-workspace links
**Tool:** CLI
- On demand, Claude reads an entry and returns candidate entries to link, with one-line reason per candidate
- User accepts or dismisses each individually; no link created without confirmation
- Applies to: Characters, Episodes, Decisions, Open Questions, Conflicts, Brainstorm, Research, Canon Bible entries
- **Smoke:** Trigger on a Character entry; confirm candidate list appears; accept one link, dismiss one; confirm accepted link is bidirectional

### PAI-METADATA-AUDIT — AI metadata audit: batch fill missing fields
**Tool:** CLI
- On demand, Claude scans a workspace for entries missing status, tier, tags, confidence, or severity
- Results shown as reviewable list; AI pre-populates suggestions inline; user confirms or overrides per field
- Never writes metadata without explicit per-field confirmation; one workspace at a time
- **Smoke:** Create entries with missing fields; run audit on that workspace; confirm missing-field list surfaces; fill two fields, skip one; confirm only confirmed fields written

### PAI-CONFIDENCE-SUGGEST — AI-suggested confidence level on canon entries
**Tool:** VS Code ext
**Requires:** PCANON-CONFIDENCE ✅
- On demand, Claude recommends Confirmed / Probable / Speculative for a canon entry with reasoning
- Trigger: "Suggest confidence" button on canon entry detail panel (Edit Mode)
- User confirms or overrides; nothing applied without confirmation
- **Smoke:** Trigger on three canon entries with different evidence strength; confirm recommendation + rationale per entry; confirm one, override one, dismiss one

---

## Chat enhancements

### PCHAT-SEARCH — Chat history search
**Tool:** CLI
- Search across all chat history by keyword
- Results show chat title + matching message preview; click-through opens that chat at the matched message
- Scoped to current project chats only
- **Smoke:** Create three chats with distinct keywords; search for each; confirm correct chat and message surfaces; click through, confirm navigation to matched message

### PCHAT-EXPORT — Chat plain-text export
**Tool:** VS Code ext
- Export any chat as a downloadable .txt or .md file
- Includes: chat title, date, all messages with role labels (You / Claude), attachments noted inline
- Distinct from PCHAT-ROUTE (which routes content to workspaces); this is a file download
- **Smoke:** Export a chat with attachments; confirm file downloads; confirm title, messages, and attachment notes present; confirm formatting clean

---

## Deferred

Held until core feature set is stable and in active use.

- **Chat pop-out** — dedicated window for Chat independent of main app
- **Additional Source file types** — OCR for scanned documents, PDF annotation
- **Performance optimization** — large dataset handling
- **Themes** — dark/light theme toggle
