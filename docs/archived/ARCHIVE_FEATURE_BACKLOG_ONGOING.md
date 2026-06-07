# Revival Studio — Feature Backlog

All features agreed in principle. Not yet sequenced into committed build phases.
Sequencing happens in `docs/BUILD_PLAN_ONGOING.md` when a feature is ready to build.

Items marked with a phase code are planned. Items without are agreed but not yet scoped to a phase.

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

## PCHAT-ATTACH — Chat attachment expansion

Expand Chat attachment beyond Source Material to a defined permitted list.

**Permitted additions (keep active / next message only, same modes as Source Material):**
- Canon Bible entries
- Characters entries
- Episodes entries
- Documents entries

**Not permitted in Chat:** Unsorted, Brainstorm, Research, Open Questions, Conflicts, Decisions (too noisy; use highlight-extract-route to bring content into those workspaces instead).

Active attachments visible at all times. Same "what Claude is using" transparency as Source Material.

---

## PHOME-NEEDS — Home: Needs Attention panel

Replace passive Home with an actionable session-start surface.

- **Needs Attention panel:** surfaced priorities based on staleness + tier + blocking status
  - Tier-1 Open Questions unresolved for 14+ days
  - Conflicts open for 30+ days
  - Canon Review proposals pending for 7+ days
  - Episodes with no quiet devastation candidate
  - Characters with no arc entry for the current season
- App surfaces the priority list; user decides what to act on — no auto-routing
- Staleness thresholds configurable in Settings
- Replaces "Recently Viewed" as primary Home content (Recently Viewed moves to a collapsed section)

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

Two views showing character arc over time across seasons/episodes.

**Visual timeline:**
- Horizontal scroll, season/episode markers on X axis
- Character state plotted at each marker (key canon facts, arc status, open questions)
- Color-coded by character
- Locked canon events shown as fixed markers; working/draft events shown as softer markers
- Click any marker to open the source entry

**Written timeline:**
- Episode-by-episode structured list for each character
- What is canon for this character at this moment
- What open questions are unresolved at this point in their arc
- What decisions have been made that affect them

Both views are read-only displays generated from existing data — no new data entry required. Updates automatically as canon and episode entries change.

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
- Four pre-seeded locked quiet devastations from THE_FLANAGAN_MASTER (Episodes 1, 4, 6, 8)
- Add candidate: link to a Writing Lab draft, Scene note, or freeform description
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

## PEMPTY-STATE — Empty state + onboarding

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

## PCONFIG-BACKUP — Settings config backup/restore

Export and restore app configuration separately from data.

- Export: Project Rules text, API key (masked), staleness thresholds, tag library (user-created only)
- Import: restore config from export file
- Separate from Panic Export (which covers data)
- Useful for machine migration or recovery from a broken state

---

## PPOL3 — UI Polish: post-P46

Polish pass after P46-C is complete. Scoped to print/PDF only.

- Print/PDF export for single entries: Source Material, Brainstorm, Research, Writing Lab, Open Questions analysis history
- No new features — print/PDF only

---

## Chat search + export (deferred)

- Chat search: search across all chat history by keyword
- Chat pop-out: dedicated window for Chat, independent of main app
- Chat export: export a chat as plain text or markdown
- Address after core feature set is stable

---

## Additional Source file types (deferred)

- Currently: file upload for Source Material
- Deferred: additional file types, OCR for scanned documents, PDF annotation

---

## Performance + themes (deferred)

- Performance optimization for large datasets
- Dark/light theme toggle
- Address after core feature set is stable and in active use

---

*Last updated: June 2026. Sequencing is not implied by order in this document.*
