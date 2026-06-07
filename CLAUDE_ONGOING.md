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

---

## Smoke test output rule

**When Claude produces output that includes changes — code, phase specs, file updates, design decisions — it must append a numbered smoke test list at the end of the response.** Format:

1. [Action to take]
2. [What to confirm]
3. ...

The list should be tight and specific to what was just changed. No filler items.

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
- **Status bar:** thin persistent bar at bottom of every detail panel showing workspace, entry type, created date, last edited, lock status.
- **Linked entries indicator:** passive count on every detail panel ("3 attachments / 2 canon links"), expandable on click.
- **Collapsed archive/retired sections:** at bottom of the same page. No separate archive page anywhere.
- **Global quick-capture:** Cmd+Shift+N from anywhere opens a minimal modal — title + body, saves to Unsorted. Dismissable with Escape.
- **Command palette:** Cmd+K opens palette for jumping to any workspace, recent entry, or action. Full keyboard navigation throughout: tab through list items, Enter to open detail, keyboard shortcuts for approve/defer/route/archive in queues.
- **Highlight-extract-route:** select any text in a detail panel or popout → extract menu appears → route to Unsorted, Brainstorm, Open Questions, Decisions, Conflicts, Research, Canon Review. Creates a new entry pre-filled with selection and source attribution. Available on AI analysis output text (P46-C).

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
- **Current attachments: Source Material only.** No "Context Packets."
- **Planned (PCHAT-ATTACH):** Canon Bible entries, Characters entries, Episodes entries, Documents entries will also be attachable. Permitted list is fixed — no other workspaces.
- Attach modes: (1) keep active in this chat, (2) use for next message only.
- Active attachments must be visible at all times so the user knows what Claude is using.
- **Chat history page (PCHAT-HISTORY):** Chat nav item opens a dedicated two-column page. Left = list of past chats (title, date, last message preview), sorted most recent first; archived chats in collapsed section at bottom. Right = full read-only transcript of selected chat. "Continue" button opens that chat in the drawer as the active session. "New Chat" button at top of left column opens a fresh drawer session. Drawer stays as-is — page is a history surface, not a replacement.

---

## Settings rules

- **Project Rules** lives here and is always-on visible guidance Claude receives.
- **Claude API key** lives here (P39). Claude only — no provider picker.
- No vague hidden "Project Memory."

---

## Routing / approval

- **Unsorted** = general routing queue for things that don't fit yet.
- **Canon Review** = approval space for anything that may affect official Revival truth.
- Open Questions and Conflicts are separate workspaces.
- Source Material and Documents are separate.
- Brainstorm and Research are separate.
- **Characters and Episodes are separate** (see below).

---

## Characters workspace

- Working surface for **character development and synthesis**, not just a list of names.
- Holds character entries with a development view per character.
- Supports a **relational view** showing how characters connect (relationships, factions, arcs, conflicts).
- Resolved items from other workspaces (Decisions, Open Questions, Conflicts, Brainstorm, Research) can be **attached/linked** to a character — see Cross-workspace attachments below.
- Settled character facts that should become canon flow to **Canon Bible via Canon Review**. Same approval discipline as everything else. No direct writes to Canon Bible.
- Canon Bible holds the **locked reference version** of canonical character facts. Characters workspace is where you *work on* characters; Canon Bible is where settled truth lives.
- Standard lifecycle: edit, delete (for mistakes), collapsed archive section at bottom of the same page. No separate archive page.

---

## Episodes workspace

- Working surface for **episode drafting and outlining** (outlines, scene lists, beats, draft notes).
- Canon facts that emerge from an episode flow to **Canon Bible via Canon Review**. Same approval discipline.
- Canon Bible holds the locked canonical version of episode facts. Episodes workspace is where the drafting work happens.
- Standard lifecycle: edit, delete (for mistakes), collapsed archive section at bottom of the same page.

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
- Downstream corrections are tracked in canon_downstream_corrections (child of locked decisions), not as prose.
- Tags apply to all canon entries via taggable_tags.
- **Conflict detection (PCONFLICT-2 / PCONFLICT-3 — complete):** on-demand scan from Canon Bible checks all canon entries for direct contradictions. Detected collisions auto-route to the Conflicts workspace (dedup by signature — no duplicate rows on re-scan). Scan never runs automatically. Re-running the scan from the Conflicts page auto-archives resolved/stale conflicts. Editing/archiving/superseding/deleting a canon entry referenced by an open Conflicts row fires a toast reminding the user to re-run detection. IPCs: `canonConflicts.scanAndRoute()`, `canonConflicts.openFlagEntryIds()`.

---

## AI features — Claude API (P39–P46)

All AI features use Claude only. No provider routing. No OpenAI scaffolding.

### General AI patterns (apply to all AI phases)
- **Request preview:** user sees exact payload before sending. Nothing goes to the API without awareness.
- **AI suggests; human approves.** No AI output writes to any workspace without explicit user action.
- **Tag suggestions:** Claude proposes tags from the existing library; user confirms, discards, or adds manually. Never auto-applied.
- **Highlight-extract-route applies to all AI output text** — any analysis or response can be selected and routed to relevant workspaces.
- **Export to Brainstorm / Research:** one-click on full AI output creates a new entry in the target workspace, pre-filled with content and source attribution. Link-don't-copy discipline.

### P46 — AI open questions analyst (The Flanagan Filter)
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

**Analysis history (P46-B):**
- Saved analyses attach to the Open Questions entry.
- Each record tagged with scan mode + Flanagan document version used.
- Collapsed history section on the entry, same pattern as archive sections.
- Analyses lock (read-only) when the question is resolved/closed.
- "Reopen with new context" action flags a saved analysis as stale and queues re-run (user-triggered only).

**Routing + tags (P46-C):**
- One-click "Send to Brainstorm" / "Send to Research" on full analysis output. Link-don't-copy, source attribution to originating Open Question.
- Highlight-extract-route available on all analysis output text.
- AI tag suggestions on save: Claude proposes tags from existing library; user confirms, discards, or adds manually.

---

## Planned features (agreed, not yet built)

These features are in `docs/FEATURE_BACKLOG_ONGOING.md` and `docs/BUILD_PLAN_ONGOING.md`. Do not implement any of these without an explicit build instruction. Listed here so Claude Code does not contradict them in design decisions.

- **PCHAT-HISTORY:** Chat nav item opens a two-column history page. Left = chat list (title, date, last message preview); right = read-only transcript. "Continue" button opens chat in drawer. "New Chat" opens fresh drawer session. Drawer stays as-is.
- **PFLAN-EXPAND:** Flanagan Filter expands to Brainstorm, Writing Lab, Characters, Episodes, Canon Review, Canon Bible (Edit Mode), Conflicts (lightweight), Decisions (lightweight). Fifth mode: Production Check (Tier 3 only).
- **PAI-WIRE:** AI features wire to each other — P44→P41, P42→P43, P46→P41, P45→P43. All user-triggered, no automatic routing.
- **PDOC-WIRE:** Documents becomes first-class — Chat-attachable, highlight-extract-route target, linkable to Characters/Episodes, Flanagan Filter, Canon proposal path.
- **PCHAT-ATTACH:** Chat permits Canon Bible entries, Characters, Episodes, Documents in addition to Source Material.
- **PHOME-NEEDS:** Home gets Needs Attention panel (staleness + tier + blocking). Recently Viewed moves to collapsed section. ✅ Complete.
- **PUNDO:** Cmd+Z undo for archive/delete/resolve/approve/reject. Session-only, last 20 actions. Canon Bible chain actions excluded.
- **PWLAB-VERSIONS:** Writing Lab draft versioning — manual save, named versions, side-by-side diff, restore.
- **PSESSION-LOG:** Auto-generated session log at app close. Audit trail only, not editable.
- **PBLOCK:** Open Questions gets blocking flag, tier escalation, and Promote to Decision action.
- **PBRAIN-STRUCT:** Brainstorm gets threads/clusters, "developed into" links, status badges.
- **PSTALE:** Nav badge aging, staleness indicators on list items, configurable thresholds in Settings.
- **PDRAFT-LOCK:** Characters and Episodes get a "locked for this draft" state distinct from archive.
- **PARC-A / PARC-B:** Character arc tracker — written timeline (list) and visual timeline (horizontal scroll). Read-only, generated from existing data.
- **PEPISODE-STRUCT:** Per-episode structure checklist (Flanagan Master episodic rules) + optional AI evaluation.
- **PQUIET:** Quiet devastation tracker — per-episode status, pre-seeded locked QDs, dashboard view.
- **PLOCKED-SPECIFICS:** Collapsed reference panel on Characters, Episodes, Writing Lab, Canon Bible (Edit Mode), Canon Review — surfaces locked non-negotiables from THE_FLANAGAN_MASTER.
- **PEPISODE-CONT:** AI episode continuity checker — on-demand, flags arc/timeline inconsistencies, routes to Conflicts/Open Questions.
- **PRESEARCH-CITE:** Research entries get a source citation field, linkable to Source Material.
- **PEMPTY-STATE:** Empty state copy on all workspaces + first-session guide on Home (dismissable, non-recurring).
- **PHEALTH:** App health panel in Settings — migration count, SQLite size, record counts, orphan detection + cleanup.
- **PCONFIG-BACKUP:** Config export/import in Settings (Project Rules, thresholds, user tags — no API key).

---

## Lifecycle

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
- **After any response that includes changes (phase specs, design decisions, file updates), append a numbered smoke test list.** Tight and specific to what changed.
