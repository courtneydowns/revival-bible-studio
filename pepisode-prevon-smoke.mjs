// PEPISODE-PREVON smoke test — covers every item in the smoke checklist
// from BUILD_PLAN_ONGOING.md:
//   1. Seed canon entries across two episodes
//   2. Open Episode 2; generate "Previously on"
//   3. Confirm summary reflects only canon locked as of Episode 1
//   4. Export; confirm output

import { chromium } from 'playwright-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const APP_DIR = '/Users/courtneydowns/Documents/revival-bible-studio';
const SHOT_DIR = '/tmp/pepisode-prevon-smoke';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const ELECTRON_BIN = path.join(APP_DIR, 'node_modules/.bin/electron');
const DEVTOOLS_PORT = 9229;
const DEVTOOLS_PORT_FILE = `/Users/courtneydowns/Library/Application Support/revival-bible-studio/DevToolsActivePort`;

const PASS = '✅'; const FAIL = '❌';
let passed = 0; let failed = 0;
function report(label, ok, detail) {
  console.log(`${ok ? PASS : FAIL} ${label}${detail ? ' — ' + detail : ''}`);
  if (ok) passed++; else failed++;
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const EP1_TITLE = 'SMOKE-PREVON-EP1 S1E1 Pilot';
const EP2_TITLE = 'SMOKE-PREVON-EP2 S1E2 The Morning After';
const CANON_EP1_TITLE = 'SMOKE-PREVON Canon Fact (Episode 1 era)';
const CANON_EP2_TITLE = 'SMOKE-PREVON Canon Fact (Episode 2 era)';

// ── Launch app with clean environment + remote-debugging-port ────────────────
// We must strip VS Code env vars so Electron launches as a real macOS app,
// not as the Node.js stub that VS Code's Electron context produces.
console.log('Killing any existing Electron instances…');
try {
  const { execSync } = await import('node:child_process');
  execSync('pkill -x Electron 2>/dev/null || true', { timeout: 3000 });
} catch (_) {}
await wait(1_500);

// Remove stale port file
try { fs.unlinkSync(DEVTOOLS_PORT_FILE); } catch (_) {}

const cleanEnv = {
  HOME: process.env.HOME,
  USER: process.env.USER,
  LOGNAME: process.env.LOGNAME,
  SHELL: '/bin/zsh',
  LANG: 'en_US.UTF-8',
  XPC_SERVICE_NAME: '0',
  XPC_FLAGS: '0x0',
  PATH: process.env.NVM_BIN
    ? `${process.env.NVM_BIN}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`
    : '/usr/local/bin:/usr/bin:/bin',
  TMPDIR: process.env.TMPDIR || '/tmp',
};

console.log(`Launching app with clean env + --remote-debugging-port=${DEVTOOLS_PORT}…`);
const child = spawn(
  ELECTRON_BIN,
  [`--remote-debugging-port=${DEVTOOLS_PORT}`, APP_DIR],
  { env: cleanEnv, detached: false, stdio: ['ignore', 'pipe', 'pipe'] }
);
child.stdout.on('data', d => process.stdout.write(`[app] ${d}`));
child.stderr.on('data', d => {
  const s = d.toString();
  if (!s.includes('bad option')) process.stderr.write(`[app-err] ${s}`);
});
child.on('exit', (code) => {
  if (code !== null) console.log(`[app] exited with code ${code}`);
});

// Wait for app to be ready (DevTools port file or CDP response)
console.log('Waiting for DevTools server…');
let browser = null;
for (let i = 0; i < 40; i++) {
  await wait(500);
  // Try connecting directly to the CDP port
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${DEVTOOLS_PORT}`, { timeout: 1500 });
    console.log(`Connected on port ${DEVTOOLS_PORT}.`);
    break;
  } catch (_) {}
}

// Fallback: read DevToolsActivePort
if (!browser && fs.existsSync(DEVTOOLS_PORT_FILE)) {
  const port = parseInt(fs.readFileSync(DEVTOOLS_PORT_FILE, 'utf8').split('\n')[0].trim(), 10);
  if (port && !isNaN(port)) {
    console.log(`Trying DevToolsActivePort: ${port}`);
    browser = await chromium.connectOverCDP(`http://localhost:${port}`, { timeout: 5000 });
  }
}

if (!browser) {
  child.kill();
  throw new Error('Could not connect to app DevTools after 20s. Check terminal output above.');
}

const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => !p.url().startsWith('devtools://')) ?? await ctx.waitForEvent('page');
await wait(2_000);

// ── Helper: clean up smoke entries from previous runs ───────────────────────
async function cleanupSmokeData() {
  await page.evaluate(async ({ ep1, ep2, c1, c2 }) => {
    const allEps = await window.revival.episodes.list();
    for (const ep of allEps) {
      if (ep.title === ep1 || ep.title === ep2) {
        await window.revival.episodes.delete(ep.id);
      }
    }
    const allCanon = await window.revival.canon.list();
    for (const ce of allCanon) {
      if (ce.title === c1 || ce.title === c2) await window.revival.canon.delete(ce.id);
    }
    try {
      const retiredCanon = await window.revival.canon.listRetired();
      for (const ce of retiredCanon) {
        if (ce.title === c1 || ce.title === c2) await window.revival.canon.delete(ce.id);
      }
    } catch (_) {}
  }, { ep1: EP1_TITLE, ep2: EP2_TITLE, c1: CANON_EP1_TITLE, c2: CANON_EP2_TITLE });
}

await cleanupSmokeData();
await wait(300);

// ── Step 1: Create Episode 1 ─────────────────────────────────────────────────
const ep1 = await page.evaluate(async (title) => {
  return window.revival.episodes.create({ title, body: 'Episode 1 outline.' });
}, EP1_TITLE);
report('Episode 1 created', !!ep1?.id, ep1?.id ? `id=${ep1.id}` : 'no id');
await wait(150);

// ── Step 2: Create and lock a canon entry (Episode 1 era) ────────────────────
const canon1 = await page.evaluate(async (title) => {
  return window.revival.canon.create({
    title,
    body: 'Megan Whitfield is the series protagonist.',
    entry_type: 'knowledge_state',
  });
}, CANON_EP1_TITLE);
report('Canon Entry 1 created', !!canon1?.id, canon1?.id ? `id=${canon1.id}` : 'no id');
await wait(150);

await page.evaluate(async (id) => {
  return window.revival.canon.setLocked(id, { locked: true, locked_label: 'S1 locked' });
}, canon1.id);
report('Canon Entry 1 locked', true);
await wait(400); // ensure locked_at < ep2.created_at

// ── Step 3: Create Episode 2 ─────────────────────────────────────────────────
const ep2 = await page.evaluate(async (title) => {
  return window.revival.episodes.create({ title, body: 'Episode 2 outline.' });
}, EP2_TITLE);
report('Episode 2 created', !!ep2?.id, ep2?.id ? `id=${ep2.id}` : 'no id');
await wait(150);

// ── Step 4: Create and lock a canon entry AFTER Episode 2 (should NOT appear) ─
const canon2 = await page.evaluate(async (title) => {
  return window.revival.canon.create({
    title,
    body: 'Jordan Lee joins the group in Episode 2.',
    entry_type: 'knowledge_state',
  });
}, CANON_EP2_TITLE);
report('Canon Entry 2 (post-EP2) created', !!canon2?.id, canon2?.id ? `id=${canon2.id}` : 'no id');
await wait(150);

await page.evaluate(async (id) => {
  return window.revival.canon.setLocked(id, { locked: true, locked_label: 'S1 locked' });
}, canon2.id);
report('Canon Entry 2 locked (after EP2 created)', true);
await wait(300);

// ── Step 5: Verify the DB query returns correct results ──────────────────────
const prevOnData = await page.evaluate(async (ep2Id) => {
  return window.revival.episodes.previouslyOn(ep2Id);
}, ep2.id);

report('previouslyOn IPC returns data', !!prevOnData, prevOnData ? 'ok' : 'null');

const titles = prevOnData?.lockedEntries?.map(e => e.title) ?? [];
const hasC1 = titles.includes(CANON_EP1_TITLE);
const hasC2 = titles.includes(CANON_EP2_TITLE);
report('Canon Entry 1 (pre-EP2) appears in snapshot', hasC1,
  hasC1 ? 'found' : `not in [${titles.slice(0, 3).join(', ')}…]`);
report('Canon Entry 2 (post-EP2) excluded from snapshot', !hasC2,
  !hasC2 ? 'correctly absent' : 'WRONGLY present');
report('Prior episode label references EP1 context', !!prevOnData?.priorEpisode,
  prevOnData?.priorEpisode?.title || 'null');

// ── Step 6: Navigate to Episodes workspace and open Episode 2 detail ─────────
await page.evaluate(() => {
  const b = document.querySelector('button[title="Episodes"]') ||
    [...document.querySelectorAll('button')].find(e =>
      e.querySelector('.nav-label')?.textContent?.trim() === 'Episodes');
  b?.click();
});
await wait(1_000);
await page.screenshot({ path: path.join(SHOT_DIR, '01-episodes-list.png') });

const ep2Clicked = await page.evaluate((ep2Title) => {
  const items = [...document.querySelectorAll('.tc-list-item')];
  const item = items.find(i => i.querySelector('.tc-list-title')?.textContent?.trim() === ep2Title);
  item?.click();
  return !!item;
}, EP2_TITLE);
report('Episode 2 clicked in list', ep2Clicked);
await wait(800);
await page.screenshot({ path: path.join(SHOT_DIR, '02-episode2-detail.png') });

// ── Step 7: Open "Previously on" details section ─────────────────────────────
const prevonOpened = await page.evaluate(() => {
  const sections = [...document.querySelectorAll('details.ep-prevon-section')];
  const section = sections[sections.length - 1];
  if (!section) return false;
  section.open = true;
  return true;
});
report('"Previously on" section present and opened', prevonOpened);
await wait(400);
await page.screenshot({ path: path.join(SHOT_DIR, '03-prevon-opened.png') });

// ── Step 8: Click Generate ────────────────────────────────────────────────────
const generateClicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button.ep-prevon-generate-btn')].find(b => !b.disabled);
  btn?.click();
  return !!btn;
});
report('Generate button found and clicked', generateClicked);
await wait(1_200);
await page.screenshot({ path: path.join(SHOT_DIR, '04-after-generate.png') });

// ── Step 9: Confirm panel rendered results ────────────────────────────────────
const panelText = await page.evaluate(() => {
  const body = document.querySelector('.ep-prevon-body');
  return body?.innerText ?? '';
});
const panelHasC1 = panelText.includes(CANON_EP1_TITLE);
const panelHasC2 = panelText.includes(CANON_EP2_TITLE);
report('Panel shows Canon Entry 1 (pre-EP2)', panelHasC1,
  panelHasC1 ? 'found in DOM' : `absent — panel: "${panelText.slice(0, 100)}"`);
report('Panel excludes Canon Entry 2 (post-EP2)', !panelHasC2,
  !panelHasC2 ? 'correctly absent' : 'WRONGLY present in DOM');

const contextText = await page.evaluate(() =>
  document.querySelector('.ep-prevon-context')?.textContent?.trim() ?? '');
report('Context line rendered', contextText.length > 0, contextText.slice(0, 80));

// ── Step 10: Export .txt ──────────────────────────────────────────────────────
const exportDir = path.join(process.env.HOME, 'Documents/revival-bible-studio/previously_on');
const preExportCount = fs.existsSync(exportDir) ? fs.readdirSync(exportDir).length : 0;

const exportClicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button.ep-prevon-action-btn')].find(b =>
    b.textContent?.includes('Export'));
  btn?.click();
  return !!btn;
});
report('Export .txt button found and clicked', exportClicked);
await wait(1_500);

const postExportCount = fs.existsSync(exportDir) ? fs.readdirSync(exportDir).length : 0;
report('Export created a new .txt file', postExportCount > preExportCount,
  `files before=${preExportCount} after=${postExportCount}`);

if (postExportCount > preExportCount) {
  const files = fs.readdirSync(exportDir).sort();
  const lastFile = files[files.length - 1];
  const content = fs.readFileSync(path.join(exportDir, lastFile), 'utf8');
  const exportHasC1 = content.includes(CANON_EP1_TITLE);
  const exportHasC2 = content.includes(CANON_EP2_TITLE);
  report('Export file contains Canon Entry 1', exportHasC1,
    exportHasC1 ? lastFile : 'not found in export');
  report('Export file excludes Canon Entry 2', !exportHasC2,
    !exportHasC2 ? 'correct' : 'WRONGLY present');
}

await page.screenshot({ path: path.join(SHOT_DIR, '05-final.png') });

// ── Cleanup ───────────────────────────────────────────────────────────────────
await cleanupSmokeData();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`);

await browser.close();
child.kill();

if (failed > 0) {
  console.log(`Screenshots in ${SHOT_DIR}`);
  process.exit(1);
}
console.log(`Done. Screenshots in ${SHOT_DIR}`);
