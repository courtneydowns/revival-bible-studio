# Revival Studio — Feature Backlog

All features agreed in principle. Not yet sequenced into committed build phases.
Sequencing happens in `docs/BUILD_PLAN_ONGOING.md` when a feature is ready to build.

Items marked with a phase code are planned. Items without are agreed but not yet scoped to a phase.

---

## PSTALE — Stale item nudges

Passive age-awareness across the app for items that haven't been touched.

- **Nav badge aging:** badges on Canon Review, Conflicts, Open Questions show count + age of oldest unresolved item ("3 · 45d")
- **Staleness indicator on list items:** subtle visual marker on entries not touched in 30+ days
- **Thresholds configurable** in Settings (default: 14 days Tier-1 questions, 30 days conflicts, 7 days Canon Review)
- Never auto-resolves or auto-archives anything — surfacing only

---

## PDRAFT-LOCK — Character/Episode "locked for this draft" state

A "done for now" state distinct from archived.

- Draft Lock: marks a Character or Episode entry as stable for a named draft/season. Read-only until explicitly unlocked.
- Different from Canon Bible locking — this is working-document stability, not canonical truth
- Locked entries show a draft-lock badge; still visible, still searchable, not editable without unlocking
- Unlock requires confirmation + optional note ("unlocking for S2 development")

---

## PARC — Character arc tracker

Two views showing character arc over time across seasons/episodes. Both read from existing data — no new data entry required. Character status field (Active / Recurring / Departed / Deceased) feeds both views.

**Written timeline (PARC-A):**
- Episode-by-episode structured list per character
- What is canon for this character at this moment
- What open questions are unresolved at this point in their arc
- What decisions have been made that affect them
- Filterable by character, season, arc status

**Visual timeline (PARC-B):**
- Horizontal scroll, season/episode markers on X axis
- Character state plotted at each marker
- Color-coded by character; multiple characters togglable
- Locked canon events shown as fixed markers; working/draft events shown as softer markers
- Click any marker to open the source entry

---

## PEPISODE-STRUCT — Episode structure checklist

Per-episode production checklist derived from the Flanagan Master episodic structure rules.

For each episode entry, a checklist panel showing:
- [ ] Cold open: in medias res (not a recap)
- [ ] Act Two: at least one rewatch-layer scene identified
- [ ] Act Three: consequence scene present
- [ ] Coda: quiet devastation candidate identified and named
- [ ] Quiet devastation: satisfies structural signature (mundane action, subtext not text, camera holds)

Checklist items are manually checked by the user — not auto-evaluated.
AI-assist option: "Evaluate this episode against the checklist" — Claude reads the episode entry and gives a verdict per item. User confirms or overrides each.

---

## PQUIET — Quiet devastation tracker

Dedicated tracker for the Flanagan Master's locked quiet devastation requirement.

- Per-episode status: No candidate / Candidate identified / Locked
- Four pre-seeded locked quiet devastations from THE_FLANAGAN_MASTER (Episodes 1, 4, 6, 8) — seeded at migration, not editable
- Add candidate: link to a Writing Lab draft, scene note, or freeform description
- Lock a quiet devastation: marks it as final, read-only
- Dashboard view: all 24 episodes in a grid showing QD status at a glance
- Surfaces in Needs Attention panel for any episode without a candidate

---

## PLOCKED-SPECIFICS — Locked specifics reference panel

Passive reference layer surfacing the non-negotiable locked items from THE_FLANAGAN_MASTER in relevant workspaces.

Locked specifics include:
- Two physical markers only (T-015): pupil response anomaly + vascular discoloration
- Mirror motif (T-227): inverse deployment rules
- Virus-is-not-a-metaphor standing rule
- The Spirituality Principle
- The Found Family Principle
- Jordan's no-arrest rule
- The closing line ("I tried. I'm still trying." — lands on "trying")
- Recovery Authenticity Mandate

**Where it surfaces:**
- Characters entries (character-relevant specifics only)
- Episodes entries (all applicable)
- Writing Lab drafts (all applicable)
- Canon Bible entries in Edit Mode (all applicable)
- Canon Review proposals (passive check before approving)

Displayed as a collapsed reference panel — not modal, not blocking. Always available, never intrusive. User reads and applies; no auto-enforcement.

---

## PEPISODE-CONT — AI episode continuity checker

AI-powered check for episode-level arc and timeline inconsistencies — distinct from Canon Bible contradiction detection.

- On-demand per episode entry: Claude reads the episode content + linked character entries + relevant canon + prior episode entries
- Reads character status field (Active / Recurring / Departed / Deceased) to flag state inconsistencies
- Flags: timeline contradictions, character state inconsistencies ("Jordan appears here but his S1E2 arc suggests he's gone"), arc breaks
- Results surface as a list of flagged items with source citations
- User reviews each flag; can route to Conflicts, Open Questions, or dismiss
- Never auto-resolves; never touches canon
- Runs only when user explicitly triggers it

---

## PRESEARCH-CITE — Research source citation

Research entries get a structured source field.

- Source field: freeform text OR link to a Source Material entry (picker)
- If linked to Source Material: bi-directional visibility
- Citation visible on list item preview
- Filterable: filter Research by cited vs. uncited
- Exportable: Research export includes citation field

---

## PEMPTY-STATE — Empty state + onboarding ✓ complete

First-launch and empty workspace experience.

- Empty state copy for every workspace: what it's for, what to do first
- First-session guide: a non-modal walkthrough available from Home on first launch
- "Start here" suggested sequence: Settings (API key + Project Rules) → Source Material → Canon Bible → Open Questions
- Dismissable; never re-surfaces after dismissed
- Not a tutorial — a one-page orientation

---

## PHEALTH — App health indicator

Lightweight database and app health display in Settings.

- Migration count and last migration run
- SQLite file size
- Record counts by workspace (passive, read-only)
- Orphan detection: flag any orphaned records (linked entries whose parent no longer exists)
- One-click orphan cleanup (with confirmation and preview of what will be removed)

---

## PCONFIG-BACKUP — Settings config backup/restore ✅ complete

Export and restore app configuration separately from data.

- Export: Project Rules text, staleness thresholds, tag library (user-created only). API key excluded for security.
- Import: restore config from export file
- Separate from Panic Export (which covers data)
- Useful for machine migration or recovery from a broken state

---

## PPOL3 — UI Polish: post-PBRAIN-STRUCT

Polish pass for items accumulated since PPOL2b.

- Print/PDF export for single entries: Source Material, Brainstorm, Research, Writing Lab, Open Questions analysis history
- Log all items in `POLISH_NOTES_ONGOING.md` during smoke tests
- No new features — polish and print/PDF only

---

## PFLAN-EXPAND — Flanagan Filter: workspace expansion

Expand the Flanagan Filter (currently scoped to Open Questions in P46-A/B/C) to all workspaces where creative/narrative decisions are made.

**Full five-mode filter (Editorial Filter, Six Tensions, WWFD, Full Diagnostic, Production Check):**
- Brainstorm entries
- Writing Lab drafts
- Characters entries
- Episodes entries
- Canon Review proposals (before approving)
- Canon Bible entries (Edit Mode only — full filter, all five modes)

**Lightweight filter (Editorial Filter + North Star only):**
- Conflicts entries — "does resolving this conflict this way serve the show?"
- Decisions entries — North Star check on a recorded decision

**Not available on:** Source Material, Documents (via PDOC-WIRE separately), Research, Unsorted, Settings, Chat, Home.

**Production Check (fifth scan mode):**
- Tier 3 of THE_FLANAGAN_MASTER only: camera positions, color palette, sound philosophy, performance direction, location design, episodic structure
- "Not ready" gate: Tier 3 is only meaningful when scene/visual content exists to evaluate
- Named citations: "Camera Rule One," "Companion Position," "Music Rule," etc.
- Available everywhere the full filter lives
- Kept separate from Full Diagnostic (Full Diagnostic = Editorial Filter + Six Tensions + WWFD; Production Check is its own mode)

---

## PAI-WIRE — Cross-AI routing

Wire AI features so their outputs can trigger other AI actions or Canon Review proposals without workspace-hopping.

**Four connections:**

1. **P44 (draft assistant) → P41 (Canon Review pipeline)**
   - Claude notices a canon fact in a Writing Lab draft conversation
   - Flags it in the response; user confirms; routes to Canon Review with draft attribution
   - No automatic routing — flag surfaces, user decides

2. **P42 (canon search) → P43 (conflict detector)**
   - From a P42 search result, one-click to run P43 conflict check against that specific entry
   - No workspace switch required

3. **P46 (Flanagan Filter) → P41 (Canon Review)**
   - Analysis recommends an option involving a canon fact
   - "Propose to Canon Review" action on analysis output, pre-filled with recommended option + analysis as supporting context

4. **P45 (import assistant) → P43 (conflict detector)**
   - Import assistant flags a possible duplicate
   - One-click from the flag to run conflict check against the suspected duplicate before staging

**Pattern:** AI outputs trigger other AI actions or Canon Review proposals in one step, with full attribution. No workspace-hopping.

---

## PDOC-WIRE — Documents workspace wiring

Documents is currently isolated. Wire it as a first-class workspace.

- Attachable to Chat (same modes as Source Material: keep active / next message only)
- Added to highlight-extract-route target list
- Linkable to Characters and Episodes entries (same picker pattern as P36)
- Flanagan Filter available (full five modes — Documents often holds treatments, scene notes, series documents)
- Canon proposal path: select text in a Document → propose to Canon Review with Document attribution
- Documents attachable to Decisions, Open Questions, Conflicts as supporting reference

---

## PUNDO — App-level undo

Cmd+Z undo for destructive actions across the app.

- Scope: archive, delete, resolve, approve, reject actions
- Not for autosave content edits (autosave already handles draft preservation)
- Undo history: last 20 actions, session-only (does not persist across app restarts)
- Canon Bible actions (lock, supersede, retire) excluded — those have their own chain history
- Visual indicator in status bar when undo is available

---

## PWLAB-VERSIONS — Writing Lab draft versioning

Version history for Writing Lab drafts, analogous to PHIST for Canon Bible.

- Manual "save version" action (not automatic — user decides when a version is worth keeping)
- Named versions ("Before the Diane rewrite," "S1E4 draft 2")
- Side-by-side diff view between any two versions
- Restore from any prior version (with confirmation)
- Version history in collapsed section on the draft entry

---

## PSESSION-LOG — Session / work log

A persistent log of what happened in each working session.

- Auto-generated at session end (app close or explicit "end session" action)
- Records: entries created, entries approved/resolved/archived, canon changes made, analyses run
- Grouped by workspace
- Viewable in Settings or as a dedicated log panel
- Not editable — audit trail only
- Exportable as plain text

---

## PBLOCK — Open Questions: blocking flag + escalation

- **Blocking flag:** mark a question as "blocking" — cannot move forward on a named episode/character/arc until resolved. Surfaces in Needs Attention panel.
- **Tier escalation:** promote a Tier-2 question to Tier-1 when stakes change. Requires confirmation. Escalation logged in question history.
- **Promote to Decision:** when an Open Question is resolved, one-click to create a linked Decision entry pre-filled with the resolution and the question as source. Link-don't-copy.

---

## PBRAIN-STRUCT — Brainstorm internal structure

Brainstorm is currently a flat list. Add lightweight structure without adding complexity.

- **Thread / cluster:** group related brainstorm entries under a named thread (collapsible). No hierarchy beyond one level.
- **"Developed into" link:** mark a brainstorm entry as developed into a specific entry in another workspace (Decisions, Open Questions, Writing Lab, etc.). Link-don't-copy. Bi-directional.
- **Status badges:** Rough / Developing / Ready to Route — user-set, not auto-assigned.

---

## PDECISION-PROMOTE — Decisions: promote to Canon Review

One-click "Promote to Canon Review" action on any Decision entry.

- Creates a Canon Review proposal pre-filled with the decision content
- Back-link to the source Decision — link-don't-copy
- Source Decision shows a passive indicator that a Canon Review proposal exists
- Same approval discipline as all other Canon Review paths — no direct write to Canon Bible
- Available on all Decision entries regardless of status badge (Open / Tentative / Final)

---

## PDECISION-STATUS — Decision status badges

- Status field on every Decision entry: **Open / Tentative / Final** — user-set
- Visible as a badge on list items and detail panel
- Filterable: filter Decisions by status
- Makes the Decisions workspace actionable as a record of what is settled vs. still live

---

## PCANON-CONFIDENCE — Canon entry confidence level

- Confidence field on every canon entry: **Confirmed / Probable / Speculative**
- Distinct from lock status: lock = approved for now; confidence = how certain this will hold
- Passive badge on list items and detail panel — no workflow gate, no approval required
- Filterable in Canon Bible browse

---

## PCANON-DIFF — Canon edit diff on save

- When saving an edit to a canon entry in Edit Mode, show a before/after diff before the save completes
- User must confirm the diff before changes persist
- Applies to all field edits on canon entries
- One more deliberate friction point to prevent accidental canon mutation

---

## PCANON-AFFECTED — Affected-by reverse lookup on superseded entries

- When viewing a retired or superseded canon entry, a read-only panel shows all downstream entries (Characters, Episodes, Decisions) that were linked to it at the time it was retired
- Prevents stale links from going unnoticed when canon changes
- Panel is collapsed by default; expandable on click

---

## PCONFLICT-SEV — Conflict severity badge

- Severity field on every Conflicts entry: **Minor / Significant / Blocking** — user-set
- Visible as a badge on list items and detail panel
- Filterable in Conflicts list
- **Blocking** conflicts surface in the Needs Attention panel
- Prevents the Conflicts list from becoming an undifferentiated pile as it grows

---

## PWLAB-CANON-COMPARE — Writing Lab draft vs. canon comparison

On-demand AI check of the active Writing Lab draft against the full Canon Bible.

- User triggers from the draft — never runs automatically
- Claude reads the draft body + all locked canon entries
- Surfaces any draft details that diverge from locked canon
- Results as a flagged list with source citations (canon entry + draft location)
- User reviews each flag; can route to Conflicts or Open Questions, or dismiss
- Distinct from PEPISODE-CONT (episode-scoped); this is draft-scoped against the full Canon Bible

---

## PWLAB-SECTIONS — Writing Lab scene/section markers

Lightweight named dividers within a Writing Lab draft body.

- User inserts a named section marker ("--- Act Two ---") anywhere in the draft
- Section names appear in a jump-to list on the draft detail panel
- Click a section name to scroll to it within the draft
- No hierarchy — flat list of named anchors only
- Not an outline system; does not create separate entries

---

## PCHAR-STATUS — Character status field

- Status field on every Character entry: **Active / Recurring / Departed / Deceased** — user-set
- Visible as a badge on list items and detail panel
- Filterable in Characters list
- Feeds the character arc tracker (PARC-A / PARC-B) and episode continuity checker (PEPISODE-CONT) with state they currently have to infer

---

## PEPISODE-STATUS — Episode status field

- Status field on every Episode entry: **Outline / Draft / Locked** — user-set
- Visible as a badge on list items and detail panel
- Filterable in Episodes list
- Feeds Needs Attention panel (episodes still at Outline stage surface there)

---

## PEPISODE-PREVON — "Previously on" canon snapshot

- On any Episode entry, one-click generates a read-only summary of what canon facts are locked as of the prior episode
- Generated from existing canon data — no new input required
- Useful reference when drafting: "what does the audience know at the start of this episode?"
- Displayed in a collapsed panel on the episode detail; exportable as plain text

---

## PRESEARCH-USED — Research "Used in" indicator

- Passive indicator on every Research entry showing whether it has been linked or routed anywhere
- Shows as a subtle badge on list items ("linked" vs. "unused")
- Filterable: filter Research by used vs. unused
- Surfaces orphaned research that was gathered but never applied

---

## PSCATCHPAD — Entry-level scratchpad

Lightweight freeform scratchpad available on every entry across all workspaces.

- Collapsed by default — does not clutter the detail panel
- Freeform text, not autosaved to the entry body
- Not canon, not routable, not exportable as part of the entry
- For thinking out loud, temp notes, questions to self
- Persists with the entry (survives app restarts) but is clearly distinct from the entry body

---

## ✅ PSESSION-RESUME — Session resume on launch

- On app launch, surface the last entry the user had open rather than defaulting to Home
- Zero clicks to get back into flow
- If the last entry was deleted or archived since last session, fall back to Home
- Opt-out available in Settings for users who prefer to start at Home

---

## PBREADCRUMB — Back-reference breadcrumb

- When clicking through to an entry from a linked-entries panel or back-reference, a one-line breadcrumb appears at the top of the detail panel showing where you came from ("← Jordan (Characters)")
- Single back-step only — clicking the breadcrumb returns to the origin entry
- No deep history stack; breadcrumb clears on any other navigation action

---

## ✅ PWHERE-REF — "Where is this referenced?" panel

Expands the existing linked entries indicator into a full read-only reference panel.

- Click the linked entries indicator on any entry to expand a panel listing every workspace and entry that references this one
- Grouped by workspace
- Each item is a click-through to the referencing entry
- Read-only — no actions in this panel
- Useful once the web of cross-workspace links gets dense

---

## PNAV-ACTIVITY — Workspace activity indicator

- Subtle visual signal on each nav item showing when you were last active in that workspace
- Not a badge count — a recency indicator only (e.g. a faint dot or muted timestamp)
- Aids reorientation at session start without cluttering the nav
- Does not surface entry counts or queue depths — that belongs to the existing badge system

---

## PKEYSHEET — Keyboard shortcut cheat sheet

- Cmd+? opens a non-modal overlay listing all keyboard shortcuts in the app
- One-screen layout, organized by context (Global, Canon Bible, Queues, Navigation, etc.)
- Dismissable with Escape or Cmd+?
- No new shortcuts added — surfaces what PKEY already built
- Discoverable from the Help menu as well

---

## PPALETTE-RECENTS — Command palette recents

- Last 5 entries opened appear at the top of the Cmd+K command palette before the user types
- Labeled "Recent" with workspace context ("Jordan — Characters", "S1E4 — Episodes")
- Clears on app quit (session-scoped)
- Typing in the palette immediately hides recents and shows search results

---

## PROUTE-HISTORY — "Send to" picker history

- The last 3 destinations routed to appear at the top of the highlight-extract-route picker
- Labeled "Recent" above the full destination list
- Reduces repetitive clicking during active routing sessions
- History is session-scoped — clears on app quit

---

## POQ-DEPENDS — Open Question dependencies

- Mark one Open Question as "depends on" another Open Question
- Dependency shown as a soft block indicator on the dependent question's list item ("blocked by: [Q title]")
- Dependency is one-directional — the blocking question is not affected
- Blocked questions surface with reduced visual priority in the list while the blocker is unresolved
- Removing the dependency requires confirmation; does not affect either question's content

---

## PCHAT-ATTACH — Chat attachment expansion ✅

Expand Chat attachment beyond Source Material to a defined permitted list.

**Permitted additions (keep active / next message only, same modes as Source Material):**
- Canon Bible entries
- Characters entries
- Episodes entries
- Documents entries

**Not permitted in Chat:** Unsorted, Brainstorm, Research, Open Questions, Conflicts, Decisions (too noisy; use highlight-extract-route to bring content into those workspaces instead).

Active attachments visible at all times. Same "what Claude is using" transparency as Source Material.

---

## PAI-TAGS — AI tag suggestions: app-wide

Extend the AI tag suggestion pattern established in P46-C to all workspaces and Canon Review proposals.

- On any entry in any workspace, Claude proposes relevant tags from the existing tag library
- Also available on Canon Review proposals
- User can accept, remove, or add tags manually before anything is applied — never auto-applied
- Tag suggestions are triggered on demand (e.g. "Suggest tags" button on the entry), not automatic
- Proposed tags draw from the existing seeded tag library only — no new tags created without user action
- Consistent with the approval discipline used everywhere: AI suggests, human confirms
- **Workspaces covered:** Unsorted, Source Material, Documents, Characters, Episodes, Writing Lab, Open Questions, Conflicts, Decisions, Brainstorm, Research, Canon Bible entries, Canon Review proposals

---

## PPOL2b-SEARCH — Inline search/filter on all workspace left columns

**Tool:** CLI — new filter component, touches all 13 workspace left-column lists.

All 13 workspace left-column lists currently have no local text filter. Moved here from POLISH_NOTES_ONGOING.md (was PPOL2b-S01–S13).

- Add a text input above the left-column list in every workspace to narrow visible entries by title or body text
- Local filter only — no API call, no global search (PSEARCH covers that)
- Filter is instant/live as the user types; clears on workspace navigation
- **Workspaces:** Unsorted, Source Material, Documents, Open Questions, Conflicts, Decisions, Brainstorm, Research, Characters, Episodes, Writing Lab, Canon Bible (title keyword only — P42 covers semantic), Canon Review proposals
- Canon Bible note: P42 covers semantic queries; this fills the gap for quick title-keyword narrowing of the visible list

---

## PAI-TAG-SUGGEST-EDIT — AI tag suggestions with pre-apply editing

**Tool:** VS Code ext.
**Requires:** PAI-TAGS (must be built first)

- AI proposes tags from the existing library — same as PAI-TAGS
- Before confirming, user can edit the proposed tag set: remove individual suggestions, add tags manually, rename displayed tag (render-layer only)
- Edit step is always present — not skippable — so no tag is ever applied without deliberate review
- Applies to all workspaces covered by PAI-TAGS
- AI suggests; human edits and confirms. No tag auto-applied.

---

## PAI-STATUS-SUGGEST — AI-suggested status values

**Tool:** VS Code ext.

- **Decisions:** suggests Open / Tentative / Final based on language, resolution clarity, and linked context
- **Open Questions:** suggests Tier 1 / 2 / 3 based on stakes and dependencies
- **Brainstorm:** suggests Rough / Developing / Ready to Route based on content maturity
- **Episodes:** suggests Outline / Draft / Locked based on completeness signals
- Trigger: "Suggest status" button on the entry detail panel — never automatic
- User confirms or overrides; suggestion is never applied silently
- AI suggests; human approves.

---

## PAI-BLOCK-SUGGEST — AI-suggested blocking relationships between Open Questions

**Tool:** VS Code ext.
**Requires:** POQ-DEPENDS ✅

- Trigger: "Suggest dependencies" button on any Open Question, or a batch mode from the OQ workspace toolbar
- Claude reads question text, tier, and linked context; suggests directed dependency pairs
- Each suggestion shown as: "Q14 should block Q22 — reason: [one-line rationale]"
- User confirms or dismisses each pair individually; no dependency created without confirmation
- Integrates with POQ-DEPENDS — confirmed suggestions create the dependency link
- AI suggests; human approves.

---

## PAI-ENTRY-ROUTE-SUGGEST — AI-suggested workspace routing on entry creation

**Tool:** VS Code ext.

- Trigger: "Where should this go?" button in quick-capture modal and Unsorted entry detail
- Claude reads the entry title + body and recommends a destination workspace with a one-line reason
- User routes or dismisses; suggestion does not move anything automatically
- Complements the existing highlight-extract-route and Unsorted route action
- AI suggests; human routes.

---

## PAI-RELATIONSHIP-SUGGEST — AI-suggested cross-workspace links

**Tool:** CLI — cross-table reads + link creation across workspaces.

- Trigger: "Suggest links" button on any entry detail panel
- Claude reads the entry content and returns a short list of candidate entries (title + workspace + one-line reason)
- User accepts or dismisses each suggestion individually; no link created without confirmation
- Applies to: Characters, Episodes, Decisions, Open Questions, Conflicts, Brainstorm, Research, Canon Bible entries
- AI suggests; human links.

---

## PAI-METADATA-AUDIT — AI metadata audit: batch fill missing fields

**Tool:** CLI — cross-entry scan + batch UI, touches all workspaces.

- Trigger: "Audit metadata" action from workspace toolbar or Settings
- Surfaces entries missing: status, tier, tags, confidence level, severity — whichever fields apply to that workspace
- Results shown as a reviewable list; user fills in each field or skips
- AI may pre-populate suggestions inline (status, tags, tier) — user confirms or overrides each before anything is written
- Never writes metadata without explicit per-field confirmation
- Scope: one workspace at a time; no cross-workspace batch

---

## PAI-CONFIDENCE-SUGGEST — AI-suggested confidence level on canon entries

**Tool:** VS Code ext.
**Requires:** PCANON-CONFIDENCE ✅

- Trigger: "Suggest confidence" button on any canon entry detail panel (Edit Mode)
- Claude reads the entry body, linked source material, and supporting decisions; reasons about how certain this canon fact is
- Returns: recommended level + one-paragraph rationale
- User confirms or overrides; nothing applied without confirmation
- Pairs with PCANON-CONFIDENCE (confidence field must exist before this is buildable)
- AI suggests; human approves.

---

## PBLOCK-LABEL — Specific blocking/blocked labels on entries

**Tool:** VS Code ext — display-layer only, no schema changes.
**Requires:** PBLOCK ✅, PCONFLICT-SEV ✅, POQ-DEPENDS ✅

- **Blocking OQ (POQ-DEPENDS):** "Blocked by: [Q title]" on dependent question; "Blocking: [Q title]" on the blocker
- **Blocking flag (PBLOCK):** "Blocking: [named episode/character/arc]" — the named target is already stored; surface it in the badge
- **Blocking Conflict (PCONFLICT-SEV):** "Blocking: [linked entry title or freeform description]" on list item badge and detail panel
- Applies everywhere a blocking/blocked state is rendered: list item badges, detail panel indicators, Needs Attention panel entries
- Display-layer change only — no schema changes required

---

## PBLOCK-CROSS — Cross-workspace blocking relationships

**Tool:** VS Code ext / CLI — new blocking field + picker, multi-file.
**Requires:** PBLOCK-LABEL

- Any entry in Decisions, Brainstorm, Canon Bible (Edit Mode), Characters, or Episodes can be marked as blocking a named target (episode, character, arc, draft, or another entry via picker)
- Blocking entries surface in Needs Attention panel with specific label (see PBLOCK-LABEL)
- Removing a blocking relationship requires confirmation
- Link-don't-copy — blocked target is a reference, not a copy
- Bi-directional visibility: the blocked entry shows what is blocking it; the blocker shows what it is blocking

---

## PBLOCK-DASHBOARD — Blocking dashboard

**Tool:** CLI — new panel on Home.
**Requires:** PBLOCK-CROSS, PBLOCK-LABEL

- Grouped by workspace; each item is a click-through to the entry
- Shows: blocker title, workspace, what it's blocking, age of the block
- Filters: Blocking only / Blocked only / All
- Sits within or alongside the Needs Attention panel on Home
- Never auto-resolves anything — display only

---

## PBLOCK-RESOLVE-PROMPT — Blocking resolution prompt

**Tool:** VS Code ext — event hook on resolve/archive handlers.
**Requires:** PBLOCK-CROSS

- Prompt: "This was blocking [X] — do you want to review or update [X]?"
- One-click navigation to the downstream entry from the prompt
- Dismiss without action always available — no forced workflow
- Applies to: OQ resolved (POQ-DEPENDS), Conflict severity changed away from Blocking, blocking flag cleared (PBLOCK), cross-workspace block cleared (PBLOCK-CROSS)

---

## PBLOCK-HISTORY — Blocking history on entries

**Tool:** CLI — new collapsed log across all workspaces.
**Requires:** PBLOCK-CROSS

- Records: what this entry has blocked or been blocked by, including resolved relationships
- Each record: relationship type, other entry title + workspace, date set, date resolved (if resolved)
- Read-only — not editable
- Collapsed by default; expandable on click; matches archive section pattern

---

## PCHAT-SEARCH — Chat history search

**Tool:** CLI — new search module across chat tables.

- Search across all chat history by keyword
- Results show chat title + matching message preview; click-through opens that chat at the matched message
- Scoped to current project chats only

---

## PCHAT-EXPORT — Chat plain-text export

**Tool:** VS Code ext — export action on existing chat toolbar.

- Export any chat as a downloadable .txt or .md file
- Includes: chat title, date, all messages with role labels (You / Claude), attachments noted inline
- Distinct from PCHAT-ROUTE (which routes content to workspaces); this is a file download

---

## Deferred

Held until core feature set is stable and in active use.

- **Chat pop-out** — dedicated window for Chat independent of main app
- **Additional Source file types** — OCR for scanned documents, PDF annotation
- **Performance optimization** — large dataset handling
- **Themes** — dark/light theme toggle

---

*Last updated: June 9, 2026. Sequencing is not implied by order in this document.*
