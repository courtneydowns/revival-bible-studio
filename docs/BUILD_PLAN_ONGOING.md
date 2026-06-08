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
- Reusable left-list / right-detail component dropped into every workspace
- Left: title, type/status badge, preview line
- Right: full content, editable, actions
- Retrofit all existing workspaces (Unsorted, Open Questions, Conflicts, Decisions, Brainstorm, Research, Characters, Episodes, Documents, Source Material, Writing Lab)
- **Smoke:** Open every workspace, confirm two-column layout, click an entry, detail panel opens

### PUI2 — Full-screen popout window ✅
- Global popout available from any entry detail panel
- Full edit, rename, delete, archive/restore all available within the popout
- Independent window — rest of app remains usable
- Opens in Reference Mode by default (see PCBREF for Canon Bible; same principle applies)
- **Smoke:** Open a popout from three different workspaces, edit and save from within it, confirm changes persist

### PUI3 — Highlight + extract + route ✅
- Select any text in a detail panel or popout → extract menu appears
- Route extracted text to: Unsorted, Brainstorm, Open Questions, Decisions, Conflicts, Research, Canon Review
- Creates a new entry in the target workspace pre-filled with the selection and a source attribution
- **Smoke:** Highlight text in a Source Material entry, route to Brainstorm, confirm new entry exists with attribution

---

## Quick Capture + Navigation

### PCAP — Global quick-capture ✅
- Cmd+Shift+N from anywhere opens a minimal modal
- Title + body, one-click save → drops to Unsorted
- Dismissable with Escape
- **Smoke:** Trigger from three different workspaces, save an entry, confirm it appears in Unsorted

### PKEY — Command palette + keyboard navigation ✅
- Cmd+K opens command palette: jump to any workspace, any recent entry, any action
- Full keyboard navigation throughout: tab through list items, Enter to open detail, keyboard shortcuts for approve/defer/route/archive in queues
- **Smoke:** Navigate to three workspaces, open three entries, perform two actions — all without mouse

---

## Tags

### PTAG — Tag UI ✅
- Apply and remove tags on any entry across all workspaces and canon
- Tag picker shows seeded tags + user-created tags, grouped by category
- Browse by tag: filter any workspace or Canon Bible by one or more tags
- Tags visible as badges on list items and detail panels
- **Smoke:** Tag an entry in three different workspaces, filter by that tag, confirm correct results

---

## Search

### PSEARCH — Global search ✅
- Search across all workspaces, canon entries, chats, tags
- Filterable by: workspace, entry type, tag, canon status, lock status
- Results grouped by source
- **Smoke:** Search a term that exists in three different workspaces, confirm results from each; filter by workspace, confirm narrowing

---

## Home + Navigation upgrades

### PHOME — Home upgrade ✅
- Nav badge counts: Unsorted (total active), Canon Review (pending proposals), Open Questions (open tier-1)
- Recently viewed: last 8 entries opened across any workspace, session-persistent, one-click return
- **Smoke:** Open 8 entries across different workspaces, confirm recently viewed list; confirm badge counts match reality

---

## Passive UI layer

### PPASSIVE — Status bar + linked entries indicator ✅
- Thin persistent status bar at bottom of every detail panel: workspace, entry type, created date, last edited, lock status
- Linked entries indicator on every detail panel: passive count ("3 attachments / 2 canon links"), expandable on click
- **Smoke:** Open entries with and without links, confirm counts are correct and expandable

---

## Canon Bible UI

### P32 — Canon entries: create + edit ✅
- Entry-type picker (all 18 types from schema)
- Detail table fields rendered per entry type
- **Smoke:** Create one entry of three different types, edit each, changes persist

### P33 — Canon lock / unlock ✅
- Lock = currently accepted, edits still allowed but warn user
- Deliberate mode switch required to edit locked entries
- **Smoke:** Lock an entry, attempt edit, warning appears, proceed, change saved; unlock and edit without warning

### P34 — Canon supersede + retired section ✅
- Superseding creates new entry, marks prior retired, sets chain pointers
- Retired entries visible in collapsed section with full prior content
- **Smoke:** Supersede an entry, find old version in collapsed retired section, confirm chain is navigable

### P35 — Canon Review queue ✅
- Two-column layout: left = proposal list with status badges; right = full proposed content
- Edit proposed content before approving
- Actions: Approve / Send Back / Defer / Delete / Reject
- Deferred proposals collapse to bottom section
- Filter by status (pending / sent back / deferred)
- Full edit and actions available in popout
- **Smoke:** Submit a proposal, edit it in queue, approve it, confirm it appears in Canon Bible; defer one, confirm it collapses; filter by status

### P35b — Canon Bible filter + browse ✅
- Filter Canon Bible by: entry type, tag, lock status, character, season
- Filters combinable
- **Smoke:** Filter by entry type, confirm results; combine with tag filter, confirm narrowing

### PCBREF — Canon Bible reference mode ✅
- Default mode on Canon Bible page: read-only, no edit affordances, clean layout
- Edit Mode toggle (top right): deliberate switch, reveals all edit affordances
- Popout has independent mode state
- **Smoke:** Confirm Canon Bible opens in Reference Mode; toggle Edit Mode, confirm affordances appear; open popout, confirm independent state

### PHIST — Canon entry version history ✅
- Walk back through supersede chain from any canon entry
- View prior versions side by side with current
- **Smoke:** Supersede an entry twice, walk back through all three versions, view two side by side

### PCONFLICT — Conflict detection UI ✅
- Surface canon entries that appear to contradict each other
- Route flagged pairs to Conflicts workspace or Canon Review
- Runs on demand, not automatically
- **Smoke:** Create two contradicting entries, run conflict detection, confirm pair is surfaced, route to Conflicts

### PCONFLICT-2 — Auto-route detected conflicts + re-check nudges ✅
- **Auto-route on scan:** "Run conflict detection" in Canon Bible (and "Re-check resolved conflicts" on the Conflicts page) now auto-creates a Conflicts row for every detected collision. Dedup is by signature: a second click never piles up duplicate rows for the same collision.
- Per-card "Route to Conflicts" button is gone — replaced by a passive label per group: *"Routed → Conflicts #N (new)"* for rows created by this scan, *"Tracked → Conflicts #N"* for ones that were already open.
- Canon Bible scan status line summarizes: *"N conflicts found · M newly routed · K already tracked · J auto-archived."*
- Conflicts workspace: inline hint above the list — *"Resolved a conflict in Canon Bible? Re-run detection to auto-archive cleared ones."*
- Conflicts workspace: "Re-check resolved conflicts" button next to the hint; calls the same `scanAndRoute` IPC, reloads the Conflicts list, shows *"Auto-archived N resolved conflict(s) · routed M new conflict(s)."*
- Canon Bible: toast after editing / archiving / superseding / deleting a canon entry that is currently referenced by an open Conflicts row, reminding the user to re-run detection so the now-resolved flag clears.
- New IPCs: `canonConflicts.scanAndRoute()` (scan + dedup auto-route + auto-archive in one call), `canonConflicts.openFlagEntryIds()` (canon ids referenced by any open flag — backs the toast).
- **Smoke:** Create two contradicting canon entries; click "Run conflict detection" in Canon Bible; confirm a Conflicts row was auto-created and the card shows "Routed → Conflicts #N (new)"; re-run the scan, confirm the same group now shows "Tracked → Conflicts #N" (no duplicate row). Resolve the collision in Canon Bible (edit/archive/supersede); confirm the re-run toast fires. Switch to Conflicts; click "Re-check resolved conflicts"; confirm the row auto-archives.
- **Smoke passed.**

### PCONFLICT-3 — Canon Bible contradiction scan + conflict lifecycle ✅
- On-demand scan button in Canon Bible checks all canon entries for direct contradictions against each other
- Results surface in Conflicts workspace with source attribution (which two entries conflict)
- Re-running the scan: toast notification confirms scan complete + count of new conflicts found (matching PCONFLICT-2 toast pattern)
- Inline reminder visible in Canon Bible after scan if unresolved conflicts exist
- Re-running the continuity scan from Conflicts page archives resolved/stale conflicts and updates the list
- Model the surface + interaction after PCONFLICT-2: same toast helper, same hint-bar pattern, same scoping (canon → toast, conflicts → scan button + status)
- **Smoke:** Create two contradicting canon entries; run scan from Canon Bible, confirm toast fires and conflict appears in Conflicts workspace; re-run scan, confirm toast updates with new count; resolve the conflict in Canon Bible; re-run from Conflicts page, confirm it archives
- **Smoke passed.**

---

## Cross-workspace wiring

### P36 — Cross-workspace attachments: picker + linked view ✅
- "Attached" section on Characters and Episodes entries
- Picker attaches resolved items from Decisions, Open Questions, Conflicts, Brainstorm, Research
- Link-don't-copy: references with click-through to original
- Bi-directional visibility
- **Smoke:** Attach a Decision to a Character, see it on the Character page, click through, see back-reference; unlink, confirm original untouched

### P37 — Characters: relational view ✅
- Visual showing how characters connect (relationships, factions, arcs, conflicts)
- **Smoke:** Define a relationship between two characters, see it in relational view

### P38 — Characters/Episodes → Canon Review ✅
- Propose a canon change from a Character or Episode entry
- Lands in Canon Review queue
- **Smoke:** Propose from a Character, see it in Canon Review, approve it, confirm in Canon Bible

---

## Writing Lab → Canon

### PWLAB — Writing Lab → Canon Review connection ✅
- From any Writing Lab draft, select text or use an action to propose a canon change
- Proposal lands in Canon Review with source attribution to the draft
- **Smoke:** Propose from a draft, confirm it appears in Canon Review with attribution

---

## UI Polish (pre-import)

### PPOL1 — UI Polish: pre-import ✅
- Work through all items logged in `POLISH_NOTES_ONGOING.md` up to this point
- No new features. Fixes, consistency, rough edges only.
- **Smoke:** Every item in POLISH_NOTES_ONGOING.md marked resolved

---

## Safety + Export

### P20v2 — Panic Export v2 ✅
- Extend existing Panic Export to include canon tables, tags, proposals
- **Smoke:** Run export, confirm output includes canon entries, tags, proposals

### PEXPORT — Canon Bible export ✅
- Clean readable export of approved canon by entry type / character / season
- Output formats: markdown and PDF
- **Smoke:** Export by character, confirm output contains only that character's canon entries in readable format

---

## Import

### PImp1 — Worldbuilding file import ✅
- File picker points at worldbuilding files folder
- Parser reads and stages entries as pending proposals in Canon Review
- Conflict flagging before staging: entries that appear to contradict existing canon are flagged
- Source attribution on every proposal (which file it came from)
- **Smoke:** Point at one worldbuilding file, confirm proposals appear in Canon Review with source attribution; confirm a known contradiction is flagged

### PImp2 — Import review tools ✅
- Filter Canon Review by entry type during import
- Keyboard navigation through queue (tab, approve, defer without mouse)
- Bulk defer by category
- Bulk approve by category (requires explicit confirmation)
- **Smoke:** Bulk defer all entries of one type, confirm they collapse; keyboard-navigate through 10 entries approving each

---

## UI Polish (pre-AI)

### PPOL2 — UI Polish: pre-AI ✅
- Work through all items logged in `POLISH_NOTES_ONGOING.md` since PPOL1
- No new features. Fixes, consistency, rough edges only.
- **Smoke:** Every item in POLISH_NOTES_ONGOING.md marked resolved

---

## AI integration (Claude only)

### P39 — Claude API config + request preview ✅
- API key field in Settings (Claude only — no provider picker, no OpenAI scaffolding)
- Request preview UI shows exact payload that would be sent
- **Smoke:** Enter key, draft a message, preview shows expected payload (user msg + Project Rules + active sources, nothing else)

### P40 — Chat AI send/receive ✅
- Send a message, receive Claude's response, display in chat
- **Smoke:** Send a message, get a response back, conversation history persists

### P41 — AI suggestion → Canon Review pipeline ✅
- Claude-proposed structured canon changes land in Canon Review (never directly in Canon Bible)
- **Smoke:** Ask Claude to propose a canon addition, confirm it appears in Canon Review, approve it, confirm in Canon Bible

### P42 — AI canon search assistant ✅
- Natural language queries against approved canon ("what does Jordan know about the virus at S2E1?")
- Returns grounded answers with source citations (T-code, canon entry)
- Reads only approved canon_entries — no hallucination from general knowledge
- **Smoke:** Ask a question answerable from seeded canon, confirm answer cites the correct entry

### P43 — AI conflict detector ✅
- On demand before approving a canon proposal: Claude reviews it against existing locked entries and flags contradictions
- User still approves or ignores the flag
- Never runs automatically
- **Smoke:** Submit a proposal that contradicts a locked entry, run conflict check, confirm flag appears with the conflicting entry cited

### P44 — AI draft assistant in Writing Lab ✅
- Claude can see active Writing Lab draft and attached sources
- Assists with scene drafting, dialogue, continuity checks
- Suggestions only — nothing writes to canon without Canon Review
- **Smoke:** Open a draft with attached source, ask Claude a continuity question, confirm response references the source

### P45 — AI import assistant ✅
- During PImp, Claude suggests entry type and field mapping for ambiguous worldbuilding file entries
- Flags entries that look like duplicates of existing proposals
- User reviews and approves every suggestion before it stages
- **Smoke:** Import an ambiguous entry, confirm Claude suggests a type, confirm suggestion is editable before accepting

---

## UI Polish (deferred items from PPOL2)

### PPOL2b — UI Polish: deferred PPOL2 items ✅
- Six items deferred from PPOL2 as feature territory or substantial fixes — addressed here before P46-A
- Status bar missing from Canon Review proposals (PPOL2-02)
- Status bar missing from Writing Lab drafts (PPOL2-03)
- Canon Review deferred section hidden when filter = "Deferred only" — items appear in main list (PPOL2-06)
- Writing Lab missing "Pop out" button (PPOL2-11)
- Writing Lab missing linked-entries indicator (PPOL2-12)
- Search: Canon Bible hits route to page top, not matched entry (PPOL2-26)
- No new features. Fixes and consistency only.
- **Smoke:** Canon Review proposals show status bar; Writing Lab drafts show status bar; filter to "Deferred only" in Canon Review, confirm deferred items appear in deferred section not main list; Writing Lab entry has Pop out button and linked-entries indicator; search a Canon Bible term, click result, confirm page scrolls to matched entry

---

## AI open questions analyst — The Flanagan Filter

### P46-A — Flanagan Filter: foundation
- Analysis panel available as an action from any Open Questions entry
- Context pre-filled from entry (question text, tier, options) — user does not re-type
- Four scan modes selectable: **Editorial Filter** (Tier 1 five questions), **The Six Tensions** (Appendix A six diagnostic checks), **WWFD** (What Would Flanagan Do — Structural / Dialogue / Visual + Revival Anchor), **Full Diagnostic** (all three in sequence)
- WWFD "not ready" gate: if entry lacks scene-level context, surface a soft warning before running
- Tier of the question (Tier 1 / Tier 2) passed to Claude — analysis weights accordingly
- Analysis output: summary line (one sentence verdict + primary reason) at top, full breakdown below
- Named citations in output (e.g. "Question 5," "Tension 3," "Non-Negotiable Two") — traceable to document
- Confidence signal: Claude indicates clear verdict vs. genuine tension
- North Star check runs on every mode, every time
- Passive canon conflict flag: if question involves Canon Bible entities, surface a note that canon context is available but not auto-pulled
- Editable option labels before sending (e.g. "Option A" → descriptive label)
- Default scan mode persists per session
- Re-run with different mode: one-click after analysis returns, no re-entry required
- Keyboard shortcut to trigger analysis (consistent with PKEY)
- **Smoke:** Open a tier-1 question with two options; run Editorial Filter, confirm output has summary line + named citations + North Star check; run WWFD on an entry with thin context, confirm "not ready" gate fires; run Full Diagnostic, confirm all three modes appear in sequence

### P46-B — Flanagan Filter: save + history
- Save analysis to entry: one-click attach to the Open Questions entry as a record
- Each saved analysis tagged with scan mode + Flanagan document version used
- Collapsed analysis history section on the entry (same pattern as archive sections elsewhere)
- Analyses lock read-only when the question is resolved/closed
- "Reopen with new context" action: flags a saved analysis as stale and queues re-run (user-triggered only, never automatic)
- **Smoke:** Run an analysis, save it, confirm it appears in collapsed history with mode tag; resolve the question, confirm analysis locks; reopen question, use "reopen with new context," confirm stale flag appears

### P46-C — Flanagan Filter: routing + tags ✅
- One-click `→ Brainstorm` / `→ Research` on full analysis output and on each saved history card — creates new entry pre-filled with content and source attribution to the originating Open Question; link-don't-copy discipline
- Route stays on current workspace; "Sent to X — Open →" toast confirms and provides one-click jump to the target
- Highlight-extract-route (PUI3) wired to all analysis output text and to all chat message bodies — any selection opens the extract-and-route menu
- AI tag suggestions on save: Claude proposes up to 5 tags from existing library; user confirms or skips — never auto-applied
- **Smoke:** Run an analysis; route full output to Brainstorm, confirm new entry exists with attribution and CWA back-link to the Open Question; confirm toast appears with working "Open →" link; highlight a section of analysis text, route to Research, confirm entry; save analysis, confirm tag suggestions appear and require confirmation before applying; open a chat, select text in a message, confirm extract-and-route menu appears

---

## UI Polish (post-P46)

### PPOL3 — UI Polish: post-P46
- Print/PDF export for single entries: Source Material, Brainstorm, Research, Writing Lab, Open Questions analysis history
- No new features — print/PDF only
- **Smoke:** Print/PDF confirmed working from each listed workspace

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

## Chat routing

### PCHAT-ROUTE — Chat: route full chat to workspace ✅
- "Route →" button in chat toolbar opens a destination picker: Brainstorm, Research, Writing Lab, Documents, Open Questions, Canon Review, Decisions, Unsorted
- Creates a new entry in the target workspace with the full non-archived message transcript as the body, attributed to the source chat
- Archived messages are excluded from the routed transcript (same as Claude context exclusion)
- Route stays on current workspace; "Sent to X — Open →" toast confirms and provides one-click jump
- Highlight-extract-route (PUI3) also wired to individual chat message bodies for selective routing
- **Smoke:** Open a chat with messages, click "Route →", select Brainstorm, confirm new entry exists with full transcript and attribution; confirm toast appears; confirm archived messages are excluded from routed body; highlight text in a chat message, confirm extract-and-route menu appears

---

## Chat attachment expansion

### PCHAT-ATTACH — Chat attachment expansion
- Expand Chat attachment beyond Source Material to: Canon Bible entries, Characters entries, Episodes entries, Documents entries
- Same keep-active / next-message-only modes as Source Material
- Active attachments always visible — same transparency as Source Material
- Permitted list is fixed — no other workspaces attachable to Chat
- **Smoke:** Attach a Canon Bible entry to a chat message, confirm it's visible and active; attach a Character entry next-message-only, confirm it clears after send

---

## Home upgrade

### PHOME-NEEDS — Home: Needs Attention panel ✅
- Replace passive Home with actionable session-start surface
- **Needs Attention panel** surfaces priorities based on staleness + tier + blocking status:
  - Tier-1 Open Questions unresolved 14+ days
  - Conflicts open 30+ days
  - Canon Review proposals pending 7+ days
  - Episodes with no quiet devastation candidate
  - Characters with no arc entry for current season
- App surfaces priority list; user decides what to act on — no auto-routing, no auto-resolution
- Staleness thresholds configurable in Settings
- Recently Viewed moves to collapsed section below Needs Attention
- **Smoke:** Create stale items matching each category; confirm they appear in Needs Attention panel; adjust a threshold in Settings, confirm panel updates

---

## Chat history page

### PCHAT-HISTORY — Chat: dedicated history page
- Chat nav item opens a full two-column page (same layout pattern as all other workspaces)
- Left column: list of past chats sorted by most recent — title, date, last message preview line
- Right column: full read-only transcript of selected chat
- "Continue" button on right panel — opens that chat in the drawer as the active session
- "New Chat" button at top of left column — opens a fresh session in the drawer
- Drawer stays exactly as-is; this page is a history surface, not a replacement
- Archived chats visible in a collapsed section at the bottom of the left column (same pattern as other workspaces)
- **Smoke:** Open Chat page, confirm two-column layout; click a past chat, confirm full transcript renders read-only; click "Continue," confirm that chat opens in the drawer as the active session; click "New Chat," confirm a fresh session opens in the drawer; confirm archived chats appear in collapsed section

---

## Undo

### PUNDO — App-level undo ✅
- Cmd+Z undo for destructive actions: archive, delete, resolve, approve, reject
- Not for autosave content edits (draft preservation already handled)
- Undo history: last 20 actions, session-only (does not persist across restarts)
- Canon Bible lock/supersede/retire excluded — those have chain history
- Visual indicator in status bar when undo is available
- **Smoke:** Archive an entry, Cmd+Z, confirm it restores; delete an entry, Cmd+Z, confirm restore; approve a Canon Review proposal, confirm undo is NOT available (canon actions excluded)

---

## Writing Lab versioning

### PWLAB-VERSIONS — Writing Lab draft versioning
- Manual "save version" action — user decides when a version is worth keeping
- Named versions (user-supplied label: "Before the Diane rewrite")
- Side-by-side diff view between any two versions
- Restore from any prior version (with confirmation)
- Version history in collapsed section on the draft entry
- **Smoke:** Save three named versions of a draft; view two side by side; restore from version 1, confirm content reverts; confirm current version is preserved in history

---

## Session log

### PSESSION-LOG — Session / work log ✅
- Auto-generated log at session end (app close or explicit "end session" action)
- Records: entries created, entries approved/resolved/archived, canon changes made, analyses run — grouped by workspace
- Viewable from Settings or a dedicated log panel on Home
- Not editable — audit trail only
- Exportable as plain text
- **Smoke:** Perform actions across three workspaces; close app; confirm session log generates with correct entries; export log, confirm output

---

## Open Questions enhancements

### PBLOCK — Open Questions: blocking flag + escalation ✅
- **Blocking flag:** mark a question as blocking a named episode/character/arc. Surfaces in Needs Attention panel.
- **Tier escalation:** promote Tier-2 → Tier-1 with confirmation. Escalation logged in question history.
- **Promote to Decision:** when resolved, one-click creates a linked Decision entry pre-filled with the resolution and source question. Link-don't-copy.
- Migration 047 adds: `is_blocking`, `blocking_target`, `blocking_type`, `tier_escalated_at`, `tier_escalated_from` on `open_questions`; `source_question_id` on `decisions`.
- **Smoke:** Flag a question as blocking an episode, confirm it surfaces in Needs Attention; escalate a Tier-2 question, confirm tier badge updates and escalation is logged; resolve a question, promote to Decision, confirm linked Decision entry exists

---

## Brainstorm structure

### PBRAIN-STRUCT — Brainstorm internal structure
- **Thread / cluster:** group related entries under a named thread (collapsible, one level only)
- **"Developed into" link:** mark a brainstorm entry as developed into a specific entry in another workspace. Link-don't-copy. Bi-directional.
- **Status badges:** Rough / Developing / Ready to Route — user-set
- **Smoke:** Create a thread, add three entries to it, collapse and expand; mark an entry as developed into a Decision, confirm bi-directional link; set status badges on three entries, confirm badges visible in list

---

## Stale item nudges

### PSTALE — Stale item nudges
- Nav badge aging: badges show count + age of oldest unresolved item ("3 · 45d")
- Staleness indicator on list items not touched in 30+ days (subtle visual marker)
- Thresholds configurable in Settings (defaults: 14d Tier-1 questions, 30d conflicts, 7d Canon Review)
- Never auto-resolves or auto-archives — surfacing only
- **Smoke:** Create items and artificially age them in dev; confirm badges show age; confirm list item staleness markers appear; adjust threshold in Settings, confirm update

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

### PARC-A — Character arc tracker: written timeline
- Episode-by-episode structured list per character
- Shows: canon facts locked at this point in their arc, open questions unresolved at this point, decisions affecting them
- Read-only display generated from existing data — no new data entry
- Updates automatically as canon and episode entries change
- Filterable by character, season, arc status
- **Smoke:** Seed canon entries and episode entries for one character across S1; confirm written timeline generates correctly; make a canon change, confirm timeline updates

### PARC-B — Character arc tracker: visual timeline
- Horizontal scroll, season/episode markers on X axis
- Character state plotted at each marker
- Color-coded by character; multiple characters togglable
- Locked canon events: fixed markers; working/draft events: softer markers
- Click any marker to open the source entry
- **Smoke:** View visual timeline for two characters simultaneously; click a marker, confirm source entry opens; toggle a character off, confirm their markers hide

---

## Episode structure

### PEPISODE-STRUCT — Episode structure checklist
- Per-episode checklist panel derived from Flanagan Master episodic structure rules:
  - [ ] Cold open: in medias res
  - [ ] Act Two: rewatch-layer scene identified
  - [ ] Act Three: consequence scene present
  - [ ] Coda: quiet devastation candidate identified
  - [ ] Quiet devastation: satisfies structural signature
- Manually checked by user — not auto-evaluated
- AI-assist option: "Evaluate this episode against the checklist" — Claude reads episode entry + gives verdict per item. User confirms or overrides each.
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
- On-demand per episode entry: Claude reads episode content + linked character entries + relevant canon + prior episode entries
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

## Ongoing polish

### PPOL-ONGOING — Ongoing polish (open-ended)
- Permanent catch-all for polish items that surface after the full feature set is built and in active use
- Items logged in `POLISH_NOTES_ONGOING.md` as they are discovered
- No scope gate — this phase never closes
- Work through items in order; one Claude Code session per batch
- No new features — fixes, consistency, and rough edges only
- **Pattern:** Log item → batch with similar items → one session → mark resolved in POLISH_NOTES_ONGOING.md

---

## Deferred

Held until core feature set is stable and in active use.

- **Chat search** — search across all chat history by keyword
- **Chat pop-out** — dedicated window for Chat independent of main app
- **Chat plain-text export** — export a chat as a downloadable .txt or .md file (routing to workspaces covered by PCHAT-ROUTE ✅)
- **Additional Source file types** — OCR for scanned documents, PDF annotation
- **Performance optimization** — large dataset handling
- **Themes** — dark/light theme toggle
