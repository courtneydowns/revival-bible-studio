# Revival Studio — Polish Notes Ongoing

Running log of UI/UX observations from smoke tests. Addressed in PPOL1 (pre-import) and PPOL2 (pre-AI).

**How to use:**
- Add items during smoke tests as you notice them
- Tag each item with the phase it was noticed in
- Do not fix inline — log here and address in the next polish phase
- Mark resolved with ✅ and the polish phase that fixed it

---

## Format

	- [ ] [Phase noticed] Description of issue

---

## Active items

<!-- Add items below as you smoke test each phase-->

### PPOL1 — UI Polish: pre-import
- Work through all items logged in `POLISH_NOTES.md` up to this point
- No new features. Fixes, consistency, rough edges only.
- **Smoke:** Every item in POLISH\_NOTES.md marked resolved

- [x] PPOL1-01 [P32] Canon Bible archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-02 [P26] Characters archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-03 [P27] Episodes archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-04 [P8] Unsorted archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-05 [P12] Documents archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-06 [P10] Source Material archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-07 [P21] Open Questions archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-08 [P22] Conflicts archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-09 [P23] Decisions archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-10 [P24] Brainstorm archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-11 [P25] Research archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-12 [P29] Writing Lab archived section: per-entry checkbox + "Delete Selected" + "Delete All" bulk actions ✅ PPOL1
- [x] PPOL1-13 [PUI1] Left list card previews: title text overflows — add truncation ✅ PPOL1
- [x] PPOL1-14 [PUI1] Nav menu: add notification badges to Canon Review, Conflicts, and Open Questions (matching existing badge pattern) ✅ PPOL1
- [x] PPOL1-15 [P28] Home page: remove "Recently Viewed" section — Recent Activity already covers this ✅ PPOL1
- [x] PPOL1-16 [P37] Characters relational view: relationship lines between nodes are too light in both dark and light mode — increase stroke weight and/or use a more visible color so the connection is legible at a glance ✅ PPOL1

### PPOL2 — UI Polish: pre-AI
- Work through all items logged since PPOL1 (smoke pass run by Claude Code, 2026-06-06)
- No new features. Fixes, consistency, rough edges only.
- **Smoke:** Every item below marked resolved

- [x] PPOL2-01 [PCBREF] Canon Bible bulk-delete toolbar visible in Reference Mode — bypasses the Edit Mode gate ✅ PPOL2
- [x] PPOL2-04 [P35] Canon Review right-panel header stale after typing a new title in the edit form ✅ PPOL2
- [x] PPOL2-08 [PImp2] Quick-approve (`a` key) silently eats errors — user gets no feedback on failure ✅ PPOL2
- [x] PPOL2-09 [PImp2] Quick-defer (`d` key) silently eats errors — user gets no feedback on failure ✅ PPOL2
- [x] PPOL2-13 [PImp2] Import Phase 2 type filter shows empty container with no message when filter has zero results ✅ PPOL2
- [x] PPOL2-17 [PPASSIVE] Status bar shows "Unlocked" for non-canon workspaces — should be "Active" ✅ PPOL2
- [x] PPOL2-19 [P34] Canon Bible Retired section label reads "Retired / Archived (N)" — should be "Retired (N)" ✅ PPOL2
- [x] PPOL2-20 [P32] Canon Bible status messages (e.g. "Saved…", "Locked…") rendered in muted italic placeholder style ✅ PPOL2
- [x] PPOL2-21 [P37] Characters relational view toggle button missing active class when relational view is active ✅ PPOL2
- [x] PPOL2-23 [P35] Canon Review proposal list and detail meta show raw `source_kind` (e.g. `writing_lab`) instead of human-readable label ✅ PPOL2
- [x] PPOL2-28 [PTAG] Tag add button text inconsistent: detail bar and filter bar used opposite logic for "Tag" vs "Add tag" — standardized to "+ Tag" ✅ PPOL2
- [x] PPOL2-31 [PPASSIVE] Status bar always shows "Edited: —" for new entries — segment now omitted when not yet edited ✅ PPOL2
- [x] PPOL2-32 [PCONFLICT-2] Conflicts workspace rescan hint shows even when there are no active conflict entries ✅ PPOL2
- [x] PPOL2-34 [P32] Canon Bible entry titles had no overflow protection — long single words could overflow card header ✅ PPOL2
- [x] PPOL2-36 [PCAP] Quick Capture modal header always reads "→ Unsorted" even after changing the Send To destination ✅ PPOL2
- [x] PPOL2-39 [PHOME] Home count cells show "0" in full weight with no visual distinction from populated workspaces ✅ PPOL2

### Logged but deferred (feature territory or substantial)
- [ ] PPOL2-02 [PPASSIVE] Status bar missing from Canon Review proposals
- [ ] PPOL2-03 [PPASSIVE] Status bar missing from Writing Lab drafts
- [ ] PPOL2-06 [P35] Canon Review deferred section hidden when filter = "Deferred only" — items appear in main list (design debate)
- [ ] PPOL2-11 [PUI2] Writing Lab missing "Pop out" button
- [ ] PPOL2-12 [PUI2] Writing Lab missing linked-entries indicator
- [ ] PPOL2-26 [PSEARCH] Search: Canon Bible hits route to the page top, not the matched entry (known gap)
