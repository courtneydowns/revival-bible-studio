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
- **Smoke:** Attach a Canon Bible entry to a chat message, confirm it's visible and active; attach a Character entry next-message-only, confirm it clears after send

---

## Status fields

### PCHAR-STATUS — Character status field ✅
- Add **Active / Recurring / Departed / Deceased** status field to every Character entry
- Visible as a badge on list items and detail panel
- Filterable in Characters list
- Feeds character arc tracker and episode continuity checker
- **Smoke passed.**

### PEPISODE-STATUS — Episode status field
- Add **Outline / Draft / Locked** status field to every Episode entry
- Visible as a badge on list items and detail panel
- Filterable in Episodes list
- Feeds Needs Attention panel (Outline-stage episodes surface there)
- **Smoke:** Set status on three episodes; filter by Outline, confirm only Outline episodes show; confirm badge visible in list and detail panel

### PDECISION-STATUS — Decision status badges
- Add **Open / Tentative / Final** status field to every Decision entry
- Visible as a badge on list items and detail panel
- Filterable in Decisions list
- **Smoke:** Set status on three decisions; filter by Final, confirm only Final decisions show; confirm badge visible in list and detail panel

---

## Decisions → Canon Review

### PDECISION-PROMOTE — Decisions: promote to Canon Review
- "Promote to Canon Review" action on any Decision entry
- Creates a Canon Review proposal pre-filled with the decision content and a back-link to the source Decision
- Source Decision shows a passive indicator that a proposal exists
- Link-don't-copy — same discipline as all other Canon Review paths
- **Smoke:** Promote a Decision to Canon Review; confirm proposal appears in Canon Review with source attribution; confirm back-link indicator on source Decision; approve proposal, confirm it lands in Canon Bible

---

## Canon Bible enhancements

### PCANON-CONFIDENCE — Canon entry confidence level
- Add **Confirmed / Probable / Speculative** confidence field to every canon entry
- Distinct from lock status — passive badge only, no workflow gate
- Visible on list items and detail panel
- Filterable in Canon Bible browse
- **Smoke:** Set confidence on three entries; filter by Speculative, confirm results; confirm badge visible in list and detail

### PCANON-DIFF — Canon edit diff on save
- When saving an edit to a canon entry in Edit Mode, show a before/after diff before the save completes
- User must confirm the diff before changes persist
- **Smoke:** Edit a canon entry, confirm diff appears before save; confirm save completes on confirmation; confirm cancel aborts the change

### PCANON-AFFECTED — Affected-by reverse lookup on superseded entries
- When viewing a retired or superseded canon entry, a collapsed read-only panel lists all downstream entries (Characters, Episodes, Decisions) that were linked to it at time of retirement
- **Smoke:** Link a Character and a Decision to a canon entry; supersede the entry; view the retired version; confirm both linked entries appear in the affected-by panel

---

## Conflicts enhancements

### PCONFLICT-SEV — Conflict severity badge
- Add **Minor / Significant / Blocking** severity field to every Conflicts entry — user-set
- Visible as a badge on list items and detail panel
- Filterable in Conflicts list
- Blocking conflicts surface in the Needs Attention panel
- **Smoke:** Set severity on three conflicts; filter by Blocking, confirm results; set one to Blocking, confirm it appears in Needs Attention panel

---

## Stale item nudges

### PSTALE — Stale item nudges
- Nav badge aging: badges show count + age of oldest unresolved item ("3 · 45d")
- Staleness indicator on list items not touched in 30+ days (subtle visual marker)
- Thresholds configurable in Settings (defaults: 14d Tier-1 questions, 30d conflicts, 7d Canon Review)
- Never auto-resolves or auto-archives — surfacing only
- **Smoke:** Create items and artificially age them in dev; confirm badges show age; confirm list item staleness markers appear; adjust threshold in Settings, confirm update

---

## Open Questions enhancements

### POQ-DEPENDS — Open Question dependencies
- Mark one Open Question as "depends on" another
- Dependency shown as a soft block indicator on the dependent question's list item
- Blocked questions surface with reduced visual priority while the blocker is unresolved
- Removing the dependency requires confirmation
- **Smoke:** Mark Q2 as depending on Q1; confirm block indicator on Q2; resolve Q1; confirm block indicator clears from Q2

---

## Writing Lab enhancements

### PWLAB-SECTIONS — Writing Lab scene/section markers
- User inserts named section markers within a draft body
- Section names appear in a jump-to list on the draft detail panel
- Click a section name to scroll to it within the draft
- No hierarchy — flat named anchors only
- Word count and scene/section count shown passively in status bar
- **Smoke:** Insert three section markers; confirm jump-to list appears with all three; click each, confirm scroll; confirm section count in status bar

### PWLAB-CANON-COMPARE — Writing Lab draft vs. canon comparison
- On-demand action from any Writing Lab draft: Claude reads the draft body and surfaces details that diverge from locked canon entries
- Results as a flagged list with source citations (canon entry + approximate draft location)
- User reviews each flag; can route to Conflicts or Open Questions, or dismiss
- Never runs automatically; never touches canon
- **Smoke:** Write a draft with a deliberate canon divergence; run comparison; confirm flag surfaces with correct canon entry cited; route flag to Conflicts, confirm entry created; dismiss another flag, confirm it clears

---

## Episode enhancements

### PEPISODE-PREVON — "Previously on" canon snapshot
- On any Episode entry, one-click generates a read-only summary of what canon facts are locked as of the prior episode
- Generated from existing canon data — no new input required
- Displayed in a collapsed panel on the episode detail
- Exportable as plain text
- **Smoke:** Seed canon entries across two episodes; open Episode 2; generate "Previously on"; confirm summary reflects only canon locked as of Episode 1; export, confirm output

---

## Research enhancements

### PRESEARCH-USED — Research "Used in" indicator
- Passive badge on every Research entry showing whether it has been linked or routed anywhere ("linked" vs. "unused")
- Filterable: filter Research by used vs. unused
- **Smoke:** Create three Research entries; link one to a Character; route one to Brainstorm; confirm linked and routed entries show "linked" badge; confirm third shows "unused"; filter by unused, confirm only third appears

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
- Reads character status field
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

## Deferred

Held until core feature set is stable and in active use.

- **Chat search** — search across all chat history by keyword
- **Chat pop-out** — dedicated window for Chat independent of main app
- **Chat plain-text export** — export a chat as a downloadable .txt or .md file (routing to workspaces covered by PCHAT-ROUTE ✅)
- **Additional Source file types** — OCR for scanned documents, PDF annotation
- **Performance optimization** — large dataset handling
- **Themes** — dark/light theme toggle
