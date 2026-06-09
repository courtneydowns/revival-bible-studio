const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// PSESSION-LOG — in-memory event accumulator. Flushed to DB on will-quit or on
// the explicit "End Session" action from Settings. better-sqlite3 is sync so
// finalizeSession() can run synchronously inside the will-quit handler.
let sessionStart = null;
const sessionEvents = [];

function recordEvent(workspace, action) {
  if (!sessionStart) return;
  sessionEvents.push({ workspace, action, at: new Date().toISOString() });
}

function finalizeSession() {
  if (!sessionStart || sessionEvents.length === 0) { sessionStart = null; return; }
  const endedAt = new Date().toISOString();
  try { db.sessionLogs.save(sessionStart, endedAt, [...sessionEvents]); } catch {}
  sessionEvents.length = 0;
  sessionStart = null;
}

// Filesystem-safe timestamp for the export folder name, e.g. 2026-06-04_14-30-05.
function timestampSlug() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Revival Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

// PUI2: full-screen popout for any single entry. A second BrowserWindow
// loads popout.html with the workspace + id encoded in the query string —
// independent window state, full edit/rename/delete/archive/restore inside,
// rest of the app stays usable. Opens in Reference Mode by default; the
// popout itself flips into edit mode on a deliberate click.
function createPopoutWindow(workspace, id) {
  const win = new BrowserWindow({
    width: 820,
    height: 720,
    title: 'Revival Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, 'popout.html'), {
    query: { workspace, id: String(id) },
  });
}

function registerIpc() {
  ipcMain.handle('unsorted:list', () => db.listUnsorted());
  ipcMain.handle('unsorted:listArchived', () => db.listArchivedUnsorted());
  ipcMain.handle('unsorted:create', (_event, entry) => { const r = db.createUnsorted(entry); recordEvent('Unsorted', 'created'); return r; });
  ipcMain.handle('unsorted:update', (_event, id, entry) => db.updateUnsorted(id, entry));
  ipcMain.handle('unsorted:delete', (_event, id) => { const r = db.deleteUnsorted(id); recordEvent('Unsorted', 'deleted'); return r; });
  ipcMain.handle('unsorted:archive', (_event, id) => { const r = db.archiveUnsorted(id); recordEvent('Unsorted', 'archived'); return r; });
  ipcMain.handle('unsorted:restore', (_event, id) => db.restoreUnsorted(id));

  ipcMain.handle('sourceMaterial:list', () => db.sourceMaterial.list());
  ipcMain.handle('sourceMaterial:listArchived', () => db.sourceMaterial.listArchived());
  ipcMain.handle('sourceMaterial:create', (_event, entry) => { const r = db.sourceMaterial.create(entry); recordEvent('Source Material', 'created'); return r; });
  ipcMain.handle('sourceMaterial:update', (_event, id, entry) => db.sourceMaterial.update(id, entry));
  ipcMain.handle('sourceMaterial:delete', (_event, id) => { const r = db.sourceMaterial.delete(id); recordEvent('Source Material', 'deleted'); return r; });
  ipcMain.handle('sourceMaterial:archive', (_event, id) => { const r = db.sourceMaterial.archive(id); recordEvent('Source Material', 'archived'); return r; });
  ipcMain.handle('sourceMaterial:restore', (_event, id) => db.sourceMaterial.restore(id));
  ipcMain.handle('sourceMaterial:setFileMeta', (_event, id, meta) => db.sourceMaterial.setFileMeta(id, meta));
  ipcMain.handle('sourceMaterial:listResearchCitations', (_event, id) => db.sourceMaterial.listResearchCitations(id));

  ipcMain.handle('documents:list', () => db.documents.list());
  ipcMain.handle('documents:listArchived', () => db.documents.listArchived());
  ipcMain.handle('documents:create', (_event, entry) => { const r = db.documents.create(entry); recordEvent('Documents', 'created'); return r; });
  ipcMain.handle('documents:update', (_event, id, entry) => db.documents.update(id, entry));
  ipcMain.handle('documents:delete', (_event, id) => { const r = db.documents.delete(id); recordEvent('Documents', 'deleted'); return r; });
  ipcMain.handle('documents:archive', (_event, id) => { const r = db.documents.archive(id); recordEvent('Documents', 'archived'); return r; });
  ipcMain.handle('documents:restore', (_event, id) => db.documents.restore(id));

  ipcMain.handle('openQuestions:list', () => db.openQuestions.list());
  ipcMain.handle('openQuestions:listArchived', () => db.openQuestions.listArchived());
  ipcMain.handle('openQuestions:create', (_event, entry) => { const r = db.openQuestions.create(entry); recordEvent('Open Questions', 'created'); return r; });
  ipcMain.handle('openQuestions:update', (_event, id, entry) => db.openQuestions.update(id, entry));
  ipcMain.handle('openQuestions:delete', (_event, id) => { const r = db.openQuestions.delete(id); recordEvent('Open Questions', 'deleted'); return r; });
  ipcMain.handle('openQuestions:archive', (_event, id) => { const r = db.openQuestions.archive(id); recordEvent('Open Questions', 'archived'); return r; });
  ipcMain.handle('openQuestions:restore', (_event, id) => db.openQuestions.restore(id));
  ipcMain.handle('openQuestions:escalateTier', (_event, id) => { const r = db.openQuestions.escalateTier(id); recordEvent('Open Questions', 'tier-escalated'); return r; });
  ipcMain.handle('openQuestions:setBlocking', (_event, id, opts) => db.openQuestions.setBlocking(id, opts));
  ipcMain.handle('openQuestions:setCategory', (_event, id, cat) => db.openQuestions.setCategory(id, cat));
  ipcMain.handle('openQuestions:setTier', (_event, id, tier) => db.openQuestions.setTier(id, tier));
  ipcMain.handle('openQuestions:get', (_event, id) => db.openQuestions.get(id));
  ipcMain.handle('openQuestions:addDependency', (_event, dependentId, blockerId) => db.openQuestions.addDependency(dependentId, blockerId));
  ipcMain.handle('openQuestions:removeDependency', (_event, dependentId, blockerId) => db.openQuestions.removeDependency(dependentId, blockerId));
  ipcMain.handle('openQuestions:getDependencies', (_event, id) => db.openQuestions.getDependencies(id));

  ipcMain.handle('conflicts:list', () => db.conflicts.list());
  ipcMain.handle('conflicts:listArchived', () => db.conflicts.listArchived());
  ipcMain.handle('conflicts:create', (_event, entry) => { const r = db.conflicts.create(entry); recordEvent('Conflicts', 'created'); return r; });
  ipcMain.handle('conflicts:update', (_event, id, entry) => db.conflicts.update(id, entry));
  ipcMain.handle('conflicts:delete', (_event, id) => { const r = db.conflicts.delete(id); recordEvent('Conflicts', 'deleted'); return r; });
  ipcMain.handle('conflicts:archive', (_event, id) => { const r = db.conflicts.archive(id); recordEvent('Conflicts', 'archived'); return r; });
  ipcMain.handle('conflicts:restore', (_event, id) => db.conflicts.restore(id));
  ipcMain.handle('conflicts:setSeverity', (_event, id, severity) => db.conflicts.setSeverity(id, severity));

  ipcMain.handle('decisions:list', () => db.decisions.list());
  ipcMain.handle('decisions:listArchived', () => db.decisions.listArchived());
  ipcMain.handle('decisions:create', (_event, entry) => { const r = db.decisions.create(entry); recordEvent('Decisions', 'created'); return r; });
  ipcMain.handle('decisions:update', (_event, id, entry) => db.decisions.update(id, entry));
  ipcMain.handle('decisions:delete', (_event, id) => { const r = db.decisions.delete(id); recordEvent('Decisions', 'deleted'); return r; });
  ipcMain.handle('decisions:archive', (_event, id) => { const r = db.decisions.archive(id); recordEvent('Decisions', 'archived'); return r; });
  ipcMain.handle('decisions:restore', (_event, id) => db.decisions.restore(id));
  ipcMain.handle('decisions:createFromQuestion', (_event, questionId, entry) => { const r = db.decisions.createFromQuestion(questionId, entry); recordEvent('Decisions', 'created'); return r; });
  ipcMain.handle('decisions:setStatus', (_event, id, status) => db.decisions.setStatus(id, status));
  ipcMain.handle('decisions:promoteToCanonReview', (_event, id, payload) => db.decisions.promoteToCanonReview(id, payload));

  ipcMain.handle('brainstorm:list', () => db.brainstorm.list());
  ipcMain.handle('brainstorm:listArchived', () => db.brainstorm.listArchived());
  ipcMain.handle('brainstorm:create', (_event, entry) => { const r = db.brainstorm.create(entry); recordEvent('Brainstorm', 'created'); return r; });
  ipcMain.handle('brainstorm:update', (_event, id, entry) => db.brainstorm.update(id, entry));
  ipcMain.handle('brainstorm:delete', (_event, id) => { const r = db.brainstorm.delete(id); recordEvent('Brainstorm', 'deleted'); return r; });
  ipcMain.handle('brainstorm:archive', (_event, id) => { const r = db.brainstorm.archive(id); recordEvent('Brainstorm', 'archived'); return r; });
  ipcMain.handle('brainstorm:restore', (_event, id) => db.brainstorm.restore(id));
  // PBRAIN-STRUCT — thread management
  ipcMain.handle('brainstorm:threads.list', () => db.brainstormThreads.list());
  ipcMain.handle('brainstorm:threads.create', (_event, title) => db.brainstormThreads.create(title));
  ipcMain.handle('brainstorm:threads.update', (_event, id, title) => db.brainstormThreads.update(id, title));
  ipcMain.handle('brainstorm:threads.archive', (_event, id) => db.brainstormThreads.archive(id));
  // PBRAIN-STRUCT — item metadata
  ipcMain.handle('brainstorm:setThread', (_event, id, threadId) => db.brainstorm.setThread(id, threadId));
  ipcMain.handle('brainstorm:setDevInto', (_event, id, kind, targetId) => db.brainstorm.setDevInto(id, kind, targetId));
  ipcMain.handle('brainstorm:setStatus', (_event, id, status) => db.brainstorm.setStatus(id, status));

  ipcMain.handle('research:list', () => db.research.list());
  ipcMain.handle('research:listArchived', () => db.research.listArchived());
  ipcMain.handle('research:create', (_event, entry) => { const r = db.research.create(entry); recordEvent('Research', 'created'); return r; });
  ipcMain.handle('research:update', (_event, id, entry) => db.research.update(id, entry));
  ipcMain.handle('research:delete', (_event, id) => { const r = db.research.delete(id); recordEvent('Research', 'deleted'); return r; });
  ipcMain.handle('research:archive', (_event, id) => { const r = db.research.archive(id); recordEvent('Research', 'archived'); return r; });
  ipcMain.handle('research:restore', (_event, id) => db.research.restore(id));
  ipcMain.handle('research:setExternalUrl', (_event, id, url) => db.research.setExternalUrl(id, url));
  ipcMain.handle('research:setCitation', (_event, id, citation) => db.research.setCitation(id, citation));

  ipcMain.handle('characters:list', () => db.characters.list());
  ipcMain.handle('characters:listArchived', () => db.characters.listArchived());
  ipcMain.handle('characters:create', (_event, entry) => { const r = db.characters.create(entry); recordEvent('Characters', 'created'); return r; });
  ipcMain.handle('characters:update', (_event, id, entry) => db.characters.update(id, entry));
  ipcMain.handle('characters:delete', (_event, id) => { const r = db.characters.delete(id); recordEvent('Characters', 'deleted'); return r; });
  ipcMain.handle('characters:archive', (_event, id) => { const r = db.characters.archive(id); recordEvent('Characters', 'archived'); return r; });
  ipcMain.handle('characters:restore', (_event, id) => db.characters.restore(id));
  ipcMain.handle('characters:setStatus', (_event, id, status) => db.characters.setStatus(id, status));
  // PDRAFT-LOCK — Characters draft lock/unlock.
  ipcMain.handle('characters:draftLock',   (_event, id, forName) => db.characters.draftLock(id, forName));
  ipcMain.handle('characters:draftUnlock', (_event, id, note)    => db.characters.draftUnlock(id, note));
  // PARC-A — Character arc tracker: written timeline.
  ipcMain.handle('characters:arcTimeline', (_event, id) => db.characters.arcTimeline(id));

  // P37 — character relationship edges (workspace-level, not canon)
  ipcMain.handle('characterRelationships:listAll', () =>
    db.characterRelationships.listAll()
  );
  ipcMain.handle('characterRelationships:listForChar', (_event, charId) =>
    db.characterRelationships.listForChar(charId)
  );
  ipcMain.handle('characterRelationships:create', (_event, fromId, toId, relType, note) =>
    db.characterRelationships.create(fromId, toId, relType, note)
  );
  ipcMain.handle('characterRelationships:delete', (_event, id) =>
    db.characterRelationships.delete(id)
  );

  ipcMain.handle('episodes:list', () => db.episodes.list());
  ipcMain.handle('episodes:listArchived', () => db.episodes.listArchived());
  ipcMain.handle('episodes:create', (_event, entry) => { const r = db.episodes.create(entry); recordEvent('Episodes', 'created'); return r; });
  ipcMain.handle('episodes:update', (_event, id, entry) => db.episodes.update(id, entry));
  ipcMain.handle('episodes:delete', (_event, id) => { const r = db.episodes.delete(id); recordEvent('Episodes', 'deleted'); return r; });
  ipcMain.handle('episodes:archive', (_event, id) => { const r = db.episodes.archive(id); recordEvent('Episodes', 'archived'); return r; });
  ipcMain.handle('episodes:restore', (_event, id) => db.episodes.restore(id));
  ipcMain.handle('episodes:setStatus', (_event, id, status) => db.episodes.setStatus(id, status));
  // PDRAFT-LOCK — Episodes draft lock/unlock.
  ipcMain.handle('episodes:draftLock',   (_event, id, forName) => db.episodes.draftLock(id, forName));
  ipcMain.handle('episodes:draftUnlock', (_event, id, note)    => db.episodes.draftUnlock(id, note));
  // PEPISODE-STRUCT — Episode structure checklist.
  ipcMain.handle('episodes:structGet',        (_e, id)           => db.episodeStruct.get(id));
  ipcMain.handle('episodes:structSetChecked', (_e, id, key, val) => db.episodeStruct.setChecked(id, key, val));
  ipcMain.handle('episodes:structSetOverride',(_e, id, key, val) => db.episodeStruct.setOverride(id, key, val));
  // PEPISODE-PREVON — "Previously on" canon snapshot.
  ipcMain.handle('episodes:previouslyOn', (_e, id) => db.episodes.previouslyOn(id));
  ipcMain.handle('episodes:previouslyOnExport', (_e, id) => {
    const { episode, priorEpisode, lockedEntries } = db.episodes.previouslyOn(id);
    const lines = [
      `Revival Studio — Previously on: ${episode.title}`,
      priorEpisode ? `As of: ${priorEpisode.title}` : 'As of: before this episode',
      `Generated: ${new Date().toLocaleString()}`,
      `${lockedEntries.length} locked canon entr${lockedEntries.length === 1 ? 'y' : 'ies'}`,
      '',
    ];
    const byType = {};
    for (const e of lockedEntries) {
      const t = e.entry_type ? e.entry_type.charAt(0).toUpperCase() + e.entry_type.slice(1) : 'General';
      if (!byType[t]) byType[t] = [];
      byType[t].push(e);
    }
    for (const [type, entries] of Object.entries(byType)) {
      lines.push(`=== ${type} ===`);
      for (const e of entries) {
        lines.push(`  ${e.title}${e.locked_label ? '  [' + e.locked_label + ']' : ''}`);
        if (e.body) lines.push(`  ${e.body}`);
        lines.push('');
      }
    }
    const folder = path.join(app.getPath('documents'), 'revival-bible-studio', 'previously_on');
    fs.mkdirSync(folder, { recursive: true });
    const slug = episode.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const filePath = path.join(folder, `previously-on-${slug}.txt`);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    shell.openPath(folder);
    return { filePath };
  });

  // PQUIET — Quiet devastation tracker.
  ipcMain.handle('quietDevastations:getAll', () => db.quietDevastations.getAll());
  ipcMain.handle('quietDevastations:getByEpNum', (_e, epNum) => db.quietDevastations.getByEpNum(epNum));
  ipcMain.handle('quietDevastations:linkEpisode', (_e, epNum, episodeId) => db.quietDevastations.linkEpisode(epNum, episodeId));
  ipcMain.handle('quietDevastations:setCandidate', (_e, epNum, data) => db.quietDevastations.setCandidate(epNum, data));
  ipcMain.handle('quietDevastations:lock', (_e, epNum) => db.quietDevastations.lock(epNum));
  ipcMain.handle('quietDevastations:episodesWithoutCandidate', () => db.quietDevastations.episodesWithoutCandidate());

  ipcMain.handle('writingLab:list', () => db.writingLab.list());
  ipcMain.handle('writingLab:listArchived', () => db.writingLab.listArchived());
  ipcMain.handle('writingLab:create', (_event, entry) => { const r = db.writingLab.create(entry); recordEvent('Writing Lab', 'created'); return r; });
  ipcMain.handle('writingLab:update', (_event, id, entry) => db.writingLab.update(id, entry));
  ipcMain.handle('writingLab:delete', (_event, id) => { const r = db.writingLab.delete(id); recordEvent('Writing Lab', 'deleted'); return r; });
  ipcMain.handle('writingLab:archive', (_event, id) => { const r = db.writingLab.archive(id); recordEvent('Writing Lab', 'archived'); return r; });
  ipcMain.handle('writingLab:restore', (_event, id) => db.writingLab.restore(id));

  ipcMain.handle('chats:list', () => db.chats.list());
  ipcMain.handle('chats:listArchived', () => db.chats.listArchived());
  ipcMain.handle('chats:listWithMeta', () => db.chats.listWithMeta());
  ipcMain.handle('chats:listArchivedWithMeta', () => db.chats.listArchivedWithMeta());
  ipcMain.handle('chats:create', (_event, chat) => db.chats.create(chat));
  ipcMain.handle('chats:rename', (_event, id, chat) => db.chats.rename(id, chat));
  ipcMain.handle('chats:archive', (_event, id) => db.chats.archive(id));
  ipcMain.handle('chats:restore', (_event, id) => db.chats.restore(id));
  ipcMain.handle('chats:delete', (_event, id) => db.chats.delete(id));

  ipcMain.handle('chatSources:list', (_event, chatId) => db.chatSources.list(chatId));
  ipcMain.handle('chatSources:attach', (_event, chatId, sourceId) =>
    db.chatSources.attach(chatId, sourceId)
  );
  ipcMain.handle('chatSources:detach', (_event, chatId, sourceId) =>
    db.chatSources.detach(chatId, sourceId)
  );
  ipcMain.handle('chatDocuments:list', (_event, chatId) => db.chatDocuments.list(chatId));
  ipcMain.handle('chatDocuments:attach', (_event, chatId, documentId) =>
    db.chatDocuments.attach(chatId, documentId)
  );
  ipcMain.handle('chatDocuments:detach', (_event, chatId, documentId) =>
    db.chatDocuments.detach(chatId, documentId)
  );
  ipcMain.handle('chatCanon:list', (_event, chatId) => db.chatCanon.list(chatId));
  ipcMain.handle('chatCanon:attach', (_event, chatId, canonEntryId) =>
    db.chatCanon.attach(chatId, canonEntryId)
  );
  ipcMain.handle('chatCanon:detach', (_event, chatId, canonEntryId) =>
    db.chatCanon.detach(chatId, canonEntryId)
  );
  ipcMain.handle('chatCharacters:list', (_event, chatId) => db.chatCharacters.list(chatId));
  ipcMain.handle('chatCharacters:attach', (_event, chatId, characterId) =>
    db.chatCharacters.attach(chatId, characterId)
  );
  ipcMain.handle('chatCharacters:detach', (_event, chatId, characterId) =>
    db.chatCharacters.detach(chatId, characterId)
  );
  ipcMain.handle('chatEpisodes:list', (_event, chatId) => db.chatEpisodes.list(chatId));
  ipcMain.handle('chatEpisodes:attach', (_event, chatId, episodeId) =>
    db.chatEpisodes.attach(chatId, episodeId)
  );
  ipcMain.handle('chatEpisodes:detach', (_event, chatId, episodeId) =>
    db.chatEpisodes.detach(chatId, episodeId)
  );

  // Panic Export (P21): always saves to a fixed, predictable location —
  // ~/Documents/revival-bible-studio/panic_exports/<timestamp>/ — so the user
  // never has to choose and always knows where to look. Dumps the whole DB +
  // every Source Material entry, then reveals the folder. Copy-only — nothing
  // in the app is mutated.
  ipcMain.handle('panic:export', async () => {
    const folder = path.join(
      app.getPath('documents'),
      'revival-bible-studio',
      'panic_exports',
      `revival-export-${timestampSlug()}`
    );
    fs.mkdirSync(folder, { recursive: true });
    const counts = await db.exportAll(folder);
    shell.openPath(folder);
    return { canceled: false, folder, ...counts };
  });

  // Home dashboard (P27): read-only summary — counts per workspace + a recent
  // activity feed. No mutation.
  ipcMain.handle('dashboard:summary', (_event, limit) =>
    db.dashboard.summary(limit)
  );

  // PHOME: nav badge counts (Unsorted active / Canon Review pending / Open
  // Questions tier-1). Read-only.
  ipcMain.handle('dashboard:navBadges', () => db.dashboard.navBadges());

  // PHOME-NEEDS: stale items needing attention. Thresholds passed from renderer.
  ipcMain.handle('dashboard:needsAttention', (_event, thresholds) =>
    db.dashboard.needsAttention(thresholds)
  );

  // Canon Bible (P31): read-only list + a one-shot dev seed used solely by the
  // P31 smoke test. devSeed is idempotent and visible in the UI — it does NOT
  // bypass Canon Review for real entries; it just primes an empty DB so the
  // read view has something to show. P32+ replaces this with real proposals.
  ipcMain.handle('canon:list', () => db.canon.list());
  ipcMain.handle('canon:listRetired', () => db.canon.listRetired());
  ipcMain.handle('canon:devSeed', () => db.canon.devSeed());

  // P32 — direct canon CRUD. Until the Canon Review queue lands (P35) this is
  // the only write path into canon_entries; CLAUDE.md's "all changes flow
  // through Canon Review" rule is bootstrapped here. typeConfig hands the
  // renderer the field schema for all 18 entry types so its create/edit forms
  // stay in lockstep with the DB-side detail tables.
  ipcMain.handle('canon:typeConfig', () => db.canon.typeConfig());
  ipcMain.handle('canon:getDetail', (_event, id) => db.canon.getDetail(id));
  ipcMain.handle('canon:create', (_event, payload) => { const r = db.canon.create(payload); recordEvent('Canon Bible', 'created'); return r; });
  ipcMain.handle('canon:update', (_event, id, payload) =>
    db.canon.update(id, payload)
  );
  ipcMain.handle('canon:delete', (_event, id) => { const r = db.canon.delete(id); recordEvent('Canon Bible', 'deleted'); return r; });
  ipcMain.handle('canon:archive', (_event, id) => { const r = db.canon.archive(id); recordEvent('Canon Bible', 'archived'); return r; });
  ipcMain.handle('canon:restore', (_event, id) => db.canon.restore(id));
  // P33 — lock/unlock toggle. Lock is "currently accepted, edits still
  // allowed but warned"; the renderer enforces the warning, this just flips
  // the flag and stamps the locked_at/locked_label provenance.
  ipcMain.handle('canon:setLocked', (_event, id, payload) =>
    db.canon.setLocked(id, payload)
  );
  // P34 — supersede: creates a new active entry from this one, retires the
  // original, and migrates legacy IDs to the new row (retired row keeps
  // is_primary=0 copies). Chain pointers wire both directions.
  ipcMain.handle('canon:supersede', (_event, id, payload) =>
    db.canon.supersede(id, payload)
  );
  // PHIST — full supersede chain (oldest → newest) for any entry in the chain.
  // Each item is a full getDetail() record so the renderer can diff them.
  ipcMain.handle('canon:versionChain', (_event, id) =>
    db.canon.versionChain(id)
  );
  // PCANON-AFFECTED — source attribution (approved proposal's source workspace
  // entry) for a canon entry, and reverse workspace lookup at retirement.
  ipcMain.handle('canon:getSourceAttribution', (_event, id) =>
    db.canon.getSourceAttribution(id)
  );
  ipcMain.handle('canon:getAffectedBy', (_event, id) =>
    db.canon.getAffectedBy(id)
  );

  // PCONFLICT-2 (auto-route) — scan + auto-route in one shot, deduping by
  // signature so the same collision never gets two Conflicts rows. The UI
  // calls this from both Canon Bible (scan) and the Conflicts page (rescan).
  ipcMain.handle('canonConflicts:scanAndRoute', () =>
    db.canonConflicts.scanAndRoute()
  );
  // PCONFLICT-2 — load-bearing canon entry ids across all open flags. Canon
  // Bible uses this set to nudge the user with a toast when they edit /
  // archive / supersede / delete an entry that's currently surfaced in an
  // open Conflicts row.
  ipcMain.handle('canonConflicts:openFlagEntryIds', () =>
    db.canonConflicts.openFlagEntryIds()
  );

  // PUI3: Canon Review's only write path for now — accept an extracted
  // snippet and stage it as a pending proposal. The full review UI lands in
  // P35; this just records the proposal so the snippet isn't lost between
  // phases.
  ipcMain.handle('canonProposals:createFromExtract', (_event, payload) =>
    db.canonProposals.createFromExtract(payload)
  );
  // P41 — Create a structured proposal from the AI assistant.
  ipcMain.handle('canonProposals:createFromAI', (_event, payload) =>
    db.canonProposals.createFromAI(payload)
  );

  // P35 — Canon Review queue. list returns pending/sent_back/deferred (the
  // queue surface). updateFields edits proposed JSON in place; approve
  // applies the proposal to canon_entries and stamps target_entry_id;
  // sendBack/defer/reject set status flags; delete is hard-delete.
  ipcMain.handle('canonProposals:list', () => db.canonProposals.list());
  ipcMain.handle('canonProposals:getById', (_event, id) =>
    db.canonProposals.getById(id)
  );
  ipcMain.handle('canonProposals:updateFields', (_event, id, payload) =>
    db.canonProposals.updateFields(id, payload)
  );
  ipcMain.handle('canonProposals:approve', (_event, id, payload) => {
    const r = db.canonProposals.approve(id, payload);
    recordEvent('Canon Review', 'approved');
    return r;
  });
  ipcMain.handle('canonProposals:sendBack', (_event, id, payload) => {
    const r = db.canonProposals.sendBack(id, payload);
    recordEvent('Canon Review', 'sent back');
    return r;
  });
  ipcMain.handle('canonProposals:defer', (_event, id, payload) => {
    const r = db.canonProposals.defer(id, payload);
    recordEvent('Canon Review', 'deferred');
    return r;
  });
  ipcMain.handle('canonProposals:reject', (_event, id, payload) => {
    const r = db.canonProposals.reject(id, payload);
    recordEvent('Canon Review', 'rejected');
    return r;
  });
  ipcMain.handle('canonProposals:delete', (_event, id) =>
    db.canonProposals.delete(id)
  );

  // PTAG — tag library + per-entity tag attach/detach. entity_kind is the
  // workspace's DB table name; the renderer passes a constant per workspace.
  ipcMain.handle('tags:listAll', () => db.tags.listAll());
  ipcMain.handle('tags:listFor', (_event, kind, id) => db.tags.listFor(kind, id));
  ipcMain.handle('tags:bulkListFor', (_event, kind, ids) =>
    db.tags.bulkListFor(kind, ids)
  );
  ipcMain.handle('tags:attach', (_event, kind, id, tagId) =>
    db.tags.attach(kind, id, tagId)
  );
  ipcMain.handle('tags:detach', (_event, kind, id, tagId) =>
    db.tags.detach(kind, id, tagId)
  );
  ipcMain.handle('tags:clearFor', (_event, kind, id) =>
    db.tags.clearFor(kind, id)
  );
  ipcMain.handle('tags:create', (_event, payload) => db.tags.create(payload));
  ipcMain.handle('tags:usage', (_event, tagId) => db.tags.usage(tagId));
  ipcMain.handle('tags:remove', (_event, tagId) => db.tags.remove(tagId));
  ipcMain.handle('tags:rename', (_event, tagId, name) =>
    db.tags.rename(tagId, name)
  );

  // PSEARCH — global search across workspaces, canon entries, chats, tags.
  // One read-only IPC; the renderer debounces and passes the term + active
  // filters in a single call.
  ipcMain.handle('search:run', (_event, params) => db.search.run(params));

  // PPASSIVE — linked-entries indicator. Read-only: counts + lists the
  // attachments and canon entries that reference a given workspace entry.
  ipcMain.handle('links:for', (_event, kind, id) => db.links.for(kind, id));

  // P36 — cross-workspace attachment writes and picker data.
  ipcMain.handle('crossWorkspace:attach', (_event, hostKind, hostId, sourceKind, sourceId) =>
    db.crossWorkspace.attach(hostKind, hostId, sourceKind, sourceId)
  );
  ipcMain.handle('crossWorkspace:detach', (_event, hostKind, hostId, sourceKind, sourceId) =>
    db.crossWorkspace.detach(hostKind, hostId, sourceKind, sourceId)
  );
  ipcMain.handle('crossWorkspace:candidates', (_event, sourceKind) =>
    db.crossWorkspace.candidates(sourceKind)
  );

  // PEXPORT — Canon Bible readable export. Writes markdown + PDF into a
  // timestamped folder under ~/Documents/revival-bible-studio/canon_exports/.
  // A hidden BrowserWindow renders the HTML to PDF; the temp HTML file is
  // deleted immediately after the PDF buffer is written.
  ipcMain.handle('canon:export', async (_event, params) => {
    const result = db.canonExport(params);
    const folder = path.join(
      app.getPath('documents'),
      'revival-bible-studio',
      'canon_exports',
      `canon-export-${timestampSlug()}`
    );
    fs.mkdirSync(folder, { recursive: true });

    fs.writeFileSync(path.join(folder, 'canon_export.md'), result.markdown, 'utf8');

    const htmlPath = path.join(folder, '_tmp_export.html');
    fs.writeFileSync(htmlPath, result.html, 'utf8');
    const pdfWin = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true },
    });
    await pdfWin.loadFile(htmlPath);
    const pdfData = await pdfWin.webContents.printToPDF({ pageSize: 'Letter' });
    pdfWin.destroy();
    fs.unlinkSync(htmlPath);
    fs.writeFileSync(path.join(folder, 'canon_export.pdf'), pdfData);

    shell.openPath(folder);
    return { folder, count: result.count, title: result.title };
  });

  // PImp1 — Worldbuilding file import.
  //  • import:pickFile opens the system file dialog and reads the chosen file.
  //  • import:checkConflicts compares proposed titles against active canon.
  //  • import:stageEntries writes the approved-for-staging list to canon_proposals.
  ipcMain.handle('import:pickFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Worldbuilding File',
      filters: [
        { name: 'Text / Markdown', extensions: ['txt', 'md', 'markdown'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    return { canceled: false, filePath, fileName: path.basename(filePath), content };
  });

  ipcMain.handle('import:checkConflicts', (_event, proposals) =>
    db.canonImport.checkConflicts(proposals)
  );

  ipcMain.handle('import:stageEntries', (_event, entries, fileName) =>
    db.canonImport.stageEntries(entries, fileName)
  );

  // PCONFIG-BACKUP — export Project Rules + user-created tags + staleness
  // thresholds to a JSON file chosen by the user. API key is never included.
  // Staleness thresholds are renderer-owned (localStorage), so the renderer
  // passes them in; we bundle them into the JSON alongside the DB-backed data.
  ipcMain.handle('config:export', async (_event, stalenessThresholds) => {
    const configData = db.configBackup.export();
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      projectRules: configData.projectRules,
      stalenessThresholds: stalenessThresholds || {},
      userTags: configData.userTags,
    };
    const result = await dialog.showSaveDialog({
      title: 'Save Config Backup',
      defaultPath: `revival-config-${timestampSlug()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  // PCONFIG-BACKUP — import: open a backup file, restore Project Rules + user
  // tags to the DB, and return the thresholds for the renderer to apply to
  // localStorage. Nothing is overwritten until the file is validated.
  ipcMain.handle('config:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Config Backup',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    } catch {
      throw new Error('Could not read config file — is it a valid Revival config backup?');
    }
    if (!payload || typeof payload !== 'object' || payload.version !== 1) {
      throw new Error('Unrecognized config format. Expected a Revival config backup (version 1).');
    }
    const { tagsRestored } = db.configBackup.import({
      projectRules: payload.projectRules,
      userTags: payload.userTags,
    });
    return {
      canceled: false,
      projectRules: payload.projectRules,
      stalenessThresholds: payload.stalenessThresholds || {},
      tagsRestored,
      exportedAt: payload.exportedAt || null,
    };
  });

  ipcMain.handle('settings:getProjectRules', () => db.settings.getProjectRules());
  ipcMain.handle('settings:setProjectRules', (_event, text) =>
    db.settings.setProjectRules(text)
  );
  // P39 — Claude API key storage.
  ipcMain.handle('settings:getClaudeApiKey', () => db.settings.getClaudeApiKey());
  ipcMain.handle('settings:setClaudeApiKey', (_event, key) =>
    db.settings.setClaudeApiKey(key)
  );

  // P40 — Chat message persistence.
  ipcMain.handle('chatMessages:list', (_e, chatId) => db.chatMessages.list(chatId));
  ipcMain.handle('chatMessages:add', (_e, chatId, role, content) =>
    db.chatMessages.add(chatId, role, content)
  );
  ipcMain.handle('chatMessages:archive', (_e, id) => db.chatMessages.archive(id));
  ipcMain.handle('chatMessages:unarchive', (_e, id) => db.chatMessages.unarchive(id));

  // P40/P41 — Claude API call. Runs in main so the API key never touches the
  // renderer process. Returns { text, proposalsCreated } on success; throws a
  // plain Error with a user-visible message on failure.
  //
  // P41: the propose_canon_entry tool lets Claude stage structured proposals
  // directly into Canon Review. If Claude calls the tool, main creates the
  // proposal rows, sends a tool_result turn to get Claude's acknowledgement
  // text, and returns both the text and the list of created proposals.
  const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-7']);

  const PROPOSE_TOOL = {
    name: 'propose_canon_entry',
    description:
      'Propose a new canon entry for the writer\'s Canon Review queue. ' +
      'The proposal is NEVER written directly to the Canon Bible — it lands in ' +
      'Canon Review so the writer can approve, edit, send back, or reject it. ' +
      'Use this when the user asks you to propose or suggest a canon addition.',
    input_schema: {
      type: 'object',
      properties: {
        entry_type: {
          type: 'string',
          description:
            'Canon entry type. One of: character, location, event, rule, theme, ' +
            'symbol, relationship, faction, timeline_event, subplot, motif, ' +
            'artifact, institution, dialogue_sample, world_rule, belief_system, ' +
            'technology, misc',
        },
        title: { type: 'string', description: 'Short, descriptive title for the canon entry.' },
        body: { type: 'string', description: 'The proposed canon content. Be detailed and clear.' },
        proposer_note: {
          type: 'string',
          description: 'Brief note explaining why you are proposing this.',
        },
      },
      required: ['title', 'body'],
    },
  };

  async function callClaudeAPI(apiKey, body) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      let errMsg = `Claude API error (${resp.status})`;
      try {
        const errBody = await resp.json();
        if (errBody.error && errBody.error.message) errMsg = errBody.error.message;
      } catch { /* ignore */ }
      throw new Error(errMsg);
    }
    return resp.json();
  }

  // P41 — appended to every system prompt so Claude knows when to call the tool.
  const PROPOSE_TOOL_INSTRUCTION =
    '\n\n## Canon Proposal Tool\n' +
    'You have a `propose_canon_entry` tool. When the user asks you to propose, suggest, ' +
    'or add something to the Canon Bible or canon, call this tool — do not just describe ' +
    'the proposal in plain text. The proposal lands in Canon Review; it is never written ' +
    'directly to the Canon Bible. Use it for any phrasing like "propose a canon entry", ' +
    '"add this to canon", "suggest for canon", "propose canon X", etc.';

  ipcMain.handle('claude:send', async (_e, messages, systemPrompt, model, chatId) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');

    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';
    const fullSystem = (systemPrompt || '') + PROPOSE_TOOL_INSTRUCTION;
    const baseBody = {
      model: safeModel,
      max_tokens: 32768,
      messages,
      tools: [PROPOSE_TOOL],
      system: fullSystem,
    };

    const data = await callClaudeAPI(apiKey, baseBody);

    // Collect any tool_use blocks from the first response.
    const toolUseBlocks = (data.content || []).filter((b) => b.type === 'tool_use');
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    const truncationWarning = data.stop_reason === 'max_tokens'
      ? '\n\n⚠ Response cut short — send a follow-up to continue'
      : '';

    if (toolUseBlocks.length === 0) {
      // No tool call — plain text response (common path).
      if (!textBlock) throw new Error('Unexpected response shape from Claude API.');
      return { text: textBlock.text + truncationWarning, proposalsCreated: [] };
    }

    // Tool use path: create proposals in DB, then get Claude's acknowledgement.
    const proposalsCreated = [];
    const toolResults = [];

    for (const block of toolUseBlocks) {
      if (block.name !== 'propose_canon_entry') continue;
      const input = block.input || {};
      let resultText;
      try {
        const proposal = db.canonProposals.createFromAI({
          entry_type: input.entry_type || null,
          title: input.title || '',
          body: input.body || '',
          proposer_note: input.proposer_note || null,
          chat_id: chatId != null ? Number(chatId) : null,
        });
        proposalsCreated.push({ id: proposal.id, title: input.title || '(untitled)' });
        resultText = `Proposal staged in Canon Review with id ${proposal.id}.`;
      } catch (err) {
        resultText = `Failed to create proposal: ${err.message}`;
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultText,
      });
    }

    // Follow-up turn: give Claude the tool results and get the acknowledgement.
    const followUpMessages = [
      ...messages,
      { role: 'assistant', content: data.content },
      { role: 'user', content: toolResults },
    ];
    const followUpBody = {
      model: safeModel,
      max_tokens: 2048,
      messages: followUpMessages,
      tools: [PROPOSE_TOOL],
      system: fullSystem,
    };
    const followUpData = await callClaudeAPI(apiKey, followUpBody);
    const followUpText = (followUpData.content || []).find((b) => b.type === 'text');

    return {
      text: followUpText ? followUpText.text : 'Proposal sent to Canon Review.',
      proposalsCreated,
    };
  });

  // P42 — Canon search. Fetches all non-retired canon entries, injects them as
  // read-only context, and asks Claude to answer only from that corpus. No
  // tools, no propose path — this is a read-only query flow.
  ipcMain.handle('claude:canonSearch', async (_e, query, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');

    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    // Fetch all non-retired entries (includes legacy_ids for T-codes).
    const entries = db.canon.list();
    if (entries.length === 0) {
      return { text: 'The Canon Bible is empty. Seed or approve some entries first.' };
    }

    // Serialize each entry as a compact context block.
    const blocks = entries.map((e) => {
      const primaryId = (e.legacy_ids || []).find((l) => l.isPrimary);
      const tcode = primaryId ? primaryId.code : `#${e.id}`;
      const parts = [`[${tcode}] ${e.entry_type.toUpperCase()}: ${e.title}`];
      if (e.body) parts.push(e.body);
      if (e.locked) parts.push('(locked)');
      return parts.join('\n');
    });

    const canonContext =
      `## Canon Bible — ${entries.length} approved entries\n\n` +
      blocks.join('\n\n---\n\n');

    const systemPrompt =
      'You are a canon search assistant for a TV writers\' room. ' +
      'Your ONLY knowledge source is the Canon Bible corpus provided below. ' +
      'Do NOT use any outside knowledge. ' +
      'For every fact you state, cite the canon entry using its identifier ' +
      '(e.g. [T-001] or [#42]) and title. ' +
      'If the answer is not in the corpus, say so clearly — do not invent. ' +
      'Be concise and direct.\n\n' +
      canonContext;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
    });

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Unexpected response shape from Claude API.');
    return { text: textBlock.text, entryCount: entries.length };
  });

  // P43 — On-demand conflict check for a single canon proposal against locked
  // canon entries. Never runs automatically; user triggers it from Canon Review.
  // Returns { flags: [{entryId, tcode, title, reason}], checkedCount } or
  // { flags: [], checkedCount } if no contradictions detected.
  ipcMain.handle('claude:conflictCheck', async (_e, proposalId, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');

    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    const proposal = db.canonProposals.getById(proposalId);
    if (!proposal) throw new Error('Proposal not found.');

    const fields = proposal.proposed_fields || {};
    const proposalTitle = fields.title || '(untitled)';
    const proposalBody  = fields.body  || '';
    if (!proposalTitle && !proposalBody) {
      return { flags: [], checkedCount: 0, skipped: true };
    }

    // Only check against locked entries — those are the committed facts.
    const allEntries = db.canon.list();
    const locked = allEntries.filter((e) => e.locked);
    if (locked.length === 0) {
      return { flags: [], checkedCount: 0 };
    }

    const blocks = locked.map((e) => {
      const primaryId = (e.legacy_ids || []).find((l) => l.isPrimary);
      const tcode = primaryId ? primaryId.code : `#${e.id}`;
      return `[${tcode}] ${e.entry_type.toUpperCase()}: ${e.title}\n${e.body || ''}`;
    });

    const systemPrompt =
      'You are a continuity analyst for a TV writers\' room. ' +
      'Your job is to detect DIRECT CONTRADICTIONS between a proposed new canon entry ' +
      'and the locked canon entries provided. ' +
      'A contradiction means the proposal explicitly states something that conflicts with ' +
      'a locked fact (e.g. different dates, mutually exclusive states, impossible sequences). ' +
      'Do NOT flag thematic tension, ambiguity, gaps, or things that could coexist. ' +
      'Only flag clear, direct factual contradictions.\n\n' +
      'Respond with a JSON object in this exact shape — no markdown, no explanation outside JSON:\n' +
      '{\n' +
      '  "flags": [\n' +
      '    { "entryId": <number or null>, "tcode": "<T-code or #id string>", "title": "<entry title>", "reason": "<one sentence describing the contradiction>" }\n' +
      '  ]\n' +
      '}\n' +
      'If there are no contradictions, return { "flags": [] }.\n\n' +
      '## Locked Canon Entries\n\n' +
      blocks.join('\n\n---\n\n');

    const userMessage =
      `## Proposed Canon Entry\n\nTitle: ${proposalTitle}\n\n${proposalBody}`;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Unexpected response shape from Claude API.');

    let parsed;
    try {
      // Strip any accidental markdown fences before parsing.
      const raw = textBlock.text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Claude returned malformed JSON. Try again.');
    }

    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];

    // Enrich flags with the numeric entryId from our locked set when possible,
    // so the renderer can link directly to the entry.
    const enriched = flags.map((f) => {
      const match = locked.find((e) => {
        const primaryId = (e.legacy_ids || []).find((l) => l.isPrimary);
        const tcode = primaryId ? primaryId.code : `#${e.id}`;
        return tcode === f.tcode || e.title === f.title;
      });
      return {
        entryId: match ? match.id : (f.entryId || null),
        tcode: f.tcode || (match ? `#${match.id}` : '?'),
        title: f.title || (match ? match.title : '?'),
        reason: f.reason || '',
      };
    });

    return { flags: enriched, checkedCount: locked.length };
  });

  // PAI-WIRE — Cross-AI conflict check on raw text (P42→P43, P45→P43).
  // Same logic as claude:conflictCheck but takes a {title, body} payload
  // directly instead of fetching a proposal from the DB.
  ipcMain.handle('claude:conflictCheckText', async (_e, payload, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');

    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';
    const { title = '(untitled)', body = '' } = payload || {};
    if (!title && !body) return { flags: [], checkedCount: 0, skipped: true };

    const allEntries = db.canon.list();
    const locked = allEntries.filter((e) => e.locked);
    if (locked.length === 0) return { flags: [], checkedCount: 0 };

    const blocks = locked.map((e) => {
      const primaryId = (e.legacy_ids || []).find((l) => l.isPrimary);
      const tcode = primaryId ? primaryId.code : `#${e.id}`;
      return `[${tcode}] ${e.entry_type.toUpperCase()}: ${e.title}\n${e.body || ''}`;
    });

    const systemPrompt =
      'You are a continuity analyst for a TV writers\' room. ' +
      'Your job is to detect DIRECT CONTRADICTIONS between the provided content ' +
      'and the locked canon entries. ' +
      'A contradiction means the content explicitly states something that conflicts with ' +
      'a locked fact (e.g. different dates, mutually exclusive states, impossible sequences). ' +
      'Do NOT flag thematic tension, ambiguity, gaps, or things that could coexist. ' +
      'Only flag clear, direct factual contradictions.\n\n' +
      'Respond with a JSON object in this exact shape — no markdown, no explanation outside JSON:\n' +
      '{\n' +
      '  "flags": [\n' +
      '    { "entryId": <number or null>, "tcode": "<T-code or #id string>", "title": "<entry title>", "reason": "<one sentence describing the contradiction>" }\n' +
      '  ]\n' +
      '}\n' +
      'If there are no contradictions, return { "flags": [] }.\n\n' +
      '## Locked Canon Entries\n\n' +
      blocks.join('\n\n---\n\n');

    const userMessage = `## Content to Check\n\nTitle: ${title}\n\n${body}`;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Unexpected response shape from Claude API.');

    let parsed;
    try {
      const raw = textBlock.text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Claude returned malformed JSON. Try again.');
    }

    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
    const enriched = flags.map((f) => {
      const match = locked.find((e) => {
        const primaryId = (e.legacy_ids || []).find((l) => l.isPrimary);
        const tcode = primaryId ? primaryId.code : `#${e.id}`;
        return tcode === f.tcode || e.title === f.title;
      });
      return {
        entryId: match ? match.id : (f.entryId || null),
        tcode: f.tcode || (match ? `#${match.id}` : '?'),
        title: f.title || (match ? match.title : '?'),
        reason: f.reason || '',
      };
    });

    return { flags: enriched, checkedCount: locked.length };
  });

  // P44 — Writing Lab draft assistant. Injects the current draft and any
  // attached source materials into the system prompt. Multi-turn; caller
  // maintains message history. propose_canon_entry tool is available.
  ipcMain.handle('claude:draftAssist', async (_e, draftTitle, draftBody, sources, messages, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');

    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    const draftSection =
      `## Active Draft: ${draftTitle || 'Untitled'}\n\n${draftBody || '(empty)'}`;

    const sourcesSection = (sources && sources.length > 0)
      ? '\n\n## Attached Sources\n\n' +
        sources.map((s) => `### ${s.title}\n${s.body || '(no content)'}`).join('\n\n---\n\n')
      : '';

    const systemPrompt =
      'You are a writing assistant embedded in a TV writers\' room tool. ' +
      'The writer has opened a draft and may have attached source material for context. ' +
      'Help with scene drafting, dialogue, continuity checks, character voice, and analysis. ' +
      'Reference the draft and sources in your answers — do not invent facts not present in ' +
      'the material provided. Keep answers focused and practical for a working writer.\n\n' +
      draftSection + sourcesSection +
      PROPOSE_TOOL_INSTRUCTION;

    const baseBody = {
      model: safeModel,
      max_tokens: 8192,
      messages,
      tools: [PROPOSE_TOOL],
      system: systemPrompt,
    };

    const data = await callClaudeAPI(apiKey, baseBody);

    const toolUseBlocks = (data.content || []).filter((b) => b.type === 'tool_use');
    const textBlock = (data.content || []).find((b) => b.type === 'text');

    if (toolUseBlocks.length === 0) {
      if (!textBlock) throw new Error('Unexpected response shape from Claude API.');
      return { text: textBlock.text, proposalsCreated: [] };
    }

    const proposalsCreated = [];
    const toolResults = [];

    for (const block of toolUseBlocks) {
      if (block.name !== 'propose_canon_entry') continue;
      const input = block.input || {};
      let resultText;
      try {
        const proposal = db.canonProposals.createFromAI({
          entry_type: input.entry_type || null,
          title: input.title || '',
          body: input.body || '',
          proposer_note: input.proposer_note || null,
          chat_id: null,
        });
        proposalsCreated.push({ id: proposal.id, title: input.title || '(untitled)' });
        resultText = `Proposal staged in Canon Review with id ${proposal.id}.`;
      } catch (err) {
        resultText = `Failed to create proposal: ${err.message}`;
      }
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText });
    }

    const followUpMessages = [
      ...messages,
      { role: 'assistant', content: data.content },
      { role: 'user', content: toolResults },
    ];
    const followUpBody = {
      model: safeModel,
      max_tokens: 2048,
      messages: followUpMessages,
      tools: [PROPOSE_TOOL],
      system: systemPrompt,
    };
    const followUpData = await callClaudeAPI(apiKey, followUpBody);
    const followUpText = (followUpData.content || []).find((b) => b.type === 'text');

    return {
      text: followUpText ? followUpText.text : 'Proposal sent to Canon Review.',
      proposalsCreated,
    };
  });

  // P45 — AI import assistant. Analyzes parsed worldbuilding entries and returns
  // type suggestions + duplicate flags. Fetches existing pending proposals from
  // the DB directly so the renderer doesn't need to pass them.
  ipcMain.handle('claude:importAssist', async (_e, entries, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');

    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    const existingProposals = db.canonProposals.list().map((p) => ({
      title: ((p.proposed_fields || {}).title) || '(untitled)',
    }));

    const ENTRY_TYPES = [
      'character', 'location', 'event', 'rule', 'theme', 'symbol',
      'relationship', 'faction', 'timeline_event', 'subplot', 'motif',
      'artifact', 'institution', 'dialogue_sample', 'world_rule',
      'belief_system', 'technology', 'misc',
    ];

    const CLASSIFY_TOOL = {
      name: 'classify_import_entries',
      description:
        'Return a type suggestion for each imported worldbuilding entry. ' +
        'Call exactly once with one suggestion per entry in input order.',
      input_schema: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            description: 'One item per entry, in the same order as the input list.',
            items: {
              type: 'object',
              properties: {
                index: {
                  type: 'integer',
                  description: 'Zero-based index of this entry in the input list.',
                },
                suggested_type: {
                  type: 'string',
                  description:
                    'Best-fit entry type. One of: ' + ENTRY_TYPES.join(', ') +
                    '. Use "misc" if unclear.',
                },
                reason: {
                  type: 'string',
                  description: 'One sentence explaining the type suggestion.',
                },
                is_duplicate: {
                  type: 'boolean',
                  description:
                    'True if this entry looks like a near-duplicate of an existing pending proposal.',
                },
                duplicate_of_title: {
                  type: 'string',
                  description: 'Title of the existing proposal this entry duplicates, if any.',
                },
              },
              required: ['index', 'is_duplicate'],
            },
          },
        },
        required: ['suggestions'],
      },
    };

    const entriesList = entries.map((e, i) => {
      const typeLine = e.entry_type ? ` (auto-detected: ${e.entry_type})` : ' (type: unknown)';
      const bodySnip = e.body ? e.body.slice(0, 300) : '(no body)';
      return `[${i}] "${e.title}"${typeLine}\n${bodySnip}`;
    }).join('\n\n---\n\n');

    const proposalsList = existingProposals.length > 0
      ? 'Existing pending proposals in Canon Review:\n' +
        existingProposals.map((p) => `  • "${p.title}"`).join('\n')
      : 'No existing pending proposals.';

    const systemPrompt =
      'You are an entry-type classifier for a TV writers\' room canon system.\n\n' +
      'Allowed entry types: ' + ENTRY_TYPES.join(', ') + '.\n\n' +
      'For each imported entry: suggest the most fitting type. ' +
      'If an entry already has an auto-detected type, only override it if you are confident ' +
      'a different type is more accurate — otherwise confirm the existing type. ' +
      'Also flag entries that look like near-duplicates of existing pending proposals ' +
      '(same topic or same facts rephrased). ' +
      'Provide a one-sentence reason for each suggestion.';

    const userMsg =
      `Classify these ${entries.length} imported worldbuilding entries:\n\n` +
      entriesList + '\n\n' + proposalsList;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: 'tool', name: 'classify_import_entries' },
      messages: [{ role: 'user', content: userMsg }],
    });

    const toolBlock = (data.content || []).find(
      (b) => b.type === 'tool_use' && b.name === 'classify_import_entries'
    );
    if (!toolBlock || !Array.isArray(toolBlock.input && toolBlock.input.suggestions)) {
      throw new Error('Unexpected response from Claude API.');
    }

    return { suggestions: toolBlock.input.suggestions };
  });

  // P46-A — Flanagan Filter: on-demand craft analysis for Open Questions entries.
  // Reads the Flanagan Master document once per handler call and applies the
  // requested scan mode (editorial_filter / six_tensions / wwfd / full_diagnostic).
  // Returns { summary, confidence, breakdown, northStar } via a tool call so
  // the response is always valid JSON, never a parsing gamble.
  ipcMain.handle('claude:flanaganFilter', async (_e, payload, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');

    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    // PFLAN-EXPAND: accept entityTitle/entityBody for any workspace, with
    // backward-compat fallback to the original questionTitle/questionBody fields.
    const {
      entityTitle, entityBody, tier, options, mode,
      questionTitle, questionBody,
    } = payload;
    const title = entityTitle || questionTitle || '';
    const body  = entityBody  || questionBody  || '';

    // Read the Flanagan Master document — lazy, cached per process lifetime.
    if (!ipcMain._flanaganDoc) {
      const docPath = path.join(__dirname, 'docs', 'THE_FLANAGAN_MASTER.txt');
      if (fs.existsSync(docPath)) {
        ipcMain._flanaganDoc = fs.readFileSync(docPath, 'utf8');
        ipcMain._flanaganVersion = new Date(fs.statSync(docPath).mtime)
          .toISOString().slice(0, 10);
      } else {
        ipcMain._flanaganDoc = '(Flanagan Master document not found)';
        ipcMain._flanaganVersion = 'unknown';
      }
    }
    const flanaganDoc = ipcMain._flanaganDoc;

    const tierLabel = tier ? `Tier ${tier}` : 'untiered';
    const optionLines = (options || [])
      .map((o) => `  Option ${o.key}: ${o.label}`)
      .join('\n');

    const questionBlock =
      `## Entry Under Analysis (${tierLabel})\n\n` +
      `Title: ${title || '(untitled)'}\n\n` +
      (body ? `Content:\n${body}\n\n` : '') +
      (optionLines ? `Options under consideration:\n${optionLines}\n` : '');

    const tierInstruction = tier === 1
      ? 'This is a Tier 1 question — the highest-stakes creative decisions. Weight your analysis accordingly: be direct, decisive where possible, and flag genuine tensions rather than hedging.'
      : tier === 2
        ? 'This is a Tier 2 question — important but secondary to Tier 1 concerns. Apply the filter with appropriate weight.'
        : 'Tier is unspecified — apply the filter at standard weight.';

    // Build mode-specific content section from the full document.
    // We include the full document so Claude has complete context, then
    // explicitly instruct which section to focus on for the breakdown.
    let modeInstruction;
    if (mode === 'editorial_filter') {
      modeInstruction =
        'Apply TIER 1 — THE EDITORIAL FILTER (the five questions). ' +
        'Evaluate the entry against each of the five questions, citing each by name ' +
        '(e.g. "Question 1," "Question 3"). Give a verdict per question, then an overall verdict. ' +
        'If the entry fails Question 5, flag it explicitly.';
    } else if (mode === 'six_tensions') {
      modeInstruction =
        'Apply APPENDIX A — THE SIX FLANAGAN TENSIONS. ' +
        'For each tension, apply the diagnostic check and evaluate how the entry holds up, ' +
        'citing each by name (e.g. "Tension 1: The Horror Is Already True," "Tension 4"). ' +
        'Give a verdict per tension, then an overall verdict.';
    } else if (mode === 'wwfd') {
      modeInstruction =
        'Apply the WWFD FORMAT from Tier 2 ("When You\'re Stuck"). ' +
        'Frame the analysis as: THE STRUCTURAL MOVE, THE DIALOGUE MOVE, THE VISUAL MOVE, ' +
        'THE REVIVAL ANCHOR — in that order, for each option or direction where relevant. ' +
        'If the entry is more conceptual than scene-level, focus the Structural and Revival Anchor ' +
        'sections and note where the Dialogue/Visual sections require scene-level decisions still to be made.';
    } else if (mode === 'full_diagnostic') {
      modeInstruction =
        'Run all three scans in sequence: ' +
        '(1) TIER 1 — THE EDITORIAL FILTER (five questions, citing each by number), ' +
        '(2) APPENDIX A — THE SIX TENSIONS (citing each by number and name), ' +
        '(3) WWFD FORMAT (Structural / Dialogue / Visual / Revival Anchor). ' +
        'Label each section clearly. Conclude with a single synthesized verdict that weighs all three.';
    } else if (mode === 'production_check') {
      modeInstruction =
        'Apply TIER 3 — THE PRODUCTION TRANSLATION. ' +
        'Evaluate the entry against the production-level criteria: ' +
        'camera positions (cite each by name: "The Witness Position," "The Companion Position," ' +
        '"The Surveillance Position"), color/light philosophy, sound and music principles ' +
        '(cite as "Music Rule"), performance direction, location and production design, ' +
        'and episodic structure. Cite rules by specific name: "Camera Rule One," "Camera Rule Two," ' +
        '"Camera Rule Three," "Companion Position," "Principle 3-A (The Caroline Principle)." ' +
        'If the entry contains scene or visual content, evaluate it directly against Tier 3. ' +
        'If it is primarily conceptual (no scene description), note which Tier 3 considerations ' +
        'will apply when the scene is designed, and flag any structural choices that constrain ' +
        'the production approach.';
    }

    const systemPrompt =
      'You are The Flanagan Filter — a craft analysis assistant embedded in a TV writers\' room tool for REVIVAL. ' +
      'Your job is to evaluate creative decisions against the criteria in THE FLANAGAN MASTER document below.\n\n' +
      'Analysis rules:\n' +
      '- Use named citations (e.g. "Question 1," "Question 5," "Tension 3: The Monster Is Never Wrong," ' +
      '"Non-Negotiable Two," "Camera Rule One") so the writer can trace every point to the source document.\n' +
      '- Distinguish clearly between a CLEAR VERDICT (one option is demonstrably stronger) ' +
      'and GENUINE TENSION (both options have legitimate craft arguments — a real writers\'-room decision).\n' +
      '- The North Star check is always: does this choice serve or obscure the show\'s commitment to seeing ' +
      'people in recovery as full human beings?\n' +
      '- Never manufacture agreement. If both options fail the filter, say so.\n' +
      '- Never explain the show\'s premise — the writer knows it.\n\n' +
      '## THE FLANAGAN MASTER DOCUMENT\n\n' +
      flanaganDoc;

    const userMsg =
      questionBlock +
      '\n---\n\n' +
      `Scan mode: ${mode.replace(/_/g, ' ').toUpperCase()}\n\n` +
      tierInstruction + '\n\n' +
      modeInstruction;

    const FILTER_TOOL = {
      name: 'flanagan_filter_result',
      description: 'Return the structured Flanagan Filter analysis result.',
      input_schema: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              'One sentence: verdict (which option is stronger, or that genuine tension exists) ' +
              'plus the primary craft reason. Example: "Option A is stronger — it roots the horror ' +
              'in Megan\'s pre-existing guilt rather than importing a new external threat (Question 5)."',
          },
          confidence: {
            type: 'string',
            enum: ['clear', 'tension'],
            description:
              '"clear" when one option is demonstrably stronger by the filter criteria; ' +
              '"tension" when both options have legitimate craft arguments and the decision ' +
              'is a genuine writers\'-room call.',
          },
          breakdown: {
            type: 'string',
            description:
              'Full analysis with named citations. Use plain text with section headers ' +
              'and line breaks for readability. Include a synthesized verdict at the end.',
          },
          northStar: {
            type: 'string',
            description:
              'One to three sentences: does this creative decision serve or obscure the show\'s ' +
              'commitment to seeing people in recovery as full human beings? Cite the North Star ' +
              'or Recovery Authenticity Mandate if relevant.',
          },
        },
        required: ['summary', 'confidence', 'breakdown', 'northStar'],
      },
    };

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 8192,
      system: systemPrompt,
      tools: [FILTER_TOOL],
      tool_choice: { type: 'tool', name: 'flanagan_filter_result' },
      messages: [{ role: 'user', content: userMsg }],
    });

    const toolBlock = (data.content || []).find(
      (b) => b.type === 'tool_use' && b.name === 'flanagan_filter_result'
    );
    if (!toolBlock || !toolBlock.input) {
      throw new Error('Unexpected response from Claude API.');
    }

    const flanaganResult = {
      summary: toolBlock.input.summary || '',
      confidence: toolBlock.input.confidence || 'tension',
      breakdown: toolBlock.input.breakdown || '',
      northStar: toolBlock.input.northStar || '',
      flanaganVersion: ipcMain._flanaganVersion || 'unknown',
    };
    recordEvent('Flanagan Filter', 'analysis run');
    return flanaganResult;
  });

  // P46-B / PFLAN-EXPAND — Flanagan Filter: save + history. entityKind + entityId
  // identify which workspace row the analysis belongs to.
  ipcMain.handle('flanaganAnalyses:create', (_e, entityKind, entityId, data) => {
    const r = db.flanaganAnalyses.create(entityKind, entityId, data);
    recordEvent('Flanagan Filter', 'analysis saved');
    return r;
  });
  ipcMain.handle('flanaganAnalyses:list', (_e, entityKind, entityId) =>
    db.flanaganAnalyses.listFor(entityKind, entityId));
  ipcMain.handle('flanaganAnalyses:markStale', (_e, id) =>
    db.flanaganAnalyses.markStale(id));
  ipcMain.handle('flanaganAnalyses:delete', (_e, id) =>
    db.flanaganAnalyses.delete(id));

  // PWLAB-CANON-COMPARE — On-demand draft vs. locked canon divergence check.
  // Takes the draft title + body; returns flagged divergences with draft location
  // citations. Never runs automatically; never touches canon.
  ipcMain.handle('claude:canonCompare', async (_e, draftTitle, draftBody, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');

    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    if (!draftBody || !draftBody.trim()) {
      return { flags: [], checkedCount: 0, skipped: true };
    }

    const allEntries = db.canon.list();
    const locked = allEntries.filter((e) => e.locked);
    if (locked.length === 0) return { flags: [], checkedCount: 0 };

    const blocks = locked.map((e) => {
      const primaryId = (e.legacy_ids || []).find((l) => l.isPrimary);
      const tcode = primaryId ? primaryId.code : `#${e.id}`;
      return `[${tcode}] ${e.entry_type.toUpperCase()}: ${e.title}\n${e.body || ''}`;
    });

    const systemPrompt =
      'You are a continuity analyst for a TV writers\' room. ' +
      'Your job is to identify details in a draft that diverge from locked canon entries. ' +
      'A divergence is any place where the draft states or strongly implies something that ' +
      'conflicts with, contradicts, or is inconsistent with an established locked canon fact. ' +
      'This includes direct contradictions, inconsistent character details, timeline conflicts, ' +
      'and location or fact mismatches. ' +
      'Do NOT flag: thematic differences, speculation, things not covered by canon, ' +
      'or things that could plausibly coexist with canon. ' +
      'Only flag clear divergences from stated locked facts.\n\n' +
      'For each flag provide a short quote or phrase from the draft (draftLocation) that ' +
      'identifies approximately where the divergence appears — keep it under 80 characters.\n\n' +
      'Respond with a JSON object in this exact shape — no markdown, no explanation outside JSON:\n' +
      '{\n' +
      '  "flags": [\n' +
      '    {\n' +
      '      "entryId": <number or null>,\n' +
      '      "tcode": "<T-code or #id string>",\n' +
      '      "title": "<canon entry title>",\n' +
      '      "reason": "<one sentence describing how the draft diverges from the canon entry>",\n' +
      '      "draftLocation": "<short quote or phrase from the draft identifying the divergence>"\n' +
      '    }\n' +
      '  ]\n' +
      '}\n' +
      'If there are no divergences, return { "flags": [] }.\n\n' +
      '## Locked Canon Entries\n\n' +
      blocks.join('\n\n---\n\n');

    const userMessage = `## Draft: ${draftTitle || 'Untitled'}\n\n${draftBody}`;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Unexpected response shape from Claude API.');

    let parsed;
    try {
      const raw = textBlock.text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Claude returned malformed JSON. Try again.');
    }

    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
    const enriched = flags.map((f) => {
      const match = locked.find((e) => {
        const primaryId = (e.legacy_ids || []).find((l) => l.isPrimary);
        const tcode = primaryId ? primaryId.code : `#${e.id}`;
        return tcode === f.tcode || e.title === f.title;
      });
      return {
        entryId: match ? match.id : (f.entryId || null),
        tcode:   f.tcode || (match ? `#${match.id}` : '?'),
        title:   f.title || (match ? match.title : '?'),
        reason:  f.reason || '',
        draftLocation: f.draftLocation || '',
      };
    });

    return { flags: enriched, checkedCount: locked.length };
  });

  // PEPISODE-STRUCT — AI evaluation of episode against the 5-item structure checklist.
  // Reads the episode entry (title + body) and returns a per-item verdict.
  ipcMain.handle('claude:episodeStructEval', async (_e, episodeId, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');
    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    const ep = db.episodes.get(episodeId);
    if (!ep) throw new Error('Episode not found.');
    if (!ep.body || !ep.body.trim()) {
      return { skipped: true };
    }

    const ITEMS = [
      { key: 'cold_open',  label: 'Cold open: in medias res',                                 desc: 'The episode opens mid-action, pulling the viewer directly into the story with no preamble.' },
      { key: 'act_two',    label: 'Act Two: rewatch-layer scene identified',                   desc: 'A scene in Act Two that rewards a second viewing — it reads differently once you know how the episode ends.' },
      { key: 'act_three',  label: 'Act Three: consequence scene present',                      desc: 'A scene in Act Three where the weight of earlier choices lands — emotional or plot consequences made visible.' },
      { key: 'coda',       label: 'Coda: quiet devastation candidate identified',              desc: 'The closing beat offers a candidate for the "quiet devastation" structural signature — small, precise, emotionally resonant.' },
      { key: 'quiet_dev',  label: 'Quiet devastation: satisfies structural signature',         desc: 'The episode\'s quiet devastation beat fully satisfies the Flanagan structural signature: quiet, specific, devastating.' },
    ];

    const systemPrompt =
      'You are a television story analyst specializing in the Flanagan structural method. ' +
      'Evaluate an episode outline or draft against five structural checklist items. ' +
      'For each item return a verdict of "pass", "fail", or "uncertain" with a one-sentence rationale. ' +
      '"pass" = the episode clearly satisfies this element. ' +
      '"fail" = the episode clearly does not satisfy it. ' +
      '"uncertain" = there is not enough information in the episode to judge. ' +
      'Be honest and direct. Do not overpraise. If the body is vague or short, lean toward "uncertain".\n\n' +
      'Respond with a JSON object in this exact shape — no markdown, no explanation outside JSON:\n' +
      '{\n' +
      '  "items": [\n' +
      '    { "key": "<item_key>", "verdict": "pass|fail|uncertain", "rationale": "<one sentence>" }\n' +
      '  ]\n' +
      '}\n\n' +
      '## Checklist items\n\n' +
      ITEMS.map((it) => `- ${it.key}: ${it.label}\n  ${it.desc}`).join('\n');

    const userMessage =
      `## Episode: ${ep.title || 'Untitled'}\n\n${ep.body}`;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Unexpected response from Claude API.');

    let parsed;
    try {
      const raw = textBlock.text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Claude returned malformed JSON. Try again.');
    }

    const items = Array.isArray(parsed.items) ? parsed.items : [];
    // Save to DB
    db.episodeStruct.setAiVerdicts(episodeId, items.map((it) => ({
      key: it.key, verdict: it.verdict || null, rationale: it.rationale || null,
    })));

    return { items };
  });

  // PEPISODE-CONT — AI episode continuity checker.
  // Reads the episode entry + linked characters (with status) + prior episodes +
  // relevant locked canon, then flags timeline contradictions, character state
  // inconsistencies, and arc breaks. Never runs automatically; never touches canon.
  // PEPISODE-CONT-2A — compareEpisodeId is an optional additional episode for context.
  ipcMain.handle('claude:episodeContinuityCheck', async (_e, episodeId, model, compareEpisodeId) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');
    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    const ep = db.episodes.get(episodeId);
    if (!ep) throw new Error('Episode not found.');
    if (!ep.body || !ep.body.trim()) return { flags: [], skipped: true };

    // Linked characters — in either direction of cross_workspace_attachments.
    const dbHandle = db.getDb();
    const linkedCharRows = dbHandle.prepare(`
      SELECT DISTINCT cw.id, cw.title, cw.body, cw.char_status
        FROM characters_workspace cw
        JOIN cross_workspace_attachments cwa ON (
          (cwa.host_kind = 'episodes'   AND cwa.host_id   = ? AND cwa.source_kind = 'characters' AND cwa.source_id = cw.id)
          OR
          (cwa.host_kind = 'characters' AND cwa.source_kind = 'episodes' AND cwa.source_id = ? AND cwa.host_id = cw.id)
        )
        WHERE cw.archived_at IS NULL
    `).all(episodeId, episodeId);

    // Up to 3 prior episodes (most recent before this one by created_at / id).
    const priorEps = dbHandle.prepare(`
      SELECT id, title, body, ep_status, created_at
        FROM episodes_workspace
       WHERE archived_at IS NULL
         AND (created_at < ? OR (created_at = ? AND id < ?))
       ORDER BY created_at DESC, id DESC
       LIMIT 3
    `).all(ep.created_at, ep.created_at, episodeId);

    // Locked, non-retired canon entries.
    const lockedCanon = dbHandle.prepare(`
      SELECT ce.id, ce.entry_type, ce.title, ce.body, ce.locked_at, ce.locked_label
        FROM canon_entries ce
       WHERE ce.locked = 1 AND ce.retired = 0
       ORDER BY ce.entry_type ASC, ce.title ASC
    `).all();

    // Optional comparison episode (PEPISODE-CONT-2A).
    let compareEp = null;
    if (compareEpisodeId && typeof compareEpisodeId === 'number' && compareEpisodeId !== episodeId) {
      compareEp = dbHandle.prepare(
        `SELECT id, title, body, ep_status FROM episodes_workspace WHERE id = ? AND archived_at IS NULL`
      ).get(compareEpisodeId);
    }

    const checkedCount = lockedCanon.length + priorEps.length + linkedCharRows.length + (compareEp ? 1 : 0);

    // Build context sections for the prompt.
    const charSection = linkedCharRows.length === 0
      ? 'No characters are linked to this episode.'
      : linkedCharRows.map((c) => {
          const statusStr = c.char_status ? ` [status: ${c.char_status}]` : '';
          return `Character #${c.id}: ${c.title}${statusStr}\n${c.body || '(no notes)'}`;
        }).join('\n\n---\n\n');

    const priorSection = priorEps.length === 0
      ? 'No prior episodes found.'
      : priorEps.map((pe) =>
          `Episode #${pe.id}: ${pe.title} [${pe.ep_status || 'no status'}]\n${pe.body || '(no notes)'}`
        ).join('\n\n---\n\n');

    const canonSection = lockedCanon.length === 0
      ? 'No locked canon entries.'
      : lockedCanon.map((ce) =>
          `Canon [${ce.entry_type}] #${ce.id}: ${ce.title}\n${ce.body || '(no body)'}`
        ).join('\n\n---\n\n');

    const compareSection = compareEp
      ? `Episode #${compareEp.id}: ${compareEp.title} [${compareEp.ep_status || 'no status'}]\n${compareEp.body || '(no notes)'}`
      : null;

    const systemPrompt =
      'You are a continuity analyst for a TV writers\' room. ' +
      'Your job is to flag issues in an episode entry when compared against ' +
      '(1) linked character entries and their current status, ' +
      '(2) prior episode entries, (3) locked canon facts' +
      (compareSection ? ', and (4) a user-selected comparison episode' : '') + '.\n\n' +
      'Flag ONLY clear, specific issues in one of these three categories:\n' +
      '  - "timeline": a date, sequence, or timing contradiction\n' +
      '  - "character_state": a character\'s status, arc, location, or known facts are inconsistent\n' +
      '  - "arc_break": a narrative arc development in this episode contradicts or skips a prior arc beat\n\n' +
      'Do NOT flag: thematic differences, speculation, missing information, or things that could plausibly coexist.\n' +
      'Only flag clear contradictions with specific sourced evidence.\n\n' +
      'For each flag provide:\n' +
      '  - "flagType": "timeline" | "character_state" | "arc_break"\n' +
      '  - "sourceKind": "canon" | "episode" | "character"\n' +
      '  - "sourceId": the numeric ID of the canon entry, episode, or character cited (null if unknown)\n' +
      '  - "sourceTitle": the title of the cited source entry\n' +
      '  - "reason": one sentence describing the specific contradiction\n' +
      '  - "location": a short quote or phrase from the current episode body (under 80 chars) where the issue appears\n\n' +
      'Respond with a JSON object in this exact shape — no markdown, no explanation outside JSON:\n' +
      '{\n' +
      '  "flags": [\n' +
      '    {\n' +
      '      "flagType": "<timeline|character_state|arc_break>",\n' +
      '      "sourceKind": "<canon|episode|character>",\n' +
      '      "sourceId": <number or null>,\n' +
      '      "sourceTitle": "<title of cited entry>",\n' +
      '      "reason": "<one sentence contradiction description>",\n' +
      '      "location": "<short quote from current episode>"\n' +
      '    }\n' +
      '  ]\n' +
      '}\n' +
      'If there are no issues, return { "flags": [] }.\n\n' +
      '## Linked Characters\n\n' + charSection + '\n\n' +
      '## Prior Episodes (most recent first)\n\n' + priorSection + '\n\n' +
      '## Locked Canon\n\n' + canonSection +
      (compareSection ? '\n\n## Additional Comparison Episode\n\n' + compareSection : '');

    const userMessage =
      `## Current Episode: ${ep.title || 'Untitled'} [${ep.ep_status || 'no status'}]\n\n${ep.body}`;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Unexpected response shape from Claude API.');

    let parsed;
    try {
      const raw = textBlock.text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Claude returned malformed JSON. Try again.');
    }

    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
    return {
      flags: flags.map((f) => ({
        flagType:    f.flagType    || 'timeline',
        sourceKind:  f.sourceKind  || 'canon',
        sourceId:    typeof f.sourceId === 'number' ? f.sourceId : null,
        sourceTitle: f.sourceTitle || '?',
        reason:      f.reason      || '',
        location:    f.location    || '',
      })),
      checkedCount,
      priorEpisodesCount:   priorEps.length,
      characterCount:       linkedCharRows.length,
      compareEpisodeTitle:  compareEp ? compareEp.title : null,
    };
  });

  // PEPISODE-CONT-2B — Writing Lab continuity check.
  // Reads draft body + locked canon; optionally a selected episode for context.
  // Returns same flag shape as claude:episodeContinuityCheck.
  ipcMain.handle('claude:wlabContinuityCheck', async (_e, draftId, model, compareEpisodeId) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');
    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    const draft = db.writingLab.get(draftId);
    if (!draft) throw new Error('Draft not found.');
    if (!draft.body || !draft.body.trim()) return { flags: [], skipped: true };

    const dbHandle = db.getDb();

    const lockedCanon = dbHandle.prepare(`
      SELECT ce.id, ce.entry_type, ce.title, ce.body, ce.locked_at, ce.locked_label
        FROM canon_entries ce
       WHERE ce.locked = 1 AND ce.retired = 0
       ORDER BY ce.entry_type ASC, ce.title ASC
    `).all();

    let compareEp = null;
    if (compareEpisodeId && typeof compareEpisodeId === 'number') {
      compareEp = dbHandle.prepare(
        `SELECT id, title, body, ep_status FROM episodes_workspace WHERE id = ? AND archived_at IS NULL`
      ).get(compareEpisodeId);
    }

    const checkedCount = lockedCanon.length + (compareEp ? 1 : 0);

    const canonSection = lockedCanon.length === 0
      ? 'No locked canon entries.'
      : lockedCanon.map((ce) =>
          `Canon [${ce.entry_type}] #${ce.id}: ${ce.title}\n${ce.body || '(no body)'}`
        ).join('\n\n---\n\n');

    const compareSection = compareEp
      ? `Episode #${compareEp.id}: ${compareEp.title} [${compareEp.ep_status || 'no status'}]\n${compareEp.body || '(no notes)'}`
      : null;

    const systemPrompt =
      'You are a continuity analyst for a TV writers\' room. ' +
      'Your job is to flag issues in a Writing Lab draft when compared against ' +
      '(1) locked canon facts' +
      (compareSection ? ', and (2) a user-selected episode entry' : '') + '.\n\n' +
      'Flag ONLY clear, specific issues in one of these three categories:\n' +
      '  - "timeline": a date, sequence, or timing contradiction\n' +
      '  - "character_state": a character\'s status, arc, location, or known facts are inconsistent\n' +
      '  - "arc_break": a narrative arc development in this draft contradicts or skips a prior arc beat\n\n' +
      'Do NOT flag: thematic differences, speculation, missing information, or things that could plausibly coexist.\n' +
      'Only flag clear contradictions with specific sourced evidence.\n\n' +
      'For each flag provide:\n' +
      '  - "flagType": "timeline" | "character_state" | "arc_break"\n' +
      '  - "sourceKind": "canon" | "episode"\n' +
      '  - "sourceId": the numeric ID of the canon entry or episode cited (null if unknown)\n' +
      '  - "sourceTitle": the title of the cited source entry\n' +
      '  - "reason": one sentence describing the specific contradiction\n' +
      '  - "location": a short quote or phrase from the draft (under 80 chars) where the issue appears\n\n' +
      'Respond with a JSON object in this exact shape — no markdown, no explanation outside JSON:\n' +
      '{\n' +
      '  "flags": [\n' +
      '    {\n' +
      '      "flagType": "<timeline|character_state|arc_break>",\n' +
      '      "sourceKind": "<canon|episode>",\n' +
      '      "sourceId": <number or null>,\n' +
      '      "sourceTitle": "<title of cited entry>",\n' +
      '      "reason": "<one sentence contradiction description>",\n' +
      '      "location": "<short quote from draft>"\n' +
      '    }\n' +
      '  ]\n' +
      '}\n' +
      'If there are no issues, return { "flags": [] }.\n\n' +
      '## Locked Canon\n\n' + canonSection +
      (compareSection ? '\n\n## Comparison Episode\n\n' + compareSection : '');

    const userMessage =
      `## Writing Lab Draft: ${draft.title || 'Untitled'}\n\n${draft.body}`;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Unexpected response shape from Claude API.');

    let parsed;
    try {
      const raw = textBlock.text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Claude returned malformed JSON. Try again.');
    }

    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
    return {
      flags: flags.map((f) => ({
        flagType:    f.flagType    || 'timeline',
        sourceKind:  f.sourceKind  || 'canon',
        sourceId:    typeof f.sourceId === 'number' ? f.sourceId : null,
        sourceTitle: f.sourceTitle || '?',
        reason:      f.reason      || '',
        location:    f.location    || '',
      })),
      checkedCount,
      compareEpisodeTitle: compareEp ? compareEp.title : null,
    };
  });

  // PEPISODE-CONT-2B — Characters continuity check.
  // Reads character body + status + linked canon facts + linked episode entries.
  // Returns same flag shape as claude:episodeContinuityCheck.
  ipcMain.handle('claude:charContinuityCheck', async (_e, charId, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured. Add one in Settings.');
    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    const char = db.characters.get(charId);
    if (!char) throw new Error('Character not found.');
    if (!char.body || !char.body.trim()) return { flags: [], skipped: true };

    const dbHandle = db.getDb();

    // Linked episodes — in either direction of cross_workspace_attachments.
    const linkedEpRows = dbHandle.prepare(`
      SELECT DISTINCT ew.id, ew.title, ew.body, ew.ep_status, ew.created_at
        FROM episodes_workspace ew
        JOIN cross_workspace_attachments cwa ON (
          (cwa.host_kind = 'characters' AND cwa.host_id   = ? AND cwa.source_kind = 'episodes' AND cwa.source_id = ew.id)
          OR
          (cwa.host_kind = 'episodes'   AND cwa.source_kind = 'characters' AND cwa.source_id = ? AND cwa.host_id = ew.id)
        )
        WHERE ew.archived_at IS NULL
        ORDER BY ew.created_at DESC, ew.id DESC
    `).all(charId, charId);

    // Locked, non-retired canon entries.
    const lockedCanon = dbHandle.prepare(`
      SELECT ce.id, ce.entry_type, ce.title, ce.body
        FROM canon_entries ce
       WHERE ce.locked = 1 AND ce.retired = 0
       ORDER BY ce.entry_type ASC, ce.title ASC
    `).all();

    const checkedCount = lockedCanon.length + linkedEpRows.length;

    const epSection = linkedEpRows.length === 0
      ? 'No episodes are linked to this character.'
      : linkedEpRows.map((ep) =>
          `Episode #${ep.id}: ${ep.title} [${ep.ep_status || 'no status'}]\n${ep.body || '(no notes)'}`
        ).join('\n\n---\n\n');

    const canonSection = lockedCanon.length === 0
      ? 'No locked canon entries.'
      : lockedCanon.map((ce) =>
          `Canon [${ce.entry_type}] #${ce.id}: ${ce.title}\n${ce.body || '(no body)'}`
        ).join('\n\n---\n\n');

    const charStatusStr = char.char_status ? ` [status: ${char.char_status}]` : '';

    const systemPrompt =
      'You are a continuity analyst for a TV writers\' room. ' +
      'Your job is to flag inconsistencies specific to one character entry, ' +
      'comparing it against (1) locked canon facts and (2) linked episode entries.\n\n' +
      'Flag ONLY clear, specific issues in one of these three categories:\n' +
      '  - "timeline": a date, sequence, or timing contradiction involving this character\n' +
      '  - "character_state": the character\'s status, arc, location, or known facts are inconsistent across episodes or canon\n' +
      '  - "arc_break": a narrative arc development for this character contradicts or skips a prior arc beat\n\n' +
      'Do NOT flag: thematic differences, speculation, missing information, or things that could plausibly coexist.\n' +
      'Only flag clear contradictions with specific sourced evidence.\n\n' +
      'For each flag provide:\n' +
      '  - "flagType": "timeline" | "character_state" | "arc_break"\n' +
      '  - "sourceKind": "canon" | "episode"\n' +
      '  - "sourceId": the numeric ID of the canon entry or episode cited (null if unknown)\n' +
      '  - "sourceTitle": the title of the cited source entry\n' +
      '  - "reason": one sentence describing the specific contradiction\n' +
      '  - "location": a short quote or phrase from the character entry (under 80 chars) where the issue appears\n\n' +
      'Respond with a JSON object in this exact shape — no markdown, no explanation outside JSON:\n' +
      '{\n' +
      '  "flags": [\n' +
      '    {\n' +
      '      "flagType": "<timeline|character_state|arc_break>",\n' +
      '      "sourceKind": "<canon|episode>",\n' +
      '      "sourceId": <number or null>,\n' +
      '      "sourceTitle": "<title of cited entry>",\n' +
      '      "reason": "<one sentence contradiction description>",\n' +
      '      "location": "<short quote from character entry>"\n' +
      '    }\n' +
      '  ]\n' +
      '}\n' +
      'If there are no issues, return { "flags": [] }.\n\n' +
      '## Linked Episodes\n\n' + epSection + '\n\n' +
      '## Locked Canon\n\n' + canonSection;

    const userMessage =
      `## Character: ${char.title || 'Untitled'}${charStatusStr}\n\n${char.body}`;

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Unexpected response shape from Claude API.');

    let parsed;
    try {
      const raw = textBlock.text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('Claude returned malformed JSON. Try again.');
    }

    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];
    return {
      flags: flags.map((f) => ({
        flagType:    f.flagType    || 'timeline',
        sourceKind:  f.sourceKind  || 'canon',
        sourceId:    typeof f.sourceId === 'number' ? f.sourceId : null,
        sourceTitle: f.sourceTitle || '?',
        reason:      f.reason      || '',
        location:    f.location    || '',
      })),
      checkedCount,
      linkedEpisodesCount: linkedEpRows.length,
    };
  });

  // P46-C — Tag suggestions for a saved Flanagan analysis.
  // Takes the analysis text and the full tag library; returns up to 5 tag names
  // that genuinely fit. Never auto-applies — caller must confirm.
  ipcMain.handle('claude:flanaganTagSuggest', async (_e, { summary, breakdown, northStar, questionTitle }, tags, model) => {
    const apiKey = db.settings.getClaudeApiKey();
    if (!apiKey) throw new Error('No Claude API key configured.');
    const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';

    if (!tags || tags.length === 0) return [];

    const tagList = tags.map((t) => `  ${t.id}: ${t.name}`).join('\n');
    const analysisText = [
      questionTitle ? `Question: ${questionTitle}` : '',
      summary ? `Summary: ${summary}` : '',
      breakdown ? `Breakdown:\n${breakdown}` : '',
      northStar ? `North Star: ${northStar}` : '',
    ].filter(Boolean).join('\n\n');

    const systemPrompt =
      'You are a tagging assistant for a television production workspace. ' +
      'Given a Flanagan Filter analysis, suggest which tags from the provided library best apply to the question being analyzed. ' +
      'Only suggest tags that genuinely fit the content. Return 2–5 tag IDs. If no tags fit, return an empty array.';

    const userMsg =
      `Analysis:\n\n${analysisText}\n\n` +
      `Available tags:\n${tagList}\n\n` +
      'Return the IDs of the tags that best apply to this question and analysis.';

    const TAG_TOOL = {
      name: 'suggest_tags',
      description: 'Return the IDs of tags from the library that best apply to this analysis.',
      input_schema: {
        type: 'object',
        properties: {
          tag_ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of tag IDs from the library that apply. Empty array if none fit.',
          },
        },
        required: ['tag_ids'],
      },
    };

    const data = await callClaudeAPI(apiKey, {
      model: safeModel,
      max_tokens: 256,
      system: systemPrompt,
      tools: [TAG_TOOL],
      tool_choice: { type: 'tool', name: 'suggest_tags' },
      messages: [{ role: 'user', content: userMsg }],
    });

    const toolBlock = (data.content || []).find(
      (b) => b.type === 'tool_use' && b.name === 'suggest_tags'
    );
    if (!toolBlock || !toolBlock.input) return [];

    const suggestedIds = new Set(toolBlock.input.tag_ids || []);
    return tags.filter((t) => suggestedIds.has(t.id));
  });

  // PUI2 popout wiring.
  //  • popout:open spawns a new BrowserWindow for a single entry.
  //  • popout:changed is a one-way fan-out: whoever just mutated an entry
  //    (popout OR main) tells every OTHER window to refresh its view of that
  //    workspace, so list + detail stay in sync without manual reloads.
  ipcMain.handle('popout:open', (_event, workspace, id) => {
    createPopoutWindow(workspace, id);
  });
  ipcMain.on('popout:changed', (event, workspace) => {
    const fromId = event.sender.id;
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.webContents.id !== fromId) {
        w.webContents.send('popout:changed', workspace);
      }
    }
  });

  // PSESSION-LOG — finalize on demand (Settings "End Session" button), list
  // all past logs, and export a specific log as a plain-text file.
  ipcMain.handle('sessionLog:finalize', () => {
    const hadEvents = sessionEvents.length > 0;
    finalizeSession();
    sessionStart = new Date().toISOString();
    return { ok: true, saved: hadEvents };
  });
  ipcMain.handle('sessionLog:list', () => db.sessionLogs.list());
  // PHEALTH — health stats (migration count, file size, record counts, orphans)
  // and orphan cleanup. dbPath is derived from userData so no module-level var needed.
  ipcMain.handle('health:getStats', () => {
    const dbPath = path.join(app.getPath('userData'), db.DB_FILENAME);
    return db.health.getStats(dbPath);
  });
  ipcMain.handle('health:cleanupOrphans', () => db.health.cleanupOrphans());
  ipcMain.handle('sessionLog:export', (_e, id) => {
    const log = db.sessionLogs.get(id);
    if (!log) throw new Error('Session log not found.');
    const start = new Date(log.started_at);
    const end   = new Date(log.ended_at);
    const durationMs = end - start;
    const h = Math.floor(durationMs / 3600000);
    const m = Math.floor((durationMs % 3600000) / 60000);
    const durStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const fmtDate = start.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const fmtTime = (d) =>
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const groups = {};
    for (const e of log.events) {
      if (!groups[e.workspace]) groups[e.workspace] = {};
      groups[e.workspace][e.action] = (groups[e.workspace][e.action] || 0) + 1;
    }

    const lines = [
      'Revival Studio — Session Log',
      fmtDate,
      `Started: ${fmtTime(start)}   Ended: ${fmtTime(end)}   Duration: ${durStr}`,
      '',
    ];
    for (const [ws, actions] of Object.entries(groups)) {
      lines.push(ws);
      for (const [action, count] of Object.entries(actions)) {
        const label = action.charAt(0).toUpperCase() + action.slice(1);
        lines.push(`  ${label}: ${count}`);
      }
      lines.push('');
    }
    lines.push(`Total: ${log.events.length} action(s)`);

    const folder = path.join(
      app.getPath('documents'),
      'revival-bible-studio',
      'session_logs'
    );
    fs.mkdirSync(folder, { recursive: true });
    const slug = log.started_at.slice(0, 19).replace(/[:.]/g, '-');
    const filePath = path.join(folder, `session-${slug}.txt`);
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    shell.openPath(folder);
    return { filePath };
  });
}

app.whenReady().then(() => {
  const { dbPath, applied } = db.initDatabase(app.getPath('userData'));
  console.log(`[db] ready at ${dbPath} (${applied} migration(s) applied this boot)`);

  registerIpc();
  createWindow();
  sessionStart = new Date().toISOString();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// PSESSION-LOG — save the session log before the process exits.
// better-sqlite3 is synchronous so this runs cleanly in will-quit.
app.on('will-quit', () => {
  finalizeSession();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
