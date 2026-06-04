# Revival Studio — Build Plan

One concept per phase. Each phase = one Claude Code session, ideally short.

**Phase completion ritual:** Claude Code finishes → user runs smoke test → user reports pass → commit + push → user says "go" → next phase. No exceptions.

---

## Foundation

### P0 — Git connect
- `git init` in `~/Documents/revival-bible-studio`, remote to GitHub repo, `.gitignore`, first commit (CLAUDE.md + docs)
- **Smoke:** `git status` clean, push succeeds, repo on GitHub shows the files

### P1 — Electron window
- Minimal `package.json`, Electron, `main.js`, blank `index.html`
- **Smoke:** `npm run dev` opens a window titled "Revival Studio"

### P2 — Left nav placeholders
- Nav lists all 14 workspaces, clicking routes to a blank page per workspace
- **Smoke:** All 14 nav items clickable, active state visible

### P3 — UI principle template
- One reusable component answering the 5 UI questions, dropped into every placeholder page
- **Smoke:** Every workspace shows the 5 answers

---

## Data layer

### P4 — SQLite + migrations
- DB file in app data dir, migration runner, no UI changes
- **Smoke:** App boots, DB file exists in expected path

---

## Unsorted (the pattern workspace)

### P5 — Unsorted: create + list
- One table, create entry, list entries
- **Smoke:** Add entry, restart app, entry persists

### P6 — Unsorted: edit
- Edit existing entries, save
- **Smoke:** Edit + save survives restart

### P7 — Unsorted: delete
- Delete with confirm prompt
- **Smoke:** Delete an entry, confirm prompt appears, entry gone

### P8 — Unsorted: archive + restore
- Collapsed "Archived" section at bottom of same page (no global Archive)
- **Smoke:** Archive an entry, see it under collapsed section, restore it

### P9 — Autosave system
- Drafts preserved on edit; preservation only, not finalization
- **Smoke:** Quit mid-edit, reopen, draft intact; "save" still required to finalize

---

## Source Material + Documents

### P10 — Source Material CRUD
- Same lifecycle as Unsorted
- **Smoke:** Add, edit, delete, archive, restore on a Source entry

### P11 — Source Material file upload
- Text files first (other types deferred)
- **Smoke:** Upload a .txt file, view contents in entry

### P12 — Documents CRUD
- Same lifecycle as Unsorted; visibly separate from Source Material
- **Smoke:** Create a Document, edit, archive, restore; Source and Documents are not blended

---

## Chat shell (no AI)

### P13 — Chat drawer shell
- Global drawer, opens/closes from any workspace, one default chat
- **Smoke:** Open drawer from 3 different workspaces

### P14 — Multiple chats + title dropdown
- Create, switch, title dropdown lists them
- **Smoke:** Create 3 chats, switch between them via dropdown

### P15 — Rename + archive + restore chats
- **Smoke:** Rename one chat, archive one, restore it

### P16 — Chat expand mode
- Larger view, not full-screen takeover; rest of app still reachable
- **Smoke:** Expand chat, confirm other workspaces still clickable

---

## Chat ↔ Source attachments (still no AI)

### P17 — Attach Source: keep active mode
- Picker shows Source Material only (no other types, no Context Packets), active sources listed in chat
- **Smoke:** Attach a source, send a message, source still listed

### P18 — Attach Source: next message only + manual remove
- Second mode; active sources removable in one click
- **Smoke:** Attach "next message only," send, source disappears; manually remove a "keep active" source

---

## Settings + Safety

### P19 — Settings: Project Rules editor
- Always-on visible Project Rules text in Settings (no hidden Project Memory)
- **Smoke:** Edit a rule, save, value persists across restart

### P20 — Panic Export v1
- Dump entire DB + uploaded source files to a timestamped folder
- **Smoke:** Run Panic Export, output folder contains DB dump + sources

---

## Remaining queue/decision workspaces (one per phase)

### P21 — Open Questions
- **Smoke:** Full lifecycle on one entry

### P22 — Conflicts
- Visibly distinct from Open Questions
- **Smoke:** Full lifecycle; UI clearly differentiates from Open Questions

### P23 — Decisions
- **Smoke:** Full lifecycle on one entry

### P24 — Brainstorm
- **Smoke:** Full lifecycle on one entry

### P25 — Research
- Not blended with Brainstorm
- **Smoke:** Full lifecycle; UI clearly differentiates from Brainstorm

---

## Home + Writing Lab

### P26 — Home dashboard
- Counts per workspace, recent activity, dismissible Next Step Suggestions
- **Smoke:** Counts match reality, dismissed suggestions stay dismissed

### P27 — Writing Lab
- Long-form drafting with autosave
- **Smoke:** Draft 500 words, quit, reopen, content intact

---

## Canon Bible — schema first, then build

### P28 — Canon schema design (CHECKPOINT, no code)
- Move to claude.ai (Opus). Inspect finalized project knowledge files. Propose schema covering: categories, tables/entities, relationships, edit/lock/archive/supersede behavior, source provenance, future change handling.
- **Gate:** User explicitly approves schema in writing before P29 starts.

### P29 — Canon tables + read view
- Migration creates approved tables, read-only list view
- **Smoke:** Seed a few entries, list view shows them with provenance fields visible

### P30 — Canon entries: create + edit
- **Smoke:** Add an entry, edit it, changes persist

### P31 — Canon lock / unlock
- Lock = currently accepted, edits still allowed but warn user
- **Smoke:** Lock an entry, attempt edit, warning appears, proceed, change saved

### P32 — Canon supersede + retired collapsed section
- Superseding marks prior version retired and visible under collapsed section
- **Smoke:** Supersede an entry, find old version in collapsed retired section

### P33 — Canon Review queue
- Approval queue for proposed changes (approve / reject / send back). No AI yet.
- **Smoke:** Manually submit a change to the queue, approve it, see it in Canon Bible

---

## AI integration (Claude only)

### P34 — Claude API config + request preview
- API key field in Settings (Claude only — no provider picker, no OpenAI scaffolding)
- Request preview UI shows exact payload that would be sent
- **Smoke:** Enter key, draft a message, preview shows expected payload (user msg + Project Rules + active sources, nothing else)

### P35 — Chat AI send/receive
- Send a message, receive Claude's response, display in chat
- **Smoke:** Send a message, get a response back, conversation history persists

### P36 — AI suggestion → Canon Review pipeline
- If Claude proposes a structured canon change, it lands in Canon Review (never directly in Canon Bible)
- **Smoke:** Ask Claude to propose a canon addition, confirm it appears in Canon Review, approve it, then see it in Canon Bible

---

## Deferred (P37+)

Held until base is stable: chat search, chat pop-out, chat export, expanded Panic Export, additional Source file types, performance, themes.
