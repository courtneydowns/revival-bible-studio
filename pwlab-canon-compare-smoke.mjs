// PWLAB-CANON-COMPARE smoke test — covers every item in the smoke checklist
// from BUILD_PLAN_ONGOING.md.
import { _electron as electron } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = '/Users/courtneydowns/Documents/revival-bible-studio';
const SHOT_DIR = '/tmp/pwlab-canon-compare-smoke';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const electronBin = path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

const PASS = '✅'; const FAIL = '❌';
let passed = 0; let failed = 0;
function report(label, ok, detail) {
  console.log(`${ok ? PASS : FAIL} ${label}${detail ? ' — ' + detail : ''}`);
  if (ok) passed++; else failed++;
}

const navTo = (title) => `
  const b = document.querySelector('button[title="${title}"]') ||
    [...document.querySelectorAll('button')].find(e => e.querySelector('.nav-label')?.textContent?.trim() === '${title}');
  b?.click();
`;

// Draft body with two deliberate canon divergences:
// 1. "Megan Whitfield is a background character" (canon: series protagonist)
// 2. "The episode opens with Megan at a party on Saturday night" (canon: opening register is cold-morning sponsor call)
const DIVERGING_DRAFT_TITLE = 'SMOKE-CANON-TEST Draft';
const DIVERGING_DRAFT_BODY =
  'Megan Whitfield is a background character who rarely appears in the show. ' +
  'The episode opens with Megan at a party on Saturday night, celebrating with friends. ' +
  'She has never attended a sponsor call or thought about recovery.';

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
await new Promise(r => setTimeout(r, 1_000));

// Clean up any prior smoke draft, then create a new one
await page.evaluate(async (draftTitle) => {
  const items = [...document.querySelectorAll('.tc-list-item')];
  for (const item of items) {
    if (item.querySelector('.tc-list-title')?.textContent?.trim() === draftTitle) {
      item.click();
      await new Promise(r => setTimeout(r, 400));
      const delBtn = [...document.querySelectorAll('button')].find(b => b.className?.includes('btn-danger') && b.textContent?.trim() === 'Delete');
      delBtn?.click();
      await new Promise(r => setTimeout(r, 300));
      const confirm = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Delete' && b !== delBtn);
      confirm?.click();
      await new Promise(r => setTimeout(r, 600));
      break;
    }
  }
}, DIVERGING_DRAFT_TITLE);

// Click "New draft"
const newDraftClicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b =>
    b.textContent?.trim() === '+ New draft' || b.textContent?.trim() === 'New draft');
  btn?.click();
  return !!btn;
});
report('New draft button found and clicked', newDraftClicked);
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: path.join(SHOT_DIR, '01-new-draft.png') });

// Fill in title and body
await page.evaluate(({ title, body }) => {
  const titleEl = document.querySelector('.wl-title');
  const bodyEl = document.querySelector('.wl-body');
  if (titleEl) { titleEl.value = title; titleEl.dispatchEvent(new Event('input', { bubbles: true })); }
  if (bodyEl) { bodyEl.value = body; bodyEl.dispatchEvent(new Event('input', { bubbles: true })); }
}, { title: DIVERGING_DRAFT_TITLE, body: DIVERGING_DRAFT_BODY });
await new Promise(r => setTimeout(r, 400));

// ── Smoke 1: "Compare to Canon" button present in toolbar ────────────────────
const compareBtn = await page.evaluate(() => {
  const btn = document.querySelector('.wl-compare-btn');
  return { found: !!btn, text: btn?.textContent?.trim(), disabled: btn?.disabled };
});
report('"Compare to Canon" button present in Writing Lab toolbar', compareBtn.found, `text: "${compareBtn.text}", disabled: ${compareBtn.disabled}`);

// Save the draft first (autosave usually handles this, but let's wait for it)
await new Promise(r => setTimeout(r, 2_000));
await page.screenshot({ path: path.join(SHOT_DIR, '02-draft-ready.png') });

// ── Smoke 2: Click button → compare panel appears + shows "Comparing…" ───────
console.log('\nRunning comparison against Claude API — this may take 10–30 seconds…');
const panelAppeared = await page.evaluate(async () => {
  const btn = document.querySelector('.wl-compare-btn');
  if (!btn) return { ok: false, msg: 'no button' };
  btn.click();
  await new Promise(r => setTimeout(r, 500));
  const panel = document.querySelector('.wl-compare');
  const body = document.querySelector('.wl-compare-body');
  const hasStatus = !!(body?.querySelector('.cr-conflict-status'));
  const statusText = body?.querySelector('.cr-conflict-status')?.textContent?.trim() || '';
  return { ok: !panel?.hidden, panelVisible: !panel?.hidden, hasStatus, statusText };
});
report('Clicking "Compare to Canon" opens compare panel', panelAppeared.ok, `status: "${panelAppeared.statusText}"`);
await page.screenshot({ path: path.join(SHOT_DIR, '03-panel-loading.png') });

// Wait for the API response (up to 45 seconds)
let flagsFound = false;
let flagCount = 0;
for (let i = 0; i < 45; i++) {
  await new Promise(r => setTimeout(r, 1_000));
  const state = await page.evaluate(() => {
    const btn = document.querySelector('.wl-compare-btn');
    const status = document.querySelector('.wl-compare-body .cr-conflict-status')?.textContent?.trim();
    const flags = document.querySelectorAll('.wl-compare-flag');
    return { btnDisabled: btn?.disabled, statusText: status || '', flagCount: flags.length };
  });
  if (!state.btnDisabled) {
    // Button re-enabled means request completed
    flagsFound = state.flagCount > 0;
    flagCount = state.flagCount;
    break;
  }
  if (i % 5 === 4) process.stdout.write(`  …waiting (${i + 1}s)\n`);
}

await page.screenshot({ path: path.join(SHOT_DIR, '04-flags-result.png') });

// ── Smoke 3: Flags surface with canon entry citation ─────────────────────────
report('Flags returned from comparison', flagsFound || flagCount > 0, `flag count: ${flagCount}`);

const flagDetails = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.wl-compare-flag')];
  return cards.map(card => ({
    citation: card.querySelector('.wl-compare-flag-citation')?.textContent?.trim() || '',
    reason: card.querySelector('.wl-compare-flag-reason')?.textContent?.trim().slice(0, 80) || '',
    hasDraftLoc: !!card.querySelector('.wl-compare-flag-loc'),
    hasActions: !!card.querySelector('.wl-compare-flag-actions'),
    hasRouteConflict: !!card.querySelector('.wl-compare-flag-actions button:nth-child(1)'),
    hasRouteOq: !!card.querySelector('.wl-compare-flag-actions button:nth-child(2)'),
    hasDismiss: !!card.querySelector('.wl-compare-flag-actions button:nth-child(3)'),
  }));
});

if (flagDetails.length > 0) {
  const firstFlag = flagDetails[0];
  report('Flag has canon citation (T-code or #id + title)', firstFlag.citation.length > 0, `"${firstFlag.citation}"`);
  report('Flag has reason text', firstFlag.reason.length > 0, `"${firstFlag.reason}"`);
  report('Flag has draft location', firstFlag.hasDraftLoc);
  report('Flag has Route to Conflicts button', firstFlag.hasRouteConflict);
  report('Flag has Route to Open Questions button', firstFlag.hasRouteOq);
  report('Flag has Dismiss button', firstFlag.hasDismiss);
} else {
  const statusMsg = await page.evaluate(() =>
    document.querySelector('.wl-compare-body .cr-conflict-status')?.textContent?.trim() || '(no status)');
  report('Flag has canon citation', false, `no flags — status: "${statusMsg}"`);
  report('Flag has reason text', false, 'no flags');
  report('Flag has draft location', false, 'no flags');
  report('Flag has Route to Conflicts button', false, 'no flags');
  report('Flag has Route to Open Questions button', false, 'no flags');
  report('Flag has Dismiss button', false, 'no flags');
}

// ── Smoke 4: Route first flag to Conflicts ───────────────────────────────────
if (flagDetails.length > 0) {
  const routeResult = await page.evaluate(async () => {
    const card = document.querySelector('.wl-compare-flag');
    if (!card) return { ok: false, msg: 'no flag card' };
    const routeBtn = card.querySelector('.wl-compare-flag-actions button:nth-child(1)');
    if (!routeBtn) return { ok: false, msg: 'no Route to Conflicts button' };
    routeBtn.click();
    // Wait for routing to complete
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 500));
      const routed = card.querySelector('.wl-compare-flag-routed');
      if (routed) return { ok: true, text: routed.textContent?.trim() };
      const errEl = card.querySelector('.wl-compare-flag-error');
      if (errEl) return { ok: false, msg: errEl.textContent?.trim() };
    }
    return { ok: false, msg: 'timeout waiting for route confirmation' };
  });
  report('Route flag to Conflicts → "Routed to Conflicts." confirmation', routeResult.ok, routeResult.ok ? `"${routeResult.text}"` : routeResult.msg);
  await page.screenshot({ path: path.join(SHOT_DIR, '05-routed-to-conflicts.png') });

  // Verify action buttons are gone after routing
  const actionsBtnGone = await page.evaluate(() => {
    const card = document.querySelector('.wl-compare-flag');
    const actions = card?.querySelector('.wl-compare-flag-actions');
    const routeBtn = actions?.querySelector('button');
    return { ok: !routeBtn };
  });
  report('After routing, action buttons replaced by confirmation text', actionsBtnGone.ok);
} else {
  report('Route flag to Conflicts', false, 'skipped — no flags');
  report('After routing, action buttons replaced by confirmation text', false, 'skipped — no flags');
}

// ── Smoke 5: Dismiss second flag (or first if only one) ──────────────────────
const remainingFlags = await page.evaluate(() => document.querySelectorAll('.wl-compare-flag').length);
if (remainingFlags > 0) {
  const dismissResult = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('.wl-compare-flag')];
    // Find a card with a dismiss button (not yet routed)
    const card = cards.find(c => {
      const actions = c.querySelector('.wl-compare-flag-actions');
      const btns = [...(actions?.querySelectorAll('button') || [])];
      return btns.some(b => b.textContent?.trim() === 'Dismiss');
    });
    if (!card) return { ok: false, msg: 'no dismissable flag found' };
    const dismissBtn = [...card.querySelectorAll('.wl-compare-flag-actions button')].find(b => b.textContent?.trim() === 'Dismiss');
    const cardParent = card.parentElement;
    dismissBtn?.click();
    await new Promise(r => setTimeout(r, 300));
    const cardGone = !cardParent?.contains(card) || !document.contains(card);
    const remainingCards = document.querySelectorAll('.wl-compare-flag').length;
    const allClearedMsg = document.querySelector('.wl-compare-body .cr-conflict-status')?.textContent?.trim() || '';
    return { ok: cardGone, cardGone, remainingCards, allClearedMsg };
  });
  report('Dismiss flag → card removed from panel', dismissResult.ok, `remaining: ${dismissResult.remainingCards}, msg: "${dismissResult.allClearedMsg}"`);
  await page.screenshot({ path: path.join(SHOT_DIR, '06-dismissed.png') });
} else {
  // If only one flag existed and we just routed it, test dismiss with a fresh run
  report('Dismiss flag', false, 'skipped — no remaining dismissable flags');
}

// ── Smoke 6: Collapse/expand toggle works ────────────────────────────────────
const toggleCheck = await page.evaluate(async () => {
  const header = document.querySelector('.wl-compare-header');
  const body = document.querySelector('.wl-compare-body');
  const toggle = document.querySelector('.wl-compare-toggle');
  if (!header || !body) return { ok: false, msg: 'header/body not found' };
  const wasVisible = !body.hidden;
  // Simulate clicking header (not the run button)
  const label = header.querySelector('.wl-compare-header-label');
  label?.click();
  await new Promise(r => setTimeout(r, 200));
  const nowHidden = body.hidden;
  const toggleText = toggle?.textContent?.trim();
  // Click again to re-expand
  label?.click();
  await new Promise(r => setTimeout(r, 200));
  const nowVisible = !body.hidden;
  return { ok: wasVisible && nowHidden && nowVisible, wasVisible, nowHidden, nowVisible, toggleText };
});
report('Collapse/expand toggle works on compare panel', toggleCheck.ok, `wasVisible:${toggleCheck.wasVisible} collapsed:${toggleCheck.nowHidden} restored:${toggleCheck.nowVisible}`);

// ── Smoke 7: "Run again" button is wired ─────────────────────────────────────
const runAgainBtn = await page.evaluate(() => {
  const btn = document.querySelector('.wl-compare-run-btn');
  return { found: !!btn, text: btn?.textContent?.trim(), disabled: btn?.disabled };
});
report('"Run again" button present inside compare panel', runAgainBtn.found, `text: "${runAgainBtn.text}"`);

await page.screenshot({ path: path.join(SHOT_DIR, '07-final.png') });

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n── RESULTS: ${passed} passed, ${failed} failed ──`);
console.log(`Screenshots: ${SHOT_DIR}`);
await app.close();
if (failed > 0) process.exit(1);
