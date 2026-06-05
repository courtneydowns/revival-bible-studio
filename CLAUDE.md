# Revival Studio — Project Instructions for Claude

## What this project is
Local-first creative/editorial workspace for the **Revival project only**. Not a general tool. Not a ChatGPT wrapper. Electron app, runs locally via `npm run dev`. SQLite for storage. Mac dev environment.

---

## Before starting any phase — required

- When the user references a phase (e.g. "P22", "phase 22", "start P5"), **read `docs/BUILD_PLAN.md` first** and locate that phase entry.
- The phase entry defines scope and the smoke test. Do not start work without it.
- If the phase number is not in `docs/BUILD_PLAN.md`, stop and ask.
- Do not infer phase scope from memory or from this file. `docs/BUILD_PLAN.md` is the source of truth for phase scope.
- One phase per session. Do not bundle phases. Do not skip the smoke test gate.

---

## Hard rules — never violate

- **No OpenAI / ChatGPT integration. Ever.** No OpenAI provider code, no model pickers, no OpenAI API key fields, no generic provider routing scaffolding.
- **Claude/Anthropic may eventually be the only AI provider.** Do not add AI execution until the user explicitly asks. First phases do not require AI.
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

---

## UI principles — every screen must answer

1. Where am I.
2. What is this page for.
3. What should I do next.
4. Where saved material will go.
5. How to edit, delete, archive, restore, or undo.

---

## Workspaces — the only ones

Home, Chat, Writing Lab, Source Material, Documents, Canon Bible, Unsorted, Canon Review, Open Questions, Conflicts, Decisions, Brainstorm, Research, Settings.

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

---

## Editing / lifecycle

- Every workspace supports editing.
- Most workspaces support delete (for mistakes).
- Most workspaces have an archive/retire section, collapsed by default.
- **No separate global Archive page.**
- Canon Bible entries are editable.
- **Locked canon = currently accepted, not impossible to change.**
- Retired / superseded canon stays in a collapsed section where appropriate.

---

## Save / safety

- Autosave is app-wide but means **draft preservation, not silent final approval.**
- Panic Export exists early and expands over time.
- Optional Next Step Suggestions are allowed but must be dismissible.

---

## Database

- SQLite. Local only.
- **Do not invent the Canon Bible schema yet.**
- At the schema phase: inspect the finalized project knowledge files and propose a schema covering categories, tables/entities, relationships, edit/lock/archive/supersede behavior, source provenance, and future change handling.
- **Stop for a schema approval checkpoint before implementing.**

---

## How to work with this user

- Token-efficient by default. Tight answers. No filler. No restating the question.
- Don't over-explain. User is mostly directing Claude Code; verbose walkthroughs waste time.
- Ask before doing anything ambiguous.
- If a request conflicts with the rules above, surface the conflict and stop. Do not silently comply.
- Never assume; confirm.
