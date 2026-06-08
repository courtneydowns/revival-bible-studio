# Revival Studio — Tool Routing

## One-line rule
**Decide in claude.ai. Build in Claude Code CLI. Polish in VS Code extension.**

---

## By task type

| Task | Tool | Model |
|---|---|---|
| Planning, decisions, debate | claude.ai (this Project) | Sonnet |
| Drafting specs, prompts, instructions | claude.ai | Sonnet |
| Reviewing Claude Code output critically | claude.ai | Sonnet (Opus if stakes are high) |
| Canon schema design (P30) | claude.ai | **Opus** |
| Hard debugging / untangling contradictions | claude.ai | **Opus** |
| Implementing a phase (new files, multi-file) | Claude Code CLI | Sonnet (default) |
| Git ops, npm install, running scripts | Claude Code CLI | Sonnet |
| Small fix in a known file (< ~15 lines) | VS Code extension | Sonnet |
| Inline edit while already in the editor | VS Code extension | Sonnet |
| Reading / explaining a single file | VS Code extension | Sonnet |

---

## Phase-by-phase tool assignment

| Phase | Tool | Why |
|---|---|---|
| P0–P31 | ✅ Complete | — |
| PR1–PR6 | ✅ Complete | — |
| **PUI1** | ✅ Complete | — |
| **PUI2 Full-screen popout** | **CLI** ✅ | New window module |
| **PUI3 Highlight + extract + route** | **CLI** ✅ | Cross-module wiring |
| **PCAP Quick-capture** | **VS Code ext** ✅ | Small modal + Unsorted write |
| **PKEY Command palette + keyboard nav** | **CLI** ✅ | Global, touches every workspace |
| **PTAG Tag UI** | **CLI** ✅ | New component + touches all workspaces |
| **PSEARCH Global search** | **CLI** ✅ | New module, cross-table queries |
| **PHOME Home upgrade** | **VS Code ext** ✅ | Badge counts + recently viewed on existing page |
| **PPASSIVE Status bar + linked indicator** | **VS Code ext** ✅ | Small additions to detail panel component |
| **P32 Canon entries create/edit** | **CLI** ✅ | New UI, entry-type picker, detail tables |
| **P33 Canon lock/unlock** | **CLI** ✅ | Touches canon entry + warning system |
| **P34 Canon supersede + retired** | **CLI** ✅ | Chain logic, multi-file |
| **P35 Canon Review queue** | **CLI** ✅ | Complex UI, multi-action |
| **P35b Canon Bible filter/browse** | **VS Code ext** ✅ | Filter UI on existing Canon Bible page |
| **PCBREF Canon Bible reference mode** | **VS Code ext** ✅ | Mode toggle on existing page |
| **PHIST Canon entry version history** | **CLI** ✅ | Chain traversal + side-by-side view |
| **PCONFLICT Conflict detection UI** | **CLI** ✅ | Cross-entry analysis + routing |
| **PCONFLICT-2 Auto-route + re-check nudges** | **CLI** ✅ | New IPCs (scanAndRoute, openFlagEntryIds) + multi-file |
| **PCONFLICT-3 Contradiction scan + conflict lifecycle** | **CLI** ✅ | Scan + lifecycle wiring, reuses PCONFLICT-2 helpers |
| **P36 Cross-workspace attachments** | **CLI** ✅ | Cross-module wiring, join tables |
| **P37 Characters relational view** | **CLI** ✅ | New visual component |
| **P38 Characters/Episodes → Canon Review** | **CLI** ✅ | Cross-module flow |
| **PWLAB Writing Lab → Canon Review** | **VS Code ext** ✅ | Action on existing Writing Lab page |
| **PPOL1 UI Polish: pre-import** | **VS Code ext / CLI** ✅ | Per item in POLISH_NOTES_ONGOING.md |
| **P20v2 Panic Export v2** | **VS Code ext** ✅ | Extend existing export module |
| **PEXPORT Canon Bible export** | **CLI** ✅ | New export module, markdown + PDF |
| **PImp1 Worldbuilding file import** | **CLI** ✅ | New module, file picker, parser |
| **PImp2 Import review tools** | **CLI** ✅ | Bulk actions, keyboard nav in queue |
| **PPOL2 UI Polish: pre-AI** | **VS Code ext / CLI** ✅ | Per item in POLISH_NOTES_ONGOING.md |
| **P39 Claude API config** | **CLI** ✅ | New module + settings UI |
| **P40 Chat AI send/receive** | **CLI** ✅ | API wiring |
| **P41 AI → Canon Review pipeline** | **CLI** ✅ | Cross-module flow |
| **P42 AI canon search assistant** | **CLI** ✅ | New query module |
| **P43 AI conflict detector** | **CLI** ✅ | On-demand analysis in Canon Review |
| **P44 AI draft assistant** | **VS Code ext** ✅ | Action on existing Writing Lab page |
| **P45 AI import assistant** | **CLI** ✅ | Wired into PImp flow |
| **PPOL2b UI Polish: deferred PPOL2 items** | **VS Code ext / CLI** ✅ | Six deferred items — status bars, Writing Lab popout, Canon Review filter, search scroll |
| **P46-A Flanagan Filter: foundation** | **CLI** ✅ | New analysis panel, API wiring, four scan modes |
| **P46-B Flanagan Filter: save + history** | **VS Code ext** ✅ | Analysis history, lock, stale flag — additions to existing panel |
| **P46-C Flanagan Filter: routing + tags** | **CLI** ✅ | Export to Brainstorm/Research, highlight-extract wiring, tag suggestions |
| **PCHAT-ROUTE Chat: route full chat to workspace** | **VS Code ext** ✅ | Button + picker on existing chat toolbar |
| **PHOME-NEEDS Home: Needs Attention panel** | **CLI** ✅ | New panel component + staleness logic |
| **PUNDO App-level undo** | **CLI** ✅ | Global action history, touches every workspace |
| **PWLAB-VERSIONS Writing Lab draft versioning** | **CLI** ✅ | Version storage + diff view |
| **PSESSION-LOG Session / work log** | **CLI** ✅ | New log module + Settings panel |
| **PBLOCK Open Questions: blocking + escalation** | **VS Code ext** ✅ | Additions to existing Open Questions entry |
| **PBRAIN-STRUCT Brainstorm internal structure** | **CLI** ✅ | Thread/cluster + status badges + developed-into links |
| **PCHAT-ATTACH Chat attachment expansion** | **VS Code ext** ✅ | Add permitted types to existing attachment UI |
| **PCHAR-STATUS Character status field** | **VS Code ext** | New field on existing Character entry component |
| **PEPISODE-STATUS Episode status field** | **VS Code ext** | New field on existing Episode entry component |
| **PDECISION-STATUS Decision status badges** | **VS Code ext** | New field on existing Decision entry component |
| **PDECISION-PROMOTE Decisions → Canon Review** | **VS Code ext** | New action on existing Decision detail panel |
| **PCANON-CONFIDENCE Canon entry confidence level** | **VS Code ext** | New field on existing canon entry component |
| **PCANON-DIFF Canon edit diff on save** | **VS Code ext** | Diff modal wired into existing Edit Mode save flow |
| **PCANON-AFFECTED Affected-by reverse lookup** | **VS Code ext** | Collapsed panel on existing retired/superseded entry view |
| **PCONFLICT-SEV Conflict severity badge** | **VS Code ext** | New field on existing Conflicts entry component |
| **PSTALE Stale item nudges** | **CLI** | Staleness logic + badge aging, touches nav + all workspaces |
| **POQ-DEPENDS Open Question dependencies** | **VS Code ext** | Dependency field + block indicator on existing Open Questions entry |
| **PWLAB-SECTIONS Writing Lab section markers** | **VS Code ext** | Section marker insertion + jump-to list on existing Writing Lab page |
| **PWLAB-CANON-COMPARE Draft vs. canon comparison** | **CLI** | New AI action wired into Writing Lab, reads full canon |
| **PEPISODE-PREVON "Previously on" snapshot** | **VS Code ext** | Generated panel on existing Episode detail |
| **PRESEARCH-USED Research "Used in" indicator** | **VS Code ext** | Passive badge on existing Research list + detail |
| **PDRAFT-LOCK Character/Episode draft lock** | **VS Code ext** | Lock state on existing entry components |
| **PARC-A Character arc tracker: written** | **CLI** | New read-only view, cross-table queries |
| **PARC-B Character arc tracker: visual** | **CLI** | New visual component, horizontal timeline |
| **PEPISODE-STRUCT Episode structure checklist** | **VS Code ext / CLI** | Checklist panel + AI assist option |
| **PQUIET Quiet devastation tracker** | **CLI** | New tracker + dashboard view + seeded data |
| **PLOCKED-SPECIFICS Locked specifics panel** | **VS Code ext** | Reference panel on existing workspace pages |
| **PEPISODE-CONT AI episode continuity checker** | **CLI** | New AI module, cross-entry reads |
| **PRESEARCH-CITE Research source citation** | **VS Code ext** | Source field on existing Research entry |
| **PEMPTY-STATE Empty state + onboarding** | **VS Code ext** | Empty state copy + first-session guide |
| **PHEALTH App health indicator** | **VS Code ext** | Read-only panel in Settings |
| **PCONFIG-BACKUP Config backup/restore** | **VS Code ext** | Export/import config in Settings |
| **PSESSION-RESUME Session resume on launch** | **VS Code ext** | Last-entry persistence on app boot |
| **PSCRATCHPAD Entry-level scratchpad** | **CLI** | New field across all workspaces, schema migration needed |
| **PBREADCRUMB Back-reference breadcrumb** | **VS Code ext** | Breadcrumb on existing detail panel header |
| **PWHERE-REF "Where is this referenced?" panel** | **VS Code ext** | Expands existing linked entries indicator |
| **PNAV-ACTIVITY Workspace activity indicator** | **VS Code ext** | Subtle recency signal on existing nav component |
| **PKEYSHEET Keyboard shortcut cheat sheet** | **VS Code ext** | New overlay, wired to Cmd+? and Help menu |
| **PPALETTE-RECENTS Command palette recents** | **VS Code ext** | Recents section in existing Cmd+K palette |
| **PROUTE-HISTORY "Send to" picker history** | **VS Code ext** | History section in existing route picker |
| **PFLAN-EXPAND Flanagan Filter expansion** | **CLI** | Multi-workspace wiring + Production Check mode |
| **PAI-WIRE Cross-AI routing** | **CLI** | Four cross-feature connections, multi-file |
| **PDOC-WIRE Documents wiring** | **CLI** | First-class workspace wiring, multi-file |
| **PPOL3 UI Polish: post-PBRAIN-STRUCT** | **VS Code ext / CLI** | Per item in POLISH_NOTES_ONGOING.md + print/PDF |
| **PPOL-ONGOING Ongoing polish** | **VS Code ext / CLI** | Open-ended; tool choice per item |

---

## Polish phase rules

- Work through `POLISH_NOTES_ONGOING.md` in order
- One Claude Code session per polish phase
- No new features — fixes and consistency only
- Tool choice per item: VS Code ext for single-file fixes, CLI for anything touching multiple files
- Mark each item resolved in POLISH_NOTES_ONGOING.md as you go

---

## Reshape phase rules (reference — PR1–PR6 complete)

- One reshape phase = one session
- No feature work during reshape
- No CRUD rewrites — ALTER + rename + reference updates only
- Smoke test is behavioral: existing entries visible and editable after every phase

---

## Sonnet vs Opus — quick rule

**Default to Sonnet everywhere.** Opus only when:
- The cost of a wrong answer is high (schema, architecture)
- You've already tried Sonnet and it's looping or shallow
- You're at a one-way-door decision

Opus burns the Max weekly limit much faster. Don't run brainstorm/chat sessions on Opus.

**Claude Code:** Sonnet is the right default for all implementation. Don't switch to Opus for coding unless a specific bug is genuinely hard and Sonnet has failed.

---

## Token-saving habits

1. **One phase = one Claude Code session.** Start a fresh session per phase so context stays small.
2. **Don't paste BUILD_PLAN_ONGOING.md into Claude Code.** It already has CLAUDE_ONGOING.md. Just say: "Do PCHAR-STATUS per docs/BUILD_PLAN_ONGOING.md."
3. **Don't write code in claude.ai that Claude Code will rewrite.** Either claude.ai produces a tight brief for Claude Code, or Claude Code does the work — not both.
4. **Use the VS Code extension for fixes under ~15 lines.** Faster, no session overhead.
5. **Review smoke test results in claude.ai (Sonnet)** before next phase — keeps Claude Code sessions short.
6. **Log polish items during smoke tests.** Don't fix them inline — add to POLISH_NOTES_ONGOING.md and address in PPOL-ONGOING.

---

## Anti-patterns (do not do)

- Pasting the entire build plan into every new Claude Code session
- Asking claude.ai to write code, then asking Claude Code to implement that same code (double-pay)
- Running Opus for routine planning chats
- Letting one Claude Code session span multiple phases
- Asking Claude Code to "also fix this other thing while you're in there"
- Doing feature work during a reshape or polish phase
- Fixing polish items inline during a feature phase instead of logging them

---

## Setup checklist (one-time) ✅

- [x] `CLAUDE_ONGOING.md` lives at repo root (as `CLAUDE.md`)
- [x] `CLAUDE_ONGOING.md` is also in this claude.ai Project's knowledge files
- [x] `PROJECT_INSTRUCTIONS.md` contents pasted into claude.ai Project's custom instructions
- [x] `docs/BUILD_PLAN_ONGOING.md` and `docs/TOOL_ROUTING_ONGOING.md` committed
- [x] `docs/FEATURE_BACKLOG_ONGOING.md` committed (backlog — not passed to Claude Code)
- [x] `POLISH_NOTES_ONGOING.md` lives at repo root and uploaded to this claude.ai Project
- [x] Claude Code CLI logged into the right Anthropic account (Max plan)
- [x] VS Code extension logged in
