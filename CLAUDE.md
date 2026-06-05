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
- **Polish items noticed during smoke tests go in `POLISH_NOTES.md` at repo root.** Do not fix them inline during a feature phase. They are addressed in PPOL1 and PPOL2.

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
- **Attachments: Source Material only.** No "Context Packets."
- Source attach modes: (1) keep active in this chat, (2) use for next message only.
- Active sources must be visible at all times so the user knows what Claude is using.

---

## Settings rules

- **Project Rules** lives here and is always-on visible guidance Claude receives.
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

---

## Tag rules

- **Seeded tags cannot be deleted.** Only user-created tags can be deleted.
- **Remove-tag-from-entry:** any tag can be removed from any individual entry at any time. The tag still exists; only the link between that entry and that tag is removed. This is not destructive — no confirmation required.
- **Tag filter semantics:** AND (must have all selected tags). Multi-tag filter shows only entries that carry every selected tag.
- **Tag normalization:** tags are lowercased and trimmed on save. `Canon`, `canon`, and `canon ` are the same tag.
- **Duplicate prevention:** creating a tag that already exists (after normalization) is blocked. The input selects the existing tag instead.
- **Autocomplete:** tag input autocompletes against all existing tags (seeded + user-created), case-insensitive.
- **Delete a user-created tag (PTAGDEL):** shows usage count before confirmation ("used on N entries across X workspaces"). On confirm, tag is unlinked from all entries everywhere and deleted. Seeded tags have no delete affordance.
- **Rename a user-created tag (PTAGDEL):** renames the tag in place across all entries. No unlinking occurs.

---

## Editing / lifecycle

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
