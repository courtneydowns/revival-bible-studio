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
| P0 Git connect | **CLI** | Terminal commands |
| P1 Electron window | **CLI** | New files, install deps |
| P2 Left nav placeholders | **CLI** | Multi-file scaffold |
| P3 UI principle template | **CLI** | Touches all workspaces |
| P4 SQLite + migrations | **CLI** | New module, deps |
| P5–P9 Unsorted lifecycle | **CLI** | Each phase = a feature set |
| P10–P12 Source / Documents | **CLI** | Multi-file each |
| P13–P16 Chat shell | **CLI** | New module |
| P17–P18 Chat attachments | **CLI** | Cross-module wiring |
| P19 Project Rules editor | **VS Code ext** | Likely single component |
| P20 Panic Export v1 | **CLI** | New module, file I/O |
| P21–P25 Remaining workspaces | **VS Code ext** | Copy of Unsorted pattern, small |
| P26 Characters CRUD | **VS Code ext** | Copy of Unsorted pattern, small |
| P27 Episodes CRUD | **VS Code ext** | Copy of Unsorted pattern, small |
| P28 Home dashboard | **CLI** | Aggregates from multiple sources |
| P29 Writing Lab | **CLI** | New module |
| **P30 Canon schema design** | **claude.ai (Opus)** | **No code. Highest-stakes decision in the project.** |
| P31 Canon tables + read view | **CLI** | New schema + UI |
| P32–P35 Canon features | **CLI** | Each touches multiple files |
| P36 Cross-workspace attachments | **CLI** | Cross-module wiring, join tables |
| P37 Characters relational view | **CLI** | New visual component |
| P38 Characters/Episodes → Canon Review | **CLI** | Cross-module flow |
| P39 Claude API config | **CLI** | New module + settings UI |
| P40 Chat AI send/receive | **CLI** | API wiring |
| P41 AI → Canon Review pipeline | **CLI** | Cross-module flow |

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
2. **Don't paste BUILD_PLAN.md into Claude Code.** It already has CLAUDE.md. Just say: "Do P5 per docs/BUILD_PLAN.md."
3. **Don't write code in claude.ai that Claude Code will rewrite.** Either claude.ai produces a tight brief for Claude Code, or Claude Code does the work — not both.
4. **Use the VS Code extension for fixes under ~15 lines.** Faster, no session overhead.
5. **Review smoke test results in claude.ai (Sonnet)** before next phase — keeps Claude Code sessions short.

---

## Anti-patterns (do not do)

- Pasting the entire rebuild plan into every new Claude Code session
- Asking claude.ai to write code, then asking Claude Code to implement that same code (double-pay)
- Running Opus for routine planning chats
- Letting one Claude Code session span multiple phases
- Asking Claude Code to "also fix this other thing while you're in there"

---

## Setup checklist (one-time)

- [ ] `CLAUDE.md` lives at repo root
- [ ] `CLAUDE.md` is also in this claude.ai Project's knowledge files
- [ ] `PROJECT_INSTRUCTIONS.md` contents pasted into claude.ai Project's custom instructions
- [ ] `docs/BUILD_PLAN.md` and `docs/TOOL_ROUTING.md` committed
- [ ] Claude Code CLI logged into the right Anthropic account (Max plan)
- [ ] VS Code extension logged in
