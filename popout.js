// PUI2 — Full-screen popout window for a single entry.
//
// Loaded in its own BrowserWindow by main.js (createPopoutWindow). Reads the
// workspace + entry id from the query string, then renders just that entry's
// detail panel — independent window state, rest of the app keeps working.
//
// Reference Mode is the default: the entry opens read-only, with explicit
// Edit / Archive (or Restore) / Delete actions. Editing is a deliberate
// click, matching the PCBREF principle that lock-worthy surfaces never start
// in edit mode by accident.
//
// Cross-window sync: every commit (save / archive / restore / delete) fires
// window.revival.popout.notifyChanged(workspace). Main process fans that
// signal out to every OTHER window, so the main window's list refreshes
// without a manual reload, and a sibling popout watching the same workspace
// stays current too.

const WORKSPACE_CONFIGS = {
  'Unsorted': {
    apiName: 'unsorted',
    entityKind: 'unsorted',
    titlePlaceholder: 'Title',
    bodyPlaceholder: 'Notes (optional)',
    typeLabel: 'Entry',
  },
  'Source Material': {
    apiName: 'sourceMaterial',
    entityKind: 'source_material',
    titlePlaceholder: 'Title',
    bodyPlaceholder: 'Notes (optional)',
    typeLabel: 'Source',
  },
  'Documents': {
    apiName: 'documents',
    entityKind: 'documents',
    titlePlaceholder: 'Title',
    bodyPlaceholder: 'Notes (optional)',
    typeLabel: 'Document',
  },
  'Open Questions': {
    apiName: 'openQuestions',
    entityKind: 'open_questions',
    titlePlaceholder: 'Title',
    bodyPlaceholder: 'Notes (optional)',
    typeLabel: 'Open question',
  },
  'Conflicts': {
    apiName: 'conflicts',
    entityKind: 'conflicts',
    sectionClass: 'ws-conflicts',
    titlePlaceholder: 'What contradicts what?',
    bodyPlaceholder: 'The two sides in tension, and where each comes from (optional)',
    typeLabel: 'Conflict',
  },
  'Decisions': {
    apiName: 'decisions',
    entityKind: 'decisions',
    titlePlaceholder: 'What was decided?',
    bodyPlaceholder: 'The decision, and why it was settled this way (optional)',
    typeLabel: 'Decision',
  },
  'Brainstorm': {
    apiName: 'brainstorm',
    entityKind: 'brainstorm',
    titlePlaceholder: 'What is the idea?',
    bodyPlaceholder: 'Where it might go, what sparked it (optional)',
    typeLabel: 'Idea',
  },
  'Research': {
    apiName: 'research',
    entityKind: 'research',
    sectionClass: 'ws-research',
    titlePlaceholder: 'What was researched?',
    bodyPlaceholder: 'Findings, and where they came from — source/link (optional)',
    typeLabel: 'Research',
  },
  'Characters': {
    apiName: 'characters',
    entityKind: 'characters',
    sectionClass: 'ws-characters',
    titlePlaceholder: 'Character name',
    bodyPlaceholder: 'Who they are — role, traits, arc, open threads (optional)',
    typeLabel: 'Character',
  },
  'Episodes': {
    apiName: 'episodes',
    entityKind: 'episodes',
    sectionClass: 'ws-episodes',
    titlePlaceholder: 'Episode title',
    bodyPlaceholder: 'Outline, scene list, beats, draft notes (optional)',
    typeLabel: 'Episode',
  },
};

// Same persisted theme key the main window uses, so the popout inherits
// whatever the user picked there.
const THEME_KEY = 'revival.theme';
function applyTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}
applyTheme();

const params = new URLSearchParams(location.search);
const workspaceName = params.get('workspace');
const entryId = Number(params.get('id'));
const config = WORKSPACE_CONFIGS[workspaceName];
const api = config ? window.revival[config.apiName] : null;

const root = document.getElementById('popout-root');

function setStatus(el, text) {
  el.textContent = text;
  el.style.display = text ? '' : 'none';
}

function isArchived(item) {
  return !!(item && item.archived_at);
}

// PPASSIVE — same passive status bar + linked-entries indicator as the main
// window detail panel. Both read-only.
function buildStatusBar(item, archivedFlag) {
  const bar = document.createElement('div');
  bar.className = 'tc-statusbar';
  const seg = (label, value) => {
    const s = document.createElement('span');
    s.className = 'tc-statusbar-seg';
    const k = document.createElement('span');
    k.className = 'tc-statusbar-key';
    k.textContent = label;
    s.append(k, document.createTextNode(value));
    return s;
  };
  const created = item.created_at
    ? new Date(item.created_at).toLocaleDateString()
    : '—';
  const edited =
    item.updated_at && item.updated_at !== item.created_at
      ? new Date(item.updated_at).toLocaleDateString()
      : '—';
  bar.append(
    seg('Workspace', workspaceName || '—'),
    seg('Type', (config && config.typeLabel) || 'Entry'),
    seg('Created', created),
    seg('Edited', edited),
    seg('Status', archivedFlag ? 'Archived' : 'Unlocked')
  );
  return bar;
}

function renderLinkedList(listHost, data) {
  listHost.innerHTML = '';
  const group = (heading, items, srcText) => {
    if (!items.length) return;
    const h = document.createElement('div');
    h.className = 'tc-linked-heading';
    h.textContent = heading;
    listHost.appendChild(h);
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'tc-linked-row';
      row.appendChild(document.createTextNode(it.title));
      const src = document.createElement('span');
      src.className = 'tc-linked-src';
      src.textContent = srcText(it);
      row.appendChild(src);
      listHost.appendChild(row);
    }
  };
  group('Attachments', data.attachments, (it) => it.workspace);
  group('Canon links', data.canonLinks, (it) => `Canon Bible · ${it.entry_type}`);
}

function mountLinkedIndicator(host, entityKind, id) {
  if (!entityKind || !window.revival.links) return;
  const wrap = document.createElement('details');
  wrap.className = 'tc-linked';
  const summary = document.createElement('summary');
  summary.className = 'tc-linked-summary';
  summary.textContent = '🔗 Linked entries…';
  wrap.appendChild(summary);
  const listHost = document.createElement('div');
  listHost.className = 'tc-linked-body';
  wrap.appendChild(listHost);
  host.appendChild(wrap);

  window.revival.links
    .for(entityKind, id)
    .then((data) => {
      const a = data.counts.attachments;
      const c = data.counts.canonLinks;
      if (a === 0 && c === 0) {
        summary.textContent = '🔗 No linked entries';
        summary.classList.add('tc-linked-empty');
        return;
      }
      summary.textContent =
        `🔗 ${a} attachment${a === 1 ? '' : 's'} / ` +
        `${c} canon link${c === 1 ? '' : 's'}`;
      renderLinkedList(listHost, data);
    })
    .catch(() => {
      summary.textContent = '🔗 Links unavailable';
      summary.classList.add('tc-linked-empty');
    });
}

async function fetchEntry() {
  const [items, archs] = await Promise.all([api.list(), api.listArchived()]);
  return (
    items.find((i) => i.id === entryId) ||
    archs.find((i) => i.id === entryId) ||
    null
  );
}

// Build the chrome (frame bar + detail card). Returns handles so renderView /
// renderEdit / renderMissing can swap the card contents without rebuilding the
// outer shell.
function mountShell() {
  root.innerHTML = '';
  if (config && config.sectionClass) root.classList.add(config.sectionClass);

  const bar = document.createElement('div');
  bar.className = 'po-frame-bar';
  const wsLabel = document.createElement('span');
  wsLabel.textContent = workspaceName || 'Popout';
  const dot = document.createElement('span');
  dot.className = 'po-frame-dot';
  dot.textContent = '•';
  const typeLabel = document.createElement('span');
  typeLabel.textContent = config ? config.typeLabel : '';
  const mode = document.createElement('span');
  mode.className = 'po-frame-mode';
  bar.append(wsLabel, dot, typeLabel, mode);
  root.appendChild(bar);

  const card = document.createElement('div');
  card.className = 'po-detail';
  root.appendChild(card);

  return { card, mode };
}

function renderMissing(card, mode) {
  setStatus(mode, '');
  card.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'po-missing';
  const t = document.createElement('div');
  t.className = 'po-missing-title';
  t.textContent = 'Entry no longer available';
  const h = document.createElement('div');
  h.textContent =
    'This entry was deleted from another window. You can close this popout.';
  wrap.append(t, h);
  card.appendChild(wrap);
  document.title = 'Revival Studio';
}

function renderView(card, mode, item) {
  isEditing = false;
  card.innerHTML = '';
  const archivedFlag = isArchived(item);
  setStatus(mode, archivedFlag ? 'Archived — read-only' : 'Reference Mode');
  document.title = `${item.title} — ${workspaceName}`;

  const h = document.createElement('h2');
  h.className = 'tc-detail-header';
  h.textContent = item.title;
  card.appendChild(h);

  const meta = document.createElement('div');
  meta.className = 'tc-detail-meta';
  if (archivedFlag) {
    meta.textContent = `Archived ${new Date(item.archived_at).toLocaleString()}`;
  } else {
    meta.textContent = `Added ${new Date(item.created_at).toLocaleString()}`;
    if (item.updated_at && item.updated_at !== item.created_at) {
      meta.textContent += ` · edited ${new Date(item.updated_at).toLocaleString()}`;
    }
  }
  card.appendChild(meta);

  if (item.body) {
    const body = document.createElement('div');
    body.className = 'tc-detail-body';
    body.textContent = item.body;
    card.appendChild(body);
    // PUI3: same extract-and-route flow as the main window detail panel.
    if (window.RevivalExtract) {
      window.RevivalExtract.attach(body, {
        workspace: workspaceName,
        id: item.id,
        title: item.title,
      });
    }
  }

  const actions = document.createElement('div');
  actions.className = 'tc-detail-actions';

  if (archivedFlag) {
    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn-primary';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', async () => {
      restoreBtn.disabled = true;
      try {
        await api.restore(item.id);
        window.revival.popout.notifyChanged(workspaceName);
        await refresh();
      } catch {
        restoreBtn.disabled = false;
      }
    });
    actions.appendChild(restoreBtn);
  } else {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => renderEdit(card, mode, item));
    actions.appendChild(editBtn);

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn-secondary';
    archiveBtn.textContent = 'Archive';
    archiveBtn.addEventListener('click', async () => {
      archiveBtn.disabled = true;
      try {
        await api.archive(item.id);
        window.revival.popout.notifyChanged(workspaceName);
        await refresh();
      } catch {
        archiveBtn.disabled = false;
      }
    });
    actions.appendChild(archiveBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    showDeleteConfirm(card, mode, actions, item);
  });
  actions.appendChild(deleteBtn);

  card.appendChild(actions);

  // PTAG — tag bar in Reference Mode (Edit Mode rebuilds the card and
  // intentionally omits it). Tag mutations don't broadcast to other windows
  // here, so a main-window list won't update live; refreshing the popout
  // (any save/archive/etc.) re-fetches tags.
  if (config && config.entityKind && window.RevivalTags) {
    window.RevivalTags.mountTagBar(card, config.entityKind, item.id);
  }

  // PPASSIVE — linked-entries indicator + persistent status bar at the bottom.
  mountLinkedIndicator(card, config && config.entityKind, item.id);
  card.appendChild(buildStatusBar(item, archivedFlag));
}

function showDeleteConfirm(card, mode, actions, item) {
  const confirmRow = document.createElement('div');
  confirmRow.className = 'tc-detail-actions confirm-row';

  const prompt = document.createElement('span');
  prompt.className = 'confirm-text';
  prompt.textContent = 'Delete this entry? This cannot be undone.';

  const yes = document.createElement('button');
  yes.type = 'button';
  yes.className = 'btn-danger';
  yes.textContent = 'Delete';
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    try {
      await api.delete(item.id);
      window.revival.popout.notifyChanged(workspaceName);
      // Entry is gone — show the missing state right away rather than refetching
      // and racing the deletion through the list.
      renderMissing(card, mode);
    } catch (e) {
      prompt.textContent = e.message || 'Could not delete entry.';
      yes.disabled = false;
    }
  });

  const no = document.createElement('button');
  no.type = 'button';
  no.className = 'btn-secondary';
  no.textContent = 'Cancel';
  no.addEventListener('click', () => confirmRow.replaceWith(actions));

  confirmRow.append(prompt, yes, no);
  actions.replaceWith(confirmRow);
}

function renderEdit(card, mode, item) {
  isEditing = true;
  card.innerHTML = '';
  setStatus(mode, 'Edit Mode');

  const titleEdit = document.createElement('input');
  titleEdit.type = 'text';
  titleEdit.className = 'wl-title';
  titleEdit.maxLength = 200;
  titleEdit.placeholder = config.titlePlaceholder;
  titleEdit.value = item.title;

  const bodyEdit = document.createElement('textarea');
  bodyEdit.className = 'wl-body';
  bodyEdit.placeholder = config.bodyPlaceholder;
  bodyEdit.value = item.body || '';

  const status = document.createElement('p');
  status.className = 'draft-status';
  const err = document.createElement('p');
  err.className = 'form-error';

  const actions = document.createElement('div');
  actions.className = 'tc-detail-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';

  actions.append(saveBtn, cancelBtn);

  titleEdit.addEventListener('input', () => {
    saveBtn.disabled = titleEdit.value.trim() === '';
    err.textContent = '';
  });

  saveBtn.addEventListener('click', async () => {
    if (titleEdit.value.trim() === '') return;
    saveBtn.disabled = true;
    try {
      await api.update(item.id, {
        title: titleEdit.value,
        body: bodyEdit.value,
      });
      window.revival.popout.notifyChanged(workspaceName);
      await refresh();
    } catch (e) {
      err.textContent = e.message || 'Could not save changes.';
      saveBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', () => {
    // Cancel returns to Reference Mode with the originally-loaded entry.
    renderView(card, mode, item);
  });

  card.append(titleEdit, bodyEdit, status, err, actions);
  titleEdit.focus();
}

// True while the popout is in Edit Mode. External popout:changed broadcasts
// are ignored while editing so an outside refresh can't clobber in-progress
// keystrokes. Reset whenever we return to Reference Mode.
let isEditing = false;

// Single source of truth for "show the current entry". Re-fetches the row so
// timestamps + archive state stay accurate after edits and after external
// changes broadcast from other windows.
let shell = null;
async function refresh() {
  if (!shell) shell = mountShell();
  if (!config) {
    renderMissing(shell.card, shell.mode);
    document.title = 'Revival Studio';
    return;
  }
  let item;
  try {
    item = await fetchEntry();
  } catch (e) {
    shell.card.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'form-error';
    p.textContent = `Could not load entry: ${e.message || e}`;
    shell.card.appendChild(p);
    return;
  }
  if (!item) {
    renderMissing(shell.card, shell.mode);
    return;
  }
  renderView(shell.card, shell.mode, item);
}

window.revival.popout.onChanged((ws) => {
  if (ws === workspaceName && !isEditing) refresh();
});

if (!config || !api || !Number.isFinite(entryId)) {
  shell = mountShell();
  renderMissing(shell.card, shell.mode);
} else {
  refresh();
}
