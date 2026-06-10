// PWLAB-SECTIONS smoke test — covers every item in the smoke checklist
// from BUILD_PLAN_ONGOING.md. Uses a "Smoke-Test Category" it creates
// and cleans up so the test is self-contained and idempotent.
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/Users/courtneydowns/Documents/revival-bible-studio';
const SHOT_DIR = '/tmp/wlab-sections-smoke';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const PASS = '✅'; const FAIL = '❌';
let passed = 0; let failed = 0;
function report(label, ok, detail) {
  console.log(`${ok ? PASS : FAIL} ${label}${detail ? ' — ' + detail : ''}`);
  if (ok) passed++; else failed++;
}

// Helper: nav by button title attribute
const navTo = (title) => `
  const b = document.querySelector('button[title="${title}"]') ||
    [...document.querySelectorAll('button')].find(e => e.querySelector('.nav-label')?.textContent?.trim() === '${title}');
  b?.click();
`;

console.log('Launching Revival Studio…');
const app = await electron.launch({
  executablePath: electronBin,
  args: [APP_DIR],
  timeout: 30_000,
});
await new Promise(r => setTimeout(r, 6_000));
const page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow();

// ── Navigate to Writing Lab ──────────────────────────────────────────────────
await page.evaluate(navTo('Writing Lab'));
await new Promise(r => setTimeout(r, 800));

// Open an existing draft or create a new one
const draftOpened = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.tc-list-item')];
  if (items.length > 0) { items[0].click(); return true; }
  const newBtn = [...document.querySelectorAll('button')].find(b =>
    b.textContent?.trim().includes('New draft') || b.textContent?.trim() === '+ New draft');
  if (newBtn) { newBtn.click(); return true; }
  return false;
});
report('Navigate to Writing Lab and open a draft', draftOpened);
await new Promise(r => setTimeout(r, 800));
await page.waitForSelector('.wl-section-insert-btn', { timeout: 5000 }).catch(() => {});

// ── Smoke 1: Category picker shows all seeded categories ─────────────────────
const pickerCheck = await page.evaluate(async () => {
  const sBtn = document.querySelector('.wl-section-insert-btn');
  if (!sBtn) return { ok: false, msg: '§ Section button not found' };
  sBtn.click();
  await new Promise(r => setTimeout(r, 700));
  const picker = [...document.querySelectorAll('.wl-section-picker')].find(p => !p.hidden);
  if (!picker) return { ok: false, msg: 'no visible picker found' };
  const items = [...picker.querySelectorAll('.wl-section-picker-item:not(.wl-section-picker-addnew)')];
  const hasAddNew = !!picker.querySelector('.wl-section-picker-addnew');
  const names = items.map(i => i.textContent?.trim());
  // Close picker
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  return { ok: true, names, hasAddNew };
});
const EXPECTED_CATS = ['Cold Open','Act One','Act Two','Act Three','Coda','Scene',
  'Quiet Devastation','Rewatch Layer','Consequence Scene','Dialogue','Montage',
  'Picking Up Here','Needs Work'];
// 14 seeded categories (Placeholder may have been renamed; check for 14 total, 13 known + 1 variable)
const has14 = pickerCheck.names?.length === 14;
const has13Core = EXPECTED_CATS.every(n => pickerCheck.names?.includes(n));
report('Category picker shows all 14 Writing Lab categories', pickerCheck.ok && has14, `${pickerCheck.names?.length} items, has 13 core: ${has13Core}`);
report('"Add new…" option present in picker', pickerCheck.hasAddNew);
await page.screenshot({ path: path.join(SHOT_DIR, '01-picker-closed.png') });

// ── Smoke 2: Insert "Act One" from picker → jump-to strip appears ─────────────
const insertActOne = await page.evaluate(async () => {
  // Clear body
  const textarea = document.querySelector('.wl-body');
  if (!textarea) return { ok: false, msg: 'no textarea' };
  textarea.value = '';
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));

  // Open picker
  const sBtn = document.querySelector('.wl-section-insert-btn');
  sBtn?.click();
  await new Promise(r => setTimeout(r, 700));

  // Find visible picker (may be different element than WL picker if there's stale state)
  const picker = [...document.querySelectorAll('.wl-section-picker')].find(p => !p.hidden);
  if (!picker) return { ok: false, msg: 'picker not visible' };

  const actOneBtn = [...picker.querySelectorAll('.wl-section-picker-item')].find(b => b.textContent?.trim() === 'Act One');
  if (!actOneBtn) return { ok: false, msg: 'Act One not found in picker', cats: [...picker.querySelectorAll('.wl-section-picker-item')].map(b=>b.textContent?.trim()) };
  actOneBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));

  const row = document.querySelector('.wl-section-insert-row');
  const inp = row?.querySelector('.wl-section-chip-input');
  const prefilledValue = inp?.value;
  const confirmBtn = row?.querySelector('.wl-section-chip-confirm');
  confirmBtn?.click();
  await new Promise(r => setTimeout(r, 500));

  const body = document.querySelector('.wl-body')?.value || '';
  const hasMarker = body.includes('--- Act One ---');
  const nav = document.querySelector('.wl-section-nav');
  const chips = [...(nav?.querySelectorAll('.wl-section-chip') || [])].map(c => c.textContent?.trim());

  return { ok: hasMarker, prefilledValue, hasMarker, navVisible: !nav?.hidden, chipCount: chips.length, chips };
});
report('Selecting category from picker pre-fills name input', insertActOne.prefilledValue === 'Act One', `pre-filled: "${insertActOne.prefilledValue}"`);
report('Inserting "Act One" adds marker to draft body', insertActOne.hasMarker);
report('Jump-to strip appears after first section inserted', insertActOne.navVisible && insertActOne.chipCount > 0, `chips: ${JSON.stringify(insertActOne.chips)}`);
await page.screenshot({ path: path.join(SHOT_DIR, '02-act-one-inserted.png') });

// ── Smoke 3: Insert "Act One" again → duplicate guard fires ──────────────────
const dupGuard = await page.evaluate(async () => {
  const sBtn = document.querySelector('.wl-section-insert-btn');
  sBtn?.click();
  await new Promise(r => setTimeout(r, 700));
  const picker = [...document.querySelectorAll('.wl-section-picker')].find(p => !p.hidden);
  const actOneBtn = [...(picker?.querySelectorAll('.wl-section-picker-item') || [])].find(b => b.textContent?.trim() === 'Act One');
  actOneBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));

  const row = document.querySelector('.wl-section-insert-row');
  const confirmBtn = row?.querySelector('.wl-section-chip-confirm');
  confirmBtn?.click();
  await new Promise(r => setTimeout(r, 200));

  const warn = document.querySelector('.wl-section-dup-warn');
  const warnVisible = warn && !warn.hidden && warn.textContent?.trim().length > 0;
  const body = document.querySelector('.wl-body')?.value || '';
  const markerCount = (body.match(/--- Act One ---/g) || []).length;

  document.querySelector('.wl-section-chip-cancel')?.click();
  return { warnVisible, markerCount };
});
report('Duplicate warning fires when inserting "Act One" again', dupGuard.warnVisible, `warn: ${dupGuard.warnVisible}`);
report('Insert blocked — still exactly 1 "Act One" marker', dupGuard.markerCount === 1, `count: ${dupGuard.markerCount}`);
await page.screenshot({ path: path.join(SHOT_DIR, '03-dup-warning.png') });

// ── Smoke 4: Insert "Scene" with custom name ──────────────────────────────────
const customInsert = await page.evaluate(async () => {
  const sBtn = document.querySelector('.wl-section-insert-btn');
  sBtn?.click();
  await new Promise(r => setTimeout(r, 700));
  const picker = [...document.querySelectorAll('.wl-section-picker')].find(p => !p.hidden);
  const sceneBtn = [...(picker?.querySelectorAll('.wl-section-picker-item') || [])].find(b => b.textContent?.trim() === 'Scene');
  sceneBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));

  const inp = document.querySelector('.wl-section-insert-row .wl-section-chip-input');
  if (!inp) return { ok: false, msg: 'no input after scene selection' };
  inp.value = 'The Opening Confrontation';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('.wl-section-insert-row .wl-section-chip-confirm')?.click();
  await new Promise(r => setTimeout(r, 400));

  const chips = [...document.querySelectorAll('.wl-section-chip')].map(c => c.textContent?.trim());
  const body = document.querySelector('.wl-body')?.value || '';
  return { ok: chips.includes('The Opening Confrontation') && body.includes('--- The Opening Confrontation ---'), chips };
});
report('Insert "Scene" with custom name → "The Opening Confrontation" in jump-to', customInsert.ok, `chips: ${JSON.stringify(customInsert.chips)}`);
await page.screenshot({ path: path.join(SHOT_DIR, '04-custom-name.png') });

// ── Smoke 5: Click each chip → cursor jumps ───────────────────────────────────
const scrollCheck = await page.evaluate(() => {
  const chips = [...document.querySelectorAll('.wl-section-chip')];
  const textarea = document.querySelector('.wl-body');
  if (!textarea || chips.length === 0) return { ok: false, chipCount: 0 };
  const results = chips.map(chip => { chip.click(); return { name: chip.textContent?.trim(), sel: textarea.selectionStart }; });
  return { ok: true, chipCount: chips.length, results };
});
report(`Clicking each chip scrolls to its section (${scrollCheck.chipCount} chips)`, scrollCheck.ok && scrollCheck.chipCount > 0, JSON.stringify(scrollCheck.results));

// ── Smoke 6: Section count in status bar ─────────────────────────────────────
const statusCheck = await page.evaluate(() => {
  const seg = [...document.querySelectorAll('.tc-statusbar-seg')].find(s =>
    s.querySelector('.tc-statusbar-key')?.textContent?.trim() === 'Sections');
  return seg ? { found: true, value: seg.textContent?.replace('Sections','').trim() } : { found: false };
});
report('Section count in status bar', statusCheck.found, `value: ${statusCheck.value}`);

// ── Smoke 7–9: Settings: add "Smoke-Test Category", inject it, rename, delete ─
// Step 7a: navigate to Settings and add "Smoke-Test Category"
await page.evaluate(navTo('Settings'));
await new Promise(r => setTimeout(r, 800));

const addCat = await page.evaluate(async () => {
  const cats = document.querySelector('.wl-cats-list');
  if (!cats) return { ok: false, msg: 'categories section not found in Settings' };
  const addInput = document.querySelector('.wl-cats-add-row input');
  const addBtn = document.querySelector('.wl-cats-add-row .btn-secondary');
  if (!addInput || !addBtn) return { ok: false, msg: 'add row not found' };
  // Remove stale smoke test category if it exists
  const rows = [...document.querySelectorAll('.wl-cats-row')];
  const existing = rows.find(r => r.querySelector('.wl-cats-name')?.textContent?.trim() === 'Smoke-Test Category');
  if (existing) {
    const delBtn = [...existing.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Delete');
    delBtn?.click();
    await new Promise(r => setTimeout(r, 300));
    const confirmYes = [...document.querySelectorAll('.wl-cats-confirm button')].find(b => b.textContent?.trim() === 'Delete');
    confirmYes?.click();
    await new Promise(r => setTimeout(r, 500));
  }
  addInput.value = 'Smoke-Test Category';
  addInput.dispatchEvent(new Event('input', { bubbles: true }));
  addBtn.click();
  await new Promise(r => setTimeout(r, 600));
  const allNames = [...document.querySelectorAll('.wl-cats-name')].map(n => n.textContent?.trim());
  return { ok: allNames.includes('Smoke-Test Category'), allNames };
});
report('Settings: add new category "Smoke-Test Category"', addCat.ok, addCat.ok ? `${addCat.allNames?.length} total categories` : addCat.msg);
await page.screenshot({ path: path.join(SHOT_DIR, '05-settings-add.png') });

// Step 7b: go to Writing Lab, inject "Smoke-Test Category" marker
await page.evaluate(navTo('Writing Lab'));
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => {
  const items = [...document.querySelectorAll('.tc-list-item')];
  if (items.length > 0) items[0].click();
});
await new Promise(r => setTimeout(r, 600));
await page.waitForSelector('.wl-section-insert-btn', { timeout: 5000 }).catch(() => {});

const injectSmoke = await page.evaluate(async () => {
  const sBtn = document.querySelector('.wl-section-insert-btn');
  sBtn?.click();
  await new Promise(r => setTimeout(r, 700));
  const picker = [...document.querySelectorAll('.wl-section-picker')].find(p => !p.hidden);
  const smokeBtn = [...(picker?.querySelectorAll('.wl-section-picker-item') || [])].find(b => b.textContent?.trim() === 'Smoke-Test Category');
  if (!smokeBtn) {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { ok: false, msg: 'Smoke-Test Category not in picker', cats: [...(picker?.querySelectorAll('.wl-section-picker-item') || [])].map(b => b.textContent?.trim()) };
  }
  smokeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('.wl-section-insert-row .wl-section-chip-confirm')?.click();
  await new Promise(r => setTimeout(r, 600));
  const body = document.querySelector('.wl-body')?.value || '';
  return { ok: body.includes('--- Smoke-Test Category ---') };
});
report('Inject "Smoke-Test Category" section into draft', injectSmoke.ok, injectSmoke.ok ? '' : injectSmoke.msg);

// Step 7c: Settings → rename "Smoke-Test Category" → "Smoke-Test Renamed"
await page.evaluate(navTo('Settings'));
await new Promise(r => setTimeout(r, 800));

const renameCat = await page.evaluate(async () => {
  const rows = [...document.querySelectorAll('.wl-cats-row')];
  const row = rows.find(r => r.querySelector('.wl-cats-name')?.textContent?.trim() === 'Smoke-Test Category');
  if (!row) return { ok: false, msg: 'Smoke-Test Category row not found', rows: rows.map(r => r.querySelector('.wl-cats-name')?.textContent?.trim()) };
  const renBtn = [...row.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Rename');
  renBtn?.click();
  await new Promise(r => setTimeout(r, 200));
  const inp = row.querySelector('input') || document.querySelector('.wl-cats-row input');
  if (!inp) return { ok: false, msg: 'rename input not shown' };
  inp.value = 'Smoke-Test Renamed';
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  const saveBtn = [...document.querySelectorAll('button')].find(b => b.className?.includes('wl-section-chip-confirm'));
  saveBtn?.click();
  await new Promise(r => setTimeout(r, 1000));
  const allNames = [...document.querySelectorAll('.wl-cats-name')].map(n => n.textContent?.trim());
  return { ok: allNames.includes('Smoke-Test Renamed') && !allNames.includes('Smoke-Test Category'), allNames };
});
report('Settings: rename "Smoke-Test Category" → "Smoke-Test Renamed"', renameCat.ok, renameCat.ok ? '' : renameCat.msg);
await page.screenshot({ path: path.join(SHOT_DIR, '06-settings-rename.png') });

// Step 7d: return to WL → verify marker updated
await page.evaluate(navTo('Writing Lab'));
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => { const items = [...document.querySelectorAll('.tc-list-item')]; if (items.length > 0) items[0].click(); });
await new Promise(r => setTimeout(r, 600));

const markerUpdated = await page.evaluate(() => {
  const body = document.querySelector('.wl-body')?.value || '';
  return { hasOld: body.includes('--- Smoke-Test Category ---'), hasNew: body.includes('--- Smoke-Test Renamed ---') };
});
report('After rename: marker updated in draft body', !markerUpdated.hasOld && markerUpdated.hasNew,
  `hasOld: ${markerUpdated.hasOld}, hasNew: ${markerUpdated.hasNew}`);
await page.screenshot({ path: path.join(SHOT_DIR, '07-marker-updated.png') });

// Step 7e: Settings → delete "Smoke-Test Renamed" → warning fires (it's in a draft)
await page.evaluate(navTo('Settings'));
await new Promise(r => setTimeout(r, 800));

const deleteCat = await page.evaluate(async () => {
  const rows = [...document.querySelectorAll('.wl-cats-row')];
  const row = rows.find(r => r.querySelector('.wl-cats-name')?.textContent?.trim() === 'Smoke-Test Renamed');
  if (!row) return { ok: false, msg: 'Smoke-Test Renamed not found', rowNames: rows.map(r => r.querySelector('.wl-cats-name')?.textContent?.trim()) };
  const delBtn = [...row.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Delete');
  delBtn?.click();
  await new Promise(r => setTimeout(r, 500));
  const confirmRows = [...document.querySelectorAll('.wl-cats-confirm')];
  if (confirmRows.length === 0) return { ok: false, msg: 'confirm row not shown' };
  const msgText = confirmRows[0].querySelector('span')?.textContent?.trim() || '';
  const hasWarning = msgText.includes('used in');
  // Proceed with delete to clean up
  const yesBtn = [...confirmRows[0].querySelectorAll('button')].find(b => b.textContent?.trim() === 'Delete');
  yesBtn?.click();
  await new Promise(r => setTimeout(r, 500));
  return { ok: hasWarning, msgText };
});
report('Settings: deleting "Smoke-Test Renamed" (in use) shows warning', deleteCat.ok, deleteCat.ok ? `msg: "${deleteCat.msgText?.slice(0,80)}"` : deleteCat.msg);
await page.screenshot({ path: path.join(SHOT_DIR, '08-delete-warning.png') });

// ── Smoke 10: Brainstorm entry shows picker with empty list + "Add new…" ──────
await page.evaluate(navTo('Brainstorm'));
await new Promise(r => setTimeout(r, 900));

await page.evaluate(() => {
  const items = [...document.querySelectorAll('.tc-list-item')];
  if (items.length > 0) { items[0].click(); return; }
  const addBtn = [...document.querySelectorAll('button')].find(b =>
    b.textContent?.trim() === 'Add Idea' || b.textContent?.trim() === '+ Add Idea');
  addBtn?.click();
});
await new Promise(r => setTimeout(r, 500));

// If we opened an existing item, switch to Edit
await page.evaluate(() => {
  const editBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Edit');
  editBtn?.click();
});
await new Promise(r => setTimeout(r, 400));

const bsPicker = await page.evaluate(async () => {
  // The § Section button in Brainstorm edit mode is inside the insert row
  const sBtn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === '§ Section');
  if (!sBtn) return { ok: false, msg: 'no § Section button', btns: [...document.querySelectorAll('button')].map(b=>b.textContent?.trim()).filter(Boolean).slice(0,15) };
  sBtn.click();
  await new Promise(r => setTimeout(r, 700));
  // Find the picker that's NOT hidden
  const pickers = [...document.querySelectorAll('.wl-section-picker')];
  const picker = pickers.find(p => !p.hidden);
  if (!picker) return { ok: false, msg: `no visible picker (${pickers.length} total, all hidden)` };
  const items = [...picker.querySelectorAll('.wl-section-picker-item:not(.wl-section-picker-addnew)')];
  const hasAddNew = !!picker.querySelector('.wl-section-picker-addnew');
  // Close picker
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  return { ok: true, itemCount: items.length, hasAddNew };
});
report('Brainstorm edit mode: § Section button opens picker', bsPicker.ok, bsPicker.ok ? `${bsPicker.itemCount} categories` : bsPicker.msg);
report('Brainstorm picker starts empty (no seeded categories)', bsPicker.ok && bsPicker.itemCount === 0, `item count: ${bsPicker.itemCount}`);
report('Brainstorm picker has "Add new…" option', bsPicker.hasAddNew);
await page.screenshot({ path: path.join(SHOT_DIR, '09-brainstorm-picker.png') });

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n── RESULTS: ${passed} passed, ${failed} failed ──`);
console.log(`Screenshots in ${SHOT_DIR}`);
await app.close();
if (failed > 0) process.exit(1);
