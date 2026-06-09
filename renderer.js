// Left-nav routing for the Revival workspaces.
// Each page renders its title plus any workspace-specific functional UI.

const WORKSPACES = [
  'Home',
  'Chat',
  'Writing Lab',
  'Source Material',
  'Documents',
  'Canon Bible',
  'Characters',
  'Episodes',
  'Unsorted',
  'Canon Review',
  'Open Questions',
  'Conflicts',
  'Decisions',
  'Brainstorm',
  'Research',
  'Import',
  'Settings',
];

// Reusable template: renders the workspace title, then any workspace-specific
// functional UI below it.
function renderWorkspacePage(name) {
  const content = CONTENT_RENDERERS[name];

  const page = document.createElement('div');

  const h1 = document.createElement('h1');
  h1.textContent = name;
  page.appendChild(h1);

  if (!content) {
    const sub = document.createElement('p');
    sub.className = 'placeholder';
    sub.textContent = 'Placeholder — workspace features come in a later phase.';
    page.appendChild(sub);
  }

  if (content) {
    const section = document.createElement('div');
    section.className = 'ws-content';
    page.appendChild(section);
    content(section, name);
  }

  return page;
}

// --- PUI2 cross-window refresh hook -----------------------------------------
// When a popout commits an edit/archive/delete, main.js fans the workspace
// name out to every other window. A workspace registers its loadList here
// when it mounts; route() clears the registration when the user navigates
// away. The renderer module-level listener (set up far below, once the
// preload bridge is available) calls the registered loadList only if the
// signal's workspace matches the one currently mounted.
let currentWorkspaceName = null;
let currentWorkspaceRefresh = null;
// PImp2: scoped keydown handler for Canon Review keyboard navigation.
// Replaced (not accumulated) each time Canon Review mounts.
let _canonReviewKeyHandler = null;

// --- PHOME recently-viewed + one-click return -------------------------------
// Session-persistent (sessionStorage, cleared on app restart) list of the last
// entries the user actually opened, newest first, deduped by workspace+id and
// capped at RECENT_VIEWED_CAP. Home renders it; clicking an item routes to its
// workspace AND pre-selects the entry. pendingEntrySelection carries that
// pre-selection across route() until the target workspace's loadList applies it.
const RECENT_VIEWED_KEY = 'revival.recentlyViewed';
const RECENT_VIEWED_CAP = 8;
let pendingEntrySelection = null;

function getRecentlyViewed() {
  try {
    const arr = JSON.parse(sessionStorage.getItem(RECENT_VIEWED_KEY));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function recordRecentlyViewed(workspace, id, title) {
  if (!workspace || id == null) return;
  const rest = getRecentlyViewed().filter(
    (e) => !(e.workspace === workspace && e.id === id)
  );
  rest.unshift({ workspace, id, title: title || '(untitled)' });
  sessionStorage.setItem(
    RECENT_VIEWED_KEY,
    JSON.stringify(rest.slice(0, RECENT_VIEWED_CAP))
  );
}

function setActiveWorkspaceRefresh(name, refresh) {
  currentWorkspaceName = name || null;
  currentWorkspaceRefresh = typeof refresh === 'function' ? refresh : null;
}
function clearActiveWorkspaceRefresh() {
  currentWorkspaceName = null;
  currentWorkspaceRefresh = null;
}

// --- Draft autosave (preservation only, never finalization) ----------------
// In-progress create/edit text is mirrored to localStorage so quitting
// mid-edit and reopening restores the draft. The committed entry in SQLite is
// untouched until the user explicitly clicks Save. Slot is 'new' for the
// create form, or an entry id for an edit in progress. `prefix` namespaces
// drafts per workspace so e.g. Unsorted and Source Material don't collide.
function makeDrafts(prefix) {
  const keyFor = (slot) => `revival.draft.${prefix}.${slot}`;
  return {
    get(slot) {
      try {
        return JSON.parse(localStorage.getItem(keyFor(slot)));
      } catch {
        return null;
      }
    },
    set(slot, data) {
      localStorage.setItem(keyFor(slot), JSON.stringify(data));
    },
    clear(slot) {
      localStorage.removeItem(keyFor(slot));
    },
  };
}

function setStatus(el, text) {
  el.textContent = text;
  el.style.display = text ? '' : 'none';
}

// PUNDO — session-only undo stack for destructive actions (archive, delete).
// Max 20 entries, cleared on app restart. Canon Bible lock/supersede/retire
// and Canon Review approve/reject are excluded.
const UndoStack = (() => {
  const MAX = 20;
  const stack = [];
  const listeners = new Set();
  function notify() { listeners.forEach((fn) => fn(stack.length)); }
  return {
    push(action) {
      stack.unshift(action);
      if (stack.length > MAX) stack.pop();
      notify();
    },
    peek() { return stack[0] || null; },
    pop() { const a = stack.shift() || null; notify(); return a; },
    size() { return stack.length; },
    clear() { stack.length = 0; notify(); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();

let _undoToastEl = null;
function showUndoToast(message) {
  if (!_undoToastEl) {
    _undoToastEl = document.createElement('div');
    _undoToastEl.className = 'rb-toast rb-toast-bottom';
    _undoToastEl.hidden = true;
    document.body.appendChild(_undoToastEl);
  }
  const el = _undoToastEl;
  el.textContent = message;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('rb-toast-visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('rb-toast-visible');
    setTimeout(() => { el.hidden = true; }, 220);
  }, 2400);
}

async function performUndo(action) {
  try {
    if (action.type === 'archive') {
      const api = window.revival[action.apiName];
      if (!api || !api.restore) throw new Error('Cannot restore this entry.');
      await api.restore(action.id);
      showUndoToast(`Restored "${action.title}"`);
    } else if (action.type === 'delete') {
      const api = window.revival[action.apiName];
      if (!api || !api.create) throw new Error('Cannot recreate this entry.');
      await api.create({ title: action.title, body: action.body || '' });
      showUndoToast(`Restored "${action.title}"`);
    } else if (action.type === 'canonArchive') {
      await window.revival.canon.restore(action.id);
      showUndoToast(`Restored "${action.title}"`);
    } else if (action.type === 'chatArchive') {
      await window.revival.chats.restore(action.id);
      showUndoToast(`Restored chat "${action.title}"`);
    }
    if (currentWorkspaceRefresh) await currentWorkspaceRefresh();
  } catch (err) {
    showUndoToast(`Undo failed: ${err.message || 'Unknown error'}`);
  }
}

// PCONFLICT-2 — lightweight bottom-center toast used by Canon Bible to nudge
// the user when they mutate a canon entry that's currently load-bearing for
// an open Conflicts row. Reuses the extract-toast visual treatment but stays
// independent so the extract module's lifecycle never owns this surface.
// Single-toast: a second call replaces the first instead of stacking, which
// matches the one-action-at-a-time mental model of Canon Bible edits.
let _flagToastEl = null;
function showFlagResolvedToast(message) {
  if (!_flagToastEl) {
    _flagToastEl = document.createElement('div');
    _flagToastEl.className = 'rb-toast';
    _flagToastEl.hidden = true;
    document.body.appendChild(_flagToastEl);
  }
  const el = _flagToastEl;
  el.textContent = message;
  el.hidden = false;
  // Force a reflow so the transition runs even on rapid back-to-back calls.
  void el.offsetWidth;
  el.classList.add('rb-toast-visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('rb-toast-visible');
    setTimeout(() => { el.hidden = true; }, 220);
  }, 3600);
}

let _routeToastEl = null;
function showRoutedToast(destLabel) {
  if (!_routeToastEl) {
    _routeToastEl = document.createElement('div');
    _routeToastEl.className = 'rb-toast rb-toast-bottom';
    _routeToastEl.hidden = true;
    document.body.appendChild(_routeToastEl);
  }
  const el = _routeToastEl;
  el.innerHTML = '';
  const msg = document.createTextNode(`Sent to ${destLabel} `);
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'rb-toast-link';
  link.textContent = 'Open →';
  link.onclick = () => route(destLabel);
  el.append(msg, link);
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('rb-toast-visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('rb-toast-visible');
    setTimeout(() => { el.hidden = true; }, 220);
  }, 3600);
}

// --- PPASSIVE: passive status bar + linked-entries indicator ---------------
// Shared by every two-column detail panel (and mirrored in popout.js). Both
// surfaces are read-only — they summarise state and relationships, they never
// mutate anything.

// Per-workspace entry-type label for the status bar (mirrors popout configs).
const ENTRY_TYPE_LABELS = {
  'Unsorted': 'Entry',
  'Source Material': 'Source',
  'Documents': 'Document',
  'Open Questions': 'Open question',
  'Conflicts': 'Conflict',
  'Decisions': 'Decision',
  'Brainstorm': 'Idea',
  'Research': 'Research',
  'Characters': 'Character',
  'Episodes': 'Episode',
  'Writing Lab': 'Draft',
};

// Thin persistent bar: workspace · type · created · last edited · state.
// Generic workspace entries are never locked, so the state slot reads
// "Archived" when archived and "Unlocked" otherwise (the lock concept is
// canon-only; this keeps the slot honest without inventing a lock).
function buildStatusBar(workspaceName, item, archivedFlag) {
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
  const segs = [
    seg('Workspace', workspaceName || '—'),
    seg('Type', ENTRY_TYPE_LABELS[workspaceName] || 'Entry'),
    seg('Created', created),
  ];
  if (edited !== '—') segs.push(seg('Edited', edited));
  segs.push(seg('Status', archivedFlag ? 'Archived' : 'Active'));
  if (UndoStack.size() > 0) {
    const undoSeg = seg('Undo', '⌘Z available');
    undoSeg.classList.add('tc-statusbar-undo');
    segs.push(undoSeg);
  }
  bar.append(...segs);
  return bar;
}

function renderLinkedList(listHost, data) {
  listHost.innerHTML = '';
  if (data.attachments.length) {
    const h = document.createElement('div');
    h.className = 'tc-linked-heading';
    h.textContent = 'Attachments';
    listHost.appendChild(h);
    for (const it of data.attachments) {
      const row = document.createElement('div');
      row.className = 'tc-linked-row';
      const titleBtn = document.createElement('button');
      titleBtn.type = 'button';
      titleBtn.className = 'tc-linked-goto';
      titleBtn.textContent = it.title;
      titleBtn.title = `Go to ${it.workspace} → ${it.title}`;
      titleBtn.addEventListener('click', () => {
        const ws = CWA_KIND_TO_WORKSPACE[it.kind];
        if (ws) route(ws, it.id);
      });
      row.appendChild(titleBtn);
      const src = document.createElement('span');
      src.className = 'tc-linked-src';
      src.textContent = it.workspace;
      row.appendChild(src);
      listHost.appendChild(row);
    }
  }
  if (data.canonLinks.length) {
    const h = document.createElement('div');
    h.className = 'tc-linked-heading';
    h.textContent = 'Canon links';
    listHost.appendChild(h);
    for (const it of data.canonLinks) {
      const row = document.createElement('div');
      row.className = 'tc-linked-row';
      row.appendChild(document.createTextNode(it.title));
      const src = document.createElement('span');
      src.className = 'tc-linked-src';
      src.textContent = `Canon Bible · ${it.entry_type}`;
      row.appendChild(src);
      listHost.appendChild(row);
    }
  }
  // PBRAIN-STRUCT — back-references: brainstorm items developed into this entry.
  if (data.brainstormDevFrom && data.brainstormDevFrom.length) {
    const h = document.createElement('div');
    h.className = 'tc-linked-heading';
    h.textContent = 'Developed from Brainstorm';
    listHost.appendChild(h);
    for (const it of data.brainstormDevFrom) {
      const row = document.createElement('div');
      row.className = 'tc-linked-row';
      const titleBtn = document.createElement('button');
      titleBtn.type = 'button';
      titleBtn.className = 'tc-linked-goto';
      titleBtn.textContent = it.title;
      titleBtn.title = `Go to Brainstorm → ${it.title}`;
      titleBtn.addEventListener('click', () => route('Brainstorm', it.id));
      row.appendChild(titleBtn);
      const src = document.createElement('span');
      src.className = 'tc-linked-src';
      src.textContent = 'Brainstorm';
      row.appendChild(src);
      listHost.appendChild(row);
    }
  }
}

// Passive count that expands to the linked list on click. Mounts immediately
// with a loading label; fills in once links.for() resolves.
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
      const d = data.counts.brainstormDevFrom || 0;
      if (a === 0 && c === 0 && d === 0) {
        summary.textContent = '🔗 No linked entries';
        summary.classList.add('tc-linked-empty');
        return;
      }
      const parts = [];
      parts.push(`${a} attachment${a === 1 ? '' : 's'}`);
      parts.push(`${c} canon link${c === 1 ? '' : 's'}`);
      if (d > 0) parts.push(`${d} brainstorm ref${d === 1 ? '' : 's'}`);
      summary.textContent = `🔗 ${parts.join(' / ')}`;
      renderLinkedList(listHost, data);
    })
    .catch(() => {
      summary.textContent = '🔗 Links unavailable';
      summary.classList.add('tc-linked-empty');
    });
}

// PBRAIN-STRUCT — passive back-reference panel. Shown on any workspace entry
// that a brainstorm item was "developed into". Loads async; renders nothing
// if there are no back-refs so it never clutters clean entries.
function mountBrainstormDevFromSection(host, entityKind, id) {
  if (!entityKind || !window.revival.links) return;
  // Only valid target kinds can have back-refs.
  const VALID_TARGET_KINDS = new Set([
    'decisions', 'research', 'open_questions', 'writing_lab', 'documents', 'unsorted',
    'conflicts', 'characters', 'episodes', 'source_material',
  ]);
  if (!VALID_TARGET_KINDS.has(entityKind)) return;

  window.revival.links.for(entityKind, id).then((data) => {
    const refs = data.brainstormDevFrom || [];
    if (!refs.length) return;

    const section = document.createElement('div');
    section.className = 'bs-devfrom-section';
    const heading = document.createElement('div');
    heading.className = 'bs-devfrom-heading';
    heading.textContent = `Developed from Brainstorm (${refs.length})`;
    section.appendChild(heading);
    for (const ref of refs) {
      const row = document.createElement('div');
      row.className = 'bs-devfrom-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tc-linked-goto';
      btn.textContent = ref.title;
      btn.title = `Go to Brainstorm → ${ref.title}`;
      btn.addEventListener('click', () => route('Brainstorm', ref.id));
      row.appendChild(btn);
      section.appendChild(row);
    }
    host.appendChild(section);
  }).catch(() => { /* non-fatal */ });
}

// P36 + global expand — cross-workspace attachment section (all entry workspaces).
const CWA_HOST_KINDS = new Set([
  'characters', 'episodes', 'open_questions', 'conflicts', 'decisions',
  'brainstorm', 'research', 'writing_lab', 'source_material', 'documents', 'unsorted',
]);
const CWA_SOURCE_KINDS = [
  { kind: 'decisions',      label: 'Decisions' },
  { kind: 'open_questions', label: 'Open Questions' },
  { kind: 'conflicts',      label: 'Conflicts' },
  { kind: 'brainstorm',     label: 'Brainstorm' },
  { kind: 'research',       label: 'Research' },
  { kind: 'source_material', label: 'Source Material' },
  { kind: 'documents',      label: 'Documents' },
];
const CWA_KIND_TO_WORKSPACE = {
  characters:      'Characters',
  episodes:        'Episodes',
  decisions:       'Decisions',
  open_questions:  'Open Questions',
  conflicts:       'Conflicts',
  brainstorm:      'Brainstorm',
  research:        'Research',
  source_material: 'Source Material',
  documents:       'Documents',
  writing_lab:     'Writing Lab',
  unsorted:        'Unsorted',
};

// Maps entity kind → window.revival API namespace for global archive/delete.
const KIND_TO_API_NAME = {
  characters:      'characters',
  episodes:        'episodes',
  decisions:       'decisions',
  open_questions:  'openQuestions',
  conflicts:       'conflicts',
  brainstorm:      'brainstorm',
  research:        'research',
  source_material: 'sourceMaterial',
  documents:       'documents',
  writing_lab:     'writingLab',
  unsorted:        'unsorted',
};

function buildAttachmentPicker(hostKind, hostId, onAttached, onClose) {
  const picker = document.createElement('div');
  picker.className = 'cwa-picker';

  const tabRow = document.createElement('div');
  tabRow.className = 'cwa-picker-tabs';
  picker.appendChild(tabRow);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'cwa-picker-search';
  searchInput.placeholder = 'Search…';
  picker.appendChild(searchInput);

  const itemList = document.createElement('div');
  itemList.className = 'cwa-picker-list';
  picker.appendChild(itemList);

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'cwa-picker-done';
  doneBtn.textContent = 'Done';
  doneBtn.addEventListener('click', () => { picker.remove(); onClose(); });
  picker.appendChild(doneBtn);

  let currentKind = CWA_SOURCE_KINDS[0].kind;
  let allCandidates = [];

  for (const src of CWA_SOURCE_KINDS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'cwa-picker-tab';
    tab.textContent = src.label;
    tab.dataset.kind = src.kind;
    if (src.kind === currentKind) tab.classList.add('active');
    tab.addEventListener('click', () => {
      currentKind = src.kind;
      tabRow.querySelectorAll('.cwa-picker-tab').forEach((t) =>
        t.classList.toggle('active', t.dataset.kind === currentKind)
      );
      searchInput.value = '';
      loadCandidates();
    });
    tabRow.appendChild(tab);
  }

  async function loadCandidates() {
    itemList.innerHTML = '<div class="cwa-picker-msg">Loading…</div>';
    try {
      allCandidates = await window.revival.crossWorkspace.candidates(currentKind);
      renderCandidates();
    } catch {
      itemList.innerHTML = '<div class="cwa-picker-msg">Failed to load.</div>';
    }
  }

  function renderCandidates() {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? allCandidates.filter((c) => c.title.toLowerCase().includes(q))
      : allCandidates;
    itemList.innerHTML = '';
    if (!filtered.length) {
      const msg = document.createElement('div');
      msg.className = 'cwa-picker-msg';
      msg.textContent = q ? 'No matches.' : 'No entries found.';
      itemList.appendChild(msg);
      return;
    }
    for (const c of filtered) {
      const el = document.createElement('div');
      el.className = 'cwa-picker-item';
      el.textContent = c.title;
      el.addEventListener('click', async () => {
        if (el.classList.contains('attached') || el.classList.contains('attaching')) return;
        el.classList.add('attaching');
        try {
          await window.revival.crossWorkspace.attach(hostKind, hostId, currentKind, c.id);
          el.classList.remove('attaching');
          el.classList.add('attached');
          el.textContent = `${c.title} ✓`;
          onAttached();
        } catch {
          el.classList.remove('attaching');
        }
      });
      itemList.appendChild(el);
    }
  }

  searchInput.addEventListener('input', renderCandidates);
  loadCandidates();
  return picker;
}

function mountAttachmentsSection(host, entityKind, id) {
  if (!entityKind || !window.revival.links || !window.revival.crossWorkspace) return;

  const section = document.createElement('div');
  section.className = 'cwa-section';

  const header = document.createElement('div');
  header.className = 'cwa-header';
  const heading = document.createElement('span');
  heading.className = 'cwa-heading';
  heading.textContent = 'Attached';
  header.appendChild(heading);
  section.appendChild(header);

  const attachList = document.createElement('div');
  attachList.className = 'cwa-list';
  section.appendChild(attachList);

  let pickerOpen = false;

  const attachBtn = document.createElement('button');
  attachBtn.type = 'button';
  attachBtn.className = 'cwa-attach-btn';
  attachBtn.textContent = '+ Attach';
  header.appendChild(attachBtn);

  attachBtn.addEventListener('click', () => {
    if (pickerOpen) return;
    pickerOpen = true;
    attachBtn.disabled = true;
    const picker = buildAttachmentPicker(entityKind, id, refresh, () => {
      pickerOpen = false;
      attachBtn.disabled = false;
    });
    section.appendChild(picker);
  });

  async function refresh() {
    const data = await window.revival.links.for(entityKind, id);
    renderAttachList(data.attachments);
  }

  function renderAttachList(attachments) {
    attachList.innerHTML = '';
    if (!attachments.length) {
      const empty = document.createElement('div');
      empty.className = 'cwa-empty';
      empty.textContent = 'No attachments yet.';
      attachList.appendChild(empty);
      return;
    }
    for (const att of attachments) {
      const row = document.createElement('div');
      row.className = 'cwa-row';

      const titleBtn = document.createElement('button');
      titleBtn.type = 'button';
      titleBtn.className = 'cwa-row-title';
      titleBtn.textContent = att.title;
      titleBtn.title = `Go to ${att.workspace}`;
      titleBtn.addEventListener('click', () => {
        const ws = CWA_KIND_TO_WORKSPACE[att.kind];
        if (ws) route(ws, att.id);
      });
      row.appendChild(titleBtn);

      const right = document.createElement('div');
      right.className = 'cwa-row-right';

      const src = document.createElement('span');
      src.className = 'cwa-row-src';
      src.textContent = att.workspace;
      right.appendChild(src);

      const unlinkBtn = document.createElement('button');
      unlinkBtn.type = 'button';
      unlinkBtn.className = 'cwa-unlink';
      unlinkBtn.textContent = 'Unlink';
      unlinkBtn.addEventListener('click', async () => {
        unlinkBtn.disabled = true;
        try {
          await window.revival.crossWorkspace.detach(entityKind, id, att.kind, att.id);
          await refresh();
        } catch {
          unlinkBtn.disabled = false;
        }
      });
      right.appendChild(unlinkBtn);

      // Global archive — calls the entry's own workspace API directly.
      const attApiName = KIND_TO_API_NAME[att.kind];
      const attApi = attApiName && window.revival[attApiName];

      if (attApi && attApi.archive) {
        const archiveBtn = document.createElement('button');
        archiveBtn.type = 'button';
        archiveBtn.className = 'cwa-unlink';
        archiveBtn.textContent = 'Archive';
        archiveBtn.title = `Archive this ${att.workspace} entry`;
        archiveBtn.addEventListener('click', async () => {
          archiveBtn.disabled = true;
          try {
            await attApi.archive(att.id);
            await refresh();
          } catch {
            archiveBtn.disabled = false;
          }
        });
        right.appendChild(archiveBtn);
      }

      // Global delete — inline confirm before committing.
      if (attApi && attApi.delete) {
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'cwa-unlink cwa-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.title = `Permanently delete this ${att.workspace} entry`;
        deleteBtn.addEventListener('click', () => {
          // Swap to inline confirm so user can't accidentally delete.
          right.innerHTML = '';
          const confirmLabel = document.createElement('span');
          confirmLabel.className = 'cwa-row-src';
          confirmLabel.textContent = 'Delete permanently?';
          const yesBtn = document.createElement('button');
          yesBtn.type = 'button';
          yesBtn.className = 'cwa-unlink cwa-delete';
          yesBtn.textContent = 'Yes, delete';
          yesBtn.addEventListener('click', async () => {
            yesBtn.disabled = true;
            try {
              await attApi.delete(att.id);
              await refresh();
            } catch {
              yesBtn.disabled = false;
            }
          });
          const noBtn = document.createElement('button');
          noBtn.type = 'button';
          noBtn.className = 'cwa-unlink';
          noBtn.textContent = 'Cancel';
          noBtn.addEventListener('click', () => refresh());
          right.append(confirmLabel, yesBtn, noBtn);
        });
        right.appendChild(deleteBtn);
      }

      row.appendChild(right);
      attachList.appendChild(row);
    }
  }

  host.appendChild(section);
  refresh().catch(() => {
    attachList.innerHTML = '<div class="cwa-empty">Links unavailable.</div>';
  });
}

// --- Shared entry workspace (two-column: list left, detail right) ---
// PUI1: every entry workspace renders this layout — left list of titles with a
// "+ Add" button and a collapsed Archived section at the bottom; right panel
// is the empty state, the create form, the read-only view, or the edit form
// depending on what's selected.
function makeEntryWorkspace(config) {
  const api = window.revival[config.apiName];
  // PTAG — entityKind matches the DB table name (e.g. 'unsorted',
  // 'source_material'). Workspaces that pass it in get the tag bar on
  // their detail panel, tag badges on list items, and the filter bar.
  const entityKind = config.entityKind || null;
  const Drafts = makeDrafts(config.draftPrefix);
  const addLabel = config.addLabel;
  const finalizeHint = `Click “${addLabel}” to finalize.`;

  function previewLine(item) {
    const oneLine = String(item.body || '').replace(/\s+/g, ' ').trim();
    return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
  }

  return function renderEntryWorkspace(section, workspaceName) {
  // Optional accent class lets a workspace look visibly distinct from the
  // others that share this template (e.g. Conflicts vs Open Questions).
  if (config.sectionClass) section.classList.add(config.sectionClass);

  // Two-column shell.
  const layout = document.createElement('div');
  layout.className = 'tc-layout';
  const leftCol = document.createElement('div');
  leftCol.className = 'tc-left';
  const rightCol = document.createElement('div');
  rightCol.className = 'tc-right';
  layout.append(leftCol, rightCol);
  section.appendChild(layout);

  // selectedId: null = empty state; 'new' = create form; <id> = view/edit.
  let selectedId = null;
  let activeItems = [];
  let archivedItems = [];
  // PTAG state: tagsById is the entity_id -> tag[] map for list badges and
  // filter matching; tagFilter is the set of selected filter tag ids.
  let tagsById = {};
  let tagFilter = new Set();

  // PTAG filter bar — above the + Add button so narrowing the list never
  // pushes "+ Add" off-screen. Only mounted when the workspace declared an
  // entityKind, so legacy workspaces without one still render normally.
  if (entityKind && window.RevivalTags) {
    const fc = window.RevivalTags.mountFilterBar(leftCol, entityKind, {
      onChange: (sel) => {
        tagFilter = sel;
        renderList();
      },
    });
    tagFilter = fc.selected;
  }

  // Left column: + Add button, active list, collapsed archived section.
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tc-add';
  addBtn.textContent = `+ ${addLabel}`;
  addBtn.addEventListener('click', () => {
    selectedId = 'new';
    renderList();
    renderDetail();
  });
  leftCol.appendChild(addBtn);

  // PCONFLICT-2 — Conflicts page only: an inline hint + a "Re-check resolved
  // conflicts" button. The scan call already auto-archives resolved
  // Conflicts rows as a side effect; we surface the count, reload the list,
  // and keep the user on this page instead of bouncing to Canon Bible just
  // to clean up routed-then-resolved rows.
  if (config.apiName === 'conflicts') {
    const bar = document.createElement('div');
    bar.className = 'conflict-rescan-bar';

    const hint = document.createElement('div');
    hint.className = 'conflict-rescan-hint';
    hint.textContent =
      'Resolved a conflict in Canon Bible? Re-run detection to auto-archive cleared ones.';
    bar.appendChild(hint);

    const row = document.createElement('div');
    row.className = 'conflict-rescan-row';

    const rescanBtn = document.createElement('button');
    rescanBtn.type = 'button';
    rescanBtn.className = 'btn-secondary conflict-rescan-btn';
    rescanBtn.textContent = 'Re-check resolved conflicts';
    rescanBtn.title =
      'Re-runs canon conflict detection and auto-archives any routed Conflicts whose underlying collision is gone.';
    row.appendChild(rescanBtn);

    const rescanStatus = document.createElement('span');
    rescanStatus.className = 'conflict-rescan-status placeholder';
    row.appendChild(rescanStatus);

    bar.appendChild(row);
    leftCol.appendChild(bar);

    rescanBtn.addEventListener('click', async () => {
      rescanBtn.disabled = true;
      const prevLabel = rescanBtn.textContent;
      rescanBtn.textContent = 'Re-checking…';
      rescanStatus.textContent = '';
      try {
        // PCONFLICT-2 (auto-route) — same call as Canon Bible's scan
        // button: auto-archives resolved rows AND auto-routes any new
        // collisions that surfaced since the last run.
        const data = await window.revival.canonConflicts.scanAndRoute();
        const newCount = (data.routedNew || []).length;
        const archivedCount = (data.autoArchived || []).length;
        await loadList();
        const parts = [];
        if (archivedCount)
          parts.push(
            `Auto-archived ${archivedCount} resolved conflict${archivedCount === 1 ? '' : 's'}`
          );
        if (newCount)
          parts.push(
            `routed ${newCount} new conflict${newCount === 1 ? '' : 's'}`
          );
        rescanStatus.textContent = parts.length
          ? `${parts.join(' · ')}.`
          : 'Nothing changed — no resolved or new conflicts.';
      } catch (err) {
        rescanStatus.textContent = `Re-check failed: ${err.message || err}`;
      } finally {
        rescanBtn.textContent = prevLabel;
        rescanBtn.disabled = false;
      }
    });
  }

  const list = document.createElement('div');
  list.className = 'tc-list';
  leftCol.appendChild(list);

  const archived = document.createElement('details');
  archived.className = 'tc-archived-section';
  const archivedSummary = document.createElement('summary');
  archived.appendChild(archivedSummary);

  // PPOL1: Bulk delete toolbar for archived section
  const archiveBulkBar = document.createElement('div');
  archiveBulkBar.className = 'tc-archive-bulk-bar';
  const deleteSelectedBtn = document.createElement('button');
  deleteSelectedBtn.type = 'button';
  deleteSelectedBtn.className = 'btn-danger btn-sm';
  deleteSelectedBtn.textContent = 'Delete Selected';
  deleteSelectedBtn.disabled = true;
  const deleteAllBtn = document.createElement('button');
  deleteAllBtn.type = 'button';
  deleteAllBtn.className = 'btn-danger btn-sm';
  deleteAllBtn.textContent = 'Delete All';
  deleteAllBtn.disabled = true;

  function renderBulkBar() {
    archiveBulkBar.innerHTML = '';
    archiveBulkBar.append(deleteSelectedBtn, deleteAllBtn);
  }
  renderBulkBar();

  function showBulkDeleteConfirm(getIds, label) {
    archiveBulkBar.innerHTML = '';
    const text = document.createElement('span');
    text.className = 'confirm-text';
    text.textContent = `Delete ${label}? This cannot be undone.`;
    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'btn-danger btn-sm';
    yesBtn.textContent = 'Delete';
    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'btn-secondary btn-sm';
    noBtn.textContent = 'Cancel';
    noBtn.addEventListener('click', renderBulkBar);
    yesBtn.addEventListener('click', async () => {
      yesBtn.disabled = true;
      noBtn.disabled = true;
      try {
        const ids = getIds();
        for (const id of ids) {
          await api.delete(id);
          if (id === selectedId) selectedId = null;
        }
        await loadList();
      } catch {
        renderBulkBar();
      }
    });
    archiveBulkBar.append(text, yesBtn, noBtn);
  }

  deleteSelectedBtn.addEventListener('click', () => {
    const ids = Array.from(archivedListEl.querySelectorAll('.tc-archive-check:checked'))
      .map((cb) => Number(cb.dataset.id));
    if (!ids.length) return;
    showBulkDeleteConfirm(
      () => Array.from(archivedListEl.querySelectorAll('.tc-archive-check:checked')).map((cb) => Number(cb.dataset.id)),
      `${ids.length} archived ${ids.length === 1 ? 'entry' : 'entries'}`
    );
  });

  deleteAllBtn.addEventListener('click', () => {
    const ids = Array.from(archivedListEl.querySelectorAll('.tc-archive-check'))
      .map((cb) => Number(cb.dataset.id));
    if (!ids.length) return;
    showBulkDeleteConfirm(
      () => Array.from(archivedListEl.querySelectorAll('.tc-archive-check')).map((cb) => Number(cb.dataset.id)),
      `all ${ids.length} archived ${ids.length === 1 ? 'entry' : 'entries'}`
    );
  });

  archived.appendChild(archiveBulkBar);

  const archivedListEl = document.createElement('div');
  archivedListEl.className = 'tc-list';
  archived.appendChild(archivedListEl);
  leftCol.appendChild(archived);

  // If a "new" draft is sitting in localStorage from a previous session, start
  // selected on it so the user sees their unfinalized work, not an empty state.
  if (Drafts.get('new')) selectedId = 'new';

  function findItem(id) {
    return (
      activeItems.find((i) => i.id === id) ||
      archivedItems.find((i) => i.id === id) ||
      null
    );
  }

  function isArchived(item) {
    return !!(item && item.archived_at);
  }

  function buildListItem(item, archivedFlag) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tc-list-item';
    if (selectedId === item.id) btn.classList.add('active');

    const titleRow = document.createElement('div');
    titleRow.className = 'tc-list-title';
    if (archivedFlag) {
      const badge = document.createElement('span');
      badge.className = 'tc-list-badge badge-archived';
      badge.textContent = 'Archived';
      titleRow.appendChild(badge);
    }
    if (!archivedFlag && Drafts.get(item.id)) {
      const badge = document.createElement('span');
      badge.className = 'tc-list-badge';
      badge.textContent = 'Draft';
      titleRow.appendChild(badge);
    }
    if (!archivedFlag && item.is_blocking) {
      const badge = document.createElement('span');
      badge.className = 'tc-list-badge badge-blocking';
      badge.textContent = 'Blocking';
      titleRow.appendChild(badge);
    }
    titleRow.appendChild(document.createTextNode(item.title));
    btn.appendChild(titleRow);

    const pv = previewLine(item);
    if (pv) {
      const p = document.createElement('div');
      p.className = 'tc-list-preview';
      p.textContent = pv;
      btn.appendChild(p);
    }

    // PTAG — compact tag badges on the list item.
    if (window.RevivalTags) {
      const tagList = tagsById[item.id] || [];
      if (tagList.length) btn.appendChild(window.RevivalTags.buildBadges(tagList));
    }

    // PBRAIN-STRUCT: workspace-specific list item extras (e.g. status badges).
    if (config.listItemExtra) config.listItemExtra(btn, item, archivedFlag);

    // PSTALE: subtle age marker when item hasn't been touched in ≥ threshold days.
    if (!archivedFlag && config.staleThresholdDays) {
      const threshold = typeof config.staleThresholdDays === 'function'
        ? config.staleThresholdDays()
        : config.staleThresholdDays;
      const ts = item.updated_at || item.created_at;
      if (ts && threshold > 0) {
        const age = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
        if (age >= threshold) {
          const staleEl = document.createElement('span');
          staleEl.className = 'tc-list-stale';
          staleEl.textContent = `${age}d`;
          staleEl.title = `Not updated in ${age} days`;
          btn.appendChild(staleEl);
        }
      }
    }

    btn.addEventListener('click', () => {
      selectedId = item.id;
      renderList();
      renderDetail();
    });
    return btn;
  }

  // PTAG — AND match: the item must carry every selected filter tag.
  // config.matchesExtra: optional per-workspace extra predicate (e.g. status filter).
  // (makeEntryWorkspace instance — used by all standard workspaces incl. Conflicts)
  function matchesFilter(item) {
    if (config.matchesExtra && !config.matchesExtra(item)) return false;
    if (tagFilter.size === 0) return true;
    const itemTags = tagsById[item.id] || [];
    const have = new Set(itemTags.map((t) => t.id));
    for (const id of tagFilter) if (!have.has(id)) return false;
    return true;
  }

  function renderList() {
    list.innerHTML = '';
    const filteredActive = activeItems.filter(matchesFilter);
    const filteredArchived = archivedItems.filter(matchesFilter);

    // PPOL2-32: hide the rescan hint when there are no active conflict entries
    const hintEl = leftCol.querySelector('.conflict-rescan-hint');
    if (hintEl) hintEl.style.display = activeItems.length === 0 ? 'none' : '';

    if (filteredActive.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tc-list-empty';
      empty.textContent = (tagFilter.size || (config.isFilterActive && config.isFilterActive()))
        ? 'No entries match the selected filter(s).'
        : 'No entries yet.';
      list.appendChild(empty);
    } else if (config.customRenderActive) {
      // PBRAIN-STRUCT: workspace-specific active-list rendering (e.g. thread groups).
      config.customRenderActive(list, filteredActive, buildListItem);
    } else {
      for (const item of filteredActive) {
        list.appendChild(buildListItem(item, false));
      }
    }

    archivedListEl.innerHTML = '';
    archivedSummary.textContent = `Archived (${filteredArchived.length})`;
    archived.style.display = filteredArchived.length === 0 ? 'none' : '';
    // PPOL1: Reset bulk bar and update button states
    renderBulkBar();
    deleteSelectedBtn.disabled = true;
    deleteSelectedBtn.textContent = 'Delete Selected';
    deleteAllBtn.disabled = filteredArchived.length === 0;
    for (const item of filteredArchived) {
      const row = document.createElement('div');
      row.className = 'tc-archived-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'tc-archive-check';
      cb.dataset.id = item.id;
      cb.addEventListener('change', () => {
        const n = archivedListEl.querySelectorAll('.tc-archive-check:checked').length;
        deleteSelectedBtn.disabled = n === 0;
        deleteSelectedBtn.textContent = n > 0 ? `Delete Selected (${n})` : 'Delete Selected';
      });
      row.append(cb, buildListItem(item, true));
      archivedListEl.appendChild(row);
    }
  }

  // --- Right panel: empty / create / view / edit -------------------------
  function showEmpty() {
    rightCol.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tc-empty';
    const t = document.createElement('div');
    t.className = 'tc-empty-title';
    const h = document.createElement('div');
    h.className = 'tc-empty-hint';
    if (activeItems.length === 0 && config.emptyTitle) {
      t.textContent = config.emptyTitle;
      h.textContent = config.emptyHint || `Click “+ ${addLabel}” to add your first entry.`;
    } else {
      t.textContent = 'Nothing selected';
      h.textContent = activeItems.length === 0
        ? `Click “+ ${addLabel}” to create your first entry.`
        : 'Pick an entry on the left, or click + to add a new one.';
    }
    wrap.append(t, h);
    rightCol.appendChild(wrap);
  }

  function showCreate() {
    rightCol.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'entry-form';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = config.titlePlaceholder || 'Title';
    titleInput.maxLength = 200;

    const bodyInput = document.createElement('textarea');
    bodyInput.placeholder = config.bodyPlaceholder || 'Notes (optional)';
    bodyInput.rows = 6;

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = addLabel;
    submit.disabled = true;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.alignSelf = 'flex-start';

    const actionRow = document.createElement('div');
    actionRow.className = 'entry-actions';
    actionRow.append(submit, cancelBtn);

    const error = document.createElement('p');
    error.className = 'form-error';
    const formStatus = document.createElement('p');
    formStatus.className = 'draft-status';

    // Restore an in-progress create draft preserved from a previous session.
    const newDraft = Drafts.get('new');
    if (newDraft) {
      titleInput.value = newDraft.title || '';
      bodyInput.value = newDraft.body || '';
      submit.disabled = titleInput.value.trim() === '';
      setStatus(formStatus, `Draft restored — not added yet. ${finalizeHint}`);
    } else {
      setStatus(formStatus, '');
    }

    function saveNewDraft() {
      if (titleInput.value.trim() === '' && bodyInput.value.trim() === '') {
        Drafts.clear('new');
        setStatus(formStatus, '');
      } else {
        Drafts.set('new', { title: titleInput.value, body: bodyInput.value });
        setStatus(formStatus, `Draft saved — not added yet. ${finalizeHint}`);
      }
    }

    titleInput.addEventListener('input', () => {
      submit.disabled = titleInput.value.trim() === '';
      error.textContent = '';
      saveNewDraft();
    });
    bodyInput.addEventListener('input', saveNewDraft);

    // Source Material's optional .txt upload — fills the inputs, user still
    // reviews and clicks the add button to finalize.
    if (config.allowFileUpload) {
      const uploadRow = document.createElement('div');
      uploadRow.className = 'upload-row';

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.txt,text/plain';
      fileInput.style.display = 'none';

      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'btn-secondary';
      uploadBtn.textContent = 'Upload .txt file';
      uploadBtn.addEventListener('click', () => fileInput.click());

      const uploadHint = document.createElement('span');
      uploadHint.className = 'upload-hint';
      uploadHint.textContent = 'Fills the fields below — review, then add.';

      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (!file) return;
        const isText =
          file.type === 'text/plain' || /\.txt$/i.test(file.name);
        if (!isText) {
          error.textContent = 'Only .txt files are supported for now.';
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => {
          error.textContent = 'Could not read that file.';
        };
        reader.onload = () => {
          const text = String(reader.result || '');
          if (titleInput.value.trim() === '') {
            titleInput.value = file.name.replace(/\.txt$/i, '');
          }
          bodyInput.value =
            bodyInput.value.trim() === ''
              ? text
              : `${bodyInput.value}\n\n${text}`;
          submit.disabled = titleInput.value.trim() === '';
          error.textContent = '';
          saveNewDraft();
          setStatus(
            formStatus,
            `Loaded “${file.name}” — review and click “${addLabel}” to finalize.`
          );
          titleInput.focus();
        };
        reader.readAsText(file);
      });

      uploadRow.append(uploadBtn, uploadHint, fileInput);
      form.appendChild(uploadRow);
    }

    form.append(titleInput, bodyInput);
    // PAUDIT-6 — workspace-specific extra create form fields (e.g. OQ tier selector).
    let createExtras = null;
    if (config.createFormExtra) createExtras = config.createFormExtra(form);
    form.append(actionRow, formStatus, error);
    rightCol.appendChild(form);

    cancelBtn.addEventListener('click', () => {
      // Cancel discards the in-progress create draft and goes back to empty.
      Drafts.clear('new');
      selectedId = null;
      renderDetail();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (titleInput.value.trim() === '') return;
      submit.disabled = true;
      try {
        const created = await api.create({
          title: titleInput.value,
          body: bodyInput.value,
        });
        if (createExtras && createExtras.postCreate) await createExtras.postCreate(created.id);
        Drafts.clear('new');
        selectedId = created && created.id != null ? created.id : null;
        await loadList();
      } catch (err) {
        error.textContent = err.message || 'Could not save entry.';
        submit.disabled = titleInput.value.trim() === '';
      }
    });

    titleInput.focus();
  }

  function showView(item) {
    rightCol.innerHTML = '';
    const archivedFlag = isArchived(item);

    // PHOME: opening an entry records it in the session recently-viewed list.
    if (workspaceName) recordRecentlyViewed(workspaceName, item.id, item.title);

    const h = document.createElement('h2');
    h.className = 'tc-detail-header';
    h.textContent = item.title;
    rightCol.appendChild(h);

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
    rightCol.appendChild(meta);

    // PBRAIN-STRUCT: workspace-specific top-panel insert (e.g. status/thread/devinto
    // for Brainstorm). Called before the body so it's always visible without scrolling.
    if (config.showViewTop) config.showViewTop(rightCol, item, archivedFlag);

    const pendingDraft = !archivedFlag && Drafts.get(item.id);
    if (pendingDraft) {
      const badge = document.createElement('div');
      badge.className = 'draft-badge';
      badge.textContent = 'Unsaved draft preserved — not finalized.';
      rightCol.appendChild(badge);
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
          await loadList();
        } catch {
          restoreBtn.disabled = false;
        }
      });
      actions.appendChild(restoreBtn);
    } else {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-secondary';
      editBtn.textContent = pendingDraft ? 'Resume editing' : 'Edit';
      // PDRAFT-LOCK: block edits when entry is draft-locked.
      if (config.isItemDraftLocked && config.isItemDraftLocked(item)) {
        editBtn.disabled = true;
        editBtn.title = 'Unlock this entry to edit';
      } else {
        editBtn.addEventListener('click', () => showEdit(item));
      }
      actions.appendChild(editBtn);

      if (pendingDraft) {
        const discardBtn = document.createElement('button');
        discardBtn.type = 'button';
        discardBtn.className = 'btn-secondary';
        discardBtn.textContent = 'Discard draft';
        discardBtn.addEventListener('click', () => {
          Drafts.clear(item.id);
          renderList();
          renderDetail();
        });
        actions.appendChild(discardBtn);
      }

      const archiveBtn = document.createElement('button');
      archiveBtn.type = 'button';
      archiveBtn.className = 'btn-secondary';
      archiveBtn.textContent = 'Archive';
      archiveBtn.addEventListener('click', async () => {
        archiveBtn.disabled = true;
        try {
          await api.archive(item.id);
          UndoStack.push({ type: 'archive', apiName: config.apiName, id: item.id, title: item.title || '(untitled)' });
          await loadList();
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
      showDeleteConfirm(actions, item);
    });
    actions.appendChild(deleteBtn);

    // PUI2: open this entry in its own window. The popout starts in
    // Reference Mode and supports full edit/archive/restore/delete on its
    // own; main window stays usable in parallel. Saves there refresh the
    // list here automatically via the popout:changed broadcast.
    if (workspaceName) {
      const popoutBtn = document.createElement('button');
      popoutBtn.type = 'button';
      popoutBtn.className = 'btn-secondary';
      popoutBtn.textContent = 'Pop out ↗';
      popoutBtn.title = 'Open this entry in its own window';
      popoutBtn.addEventListener('click', () => {
        window.revival.popout.open(workspaceName, item.id);
      });
      actions.appendChild(popoutBtn);
    }

    rightCol.appendChild(actions);

    // Body rendered AFTER actions so Archive/Edit/Delete are always at the top
    // regardless of how long the body is. (Long bodies from routed chats would
    // otherwise push the actions far below the visible viewport.)
    if (item.body) {
      const body = document.createElement('div');
      body.className = 'tc-detail-body';
      body.textContent = item.body;
      rightCol.appendChild(body);
      // PUI3: selecting text inside the body opens the extract-and-route menu.
      if (window.RevivalExtract && workspaceName) {
        window.RevivalExtract.attach(body, {
          workspace: workspaceName,
          id: item.id,
          title: item.title,
        });
      }
    }

    // PTAG — tag bar below the body. Available on archived entries too
    // so the user can adjust metadata without restoring first. Refreshes the
    // bulk-tags map so list badges stay in sync when a chip changes.
    if (entityKind && window.RevivalTags) {
      window.RevivalTags.mountTagBar(rightCol, entityKind, item.id, {
        onChange: () => refreshTagBadges(),
      });
    }

    // P36 / PPASSIVE — Characters and Episodes get the interactive attachment
    // section; all other workspaces get the passive linked-entries indicator.
    if (CWA_HOST_KINDS.has(entityKind)) {
      mountAttachmentsSection(rightCol, entityKind, item.id);
    } else {
      mountLinkedIndicator(rightCol, entityKind, item.id);
    }
    // PBRAIN-STRUCT — passive back-reference: brainstorm items that were
    // developed into this entry. Shown on all workspaces that can be targets.
    mountBrainstormDevFromSection(rightCol, entityKind, item.id);

    // P37 — optional workspace-specific detail-panel extension (e.g. relationships section)
    if (config.detailExtra) config.detailExtra(rightCol, item, archivedFlag);

    rightCol.appendChild(buildStatusBar(workspaceName, item, archivedFlag));
  }

  async function refreshTagBadges() {
    if (!entityKind || !window.RevivalTags) return;
    const allIds = [
      ...activeItems.map((i) => i.id),
      ...archivedItems.map((i) => i.id),
    ];
    try {
      tagsById = await window.revival.tags.bulkListFor(entityKind, allIds);
      renderList();
    } catch {
      /* non-fatal — badges stay stale until next list reload */
    }
  }

  function showDeleteConfirm(actions, item) {
    const confirmRow = document.createElement('div');
    confirmRow.className = 'tc-detail-actions confirm-row';

    const prompt = document.createElement('span');
    prompt.className = 'confirm-text';
    prompt.textContent = 'Delete this entry? You can undo with ⌘Z.';

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn-danger';
    yes.textContent = 'Delete';
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      try {
        const savedTitle = item.title || '(untitled)';
        const savedBody = item.body || '';
        await api.delete(item.id);
        UndoStack.push({ type: 'delete', apiName: config.apiName, title: savedTitle, body: savedBody });
        Drafts.clear(item.id);
        selectedId = null;
        await loadList();
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

  function showEdit(item) {
    rightCol.innerHTML = '';

    // Prefer a preserved draft (e.g. quit mid-edit) over the saved values.
    const draft = Drafts.get(item.id);
    const initial = draft || { title: item.title, body: item.body || '' };

    const titleEdit = document.createElement('input');
    titleEdit.type = 'text';
    titleEdit.className = 'wl-title';
    titleEdit.maxLength = 200;
    titleEdit.value = initial.title;

    const bodyEdit = document.createElement('textarea');
    bodyEdit.className = 'wl-body';
    bodyEdit.style.minHeight = '40vh';
    bodyEdit.value = initial.body;

    const status = document.createElement('p');
    status.className = 'draft-status';
    const err = document.createElement('p');
    err.className = 'form-error';

    setStatus(
      status,
      draft ? 'Unsaved draft restored — click Save to finalize.' : ''
    );

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

    function saveEditDraft() {
      Drafts.set(item.id, { title: titleEdit.value, body: bodyEdit.value });
      setStatus(status, 'Draft autosaved — click Save to finalize.');
    }

    titleEdit.addEventListener('input', () => {
      saveBtn.disabled = titleEdit.value.trim() === '';
      err.textContent = '';
      saveEditDraft();
    });
    bodyEdit.addEventListener('input', saveEditDraft);

    // PAUDIT-6 — workspace-specific extra edit form fields (e.g. OQ tier selector).
    let editExtras = null;
    if (config.editFormExtra) editExtras = config.editFormExtra(item);

    saveBtn.addEventListener('click', async () => {
      if (titleEdit.value.trim() === '') return;
      saveBtn.disabled = true;
      try {
        await api.update(item.id, {
          title: titleEdit.value,
          body: bodyEdit.value,
        });
        if (editExtras && editExtras.postSave) await editExtras.postSave(item.id);
        Drafts.clear(item.id);
        await loadList();
      } catch (e) {
        err.textContent = e.message || 'Could not save changes.';
        saveBtn.disabled = false;
      }
    });

    cancelBtn.addEventListener('click', () => {
      // Cancel abandons the edit: discard the preserved draft too.
      Drafts.clear(item.id);
      renderList();
      renderDetail();
    });

    rightCol.append(titleEdit, bodyEdit);
    if (editExtras && editExtras.element) rightCol.appendChild(editExtras.element);
    rightCol.append(status, err, actions);

    // Global reference links: full attachment picker available in edit mode
    // so the user can manage links without saving and switching back to detail.
    if (entityKind && CWA_HOST_KINDS.has(entityKind) && window.revival.crossWorkspace) {
      mountAttachmentsSection(rightCol, entityKind, item.id);
    }

    titleEdit.focus();
  }

  function renderDetail() {
    if (selectedId === 'new') return showCreate();
    if (selectedId == null) return showEmpty();
    const item = findItem(selectedId);
    if (!item) {
      selectedId = null;
      return showEmpty();
    }
    return showView(item);
  }

  async function loadList() {
    const [items, archs] = await Promise.all([
      api.list(),
      api.listArchived(),
    ]);
    activeItems = items;
    archivedItems = archs;
    // PBRAIN-STRUCT: workspace-specific extra data load (e.g. threads for Brainstorm).
    if (config.loadListExtra) await config.loadListExtra();
    // PTAG — bulk tags for badges + filter matching, one round-trip per
    // list reload. Tags are read-only here; mutations go through the tag
    // bar in the detail panel, which calls refreshTagBadges itself.
    if (entityKind && window.RevivalTags) {
      const allIds = [
        ...activeItems.map((i) => i.id),
        ...archivedItems.map((i) => i.id),
      ];
      try {
        tagsById = await window.revival.tags.bulkListFor(entityKind, allIds);
      } catch {
        tagsById = {};
      }
    }
    if (selectedId !== null && selectedId !== 'new' && !findItem(selectedId)) {
      selectedId = null;
    }
    // PHOME: one-click return — a recently-viewed click routed here with a
    // pending entry id. Select it if it still exists, then consume the request.
    if (pendingEntrySelection && pendingEntrySelection.workspace === workspaceName) {
      const target = pendingEntrySelection.id;
      pendingEntrySelection = null;
      if (findItem(target)) selectedId = target;
    }
    renderList();
    renderDetail();

    // PHOME: keep the nav badges in sync with create/archive/delete/restore.
    refreshNavBadges();

    // Let a workspace react to its own changes elsewhere in the app. Source
    // Material uses this to refresh the Chat drawer's always-visible active
    // sources, so deleting a source (cascade-removes the attachment) or
    // archiving one (flags it) updates the chips live instead of going stale.
    if (config.onChange) config.onChange();
  }

  // P37 — optional workspace-specific left-column setup (e.g. relational view toggle).
  // Called after all DOM and handlers are wired so the hook can safely reference
  // addBtn, list, archived, and the internal state accessors.
  if (config.leftColExtra) {
    config.leftColExtra(leftCol, rightCol, {
      addBtn,
      list,
      archived,
      getSelectedId: () => selectedId,
      setSelectedId: (id) => { selectedId = id; renderList(); renderDetail(); },
      getActiveItems: () => activeItems,
      reloadList: loadList,
    });
  }

  // PUI2: register this workspace as the live refresh target so popout
  // saves elsewhere refresh the list here. Cleared by route() when the
  // user navigates away (see currentWorkspaceRefresh below).
  setActiveWorkspaceRefresh(workspaceName, loadList);

  loadList();
  };
}

// PCHAT-HISTORY — Chat history page: two-column layout showing past chats on
// the left and a read-only transcript on the right. "Continue" opens the
// selected chat in the global drawer. "New Chat" creates a fresh session in
// the drawer. The drawer itself is unchanged.
function renderChatPage(section) {
  const layout = document.createElement('div');
  layout.className = 'tc-layout';
  const leftCol = document.createElement('div');
  leftCol.className = 'tc-left';
  const rightCol = document.createElement('div');
  rightCol.className = 'tc-right';
  layout.append(leftCol, rightCol);
  section.appendChild(layout);

  let selectedChatId = null;
  let activeChats = [];
  let archivedChatsList = [];

  // "New Chat" — creates in the drawer's list then opens the drawer.
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'tc-add';
  newBtn.textContent = '+ New Chat';
  newBtn.addEventListener('click', async () => {
    newBtn.disabled = true;
    try {
      const created = await window.revival.chats.create({
        title: `Chat ${chatList.length + 1}`,
      });
      chatList.push(created);
      setActiveChat(created.id);
      setChatOpen(true);
      await loadData();
    } finally {
      newBtn.disabled = false;
    }
  });
  leftCol.appendChild(newBtn);

  const list = document.createElement('div');
  list.className = 'tc-list';
  leftCol.appendChild(list);

  const archivedDetails = document.createElement('details');
  archivedDetails.className = 'tc-archived-section';
  const archivedSummary = document.createElement('summary');
  archivedDetails.appendChild(archivedSummary);
  const archivedList = document.createElement('div');
  archivedList.className = 'tc-list';
  archivedDetails.appendChild(archivedList);
  leftCol.appendChild(archivedDetails);

  function makeListItem(chat, isArchived) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tc-list-item' + (chat.id === selectedChatId ? ' active' : '');

    const titleEl = document.createElement('div');
    titleEl.className = 'tc-list-title';
    titleEl.textContent = chat.title;
    item.appendChild(titleEl);

    const dateStr = isArchived
      ? new Date(chat.archived_at).toLocaleDateString()
      : new Date(chat.last_message_at || chat.created_at).toLocaleDateString();
    const dateEl = document.createElement('div');
    dateEl.className = 'tc-list-preview';
    dateEl.textContent = dateStr;
    item.appendChild(dateEl);

    if (chat.last_message) {
      const preview = document.createElement('div');
      preview.className = 'tc-list-preview';
      const text = String(chat.last_message).replace(/\s+/g, ' ').trim();
      preview.textContent = text.length > 80 ? text.slice(0, 80) + '…' : text;
      item.appendChild(preview);
    }

    item.addEventListener('click', () => {
      selectedChatId = chat.id;
      renderList();
      renderArchivedList();
      renderRight();
    });
    return item;
  }

  function renderList() {
    list.innerHTML = '';
    if (activeChats.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tc-list-empty';
      empty.textContent = 'No chats yet.';
      list.appendChild(empty);
      return;
    }
    for (const chat of activeChats) {
      list.appendChild(makeListItem(chat, false));
    }
  }

  function renderArchivedList() {
    archivedList.innerHTML = '';
    archivedSummary.textContent = `Archived (${archivedChatsList.length})`;
    archivedDetails.hidden = archivedChatsList.length === 0;
    for (const chat of archivedChatsList) {
      archivedList.appendChild(makeListItem(chat, true));
    }
  }

  function renderRight() {
    rightCol.innerHTML = '';
    if (!selectedChatId) {
      const empty = document.createElement('div');
      empty.className = 'tc-empty';
      const title = document.createElement('div');
      title.className = 'tc-empty-title';
      title.textContent = 'Select a chat to view its transcript';
      empty.appendChild(title);
      rightCol.appendChild(empty);
      return;
    }

    const loadingEl = document.createElement('p');
    loadingEl.className = 'placeholder';
    loadingEl.textContent = 'Loading…';
    rightCol.appendChild(loadingEl);

    window.revival.chatMessages.list(selectedChatId).then((messages) => {
      if (selectedChatId == null) return; // selection changed while loading
      const chat = activeChats.find((c) => c.id === selectedChatId)
                || archivedChatsList.find((c) => c.id === selectedChatId);
      const isArchived = !!archivedChatsList.find((c) => c.id === selectedChatId);
      rightCol.innerHTML = '';

      // Header: title + Continue button
      const headerRow = document.createElement('div');
      headerRow.className = 'chat-history-header';
      const titleEl = document.createElement('h2');
      titleEl.className = 'tc-detail-header';
      titleEl.textContent = chat ? chat.title : 'Chat';
      headerRow.appendChild(titleEl);

      const continueBtn = document.createElement('button');
      continueBtn.type = 'button';
      continueBtn.className = 'btn-primary';
      continueBtn.textContent = isArchived ? 'Restore & Continue' : 'Continue';
      continueBtn.title = 'Open this chat in the drawer';
      continueBtn.addEventListener('click', async () => {
        continueBtn.disabled = true;
        try {
          if (isArchived) {
            await window.revival.chats.restore(selectedChatId);
            await loadChats();
          }
          setActiveChat(selectedChatId);
          setChatOpen(true);
          await loadData();
        } finally {
          continueBtn.disabled = false;
        }
      });
      headerRow.appendChild(continueBtn);
      rightCol.appendChild(headerRow);

      const meta = document.createElement('div');
      meta.className = 'tc-detail-meta';
      const dateVal = chat ? new Date(chat.created_at).toLocaleDateString() : '';
      meta.textContent = `Created ${dateVal}${isArchived ? ' · Archived' : ''}`;
      rightCol.appendChild(meta);

      // Actions: Archive/Restore + Delete
      const actions = document.createElement('div');
      actions.className = 'tc-detail-actions';

      if (!isArchived) {
        const archiveBtn = document.createElement('button');
        archiveBtn.type = 'button';
        archiveBtn.className = 'btn-secondary';
        archiveBtn.textContent = 'Archive';
        archiveBtn.addEventListener('click', async () => {
          archiveBtn.disabled = true;
          try {
            const chatTitle = chat ? chat.title || '(untitled chat)' : '(untitled chat)';
            const chatId = selectedChatId;
            await window.revival.chats.archive(chatId);
            UndoStack.push({ type: 'chatArchive', id: chatId, title: chatTitle });
            // If this was the active chat in the drawer, reload the drawer list.
            if (activeChatId === chatId) await loadChats();
            selectedChatId = null;
            await loadData();
          } catch {
            archiveBtn.disabled = false;
          }
        });
        actions.appendChild(archiveBtn);
      } else {
        const restoreBtn = document.createElement('button');
        restoreBtn.type = 'button';
        restoreBtn.className = 'btn-secondary';
        restoreBtn.textContent = 'Restore';
        restoreBtn.addEventListener('click', async () => {
          restoreBtn.disabled = true;
          try {
            await window.revival.chats.restore(selectedChatId);
            await loadChats();
            selectedChatId = null;
            await loadData();
          } catch {
            restoreBtn.disabled = false;
          }
        });
        actions.appendChild(restoreBtn);
      }

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-danger';
      deleteBtn.textContent = 'Delete';
      let deleteConfirming = false;
      deleteBtn.addEventListener('click', async () => {
        if (!deleteConfirming) {
          deleteConfirming = true;
          deleteBtn.textContent = 'Confirm delete?';
          deleteBtn.classList.add('btn-danger-confirming');
          setTimeout(() => {
            if (deleteConfirming) {
              deleteConfirming = false;
              deleteBtn.textContent = 'Delete';
              deleteBtn.classList.remove('btn-danger-confirming');
            }
          }, 3000);
          return;
        }
        deleteBtn.disabled = true;
        try {
          const deletedId = selectedChatId;
          if (activeChatId === deletedId) {
            // Switch drawer to another chat before deleting.
            const next = chatList.find((c) => c.id !== deletedId);
            setActiveChat(next ? next.id : null);
            chatList.splice(chatList.findIndex((c) => c.id === deletedId), 1);
          }
          await window.revival.chats.delete(deletedId);
          selectedChatId = null;
          await loadData();
        } catch {
          deleteBtn.disabled = false;
          deleteConfirming = false;
          deleteBtn.textContent = 'Delete';
        }
      });
      actions.appendChild(deleteBtn);
      rightCol.appendChild(actions);

      // Read-only transcript
      const transcript = document.createElement('div');
      transcript.className = 'chat-history-transcript';
      const activeMessages = messages.filter((m) => !m.is_archived);
      if (activeMessages.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'chat-empty';
        empty.textContent = 'No messages in this chat.';
        transcript.appendChild(empty);
      } else {
        for (const msg of activeMessages) {
          const wrap = document.createElement('div');
          wrap.className = `chat-msg chat-msg-${msg.role}`;
          const label = document.createElement('span');
          label.className = 'chat-msg-label';
          label.textContent = msg.role === 'user' ? 'You' : 'Claude';
          const body = document.createElement('p');
          body.className = 'chat-msg-body';
          body.textContent = msg.content;
          wrap.append(label, body);
          transcript.appendChild(wrap);
        }
      }
      rightCol.appendChild(transcript);
    });
  }

  async function loadData() {
    [activeChats, archivedChatsList] = await Promise.all([
      window.revival.chats.listWithMeta(),
      window.revival.chats.listArchivedWithMeta(),
    ]);
    // Auto-select on initial load: prefer active drawer chat, then first chat
    // with messages, then just the first chat — so history is visible immediately.
    if (!selectedChatId) {
      const toSelect =
        activeChats.find((c) => c.id === activeChatId && c.last_message) ||
        activeChats.find((c) => c.last_message) ||
        activeChats[0];
      if (toSelect) selectedChatId = toSelect.id;
    }
    renderList();
    renderArchivedList();
    renderRight();
  }

  setActiveWorkspaceRefresh('Chat', loadData);
  loadData();
}

// --- Canon Bible (P31 read view + P32 create/edit/archive/delete) ---------
// First UI surface on top of the canon schema. The page lists active canon
// entries with provenance visible (origin_kind, origin_lock_code, origin
// session, legacy IDs, lock/provisional/status/certainty/review state) and
// a collapsed Retired section at the bottom that holds withdrawn entries.
//
// P32 adds the create/edit/archive/delete lifecycle directly on this page:
//   - "+ Add canon entry" button at the top opens an inline create form.
//     The form picks an entry_type first, then renders the type's detail
//     fields (from canon.typeConfig) alongside title, body, status,
//     certainty, review_state, and provisional. Drafts autosave to
//     localStorage so quitting mid-edit preserves the work.
//   - Each active card has an inline action row: Edit, Archive, Delete.
//     Edit swaps the card content for the same form (now bound to that
//     entry) without leaving the page. Archive flips retired=1 so the card
//     drops into the Retired section. Delete prompts for confirmation then
//     hard-deletes (ON DELETE CASCADE handles the detail row, legacy ids,
//     and relationships; the renderer also unlinks tags before the row goes).
//   - Each retired card has a Restore button (alongside Delete).
//
// CLAUDE.md says canon changes flow through Canon Review proposals. The
// Canon Review UI doesn't exist until P35; until then this direct path is
// the only way to bootstrap or correct canon. Lock/unlock (P33), supersede
// (P34), and the Canon Review queue (P35) are all separate phases.
//
// The P31 dev-seed button still appears solely when the canon is empty so
// the smoke test can prime data without typing.

const CANON_STATUS_OPTIONS = [
  'draft', 'speculative', 'implied', 'provisional', 'confirmed', 'retired', 'struck',
];
const CANON_CERTAINTY_OPTIONS = ['', 'low', 'medium', 'high'];
const CANON_CONFIDENCE_OPTIONS = ['', 'confirmed', 'probable', 'speculative'];
const CANON_REVIEW_STATE_OPTIONS = [
  '', 'placement_ready', 'needs_review', 'unresolved', 'deferred',
  're_confirmation_flagged', 'open_for_revision',
];

const CanonDrafts = makeDrafts('canon');

function formatCanonDetailValue(field, value) {
  if (value === null || value === undefined || value === '') return null;
  if (field.kind === 'boolean') return value ? 'yes' : 'no';
  return String(value);
}

// Build the read-only "Details" block beneath the body — the per-type
// columns surfaced as label: value pairs. Skips null/empty fields so the
// block stays compact on sparsely-populated entries.
function buildCanonDetailsBlock(typeConfig, entryType, detail) {
  const cfg = typeConfig && typeConfig[entryType];
  if (!cfg) return null;
  const rows = [];
  if (cfg.table && detail) {
    for (const f of cfg.fields) {
      const v = formatCanonDetailValue(f, detail[f.col]);
      if (v == null) continue;
      rows.push({ label: f.label, value: v, kind: f.kind });
    }
  }
  // cfg.note is form-time guidance only — suppressed in view mode so it
  // doesn't repeat on every card.
  if (rows.length === 0) return null;

  const block = document.createElement('div');
  block.className = 'canon-details';
  const heading = document.createElement('div');
  heading.className = 'canon-details-heading';
  heading.textContent = `${cfg.label || entryType} details`;
  block.appendChild(heading);
  for (const row of rows) {
    const r = document.createElement('div');
    r.className = 'canon-details-row';
    const k = document.createElement('span');
    k.className = 'canon-details-key';
    k.textContent = row.label;
    const v = document.createElement('span');
    v.className = 'canon-details-val';
    if (row.kind === 'textarea') v.classList.add('multiline');
    v.textContent = row.value;
    r.append(k, v);
    block.appendChild(r);
  }
  return block;
}

// One detail-field input. Returns { wrap, read } where read() pulls the
// current value back as a JS primitive (string, number, or boolean) ready
// to hand to canon.create/update.
function buildCanonDetailField(field, initial) {
  const wrap = document.createElement('div');
  wrap.className = 'canon-field';
  const label = document.createElement('label');
  label.className = 'canon-field-label';
  label.textContent = field.required ? `${field.label} *` : field.label;
  wrap.appendChild(label);

  let input;
  if (field.kind === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
    input.value = initial == null ? '' : String(initial);
  } else if (field.kind === 'select') {
    input = document.createElement('select');
    for (const opt of field.options || []) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt === '' ? '(none)' : opt;
      input.appendChild(o);
    }
    const initVal = initial != null ? String(initial) : (field.default != null ? String(field.default) : '');
    input.value = initVal;
  } else if (field.kind === 'boolean') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!initial;
  } else if (field.kind === 'number') {
    input = document.createElement('input');
    input.type = 'number';
    input.value = initial == null ? '' : String(initial);
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = initial == null ? '' : String(initial);
  }
  input.className = 'canon-field-input';
  label.appendChild(input);

  if (field.hint) {
    const h = document.createElement('div');
    h.className = 'canon-field-hint';
    h.textContent = field.hint;
    wrap.appendChild(h);
  }

  function read() {
    if (field.kind === 'boolean') return input.checked;
    if (field.kind === 'number') {
      const v = input.value.trim();
      if (v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    if (field.kind === 'select') return input.value === '' ? null : input.value;
    return input.value;
  }

  return { wrap, input, read };
}

// Shared form builder for both create and edit. `entry` is null for create
// (just the picked type) or the existing entry for edit (type already
// committed — picker is disabled). Calls onSubmit(payload) with the
// payload shape canon.create/canon.update expects. Autosaves to a draft
// slot ('new' or the entry id) on every input change.
function buildCanonForm({
  typeConfig,
  entry,            // null = create
  initialType,      // create only — preselects the type picker
  initialValues,    // P35 approve path — seeds title/body (and optional
                    //   status/certainty/review_state/provisional) in create
                    //   mode without locking the type picker. Ignored when
                    //   `entry` is passed.
  draftSlot,        // 'new' or `edit:${id}`, or null to disable autosave
  onSubmit,
  onCancel,
}) {
  const form = document.createElement('form');
  form.className = 'canon-form';
  const isEdit = !!entry;
  let currentType = isEdit ? entry.entry_type : (initialType || null);
  let detailFields = [];
  // initialValues only applies on the create path (no committed entry yet).
  const seed = !isEdit && initialValues ? initialValues : null;

  const err = document.createElement('p');
  err.className = 'form-error';

  // Type picker (locked on edit).
  const typeRow = document.createElement('div');
  typeRow.className = 'canon-field';
  const typeLabel = document.createElement('label');
  typeLabel.className = 'canon-field-label';
  typeLabel.textContent = 'Entry type *';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'canon-field-input';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— pick a type —';
  typeSelect.appendChild(placeholder);
  for (const key of Object.keys(typeConfig)) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = `${typeConfig[key].label} (${key})`;
    typeSelect.appendChild(o);
  }
  if (currentType) typeSelect.value = currentType;
  if (isEdit) typeSelect.disabled = true;
  typeLabel.appendChild(typeSelect);
  typeRow.appendChild(typeLabel);
  if (isEdit) {
    const h = document.createElement('div');
    h.className = 'canon-field-hint';
    h.textContent = 'Type is fixed once an entry exists. Use supersede (P34) to change shape.';
    typeRow.appendChild(h);
  }
  form.appendChild(typeRow);

  // Common fields.
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'Title';
  titleInput.className = 'canon-field-input';
  titleInput.maxLength = 200;
  titleInput.value = entry ? entry.title : (seed && seed.title != null ? seed.title : '');

  const titleWrap = document.createElement('div');
  titleWrap.className = 'canon-field';
  const titleLabel = document.createElement('label');
  titleLabel.className = 'canon-field-label';
  titleLabel.textContent = 'Title *';
  titleLabel.appendChild(titleInput);
  titleWrap.appendChild(titleLabel);
  form.appendChild(titleWrap);

  const bodyInput = document.createElement('textarea');
  bodyInput.rows = 4;
  bodyInput.placeholder = 'Summary / body (optional)';
  bodyInput.className = 'canon-field-input';
  bodyInput.value = entry && entry.body ? entry.body : (seed && seed.body != null ? seed.body : '');
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'canon-field';
  const bodyLabel = document.createElement('label');
  bodyLabel.className = 'canon-field-label';
  bodyLabel.textContent = 'Body';
  bodyLabel.appendChild(bodyInput);
  bodyWrap.appendChild(bodyLabel);
  form.appendChild(bodyWrap);

  // Status / certainty / review_state / provisional row.
  const statusRow = document.createElement('div');
  statusRow.className = 'canon-form-statusrow';

  function picker(label, options, current) {
    const w = document.createElement('label');
    w.className = 'canon-field canon-field-inline';
    const lbl = document.createElement('span');
    lbl.className = 'canon-field-label';
    lbl.textContent = label;
    const sel = document.createElement('select');
    sel.className = 'canon-field-input';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt === '' ? '(none)' : opt;
      sel.appendChild(o);
    }
    sel.value = current == null ? '' : String(current);
    w.append(lbl, sel);
    return { wrap: w, input: sel };
  }
  const statusPicker = picker(
    'Canon status',
    CANON_STATUS_OPTIONS,
    entry ? entry.canon_status : (seed && seed.canon_status) || 'draft'
  );
  const certaintyPicker = picker(
    'Certainty',
    CANON_CERTAINTY_OPTIONS,
    entry ? entry.certainty : (seed && seed.certainty) || ''
  );
  const confidencePicker = picker(
    'Confidence',
    CANON_CONFIDENCE_OPTIONS,
    entry ? entry.confidence : (seed && seed.confidence) || ''
  );
  const reviewPicker = picker(
    'Review state',
    CANON_REVIEW_STATE_OPTIONS,
    entry ? entry.review_state : (seed && seed.review_state) || ''
  );

  const provLabel = document.createElement('label');
  provLabel.className = 'canon-field canon-field-inline';
  const provSpan = document.createElement('span');
  provSpan.className = 'canon-field-label';
  provSpan.textContent = 'Provisional';
  const provInput = document.createElement('input');
  provInput.type = 'checkbox';
  provInput.checked = entry ? !!entry.provisional : !!(seed && seed.provisional);
  provLabel.append(provSpan, provInput);

  statusRow.append(statusPicker.wrap, certaintyPicker.wrap, confidencePicker.wrap, reviewPicker.wrap, provLabel);
  form.appendChild(statusRow);

  // Detail-field host — re-rendered when type changes (create path only).
  const detailHost = document.createElement('div');
  detailHost.className = 'canon-detail-fields';
  form.appendChild(detailHost);

  function readPayload() {
    const detail = {};
    for (const f of detailFields) detail[f.field.col] = f.read();
    return {
      entry_type: currentType,
      title: titleInput.value,
      body: bodyInput.value,
      canon_status: statusPicker.input.value || 'draft',
      certainty: certaintyPicker.input.value || null,
      confidence: confidencePicker.input.value || null,
      review_state: reviewPicker.input.value || null,
      provisional: provInput.checked,
      detail,
    };
  }

  function saveDraft() {
    if (!draftSlot) return;
    CanonDrafts.set(draftSlot, readPayload());
    setStatus(formStatus, isEdit
      ? 'Draft autosaved — click Save to finalize.'
      : 'Draft saved — click Save canon entry to finalize.');
  }

  function renderDetailFields(savedDetailValues) {
    detailHost.innerHTML = '';
    detailFields = [];
    if (!currentType) return;
    const cfg = typeConfig[currentType];
    if (!cfg) return;

    if (cfg.note) {
      const note = document.createElement('div');
      note.className = 'canon-field-note';
      note.textContent = cfg.note;
      detailHost.appendChild(note);
    }
    if (!cfg.table || cfg.fields.length === 0) return;

    const heading = document.createElement('div');
    heading.className = 'canon-details-heading';
    heading.textContent = `${cfg.label} fields`;
    detailHost.appendChild(heading);

    const seed = savedDetailValues || (entry && entry.detail) || {};
    for (const field of cfg.fields) {
      const initial = Object.prototype.hasOwnProperty.call(seed, field.col)
        ? seed[field.col]
        : undefined;
      const b = buildCanonDetailField(field, initial);
      detailHost.appendChild(b.wrap);
      const wired = { field, read: b.read, input: b.input };
      detailFields.push(wired);
      const evt = field.kind === 'boolean' || field.kind === 'select'
        ? 'change' : 'input';
      b.input.addEventListener(evt, saveDraft);
    }
  }

  // Restore draft if present. The draft seeds: type (create path),
  // common fields, and detail-field initial values.
  const draft = draftSlot ? CanonDrafts.get(draftSlot) : null;
  if (draft) {
    if (!isEdit && draft.entry_type) {
      currentType = draft.entry_type;
      typeSelect.value = draft.entry_type;
    }
    if (draft.title != null) titleInput.value = draft.title;
    if (draft.body != null) bodyInput.value = draft.body;
    if (draft.canon_status) statusPicker.input.value = draft.canon_status;
    if (draft.certainty !== undefined) certaintyPicker.input.value = draft.certainty || '';
    if (draft.confidence !== undefined) confidencePicker.input.value = draft.confidence || '';
    if (draft.review_state !== undefined) reviewPicker.input.value = draft.review_state || '';
    if (draft.provisional !== undefined) provInput.checked = !!draft.provisional;
  }
  renderDetailFields(draft ? draft.detail : null);

  typeSelect.addEventListener('change', () => {
    currentType = typeSelect.value || null;
    err.textContent = '';
    renderDetailFields(null);
    saveDraft();
  });
  for (const el of [titleInput, bodyInput]) {
    el.addEventListener('input', saveDraft);
  }
  for (const sel of [statusPicker.input, certaintyPicker.input, confidencePicker.input, reviewPicker.input]) {
    sel.addEventListener('change', saveDraft);
  }
  provInput.addEventListener('change', saveDraft);

  const actions = document.createElement('div');
  actions.className = 'tc-detail-actions';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = isEdit ? 'Save' : 'Save canon entry';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    if (draftSlot) CanonDrafts.clear(draftSlot);
    if (typeof onCancel === 'function') onCancel();
  });
  actions.append(saveBtn, cancelBtn);

  const formStatus = document.createElement('p');
  formStatus.className = 'draft-status';
  if (draft) {
    setStatus(formStatus, isEdit
      ? 'Unsaved draft restored — click Save to finalize.'
      : 'Unfinalized draft restored — click Save canon entry to finalize.');
  }

  form.append(actions, formStatus, err);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!currentType) {
      err.textContent = 'Pick an entry type before saving.';
      return;
    }
    if (titleInput.value.trim() === '') {
      err.textContent = 'Title is required.';
      return;
    }
    saveBtn.disabled = true;
    try {
      await onSubmit(readPayload());
      if (draftSlot) CanonDrafts.clear(draftSlot);
    } catch (e2) {
      err.textContent = e2.message || 'Could not save canon entry.';
      saveBtn.disabled = false;
    }
  });

  return form;
}

// View-mode card render. The action row at the bottom is built by the
// caller so it can wire the Edit button to flip the card into an in-place
// edit form, etc.
function buildCanonCard(
  e, typeConfig, onTagChange, actionsBuilder, chainHelper, tagReadOnly
) {
  const card = document.createElement('div');
  card.className = 'entry-card canon-card';
  card.dataset.canonId = String(e.id);
  if (e.locked) card.classList.add('canon-locked');
  if (e.retired) card.classList.add('canon-retired');

  // Header: type badge + title.
  const header = document.createElement('div');
  header.className = 'canon-card-header';
  const typeBadge = document.createElement('span');
  typeBadge.className = 'canon-type-badge';
  typeBadge.textContent = e.entry_type;
  header.appendChild(typeBadge);
  const title = document.createElement('span');
  title.className = 'entry-title';
  title.textContent = e.title;
  header.appendChild(title);
  card.appendChild(header);

  // P34 — supersede chain navigation. "Replaces" on an active row points back
  // to the retired prior version; "Replaced by" on a retired row points
  // forward to the active successor. chainHelper.lookup resolves the linked
  // entry's title (or null if it's not in this page's cache); chainHelper.goto
  // expands the Retired section if needed and scrolls the target into view.
  if (chainHelper) {
    function renderChainRow(prefix, targetId, hoverTitle) {
      const row = document.createElement('div');
      row.className = 'canon-chain';
      const label = document.createElement('span');
      label.className = 'canon-chain-label';
      label.textContent = prefix;
      row.appendChild(label);
      const linked = chainHelper.lookup(targetId);
      if (linked) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'canon-chain-link';
        btn.textContent = linked.title;
        btn.title = hoverTitle;
        btn.addEventListener('click', () => chainHelper.goto(targetId));
        row.appendChild(btn);
      } else {
        const missing = document.createElement('span');
        missing.className = 'canon-chain-missing';
        missing.textContent = `entry #${targetId} (not loaded)`;
        row.appendChild(missing);
      }
      card.appendChild(row);
    }
    if (e.replaces_entry_id) {
      renderChainRow(
        '← Replaces: ',
        e.replaces_entry_id,
        'Open the prior (retired) version'
      );
    }
    if (e.replaced_by_entry_id) {
      renderChainRow(
        'Replaced by → ',
        e.replaced_by_entry_id,
        'Open the current (active) version'
      );
    }
  }

  // PCANON-AFFECTED — collapsed read-only panel on retired entries listing
  // all Characters/Episodes/Decisions that were linked at time of retirement.
  if (e.retired) {
    const affected = document.createElement('details');
    affected.className = 'canon-affected';
    const affSummary = document.createElement('summary');
    affSummary.className = 'canon-affected-summary';
    affSummary.textContent = 'Affected by';
    affected.appendChild(affSummary);
    const affBody = document.createElement('div');
    affBody.className = 'canon-affected-body';
    affBody.textContent = 'Loading…';
    affected.appendChild(affBody);
    let affLoaded = false;
    affected.addEventListener('toggle', async () => {
      if (!affected.open || affLoaded) return;
      affLoaded = true;
      try {
        const items = await window.revival.canon.getAffectedBy(e.id);
        affBody.innerHTML = '';
        if (!items.length) {
          const empty = document.createElement('span');
          empty.className = 'canon-affected-empty';
          empty.textContent = 'No linked entries recorded at time of retirement.';
          affBody.appendChild(empty);
        } else {
          const byWs = {};
          for (const item of items) {
            if (!byWs[item.workspace]) byWs[item.workspace] = [];
            byWs[item.workspace].push(item);
          }
          for (const [ws, entries] of Object.entries(byWs)) {
            const group = document.createElement('div');
            group.className = 'canon-affected-group';
            const wsLabel = document.createElement('div');
            wsLabel.className = 'canon-affected-ws-label';
            wsLabel.textContent = ws;
            group.appendChild(wsLabel);
            for (const item of entries) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'canon-affected-link';
              btn.textContent = item.title;
              btn.title = `Go to ${ws} entry`;
              btn.addEventListener('click', () => route(ws, item.id));
              group.appendChild(btn);
            }
            affBody.appendChild(group);
          }
        }
      } catch (_err) {
        affBody.textContent = 'Could not load affected entries.';
      }
    });
    card.appendChild(affected);
  }

  if (e.body) {
    const body = document.createElement('div');
    body.className = 'entry-body';
    body.textContent = e.body;
    card.appendChild(body);
  }

  // P32 — typed detail fields below body.
  const details = buildCanonDetailsBlock(typeConfig, e.entry_type, e.detail);
  if (details) card.appendChild(details);

  // Status chips — lock/provisional/status/certainty/review_state.
  const chips = document.createElement('div');
  chips.className = 'canon-chips';
  const addChip = (label, cls) => {
    if (!label) return;
    const c = document.createElement('span');
    c.className = `canon-chip ${cls || ''}`.trim();
    c.textContent = label;
    chips.appendChild(c);
  };
  if (e.locked) {
    addChip(
      e.locked_label ? `🔒 locked · ${e.locked_label}` : '🔒 locked',
      'canon-chip-locked'
    );
  }
  if (e.retired) addChip('retired', 'canon-chip-retired');
  if (e.provisional) addChip('provisional', 'canon-chip-provisional');
  if (e.confidence) addChip(e.confidence, `canon-chip-confidence canon-chip-confidence-${e.confidence}`);
  if (e.canon_status) addChip(`status: ${e.canon_status}`);
  if (e.certainty) addChip(`certainty: ${e.certainty}`);
  if (e.review_state) addChip(`review: ${e.review_state}`);
  if (chips.children.length) card.appendChild(chips);

  // Legacy IDs (T/Q/A/CF/…) — primary first, then secondaries muted.
  if (e.legacy_ids && e.legacy_ids.length) {
    const ids = document.createElement('div');
    ids.className = 'canon-ids';
    const label = document.createElement('span');
    label.className = 'canon-ids-label';
    label.textContent = 'IDs:';
    ids.appendChild(label);
    for (const lid of e.legacy_ids) {
      const tag = document.createElement('span');
      tag.className = 'canon-idtag';
      if (!lid.isPrimary) tag.classList.add('canon-idtag-secondary');
      tag.textContent = lid.isPrimary ? lid.code : `${lid.code} (alt)`;
      ids.appendChild(tag);
    }
    card.appendChild(ids);
  }

  // Provenance — origin_kind / origin_lock_code / origin session. Always
  // shown for visibility; if a field is null we just omit that bit.
  const provBits = [];
  if (e.origin_kind) provBits.push(`origin: ${e.origin_kind}`);
  if (e.origin_lock_code) provBits.push(`lock code: ${e.origin_lock_code}`);
  if (e.origin_session_label) {
    const dt = e.origin_session_date ? ` (${e.origin_session_date})` : '';
    provBits.push(`session: ${e.origin_session_label}${dt}`);
  }
  if (provBits.length) {
    const prov = document.createElement('div');
    prov.className = 'canon-prov';
    prov.textContent = provBits.join(' · ');
    card.appendChild(prov);
  }

  // PCANON-AFFECTED — async source attribution: if this entry was created by
  // approving a Canon Review proposal from a workspace entry, render a
  // clickable "from [workspace] #X" back-link. canon.create() always writes
  // origin_kind='manual', so this info lives only in canon_proposals.
  {
    const CANON_SOURCE_KIND_TO_WS = {
      characters_workspace: 'Characters', characters: 'Characters',
      episodes_workspace: 'Episodes',     episodes: 'Episodes',
      decisions_workspace: 'Decisions',   decisions: 'Decisions',
      open_questions: 'Open Questions',   conflicts: 'Conflicts',
      brainstorm_items: 'Brainstorm',     brainstorm: 'Brainstorm',
      research_items: 'Research',         research: 'Research',
      unsorted: 'Unsorted',               source_material: 'Source Material',
      documents: 'Documents',             writing_lab: 'Writing Lab',
    };
    // Insert a placeholder; if the query returns nothing the element stays
    // hidden and takes no space.
    const attrEl = document.createElement('div');
    attrEl.className = 'canon-prov';
    attrEl.hidden = true;
    card.appendChild(attrEl);
    window.revival.canon.getSourceAttribution(e.id).then((attr) => {
      if (!attr) return;
      const ws = CANON_SOURCE_KIND_TO_WS[attr.source_kind];
      const label = CANON_SOURCE_KIND_TO_WS[attr.source_kind] || attr.source_kind.replace(/_/g, ' ');
      attrEl.textContent = 'from: ';
      if (ws) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'cr-source-link';
        link.textContent = `${label} #${attr.source_entry_id}`;
        link.title = `Go to source ${ws} entry`;
        link.addEventListener('click', () => route(ws, attr.source_entry_id));
        attrEl.appendChild(link);
      } else {
        attrEl.textContent += `${label} #${attr.source_entry_id}`;
      }
      attrEl.hidden = false;
    }).catch(() => {});
  }

  // Timestamps.
  const meta = document.createElement('div');
  meta.className = 'entry-meta';
  const created = new Date(e.created_at).toLocaleString();
  if (e.retired && e.retired_at) {
    meta.textContent = `created ${created} · retired ${new Date(e.retired_at).toLocaleString()}`;
  } else {
    meta.textContent = `created ${created} · updated ${new Date(e.updated_at).toLocaleString()}`;
  }
  card.appendChild(meta);

  // P32 — Edit / Archive / Delete (or Restore / Delete for retired).
  if (typeof actionsBuilder === 'function') {
    const actions = actionsBuilder(e, card);
    if (actions) card.appendChild(actions);
  } else {
    // PAUDIT-3 — Reference Mode: no edit actions, but still expose the popout trigger.
    const actions = document.createElement('div');
    actions.className = 'tc-detail-actions';
    const popoutBtn = document.createElement('button');
    popoutBtn.type = 'button';
    popoutBtn.className = 'btn-secondary';
    popoutBtn.textContent = 'Pop out ↗';
    popoutBtn.title = 'Open this entry in its own window';
    popoutBtn.addEventListener('click', () => {
      window.revival.popout.open('Canon Bible', e.id);
    });
    actions.appendChild(popoutBtn);
    card.appendChild(actions);
  }

  // PTAG — tag bar on canon cards. Available even on retired entries so the
  // user can adjust metadata without restoring first. PCBREF — in Reference
  // Mode the bar renders read-only (chips only, no add/remove affordances).
  if (window.RevivalTags) {
    window.RevivalTags.mountTagBar(card, 'canon_entries', e.id, {
      onChange: typeof onTagChange === 'function' ? onTagChange : undefined,
      readOnly: !!tagReadOnly,
    });
  }

  return card;
}

function renderCanonBiblePage(section) {
  section.classList.add('ws-canon');

  // Five-UI-questions intro: where am I / what is this for / what next /
  // where saved material goes / how to edit.
  const intro = document.createElement('div');
  intro.className = 'canon-intro';
  const lede = document.createElement('p');
  lede.innerHTML =
    '<strong>The locked reference version of canonical Revival truth.</strong>';
  intro.appendChild(lede);
  const sub = document.createElement('p');
  sub.className = 'placeholder';
  sub.textContent =
    'This page opens in read-only Reference Mode. Switch to Edit Mode ' +
    '(top right) to add, edit, supersede, lock, archive, or delete entries. ' +
    'Lock an entry to mark it as currently accepted Revival canon — edits to ' +
    'a locked entry are still allowed but prompt for confirmation first. ' +
    'Superseded entries move to the Retired section with a chain link to the ' +
    'new version.';
  intro.appendChild(sub);
  section.appendChild(intro);

  // + Add row + dev seed bar (the seed button only renders when canon is
  // empty so it doesn't clutter the page once real entries exist).
  const topBar = document.createElement('div');
  topBar.className = 'canon-topbar';
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-primary canon-add-btn';
  addBtn.textContent = '+ Add canon entry';
  topBar.appendChild(addBtn);
  const seedBar = document.createElement('span');
  seedBar.className = 'canon-seedbar';
  topBar.appendChild(seedBar);

  // PCONFLICT — Run conflict detection. Edit-Mode-only affordance. Sits next
  // to the dev-seed slot so all edit-mode tooling is grouped before the Edit
  // Mode toggle on the far right. Results render below in conflictsHost.
  const scanBtn = document.createElement('button');
  scanBtn.type = 'button';
  scanBtn.className = 'btn-secondary canon-conflict-btn';
  scanBtn.textContent = 'Run conflict detection';
  scanBtn.title =
    'Scan active canon entries for duplicate titles, duplicate primary legacy ids, and duplicate structural keys (season/episode numbers, decision codes, viral phase numbers).';
  topBar.appendChild(scanBtn);

  // PCBREF — Reference Mode / Edit Mode toggle, pinned top-right. The page
  // defaults to Reference Mode (read-only, no edit affordances, clean layout);
  // Edit Mode is a deliberate switch that reveals Add / Edit / Lock /
  // Supersede / Archive / Delete and editable tag bars. Mode is in-memory
  // per-render state, so a second window (or popout) tracks its own mode
  // independently — switching one never flips the other.
  let editMode = false;
  const modeToggle = document.createElement('button');
  modeToggle.type = 'button';
  modeToggle.className = 'btn-secondary canon-mode-toggle';
  topBar.appendChild(modeToggle);
  section.appendChild(topBar);

  const status = document.createElement('div');
  status.className = 'canon-status';
  status.style.display = 'none';
  section.appendChild(status);

  // Create-form host — fills with the inline form when addBtn is clicked,
  // otherwise empty.
  const createHost = document.createElement('div');
  createHost.className = 'canon-create-host';
  section.appendChild(createHost);

  // PCONFLICT — results host. Empty until "Run conflict detection" is clicked.
  // Cleared whenever Edit Mode is left so Reference Mode stays clean.
  const conflictsHost = document.createElement('div');
  conflictsHost.className = 'canon-conflicts-host';
  section.appendChild(conflictsHost);

  // P42 — Canon Search panel. Hidden when Edit Mode is active (via CSS).
  const canonSearchPanel = document.createElement('div');
  canonSearchPanel.className = 'canon-search-panel';

  const csLabel = document.createElement('div');
  csLabel.className = 'canon-search-label';
  csLabel.textContent = 'Ask the Canon';
  canonSearchPanel.appendChild(csLabel);

  const csForm = document.createElement('form');
  csForm.className = 'canon-search-form';

  const csInput = document.createElement('textarea');
  csInput.className = 'canon-search-input';
  csInput.placeholder = 'e.g. "What does Jordan know about the virus at S2E1?"';
  csInput.rows = 2;
  csForm.appendChild(csInput);

  const csAskBtn = document.createElement('button');
  csAskBtn.type = 'submit';
  csAskBtn.className = 'btn-primary canon-search-ask';
  csAskBtn.textContent = 'Ask';
  csForm.appendChild(csAskBtn);
  canonSearchPanel.appendChild(csForm);

  const csResultWrap = document.createElement('div');
  csResultWrap.hidden = true;
  canonSearchPanel.appendChild(csResultWrap);

  const csResult = document.createElement('div');
  csResult.className = 'canon-search-result';
  csResultWrap.appendChild(csResult);

  const csMeta = document.createElement('div');
  csMeta.className = 'canon-search-meta';
  csResultWrap.appendChild(csMeta);

  // PAI-WIRE — P42→P43: conflict check results area (populated on demand).
  const csConflictArea = document.createElement('div');
  csConflictArea.className = 'cr-conflict-area';
  csConflictArea.style.cssText = 'margin-top:8px;';
  csConflictArea.hidden = true;
  csResultWrap.appendChild(csConflictArea);

  section.appendChild(canonSearchPanel);

  csInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      csForm.requestSubmit();
    }
  });

  csForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = csInput.value.trim();
    if (!query) return;

    csAskBtn.disabled = true;
    csAskBtn.textContent = '…';
    csResultWrap.hidden = false;
    csResult.className = 'canon-search-result cs-thinking';
    csResult.textContent = 'Searching canon…';
    csMeta.innerHTML = '';
    csConflictArea.hidden = true;
    csConflictArea.innerHTML = '';

    try {
      const selectedModel = chatModelSelect.value || 'claude-sonnet-4-6';
      const result = await window.revival.claude.canonSearch(query, selectedModel);
      csResult.className = 'canon-search-result';
      csResult.textContent = result.text;

      const entryCount = result.entryCount || 0;
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'canon-search-clear';
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', () => {
        csResultWrap.hidden = true;
        csResult.textContent = '';
        csMeta.innerHTML = '';
        csConflictArea.hidden = true;
        csConflictArea.innerHTML = '';
        csInput.value = '';
        csInput.focus();
      });
      const countSpan = document.createElement('span');
      countSpan.textContent = `Searched ${entryCount} canon entr${entryCount === 1 ? 'y' : 'ies'}`;
      csMeta.appendChild(countSpan);
      csMeta.appendChild(clearBtn);

      // PAI-WIRE — P42→P43: conflict check button on canon search results.
      const ccBtn = document.createElement('button');
      ccBtn.type = 'button';
      ccBtn.className = 'canon-search-clear';
      ccBtn.textContent = 'Run conflict check';
      ccBtn.title = 'Check this content against locked canon entries for direct contradictions';
      csMeta.appendChild(ccBtn);

      ccBtn.addEventListener('click', async () => {
        ccBtn.disabled = true;
        ccBtn.textContent = 'Checking…';
        csConflictArea.hidden = false;
        csConflictArea.innerHTML = '';
        const checking = document.createElement('p');
        checking.className = 'cr-conflict-status';
        checking.textContent = 'Checking against locked canon entries…';
        csConflictArea.appendChild(checking);
        try {
          const ccModel = chatModelSelect.value || 'claude-sonnet-4-6';
          const ccRes = await window.revival.claude.conflictCheckText(
            { title: query, body: result.text },
            ccModel
          );
          csConflictArea.innerHTML = '';
          const ccSum = document.createElement('p');
          ccSum.className = 'cr-conflict-status';
          if (ccRes.skipped) {
            ccSum.textContent = 'No content to check.';
          } else if (ccRes.checkedCount === 0) {
            ccSum.textContent = 'No locked canon entries to check against.';
          } else if (ccRes.flags.length === 0) {
            ccSum.textContent =
              `No contradictions found (checked ${ccRes.checkedCount} locked entr${ccRes.checkedCount === 1 ? 'y' : 'ies'}).`;
          } else {
            ccSum.textContent =
              `${ccRes.flags.length} contradiction${ccRes.flags.length === 1 ? '' : 's'} flagged ` +
              `(checked ${ccRes.checkedCount} locked entr${ccRes.checkedCount === 1 ? 'y' : 'ies'}):`;
            csConflictArea.appendChild(ccSum);
            for (const f of ccRes.flags) {
              const flag = document.createElement('div');
              flag.className = 'cr-conflict-flag';
              const lbl = document.createElement('strong');
              lbl.textContent = `${f.tcode} — ${f.title}`;
              const rsn = document.createElement('p');
              rsn.className = 'cr-conflict-reason';
              rsn.textContent = f.reason;
              flag.append(lbl, rsn);
              csConflictArea.appendChild(flag);
            }
            return;
          }
          csConflictArea.appendChild(ccSum);
        } catch (ccErr) {
          csConflictArea.innerHTML = '';
          const errEl = document.createElement('p');
          errEl.className = 'cr-conflict-status';
          const cleanErr = (ccErr.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
          errEl.textContent = `Error: ${cleanErr || 'Conflict check failed.'}`;
          csConflictArea.appendChild(errEl);
        } finally {
          ccBtn.disabled = false;
          ccBtn.textContent = 'Run conflict check';
        }
      });
    } catch (err) {
      const rawMsg = err.message || 'Canon search failed';
      const cleanMsg = rawMsg.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
      csResult.className = 'canon-search-result cs-error';
      csResult.textContent = cleanMsg;
      csMeta.innerHTML = '';
    } finally {
      csAskBtn.disabled = false;
      csAskBtn.textContent = 'Ask';
    }
  });

  // PTAG filter bar.
  let tagFilter = new Set();
  let entriesCache = [];
  let retiredCache = [];
  let canonTagsById = {};
  let typeConfig = {};
  // PCONFLICT-2 — canon entry ids currently referenced by any open conflict
  // flag. Refreshed alongside the entry caches; mutation handlers check
  // membership and fire a toast nudging the user to re-run detection on
  // the Conflicts page so resolved flags get auto-archived.
  let flaggedEntryIds = new Set();
  function maybeFlagToast(id, verb) {
    const n = Number(id);
    if (!flaggedEntryIds.has(n)) {
      console.debug(
        `[PCONFLICT-2] ${verb} canon #${n}; flaggedEntryIds=[${Array.from(flaggedEntryIds).join(',')}] — no toast`
      );
      return;
    }
    console.debug(`[PCONFLICT-2] ${verb} canon #${n} → firing toast`);
    showFlagResolvedToast(
      `${verb} an entry that's part of an open conflict. Re-run detection on Conflicts to auto-archive if resolved.`
    );
  }
  // Per-entry edit-mode state: id -> true means render edit form, not card.
  const editing = new Set();
  // P34 — per-entry supersede-mode state. Same shape as `editing` but the
  // active card flips to a supersede form (clone old → save as new active row,
  // old auto-retires). Kept separate so a user can have one Edit and one
  // Supersede open without state collisions.
  const superseding = new Set();

  // PCBREF — apply the current Reference/Edit mode to the page. Reference Mode
  // hides every edit affordance (Add button, dev seed, any open create form)
  // and renders cards read-only; Edit Mode reveals them. Leaving Edit Mode
  // closes any in-progress create/edit/supersede forms so the read-only view
  // is clean — preserved drafts stay in localStorage and resurface via the
  // Resume buttons when Edit Mode is re-entered.
  function applyMode() {
    section.classList.toggle('canon-edit-mode', editMode);
    section.classList.toggle('canon-reference-mode', !editMode);
    modeToggle.textContent = editMode ? '✓ Done — Reference Mode' : '✎ Edit Mode';
    modeToggle.title = editMode
      ? 'Return to read-only Reference Mode'
      : 'Switch to Edit Mode to add, edit, lock, supersede, archive or delete entries';
    modeToggle.setAttribute('aria-pressed', editMode ? 'true' : 'false');
    addBtn.style.display = editMode ? '' : 'none';
    seedBar.style.display = editMode ? '' : 'none';
    scanBtn.style.display = editMode ? '' : 'none';
    retiredBulkBar.style.display = editMode ? '' : 'none';
    if (!editMode) {
      editing.clear();
      superseding.clear();
      createHost.innerHTML = '';
      conflictsHost.innerHTML = '';
      addBtn.disabled = false;
      scanBtn.disabled = false;
    }
  }

  // P35b — additional filter dimensions combinable with the tag filter via
  // AND. State lives here; the bar UI is (re)built by renderFilterBar().
  let filterEntryType = 'all';   // 'all' | one of the 18 entry_type keys
  let filterLock = 'all';        // 'all' | 'locked' | 'unlocked'
  let filterConfidence = '';     // '' | 'confirmed' | 'probable' | 'speculative'
  let filterCharacterId = '';    // '' | canon_entries.id (string) of a character
  let filterSeasonId = '';       // '' | canon_entries.id (string) of a season
  const filtersBar = document.createElement('div');
  filtersBar.className = 'canon-filters';
  section.appendChild(filtersBar);
  // Sub-host for the four selects + clear; rebuilt on every renderFilterBar().
  const filtersMain = document.createElement('div');
  filtersMain.className = 'canon-filters-main';
  filtersBar.appendChild(filtersMain);
  // Sub-host for the PTAG filter pills; mounted once and updated in place by
  // RevivalTags so renderFilterBar() never wipes the picker state.
  const filtersTagHost = document.createElement('div');
  filtersTagHost.className = 'canon-filters-tag';
  filtersBar.appendChild(filtersTagHost);

  if (window.RevivalTags) {
    const fc = window.RevivalTags.mountFilterBar(filtersTagHost, 'canon_entries', {
      onChange: (sel) => {
        tagFilter = sel;
        renderLists();
      },
    });
    tagFilter = fc.selected;
  }

  function renderFilterBar() {
    filtersMain.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'canon-filters-label';
    label.textContent = 'Filter:';
    filtersMain.appendChild(label);

    // Entry type — built from typeConfig once it has loaded.
    const typeSel = document.createElement('select');
    typeSel.className = 'canon-filter-select';
    typeSel.setAttribute('aria-label', 'Filter by entry type');
    const allTypeOpt = document.createElement('option');
    allTypeOpt.value = 'all';
    allTypeOpt.textContent = 'All types';
    typeSel.appendChild(allTypeOpt);
    const typeKeys = Object.keys(typeConfig).sort((a, b) =>
      (typeConfig[a].label || a).localeCompare(typeConfig[b].label || b)
    );
    for (const k of typeKeys) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = typeConfig[k].label || k;
      typeSel.appendChild(opt);
    }
    typeSel.value = filterEntryType;
    if (typeSel.value !== filterEntryType) {
      filterEntryType = 'all';
      typeSel.value = 'all';
    }
    typeSel.addEventListener('change', () => {
      filterEntryType = typeSel.value || 'all';
      renderFilterBar();
      renderLists();
    });
    filtersMain.appendChild(typeSel);

    // Lock status — three-state.
    const lockSel = document.createElement('select');
    lockSel.className = 'canon-filter-select';
    lockSel.setAttribute('aria-label', 'Filter by lock status');
    for (const [val, lbl] of [
      ['all', 'Any lock'],
      ['locked', 'Locked only'],
      ['unlocked', 'Unlocked only'],
    ]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = lbl;
      lockSel.appendChild(opt);
    }
    lockSel.value = filterLock;
    lockSel.addEventListener('change', () => {
      filterLock = lockSel.value || 'all';
      renderFilterBar();
      renderLists();
    });
    filtersMain.appendChild(lockSel);

    // Confidence — three values + any.
    const confSel = document.createElement('select');
    confSel.className = 'canon-filter-select';
    confSel.setAttribute('aria-label', 'Filter by confidence');
    for (const [val, lbl] of [
      ['', 'Any confidence'],
      ['confirmed', 'Confirmed'],
      ['probable', 'Probable'],
      ['speculative', 'Speculative'],
    ]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = lbl;
      confSel.appendChild(opt);
    }
    confSel.value = filterConfidence;
    confSel.addEventListener('change', () => {
      filterConfidence = confSel.value || '';
      renderFilterBar();
      renderLists();
    });
    filtersMain.appendChild(confSel);

    // Character — built from current character entries (active + retired).
    const charSel = document.createElement('select');
    charSel.className = 'canon-filter-select';
    charSel.setAttribute('aria-label', 'Filter by character');
    const allCharOpt = document.createElement('option');
    allCharOpt.value = '';
    allCharOpt.textContent = 'Any character';
    charSel.appendChild(allCharOpt);
    const chars = [...entriesCache, ...retiredCache]
      .filter((e) => e.entry_type === 'character')
      .sort((a, b) => a.title.localeCompare(b.title));
    for (const c of chars) {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      opt.textContent = c.title;
      charSel.appendChild(opt);
    }
    charSel.value = filterCharacterId;
    if (filterCharacterId && charSel.value !== filterCharacterId) {
      filterCharacterId = '';
      charSel.value = '';
    }
    charSel.addEventListener('change', () => {
      filterCharacterId = charSel.value || '';
      renderFilterBar();
      renderLists();
    });
    filtersMain.appendChild(charSel);

    // Season — built from current season entries, sorted by season_number.
    const seasonSel = document.createElement('select');
    seasonSel.className = 'canon-filter-select';
    seasonSel.setAttribute('aria-label', 'Filter by season');
    const allSeasonOpt = document.createElement('option');
    allSeasonOpt.value = '';
    allSeasonOpt.textContent = 'Any season';
    seasonSel.appendChild(allSeasonOpt);
    const seasons = [...entriesCache, ...retiredCache]
      .filter((e) => e.entry_type === 'season')
      .sort((a, b) => {
        const an = (a.detail && a.detail.season_number) ?? Infinity;
        const bn = (b.detail && b.detail.season_number) ?? Infinity;
        if (an !== bn) return an - bn;
        return a.title.localeCompare(b.title);
      });
    for (const s of seasons) {
      const opt = document.createElement('option');
      opt.value = String(s.id);
      const num = s.detail && s.detail.season_number;
      opt.textContent = num != null ? `S${num} — ${s.title}` : s.title;
      seasonSel.appendChild(opt);
    }
    seasonSel.value = filterSeasonId;
    if (filterSeasonId && seasonSel.value !== filterSeasonId) {
      filterSeasonId = '';
      seasonSel.value = '';
    }
    seasonSel.addEventListener('change', () => {
      filterSeasonId = seasonSel.value || '';
      renderFilterBar();
      renderLists();
    });
    filtersMain.appendChild(seasonSel);

    const activeDims =
      (filterEntryType !== 'all' ? 1 : 0) +
      (filterLock !== 'all' ? 1 : 0) +
      (filterConfidence ? 1 : 0) +
      (filterCharacterId ? 1 : 0) +
      (filterSeasonId ? 1 : 0);
    if (activeDims > 0) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'canon-filters-clear';
      clear.textContent = 'Clear filters';
      clear.addEventListener('click', () => {
        filterEntryType = 'all';
        filterLock = 'all';
        filterConfidence = '';
        filterCharacterId = '';
        filterSeasonId = '';
        renderFilterBar();
        renderLists();
      });
      filtersMain.appendChild(clear);

      const hint = document.createElement('span');
      hint.className = 'canon-filters-hint';
      hint.textContent =
        activeDims === 1
          ? '1 filter active.'
          : `${activeDims} filters active (AND).`;
      filtersMain.appendChild(hint);
    }
  }
  renderFilterBar();

  // Active entries.
  const activeHeader = document.createElement('h2');
  activeHeader.className = 'canon-section-header';
  activeHeader.textContent = 'Active';
  section.appendChild(activeHeader);

  const list = document.createElement('div');
  list.className = 'entry-list';
  section.appendChild(list);

  // Collapsed Retired section (collapsed-by-default, same pattern as Archive).
  const retired = document.createElement('details');
  retired.className = 'archived-section';
  const retiredSummary = document.createElement('summary');
  retired.appendChild(retiredSummary);

  // PPOL1: Bulk delete toolbar for Canon Bible retired section
  const retiredBulkBar = document.createElement('div');
  retiredBulkBar.className = 'tc-archive-bulk-bar';
  const retiredDeleteSelectedBtn = document.createElement('button');
  retiredDeleteSelectedBtn.type = 'button';
  retiredDeleteSelectedBtn.className = 'btn-danger btn-sm';
  retiredDeleteSelectedBtn.textContent = 'Delete Selected';
  retiredDeleteSelectedBtn.disabled = true;
  const retiredDeleteAllBtn = document.createElement('button');
  retiredDeleteAllBtn.type = 'button';
  retiredDeleteAllBtn.className = 'btn-danger btn-sm';
  retiredDeleteAllBtn.textContent = 'Delete All';
  retiredDeleteAllBtn.disabled = true;

  function renderRetiredBulkBar() {
    retiredBulkBar.innerHTML = '';
    retiredBulkBar.append(retiredDeleteSelectedBtn, retiredDeleteAllBtn);
  }
  renderRetiredBulkBar();

  function showRetiredBulkDeleteConfirm(getIds, label) {
    retiredBulkBar.innerHTML = '';
    const text = document.createElement('span');
    text.className = 'confirm-text';
    text.textContent = `Delete ${label}? This cannot be undone.`;
    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'btn-danger btn-sm';
    yesBtn.textContent = 'Delete';
    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'btn-secondary btn-sm';
    noBtn.textContent = 'Cancel';
    noBtn.addEventListener('click', renderRetiredBulkBar);
    yesBtn.addEventListener('click', async () => {
      yesBtn.disabled = true;
      noBtn.disabled = true;
      try {
        for (const id of getIds()) {
          await window.revival.canon.delete(id);
        }
        setStatus(status, 'Deleted retired entries.');
        await refresh();
      } catch (err) {
        setStatus(status, `Delete failed: ${err.message || err}`);
        renderRetiredBulkBar();
      }
    });
    retiredBulkBar.append(text, yesBtn, noBtn);
  }

  retiredDeleteSelectedBtn.addEventListener('click', () => {
    const ids = Array.from(retiredList.querySelectorAll('.tc-archive-check:checked'))
      .map((cb) => Number(cb.dataset.id));
    if (!ids.length) return;
    showRetiredBulkDeleteConfirm(
      () => Array.from(retiredList.querySelectorAll('.tc-archive-check:checked')).map((cb) => Number(cb.dataset.id)),
      `${ids.length} retired ${ids.length === 1 ? 'entry' : 'entries'}`
    );
  });

  retiredDeleteAllBtn.addEventListener('click', () => {
    const ids = Array.from(retiredList.querySelectorAll('.tc-archive-check'))
      .map((cb) => Number(cb.dataset.id));
    if (!ids.length) return;
    showRetiredBulkDeleteConfirm(
      () => Array.from(retiredList.querySelectorAll('.tc-archive-check')).map((cb) => Number(cb.dataset.id)),
      `all ${ids.length} retired ${ids.length === 1 ? 'entry' : 'entries'}`
    );
  });

  retired.appendChild(retiredBulkBar);

  const retiredList = document.createElement('div');
  retiredList.className = 'entry-list';
  retired.appendChild(retiredList);
  section.appendChild(retired);

  // P35b — precompute character/season expansion sets so matchesFilter stays
  // O(1) per entry. character: the chosen char + any entry whose typed detail
  // names that character_entry_id. season: the chosen season + its episodes +
  // any scene/line whose episode_entry_id resolves to one of those episodes.
  function computeFilterIndex() {
    const charMatchIds = new Set();
    if (filterCharacterId) {
      const cid = Number(filterCharacterId);
      charMatchIds.add(cid);
      for (const e of [...entriesCache, ...retiredCache]) {
        if (e.detail && Number(e.detail.character_entry_id) === cid) {
          charMatchIds.add(e.id);
        }
      }
    }
    const seasonMatchIds = new Set();
    if (filterSeasonId) {
      const sid = Number(filterSeasonId);
      seasonMatchIds.add(sid);
      const episodeIdsInSeason = new Set();
      const all = [...entriesCache, ...retiredCache];
      for (const e of all) {
        if (
          e.entry_type === 'episode' &&
          e.detail &&
          Number(e.detail.season_entry_id) === sid
        ) {
          episodeIdsInSeason.add(e.id);
          seasonMatchIds.add(e.id);
        }
      }
      for (const e of all) {
        if (
          e.detail &&
          e.detail.episode_entry_id != null &&
          episodeIdsInSeason.has(Number(e.detail.episode_entry_id))
        ) {
          seasonMatchIds.add(e.id);
        }
      }
    }
    return { charMatchIds, seasonMatchIds };
  }

  function matchesFilter(entry, idx) {
    if (tagFilter.size > 0) {
      const have = new Set((canonTagsById[entry.id] || []).map((t) => t.id));
      for (const id of tagFilter) if (!have.has(id)) return false;
    }
    if (filterEntryType !== 'all' && entry.entry_type !== filterEntryType) {
      return false;
    }
    if (filterLock === 'locked' && !entry.locked) return false;
    if (filterLock === 'unlocked' && entry.locked) return false;
    if (filterConfidence && entry.confidence !== filterConfidence) return false;
    if (filterCharacterId && !idx.charMatchIds.has(entry.id)) return false;
    if (filterSeasonId && !idx.seasonMatchIds.has(entry.id)) return false;
    return true;
  }

  // Build the inline action row for an active card.
  function activeActions(e) {
    const actions = document.createElement('div');
    actions.className = 'tc-detail-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-secondary';
    editBtn.textContent = CanonDrafts.get(`edit:${e.id}`) ? 'Resume editing' : 'Edit';
    editBtn.addEventListener('click', () => {
      // P33 — locked entries require a deliberate confirm before opening the
      // edit form. Resumed drafts skip the warning so reopening a draft
      // doesn't surprise the user.
      if (e.locked && !CanonDrafts.get(`edit:${e.id}`)) {
        showCanonLockedEditWarning(actions, e);
        return;
      }
      editing.add(e.id);
      renderLists();
    });
    actions.appendChild(editBtn);

    // P33 — Lock / Unlock toggle. Locking opens a small inline label form so
    // the user can attach an optional shorthand (e.g. "A-04"); unlocking is a
    // single click since it just clears the flag.
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'btn-secondary';
    lockBtn.textContent = e.locked ? 'Unlock' : 'Lock';
    lockBtn.addEventListener('click', async () => {
      if (e.locked) {
        lockBtn.disabled = true;
        try {
          await window.revival.canon.setLocked(e.id, { locked: false });
          setStatus(status, `Unlocked “${e.title}”.`);
          await refresh();
        } catch (err) {
          setStatus(status, `Unlock failed: ${err.message || err}`);
          lockBtn.disabled = false;
        }
      } else {
        showCanonLockForm(actions, e);
      }
    });
    actions.appendChild(lockBtn);

    // P34 — Supersede opens an inline form pre-filled with this entry's
    // values; saving creates a new active entry, retires this one, and wires
    // the chain pointers in both directions.
    const supersedeBtn = document.createElement('button');
    supersedeBtn.type = 'button';
    supersedeBtn.className = 'btn-secondary';
    supersedeBtn.textContent = CanonDrafts.get(`supersede:${e.id}`)
      ? 'Resume supersede'
      : 'Supersede';
    supersedeBtn.addEventListener('click', () => {
      superseding.add(e.id);
      // Editing and superseding the same row at the same time would be
      // confusing — close any open edit form for this entry first.
      editing.delete(e.id);
      renderLists();
    });
    actions.appendChild(supersedeBtn);

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn-secondary';
    archiveBtn.textContent = 'Archive';
    archiveBtn.addEventListener('click', async () => {
      archiveBtn.disabled = true;
      try {
        await window.revival.canon.archive(e.id);
        UndoStack.push({ type: 'canonArchive', id: e.id, title: e.title || '(untitled)' });
        setStatus(status, `Archived “${e.title}”.`);
        maybeFlagToast(e.id, 'Archived');
        await refresh();
      } catch (err) {
        setStatus(status, `Archive failed: ${err.message || err}`);
        archiveBtn.disabled = false;
      }
    });
    actions.appendChild(archiveBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      showCanonDeleteConfirm(actions, e);
    });
    actions.appendChild(deleteBtn);

    const popoutBtn = document.createElement('button');
    popoutBtn.type = 'button';
    popoutBtn.className = 'btn-secondary';
    popoutBtn.textContent = 'Pop out ↗';
    popoutBtn.title = 'Open this entry in its own window';
    popoutBtn.addEventListener('click', () => {
      window.revival.popout.open('Canon Bible', e.id);
    });
    actions.appendChild(popoutBtn);

    addHistoryAffordance(actions, e);

    return actions;
  }

  function retiredActions(e) {
    const actions = document.createElement('div');
    actions.className = 'tc-detail-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn-primary';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', async () => {
      restoreBtn.disabled = true;
      try {
        await window.revival.canon.restore(e.id);
        setStatus(status, `Restored “${e.title}”.`);
        await refresh();
      } catch (err) {
        setStatus(status, `Restore failed: ${err.message || err}`);
        restoreBtn.disabled = false;
      }
    });
    actions.appendChild(restoreBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      showCanonDeleteConfirm(actions, e);
    });
    actions.appendChild(deleteBtn);

    const retiredPopoutBtn = document.createElement('button');
    retiredPopoutBtn.type = 'button';
    retiredPopoutBtn.className = 'btn-secondary';
    retiredPopoutBtn.textContent = 'Pop out ↗';
    retiredPopoutBtn.title = 'Open this entry in its own window';
    retiredPopoutBtn.addEventListener('click', () => {
      window.revival.popout.open('Canon Bible', e.id);
    });
    actions.appendChild(retiredPopoutBtn);

    addHistoryAffordance(actions, e);

    return actions;
  }

  // PHIST — append a History button + inline panel to a card's action row.
  // Only shown when the entry has a chain neighbour in either direction;
  // entries that were never superseded skip the affordance so unsuperseded
  // cards stay clean.
  //
  // The panel is appended as a sibling of the action row inside the card and
  // toggled hidden/visible — first open fires canon.versionChain(e.id), then
  // the same chain is reused for every compare action until the card
  // re-renders. Two radio columns (Left / Right) pick versions; the diff table
  // below highlights any row where the two values differ. Field set:
  // title/body/canon_status/certainty/review_state/provisional/locked, plus
  // every detail-table column from typeConfig[e.entry_type] so the comparison
  // includes type-specific data (full_name, episode_code, …).
  function addHistoryAffordance(actions, e) {
    if (!e.replaces_entry_id && !e.replaced_by_entry_id) return;

    const panel = document.createElement('div');
    panel.className = 'canon-history';
    panel.hidden = true;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.textContent = 'History';
    let loaded = false;
    btn.addEventListener('click', async () => {
      if (panel.hidden) {
        panel.hidden = false;
        btn.textContent = 'Hide history';
        if (!loaded) {
          loaded = true;
          await loadHistoryInto(panel, e);
        }
      } else {
        panel.hidden = true;
        btn.textContent = 'History';
      }
    });
    actions.appendChild(btn);

    // Defer attaching the panel to the card until the action row itself is
    // attached. This keeps the panel directly below the actions row regardless
    // of where the card chooses to insert the actions block.
    queueMicrotask(() => {
      const card = actions.parentNode;
      if (!card) return;
      if (actions.nextSibling) {
        card.insertBefore(panel, actions.nextSibling);
      } else {
        card.appendChild(panel);
      }
    });
  }

  function fmtCanonHistoryDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); }
    catch { return iso; }
  }

  function canonHistoryState(version, isNewest) {
    if (version.retired) return 'retired';
    if (isNewest) return 'current';
    return 'active';
  }

  async function loadHistoryInto(panel, e) {
    panel.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'placeholder';
    loading.textContent = 'Loading history…';
    panel.appendChild(loading);

    let chain;
    try {
      chain = await window.revival.canon.versionChain(e.id);
    } catch (err) {
      panel.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'placeholder';
      msg.textContent = `Failed to load history: ${err.message || err}`;
      panel.appendChild(msg);
      return;
    }

    panel.innerHTML = '';
    if (!chain || chain.length < 2) {
      const msg = document.createElement('div');
      msg.className = 'placeholder';
      msg.textContent = 'No prior versions in chain.';
      panel.appendChild(msg);
      return;
    }

    const heading = document.createElement('div');
    heading.className = 'canon-history-heading';
    heading.textContent =
      `Version history — ${chain.length} versions, oldest → newest`;
    panel.appendChild(heading);

    // Default selection: previous version vs current. If `e` isn't the newest
    // version (e.g. user opened History from a retired row), default Right to
    // `e` and Left to whichever neighbour exists.
    const selfIdx = chain.findIndex((v) => v.id === e.id);
    let rightIdx = selfIdx >= 0 ? selfIdx : chain.length - 1;
    let leftIdx = rightIdx > 0 ? rightIdx - 1 : (rightIdx + 1 < chain.length ? rightIdx + 1 : rightIdx);

    const list = document.createElement('table');
    list.className = 'canon-history-list';
    const thead = list.createTHead();
    const headerRow = thead.insertRow();
    for (const t of ['L', 'R', 'Version', 'State', 'Date', 'Title']) {
      const th = document.createElement('th');
      th.textContent = t;
      headerRow.appendChild(th);
    }
    const tbody = list.createTBody();

    const leftName = `canon-history-left-${e.id}`;
    const rightName = `canon-history-right-${e.id}`;

    chain.forEach((v, i) => {
      const row = tbody.insertRow();
      if (v.id === e.id) row.classList.add('canon-history-self');

      const lc = row.insertCell();
      const lr = document.createElement('input');
      lr.type = 'radio'; lr.name = leftName;
      lr.checked = i === leftIdx;
      lr.setAttribute('aria-label', `Pick v${i + 1} as Left`);
      lr.addEventListener('change', () => {
        if (lr.checked) { leftIdx = i; renderDiff(); }
      });
      lc.appendChild(lr);

      const rc = row.insertCell();
      const rr = document.createElement('input');
      rr.type = 'radio'; rr.name = rightName;
      rr.checked = i === rightIdx;
      rr.setAttribute('aria-label', `Pick v${i + 1} as Right`);
      rr.addEventListener('change', () => {
        if (rr.checked) { rightIdx = i; renderDiff(); }
      });
      rc.appendChild(rr);

      row.insertCell().textContent = `v${i + 1}`;
      const stateCell = row.insertCell();
      const state = canonHistoryState(v, i === chain.length - 1);
      stateCell.textContent = state;
      stateCell.className = `canon-history-state canon-history-state-${state}`;
      row.insertCell().textContent =
        fmtCanonHistoryDate(v.retired_at || v.updated_at || v.created_at);
      row.insertCell().textContent = v.title;
    });
    panel.appendChild(list);

    const diffHost = document.createElement('div');
    diffHost.className = 'canon-history-diff';
    panel.appendChild(diffHost);

    function diffRows(entryType) {
      const rows = [
        { label: 'Title',         get: (v) => v.title },
        { label: 'Body',          get: (v) => v.body },
        { label: 'Status',        get: (v) => v.canon_status },
        { label: 'Certainty',     get: (v) => v.certainty },
        { label: 'Review state',  get: (v) => v.review_state },
        { label: 'Provisional',   get: (v) => v.provisional ? 'yes' : 'no' },
        { label: 'Locked',        get: (v) =>
            v.locked ? (v.locked_label ? `yes (${v.locked_label})` : 'yes') : 'no' },
      ];
      const cfg = typeConfig[entryType];
      if (cfg && Array.isArray(cfg.fields)) {
        for (const f of cfg.fields) {
          rows.push({
            label: f.label || f.col,
            get: (v) => (v.detail && v.detail[f.col] != null
              ? String(v.detail[f.col]) : ''),
          });
        }
      }
      return rows;
    }

    function fmtCell(val) {
      if (val == null) return '—';
      const s = String(val);
      return s === '' ? '—' : s;
    }

    function renderDiff() {
      diffHost.innerHTML = '';
      if (leftIdx === rightIdx) {
        const msg = document.createElement('div');
        msg.className = 'placeholder';
        msg.textContent = 'Select two different versions to compare.';
        diffHost.appendChild(msg);
        return;
      }
      const left = chain[leftIdx];
      const right = chain[rightIdx];

      const sub = document.createElement('div');
      sub.className = 'canon-history-diff-heading';
      sub.textContent = `Compare v${leftIdx + 1} ↔ v${rightIdx + 1}`;
      diffHost.appendChild(sub);

      const table = document.createElement('table');
      table.className = 'canon-history-diff-table';
      const dthead = table.createTHead();
      const dh = dthead.insertRow();
      for (const t of ['Field', `v${leftIdx + 1}`, `v${rightIdx + 1}`]) {
        const th = document.createElement('th');
        th.textContent = t;
        dh.appendChild(th);
      }
      const dbody = table.createTBody();

      // Use the entry_type of the right (newer-side) version; supersede keeps
      // entry_type stable across the chain so either is fine, but defending
      // against a hypothetical mismatch by preferring the side the user is
      // most likely thinking of as "now".
      const rows = diffRows(right.entry_type);
      for (const r of rows) {
        const lv = r.get(left);
        const rv = r.get(right);
        const changed = (lv == null ? '' : String(lv)) !== (rv == null ? '' : String(rv));
        const tr = dbody.insertRow();
        if (changed) tr.classList.add('canon-history-diff-changed');
        const labelCell = tr.insertCell();
        labelCell.className = 'canon-history-diff-label';
        labelCell.textContent = r.label;
        if (changed) {
          const mark = document.createElement('span');
          mark.className = 'canon-history-diff-mark';
          mark.textContent = ' ⚠';
          labelCell.appendChild(mark);
        }
        const lCell = tr.insertCell();
        lCell.className = 'canon-history-diff-val';
        lCell.textContent = fmtCell(lv);
        const rCell = tr.insertCell();
        rCell.className = 'canon-history-diff-val';
        rCell.textContent = fmtCell(rv);
      }
      diffHost.appendChild(table);
    }

    renderDiff();
  }

  // P33 — locked entries are editable but require a deliberate confirm before
  // the form opens, so accidental clicks on a locked entry don't slip into
  // edit mode. Resumed drafts skip this gate (handled in activeActions).
  function showCanonLockedEditWarning(actionsRow, e) {
    const warnRow = document.createElement('div');
    warnRow.className = 'tc-detail-actions confirm-row';

    const prompt = document.createElement('span');
    prompt.className = 'confirm-text';
    prompt.textContent =
      `🔒 “${e.title}” is locked — currently accepted Revival canon. ` +
      'Editing will update the locked record. Continue?';

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn-primary';
    yes.textContent = 'Continue editing';
    yes.addEventListener('click', () => {
      editing.add(e.id);
      renderLists();
    });

    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-secondary';
    no.textContent = 'Cancel';
    no.addEventListener('click', () => warnRow.replaceWith(actionsRow));

    warnRow.append(prompt, yes, no);
    actionsRow.replaceWith(warnRow);
  }

  // P33 — Lock form. The label field is optional shorthand stored on
  // canon_entries.locked_label (e.g. "A-04", "S1 standing lock") and shown
  // next to the 🔒 chip on the card. Empty input = no label.
  function showCanonLockForm(actionsRow, e) {
    const row = document.createElement('div');
    row.className = 'tc-detail-actions confirm-row';

    const prompt = document.createElement('span');
    prompt.className = 'confirm-text';
    prompt.textContent = `Lock “${e.title}” as currently accepted canon.`;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'canon-field-input';
    labelInput.placeholder = 'Optional label (e.g. A-04)';
    labelInput.maxLength = 120;

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn-primary';
    yes.textContent = 'Lock';
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      try {
        await window.revival.canon.setLocked(e.id, {
          locked: true,
          locked_label: labelInput.value,
        });
        setStatus(status, `Locked “${e.title}”.`);
        await refresh();
      } catch (err) {
        prompt.textContent = err.message || 'Could not lock entry.';
        yes.disabled = false;
      }
    });

    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-secondary';
    no.textContent = 'Cancel';
    no.addEventListener('click', () => row.replaceWith(actionsRow));

    row.append(prompt, labelInput, yes, no);
    actionsRow.replaceWith(row);
    labelInput.focus();
  }

  function showCanonDeleteConfirm(actionsRow, e) {
    const confirmRow = document.createElement('div');
    confirmRow.className = 'tc-detail-actions confirm-row';

    const prompt = document.createElement('span');
    prompt.className = 'confirm-text';
    prompt.textContent = `Delete “${e.title}”? This is a hard delete — the canon entry and its detail row, legacy IDs, and relationships will be removed. This cannot be undone.`;

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn-danger';
    yes.textContent = 'Delete';
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      try {
        await window.revival.canon.delete(e.id);
        CanonDrafts.clear(`edit:${e.id}`);
        editing.delete(e.id);
        setStatus(status, `Deleted “${e.title}”.`);
        maybeFlagToast(e.id, 'Deleted');
        await refresh();
      } catch (err) {
        prompt.textContent = err.message || 'Could not delete entry.';
        yes.disabled = false;
      }
    });

    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-secondary';
    no.textContent = 'Cancel';
    no.addEventListener('click', () => confirmRow.replaceWith(actionsRow));

    confirmRow.append(prompt, yes, no);
    actionsRow.replaceWith(confirmRow);
  }

  // PCANON-DIFF — show a before/after diff of the changed fields and require
  // the user to confirm before the update is persisted. Only rows whose value
  // actually changed are shown; "no changes" is surfaced as a note instead of
  // an empty table so the user always knows why the modal appeared.
  function showCanonSaveConfirm(before, after) {
    return new Promise((resolve) => {
      const overlay  = document.getElementById('canon-diff-overlay');
      const titleEl  = document.getElementById('canon-diff-title');
      const body     = document.getElementById('canon-diff-body');
      const cancelBtn  = document.getElementById('canon-diff-cancel');
      const confirmBtn = document.getElementById('canon-diff-confirm');

      titleEl.textContent = `Confirm edits — "${before.title}"`;
      body.innerHTML = '';

      const rows = [
        { label: 'Title',        get: (v) => v.title },
        { label: 'Body',         get: (v) => v.body },
        { label: 'Status',       get: (v) => v.canon_status },
        { label: 'Certainty',    get: (v) => v.certainty },
        { label: 'Confidence',   get: (v) => v.confidence },
        { label: 'Review state', get: (v) => v.review_state },
        { label: 'Provisional',  get: (v) => v.provisional ? 'yes' : 'no' },
      ];
      const cfg = typeConfig[before.entry_type];
      if (cfg && Array.isArray(cfg.fields)) {
        for (const f of cfg.fields) {
          rows.push({
            label: f.label || f.col,
            get: (v) => (v.detail && v.detail[f.col] != null ? String(v.detail[f.col]) : ''),
          });
        }
      }

      function fmt(val) {
        if (val == null) return '—';
        const s = String(val);
        return s === '' ? '—' : s;
      }

      const changed = rows.filter((r) => {
        const bv = r.get(before);
        const av = r.get(after);
        return fmt(bv) !== fmt(av);
      });

      if (changed.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'canon-diff-no-changes';
        msg.textContent = 'No changes detected.';
        body.appendChild(msg);
      } else {
        const table = document.createElement('table');
        table.className = 'canon-history-diff-table';
        const thead = table.createTHead();
        const hr = thead.insertRow();
        for (const t of ['Field', 'Before', 'After']) {
          const th = document.createElement('th');
          th.textContent = t;
          hr.appendChild(th);
        }
        const tbody = table.createTBody();
        for (const r of changed) {
          const bv = r.get(before);
          const av = r.get(after);
          const tr = tbody.insertRow();
          tr.classList.add('canon-history-diff-changed');
          const lc = tr.insertCell();
          lc.className = 'canon-history-diff-label';
          lc.textContent = r.label;
          const mark = document.createElement('span');
          mark.className = 'canon-history-diff-mark';
          mark.textContent = ' ⚠';
          lc.appendChild(mark);
          const bc = tr.insertCell();
          bc.className = 'canon-history-diff-val';
          bc.textContent = fmt(bv);
          const ac = tr.insertCell();
          ac.className = 'canon-history-diff-val';
          ac.textContent = fmt(av);
        }
        body.appendChild(table);
      }

      function cleanup(result) {
        overlay.hidden = true;
        cancelBtn.removeEventListener('click', onCancel);
        confirmBtn.removeEventListener('click', onConfirm);
        overlay.removeEventListener('click', onOverlayClick);
        document.removeEventListener('keydown', onKeyDown);
        resolve(result);
      }

      function onCancel() { cleanup(false); }
      function onConfirm() { cleanup(true); }
      function onOverlayClick(ev) { if (ev.target === overlay) cleanup(false); }
      function onKeyDown(ev) { if (ev.key === 'Escape') cleanup(false); }

      cancelBtn.addEventListener('click', onCancel);
      confirmBtn.addEventListener('click', onConfirm);
      overlay.addEventListener('click', onOverlayClick);
      document.addEventListener('keydown', onKeyDown);
      overlay.hidden = false;
      confirmBtn.focus();
    });
  }

  function makeEditCard(e) {
    const wrap = document.createElement('div');
    wrap.className = 'entry-card canon-card canon-edit-card';
    const heading = document.createElement('div');
    heading.className = 'canon-card-header';
    const badge = document.createElement('span');
    badge.className = 'canon-type-badge';
    badge.textContent = e.entry_type;
    heading.appendChild(badge);
    const title = document.createElement('span');
    title.className = 'entry-title';
    title.textContent = `Editing: ${e.title}`;
    heading.appendChild(title);
    wrap.appendChild(heading);

    const form = buildCanonForm({
      typeConfig,
      entry: e,
      draftSlot: `edit:${e.id}`,
      onSubmit: async (payload) => {
        const confirmed = await showCanonSaveConfirm(e, payload);
        if (!confirmed) return;
        await window.revival.canon.update(e.id, {
          title: payload.title,
          body: payload.body,
          canon_status: payload.canon_status,
          certainty: payload.certainty,
          confidence: payload.confidence,
          review_state: payload.review_state,
          provisional: payload.provisional,
          detail: payload.detail,
        });
        editing.delete(e.id);
        setStatus(status, `Saved “${payload.title}”.`);
        maybeFlagToast(e.id, 'Edited');
        await refresh();
      },
      onCancel: () => {
        editing.delete(e.id);
        renderLists();
      },
    });
    wrap.appendChild(form);
    return wrap;
  }

  // P34 — supersede form. Same shape as the edit form (pre-filled from the
  // current row) but onSubmit calls canon.supersede instead of canon.update.
  // The new active entry inherits everything except lock state and chain
  // pointers; the old entry retires automatically with chain pointers wired.
  //
  // Detail-table UNIQUE columns (canon_seasons.season_number,
  // canon_locked_decisions.code) are pre-cleared so the user can't
  // accidentally collide with the row they're superseding — the form's
  // required-field validation then prompts for a fresh value.
  const SUPERSEDE_CLEARED_DETAIL_FIELDS = {
    season: ['season_number'],
    locked_decision: ['code'],
  };
  function makeSupersedeCard(e) {
    const wrap = document.createElement('div');
    wrap.className = 'entry-card canon-card canon-supersede-card';
    const heading = document.createElement('div');
    heading.className = 'canon-card-header';
    const badge = document.createElement('span');
    badge.className = 'canon-type-badge';
    badge.textContent = e.entry_type;
    heading.appendChild(badge);
    const title = document.createElement('span');
    title.className = 'entry-title';
    title.textContent = `Superseding: ${e.title}`;
    heading.appendChild(title);
    wrap.appendChild(heading);

    const cleared = SUPERSEDE_CLEARED_DETAIL_FIELDS[e.entry_type] || [];
    const explain = document.createElement('p');
    explain.className = 'canon-supersede-explain';
    explain.textContent =
      'Saving creates a new active entry with these values and retires the ' +
      'current one. Legacy IDs migrate to the new entry; the retired entry ' +
      'keeps copies so historical code lookups still resolve.' +
      (cleared.length
        ? ` The ${cleared.join(', ')} field${cleared.length === 1 ? ' is' : 's are'} ` +
          'cleared — supply a fresh value, the old one stays on the retired entry.'
        : '');
    wrap.appendChild(explain);

    // Clone the entry with the UNIQUE detail fields blanked so the prefilled
    // form doesn't reuse them. Original entry untouched.
    const seedEntry = { ...e };
    if (cleared.length && e.detail) {
      seedEntry.detail = { ...e.detail };
      for (const col of cleared) seedEntry.detail[col] = null;
    }

    const form = buildCanonForm({
      typeConfig,
      entry: seedEntry,
      draftSlot: `supersede:${e.id}`,
      onSubmit: async (payload) => {
        const result = await window.revival.canon.supersede(e.id, {
          title: payload.title,
          body: payload.body,
          canon_status: payload.canon_status,
          certainty: payload.certainty,
          confidence: payload.confidence,
          review_state: payload.review_state,
          provisional: payload.provisional,
          detail: payload.detail,
        });
        superseding.delete(e.id);
        setStatus(
          status,
          `Superseded “${e.title}” → “${result.title}”. Prior version moved to Retired.`
        );
        maybeFlagToast(e.id, 'Superseded');
        await refresh();
      },
      onCancel: () => {
        superseding.delete(e.id);
        renderLists();
      },
    });
    wrap.appendChild(form);
    return wrap;
  }

  // P34 — chain navigation helper. lookup resolves an id to a minimal record
  // (or null if it isn't in either cache); goto expands the Retired section
  // if the target lives there and scrolls the matching card into view with a
  // brief highlight so the eye can find it.
  const chainHelper = {
    lookup: (targetId) => {
      const all = [...entriesCache, ...retiredCache];
      const found = all.find((x) => x.id === targetId);
      if (!found) return null;
      return {
        id: found.id,
        title: found.title,
        retired: found.retired === 1,
      };
    },
    goto: (targetId) => {
      const linked = chainHelper.lookup(targetId);
      if (linked && linked.retired) retired.open = true;
      // Defer the scroll so layout settles after opening <details>.
      requestAnimationFrame(() => {
        const card = section.querySelector(
          `[data-canon-id="${targetId}"]`
        );
        if (!card) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('canon-chain-flash');
        setTimeout(() => card.classList.remove('canon-chain-flash'), 1500);
      });
    },
  };

  function renderLists() {
    const idx = computeFilterIndex();
    const filteredActive = entriesCache.filter((e) => matchesFilter(e, idx));
    const filteredRetired = retiredCache.filter((e) => matchesFilter(e, idx));

    list.innerHTML = '';
    if (entriesCache.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'placeholder';
      empty.textContent = editMode
        ? 'No canon entries yet. Click “+ Add canon entry” above to add one.'
        : 'No canon entries yet. Switch to Edit Mode (top right) to add one.';
      list.appendChild(empty);
    } else if (filteredActive.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'placeholder';
      empty.textContent = 'No active entries match the current filters.';
      list.appendChild(empty);
    } else {
      for (const e of filteredActive) {
        if (editMode && superseding.has(e.id)) {
          list.appendChild(makeSupersedeCard(e));
        } else if (editMode && editing.has(e.id)) {
          list.appendChild(makeEditCard(e));
        } else {
          // PCBREF — Reference Mode: no action row, read-only tag bar.
          const card = buildCanonCard(
            e,
            typeConfig,
            editMode ? onCanonTagChange : undefined,
            editMode ? activeActions : null,
            chainHelper,
            !editMode
          );
          // PFLAN-EXPAND — Flanagan Filter (full five modes) on canon entries in Edit Mode.
          if (editMode) {
            const cbFfCallbacks = {};
            mountFlanaganFilter(card, e, cbFfCallbacks, {
              entityKind: 'canon_entries',
              workspaceName: 'Canon Bible',
            });
            const { refresh: cbFfRefresh } = mountFlanaganHistory(
              card, e, false, cbFfCallbacks, 'canon_entries'
            );
            cbFfCallbacks.refreshHistory = cbFfRefresh;
            // PLOCKED-SPECIFICS — all locked specifics on canon entries in Edit Mode.
            mountLockedSpecificsPanel(card);
          }
          list.appendChild(card);
        }
      }
    }

    retiredSummary.textContent = `Retired (${filteredRetired.length})`;
    retiredList.innerHTML = '';
    // PPOL1: Reset bulk bar and update button states
    renderRetiredBulkBar();
    retiredDeleteSelectedBtn.disabled = true;
    retiredDeleteSelectedBtn.textContent = 'Delete Selected';
    retiredDeleteAllBtn.disabled = filteredRetired.length === 0;
    if (retiredCache.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'placeholder';
      empty.textContent = 'No retired entries.';
      retiredList.appendChild(empty);
    } else if (filteredRetired.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'placeholder';
      empty.textContent = 'No retired entries match the current filters.';
      retiredList.appendChild(empty);
    } else {
      for (const e of filteredRetired) {
        const row = document.createElement('div');
        row.className = 'tc-archived-row tc-archived-row--canon';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'tc-archive-check';
        cb.dataset.id = e.id;
        cb.addEventListener('change', () => {
          const n = retiredList.querySelectorAll('.tc-archive-check:checked').length;
          retiredDeleteSelectedBtn.disabled = n === 0;
          retiredDeleteSelectedBtn.textContent = n > 0 ? `Delete Selected (${n})` : 'Delete Selected';
        });
        row.append(cb, buildCanonCard(
          e,
          typeConfig,
          editMode ? onCanonTagChange : undefined,
          editMode ? retiredActions : null,
          chainHelper,
          !editMode
        ));
        retiredList.appendChild(row);
      }
    }
  }

  function openCreateForm() {
    if (createHost.firstChild) return;
    addBtn.disabled = true;
    const form = buildCanonForm({
      typeConfig,
      entry: null,
      initialType: null,
      draftSlot: 'new',
      onSubmit: async (payload) => {
        await window.revival.canon.create(payload);
        createHost.innerHTML = '';
        addBtn.disabled = false;
        setStatus(status, `Added “${payload.title}”.`);
        await refresh();
      },
      onCancel: () => {
        createHost.innerHTML = '';
        addBtn.disabled = false;
      },
    });
    const wrap = document.createElement('div');
    wrap.className = 'entry-card canon-card canon-create-card';
    const heading = document.createElement('div');
    heading.className = 'canon-card-header';
    const title = document.createElement('span');
    title.className = 'entry-title';
    title.textContent = 'New canon entry';
    heading.appendChild(title);
    wrap.appendChild(heading);
    wrap.appendChild(form);
    createHost.appendChild(wrap);
  }

  addBtn.addEventListener('click', openCreateForm);

  // PCONFLICT — render the conflict-scan results panel into conflictsHost.
  // PCONFLICT-2 (auto-route): every detected group is already routed to the
  // Conflicts workspace (or matched to an existing open row) by the time we
  // render — each card just shows its routed row number. No per-card Route
  // button anymore; the click of "Run conflict detection" is the route
  // confirmation for the whole batch.
  function renderConflictResults(data) {
    conflictsHost.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'canon-conflicts-panel';

    const header = document.createElement('div');
    header.className = 'canon-conflicts-header';

    const heading = document.createElement('div');
    heading.className = 'canon-conflicts-heading';
    const n = data.conflicts.length;
    heading.textContent =
      n === 0
        ? `No conflicts detected across ${data.totalActiveEntries} active entries.`
        : `${n} potential conflict${n === 1 ? '' : 's'} across ${data.totalActiveEntries} active entries.`;
    header.appendChild(heading);

    // PCONFLICT auto-archive notice — only present when scan() resolved one
    // or more previously-routed Conflicts rows. Shown above the cards so the
    // user knows what changed without having to visit the Conflicts workspace.
    const autoArchived = Array.isArray(data.autoArchived) ? data.autoArchived : [];
    if (autoArchived.length) {
      const archivedNote = document.createElement('div');
      archivedNote.className = 'canon-conflicts-autoarchived';
      const m = autoArchived.length;
      const titles = autoArchived.map((a) => a.title).join(' · ');
      archivedNote.textContent =
        `Auto-archived ${m} resolved conflict${m === 1 ? '' : 's'} in Conflicts: ${titles}`;
      header.appendChild(archivedNote);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'canon-conflicts-close';
    closeBtn.setAttribute('aria-label', 'Close conflict results');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      conflictsHost.innerHTML = '';
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    if (n === 0) {
      const empty = document.createElement('p');
      empty.className = 'placeholder canon-conflicts-empty';
      empty.textContent =
        'Looked for duplicate titles within an entry type, duplicate primary legacy ids, and duplicate structural keys. Nothing collides.';
      panel.appendChild(empty);
      conflictsHost.appendChild(panel);
      return;
    }

    const intro = document.createElement('p');
    intro.className = 'placeholder canon-conflicts-intro';
    intro.textContent =
      'Each group below shares a value that should be unique. Every group is tracked as a Conflicts entry (linked below) — resolve by superseding or editing one of the entries, then re-run detection to auto-archive cleared rows.';
    panel.appendChild(intro);

    data.conflicts.forEach((c, idx) => {
      const card = document.createElement('div');
      card.className = 'canon-conflict-card';

      const cardHeader = document.createElement('div');
      cardHeader.className = 'canon-conflict-card-header';
      const kindBadge = document.createElement('span');
      kindBadge.className = `canon-conflict-kind kind-${c.kind}`;
      kindBadge.textContent = c.kind.replace(/_/g, ' ');
      cardHeader.appendChild(kindBadge);
      const labelEl = document.createElement('span');
      labelEl.className = 'canon-conflict-label';
      labelEl.textContent = c.label;
      cardHeader.appendChild(labelEl);
      card.appendChild(cardHeader);

      if (c.detail) {
        const detailEl = document.createElement('div');
        detailEl.className = 'canon-conflict-detail';
        detailEl.textContent = c.detail;
        card.appendChild(detailEl);
      }

      const entriesList = document.createElement('ul');
      entriesList.className = 'canon-conflict-entries';
      for (const e of c.entries) {
        const li = document.createElement('li');
        const id = document.createElement('span');
        id.className = 'canon-conflict-entry-id';
        id.textContent = `#${e.id}`;
        li.appendChild(id);
        const title = document.createElement('span');
        title.className = 'canon-conflict-entry-title';
        title.textContent = ` ${e.title}`;
        li.appendChild(title);
        const meta = document.createElement('span');
        meta.className = 'canon-conflict-entry-meta';
        const bits = [e.entry_type];
        if (e.canon_status) bits.push(e.canon_status);
        if (e.locked) bits.push('locked');
        meta.textContent = ` — ${bits.join(' · ')}`;
        li.appendChild(meta);
        entriesList.appendChild(li);
      }
      card.appendChild(entriesList);

      // PCONFLICT-2 (auto-route) — every group already has a Conflicts row
      // by the time we render. Two passive labels:
      //   - "Routed → Conflicts #N (new)" for rows created by this scan
      //   - "Already in Conflicts #N" for rows that already existed open
      // The action row stays so the visual rhythm matches the old layout.
      const actions = document.createElement('div');
      actions.className = 'canon-conflict-actions';
      const routedNote = document.createElement('span');
      routedNote.className = 'canon-conflict-routed';
      if (c.routedRowId) {
        const isNew = Array.isArray(data.routedNew)
          ? data.routedNew.some((r) => r.id === c.routedRowId)
          : false;
        routedNote.textContent = isNew
          ? `Routed → Conflicts #${c.routedRowId} (new)`
          : `Already in Conflicts #${c.routedRowId}`;
      } else {
        routedNote.textContent = 'Not yet routed.';
      }
      actions.appendChild(routedNote);
      card.appendChild(actions);

      panel.appendChild(card);
    });

    conflictsHost.appendChild(panel);
  }

  scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    const prevLabel = scanBtn.textContent;
    scanBtn.textContent = 'Scanning…';
    try {
      // PCONFLICT-2 (auto-route) — scanAndRoute() detects, auto-routes new
      // groups (dedup by signature), and auto-archives resolved ones in one
      // round-trip. We re-fetch the flagged-id set so the Canon Bible toast
      // is accurate without waiting for the next refresh().
      const data = await window.revival.canonConflicts.scanAndRoute();
      renderConflictResults(data);
      try {
        const ids = await window.revival.canonConflicts.openFlagEntryIds();
        flaggedEntryIds = new Set((ids || []).map((n) => Number(n)));
      } catch {
        /* non-fatal; toast set updates on next refresh() */
      }
      const n = data.conflicts.length;
      const newCount = Array.isArray(data.routedNew) ? data.routedNew.length : 0;
      const trackedCount = Array.isArray(data.alreadyTracked)
        ? data.alreadyTracked.length
        : 0;
      const archivedCount = Array.isArray(data.autoArchived)
        ? data.autoArchived.length
        : 0;
      const parts = [];
      if (n === 0) parts.push('No collisions found.');
      else parts.push(`${n} conflict${n === 1 ? '' : 's'} found`);
      if (newCount) parts.push(`${newCount} newly routed`);
      if (trackedCount) parts.push(`${trackedCount} already tracked`);
      if (archivedCount)
        parts.push(`${archivedCount} auto-archived`);
      setStatus(status, `Conflict scan: ${parts.join(' · ')}.`);
    } catch (err) {
      setStatus(status, `Conflict scan failed: ${err.message || err}`);
    } finally {
      scanBtn.textContent = prevLabel;
      scanBtn.disabled = false;
    }
  });

  // PCBREF — toggle Reference ⇄ Edit Mode. renderLists() reads editMode to
  // decide whether cards get action rows + editable tag bars.
  modeToggle.addEventListener('click', () => {
    editMode = !editMode;
    applyMode();
    if (editMode && CanonDrafts.get('new')) openCreateForm();
    renderLists();
  });
  applyMode();

  // If a "new" draft was preserved from a prior session, surface the create
  // form on mount so the user can resume — but only once the user opts into
  // Edit Mode (handled in the toggle handler above), since the page opens
  // read-only.

  async function reloadCanonTags() {
    if (!window.RevivalTags) return;
    const allIds = [
      ...entriesCache.map((e) => e.id),
      ...retiredCache.map((e) => e.id),
    ];
    try {
      canonTagsById = await window.revival.tags.bulkListFor(
        'canon_entries',
        allIds
      );
    } catch {
      canonTagsById = {};
    }
  }

  async function onCanonTagChange() {
    await reloadCanonTags();
    if (tagFilter.size > 0) renderLists();
  }

  async function refresh() {
    const [entries, retiredEntries, cfg, flaggedIds] = await Promise.all([
      window.revival.canon.list(),
      window.revival.canon.listRetired(),
      typeConfig && Object.keys(typeConfig).length
        ? Promise.resolve(typeConfig)
        : window.revival.canon.typeConfig(),
      // PCONFLICT-2 — refresh the set of canon ids referenced by open
      // conflict flags so mutation handlers can fire a re-run reminder
      // toast when one of those entries is touched. Best-effort: log
      // failures so a missing IPC handler (e.g. main.js not restarted
      // after a build) doesn't silently disable the nudge.
      (window.revival.canonConflicts.openFlagEntryIds
        ? window.revival.canonConflicts.openFlagEntryIds().catch((err) => {
            console.warn('[PCONFLICT-2] openFlagEntryIds failed:', err);
            return [];
          })
        : Promise.resolve(
            (console.warn('[PCONFLICT-2] openFlagEntryIds IPC missing — restart Electron after pulling main.js/preload.js changes.'), [])
          )),
    ]);
    entriesCache = entries;
    retiredCache = retiredEntries;
    typeConfig = cfg;
    flaggedEntryIds = new Set((flaggedIds || []).map((n) => Number(n)));
    await reloadCanonTags();

    // Dev seed button: visible iff canon is completely empty.
    seedBar.innerHTML = '';
    if (entries.length === 0 && retiredEntries.length === 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary';
      btn.textContent = 'Seed sample entries (dev)';
      btn.title =
        'Inserts a few sample canon entries with provenance for the P31 smoke test. One-shot — vanishes once any entries exist.';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const res = await window.revival.canon.devSeed();
          setStatus(
            status,
            res.inserted > 0
              ? `Seeded ${res.inserted} sample entries.`
              : 'Already seeded — no changes.'
          );
        } catch (err) {
          setStatus(status, `Seed failed: ${err.message || err}`);
        }
        await refresh();
      });
      seedBar.appendChild(btn);
    }

    renderFilterBar();
    renderLists();

    // PPOL2b-26 — consume a pending deep-link from global search so the page
    // scrolls to (and flashes) the matched canon entry.
    if (pendingEntrySelection && pendingEntrySelection.workspace === 'Canon Bible') {
      const targetId = pendingEntrySelection.id;
      pendingEntrySelection = null;
      chainHelper.goto(targetId);
    }
  }

  refresh();
}

// --- Canon Review (P35) -----------------------------------------------------
// The review queue. Two-column layout: left = proposal list with status
// badges and a status filter; right = the proposed content (editable in
// place) plus the verb buttons (Approve / Send Back / Defer / Reject /
// Delete / Pop out). Deferred proposals live in a collapsed section at the
// bottom of the left column, matching Canon Bible's Retired pattern.
//
// CLAUDE.md routing: all canon writes flow through this queue. Approve is
// the only verb that touches canon_entries (via canonProposals.approve →
// canon.create); the others only stamp the proposal row.

const CR_STATUS_LABELS = {
  pending: 'Pending',
  sent_back: 'Sent back',
  deferred: 'Deferred',
};
// Filter chip set + the order they render in. "active" surfaces pending +
// sent_back together (the actionable queue); deferred is its own bucket
// because it collapses to the bottom section by default.
const CR_FILTERS = [
  { key: 'active',    label: 'Active (pending + sent back)' },
  { key: 'pending',   label: 'Pending only' },
  { key: 'sent_back', label: 'Sent back only' },
  { key: 'deferred',  label: 'Deferred only' },
];

// Reused by the popout. Mounted onto a host element, builds the queue
// surface against a Drafts namespace so edit/approve drafts survive restart.
const CanonReviewDrafts = makeDrafts('canon_review');

function shortenForList(text, limit = 80) {
  if (text == null) return '';
  const oneLine = String(text).replace(/\s+/g, ' ').trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine;
}

const SOURCE_KIND_LABELS = {
  writing_lab: 'Writing Lab',
  characters_workspace: 'Characters',
  episodes_workspace: 'Episodes',
  decisions_workspace: 'Decisions',
  highlight_extract: 'Highlight extract',
  worldbuilding_import: 'Worldbuilding import',
  characters: 'Characters',
  episodes: 'Episodes',
};
function sourceKindLabel(kind) {
  return SOURCE_KIND_LABELS[kind] || kind.replace(/_/g, ' ');
}

function renderCanonReviewPage(section, workspaceName) {
  section.classList.add('ws-canon-review');

  // Where am I / what / what next / where saved / how to edit.
  const intro = document.createElement('div');
  intro.className = 'canon-intro';
  const lede = document.createElement('p');
  lede.innerHTML =
    '<strong>The approval queue for every proposed change to Canon Bible.</strong>';
  intro.appendChild(lede);
  const sub = document.createElement('p');
  sub.className = 'placeholder';
  sub.textContent =
    'Edit a proposal in place, then Approve it (writes to Canon Bible), ' +
    'Send it back for revision, Defer it to the collapsed bottom section, ' +
    'Reject it (keeps an audit trail), or Delete it. Proposals arrive here ' +
    'from the highlight + extract route in any workspace.';
  intro.appendChild(sub);
  section.appendChild(intro);

  // Two-column shell — same primitives as the entry workspaces.
  const layout = document.createElement('div');
  layout.className = 'tc-layout';
  const leftCol = document.createElement('div');
  leftCol.className = 'tc-left';
  const rightCol = document.createElement('div');
  rightCol.className = 'tc-right';
  layout.append(leftCol, rightCol);
  section.appendChild(layout);

  // Status filter — single-select. Defaults to "active" so the queue opens
  // on the actionable items; deferred appears in its own collapsed section.
  const filterBar = document.createElement('div');
  filterBar.className = 'cr-filter';
  const filterLabel = document.createElement('span');
  filterLabel.className = 'cr-filter-label';
  filterLabel.textContent = 'Status:';
  const filterSelect = document.createElement('select');
  filterSelect.className = 'cr-filter-select';
  for (const f of CR_FILTERS) {
    const opt = document.createElement('option');
    opt.value = f.key;
    opt.textContent = f.label;
    filterSelect.appendChild(opt);
  }
  let filter = 'active';
  filterSelect.value = filter;
  filterSelect.addEventListener('change', () => {
    filter = filterSelect.value;
    renderList();
  });

  // PImp2: Entry-type filter — "All types" + one option per distinct type
  // found in proposals' proposed_fields.entry_type. Rebuilt in renderList.
  const typeFilterLabel = document.createElement('span');
  typeFilterLabel.className = 'cr-filter-label';
  typeFilterLabel.style.marginLeft = '10px';
  typeFilterLabel.textContent = 'Type:';
  const typeFilterSelect = document.createElement('select');
  typeFilterSelect.className = 'cr-filter-select';
  let typeFilter = '';
  typeFilterSelect.addEventListener('change', () => {
    typeFilter = typeFilterSelect.value;
    renderList();
  });

  filterBar.append(filterLabel, filterSelect, typeFilterLabel, typeFilterSelect);
  leftCol.appendChild(filterBar);

  // PImp2: Bulk-actions bar — defer or approve all proposals of a given type.
  // Rebuilt by renderList whenever proposals or filter changes.
  const bulkBar = document.createElement('div');
  bulkBar.className = 'cr-bulk-bar';
  bulkBar.style.display = 'none';
  leftCol.appendChild(bulkBar);

  const list = document.createElement('div');
  list.className = 'tc-list';
  leftCol.appendChild(list);

  // Deferred bottom section — only mounted when filter==='active', so a
  // direct "Deferred only" filter doesn't double-render deferred items.
  const deferred = document.createElement('details');
  deferred.className = 'tc-archived-section';
  const deferredSummary = document.createElement('summary');
  deferred.appendChild(deferredSummary);
  const deferredList = document.createElement('div');
  deferredList.className = 'tc-list';
  deferred.appendChild(deferredList);
  leftCol.appendChild(deferred);

  // selectedId: null = empty state; <id> = view/edit/approve.
  let selectedId = null;
  let proposals = [];

  function findProposal(id) {
    return proposals.find((p) => p.id === id) || null;
  }

  function statusBadge(status) {
    const b = document.createElement('span');
    b.className = `cr-badge cr-badge-${status}`;
    b.textContent = CR_STATUS_LABELS[status] || status;
    return b;
  }

  function buildListItem(p) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tc-list-item';
    if (selectedId === p.id) btn.classList.add('active');

    const titleRow = document.createElement('div');
    titleRow.className = 'tc-list-title';
    titleRow.appendChild(statusBadge(p.status));
    if (CanonReviewDrafts.get(`edit:${p.id}`) || CanonReviewDrafts.get(`approve:${p.id}`)) {
      const draftBadge = document.createElement('span');
      draftBadge.className = 'tc-list-badge';
      draftBadge.textContent = 'Draft';
      titleRow.appendChild(draftBadge);
    }
    const proposedTitle =
      (p.proposed_fields && p.proposed_fields.title) || '(untitled proposal)';
    titleRow.appendChild(document.createTextNode(proposedTitle));
    btn.appendChild(titleRow);

    const pv = shortenForList(p.proposed_fields && p.proposed_fields.body);
    if (pv) {
      const preview = document.createElement('div');
      preview.className = 'tc-list-preview';
      preview.textContent = pv;
      btn.appendChild(preview);
    }
    if (p.source_kind) {
      const src = document.createElement('div');
      src.className = 'tc-list-preview cr-list-source';
      src.textContent = `from ${sourceKindLabel(p.source_kind)}`;
      btn.appendChild(src);
    }

    // PSTALE: age marker for proposals pending longer than canonReviewDays.
    if (p.status === 'pending' && p.created_at) {
      const threshold = getNeedsThresholds().canonReviewDays;
      const age = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
      if (age >= threshold) {
        const staleEl = document.createElement('span');
        staleEl.className = 'tc-list-stale';
        staleEl.textContent = `${age}d`;
        staleEl.title = `Pending for ${age} days`;
        btn.appendChild(staleEl);
      }
    }

    btn.addEventListener('click', () => {
      selectedId = p.id;
      renderList();
      renderDetail();
    });
    return btn;
  }

  function getProposalType(p) {
    return (p.proposed_fields && p.proposed_fields.entry_type) || '';
  }

  function rebuildTypeFilter(visibleProposals) {
    const prev = typeFilterSelect.value;
    typeFilterSelect.innerHTML = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All types';
    typeFilterSelect.appendChild(all);
    const types = [...new Set(visibleProposals.map(getProposalType).filter(Boolean))].sort();
    for (const t of types) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t.replace(/_/g, ' ');
      typeFilterSelect.appendChild(opt);
    }
    // Restore selection if still valid; otherwise reset to "all"
    if (types.includes(prev)) {
      typeFilterSelect.value = prev;
    } else {
      typeFilter = '';
      typeFilterSelect.value = '';
    }
  }

  // PImp2: Rebuild the bulk-actions bar from the currently-active (main) proposals.
  // Groups by entry_type and shows Defer-all / Approve-all per group.
  function rebuildBulkBar(mainProposals) {
    bulkBar.innerHTML = '';
    // Only show when there are proposals and at least some have a typed entry_type
    const typed = mainProposals.filter((p) => getProposalType(p));
    if (typed.length === 0) {
      bulkBar.style.display = 'none';
      return;
    }
    // Group by type
    const groups = {};
    for (const p of typed) {
      const t = getProposalType(p);
      if (!groups[t]) groups[t] = [];
      groups[t].push(p);
    }
    const sortedTypes = Object.keys(groups).sort();
    if (sortedTypes.length === 0) {
      bulkBar.style.display = 'none';
      return;
    }

    bulkBar.style.display = '';
    const label = document.createElement('span');
    label.className = 'cr-filter-label';
    label.textContent = 'Bulk:';
    bulkBar.appendChild(label);

    for (const t of sortedTypes) {
      const grp = groups[t];
      const label = t.replace(/_/g, ' ');

      // Defer-all button
      const deferAllBtn = document.createElement('button');
      deferAllBtn.type = 'button';
      deferAllBtn.className = 'btn-secondary btn-sm cr-bulk-btn';
      deferAllBtn.textContent = `Defer all ${label} (${grp.length})`;
      deferAllBtn.addEventListener('click', () => {
        showBulkConfirm(bulkBar, {
          message: `Defer all ${grp.length} "${label}" proposal${grp.length !== 1 ? 's' : ''}?`,
          confirmLabel: 'Defer all',
          danger: false,
          run: async () => {
            for (const p of grp) {
              await window.revival.canonProposals.defer(p.id, {});
            }
            if (grp.some((p) => p.id === selectedId)) selectedId = null;
            await loadList();
          },
        });
      });
      bulkBar.appendChild(deferAllBtn);

      // Approve-all button — only for proposals that have an entry_type set
      // so the bulk approve can skip the type-picker form.
      const approveAllBtn = document.createElement('button');
      approveAllBtn.type = 'button';
      approveAllBtn.className = 'btn-primary btn-sm cr-bulk-btn';
      approveAllBtn.textContent = `Approve all ${label} (${grp.length})`;
      approveAllBtn.addEventListener('click', () => {
        showBulkConfirm(bulkBar, {
          message:
            `Approve all ${grp.length} "${label}" proposal${grp.length !== 1 ? 's' : ''}? ` +
            `Each becomes a Canon Bible entry (type: ${label}, status: draft). ` +
            'This cannot be undone.',
          confirmLabel: `Approve ${grp.length}`,
          danger: false,
          run: async () => {
            for (const p of grp) {
              const fields = p.proposed_fields || {};
              await window.revival.canonProposals.approve(p.id, {
                entry_type: fields.entry_type,
                title: fields.title || '(untitled)',
                body: fields.body || '',
                canon_status: 'draft',
              });
            }
            if (grp.some((p) => p.id === selectedId)) selectedId = null;
            await loadList();
          },
        });
      });
      bulkBar.appendChild(approveAllBtn);
    }
  }

  // Inline confirm for bulk actions — replaces the bulkBar content temporarily.
  function showBulkConfirm(host, { message, confirmLabel, danger, run }) {
    const saved = host.innerHTML;
    host.innerHTML = '';

    const msg = document.createElement('span');
    msg.className = 'confirm-text';
    msg.style.cssText = 'font-size:0.85em;flex:1;';
    msg.textContent = message;

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = danger ? 'btn-danger btn-sm' : 'btn-primary btn-sm';
    yes.textContent = confirmLabel;
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      no.disabled = true;
      try {
        await run();
      } catch (err) {
        msg.textContent = `Error: ${err.message || err}`;
        yes.disabled = false;
        no.disabled = false;
      }
    });

    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-secondary btn-sm';
    no.textContent = 'Cancel';
    no.addEventListener('click', () => {
      host.innerHTML = saved;
      // Re-attach listeners by triggering a re-render of the bulk bar
      rebuildBulkBar(
        proposals.filter((p) => {
          if (filter === 'active')    return p.status === 'pending' || p.status === 'sent_back';
          if (filter === 'pending')   return p.status === 'pending';
          if (filter === 'sent_back') return p.status === 'sent_back';
          if (filter === 'deferred')  return p.status === 'deferred';
          return true;
        }).filter((p) => !typeFilter || getProposalType(p) === typeFilter)
      );
    });

    host.append(msg, yes, no);
  }

  function renderList() {
    list.innerHTML = '';
    deferredList.innerHTML = '';

    // PPOL2b-06 — when filter is 'deferred', show items in the deferred section
    // (not the main list). showDeferredSection = true for both 'active' and
    // 'deferred' so the collapsed section is always visible for those filters.
    const showDeferredSection = filter === 'active' || filter === 'deferred';
    const statusFiltered = proposals.filter((p) => {
      if (filter === 'active')    return p.status === 'pending' || p.status === 'sent_back';
      if (filter === 'pending')   return p.status === 'pending';
      if (filter === 'sent_back') return p.status === 'sent_back';
      if (filter === 'deferred')  return false; // deferred items go to the section, not main list
      return true;
    });

    // Rebuild type filter from status-filtered set so only relevant types appear
    rebuildTypeFilter(statusFiltered);

    const main = typeFilter
      ? statusFiltered.filter((p) => getProposalType(p) === typeFilter)
      : statusFiltered;

    // Rebuild bulk bar from the full status-filtered set (not type-filtered)
    rebuildBulkBar(statusFiltered);

    const deferredItems = showDeferredSection
      ? proposals.filter((p) => p.status === 'deferred')
      : [];

    if (main.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tc-list-empty';
      if (proposals.length === 0) {
        empty.textContent =
          'No proposals in the queue yet. Highlight text anywhere and route ' +
          'it to Canon Review to stage one.';
      } else if (filter === 'deferred') {
        empty.textContent = 'Deferred proposals appear in the section below.';
      } else {
        empty.textContent = 'No proposals match this filter.';
      }
      list.appendChild(empty);
    } else {
      for (const p of main) list.appendChild(buildListItem(p));
    }

    deferred.style.display = showDeferredSection ? '' : 'none';
    deferredSummary.textContent = `Deferred (${deferredItems.length})`;
    if (showDeferredSection) {
      if (deferredItems.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'tc-list-empty';
        empty.textContent = 'No deferred proposals.';
        deferredList.appendChild(empty);
      } else {
        for (const p of deferredItems) deferredList.appendChild(buildListItem(p));
      }
    }
  }

  // --- Right panel renderers -------------------------------------------------

  function showEmpty() {
    rightCol.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tc-empty';
    const t = document.createElement('div');
    t.className = 'tc-empty-title';
    t.textContent = 'Nothing selected';
    const h = document.createElement('div');
    h.className = 'tc-empty-hint';
    h.textContent =
      proposals.length === 0
        ? 'Highlight text in any workspace and choose Canon Review to stage a proposal.'
        : 'Pick a proposal on the left to review it.';
    wrap.append(t, h);
    rightCol.appendChild(wrap);
  }

  // Inline confirm with an optional note input. Used for Send Back / Defer /
  // Reject — each shares the same shape (reason field + commit/cancel), only
  // the verb and the storage call differ.
  function showNoteConfirm(actions, { verb, danger, prompt, placeholder, run }) {
    const row = document.createElement('div');
    row.className = 'tc-detail-actions confirm-row cr-note-row';
    const promptEl = document.createElement('div');
    promptEl.className = 'confirm-text';
    promptEl.textContent = prompt;
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'canon-field-input';
    noteInput.maxLength = 500;
    noteInput.placeholder = placeholder || 'Optional note for the audit trail';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = danger ? 'btn-danger' : 'btn-primary';
    yes.textContent = verb;
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      try {
        await run(noteInput.value);
      } catch (err) {
        promptEl.textContent = err.message || `Could not ${verb.toLowerCase()}.`;
        yes.disabled = false;
      }
    });
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-secondary';
    no.textContent = 'Cancel';
    no.addEventListener('click', () => row.replaceWith(actions));
    row.append(promptEl, noteInput, yes, no);
    actions.replaceWith(row);
    noteInput.focus();
  }

  function showDeleteConfirm(actions, p) {
    const row = document.createElement('div');
    row.className = 'tc-detail-actions confirm-row';
    const promptEl = document.createElement('span');
    promptEl.className = 'confirm-text';
    promptEl.textContent =
      'Delete this proposal? This is a hard delete — the audit trail goes ' +
      'too. Use Reject instead if you want to keep a record.';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn-danger';
    yes.textContent = 'Delete';
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      try {
        await window.revival.canonProposals.delete(p.id);
        CanonReviewDrafts.clear(`edit:${p.id}`);
        CanonReviewDrafts.clear(`approve:${p.id}`);
        selectedId = null;
        await loadList();
      } catch (err) {
        promptEl.textContent = err.message || 'Could not delete proposal.';
        yes.disabled = false;
      }
    });
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-secondary';
    no.textContent = 'Cancel';
    no.addEventListener('click', () => row.replaceWith(actions));
    row.append(promptEl, yes, no);
    actions.replaceWith(row);
  }

  // The default right-panel state: editable title + body + proposer note,
  // plus the verb buttons. Saving the edits writes through updateFields and
  // refreshes the list. Approve flips the right column to the type/detail
  // form (see showApprove).
  function showReview(p) {
    rightCol.innerHTML = '';

    // Approve drafts are kept separate from edit drafts so a half-filled
    // approve form doesn't trample the simpler title/body edit draft.
    const editDraft = CanonReviewDrafts.get(`edit:${p.id}`);
    const initialTitle =
      editDraft && editDraft.title != null
        ? editDraft.title
        : (p.proposed_fields.title || '');
    const initialBody =
      editDraft && editDraft.body != null
        ? editDraft.body
        : (p.proposed_fields.body || '');
    const initialNote =
      editDraft && editDraft.proposer_note != null
        ? editDraft.proposer_note
        : (p.proposer_note || '');

    const header = document.createElement('h2');
    header.className = 'tc-detail-header';
    header.textContent = initialTitle || '(untitled proposal)';
    rightCol.appendChild(header);

    const meta = document.createElement('div');
    meta.className = 'tc-detail-meta';
    const chunks = [
      `Status: ${CR_STATUS_LABELS[p.status] || p.status}`,
      `Intent: ${p.proposal_intent}`,
      `Staged ${new Date(p.created_at).toLocaleString()}`,
    ];
    if (p.updated_at && p.updated_at !== p.created_at) {
      chunks.push(`edited ${new Date(p.updated_at).toLocaleString()}`);
    }
    if (p.reviewed_at && (p.status === 'sent_back' || p.status === 'deferred')) {
      chunks.push(`${p.status === 'sent_back' ? 'Sent back' : 'Deferred'} ${new Date(p.reviewed_at).toLocaleString()}`);
    }
    // PAUDIT-5 — source attribution: clickable back-link when source is a navigable entry.
    const CR_SOURCE_KIND_TO_WORKSPACE = {
      writing_lab: 'Writing Lab', characters_workspace: 'Characters', characters: 'Characters',
      episodes_workspace: 'Episodes', episodes: 'Episodes', decisions_workspace: 'Decisions',
      open_questions: 'Open Questions',
      decisions: 'Decisions', conflicts: 'Conflicts', brainstorm_items: 'Brainstorm',
      brainstorm: 'Brainstorm', research_items: 'Research', research: 'Research',
      unsorted: 'Unsorted', source_material: 'Source Material', documents: 'Documents',
    };
    meta.textContent = chunks.join(' · ');
    if (p.source_kind) {
      const targetWs = p.source_entry_id ? CR_SOURCE_KIND_TO_WORKSPACE[p.source_kind] : null;
      meta.appendChild(document.createTextNode(' · '));
      if (targetWs) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'cr-source-link';
        link.textContent = `from ${sourceKindLabel(p.source_kind)} #${p.source_entry_id}`;
        link.title = `Go to ${targetWs} entry`;
        link.addEventListener('click', () => route(targetWs, p.source_entry_id));
        meta.appendChild(link);
      } else {
        meta.appendChild(document.createTextNode(`from ${sourceKindLabel(p.source_kind)}${p.source_entry_id ? ` #${p.source_entry_id}` : ''}`));
      }
    }
    rightCol.appendChild(meta);

    if (p.review_note) {
      const reviewNote = document.createElement('div');
      reviewNote.className = 'cr-review-note';
      reviewNote.textContent = `Latest review note: ${p.review_note}`;
      rightCol.appendChild(reviewNote);
    }

    // Editable fields. Autosave to the edit draft on every keystroke so
    // restart preserves the work without committing through updateFields.
    const form = document.createElement('div');
    form.className = 'cr-edit-form';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'canon-field';
    const titleLabel = document.createElement('label');
    titleLabel.className = 'canon-field-label';
    titleLabel.textContent = 'Proposed title *';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'canon-field-input';
    titleInput.maxLength = 200;
    titleInput.value = initialTitle;
    titleLabel.appendChild(titleInput);
    titleWrap.appendChild(titleLabel);
    form.appendChild(titleWrap);

    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'canon-field';
    const bodyLabel = document.createElement('label');
    bodyLabel.className = 'canon-field-label';
    bodyLabel.textContent = 'Proposed body';
    const bodyInput = document.createElement('textarea');
    bodyInput.className = 'canon-field-input';
    bodyInput.rows = 8;
    bodyInput.value = initialBody;
    bodyLabel.appendChild(bodyInput);
    bodyWrap.appendChild(bodyLabel);
    form.appendChild(bodyWrap);

    const noteWrap = document.createElement('div');
    noteWrap.className = 'canon-field';
    const noteLabel = document.createElement('label');
    noteLabel.className = 'canon-field-label';
    noteLabel.textContent = 'Proposer note';
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.className = 'canon-field-input';
    noteInput.maxLength = 500;
    noteInput.value = initialNote;
    noteLabel.appendChild(noteInput);
    noteWrap.appendChild(noteLabel);
    form.appendChild(noteWrap);

    const formStatus = document.createElement('p');
    formStatus.className = 'draft-status';
    setStatus(formStatus, editDraft ? 'Draft restored — click Save edits to commit.' : '');
    form.appendChild(formStatus);

    function saveEditDraft() {
      CanonReviewDrafts.set(`edit:${p.id}`, {
        title: titleInput.value,
        body: bodyInput.value,
        proposer_note: noteInput.value,
      });
      setStatus(formStatus, 'Draft autosaved — click Save edits to commit.');
      header.textContent = titleInput.value.trim() || '(untitled proposal)';
    }
    titleInput.addEventListener('input', saveEditDraft);
    bodyInput.addEventListener('input', saveEditDraft);
    noteInput.addEventListener('input', saveEditDraft);

    rightCol.appendChild(form);

    // Save edits row — commits updateFields to the proposal row. Approve
    // and other verbs read from the live row, so always commit edits first.
    const editActions = document.createElement('div');
    editActions.className = 'tc-detail-actions cr-edit-actions';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-secondary';
    saveBtn.textContent = 'Save edits';
    saveBtn.addEventListener('click', async () => {
      if (titleInput.value.trim() === '') {
        setStatus(formStatus, 'Title is required.');
        return;
      }
      saveBtn.disabled = true;
      try {
        await window.revival.canonProposals.updateFields(p.id, {
          proposed_fields: {
            title: titleInput.value,
            body: bodyInput.value,
          },
          proposer_note: noteInput.value,
        });
        CanonReviewDrafts.clear(`edit:${p.id}`);
        setStatus(formStatus, 'Edits saved.');
        await loadList();
      } catch (err) {
        setStatus(formStatus, err.message || 'Could not save edits.');
        saveBtn.disabled = false;
      }
    });
    editActions.appendChild(saveBtn);
    rightCol.appendChild(editActions);

    // --- Verb action row ----------------------------------------------------
    const actions = document.createElement('div');
    actions.className = 'tc-detail-actions cr-verb-actions';

    const approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = 'btn-primary';
    approveBtn.textContent = 'Approve →';
    approveBtn.title = 'Pick an entry type, fill required fields, and write to Canon Bible.';
    approveBtn.addEventListener('click', () => {
      // Persist the edit draft so the approve form starts from latest text.
      saveEditDraft();
      showApprove(p, {
        title: titleInput.value,
        body: bodyInput.value,
      });
    });
    actions.appendChild(approveBtn);

    if (p.status !== 'sent_back') {
      const sendBackBtn = document.createElement('button');
      sendBackBtn.type = 'button';
      sendBackBtn.className = 'btn-secondary';
      sendBackBtn.textContent = 'Send back';
      sendBackBtn.addEventListener('click', () => {
        showNoteConfirm(actions, {
          verb: 'Send back',
          danger: false,
          prompt: 'Send this proposal back for revision. It stays in the queue.',
          placeholder: 'Why is it being sent back? (optional)',
          run: async (note) => {
            await window.revival.canonProposals.sendBack(p.id, { review_note: note });
            await loadList();
          },
        });
      });
      actions.appendChild(sendBackBtn);
    }

    if (p.status !== 'deferred') {
      const deferBtn = document.createElement('button');
      deferBtn.type = 'button';
      deferBtn.className = 'btn-secondary';
      deferBtn.textContent = 'Defer';
      deferBtn.addEventListener('click', () => {
        showNoteConfirm(actions, {
          verb: 'Defer',
          danger: false,
          prompt: 'Move this proposal to the collapsed Deferred section.',
          placeholder: 'Why defer? (optional)',
          run: async (note) => {
            await window.revival.canonProposals.defer(p.id, { review_note: note });
            await loadList();
          },
        });
      });
      actions.appendChild(deferBtn);
    }

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'btn-secondary';
    rejectBtn.textContent = 'Reject';
    rejectBtn.title = 'Mark rejected (keeps an audit row). Use Delete to remove entirely.';
    rejectBtn.addEventListener('click', () => {
      showNoteConfirm(actions, {
        verb: 'Reject',
        danger: true,
        prompt:
          'Reject this proposal. It leaves the queue but the row stays for ' +
          'audit. Use Delete instead to remove it entirely.',
        placeholder: 'Reason for rejection (optional)',
        run: async (note) => {
          await window.revival.canonProposals.reject(p.id, { review_note: note });
          CanonReviewDrafts.clear(`edit:${p.id}`);
          CanonReviewDrafts.clear(`approve:${p.id}`);
          selectedId = null;
          await loadList();
        },
      });
    });
    actions.appendChild(rejectBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => showDeleteConfirm(actions, p));
    actions.appendChild(deleteBtn);

    if (workspaceName) {
      const popoutBtn = document.createElement('button');
      popoutBtn.type = 'button';
      popoutBtn.className = 'btn-secondary';
      popoutBtn.textContent = 'Pop out ↗';
      popoutBtn.title = 'Open this proposal in its own window';
      popoutBtn.addEventListener('click', () => {
        window.revival.popout.open(workspaceName, p.id);
      });
      actions.appendChild(popoutBtn);
    }

    // P43 — AI conflict check. Button lives in the verb row; results render
    // in a separate area below so they don't displace the action buttons.
    const conflictCheckBtn = document.createElement('button');
    conflictCheckBtn.type = 'button';
    conflictCheckBtn.className = 'btn-secondary';
    conflictCheckBtn.textContent = 'Check conflicts (AI)';
    conflictCheckBtn.title =
      'Ask Claude to compare this proposal against locked canon entries and flag contradictions.';
    actions.appendChild(conflictCheckBtn);

    rightCol.appendChild(actions);

    // Results area — only populated after the button is clicked.
    const conflictArea = document.createElement('div');
    conflictArea.className = 'cr-conflict-area';
    rightCol.appendChild(conflictArea);

    // PPOL2b-02 — status bar (workspace · type · created · edited · status).
    rightCol.appendChild(buildStatusBar('Canon Review', p, false));

    // PFLAN-EXPAND — Flanagan Filter (full five modes) on Canon Review proposals.
    // Passed a synthetic item that exposes proposed title/body as item.title/body.
    const crProposalItem = Object.assign({}, p, {
      title: (p.proposed_fields && p.proposed_fields.title) || p.title || '',
      body:  (p.proposed_fields && p.proposed_fields.body)  || p.body  || '',
    });
    const crFfCallbacks = {};
    mountFlanaganFilter(rightCol, crProposalItem, crFfCallbacks, {
      entityKind: 'canon_proposals',
      workspaceName: 'Canon Review',
    });
    const { refresh: crFfRefresh } = mountFlanaganHistory(
      rightCol, crProposalItem, false, crFfCallbacks, 'canon_proposals'
    );
    crFfCallbacks.refreshHistory = crFfRefresh;
    // PLOCKED-SPECIFICS — all locked specifics on Canon Review proposals.
    mountLockedSpecificsPanel(rightCol);

    // PEPISODE-CONT-2A — continuity check panel when proposal originated from an episode entry.
    const EP_PROPOSAL_SOURCE_KINDS = new Set(['episodes_workspace', 'episodes']);
    if (EP_PROPOSAL_SOURCE_KINDS.has(p.source_kind) && p.source_entry_id) {
      mountEpisodeContinuityPanel(rightCol, { id: p.source_entry_id, title: p.title || 'Untitled' });
    }

    conflictCheckBtn.addEventListener('click', async () => {
      conflictCheckBtn.disabled = true;
      conflictArea.innerHTML = '';
      const checking = document.createElement('p');
      checking.className = 'cr-conflict-status';
      checking.textContent = 'Checking against locked canon entries…';
      conflictArea.appendChild(checking);
      const selectedModel = chatModelSelect.value || 'claude-sonnet-4-6';
      try {
        const res = await window.revival.claude.conflictCheck(p.id, selectedModel);
        conflictArea.innerHTML = '';
        const summary = document.createElement('p');
        summary.className = 'cr-conflict-status';
        if (res.skipped) {
          summary.textContent = 'Proposal has no content to check.';
        } else if (res.checkedCount === 0) {
          summary.textContent = 'No locked canon entries to check against.';
        } else if (res.flags.length === 0) {
          summary.textContent =
            `No contradictions found (checked ${res.checkedCount} locked entr${res.checkedCount === 1 ? 'y' : 'ies'}).`;
        } else {
          summary.textContent =
            `${res.flags.length} contradiction${res.flags.length === 1 ? '' : 's'} flagged ` +
            `(checked ${res.checkedCount} locked entr${res.checkedCount === 1 ? 'y' : 'ies'}):`;
          conflictArea.appendChild(summary);
          for (const f of res.flags) {
            const flag = document.createElement('div');
            flag.className = 'cr-conflict-flag';
            const label = document.createElement('strong');
            label.textContent = `${f.tcode} — ${f.title}`;
            const reason = document.createElement('p');
            reason.className = 'cr-conflict-reason';
            reason.textContent = f.reason;
            flag.append(label, reason);
            conflictArea.appendChild(flag);
          }
          return;
        }
        conflictArea.appendChild(summary);
      } catch (err) {
        conflictArea.innerHTML = '';
        const errEl = document.createElement('p');
        errEl.className = 'cr-conflict-status';
        errEl.textContent = `Error: ${err.message || 'AI check failed.'}`;
        conflictArea.appendChild(errEl);
      } finally {
        conflictCheckBtn.disabled = false;
      }
    });
  }

  // Approve form: pick entry type, fill required detail fields, click
  // Approve. Drives canonProposals.approve which writes to canon_entries
  // and stamps the proposal as approved (target_entry_id = new entry).
  let cachedTypeConfig = null;
  async function showApprove(p, latestEdits) {
    rightCol.innerHTML = '';
    const heading = document.createElement('h2');
    heading.className = 'tc-detail-header';
    heading.textContent = `Approve: ${latestEdits.title || '(untitled proposal)'}`;
    rightCol.appendChild(heading);

    const hint = document.createElement('p');
    hint.className = 'placeholder';
    hint.textContent =
      'Pick an entry type and fill required fields. Approving writes a ' +
      'new entry to Canon Bible and marks this proposal approved.';
    rightCol.appendChild(hint);

    const formHost = document.createElement('div');
    formHost.className = 'cr-approve-host';
    rightCol.appendChild(formHost);

    const loadingNote = document.createElement('p');
    loadingNote.className = 'placeholder';
    loadingNote.textContent = 'Loading entry-type schema…';
    formHost.appendChild(loadingNote);

    try {
      if (!cachedTypeConfig) {
        cachedTypeConfig = await window.revival.canon.typeConfig();
      }
    } catch (err) {
      loadingNote.textContent = `Could not load entry-type schema: ${err.message || err}`;
      return;
    }
    loadingNote.remove();

    const approveDraftKey = `approve:${p.id}`;
    // Resume from a prior approve draft if one exists; otherwise seed with
    // the latest edits so the proposal's title/body carry over.
    const approveDraft = CanonReviewDrafts.get(approveDraftKey) || {};
    const seedValues = {
      title: approveDraft.title != null ? approveDraft.title : latestEdits.title,
      body: approveDraft.body != null ? approveDraft.body : latestEdits.body,
      canon_status: approveDraft.canon_status || 'draft',
      certainty: approveDraft.certainty || null,
      confidence: approveDraft.confidence || null,
      review_state: approveDraft.review_state || null,
      provisional: !!approveDraft.provisional,
    };

    // buildCanonForm's draft slot is shared with Canon Bible. Suppress it
    // here by passing `null` so an approve-in-progress doesn't reappear as
    // a Canon Bible new-entry draft. We persist our own draft to
    // CanonReviewDrafts via the input/change listeners below.
    const form = buildCanonForm({
      typeConfig: cachedTypeConfig,
      entry: null,
      initialType: approveDraft.entry_type || null,
      initialValues: seedValues,
      draftSlot: null,
      onSubmit: async (payload) => {
        const result = await window.revival.canonProposals.approve(p.id, {
          entry_type: payload.entry_type,
          title: payload.title,
          body: payload.body,
          canon_status: payload.canon_status,
          certainty: payload.certainty,
          confidence: payload.confidence,
          review_state: payload.review_state,
          provisional: payload.provisional,
          detail: payload.detail,
        });
        CanonReviewDrafts.clear(`edit:${p.id}`);
        CanonReviewDrafts.clear(approveDraftKey);
        selectedId = null;
        await loadList();
        // Toast-style confirmation via the page intro's status hint isn't
        // worth wiring; the list refresh + selection clear already tells
        // the story. Mention the new Canon Bible entry id for debugging.
        const banner = document.createElement('div');
        banner.className = 'cr-approve-banner';
        banner.textContent = `Approved → Canon Bible entry #${result.entry.id}.`;
        rightCol.prepend(banner);
        setTimeout(() => banner.remove(), 6000);
      },
      onCancel: () => {
        const fresh = findProposal(p.id);
        if (fresh) showReview(fresh);
        else { selectedId = null; renderDetail(); }
      },
    });
    formHost.appendChild(form);

    // Mirror form mutations into CanonReviewDrafts. buildCanonForm doesn't
    // expose a change hook, so we watch the form for input/change events at
    // the host element — close enough since the form lives in here only.
    function persistApproveDraft() {
      // Read the form's inputs by their visible labels' inputs — the
      // simplest path is to defer to buildCanonForm's own state by walking
      // the DOM. We just snapshot the raw values to a draft.
      const titleEl = form.querySelector('.canon-field input[type="text"]');
      const bodyEl = form.querySelector('.canon-field textarea');
      const typeEl = form.querySelector('.canon-field select');
      if (!titleEl) return;
      CanonReviewDrafts.set(approveDraftKey, {
        title: titleEl.value,
        body: bodyEl ? bodyEl.value : '',
        entry_type: typeEl ? typeEl.value || null : null,
      });
    }
    form.addEventListener('input', persistApproveDraft);
    form.addEventListener('change', persistApproveDraft);
  }

  function renderDetail() {
    if (selectedId == null) return showEmpty();
    const p = findProposal(selectedId);
    if (!p) {
      selectedId = null;
      return showEmpty();
    }
    return showReview(p);
  }

  async function loadList() {
    try {
      proposals = await window.revival.canonProposals.list();
    } catch (err) {
      proposals = [];
      list.innerHTML = '';
      const e = document.createElement('div');
      e.className = 'tc-list-empty';
      e.textContent = `Could not load proposals: ${err.message || err}`;
      list.appendChild(e);
      return;
    }
    if (selectedId !== null && !findProposal(selectedId)) selectedId = null;
    renderList();
    renderDetail();
    refreshNavBadges();
  }

  // PUI2 cross-window refresh: another window approving / editing a
  // proposal fans 'Canon Review' to us, and we reload.
  setActiveWorkspaceRefresh(workspaceName, loadList);

  // PImp2: Keyboard navigation. j/↓ → next, k/↑ → prev, a → quick-approve,
  // d → quick-defer. Active only while Canon Review is the current workspace.
  // Quick-approve uses the entry_type already in proposed_fields (import path);
  // without it the full approve form is opened via the Approve button.
  if (_canonReviewKeyHandler) {
    window.removeEventListener('keydown', _canonReviewKeyHandler);
  }
  _canonReviewKeyHandler = function crKeyHandler(e) {
    if (currentWorkspaceName !== workspaceName) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const statusFiltered = proposals.filter((p) => {
      if (filter === 'active')    return p.status === 'pending' || p.status === 'sent_back';
      if (filter === 'pending')   return p.status === 'pending';
      if (filter === 'sent_back') return p.status === 'sent_back';
      if (filter === 'deferred')  return p.status === 'deferred';
      return true;
    });
    const visible = typeFilter
      ? statusFiltered.filter((p) => getProposalType(p) === typeFilter)
      : statusFiltered;
    if (visible.length === 0) return;

    const curIdx = selectedId == null ? -1 : visible.findIndex((p) => p.id === selectedId);

    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      const next = curIdx < visible.length - 1 ? curIdx + 1 : 0;
      selectedId = visible[next].id;
      renderList();
      renderDetail();
      const btn = list.querySelector('.tc-list-item.active');
      if (btn) btn.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      const prev = curIdx > 0 ? curIdx - 1 : visible.length - 1;
      selectedId = visible[prev].id;
      renderList();
      renderDetail();
      const btn = list.querySelector('.tc-list-item.active');
      if (btn) btn.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'a' && selectedId != null) {
      const p = findProposal(selectedId);
      if (!p) return;
      const fields = p.proposed_fields || {};
      if (fields.entry_type) {
        e.preventDefault();
        (async () => {
          try {
            await window.revival.canonProposals.approve(p.id, {
              entry_type: fields.entry_type,
              title: fields.title || '(untitled)',
              body: fields.body || '',
              canon_status: 'draft',
            });
            selectedId = null;
            await loadList();
          } catch (err) { showFlagResolvedToast(`Approve failed: ${err.message || err}`); }
        })();
      } else {
        e.preventDefault();
        const approveBtn = rightCol.querySelector('.btn-primary');
        if (approveBtn) approveBtn.click();
      }
    } else if (e.key === 'd' && selectedId != null) {
      const p = findProposal(selectedId);
      if (!p || p.status === 'deferred') return;
      e.preventDefault();
      (async () => {
        try {
          await window.revival.canonProposals.defer(p.id, {});
          selectedId = null;
          await loadList();
        } catch (err) { showFlagResolvedToast(`Defer failed: ${err.message || err}`); }
      })();
    }
  };
  window.addEventListener('keydown', _canonReviewKeyHandler);

  loadList();
}

// --- Home dashboard (P27) ---------------------------------------------------
// A read-only overview: a count per storage-backed workspace, a recent-activity
// feed, and dismissible Next Step Suggestions. Home mutates nothing — it only
// summarizes what lives in the other workspaces (per CLAUDE.md). Counts come
// straight from the DB so they always match each workspace's own lists.
//
// Suggestions are generated from the live counts but keyed by a stable id;
// dismissals are persisted in localStorage so a dismissed suggestion stays
// dismissed across restarts (it never reappears, even if its count changes).
const DISMISSED_SUGGESTIONS_KEY = 'revival.home.dismissedSuggestions';
const FIRST_SESSION_GUIDE_KEY = 'revival.home.firstSessionGuideDismissed';
// How many Next Step cards show at once, and the hard ceiling on recent-activity
// cards. Both keep Home from ever needing to scroll; recent is also trimmed to
// whatever space is left after Next steps + Workspaces.
const SUGGESTION_CAP = 6;
const RECENT_CAP = 6;

// PHOME-NEEDS: staleness thresholds (days). Persisted in localStorage so
// Settings changes survive restarts. Defaults match the spec.
const NEEDS_THRESHOLDS_KEY = 'revival.home.needs.thresholds';
const NEEDS_THRESHOLDS_DEFAULTS = {
  tier1QuestionDays: 14,
  conflictDays: 30,
  canonReviewDays: 7,
};
function getNeedsThresholds() {
  try {
    const saved = JSON.parse(localStorage.getItem(NEEDS_THRESHOLDS_KEY));
    return { ...NEEDS_THRESHOLDS_DEFAULTS, ...(saved || {}) };
  } catch {
    return { ...NEEDS_THRESHOLDS_DEFAULTS };
  }
}
function setNeedsThresholds(updates) {
  const current = getNeedsThresholds();
  localStorage.setItem(NEEDS_THRESHOLDS_KEY, JSON.stringify({ ...current, ...updates }));
}

function getDismissedSuggestions() {
  try {
    const arr = JSON.parse(localStorage.getItem(DISMISSED_SUGGESTIONS_KEY));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function dismissSuggestion(id) {
  const set = getDismissedSuggestions();
  set.add(id);
  localStorage.setItem(DISMISSED_SUGGESTIONS_KEY, JSON.stringify([...set]));
}

// Bring every dismissed suggestion back (the Refresh action).
function clearDismissedSuggestions() {
  localStorage.removeItem(DISMISSED_SUGGESTIONS_KEY);
}

// Build the candidate suggestions from the live counts. Each has a stable id so
// dismissal is permanent regardless of how the underlying number changes. The
// catalog is intentionally larger than SUGGESTION_CAP so Refresh has extras to
// cycle through.
function buildSuggestions(countsByKey) {
  const n = (key) => (countsByKey[key] ? countsByKey[key].active : 0);
  const list = [];

  // Attention-needed (only when there's something to act on).
  if (n('unsorted') > 0) {
    list.push({
      id: 'route-unsorted',
      text: `Route ${n('unsorted')} item(s) waiting in Unsorted.`,
      route: 'Unsorted',
    });
  }
  if (n('conflicts') > 0) {
    list.push({
      id: 'resolve-conflicts',
      text: `Resolve ${n('conflicts')} open conflict(s).`,
      route: 'Conflicts',
    });
  }
  if (n('open_questions') > 0) {
    list.push({
      id: 'answer-questions',
      text: `Answer ${n('open_questions')} open question(s).`,
      route: 'Open Questions',
    });
  }

  // Getting-started nudges (only while a workspace is still empty).
  if (n('writing_lab') === 0) {
    list.push({ id: 'start-draft', text: 'Start a long-form draft in the Writing Lab.', route: 'Writing Lab' });
  }
  if (n('source_material') === 0) {
    list.push({
      id: 'add-source',
      text: 'Add Source Material so you can attach references in Chat.',
      route: 'Source Material',
    });
  }
  if (n('documents') === 0) {
    list.push({ id: 'start-document', text: 'Start your first Document.', route: 'Documents' });
  }
  if (n('decisions') === 0) {
    list.push({ id: 'record-decision', text: 'Record a Decision once something is settled.', route: 'Decisions' });
  }
  if (n('brainstorm') === 0) {
    list.push({ id: 'capture-idea', text: 'Capture an idea in Brainstorm.', route: 'Brainstorm' });
  }
  if (n('research') === 0) {
    list.push({ id: 'add-research', text: 'Add a Research note.', route: 'Research' });
  }
  if (n('characters') === 0) {
    list.push({ id: 'add-character', text: 'Add a Character to start developing them.', route: 'Characters' });
  }
  if (n('episodes') === 0) {
    list.push({ id: 'add-episode', text: 'Outline an Episode to start drafting it.', route: 'Episodes' });
  }
  if (n('chats') === 0) {
    list.push({ id: 'start-chat', text: 'Start a chat to think through Revival.', route: 'Chat' });
  }

  // Always-available housekeeping so there's usually something to act on.
  list.push({ id: 'review-rules', text: 'Review your always-on Project Rules in Settings.', route: 'Settings' });
  list.push({ id: 'panic-backup', text: 'Run a Panic Export to back everything up.', route: 'Settings' });

  return list;
}

// PHOME-NEEDS: build the Needs Attention panel and append it to `container`.
// Returns a refreshNeedsAttention() function the caller can invoke to re-render.
function buildNeedsAttentionPanel(container) {
  const wrap = document.createElement('div');
  wrap.className = 'needs-attention';
  container.appendChild(wrap);

  function daysSince(isoStr) {
    return Math.floor((Date.now() - new Date(isoStr).getTime()) / 864e5);
  }

  function renderNeedsAttention(data) {
    wrap.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'needs-attention-head';

    const label = document.createElement('span');
    label.className = 'home-section-label';
    label.textContent = 'Needs Attention';
    head.appendChild(label);

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'suggestions-refresh';
    refreshBtn.textContent = '↻ Refresh';
    refreshBtn.title = 'Re-check for stale items';
    refreshBtn.addEventListener('click', () => refreshNeedsAttention(refreshBtn));
    head.appendChild(refreshBtn);
    wrap.appendChild(head);

    const { tier1Questions, stalledConflicts, pendingProposals, blockingQuestions = [], outlineEpisodes = [], blockingConflicts = [], episodesNoQd = [] } = data;
    const total = tier1Questions.length + stalledConflicts.length + pendingProposals.length + blockingQuestions.length + outlineEpisodes.length + blockingConflicts.length + episodesNoQd.length;

    if (total === 0) {
      const empty = document.createElement('p');
      empty.className = 'needs-attention-empty';
      empty.textContent = 'All clear — nothing needs attention right now.';
      wrap.appendChild(empty);
      return;
    }

    const thresholds = getNeedsThresholds();

    function addCategory(labelText, items, routeName, ageField, thresholdDays) {
      if (items.length === 0) return;
      const cat = document.createElement('div');
      cat.className = 'na-category';

      const catHead = document.createElement('div');
      catHead.className = 'na-category-head';

      const catLabel = document.createElement('span');
      catLabel.className = 'na-category-label';
      catLabel.textContent = labelText;

      const badge = document.createElement('span');
      badge.className = 'na-count-badge';
      badge.textContent = String(items.length);

      catHead.append(catLabel, badge);
      cat.appendChild(catHead);

      const grid = document.createElement('div');
      grid.className = 'na-items';

      for (const item of items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'na-item';
        btn.title = `Go to ${routeName}`;
        btn.addEventListener('click', () => route(routeName));

        const titleEl = document.createElement('div');
        titleEl.className = 'na-item-title';
        titleEl.textContent = item.title || item.proposal_intent || '(untitled)';

        const age = daysSince(item[ageField]);
        const ageEl = document.createElement('div');
        ageEl.className = 'na-item-age';
        ageEl.textContent = `${age}d — threshold ${thresholdDays}d`;

        btn.append(titleEl, ageEl);
        grid.appendChild(btn);
      }

      cat.appendChild(grid);
      wrap.appendChild(cat);
    }

    // PBLOCK: blocking questions always appear regardless of staleness threshold.
    if (blockingQuestions.length > 0) {
      const cat = document.createElement('div');
      cat.className = 'na-category';
      const catHead = document.createElement('div');
      catHead.className = 'na-category-head';
      const catLabel = document.createElement('span');
      catLabel.className = 'na-category-label';
      catLabel.textContent = 'Blocking questions';
      const badge = document.createElement('span');
      badge.className = 'na-count-badge';
      badge.textContent = String(blockingQuestions.length);
      catHead.append(catLabel, badge);
      cat.appendChild(catHead);
      const grid = document.createElement('div');
      grid.className = 'na-items';
      for (const item of blockingQuestions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'na-item';
        btn.title = 'Go to Open Questions';
        btn.addEventListener('click', () => route('Open Questions'));
        const titleEl = document.createElement('div');
        titleEl.className = 'na-item-title';
        titleEl.textContent = item.title || '(untitled)';
        const subEl = document.createElement('div');
        subEl.className = 'na-item-age';
        const k = item.blocking_type || 'item';
        const t = item.blocking_target;
        subEl.textContent = t ? `Blocking ${k}: "${t}"` : 'Marked as blocking';
        btn.append(titleEl, subEl);
        grid.appendChild(btn);
      }
      cat.appendChild(grid);
      wrap.appendChild(cat);
    }

    // PEPISODE-STATUS: Outline-stage episodes always surface (no staleness gate).
    if (outlineEpisodes.length > 0) {
      const cat = document.createElement('div');
      cat.className = 'na-category';
      const catHead = document.createElement('div');
      catHead.className = 'na-category-head';
      const catLabel = document.createElement('span');
      catLabel.className = 'na-category-label';
      catLabel.textContent = 'Episodes at Outline stage';
      const badge = document.createElement('span');
      badge.className = 'na-count-badge';
      badge.textContent = String(outlineEpisodes.length);
      catHead.append(catLabel, badge);
      cat.appendChild(catHead);
      const grid = document.createElement('div');
      grid.className = 'na-items';
      for (const item of outlineEpisodes) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'na-item';
        btn.title = 'Go to Episodes';
        btn.addEventListener('click', () => route('Episodes'));
        const titleEl = document.createElement('div');
        titleEl.className = 'na-item-title';
        titleEl.textContent = item.title || '(untitled)';
        const subEl = document.createElement('div');
        subEl.className = 'na-item-age';
        subEl.textContent = 'Status: Outline';
        btn.append(titleEl, subEl);
        grid.appendChild(btn);
      }
      cat.appendChild(grid);
      wrap.appendChild(cat);
    }

    // PQUIET: episodes linked to a QD tracker row but with no candidate yet.
    if (episodesNoQd && episodesNoQd.length > 0) {
      const cat = document.createElement('div');
      cat.className = 'na-category';
      const catHead = document.createElement('div');
      catHead.className = 'na-category-head';
      const catLabel = document.createElement('span');
      catLabel.className = 'na-category-label';
      catLabel.textContent = 'Episodes without a quiet devastation candidate';
      const badge = document.createElement('span');
      badge.className = 'na-count-badge';
      badge.textContent = String(episodesNoQd.length);
      catHead.append(catLabel, badge);
      cat.appendChild(catHead);
      const grid = document.createElement('div');
      grid.className = 'na-items';
      for (const ep of episodesNoQd) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'na-item';
        btn.title = 'Go to Episodes';
        btn.addEventListener('click', () => route('Episodes'));
        const titleEl = document.createElement('div');
        titleEl.className = 'na-item-title';
        titleEl.textContent = ep.title || '(untitled)';
        const subEl = document.createElement('div');
        subEl.className = 'na-item-age';
        subEl.textContent = 'No QD candidate';
        btn.append(titleEl, subEl);
        grid.appendChild(btn);
      }
      cat.appendChild(grid);
      wrap.appendChild(cat);
    }

    // PCONFLICT-SEV: Blocking conflicts always surface regardless of staleness.
    if (blockingConflicts.length > 0) {
      const cat = document.createElement('div');
      cat.className = 'na-category';
      const catHead = document.createElement('div');
      catHead.className = 'na-category-head';
      const catLabel = document.createElement('span');
      catLabel.className = 'na-category-label';
      catLabel.textContent = 'Blocking conflicts';
      const badge = document.createElement('span');
      badge.className = 'na-count-badge';
      badge.textContent = String(blockingConflicts.length);
      catHead.append(catLabel, badge);
      cat.appendChild(catHead);
      const grid = document.createElement('div');
      grid.className = 'na-items';
      for (const item of blockingConflicts) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'na-item';
        btn.title = 'Go to Conflicts';
        btn.addEventListener('click', () => route('Conflicts'));
        const titleEl = document.createElement('div');
        titleEl.className = 'na-item-title';
        titleEl.textContent = item.title || '(untitled)';
        const subEl = document.createElement('div');
        subEl.className = 'na-item-age';
        subEl.textContent = 'Severity: Blocking';
        btn.append(titleEl, subEl);
        grid.appendChild(btn);
      }
      cat.appendChild(grid);
      wrap.appendChild(cat);
    }

    addCategory(
      `Tier-1 Open Questions (no update in ${thresholds.tier1QuestionDays}+ days)`,
      tier1Questions, 'Open Questions', 'updated_at', thresholds.tier1QuestionDays
    );
    addCategory(
      `Conflicts open ${thresholds.conflictDays}+ days`,
      stalledConflicts, 'Conflicts', 'created_at', thresholds.conflictDays
    );
    addCategory(
      `Canon Review proposals pending ${thresholds.canonReviewDays}+ days`,
      pendingProposals, 'Canon Review', 'created_at', thresholds.canonReviewDays
    );
  }

  let refreshing = false;
  async function refreshNeedsAttention(btn) {
    if (refreshing) return;
    refreshing = true;
    if (btn) btn.disabled = true;
    try {
      const data = await window.revival.dashboard.needsAttention(getNeedsThresholds());
      renderNeedsAttention(data);
    } catch (err) {
      /* keep stale display on failure */
    }
    refreshing = false;
    if (btn) btn.disabled = false;
  }

  // Initial load
  (async () => {
    try {
      const data = await window.revival.dashboard.needsAttention(getNeedsThresholds());
      renderNeedsAttention(data);
    } catch (err) {
      const errEl = document.createElement('p');
      errEl.className = 'placeholder';
      errEl.textContent = `Could not load: ${err.message || err}`;
      wrap.appendChild(errEl);
    }
  })();

  return refreshNeedsAttention;
}

function renderHomePage(section) {
  const loading = document.createElement('p');
  loading.className = 'placeholder';
  loading.textContent = 'Loading overview…';
  section.appendChild(loading);

  (async () => {
    let summary;
    try {
      // Fetch a generous pool; the recent feed is trimmed below to only the
      // cards that fit without scrolling.
      summary = await window.revival.dashboard.summary(30);
    } catch (err) {
      loading.textContent = `Could not load overview: ${err.message || err}`;
      return;
    }
    loading.remove();

    // PEMPTY-STATE: first-session guide — shown once on first launch, dismissed
    // permanently via localStorage. Non-modal, inline at the top of Home.
    if (!localStorage.getItem(FIRST_SESSION_GUIDE_KEY)) {
      const guide = document.createElement('div');
      guide.className = 'first-session-guide';

      const guideHead = document.createElement('div');
      guideHead.className = 'first-session-guide-head';

      const guideTitle = document.createElement('div');
      guideTitle.className = 'first-session-guide-title';
      guideTitle.textContent = 'Getting started';
      guideHead.appendChild(guideTitle);

      const dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'first-session-guide-dismiss';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.addEventListener('click', () => {
        localStorage.setItem(FIRST_SESSION_GUIDE_KEY, '1');
        guide.remove();
      });
      guideHead.appendChild(dismissBtn);
      guide.appendChild(guideHead);

      const guideBody = document.createElement('p');
      guideBody.className = 'first-session-guide-body';
      guideBody.textContent = 'Suggested start sequence — work through these in order:';
      guide.appendChild(guideBody);

      const steps = [
        { label: 'Settings', detail: 'Add your API key and write your always-on Project Rules.' },
        { label: 'Source Material', detail: 'Upload the scripts, pitch decks, and reference docs that Chat can pull from.' },
        { label: 'Canon Bible', detail: 'Add your first locked canon entries — show facts the room agrees on.' },
        { label: 'Open Questions', detail: 'Log every unresolved question so nothing falls through the cracks.' },
      ];

      const stepList = document.createElement('ol');
      stepList.className = 'first-session-steps';
      for (const step of steps) {
        const li = document.createElement('li');
        li.className = 'first-session-step';

        const stepBtn = document.createElement('button');
        stepBtn.type = 'button';
        stepBtn.className = 'first-session-step-link';
        stepBtn.textContent = step.label;
        stepBtn.addEventListener('click', () => route(step.label));

        const stepDetail = document.createElement('span');
        stepDetail.className = 'first-session-step-detail';
        stepDetail.textContent = ` — ${step.detail}`;

        li.append(stepBtn, stepDetail);
        stepList.appendChild(li);
      }
      guide.appendChild(stepList);

      section.appendChild(guide);
    }

    // PHOME-NEEDS: Needs Attention panel — primary actionable section.
    buildNeedsAttentionPanel(section);

    let countsByKey = {};
    for (const c of summary.counts) countsByKey[c.key] = c;

    // The recent-activity grid + its label; populated below. Trimmed toward the
    // cards that fit in the visible content area (capped at RECENT_CAP) to keep
    // scrolling minimal — but it ALWAYS shows at least one row and never hides
    // the header, so the section can't disappear. Cards have a uniform height,
    // so we measure one card + the grid's column count to pick how many to show.
    let recentFeed = null;
    let recentLabel = null;
    // Session-only rotation offset for cycling Next Step suggestions on Refresh.
    let suggestionOffset = 0;

    function trimRecentToFit() {
      const feed = recentFeed;
      if (!feed || !document.body.contains(feed)) return;
      const cards = Array.from(feed.querySelectorAll('.recent-card'));
      if (cards.length === 0) return;
      feed.style.display = '';
      if (recentLabel) recentLabel.style.display = '';
      cards.forEach((c) => (c.style.display = ''));

      const contentEl = document.getElementById('content');
      const gridStyle = getComputedStyle(feed);
      const cols =
        gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length || 1;
      const rowGap = parseFloat(gridStyle.rowGap) || 0;
      const cardH = cards[0].getBoundingClientRect().height;
      const feedTop = feed.getBoundingClientRect().top;
      const contentBottom = contentEl.getBoundingClientRect().bottom;
      const BOTTOM_PAD = 40; // matches #content's bottom padding
      const avail = contentBottom - feedTop - BOTTOM_PAD;

      let rows = Math.floor((avail + rowGap) / (cardH + rowGap));
      if (rows < 1) rows = 1; // always show at least one row — never disappear
      const maxCards = Math.min(rows * cols, RECENT_CAP, cards.length);
      cards.forEach((c, i) => {
        c.style.display = i < maxCards ? '' : 'none';
      });
    }

    // Refresh Next steps: bring back any dismissed suggestions, re-check the
    // live counts, and cycle the visible window through any extras.
    let refreshing = false;
    async function refreshSuggestions(btn) {
      if (refreshing) return;
      refreshing = true;
      if (btn) btn.disabled = true;
      clearDismissedSuggestions(); // bring everything back
      suggestionOffset += SUGGESTION_CAP;
      try {
        const fresh = await window.revival.dashboard.summary(0);
        countsByKey = {};
        for (const c of fresh.counts) countsByKey[c.key] = c;
      } catch {
        /* keep the existing counts on failure */
      }
      refreshing = false;
      renderSuggestions();
      trimRecentToFit();
    }

    // Re-fit on resize; the listener removes itself once Home is left (the feed
    // is detached when route() wipes #content).
    function onResize() {
      if (!recentFeed || !document.body.contains(recentFeed)) {
        window.removeEventListener('resize', onResize);
        return;
      }
      trimRecentToFit();
    }

    // --- Next Step Suggestions (dismissible) ---
    const suggestionsWrap = document.createElement('div');
    suggestionsWrap.className = 'home-suggestions';
    section.appendChild(suggestionsWrap);

    function renderSuggestions() {
      suggestionsWrap.innerHTML = '';
      const dismissed = getDismissedSuggestions();
      const candidates = buildSuggestions(countsByKey).filter(
        (s) => !dismissed.has(s.id)
      );

      // The header (label + Refresh) ALWAYS renders — so even when every
      // suggestion has been dismissed, Refresh is still there to bring them back.
      const head = document.createElement('div');
      head.className = 'home-suggestions-head';

      const label = document.createElement('span');
      label.className = 'home-section-label';
      label.textContent = 'Next steps';
      head.appendChild(label);

      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.className = 'suggestions-refresh';
      refresh.textContent = '↻ Refresh';
      refresh.title = 'Bring back dismissed suggestions and re-check';
      refresh.addEventListener('click', () => refreshSuggestions(refresh));
      head.appendChild(refresh);

      suggestionsWrap.appendChild(head);

      if (candidates.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'placeholder';
        hint.textContent = 'All dismissed — hit Refresh to bring them back.';
        suggestionsWrap.appendChild(hint);
        return;
      }

      // Show up to SUGGESTION_CAP; when there are extras, Refresh rotates a
      // sliding window through them.
      let shown;
      if (candidates.length <= SUGGESTION_CAP) {
        shown = candidates;
      } else {
        const start = suggestionOffset % candidates.length;
        shown = [];
        for (let i = 0; i < SUGGESTION_CAP; i++) {
          shown.push(candidates[(start + i) % candidates.length]);
        }
      }

      const cards = document.createElement('div');
      cards.className = 'home-suggestions-grid';
      for (const s of shown) {
        const card = document.createElement('div');
        card.className = 'suggestion-card';
        card.title = `Go to ${s.route}`;
        card.addEventListener('click', () => route(s.route));

        const text = document.createElement('div');
        text.className = 'suggestion-text';
        text.textContent = s.text;

        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'suggestion-dismiss';
        dismiss.textContent = '✕';
        dismiss.title = 'Dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss suggestion');
        dismiss.addEventListener('click', (e) => {
          e.stopPropagation();
          dismissSuggestion(s.id);
          renderSuggestions();
          trimRecentToFit();
        });

        card.append(text, dismiss);
        cards.appendChild(card);
      }
      suggestionsWrap.appendChild(cards);
    }
    renderSuggestions();

    // --- Counts per workspace ---
    const countsLabel = document.createElement('div');
    countsLabel.className = 'home-section-label';
    countsLabel.textContent = 'Workspaces';
    section.appendChild(countsLabel);

    const grid = document.createElement('div');
    grid.className = 'home-counts';
    for (const c of summary.counts) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'count-cell';
      cell.title = `Go to ${c.route}`;
      cell.addEventListener('click', () => route(c.route));

      const num = document.createElement('div');
      num.className = c.active === 0 ? 'count-number count-number--zero' : 'count-number';
      num.textContent = String(c.active);

      const label = document.createElement('div');
      label.className = 'count-label';
      label.textContent = c.label;

      cell.append(num, label);

      if (c.archived > 0) {
        const arch = document.createElement('div');
        arch.className = 'count-archived';
        arch.textContent = `${c.archived} archived`;
        cell.appendChild(arch);
      }

      grid.appendChild(cell);
    }
    section.appendChild(grid);

    // --- Recently Viewed (session-based, collapsed) ---
    const rvItems = getRecentlyViewed();
    if (rvItems.length > 0) {
      const rvDetails = document.createElement('details');
      rvDetails.className = 'home-collapsed';

      const rvSummary = document.createElement('summary');
      rvSummary.textContent = `Recently Viewed (${rvItems.length})`;
      rvDetails.appendChild(rvSummary);

      const rvBody = document.createElement('div');
      rvBody.className = 'home-collapsed-body';

      const rvGrid = document.createElement('div');
      rvGrid.className = 'home-recent-viewed';
      for (const item of rvItems) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rv-card';
        btn.title = `Go to ${item.workspace} — ${item.title}`;
        btn.addEventListener('click', () => route(item.workspace, item.id));

        const titleEl = document.createElement('div');
        titleEl.className = 'rv-title';
        titleEl.textContent = item.title;

        const wsEl = document.createElement('div');
        wsEl.className = 'rv-ws';
        wsEl.textContent = item.workspace;

        btn.append(titleEl, wsEl);
        rvGrid.appendChild(btn);
      }

      rvBody.appendChild(rvGrid);
      rvDetails.appendChild(rvBody);
      section.appendChild(rvDetails);
    }

    // --- Recent activity (collapsed) ---
    // Cards are clearable (the ✕ hides a card from view — it does NOT delete the
    // underlying entry) and Refresh re-pulls everything from the DB, bringing
    // cleared cards back. Clearing is view-only and in-memory, so leaving and
    // returning to Home also restores the full feed.
    let recentItems = summary.recent;
    const clearedRecentIds = new Set();
    const recentKey = (it) => `${it.route}:${it.id}`;

    // Wrap in a collapsed <details> so it's below Needs Attention.
    const recentDetails = document.createElement('details');
    recentDetails.className = 'home-collapsed';
    section.appendChild(recentDetails);

    const recentDetailsSummary = document.createElement('summary');
    recentDetailsSummary.textContent = 'Recent Activity';
    recentDetails.appendChild(recentDetailsSummary);

    const recentDetailsBody = document.createElement('div');
    recentDetailsBody.className = 'home-collapsed-body';
    recentDetails.appendChild(recentDetailsBody);

    // Header carries the Refresh button; recentLabel tracks it for show/hide.
    const recentHead = document.createElement('div');
    recentHead.className = 'home-recent-head';
    recentLabel = recentHead;

    const recentRefresh = document.createElement('button');
    recentRefresh.type = 'button';
    recentRefresh.className = 'suggestions-refresh';
    recentRefresh.textContent = '↻ Refresh';
    recentRefresh.title = 'Re-pull recent activity (restores cleared cards)';
    recentRefresh.addEventListener('click', () => refreshRecent(recentRefresh));
    recentHead.appendChild(recentRefresh);
    recentDetailsBody.appendChild(recentHead);

    const feed = document.createElement('div');
    feed.className = 'home-recent';
    recentFeed = feed;
    recentDetailsBody.appendChild(feed);

    function buildRecentCard(item) {
      const card = document.createElement('div');
      card.className = 'recent-card';
      card.title = `Go to ${item.workspace}`;
      card.addEventListener('click', () => route(item.route));

      const title = document.createElement('div');
      title.className = 'recent-title';
      title.textContent = item.title;

      const foot = document.createElement('div');
      foot.className = 'recent-foot';

      const ws = document.createElement('span');
      ws.className = 'recent-ws';
      ws.textContent = item.workspace;

      const meta = document.createElement('span');
      meta.className = 'recent-meta';
      const edited = item.updated_at && item.updated_at !== item.created_at;
      const when = new Date(item.updated_at).toLocaleDateString();
      meta.textContent = `${edited ? 'Edited' : 'Added'} ${when}`;

      foot.append(ws, meta);

      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'recent-clear';
      clear.textContent = '✕';
      clear.title = 'Clear from view (does not delete it)';
      clear.setAttribute('aria-label', `Clear ${item.title} from view`);
      clear.addEventListener('click', (e) => {
        e.stopPropagation();
        clearedRecentIds.add(recentKey(item));
        renderRecent();
      });

      card.append(title, foot, clear);
      return card;
    }

    function renderRecent() {
      feed.innerHTML = '';
      recentHead.style.display = '';
      feed.style.display = '';

      if (recentItems.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'placeholder';
        empty.style.gridColumn = '1 / -1';
        empty.textContent =
          'Nothing yet — add something in any workspace to see it here.';
        feed.appendChild(empty);
        return;
      }

      const visible = recentItems.filter(
        (it) => !clearedRecentIds.has(recentKey(it))
      );
      if (visible.length === 0) {
        const hint = document.createElement('p');
        hint.className = 'placeholder';
        hint.style.gridColumn = '1 / -1';
        hint.textContent =
          'All cleared from view — hit Refresh to bring them back.';
        feed.appendChild(hint);
        return;
      }

      for (const item of visible) feed.appendChild(buildRecentCard(item));
      // Trim to only the cards that fit (after layout settles).
      requestAnimationFrame(trimRecentToFit);
    }

    // Refresh: forget what was cleared and re-pull the latest activity.
    async function refreshRecent(btn) {
      if (btn) btn.disabled = true;
      clearedRecentIds.clear();
      try {
        const fresh = await window.revival.dashboard.summary(30);
        recentItems = fresh.recent;
      } catch {
        /* keep existing items on failure */
      }
      renderRecent();
      if (btn) btn.disabled = false;
    }

    renderRecent();
    window.addEventListener('resize', onResize);
  })();
}

// --- Settings: Claude API key (P39) ----------------------------------------
// Key stored in SQLite settings row. Displayed masked by default; a show/hide
// toggle reveals it. Never logged or transmitted except to claude.ai API calls.
function renderApiKeyBlock(section) {
  const api = window.revival.settings;

  const block = document.createElement('div');
  block.className = 'entry-form settings-block';

  const heading = document.createElement('h2');
  heading.className = 'settings-heading';
  heading.textContent = 'Claude API Key';

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'Required for Claude messaging (P40+). Stored locally in the database — never shared anywhere except outgoing Claude API calls.';

  const row = document.createElement('div');
  row.className = 'settings-apikey-row';

  const input = document.createElement('input');
  input.type = 'password';
  input.className = 'settings-apikey-input';
  input.placeholder = 'sk-ant-…';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.disabled = true;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'settings-apikey-toggle';
  toggle.title = 'Show / hide key';
  toggle.textContent = '👁';
  toggle.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn-secondary';
  save.textContent = 'Save Key';
  save.disabled = true;

  row.append(input, toggle, save);

  const status = document.createElement('p');
  status.className = 'draft-status';

  let savedKey = '';

  function refreshDirty() {
    save.disabled = input.value === savedKey;
  }

  input.addEventListener('input', refreshDirty);

  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await api.setClaudeApiKey(input.value);
      savedKey = input.value.trim();
      input.value = savedKey;
      const masked = savedKey
        ? savedKey.slice(0, 10) + '…' + savedKey.slice(-4)
        : '(empty)';
      setStatus(status, `Saved. Key: ${masked}`);
    } catch (err) {
      setStatus(status, `Could not save: ${err.message || err}`);
    }
    refreshDirty();
  });

  block.append(heading, desc, row, status);
  section.appendChild(block);

  (async () => {
    try {
      savedKey = (await api.getClaudeApiKey()) || '';
      input.value = savedKey;
      if (savedKey) {
        const masked = savedKey.slice(0, 10) + '…' + savedKey.slice(-4);
        setStatus(status, `Key on file: ${masked}`);
      } else {
        setStatus(status, 'No key saved yet.');
      }
    } catch (err) {
      setStatus(status, `Could not load key: ${err.message || err}`);
    }
    input.disabled = false;
    refreshDirty();
  })();
}

// --- Settings: Project Rules (P20) -----------------------------------------
// Always-on, always-visible guidance Claude receives. Stored in SQLite (via the
// settings IPC) so it survives restarts — there is no hidden project memory.
// The textarea always shows the saved value verbatim; nothing persists until
// the user clicks Save, and "Unsaved changes" makes the draft/saved distinction
// explicit (autosave principle: preservation, not silent finalization).
function renderSettingsPage(section) {
  const api = window.revival.settings;

  const block = document.createElement('div');
  block.className = 'entry-form settings-block';

  const heading = document.createElement('h2');
  heading.className = 'settings-heading';
  heading.textContent = 'Project Rules';

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'Always-on guidance Claude receives with every request. Always visible here — there is no hidden project memory.';

  const textarea = document.createElement('textarea');
  textarea.rows = 16;
  textarea.placeholder =
    'Write the always-on rules Claude should follow for this project…';
  textarea.disabled = true;

  const save = document.createElement('button');
  save.type = 'button';
  save.textContent = 'Save Project Rules';
  save.disabled = true;

  const status = document.createElement('p');
  status.className = 'draft-status';

  let savedValue = '';

  function refreshDirty() {
    const dirty = textarea.value !== savedValue;
    save.disabled = !dirty;
    if (dirty) {
      setStatus(status, 'Unsaved changes — click “Save Project Rules”.');
    }
  }

  textarea.addEventListener('input', refreshDirty);

  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      await api.setProjectRules(textarea.value);
      savedValue = textarea.value;
      setStatus(status, 'Saved. These rules persist across restarts.');
    } catch (err) {
      setStatus(status, `Could not save: ${err.message || err}`);
    }
    refreshDirty();
  });

  block.append(heading, desc, textarea, save, status);
  section.appendChild(block);

  (async () => {
    try {
      savedValue = (await api.getProjectRules()) || '';
      textarea.value = savedValue;
      setStatus(status, savedValue ? 'Loaded saved rules.' : 'No rules saved yet.');
    } catch (err) {
      setStatus(status, `Could not load rules: ${err.message || err}`);
    }
    textarea.disabled = false;
    refreshDirty();
  })();

  // P39 — Claude API key block.
  renderApiKeyBlock(section);

  renderManageTags(section);
  renderNeedsAttentionSettings(section);
  renderPanicExport(section);
  renderCanonExport(section);
  renderSessionLog(section);
}

// --- Settings: Session Log (PSESSION-LOG) ------------------------------------
// Audit trail of actions per session. Auto-saved on app close; "End Session"
// button saves immediately and starts a fresh one. Read-only — export as text.
function renderSessionLog(section) {
  const block = document.createElement('div');
  block.className = 'entry-form settings-block';

  const heading = document.createElement('h2');
  heading.className = 'settings-heading';
  heading.textContent = 'Session Log';

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'Audit trail of actions taken each session. Saved automatically when the app closes. ' +
    'Use "End Session" to save the current session and start a fresh one without closing.';

  const endBtn = document.createElement('button');
  endBtn.type = 'button';
  endBtn.className = 'btn-secondary';
  endBtn.textContent = 'End Session & Save Log';

  const endStatus = document.createElement('p');
  endStatus.className = 'draft-status';

  const logList = document.createElement('div');
  logList.className = 'session-log-list';

  async function renderLogs() {
    logList.innerHTML = '';
    let logs;
    try {
      logs = await window.revival.sessionLog.list();
    } catch {
      const errEl = document.createElement('p');
      errEl.className = 'settings-desc';
      errEl.textContent = 'Could not load session logs.';
      logList.appendChild(errEl);
      return;
    }
    if (!logs.length) {
      const emptyEl = document.createElement('p');
      emptyEl.className = 'settings-desc';
      emptyEl.textContent = 'No sessions recorded yet. Logs appear here after the app is closed or "End Session" is used.';
      logList.appendChild(emptyEl);
      return;
    }
    for (const log of logs) logList.appendChild(buildLogCard(log));
  }

  function buildLogCard(log) {
    const card = document.createElement('div');
    card.className = 'session-log-card';

    const start = new Date(log.started_at);
    const end   = new Date(log.ended_at);
    const ms    = end - start;
    const h     = Math.floor(ms / 3600000);
    const m     = Math.floor((ms % 3600000) / 60000);
    const dur   = h > 0 ? `${h}h ${m}m` : `${m}m`;
    const fmtDate = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    const header = document.createElement('div');
    header.className = 'session-log-card-header';

    const dateSpan = document.createElement('span');
    dateSpan.className = 'session-log-date';
    dateSpan.textContent = `${fmtDate}  ${fmtTime(start)} – ${fmtTime(end)}  (${dur})`;

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'btn-secondary session-log-export-btn';
    exportBtn.textContent = 'Export .txt';
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      try { await window.revival.sessionLog.export(log.id); }
      finally { exportBtn.disabled = false; }
    });

    header.append(dateSpan, exportBtn);

    // Group events by workspace → action → count
    const groups = {};
    for (const e of log.events) {
      if (!groups[e.workspace]) groups[e.workspace] = {};
      groups[e.workspace][e.action] = (groups[e.workspace][e.action] || 0) + 1;
    }

    const summary = document.createElement('div');
    summary.className = 'session-log-summary';
    for (const [ws, actions] of Object.entries(groups)) {
      const row = document.createElement('div');
      row.className = 'session-log-ws-row';
      const label = document.createElement('span');
      label.className = 'session-log-ws-label';
      label.textContent = ws;
      const acts = document.createElement('span');
      acts.textContent = Object.entries(actions)
        .map(([a, c]) => `${c} ${a}`)
        .join(' · ');
      row.append(label, acts);
      summary.appendChild(row);
    }

    const total = document.createElement('div');
    total.className = 'session-log-total';
    total.textContent = `${log.events.length} action(s) total`;

    card.append(header, summary, total);
    return card;
  }

  endBtn.addEventListener('click', async () => {
    endBtn.disabled = true;
    try {
      const { saved } = await window.revival.sessionLog.finalize();
      if (saved) {
        setStatus(endStatus, 'Session saved. Fresh session started.');
        await renderLogs();
      } else {
        setStatus(endStatus, 'No actions recorded this session — nothing to save yet.');
      }
    } catch (err) {
      setStatus(endStatus, `Could not save: ${err.message || err}`);
    } finally {
      endBtn.disabled = false;
    }
  });

  block.append(heading, desc, endBtn, endStatus, logList);
  section.appendChild(block);

  renderLogs();
}

// --- Settings: Needs Attention thresholds (PHOME-NEEDS) --------------------
// Three number inputs, persisted in localStorage. Defaults match the spec.
function renderNeedsAttentionSettings(section) {
  const block = document.createElement('div');
  block.className = 'entry-form settings-block';

  const heading = document.createElement('h2');
  heading.className = 'settings-heading';
  heading.textContent = 'Needs Attention Thresholds';

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'Controls three staleness thresholds: when items appear in the Needs Attention panel on Home, when nav badges show an age suffix, and when list items show a staleness marker. Changes take effect immediately.';

  const fields = [
    { key: 'tier1QuestionDays', label: 'Tier-1 Open Questions (days without update)' },
    { key: 'conflictDays',      label: 'Conflicts (days open)' },
    { key: 'canonReviewDays',   label: 'Canon Review proposals (days pending)' },
  ];

  const thresholds = getNeedsThresholds();
  const inputs = {};
  const fieldWrap = document.createElement('div');
  fieldWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:8px;';

  for (const f of fields) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:13px;';

    const labelText = document.createElement('span');
    labelText.style.flex = '1';
    labelText.textContent = f.label;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '365';
    input.value = String(thresholds[f.key]);
    input.style.cssText = 'width:60px;padding:3px 6px;font:inherit;';
    inputs[f.key] = input;

    const unit = document.createElement('span');
    unit.textContent = 'd';
    unit.style.color = 'var(--muted)';

    row.append(labelText, input, unit);
    fieldWrap.appendChild(row);
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save Thresholds';
  saveBtn.style.marginTop = '10px';

  const statusEl = document.createElement('p');
  statusEl.className = 'draft-status';

  saveBtn.addEventListener('click', () => {
    const updates = {};
    let valid = true;
    for (const f of fields) {
      const v = parseInt(inputs[f.key].value, 10);
      if (!Number.isFinite(v) || v < 1) {
        setStatus(statusEl, `"${f.label}" must be a number ≥ 1.`);
        valid = false;
        break;
      }
      updates[f.key] = v;
    }
    if (!valid) return;
    setNeedsThresholds(updates);
    setStatus(statusEl, 'Saved. Takes effect on next Home visit.');
  });

  block.append(heading, desc, fieldWrap, saveBtn, statusEl);
  section.appendChild(block);
}

// --- Settings: Manage Tags (PTAGDEL) ---------------------------------------
// Lists every tag. User-created tags can be renamed in place (across all
// entries) or deleted (unlinked from every entry everywhere, then removed).
// Seeded tags are immutable here — no rename, no delete affordance — per the
// tag rules. Delete asks for confirmation and shows the usage count first.
function renderManageTags(section) {
  const api = window.revival.tags;

  const block = document.createElement('div');
  block.className = 'entry-form settings-block';

  // Collapsed by default — the tag library can be long. Expanding reveals a
  // search box that filters the list as you type (name, case-insensitive).
  const details = document.createElement('details');
  details.className = 'tag-manage-details';

  const summary = document.createElement('summary');
  summary.className = 'settings-heading tag-manage-summary';
  summary.textContent = 'Manage Tags';
  details.appendChild(summary);

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'Rename or delete the tags you created. Renaming updates the tag everywhere ' +
    'it is used. Deleting removes it from every entry across all workspaces. ' +
    'Seeded tags cannot be renamed or deleted.';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'tag-manage-search';
  search.placeholder = 'Search tags…';
  search.addEventListener('input', render);

  const status = document.createElement('p');
  status.className = 'draft-status';

  const listHost = document.createElement('div');
  listHost.className = 'tag-manage-list';

  details.append(desc, search, status, listHost);
  block.appendChild(details);
  section.appendChild(block);

  let library = [];

  // Re-fetch from the db, then render through the current search filter.
  async function reload() {
    try {
      library = await api.listAll();
    } catch (err) {
      setStatus(status, `Could not load tags: ${err.message || err}`);
      return;
    }
    render();
  }

  // Render the cached library filtered by the search box. Pure DOM rebuild;
  // reload() handles re-fetching after a rename/delete.
  function render() {
    const q = search.value.trim().toLowerCase();
    const matches = q
      ? library.filter((t) => t.name.toLowerCase().includes(q))
      : library;

    listHost.innerHTML = '';
    if (!library.length) {
      const empty = document.createElement('p');
      empty.className = 'settings-desc';
      empty.textContent = 'No tags yet.';
      listHost.appendChild(empty);
      return;
    }
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'settings-desc';
      empty.textContent = `No tags match “${search.value.trim()}”.`;
      listHost.appendChild(empty);
      return;
    }
    for (const tag of matches) {
      listHost.appendChild(renderRow(tag));
    }
  }

  function renderRow(tag) {
    const row = document.createElement('div');
    row.className = 'tag-manage-row';

    const name = document.createElement('span');
    name.className = 'tag-manage-name';
    name.textContent = tag.name;
    row.appendChild(name);

    if (tag.is_seed) {
      const badge = document.createElement('span');
      badge.className = 'tag-manage-seed';
      badge.textContent = 'seeded';
      badge.title = 'Seeded tags cannot be renamed or deleted.';
      row.appendChild(badge);
      return row;
    }

    const actions = document.createElement('div');
    actions.className = 'tag-manage-actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () =>
      startRename(row, tag, actions)
    );

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () =>
      startDelete(row, tag, actions)
    );

    actions.append(renameBtn, deleteBtn);
    row.appendChild(actions);
    return row;
  }

  // Inline rename: swap the action buttons for an input + Save/Cancel.
  function startRename(row, tag, actions) {
    actions.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-manage-input';
    input.value = tag.name;

    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', reload);

    async function commit() {
      const next = input.value.trim();
      if (!next || next.toLowerCase() === tag.name.toLowerCase()) {
        reload();
        return;
      }
      save.disabled = true;
      try {
        await api.rename(tag.id, next);
        if (window.RevivalTags) window.RevivalTags.clearCache();
        setStatus(status, `Renamed “${tag.name}” to “${next.toLowerCase()}”.`);
        reload();
      } catch (err) {
        save.disabled = false;
        setStatus(status, `Could not rename: ${err.message || err}`);
      }
    }

    save.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') reload();
    });

    actions.append(input, save, cancel);
    input.focus();
    input.select();
  }

  // Inline delete: fetch usage, show the count, require an explicit confirm.
  async function startDelete(row, tag, actions) {
    actions.innerHTML = '';
    const loading = document.createElement('span');
    loading.className = 'tag-manage-confirm-text';
    loading.textContent = 'Checking usage…';
    actions.appendChild(loading);

    let usage = { entries: 0, workspaces: 0 };
    try {
      usage = await api.usage(tag.id);
    } catch (err) {
      setStatus(status, `Could not check usage: ${err.message || err}`);
      reload();
      return;
    }

    actions.innerHTML = '';
    const text = document.createElement('span');
    text.className = 'tag-manage-confirm-text';
    text.textContent =
      usage.entries === 0
        ? `“${tag.name}” is not used on any entries. Delete it?`
        : `Delete “${tag.name}”? Used on ${usage.entries} ` +
          `entr${usage.entries === 1 ? 'y' : 'ies'} across ` +
          `${usage.workspaces} workspace${usage.workspaces === 1 ? '' : 's'}. ` +
          `This unlinks it from all of them.`;

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'danger';
    confirm.textContent = 'Delete';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', reload);

    confirm.addEventListener('click', async () => {
      confirm.disabled = true;
      try {
        await api.remove(tag.id);
        if (window.RevivalTags) window.RevivalTags.clearCache();
        setStatus(status, `Deleted “${tag.name}”.`);
        reload();
      } catch (err) {
        confirm.disabled = false;
        setStatus(status, `Could not delete: ${err.message || err}`);
      }
    });

    actions.append(text, confirm, cancel);
  }

  reload();
}

// --- Panic Export (P21 / P20v2) --------------------------------------------
// One click saves a complete copy of everything — the full database, every
// Source Material entry as a .txt, every Canon entry as a .txt, all proposals
// as proposals.json, and all tags as tags.json — into a timestamped folder.
// Copy-only: nothing in the app is deleted, archived, or finalized.
function renderPanicExport(section) {
  const block = document.createElement('div');
  block.className = 'entry-form settings-block';

  const heading = document.createElement('h2');
  heading.className = 'settings-heading';
  heading.textContent = 'Panic Export';

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'Save a complete copy of everything — the full database, every Source ' +
    'Material entry as a text file, every Canon entry as a text file, all ' +
    'proposals, and all tags — into a timestamped folder under ' +
    'Documents/revival-bible-studio/panic_exports. This only copies: nothing ' +
    'here is deleted or changed.';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Run Panic Export…';

  const status = document.createElement('p');
  status.className = 'draft-status';

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    setStatus(status, 'Exporting…');
    try {
      const res = await window.revival.panic.export();
      if (res.canceled) {
        setStatus(status, 'Export canceled — nothing was written.');
      } else {
        setStatus(
          status,
          `Exported: ${res.sources} source(s), ${res.canonEntries} canon entry(s), ` +
          `${res.proposals} proposal(s), ${res.tags} tag(s). Folder: ${res.folder}`
        );
      }
    } catch (err) {
      setStatus(status, `Export failed: ${err.message || err}`);
    }
    btn.disabled = false;
  });

  block.append(heading, desc, btn, status);
  section.appendChild(block);
}

// --- Canon Bible Export (PEXPORT) ------------------------------------------
// Generates a clean readable export of approved canon filtered by entry type,
// character, or season — or all at once. Writes markdown + PDF into a
// timestamped folder under ~/Documents/revival-bible-studio/canon_exports/.
// Filter dropdowns are populated lazily from canon.list() the first time the
// user changes the filter-by selector.
function renderCanonExport(section) {
  const block = document.createElement('div');
  block.className = 'entry-form settings-block';

  const heading = document.createElement('h2');
  heading.className = 'settings-heading';
  heading.textContent = 'Canon Bible Export';

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'Export a clean, readable copy of approved canon entries as Markdown and PDF. ' +
    'Filter by entry type, character, or season, or export everything at once. ' +
    'Files are saved to Documents/revival-bible-studio/canon_exports/.';

  // Filter-by selector
  const filterRow = document.createElement('div');
  filterRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;';

  const filterLabel = document.createElement('label');
  filterLabel.textContent = 'Filter by:';
  filterLabel.style.fontWeight = 'bold';

  const filterBy = document.createElement('select');
  ['all', 'entry_type', 'character', 'season'].forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = { all: 'All entries', entry_type: 'Entry type', character: 'Character', season: 'Season' }[v];
    filterBy.appendChild(opt);
  });

  const filterValue = document.createElement('select');
  filterValue.style.display = 'none';

  filterRow.append(filterLabel, filterBy, filterValue);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Export (Markdown + PDF)…';

  const status = document.createElement('p');
  status.className = 'draft-status';

  // Populated once, on first non-"all" selection.
  let canonEntries = null;

  const ENTRY_TYPES = [
    'character', 'season', 'episode', 'locked_scene', 'locked_line',
    'locked_decision', 'knowledge_state', 'timeline_event', 'viral_phase',
    'virus_rule', 'institution', 'location', 'motif', 'theme',
    'production_rule', 'principle', 'rewatch_beat', 'relationship',
  ];
  const TYPE_LABELS = {
    character: 'Character', season: 'Season', episode: 'Episode',
    locked_scene: 'Locked Scene', locked_line: 'Locked Line',
    locked_decision: 'Locked Decision', knowledge_state: 'Knowledge State',
    timeline_event: 'Timeline Event', viral_phase: 'Viral Phase',
    virus_rule: 'Virus Rule', institution: 'Institution', location: 'Location',
    motif: 'Motif', theme: 'Theme', production_rule: 'Production Rule',
    principle: 'Principle', rewatch_beat: 'Rewatch Beat', relationship: 'Relationship',
  };

  async function populateFilterValue(kind) {
    filterValue.innerHTML = '';
    if (kind === 'all') {
      filterValue.style.display = 'none';
      return;
    }
    filterValue.style.display = '';

    if (kind === 'entry_type') {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— pick a type —';
      filterValue.appendChild(placeholder);
      ENTRY_TYPES.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = TYPE_LABELS[t] || t;
        filterValue.appendChild(opt);
      });
      return;
    }

    // character or season — need the live list
    if (!canonEntries) {
      try {
        canonEntries = await window.revival.canon.list();
      } catch {
        canonEntries = [];
      }
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = kind === 'character' ? '— pick a character —' : '— pick a season —';
    filterValue.appendChild(placeholder);

    const filtered = canonEntries.filter((e) => e.entry_type === kind);
    if (filtered.length === 0) {
      const empty = document.createElement('option');
      empty.disabled = true;
      empty.textContent = `No ${kind} entries in Canon Bible yet`;
      filterValue.appendChild(empty);
    }
    for (const e of filtered) {
      const opt = document.createElement('option');
      opt.value = String(e.id);
      const displayName =
        (kind === 'character' && e.detail && e.detail.display_name)
          ? `${e.title} (${e.detail.display_name})`
          : kind === 'season' && e.detail && e.detail.season_number != null
          ? `Season ${e.detail.season_number} — ${e.title}`
          : e.title || `#${e.id}`;
      opt.textContent = displayName;
      filterValue.appendChild(opt);
    }
  }

  filterBy.addEventListener('change', () => populateFilterValue(filterBy.value));

  btn.addEventListener('click', async () => {
    const kind = filterBy.value;
    const id = (kind !== 'all') ? filterValue.value : null;
    if (kind !== 'all' && !id) {
      setStatus(status, 'Pick a filter value before exporting.');
      return;
    }
    btn.disabled = true;
    setStatus(status, 'Exporting…');
    try {
      const params = { filterBy: kind, filterId: id || null };
      const res = await window.revival.canon.export(params);
      setStatus(
        status,
        `Exported "${res.title}" — ${res.count} entr${res.count === 1 ? 'y' : 'ies'}. ` +
        `Folder: ${res.folder}`
      );
    } catch (err) {
      setStatus(status, `Export failed: ${err.message || err}`);
    }
    btn.disabled = false;
  });

  block.append(heading, desc, filterRow, btn, status);
  section.appendChild(block);
}

// --- Import (PImp1) ---------------------------------------------------------
// Three-phase UI:
//   Phase 1 — pick a file (file dialog via IPC)
//   Phase 2 — preview parsed entries + conflict flags, then stage
//   Phase 3 — success screen with Go-to-Canon-Review shortcut

// ---- File parser ------------------------------------------------------------
// Tries four strategies in order, returning whichever yields ≥ 2 sections.

function _importParseMarkdown(lines) {
  const sections = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      if (cur) sections.push(cur);
      cur = { title: m[2].trim(), bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(line);
    }
  }
  if (cur) sections.push(cur);
  return sections.map((s) => ({
    title: s.title,
    body: s.bodyLines.join('\n').trim(),
  }));
}

function _importParseDividers(lines) {
  // A divider line is ≥ 8 chars of =, -, ─, or ━ (box-drawing dividers common
  // in the worldbuilding files).
  const isDivider = (l) => /^[=\-─━]{8,}\s*$/.test(l.trim());

  // Detect the triple pattern: DIVIDER → TITLE → DIVIDER → BODY (common in
  // worldbuilding files where each section header is sandwiched between two
  // rule lines). Collect the boundary positions first, then slice out bodies.
  const boundaries = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isDivider(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;
    if (j >= lines.length || isDivider(lines[j])) continue;
    const title = lines[j].trim();
    if (!title) continue;
    let k = j + 1;
    while (k < lines.length && lines[k].trim() === '') k++;
    if (k >= lines.length || !isDivider(lines[k])) continue;
    boundaries.push({ divider1: i, titleIdx: j, divider2: k, title });
    i = k;
  }

  if (boundaries.length === 0) {
    // Fallback: simple divider-flush (no triple pattern found)
    const sections = [];
    let pendingLines = [];
    function flush() {
      const nonEmpty = pendingLines.filter((l) => l.trim());
      if (!nonEmpty.length) { pendingLines = []; return; }
      const title = nonEmpty[0].trim();
      const body = nonEmpty.slice(1).join('\n').trim();
      if (title) sections.push({ title, body });
      pendingLines = [];
    }
    for (const raw of lines) {
      if (isDivider(raw)) flush();
      else pendingLines.push(raw.trimEnd());
    }
    flush();
    return sections;
  }

  return boundaries.map((b, idx) => {
    const bodyStart = b.divider2 + 1;
    const bodyEnd = idx + 1 < boundaries.length ? boundaries[idx + 1].divider1 : lines.length;
    const body = lines.slice(bodyStart, bodyEnd).join('\n').trim();
    return { title: b.title, body };
  });
}

function _importParseCapLines(lines) {
  // Capitalised heading lines: a line that is ALL CAPS (≥ 4 chars, no
  // trailing punctuation) or Title Case (every word capitalised) followed
  // by content. Used as a fallback for files without explicit dividers.
  const isHeading = (l) => {
    const t = l.trim();
    if (!t || t.length < 4) return false;
    if (/^[=\-─━\s]+$/.test(t)) return false; // skip divider-only lines
    // ALL CAPS
    if (t === t.toUpperCase() && /[A-Z]{2,}/.test(t) && !/[a-z]/.test(t)) return true;
    return false;
  };
  const sections = [];
  let cur = null;
  for (const raw of lines) {
    if (isHeading(raw)) {
      if (cur) sections.push(cur);
      cur = { title: raw.trim(), bodyLines: [] };
    } else if (cur) {
      cur.bodyLines.push(raw.trimEnd());
    }
  }
  if (cur) sections.push(cur);
  return sections.map((s) => ({
    title: s.title,
    body: s.bodyLines.join('\n').trim(),
  }));
}

function _importParseParagraphs(lines) {
  const chunks = [];
  let cur = [];
  for (const raw of lines) {
    if (raw.trim() === '') {
      if (cur.length) { chunks.push(cur); cur = []; }
    } else {
      cur.push(raw.trimEnd());
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks.map((ch) => ({
    title: ch[0].trim(),
    body: ch.slice(1).join('\n').trim(),
  }));
}

function parseWorldbuildingFile(content) {
  const lines = content.split('\n');

  const md = _importParseMarkdown(lines);
  if (md.length >= 2) return md;

  const div = _importParseDividers(lines);
  if (div.length >= 2) return div;

  const cap = _importParseCapLines(lines);
  if (cap.length >= 2) return cap;

  return _importParseParagraphs(lines);
}

// ---- Entry type heuristic --------------------------------------------------
// Very conservative — only fires on strong keywords so false positives stay low.
// The user can reassign type inside Canon Review before approving.
function _detectEntryType(title, body) {
  const text = `${title} ${body}`.toLowerCase();
  if (/\b(character|protagonist|antagonist)\b/.test(text)) return 'character';
  if (/\b(season \d+|s\d+ |s\d+e\d+)\b/.test(text)) return 'season';
  if (/\b(episode\s+\d+|ep\s+\d+|pilot|finale)\b/.test(text)) return 'episode';
  if (/\b(craft rule|production rule|camera rule|score rule|the rule|rule \d+)\b/.test(text)) return 'production_rule';
  if (/\bflanagan\b/.test(text)) return 'principle';
  if (/\bmotif\b/.test(text)) return 'motif';
  if (/\btheme\b/.test(text)) return 'theme';
  if (/\b(location|setting)\b/.test(text)) return 'location';
  if (/\b(institution|organization|fellowship|clinic|hospital)\b/.test(text)) return 'institution';
  if (/\b(timeline|timeline event)\b/.test(text)) return 'timeline_event';
  if (/\b(viral phase|phase \d)\b/.test(text)) return 'viral_phase';
  return null;
}

// ---- Main renderer ---------------------------------------------------------
function renderImportPage(section) {
  const wrap = document.createElement('div');
  wrap.className = 'entry-form settings-block';
  section.appendChild(wrap);

  // State shared across phases
  let currentFileName = '';
  let currentEntries = []; // annotated with conflicts[]

  function showPhase(el) {
    wrap.innerHTML = '';
    wrap.appendChild(el);
  }

  // ---- Phase 1: pick a file -------------------------------------------------
  function buildPhase1() {
    const div = document.createElement('div');

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent =
      'Load a worldbuilding text or Markdown file and stage its sections as ' +
      'pending proposals in Canon Review. Supported: .txt, .md. ' +
      'Each parsed section becomes one proposal. Entries that share a title ' +
      'with an existing canon entry are flagged before staging.';
    div.appendChild(desc);

    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.textContent = 'Pick a Worldbuilding File…';

    const status = document.createElement('p');
    status.className = 'draft-status';
    status.style.display = 'none';

    pickBtn.addEventListener('click', async () => {
      pickBtn.disabled = true;
      setStatus(status, 'Opening file picker…');
      try {
        const res = await window.revival.import.pickFile();
        if (res.canceled) {
          setStatus(status, '');
          pickBtn.disabled = false;
          return;
        }
        setStatus(status, 'Parsing file…');
        currentFileName = res.fileName;

        const raw = parseWorldbuildingFile(res.content);
        const withTypes = raw
          .filter((e) => e.title.trim())
          .map((e) => ({
            title: e.title,
            body: e.body || '',
            entry_type: _detectEntryType(e.title, e.body || ''),
          }));

        if (withTypes.length === 0) {
          setStatus(status, 'No sections detected in that file. Try a different format.');
          pickBtn.disabled = false;
          return;
        }

        setStatus(status, 'Checking for conflicts…');
        currentEntries = await window.revival.import.checkConflicts(withTypes);
        showPhase(buildPhase2());
      } catch (err) {
        setStatus(status, `Error: ${err.message || err}`);
        pickBtn.disabled = false;
      }
    });

    div.append(pickBtn, status);
    return div;
  }

  // ---- Phase 2: preview ----------------------------------------------------
  function buildPhase2() {
    const div = document.createElement('div');

    const fileBar = document.createElement('p');
    fileBar.style.cssText = 'font-weight:bold;margin-bottom:4px;';
    const conflictCount = currentEntries.filter((e) => e.conflicts && e.conflicts.length).length;
    fileBar.textContent = `${currentFileName}  ·  ${currentEntries.length} section${currentEntries.length !== 1 ? 's' : ''} parsed`;
    if (conflictCount) {
      const flag = document.createElement('span');
      flag.style.cssText = 'margin-left:10px;color:var(--warn,#e8a043);font-weight:normal;';
      flag.textContent = `⚠ ${conflictCount} possible conflict${conflictCount !== 1 ? 's' : ''}`;
      fileBar.appendChild(flag);
    }
    div.appendChild(fileBar);

    // PImp2: Type filter for the preview list. Filtering is display-only;
    // Stage always stages all currentEntries regardless of what's visible.
    // P45: rebuildFilterChips() is called after Claude suggestions are accepted
    // so chip counts stay accurate.
    let previewTypeFilter = '';

    // P45 — allowed canon entry types (mirrored from main.js CLASSIFY_TOOL).
    const IMPORT_TYPES = [
      'character', 'location', 'event', 'rule', 'theme', 'symbol',
      'relationship', 'faction', 'timeline_event', 'subplot', 'motif',
      'artifact', 'institution', 'dialogue_sample', 'world_rule',
      'belief_system', 'technology', 'misc',
    ];

    const previewFilterRow = document.createElement('div');
    previewFilterRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;';

    function rebuildFilterChips() {
      previewFilterRow.innerHTML = '';
      const types = [...new Set(currentEntries.map((e) => e.entry_type).filter(Boolean))].sort();
      if (types.length === 0) return;
      const fLabel = document.createElement('span');
      fLabel.style.cssText = 'font-size:0.85em;opacity:0.7;';
      fLabel.textContent = 'Show:';
      previewFilterRow.appendChild(fLabel);
      const allChip = document.createElement('button');
      allChip.type = 'button';
      allChip.className = 'status-badge cr-type-chip' + (previewTypeFilter === '' ? ' cr-type-chip-active' : '');
      allChip.textContent = `All (${currentEntries.length})`;
      allChip.dataset.type = '';
      previewFilterRow.appendChild(allChip);
      for (const t of types) {
        const count = currentEntries.filter((e) => e.entry_type === t).length;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'status-badge cr-type-chip' + (previewTypeFilter === t ? ' cr-type-chip-active' : '');
        chip.textContent = `${t.replace(/_/g, ' ')} (${count})`;
        chip.dataset.type = t;
        previewFilterRow.appendChild(chip);
      }
      const untypedCount = currentEntries.filter((e) => !e.entry_type).length;
      if (untypedCount > 0) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'status-badge cr-type-chip' + (previewTypeFilter === '__untyped__' ? ' cr-type-chip-active' : '');
        chip.textContent = `untyped (${untypedCount})`;
        chip.dataset.type = '__untyped__';
        previewFilterRow.appendChild(chip);
      }
    }
    rebuildFilterChips();

    previewFilterRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.cr-type-chip');
      if (!chip) return;
      previewTypeFilter = chip.dataset.type;
      for (const c of previewFilterRow.querySelectorAll('.cr-type-chip')) {
        c.classList.toggle('cr-type-chip-active', c.dataset.type === previewTypeFilter);
      }
      renderCards();
    });
    div.appendChild(previewFilterRow);

    const list = document.createElement('div');
    list.style.cssText =
      'border:1px solid var(--border,#444);border-radius:6px;max-height:420px;' +
      'overflow-y:auto;margin-bottom:10px;';

    function buildCard(entry, entryIndex) {
      const card = document.createElement('div');
      card.style.cssText = 'padding:10px 12px;border-bottom:1px solid var(--border,#333);';

      const titleRow = document.createElement('div');
      titleRow.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

      const titleSpan = document.createElement('span');
      titleSpan.style.fontWeight = 'bold';
      titleSpan.textContent = entry.title;
      titleRow.appendChild(titleSpan);

      if (entry.entry_type) {
        const typeBadge = document.createElement('span');
        typeBadge.className = 'status-badge';
        typeBadge.style.cssText = 'font-size:0.75em;opacity:0.8;';
        typeBadge.textContent = entry.entry_type.replace(/_/g, ' ');
        titleRow.appendChild(typeBadge);
      }

      if (entry.conflicts && entry.conflicts.length) {
        const cfBadge = document.createElement('span');
        cfBadge.className = 'status-badge status-sent-back';
        cfBadge.style.cssText = 'font-size:0.75em;';
        const names = entry.conflicts.map((c) => `"${c.title}" (${c.entry_type.replace(/_/g, ' ')})`).join(', ');
        cfBadge.textContent = `⚠ conflict: ${names}`;
        titleRow.appendChild(cfBadge);
      }

      card.appendChild(titleRow);

      if (entry.body) {
        const preview = document.createElement('p');
        preview.style.cssText =
          'margin:4px 0 0;font-size:0.85em;opacity:0.7;white-space:pre-wrap;' +
          'max-height:80px;overflow:hidden;text-overflow:ellipsis;';
        preview.textContent = entry.body.length > 200 ? entry.body.slice(0, 200) + '…' : entry.body;
        card.appendChild(preview);
      }

      // P45 — AI suggestion banner: shown while suggestion is pending (not yet accepted/skipped).
      if (entry.aiSuggestion && entry.aiSuggestion.state === 'pending') {
        const sugg = entry.aiSuggestion;
        const suggBanner = document.createElement('div');
        suggBanner.style.cssText =
          'margin-top:6px;padding:6px 8px;' +
          'background:rgba(74,158,255,0.08);border:1px solid var(--accent,#4a9eff);' +
          'border-radius:4px;font-size:0.85em;';

        const typeRow = document.createElement('div');
        typeRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;';

        const suggLabel = document.createElement('span');
        suggLabel.style.cssText = 'opacity:0.7;white-space:nowrap;';
        suggLabel.textContent = 'Claude suggests:';

        const typeSelect = document.createElement('select');
        typeSelect.style.cssText =
          'font-size:0.85em;padding:2px 4px;border-radius:3px;' +
          'background:var(--bg,#1a1a1a);color:var(--text,#ddd);border:1px solid var(--border,#444);';
        for (const t of IMPORT_TYPES) {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t.replace(/_/g, ' ');
          if (t === sugg.suggested_type) opt.selected = true;
          typeSelect.appendChild(opt);
        }

        const acceptBtn = document.createElement('button');
        acceptBtn.type = 'button';
        acceptBtn.className = 'btn-primary';
        acceptBtn.style.cssText = 'padding:2px 8px;font-size:0.8em;';
        acceptBtn.textContent = 'Accept';

        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'btn-secondary';
        skipBtn.style.cssText = 'padding:2px 8px;font-size:0.8em;';
        skipBtn.textContent = 'Skip';

        typeRow.append(suggLabel, typeSelect, acceptBtn, skipBtn);
        suggBanner.appendChild(typeRow);

        if (sugg.reason) {
          const reasonEl = document.createElement('div');
          reasonEl.style.cssText = 'opacity:0.65;font-style:italic;';
          reasonEl.textContent = sugg.reason;
          suggBanner.appendChild(reasonEl);
        }

        if (sugg.is_duplicate && sugg.duplicate_of_title) {
          const dupEl = document.createElement('div');
          dupEl.style.cssText = 'margin-top:4px;color:var(--warn,#e8a043);';
          dupEl.textContent = `⚠ Possible duplicate of existing proposal: "${sugg.duplicate_of_title}"`;
          suggBanner.appendChild(dupEl);

          // PAI-WIRE — P45→P43: conflict check button on duplicate-flagged import entries.
          const ccImportBtn = document.createElement('button');
          ccImportBtn.type = 'button';
          ccImportBtn.className = 'btn-secondary';
          ccImportBtn.style.cssText = 'font-size:0.8em;padding:2px 8px;margin-top:4px;';
          ccImportBtn.textContent = 'Run conflict check';
          ccImportBtn.title = 'Check this entry against locked canon for direct contradictions';
          suggBanner.appendChild(ccImportBtn);
          const ccImportResult = document.createElement('div');
          ccImportResult.className = 'cr-conflict-area';
          ccImportResult.style.cssText = 'margin-top:4px;font-size:0.85em;';
          ccImportResult.hidden = true;
          suggBanner.appendChild(ccImportResult);

          ccImportBtn.addEventListener('click', async () => {
            ccImportBtn.disabled = true;
            ccImportBtn.textContent = 'Checking…';
            ccImportResult.hidden = false;
            ccImportResult.innerHTML = '';
            const checking = document.createElement('p');
            checking.className = 'cr-conflict-status';
            checking.textContent = 'Checking against locked canon entries…';
            ccImportResult.appendChild(checking);
            try {
              const ccModel = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
                ? chatModelSelect.value : 'claude-sonnet-4-6';
              const ccRes = await window.revival.claude.conflictCheckText(
                { title: entry.title, body: entry.body || '' },
                ccModel
              );
              ccImportResult.innerHTML = '';
              const ccSum = document.createElement('p');
              ccSum.className = 'cr-conflict-status';
              if (ccRes.skipped) {
                ccSum.textContent = 'No content to check.';
              } else if (ccRes.checkedCount === 0) {
                ccSum.textContent = 'No locked canon entries to check against.';
              } else if (ccRes.flags.length === 0) {
                ccSum.textContent =
                  `No contradictions (checked ${ccRes.checkedCount} locked entr${ccRes.checkedCount === 1 ? 'y' : 'ies'}).`;
              } else {
                ccSum.textContent =
                  `${ccRes.flags.length} contradiction${ccRes.flags.length === 1 ? '' : 's'} flagged:`;
                ccImportResult.appendChild(ccSum);
                for (const f of ccRes.flags) {
                  const fEl = document.createElement('div');
                  fEl.className = 'cr-conflict-flag';
                  const lbl = document.createElement('strong');
                  lbl.textContent = `${f.tcode} — ${f.title}`;
                  const rsn = document.createElement('p');
                  rsn.className = 'cr-conflict-reason';
                  rsn.textContent = f.reason;
                  fEl.append(lbl, rsn);
                  ccImportResult.appendChild(fEl);
                }
                return;
              }
              ccImportResult.appendChild(ccSum);
            } catch (ccErr) {
              ccImportResult.innerHTML = '';
              const errEl = document.createElement('p');
              errEl.className = 'cr-conflict-status';
              const cleanErr = (ccErr.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
              errEl.textContent = `Error: ${cleanErr || 'Check failed.'}`;
              ccImportResult.appendChild(errEl);
            } finally {
              ccImportBtn.disabled = false;
              ccImportBtn.textContent = 'Run conflict check';
            }
          });
        }

        acceptBtn.addEventListener('click', () => {
          currentEntries[entryIndex].entry_type = typeSelect.value;
          currentEntries[entryIndex].aiSuggestion.state = 'accepted';
          rebuildFilterChips();
          renderCards();
        });
        skipBtn.addEventListener('click', () => {
          currentEntries[entryIndex].aiSuggestion.state = 'skipped';
          renderCards();
        });

        card.appendChild(suggBanner);
      } else if (
        entry.aiSuggestion &&
        entry.aiSuggestion.is_duplicate &&
        entry.aiSuggestion.duplicate_of_title
      ) {
        // Keep showing the duplicate warning even after accept/skip.
        const dupEl = document.createElement('div');
        dupEl.style.cssText = 'margin-top:4px;color:var(--warn,#e8a043);font-size:0.85em;';
        dupEl.textContent = `⚠ Possible duplicate of existing proposal: "${entry.aiSuggestion.duplicate_of_title}"`;
        card.appendChild(dupEl);

        // PAI-WIRE — P45→P43: conflict check button (persistent, post-accept/skip).
        const ccPersistBtn = document.createElement('button');
        ccPersistBtn.type = 'button';
        ccPersistBtn.className = 'btn-secondary';
        ccPersistBtn.style.cssText = 'font-size:0.8em;padding:2px 8px;margin-top:4px;';
        ccPersistBtn.textContent = 'Run conflict check';
        ccPersistBtn.title = 'Check this entry against locked canon for direct contradictions';
        card.appendChild(ccPersistBtn);
        const ccPersistResult = document.createElement('div');
        ccPersistResult.className = 'cr-conflict-area';
        ccPersistResult.style.cssText = 'margin-top:4px;font-size:0.85em;';
        ccPersistResult.hidden = true;
        card.appendChild(ccPersistResult);

        ccPersistBtn.addEventListener('click', async () => {
          ccPersistBtn.disabled = true;
          ccPersistBtn.textContent = 'Checking…';
          ccPersistResult.hidden = false;
          ccPersistResult.innerHTML = '';
          const checking = document.createElement('p');
          checking.className = 'cr-conflict-status';
          checking.textContent = 'Checking against locked canon entries…';
          ccPersistResult.appendChild(checking);
          try {
            const ccModel = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
              ? chatModelSelect.value : 'claude-sonnet-4-6';
            const ccRes = await window.revival.claude.conflictCheckText(
              { title: entry.title, body: entry.body || '' },
              ccModel
            );
            ccPersistResult.innerHTML = '';
            const ccSum = document.createElement('p');
            ccSum.className = 'cr-conflict-status';
            if (ccRes.skipped) {
              ccSum.textContent = 'No content to check.';
            } else if (ccRes.checkedCount === 0) {
              ccSum.textContent = 'No locked canon entries to check against.';
            } else if (ccRes.flags.length === 0) {
              ccSum.textContent =
                `No contradictions (checked ${ccRes.checkedCount} locked entr${ccRes.checkedCount === 1 ? 'y' : 'ies'}).`;
            } else {
              ccSum.textContent =
                `${ccRes.flags.length} contradiction${ccRes.flags.length === 1 ? '' : 's'} flagged:`;
              ccPersistResult.appendChild(ccSum);
              for (const f of ccRes.flags) {
                const fEl = document.createElement('div');
                fEl.className = 'cr-conflict-flag';
                const lbl = document.createElement('strong');
                lbl.textContent = `${f.tcode} — ${f.title}`;
                const rsn = document.createElement('p');
                rsn.className = 'cr-conflict-reason';
                rsn.textContent = f.reason;
                fEl.append(lbl, rsn);
                ccPersistResult.appendChild(fEl);
              }
              return;
            }
            ccPersistResult.appendChild(ccSum);
          } catch (ccErr) {
            ccPersistResult.innerHTML = '';
            const errEl = document.createElement('p');
            errEl.className = 'cr-conflict-status';
            const cleanErr = (ccErr.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
            errEl.textContent = `Error: ${cleanErr || 'Check failed.'}`;
            ccPersistResult.appendChild(errEl);
          } finally {
            ccPersistBtn.disabled = false;
            ccPersistBtn.textContent = 'Run conflict check';
          }
        });
      }

      return card;
    }

    function renderCards() {
      list.innerHTML = '';
      // P45: track original index so buildCard can write back to currentEntries.
      const filteredWithIdx = currentEntries
        .map((e, i) => ({ e, i }))
        .filter(({ e }) =>
          previewTypeFilter === '' ? true :
          previewTypeFilter === '__untyped__' ? !e.entry_type :
          e.entry_type === previewTypeFilter
        );
      if (filteredWithIdx.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'placeholder';
        empty.style.cssText = 'padding:20px;text-align:center;';
        empty.textContent = 'No entries match this filter.';
        list.appendChild(empty);
      } else {
        for (let j = 0; j < filteredWithIdx.length; j++) {
          const { e, i } = filteredWithIdx[j];
          const card = buildCard(e, i);
          if (j === filteredWithIdx.length - 1) card.style.borderBottom = 'none';
          list.appendChild(card);
        }
      }
    }
    renderCards();
    div.appendChild(list);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.textContent = '← Back';
    backBtn.className = 'btn-secondary';

    const stageBtn = document.createElement('button');
    stageBtn.type = 'button';
    stageBtn.textContent = `Stage ${currentEntries.length} as Proposals`;

    const status = document.createElement('p');
    status.className = 'draft-status';
    status.style.display = 'none';

    backBtn.addEventListener('click', () => showPhase(buildPhase1()));

    stageBtn.addEventListener('click', async () => {
      stageBtn.disabled = true;
      backBtn.disabled = true;
      setStatus(status, 'Staging…');
      try {
        // Annotate conflict entries with a note so Canon Review surfaces the flag.
        const toStage = currentEntries.map((e) => {
          let conflictNote = null;
          if (e.conflicts && e.conflicts.length) {
            const names = e.conflicts
              .map((c) => `"${c.title}" (id: ${c.id}, type: ${c.entry_type})`)
              .join('; ');
            conflictNote = `⚠ Possible conflict with existing canon: ${names}`;
          }
          return { ...e, conflictNote };
        });
        const result = await window.revival.import.stageEntries(toStage, currentFileName);
        refreshNavBadges();
        showPhase(buildPhase3(result.staged, conflictCount));
      } catch (err) {
        setStatus(status, `Error: ${err.message || err}`);
        stageBtn.disabled = false;
        backBtn.disabled = false;
      }
    });

    // P45 — Ask Claude to suggest types for all entries and flag duplicates.
    const claudeBtn = document.createElement('button');
    claudeBtn.type = 'button';
    claudeBtn.className = 'btn-secondary';
    claudeBtn.textContent = 'Ask Claude for type suggestions';

    claudeBtn.addEventListener('click', async () => {
      claudeBtn.disabled = true;
      claudeBtn.textContent = 'Asking Claude…';
      setStatus(status, '');
      try {
        const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
          ? chatModelSelect.value : 'claude-sonnet-4-6';
        const payload = currentEntries.map((e) => ({
          title: e.title,
          body: e.body || '',
          entry_type: e.entry_type || null,
        }));
        const result = await window.revival.claude.importAssist(payload, model);
        for (const sugg of result.suggestions || []) {
          const idx = sugg.index;
          if (typeof idx === 'number' && idx >= 0 && idx < currentEntries.length) {
            currentEntries[idx].aiSuggestion = {
              state: 'pending',
              suggested_type: sugg.suggested_type || null,
              reason: sugg.reason || '',
              is_duplicate: !!sugg.is_duplicate,
              duplicate_of_title: sugg.duplicate_of_title || null,
            };
          }
        }
        rebuildFilterChips();
        renderCards();
        claudeBtn.textContent = 'Re-run Claude suggestions';
      } catch (err) {
        const raw = err.message || 'Request failed';
        const clean = raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
        setStatus(status, `Claude: ${clean}`);
        claudeBtn.textContent = 'Ask Claude for type suggestions';
      } finally {
        claudeBtn.disabled = false;
      }
    });

    btnRow.append(backBtn, claudeBtn, stageBtn, status);
    div.appendChild(btnRow);
    return div;
  }

  // ---- Phase 3: done -------------------------------------------------------
  function buildPhase3(staged, flagged) {
    const div = document.createElement('div');

    const msg = document.createElement('p');
    msg.style.cssText = 'font-weight:bold;margin-bottom:6px;';
    msg.textContent =
      `${staged} proposal${staged !== 1 ? 's' : ''} staged in Canon Review.`;
    div.appendChild(msg);

    if (flagged) {
      const warn = document.createElement('p');
      warn.style.cssText = 'color:var(--warn,#e8a043);margin-bottom:10px;';
      warn.textContent =
        `${flagged} entr${flagged !== 1 ? 'ies' : 'y'} flagged as possible conflicts — ` +
        'check the proposer note in Canon Review before approving.';
      div.appendChild(warn);
    }

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';

    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.textContent = 'Go to Canon Review';
    goBtn.addEventListener('click', () => route('Canon Review'));

    const againBtn = document.createElement('button');
    againBtn.type = 'button';
    againBtn.textContent = 'Import Another File';
    againBtn.className = 'btn-secondary';
    againBtn.addEventListener('click', () => showPhase(buildPhase1()));

    btnRow.append(goBtn, againBtn);
    div.appendChild(btnRow);
    return div;
  }

  showPhase(buildPhase1());
}

// --- Writing Lab (P28) ------------------------------------------------------
// The long-form drafting surface. Unlike the entry workspaces (explicit "Add"/
// "Save" to finalize), Writing Lab autosaves continuously to SQLite as you
// type — so quitting mid-sentence and reopening restores the draft intact. That
// is draft preservation, not finalization (per CLAUDE.md): drafts simply live
// here; nothing leaves Writing Lab or becomes canon without an explicit action
// in a later phase. The page swaps between a drafts LIST and a single-draft
// EDITOR, both mounted in `wrap` so navigation stays inside the one page.
function wordCount(text) {
  const m = String(text || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

function renderWritingLabPage(section) {
  const api = window.revival.writingLab;

  const intro = document.createElement('p');
  intro.className = 'settings-desc wl-intro';
  intro.textContent =
    'Long-form drafting. Write freely — your work autosaves as you type and is ' +
    'preserved across restarts. Drafts stay here in Writing Lab; nothing is ' +
    'finalized, routed, or made canon unless you do it explicitly.';
  section.appendChild(intro);

  // Two-column shell (PUI1).
  const layout = document.createElement('div');
  layout.className = 'tc-layout';
  const leftCol = document.createElement('div');
  leftCol.className = 'tc-left';
  const rightCol = document.createElement('div');
  rightCol.className = 'tc-right';
  layout.append(leftCol, rightCol);
  section.appendChild(layout);

  // selectedId: null = empty state; 'new' = fresh editor; <id> = open existing.
  let selectedId = null;
  let activeItems = [];
  let archivedItems = [];
  // PTAG state for the drafts list — same pattern as makeEntryWorkspace.
  let tagsById = {};
  let tagFilter = new Set();
  // Active editor's flushNow, if any — so list/header actions can commit
  // pending edits before switching away from the current draft.
  let activeFlush = null;

  // PTAG filter bar above the drafts list (left column).
  if (window.RevivalTags) {
    const fc = window.RevivalTags.mountFilterBar(leftCol, 'writing_lab', {
      onChange: (sel) => {
        tagFilter = sel;
        renderList();
      },
    });
    tagFilter = fc.selected;
  }

  function snippet(body) {
    const oneLine = String(body || '').replace(/\s+/g, ' ').trim();
    return oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
  }

  function findItem(id) {
    return (
      activeItems.find((i) => i.id === id) ||
      archivedItems.find((i) => i.id === id) ||
      null
    );
  }

  function isArchived(item) {
    return !!(item && item.archived_at);
  }

  // Left column: + New draft, list, archived collapsed.
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tc-add';
  addBtn.textContent = '+ New draft';
  addBtn.addEventListener('click', async () => {
    if (selectedId === 'new') return;
    if (activeFlush) await activeFlush();
    selectedId = 'new';
    renderList();
    renderDetail();
  });
  leftCol.appendChild(addBtn);

  const list = document.createElement('div');
  list.className = 'tc-list';
  leftCol.appendChild(list);

  const archived = document.createElement('details');
  archived.className = 'tc-archived-section';
  const archivedSummary = document.createElement('summary');
  archived.appendChild(archivedSummary);

  // PPOL1: Bulk delete toolbar for Writing Lab archived section
  const archiveBulkBar = document.createElement('div');
  archiveBulkBar.className = 'tc-archive-bulk-bar';
  const deleteSelectedBtn = document.createElement('button');
  deleteSelectedBtn.type = 'button';
  deleteSelectedBtn.className = 'btn-danger btn-sm';
  deleteSelectedBtn.textContent = 'Delete Selected';
  deleteSelectedBtn.disabled = true;
  const deleteAllBtn = document.createElement('button');
  deleteAllBtn.type = 'button';
  deleteAllBtn.className = 'btn-danger btn-sm';
  deleteAllBtn.textContent = 'Delete All';
  deleteAllBtn.disabled = true;

  function renderBulkBar() {
    archiveBulkBar.innerHTML = '';
    archiveBulkBar.append(deleteSelectedBtn, deleteAllBtn);
  }
  renderBulkBar();

  function showBulkDeleteConfirm(getIds, label) {
    archiveBulkBar.innerHTML = '';
    const text = document.createElement('span');
    text.className = 'confirm-text';
    text.textContent = `Delete ${label}? This cannot be undone.`;
    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'btn-danger btn-sm';
    yesBtn.textContent = 'Delete';
    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'btn-secondary btn-sm';
    noBtn.textContent = 'Cancel';
    noBtn.addEventListener('click', renderBulkBar);
    yesBtn.addEventListener('click', async () => {
      yesBtn.disabled = true;
      noBtn.disabled = true;
      try {
        const ids = getIds();
        for (const id of ids) {
          if (id === selectedId) { selectedId = null; showEmpty(); }
          await api.delete(id);
        }
        await loadList();
      } catch {
        renderBulkBar();
      }
    });
    archiveBulkBar.append(text, yesBtn, noBtn);
  }

  deleteSelectedBtn.addEventListener('click', () => {
    const ids = Array.from(archivedListEl.querySelectorAll('.tc-archive-check:checked'))
      .map((cb) => Number(cb.dataset.id));
    if (!ids.length) return;
    showBulkDeleteConfirm(
      () => Array.from(archivedListEl.querySelectorAll('.tc-archive-check:checked')).map((cb) => Number(cb.dataset.id)),
      `${ids.length} archived ${ids.length === 1 ? 'draft' : 'drafts'}`
    );
  });

  deleteAllBtn.addEventListener('click', () => {
    const ids = Array.from(archivedListEl.querySelectorAll('.tc-archive-check'))
      .map((cb) => Number(cb.dataset.id));
    if (!ids.length) return;
    showBulkDeleteConfirm(
      () => Array.from(archivedListEl.querySelectorAll('.tc-archive-check')).map((cb) => Number(cb.dataset.id)),
      `all ${ids.length} archived ${ids.length === 1 ? 'draft' : 'drafts'}`
    );
  });

  archived.appendChild(archiveBulkBar);

  const archivedListEl = document.createElement('div');
  archivedListEl.className = 'tc-list';
  archived.appendChild(archivedListEl);
  leftCol.appendChild(archived);

  function buildListItem(item, archivedFlag) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tc-list-item';
    if (selectedId === item.id) btn.classList.add('active');

    const titleRow = document.createElement('div');
    titleRow.className = 'tc-list-title';
    if (archivedFlag) {
      const badge = document.createElement('span');
      badge.className = 'tc-list-badge badge-archived';
      badge.textContent = 'Archived';
      titleRow.appendChild(badge);
    }
    titleRow.appendChild(
      document.createTextNode(item.title || 'Untitled draft')
    );
    btn.appendChild(titleRow);

    const previewText = snippet(item.body);
    if (previewText) {
      const pv = document.createElement('div');
      pv.className = 'tc-list-preview';
      pv.textContent = previewText;
      btn.appendChild(pv);
    }

    const wc = document.createElement('div');
    wc.className = 'tc-list-preview';
    wc.textContent = `${wordCount(item.body)} word(s)`;
    btn.appendChild(wc);

    // PTAG — tag badges on the draft list item.
    if (window.RevivalTags) {
      const tagList = tagsById[item.id] || [];
      if (tagList.length) btn.appendChild(window.RevivalTags.buildBadges(tagList));
    }

    btn.addEventListener('click', async () => {
      if (selectedId === item.id) return;
      if (activeFlush) await activeFlush();
      selectedId = item.id;
      renderList();
      renderDetail();
    });
    return btn;
  }

  function matchesFilter(item) {
    if (tagFilter.size === 0) return true;
    const itemTags = tagsById[item.id] || [];
    const have = new Set(itemTags.map((t) => t.id));
    for (const id of tagFilter) if (!have.has(id)) return false;
    return true;
  }

  function renderList() {
    list.innerHTML = '';
    const filteredActive = activeItems.filter(matchesFilter);
    const filteredArchived = archivedItems.filter(matchesFilter);

    if (filteredActive.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tc-list-empty';
      empty.textContent = tagFilter.size
        ? 'No drafts match the selected tag(s).'
        : 'No drafts yet.';
      list.appendChild(empty);
    } else {
      for (const item of filteredActive) {
        list.appendChild(buildListItem(item, false));
      }
    }

    archivedListEl.innerHTML = '';
    archivedSummary.textContent = `Archived (${filteredArchived.length})`;
    archived.style.display = filteredArchived.length === 0 ? 'none' : '';
    // PPOL1: Reset bulk bar and update button states
    renderBulkBar();
    deleteSelectedBtn.disabled = true;
    deleteSelectedBtn.textContent = 'Delete Selected';
    deleteAllBtn.disabled = filteredArchived.length === 0;
    for (const item of filteredArchived) {
      const row = document.createElement('div');
      row.className = 'tc-archived-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'tc-archive-check';
      cb.dataset.id = item.id;
      cb.addEventListener('change', () => {
        const n = archivedListEl.querySelectorAll('.tc-archive-check:checked').length;
        deleteSelectedBtn.disabled = n === 0;
        deleteSelectedBtn.textContent = n > 0 ? `Delete Selected (${n})` : 'Delete Selected';
      });
      row.append(cb, buildListItem(item, true));
      archivedListEl.appendChild(row);
    }
  }

  async function refreshTagBadges() {
    if (!window.RevivalTags) return;
    const allIds = [
      ...activeItems.map((i) => i.id),
      ...archivedItems.map((i) => i.id),
    ];
    try {
      tagsById = await window.revival.tags.bulkListFor('writing_lab', allIds);
      renderList();
    } catch {
      /* non-fatal */
    }
  }

  function showEmpty() {
    activeFlush = null;
    rightCol.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tc-empty';
    const t = document.createElement('div');
    t.className = 'tc-empty-title';
    t.textContent = 'Nothing open';
    const h = document.createElement('div');
    h.className = 'tc-empty-hint';
    h.textContent = activeItems.length === 0
      ? 'Click “+ New draft” to start writing.'
      : 'Pick a draft on the left, or click + to start a new one.';
    wrap.append(t, h);
    rightCol.appendChild(wrap);
  }

  // Mount the single-draft editor inside the right column. Continuous autosave:
  // edits are debounced and written straight to SQLite. A brand-new draft has
  // no row until the first non-empty autosave creates one, so opening
  // "+ New draft" and leaving without typing never clutters the list.
  function openEditor(item) {
    rightCol.innerHTML = '';
    activeFlush = null;

    let currentId = item ? item.id : null;
    let saveTimer = null;
    let savedTitle = item ? item.title : '';
    let savedBody = item ? item.body || '' : '';
    const archivedAtStart = isArchived(item);

    const bar = document.createElement('div');
    bar.className = 'wl-editor-bar';

    const status = document.createElement('span');
    status.className = 'draft-status wl-status';
    const spacer = document.createElement('span');
    spacer.className = 'wl-bar-spacer';

    // PWLAB — propose a canon change from this draft. Uses the selected text
    // (if any) as the proposed body, else the whole draft; attribution points
    // back at the draft. Hidden on archived drafts (read-only, can't flush).
    const proposeBtn = document.createElement('button');
    proposeBtn.type = 'button';
    proposeBtn.className = 'btn-secondary wl-propose-btn';
    proposeBtn.textContent = 'Propose Canon';

    // PWLAB-CANON-COMPARE — on-demand draft vs. locked canon divergence check.
    const compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'btn-secondary wl-compare-btn';
    compareBtn.textContent = 'Compare to Canon';

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn-secondary';
    archiveBtn.textContent = archivedAtStart ? 'Restore' : 'Archive';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';

    // PPOL2b-11 — pop out button; only available for saved drafts (item != null).
    const wlPopoutParts = item ? (() => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-secondary';
      btn.textContent = 'Pop out ↗';
      btn.title = 'Open this draft in its own window';
      btn.addEventListener('click', () => window.revival.popout.open('Writing Lab', item.id));
      return [btn];
    })() : [];

    if (archivedAtStart) {
      bar.append(status, spacer, ...wlPopoutParts, archiveBtn, deleteBtn);
    } else {
      bar.append(status, spacer, compareBtn, proposeBtn, ...wlPopoutParts, archiveBtn, deleteBtn);
    }

    // P44 — source attachment row: always visible below the editor bar.
    let draftSources = [];

    const sourcesBar = document.createElement('div');
    sourcesBar.className = 'wl-sources-bar';

    const sourcesLabel = document.createElement('span');
    sourcesLabel.className = 'wl-sources-label';
    sourcesLabel.textContent = 'Sources:';
    sourcesBar.appendChild(sourcesLabel);

    const sourcesChipArea = document.createElement('span');
    sourcesChipArea.className = 'wl-sources-chips';
    sourcesBar.appendChild(sourcesChipArea);

    const sourceAttachBtn = document.createElement('button');
    sourceAttachBtn.type = 'button';
    sourceAttachBtn.className = 'wl-source-attach-btn';
    sourceAttachBtn.textContent = '+ Attach Source';
    sourcesBar.appendChild(sourceAttachBtn);

    const sourcePickerEl = document.createElement('div');
    sourcePickerEl.className = 'wl-source-picker';
    sourcePickerEl.hidden = true;
    document.body.appendChild(sourcePickerEl);

    function renderSourceChips() {
      sourcesChipArea.innerHTML = '';
      for (const src of draftSources) {
        const chip = document.createElement('span');
        chip.className = 'wl-source-chip';
        chip.textContent = src.title;
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.title = 'Remove';
        rm.textContent = '×';
        rm.addEventListener('click', () => {
          draftSources = draftSources.filter((s) => s.id !== src.id);
          renderSourceChips();
        });
        chip.appendChild(rm);
        sourcesChipArea.appendChild(chip);
      }
    }

    function hideSourcePicker() {
      sourcePickerEl.hidden = true;
      sourcePickerEl.innerHTML = '';
    }

    async function showSourcePicker() {
      sourcePickerEl.innerHTML = '';
      let allSources;
      try {
        allSources = await window.revival.sourceMaterial.list();
      } catch {
        allSources = [];
      }
      const usedIds = new Set(draftSources.map((s) => s.id));
      const available = allSources.filter((s) => !usedIds.has(s.id));
      if (available.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'wl-source-picker-empty';
        msg.textContent = allSources.length
          ? 'All sources already attached.'
          : 'No Source Material yet. Add some in the Source Material workspace.';
        sourcePickerEl.appendChild(msg);
      } else {
        for (const src of available) {
          const row = document.createElement('div');
          row.className = 'wl-source-picker-item';
          row.textContent = src.title;
          row.addEventListener('mousedown', (e) => {
            e.preventDefault();
            draftSources.push(src);
            renderSourceChips();
            hideSourcePicker();
          });
          sourcePickerEl.appendChild(row);
        }
      }
      const rect = sourceAttachBtn.getBoundingClientRect();
      sourcePickerEl.style.top = `${rect.bottom + 4}px`;
      sourcePickerEl.style.left = `${rect.left}px`;
      sourcePickerEl.hidden = false;
    }

    sourceAttachBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!sourcePickerEl.hidden) { hideSourcePicker(); return; }
      showSourcePicker();
    });
    sourceAttachBtn.addEventListener('blur', () => {
      setTimeout(() => { if (!sourcePickerEl.matches(':hover')) hideSourcePicker(); }, 150);
    });

    const _srcPickerClose = (e) => {
      if (!sourcePickerEl.hidden && !sourcePickerEl.contains(e.target) && e.target !== sourceAttachBtn) {
        hideSourcePicker();
      }
    };
    document.addEventListener('click', _srcPickerClose);

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'wl-title';
    titleInput.maxLength = 200;
    titleInput.placeholder = 'Untitled draft';
    titleInput.value = item ? item.title : '';

    const bodyInput = document.createElement('textarea');
    bodyInput.className = 'wl-body';
    bodyInput.placeholder = 'Start writing… your work saves automatically.';
    bodyInput.value = item ? item.body || '' : '';

    if (archivedAtStart) {
      titleInput.readOnly = true;
      bodyInput.readOnly = true;
      sourceAttachBtn.disabled = true;
    }

    rightCol.append(bar, sourcesBar, titleInput, bodyInput);

    // PTAG — tag bar for the open draft. A brand-new untitled draft has no
    // DB row yet, so the bar mounts after the first autosave creates one
    // (handled in flush() below).
    let tagBarMounted = false;
    function mountTagBarIfReady() {
      if (tagBarMounted || !window.RevivalTags || currentId == null) return;
      tagBarMounted = true;
      window.RevivalTags.mountTagBar(rightCol, 'writing_lab', currentId, {
        onChange: () => refreshTagBadges(),
      });
    }
    mountTagBarIfReady();

    // PAUDIT-5 — word count and section count live in the status bar.
    // Sections are lines matching "--- Name ---" (PWLAB-SECTIONS pattern).
    let wlWordSeg = null;
    let wlSectionSeg = null;
    function updateCounter() {
      const words = wordCount(bodyInput.value);
      const sections = (bodyInput.value.match(/^---\s+.+\s+---\s*$/mg) || []).length;
      if (wlWordSeg) wlWordSeg.lastChild.textContent = `${words}`;
      if (wlSectionSeg) wlSectionSeg.lastChild.textContent = `${sections}`;
    }
    updateCounter();
    setStatus(
      status,
      archivedAtStart
        ? 'Archived — restore to edit.'
        : item
        ? 'Saved.'
        : 'New draft — autosaves as you type.'
    );

    function syncDraftActions() {
      const exists = currentId != null;
      archiveBtn.disabled = !exists;
      deleteBtn.disabled = !exists;
    }
    syncDraftActions();

    async function flush() {
      if (archivedAtStart) return null;
      const title = titleInput.value;
      const body = bodyInput.value;
      if (title === savedTitle && body === savedBody && currentId != null) {
        return null;
      }
      if (currentId == null && title.trim() === '' && body.trim() === '') {
        return null;
      }
      setStatus(status, 'Saving…');
      try {
        let rec;
        const wasNew = currentId == null;
        if (wasNew) {
          rec = await api.create({ title, body });
          currentId = rec.id;
          syncDraftActions();
          // The freshly-created row becomes the active selection so the list
          // can highlight it and subsequent navigation stays sane.
          selectedId = currentId;
          mountTagBarIfReady();
        } else {
          rec = await api.update(currentId, { title, body });
        }
        savedTitle = title;
        savedBody = body;
        setStatus(
          status,
          `Saved · ${new Date(rec.updated_at).toLocaleTimeString()}`
        );
        // Refresh the list to reflect the new/updated row, but don't touch the
        // detail panel — the editor stays mounted so focus is preserved.
        try {
          const [items, archs] = await Promise.all([
            api.list(),
            api.listArchived(),
          ]);
          activeItems = items;
          archivedItems = archs;
          renderList();
        } catch {
          /* non-fatal — the save itself succeeded */
        }
        return rec;
      } catch (e) {
        setStatus(status, `Save failed: ${e.message || e}`);
        return null;
      }
    }

    function scheduleSave() {
      if (archivedAtStart) return;
      if (saveTimer) clearTimeout(saveTimer);
      setStatus(status, 'Editing…');
      saveTimer = setTimeout(() => {
        saveTimer = null;
        flush();
      }, 500);
    }

    function flushNow() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      return flush();
    }

    activeFlush = flushNow;

    titleInput.addEventListener('input', scheduleSave);
    bodyInput.addEventListener('input', () => {
      updateCounter();
      scheduleSave();
    });
    // Belt-and-suspenders: commit on blur so a pending edit isn't lost if focus
    // leaves and the window closes before the debounce fires.
    titleInput.addEventListener('blur', flushNow);
    bodyInput.addEventListener('blur', flushNow);

    archiveBtn.addEventListener('click', async () => {
      if (currentId == null) return;
      archiveBtn.disabled = true;
      await flushNow();
      try {
        if (archivedAtStart) {
          await api.restore(currentId);
        } else {
          await api.archive(currentId);
        }
        await loadList();
      } catch {
        archiveBtn.disabled = false;
      }
    });

    deleteBtn.addEventListener('click', () => {
      if (currentId == null) return;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      const existing = rightCol.querySelector('.wl-delete-confirm');
      if (existing) existing.remove();

      const row = document.createElement('div');
      row.className = 'entry-actions confirm-row wl-delete-confirm';
      const prompt = document.createElement('span');
      prompt.className = 'confirm-text';
      prompt.textContent = 'Delete this draft? This cannot be undone.';
      const yes = document.createElement('button');
      yes.type = 'button';
      yes.className = 'btn-danger';
      yes.textContent = 'Delete';
      yes.addEventListener('click', async () => {
        yes.disabled = true;
        try {
          await api.delete(currentId);
          selectedId = null;
          await loadList();
        } catch (e) {
          prompt.textContent = e.message || 'Could not delete draft.';
          yes.disabled = false;
        }
      });
      const no = document.createElement('button');
      no.type = 'button';
      no.className = 'btn-secondary';
      no.textContent = 'Cancel';
      no.addEventListener('click', () => row.remove());
      row.append(prompt, yes, no);
      bodyInput.insertAdjacentElement('afterend', row);
    });

    // PWLAB — capture the body selection on mousedown, before the button steals
    // focus (some platforms collapse a textarea's selection on blur).
    let pendingSelection = null;
    proposeBtn.addEventListener('mousedown', () => {
      const s = bodyInput.selectionStart;
      const e = bodyInput.selectionEnd;
      pendingSelection =
        typeof s === 'number' && typeof e === 'number' && e > s
          ? bodyInput.value.substring(s, e).trim()
          : null;
    });

    proposeBtn.addEventListener('click', async () => {
      proposeBtn.disabled = true;
      try {
        // Make sure the draft is persisted so the proposal can attribute back
        // to a real row.
        await flushNow();
        const title = titleInput.value.trim();
        const body = bodyInput.value.trim();
        if (currentId == null || (!title && !body)) {
          setStatus(status, 'Add a title or some text before proposing canon.');
          return;
        }
        const snippet = pendingSelection;
        openProposalModal(
          { id: currentId, title: titleInput.value, body: bodyInput.value },
          'writing_lab',
          snippet ? { body: snippet } : null
        );
      } finally {
        pendingSelection = null;
        proposeBtn.disabled = false;
      }
    });

    if (item && !archivedAtStart) bodyInput.focus();
    else titleInput.focus();

    // P44 — Draft Assistant panel (collapsible, session-scoped conversation).
    // Sources are attached via sourcesBar above the title (always visible).
    const assistant = document.createElement('div');
    assistant.className = 'wl-assistant';

    const aHeader = document.createElement('div');
    aHeader.className = 'wl-assistant-header';
    const aLabel = document.createElement('span');
    aLabel.className = 'wl-assistant-header-label';
    aLabel.textContent = 'Draft Assistant';
    const aToggle = document.createElement('span');
    aToggle.className = 'wl-assistant-toggle';
    aToggle.textContent = '▼ collapse';
    aHeader.append(aLabel, aToggle);
    assistant.appendChild(aHeader);

    const aBody = document.createElement('div');
    aBody.className = 'wl-assistant-body';
    assistant.appendChild(aBody);

    // Conversation thread.
    const aThread = document.createElement('div');
    aThread.className = 'wl-assistant-thread';
    aThread.hidden = true;
    aBody.appendChild(aThread);

    // Input row.
    const aInputRow = document.createElement('div');
    aInputRow.className = 'wl-assistant-input-row';
    const aInput = document.createElement('textarea');
    aInput.className = 'wl-assistant-input';
    aInput.placeholder = 'Ask about continuity, dialogue, scene structure… (Enter to send, Shift+Enter for newline)';
    const aSend = document.createElement('button');
    aSend.type = 'button';
    aSend.className = 'btn-primary wl-assistant-send';
    aSend.textContent = 'Send';
    aInputRow.append(aInput, aSend);
    aBody.appendChild(aInputRow);

    // Multi-turn message history for this editor session.
    let draftThread = [];

    function appendMsg(role, text) {
      const msg = document.createElement('div');
      msg.className = `wl-assistant-msg role-${role}`;
      const lbl = document.createElement('div');
      lbl.className = 'wl-assistant-msg-label';
      lbl.textContent = role === 'user' ? 'You' : role === 'assistant' ? 'Assistant' : role;
      const body = document.createElement('div');
      body.className = 'wl-assistant-msg-body';
      body.textContent = text;
      msg.append(lbl, body);
      aThread.appendChild(msg);
      aThread.hidden = false;
      aThread.scrollTop = aThread.scrollHeight;
      return msg;
    }

    async function sendMessage() {
      const text = aInput.value.trim();
      if (!text) return;
      aInput.value = '';
      aSend.disabled = true;

      appendMsg('user', text);
      draftThread.push({ role: 'user', content: text });

      const thinking = appendMsg('thinking', 'Thinking…');
      thinking.querySelector('.wl-assistant-msg-label').textContent = '';

      try {
        const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
          ? chatModelSelect.value
          : 'claude-sonnet-4-6';
        const sourcesPayload = draftSources.map((s) => ({ title: s.title, body: s.body || '' }));
        const messagesPayload = draftThread.map((m) => ({ role: m.role, content: m.content }));

        const result = await window.revival.claude.draftAssist(
          titleInput.value,
          bodyInput.value,
          sourcesPayload,
          messagesPayload,
          model
        );

        thinking.remove();
        const assistantMsg = appendMsg('assistant', result.text);
        draftThread.push({ role: 'assistant', content: result.text });

        if (result.proposalsCreated && result.proposalsCreated.length > 0) {
          const notice = document.createElement('div');
          notice.className = 'wl-assistant-proposal-notice';
          notice.textContent =
            'Sent to Canon Review: ' + result.proposalsCreated.map((p) => p.title).join(', ');
          aThread.appendChild(notice);
        }

        // PAI-WIRE — P44→P41: manual "Propose to Canon Review" action on each
        // assistant message. User clicks, confirms title/body, then stages.
        const proposeRow = document.createElement('div');
        proposeRow.style.cssText = 'margin-top:4px;';
        const proposeBtn = document.createElement('button');
        proposeBtn.type = 'button';
        proposeBtn.className = 'btn-secondary';
        proposeBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
        proposeBtn.textContent = 'Propose to Canon Review';
        proposeBtn.title = 'Stage a canon proposal from this response — you confirm before it is queued';
        proposeRow.appendChild(proposeBtn);
        assistantMsg.appendChild(proposeRow);

        proposeBtn.addEventListener('click', () => {
          proposeBtn.hidden = true;
          const proposeForm = document.createElement('div');
          proposeForm.style.cssText =
            'margin-top:6px;padding:6px;background:rgba(74,158,255,0.07);border-radius:4px;';
          const pfTitle = document.createElement('input');
          pfTitle.type = 'text';
          pfTitle.style.cssText =
            'width:100%;box-sizing:border-box;margin-bottom:4px;padding:4px 6px;' +
            'background:var(--bg,#1a1a1a);color:var(--text,#ddd);' +
            'border:1px solid var(--border,#444);border-radius:3px;font-size:12px;';
          pfTitle.placeholder = 'Proposal title…';
          pfTitle.value = `From Writing Lab: ${(titleInput.value || 'Untitled').slice(0, 60)}`;
          const pfNote = document.createElement('div');
          pfNote.style.cssText = 'font-size:11px;opacity:0.6;margin-bottom:4px;';
          pfNote.textContent = 'Message text will be the proposal body. Edit title before staging.';
          const pfBtns = document.createElement('div');
          pfBtns.style.cssText = 'display:flex;gap:6px;align-items:center;';
          const pfConfirm = document.createElement('button');
          pfConfirm.type = 'button';
          pfConfirm.className = 'btn-primary';
          pfConfirm.style.fontSize = '11px';
          pfConfirm.textContent = 'Stage in Canon Review';
          const pfCancel = document.createElement('button');
          pfCancel.type = 'button';
          pfCancel.className = 'btn-secondary';
          pfCancel.style.fontSize = '11px';
          pfCancel.textContent = 'Cancel';
          pfBtns.append(pfConfirm, pfCancel);
          proposeForm.append(pfTitle, pfNote, pfBtns);
          assistantMsg.appendChild(proposeForm);

          pfCancel.addEventListener('click', () => {
            proposeForm.remove();
            proposeBtn.hidden = false;
          });

          pfConfirm.addEventListener('click', async () => {
            pfConfirm.disabled = true;
            pfConfirm.textContent = 'Staging…';
            try {
              await window.revival.canonProposals.createFromAI({
                entry_type: null,
                title: pfTitle.value.trim() || 'Canon Proposal',
                body: result.text,
                proposer_note: `From Writing Lab draft assistant — draft: "${titleInput.value || 'Untitled'}"`,
              });
              proposeForm.innerHTML = '';
              const doneEl = document.createElement('span');
              doneEl.style.cssText = 'font-size:11px;color:var(--accent,#4a9eff);';
              doneEl.textContent = 'Staged in Canon Review.';
              proposeForm.appendChild(doneEl);
            } catch (propErr) {
              pfConfirm.disabled = false;
              pfConfirm.textContent = 'Stage in Canon Review';
              const errMsg = (propErr.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
              const errEl = document.createElement('span');
              errEl.style.cssText = 'font-size:11px;color:var(--error,#f87171);margin-left:4px;';
              errEl.textContent = errMsg || 'Failed to stage.';
              pfBtns.appendChild(errEl);
            }
          });
        });
      } catch (err) {
        thinking.remove();
        const raw = err.message || 'Request failed';
        const clean = raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
        appendMsg('error', clean);
      } finally {
        aSend.disabled = false;
        aInput.focus();
      }
    }

    aSend.addEventListener('click', sendMessage);
    aInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Clear conversation.
    const aClearRow = document.createElement('div');
    aClearRow.style.cssText = 'margin-top:8px; text-align:right;';
    const aClearBtn = document.createElement('button');
    aClearBtn.type = 'button';
    aClearBtn.className = 'wl-assistant-clear-btn';
    aClearBtn.textContent = 'Clear conversation';
    aClearBtn.addEventListener('click', () => {
      draftThread = [];
      aThread.innerHTML = '';
      aThread.hidden = true;
    });
    aClearRow.appendChild(aClearBtn);
    aBody.appendChild(aClearRow);

    // Toggle collapse/expand — starts expanded.
    let aOpen = true;
    aHeader.addEventListener('click', () => {
      aOpen = !aOpen;
      aBody.hidden = !aOpen;
      aToggle.textContent = aOpen ? '▼ collapse' : '▶ expand';
    });

    rightCol.appendChild(assistant);

    // PWLAB-CANON-COMPARE — collapsible results panel; hidden until first run.
    const comparePanel = document.createElement('div');
    comparePanel.className = 'wl-compare';
    comparePanel.hidden = true;

    const cmpHeader = document.createElement('div');
    cmpHeader.className = 'wl-compare-header';
    const cmpLabel = document.createElement('span');
    cmpLabel.className = 'wl-compare-header-label';
    cmpLabel.textContent = 'Canon Compare';
    const cmpRunBtn = document.createElement('button');
    cmpRunBtn.type = 'button';
    cmpRunBtn.className = 'btn-primary wl-compare-run-btn';
    cmpRunBtn.textContent = 'Run again';
    const cmpToggle = document.createElement('span');
    cmpToggle.className = 'wl-compare-toggle';
    cmpToggle.textContent = '▼ collapse';
    cmpHeader.append(cmpLabel, cmpRunBtn, cmpToggle);
    comparePanel.appendChild(cmpHeader);

    const cmpBody = document.createElement('div');
    cmpBody.className = 'wl-compare-body';
    comparePanel.appendChild(cmpBody);

    let cmpOpen = true;
    cmpHeader.addEventListener('click', (e) => {
      if (e.target === cmpRunBtn) return;
      cmpOpen = !cmpOpen;
      cmpBody.hidden = !cmpOpen;
      cmpToggle.textContent = cmpOpen ? '▼ collapse' : '▶ expand';
    });

    async function runCompare() {
      await flushNow();
      const draftTitle = titleInput.value.trim();
      const draftBody = bodyInput.value.trim();
      comparePanel.hidden = false;
      cmpBody.hidden = false;
      cmpOpen = true;
      cmpToggle.textContent = '▼ collapse';
      cmpBody.innerHTML = '';

      if (!draftBody) {
        const msg = document.createElement('p');
        msg.className = 'cr-conflict-status';
        msg.textContent = 'Add draft body text before running comparison.';
        cmpBody.appendChild(msg);
        return;
      }

      compareBtn.disabled = true;
      cmpRunBtn.disabled = true;
      const checking = document.createElement('p');
      checking.className = 'cr-conflict-status';
      checking.textContent = 'Comparing draft against locked canon entries…';
      cmpBody.appendChild(checking);

      try {
        const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
          ? chatModelSelect.value : 'claude-sonnet-4-6';
        const res = await window.revival.claude.canonCompare(draftTitle, draftBody, model);
        cmpBody.innerHTML = '';

        if (res.skipped) {
          const msg = document.createElement('p');
          msg.className = 'cr-conflict-status';
          msg.textContent = 'Add draft body text before running comparison.';
          cmpBody.appendChild(msg);
        } else if (res.checkedCount === 0) {
          const msg = document.createElement('p');
          msg.className = 'cr-conflict-status';
          msg.textContent = 'No locked canon entries to compare against.';
          cmpBody.appendChild(msg);
        } else if (res.flags.length === 0) {
          const msg = document.createElement('p');
          msg.className = 'cr-conflict-status';
          msg.textContent =
            `No divergences found (checked ${res.checkedCount} locked entr${res.checkedCount === 1 ? 'y' : 'ies'}).`;
          cmpBody.appendChild(msg);
        } else {
          const summary = document.createElement('p');
          summary.className = 'cr-conflict-status';
          summary.textContent =
            `${res.flags.length} divergence${res.flags.length === 1 ? '' : 's'} found ` +
            `(checked ${res.checkedCount} locked entr${res.checkedCount === 1 ? 'y' : 'ies'}):`;
          cmpBody.appendChild(summary);

          for (const f of res.flags) {
            const card = document.createElement('div');
            card.className = 'wl-compare-flag';

            const citation = document.createElement('div');
            citation.className = 'wl-compare-flag-citation';
            citation.textContent = `${f.tcode} — ${f.title}`;

            const reason = document.createElement('p');
            reason.className = 'wl-compare-flag-reason';
            reason.textContent = f.reason;

            card.append(citation, reason);

            if (f.draftLocation) {
              const loc = document.createElement('p');
              loc.className = 'wl-compare-flag-loc';
              loc.textContent = `In draft: "${f.draftLocation}"`;
              card.appendChild(loc);
            }

            const flagActions = document.createElement('div');
            flagActions.className = 'wl-compare-flag-actions';

            const routeConflictBtn = document.createElement('button');
            routeConflictBtn.type = 'button';
            routeConflictBtn.className = 'btn-secondary';
            routeConflictBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
            routeConflictBtn.textContent = 'Route to Conflicts';

            const routeOqBtn = document.createElement('button');
            routeOqBtn.type = 'button';
            routeOqBtn.className = 'btn-secondary';
            routeOqBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
            routeOqBtn.textContent = 'Route to Open Questions';

            const flagDismissBtn = document.createElement('button');
            flagDismissBtn.type = 'button';
            flagDismissBtn.className = 'btn-secondary';
            flagDismissBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
            flagDismissBtn.textContent = 'Dismiss';

            flagActions.append(routeConflictBtn, routeOqBtn, flagDismissBtn);
            card.appendChild(flagActions);

            const flagBody =
              `Canon entry: ${f.tcode} — ${f.title}\n\n${f.reason}` +
              (f.draftLocation ? `\n\nDraft location: "${f.draftLocation}"` : '') +
              `\n\nSource draft: "${draftTitle || 'Untitled'}"`;

            routeConflictBtn.addEventListener('click', async () => {
              routeConflictBtn.disabled = true;
              routeOqBtn.disabled = true;
              flagDismissBtn.disabled = true;
              try {
                await window.revival.conflicts.create({
                  title: `Canon divergence: ${f.title}`,
                  body: flagBody,
                });
                flagActions.innerHTML = '';
                const routed = document.createElement('span');
                routed.className = 'wl-compare-flag-routed';
                routed.textContent = 'Routed to Conflicts.';
                flagActions.appendChild(routed);
              } catch (routeErr) {
                routeConflictBtn.disabled = false;
                routeOqBtn.disabled = false;
                flagDismissBtn.disabled = false;
                const cleanErr = (routeErr.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
                const errEl = document.createElement('span');
                errEl.className = 'wl-compare-flag-error';
                errEl.textContent = cleanErr || 'Failed to create conflict.';
                flagActions.appendChild(errEl);
              }
            });

            routeOqBtn.addEventListener('click', async () => {
              routeConflictBtn.disabled = true;
              routeOqBtn.disabled = true;
              flagDismissBtn.disabled = true;
              try {
                await window.revival.openQuestions.create({
                  title: `Canon question: ${f.title}`,
                  body: flagBody,
                });
                flagActions.innerHTML = '';
                const routed = document.createElement('span');
                routed.className = 'wl-compare-flag-routed';
                routed.textContent = 'Routed to Open Questions.';
                flagActions.appendChild(routed);
              } catch (routeErr) {
                routeConflictBtn.disabled = false;
                routeOqBtn.disabled = false;
                flagDismissBtn.disabled = false;
                const cleanErr = (routeErr.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
                const errEl = document.createElement('span');
                errEl.className = 'wl-compare-flag-error';
                errEl.textContent = cleanErr || 'Failed to create open question.';
                flagActions.appendChild(errEl);
              }
            });

            flagDismissBtn.addEventListener('click', () => {
              card.remove();
              if (cmpBody.querySelectorAll('.wl-compare-flag').length === 0) {
                cmpBody.innerHTML = '';
                const msg = document.createElement('p');
                msg.className = 'cr-conflict-status';
                msg.textContent = 'All flags dismissed.';
                cmpBody.appendChild(msg);
              }
            });

            cmpBody.appendChild(card);
          }
        }
      } catch (cmpErr) {
        cmpBody.innerHTML = '';
        const errEl = document.createElement('p');
        errEl.className = 'cr-conflict-status';
        const cleanErr = (cmpErr.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
        errEl.textContent = `Error: ${cleanErr || 'Comparison failed.'}`;
        cmpBody.appendChild(errEl);
      } finally {
        compareBtn.disabled = false;
        cmpRunBtn.disabled = false;
      }
    }

    compareBtn.addEventListener('click', runCompare);
    cmpRunBtn.addEventListener('click', (e) => { e.stopPropagation(); runCompare(); });

    rightCol.appendChild(comparePanel);

    // PFLAN-EXPAND — Flanagan Filter (full five modes) on Writing Lab drafts.
    // Gated on item existing (unsaved new drafts have no DB row yet).
    if (item) {
      const wlFfCallbacks = {};
      if (!archivedAtStart) {
        mountFlanaganFilter(rightCol, item, wlFfCallbacks, {
          entityKind: 'writing_lab',
          workspaceName: 'Writing Lab',
          actionsRow: bar,
        });
      }
      const { refresh: wlFfRefresh } = mountFlanaganHistory(
        rightCol, item, archivedAtStart, wlFfCallbacks, 'writing_lab'
      );
      wlFfCallbacks.refreshHistory = wlFfRefresh;
      // PLOCKED-SPECIFICS — all locked specifics on Writing Lab drafts.
      if (!archivedAtStart) mountLockedSpecificsPanel(rightCol);
      // PEPISODE-CONT-2B — continuity check for Writing Lab drafts.
      if (!archivedAtStart) mountWlabContinuityPanel(rightCol, item);
    }

    // PPOL2b-12 — linked-entries indicator (same passive pattern as other workspaces).
    // PPOL2b-03 / PAUDIT-5 — status bar with word count and section count.
    // Both are gated on item existing — new unsaved drafts have no DB row yet.
    if (item) {
      mountAttachmentsSection(rightCol, 'writing_lab', item.id);
      const wlStatusBar = buildStatusBar('Writing Lab', item, archivedAtStart);
      // PAUDIT-5: append updateable word-count and section-count segments.
      const mkSeg = (label, value) => {
        const s = document.createElement('span');
        s.className = 'tc-statusbar-seg';
        const k = document.createElement('span');
        k.className = 'tc-statusbar-key';
        k.textContent = label;
        s.append(k, document.createTextNode(value));
        return s;
      };
      wlWordSeg = mkSeg('Words', String(wordCount(bodyInput.value)));
      wlSectionSeg = mkSeg('Sections', String((bodyInput.value.match(/^---\s+.+\s+---\s*$/mg) || []).length));
      wlStatusBar.append(wlWordSeg, wlSectionSeg);
      rightCol.appendChild(wlStatusBar);
    }

    // Cleanup: remove the fixed-position source picker and document listener
    // when this editor instance is replaced (openEditor clears rightCol).
    const _editorObserver = new MutationObserver(() => {
      if (!rightCol.contains(assistant)) {
        sourcePickerEl.remove();
        document.removeEventListener('click', _srcPickerClose);
        _editorObserver.disconnect();
      }
    });
    _editorObserver.observe(rightCol, { childList: true });
  }

  function renderDetail() {
    if (selectedId === 'new') return openEditor(null);
    if (selectedId == null) return showEmpty();
    const item = findItem(selectedId);
    if (!item) {
      selectedId = null;
      return showEmpty();
    }
    return openEditor(item);
  }

  async function loadList() {
    try {
      const [items, archs] = await Promise.all([
        api.list(),
        api.listArchived(),
      ]);
      activeItems = items;
      archivedItems = archs;
    } catch (e) {
      activeItems = [];
      archivedItems = [];
      list.innerHTML = '';
      const err = document.createElement('p');
      err.className = 'placeholder';
      err.textContent = `Could not load drafts: ${e.message || e}`;
      list.appendChild(err);
      showEmpty();
      return;
    }
    // PTAG — bulk tags for the drafts list.
    if (window.RevivalTags) {
      const allIds = [
        ...activeItems.map((i) => i.id),
        ...archivedItems.map((i) => i.id),
      ];
      try {
        tagsById = await window.revival.tags.bulkListFor('writing_lab', allIds);
      } catch {
        tagsById = {};
      }
    }
    if (
      selectedId !== null &&
      selectedId !== 'new' &&
      !findItem(selectedId)
    ) {
      selectedId = null;
    }
    renderList();
    renderDetail();
  }

  loadList();
}

// --- P37: Character relational view helpers --------------------------------

// Renders an SVG graph of all active characters and their relationships.
// Nodes are placed on a circle; edges show relation_type labels.
// onNodeClick(charId) is called when a node is clicked.
// onBack: called when the "← Back to List" button is clicked.
// onNodeClick: called with charId when a node is clicked.
function renderCharGraph(container, chars, rels, onBack, onNodeClick) {
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'char-graph-container';

  // Header row: back button + title
  const header = document.createElement('div');
  header.className = 'char-graph-header';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn-secondary char-graph-back';
  backBtn.textContent = '← Back to List';
  backBtn.addEventListener('click', onBack);

  const title = document.createElement('div');
  title.className = 'char-graph-title';
  title.textContent = 'Character Relational View';

  header.append(backBtn, title);
  wrap.appendChild(header);

  if (chars.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'char-graph-empty';
    empty.textContent = 'No characters yet. Go back and add characters first.';
    wrap.appendChild(empty);
    container.appendChild(wrap);
    return;
  }

  // Use a larger viewBox and bigger nodes now that the graph gets full-width
  const W = 800, H = 520;
  const cx = W / 2, cy = H / 2;
  const padding = 80, nodeR = 36;
  const maxR = Math.min(W / 2 - padding - nodeR, H / 2 - padding - nodeR - 16);
  const r = Math.max(100, Math.min(280, maxR));

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'char-graph-svg');

  // Position nodes in a circle (single node = center)
  const positions = chars.map((c, i) => {
    if (chars.length === 1) return { x: cx, y: cy };
    const angle = (2 * Math.PI / chars.length) * i - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  const posMap = new Map(chars.map((c, i) => [c.id, i]));

  // Group edges by pair (treat direction as undirected for display) so that
  // multiple types between the same two characters show on one line as
  // "mentor / rival" rather than drawing duplicate overlapping edges.
  const edgeMap = new Map();
  for (const rel of rels) {
    const a = Math.min(rel.from_char_id, rel.to_char_id);
    const b = Math.max(rel.from_char_id, rel.to_char_id);
    const key = `${a}-${b}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { fromId: a, toId: b, types: [] });
    edgeMap.get(key).types.push(rel.relation_type);
  }

  // Draw edges behind nodes
  for (const edge of edgeMap.values()) {
    const fi = posMap.get(edge.fromId);
    const ti = posMap.get(edge.toId);
    if (fi == null || ti == null) continue;
    const fp = positions[fi], tp = positions[ti];

    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', fp.x);
    line.setAttribute('y1', fp.y);
    line.setAttribute('x2', tp.x);
    line.setAttribute('y2', tp.y);
    line.setAttribute('stroke', 'var(--accent)');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('opacity', '0.6');
    svg.appendChild(line);

    // Combined label at midpoint — truncate if too long
    const mx = (fp.x + tp.x) / 2, my = (fp.y + tp.y) / 2;
    const combined = edge.types.join(' / ');
    const labelText = combined.length > 20 ? combined.slice(0, 19) + '…' : combined;
    const labelW = labelText.length * 6 + 10;
    const labelH = 14;

    const textBg = document.createElementNS(ns, 'rect');
    textBg.setAttribute('x', mx - labelW / 2);
    textBg.setAttribute('y', my - labelH / 2 - 1);
    textBg.setAttribute('width', labelW);
    textBg.setAttribute('height', labelH);
    textBg.setAttribute('rx', '3');
    textBg.setAttribute('fill', 'var(--panel)');
    textBg.setAttribute('stroke', 'var(--border)');
    textBg.setAttribute('stroke-width', '0.5');
    svg.appendChild(textBg);

    const edgeLabel = document.createElementNS(ns, 'text');
    edgeLabel.setAttribute('x', mx);
    edgeLabel.setAttribute('y', my + 4);
    edgeLabel.setAttribute('text-anchor', 'middle');
    edgeLabel.setAttribute('font-size', '12');
    edgeLabel.setAttribute('fill', 'var(--muted)');
    edgeLabel.textContent = labelText;
    svg.appendChild(edgeLabel);
  }

  // Draw nodes on top of edges
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], p = positions[i];
    const g = document.createElementNS(ns, 'g');
    g.style.cursor = 'pointer';

    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', nodeR);
    circle.setAttribute('fill', '#3a2e4a');
    circle.setAttribute('stroke', '#9b7fd6');
    circle.setAttribute('stroke-width', '2.5');

    const initials = c.title.slice(0, 2).toUpperCase();
    const inLabel = document.createElementNS(ns, 'text');
    inLabel.setAttribute('x', p.x);
    inLabel.setAttribute('y', p.y);
    inLabel.setAttribute('text-anchor', 'middle');
    inLabel.setAttribute('dominant-baseline', 'central');
    inLabel.setAttribute('font-size', '16');
    inLabel.setAttribute('font-weight', '700');
    inLabel.setAttribute('fill', '#c5a8f0');
    inLabel.setAttribute('pointer-events', 'none');
    inLabel.textContent = initials;

    const nameLabel = document.createElementNS(ns, 'text');
    nameLabel.setAttribute('x', p.x);
    nameLabel.setAttribute('y', p.y + nodeR + 16);
    nameLabel.setAttribute('text-anchor', 'middle');
    nameLabel.setAttribute('font-size', '13');
    nameLabel.setAttribute('fill', 'var(--text)');
    nameLabel.setAttribute('pointer-events', 'none');
    nameLabel.textContent = c.title.length > 16 ? c.title.slice(0, 15) + '…' : c.title;

    g.addEventListener('mouseenter', () => {
      circle.setAttribute('fill', '#4e3d6a');
      circle.setAttribute('stroke', '#c98b5e');
    });
    g.addEventListener('mouseleave', () => {
      circle.setAttribute('fill', '#3a2e4a');
      circle.setAttribute('stroke', '#9b7fd6');
    });
    g.addEventListener('click', () => onNodeClick(c.id));

    g.append(circle, inLabel, nameLabel);
    svg.appendChild(g);
  }

  wrap.appendChild(svg);

  const hint = document.createElement('div');
  hint.className = 'char-graph-hint';
  hint.textContent = edgeMap.size === 0
    ? 'No relationships defined yet. Select a character and add one in the detail panel.'
    : 'Click a character node to view their detail and manage relationships. Multiple types between the same pair are combined on one edge.';
  wrap.appendChild(hint);

  container.appendChild(wrap);
}

// Sets up the Relational View toggle in the Characters left column.
// Hides the ENTIRE left column so the graph gets the full workspace width.
// The back button lives inside the graph view; clicking a node exits too.
function setupCharRelationalView(leftCol, rightCol, ctx) {
  const { list, setSelectedId, reloadList } = ctx;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn-secondary char-relview-toggle';
  toggle.textContent = 'Relational View';
  leftCol.insertBefore(toggle, list);

  let relViewMode = false;

  function exitRelView(selectId) {
    relViewMode = false;
    toggle.classList.remove('active');
    leftCol.style.display = '';
    if (selectId != null) {
      setSelectedId(selectId);
    } else {
      reloadList();
    }
  }

  async function enterRelView() {
    relViewMode = true;
    toggle.classList.add('active');
    leftCol.style.display = 'none';
    try {
      const [chars, rels] = await Promise.all([
        window.revival.characters.list(),
        window.revival.characterRelationships.listAll(),
      ]);
      renderCharGraph(
        rightCol, chars, rels,
        () => exitRelView(null),
        (charId) => exitRelView(charId)
      );
    } catch (err) {
      rightCol.innerHTML = '';
      const errMsg = document.createElement('div');
      errMsg.className = 'char-graph-empty';
      errMsg.textContent = `Could not load graph: ${err.message || err}`;
      rightCol.appendChild(errMsg);
    }
  }

  toggle.addEventListener('click', () => {
    if (relViewMode) exitRelView(null);
    else enterRelView();
  });
}

// PARC-A — Character arc tracker: written timeline.
// "Arc Timeline" toggle button sits in the Characters left column.
// When active, hides the left column and renders the timeline in the right panel
// (same pattern as the Relational View above).
function setupCharArcTracker(leftCol, rightCol, ctx) {
  const { list, setSelectedId, reloadList } = ctx;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn-secondary char-arc-toggle';
  toggle.textContent = 'Arc Timeline';
  leftCol.insertBefore(toggle, list);

  let arcViewMode = false;

  function exitArcView() {
    arcViewMode = false;
    toggle.classList.remove('active');
    leftCol.style.display = '';
    reloadList();
  }

  // Parse a season number from an episode title (e.g. "S1E3 …" → 1, "Season 2" → 2).
  function parseSeason(title) {
    const m = (title || '').match(/\bS(\d+)E\d+/i) || (title || '').match(/\bSeason\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  async function enterArcView() {
    arcViewMode = true;
    toggle.classList.add('active');
    leftCol.style.display = 'none';

    rightCol.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'arc-container';
    rightCol.appendChild(container);

    // Load character list for the selector.
    let allChars = [];
    try { allChars = await window.revival.characters.list(); } catch { /* no-op */ }

    let selectedCharId = allChars.length ? allChars[0].id : null;
    let arcStatusFilter = null; // null = all; 'active' | 'recurring' | 'departed' | 'deceased'
    let seasonFilter = null;    // null = all; integer season number

    // --- Header row ---
    const header = document.createElement('div');
    header.className = 'arc-header';
    container.appendChild(header);

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn-secondary arc-back';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', exitArcView);
    header.appendChild(backBtn);

    const titleEl = document.createElement('span');
    titleEl.className = 'arc-title';
    titleEl.textContent = 'Character Arc Timeline';
    header.appendChild(titleEl);

    const charSelect = document.createElement('select');
    charSelect.className = 'arc-char-select';
    charSelect.setAttribute('aria-label', 'Select character');
    header.appendChild(charSelect);

    // --- Filter row ---
    const filterRow = document.createElement('div');
    filterRow.className = 'arc-filters';
    container.appendChild(filterRow);

    // --- Timeline area ---
    const timelineEl = document.createElement('div');
    container.appendChild(timelineEl);

    const ARC_STATUS_OPTIONS = [
      { value: 'active',    label: 'Active' },
      { value: 'recurring', label: 'Recurring' },
      { value: 'departed',  label: 'Departed' },
      { value: 'deceased',  label: 'Deceased' },
    ];
    const ARC_STATUS_LABEL = Object.fromEntries(ARC_STATUS_OPTIONS.map((o) => [o.value, o.label]));

    function rebuildCharSelect() {
      charSelect.innerHTML = '';
      const visible = arcStatusFilter
        ? allChars.filter((c) => c.char_status === arcStatusFilter)
        : allChars;
      if (!visible.length) {
        const opt = document.createElement('option');
        opt.textContent = '(no characters)';
        charSelect.appendChild(opt);
        selectedCharId = null;
        return;
      }
      for (const c of visible) {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.title + (c.char_status ? ` (${ARC_STATUS_LABEL[c.char_status] || c.char_status})` : '');
        if (c.id === selectedCharId) opt.selected = true;
        charSelect.appendChild(opt);
      }
      // If previous selection is no longer in the filtered set, reset.
      if (!visible.find((c) => c.id === selectedCharId)) {
        selectedCharId = visible[0].id;
        charSelect.value = selectedCharId;
      } else {
        charSelect.value = selectedCharId;
      }
    }

    function renderFilterRow(detectedSeasons) {
      filterRow.innerHTML = '';

      // Arc status filter chips.
      const statusLabel = document.createElement('span');
      statusLabel.className = 'arc-filter-label';
      statusLabel.textContent = 'Status:';
      filterRow.appendChild(statusLabel);

      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'arc-filter-btn' + (arcStatusFilter === null ? ' active' : '');
      allBtn.textContent = 'All';
      allBtn.addEventListener('click', () => {
        arcStatusFilter = null;
        rebuildCharSelect();
        renderFilterRow(detectedSeasons);
        renderTimeline();
      });
      filterRow.appendChild(allBtn);

      for (const opt of ARC_STATUS_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'arc-filter-btn' + (arcStatusFilter === opt.value ? ' active' : '');
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
          arcStatusFilter = opt.value;
          rebuildCharSelect();
          renderFilterRow(detectedSeasons);
          renderTimeline();
        });
        filterRow.appendChild(btn);
      }

      // Season filter chips — only shown if any episode has a season number.
      if (detectedSeasons && detectedSeasons.length > 0) {
        const sep = document.createElement('span');
        sep.style.cssText = 'width:1px;background:var(--border);align-self:stretch;margin:0 4px;';
        filterRow.appendChild(sep);

        const sLabel = document.createElement('span');
        sLabel.className = 'arc-filter-label';
        sLabel.textContent = 'Season:';
        filterRow.appendChild(sLabel);

        const sAll = document.createElement('button');
        sAll.type = 'button';
        sAll.className = 'arc-filter-btn' + (seasonFilter === null ? ' active' : '');
        sAll.textContent = 'All';
        sAll.addEventListener('click', () => { seasonFilter = null; renderFilterRow(detectedSeasons); renderTimeline(); });
        filterRow.appendChild(sAll);

        for (const s of detectedSeasons) {
          const sb = document.createElement('button');
          sb.type = 'button';
          sb.className = 'arc-filter-btn' + (seasonFilter === s ? ' active' : '');
          sb.textContent = `S${s}`;
          sb.addEventListener('click', () => { seasonFilter = s; renderFilterRow(detectedSeasons); renderTimeline(); });
          filterRow.appendChild(sb);
        }
      }
    }

    async function renderTimeline() {
      timelineEl.innerHTML = '';

      if (!selectedCharId) {
        const empty = document.createElement('div');
        empty.className = 'arc-empty';
        empty.textContent = 'No characters to display.';
        timelineEl.appendChild(empty);
        return;
      }

      let data;
      try {
        data = await window.revival.characters.arcTimeline(selectedCharId);
      } catch (err) {
        const errEl = document.createElement('div');
        errEl.className = 'arc-empty';
        errEl.textContent = `Could not load arc: ${err.message || err}`;
        timelineEl.appendChild(errEl);
        return;
      }

      const { character, rows } = data;

      // Detect seasons for the filter bar.
      const seasonSet = new Set();
      for (const { episode: ep } of rows) {
        const s = parseSeason(ep.title);
        if (s !== null) seasonSet.add(s);
      }
      const detectedSeasons = [...seasonSet].sort((a, b) => a - b);

      // Re-render filter row with season info.
      renderFilterRow(detectedSeasons);

      // Character status badge next to title in arc panel.
      let charStatusBadge = '';
      if (character.char_status) {
        charStatusBadge = ` · ${ARC_STATUS_LABEL[character.char_status] || character.char_status}`;
      }
      titleEl.textContent = `Arc Timeline · ${character.title}${charStatusBadge}`;

      // Apply season filter.
      const filteredRows = seasonFilter !== null
        ? rows.filter(({ episode: ep }) => parseSeason(ep.title) === seasonFilter)
        : rows;

      if (!filteredRows.length) {
        const empty = document.createElement('div');
        empty.className = 'arc-empty';
        empty.textContent = rows.length
          ? 'No episodes match the current filter.'
          : 'No episodes in the database yet.';
        timelineEl.appendChild(empty);
        return;
      }

      for (const { episode: ep, canon_facts, open_questions, decisions } of filteredRows) {
        const details = document.createElement('details');
        details.className = 'arc-ep-row';

        const summary = document.createElement('summary');
        summary.className = 'arc-ep-summary';

        const epTitle = document.createElement('span');
        epTitle.className = 'arc-ep-title';
        epTitle.textContent = ep.title || '(untitled)';
        summary.appendChild(epTitle);

        if (ep.ep_status) {
          const epBadge = document.createElement('span');
          epBadge.className = 'arc-ep-status';
          epBadge.textContent = ep.ep_status.charAt(0).toUpperCase() + ep.ep_status.slice(1);
          summary.appendChild(epBadge);
        }

        const counts = document.createElement('span');
        counts.className = 'arc-ep-counts';
        counts.innerHTML =
          `<span>${canon_facts.length} canon</span>` +
          `<span>${open_questions.length} open Qs</span>` +
          `<span>${decisions.length} decisions</span>`;
        summary.appendChild(counts);

        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'arc-ep-body';

        // Canon facts section.
        const canonSect = document.createElement('div');
        const canonHdr = document.createElement('div');
        canonHdr.className = 'arc-section-title';
        canonHdr.textContent = `Canon facts locked at this point (${canon_facts.length})`;
        canonSect.appendChild(canonHdr);
        if (canon_facts.length === 0) {
          const none = document.createElement('span');
          none.className = 'arc-none';
          none.textContent = 'None yet.';
          canonSect.appendChild(none);
        } else {
          const ul = document.createElement('div');
          ul.className = 'arc-item-list';
          for (const c of canon_facts) {
            const item = document.createElement('div');
            item.className = 'arc-item';
            item.textContent = c.title || '(untitled)';
            const typeTag = document.createElement('span');
            typeTag.className = 'arc-item-type';
            typeTag.textContent = c.entry_type.replace(/_/g, ' ');
            item.appendChild(typeTag);
            if (c.confidence) {
              const confBadge = document.createElement('span');
              confBadge.className = 'arc-item-badge';
              confBadge.style.background = c.confidence === 'confirmed' ? '#2a6b3c22' : c.confidence === 'probable' ? '#a07d1e22' : '#6b2a2a22';
              confBadge.style.color = c.confidence === 'confirmed' ? '#2a6b3c' : c.confidence === 'probable' ? '#a07d1e' : '#6b2a2a';
              confBadge.textContent = c.confidence;
              item.appendChild(confBadge);
            }
            ul.appendChild(item);
          }
          canonSect.appendChild(ul);
        }
        body.appendChild(canonSect);

        // Open questions section.
        const oqSect = document.createElement('div');
        const oqHdr = document.createElement('div');
        oqHdr.className = 'arc-section-title';
        oqHdr.textContent = `Open questions at this point (${open_questions.length})`;
        oqSect.appendChild(oqHdr);
        if (open_questions.length === 0) {
          const none = document.createElement('span');
          none.className = 'arc-none';
          none.textContent = 'None.';
          oqSect.appendChild(none);
        } else {
          const ul = document.createElement('div');
          ul.className = 'arc-item-list';
          for (const oq of open_questions) {
            const item = document.createElement('div');
            item.className = 'arc-item';
            item.textContent = oq.title || '(untitled)';
            if (oq.tier) {
              const tBadge = document.createElement('span');
              tBadge.className = 'arc-item-badge';
              tBadge.style.background = '#9b7fd622';
              tBadge.style.color = '#9b7fd6';
              tBadge.textContent = `T${oq.tier}`;
              item.appendChild(tBadge);
            }
            ul.appendChild(item);
          }
          oqSect.appendChild(ul);
        }
        body.appendChild(oqSect);

        // Decisions section.
        const decSect = document.createElement('div');
        const decHdr = document.createElement('div');
        decHdr.className = 'arc-section-title';
        decHdr.textContent = `Decisions at this point (${decisions.length})`;
        decSect.appendChild(decHdr);
        if (decisions.length === 0) {
          const none = document.createElement('span');
          none.className = 'arc-none';
          none.textContent = 'None.';
          decSect.appendChild(none);
        } else {
          const ul = document.createElement('div');
          ul.className = 'arc-item-list';
          for (const d of decisions) {
            const item = document.createElement('div');
            item.className = 'arc-item';
            item.textContent = d.title || '(untitled)';
            if (d.decision_status) {
              const dBadge = document.createElement('span');
              dBadge.className = 'arc-item-badge';
              dBadge.style.background = d.decision_status === 'final' ? '#2a6b3c22' : '#a07d1e22';
              dBadge.style.color = d.decision_status === 'final' ? '#2a6b3c' : '#a07d1e';
              dBadge.textContent = d.decision_status;
              item.appendChild(dBadge);
            }
            ul.appendChild(item);
          }
          decSect.appendChild(ul);
        }
        body.appendChild(decSect);

        details.appendChild(body);
        timelineEl.appendChild(details);
      }
    }

    // Wire character selector.
    charSelect.addEventListener('change', () => {
      selectedCharId = parseInt(charSelect.value, 10);
      seasonFilter = null;
      renderTimeline();
    });

    // Initial render.
    rebuildCharSelect();
    renderFilterRow([]);
    await renderTimeline();
  }

  toggle.addEventListener('click', () => {
    if (arcViewMode) exitArcView();
    else enterArcView();
  });
}

// PARC-B — Character arc tracker: visual timeline.
// Horizontal scroll grid: episodes on X axis, characters on Y axis.
// Characters togglable on/off with color-coded chips.
// Locked canon events: solid circle; OQs: outlined rotated square (softer);
// Decisions: solid square if final, outlined if open/tentative.
// Click any marker → exits visual timeline and opens the source entry.
function setupCharVisualTimeline(leftCol, rightCol, ctx) {
  const { list, reloadList } = ctx;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn-secondary char-vt-toggle';
  toggle.textContent = 'Visual Timeline';
  leftCol.insertBefore(toggle, list);

  let vtMode = false;

  const CHAR_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
    '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
    '#00bcd4', '#ff5722', '#607d8b', '#795548',
  ];

  function parseSeason(title) {
    const m = (title || '').match(/\bS(\d+)E\d+/i) || (title || '').match(/\bSeason\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function parseEpNum(title) {
    const m = (title || '').match(/\bS\d+E(\d+)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function epShortLabel(ep) {
    const s = parseSeason(ep.title);
    const e = parseEpNum(ep.title);
    if (s !== null && e !== null) return { season: `S${s}`, ep: `E${e}` };
    const t = ep.title || '(untitled)';
    return { season: '', ep: t.length > 8 ? t.slice(0, 7) + '…' : t };
  }

  function exitVtMode() {
    vtMode = false;
    toggle.classList.remove('active');
    leftCol.style.display = '';
    reloadList();
  }

  async function enterVtMode() {
    vtMode = true;
    toggle.classList.add('active');
    leftCol.style.display = 'none';
    rightCol.innerHTML = '';

    const vtContainer = document.createElement('div');
    vtContainer.className = 'vt-container';
    rightCol.appendChild(vtContainer);

    let allChars = [];
    try { allChars = await window.revival.characters.list(); } catch { /* no-op */ }

    if (!allChars.length) {
      vtContainer.innerHTML = '<div class="vt-empty">No characters in the database yet.</div>';
      return;
    }

    const charColors = {};
    allChars.forEach((c, i) => { charColors[c.id] = CHAR_COLORS[i % CHAR_COLORS.length]; });

    const toggledIds = new Set(allChars.slice(0, Math.min(4, allChars.length)).map(c => c.id));
    const arcCache = new Map();

    async function getArcData(charId) {
      if (!arcCache.has(charId)) {
        try {
          arcCache.set(charId, await window.revival.characters.arcTimeline(charId));
        } catch { arcCache.set(charId, null); }
      }
      return arcCache.get(charId);
    }

    const header = document.createElement('div');
    header.className = 'vt-header';
    vtContainer.appendChild(header);

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn-secondary vt-back';
    backBtn.textContent = '← Back';
    backBtn.addEventListener('click', exitVtMode);
    header.appendChild(backBtn);

    const titleEl = document.createElement('span');
    titleEl.className = 'vt-title';
    titleEl.textContent = 'Visual Timeline';
    header.appendChild(titleEl);

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'vt-char-chips';
    header.appendChild(chipsWrap);

    const gridWrap = document.createElement('div');
    gridWrap.className = 'vt-grid-wrap';
    vtContainer.appendChild(gridWrap);

    function buildChips() {
      chipsWrap.innerHTML = '';

      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'vt-chip-ctrl';
      allBtn.textContent = 'All';
      allBtn.addEventListener('click', () => {
        allChars.forEach(c => toggledIds.add(c.id));
        buildChips();
        renderGrid();
      });
      chipsWrap.appendChild(allBtn);

      const noneBtn = document.createElement('button');
      noneBtn.type = 'button';
      noneBtn.className = 'vt-chip-ctrl';
      noneBtn.textContent = 'None';
      noneBtn.addEventListener('click', () => {
        toggledIds.clear();
        buildChips();
        renderGrid();
      });
      chipsWrap.appendChild(noneBtn);

      for (const c of allChars) {
        const on = toggledIds.has(c.id);
        const color = charColors[c.id];
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'vt-char-chip';
        chip.textContent = c.title;
        chip.style.borderColor = on ? color : 'var(--border)';
        chip.style.color = on ? color : 'var(--muted)';
        chip.style.background = on ? `${color}18` : '';
        chip.addEventListener('click', () => {
          if (toggledIds.has(c.id)) toggledIds.delete(c.id);
          else toggledIds.add(c.id);
          buildChips();
          renderGrid();
        });
        chipsWrap.appendChild(chip);
      }
    }

    async function renderGrid() {
      gridWrap.innerHTML = '';

      const visibleChars = allChars.filter(c => toggledIds.has(c.id));
      if (!visibleChars.length) {
        const empty = document.createElement('div');
        empty.className = 'vt-empty';
        empty.textContent = 'Select one or more characters above to view their timeline.';
        gridWrap.appendChild(empty);
        return;
      }

      await Promise.all(visibleChars.map(c => getArcData(c.id)));

      // Build unified episode list from the arc result with the most episodes.
      let allEps = [];
      for (const c of visibleChars) {
        const data = arcCache.get(c.id);
        if (data && data.rows.length > allEps.length) allEps = data.rows.map(r => r.episode);
      }

      if (!allEps.length) {
        const empty = document.createElement('div');
        empty.className = 'vt-empty';
        empty.textContent = 'No episodes in the database yet.';
        gridWrap.appendChild(empty);
        return;
      }

      const table = document.createElement('table');
      table.className = 'vt-grid';
      const thead = document.createElement('thead');

      const epRow = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'vt-corner';
      corner.textContent = 'Character';
      epRow.appendChild(corner);

      for (const ep of allEps) {
        const { season, ep: epCode } = epShortLabel(ep);
        const th = document.createElement('th');
        th.className = 'vt-ep-header';
        if (ep.ep_status === 'locked') th.classList.add('vt-ep-locked');
        th.title = ep.title || '(untitled)';
        if (season) {
          const sLabel = document.createElement('span');
          sLabel.className = 'vt-ep-season-label';
          sLabel.textContent = season;
          th.appendChild(sLabel);
        }
        const codeEl = document.createElement('span');
        codeEl.className = 'vt-ep-code';
        codeEl.textContent = epCode;
        th.appendChild(codeEl);
        if (ep.ep_status && ep.ep_status !== 'locked') {
          const statusEl = document.createElement('span');
          statusEl.className = 'vt-ep-status-label';
          statusEl.textContent = ep.ep_status;
          th.appendChild(statusEl);
        }
        epRow.appendChild(th);
      }
      thead.appendChild(epRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const c of visibleChars) {
        const data = arcCache.get(c.id);
        const color = charColors[c.id];
        const tr = document.createElement('tr');
        tr.className = 'vt-char-row';

        const labelTd = document.createElement('td');
        labelTd.className = 'vt-char-label';
        const dot = document.createElement('span');
        dot.className = 'vt-char-dot';
        dot.style.background = color;
        labelTd.appendChild(dot);
        const nameSpan = document.createElement('span');
        nameSpan.className = 'vt-char-name';
        nameSpan.textContent = c.title;
        labelTd.appendChild(nameSpan);
        if (c.char_status) {
          const sb = document.createElement('span');
          sb.className = 'vt-char-status-tag';
          sb.textContent = c.char_status;
          labelTd.appendChild(sb);
        }
        tr.appendChild(labelTd);

        for (const ep of allEps) {
          const td = document.createElement('td');
          td.className = 'vt-cell';

          if (data) {
            const epData = data.rows.find(r => r.episode.id === ep.id);
            if (epData) {
              const { canon_facts, open_questions, decisions } = epData;

              // Locked canon events: solid filled circle.
              for (const cf of canon_facts) {
                const m = document.createElement('button');
                m.type = 'button';
                m.className = 'vt-marker vt-marker-canon';
                m.style.background = color;
                m.style.borderColor = color;
                m.title = `Canon: ${cf.title || '(untitled)'}`;
                m.setAttribute('aria-label', `Open canon entry: ${cf.title}`);
                m.addEventListener('click', (e) => {
                  e.stopPropagation();
                  exitVtMode();
                  route('Canon Bible', cf.id);
                });
                td.appendChild(m);
              }

              // Open questions: outlined rotated square (softer / working).
              for (const oq of open_questions) {
                const m = document.createElement('button');
                m.type = 'button';
                m.className = 'vt-marker vt-marker-oq';
                m.style.borderColor = color;
                m.title = `Open Q: ${oq.title || '(untitled)'}`;
                m.setAttribute('aria-label', `Open question: ${oq.title}`);
                m.addEventListener('click', (e) => {
                  e.stopPropagation();
                  exitVtMode();
                  route('Open Questions', oq.id);
                });
                td.appendChild(m);
              }

              // Decisions: solid square if final, outlined if tentative/open.
              for (const d of decisions) {
                const isFinal = d.decision_status === 'final';
                const m = document.createElement('button');
                m.type = 'button';
                m.className = 'vt-marker vt-marker-decision';
                m.style.borderColor = color;
                m.style.background = isFinal ? color : 'transparent';
                m.title = `Decision: ${d.title || '(untitled)'}`;
                m.setAttribute('aria-label', `Open decision: ${d.title}`);
                m.addEventListener('click', (e) => {
                  e.stopPropagation();
                  exitVtMode();
                  route('Decisions', d.id);
                });
                td.appendChild(m);
              }
            }
          }

          tr.appendChild(td);
        }

        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      gridWrap.appendChild(table);
    }

    buildChips();
    await renderGrid();
  }

  toggle.addEventListener('click', () => {
    if (vtMode) exitVtMode();
    else enterVtMode();
  });
}

// Mounts the "Relationships" section in a character's detail panel.
// Shows existing relationships and an "Add Relationship" form.
async function mountCharRelationships(container, charId) {
  const section = document.createElement('div');
  section.className = 'char-rel-section';

  const heading = document.createElement('div');
  heading.className = 'char-rel-heading';
  heading.textContent = 'Relationships';
  section.appendChild(heading);

  const listEl = document.createElement('div');
  section.appendChild(listEl);

  const addRelBtn = document.createElement('button');
  addRelBtn.type = 'button';
  addRelBtn.className = 'btn-secondary char-rel-add-btn';
  addRelBtn.textContent = '+ Add Relationship';
  section.appendChild(addRelBtn);

  container.appendChild(section);

  let rels = [];
  let allChars = [];

  async function loadData() {
    [rels, allChars] = await Promise.all([
      window.revival.characterRelationships.listForChar(charId),
      window.revival.characters.list(),
    ]);
    renderRelList();
  }

  function renderRelList() {
    listEl.innerHTML = '';
    if (rels.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'char-rel-empty';
      empty.textContent = 'No relationships defined yet.';
      listEl.appendChild(empty);
      return;
    }
    for (const rel of rels) {
      const isFrom = rel.from_char_id === charId;
      const otherName = isFrom ? rel.to_name : rel.from_name;

      const row = document.createElement('div');
      row.className = 'char-rel-row';

      const typeTag = document.createElement('span');
      typeTag.className = 'char-rel-type';
      typeTag.textContent = rel.relation_type;

      const otherEl = document.createElement('span');
      otherEl.className = 'char-rel-other';
      otherEl.textContent = otherName;

      row.append(typeTag, otherEl);

      if (rel.note) {
        const noteEl = document.createElement('span');
        noteEl.className = 'char-rel-note';
        noteEl.textContent = rel.note;
        row.appendChild(noteEl);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'char-rel-delete';
      delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', async () => {
        delBtn.disabled = true;
        try {
          await window.revival.characterRelationships.delete(rel.id);
          await loadData();
        } catch {
          delBtn.disabled = false;
        }
      });
      row.appendChild(delBtn);
      listEl.appendChild(row);
    }
  }

  let formOpen = false;
  let formEl = null;

  addRelBtn.addEventListener('click', () => {
    if (formOpen) {
      formOpen = false;
      if (formEl) { formEl.remove(); formEl = null; }
      addRelBtn.textContent = '+ Add Relationship';
      return;
    }
    formOpen = true;
    addRelBtn.textContent = 'Cancel';

    formEl = document.createElement('div');
    formEl.className = 'char-rel-form';

    const otherChars = allChars.filter(c => c.id !== charId);

    const charSelect = document.createElement('select');
    const defOpt = document.createElement('option');
    defOpt.value = '';
    defOpt.textContent = '— Select character —';
    charSelect.appendChild(defOpt);
    for (const c of otherChars) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.title;
      charSelect.appendChild(opt);
    }
    if (otherChars.length === 0) {
      const noOpt = document.createElement('option');
      noOpt.disabled = true;
      noOpt.textContent = 'No other characters yet';
      charSelect.appendChild(noOpt);
    }

    // Datalist of common types — user can also free-type anything else
    const listId = `char-rel-types-${charId}`;
    const dl = document.createElement('datalist');
    dl.id = listId;
    for (const t of [
      'ally', 'rival', 'mentor', 'mentee', 'friend', 'enemy',
      'family', 'parent', 'sibling', 'spouse', 'cousin',
      'colleague', 'foil', 'nemesis', 'accomplice', 'love interest', 'ex',
    ]) {
      const o = document.createElement('option');
      o.value = t;
      dl.appendChild(o);
    }
    formEl.appendChild(dl);

    const typeInput = document.createElement('input');
    typeInput.type = 'text';
    typeInput.setAttribute('list', listId);
    typeInput.placeholder = 'Relationship type — pick or type your own';
    typeInput.maxLength = 100;

    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.placeholder = 'Note (optional)';
    noteInput.maxLength = 200;

    const actionsRow = document.createElement('div');
    actionsRow.className = 'char-rel-form-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Add';
    saveBtn.style.fontSize = '12px';
    saveBtn.style.padding = '3px 10px';

    const errSpan = document.createElement('span');
    errSpan.style.fontSize = '11px';
    errSpan.style.color = '#e05252';

    actionsRow.append(saveBtn, errSpan);
    formEl.append(charSelect, typeInput, noteInput, actionsRow);
    section.insertBefore(formEl, addRelBtn);

    typeInput.focus();

    saveBtn.addEventListener('click', async () => {
      const toId = parseInt(charSelect.value, 10);
      const relType = typeInput.value.trim();
      if (!toId) { errSpan.textContent = 'Select a character.'; return; }
      if (!relType) { errSpan.textContent = 'Enter a relationship type.'; return; }
      saveBtn.disabled = true;
      try {
        await window.revival.characterRelationships.create(
          charId, toId, relType, noteInput.value.trim() || null
        );
        formOpen = false;
        formEl.remove();
        formEl = null;
        addRelBtn.textContent = '+ Add Relationship';
        await loadData();
      } catch (e) {
        errSpan.textContent = e.message || 'Could not save.';
        saveBtn.disabled = false;
      }
    });
  });

  await loadData();
}

// P38 — Propose Canon Change section in Character/Episode detail panels.
// Adds a "Canon" heading + button; clicking opens the cp-overlay modal with
// the entry's title/body pre-filled and source attribution pre-wired.
function mountProposeCanonSection(container, item, sourceKind) {
  const section = document.createElement('div');
  section.className = 'canon-propose-section';

  const heading = document.createElement('div');
  heading.className = 'canon-propose-heading';
  heading.textContent = 'Canon';
  section.appendChild(heading);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-secondary canon-propose-btn';
  btn.textContent = 'Propose Canon Change';
  btn.addEventListener('click', () => openProposalModal(item, sourceKind));
  section.appendChild(btn);

  container.appendChild(section);
}

// --- End P37+P38 helpers ---------------------------------------------------

// ── P46-A — Flanagan Filter ────────────────────────────────────────────────
// Session-scoped defaults — survive one app session, reset on restart.
let _ffDefaultMode = 'editorial_filter';
// openFilter() for the currently-visible entry; called by the global shortcut.
let _ffOpenFilter = null;

const FF_MODES = [
  { value: 'editorial_filter', label: 'Editorial Filter (Tier 1 — Five Questions)' },
  { value: 'six_tensions',     label: 'The Six Tensions (Appendix A)' },
  { value: 'wwfd',             label: 'WWFD — What Would Flanagan Do?' },
  { value: 'full_diagnostic',  label: 'Full Diagnostic (all three)' },
  { value: 'production_check', label: 'Production Check (Tier 3)' },
];
// Lightweight workspaces (Conflicts, Decisions) only show the Editorial Filter.
const FF_LIGHT_MODES = [FF_MODES[0]];

const FF_CANON_NAMES = ['megan', 'jordan', 'diane', 'caroline', 'ray', 'marcus', 'renee'];

// P46-C helpers ───────────────────────────────────────────────────────────────

// Build the body for a routed analysis entry (Brainstorm / Research).
// sourceLabel is the workspace display name (e.g. 'Open Questions', 'Brainstorm').
function _ffBuildRoutedBody(item, res, mode, sourceLabel) {
  const modeName = FF_MODE_LABELS[mode] || mode || 'Analysis';
  const conf = res.confidence === 'clear' ? 'Clear verdict' : 'Genuine tension';
  const from = sourceLabel ? `${sourceLabel}: ` : '';
  const lines = [
    `[Flanagan Filter — ${modeName} | ${conf}]`,
    '',
    res.summary ? `Summary: ${res.summary}` : '',
    '',
    res.breakdown ? `Breakdown:\n${res.breakdown}` : '',
    '',
    res.northStar ? `North Star Check:\n${res.northStar}` : '',
    '',
    `— Analysis from ${from}"${item.title || '(untitled)'}"`,
  ];
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n').trim();
}

// Create a new entry in `apiName` workspace pre-filled with analysis content.
async function _ffRouteAnalysis(item, res, mode, apiName, sourceLabel) {
  const modeName = FF_MODE_LABELS[mode] || mode || 'Analysis';
  const title = `${item.title ? `"${item.title.slice(0, 60)}"` : 'Untitled'} — Flanagan ${modeName}`;
  const body = _ffBuildRoutedBody(item, res, mode, sourceLabel);
  return window.revival[apiName].create({ title, body });
}

// Fetch tag suggestions and render a confirmation panel inside `container`.
// entityKind identifies which workspace table to attach confirmed tags to.
async function _ffSuggestTags(container, item, res, mode, entityKind) {
  container.innerHTML = '';
  container.hidden = false;
  const loading = document.createElement('span');
  loading.className = 'ff-tag-suggest-loading';
  loading.textContent = 'Suggesting tags…';
  container.appendChild(loading);

  try {
    const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect && chatModelSelect.value)
      || 'claude-sonnet-4-6';
    const allTags = await window.revival.tags.listAll();
    if (!allTags || allTags.length === 0) {
      container.hidden = true;
      return;
    }
    const suggested = await window.revival.claude.flanaganTagSuggest(
      { summary: res.summary, breakdown: res.breakdown, northStar: res.northStar, questionTitle: item.title },
      allTags,
      model
    );
    container.innerHTML = '';
    if (!suggested || suggested.length === 0) {
      container.hidden = true;
      return;
    }

    const header = document.createElement('div');
    header.className = 'ff-tag-suggest-header';
    header.textContent = 'Suggested tags — confirm to apply:';
    container.appendChild(header);

    const chips = document.createElement('div');
    chips.className = 'ff-tag-suggest-chips';
    const checked = new Set(suggested.map((t) => t.id));

    for (const tag of suggested) {
      const label = document.createElement('label');
      label.className = 'ff-tag-chip';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.value = tag.id;
      cb.addEventListener('change', () => {
        if (cb.checked) checked.add(tag.id); else checked.delete(tag.id);
      });
      label.appendChild(cb);
      label.append(` ${tag.name}`);
      chips.appendChild(label);
    }
    container.appendChild(chips);

    const actions = document.createElement('div');
    actions.className = 'ff-tag-suggest-actions';
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn-secondary';
    applyBtn.style.fontSize = '12px';
    applyBtn.textContent = 'Apply selected';
    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled = true;
      try {
        for (const tag of suggested) {
          if (checked.has(tag.id)) {
            await window.revival.tags.attach(entityKind || 'open_questions', item.id, tag.id).catch(() => {});
          }
        }
        container.innerHTML = '';
        const done = document.createElement('span');
        done.className = 'ff-tag-suggest-done';
        done.textContent = `Tags applied.`;
        container.appendChild(done);
        setTimeout(() => { container.hidden = true; container.innerHTML = ''; }, 2500);
      } catch {
        applyBtn.disabled = false;
      }
    });
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-secondary';
    skipBtn.style.fontSize = '12px';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => {
      container.hidden = true;
      container.innerHTML = '';
    });
    actions.append(applyBtn, skipBtn);
    container.appendChild(actions);
  } catch {
    container.hidden = true;
  }
}

// mountFlanaganFilter(container, item, callbacks, ctx)
// — PFLAN-EXPAND: generalised to all creative/narrative workspaces.
// — ctx.entityKind     : string — workspace entity kind for storage + tag attachment
// — ctx.workspaceName  : string — display name used in route attribution
// — ctx.lightweight    : bool   — if true, show only Editorial Filter (Conflicts / Decisions)
// — ctx.showOptions    : bool   — if true, show Option A/B inputs (Open Questions only)
// — ctx.actionsRow     : DOM el — explicit actions row to attach trigger button to;
//                                 falls back to container.querySelector('.tc-detail-actions')
// — Adds a "Flanagan Filter" button to the actions row.
// — Appends a collapsible panel AFTER the actions row; hidden until triggered.
// — callbacks.refreshHistory: called after a successful save.
// — Exposes callbacks.openWithMode(mode) for P46-B history "Reopen" action.
function mountFlanaganFilter(container, item, callbacks, ctx) {
  const entityKind   = (ctx && ctx.entityKind)   || 'open_questions';
  const workspaceName= (ctx && ctx.workspaceName) || 'Entry';
  const lightweight  = !!(ctx && ctx.lightweight);
  const showOptions  = !!(ctx && ctx.showOptions);
  const activeModes  = lightweight ? FF_LIGHT_MODES : FF_MODES;

  const textLower = ((item.title || '') + ' ' + (item.body || '')).toLowerCase();
  const mentionsCanon = FF_CANON_NAMES.some((n) => textLower.includes(n));

  // ── 1. Add trigger button to the actions row ──────────────────────────
  const actionsRow = (ctx && ctx.actionsRow) || container.querySelector('.tc-detail-actions');
  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'btn-secondary ff-trigger-btn';
  triggerBtn.textContent = 'Flanagan Filter';
  triggerBtn.title = 'Run Flanagan craft analysis (⌘⇧A)';
  if (actionsRow) actionsRow.appendChild(triggerBtn);

  // ── 2. Build the collapsible panel ────────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'ff-panel';
  panel.hidden = true;

  const header = document.createElement('div');
  header.className = 'ff-header';
  const ffLabel = document.createElement('span');
  ffLabel.className = 'ff-label';
  ffLabel.textContent = 'The Flanagan Filter';
  const shortcutHint = document.createElement('span');
  shortcutHint.className = 'ff-shortcut-hint';
  shortcutHint.textContent = '⌘⇧A';
  shortcutHint.title = 'Cmd+Shift+A';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ff-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close';
  closeBtn.addEventListener('click', () => { panel.hidden = true; });
  header.append(ffLabel, shortcutHint, closeBtn);
  panel.appendChild(header);

  // Mode select + run button
  const controls = document.createElement('div');
  controls.className = 'ff-controls';

  const modeSelect = document.createElement('select');
  modeSelect.className = 'ff-mode-select';
  for (const m of activeModes) {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    modeSelect.appendChild(opt);
  }
  // Default to session preference if the mode is available in activeModes; else first.
  modeSelect.value = activeModes.some((m) => m.value === _ffDefaultMode)
    ? _ffDefaultMode
    : activeModes[0].value;

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'btn-primary ff-run-btn';
  runBtn.textContent = 'Run Analysis';

  controls.append(modeSelect, runBtn);
  panel.appendChild(controls);

  // "Not ready" soft gates — WWFD and Production Check both need scene-level context.
  const contextWarning = document.createElement('div');
  contextWarning.className = 'ff-context-note';
  contextWarning.hidden = true;
  panel.appendChild(contextWarning);

  function hasSceneLevelContext() {
    return ['scene', 'act ', 'episode', 'moment', 'shot ', 'dialogue', 'visual',
            'camera', 'sequence', 'int.', 'ext.', ' page', 'cut to', ' beat ',
            'says:', 'says "'].some((k) => textLower.includes(k));
  }

  function updateContextWarning() {
    const v = modeSelect.value;
    if (v === 'wwfd' && !hasSceneLevelContext()) {
      contextWarning.textContent =
        'WWFD works best with scene-level context: a specific moment, scene, ' +
        'dialogue situation, or character decision. This entry appears to describe ' +
        'a higher-level story question — results may be less precise. You can still run.';
      contextWarning.hidden = false;
    } else if (v === 'production_check' && !hasSceneLevelContext()) {
      contextWarning.textContent =
        'Production Check works best with scene or visual content (camera position, ' +
        'location description, action lines). This entry lacks scene-level detail — ' +
        'Claude will note which Tier 3 constraints apply when the scene is designed. ' +
        'You can still run.';
      contextWarning.hidden = false;
    } else {
      contextWarning.hidden = true;
    }
  }

  modeSelect.addEventListener('change', () => {
    _ffDefaultMode = modeSelect.value;
    updateContextWarning();
  });
  updateContextWarning();

  // Passive canon conflict flag
  if (mentionsCanon) {
    const canonFlag = document.createElement('div');
    canonFlag.className = 'ff-canon-flag';
    canonFlag.textContent =
      'This entry mentions canon characters or entities. Canon context is ' +
      'available in the Canon Bible but is not auto-pulled into this analysis.';
    panel.appendChild(canonFlag);
  }

  // Tier badge (Open Questions only)
  if (item.tier) {
    const tierBadge = document.createElement('div');
    tierBadge.className = 'ff-tier-badge';
    tierBadge.textContent = `Tier ${item.tier} question`;
    panel.appendChild(tierBadge);
  }

  // Editable option labels — only shown for Open Questions (showOptions: true)
  const optionInputs = [];
  if (showOptions) {
    const bodyText = item.body || '';
    const optAMatch = bodyText.match(/option\s+a[:\s]+([^\n]+)/i);
    const optBMatch = bodyText.match(/option\s+b[:\s]+([^\n]+)/i);
    const defaultOptions = [
      { key: 'A', value: optAMatch ? optAMatch[1].trim() : 'Option A' },
      { key: 'B', value: optBMatch ? optBMatch[1].trim() : 'Option B' },
    ];
    const optionsSection = document.createElement('div');
    optionsSection.className = 'ff-options';
    const optionsHeading = document.createElement('div');
    optionsHeading.className = 'ff-options-heading';
    optionsHeading.textContent = 'Options under consideration (edit to clarify before running):';
    optionsSection.appendChild(optionsHeading);
    for (const opt of defaultOptions) {
      const row = document.createElement('div');
      row.className = 'ff-option-row';
      const keyLabel = document.createElement('span');
      keyLabel.className = 'ff-option-key';
      keyLabel.textContent = `Option ${opt.key}`;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'ff-option-input';
      inp.value = opt.value;
      inp.placeholder = `Describe option ${opt.key}…`;
      optionInputs.push({ key: opt.key, input: inp });
      row.append(keyLabel, inp);
      optionsSection.appendChild(row);
    }
    panel.appendChild(optionsSection);
  }

  // Result area — hidden until a run completes
  const resultArea = document.createElement('div');
  resultArea.className = 'ff-result-area';
  resultArea.hidden = true;
  panel.appendChild(resultArea);

  function buildRerunBar(currentMode) {
    const rerunBar = document.createElement('div');
    rerunBar.className = 'ff-rerun-bar';
    const rerunLabel = document.createElement('span');
    rerunLabel.className = 'ff-rerun-label';
    rerunLabel.textContent = 'Run again with:';
    const rerunSelect = document.createElement('select');
    rerunSelect.className = 'ff-mode-select';
    for (const m of activeModes) {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      rerunSelect.appendChild(opt);
    }
    rerunSelect.value = currentMode;
    rerunSelect.addEventListener('change', () => {
      _ffDefaultMode = rerunSelect.value;
      modeSelect.value = rerunSelect.value;
      updateContextWarning();
    });
    const rerunBtn = document.createElement('button');
    rerunBtn.type = 'button';
    rerunBtn.className = 'btn-secondary ff-rerun-btn';
    rerunBtn.textContent = 'Re-run';
    rerunBtn.addEventListener('click', () => {
      _ffDefaultMode = rerunSelect.value;
      modeSelect.value = rerunSelect.value;
      updateContextWarning();
      runAnalysis(rerunSelect.value);
    });
    rerunBar.append(rerunLabel, rerunSelect, rerunBtn);
    return rerunBar;
  }

  async function runAnalysis(mode) {
    const options = optionInputs.map((o) => ({
      key: o.key,
      label: o.input.value.trim() || `Option ${o.key}`,
    }));

    runBtn.disabled = true;
    runBtn.textContent = 'Running…';
    resultArea.hidden = false;
    resultArea.innerHTML = '';

    const thinkingEl = document.createElement('p');
    thinkingEl.className = 'ff-thinking';
    thinkingEl.textContent = 'Analyzing against the Flanagan criteria…';
    resultArea.appendChild(thinkingEl);

    try {
      const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect && chatModelSelect.value)
        || 'claude-sonnet-4-6';
      const res = await window.revival.claude.flanaganFilter({
        entityTitle: item.title || '',
        entityBody: item.body || '',
        tier: item.tier || null,
        options,
        mode,
      }, model);

      resultArea.innerHTML = '';

      // Summary line with confidence badge
      const summaryEl = document.createElement('div');
      summaryEl.className = 'ff-summary';
      const confidenceBadge = document.createElement('span');
      confidenceBadge.className =
        `ff-confidence ff-confidence-${res.confidence === 'clear' ? 'clear' : 'tension'}`;
      confidenceBadge.textContent =
        res.confidence === 'clear' ? 'Clear verdict' : 'Genuine tension';
      const summaryText = document.createTextNode(' ' + res.summary);
      summaryEl.append(confidenceBadge, summaryText);
      resultArea.appendChild(summaryEl);

      // Full breakdown
      const breakdownEl = document.createElement('div');
      breakdownEl.className = 'ff-breakdown';
      breakdownEl.textContent = res.breakdown;
      resultArea.appendChild(breakdownEl);

      // North Star check
      const northStarEl = document.createElement('div');
      northStarEl.className = 'ff-north-star';
      const nsLabel = document.createElement('div');
      nsLabel.className = 'ff-north-star-label';
      nsLabel.textContent = 'North Star Check';
      const nsText = document.createElement('div');
      nsText.className = 'ff-north-star-text';
      nsText.textContent = res.northStar;
      northStarEl.append(nsLabel, nsText);
      resultArea.appendChild(northStarEl);

      // Attach extract-and-route to output text
      if (window.RevivalExtract) {
        window.RevivalExtract.attach(resultArea, {
          workspace: workspaceName,
          id: item.id,
          title: item.title,
        });
      }

      resultArea.appendChild(buildRerunBar(mode));

      // Save bar + route buttons + tag suggestions
      const saveBar = document.createElement('div');
      saveBar.className = 'ff-save-bar';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'btn-secondary';
      saveBtn.textContent = 'Save analysis';
      const saveConfirm = document.createElement('span');
      saveConfirm.className = 'ff-save-confirm';
      saveConfirm.hidden = true;
      saveConfirm.textContent = 'Saved to history.';

      const tagSuggestPanel = document.createElement('div');
      tagSuggestPanel.className = 'ff-tag-suggest-panel';
      tagSuggestPanel.hidden = true;

      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          await window.revival.flanaganAnalyses.create(entityKind, item.id, {
            scanMode: mode,
            flanaganVersion: res.flanaganVersion || 'unknown',
            summary: res.summary,
            breakdown: res.breakdown,
            northStar: res.northStar,
            confidence: res.confidence,
          });
          saveBtn.textContent = 'Saved';
          saveConfirm.hidden = false;
          if (callbacks && callbacks.refreshHistory) callbacks.refreshHistory();
          _ffSuggestTags(tagSuggestPanel, item, res, mode, entityKind);
        } catch {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save failed — try again';
        }
      });
      const dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'btn-secondary';
      dismissBtn.textContent = 'Dismiss';
      dismissBtn.title = 'Clear this result without saving';
      dismissBtn.addEventListener('click', () => {
        resultArea.hidden = true;
        resultArea.innerHTML = '';
      });
      saveBar.append(saveBtn, saveConfirm, dismissBtn);
      resultArea.appendChild(saveBar);

      // Route buttons — send full analysis to Brainstorm or Research
      const routeBar = document.createElement('div');
      routeBar.className = 'ff-route-bar';
      const routeLabel = document.createElement('span');
      routeLabel.className = 'ff-route-label';
      routeLabel.textContent = 'Route analysis to:';
      routeBar.appendChild(routeLabel);
      for (const dest of [
        { label: 'Brainstorm', apiName: 'brainstorm', kind: 'brainstorm' },
        { label: 'Research', apiName: 'research', kind: 'research' },
      ]) {
        const routeBtn = document.createElement('button');
        routeBtn.type = 'button';
        routeBtn.className = 'btn-secondary ff-route-btn';
        routeBtn.textContent = `→ ${dest.label}`;
        routeBtn.addEventListener('click', async () => {
          routeBtn.disabled = true;
          try {
            const created = await _ffRouteAnalysis(item, res, mode, dest.apiName, workspaceName);
            if (created) {
              await window.revival.crossWorkspace.attach(
                dest.kind, created.id, entityKind, item.id
              ).catch(() => {});
              routeBtn.textContent = `✓ Sent to ${dest.label}`;
              showRoutedToast(dest.label);
            }
          } catch {
            routeBtn.disabled = false;
          }
        });
        routeBar.appendChild(routeBtn);
      }
      // PAI-WIRE — P46→P41: "→ Canon Review" button with inline confirm form.
      const canonProposeBtn = document.createElement('button');
      canonProposeBtn.type = 'button';
      canonProposeBtn.className = 'btn-secondary ff-route-btn';
      canonProposeBtn.textContent = '→ Canon Review';
      canonProposeBtn.title = 'Propose a canon entry from this analysis (you confirm before it is staged)';
      routeBar.appendChild(canonProposeBtn);

      resultArea.appendChild(routeBar);

      const canonProposeForm = document.createElement('div');
      canonProposeForm.hidden = true;
      canonProposeForm.style.cssText =
        'margin-top:8px;padding:8px;background:rgba(74,158,255,0.07);border-radius:4px;';
      const cpTitle = document.createElement('input');
      cpTitle.type = 'text';
      cpTitle.style.cssText =
        'width:100%;box-sizing:border-box;margin-bottom:4px;padding:4px 6px;' +
        'background:var(--bg,#1a1a1a);color:var(--text,#ddd);' +
        'border:1px solid var(--border,#444);border-radius:3px;font-size:12px;';
      cpTitle.placeholder = 'Proposal title…';
      cpTitle.value = item.title ? `"${item.title.slice(0, 60)}" — Canon Proposal` : 'Canon Proposal';
      const cpNote = document.createElement('div');
      cpNote.style.cssText = 'font-size:11px;opacity:0.6;margin-bottom:6px;';
      cpNote.textContent = 'Analysis summary and breakdown will be included as supporting context.';
      const cpBtns = document.createElement('div');
      cpBtns.style.cssText = 'display:flex;gap:6px;align-items:center;';
      const cpConfirm = document.createElement('button');
      cpConfirm.type = 'button';
      cpConfirm.className = 'btn-primary';
      cpConfirm.style.fontSize = '12px';
      cpConfirm.textContent = 'Stage in Canon Review';
      const cpCancel = document.createElement('button');
      cpCancel.type = 'button';
      cpCancel.className = 'btn-secondary';
      cpCancel.style.fontSize = '12px';
      cpCancel.textContent = 'Cancel';
      cpBtns.append(cpConfirm, cpCancel);
      canonProposeForm.append(cpTitle, cpNote, cpBtns);
      resultArea.appendChild(canonProposeForm);

      canonProposeBtn.addEventListener('click', () => {
        canonProposeForm.hidden = false;
        cpTitle.focus();
      });
      cpCancel.addEventListener('click', () => {
        canonProposeForm.hidden = true;
      });
      cpConfirm.addEventListener('click', async () => {
        cpConfirm.disabled = true;
        cpConfirm.textContent = 'Staging…';
        try {
          const propTitle = cpTitle.value.trim() || 'Canon Proposal';
          const propBody = _ffBuildRoutedBody(item, res, mode, workspaceName);
          await window.revival.canonProposals.createFromAI({
            entry_type: null,
            title: propTitle,
            body: propBody,
            proposer_note: `Flanagan Filter — ${FF_MODE_LABELS[mode] || mode} on "${item.title || '(untitled)'}" in ${workspaceName}`,
          });
          canonProposeForm.innerHTML = '';
          const doneEl = document.createElement('span');
          doneEl.style.cssText = 'font-size:12px;color:var(--accent,#4a9eff);';
          doneEl.textContent = 'Staged in Canon Review.';
          canonProposeForm.appendChild(doneEl);
          showRoutedToast('Canon Review');
          canonProposeBtn.textContent = '✓ Sent to Canon Review';
          canonProposeBtn.disabled = true;
        } catch (cpErr) {
          cpConfirm.disabled = false;
          cpConfirm.textContent = 'Stage in Canon Review';
          const errMsg = (cpErr.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
          const errEl = document.createElement('span');
          errEl.style.cssText = 'font-size:11px;color:var(--error,#f87171);margin-left:6px;';
          errEl.textContent = errMsg || 'Failed to stage.';
          cpBtns.appendChild(errEl);
        }
      });

      resultArea.appendChild(tagSuggestPanel);
    } catch (err) {
      resultArea.innerHTML = '';
      const errEl = document.createElement('p');
      errEl.className = 'ff-error';
      errEl.textContent = `Error: ${err.message || 'Analysis failed. Check your API key in Settings.'}`;
      resultArea.appendChild(errEl);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = 'Run Analysis';
    }
  }

  runBtn.addEventListener('click', () => {
    _ffDefaultMode = modeSelect.value;
    runAnalysis(modeSelect.value);
  });

  function openFilter(mode) {
    if (mode && activeModes.some((m) => m.value === mode)) {
      modeSelect.value = mode;
      _ffDefaultMode = mode;
      updateContextWarning();
    }
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    modeSelect.focus();
  }

  triggerBtn.addEventListener('click', () => openFilter());

  _ffOpenFilter = () => openFilter();

  if (callbacks) callbacks.openWithMode = openFilter;

  // Insert the panel immediately after the actions row.
  if (actionsRow && actionsRow.nextSibling) {
    container.insertBefore(panel, actionsRow.nextSibling);
  } else {
    container.appendChild(panel);
  }
}
// ── End P46-A / PFLAN-EXPAND ────────────────────────────────────────────────

// ── P46-B / PFLAN-EXPAND — Flanagan Analysis History ───────────────────────
// mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, entityKind)
// — Appends a collapsed <details> section listing all saved Flanagan Filter
//   analyses for the given entity.
// — entityKind: workspace entity kind (e.g. 'open_questions', 'brainstorm').
// — When archivedFlag is true all analyses are read-only.
// — callbacks.openWithMode(mode): opens the filter panel with mode preselected.
// — Returns { refresh } so the save bar in mountFlanaganFilter can refresh.

const FF_MODE_LABELS = {
  editorial_filter: 'Editorial Filter',
  six_tensions: 'Six Tensions',
  wwfd: 'WWFD',
  full_diagnostic: 'Full Diagnostic',
  production_check: 'Production Check',
};

function mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, entityKind) {
  entityKind = entityKind || 'open_questions';
  const section = document.createElement('details');
  section.className = 'ff-history-section';

  const summary = document.createElement('summary');
  section.appendChild(summary);

  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'ff-history-cards';
  section.appendChild(cardsContainer);

  function buildCard(analysis) {
    const card = document.createElement('div');
    card.className = 'ff-history-card';

    // Header: mode badge + date + version + stale badge
    const header = document.createElement('div');
    header.className = 'ff-history-card-header';

    const modeBadge = document.createElement('span');
    modeBadge.className = 'ff-history-mode-badge';
    modeBadge.textContent = FF_MODE_LABELS[analysis.scan_mode] || analysis.scan_mode || '—';

    const confBadge = document.createElement('span');
    confBadge.className =
      `ff-confidence ff-confidence-${analysis.confidence === 'clear' ? 'clear' : 'tension'}`;
    confBadge.textContent = analysis.confidence === 'clear' ? 'Clear verdict' : 'Genuine tension';

    const dateSpan = document.createElement('span');
    dateSpan.className = 'ff-history-date';
    dateSpan.textContent = new Date(analysis.created_at).toLocaleString();

    header.append(modeBadge, confBadge, dateSpan);

    if (analysis.flanagan_version && analysis.flanagan_version !== 'unknown') {
      const verSpan = document.createElement('span');
      verSpan.className = 'ff-history-version';
      verSpan.textContent = `doc: ${analysis.flanagan_version}`;
      header.appendChild(verSpan);
    }

    if (analysis.is_stale) {
      const staleBadge = document.createElement('span');
      staleBadge.className = 'ff-stale-badge';
      staleBadge.textContent = 'Stale — reopen with new context';
      header.appendChild(staleBadge);
    }

    card.appendChild(header);

    // Summary line
    if (analysis.summary) {
      const summaryEl = document.createElement('div');
      summaryEl.className = 'ff-history-card-summary';
      summaryEl.textContent = analysis.summary;
      card.appendChild(summaryEl);
    }

    // Actions
    const cardActions = document.createElement('div');
    cardActions.className = 'ff-history-card-actions';

    const isLocked = archivedFlag || !!item.resolved_by_decision_id;
    if (!isLocked && !analysis.is_stale) {
      const reopenBtn = document.createElement('button');
      reopenBtn.type = 'button';
      reopenBtn.className = 'btn-secondary';
      reopenBtn.textContent = 'Reopen with new context';
      reopenBtn.title =
        'Mark this analysis as stale and open the filter to run a fresh analysis';
      reopenBtn.addEventListener('click', async () => {
        reopenBtn.disabled = true;
        try {
          await window.revival.flanaganAnalyses.markStale(analysis.id);
          if (callbacks && callbacks.openWithMode) {
            callbacks.openWithMode(analysis.scan_mode);
          }
          refresh();
        } catch {
          reopenBtn.disabled = false;
        }
      });
      cardActions.appendChild(reopenBtn);
    } else if (isLocked) {
      const lockedNote = document.createElement('div');
      lockedNote.className = 'ff-history-locked-note';
      lockedNote.textContent = item.resolved_by_decision_id
        ? 'Analysis locked — promoted to a Decision.'
        : 'Analysis locked — entry is archived.';
      card.appendChild(lockedNote);
    }

    // P46-C: route this saved analysis to Brainstorm or Research
    for (const dest of [
      { label: 'Brainstorm', apiName: 'brainstorm', kind: 'brainstorm' },
      { label: 'Research', apiName: 'research', kind: 'research' },
    ]) {
      const routeBtn = document.createElement('button');
      routeBtn.type = 'button';
      routeBtn.className = 'btn-secondary';
      routeBtn.style.cssText = 'font-size:11px;padding:3px 8px;';
      routeBtn.textContent = `→ ${dest.label}`;
      routeBtn.addEventListener('click', async () => {
        routeBtn.disabled = true;
        try {
          const created = await _ffRouteAnalysis(item, analysis, analysis.scan_mode, dest.apiName);
          if (created) {
            await window.revival.crossWorkspace.attach(
              dest.kind, created.id, entityKind, item.id
            ).catch(() => {});
            routeBtn.textContent = `✓ ${dest.label}`;
            showRoutedToast(dest.label);
          }
        } catch {
          routeBtn.disabled = false;
        }
      });
      cardActions.appendChild(routeBtn);
    }

    // Delete always available (even on stale / archived question)
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.style.cssText = 'font-size:11px;padding:3px 8px;';
    deleteBtn.textContent = 'Delete';
    deleteBtn.title = 'Permanently delete this saved analysis';
    deleteBtn.addEventListener('click', async () => {
      deleteBtn.disabled = true;
      try {
        await window.revival.flanaganAnalyses.delete(analysis.id);
        refresh();
      } catch {
        deleteBtn.disabled = false;
      }
    });
    cardActions.appendChild(deleteBtn);
    card.appendChild(cardActions);

    return card;
  }

  async function refresh() {
    let analyses = [];
    try {
      analyses = await window.revival.flanaganAnalyses.list(entityKind, item.id);
    } catch {
      analyses = [];
    }

    summary.textContent = '';
    summary.textContent = `Analysis History (${analyses.length})`;

    cardsContainer.innerHTML = '';
    if (analyses.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;color:var(--muted);padding:4px 0;';
      empty.textContent = 'No analyses saved yet.';
      cardsContainer.appendChild(empty);
    } else {
      for (const a of analyses) {
        cardsContainer.appendChild(buildCard(a));
      }
    }
  }

  refresh();
  rightCol.appendChild(section);

  return { refresh };
}
// ── End P46-B ──────────────────────────────────────────────────────────────

// ── PBLOCK — Open Questions: blocking flag, tier escalation, promote to Decision ──
// Appended to rightCol in Open Questions detailExtra. Manages its own async state.
function mountPBlockPanel(rightCol, item, archivedFlag) {
  const panel = document.createElement('div');
  panel.className = 'pblock-panel';

  const head = document.createElement('div');
  head.className = 'pblock-head';
  head.textContent = 'Question Status';
  panel.appendChild(head);

  // --- Blocking flag section ---
  const blockWrap = document.createElement('div');
  panel.appendChild(blockWrap);
  renderBlockingUI(blockWrap);

  // --- Tier escalation section (tier 2/3 only, or show history if already escalated) ---
  if (!archivedFlag && item.tier && item.tier > 1) {
    const tierWrap = document.createElement('div');
    panel.appendChild(tierWrap);
    renderTierUI(tierWrap);
  } else if (item.tier_escalated_at) {
    const tierWrap = document.createElement('div');
    tierWrap.className = 'pblock-history-note';
    tierWrap.textContent =
      `Escalated from Tier ${item.tier_escalated_from} on ${new Date(item.tier_escalated_at).toLocaleDateString()}`;
    panel.appendChild(tierWrap);
  }

  // --- Promote to Decision section (active questions only) ---
  if (!archivedFlag) {
    const promoteWrap = document.createElement('div');
    panel.appendChild(promoteWrap);
    renderPromoteUI(promoteWrap);
  } else if (item.resolved_by_decision_id) {
    const resolvedNote = document.createElement('div');
    resolvedNote.className = 'pblock-resolved-note';
    resolvedNote.textContent = `Promoted to Decision #${item.resolved_by_decision_id}`;
    panel.appendChild(resolvedNote);
  }

  // Insert immediately after the actions row (same pattern as mountFlanaganFilter)
  // so the panel is visible without heavy scrolling even on entries with long bodies.
  const actionsRow = rightCol.querySelector('.tc-detail-actions');
  if (actionsRow && actionsRow.nextSibling) {
    rightCol.insertBefore(panel, actionsRow.nextSibling);
  } else {
    rightCol.appendChild(panel);
  }

  // ── Inner render functions ─────────────────────────────────────────────────

  function renderBlockingUI(wrap) {
    wrap.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'pblock-row';

    const label = document.createElement('span');
    label.className = 'pblock-label';
    label.textContent = 'Blocking:';
    row.appendChild(label);

    if (item.is_blocking) {
      const detail = document.createElement('span');
      detail.className = 'pblock-blocking-detail';
      const t = item.blocking_target;
      const k = item.blocking_type || 'item';
      detail.textContent = t ? `${k}: "${t}"` : 'flagged';
      row.appendChild(detail);

      if (!archivedFlag) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-secondary pblock-btn';
        removeBtn.textContent = 'Remove flag';
        removeBtn.addEventListener('click', async () => {
          removeBtn.disabled = true;
          try {
            const updated = await window.revival.openQuestions.setBlocking(item.id, { is_blocking: false });
            Object.assign(item, updated);
            renderBlockingUI(wrap);
          } catch { removeBtn.disabled = false; }
        });
        row.appendChild(removeBtn);
      }
      wrap.appendChild(row);
    } else {
      const noneLabel = document.createElement('span');
      noneLabel.className = 'pblock-none';
      noneLabel.textContent = 'Not blocking';
      row.appendChild(noneLabel);

      if (!archivedFlag) {
        const setBtn = document.createElement('button');
        setBtn.type = 'button';
        setBtn.className = 'btn-secondary pblock-btn';
        setBtn.textContent = 'Mark as blocking';
        row.appendChild(setBtn);
        wrap.appendChild(row);

        const form = document.createElement('div');
        form.className = 'pblock-blocking-form';
        form.hidden = true;

        const targetInput = document.createElement('input');
        targetInput.type = 'text';
        targetInput.className = 'pblock-input';
        targetInput.placeholder = 'What is being blocked? (e.g. "Episode 3")';

        const typeSelect = document.createElement('select');
        typeSelect.className = 'pblock-select';
        for (const [v, l] of [['episode', 'Episode'], ['character', 'Character'], ['arc', 'Arc']]) {
          const opt = document.createElement('option');
          opt.value = v; opt.textContent = l;
          typeSelect.appendChild(opt);
        }

        const formBtnRow = document.createElement('div');
        formBtnRow.className = 'pblock-btn-row';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn-primary pblock-btn';
        saveBtn.textContent = 'Set blocking flag';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-secondary pblock-btn';
        cancelBtn.textContent = 'Cancel';
        formBtnRow.append(saveBtn, cancelBtn);
        form.append(targetInput, typeSelect, formBtnRow);
        wrap.appendChild(form);

        setBtn.addEventListener('click', () => { form.hidden = false; setBtn.hidden = true; targetInput.focus(); });
        cancelBtn.addEventListener('click', () => { form.hidden = true; setBtn.hidden = false; });
        saveBtn.addEventListener('click', async () => {
          saveBtn.disabled = true;
          try {
            const updated = await window.revival.openQuestions.setBlocking(item.id, {
              is_blocking: true,
              blocking_target: targetInput.value.trim(),
              blocking_type: typeSelect.value,
            });
            Object.assign(item, updated);
            renderBlockingUI(wrap);
          } catch { saveBtn.disabled = false; }
        });
      } else {
        wrap.appendChild(row);
      }
    }
  }

  function renderTierUI(wrap) {
    wrap.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'pblock-row';

    const label = document.createElement('span');
    label.className = 'pblock-label';
    label.textContent = `Tier ${item.tier}:`;
    row.appendChild(label);

    if (item.tier_escalated_at) {
      const note = document.createElement('span');
      note.className = 'pblock-history-note';
      note.textContent =
        `Escalated from Tier ${item.tier_escalated_from} on ${new Date(item.tier_escalated_at).toLocaleDateString()}`;
      row.appendChild(note);
      wrap.appendChild(row);
    } else {
      const escalateBtn = document.createElement('button');
      escalateBtn.type = 'button';
      escalateBtn.className = 'btn-secondary pblock-btn';
      escalateBtn.textContent = 'Escalate to Tier 1';
      escalateBtn.title = 'Promote this question to Tier 1. This will be logged.';
      row.appendChild(escalateBtn);
      wrap.appendChild(row);

      escalateBtn.addEventListener('click', () => {
        escalateBtn.hidden = true;
        const confirmRow = document.createElement('div');
        confirmRow.className = 'pblock-confirm-row';
        const msg = document.createElement('span');
        msg.className = 'pblock-confirm-text';
        msg.textContent = 'Promote to Tier 1? This will be logged and cannot be undone.';
        const yesBtn = document.createElement('button');
        yesBtn.type = 'button';
        yesBtn.className = 'btn-primary pblock-btn';
        yesBtn.textContent = 'Escalate';
        const noBtn = document.createElement('button');
        noBtn.type = 'button';
        noBtn.className = 'btn-secondary pblock-btn';
        noBtn.textContent = 'Cancel';
        confirmRow.append(msg, yesBtn, noBtn);
        wrap.appendChild(confirmRow);

        noBtn.addEventListener('click', () => { confirmRow.remove(); escalateBtn.hidden = false; });
        yesBtn.addEventListener('click', async () => {
          yesBtn.disabled = true;
          try {
            const updated = await window.revival.openQuestions.escalateTier(item.id);
            Object.assign(item, updated);
            renderTierUI(wrap);
          } catch (e) {
            msg.textContent = e.message || 'Could not escalate.';
            yesBtn.disabled = false;
          }
        });
      });
    }
  }

  function renderPromoteUI(wrap) {
    wrap.innerHTML = '';
    if (item.resolved_by_decision_id) {
      const row = document.createElement('div');
      row.className = 'pblock-row';
      const note = document.createElement('span');
      note.className = 'pblock-resolved-note';
      note.textContent = `Promoted to Decision #${item.resolved_by_decision_id}`;
      const jumpBtn = document.createElement('button');
      jumpBtn.type = 'button';
      jumpBtn.className = 'btn-secondary pblock-btn';
      jumpBtn.textContent = 'Open →';
      jumpBtn.addEventListener('click', () => route('Decisions', item.resolved_by_decision_id));
      row.append(note, jumpBtn);
      wrap.appendChild(row);
      return;
    }

    const row = document.createElement('div');
    row.className = 'pblock-row';
    const promoteBtn = document.createElement('button');
    promoteBtn.type = 'button';
    promoteBtn.className = 'btn-secondary pblock-btn';
    promoteBtn.textContent = 'Promote to Decision';
    promoteBtn.title = 'Create a linked Decision entry pre-filled with this question\'s content';
    row.appendChild(promoteBtn);
    wrap.appendChild(row);

    const form = document.createElement('div');
    form.className = 'pblock-promote-form';
    form.hidden = true;

    const formHint = document.createElement('div');
    formHint.className = 'pblock-form-hint';
    formHint.textContent = 'Creates a new Decision linked to this question:';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'pblock-input';
    titleInput.placeholder = 'Decision title…';
    titleInput.value = item.title || '';

    const bodyInput = document.createElement('textarea');
    bodyInput.className = 'pblock-textarea';
    bodyInput.placeholder = 'Resolution details (optional)…';
    bodyInput.rows = 3;
    bodyInput.value = item.body || '';

    const formBtnRow = document.createElement('div');
    formBtnRow.className = 'pblock-btn-row';
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn-primary pblock-btn';
    createBtn.textContent = 'Create Decision';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary pblock-btn';
    cancelBtn.textContent = 'Cancel';
    formBtnRow.append(createBtn, cancelBtn);
    form.append(formHint, titleInput, bodyInput, formBtnRow);
    wrap.appendChild(form);

    promoteBtn.addEventListener('click', () => {
      form.hidden = false;
      promoteBtn.hidden = true;
      titleInput.focus();
      titleInput.select();
    });
    cancelBtn.addEventListener('click', () => { form.hidden = true; promoteBtn.hidden = false; });
    createBtn.addEventListener('click', async () => {
      const title = titleInput.value.trim();
      if (!title) { titleInput.focus(); return; }
      createBtn.disabled = true;
      try {
        const decision = await window.revival.decisions.createFromQuestion(
          item.id, { title, body: bodyInput.value.trim() }
        );
        Object.assign(item, { resolved_by_decision_id: decision.id });
        renderPromoteUI(wrap);
        showUndoToast(`Decision "${decision.title}" created — linked to this question.`);
      } catch (e) {
        formHint.textContent = e.message || 'Could not create decision.';
        createBtn.disabled = false;
      }
    });
  }
}
// ── End PBLOCK ─────────────────────────────────────────────────────────────

// ── POQ-DEPENDS — dependency panel on Open Question detail ─────────────────
async function mountOqDependsPanel(container, item, archivedFlag, onListReload) {
  const section = document.createElement('div');
  section.className = 'oq-depends-section';
  container.appendChild(section);

  async function render() {
    section.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'oq-depends-head';
    const headLabel = document.createElement('span');
    headLabel.textContent = 'Depends on';
    head.appendChild(headLabel);
    section.appendChild(head);

    let blockers = [];
    try {
      blockers = await window.revival.openQuestions.getDependencies(item.id);
    } catch { /* non-fatal */ }

    const listEl = document.createElement('div');
    listEl.className = 'oq-depends-list';

    if (blockers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'oq-depends-empty';
      empty.textContent = 'No dependencies.';
      listEl.appendChild(empty);
    } else {
      for (const blocker of blockers) {
        const row = document.createElement('div');
        row.className = 'oq-depends-row';

        const titleEl = document.createElement('span');
        titleEl.className = 'oq-depends-title';
        titleEl.textContent = blocker.title;
        row.appendChild(titleEl);

        const resolved = !!(blocker.archived_at || blocker.resolved_by_decision_id);
        const statusEl = document.createElement('span');
        statusEl.className = resolved ? 'oq-depends-resolved' : 'oq-depends-unresolved';
        statusEl.textContent = resolved ? 'resolved' : 'unresolved';
        row.appendChild(statusEl);

        if (!archivedFlag) {
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'btn-secondary oq-depends-remove-btn';
          removeBtn.textContent = 'Remove';

          removeBtn.addEventListener('click', () => {
            // Replace row with inline confirm.
            const confirm = document.createElement('div');
            confirm.className = 'oq-depends-confirm';
            confirm.textContent = `Remove dependency on "${blocker.title}"?`;
            const yesBtn = document.createElement('button');
            yesBtn.type = 'button';
            yesBtn.className = 'btn-primary oq-depends-remove-btn';
            yesBtn.textContent = 'Remove';
            const noBtn = document.createElement('button');
            noBtn.type = 'button';
            noBtn.className = 'btn-secondary oq-depends-remove-btn';
            noBtn.textContent = 'Cancel';
            confirm.appendChild(yesBtn);
            confirm.appendChild(noBtn);
            row.replaceWith(confirm);

            yesBtn.addEventListener('click', async () => {
              try {
                await window.revival.openQuestions.removeDependency(item.id, blocker.id);
                if (onListReload) await onListReload();
                await render();
              } catch { await render(); }
            });
            noBtn.addEventListener('click', () => render());
          });

          row.appendChild(removeBtn);
        }

        listEl.appendChild(row);
      }
    }

    section.appendChild(listEl);

    // "Add dependency" picker — not shown for archived entries.
    if (!archivedFlag) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn-secondary oq-depends-add-btn';
      addBtn.style.marginTop = '6px';
      addBtn.textContent = '+ Add dependency';
      head.appendChild(addBtn);

      let pickerEl = null;

      addBtn.addEventListener('click', async () => {
        if (pickerEl) { pickerEl.remove(); pickerEl = null; return; }

        let allOqs = [];
        try { allOqs = await window.revival.openQuestions.list(); } catch { return; }

        const existingIds = new Set(blockers.map((b) => b.id));
        const candidates = allOqs.filter((q) => q.id !== item.id && !existingIds.has(q.id));

        pickerEl = document.createElement('div');
        pickerEl.className = 'oq-depends-picker';

        if (candidates.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'oq-depends-picker-empty';
          empty.textContent = 'No other open questions available.';
          pickerEl.appendChild(empty);
        } else {
          for (const candidate of candidates) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'oq-depends-picker-item';
            btn.textContent = candidate.title;
            btn.addEventListener('click', async () => {
              try {
                await window.revival.openQuestions.addDependency(item.id, candidate.id);
                if (onListReload) await onListReload();
                pickerEl.remove();
                pickerEl = null;
                await render();
              } catch { /* non-fatal */ }
            });
            pickerEl.appendChild(btn);
          }
        }

        section.appendChild(pickerEl);

        const closePickerOnOutside = (e) => {
          if (!section.contains(e.target)) {
            pickerEl && pickerEl.remove();
            pickerEl = null;
            document.removeEventListener('click', closePickerOnOutside);
          }
        };
        setTimeout(() => document.addEventListener('click', closePickerOnOutside), 0);
      });
    }
  }

  await render();
}
// ── End POQ-DEPENDS ─────────────────────────────────────────────────────────

// PEPISODE-STRUCT — Per-episode structure checklist (5 Flanagan items).
// Manually checkable by the user; AI-assist evaluates all items in one call.
// Per-item: user checkbox, AI verdict badge, user-override buttons (confirm/override).
const EP_STRUCT_ITEMS = [
  { key: 'cold_open', label: 'Cold open: in medias res' },
  { key: 'act_two',   label: 'Act Two: rewatch-layer scene identified' },
  { key: 'act_three', label: 'Act Three: consequence scene present' },
  { key: 'coda',      label: 'Coda: quiet devastation candidate identified' },
  { key: 'quiet_dev', label: 'Quiet devastation: satisfies structural signature' },
];

function mountEpisodeStructPanel(rightCol, item) {
  const section = document.createElement('details');
  section.className = 'ep-struct-section';

  const sum = document.createElement('summary');
  sum.className = 'ep-struct-summary';
  sum.textContent = 'Structure Checklist';
  section.appendChild(sum);

  const body = document.createElement('div');
  body.className = 'ep-struct-body';
  section.appendChild(body);

  let state = {};

  function verdictClass(v) {
    if (v === 'pass')      return 'ep-struct-verdict-pass';
    if (v === 'fail')      return 'ep-struct-verdict-fail';
    if (v === 'uncertain') return 'ep-struct-verdict-uncertain';
    return '';
  }
  function verdictLabel(v) {
    if (v === 'pass')      return 'AI: pass';
    if (v === 'fail')      return 'AI: fail';
    if (v === 'uncertain') return 'AI: uncertain';
    return '';
  }
  function overrideLabel(v) {
    if (v === 1) return 'Confirmed pass';
    if (v === 0) return 'Overridden to fail';
    return null;
  }

  function renderBody() {
    body.innerHTML = '';

    for (const it of EP_STRUCT_ITEMS) {
      const row = state[it.key] || { checked: 0, ai_verdict: null, ai_rationale: null, user_override: null };

      const itemEl = document.createElement('div');
      itemEl.className = 'ep-struct-item';

      // Checkbox + label
      const checkWrap = document.createElement('label');
      checkWrap.className = 'ep-struct-check-wrap';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ep-struct-cb';
      cb.checked = !!row.checked;
      cb.addEventListener('change', async () => {
        await window.revival.episodes.structSetChecked(item.id, it.key, cb.checked ? 1 : 0);
        state[it.key] = { ...row, checked: cb.checked ? 1 : 0 };
      });
      const labelSpan = document.createElement('span');
      labelSpan.className = 'ep-struct-label';
      labelSpan.textContent = it.label;
      checkWrap.append(cb, labelSpan);
      itemEl.appendChild(checkWrap);

      // AI verdict row (shown if ai_verdict is set)
      if (row.ai_verdict) {
        const aiRow = document.createElement('div');
        aiRow.className = 'ep-struct-ai-row';

        const badge = document.createElement('span');
        badge.className = `ep-struct-verdict-badge ${verdictClass(row.ai_verdict)}`;
        badge.textContent = verdictLabel(row.ai_verdict);
        aiRow.appendChild(badge);

        if (row.ai_rationale) {
          const rationale = document.createElement('span');
          rationale.className = 'ep-struct-rationale';
          rationale.textContent = row.ai_rationale;
          aiRow.appendChild(rationale);
        }

        // Override buttons (only if no override set yet)
        const override = row.user_override;
        const overrideLabel2 = overrideLabel(override);

        if (overrideLabel2) {
          const overrideBadge = document.createElement('span');
          overrideBadge.className = 'ep-struct-override-badge';
          overrideBadge.textContent = overrideLabel2;
          aiRow.appendChild(overrideBadge);

          const clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'btn-ghost ep-struct-clear-btn';
          clearBtn.textContent = 'Clear override';
          clearBtn.addEventListener('click', async () => {
            await window.revival.episodes.structSetOverride(item.id, it.key, null);
            state[it.key] = { ...state[it.key], user_override: null };
            renderBody();
          });
          aiRow.appendChild(clearBtn);
        } else {
          const confirmBtn = document.createElement('button');
          confirmBtn.type = 'button';
          confirmBtn.className = 'btn-ghost ep-struct-override-btn';
          confirmBtn.textContent = 'Confirm';
          confirmBtn.addEventListener('click', async () => {
            await window.revival.episodes.structSetOverride(item.id, it.key, 1);
            state[it.key] = { ...state[it.key], user_override: 1 };
            renderBody();
          });

          const overrideBtnEl = document.createElement('button');
          overrideBtnEl.type = 'button';
          overrideBtnEl.className = 'btn-ghost ep-struct-override-btn ep-struct-override-fail-btn';
          overrideBtnEl.textContent = 'Override';
          overrideBtnEl.addEventListener('click', async () => {
            await window.revival.episodes.structSetOverride(item.id, it.key, 0);
            state[it.key] = { ...state[it.key], user_override: 0 };
            renderBody();
          });

          aiRow.append(confirmBtn, overrideBtnEl);
        }

        itemEl.appendChild(aiRow);
      }

      body.appendChild(itemEl);
    }

    // AI-assist button bar
    const aiBar = document.createElement('div');
    aiBar.className = 'ep-struct-ai-bar';
    const evalBtn = document.createElement('button');
    evalBtn.type = 'button';
    evalBtn.className = 'btn-secondary ep-struct-eval-btn';
    evalBtn.textContent = 'Evaluate with AI';
    const aiStatus = document.createElement('span');
    aiStatus.className = 'ep-struct-ai-status';

    evalBtn.addEventListener('click', async () => {
      evalBtn.disabled = true;
      aiStatus.textContent = 'Evaluating…';
      try {
        const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
          ? chatModelSelect.value : 'claude-sonnet-4-6';
        const res = await window.revival.claude.episodeStructEval(item.id, model);
        if (res.skipped) {
          aiStatus.textContent = 'Add episode body text before evaluating.';
          evalBtn.disabled = false;
          return;
        }
        // Merge returned verdicts into local state
        for (const v of (res.items || [])) {
          if (state[v.key]) {
            state[v.key] = { ...state[v.key], ai_verdict: v.verdict, ai_rationale: v.rationale, user_override: null };
          } else {
            state[v.key] = { checked: 0, ai_verdict: v.verdict, ai_rationale: v.rationale, user_override: null };
          }
        }
        aiStatus.textContent = '';
        renderBody();
      } catch (err) {
        aiStatus.textContent = err.message || 'Evaluation failed.';
        evalBtn.disabled = false;
      }
    });

    aiBar.append(evalBtn, aiStatus);
    body.appendChild(aiBar);
  }

  // Load state then render
  window.revival.episodes.structGet(item.id).then((s) => {
    state = s || {};
    renderBody();
  }).catch(() => {
    state = {};
    renderBody();
  });

  rightCol.appendChild(section);
}

// PQUIET — Quiet devastation tracker panel on episode detail.
// Parses the series-wide ep_num (1–24) from the episode title (S1E1–S3E8).
// Seeded entries (eps 1, 4, 6, 8) are locked and read-only.
// Others can have a candidate added (freeform + optional Writing Lab link)
// and then locked.
function parseSeriesEpNum(title) {
  const m = (title || '').match(/\bS(\d+)E(\d+)/i);
  if (!m) return null;
  const s = parseInt(m[1], 10);
  const e = parseInt(m[2], 10);
  if (s >= 1 && s <= 3 && e >= 1 && e <= 8) return (s - 1) * 8 + e;
  return null;
}

function mountQuietDevastationPanel(rightCol, item) {
  const section = document.createElement('details');
  section.className = 'qd-section';

  const sum = document.createElement('summary');
  sum.className = 'qd-summary';
  sum.textContent = 'Quiet Devastation';
  section.appendChild(sum);

  const body = document.createElement('div');
  body.className = 'qd-body';
  section.appendChild(body);

  const epNum = parseSeriesEpNum(item.title);

  if (epNum === null) {
    const msg = document.createElement('p');
    msg.className = 'qd-no-epnum';
    msg.textContent = 'Add an episode code (e.g. S1E3) to your title to track quiet devastation for this episode.';
    body.appendChild(msg);
    rightCol.appendChild(section);
    return;
  }

  let qdRow = null;
  let allDrafts = [];

  function statusLabel(s) {
    if (s === 'no_candidate')         return 'No candidate';
    if (s === 'candidate_identified') return 'Candidate identified';
    if (s === 'locked')               return 'Locked';
    return s;
  }

  function statusClass(s) {
    if (s === 'candidate_identified') return 'qd-status-candidate';
    if (s === 'locked')               return 'qd-status-locked';
    return 'qd-status-none';
  }

  function renderBody() {
    body.innerHTML = '';
    if (!qdRow) {
      const err = document.createElement('p');
      err.className = 'qd-error';
      err.textContent = 'Could not load quiet devastation data.';
      body.appendChild(err);
      return;
    }

    // Status badge
    const statusRow = document.createElement('div');
    statusRow.className = 'qd-status-row';
    const badge = document.createElement('span');
    badge.className = `qd-status-badge ${statusClass(qdRow.status)}`;
    badge.textContent = statusLabel(qdRow.status);
    statusRow.appendChild(badge);
    if (qdRow.is_seeded) {
      const seedBadge = document.createElement('span');
      seedBadge.className = 'qd-seeded-badge';
      seedBadge.textContent = 'Flanagan (locked)';
      statusRow.appendChild(seedBadge);
    }
    body.appendChild(statusRow);

    // Seeded text (read-only for locked seeded entries)
    if (qdRow.is_seeded && qdRow.seeded_text) {
      const textEl = document.createElement('p');
      textEl.className = 'qd-seeded-text';
      textEl.textContent = qdRow.seeded_text;
      body.appendChild(textEl);
      return;
    }

    // User-locked (non-seeded)
    if (qdRow.status === 'locked') {
      if (qdRow.description) {
        const descEl = document.createElement('p');
        descEl.className = 'qd-locked-desc';
        descEl.textContent = qdRow.description;
        body.appendChild(descEl);
      }
      if (qdRow.writing_lab_title) {
        const wlEl = document.createElement('p');
        wlEl.className = 'qd-locked-wl';
        wlEl.textContent = `Writing Lab: ${qdRow.writing_lab_title}`;
        body.appendChild(wlEl);
      }
      return;
    }

    // Candidate identified — show editable form
    if (qdRow.status === 'candidate_identified') {
      renderCandidateForm(true);
      return;
    }

    // No candidate — show add form
    renderCandidateForm(false);
  }

  function renderCandidateForm(hasExisting) {
    const form = document.createElement('div');
    form.className = 'qd-form';

    const descLabel = document.createElement('label');
    descLabel.className = 'qd-field-label';
    descLabel.textContent = 'Scene note or description';
    const descArea = document.createElement('textarea');
    descArea.className = 'qd-desc-input';
    descArea.rows = 3;
    descArea.placeholder = 'Describe the quiet devastation moment…';
    if (hasExisting && qdRow.description) descArea.value = qdRow.description;
    form.append(descLabel, descArea);

    // Writing Lab picker
    const wlLabel = document.createElement('label');
    wlLabel.className = 'qd-field-label';
    wlLabel.textContent = 'Link Writing Lab draft (optional)';
    const wlSelect = document.createElement('select');
    wlSelect.className = 'qd-wl-select';
    const blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '— none —';
    wlSelect.appendChild(blankOpt);
    for (const d of allDrafts) {
      const opt = document.createElement('option');
      opt.value = String(d.id);
      opt.textContent = d.title || '(untitled)';
      if (hasExisting && qdRow.writing_lab_id === d.id) opt.selected = true;
      wlSelect.appendChild(opt);
    }
    form.append(wlLabel, wlSelect);

    const btnRow = document.createElement('div');
    btnRow.className = 'qd-btn-row';

    const saveLabel = hasExisting ? 'Update candidate' : 'Save candidate';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-secondary qd-save-btn';
    saveBtn.textContent = saveLabel;
    const saveStatus = document.createElement('span');
    saveStatus.className = 'qd-save-status';

    saveBtn.addEventListener('click', async () => {
      const desc = descArea.value.trim();
      const wlId = wlSelect.value ? parseInt(wlSelect.value, 10) : null;
      saveBtn.disabled = true;
      saveStatus.textContent = 'Saving…';
      try {
        await window.revival.quietDevastations.setCandidate(epNum, { description: desc, writingLabId: wlId });
        qdRow = await window.revival.quietDevastations.getByEpNum(epNum);
        saveStatus.textContent = '';
        renderBody();
      } catch (err) {
        saveStatus.textContent = err.message || 'Save failed.';
        saveBtn.disabled = false;
      }
    });

    btnRow.append(saveBtn, saveStatus);

    if (hasExisting) {
      const lockBtn = document.createElement('button');
      lockBtn.type = 'button';
      lockBtn.className = 'btn-secondary qd-lock-btn';
      lockBtn.textContent = 'Lock';
      lockBtn.title = 'Mark this quiet devastation final and read-only';
      lockBtn.addEventListener('click', async () => {
        if (!confirm('Lock this quiet devastation? It will become read-only.')) return;
        lockBtn.disabled = true;
        try {
          await window.revival.quietDevastations.lock(epNum);
          qdRow = await window.revival.quietDevastations.getByEpNum(epNum);
          renderBody();
        } catch (err) {
          lockBtn.disabled = false;
          const errEl = document.createElement('span');
          errEl.className = 'qd-save-status';
          errEl.textContent = err.message || 'Lock failed.';
          btnRow.appendChild(errEl);
        }
      });
      btnRow.appendChild(lockBtn);
    }

    form.appendChild(btnRow);
    body.appendChild(form);
  }

  async function load() {
    try {
      [qdRow, allDrafts] = await Promise.all([
        window.revival.quietDevastations.getByEpNum(epNum),
        window.revival.writingLab.list(),
      ]);
      if (qdRow) {
        window.revival.quietDevastations.linkEpisode(epNum, item.id).catch(() => {});
      }
    } catch {
      qdRow = null;
    }
    renderBody();
  }

  load();
  rightCol.appendChild(section);
}

// PLOCKED-SPECIFICS — data and panel factory.
// Eight non-negotiable locked items from THE_FLANAGAN_MASTER, surfaced as a
// collapsed reference panel on Characters, Episodes, Writing Lab, Canon Bible
// Edit Mode, and Canon Review proposals.
const LOCKED_SPECIFICS = [
  {
    key: 'physical_markers',
    label: 'Physical Markers — LOCKED (T-015)',
    category: 'production',
    characterRelevant: true,
    body:
      'TWO markers only. No third. No exceptions.\n' +
      'Primary: pupil response anomaly (Phase 1+). Pupils don\'t respond to light correctly — dilation too slow, too wide, or oscillating. Only visible through close contact. Retroactively visible from the pilot on rewatch.\n' +
      'Secondary: vascular discoloration (Phase 3 only). Faint discoloration along forearm veins at injection sites. Looks exactly like track marks.\n' +
      '"The eyes" is a performance/writers\'-room register of the two locked markers — not a third clinical marker.',
  },
  {
    key: 'mirror_motif',
    label: 'Mirror Motif — LOCKED (T-227)',
    category: 'production',
    characterRelevant: true,
    body:
      'Mirrors are NOT the site of revelation — they are the site where wrongness is invisible to the person who has become it.\n' +
      '— Infected look in the mirror and see what they expect. Placid recognition is the horror.\n' +
      '— Megan uses the mirror as a recovery practice of self-witness (Step 4 made visual).\n' +
      '— Caroline is the only character whose reflection matches the truth.\n' +
      'Non-negotiables: no diagnostic reveal, no score, no slow zooms, no flinching, no mirror in S1E1 as a marker plant.',
  },
  {
    key: 'virus_not_metaphor',
    label: 'Virus Is Not a Metaphor',
    category: 'thematic',
    characterRelevant: false,
    body:
      'STANDING RULE: The virus is NOT a metaphor for addiction. It is a structural rhyme without equivalence — engineered to make visible what addiction always was, what it always did, and what society chose not to see.\n' +
      'Write the rhyme; do not collapse it into "the virus is addiction." The distinction is load-bearing and is the reason the show can hold both registers without either consuming the other.',
  },
  {
    key: 'spirituality',
    label: 'Spirituality Principle',
    category: 'thematic',
    characterRelevant: false,
    body:
      'NA and AA are spiritual programs. The spirituality is treated with complete ambiguity and zero judgment — which means it is treated as real. The higher-power concept, the prayers, the step language, the closing rituals are not ironic, not coded as false comfort. They work.\n' +
      'A transitioned character\'s "you\'re in my thoughts and prayers" is completely true — what remains of them means it. Play it straight. No ironic distance.',
  },
  {
    key: 'found_family',
    label: 'Found Family Principle',
    category: 'thematic',
    characterRelevant: true,
    body:
      'The recovery community is Revival\'s found family — central dramatic and thematic architecture, not backdrop. The found family must be functional: people genuinely help each other.\n' +
      'The horror doesn\'t come from the community failing to work — it comes from the community working exactly as intended while the virus uses that functioning as its pathway.',
  },
  {
    key: 'jordan_no_arrest',
    label: "Jordan's No-Arrest Rule",
    category: 'character',
    characterRelevant: true,
    body:
      'Jordan Hale receives no arrest treatment under any circumstances.\n' +
      'His race lives in specificity and texture, never in commentary.\n' +
      'His surname is Hale (not Watkins — that is Renee\'s surname, reflecting single-mother status).',
  },
  {
    key: 'closing_line',
    label: 'Closing Line — LOCKED',
    category: 'narrative',
    characterRelevant: false,
    body:
      'The last spoken word of the series is "trying."\n' +
      'Locked closing line: "I tried. I\'m still trying." — lands on "trying" as ordered.',
  },
  {
    key: 'recovery_authenticity',
    label: 'Recovery Authenticity Mandate',
    category: 'craft',
    characterRelevant: false,
    body:
      'The writer\'s lived recovery experience is authoritative on recovery psychology, meeting culture, NA traditions, and addiction — a standing rule across all work.\n' +
      'NA and AA language is specific and earned: use it correctly or not at all. People in recovery are never types, cautionary tales, or vessels for addiction. They are people who have addiction. Write people. When uncertain about recovery authenticity — ask. Never approximate.',
  },
];

// Collapsed reference panel showing locked specifics from THE_FLANAGAN_MASTER.
// isCharactersEntry: true → show only character-relevant specifics by default
// (physical markers, mirror motif, found family, Jordan's no-arrest rule).
function mountLockedSpecificsPanel(container, { isCharactersEntry = false } = {}) {
  const CATEGORY_LABELS = {
    production: 'Production',
    thematic:   'Thematic',
    character:  'Character',
    narrative:  'Narrative',
    craft:      'Craft',
  };

  const section = document.createElement('details');
  section.className = 'locked-specs-section';

  const sum = document.createElement('summary');
  sum.className = 'locked-specs-summary';
  sum.textContent = 'Locked Specifics';
  section.appendChild(sum);

  const body = document.createElement('div');
  body.className = 'locked-specs-body';
  section.appendChild(body);

  let activeFilter = 'all';

  const filterBar = document.createElement('div');
  filterBar.className = 'locked-specs-filter-bar';

  const itemsEl = document.createElement('div');
  itemsEl.className = 'locked-specs-items';

  function renderItems() {
    itemsEl.innerHTML = '';
    const visible = LOCKED_SPECIFICS.filter(s => {
      if (isCharactersEntry && !s.characterRelevant) return false;
      if (activeFilter !== 'all' && s.category !== activeFilter) return false;
      return true;
    });
    if (visible.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'locked-specs-empty';
      empty.textContent = 'No locked specifics match this filter.';
      itemsEl.appendChild(empty);
      return;
    }
    for (const spec of visible) {
      const item = document.createElement('details');
      item.className = 'locked-specs-item';

      const itemSum = document.createElement('summary');
      itemSum.className = 'locked-specs-item-summary';

      const catBadge = document.createElement('span');
      catBadge.className = `locked-specs-cat-badge locked-specs-cat-${spec.category}`;
      catBadge.textContent = CATEGORY_LABELS[spec.category] || spec.category;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'locked-specs-item-title';
      titleSpan.textContent = spec.label;

      itemSum.append(catBadge, titleSpan);
      item.appendChild(itemSum);

      const content = document.createElement('div');
      content.className = 'locked-specs-item-body';
      content.textContent = spec.body;
      item.appendChild(content);

      itemsEl.appendChild(item);
    }
  }

  function renderFilter() {
    filterBar.innerHTML = '';
    const cats = isCharactersEntry
      ? [{ key: 'all', label: 'All' }, { key: 'production', label: 'Production' }, { key: 'thematic', label: 'Thematic' }, { key: 'character', label: 'Character' }]
      : [{ key: 'all', label: 'All' }, { key: 'production', label: 'Production' }, { key: 'thematic', label: 'Thematic' }, { key: 'character', label: 'Character' }, { key: 'narrative', label: 'Narrative' }, { key: 'craft', label: 'Craft' }];
    for (const cat of cats) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'locked-specs-filter-btn' + (activeFilter === cat.key ? ' active' : '');
      btn.textContent = cat.label;
      btn.addEventListener('click', () => {
        activeFilter = cat.key;
        renderFilter();
        renderItems();
      });
      filterBar.appendChild(btn);
    }
  }

  body.append(filterBar, itemsEl);
  renderFilter();
  renderItems();

  container.appendChild(section);
}

// PEPISODE-PREVON — collapsed "Previously on" panel on an episode detail.
// Shows all locked non-retired canon entries with locked_at before this
// episode's created_at. One-click generate; exportable as plain text.
function mountPreviouslyOnPanel(rightCol, item) {
  const section = document.createElement('details');
  section.className = 'ep-prevon-section';

  const sum = document.createElement('summary');
  sum.className = 'ep-prevon-summary';
  sum.textContent = 'Previously on';
  section.appendChild(sum);

  const body = document.createElement('div');
  body.className = 'ep-prevon-body';
  section.appendChild(body);

  let results = null;

  function renderBody() {
    body.innerHTML = '';

    if (!results) {
      const generateBtn = document.createElement('button');
      generateBtn.type = 'button';
      generateBtn.className = 'btn-secondary ep-prevon-generate-btn';
      generateBtn.textContent = 'Generate';
      generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Loading…';
        try {
          results = await window.revival.episodes.previouslyOn(item.id);
          renderBody();
        } catch (_err) {
          generateBtn.disabled = false;
          generateBtn.textContent = 'Generate';
          const errEl = document.createElement('p');
          errEl.className = 'ep-prevon-error';
          errEl.textContent = 'Could not load canon snapshot.';
          body.appendChild(errEl);
        }
      });
      body.appendChild(generateBtn);
      return;
    }

    const headerRow = document.createElement('div');
    headerRow.className = 'ep-prevon-header-row';

    const ctxSpan = document.createElement('span');
    ctxSpan.className = 'ep-prevon-context';
    ctxSpan.textContent = results.priorEpisode
      ? `Canon locked as of: ${results.priorEpisode.title}`
      : 'Canon locked before this episode was created';
    headerRow.appendChild(ctxSpan);

    const btnGroup = document.createElement('div');
    btnGroup.className = 'ep-prevon-btn-group';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'btn-secondary ep-prevon-action-btn';
    refreshBtn.textContent = 'Refresh';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      try {
        results = await window.revival.episodes.previouslyOn(item.id);
        renderBody();
      } catch (_err) {
        refreshBtn.disabled = false;
      }
    });

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'btn-secondary ep-prevon-action-btn';
    exportBtn.textContent = 'Export .txt';
    exportBtn.addEventListener('click', async () => {
      exportBtn.disabled = true;
      try { await window.revival.episodes.previouslyOnExport(item.id); }
      finally { exportBtn.disabled = false; }
    });

    btnGroup.append(refreshBtn, exportBtn);
    headerRow.appendChild(btnGroup);
    body.appendChild(headerRow);

    const { lockedEntries } = results;

    if (lockedEntries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ep-prevon-empty';
      empty.textContent = 'No locked canon entries as of the prior episode.';
      body.appendChild(empty);
      return;
    }

    const countLine = document.createElement('p');
    countLine.className = 'ep-prevon-count';
    countLine.textContent =
      `${lockedEntries.length} locked canon entr${lockedEntries.length === 1 ? 'y' : 'ies'}`;
    body.appendChild(countLine);

    const byType = {};
    for (const e of lockedEntries) {
      const t = e.entry_type || 'general';
      if (!byType[t]) byType[t] = [];
      byType[t].push(e);
    }
    for (const [type, entries] of Object.entries(byType)) {
      const group = document.createElement('div');
      group.className = 'ep-prevon-group';

      const typeLabel = document.createElement('div');
      typeLabel.className = 'ep-prevon-type-label';
      typeLabel.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      group.appendChild(typeLabel);

      for (const e of entries) {
        const card = document.createElement('div');
        card.className = 'ep-prevon-entry';

        const titleRow = document.createElement('div');
        titleRow.className = 'ep-prevon-entry-title';
        titleRow.textContent = e.title;
        if (e.locked_label) {
          const lbl = document.createElement('span');
          lbl.className = 'ep-prevon-locked-label';
          lbl.textContent = e.locked_label;
          titleRow.appendChild(lbl);
        }
        card.appendChild(titleRow);

        if (e.body) {
          const bodyEl = document.createElement('div');
          bodyEl.className = 'ep-prevon-entry-body';
          bodyEl.textContent = e.body;
          card.appendChild(bodyEl);
        }

        group.appendChild(card);
      }

      body.appendChild(group);
    }
  }

  renderBody();
  rightCol.appendChild(section);
}

// PEPISODE-CONT — AI episode continuity checker.
// On-demand: reads this episode + linked characters + prior episodes + locked
// canon; flags timeline contradictions, character state issues, arc breaks.
// Each flag is dismissable or routable to Conflicts / Open Questions.
// PEPISODE-CONT-2A — item can be a full episode object or {id, title} synthetic
// (used when mounting from Canon Review for a proposal sourced from an episode).
function mountEpisodeContinuityPanel(rightCol, item) {
  const section = document.createElement('details');
  section.className = 'ep-cont-section';

  const sum = document.createElement('summary');
  sum.className = 'ep-cont-summary';
  sum.textContent = 'Continuity Check';
  section.appendChild(sum);

  const panelBody = document.createElement('div');
  panelBody.className = 'ep-cont-body';
  section.appendChild(panelBody);

  // Picker row — persists across run/re-run cycles.
  const pickerRow = document.createElement('div');
  pickerRow.className = 'ep-cont-picker-row';
  const pickerLabel = document.createElement('label');
  pickerLabel.className = 'ep-cont-picker-label';
  pickerLabel.textContent = 'Compare against episode (optional):';
  const pickerSelect = document.createElement('select');
  pickerSelect.className = 'ep-cont-picker-select';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— none —';
  pickerSelect.appendChild(noneOpt);
  pickerRow.append(pickerLabel, pickerSelect);
  panelBody.appendChild(pickerRow);

  window.revival.episodes.list().then((eps) => {
    for (const ep of eps) {
      if (ep.id === item.id) continue;
      const opt = document.createElement('option');
      opt.value = ep.id;
      opt.textContent = ep.title || `Episode #${ep.id}`;
      pickerSelect.appendChild(opt);
    }
  }).catch(() => {});

  // Content area — only this zone is cleared between states.
  const contentArea = document.createElement('div');
  panelBody.appendChild(contentArea);

  function renderIdle() {
    contentArea.innerHTML = '';
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'btn-secondary ep-cont-run-btn';
    runBtn.textContent = 'Run continuity check';
    runBtn.addEventListener('click', () => runCheck());
    contentArea.appendChild(runBtn);
  }

  async function runCheck() {
    contentArea.innerHTML = '';
    const checking = document.createElement('p');
    checking.className = 'ep-cont-status';
    checking.textContent = 'Checking continuity…';
    contentArea.appendChild(checking);

    const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
      ? chatModelSelect.value : 'claude-sonnet-4-6';
    const rawVal = pickerSelect.value;
    const compareEpisodeId = rawVal ? parseInt(rawVal, 10) : null;

    try {
      const res = await window.revival.claude.episodeContinuityCheck(item.id, model, compareEpisodeId);
      contentArea.innerHTML = '';

      if (res.skipped) {
        const msg = document.createElement('p');
        msg.className = 'ep-cont-status';
        msg.textContent = 'Add episode body text before running the continuity check.';
        contentArea.appendChild(msg);
        appendRerunBtn();
        return;
      }

      const meta = document.createElement('p');
      meta.className = 'ep-cont-status';
      const parts = [];
      if (res.characterCount > 0)
        parts.push(`${res.characterCount} character${res.characterCount === 1 ? '' : 's'}`);
      if (res.priorEpisodesCount > 0)
        parts.push(`${res.priorEpisodesCount} prior episode${res.priorEpisodesCount === 1 ? '' : 's'}`);
      if (res.compareEpisodeTitle)
        parts.push(`comparison: ${res.compareEpisodeTitle}`);
      const canonPart = res.checkedCount
        - (res.characterCount || 0)
        - (res.priorEpisodesCount || 0)
        - (res.compareEpisodeTitle ? 1 : 0);
      if (canonPart > 0) parts.push(`${canonPart} canon entr${canonPart === 1 ? 'y' : 'ies'}`);
      meta.textContent = res.flags.length === 0
        ? `No issues found (checked: ${parts.join(', ') || 'nothing'}).`
        : `${res.flags.length} issue${res.flags.length === 1 ? '' : 's'} found (checked: ${parts.join(', ')}).`;
      contentArea.appendChild(meta);

      for (const f of res.flags) {
        const card = document.createElement('div');
        card.className = 'ep-cont-flag';

        const typeLabel = document.createElement('span');
        typeLabel.className = `ep-cont-flag-type ep-cont-type-${f.flagType}`;
        typeLabel.textContent = { timeline: 'Timeline', character_state: 'Character', arc_break: 'Arc' }[f.flagType] || f.flagType;

        const citation = document.createElement('div');
        citation.className = 'ep-cont-flag-citation';
        citation.appendChild(typeLabel);
        const sourceText = document.createTextNode(` — ${f.sourceTitle}`);
        citation.appendChild(sourceText);

        const reason = document.createElement('p');
        reason.className = 'ep-cont-flag-reason';
        reason.textContent = f.reason;

        card.append(citation, reason);

        if (f.location) {
          const loc = document.createElement('p');
          loc.className = 'ep-cont-flag-loc';
          loc.textContent = `In episode: "${f.location}"`;
          card.appendChild(loc);
        }

        const actions = document.createElement('div');
        actions.className = 'ep-cont-flag-actions';

        const routeConflictBtn = document.createElement('button');
        routeConflictBtn.type = 'button';
        routeConflictBtn.className = 'btn-secondary';
        routeConflictBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
        routeConflictBtn.textContent = 'Route to Conflicts';

        const routeOqBtn = document.createElement('button');
        routeOqBtn.type = 'button';
        routeOqBtn.className = 'btn-secondary';
        routeOqBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
        routeOqBtn.textContent = 'Route to Open Questions';

        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.className = 'btn-secondary';
        dismissBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
        dismissBtn.textContent = 'Dismiss';

        actions.append(routeConflictBtn, routeOqBtn, dismissBtn);
        card.appendChild(actions);

        const flagBody =
          `Source: ${f.sourceKind} — ${f.sourceTitle}` +
          (f.sourceId ? ` (#${f.sourceId})` : '') +
          `\n\n${f.reason}` +
          (f.location ? `\n\nIn episode: "${f.location}"` : '') +
          `\n\nEpisode: "${item.title || 'Untitled'}"`;

        routeConflictBtn.addEventListener('click', async () => {
          routeConflictBtn.disabled = true;
          routeOqBtn.disabled = true;
          dismissBtn.disabled = true;
          try {
            await window.revival.conflicts.create({
              title: `Continuity: ${f.sourceTitle}`,
              body: flagBody,
            });
            actions.innerHTML = '';
            const routed = document.createElement('span');
            routed.className = 'ep-cont-flag-routed';
            routed.textContent = 'Routed to Conflicts.';
            actions.appendChild(routed);
          } catch (err) {
            routeConflictBtn.disabled = false;
            routeOqBtn.disabled = false;
            dismissBtn.disabled = false;
            const cleanErr = (err.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
            const errEl = document.createElement('span');
            errEl.className = 'ep-cont-flag-error';
            errEl.textContent = cleanErr || 'Failed to create conflict.';
            actions.appendChild(errEl);
          }
        });

        routeOqBtn.addEventListener('click', async () => {
          routeConflictBtn.disabled = true;
          routeOqBtn.disabled = true;
          dismissBtn.disabled = true;
          try {
            await window.revival.openQuestions.create({
              title: `Continuity question: ${f.sourceTitle}`,
              body: flagBody,
            });
            actions.innerHTML = '';
            const routed = document.createElement('span');
            routed.className = 'ep-cont-flag-routed';
            routed.textContent = 'Routed to Open Questions.';
            actions.appendChild(routed);
          } catch (err) {
            routeConflictBtn.disabled = false;
            routeOqBtn.disabled = false;
            dismissBtn.disabled = false;
            const cleanErr = (err.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
            const errEl = document.createElement('span');
            errEl.className = 'ep-cont-flag-error';
            errEl.textContent = cleanErr || 'Failed to create open question.';
            actions.appendChild(errEl);
          }
        });

        dismissBtn.addEventListener('click', () => {
          card.remove();
          if (contentArea.querySelectorAll('.ep-cont-flag').length === 0) {
            const msg = document.createElement('p');
            msg.className = 'ep-cont-status';
            msg.textContent = 'All flags dismissed.';
            contentArea.appendChild(msg);
            appendRerunBtn();
          }
        });

        contentArea.appendChild(card);
      }

      appendRerunBtn();
    } catch (err) {
      contentArea.innerHTML = '';
      const errEl = document.createElement('p');
      errEl.className = 'ep-cont-status';
      const cleanErr = (err.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
      errEl.textContent = `Error: ${cleanErr || 'Continuity check failed.'}`;
      contentArea.appendChild(errEl);
      appendRerunBtn();
    }
  }

  function appendRerunBtn() {
    const rerun = document.createElement('button');
    rerun.type = 'button';
    rerun.className = 'btn-secondary ep-cont-run-btn';
    rerun.textContent = 'Run again';
    rerun.addEventListener('click', () => runCheck());
    contentArea.appendChild(rerun);
  }

  renderIdle();
  rightCol.appendChild(section);
}

// PEPISODE-CONT-2B — Writing Lab draft continuity check.
// Reads draft body + locked canon + optional comparison episode.
// Same flag UI as mountEpisodeContinuityPanel.
function mountWlabContinuityPanel(rightCol, item) {
  const section = document.createElement('details');
  section.className = 'ep-cont-section';

  const sum = document.createElement('summary');
  sum.className = 'ep-cont-summary';
  sum.textContent = 'Continuity Check';
  section.appendChild(sum);

  const panelBody = document.createElement('div');
  panelBody.className = 'ep-cont-body';
  section.appendChild(panelBody);

  // Episode picker — same pattern as mountEpisodeContinuityPanel.
  const pickerRow = document.createElement('div');
  pickerRow.className = 'ep-cont-picker-row';
  const pickerLabel = document.createElement('label');
  pickerLabel.className = 'ep-cont-picker-label';
  pickerLabel.textContent = 'Compare against episode (optional):';
  const pickerSelect = document.createElement('select');
  pickerSelect.className = 'ep-cont-picker-select';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— none —';
  pickerSelect.appendChild(noneOpt);
  pickerRow.append(pickerLabel, pickerSelect);
  panelBody.appendChild(pickerRow);

  window.revival.episodes.list().then((eps) => {
    for (const ep of eps) {
      const opt = document.createElement('option');
      opt.value = ep.id;
      opt.textContent = ep.title || `Episode #${ep.id}`;
      pickerSelect.appendChild(opt);
    }
  }).catch(() => {});

  const contentArea = document.createElement('div');
  panelBody.appendChild(contentArea);

  function renderIdle() {
    contentArea.innerHTML = '';
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'btn-secondary ep-cont-run-btn';
    runBtn.textContent = 'Run continuity check';
    runBtn.addEventListener('click', () => runCheck());
    contentArea.appendChild(runBtn);
  }

  async function runCheck() {
    contentArea.innerHTML = '';
    const checking = document.createElement('p');
    checking.className = 'ep-cont-status';
    checking.textContent = 'Checking continuity…';
    contentArea.appendChild(checking);

    const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
      ? chatModelSelect.value : 'claude-sonnet-4-6';
    const rawVal = pickerSelect.value;
    const compareEpisodeId = rawVal ? parseInt(rawVal, 10) : null;

    try {
      const res = await window.revival.claude.wlabContinuityCheck(item.id, model, compareEpisodeId);
      contentArea.innerHTML = '';

      if (res.skipped) {
        const msg = document.createElement('p');
        msg.className = 'ep-cont-status';
        msg.textContent = 'Add draft body text before running the continuity check.';
        contentArea.appendChild(msg);
        appendRerunBtn();
        return;
      }

      const meta = document.createElement('p');
      meta.className = 'ep-cont-status';
      const parts = [];
      if (res.compareEpisodeTitle) parts.push(`comparison: ${res.compareEpisodeTitle}`);
      const canonPart = res.checkedCount - (res.compareEpisodeTitle ? 1 : 0);
      if (canonPart > 0) parts.push(`${canonPart} canon entr${canonPart === 1 ? 'y' : 'ies'}`);
      meta.textContent = res.flags.length === 0
        ? `No issues found (checked: ${parts.join(', ') || 'nothing'}).`
        : `${res.flags.length} issue${res.flags.length === 1 ? '' : 's'} found (checked: ${parts.join(', ')}).`;
      contentArea.appendChild(meta);

      renderFlags(contentArea, res.flags, item.title || 'Untitled');
      appendRerunBtn();
    } catch (err) {
      contentArea.innerHTML = '';
      const errEl = document.createElement('p');
      errEl.className = 'ep-cont-status';
      const cleanErr = (err.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
      errEl.textContent = `Error: ${cleanErr || 'Continuity check failed.'}`;
      contentArea.appendChild(errEl);
      appendRerunBtn();
    }
  }

  function appendRerunBtn() {
    const rerun = document.createElement('button');
    rerun.type = 'button';
    rerun.className = 'btn-secondary ep-cont-run-btn';
    rerun.textContent = 'Run again';
    rerun.addEventListener('click', () => runCheck());
    contentArea.appendChild(rerun);
  }

  renderIdle();
  rightCol.appendChild(section);
}

// PEPISODE-CONT-2B — Characters continuity check.
// Reads character body + status + linked episodes + locked canon.
// No picker — linked episodes are discovered automatically.
function mountCharContinuityPanel(rightCol, item) {
  const section = document.createElement('details');
  section.className = 'ep-cont-section';

  const sum = document.createElement('summary');
  sum.className = 'ep-cont-summary';
  sum.textContent = 'Continuity Check';
  section.appendChild(sum);

  const panelBody = document.createElement('div');
  panelBody.className = 'ep-cont-body';
  section.appendChild(panelBody);

  const contentArea = document.createElement('div');
  panelBody.appendChild(contentArea);

  function renderIdle() {
    contentArea.innerHTML = '';
    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'btn-secondary ep-cont-run-btn';
    runBtn.textContent = 'Run continuity check';
    runBtn.addEventListener('click', () => runCheck());
    contentArea.appendChild(runBtn);
  }

  async function runCheck() {
    contentArea.innerHTML = '';
    const checking = document.createElement('p');
    checking.className = 'ep-cont-status';
    checking.textContent = 'Checking continuity…';
    contentArea.appendChild(checking);

    const model = (typeof chatModelSelect !== 'undefined' && chatModelSelect.value)
      ? chatModelSelect.value : 'claude-sonnet-4-6';

    try {
      const res = await window.revival.claude.charContinuityCheck(item.id, model);
      contentArea.innerHTML = '';

      if (res.skipped) {
        const msg = document.createElement('p');
        msg.className = 'ep-cont-status';
        msg.textContent = 'Add character body text before running the continuity check.';
        contentArea.appendChild(msg);
        appendRerunBtn();
        return;
      }

      const meta = document.createElement('p');
      meta.className = 'ep-cont-status';
      const parts = [];
      if (res.linkedEpisodesCount > 0)
        parts.push(`${res.linkedEpisodesCount} linked episode${res.linkedEpisodesCount === 1 ? '' : 's'}`);
      const canonPart = res.checkedCount - (res.linkedEpisodesCount || 0);
      if (canonPart > 0) parts.push(`${canonPart} canon entr${canonPart === 1 ? 'y' : 'ies'}`);
      meta.textContent = res.flags.length === 0
        ? `No issues found (checked: ${parts.join(', ') || 'nothing'}).`
        : `${res.flags.length} issue${res.flags.length === 1 ? '' : 's'} found (checked: ${parts.join(', ')}).`;
      contentArea.appendChild(meta);

      renderFlags(contentArea, res.flags, item.title || 'Untitled');
      appendRerunBtn();
    } catch (err) {
      contentArea.innerHTML = '';
      const errEl = document.createElement('p');
      errEl.className = 'ep-cont-status';
      const cleanErr = (err.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
      errEl.textContent = `Error: ${cleanErr || 'Continuity check failed.'}`;
      contentArea.appendChild(errEl);
      appendRerunBtn();
    }
  }

  function appendRerunBtn() {
    const rerun = document.createElement('button');
    rerun.type = 'button';
    rerun.className = 'btn-secondary ep-cont-run-btn';
    rerun.textContent = 'Run again';
    rerun.addEventListener('click', () => runCheck());
    contentArea.appendChild(rerun);
  }

  renderIdle();
  rightCol.appendChild(section);
}

// Shared flag-card renderer for all continuity check panels.
// Appends dismissable/routable flag cards to contentArea.
function renderFlags(contentArea, flags, entryTitle) {
  for (const f of flags) {
    const card = document.createElement('div');
    card.className = 'ep-cont-flag';

    const typeLabel = document.createElement('span');
    typeLabel.className = `ep-cont-flag-type ep-cont-type-${f.flagType}`;
    typeLabel.textContent = { timeline: 'Timeline', character_state: 'Character', arc_break: 'Arc' }[f.flagType] || f.flagType;

    const citation = document.createElement('div');
    citation.className = 'ep-cont-flag-citation';
    citation.appendChild(typeLabel);
    citation.appendChild(document.createTextNode(` — ${f.sourceTitle}`));

    const reason = document.createElement('p');
    reason.className = 'ep-cont-flag-reason';
    reason.textContent = f.reason;

    card.append(citation, reason);

    if (f.location) {
      const loc = document.createElement('p');
      loc.className = 'ep-cont-flag-loc';
      loc.textContent = `In entry: "${f.location}"`;
      card.appendChild(loc);
    }

    const actions = document.createElement('div');
    actions.className = 'ep-cont-flag-actions';

    const routeConflictBtn = document.createElement('button');
    routeConflictBtn.type = 'button';
    routeConflictBtn.className = 'btn-secondary';
    routeConflictBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
    routeConflictBtn.textContent = 'Route to Conflicts';

    const routeOqBtn = document.createElement('button');
    routeOqBtn.type = 'button';
    routeOqBtn.className = 'btn-secondary';
    routeOqBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
    routeOqBtn.textContent = 'Route to Open Questions';

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'btn-secondary';
    dismissBtn.style.cssText = 'font-size:11px;padding:2px 8px;';
    dismissBtn.textContent = 'Dismiss';

    actions.append(routeConflictBtn, routeOqBtn, dismissBtn);
    card.appendChild(actions);

    const flagBody =
      `Source: ${f.sourceKind} — ${f.sourceTitle}` +
      (f.sourceId ? ` (#${f.sourceId})` : '') +
      `\n\n${f.reason}` +
      (f.location ? `\n\nIn entry: "${f.location}"` : '') +
      `\n\nEntry: "${entryTitle}"`;

    routeConflictBtn.addEventListener('click', async () => {
      routeConflictBtn.disabled = true;
      routeOqBtn.disabled = true;
      dismissBtn.disabled = true;
      try {
        await window.revival.conflicts.create({
          title: `Continuity: ${f.sourceTitle}`,
          body: flagBody,
        });
        actions.innerHTML = '';
        const routed = document.createElement('span');
        routed.className = 'ep-cont-flag-routed';
        routed.textContent = 'Routed to Conflicts.';
        actions.appendChild(routed);
      } catch (err) {
        routeConflictBtn.disabled = false;
        routeOqBtn.disabled = false;
        dismissBtn.disabled = false;
        const cleanErr = (err.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
        const errEl = document.createElement('span');
        errEl.className = 'ep-cont-flag-error';
        errEl.textContent = cleanErr || 'Failed to create conflict.';
        actions.appendChild(errEl);
      }
    });

    routeOqBtn.addEventListener('click', async () => {
      routeConflictBtn.disabled = true;
      routeOqBtn.disabled = true;
      dismissBtn.disabled = true;
      try {
        await window.revival.openQuestions.create({
          title: `Continuity question: ${f.sourceTitle}`,
          body: flagBody,
        });
        actions.innerHTML = '';
        const routed = document.createElement('span');
        routed.className = 'ep-cont-flag-routed';
        routed.textContent = 'Routed to Open Questions.';
        actions.appendChild(routed);
      } catch (err) {
        routeConflictBtn.disabled = false;
        routeOqBtn.disabled = false;
        dismissBtn.disabled = false;
        const cleanErr = (err.message || '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
        const errEl = document.createElement('span');
        errEl.className = 'ep-cont-flag-error';
        errEl.textContent = cleanErr || 'Failed to create open question.';
        actions.appendChild(errEl);
      }
    });

    dismissBtn.addEventListener('click', () => {
      card.remove();
      if (contentArea.querySelectorAll('.ep-cont-flag').length === 0) {
        const msg = document.createElement('p');
        msg.className = 'ep-cont-status';
        msg.textContent = 'All flags dismissed.';
        contentArea.appendChild(msg);
      }
    });

    contentArea.appendChild(card);
  }
}

// PDRAFT-LOCK — shared draft-lock panel for Characters and Episodes detail views.
// apiName: 'characters' | 'episodes'
// reload: async fn that refreshes the detail panel after a lock/unlock.
function mountDraftLockPanel(container, item, reload, apiName) {
  const api = window.revival[apiName];
  const section = document.createElement('div');
  section.className = 'draft-lock-section';

  const label = document.createElement('span');
  label.className = 'draft-lock-label';
  label.textContent = 'Draft lock:';
  section.appendChild(label);

  if (item.draft_locked_at) {
    // --- Locked state ---
    const badge = document.createElement('span');
    badge.className = 'draft-lock-badge';
    badge.textContent = 'Locked';
    section.appendChild(badge);

    if (item.draft_lock_for) {
      const forSpan = document.createElement('span');
      forSpan.className = 'draft-lock-for';
      forSpan.textContent = `for ${item.draft_lock_for}`;
      section.appendChild(forSpan);
    }

    const unlockBtn = document.createElement('button');
    unlockBtn.type = 'button';
    unlockBtn.className = 'btn-secondary';
    unlockBtn.style.fontSize = '11px';
    unlockBtn.style.padding = '2px 10px';
    unlockBtn.textContent = 'Unlock';
    unlockBtn.addEventListener('click', () => {
      section.innerHTML = '';
      section.appendChild(label.cloneNode(true));

      const confirmDiv = document.createElement('div');
      confirmDiv.className = 'draft-lock-unlock-confirm';

      const promptText = document.createElement('span');
      promptText.style.color = 'var(--muted)';
      promptText.style.fontSize = '12px';
      promptText.textContent = 'Unlock this entry for editing?';
      confirmDiv.appendChild(promptText);

      const row = document.createElement('div');
      row.className = 'draft-lock-unlock-row';

      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.className = 'draft-lock-note-input';
      noteInput.placeholder = 'Unlock note (optional)';
      row.appendChild(noteInput);

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'btn-primary';
      confirmBtn.style.fontSize = '11px';
      confirmBtn.style.padding = '2px 10px';
      confirmBtn.textContent = 'Confirm unlock';
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        try {
          await api.draftUnlock(item.id, noteInput.value.trim() || null);
          await reload();
        } catch { confirmBtn.disabled = false; }
      });
      row.appendChild(confirmBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary';
      cancelBtn.style.fontSize = '11px';
      cancelBtn.style.padding = '2px 10px';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => reload());
      row.appendChild(cancelBtn);

      confirmDiv.appendChild(row);
      section.appendChild(confirmDiv);
    });
    section.appendChild(unlockBtn);
  } else {
    // --- Unlocked state ---
    const forInput = document.createElement('input');
    forInput.type = 'text';
    forInput.className = 'draft-lock-input';
    forInput.placeholder = 'Lock for... (e.g. S1 Draft 1)';
    section.appendChild(forInput);

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'btn-secondary';
    lockBtn.style.fontSize = '11px';
    lockBtn.style.padding = '2px 10px';
    lockBtn.textContent = 'Lock for draft';
    lockBtn.addEventListener('click', async () => {
      lockBtn.disabled = true;
      try {
        await api.draftLock(item.id, forInput.value.trim() || null);
        await reload();
      } catch { lockBtn.disabled = false; }
    });
    section.appendChild(lockBtn);
  }

  container.appendChild(section);
}

const CONTENT_RENDERERS = {
  'Home': renderHomePage,
  'Writing Lab': renderWritingLabPage,
  'Chat': renderChatPage,
  'Settings': renderSettingsPage,
  'Canon Bible': renderCanonBiblePage,
  'Canon Review': renderCanonReviewPage,
  'Import': renderImportPage,
  'Unsorted': makeEntryWorkspace({
    apiName: 'unsorted',
    entityKind: 'unsorted',
    draftPrefix: 'unsorted',
    addLabel: 'Add to Unsorted',
    emptyTitle: 'Capture first, route later',
    emptyHint: 'Drop anything here — excerpts, highlights, raw observations. Use "Route to…" to send each item to the right workspace.',
    // PAUDIT-5 — "Route to…" action. Unsorted is a routing queue; every entry
    // needs a one-click path to a destination workspace. Same destinations as
    // highlight-extract-route minus Unsorted itself.
    detailExtra(rightCol, item, archivedFlag) {
      if (archivedFlag) return;
      const UNSORTED_ROUTE_TARGETS = [
        { label: 'Brainstorm',      create: (t, b) => window.revival.brainstorm.create({ title: t, body: b }),      workspace: 'Brainstorm' },
        { label: 'Open Questions',  create: (t, b) => window.revival.openQuestions.create({ title: t, body: b }),    workspace: 'Open Questions' },
        { label: 'Decisions',       create: (t, b) => window.revival.decisions.create({ title: t, body: b }),        workspace: 'Decisions' },
        { label: 'Conflicts',       create: (t, b) => window.revival.conflicts.create({ title: t, body: b }),        workspace: 'Conflicts' },
        { label: 'Research',        create: (t, b) => window.revival.research.create({ title: t, body: b }),         workspace: 'Research' },
        { label: 'Canon Review',    create: (t, b) => window.revival.canonProposals.createFromExtract({
          title: t, body: b,
          source_kind: 'unsorted', source_entry_id: item.id,
          proposer_note: `Routed from Unsorted — "${item.title}"`,
        }), workspace: 'Canon Review' },
      ];

      const section = document.createElement('div');
      section.className = 'unsorted-route-section';

      const routeBtn = document.createElement('button');
      routeBtn.type = 'button';
      routeBtn.className = 'btn-secondary unsorted-route-btn';
      routeBtn.textContent = 'Route to…';
      section.appendChild(routeBtn);

      const picker = document.createElement('div');
      picker.className = 'unsorted-route-picker';
      picker.hidden = true;
      section.appendChild(picker);

      let routeStatus = null;

      routeBtn.addEventListener('click', () => {
        if (!picker.hidden) { picker.hidden = true; return; }
        picker.innerHTML = '';
        picker.hidden = false;
        for (const target of UNSORTED_ROUTE_TARGETS) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'unsorted-route-item';
          btn.textContent = target.label;
          btn.addEventListener('click', async () => {
            picker.hidden = true;
            btn.disabled = true;
            try {
              await target.create(item.title, item.body || '');
              if (!routeStatus) {
                routeStatus = document.createElement('span');
                routeStatus.className = 'unsorted-route-status';
                section.appendChild(routeStatus);
              }
              routeStatus.textContent = `Sent to ${target.label} ✓`;
              setTimeout(() => { if (routeStatus) routeStatus.textContent = ''; }, 3000);
            } catch (err) {
              if (!routeStatus) {
                routeStatus = document.createElement('span');
                routeStatus.className = 'unsorted-route-status unsorted-route-error';
                section.appendChild(routeStatus);
              }
              routeStatus.textContent = `Failed: ${err.message || err}`;
            }
          });
          picker.appendChild(btn);
        }
      });

      document.addEventListener('click', function closeOnOutside(e) {
        if (!section.contains(e.target)) {
          picker.hidden = true;
        }
      });

      const actionsRow = rightCol.querySelector('.tc-detail-actions');
      if (actionsRow && actionsRow.nextSibling) {
        rightCol.insertBefore(section, actionsRow.nextSibling);
      } else {
        rightCol.appendChild(section);
      }
    },
  }),
  'Source Material': makeEntryWorkspace({
    apiName: 'sourceMaterial',
    entityKind: 'source_material',
    draftPrefix: 'source_material',
    addLabel: 'Add Source',
    emptyTitle: 'Your reference library',
    emptyHint: 'Add scripts, pitch docs, reference episodes, or research papers so you can attach them in Chat.',
    allowFileUpload: true,
    // Keep the Chat drawer's active-sources chips in sync when sources change
    // (delete cascades the attachment; archive flags it). loadActiveSources is
    // a hoisted declaration, so referencing it here before its definition is
    // fine — it only runs when a source is mutated at runtime.
    onChange: () => loadActiveSources(),
    // PAUDIT-5 — surface file_kind and file_path (DB columns, never previously shown).
    detailExtra(rightCol, item, archivedFlag) {
      const FILE_KIND_OPTIONS = ['', 'text', 'pdf', 'image', 'other'];
      const FILE_KIND_LABELS = { '': 'None', text: 'Text', pdf: 'PDF', image: 'Image', other: 'Other' };

      const section = document.createElement('div');
      section.className = 'sm-file-meta-section';

      function renderFileMeta() {
        section.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'sm-file-meta-head';
        head.textContent = 'File info';
        section.appendChild(head);

        const kindRow = document.createElement('div');
        kindRow.className = 'sm-file-meta-row';
        const kindLabel = document.createElement('span');
        kindLabel.className = 'sm-file-meta-label';
        kindLabel.textContent = 'Kind:';
        kindRow.appendChild(kindLabel);

        if (archivedFlag) {
          const val = document.createElement('span');
          val.className = 'sm-file-meta-value';
          val.textContent = FILE_KIND_LABELS[item.file_kind || ''] || item.file_kind || '—';
          kindRow.appendChild(val);
        } else {
          const sel = document.createElement('select');
          sel.className = 'sm-file-meta-select';
          for (const k of FILE_KIND_OPTIONS) {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = FILE_KIND_LABELS[k];
            if ((item.file_kind || '') === k) opt.selected = true;
            sel.appendChild(opt);
          }
          sel.addEventListener('change', async () => {
            try {
              const updated = await window.revival.sourceMaterial.setFileMeta(item.id, { file_kind: sel.value || null, file_path: item.file_path });
              Object.assign(item, updated);
            } catch { /* non-fatal */ }
          });
          kindRow.appendChild(sel);
        }
        section.appendChild(kindRow);

        const pathRow = document.createElement('div');
        pathRow.className = 'sm-file-meta-row';
        const pathLabel = document.createElement('span');
        pathLabel.className = 'sm-file-meta-label';
        pathLabel.textContent = 'Path:';
        pathRow.appendChild(pathLabel);

        if (archivedFlag) {
          const val = document.createElement('span');
          val.className = 'sm-file-meta-value';
          val.textContent = item.file_path || '—';
          pathRow.appendChild(val);
        } else {
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.className = 'sm-file-meta-input';
          inp.placeholder = 'File path (optional)';
          inp.value = item.file_path || '';
          let pathTimer = null;
          inp.addEventListener('input', () => {
            clearTimeout(pathTimer);
            pathTimer = setTimeout(async () => {
              try {
                const updated = await window.revival.sourceMaterial.setFileMeta(item.id, { file_kind: item.file_kind, file_path: inp.value });
                Object.assign(item, updated);
              } catch { /* non-fatal */ }
            }, 600);
          });
          pathRow.appendChild(inp);
        }
        section.appendChild(pathRow);
      }

      renderFileMeta();
      rightCol.appendChild(section);

      // PRESEARCH-CITE — "Cited by Research" back-reference panel.
      const citeBackSection = document.createElement('div');
      citeBackSection.className = 'sm-cite-back-section';

      async function renderCiteBackPanel() {
        citeBackSection.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'sm-cite-back-head';
        head.textContent = 'Cited by Research';
        citeBackSection.appendChild(head);

        let entries;
        try {
          entries = await window.revival.sourceMaterial.listResearchCitations(item.id);
        } catch {
          const err = document.createElement('div');
          err.className = 'sm-cite-back-empty';
          err.textContent = 'Could not load citations.';
          citeBackSection.appendChild(err);
          return;
        }

        if (!entries || entries.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'sm-cite-back-empty';
          empty.textContent = 'No Research entries cite this source yet.';
          citeBackSection.appendChild(empty);
          return;
        }

        const list = document.createElement('ul');
        list.className = 'sm-cite-back-list';
        for (const entry of entries) {
          const li = document.createElement('li');
          li.className = 'sm-cite-back-item';
          const titleSpan = document.createElement('span');
          titleSpan.className = 'sm-cite-back-title';
          titleSpan.textContent = entry.title || '(untitled)';
          li.appendChild(titleSpan);
          if (entry.citation_text) {
            const noteSpan = document.createElement('span');
            noteSpan.className = 'sm-cite-back-note';
            noteSpan.textContent = entry.citation_text;
            li.appendChild(noteSpan);
          }
          list.appendChild(li);
        }
        citeBackSection.appendChild(list);
      }

      renderCiteBackPanel();
      rightCol.appendChild(citeBackSection);
    },
  }),
  'Documents': makeEntryWorkspace({
    apiName: 'documents',
    entityKind: 'documents',
    draftPrefix: 'documents',
    addLabel: 'Add Document',
    emptyTitle: 'Long-form documents',
    emptyHint: 'Store series bibles, spec sheets, and any long-form writing that lives outside the Writing Lab drafts.',
    detailExtra(rightCol, item, archivedFlag) {
      if (!archivedFlag) mountProposeCanonSection(rightCol, item, 'documents');
      const callbacks = {};
      if (!archivedFlag) mountFlanaganFilter(rightCol, item, callbacks, {
        entityKind: 'documents',
        workspaceName: 'Documents',
      });
      const { refresh } = mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, 'documents');
      callbacks.refreshHistory = refresh;
    },
  }),
  // PAUDIT-5 — Open Questions wrapped in IIFE so categoryFilter state is shared
  // across list filter and detail hooks without leaking into the outer scope.
  'Open Questions': (() => {
    let categoryFilter = '';
    const reloadRef = { fn: null };

    return makeEntryWorkspace({
      apiName: 'openQuestions',
      entityKind: 'open_questions',
      draftPrefix: 'open_questions',
      addLabel: 'Add Question',
      emptyTitle: 'Track what\'s unresolved',
      emptyHint: 'Log every question the writers haven\'t answered yet — they surface in Needs Attention until closed.',
      staleThresholdDays: () => getNeedsThresholds().tier1QuestionDays,

      matchesExtra(item) {
        if (!categoryFilter) return true;
        return (item.category || '').toLowerCase().includes(categoryFilter.toLowerCase());
      },

      createFormExtra(form) {
        // PAUDIT-6 — tier radio buttons on the create form (Tier 1 / Tier 2 only).
        const tierGroup = document.createElement('div');
        tierGroup.className = 'oq-tier-field';
        const tierLabel = document.createElement('span');
        tierLabel.className = 'oq-tier-field-label';
        tierLabel.textContent = 'Tier:';
        tierGroup.appendChild(tierLabel);
        const radios = [];
        [['1', 'Tier 1'], ['2', 'Tier 2'], ['3', 'Tier 3']].forEach(([val, text]) => {
          const lbl = document.createElement('label');
          lbl.className = 'oq-tier-radio-label';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'oq-tier-create';
          radio.value = val;
          radio.className = 'oq-tier-radio';
          lbl.append(radio, document.createTextNode(text));
          tierGroup.appendChild(lbl);
          radios.push(radio);
        });
        form.appendChild(tierGroup);
        return {
          postCreate: async (id) => {
            const checked = radios.find((r) => r.checked);
            if (checked) await window.revival.openQuestions.setTier(id, parseInt(checked.value, 10));
          },
        };
      },

      editFormExtra(item) {
        // PAUDIT-6 — tier radio buttons on the edit form, pre-seeded with current tier.
        // "Clear" button allows unsetting the tier without implying a third tier value.
        const tierGroup = document.createElement('div');
        tierGroup.className = 'oq-tier-field';
        const tierLabel = document.createElement('span');
        tierLabel.className = 'oq-tier-field-label';
        tierLabel.textContent = 'Tier:';
        tierGroup.appendChild(tierLabel);
        const radios = [];
        [['1', 'Tier 1'], ['2', 'Tier 2'], ['3', 'Tier 3']].forEach(([val, text]) => {
          const lbl = document.createElement('label');
          lbl.className = 'oq-tier-radio-label';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'oq-tier-edit';
          radio.value = val;
          radio.className = 'oq-tier-radio';
          if (item.tier && String(item.tier) === val) radio.checked = true;
          lbl.append(radio, document.createTextNode(text));
          tierGroup.appendChild(lbl);
          radios.push(radio);
        });
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn-secondary oq-tier-clear-btn';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => radios.forEach((r) => { r.checked = false; }));
        tierGroup.appendChild(clearBtn);
        return {
          element: tierGroup,
          postSave: async (id) => {
            const checked = radios.find((r) => r.checked);
            const newTier = checked ? parseInt(checked.value, 10) : null;
            if (newTier !== (item.tier || null)) {
              await window.revival.openQuestions.setTier(id, newTier);
            }
          },
        };
      },

      isFilterActive() {
        return categoryFilter !== '';
      },

      listItemExtra(btn, item, archivedFlag) {
        if (archivedFlag) return;
        const titleRow = btn.querySelector('.tc-list-title');
        if (!titleRow) return;
        // POQ-DEPENDS — soft block indicator when unresolved blockers exist.
        if (item.has_unresolved_blockers) {
          btn.classList.add('oq-blocked');
          const blockedBadge = document.createElement('span');
          blockedBadge.className = 'tc-list-badge badge-oq-blocked';
          blockedBadge.textContent = 'Blocked';
          blockedBadge.title = 'This question depends on one or more unresolved questions';
          titleRow.insertBefore(blockedBadge, titleRow.firstChild);
        }
        if (!item.category) return;
        const badge = document.createElement('span');
        badge.className = 'tc-list-badge badge-oq-category';
        badge.textContent = item.category;
        titleRow.insertBefore(badge, titleRow.lastChild);
      },

      leftColExtra(leftCol, rightCol, ctx) {
        reloadRef.fn = ctx.reloadList;
        const filterRow = document.createElement('div');
        filterRow.className = 'oq-category-filter-row';
        const filterLabel = document.createElement('label');
        filterLabel.className = 'oq-category-filter-label';
        filterLabel.textContent = 'Category:';
        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.className = 'oq-category-filter-input';
        filterInput.placeholder = 'Filter by category…';
        filterInput.value = categoryFilter;
        filterInput.addEventListener('input', () => {
          categoryFilter = filterInput.value;
          if (reloadRef.fn) reloadRef.fn();
        });
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'oq-category-filter-clear';
        clearBtn.textContent = '×';
        clearBtn.title = 'Clear category filter';
        clearBtn.addEventListener('click', () => {
          categoryFilter = '';
          filterInput.value = '';
          if (reloadRef.fn) reloadRef.fn();
        });
        filterLabel.append(filterInput, clearBtn);
        filterRow.appendChild(filterLabel);
        leftCol.insertBefore(filterRow, ctx.list);
      },

      detailExtra(rightCol, item, archivedFlag) {
        // PAUDIT-5 — category field (inline edit, saves via setCategory).
        const catSection = document.createElement('div');
        catSection.className = 'oq-category-section';
        function renderCategoryUI() {
          catSection.innerHTML = '';
          const row = document.createElement('div');
          row.className = 'oq-category-row';
          const label = document.createElement('span');
          label.className = 'oq-category-label';
          label.textContent = 'Category:';
          row.appendChild(label);
          const val = document.createElement('span');
          val.className = 'oq-category-value';
          val.textContent = item.category || '—';
          row.appendChild(val);
          if (!archivedFlag) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn-secondary oq-category-btn';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => {
              row.innerHTML = '';
              const inp = document.createElement('input');
              inp.type = 'text';
              inp.className = 'oq-category-input';
              inp.placeholder = 'Category (optional)';
              inp.value = item.category || '';
              const saveBtn = document.createElement('button');
              saveBtn.type = 'button';
              saveBtn.className = 'btn-primary oq-category-btn';
              saveBtn.textContent = 'Save';
              const cancelBtn = document.createElement('button');
              cancelBtn.type = 'button';
              cancelBtn.className = 'btn-secondary oq-category-btn';
              cancelBtn.textContent = 'Cancel';
              const commit = async () => {
                try {
                  const updated = await window.revival.openQuestions.setCategory(item.id, inp.value);
                  Object.assign(item, updated);
                  if (reloadRef.fn) await reloadRef.fn();
                  renderCategoryUI();
                } catch { renderCategoryUI(); }
              };
              saveBtn.addEventListener('click', commit);
              cancelBtn.addEventListener('click', renderCategoryUI);
              inp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
                if (ev.key === 'Escape') renderCategoryUI();
              });
              row.append(inp, saveBtn, cancelBtn);
            });
            row.appendChild(editBtn);
          }
          catSection.appendChild(row);
        }
        renderCategoryUI();
        // Insert before the pblock panel (which inserts after actions row).
        const actionsRow = rightCol.querySelector('.tc-detail-actions');
        if (actionsRow && actionsRow.nextSibling) {
          rightCol.insertBefore(catSection, actionsRow.nextSibling);
        } else {
          rightCol.appendChild(catSection);
        }

        // POQ-DEPENDS panel — dependency list and add-dependency picker.
        mountOqDependsPanel(rightCol, item, archivedFlag, reloadRef.fn);

        // PBLOCK panel — must be reachable without heavy scrolling.
        mountPBlockPanel(rightCol, item, archivedFlag);
        const callbacks = {};
        if (!archivedFlag) mountFlanaganFilter(rightCol, item, callbacks, {
          entityKind: 'open_questions',
          workspaceName: 'Open Questions',
          showOptions: true,
        });
        const { refresh } = mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, 'open_questions');
        callbacks.refreshHistory = refresh;
      },
    });
  })(),
  // Conflicts: PCONFLICT-SEV — severity filter/badge/selector wrapped in IIFE
  // so severityFilter state is shared across list filter and detail panel.
  'Conflicts': (() => {
    const CONFLICT_SEV_OPTIONS = [
      { value: 'minor',       label: 'Minor' },
      { value: 'significant', label: 'Significant' },
      { value: 'blocking',    label: 'Blocking' },
    ];
    const CONFLICT_SEV_LABEL = Object.fromEntries(
      CONFLICT_SEV_OPTIONS.map((o) => [o.value, o.label])
    );

    // null = show all; a severity string = filter to that severity.
    let severityFilter = null;
    const reloadRef = { fn: null };

    function mountConflictSevMeta(container, item, reload) {
      const section = document.createElement('div');
      section.className = 'conflict-sev-section';

      const label = document.createElement('span');
      label.className = 'conflict-sev-label';
      label.textContent = 'Severity:';
      section.appendChild(label);

      const btnGroup = document.createElement('div');
      btnGroup.className = 'conflict-sev-selector';

      const noneBtn = document.createElement('button');
      noneBtn.type = 'button';
      noneBtn.className = 'conflict-sev-btn';
      if (!item.severity) noneBtn.classList.add('active');
      noneBtn.textContent = 'Unset';
      noneBtn.addEventListener('click', async () => {
        if (!item.severity) return;
        try {
          await window.revival.conflicts.setSeverity(item.id, null);
          await reload();
        } catch { /* non-fatal */ }
      });
      btnGroup.appendChild(noneBtn);

      for (const opt of CONFLICT_SEV_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `conflict-sev-btn conflict-sev-btn-${opt.value}`;
        if (item.severity === opt.value) btn.classList.add('active');
        btn.textContent = opt.label;
        btn.addEventListener('click', async () => {
          if (item.severity === opt.value) return;
          try {
            await window.revival.conflicts.setSeverity(item.id, opt.value);
            await reload();
          } catch { /* non-fatal */ }
        });
        btnGroup.appendChild(btn);
      }

      section.appendChild(btnGroup);
      container.appendChild(section);
    }

    return makeEntryWorkspace({
      apiName: 'conflicts',
      entityKind: 'conflicts',
      draftPrefix: 'conflicts',
      addLabel: 'Log Conflict',
      emptyTitle: 'Flag continuity problems',
      emptyHint: 'Record anything that contradicts itself — plot holes, timeline breaks, character inconsistencies. Surface them before they compound.',
      sectionClass: 'ws-conflicts',
      titlePlaceholder: 'What contradicts what?',
      bodyPlaceholder: 'The two sides in tension, and where each comes from (optional)',
      staleThresholdDays: () => getNeedsThresholds().conflictDays,

      matchesExtra(item) {
        return severityFilter === null || item.severity === severityFilter;
      },

      isFilterActive() {
        return severityFilter !== null;
      },

      listItemExtra(btn, item, archivedFlag) {
        if (archivedFlag || !item.severity) return;
        const titleRow = btn.querySelector('.tc-list-title');
        if (!titleRow) return;
        const badge = document.createElement('span');
        badge.className = `tc-list-badge badge-conflict-sev-${item.severity}`;
        badge.textContent = CONFLICT_SEV_LABEL[item.severity] || item.severity;
        titleRow.insertBefore(badge, titleRow.lastChild);
      },

      showViewTop(rightCol, item, archivedFlag) {
        if (!archivedFlag) {
          mountConflictSevMeta(rightCol, item, async () => {
            if (reloadRef.fn) await reloadRef.fn();
          });
        }
      },

      detailExtra(rightCol, item, archivedFlag) {
        const callbacks = {};
        if (!archivedFlag) mountFlanaganFilter(rightCol, item, callbacks, {
          entityKind: 'conflicts',
          workspaceName: 'Conflicts',
          lightweight: true,
        });
        const { refresh } = mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, 'conflicts');
        callbacks.refreshHistory = refresh;
      },

      leftColExtra(leftCol, rightCol, ctx) {
        reloadRef.fn = ctx.reloadList;

        const filterBar = document.createElement('div');
        filterBar.className = 'conflict-sev-filter-bar';

        function renderFilterBar() {
          filterBar.innerHTML = '';
          const allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.className = 'conflict-sev-filter-btn' + (severityFilter === null ? ' active' : '');
          allBtn.textContent = 'All';
          allBtn.addEventListener('click', () => {
            severityFilter = null;
            renderFilterBar();
            ctx.reloadList();
          });
          filterBar.appendChild(allBtn);

          for (const opt of CONFLICT_SEV_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `conflict-sev-filter-btn conflict-sev-filter-btn-${opt.value}` + (severityFilter === opt.value ? ' active' : '');
            btn.textContent = opt.label;
            btn.addEventListener('click', () => {
              severityFilter = opt.value;
              renderFilterBar();
              ctx.reloadList();
            });
            filterBar.appendChild(btn);
          }
        }
        renderFilterBar();
        leftCol.insertBefore(filterBar, ctx.addBtn);
      },
    });
  })(),
  // Decisions (PDECISION-STATUS): lightweight filter + Open/Tentative/Final status badges.
  // Wrapped in an IIFE so statusFilter state is shared across list filter and detail
  // panel hooks without leaking into the outer scope (same pattern as Characters/Episodes).
  'Decisions': (() => {
    const DECISION_STATUS_OPTIONS = [
      { value: 'open',      label: 'Open' },
      { value: 'tentative', label: 'Tentative' },
      { value: 'final',     label: 'Final' },
    ];
    const DECISION_STATUS_LABEL = Object.fromEntries(
      DECISION_STATUS_OPTIONS.map((o) => [o.value, o.label])
    );

    // null = show all; a status string = filter to that status.
    let statusFilter = null;
    const reloadRef = { fn: null };

    function mountDecisionStatusMeta(container, item, reload) {
      const section = document.createElement('div');
      section.className = 'decision-status-section';

      const label = document.createElement('span');
      label.className = 'decision-status-label';
      label.textContent = 'Status:';
      section.appendChild(label);

      const btnGroup = document.createElement('div');
      btnGroup.className = 'decision-status-selector';

      const noneBtn = document.createElement('button');
      noneBtn.type = 'button';
      noneBtn.className = 'decision-status-btn';
      if (!item.decision_status) noneBtn.classList.add('active');
      noneBtn.textContent = 'None';
      noneBtn.addEventListener('click', async () => {
        if (!item.decision_status) return;
        try {
          await window.revival.decisions.setStatus(item.id, null);
          await reload();
        } catch { /* non-fatal */ }
      });
      btnGroup.appendChild(noneBtn);

      for (const opt of DECISION_STATUS_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `decision-status-btn decision-status-btn-${opt.value}`;
        if (item.decision_status === opt.value) btn.classList.add('active');
        btn.textContent = opt.label;
        btn.addEventListener('click', async () => {
          if (item.decision_status === opt.value) return;
          try {
            await window.revival.decisions.setStatus(item.id, opt.value);
            await reload();
          } catch { /* non-fatal */ }
        });
        btnGroup.appendChild(btn);
      }

      section.appendChild(btnGroup);
      container.appendChild(section);
    }

    return makeEntryWorkspace({
      apiName: 'decisions',
      entityKind: 'decisions',
      draftPrefix: 'decisions',
      addLabel: 'Record Decision',
      emptyTitle: 'What\'s settled',
      emptyHint: 'Record major creative choices so they\'re never re-litigated. Every decision here becomes a wall the room can point to.',
      titlePlaceholder: 'What was decided?',
      bodyPlaceholder: 'The decision, and why it was settled this way (optional)',

      matchesExtra(item) {
        return statusFilter === null || item.decision_status === statusFilter;
      },

      isFilterActive() {
        return statusFilter !== null;
      },

      listItemExtra(btn, item, archivedFlag) {
        if (archivedFlag || !item.decision_status) return;
        const titleRow = btn.querySelector('.tc-list-title');
        if (!titleRow) return;
        const badge = document.createElement('span');
        badge.className = `tc-list-badge badge-decision-${item.decision_status}`;
        badge.textContent = DECISION_STATUS_LABEL[item.decision_status] || item.decision_status;
        titleRow.insertBefore(badge, titleRow.lastChild);
      },

      showViewTop(rightCol, item, archivedFlag) {
        if (!archivedFlag) {
          mountDecisionStatusMeta(rightCol, item, async () => {
            if (reloadRef.fn) await reloadRef.fn();
          });
        }
      },

      detailExtra(rightCol, item, archivedFlag) {
        // PAUDIT-3 — back-link to the Open Question this Decision was promoted from.
        if (item.source_question_id) {
          const row = document.createElement('div');
          row.className = 'canon-chain';
          const label = document.createElement('span');
          label.className = 'canon-chain-label';
          label.textContent = 'From question: ';
          row.appendChild(label);
          const link = document.createElement('button');
          link.type = 'button';
          link.className = 'canon-chain-link';
          link.textContent = '…';
          link.title = 'Navigate to source question';
          link.addEventListener('click', () => {
            route('Open Questions', item.source_question_id);
          });
          row.appendChild(link);
          rightCol.appendChild(row);

          window.revival.openQuestions.get(item.source_question_id)
            .then((oq) => {
              link.textContent = oq ? oq.title : `#${item.source_question_id} (not found)`;
            })
            .catch(() => {
              link.textContent = `#${item.source_question_id}`;
            });
        }

        // PDECISION-PROMOTE — promote this decision to a Canon Review proposal.
        if (!archivedFlag) {
          const promoteWrap = document.createElement('div');
          promoteWrap.className = 'pblock-section';
          rightCol.appendChild(promoteWrap);
          renderDecisionPromoteUI(promoteWrap);

          function renderDecisionPromoteUI(wrap) {
            wrap.innerHTML = '';

            if (item.canon_proposal_id) {
              // Passive indicator: a proposal already exists.
              const row = document.createElement('div');
              row.className = 'pblock-row';
              const note = document.createElement('span');
              note.className = 'pblock-resolved-note';
              note.textContent = 'Canon Review proposal submitted';
              const goBtn = document.createElement('button');
              goBtn.type = 'button';
              goBtn.className = 'btn-secondary pblock-btn';
              goBtn.textContent = 'Open Canon Review →';
              goBtn.addEventListener('click', () => route('Canon Review'));
              row.append(note, goBtn);
              wrap.appendChild(row);
              return;
            }

            const row = document.createElement('div');
            row.className = 'pblock-row';
            const promoteBtn = document.createElement('button');
            promoteBtn.type = 'button';
            promoteBtn.className = 'btn-secondary pblock-btn';
            promoteBtn.textContent = 'Promote to Canon Review';
            promoteBtn.title = 'Create a linked Canon Review proposal pre-filled with this decision\'s content';
            row.appendChild(promoteBtn);
            wrap.appendChild(row);

            const form = document.createElement('div');
            form.className = 'pblock-promote-form';
            form.hidden = true;

            const formHint = document.createElement('div');
            formHint.className = 'pblock-form-hint';
            formHint.textContent = `Creates a Canon Review proposal for: "${item.title || 'this decision'}"`;

            const noteInput = document.createElement('textarea');
            noteInput.className = 'pblock-textarea';
            noteInput.placeholder = 'Proposer note (optional) — context for the Canon Review queue…';
            noteInput.rows = 3;

            const formBtnRow = document.createElement('div');
            formBtnRow.className = 'pblock-btn-row';
            const createBtn = document.createElement('button');
            createBtn.type = 'button';
            createBtn.className = 'btn-primary pblock-btn';
            createBtn.textContent = 'Submit Proposal';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn-secondary pblock-btn';
            cancelBtn.textContent = 'Cancel';
            formBtnRow.append(createBtn, cancelBtn);
            form.append(formHint, noteInput, formBtnRow);
            wrap.appendChild(form);

            promoteBtn.addEventListener('click', () => {
              form.hidden = false;
              promoteBtn.hidden = true;
              noteInput.focus();
            });
            cancelBtn.addEventListener('click', () => { form.hidden = true; promoteBtn.hidden = false; });
            createBtn.addEventListener('click', async () => {
              createBtn.disabled = true;
              try {
                await window.revival.decisions.promoteToCanonReview(
                  item.id, { proposer_note: noteInput.value.trim() }
                );
                Object.assign(item, { canon_proposal_id: true });
                renderDecisionPromoteUI(wrap);
                showUndoToast('Canon Review proposal submitted.');
              } catch (e) {
                formHint.textContent = e.message || 'Could not submit proposal.';
                createBtn.disabled = false;
              }
            });
          }
        }

        const callbacks = {};
        if (!archivedFlag) mountFlanaganFilter(rightCol, item, callbacks, {
          entityKind: 'decisions',
          workspaceName: 'Decisions',
          lightweight: true,
        });
        const { refresh } = mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, 'decisions');
        callbacks.refreshHistory = refresh;
      },

      leftColExtra(leftCol, rightCol, ctx) {
        reloadRef.fn = ctx.reloadList;

        const filterBar = document.createElement('div');
        filterBar.className = 'decision-status-filter-bar';

        function renderFilterBar() {
          filterBar.innerHTML = '';
          const allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.className = 'decision-filter-btn' + (statusFilter === null ? ' active' : '');
          allBtn.textContent = 'All';
          allBtn.addEventListener('click', () => {
            statusFilter = null;
            renderFilterBar();
            ctx.reloadList();
          });
          filterBar.appendChild(allBtn);

          for (const opt of DECISION_STATUS_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `decision-filter-btn decision-filter-btn-${opt.value}` + (statusFilter === opt.value ? ' active' : '');
            btn.textContent = opt.label;
            btn.addEventListener('click', () => {
              statusFilter = opt.value;
              renderFilterBar();
              ctx.reloadList();
            });
            filterBar.appendChild(btn);
          }
        }
        renderFilterBar();
        leftCol.insertBefore(filterBar, ctx.addBtn);
      },
    });
  })(),
  // Brainstorm: full five-mode filter + PBRAIN-STRUCT internal structure.
  // Wrapped in an IIFE so `threads` and `reloadRef` are shared across all hooks
  // without leaking into the outer workspace-config scope.
  'Brainstorm': (() => {
    let threads = [];
    let archivedThreads = [];
    // reloadRef.fn is set by leftColExtra (called at mount time, before any
    // renderList invocation) so customRenderActive can trigger a reload.
    const reloadRef = { fn: null };

    // Workspaces valid as "developed into" targets.
    const DEV_INTO_WS = [
      { kind: 'decisions',      label: 'Decisions',      apiKey: 'decisions' },
      { kind: 'research',       label: 'Research',       apiKey: 'research' },
      { kind: 'open_questions', label: 'Open Questions', apiKey: 'openQuestions' },
      { kind: 'writing_lab',    label: 'Writing Lab',    apiKey: 'writingLab' },
      { kind: 'documents',      label: 'Documents',      apiKey: 'documents' },
      { kind: 'unsorted',       label: 'Unsorted',       apiKey: 'unsorted' },
    ];
    const DEV_INTO_LABEL = Object.fromEntries(DEV_INTO_WS.map((w) => [w.kind, w.label]));
    const DEV_INTO_API   = Object.fromEntries(DEV_INTO_WS.map((w) => [w.kind, w.apiKey]));

    const STATUS_OPTIONS = [
      { value: null,          label: 'None' },
      { value: 'rough',       label: 'Rough' },
      { value: 'developing',  label: 'Developing' },
      { value: 'ready',       label: 'Ready to Route' },
    ];
    const STATUS_LABEL = Object.fromEntries(
      STATUS_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
    );

    function mountBrainstormMeta(rightCol, item, reload) {
      const section = document.createElement('div');
      section.className = 'bs-meta-section';

      // Status selector
      const statusRow = document.createElement('div');
      statusRow.className = 'bs-meta-row';
      const statusLabel = document.createElement('span');
      statusLabel.className = 'bs-meta-label';
      statusLabel.textContent = 'Status:';
      statusRow.appendChild(statusLabel);
      const statusBtnGroup = document.createElement('div');
      statusBtnGroup.className = 'bs-status-selector';
      for (const opt of STATUS_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bs-status-btn' + (opt.value ? ` bs-status-btn-${opt.value}` : '');
        if (item.bs_status === opt.value) btn.classList.add('active');
        btn.textContent = opt.label;
        btn.addEventListener('click', async () => {
          if (item.bs_status === opt.value) return;
          try {
            await window.revival.brainstorm.setStatus(item.id, opt.value);
            await reload();
          } catch { /* non-fatal */ }
        });
        statusBtnGroup.appendChild(btn);
      }
      statusRow.appendChild(statusBtnGroup);
      section.appendChild(statusRow);

      // Thread assignment
      const threadRow = document.createElement('div');
      threadRow.className = 'bs-meta-row';
      const threadLabel = document.createElement('span');
      threadLabel.className = 'bs-meta-label';
      threadLabel.textContent = 'Thread:';
      threadRow.appendChild(threadLabel);
      const threadSelect = document.createElement('select');
      threadSelect.className = 'bs-thread-select';
      const noneOpt = document.createElement('option');
      noneOpt.value = '';
      noneOpt.textContent = '(Ungrouped)';
      threadSelect.appendChild(noneOpt);
      for (const t of threads) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title;
        if (item.thread_id === t.id) opt.selected = true;
        threadSelect.appendChild(opt);
      }
      threadSelect.addEventListener('change', async () => {
        const val = threadSelect.value ? Number(threadSelect.value) : null;
        try {
          await window.revival.brainstorm.setThread(item.id, val);
          await reload();
        } catch { /* non-fatal */ }
      });
      threadRow.appendChild(threadSelect);
      section.appendChild(threadRow);

      // Developed into
      const devIntoRow = document.createElement('div');
      devIntoRow.className = 'bs-meta-row bs-devinto-row';
      const devIntoLabel = document.createElement('span');
      devIntoLabel.className = 'bs-meta-label';
      devIntoLabel.textContent = 'Developed into:';
      devIntoRow.appendChild(devIntoLabel);

      function renderDevIntoState(row) {
        // clear after the label
        while (row.children.length > 1) row.removeChild(row.lastChild);

        if (item.dev_into_kind && item.dev_into_id) {
          const linkSpan = document.createElement('span');
          linkSpan.className = 'bs-devinto-link';
          linkSpan.textContent = `${DEV_INTO_LABEL[item.dev_into_kind] || item.dev_into_kind}: …`;
          const apiKey = DEV_INTO_API[item.dev_into_kind];
          if (apiKey && window.revival[apiKey] && window.revival[apiKey].list) {
            window.revival[apiKey].list().then((items) => {
              const found = items.find((i) => i.id === item.dev_into_id);
              linkSpan.textContent = `${DEV_INTO_LABEL[item.dev_into_kind] || item.dev_into_kind}: ${found ? found.title : '(not found)'}`;
            }).catch(() => { linkSpan.textContent += ' (error)'; });
          }
          row.appendChild(linkSpan);

          const gotoBtn = document.createElement('button');
          gotoBtn.type = 'button';
          gotoBtn.className = 'bs-devinto-goto';
          gotoBtn.textContent = 'Go →';
          gotoBtn.title = 'Go to linked entry';
          gotoBtn.addEventListener('click', () => {
            const ws = DEV_INTO_LABEL[item.dev_into_kind];
            if (ws) route(ws, item.dev_into_id);
          });
          row.appendChild(gotoBtn);

          const clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'bs-devinto-clear';
          clearBtn.textContent = '✕ Clear';
          clearBtn.addEventListener('click', async () => {
            try {
              await window.revival.brainstorm.setDevInto(item.id, null, null);
              await reload();
            } catch { /* non-fatal */ }
          });
          row.appendChild(clearBtn);
        } else {
          const pickerBtn = document.createElement('button');
          pickerBtn.type = 'button';
          pickerBtn.className = 'bs-devinto-pick';
          pickerBtn.textContent = 'Link to entry…';
          pickerBtn.addEventListener('click', () => showDevIntoPicker(row, item, reload));
          row.appendChild(pickerBtn);
        }
      }

      renderDevIntoState(devIntoRow);
      section.appendChild(devIntoRow);
      rightCol.appendChild(section);
    }

    function showDevIntoPicker(row, item, reload) {
      // clear after the label
      while (row.children.length > 1) row.removeChild(row.lastChild);

      const wsSelect = document.createElement('select');
      wsSelect.className = 'bs-devinto-ws-select';
      const wsPlaceholder = document.createElement('option');
      wsPlaceholder.value = '';
      wsPlaceholder.textContent = 'Workspace…';
      wsSelect.appendChild(wsPlaceholder);
      for (const ws of DEV_INTO_WS) {
        const opt = document.createElement('option');
        opt.value = ws.kind;
        opt.textContent = ws.label;
        wsSelect.appendChild(opt);
      }
      row.appendChild(wsSelect);

      const entrySelect = document.createElement('select');
      entrySelect.className = 'bs-devinto-entry-select';
      entrySelect.disabled = true;
      const entryPlaceholder = document.createElement('option');
      entryPlaceholder.value = '';
      entryPlaceholder.textContent = 'Entry…';
      entrySelect.appendChild(entryPlaceholder);
      row.appendChild(entrySelect);

      const linkBtn = document.createElement('button');
      linkBtn.type = 'button';
      linkBtn.className = 'btn-primary btn-sm';
      linkBtn.textContent = 'Link';
      linkBtn.disabled = true;
      row.appendChild(linkBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-secondary btn-sm';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', async () => { await reload(); });
      row.appendChild(cancelBtn);

      wsSelect.addEventListener('change', async () => {
        const kind = wsSelect.value;
        entrySelect.innerHTML = '';
        entrySelect.disabled = true;
        linkBtn.disabled = true;
        if (!kind) return;
        const apiKey = DEV_INTO_API[kind];
        if (!apiKey || !window.revival[apiKey] || !window.revival[apiKey].list) return;
        try {
          const entries = await window.revival[apiKey].list();
          const ph = document.createElement('option');
          ph.value = '';
          ph.textContent = entries.length ? 'Entry…' : '(no entries)';
          entrySelect.appendChild(ph);
          for (const e of entries) {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.title;
            entrySelect.appendChild(opt);
          }
          entrySelect.disabled = false;
        } catch { /* non-fatal */ }
      });

      entrySelect.addEventListener('change', () => {
        linkBtn.disabled = !entrySelect.value;
      });

      linkBtn.addEventListener('click', async () => {
        const kind = wsSelect.value;
        const targetId = Number(entrySelect.value);
        if (!kind || !targetId) return;
        linkBtn.disabled = true;
        try {
          await window.revival.brainstorm.setDevInto(item.id, kind, targetId);
          await reload();
        } catch { linkBtn.disabled = false; }
      });
    }

    return makeEntryWorkspace({
      apiName: 'brainstorm',
      entityKind: 'brainstorm',
      draftPrefix: 'brainstorm',
      addLabel: 'Add Idea',
      emptyTitle: 'Rough ideas, no filter',
      emptyHint: 'Capture anything before it evaporates — threads, sparks, what-ifs. Route the keepers to the right workspace when they\'re ready.',
      titlePlaceholder: 'What is the idea?',
      bodyPlaceholder: 'Where it might go, what sparked it (optional)',

      loadListExtra: async () => {
        [threads, archivedThreads] = await Promise.all([
          window.revival.brainstorm.threads.list(),
          window.revival.brainstorm.threads.listArchived(),
        ]);
      },

      listItemExtra(btn, item, archivedFlag) {
        if (archivedFlag || !item.bs_status || !STATUS_LABEL[item.bs_status]) return;
        const titleRow = btn.querySelector('.tc-list-title');
        if (!titleRow) return;
        const badge = document.createElement('span');
        badge.className = `tc-list-badge badge-bs-${item.bs_status}`;
        badge.textContent = STATUS_LABEL[item.bs_status];
        // Insert before the title text node (same position as other badges).
        titleRow.insertBefore(badge, titleRow.lastChild);
      },

      customRenderActive(listEl, filteredActive, buildListItem) {
        if (threads.length === 0) {
          // No threads — flat list.
          for (const item of filteredActive) listEl.appendChild(buildListItem(item, false));
          return;
        }

        // Group by thread_id.
        const threadMap = new Map();
        const ungrouped = [];
        for (const item of filteredActive) {
          if (item.thread_id) {
            if (!threadMap.has(item.thread_id)) threadMap.set(item.thread_id, []);
            threadMap.get(item.thread_id).push(item);
          } else {
            ungrouped.push(item);
          }
        }

        for (const thread of threads) {
          const items = threadMap.get(thread.id) || [];
          const group = document.createElement('details');
          group.className = 'bs-thread-group';
          group.open = true;

          const summary = document.createElement('summary');
          summary.className = 'bs-thread-header';

          const titleSpan = document.createElement('span');
          titleSpan.className = 'bs-thread-title';
          titleSpan.textContent = thread.title;
          summary.appendChild(titleSpan);

          const actionsSpan = document.createElement('span');
          actionsSpan.className = 'bs-thread-actions';

          const renameBtn = document.createElement('button');
          renameBtn.type = 'button';
          renameBtn.className = 'bs-thread-action';
          renameBtn.textContent = 'Rename';
          renameBtn.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            // Replace the summary content with an inline input so window.prompt
            // (disabled in Electron 31) is never needed.
            const row = document.createElement('div');
            row.className = 'bs-thread-input-row';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = thread.title;
            const saveBtn = document.createElement('button');
            saveBtn.type = 'button';
            saveBtn.className = 'confirm';
            saveBtn.textContent = 'Save';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = 'Cancel';
            row.appendChild(inp);
            row.appendChild(saveBtn);
            row.appendChild(cancelBtn);
            summary.replaceWith(row);
            inp.focus();
            inp.select();
            const commit = async () => {
              const val = inp.value.trim();
              if (val) {
                try {
                  await window.revival.brainstorm.threads.update(thread.id, val);
                  if (reloadRef.fn) await reloadRef.fn();
                } catch { /* non-fatal */ }
              } else {
                if (reloadRef.fn) await reloadRef.fn();
              }
            };
            saveBtn.addEventListener('click', commit);
            cancelBtn.addEventListener('click', () => { if (reloadRef.fn) reloadRef.fn(); });
            inp.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
              if (ev.key === 'Escape') { if (reloadRef.fn) reloadRef.fn(); }
            });
          });

          const archiveBtn = document.createElement('button');
          archiveBtn.type = 'button';
          archiveBtn.className = 'bs-thread-action';
          archiveBtn.textContent = 'Archive';
          archiveBtn.title = 'Archive thread — entries become ungrouped';
          archiveBtn.addEventListener('click', async (e) => {
            e.preventDefault(); e.stopPropagation();
            try {
              await window.revival.brainstorm.threads.archive(thread.id);
              if (reloadRef.fn) await reloadRef.fn();
            } catch { /* non-fatal */ }
          });

          actionsSpan.append(renameBtn, archiveBtn);
          summary.appendChild(actionsSpan);
          group.appendChild(summary);

          if (items.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'bs-thread-empty';
            emptyMsg.textContent = 'No entries in this thread.';
            group.appendChild(emptyMsg);
          } else {
            for (const it of items) group.appendChild(buildListItem(it, false));
          }
          listEl.appendChild(group);
        }

        // Ungrouped section — only shown when there are threads defined.
        if (ungrouped.length > 0) {
          const ugGroup = document.createElement('details');
          ugGroup.className = 'bs-thread-group bs-thread-ungrouped';
          ugGroup.open = true;
          const ugSummary = document.createElement('summary');
          ugSummary.className = 'bs-thread-header';
          ugSummary.textContent = `Ungrouped (${ungrouped.length})`;
          ugGroup.appendChild(ugSummary);
          for (const it of ungrouped) ugGroup.appendChild(buildListItem(it, false));
          listEl.appendChild(ugGroup);
        }
      },

      showViewTop(rightCol, item, archivedFlag) {
        // Status / thread / developed-into — always visible at the top, before body.
        if (!archivedFlag) {
          mountBrainstormMeta(rightCol, item, async () => {
            if (reloadRef.fn) await reloadRef.fn();
          });
        }
      },

      detailExtra(rightCol, item, archivedFlag) {
        const callbacks = {};
        if (!archivedFlag) mountFlanaganFilter(rightCol, item, callbacks, {
          entityKind: 'brainstorm',
          workspaceName: 'Brainstorm',
        });
        const { refresh } = mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, 'brainstorm');
        callbacks.refreshHistory = refresh;
      },

      leftColExtra(leftCol, rightCol, ctx) {
        reloadRef.fn = ctx.reloadList;

        const newThreadBtn = document.createElement('button');
        newThreadBtn.type = 'button';
        newThreadBtn.className = 'bs-new-thread-btn';
        newThreadBtn.textContent = '+ New Thread';
        newThreadBtn.addEventListener('click', () => {
          // window.prompt is disabled in Electron 31 — use an inline input instead.
          const row = document.createElement('div');
          row.className = 'bs-thread-input-row';
          const inp = document.createElement('input');
          inp.type = 'text';
          inp.placeholder = 'Thread name';
          const saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.className = 'confirm';
          saveBtn.textContent = 'Create';
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.textContent = 'Cancel';
          row.appendChild(inp);
          row.appendChild(saveBtn);
          row.appendChild(cancelBtn);
          newThreadBtn.replaceWith(row);
          inp.focus();
          const restore = () => row.replaceWith(newThreadBtn);
          const commit = async () => {
            const val = inp.value.trim();
            restore();
            if (val) {
              try {
                await window.revival.brainstorm.threads.create(val);
              } catch { /* non-fatal */ }
            }
            await ctx.reloadList();
          };
          const cancel = () => { restore(); ctx.reloadList(); };
          saveBtn.addEventListener('click', commit);
          cancelBtn.addEventListener('click', cancel);
          inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
            if (ev.key === 'Escape') cancel();
          });
        });
        leftCol.insertBefore(newThreadBtn, ctx.list);

        // PAUDIT-5 — collapsed archived threads section below the main archived entries.
        const archThreadsSection = document.createElement('details');
        archThreadsSection.className = 'bs-archived-threads-section';
        const archThreadsSummary = document.createElement('summary');
        archThreadsSummary.className = 'bs-archived-threads-summary';
        archThreadsSection.appendChild(archThreadsSummary);
        const archThreadsList = document.createElement('div');
        archThreadsList.className = 'bs-archived-threads-list';
        archThreadsSection.appendChild(archThreadsList);
        leftCol.appendChild(archThreadsSection);

        function renderArchivedThreads() {
          archThreadsSummary.textContent = `Archived Threads (${archivedThreads.length})`;
          archThreadsSection.style.display = archivedThreads.length === 0 ? 'none' : '';
          archThreadsList.innerHTML = '';
          for (const thread of archivedThreads) {
            const row = document.createElement('div');
            row.className = 'bs-archived-thread-row';
            const title = document.createElement('span');
            title.className = 'bs-archived-thread-title';
            title.textContent = thread.title;
            const restoreBtn = document.createElement('button');
            restoreBtn.type = 'button';
            restoreBtn.className = 'btn-secondary bs-thread-action';
            restoreBtn.textContent = 'Restore';
            restoreBtn.addEventListener('click', async () => {
              restoreBtn.disabled = true;
              try {
                await window.revival.brainstorm.threads.restore(thread.id);
                if (reloadRef.fn) await reloadRef.fn();
              } catch { restoreBtn.disabled = false; }
            });
            row.append(title, restoreBtn);
            archThreadsList.appendChild(row);
          }
        }

        // Keep the section in sync after each list reload.
        const origReload = reloadRef.fn;
        const patchedReload = async () => {
          if (origReload) await origReload();
          renderArchivedThreads();
        };
        reloadRef.fn = patchedReload;
        renderArchivedThreads();
      },
    });
  })(),
  // Research shares the lifecycle but is styled distinctly (blue source accent +
  // tailored labels) so it never reads like Brainstorm's open ideation.
  // PAUDIT-6: wrapped in IIFE to hold reloadRef for external_url inline edit.
  // PRESEARCH-USED: also holds usedFilter state for linked/unused filter bar.
  // PRESEARCH-CITE: holds citeFilter state and citation section logic.
  'Research': (() => {
    const reloadRef = { fn: null };
    // null = show all; 'linked' = only used; 'unused' = only unused.
    let usedFilter = null;
    // null = show all; 'cited' = only cited; 'uncited' = only uncited.
    let citeFilter = null;

    return makeEntryWorkspace({
      apiName: 'research',
      entityKind: 'research',
      draftPrefix: 'research',
      addLabel: 'Add Research',
      emptyTitle: 'Evidence and findings',
      emptyHint: 'Log research notes and cite the source so you always know where each fact came from.',
      sectionClass: 'ws-research',
      titlePlaceholder: 'What was researched?',
      bodyPlaceholder: 'Findings, and where they came from — source/link (optional)',

      matchesExtra(item) {
        if (usedFilter !== null) {
          const isUsed = !!item.used;
          if (usedFilter === 'linked' && !isUsed) return false;
          if (usedFilter === 'unused' && isUsed) return false;
        }
        if (citeFilter !== null) {
          const isCited = !!(item.citation_text || item.citation_source_id);
          if (citeFilter === 'cited' && !isCited) return false;
          if (citeFilter === 'uncited' && isCited) return false;
        }
        return true;
      },

      isFilterActive() {
        return usedFilter !== null || citeFilter !== null;
      },

      leftColExtra(leftCol, rightCol, ctx) {
        reloadRef.fn = ctx.reloadList;

        const filterBar = document.createElement('div');
        filterBar.className = 'research-used-filter-bar';

        function renderFilterBar() {
          filterBar.innerHTML = '';

          // Row 1: usage filter (All / Linked / Unused)
          const usageRow = document.createElement('div');
          usageRow.className = 'research-filter-row';

          const allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.className = 'research-used-filter-btn' + (usedFilter === null ? ' active' : '');
          allBtn.textContent = 'All';
          allBtn.addEventListener('click', () => { usedFilter = null; renderFilterBar(); ctx.reloadList(); });
          usageRow.appendChild(allBtn);

          const linkedBtn = document.createElement('button');
          linkedBtn.type = 'button';
          linkedBtn.className = 'research-used-filter-btn research-used-filter-btn-linked' + (usedFilter === 'linked' ? ' active' : '');
          linkedBtn.textContent = 'Linked';
          linkedBtn.addEventListener('click', () => { usedFilter = 'linked'; renderFilterBar(); ctx.reloadList(); });
          usageRow.appendChild(linkedBtn);

          const unusedBtn = document.createElement('button');
          unusedBtn.type = 'button';
          unusedBtn.className = 'research-used-filter-btn research-used-filter-btn-unused' + (usedFilter === 'unused' ? ' active' : '');
          unusedBtn.textContent = 'Unused';
          unusedBtn.addEventListener('click', () => { usedFilter = 'unused'; renderFilterBar(); ctx.reloadList(); });
          usageRow.appendChild(unusedBtn);

          filterBar.appendChild(usageRow);

          // Row 2: citation filter (All / Cited / Uncited)
          const citeRow = document.createElement('div');
          citeRow.className = 'research-filter-row';

          const citeAllBtn = document.createElement('button');
          citeAllBtn.type = 'button';
          citeAllBtn.className = 'research-used-filter-btn' + (citeFilter === null ? ' active' : '');
          citeAllBtn.textContent = 'All';
          citeAllBtn.addEventListener('click', () => { citeFilter = null; renderFilterBar(); ctx.reloadList(); });
          citeRow.appendChild(citeAllBtn);

          const citedBtn = document.createElement('button');
          citedBtn.type = 'button';
          citedBtn.className = 'research-used-filter-btn research-cite-filter-btn-cited' + (citeFilter === 'cited' ? ' active' : '');
          citedBtn.textContent = 'Cited';
          citedBtn.addEventListener('click', () => { citeFilter = 'cited'; renderFilterBar(); ctx.reloadList(); });
          citeRow.appendChild(citedBtn);

          const uncitedBtn = document.createElement('button');
          uncitedBtn.type = 'button';
          uncitedBtn.className = 'research-used-filter-btn research-cite-filter-btn-uncited' + (citeFilter === 'uncited' ? ' active' : '');
          uncitedBtn.textContent = 'Uncited';
          uncitedBtn.addEventListener('click', () => { citeFilter = 'uncited'; renderFilterBar(); ctx.reloadList(); });
          citeRow.appendChild(uncitedBtn);

          filterBar.appendChild(citeRow);
        }

        renderFilterBar();
        leftCol.insertBefore(filterBar, ctx.addBtn);
      },

      listItemExtra(btn, item) {
        // PRESEARCH-USED: linked/unused badge on title row.
        const titleRow = btn.querySelector('.tc-list-title');
        if (titleRow) {
          const badge = document.createElement('span');
          badge.className = item.used
            ? 'tc-list-badge badge-research-linked'
            : 'tc-list-badge badge-research-unused';
          badge.textContent = item.used ? 'Linked' : 'Unused';
          titleRow.insertBefore(badge, titleRow.lastChild);
        }
        // PAUDIT-6: external URL preview line.
        if (item.external_url) {
          const urlLine = document.createElement('div');
          urlLine.className = 'tc-list-preview research-url-preview';
          const display = item.external_url.length > 60
            ? `${item.external_url.slice(0, 60)}…`
            : item.external_url;
          urlLine.textContent = display;
          btn.appendChild(urlLine);
        }
        // PRESEARCH-CITE: citation preview line.
        const citeLabel = item.citation_source_title
          ? item.citation_source_title
          : item.citation_text || null;
        if (citeLabel) {
          const citeLine = document.createElement('div');
          citeLine.className = 'tc-list-preview research-cite-preview';
          const display = citeLabel.length > 60 ? `${citeLabel.slice(0, 60)}…` : citeLabel;
          citeLine.textContent = `Source: ${display}`;
          btn.appendChild(citeLine);
        }
      },

      detailExtra(rightCol, item, archivedFlag) {
        // PAUDIT-6 — external_url field (inline edit, saves via setExternalUrl).
        const urlSection = document.createElement('div');
        urlSection.className = 'research-url-section';
        function renderUrlUI() {
          urlSection.innerHTML = '';
          const row = document.createElement('div');
          row.className = 'research-url-row';
          const label = document.createElement('span');
          label.className = 'research-url-label';
          label.textContent = 'External URL:';
          row.appendChild(label);
          if (item.external_url) {
            const link = document.createElement('a');
            link.href = item.external_url;
            link.className = 'research-url-link';
            link.textContent = item.external_url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            row.appendChild(link);
          } else {
            const val = document.createElement('span');
            val.className = 'research-url-value';
            val.textContent = '—';
            row.appendChild(val);
          }
          if (!archivedFlag) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn-secondary research-url-btn';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => {
              row.innerHTML = '';
              const inp = document.createElement('input');
              inp.type = 'url';
              inp.className = 'research-url-input';
              inp.placeholder = 'https://… (optional)';
              inp.value = item.external_url || '';
              const saveBtn = document.createElement('button');
              saveBtn.type = 'button';
              saveBtn.className = 'btn-primary research-url-btn';
              saveBtn.textContent = 'Save';
              const cancelBtn = document.createElement('button');
              cancelBtn.type = 'button';
              cancelBtn.className = 'btn-secondary research-url-btn';
              cancelBtn.textContent = 'Cancel';
              const commit = async () => {
                try {
                  const updated = await window.revival.research.setExternalUrl(item.id, inp.value);
                  Object.assign(item, updated);
                  if (reloadRef.fn) await reloadRef.fn();
                  renderUrlUI();
                } catch { renderUrlUI(); }
              };
              saveBtn.addEventListener('click', commit);
              cancelBtn.addEventListener('click', renderUrlUI);
              inp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
                if (ev.key === 'Escape') renderUrlUI();
              });
              row.append(inp, saveBtn, cancelBtn);
            });
            row.appendChild(editBtn);
          }
          urlSection.appendChild(row);
        }
        renderUrlUI();
        const actionsRow = rightCol.querySelector('.tc-detail-actions');
        if (actionsRow && actionsRow.nextSibling) {
          rightCol.insertBefore(urlSection, actionsRow.nextSibling);
        } else {
          rightCol.appendChild(urlSection);
        }

        // PRESEARCH-CITE — citation section (freeform text + source material picker).
        const citeSection = document.createElement('div');
        citeSection.className = 'research-cite-section';

        function renderCiteUI() {
          citeSection.innerHTML = '';
          const head = document.createElement('div');
          head.className = 'research-cite-head';
          head.textContent = 'Citation';
          citeSection.appendChild(head);

          // Linked source material row.
          const srcRow = document.createElement('div');
          srcRow.className = 'research-cite-row';
          const srcLabel = document.createElement('span');
          srcLabel.className = 'research-cite-label';
          srcLabel.textContent = 'Source:';
          srcRow.appendChild(srcLabel);

          if (item.citation_source_id && item.citation_source_title) {
            const srcLink = document.createElement('span');
            srcLink.className = 'research-cite-source-linked';
            srcLink.textContent = item.citation_source_title;
            srcRow.appendChild(srcLink);
            if (!archivedFlag) {
              const clearBtn = document.createElement('button');
              clearBtn.type = 'button';
              clearBtn.className = 'btn-secondary research-url-btn';
              clearBtn.textContent = 'Clear';
              clearBtn.addEventListener('click', async () => {
                try {
                  const updated = await window.revival.research.setCitation(item.id, {
                    citation_text: item.citation_text,
                    citation_source_id: null,
                  });
                  Object.assign(item, updated);
                  if (reloadRef.fn) await reloadRef.fn();
                  renderCiteUI();
                } catch { /* non-fatal */ }
              });
              srcRow.appendChild(clearBtn);
            }
          } else {
            const srcVal = document.createElement('span');
            srcVal.className = 'research-cite-source-empty';
            srcVal.textContent = '—';
            srcRow.appendChild(srcVal);
            if (!archivedFlag) {
              const pickBtn = document.createElement('button');
              pickBtn.type = 'button';
              pickBtn.className = 'btn-secondary research-url-btn';
              pickBtn.textContent = 'Link source…';
              pickBtn.addEventListener('click', async () => {
                // Inline source picker: load all active source material entries.
                srcRow.innerHTML = '';
                srcRow.appendChild(srcLabel);
                let allSources;
                try {
                  allSources = await window.revival.sourceMaterial.list();
                } catch { renderCiteUI(); return; }

                if (!allSources || allSources.length === 0) {
                  const none = document.createElement('span');
                  none.className = 'research-cite-source-empty';
                  none.textContent = 'No Source Material entries yet.';
                  const cancelBtn2 = document.createElement('button');
                  cancelBtn2.type = 'button';
                  cancelBtn2.className = 'btn-secondary research-url-btn';
                  cancelBtn2.textContent = 'Cancel';
                  cancelBtn2.addEventListener('click', renderCiteUI);
                  srcRow.append(none, cancelBtn2);
                  return;
                }

                const sel = document.createElement('select');
                sel.className = 'research-cite-source-select';
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = 'Select a Source Material entry…';
                sel.appendChild(placeholder);
                for (const s of allSources) {
                  const opt = document.createElement('option');
                  opt.value = s.id;
                  opt.textContent = s.title || '(untitled)';
                  sel.appendChild(opt);
                }

                const confirmBtn = document.createElement('button');
                confirmBtn.type = 'button';
                confirmBtn.className = 'btn-primary research-url-btn';
                confirmBtn.textContent = 'Link';
                confirmBtn.addEventListener('click', async () => {
                  if (!sel.value) return;
                  try {
                    const updated = await window.revival.research.setCitation(item.id, {
                      citation_text: item.citation_text,
                      citation_source_id: Number(sel.value),
                    });
                    Object.assign(item, updated);
                    if (reloadRef.fn) await reloadRef.fn();
                    renderCiteUI();
                  } catch { renderCiteUI(); }
                });

                const cancelBtn3 = document.createElement('button');
                cancelBtn3.type = 'button';
                cancelBtn3.className = 'btn-secondary research-url-btn';
                cancelBtn3.textContent = 'Cancel';
                cancelBtn3.addEventListener('click', renderCiteUI);

                srcRow.append(sel, confirmBtn, cancelBtn3);
              });
              srcRow.appendChild(pickBtn);
            }
          }
          citeSection.appendChild(srcRow);

          // Freeform citation text row.
          const textRow = document.createElement('div');
          textRow.className = 'research-cite-row';
          const textLabel = document.createElement('span');
          textLabel.className = 'research-cite-label';
          textLabel.textContent = 'Note:';
          textRow.appendChild(textLabel);

          if (archivedFlag) {
            const val = document.createElement('span');
            val.className = 'research-cite-text-value';
            val.textContent = item.citation_text || '—';
            textRow.appendChild(val);
          } else {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'research-cite-text-input';
            inp.placeholder = 'Author, publication, date, etc. (optional)';
            inp.value = item.citation_text || '';
            let saveTimer = null;
            inp.addEventListener('input', () => {
              clearTimeout(saveTimer);
              saveTimer = setTimeout(async () => {
                try {
                  const updated = await window.revival.research.setCitation(item.id, {
                    citation_text: inp.value,
                    citation_source_id: item.citation_source_id,
                  });
                  Object.assign(item, updated);
                  if (reloadRef.fn) await reloadRef.fn();
                } catch { /* non-fatal */ }
              }, 600);
            });
            textRow.appendChild(inp);
          }
          citeSection.appendChild(textRow);
        }

        renderCiteUI();
        urlSection.after(citeSection);
      },
    });
  })(),

  // Characters (P26+P37+PCHAR-STATUS): CRUD lifecycle + relational view + status field.
  // Wrapped in an IIFE so statusFilter state is shared across list filter and detail
  // panel hooks without leaking into the outer scope (same pattern as Brainstorm).
  'Characters': (() => {
    const CHAR_STATUS_OPTIONS = [
      { value: 'active',    label: 'Active' },
      { value: 'recurring', label: 'Recurring' },
      { value: 'departed',  label: 'Departed' },
      { value: 'deceased',  label: 'Deceased' },
    ];
    const CHAR_STATUS_LABEL = Object.fromEntries(
      CHAR_STATUS_OPTIONS.map((o) => [o.value, o.label])
    );

    // PCHAR-STATUS: null = show all; a status string = filter to that status.
    let statusFilter = null;
    // Ref so showViewTop can trigger a full list+detail reload after a status change.
    const reloadRef = { fn: null };

    function mountCharStatusMeta(container, item, reload) {
      const section = document.createElement('div');
      section.className = 'char-status-section';

      const label = document.createElement('span');
      label.className = 'char-status-label';
      label.textContent = 'Status:';
      section.appendChild(label);

      const btnGroup = document.createElement('div');
      btnGroup.className = 'char-status-selector';

      const noneBtn = document.createElement('button');
      noneBtn.type = 'button';
      noneBtn.className = 'char-status-btn';
      if (!item.char_status) noneBtn.classList.add('active');
      noneBtn.textContent = 'None';
      noneBtn.addEventListener('click', async () => {
        if (!item.char_status) return;
        try {
          await window.revival.characters.setStatus(item.id, null);
          await reload();
        } catch { /* non-fatal */ }
      });
      btnGroup.appendChild(noneBtn);

      for (const opt of CHAR_STATUS_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `char-status-btn char-status-btn-${opt.value}`;
        if (item.char_status === opt.value) btn.classList.add('active');
        btn.textContent = opt.label;
        btn.addEventListener('click', async () => {
          if (item.char_status === opt.value) return;
          try {
            await window.revival.characters.setStatus(item.id, opt.value);
            await reload();
          } catch { /* non-fatal */ }
        });
        btnGroup.appendChild(btn);
      }

      section.appendChild(btnGroup);
      container.appendChild(section);
    }

    return makeEntryWorkspace({
      apiName: 'characters',
      entityKind: 'characters',
      draftPrefix: 'characters',
      addLabel: 'Add Character',
      emptyTitle: 'Your character bible',
      emptyHint: 'Build a profile for every character — role, arc, open threads. Link them to episodes and decisions as the show develops.',
      sectionClass: 'ws-characters',
      titlePlaceholder: 'Character name',
      bodyPlaceholder: 'Who they are — role, traits, arc, open threads (optional)',

      matchesExtra(item) {
        return statusFilter === null || item.char_status === statusFilter;
      },

      isFilterActive() {
        return statusFilter !== null;
      },

      isItemDraftLocked(item) {
        return !!item.draft_locked_at;
      },

      listItemExtra(btn, item, archivedFlag) {
        if (archivedFlag) return;
        const titleRow = btn.querySelector('.tc-list-title');
        if (!titleRow) return;
        // PDRAFT-LOCK badge: shown before status badge so it's leftmost.
        if (item.draft_locked_at) {
          const dlBadge = document.createElement('span');
          dlBadge.className = 'tc-list-badge badge-draft-locked';
          dlBadge.textContent = 'Draft-locked';
          titleRow.insertBefore(dlBadge, titleRow.lastChild);
        }
        if (!item.char_status) return;
        const badge = document.createElement('span');
        badge.className = `tc-list-badge badge-char-${item.char_status}`;
        badge.textContent = CHAR_STATUS_LABEL[item.char_status] || item.char_status;
        titleRow.insertBefore(badge, titleRow.lastChild);
      },

      showViewTop(rightCol, item, archivedFlag) {
        if (!archivedFlag) {
          mountCharStatusMeta(rightCol, item, async () => {
            if (reloadRef.fn) await reloadRef.fn();
          });
          // PDRAFT-LOCK panel: shown after status, before actions row.
          mountDraftLockPanel(rightCol, item, async () => {
            if (reloadRef.fn) await reloadRef.fn();
          }, 'characters');
        }
      },

      detailExtra(rightCol, item, archivedFlag) {
        if (!archivedFlag) {
          mountCharRelationships(rightCol, item.id);
          mountProposeCanonSection(rightCol, item, 'characters_workspace');
        }
        const callbacks = {};
        if (!archivedFlag) mountFlanaganFilter(rightCol, item, callbacks, {
          entityKind: 'characters',
          workspaceName: 'Characters',
        });
        const { refresh } = mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, 'characters');
        callbacks.refreshHistory = refresh;
        // PLOCKED-SPECIFICS — character-relevant locked specifics only.
        if (!archivedFlag) mountLockedSpecificsPanel(rightCol, { isCharactersEntry: true });
        // PEPISODE-CONT-2B — continuity check for character entries.
        if (!archivedFlag) mountCharContinuityPanel(rightCol, item);
      },

      leftColExtra(leftCol, rightCol, ctx) {
        reloadRef.fn = ctx.reloadList;

        // Status filter bar — inserted before the + Add button so it's always
        // above the list without interfering with the PTAG filter above it.
        const filterBar = document.createElement('div');
        filterBar.className = 'char-status-filter-bar';

        function renderFilterBar() {
          filterBar.innerHTML = '';
          const allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.className = 'char-filter-btn' + (statusFilter === null ? ' active' : '');
          allBtn.textContent = 'All';
          allBtn.addEventListener('click', () => {
            statusFilter = null;
            renderFilterBar();
            ctx.reloadList();
          });
          filterBar.appendChild(allBtn);

          for (const opt of CHAR_STATUS_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `char-filter-btn char-filter-btn-${opt.value}` + (statusFilter === opt.value ? ' active' : '');
            btn.textContent = opt.label;
            btn.addEventListener('click', () => {
              statusFilter = opt.value;
              renderFilterBar();
              ctx.reloadList();
            });
            filterBar.appendChild(btn);
          }
        }
        renderFilterBar();
        leftCol.insertBefore(filterBar, ctx.addBtn);

        setupCharRelationalView(leftCol, rightCol, ctx);
        setupCharArcTracker(leftCol, rightCol, ctx);
        setupCharVisualTimeline(leftCol, rightCol, ctx);
      },
    });
  })(),
  // Episodes (P27+P38+PEPISODE-STATUS): CRUD lifecycle + canon proposal + status field.
  // Wrapped in an IIFE so statusFilter state is shared across list filter and detail
  // panel hooks without leaking into the outer scope (same pattern as Characters).
  'Episodes': (() => {
    const EP_STATUS_OPTIONS = [
      { value: 'outline', label: 'Outline' },
      { value: 'draft',   label: 'Draft' },
      { value: 'locked',  label: 'Locked' },
    ];
    const EP_STATUS_LABEL = Object.fromEntries(
      EP_STATUS_OPTIONS.map((o) => [o.value, o.label])
    );

    // PEPISODE-STATUS: null = show all; a status string = filter to that status.
    let statusFilter = null;
    // Ref so leftColExtra can trigger a full list+detail reload after a status change.
    const reloadRef = { fn: null };

    function mountEpStatusMeta(container, item, reload) {
      const section = document.createElement('div');
      section.className = 'ep-status-section';

      const label = document.createElement('span');
      label.className = 'ep-status-label';
      label.textContent = 'Status:';
      section.appendChild(label);

      const btnGroup = document.createElement('div');
      btnGroup.className = 'ep-status-selector';

      const noneBtn = document.createElement('button');
      noneBtn.type = 'button';
      noneBtn.className = 'ep-status-btn';
      if (!item.ep_status) noneBtn.classList.add('active');
      noneBtn.textContent = 'None';
      noneBtn.addEventListener('click', async () => {
        if (!item.ep_status) return;
        try {
          await window.revival.episodes.setStatus(item.id, null);
          await reload();
        } catch { /* non-fatal */ }
      });
      btnGroup.appendChild(noneBtn);

      for (const opt of EP_STATUS_OPTIONS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ep-status-btn ep-status-btn-${opt.value}`;
        if (item.ep_status === opt.value) btn.classList.add('active');
        btn.textContent = opt.label;
        btn.addEventListener('click', async () => {
          if (item.ep_status === opt.value) return;
          try {
            await window.revival.episodes.setStatus(item.id, opt.value);
            await reload();
          } catch { /* non-fatal */ }
        });
        btnGroup.appendChild(btn);
      }

      section.appendChild(btnGroup);
      container.appendChild(section);
    }

    // PQUIET — QD dashboard: all 24 episodes in a 3×8 grid.
    // Toggled by a button in leftColExtra alongside the status filter.
    function setupQdDashboard(leftCol, rightCol, ctx) {
      let qdMode = false;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'btn-secondary qd-dashboard-toggle';
      toggle.textContent = 'QD Dashboard';
      leftCol.insertBefore(toggle, ctx.addBtn);

      function exitQdMode() {
        qdMode = false;
        toggle.classList.remove('active');
        leftCol.style.display = '';
        ctx.reloadList();
      }

      async function enterQdMode() {
        qdMode = true;
        toggle.classList.add('active');
        leftCol.style.display = 'none';
        rightCol.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'qd-dashboard-container';

        const header = document.createElement('div');
        header.className = 'qd-dashboard-header';

        const title = document.createElement('span');
        title.className = 'qd-dashboard-title';
        title.textContent = 'Quiet Devastation — All 24 Episodes';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-ghost qd-dashboard-close';
        closeBtn.textContent = '✕ Close';
        closeBtn.addEventListener('click', exitQdMode);
        header.appendChild(closeBtn);

        container.appendChild(header);

        // Legend
        const legend = document.createElement('div');
        legend.className = 'qd-legend';
        const LEGEND = [
          { cls: 'qd-status-none',      label: 'No candidate' },
          { cls: 'qd-status-candidate', label: 'Candidate identified' },
          { cls: 'qd-status-locked',    label: 'Locked' },
        ];
        for (const l of LEGEND) {
          const pip = document.createElement('span');
          pip.className = `qd-legend-pip ${l.cls}`;
          const txt = document.createElement('span');
          txt.className = 'qd-legend-label';
          txt.textContent = l.label;
          legend.append(pip, txt);
        }
        container.appendChild(legend);

        const loadingEl = document.createElement('p');
        loadingEl.className = 'placeholder';
        loadingEl.textContent = 'Loading…';
        container.appendChild(loadingEl);
        rightCol.appendChild(container);

        let rows;
        try {
          rows = await window.revival.quietDevastations.getAll();
        } catch {
          loadingEl.textContent = 'Could not load quiet devastation data.';
          return;
        }
        loadingEl.remove();

        const byEpNum = new Map(rows.map((r) => [r.ep_num, r]));

        // 3 seasons × 8 episodes grid
        for (let season = 1; season <= 3; season++) {
          const seasonBlock = document.createElement('div');
          seasonBlock.className = 'qd-season-block';

          const seasonLabel = document.createElement('div');
          seasonLabel.className = 'qd-season-label';
          seasonLabel.textContent = `Season ${season}`;
          seasonBlock.appendChild(seasonLabel);

          const grid = document.createElement('div');
          grid.className = 'qd-season-grid';

          for (let epInSeason = 1; epInSeason <= 8; epInSeason++) {
            const epNum = (season - 1) * 8 + epInSeason;
            const row = byEpNum.get(epNum);
            const status = row ? row.status : 'no_candidate';

            const cell = document.createElement('div');
            cell.className = `qd-cell ${status === 'no_candidate' ? 'qd-status-none' : status === 'candidate_identified' ? 'qd-status-candidate' : 'qd-status-locked'}`;

            const epCode = document.createElement('span');
            epCode.className = 'qd-cell-code';
            epCode.textContent = `E${epInSeason}`;
            cell.appendChild(epCode);

            if (row && row.is_seeded) {
              const seedPip = document.createElement('span');
              seedPip.className = 'qd-cell-seeded-pip';
              seedPip.title = 'Pre-seeded (Flanagan)';
              cell.appendChild(seedPip);
            }

            const statusEl = document.createElement('span');
            statusEl.className = 'qd-cell-status';
            if (status === 'no_candidate')         statusEl.textContent = 'No candidate';
            else if (status === 'candidate_identified') statusEl.textContent = 'Candidate';
            else                                    statusEl.textContent = 'Locked';
            cell.appendChild(statusEl);

            // Show description preview if set
            const previewText = row && (row.seeded_text || row.description);
            if (previewText) {
              const preview = document.createElement('span');
              preview.className = 'qd-cell-preview';
              preview.textContent = previewText.length > 60 ? previewText.slice(0, 58) + '…' : previewText;
              cell.appendChild(preview);
            }

            if (row && row.writing_lab_title) {
              const wlPip = document.createElement('span');
              wlPip.className = 'qd-cell-wl';
              wlPip.textContent = `Draft: ${row.writing_lab_title}`;
              cell.appendChild(wlPip);
            }

            grid.appendChild(cell);
          }

          seasonBlock.appendChild(grid);
          container.appendChild(seasonBlock);
        }
      }

      toggle.addEventListener('click', () => {
        if (qdMode) exitQdMode();
        else enterQdMode();
      });

      // Exit QD mode when the user navigates away via list item click
      ctx.list.addEventListener('click', () => {
        if (qdMode) exitQdMode();
      });
    }

    return makeEntryWorkspace({
      apiName: 'episodes',
      entityKind: 'episodes',
      draftPrefix: 'episodes',
      addLabel: 'Add Episode',
      emptyTitle: 'Episode-by-episode tracking',
      emptyHint: 'Outline each episode, track what\'s locked and what\'s in flux, and link to characters and decisions.',
      sectionClass: 'ws-episodes',
      titlePlaceholder: 'Episode title',
      bodyPlaceholder: 'Outline, scene list, beats, draft notes (optional)',

      matchesExtra(item) {
        return statusFilter === null || item.ep_status === statusFilter;
      },

      isFilterActive() {
        return statusFilter !== null;
      },

      isItemDraftLocked(item) {
        return !!item.draft_locked_at;
      },

      listItemExtra(btn, item, archivedFlag) {
        if (archivedFlag) return;
        const titleRow = btn.querySelector('.tc-list-title');
        if (!titleRow) return;
        // PDRAFT-LOCK badge: shown before status badge so it's leftmost.
        if (item.draft_locked_at) {
          const dlBadge = document.createElement('span');
          dlBadge.className = 'tc-list-badge badge-draft-locked';
          dlBadge.textContent = 'Draft-locked';
          titleRow.insertBefore(dlBadge, titleRow.lastChild);
        }
        if (!item.ep_status) return;
        const badge = document.createElement('span');
        badge.className = `tc-list-badge badge-ep-${item.ep_status}`;
        badge.textContent = EP_STATUS_LABEL[item.ep_status] || item.ep_status;
        titleRow.insertBefore(badge, titleRow.lastChild);
      },

      showViewTop(rightCol, item, archivedFlag) {
        if (!archivedFlag) {
          mountEpStatusMeta(rightCol, item, async () => {
            if (reloadRef.fn) await reloadRef.fn();
          });
          // PDRAFT-LOCK panel: shown after status, before actions row.
          mountDraftLockPanel(rightCol, item, async () => {
            if (reloadRef.fn) await reloadRef.fn();
          }, 'episodes');
        }
      },

      detailExtra(rightCol, item, archivedFlag) {
        if (!archivedFlag) mountProposeCanonSection(rightCol, item, 'episodes_workspace');
        const callbacks = {};
        if (!archivedFlag) mountFlanaganFilter(rightCol, item, callbacks, {
          entityKind: 'episodes',
          workspaceName: 'Episodes',
        });
        const { refresh } = mountFlanaganHistory(rightCol, item, archivedFlag, callbacks, 'episodes');
        callbacks.refreshHistory = refresh;
        // PEPISODE-STRUCT — structure checklist (5 Flanagan items).
        if (!archivedFlag) mountEpisodeStructPanel(rightCol, item);
        // PQUIET — quiet devastation tracker.
        if (!archivedFlag) mountQuietDevastationPanel(rightCol, item);
        // PEPISODE-PREVON — "Previously on" collapsed canon snapshot.
        if (!archivedFlag) mountPreviouslyOnPanel(rightCol, item);
        // PEPISODE-CONT — AI continuity checker.
        if (!archivedFlag) mountEpisodeContinuityPanel(rightCol, item);
        // PLOCKED-SPECIFICS — all locked specifics.
        if (!archivedFlag) mountLockedSpecificsPanel(rightCol);
      },

      leftColExtra(leftCol, rightCol, ctx) {
        reloadRef.fn = ctx.reloadList;

        // Status filter bar — inserted before the + Add button.
        const filterBar = document.createElement('div');
        filterBar.className = 'ep-status-filter-bar';

        function renderFilterBar() {
          filterBar.innerHTML = '';
          const allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.className = 'ep-filter-btn' + (statusFilter === null ? ' active' : '');
          allBtn.textContent = 'All';
          allBtn.addEventListener('click', () => {
            statusFilter = null;
            renderFilterBar();
            ctx.reloadList();
          });
          filterBar.appendChild(allBtn);

          for (const opt of EP_STATUS_OPTIONS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `ep-filter-btn ep-filter-btn-${opt.value}` + (statusFilter === opt.value ? ' active' : '');
            btn.textContent = opt.label;
            btn.addEventListener('click', () => {
              statusFilter = opt.value;
              renderFilterBar();
              ctx.reloadList();
            });
            filterBar.appendChild(btn);
          }
        }
        renderFilterBar();
        leftCol.insertBefore(filterBar, ctx.addBtn);

        // PQUIET — QD dashboard toggle button.
        setupQdDashboard(leftCol, rightCol, ctx);
      },
    });
  })(),
};

const nav = document.getElementById('nav');
const content = document.getElementById('content');
const buttons = {};

// --- Theme (dark default / light), persisted across restarts via localStorage ---
const THEME_KEY = 'revival.theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggle) {
    // Show the current mode's emoji: moon in dark, sun in light.
    const dark = theme === 'dark';
    themeToggle.textContent = dark ? '🌙' : '☀️';
    const tip = dark ? 'Dark mode — click for light' : 'Light mode — click for dark';
    themeToggle.title = tip;
    themeToggle.setAttribute('aria-label', tip);
  }
}

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
}

const themeToggle = document.createElement('button');
themeToggle.id = 'theme-toggle';
themeToggle.addEventListener('click', () => {
  const next =
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});
applyTheme(loadTheme());

function route(name, entryId) {
  // PHOME: an optional entryId pre-selects an entry once the target workspace
  // mounts (one-click return from Home's recently-viewed). A plain navigation
  // clears any stale request so it can't leak into the wrong page.
  pendingEntrySelection = entryId != null ? { workspace: name, id: entryId } : null;
  for (const key in buttons) {
    buttons[key].classList.toggle('active', key === name);
  }
  // PUI2: drop any previous workspace's refresh registration before swapping
  // pages so the popout:changed listener can't fire stale loadLists into a
  // detached DOM. The next workspace re-registers itself on mount.
  clearActiveWorkspaceRefresh();
  content.innerHTML = '';
  content.appendChild(renderWorkspacePage(name));
  refreshNavBadges();
}

// PUI2: listen for popout commits in other windows and refresh the active
// workspace's list when its signal matches. Registered once at module init —
// the per-workspace dispatch happens via currentWorkspaceName/Refresh above.
window.revival.popout.onChanged((ws) => {
  if (ws && ws === currentWorkspaceName && currentWorkspaceRefresh) {
    currentWorkspaceRefresh();
  }
});

// Per-workspace nav icons. These are the only glyphs shown when the nav is
// collapsed to its icon rail, so each one stands in for its workspace; the
// button's title attribute carries the full name as a hover tooltip.
const NAV_ICONS = {
  'Home': '🏠',
  'Chat': '💬',
  'Writing Lab': '✍️',
  'Source Material': '📚',
  'Documents': '📄',
  'Canon Bible': '📖',
  'Characters': '👤',
  'Episodes': '🎬',
  'Unsorted': '📥',
  'Canon Review': '✅',
  'Import': '📂',
  'Open Questions': '❓',
  'Conflicts': '⚔️',
  'Decisions': '⚖️',
  'Brainstorm': '💡',
  'Research': '🔎',
  'Settings': '⚙️',
};

// PHOME: which nav items carry a count badge, mapped to the navBadges key.
const NAV_BADGE_KEYS = {
  'Unsorted': 'unsorted',
  'Canon Review': 'canonReview',
  'Open Questions': 'openQuestions',
  'Conflicts': 'conflicts',
};
const navBadgeEls = {};

for (const name of WORKSPACES) {
  const btn = document.createElement('button');
  // title doubles as the collapsed-rail tooltip; harmless when expanded.
  btn.title = name;
  const icon = document.createElement('span');
  icon.className = 'nav-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = NAV_ICONS[name] || '•';
  const label = document.createElement('span');
  label.className = 'nav-label';
  label.textContent = name;
  btn.append(icon, label);
  // PHOME: count badge for the four queue-style workspaces. Hidden until the
  // count is > 0 (refreshNavBadges manages visibility).
  // PSTALE: two inner spans so the age suffix can be hidden on the collapsed rail.
  if (NAV_BADGE_KEYS[name]) {
    const badge = document.createElement('span');
    badge.className = 'nav-badge';
    badge.style.display = 'none';
    const nbCount = document.createElement('span');
    nbCount.className = 'nb-count';
    const nbAge = document.createElement('span');
    nbAge.className = 'nb-age';
    badge.append(nbCount, nbAge);
    btn.appendChild(badge);
    navBadgeEls[name] = badge;
  }
  btn.addEventListener('click', () => route(name));
  buttons[name] = btn;
  nav.appendChild(btn);
}

// PHOME: pull the three counts and update the badges. Hoisted so loadList and
// route() (defined earlier) can call it. Silent on failure — a stale badge is
// better than a thrown overview.
async function refreshNavBadges() {
  let counts;
  try {
    counts = await window.revival.dashboard.navBadges();
  } catch {
    return;
  }
  for (const [ws, key] of Object.entries(NAV_BADGE_KEYS)) {
    const el = navBadgeEls[ws];
    if (!el) continue;
    const n = counts[key] || 0;
    const d = counts[key + 'OldestDays'];
    el.querySelector('.nb-count').textContent = n > 99 ? '99+' : String(n);
    el.querySelector('.nb-age').textContent = (n > 0 && d != null) ? ` · ${d}d` : '';
    el.style.display = n > 0 ? '' : 'none';
    el.title = n > 0 && d != null
      ? `${n} ${n === 1 ? 'item' : 'items'}, oldest ${d}d`
      : `${n} ${n === 1 ? 'item' : 'items'}`;
  }
}
refreshNavBadges();

// --- Collapsible nav --------------------------------------------------------
// Collapsed = icon-only rail; expanded = full labels. The choice persists
// across restarts (same pattern as the theme toggle).
const NAV_KEY = 'revival.nav';
const navToggle = document.getElementById('nav-toggle');

function applyNavState(collapsed) {
  nav.classList.toggle('collapsed', collapsed);
  navToggle.textContent = collapsed ? '»' : '«';
  const tip = collapsed ? 'Expand menu' : 'Collapse menu';
  navToggle.title = tip;
  navToggle.setAttribute('aria-label', tip);
}

let navCollapsed = localStorage.getItem(NAV_KEY) === 'collapsed';
applyNavState(navCollapsed);

navToggle.addEventListener('click', () => {
  navCollapsed = !navCollapsed;
  localStorage.setItem(NAV_KEY, navCollapsed ? 'collapsed' : 'expanded');
  applyNavState(navCollapsed);
});

// Mount on body (not nav): inside #nav the broad `#nav button` rule would win
// on specificity and stretch this to full width. As a fixed corner icon it
// belongs alongside the Panic Export bolt, not in the nav flow.
document.body.appendChild(themeToggle);

// --- Global Chat drawer (shell only; no AI yet) -----------------------------
// The toggle is fixed and outside #content, so the drawer opens/closes from
// every workspace without taking over the app. P15 adds multiple chats: a
// title dropdown lists them and switches the active chat. Chats are created
// only on an explicit "+ New chat" click — nothing is seeded silently. There
// are no messages yet (those arrive with AI in a later phase).
const chatDrawer = document.getElementById('chat-drawer');
const chatToggle = document.getElementById('chat-toggle');
const chatClose = document.getElementById('chat-close');
const chatExpand = document.getElementById('chat-expand');
const chatSelect = document.getElementById('chat-select');
const chatNewBtn = document.getElementById('chat-new');
const chatMessages = document.getElementById('chat-messages');
const chatTools = document.getElementById('chat-tools');
const chatRenameBtn = document.getElementById('chat-rename');
const chatArchiveBtn = document.getElementById('chat-archive');
const chatRouteBtn = document.getElementById('chat-route');
const chatRoutePicker = document.getElementById('chat-route-picker');
const chatRenameRow = document.getElementById('chat-rename-row');
const chatRenameInput = document.getElementById('chat-rename-input');
const chatRenameCancel = document.getElementById('chat-rename-cancel');
const chatArchived = document.getElementById('chat-archived');
const chatArchivedList = document.getElementById('chat-archived-list');
const chatSourcesList = document.getElementById('chat-sources-list');
const chatAttachBtn = document.getElementById('chat-attach');
const chatSourcePicker = document.getElementById('chat-source-picker');
const chatComposer = document.getElementById('chat-composer');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
// P39 — request preview
const chatPreviewBtn = document.getElementById('chat-preview-btn');
const chatPreviewWrap = document.getElementById('chat-preview-wrap');
const chatPreviewBody = document.getElementById('chat-preview-body');
// Model selector
const chatModelSelect = document.getElementById('chat-model');

const ACTIVE_CHAT_KEY = 'revival.chat.active';
const CHAT_EXPANDED_KEY = 'revival.chat.expanded';
const CHAT_MODEL_KEY = 'revival.chat.model';
let chatList = [];
let archivedChats = [];
let activeChatId = null;
// Keep-active sources for the current chat (persisted; loaded from SQLite).
let activeSources = [];
// Keep-active documents for the current chat (persisted; loaded from SQLite).
let activeDocuments = [];
// "Next message only" sources (P19): ephemeral and per-chat, held in memory
// only so they never survive a send or a restart. Keyed by chat id → array of
// source objects, so switching chats keeps each chat's pending picks separate.
const nextSourcesByChat = new Map();
// "Next message only" documents: same pattern as nextSourcesByChat but for Documents.
const nextDocsByChat = new Map();
// Keep-active Canon Bible entries for the current chat (persisted; loaded from SQLite).
let activeCanonEntries = [];
// Keep-active Characters entries for the current chat (persisted; loaded from SQLite).
let activeCharEntries = [];
// Keep-active Episodes entries for the current chat (persisted; loaded from SQLite).
let activeEpisodeEntries = [];
// "Next message only" Canon entries: ephemeral, per-chat.
const nextCanonByChat = new Map();
// "Next message only" Characters entries: ephemeral, per-chat.
const nextCharsByChat = new Map();
// "Next message only" Episodes entries: ephemeral, per-chat.
const nextEpisodesByChat = new Map();
// P40 — in-memory message history for the active chat; loaded from DB on switch.
let chatMessageHistory = [];
let _sendInProgress = false;

function setChatOpen(open) {
  chatDrawer.classList.toggle('open', open);
  chatDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  chatToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// Expand mode (P17): a larger view, not a full-screen takeover. The drawer
// only widens — it never covers the whole window, so the left nav and content
// stay clickable. The preference persists across restarts.
function setChatExpanded(expanded) {
  chatDrawer.classList.toggle('expanded', expanded);
  chatExpand.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  chatExpand.setAttribute('aria-label', expanded ? 'Collapse chat' : 'Expand chat');
  chatExpand.title = expanded ? 'Collapse chat' : 'Expand chat';
  chatExpand.textContent = expanded ? '⤡' : '⤢';
  localStorage.setItem(CHAT_EXPANDED_KEY, expanded ? '1' : '0');
}

// P40 — render all loaded messages (or an empty-state hint).
function renderChatBody() {
  chatMessages.innerHTML = '';
  if (activeChatId == null) {
    const p = document.createElement('p');
    p.className = 'chat-empty';
    p.textContent = 'No chats yet. Click “+ New chat” to start one.';
    chatMessages.appendChild(p);
    return;
  }
  if (chatMessageHistory.length === 0) {
    const p = document.createElement('p');
    p.className = 'chat-empty';
    p.textContent = 'No messages yet. Type below and press Send.';
    chatMessages.appendChild(p);
    return;
  }
  for (const msg of chatMessageHistory) {
    chatMessages.appendChild(_buildMsgEl(msg.role, msg.content, msg));
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Build a single message element (user or assistant).
// `dbMsg` is optional — when provided (from history), adds archive/unarchive button.
function _buildMsgEl(role, content, dbMsg) {
  const wrap = document.createElement('div');

  if (dbMsg && dbMsg.is_archived) {
    wrap.className = 'chat-msg chat-msg-archived';
    const note = document.createElement('span');
    note.className = 'chat-msg-archived-note';
    note.textContent = 'Message archived';
    const unarchiveBtn = document.createElement('button');
    unarchiveBtn.type = 'button';
    unarchiveBtn.className = 'btn-tool chat-msg-unarchive';
    unarchiveBtn.textContent = 'Unarchive';
    unarchiveBtn.addEventListener('click', async () => {
      unarchiveBtn.disabled = true;
      try {
        await window.revival.chatMessages.unarchive(dbMsg.id);
        dbMsg.is_archived = 0;
        const fresh = _buildMsgEl(role, content, dbMsg);
        wrap.replaceWith(fresh);
      } catch {
        unarchiveBtn.disabled = false;
      }
    });
    wrap.appendChild(note);
    wrap.appendChild(unarchiveBtn);
    return wrap;
  }

  wrap.className = `chat-msg chat-msg-${role}`;
  const label = document.createElement('span');
  label.className = 'chat-msg-label';
  label.textContent = role === 'user' ? 'You' : 'Claude';
  const body = document.createElement('p');
  body.className = 'chat-msg-body';
  body.textContent = content;
  wrap.appendChild(label);
  wrap.appendChild(body);

  if (window.RevivalExtract && activeChatId != null) {
    const activeChat = chatList.find((c) => c.id === activeChatId);
    window.RevivalExtract.attach(body, {
      workspace: 'Chat',
      id: activeChatId,
      title: activeChat ? activeChat.title : 'Chat',
    });
  }

  if (dbMsg) {
    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn-tool chat-msg-archive';
    archiveBtn.textContent = 'Archive';
    archiveBtn.title = 'Archive this message (removes from Claude context)';
    archiveBtn.addEventListener('click', async () => {
      archiveBtn.disabled = true;
      try {
        await window.revival.chatMessages.archive(dbMsg.id);
        dbMsg.is_archived = 1;
        const fresh = _buildMsgEl(role, content, dbMsg);
        wrap.replaceWith(fresh);
      } catch {
        archiveBtn.disabled = false;
      }
    });
    wrap.appendChild(archiveBtn);
  }

  return wrap;
}

// Append a message element to the DOM and scroll into view.
function _appendMsgEl(role, content) {
  const el = _buildMsgEl(role, content);
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return el;
}

// Append an ephemeral “thinking” indicator (no DB backing).
function _appendThinkingEl() {
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg-assistant chat-thinking';
  const label = document.createElement('span');
  label.className = 'chat-msg-label';
  label.textContent = 'Claude';
  const body = document.createElement('p');
  body.className = 'chat-msg-body';
  body.textContent = 'Thinking…';
  wrap.appendChild(label);
  wrap.appendChild(body);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrap;
}

// Append a transient error row (not saved to DB).
function _appendErrorEl(message) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg-error';
  const label = document.createElement('span');
  label.className = 'chat-msg-label';
  label.textContent = 'Error';
  const body = document.createElement('p');
  body.className = 'chat-msg-body';
  body.textContent = message;
  wrap.appendChild(label);
  wrap.appendChild(body);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// P41 — Append a non-persisted notification card when Claude stages a proposal.
// Shows the proposal title and a button to jump to Canon Review.
function _appendProposalCard({ id, title }) {
  const wrap = document.createElement('div');
  wrap.className = 'chat-msg chat-msg-proposal';
  const label = document.createElement('span');
  label.className = 'chat-msg-label';
  label.textContent = 'Canon Review';
  const body = document.createElement('p');
  body.className = 'chat-msg-body';
  body.textContent = `Proposal staged: "${title}"`;
  const btn = document.createElement('button');
  btn.className = 'btn-tool chat-proposal-goto';
  btn.type = 'button';
  btn.textContent = '→ Open in Canon Review';
  btn.addEventListener('click', () => {
    route('Canon Review');
  });
  wrap.appendChild(label);
  wrap.appendChild(body);
  wrap.appendChild(btn);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Load messages for the active chat from DB and re-render.
async function loadChatMessages() {
  if (activeChatId == null) return;
  const id = activeChatId;
  try {
    const msgs = await window.revival.chatMessages.list(id);
    if (activeChatId !== id) return; // stale — user switched chat
    chatMessageHistory = msgs;
    renderChatBody();
  } catch (err) {
    console.error('[chat] loadChatMessages error:', err);
  }
}

// Build the system prompt: project rules + any attached sources + documents.
async function buildSystemPrompt() {
  let rules = '';
  try {
    rules = (await window.revival.settings.getProjectRules()) || '';
  } catch {
    rules = '';
  }
  const keptSrcs = activeSources;
  const nextSrcs = activeChatId != null ? nextSourcesFor(activeChatId) : [];
  const allSrcs = [...keptSrcs, ...nextSrcs];
  const keptDocs = activeDocuments;
  const nextDocs = activeChatId != null ? nextDocsFor(activeChatId) : [];
  const allDocs = [...keptDocs, ...nextDocs];
  const parts = [];
  if (rules) parts.push(rules);
  if (allSrcs.length) {
    const sections = allSrcs.map(
      (s) => `### ${s.title}\n\n${s.body || '(no content)'}`
    );
    parts.push(`## Source Material\n\n${sections.join('\n\n---\n\n')}`);
  }
  if (allDocs.length) {
    const sections = allDocs.map(
      (d) => `### ${d.title}\n\n${d.body || '(no content)'}`
    );
    parts.push(`## Documents\n\n${sections.join('\n\n---\n\n')}`);
  }
  const keptCanon = activeCanonEntries;
  const nextCanon = activeChatId != null ? nextCanonFor(activeChatId) : [];
  const allCanon = [...keptCanon, ...nextCanon];
  const keptChars = activeCharEntries;
  const nextChars = activeChatId != null ? nextCharsFor(activeChatId) : [];
  const allChars = [...keptChars, ...nextChars];
  const keptEps = activeEpisodeEntries;
  const nextEps = activeChatId != null ? nextEpisodesFor(activeChatId) : [];
  const allEps = [...keptEps, ...nextEps];
  if (allCanon.length) {
    const sections = allCanon.map(
      (c) => `### ${c.title} [${c.entry_type}${c.locked ? ' · locked' : ''}]\n\n${c.body || '(no content)'}`
    );
    parts.push(`## Canon Bible\n\n${sections.join('\n\n---\n\n')}`);
  }
  if (allChars.length) {
    const sections = allChars.map(
      (c) => `### ${c.title}\n\n${c.body || '(no content)'}`
    );
    parts.push(`## Characters\n\n${sections.join('\n\n---\n\n')}`);
  }
  if (allEps.length) {
    const sections = allEps.map(
      (ep) => `### ${ep.title}\n\n${ep.body || '(no content)'}`
    );
    parts.push(`## Episodes\n\n${sections.join('\n\n---\n\n')}`);
  }
  return parts.join('\n\n');
}

function renderChatSelect() {
  chatSelect.innerHTML = '';
  if (chatList.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'No chats yet';
    chatSelect.appendChild(opt);
    chatSelect.disabled = true;
    return;
  }
  chatSelect.disabled = false;
  for (const chat of chatList) {
    const opt = document.createElement('option');
    opt.value = String(chat.id);
    opt.textContent = chat.title;
    chatSelect.appendChild(opt);
  }
  chatSelect.value = String(activeChatId);
}

// Rename/Archive act on the active chat, so disable them when there is none.
function renderChatTools() {
  const hasActive = activeChatId != null;
  chatRenameBtn.disabled = !hasActive;
  chatArchiveBtn.disabled = !hasActive;
  chatRouteBtn.disabled = !hasActive;
}

// Collapsed "Archived chats" list; each row restores back to the active list.
function renderArchivedChats() {
  chatArchivedList.innerHTML = '';
  if (archivedChats.length === 0) {
    chatArchived.hidden = true;
    return;
  }
  chatArchived.hidden = false;
  for (const chat of archivedChats) {
    const row = document.createElement('div');
    row.className = 'chat-archived-item';

    const title = document.createElement('span');
    title.className = 'archived-title';
    title.textContent = chat.title;

    const restore = document.createElement('button');
    restore.className = 'btn-tool';
    restore.type = 'button';
    restore.textContent = 'Restore';
    restore.addEventListener('click', async () => {
      restore.disabled = true;
      try {
        await window.revival.chats.restore(chat.id);
        await loadChats();
        setActiveChat(chat.id);
      } catch (err) {
        restore.disabled = false;
      }
    });

    row.appendChild(title);
    row.appendChild(restore);
    chatArchivedList.appendChild(row);
  }
}

// --- Active sources (P18 keep-active + P19 next-message-only) ---------------
// The sources a chat would use are always visible above the composer so the
// user knows exactly what Claude would draw on. Attachable types: Source Material
// and Documents. Two modes:
//   • "keep active"        — persisted in SQLite, stays listed for the chat.
//   • "next message only"  — in-memory only, cleared on the next draft send.
// Every chip carries a one-click remove (P19). Composer enablement rides along
// here since it depends on whether a chat is active.
function nextSourcesFor(chatId) {
  return nextSourcesByChat.get(chatId) || [];
}
function nextDocsFor(chatId) {
  return nextDocsByChat.get(chatId) || [];
}
function nextCanonFor(chatId) {
  return nextCanonByChat.get(chatId) || [];
}
function nextCharsFor(chatId) {
  return nextCharsByChat.get(chatId) || [];
}
function nextEpisodesFor(chatId) {
  return nextEpisodesByChat.get(chatId) || [];
}

// mode: 'keep'|'next' (Source Material), 'keepDoc'|'nextDoc' (Documents),
//       'keepCanon'|'nextCanon' (Canon Bible), 'keepChar'|'nextChar' (Characters),
//       'keepEp'|'nextEp' (Episodes).
function buildSourceChip(src, mode) {
  const isNext = ['next', 'nextDoc', 'nextCanon', 'nextChar', 'nextEp'].includes(mode);
  const typeLabel = {
    keepDoc: 'Doc',    nextDoc: 'Doc',
    keepCanon: 'Canon', nextCanon: 'Canon',
    keepChar: 'Character', nextChar: 'Character',
    keepEp: 'Episode', nextEp: 'Episode',
  }[mode] || null;
  const chip = document.createElement('span');
  chip.className = isNext ? 'source-chip chip-next' : 'source-chip';

  if (typeLabel) {
    const typeTag = document.createElement('span');
    typeTag.className = 'chip-type';
    typeTag.textContent = typeLabel;
    chip.appendChild(typeTag);
  }

  const title = document.createElement('span');
  title.className = 'chip-title';
  title.textContent = src.title;
  chip.appendChild(title);

  // A keep-active attachment archived after attaching stays active but is flagged.
  if (['keep', 'keepDoc', 'keepChar', 'keepEp'].includes(mode) && src.archived_at) {
    const note = document.createElement('span');
    note.className = 'chip-archived';
    note.textContent = '(archived)';
    chip.appendChild(note);
  }

  if (isNext) {
    const badge = document.createElement('span');
    badge.className = 'chip-mode';
    badge.textContent = 'next message only';
    chip.appendChild(badge);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'chip-remove';
  remove.textContent = '✕';
  remove.title = 'Remove';
  remove.setAttribute('aria-label', `Remove ${src.title}`);
  remove.addEventListener('click', () => removeSource(src.id, mode));
  chip.appendChild(remove);

  return chip;
}

function renderActiveSources() {
  chatSourcesList.innerHTML = '';
  const hasChat = activeChatId != null;
  chatAttachBtn.disabled = !hasChat;
  chatInput.disabled = !hasChat;
  chatSend.disabled = !hasChat;
  // P39: keep preview in sync when sources change.
  refreshPreview();

  if (!hasChat) {
    const p = document.createElement('p');
    p.className = 'chat-sources-empty';
    p.textContent = 'Start or pick a chat to attach sources.';
    chatSourcesList.appendChild(p);
    return;
  }

  const nextSources = nextSourcesFor(activeChatId);
  const nextDocs = nextDocsFor(activeChatId);
  const nextCanon = nextCanonFor(activeChatId);
  const nextChars = nextCharsFor(activeChatId);
  const nextEps = nextEpisodesFor(activeChatId);
  if (activeSources.length === 0 && nextSources.length === 0 &&
      activeDocuments.length === 0 && nextDocs.length === 0 &&
      activeCanonEntries.length === 0 && nextCanon.length === 0 &&
      activeCharEntries.length === 0 && nextChars.length === 0 &&
      activeEpisodeEntries.length === 0 && nextEps.length === 0) {
    const p = document.createElement('p');
    p.className = 'chat-sources-empty';
    p.textContent =
      'No sources attached. Claude would use only what you attach here.';
    chatSourcesList.appendChild(p);
    return;
  }

  for (const src of activeSources) {
    chatSourcesList.appendChild(buildSourceChip(src, 'keep'));
  }
  for (const src of nextSources) {
    chatSourcesList.appendChild(buildSourceChip(src, 'next'));
  }
  for (const doc of activeDocuments) {
    chatSourcesList.appendChild(buildSourceChip(doc, 'keepDoc'));
  }
  for (const doc of nextDocs) {
    chatSourcesList.appendChild(buildSourceChip(doc, 'nextDoc'));
  }
  for (const entry of activeCanonEntries) {
    chatSourcesList.appendChild(buildSourceChip(entry, 'keepCanon'));
  }
  for (const entry of nextCanon) {
    chatSourcesList.appendChild(buildSourceChip(entry, 'nextCanon'));
  }
  for (const char of activeCharEntries) {
    chatSourcesList.appendChild(buildSourceChip(char, 'keepChar'));
  }
  for (const char of nextChars) {
    chatSourcesList.appendChild(buildSourceChip(char, 'nextChar'));
  }
  for (const ep of activeEpisodeEntries) {
    chatSourcesList.appendChild(buildSourceChip(ep, 'keepEp'));
  }
  for (const ep of nextEps) {
    chatSourcesList.appendChild(buildSourceChip(ep, 'nextEp'));
  }
}

// One-click remove. Keep-active detaches in SQLite; next-message-only just
// drops from the in-memory list for the active chat.
async function removeSource(sourceId, mode) {
  if (activeChatId == null) return;
  if (mode === 'keep') {
    activeSources = await window.revival.chatSources.detach(activeChatId, sourceId);
    renderActiveSources();
    return;
  }
  if (mode === 'keepDoc') {
    activeDocuments = await window.revival.chatDocuments.detach(activeChatId, sourceId);
    renderActiveSources();
    return;
  }
  if (mode === 'nextDoc') {
    const list = nextDocsFor(activeChatId).filter((d) => d.id !== sourceId);
    nextDocsByChat.set(activeChatId, list);
    renderActiveSources();
    return;
  }
  if (mode === 'keepCanon') {
    activeCanonEntries = await window.revival.chatCanon.detach(activeChatId, sourceId);
    renderActiveSources();
    return;
  }
  if (mode === 'nextCanon') {
    const list = nextCanonFor(activeChatId).filter((e) => e.id !== sourceId);
    nextCanonByChat.set(activeChatId, list);
    renderActiveSources();
    return;
  }
  if (mode === 'keepChar') {
    activeCharEntries = await window.revival.chatCharacters.detach(activeChatId, sourceId);
    renderActiveSources();
    return;
  }
  if (mode === 'nextChar') {
    const list = nextCharsFor(activeChatId).filter((c) => c.id !== sourceId);
    nextCharsByChat.set(activeChatId, list);
    renderActiveSources();
    return;
  }
  if (mode === 'keepEp') {
    activeEpisodeEntries = await window.revival.chatEpisodes.detach(activeChatId, sourceId);
    renderActiveSources();
    return;
  }
  if (mode === 'nextEp') {
    const list = nextEpisodesFor(activeChatId).filter((e) => e.id !== sourceId);
    nextEpisodesByChat.set(activeChatId, list);
    renderActiveSources();
    return;
  }
  // mode === 'next'
  const list = nextSourcesFor(activeChatId).filter((s) => s.id !== sourceId);
  nextSourcesByChat.set(activeChatId, list);
  renderActiveSources();
}

async function loadActiveSources() {
  if (activeChatId == null) {
    activeSources = [];
    activeDocuments = [];
    activeCanonEntries = [];
    activeCharEntries = [];
    activeEpisodeEntries = [];
    renderActiveSources();
    return;
  }
  [activeSources, activeDocuments, activeCanonEntries, activeCharEntries, activeEpisodeEntries] =
    await Promise.all([
      window.revival.chatSources.list(activeChatId),
      window.revival.chatDocuments.list(activeChatId),
      window.revival.chatCanon.list(activeChatId),
      window.revival.chatCharacters.list(activeChatId),
      window.revival.chatEpisodes.list(activeChatId),
    ]);
  // Prune any next-message-only picks whose source/document was deleted elsewhere.
  const next = nextSourcesByChat.get(activeChatId);
  if (next && next.length) {
    const allSources = await window.revival.sourceMaterial.list();
    const liveIds = new Set(allSources.map((s) => s.id));
    nextSourcesByChat.set(activeChatId, next.filter((s) => liveIds.has(s.id)));
  }
  const nextDocs = nextDocsByChat.get(activeChatId);
  if (nextDocs && nextDocs.length) {
    const allDocs = await window.revival.documents.list();
    const liveIds = new Set(allDocs.map((d) => d.id));
    nextDocsByChat.set(activeChatId, nextDocs.filter((d) => liveIds.has(d.id)));
  }
  const nextCanon = nextCanonByChat.get(activeChatId);
  if (nextCanon && nextCanon.length) {
    const allCanon = await window.revival.canon.list();
    const liveIds = new Set(allCanon.map((e) => e.id));
    nextCanonByChat.set(activeChatId, nextCanon.filter((e) => liveIds.has(e.id)));
  }
  const nextChars = nextCharsByChat.get(activeChatId);
  if (nextChars && nextChars.length) {
    const allChars = await window.revival.characters.list();
    const liveIds = new Set(allChars.map((c) => c.id));
    nextCharsByChat.set(activeChatId, nextChars.filter((c) => liveIds.has(c.id)));
  }
  const nextEps = nextEpisodesByChat.get(activeChatId);
  if (nextEps && nextEps.length) {
    const allEps = await window.revival.episodes.list();
    const liveIds = new Set(allEps.map((e) => e.id));
    nextEpisodesByChat.set(activeChatId, nextEps.filter((e) => liveIds.has(e.id)));
  }
  renderActiveSources();
}

function hidePicker() {
  chatSourcePicker.hidden = true;
  chatSourcePicker.innerHTML = '';
}

// Tabbed picker: Source Material, Documents, Canon Bible, Characters, Episodes.
// Each tab excludes entries already attached in either mode.
// Each row offers both attach modes: keep active vs. next message only.
async function showPicker() {
  if (activeChatId == null) return;
  const [sources, docs, canonAll, charsAll, episodesAll] = await Promise.all([
    window.revival.sourceMaterial.list(),
    window.revival.documents.list(),
    window.revival.canon.list(),
    window.revival.characters.list(),
    window.revival.episodes.list(),
  ]);
  const usedSourceIds = new Set([
    ...activeSources.map((s) => s.id),
    ...nextSourcesFor(activeChatId).map((s) => s.id),
  ]);
  const usedDocIds = new Set([
    ...activeDocuments.map((d) => d.id),
    ...nextDocsFor(activeChatId).map((d) => d.id),
  ]);
  const usedCanonIds = new Set([
    ...activeCanonEntries.map((e) => e.id),
    ...nextCanonFor(activeChatId).map((e) => e.id),
  ]);
  const usedCharIds = new Set([
    ...activeCharEntries.map((c) => c.id),
    ...nextCharsFor(activeChatId).map((c) => c.id),
  ]);
  const usedEpIds = new Set([
    ...activeEpisodeEntries.map((e) => e.id),
    ...nextEpisodesFor(activeChatId).map((e) => e.id),
  ]);
  const availableSources = sources.filter((s) => !usedSourceIds.has(s.id));
  const availableDocs = docs.filter((d) => !usedDocIds.has(d.id));
  const availableCanon = canonAll.filter((e) => !usedCanonIds.has(e.id));
  const availableChars = charsAll.filter((c) => !usedCharIds.has(c.id));
  const availableEps = episodesAll.filter((e) => !usedEpIds.has(e.id));

  chatSourcePicker.innerHTML = '';

  // Tab bar
  const tabs = document.createElement('div');
  tabs.className = 'picker-tabs';
  const tabDefs = [
    { label: 'Source Material' },
    { label: 'Documents' },
    { label: 'Canon Bible' },
    { label: 'Characters' },
    { label: 'Episodes' },
  ];
  const tabEls = tabDefs.map(({ label }, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = i === 0 ? 'picker-tab picker-tab-active' : 'picker-tab';
    btn.textContent = label;
    tabs.appendChild(btn);
    return btn;
  });
  chatSourcePicker.appendChild(tabs);

  const panelDefs = [
    { available: availableSources, all: sources,    keepMode: 'keep',      nextMode: 'next',      emptyLabel: 'Source Material' },
    { available: availableDocs,    all: docs,       keepMode: 'keepDoc',   nextMode: 'nextDoc',   emptyLabel: 'Documents' },
    { available: availableCanon,   all: canonAll,   keepMode: 'keepCanon', nextMode: 'nextCanon', emptyLabel: 'Canon Bible entries' },
    { available: availableChars,   all: charsAll,   keepMode: 'keepChar',  nextMode: 'nextChar',  emptyLabel: 'Characters' },
    { available: availableEps,     all: episodesAll,keepMode: 'keepEp',    nextMode: 'nextEp',    emptyLabel: 'Episodes' },
  ];
  const panelEls = panelDefs.map(({ available, all, keepMode, nextMode, emptyLabel }, i) => {
    const panel = document.createElement('div');
    panel.className = i === 0 ? 'picker-panel' : 'picker-panel picker-panel-hidden';
    if (available.length === 0) {
      const hint = document.createElement('p');
      hint.className = 'picker-hint';
      hint.textContent = all.length
        ? `All ${emptyLabel} already attached.`
        : `No ${emptyLabel} yet.`;
      panel.appendChild(hint);
    } else {
      for (const item of available) {
        const row = document.createElement('div');
        row.className = 'picker-item';
        const titleEl = document.createElement('span');
        titleEl.className = 'picker-title';
        titleEl.textContent = item.title;
        row.appendChild(titleEl);
        const keepBtn = document.createElement('button');
        keepBtn.type = 'button';
        keepBtn.className = 'picker-mode-btn';
        keepBtn.textContent = 'Keep active';
        keepBtn.addEventListener('click', () => attachItem(item, keepMode, row));
        row.appendChild(keepBtn);
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'picker-mode-btn';
        nextBtn.textContent = 'Next message only';
        nextBtn.addEventListener('click', () => attachItem(item, nextMode, row));
        row.appendChild(nextBtn);
        panel.appendChild(row);
      }
    }
    chatSourcePicker.appendChild(panel);
    return panel;
  });

  tabEls.forEach((tabEl, idx) => {
    tabEl.addEventListener('click', () => {
      tabEls.forEach((t, i) => {
        t.classList.toggle('picker-tab-active', i === idx);
        panelEls[i].classList.toggle('picker-panel-hidden', i !== idx);
      });
    });
  });

  chatSourcePicker.hidden = false;
}

// Attach an item in the chosen mode.
async function attachItem(item, mode, row) {
  if (activeChatId == null) return;
  row.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    if (mode === 'keep') {
      activeSources = await window.revival.chatSources.attach(activeChatId, item.id);
    } else if (mode === 'keepDoc') {
      activeDocuments = await window.revival.chatDocuments.attach(activeChatId, item.id);
    } else if (mode === 'keepCanon') {
      activeCanonEntries = await window.revival.chatCanon.attach(activeChatId, item.id);
    } else if (mode === 'keepChar') {
      activeCharEntries = await window.revival.chatCharacters.attach(activeChatId, item.id);
    } else if (mode === 'keepEp') {
      activeEpisodeEntries = await window.revival.chatEpisodes.attach(activeChatId, item.id);
    } else if (mode === 'nextDoc') {
      const list = nextDocsFor(activeChatId);
      nextDocsByChat.set(activeChatId, [...list, item]);
    } else if (mode === 'nextCanon') {
      const list = nextCanonFor(activeChatId);
      nextCanonByChat.set(activeChatId, [...list, item]);
    } else if (mode === 'nextChar') {
      const list = nextCharsFor(activeChatId);
      nextCharsByChat.set(activeChatId, [...list, item]);
    } else if (mode === 'nextEp') {
      const list = nextEpisodesFor(activeChatId);
      nextEpisodesByChat.set(activeChatId, [...list, item]);
    } else {
      // mode === 'next'
      const list = nextSourcesFor(activeChatId);
      nextSourcesByChat.set(activeChatId, [...list, item]);
    }
    renderActiveSources();
    hidePicker();
  } catch (e) {
    row.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
}

function setActiveChat(id) {
  activeChatId = id;
  chatMessageHistory = [];
  if (id == null) {
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  } else {
    localStorage.setItem(ACTIVE_CHAT_KEY, String(id));
  }
  hideRename();
  hidePicker();
  renderChatSelect();
  renderChatTools();
  renderChatBody();
  loadActiveSources();
  if (id != null) loadChatMessages();
}

async function loadChats() {
  [chatList, archivedChats] = await Promise.all([
    window.revival.chats.list(),
    window.revival.chats.listArchived(),
  ]);
  renderArchivedChats();
  // Restore the previously active chat if it still exists; else fall back to
  // the first chat, or none when the list is empty.
  const saved = Number(localStorage.getItem(ACTIVE_CHAT_KEY));
  const stillExists = chatList.some((c) => c.id === saved);
  const next = stillExists ? saved : chatList.length ? chatList[0].id : null;
  setActiveChat(next);
}

// --- Inline rename ---------------------------------------------------------
function showRename() {
  const active = chatList.find((c) => c.id === activeChatId);
  if (!active) return;
  chatRenameInput.value = active.title;
  chatRenameRow.hidden = false;
  chatTools.hidden = true;
  chatRenameInput.focus();
  chatRenameInput.select();
}

function hideRename() {
  chatRenameRow.hidden = true;
  chatTools.hidden = false;
}

chatToggle.addEventListener('click', () =>
  setChatOpen(!chatDrawer.classList.contains('open'))
);
chatClose.addEventListener('click', () => setChatOpen(false));
chatExpand.addEventListener('click', () =>
  setChatExpanded(!chatDrawer.classList.contains('expanded'))
);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && chatDrawer.classList.contains('open')) {
    setChatOpen(false);
  }
});

chatSelect.addEventListener('change', () => {
  setActiveChat(Number(chatSelect.value));
});

chatNewBtn.addEventListener('click', async () => {
  chatNewBtn.disabled = true;
  try {
    const created = await window.revival.chats.create({
      title: `Chat ${chatList.length + 1}`,
    });
    chatList.push(created);
    setActiveChat(created.id);
  } finally {
    chatNewBtn.disabled = false;
  }
});

chatAttachBtn.addEventListener('click', () => {
  if (chatSourcePicker.hidden) {
    showPicker();
  } else {
    hidePicker();
  }
});

// P40 — Send message + receive Claude's response.
chatComposer.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (activeChatId == null || _sendInProgress) return;

  const text = chatInput.value.trim();
  if (!text) return;

  _sendInProgress = true;
  chatSend.disabled = true;
  chatInput.disabled = true;

  // Clear composer and next-message-only sources/documents.
  chatInput.value = '';
  const hadNextSrcs = nextSourcesFor(activeChatId).length > 0;
  const hadNextDocs = nextDocsFor(activeChatId).length > 0;
  const hadNextCanon = nextCanonFor(activeChatId).length > 0;
  const hadNextChars = nextCharsFor(activeChatId).length > 0;
  const hadNextEps = nextEpisodesFor(activeChatId).length > 0;
  if (hadNextSrcs) nextSourcesByChat.set(activeChatId, []);
  if (hadNextDocs) nextDocsByChat.set(activeChatId, []);
  if (hadNextCanon) nextCanonByChat.set(activeChatId, []);
  if (hadNextChars) nextCharsByChat.set(activeChatId, []);
  if (hadNextEps) nextEpisodesByChat.set(activeChatId, []);
  if (hadNextSrcs || hadNextDocs || hadNextCanon || hadNextChars || hadNextEps) renderActiveSources();
  // Collapse preview so it doesn't show a stale payload.
  _previewOpen = false;
  chatPreviewWrap.hidden = true;
  chatPreviewBtn.textContent = 'Preview';

  // Clear cached project rules so the real send always uses the latest.
  _cachedProjectRules = null;

  // Show the user's message immediately (optimistic).
  _appendMsgEl('user', text);

  // Build API messages from history + current turn (archived messages excluded from context).
  const history = chatMessageHistory.filter((m) => !m.is_archived).map((m) => ({ role: m.role, content: m.content }));
  history.push({ role: 'user', content: text });

  // Persist the user turn.
  try {
    const saved = await window.revival.chatMessages.add(activeChatId, 'user', text);
    chatMessageHistory.push(saved);
  } catch (err) {
    _appendErrorEl(`Could not save message: ${err.message || err}`);
    _sendInProgress = false;
    chatSend.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
    return;
  }

  // Show thinking indicator while waiting for Claude.
  const thinkingEl = _appendThinkingEl();

  let responseText;
  let proposalsCreated = [];
  try {
    const systemPrompt = await buildSystemPrompt();
    const result = await window.revival.claude.send(
      history, systemPrompt, chatModelSelect.value, activeChatId
    );
    // result is { text, proposalsCreated } (P41). Accept plain string for safety.
    if (result && typeof result === 'object') {
      responseText = result.text || '';
      proposalsCreated = Array.isArray(result.proposalsCreated) ? result.proposalsCreated : [];
    } else {
      responseText = String(result || '');
    }
  } catch (apiErr) {
    thinkingEl.remove();
    // Strip the Electron IPC wrapper ("Error invoking remote method '...': ") for readability.
    const rawMsg = apiErr.message || 'Claude API error';
    const cleanMsg = rawMsg.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
    _appendErrorEl(cleanMsg);
    _sendInProgress = false;
    chatSend.disabled = false;
    chatInput.disabled = false;
    chatInput.focus();
    return;
  }

  thinkingEl.remove();
  _appendMsgEl('assistant', responseText);

  // P41 — show a proposal notification card for each staged proposal.
  for (const p of proposalsCreated) {
    _appendProposalCard(p);
  }

  // Persist the assistant turn.
  try {
    const saved = await window.revival.chatMessages.add(activeChatId, 'assistant', responseText);
    chatMessageHistory.push(saved);
  } catch (err) {
    console.error('[chat] could not save assistant message:', err);
  }

  _sendInProgress = false;
  chatSend.disabled = false;
  chatInput.disabled = false;
  chatInput.focus();
});

// P39 — Request preview: assembles the exact Claude API payload from the
// current composer state (user message + Project Rules + active sources) and
// displays it in a collapsible panel above the composer. No API call is made.
// Project Rules are fetched once per open and cached for the session; they
// change only when the user saves in Settings.
let _cachedProjectRules = null;
let _previewOpen = false;

async function buildPreviewPayload() {
  // Fetch project rules once per session (cleared on actual send).
  if (_cachedProjectRules === null) {
    try {
      _cachedProjectRules = (await window.revival.settings.getProjectRules()) || '';
    } catch {
      _cachedProjectRules = '';
    }
  }

  const userText = chatInput.value;
  const keptSrcs = activeSources;
  const nextSrcs = activeChatId != null ? nextSourcesFor(activeChatId) : [];
  const allSrcs = [...keptSrcs, ...nextSrcs];
  const keptDocs = activeDocuments;
  const nextDocs = activeChatId != null ? nextDocsFor(activeChatId) : [];
  const allDocs = [...keptDocs, ...nextDocs];
  const keptCanon = activeCanonEntries;
  const nextCanon = activeChatId != null ? nextCanonFor(activeChatId) : [];
  const allCanon = [...keptCanon, ...nextCanon];
  const keptChars = activeCharEntries;
  const nextChars = activeChatId != null ? nextCharsFor(activeChatId) : [];
  const allChars = [...keptChars, ...nextChars];
  const keptEps = activeEpisodeEntries;
  const nextEps = activeChatId != null ? nextEpisodesFor(activeChatId) : [];
  const allEps = [...keptEps, ...nextEps];

  // Build the system prompt the same way the real send does. This matches what
  // will actually be sent to Claude.
  const systemParts = [];
  if (_cachedProjectRules) systemParts.push(_cachedProjectRules);
  if (allSrcs.length) {
    const sections = allSrcs.map((s) => {
      const mode = nextSrcs.includes(s) ? ' (next message only)' : ' (keep active)';
      return `### ${s.title}${mode}\n\n${s.body || '(no content)'}`;
    });
    systemParts.push(`## Source Material\n\n${sections.join('\n\n---\n\n')}`);
  }
  if (allDocs.length) {
    const sections = allDocs.map((d) => {
      const mode = nextDocs.includes(d) ? ' (next message only)' : ' (keep active)';
      return `### ${d.title}${mode}\n\n${d.body || '(no content)'}`;
    });
    systemParts.push(`## Documents\n\n${sections.join('\n\n---\n\n')}`);
  }
  if (allCanon.length) {
    const sections = allCanon.map((c) => {
      const mode = nextCanon.includes(c) ? ' (next message only)' : ' (keep active)';
      return `### ${c.title} [${c.entry_type}${c.locked ? ' · locked' : ''}]${mode}\n\n${c.body || '(no content)'}`;
    });
    systemParts.push(`## Canon Bible\n\n${sections.join('\n\n---\n\n')}`);
  }
  if (allChars.length) {
    const sections = allChars.map((c) => {
      const mode = nextChars.includes(c) ? ' (next message only)' : ' (keep active)';
      return `### ${c.title}${mode}\n\n${c.body || '(no content)'}`;
    });
    systemParts.push(`## Characters\n\n${sections.join('\n\n---\n\n')}`);
  }
  if (allEps.length) {
    const sections = allEps.map((ep) => {
      const mode = nextEps.includes(ep) ? ' (next message only)' : ' (keep active)';
      return `### ${ep.title}${mode}\n\n${ep.body || '(no content)'}`;
    });
    systemParts.push(`## Episodes\n\n${sections.join('\n\n---\n\n')}`);
  }
  const systemPrompt = systemParts.join('\n\n');

  // Messages: conversation history + current draft.
  const messages = chatMessageHistory.map((m) => ({ role: m.role, content: m.content }));
  if (userText.trim()) {
    messages.push({ role: 'user', content: userText });
  }

  const payload = {
    model: chatModelSelect.value,
    max_tokens: 32768,
    tools: ['propose_canon_entry (P41 — see main.js for full schema)'],
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages,
  };

  return JSON.stringify(payload, null, 2);
}

async function refreshPreview() {
  if (!_previewOpen) return;
  chatPreviewBody.textContent = 'Building…';
  try {
    const payload = await buildPreviewPayload();
    chatPreviewBody.textContent = payload;
  } catch (err) {
    console.error('[preview] build error:', err);
    chatPreviewBody.textContent = `Error: ${err.message || err}`;
  }
}

chatPreviewBtn.addEventListener('click', async () => {
  try {
    _previewOpen = !_previewOpen;
    chatPreviewWrap.hidden = !_previewOpen;
    chatPreviewBtn.textContent = _previewOpen ? 'Hide preview' : 'Preview';
    if (_previewOpen) {
      await refreshPreview();
    }
  } catch (err) {
    console.error('[preview] click handler error:', err);
    chatPreviewBody.textContent = `Preview error: ${err.message || err}`;
    chatPreviewWrap.hidden = false;
  }
});

// Enter sends; Shift+Enter inserts a newline (standard chat convention).
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatComposer.requestSubmit();
  }
});

// Live-update preview as user types.
chatInput.addEventListener('input', () => { if (_previewOpen) refreshPreview(); });

chatRenameBtn.addEventListener('click', showRename);
chatRenameCancel.addEventListener('click', hideRename);

chatRenameRow.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = chatRenameInput.value.trim();
  if (!title || activeChatId == null) return;
  const updated = await window.revival.chats.rename(activeChatId, { title });
  const idx = chatList.findIndex((c) => c.id === activeChatId);
  if (idx !== -1) chatList[idx] = updated;
  hideRename();
  renderChatSelect();
  renderChatBody();
});

chatRenameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideRename();
});

chatArchiveBtn.addEventListener('click', async () => {
  if (activeChatId == null) return;
  chatArchiveBtn.disabled = true;
  try {
    await window.revival.chats.archive(activeChatId);
    // Reload rebuilds both lists and reselects a remaining active chat (or none).
    await loadChats();
  } finally {
    renderChatTools();
  }
});

// Route entire chat to a workspace — builds a transcript entry and navigates.
chatRouteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  chatRoutePicker.hidden = !chatRoutePicker.hidden;
});

document.addEventListener('click', (e) => {
  if (!chatRoutePicker.hidden && !chatRoutePicker.contains(e.target) && e.target !== chatRouteBtn) {
    chatRoutePicker.hidden = true;
  }
});

chatRoutePicker.addEventListener('click', async (e) => {
  const btn = e.target.closest('.chat-route-dest');
  if (!btn || activeChatId == null) return;
  chatRoutePicker.hidden = true;

  const apiName = btn.dataset.api;
  const destLabel = btn.dataset.label;
  const chat = chatList.find((c) => c.id === activeChatId);
  const chatTitle = chat ? chat.title : 'Chat';

  const lines = chatMessageHistory
    .filter((m) => !m.is_archived)
    .map((m) => `${m.role === 'user' ? 'You' : 'Claude'}: ${m.content}`);
  if (lines.length === 0) return;

  const title = chatTitle;
  const body = `${lines.join('\n\n')}\n\n— From chat: "${chatTitle}"`;

  chatRouteBtn.disabled = true;
  try {
    if (apiName === 'canonProposals') {
      await window.revival.canonProposals.createFromExtract({
        title,
        body,
        source_kind: 'chat',
        source_entry_id: activeChatId,
      });
    } else {
      await window.revival[apiName].create({ title, body });
    }
    showRoutedToast(destLabel);
  } finally {
    chatRouteBtn.disabled = false;
    renderChatTools();
  }
});

setChatExpanded(localStorage.getItem(CHAT_EXPANDED_KEY) === '1');

// Restore saved model (default Sonnet).
const _savedModel = localStorage.getItem(CHAT_MODEL_KEY);
if (_savedModel && chatModelSelect.querySelector(`option[value="${_savedModel}"]`)) {
  chatModelSelect.value = _savedModel;
}
chatModelSelect.addEventListener('change', () => {
  localStorage.setItem(CHAT_MODEL_KEY, chatModelSelect.value);
  if (_previewOpen) refreshPreview();
});

loadChats();

// Sticky Panic Export button (P21): same action as the Settings button. Gives
// brief in-button feedback; the main process opens the export folder in Finder.
const panicBtn = document.getElementById('panic-export');
panicBtn.addEventListener('click', async () => {
  panicBtn.disabled = true;
  panicBtn.textContent = '…';
  try {
    const res = await window.revival.panic.export();
    panicBtn.textContent = res.canceled ? '⚡' : '✓';
  } catch (err) {
    panicBtn.textContent = '✕';
    console.error('Panic Export failed:', err);
  }
  setTimeout(() => {
    panicBtn.textContent = '⚡';
    panicBtn.disabled = false;
  }, 1600);
});

// --- PCAP global quick-capture ----------------------------------------------
// Cmd/Ctrl+Shift+N from any workspace opens a minimal modal: pick a
// destination, then title + body, one click saves. Escape or Cancel dismisses
// without saving. The shortcut is in-app only (a window keydown, not an
// OS-global accelerator) so it never hijacks the system-wide combo. If the
// user is sitting on the destination workspace, its list refreshes via the
// existing PUI2 hook so the new entry shows immediately.
//
// Destinations map a display name (matching currentWorkspaceName) to the
// preload api key. All four targets share the {title, body} create shape.
const QC_DESTINATIONS = {
  'Unsorted': 'unsorted',
  'Brainstorm': 'brainstorm',
  'Open Questions': 'openQuestions',
  'Research': 'research',
};
const qcOverlay = document.getElementById('qc-overlay');
const qcForm = document.getElementById('qc-form');
const qcDest = document.getElementById('qc-dest');
const qcTitle = document.getElementById('qc-title');
const qcBody = document.getElementById('qc-body');
const qcSave = document.getElementById('qc-save');
const qcCancel = document.getElementById('qc-cancel');
const qcClose = document.getElementById('qc-close');
const qcError = document.getElementById('qc-error');
const qcTitleLabel = document.getElementById('qc-title-label');

// PPOL2-36: keep header in sync with the destination dropdown
qcDest.addEventListener('change', () => {
  if (qcTitleLabel) qcTitleLabel.textContent = `Quick capture → ${qcDest.value}`;
});

function openQuickCapture() {
  if (!qcOverlay.hidden) return;
  qcTitle.value = '';
  qcBody.value = '';
  setStatus(qcError, '');
  qcSave.disabled = false;
  qcOverlay.hidden = false;
  qcTitle.focus();
}

function closeQuickCapture() {
  qcOverlay.hidden = true;
}

qcCancel.addEventListener('click', closeQuickCapture);
qcClose.addEventListener('click', closeQuickCapture);

// Click on the dimmed backdrop (not the modal itself) dismisses.
qcOverlay.addEventListener('mousedown', (e) => {
  if (e.target === qcOverlay) closeQuickCapture();
});

qcForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (qcTitle.value.trim() === '') {
    setStatus(qcError, 'Title is required.');
    qcTitle.focus();
    return;
  }
  const destName = qcDest.value;
  const apiKey = QC_DESTINATIONS[destName] || 'unsorted';
  qcSave.disabled = true;
  try {
    await window.revival[apiKey].create({
      title: qcTitle.value,
      body: qcBody.value,
    });
    closeQuickCapture();
    // Reflect the new entry if its destination is the workspace on screen.
    if (currentWorkspaceName === destName && currentWorkspaceRefresh) {
      currentWorkspaceRefresh();
    }
  } catch (err) {
    setStatus(qcError, err.message || 'Could not save entry.');
    qcSave.disabled = false;
  }
});

window.addEventListener('keydown', (e) => {
  // Open: Cmd/Ctrl+Shift+N from anywhere in the app.
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault();
    openQuickCapture();
    return;
  }
  // Escape dismisses while the modal is open.
  if (e.key === 'Escape' && !qcOverlay.hidden) {
    e.preventDefault();
    closeQuickCapture();
  }
});

// --- P38 — Propose Canon Change modal (cp-overlay) -------------------------
// Singleton modal opened from Character/Episode detail panels. Source kind
// and entry id are stored in module-level vars on open.
let _cpSourceKind = null;
let _cpSourceEntryId = null;

const cpOverlay = document.getElementById('cp-overlay');
const cpForm = document.getElementById('cp-form');
const cpTitleInput = document.getElementById('cp-title');
const cpBodyInput = document.getElementById('cp-body');
const cpNoteInput = document.getElementById('cp-note');
const cpSubmitBtn = document.getElementById('cp-submit');
const cpCancelBtn = document.getElementById('cp-cancel');
const cpCloseBtn = document.getElementById('cp-close');
const cpError = document.getElementById('cp-error');
const cpSuccess = document.getElementById('cp-success');

// `overrides` (optional) lets a caller pre-fill the modal with something other
// than the source item's own title/body — e.g. PWLAB passes a selected snippet
// from a Writing Lab draft as the proposed body while keeping draft attribution.
function openProposalModal(item, sourceKind, overrides) {
  const ov = overrides || {};
  _cpSourceKind = sourceKind;
  _cpSourceEntryId = item.id;
  cpTitleInput.value = (ov.title != null ? ov.title : item.title) || '';
  cpBodyInput.value = (ov.body != null ? ov.body : item.body) || '';
  cpNoteInput.value = '';
  setStatus(cpError, '');
  setStatus(cpSuccess, '');
  cpSubmitBtn.disabled = false;
  cpOverlay.hidden = false;
  cpTitleInput.focus();
  cpTitleInput.select();
}

function closeProposalModal() {
  cpOverlay.hidden = true;
  _cpSourceKind = null;
  _cpSourceEntryId = null;
}

cpCancelBtn.addEventListener('click', closeProposalModal);
cpCloseBtn.addEventListener('click', closeProposalModal);

cpOverlay.addEventListener('mousedown', (e) => {
  if (e.target === cpOverlay) closeProposalModal();
});

cpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = cpTitleInput.value.trim();
  if (!title) {
    setStatus(cpError, 'Title is required.');
    cpTitleInput.focus();
    return;
  }
  cpSubmitBtn.disabled = true;
  setStatus(cpError, '');
  try {
    const note = cpNoteInput.value.trim();
    await window.revival.canonProposals.createFromExtract({
      title,
      body: cpBodyInput.value.trim(),
      source_kind: _cpSourceKind,
      source_entry_id: _cpSourceEntryId,
      proposer_note: note || null,
    });
    setStatus(cpSuccess, 'Sent to Canon Review.');
    setTimeout(closeProposalModal, 1800);
  } catch (err) {
    setStatus(cpError, err.message || 'Could not send proposal.');
    cpSubmitBtn.disabled = false;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !cpOverlay.hidden) {
    e.preventDefault();
    closeProposalModal();
  }
});

// --- PSEARCH — global search bar + result overlay -------------------------
// Always-on top bar (index.html #topbar). Cmd/Ctrl+Shift+F focuses the input
// from anywhere; Escape closes the overlay. Filters narrow results without
// re-querying every keystroke — the input is debounced. Hits dispatch by
// source kind: entry workspaces open the popout, Canon Bible / Writing Lab
// route to the workspace, Chats open the chat drawer and switch the active
// chat, and Tag hits apply themselves as the tag filter instead of routing
// (tags aren't entries — they're a way of narrowing the search).
const SEARCH_PER_GROUP_LIMIT = 25;

const SEARCH_CANON_ENTRY_TYPES = [
  'character', 'season', 'episode', 'locked_scene', 'locked_line',
  'locked_decision', 'knowledge_state', 'timeline_event',
  'viral_phase', 'virus_rule', 'institution', 'location',
  'motif', 'theme', 'production_rule', 'principle', 'rewatch_beat',
  'relationship',
];
const SEARCH_CANON_STATUSES = [
  'draft', 'speculative', 'implied', 'provisional',
  'confirmed', 'retired', 'struck',
];
// Each option is {value, label}. value matches the db.search source kind,
// so the filter is passed straight through to the IPC call.
const SEARCH_WORKSPACE_FILTER_OPTIONS = [
  { value: 'unsorted',        label: 'Unsorted' },
  { value: 'source_material', label: 'Source Material' },
  { value: 'documents',       label: 'Documents' },
  { value: 'open_questions',  label: 'Open Questions' },
  { value: 'conflicts',       label: 'Conflicts' },
  { value: 'decisions',       label: 'Decisions' },
  { value: 'brainstorm',      label: 'Brainstorm' },
  { value: 'research',        label: 'Research' },
  { value: 'characters',      label: 'Characters' },
  { value: 'episodes',        label: 'Episodes' },
  { value: 'writing_lab',     label: 'Writing Lab' },
  { value: 'canon_entries',   label: 'Canon Bible' },
  { value: 'chats',           label: 'Chats' },
  { value: 'tags',            label: 'Tags' },
];
const SEARCH_KIND_TO_WORKSPACE = {
  unsorted: 'Unsorted',
  source_material: 'Source Material',
  documents: 'Documents',
  open_questions: 'Open Questions',
  conflicts: 'Conflicts',
  decisions: 'Decisions',
  brainstorm: 'Brainstorm',
  research: 'Research',
  characters: 'Characters',
  episodes: 'Episodes',
  writing_lab: 'Writing Lab',
  canon_entries: 'Canon Bible',
  chats: 'Chat',
};
// Workspaces wired into PUI2's popout. Other kinds route() instead.
// PPOL2b-11 — writing_lab added now that popout.js supports Writing Lab.
const SEARCH_POPOUT_KINDS = new Set([
  'unsorted', 'source_material', 'documents', 'open_questions',
  'conflicts', 'decisions', 'brainstorm', 'research',
  'characters', 'episodes', 'writing_lab',
]);

const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');
const searchResults = document.getElementById('search-results');
const searchFilterWorkspace = document.getElementById('search-filter-workspace');
const searchFilterType = document.getElementById('search-filter-type');
const searchFilterCanonStatus = document.getElementById('search-filter-canon-status');
const searchFilterLock = document.getElementById('search-filter-lock');
const searchFilterTagCombo = document.getElementById('search-filter-tag-combo');
const searchFilterTagTrigger = document.getElementById('search-filter-tag-trigger');
const searchFilterTagPopover = document.getElementById('search-filter-tag-popover');
const searchFilterTagSearch = document.getElementById('search-filter-tag-search');
const searchFilterTagList = document.getElementById('search-filter-tag-list');

// Tag filter state. searchTagLibrary is the full list from db.tags.listAll;
// searchTagSelectedId is the currently applied tag (null = "any tag").
// The combobox renders the library, filtered by searchFilterTagSearch's value.
let searchTagLibrary = [];
let searchTagSelectedId = null;

function fillSearchFilter(select, options, allLabel) {
  select.innerHTML = '';
  const head = document.createElement('option');
  head.value = '';
  head.textContent = allLabel;
  select.appendChild(head);
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
}

fillSearchFilter(searchFilterWorkspace, SEARCH_WORKSPACE_FILTER_OPTIONS, 'All sources');
fillSearchFilter(
  searchFilterType,
  SEARCH_CANON_ENTRY_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') })),
  'Any type'
);
fillSearchFilter(
  searchFilterCanonStatus,
  SEARCH_CANON_STATUSES.map((s) => ({ value: s, label: s })),
  'Any canon status'
);
fillSearchFilter(
  searchFilterLock,
  [{ value: 'locked', label: 'Locked' }, { value: 'unlocked', label: 'Unlocked' }],
  'Any lock state'
);

async function loadSearchTagFilter() {
  try {
    searchTagLibrary = await window.revival.tags.listAll();
  } catch {
    searchTagLibrary = [];
  }
  // Drop the selection if the tag was deleted elsewhere.
  if (
    searchTagSelectedId != null &&
    !searchTagLibrary.some((t) => t.id === searchTagSelectedId)
  ) {
    searchTagSelectedId = null;
  }
  renderSearchTagTrigger();
  if (!searchFilterTagPopover.hidden) renderSearchTagOptions();
}

function selectedSearchTag() {
  if (searchTagSelectedId == null) return null;
  return searchTagLibrary.find((t) => t.id === searchTagSelectedId) || null;
}

function renderSearchTagTrigger() {
  const sel = selectedSearchTag();
  searchFilterTagTrigger.textContent = sel ? sel.name : 'Any tag';
  searchFilterTagTrigger.title = sel ? `Filtering by tag: ${sel.name}` : 'Filter by tag';
}

function renderSearchTagOptions() {
  const q = searchFilterTagSearch.value.trim().toLowerCase();
  const matches = q
    ? searchTagLibrary.filter((t) => t.name.toLowerCase().includes(q))
    : searchTagLibrary.slice();

  searchFilterTagList.innerHTML = '';

  // "Any tag" entry is always shown at the top so the user can clear the
  // selection without leaving the popover. Highlighted when nothing is set.
  const anyBtn = document.createElement('button');
  anyBtn.type = 'button';
  anyBtn.className = 'search-filter-option';
  if (searchTagSelectedId == null) anyBtn.classList.add('active');
  anyBtn.textContent = 'Any tag';
  anyBtn.addEventListener('click', () => {
    searchTagSelectedId = null;
    closeSearchTagPopover();
    renderSearchTagTrigger();
    if (searchInput.value.trim()) runSearchNow();
  });
  searchFilterTagList.appendChild(anyBtn);

  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'search-filter-popover-empty';
    empty.textContent = 'No tags match.';
    searchFilterTagList.appendChild(empty);
    return;
  }

  for (const tag of matches) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-filter-option';
    btn.setAttribute('role', 'option');
    if (tag.id === searchTagSelectedId) btn.classList.add('active');
    const name = document.createElement('span');
    name.textContent = tag.name;
    btn.appendChild(name);
    if (tag.category) {
      const cat = document.createElement('span');
      cat.className = 'search-filter-option-cat';
      cat.textContent = tag.category;
      btn.appendChild(cat);
    }
    btn.addEventListener('click', () => {
      searchTagSelectedId = tag.id;
      closeSearchTagPopover();
      renderSearchTagTrigger();
      if (searchInput.value.trim()) runSearchNow();
    });
    searchFilterTagList.appendChild(btn);
  }
}

function openSearchTagPopover() {
  if (!searchFilterTagPopover.hidden) return;
  searchFilterTagPopover.hidden = false;
  searchFilterTagTrigger.setAttribute('aria-expanded', 'true');
  searchFilterTagSearch.value = '';
  renderSearchTagOptions();
  searchFilterTagSearch.focus();
}

function closeSearchTagPopover() {
  if (searchFilterTagPopover.hidden) return;
  searchFilterTagPopover.hidden = true;
  searchFilterTagTrigger.setAttribute('aria-expanded', 'false');
}

searchFilterTagTrigger.addEventListener('click', () => {
  if (searchFilterTagPopover.hidden) openSearchTagPopover();
  else closeSearchTagPopover();
});
searchFilterTagSearch.addEventListener('input', renderSearchTagOptions);
searchFilterTagSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSearchTagPopover();
    searchFilterTagTrigger.focus();
  }
});

loadSearchTagFilter();

let searchDebounce = null;
// Monotonic token so a slow in-flight query can't overwrite a fresher one.
let searchToken = 0;

function currentSearchParams() {
  return {
    q: searchInput.value,
    workspace: searchFilterWorkspace.value || null,
    tagId: searchTagSelectedId,
    entryType: searchFilterType.value || null,
    canonStatus: searchFilterCanonStatus.value || null,
    lockStatus: searchFilterLock.value || null,
  };
}

function closeSearchResults() {
  searchResults.hidden = true;
  searchResults.innerHTML = '';
}

async function runSearchNow() {
  const params = currentSearchParams();
  searchClear.hidden = !params.q;
  if (!params.q.trim()) {
    closeSearchResults();
    return;
  }
  const token = ++searchToken;
  let res;
  try {
    res = await window.revival.search.run(params);
  } catch (err) {
    if (token !== searchToken) return;
    searchResults.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'search-empty';
    p.textContent = 'Search failed: ' + ((err && err.message) || String(err));
    searchResults.appendChild(p);
    searchResults.hidden = false;
    return;
  }
  if (token !== searchToken) return;
  renderSearchResults(res);
}

function scheduleSearch() {
  if (searchDebounce) clearTimeout(searchDebounce);
  searchDebounce = setTimeout(runSearchNow, 160);
}

function renderSearchResults({ groups }) {
  searchResults.innerHTML = '';
  searchResults.hidden = false;
  if (!groups || groups.length === 0) {
    const p = document.createElement('div');
    p.className = 'search-empty';
    p.textContent = 'No matches.';
    searchResults.appendChild(p);
    return;
  }
  for (const group of groups) {
    const wrap = document.createElement('div');
    wrap.className = 'search-group';
    const head = document.createElement('div');
    head.className = 'search-group-head';
    const label = document.createElement('span');
    label.className = 'search-group-label';
    label.textContent = group.label;
    const count = document.createElement('span');
    count.className = 'search-group-count';
    const isCapped = group.hits.length >= SEARCH_PER_GROUP_LIMIT;
    count.textContent = `${group.hits.length}${isCapped ? '+' : ''}`;
    head.appendChild(label);
    head.appendChild(count);
    wrap.appendChild(head);
    for (const hit of group.hits) wrap.appendChild(renderSearchHit(group, hit));
    searchResults.appendChild(wrap);
  }
}

function renderSearchHit(group, hit) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'search-hit';
  btn.setAttribute('role', 'option');
  const title = document.createElement('div');
  title.className = 'search-hit-title';
  const titleText = document.createElement('span');
  titleText.textContent = hit.title;
  title.appendChild(titleText);
  if (group.kind === 'canon_entries') {
    if (hit.locked) {
      const lock = document.createElement('span');
      lock.className = 'search-hit-badge';
      lock.title = 'Locked';
      lock.textContent = '🔒';
      title.appendChild(lock);
    }
    if (hit.entry_type) {
      const type = document.createElement('span');
      type.className = 'search-hit-badge';
      type.textContent = String(hit.entry_type).replace(/_/g, ' ');
      title.appendChild(type);
    }
    if (hit.canon_status) {
      const stat = document.createElement('span');
      stat.className = 'search-hit-badge';
      stat.textContent = hit.canon_status;
      title.appendChild(stat);
    }
  } else if (group.kind === 'tags' && hit.is_seed) {
    const seed = document.createElement('span');
    seed.className = 'search-hit-badge';
    seed.textContent = 'seeded';
    title.appendChild(seed);
  }
  btn.appendChild(title);
  if (hit.snippet) {
    const snip = document.createElement('div');
    snip.className = 'search-hit-snippet';
    snip.textContent = hit.snippet;
    btn.appendChild(snip);
  } else if (group.kind === 'tags' && hit.category) {
    const meta = document.createElement('div');
    meta.className = 'search-hit-meta';
    meta.textContent = hit.category;
    btn.appendChild(meta);
  }
  btn.addEventListener('click', () => openSearchHit(group, hit));
  return btn;
}

function openSearchHit(group, hit) {
  if (group.kind === 'tags') {
    // Tags aren't entries — applying them as a filter is the click action.
    searchTagSelectedId = hit.id;
    renderSearchTagTrigger();
    runSearchNow();
    searchInput.focus();
    return;
  }
  const workspace = SEARCH_KIND_TO_WORKSPACE[group.kind];
  if (!workspace) return;
  closeSearchResults();
  if (group.kind === 'chats') {
    setChatOpen(true);
    setActiveChat(hit.id);
    return;
  }
  if (SEARCH_POPOUT_KINDS.has(group.kind)) {
    window.revival.popout.open(workspace, hit.id);
    return;
  }
  // PPOL2b-26 — Canon Bible: route with the entry id so the page scrolls to
  // the matched entry. Writing Lab: route to workspace (editor opens on demand).
  route(workspace, group.kind === 'canon_entries' ? hit.id : undefined);
}

searchInput.addEventListener('input', () => {
  searchClear.hidden = !searchInput.value;
  scheduleSearch();
});
searchInput.addEventListener('focus', () => {
  if (searchInput.value.trim()) runSearchNow();
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.hidden = true;
  closeSearchResults();
  searchInput.focus();
});
for (const sel of [
  searchFilterWorkspace,
  searchFilterType,
  searchFilterCanonStatus,
  searchFilterLock,
]) {
  sel.addEventListener('change', () => {
    if (searchInput.value.trim()) runSearchNow();
  });
}

// Outside-click dismiss for the overlay and the tag popover. The result
// overlay closes only when the click leaves the topbar entirely; the tag
// popover closes whenever the click lands outside of it (including on
// other filters in the same bar — they're not part of the popover).
document.addEventListener('mousedown', (e) => {
  const topbar = document.getElementById('topbar');
  if (!searchResults.hidden && topbar && !topbar.contains(e.target)) {
    closeSearchResults();
  }
  if (
    !searchFilterTagPopover.hidden &&
    !searchFilterTagPopover.contains(e.target) &&
    e.target !== searchFilterTagTrigger
  ) {
    closeSearchTagPopover();
  }
});

// Cmd/Ctrl+Shift+F focuses the bar from anywhere; Escape dismisses the
// overlay without clearing the query so the user can adjust filters and
// reopen with the same term.
window.addEventListener('keydown', (e) => {
  if (
    (e.metaKey || e.ctrlKey) &&
    e.shiftKey &&
    (e.key === 'f' || e.key === 'F')
  ) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
    if (searchInput.value.trim()) runSearchNow();
    return;
  }
  if (e.key === 'Escape') {
    if (!searchFilterTagPopover.hidden) {
      e.preventDefault();
      closeSearchTagPopover();
      searchFilterTagTrigger.focus();
      return;
    }
    if (!searchResults.hidden) {
      e.preventDefault();
      closeSearchResults();
      searchInput.blur();
    }
  }
});

// PTAG allows tag creation from any entry's picker, so the filter list goes
// stale whenever another window writes. Reuse the popout signal as a cheap
// refresh trigger — listAll is small.
window.revival.popout.onChanged(() => loadSearchTagFilter());

// P46-A / PFLAN-EXPAND — Cmd+Shift+A opens the Flanagan Filter panel for the
// currently-active entry in any workspace that supports it. _ffOpenFilter is
// set by mountFlanaganFilter each time a filter panel is mounted.
window.addEventListener('keydown', (e) => {
  if (
    (e.metaKey || e.ctrlKey) &&
    e.shiftKey &&
    (e.key === 'a' || e.key === 'A') &&
    _ffOpenFilter
  ) {
    e.preventDefault();
    _ffOpenFilter();
  }
});

// PUNDO — Cmd+Z to undo the last destructive action (archive/delete).
// Skipped when focus is inside a text input so native text undo still works.
window.addEventListener('keydown', async (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || (e.key !== 'z' && e.key !== 'Z')) return;
  const tag = document.activeElement ? document.activeElement.tagName : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
  const action = UndoStack.pop();
  if (!action) return;
  e.preventDefault();
  await performUndo(action);
});

// PUNDO — global undo available pill in the bottom-right corner.
// Appended to body (not #content) so route() clears don't remove it.
const _undoPill = document.createElement('div');
_undoPill.id = 'undo-pill';
_undoPill.hidden = true;
_undoPill.textContent = '⌘Z  Undo available';
document.body.appendChild(_undoPill);
UndoStack.onChange((count) => { _undoPill.hidden = count === 0; });

// PKEY — command palette (Cmd/Ctrl+K) ----------------------------------------
// Spotlight-style jump palette. Lists workspaces + recent entries. Keyboard-
// navigable with arrow keys and Tab; Enter activates; Escape closes.

const palOverlay = document.getElementById('pal-overlay');
const palInput = document.getElementById('pal-input');
const palResults = document.getElementById('pal-results');

let _palActiveIdx = -1;

const NAV_ICONS_PAL = NAV_ICONS; // reuse the workspace icon map

function _palItems(query) {
  const q = (query || '').trim().toLowerCase();
  const items = [];

  // Recent entries (session-scoped; shown first when no query, or filtered)
  const recents = getRecentlyViewed();
  for (const r of recents) {
    if (!q || r.title.toLowerCase().includes(q) || r.workspace.toLowerCase().includes(q)) {
      items.push({ kind: 'entry', icon: NAV_ICONS_PAL[r.workspace] || '•', label: r.title, sub: r.workspace, workspace: r.workspace, entryId: r.id, section: 'Recent' });
    }
  }

  // Workspaces
  for (const ws of WORKSPACES) {
    if (!q || ws.toLowerCase().includes(q)) {
      items.push({ kind: 'workspace', icon: NAV_ICONS_PAL[ws] || '•', label: ws, sub: '', workspace: ws, section: 'Workspaces' });
    }
  }

  return items;
}

function _palRender(query) {
  const items = _palItems(query);
  palResults.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'pal-empty';
    empty.textContent = 'No results';
    palResults.appendChild(empty);
    _palActiveIdx = -1;
    return;
  }

  let currentSection = null;
  items.forEach((item, idx) => {
    if (item.section !== currentSection) {
      currentSection = item.section;
      const label = document.createElement('div');
      label.className = 'pal-section-label';
      label.textContent = currentSection;
      palResults.appendChild(label);
    }
    const el = document.createElement('div');
    el.className = 'pal-item';
    el.setAttribute('role', 'option');
    el.dataset.idx = idx;
    el.innerHTML = `<span class="pal-item-icon" aria-hidden="true">${item.icon}</span><span class="pal-item-label">${item.label}</span>${item.sub ? `<span class="pal-item-sub">${item.sub}</span>` : ''}`;
    el.addEventListener('mousedown', (e) => { e.preventDefault(); _palActivate(idx); });
    el.addEventListener('mousemove', () => _palSetActive(idx));
    palResults.appendChild(el);
  });

  _palSetActive(0);
}

function _palSetActive(idx) {
  const els = palResults.querySelectorAll('.pal-item');
  if (!els.length) { _palActiveIdx = -1; return; }
  idx = Math.max(0, Math.min(idx, els.length - 1));
  _palActiveIdx = idx;
  els.forEach((el, i) => el.setAttribute('data-active', i === idx ? 'true' : 'false'));
  // Scroll into view without jerking the viewport.
  const target = els[idx];
  if (target) target.scrollIntoView({ block: 'nearest' });
}

function _palActivate(idx) {
  const items = _palItems(palInput.value);
  const item = items[idx];
  if (!item) return;
  closePalette();
  if (item.kind === 'entry') {
    route(item.workspace, item.entryId);
  } else {
    route(item.workspace);
  }
}

function openPalette() {
  palInput.value = '';
  palOverlay.hidden = false;
  _palRender('');
  palInput.focus();
}

function closePalette() {
  palOverlay.hidden = true;
  _palActiveIdx = -1;
}

palInput.addEventListener('input', () => _palRender(palInput.value));

palInput.addEventListener('keydown', (e) => {
  const items = palResults.querySelectorAll('.pal-item');
  if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    _palSetActive(_palActiveIdx + 1);
  } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
    e.preventDefault();
    _palSetActive(_palActiveIdx - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (_palActiveIdx >= 0) _palActivate(_palActiveIdx);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  }
});

palOverlay.addEventListener('mousedown', (e) => {
  if (e.target === palOverlay) closePalette();
});

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (palOverlay.hidden) {
      openPalette();
    } else {
      closePalette();
    }
  }
  if (e.key === 'Escape' && !palOverlay.hidden) {
    e.preventDefault();
    closePalette();
  }
});

route('Home');
