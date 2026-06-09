# Revival Studio — Project Instructions for Claude

## What this project is
Local-first creative/editorial workspace for the **Revival project only**. Not a general tool. Not a ChatGPT wrapper. Electron app, runs locally via `npm run dev`. SQLite for storage. Mac dev environment.

---

## Hard rules — never violate

- **No OpenAI / ChatGPT integration. Ever.** No OpenAI provider code, no model pickers, no OpenAI API key fields, no generic provider routing scaffolding.
- **Claude is the only AI provider.** Do not add AI execution until the user explicitly asks.
- **No hidden context. No hidden retrieval. No automatic canon mutation.**
- **AI may suggest; human approves.** Nothing is stored, routed, tagged, archived, deleted, locked, or finalized without explicit user confirmation in the UI.
- **No code or feature work without an explicit request from the user.** Ask first.

---

## Build discipline

- Small phases. Strict scope. No "while I'm in here" refactors or redesigns.
- Each phase ends with: automated checks where possible + a short manual smoke checklist.
- A phase is **not complete** until the user manually confirms the smoke test passed.
- No commits to `main` and no marking a phase done without that confirmation.
- Never start the next phase without explicit go-ahead.
- Avoid large rewrites. Preserve simple workflow over feature complexity.
- **Polish items noticed during smoke tests go in `POLISH_NOTES_ONGOING.md` at repo root.** Do not fix them inline during a feature phase. They are addressed in PPOL-ONGOING (the permanent open-ended polish phase at the end of the build plan).
- **Post-smoke document update ritual (required before commit/push):** After the user confirms smoke passed, update all touched documents before committing. Always update: `BUILD_PLAN_ONGOING.md` (mark phase ✅, add "Smoke passed.") and `TOOL_ROUTING_ONGOING.md` (mark phase ✅). Update conditionally based on scope: `CLAUDE_ONGOING.md` if the phase changed a UI pattern, workspace rule, or hard rule; `POLISH_NOTES_ONGOING.md` if items were resolved or new items logged; `FEATURE_BACKLOG_ONGOING.md` if a backlog item was completed or modified. **After all document updates are done, commit and push all changes in that session before closing.** Do not commit until document updates are done. Do not close the session without committing.

---

## UI principles — every screen must answer

1. Where am I.
2. What is this page for.
3. What should I do next.
4. Where saved material will go.
5. How to edit, delete, archive, restore, or undo.

---

## UI patterns (established — apply consistently)

- **Two-column layout:** every workspace. Left = list with title/type/status badge/preview line. Right = full detail panel, editable, with actions.
- **Full-screen popout:** available from any detail panel. Full edit, rename, delete, archive/restore within the popout. Independent window state.
- **Reference Mode / Edit Mode:** Canon Bible defaults to read-only Reference Mode. Edit Mode requires a deliberate toggle. Popout has independent mode state.
- **Status bar:** thin persistent bar at bottom of every detail panel showing workspace, entry type, created date, last edited, lock status. Writing Lab also shows word count and scene/section count passively.
- **Linked entries indicator:** passive count on every detail panel ("3 attachments / 2 canon links"), expandable on click. Expanding shows a full read-only panel of every workspace that references this entry ("Where is this referenced?").
- **Collapsed archive/retired sections:** at bottom of the same page. No separate archive page anywhere.
- **Global quick-capture:** Cmd+Shift+N from anywhere opens a minimal modal — title + body, saves to Unsorted. Dismissable with Escape.
- **Command palette:** Cmd+K opens palette for jumping to any workspace, recent entry, or action. Last 5 entries opened appear at the top before typing. Full keyboard navigation throughout: tab through list items, Enter to open detail, keyboard shortcuts for approve/defer/route/archive in queues.
- **Keyboard shortcut cheat sheet:** Cmd+? opens a non-modal overlay listing all shortcuts. One-screen, dismissable. Surfaces what PKEY built — no new shortcuts added here.
- **Highlight-extract-route:** select any text in a detail panel or popout → extract menu appears → route to Unsorted, Brainstorm, Open Questions, Decisions, Conflicts, Research, Canon Review. Creates a new entry pre-filled with selection and source attribution. Available on AI analysis output text. "Send to" history: last 3 destinations appear at the top of the picker.
- **Breadcrumb navigation:** when clicking through from a back-reference or linked entry, a one-line breadcrumb shows the origin ("← Jordan (Characters)"). Single back-step only — no deep history stack.
- **Entry scratchpad:** every entry across all workspaces has a lightweight freeform scratchpad section, collapsed by default. Not autosaved to body, not canon, not routable. For thinking out loud only.
- **Session resume:** on launch, the app surfaces the last entry the user had open, not just Home. Zero clicks to get back into flow.
- **Workspace activity indicator:** subtle recency signal on each nav item showing when you were last active in that workspace. Not a badge count — visual only. Aids reorientation at session start.
- **Stale item nudges:** nav badges show count + age of oldest unresolved item ("3 · 45d"). List items not touched beyond their threshold show a subtle age marker. Thresholds configurable in Settings (defaults: 14d Tier-1 questions, 30d conflicts, 7d Canon Review). Never auto-resolves anything — surfacing only.
- **Cancel / dismiss / close buttons:** every modal, form, dialog, confirmation, and overlay must have a working cancel/dismiss/close handler that (1) dismisses the UI element, (2) discards unsaved changes without touching the data layer, and (3) returns focus to the prior view without stale state or partial writes. This is a hard UI requirement — do not ship a phase with broken cancel buttons.

---

## Workspaces — the only ones

Home, Chat, Writing Lab, Source Material, Documents, Canon Bible, Characters, Episodes, Unsorted, Canon Review, Open Questions, Conflicts, Decisions, Brainstorm, Research, Settings.

Do not invent new top-level workspaces.

---

## Chat rules

- Global drawer, accessible from everywhere.
- Multiple chats inside this one Revival project.
- Title dropdown, rename, archive, restore. Search comes later.
- Expands without taking over the app. Pop-out window comes later. Export comes later.
- **Current attachments: Source Material + Canon Bible entries + Characters entries + Episodes entries + Documents entries (PCHAT-ATTACH — complete).** Permitted list is fixed — no other workspaces.
- Attach modes: (1) keep active in this chat, (2) use for next message only.
- Active attachments must be visible at all times so the user knows what Claude is using.

---

## Settings rules

- **Project Rules** lives here and is always-on visible guidance Claude receives.
- **Claude API key** lives here (P39). Claude only — no provider picker.
- No vague hidden "Project Memory."

---

## Routing / approval

- **Unsorted** = general routing queue for things that don't fit yet. Every Unsorted entry has a "Route to…" action button on its detail panel — routes to Brainstorm, Open Questions, Decisions, Conflicts, Research, or Canon Review using the same picker as highlight-extract-route.
- **Canon Review** = approval space for anything that may affect official Revival truth.
- Open Questions and Conflicts are separate workspaces.
- Source Material and Documents are separate.
- Brainstorm and Research are separate.
- **Characters and Episodes are separate** (see below).

---

## Characters workspace

- Working surface for **character development and synthesis**, not just a list of names.
- Holds character entries with a development view per character.
- Each character has a **status field:** Active / Recurring / Departed / Deceased. Filters the character list. Feeds the arc tracker and episode continuity checker.
- Supports a **relational view** showing how characters connect (relationships, factions, arcs, conflicts).
- Resolved items from other workspaces (Decisions, Open Questions, Conflicts, Brainstorm, Research) can be **attached/linked** to a character — see Cross-workspace attachments below.
- Settled character facts that should become canon flow to **Canon Bible via Canon Review**. Same approval discipline as everything else. No direct writes to Canon Bible.
- Canon Bible holds the **locked reference version** of canonical character facts. Characters workspace is where you *work on* characters; Canon Bible is where settled truth lives.
- Standard lifecycle: edit, delete (for mistakes), collapsed archive section at bottom of the same page. No separate archive page.

---

## Episodes workspace

- Working surface for **episode drafting and outlining** (outlines, scene lists, beats, draft notes).
- Each episode has a **status field:** Outline / Draft / Locked. User-set. Filters the episode list. Feeds Needs Attention panel.
- Canon facts that emerge from an episode flow to **Canon Bible via Canon Review**. Same approval discipline.
- Canon Bible holds the locked canonical version of episode facts. Episodes workspace is where the drafting work happens.
- Standard lifecycle: edit, delete (for mistakes), collapsed archive section at bottom of the same page.

---

## Decisions workspace

- Records creative decisions that have been made — not a live queue, a settled record.
- Each decision has a **status badge:** Open / Tentative / Final. User-set. Makes the list actionable as a record of what is settled vs. still live.
- Decisions can be **promoted to Canon Review** via a one-click action. Creates a Canon Review proposal pre-filled with the decision content and a back-link to the source Decision. Link-don't-copy. Same approval discipline as all other Canon Review paths.

---

## Cross-workspace attachments

- Pattern: **link, don't copy.** One source of truth.
- Characters and Episodes entries have an "Attached" section.
- Picker lets the user attach resolved items from Decisions, Open Questions, Conflicts, Brainstorm, Research, and Source Material.
- Decisions, Open Questions, and Conflicts can also attach Source Material as supporting reference.
- Attached items appear as references (title + home workspace + click-through to the original).
- Removing an attachment unlinks only; the original is untouched.
- If the original is later edited, superseded, or archived, the attachment reflects that automatically — no sync step.
- Bi-directional visibility: the original item shows which Characters/Episodes it's linked to, for traceability.
- Schema is in `docs/CANON_SCHEMA_APPROVED.md` — implemented in P31.

---

## Canon Bible rules

- **Canon Bible defaults to Reference Mode** (read-only). Edit Mode requires a deliberate toggle.
- **Locked canon = currently accepted, not impossible to change.**
- All canon changes flow through Canon Review proposals — never written directly to canon_entries.
- Retired / superseded canon stays in a collapsed section on the same page.
- **"What changed" diff on edit:** when saving an edit to a canon entry in Edit Mode, a before/after diff is shown for confirmation before the save completes. Prevents accidental mutation.
- **Confidence level:** each canon entry carries a confidence badge — Confirmed / Probable / Speculative. Distinct from lock status. Lock = approved for now; confidence = how certain the creative team is this will hold. Passive badge, no workflow gate.
- **"Affected by" reverse lookup on superseded entries:** when viewing a retired/superseded entry, a read-only panel shows what downstream entries (Characters, Episodes, Decisions) were linked to it at time of retirement. Prevents stale links from going unnoticed.
- Downstream corrections are tracked in canon_downstream_corrections (child of locked decisions), not as prose.
- Tags apply to all canon entries via taggable_tags.
- **Conflict detection (PCONFLICT-2 / PCONFLICT-3 — complete):** on-demand scan from Canon Bible checks all canon entries for direct contradictions. Detected collisions auto-route to the Conflicts workspace (dedup by signature — no duplicate rows on re-scan). Scan never runs automatically. Re-running the scan from the Conflicts page auto-archives resolved/stale conflicts. Editing/archiving/superseding/deleting a canon entry referenced by an open Conflicts row fires a toast reminding the user to re-run detection. IPCs: `canonConflicts.scanAndRoute()`, `canonConflicts.openFlagEntryIds()`.

---

## Conflicts workspace

- Each conflict has a **severity badge:** Minor / Significant / Blocking. User-set. Blocking conflicts surface in the Needs Attention panel. Prevents the list from being a flat undifferentiated pile as it grows.

---

## Open Questions workspace

- Questions can be marked as **dependent on** another Open Question. Surfaces as a soft block indicator in the list. Prevents answering Q2 before Q1 is resolved without realizing it.
- Questions have a **tier field:** Tier 1 / Tier 2 / Tier 3. User-set on create and edit. Tier escalation (promote Tier-2 → Tier-1) is a separate action with confirmation, logged in question history.

---

## Writing Lab

- Drafts can contain **scene / section markers** — lightweight named dividers within a draft body. Let the user jump to a named section within a long draft. No hierarchy, just named anchors. Not an outline system.
- **Draft vs. canon comparison:** on demand, Claude reads the active draft and surfaces any details that diverge from locked canon entries. Draft-scoped (vs. episode continuity checker which is episode-scoped). Flags route to Conflicts or Open Questions. User-triggered only; never automatic.
- Word count and scene/section count shown passively in the status bar.

---

## Research workspace

- Each Research entry shows a **"Used in" indicator** — a passive flag showing if the entry has been linked or routed anywhere. Surfaces orphaned research that was never applied.
- Each Research entry has an **external_url field** — display and editable in the detail panel. Shown on list item preview line if populated.

---

## AI features — Claude API (P39–P46)

All AI features use Claude only. No provider routing. No OpenAI scaffolding.

### General AI patterns (apply to all AI phases)
- **Request preview:** user sees exact payload before sending. Nothing goes to the API without awareness. Preview must include all attachment types — Canon Bible, Characters, Episodes, Source Material, Documents — matching exactly what is sent.
- **AI suggests; human approves.** No AI output writes to any workspace without explicit user action.
- **Tag suggestions:** Claude proposes tags from the existing library; user confirms, discards, or adds manually. Never auto-applied.
- **Highlight-extract-route applies to all AI output text** — any analysis or response can be selected and routed to relevant workspaces.
- **Export to Brainstorm / Research:** one-click on full AI output creates a new entry in the target workspace, pre-filled with content and source attribution. Link-don't-copy discipline.
- **max_tokens:** set to `32768` for all Claude API calls. Do not lower this without a specific reason. If a response is cut short (`stop_reason === 'max_tokens'`), append a visible "⚠ Response cut short — send a follow-up to continue" notice in the chat bubble. Do not implement a "Continue" auto-flow — the warning is a safety net only.

### P46 — AI open questions analyst (The Flanagan Filter) — complete
The Flanagan filter feature applies THE_FLANAGAN_MASTER document as an analytical and generative tool against Open Questions entries.

**Four scan modes:**
- **Editorial Filter** — Tier 1 five questions only. Fast go/no-go compass.
- **The Six Tensions** — Appendix A six diagnostic checks. Mechanical doubt-checker.
- **WWFD (What Would Flanagan Do)** — generative. Structural / Dialogue / Visual moves + Revival Anchor. For resolving *how*, not just whether.
- **Full Diagnostic** — Editorial Filter + Six Tensions + WWFD in sequence.

**Flanagan filter rules:**
- Context pre-filled from the entry (question text, tier, options) — user does not re-type.
- Named citations in output (e.g. "Question 5," "Tension 3," "Non-Negotiable Two") — traceable back to the document.
- North Star check runs on every analysis mode, every time — it is the document's own override condition.
- WWFD "not ready" gate: if entry lacks scene-level context, surface a soft warning before running.
- Tier of the question (Tier 1 / Tier 2) is passed to Claude — analysis weights accordingly.
- Passive canon conflict flag: if question involves Canon Bible entities, surface a note that canon context is available but not auto-pulled.
- Analysis summary line at top: one sentence verdict + primary reason, before full breakdown.
- Confidence signal: Claude indicates whether the verdict is clear or a genuine tension.
- Editable option labels before sending (e.g. "Option A" → descriptive label).
- Default scan mode persists per session.
- Re-run with different mode: one-click after analysis returns, no re-entry required.
- Keyboard shortcut to trigger analysis (consistent with PKEY).

**Analysis history (P46-B — complete):**
- Saved analyses attach to the Open Questions entry.
- Each record tagged with scan mode + Flanagan document version used.
- Collapsed history section on the entry, same pattern as archive sections.
- Analyses lock (read-only) when the question is resolved/closed or promoted to a Decision via `resolved_by_decision_id`.
- "Reopen with new context" action flags a saved analysis as stale and queues re-run (user-triggered only).

**Routing + tags (P46-C — complete):**
- One-click "Send to Brainstorm" / "Send to Research" on full analysis output. Link-don't-copy, source attribution to originating Open Question.
- Highlight-extract-route available on all analysis output text.
- AI tag suggestions on save: Claude proposes tags from existing library; user confirms, discards, or adds manually.

---

## Planned features (agreed, not yet built)

These features are in `docs/FEATURE_BACKLOG_ONGOING.md` and `docs/BUILD_PLAN_ONGOING.md`. Do not implement any of these without an explicit build instruction. Listed here so Claude Code does not contradict them in design decisions.

- **PDRAFT-LOCK:** Characters and Episodes get a "locked for this draft" state distinct from archive.
- **PARC-A / PARC-B:** Character arc tracker — written timeline (list) and visual timeline (horizontal scroll). Read-only, generated from existing data. Character status field feeds these views.
- **PEPISODE-STRUCT:** Per-episode structure checklist (Flanagan Master episodic rules) + optional AI evaluation.
- **PLOCKED-SPECIFICS:** Collapsed reference panel on Characters, Episodes, Writing Lab, Canon Bible (Edit Mode), Canon Review — surfaces locked non-negotiables from THE_FLANAGAN_MASTER.
- **PEPISODE-CONT:** AI episode continuity checker — on-demand, flags arc/timeline inconsistencies, routes to Conflicts/Open Questions. Reads character status field.
- **PRESEARCH-CITE:** Research entries get a source citation field, linkable to Source Material.
- **PHEALTH:** App health panel in Settings — migration count, SQLite size, record counts, orphan detection + cleanup.
- **PCONFIG-BACKUP:** Config export/import in Settings (Project Rules, thresholds, user tags — no API key).
- **PFLAN-EXPAND:** Flanagan Filter expands to Brainstorm, Writing Lab, Characters, Episodes, Canon Review, Canon Bible (Edit Mode), Conflicts (lightweight), Decisions (lightweight). Fifth mode: Production Check (Tier 3 only).
- **PAI-WIRE:** AI features wire to each other — P44→P41, P42→P43, P46→P41, P45→P43. All user-triggered, no automatic routing.
- **PDOC-WIRE:** Documents becomes first-class — Chat-attachable, highlight-extract-route target, linkable to Characters/Episodes, Flanagan Filter, Canon proposal path.
- **PWLAB-CANON-COMPARE:** Writing Lab draft vs. canon comparison — on-demand AI check against full Canon Bible. Routes flags to Conflicts or Open Questions.
- **PWLAB-SECTIONS:** Scene/section markers in Writing Lab drafts — named anchors for navigation within long drafts.
- **PEPISODE-PREVON:** "Previously on" canon snapshot — one-click read-only summary of canon facts locked as of the prior episode. Generated from existing data.
- **PRESEARCH-USED:** "Used in" indicator on Research entries — passive flag if the entry has been linked or routed anywhere.
- **PSCATCHPAD:** Entry-level scratchpad — freeform, collapsed by default, not canon, not routable.
- **PSESSION-RESUME:** On launch, surface the last entry the user had open. Zero clicks to resume.
- **PBREADCRUMB:** Breadcrumb on linked entry click-through — single back-step ("← Jordan (Characters)").
- **PWHERE-REF:** "Where is this referenced?" — dedicated read-only panel showing every workspace referencing this entry. Expands the existing linked entries indicator.
- **PNAV-ACTIVITY:** Workspace activity indicator on nav — subtle last-active recency signal per nav item.
- **PKEYSHEET:** Cmd+? keyboard shortcut cheat sheet — non-modal overlay, dismissable.
- **PPALETTE-RECENTS:** Last 5 opened entries at top of Cmd+K palette before typing.
- **PROUTE-HISTORY:** "Send to" picker history — last 3 destinations at top of route picker.
- **PPOL3:** Print/PDF export for single entries: Source Material, Brainstorm, Research, Writing Lab, Open Questions analysis history.
- **PBLOCK-LABEL / PBLOCK-CROSS / PBLOCK-RESOLVE-PROMPT / PBLOCK-DASHBOARD / PBLOCK-HISTORY:** Blocking specificity labels, cross-workspace blocking relationships, resolution prompts, blocking dashboard on Home, blocking history on entries.
- **PAI-STATUS-SUGGEST:** AI-suggested status values on Decisions, OQ, Brainstorm, Episodes entries.
- **PAI-ENTRY-ROUTE-SUGGEST:** AI-suggested workspace routing on entry creation (quick-capture + Unsorted).
- **PAI-TAG-SUGGEST-EDIT:** AI tag suggestions with pre-apply editing. Requires PAI-TAGS.
- **PAI-BLOCK-SUGGEST:** AI-suggested blocking relationships between Open Questions. Requires POQ-DEPENDS ✅.
- **PAI-RELATIONSHIP-SUGGEST:** AI-suggested cross-workspace links — candidate entries with rationale, user confirms each.
- **PAI-METADATA-AUDIT:** AI metadata audit — batch scan for missing fields, per-field confirmation before writing.
- **PAI-CONFIDENCE-SUGGEST:** AI-suggested confidence level on canon entries. Requires PCANON-CONFIDENCE ✅.
- **PCHAT-SEARCH:** Chat history search by keyword, click-through to matched message.
- **PCHAT-EXPORT:** Chat plain-text export (.txt or .md), distinct from PCHAT-ROUTE.
- **PPOL2b-SEARCH:** Inline text filter on all 13 workspace left-column lists.
- **PDRAFT-LOCK:** Character/Episode "locked for this draft" state, distinct from Canon Bible locking.
- **PSESSION-LOG:** Auto-generated session work log — entries created/approved/archived/analyses run, grouped by workspace. Audit trail only, exportable.
- **PUNDO:** App-level Cmd+Z undo for destructive actions (archive, delete, resolve, approve, reject). Session-only history, last 20 actions.
- **PWLAB-VERSIONS:** Writing Lab draft versioning — manual save, named versions, side-by-side diff, restore.
- **PBLOCK:** Open Questions blocking flag + tier escalation + promote-to-Decision.
- **PBRAIN-STRUCT:** Brainstorm internal structure — threads/clusters, "developed into" links, status badges.
- **PCHAT-ATTACH:** Chat attachment expansion — Canon Bible, Characters, Episodes, Documents attachable to Chat.
- **PCHAR-STATUS:** Character status field — Active / Recurring / Departed / Deceased.
- **PEPISODE-STATUS:** Episode status field — Outline / Draft / Locked. Feeds Needs Attention.
- **PDECISION-STATUS:** Decision status badges — Open / Tentative / Final.
- **PDECISION-PROMOTE:** Decisions → Canon Review one-click promotion.
- **PCANON-CONFIDENCE:** Canon entry confidence level — Confirmed / Probable / Speculative.
- **PCANON-DIFF:** Diff modal on Edit Mode save before confirming.
- **PCANON-AFFECTED:** Affected-by reverse lookup on retired/superseded canon entries.
- **PCONFLICT-SEV:** Conflict severity badge — Minor / Significant / Blocking.
- **PSTALE:** Stale item nudges — nav badge aging, list item age markers, configurable thresholds.
- **POQ-DEPENDS:** Open Question dependency links.

---

## Lifecycle patterns

- Every workspace supports editing.
- Most workspaces support delete (for mistakes).
- Most workspaces have an archive/retire section, collapsed by default.
- **No separate global Archive page.**
- Canon Bible entries are editable only in Edit Mode, with a warning on locked entries.
- Autosave is app-wide but means **draft preservation, not silent final approval.**

---

## Database

- SQLite. Local only.
- **Schema is approved and implemented.** See `docs/CANON_SCHEMA_APPROVED.md`.
- 42 tables + 9 triggers. Migrations live inline in `db.js`.
- Do not alter the canon schema without a design checkpoint in claude.ai first.
- Tags are seeded at first launch via migration 029_seed_tags. Do not re-seed.

---

## How to work with this user

- Token-efficient by default. Tight answers. No filler. No restating the question.
- Don't over-explain. User is mostly directing Claude Code; verbose walkthroughs waste time.
- Ask before doing anything ambiguous.
- If a request conflicts with the rules above, surface the conflict and stop. Do not silently comply.
- Never assume; confirm.
