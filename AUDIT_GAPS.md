# Revival Studio — Audit Gaps
Generated: 2026-06-10

---

## Fixed in this session

| File | Lines | What |
|------|-------|------|
| renderer.js | 1642–1648 (pre-edit) | Removed two `console.log('[extract]')` debug statements leftover from PUI3 extract debugging. These logged internal item state to the DevTools console on every detail panel render. |
| renderer.js | 3216–3221 (pre-edit) | Removed two `console.debug('[PCONFLICT-2]')` statements inside `maybeFlagToast()`. These logged Canon Bible flagged-entry set membership on every archive/edit/delete action. |

---

## Dead code removed

Same four lines listed above (the console.log/debug calls were the only confirmed dead code).

---

## Build plan documentation gap — not a code problem

### PDRAFT-LOCK — implemented but unmarked ✅

The build plan lists PDRAFT-LOCK as a planned (not-yet-built) phase. The code is fully implemented:

- IPCs exist in main.js (`characters:draftLock`, `characters:draftUnlock`, `episodes:draftLock`, `episodes:draftUnlock`)
- Preload bridges exist in preload.js
- `mountDraftLockPanel()` is defined in renderer.js (~L13690) and called from both the Characters and Episodes `showViewTop` hooks
- `isItemDraftLocked()` is implemented in both workspace configs (checks `item.draft_locked_at`)
- List badge `badge-draft-locked` renders on locked entries in both workspaces

**Verdict:** Code is present and wired. Smoke test has never been run under this phase name. The phase should be marked ✅ and smoked. Not a code fix — a documentation and verification gap.

---

### PAUDIT-8 — build plan entry is misleading about scope

PAUDIT-8 (✅ Smoke passed 2026-06-08) lists four IPCs for removal:
- `canon:count` — confirmed absent from all files ✓
- `characterRelationships:update` — confirmed absent from all files ✓
- `brainstorm:threads.delete` — confirmed absent from all files ✓
- `brainstorm:threads.restore` — **still present** in main.js (L147), preload.js (L89), and called in renderer.js (L15180 `window.revival.brainstorm.threads.restore`)
- `brainstorm:threads.listArchived` — **still present** in main.js (L146), preload.js (L86), and called in renderer.js (L14948 `window.revival.brainstorm.threads.listArchived()`)

**Verdict:** The last two were correctly NOT removed. PAUDIT-5 added the archived threads UI that actively uses both. The PAUDIT-8 build plan entry is wrong to list them as removal targets after PAUDIT-5. No code action needed — documentation only.

---

## Ready for PAUDIT phase — safe unambiguous fixes

### Writing Lab

- **Word count in view-only state:** The `wc` counter at renderer.js ~L8866 sets `wc.textContent` inside the editor's action bar. This was the pre-PAUDIT-5 location. The status bar word count (lines ~9842–9843) is only mounted when `item` exists (i.e. after first autosave). On a brand-new unsaved draft (`currentId == null`), the status bar segments `wlWordSeg`/`wlSectionSeg` are null and `updateCounter()` silently no-ops. The spec says word count should always appear in the status bar. *Not fixed* — need to verify if "new draft before first save" is an edge case the spec covers or not. File: renderer.js, ~L9827 (status bar gate: `if (item) { ... }`). Could be a one-line fix but requires judgment on the new-unsaved-draft state.

---

## Needs judgment — design or architecture decision required

### Significant

- **PCHAT-ROUTE-GAP:** The "Route entire chat" action (full transcript as a single entry with attribution) is documented as missing/broken in BUILD_PLAN_ONGOING.md under the PCHAT-ROUTE entry. The chat toolbar has `chatRouteBtn` wired to `chatRoutePicker` in renderer.js (~L16323–16324) but the route-full-chat flow is confirmed as a gap. Logged for PPOL3 or PPOL-ONGOING. Not fixed — needs full implementation design.

- **PWLAB-SECTIONS not implemented:** Writing Lab scene/section markers (jump-to list, anchor navigation) are listed in the build plan without ✅. The `updateCounter()` at renderer.js ~L9173 counts `--- Name ---` dividers for the status bar section count, meaning the section marker *format* is defined, but the jump-to list and scroll-to-anchor affordance are absent. This is a planned-but-not-built feature. Flag only — do not touch.

### Minor

- **Writing Lab word count in action bar (legacy slot):** renderer.js ~L8866 sets `wc.textContent` in the editor's action-bar area. This appears to be a leftover from the pre-PAUDIT-5 location. After PAUDIT-5 moved word count to the status bar, this line may be dead or may serve a secondary display. Needs visual verification to confirm whether it's redundant or still visible somewhere.

- **Canon Review source kind `decisions` missing from `CR_SOURCE_KIND_TO_WORKSPACE` map:** renderer.js ~L5391 maps `decisions_workspace` → `'Decisions'` but not the bare `decisions` key. The `CANON_SOURCE_KIND_TO_WS` at ~L2877 inside `buildCanonCard` does include `decisions: 'Decisions'`. The two maps are inconsistent. Low risk — only affects back-link navigation from a Canon Review proposal whose `source_kind` was stored as `'decisions'` (vs `'decisions_workspace'`).

- **Status bar missing from Chat history right panel:** The `renderRight()` function in `renderChatPage()` (renderer.js ~L2039) does not mount a `buildStatusBar()`. The shared `buildStatusBar` spec says "every detail panel." Chat history is a different surface (read-only transcript, not an entry detail), so this may be intentional. Flag for review — not fixed.

- **Panic Export error message in renderer.js ~L17531:** `console.error('Panic Export failed:', err)` — this is legitimate error handling (not dead code) but the error is also surfaced to the user via `setStatus()` at the same line. The `console.error` is redundant for the user but may be useful for debugging. Leaving in place.

---

## Uncertain — could not determine intent

- **`wc` element at renderer.js ~L8866:** Inside the Writing Lab's `openEditor()` function, there is a `wc` element whose DOM position is unclear from a static read alone (it may be inside a `stats-bar` or an action row). If this element is visible to the user, it's a pre-PAUDIT-5 word count that survived the migration — a duplicate of the status bar count. If it's hidden, it's dead. Visual verification required.

- **`canvas:count` / navBadge for Conflicts:** The `NAV_BADGE_KEYS` map (renderer.js ~L16184–16189) includes `'Conflicts': 'conflicts'`. The `navBadges()` DB function must return a `conflicts` key for this to work. Not verified against db.js. If `db.dashboard.navBadges()` doesn't return `conflictsOldestDays`, the age suffix won't render on the Conflicts badge even though the count does. Low-confidence gap — flagged for DB-side verification.

---

## Coverage note

renderer.js was read in full across 9 sections (18,415 lines total). All sections were reviewed. main.js (2,141 lines) and preload.js (441 lines) were read in full. popout.js (968 lines), tags-ui.js (530 lines), and extract.js (416 lines) were sampled via grep; deep line-by-line read was not performed on those files. Flag if a popout.js or extract.js audit is needed separately.
