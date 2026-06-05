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
| P0–P29 | ✅ Complete | — |
| P30 Canon schema design | ✅ Complete (claude.ai Opus) | No code. Highest-stakes decision in the project. |
| P31 Canon tables + read view | ✅ Complete (CLI) | — |
| **PR1 Reshape: settings** | **VS Code ext** | Single table recreate + reference updates |
| **PR2 Reshape: unsorted + documents + source_material** | **CLI** | Three tables + CRUD reference updates |
| **PR3 Reshape: chats + chat_source_attachments** | **VS Code ext** | Rename + one column add |
| **PR4 Reshape: open_questions + conflicts + decisions** | **CLI** | Three tables, several new columns each |
| **PR5 Reshape: brainstorm + research** | **VS Code ext** | Two renames + column adds |
| **PR6 Reshape: characters + episodes + writing_lab** | **CLI** | Three renames + FK columns, touches CRUD code |
| P32–P35 Canon UI | **CLI** | Each touches multiple files |
| P36 Cross-workspace attachments | **CLI** | Cross-module wiring |
| P37 Characters relational view | **CLI** | New visual component |
| P38 Characters/Episodes → Canon Review | **CLI** | Cross-module flow |
| P39 Claude API config | **CLI** | New module + settings UI |
| P40 Chat AI send/receive | **CLI** | API wiring |
| P41 AI → Canon Review pipeline | **CLI** | Cross-module flow |

---

## Reshape phases — rules

- **One reshape phase = one session.** Do not combine PR phases.
- **No feature work during reshape.** If something is broken after a rename, fix it. Do not add features.
- **No CRUD rewrites.** ALTER + rename + reference updates only. Preserve existing behavior exactly.
- **Smoke test is behavioral:** existing entries must still be visible and editable after every reshape phase.
- Tell Claude Code: "Do PR2 per docs/BUILD_PLAN.md. Alter tables only — no new features, no CRUD rewrites."

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
2. **Don't paste BUILD_PLAN.md into Claude Code.** It already has CLAUDE.md. Just say: "Do PR1 per docs/BUILD_PLAN.md."
3. **Don't write code in claude.ai that Claude Code will rewrite.** Either claude.ai produces a tight brief for Claude Code, or Claude Code does the work — not both.
4. **Use the VS Code extension for fixes under ~15 lines.** Faster, no session overhead.
5. **Review smoke test results in claude.ai (Sonnet)** before next phase — keeps Claude Code sessions short.

---

## Anti-patterns (do not do)

- Pasting the entire build plan into every new Claude Code session
- Asking claude.ai to write code, then asking Claude Code to implement that same code (double-pay)
- Running Opus for routine planning chats
- Letting one Claude Code session span multiple phases
- Asking Claude Code to "also fix this other thing while you're in there"
- Doing feature work during a reshape phase

---

## Setup checklist (one-time) ✅

- [x] `CLAUDE.md` lives at repo root
- [x] `CLAUDE.md` is also in this claude.ai Project's knowledge files
- [x] `PROJECT_INSTRUCTIONS.md` contents pasted into claude.ai Project's custom instructions
- [x] `docs/BUILD_PLAN.md` and `docs/TOOL_ROUTING.md` committed
- [x] Claude Code CLI logged into the right Anthropic account (Max plan)
- [x] VS Code extension logged in
