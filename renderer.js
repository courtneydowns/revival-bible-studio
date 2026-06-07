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

// P36 — cross-workspace attachment section (interactive, Characters/Episodes only).
const CWA_HOST_KINDS = new Set(['characters', 'episodes']);
const CWA_SOURCE_KINDS = [
  { kind: 'decisions',      label: 'Decisions' },
  { kind: 'open_questions', label: 'Open Questions' },
  { kind: 'conflicts',      label: 'Conflicts' },
  { kind: 'brainstorm',     label: 'Brainstorm' },
  { kind: 'research',       label: 'Research' },
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

    btn.addEventListener('click', () => {
      selectedId = item.id;
      renderList();
      renderDetail();
    });
    return btn;
  }

  // PTAG — AND match: the item must carry every selected filter tag.
  // (makeEntryWorkspace instance — used by all standard workspaces incl. Conflicts)
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

    // PPOL2-32: hide the rescan hint when there are no active conflict entries
    const hintEl = leftCol.querySelector('.conflict-rescan-hint');
    if (hintEl) hintEl.style.display = activeItems.length === 0 ? 'none' : '';

    if (filteredActive.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tc-list-empty';
      empty.textContent = tagFilter.size
        ? 'No entries match the selected tag(s).'
        : 'No entries yet.';
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

  // --- Right panel: empty / create / view / edit -------------------------
  function showEmpty() {
    rightCol.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'tc-empty';
    const t = document.createElement('div');
    t.className = 'tc-empty-title';
    t.textContent = 'Nothing selected';
    const h = document.createElement('div');
    h.className = 'tc-empty-hint';
    h.textContent = activeItems.length === 0
      ? `Click “+ ${addLabel}” to create your first entry.`
      : 'Pick an entry on the left, or click + to add a new one.';
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

    form.append(titleInput, bodyInput, actionRow, formStatus, error);
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

    if (item.body) {
      const body = document.createElement('div');
      body.className = 'tc-detail-body';
      body.textContent = item.body;
      rightCol.appendChild(body);
      // PUI3: selecting text inside the body opens the extract-and-route menu.
      // Source attribution carries the originating workspace + entry title so
      // the routed entry remembers where the snippet came from.
      if (window.RevivalExtract && workspaceName) {
        window.RevivalExtract.attach(body, {
          workspace: workspaceName,
          id: item.id,
          title: item.title,
        });
      }
    }

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
      editBtn.addEventListener('click', () => showEdit(item));
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

    // PTAG — tag bar below the action row. Available on archived entries too
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
    prompt.textContent = 'Delete this entry? This cannot be undone.';

    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn-danger';
    yes.textContent = 'Delete';
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      try {
        await api.delete(item.id);
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

    saveBtn.addEventListener('click', async () => {
      if (titleEdit.value.trim() === '') return;
      saveBtn.disabled = true;
      try {
        await api.update(item.id, {
          title: titleEdit.value,
          body: bodyEdit.value,
        });
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

    rightCol.append(titleEdit, bodyEdit, status, err, actions);
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

// Chat workspace page: the chat itself lives in the global drawer, so this
// page's job is to explain that and offer a way in.
function renderChatPage(section) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-primary';
  btn.textContent = 'Open chat drawer';
  btn.addEventListener('click', () => setChatOpen(true));
  section.appendChild(btn);
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

  statusRow.append(statusPicker.wrap, certaintyPicker.wrap, reviewPicker.wrap, provLabel);
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
  for (const sel of [statusPicker.input, certaintyPicker.input, reviewPicker.input]) {
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
        await window.revival.canon.update(e.id, {
          title: payload.title,
          body: payload.body,
          canon_status: payload.canon_status,
          certainty: payload.certainty,
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
          list.appendChild(
            buildCanonCard(
              e,
              typeConfig,
              editMode ? onCanonTagChange : undefined,
              editMode ? activeActions : null,
              chainHelper,
              !editMode
            )
          );
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

    const showDeferredSection = filter === 'active';
    const statusFiltered = proposals.filter((p) => {
      if (filter === 'active')    return p.status === 'pending' || p.status === 'sent_back';
      if (filter === 'pending')   return p.status === 'pending';
      if (filter === 'sent_back') return p.status === 'sent_back';
      if (filter === 'deferred')  return p.status === 'deferred';
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
    if (p.source_kind) {
      chunks.push(`from ${sourceKindLabel(p.source_kind)}${p.source_entry_id ? ` #${p.source_entry_id}` : ''}`);
    }
    if (p.reviewed_at && (p.status === 'sent_back' || p.status === 'deferred')) {
      chunks.push(`${p.status === 'sent_back' ? 'Sent back' : 'Deferred'} ${new Date(p.reviewed_at).toLocaleString()}`);
    }
    meta.textContent = chunks.join(' · ');
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

    rightCol.appendChild(actions);
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
// How many Next Step cards show at once, and the hard ceiling on recent-activity
// cards. Both keep Home from ever needing to scroll; recent is also trimmed to
// whatever space is left after Next steps + Workspaces.
const SUGGESTION_CAP = 6;
const RECENT_CAP = 6;

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

    // --- Recent activity ---
    // Cards are clearable (the ✕ hides a card from view — it does NOT delete the
    // underlying entry) and Refresh re-pulls everything from the DB, bringing
    // cleared cards back. Clearing is view-only and in-memory, so leaving and
    // returning to Home also restores the full feed.
    let recentItems = summary.recent;
    const clearedRecentIds = new Set();
    const recentKey = (it) => `${it.route}:${it.id}`;

    // Header carries the label + Refresh; recentLabel points at it so the trim
    // logic shows/hides the whole header alongside the feed.
    const recentHead = document.createElement('div');
    recentHead.className = 'home-recent-head';
    recentLabel = recentHead;

    const recentTitle = document.createElement('span');
    recentTitle.className = 'home-section-label';
    recentTitle.textContent = 'Recent activity';
    recentHead.appendChild(recentTitle);

    const recentRefresh = document.createElement('button');
    recentRefresh.type = 'button';
    recentRefresh.className = 'suggestions-refresh';
    recentRefresh.textContent = '↻ Refresh';
    recentRefresh.title = 'Re-pull recent activity (restores cleared cards)';
    recentRefresh.addEventListener('click', () => refreshRecent(recentRefresh));
    recentHead.appendChild(recentRefresh);
    section.appendChild(recentHead);

    const feed = document.createElement('div');
    feed.className = 'home-recent';
    recentFeed = feed;
    section.appendChild(feed);

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
  renderPanicExport(section);
  renderCanonExport(section);
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
    const distinctTypes = [...new Set(
      currentEntries.map((e) => e.entry_type).filter(Boolean)
    )].sort();
    let previewTypeFilter = '';

    const previewFilterRow = document.createElement('div');
    previewFilterRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap;';
    if (distinctTypes.length > 0) {
      const fLabel = document.createElement('span');
      fLabel.style.cssText = 'font-size:0.85em;opacity:0.7;';
      fLabel.textContent = 'Show:';
      previewFilterRow.appendChild(fLabel);

      const allChip = document.createElement('button');
      allChip.type = 'button';
      allChip.className = 'status-badge cr-type-chip cr-type-chip-active';
      allChip.textContent = `All (${currentEntries.length})`;
      allChip.dataset.type = '';
      previewFilterRow.appendChild(allChip);

      for (const t of distinctTypes) {
        const count = currentEntries.filter((e) => e.entry_type === t).length;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'status-badge cr-type-chip';
        chip.textContent = `${t.replace(/_/g, ' ')} (${count})`;
        chip.dataset.type = t;
        previewFilterRow.appendChild(chip);
      }

      // Untyped chip if any entries lack a detected type
      const untypedCount = currentEntries.filter((e) => !e.entry_type).length;
      if (untypedCount > 0) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'status-badge cr-type-chip';
        chip.textContent = `untyped (${untypedCount})`;
        chip.dataset.type = '__untyped__';
        previewFilterRow.appendChild(chip);
      }

      previewFilterRow.addEventListener('click', (e) => {
        const chip = e.target.closest('.cr-type-chip');
        if (!chip) return;
        previewTypeFilter = chip.dataset.type;
        for (const c of previewFilterRow.querySelectorAll('.cr-type-chip')) {
          c.classList.toggle('cr-type-chip-active', c.dataset.type === previewTypeFilter);
        }
        renderCards();
      });
    }
    div.appendChild(previewFilterRow);

    const list = document.createElement('div');
    list.style.cssText =
      'border:1px solid var(--border,#444);border-radius:6px;max-height:420px;' +
      'overflow-y:auto;margin-bottom:10px;';

    function buildCard(entry) {
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
      return card;
    }

    function renderCards() {
      list.innerHTML = '';
      const filtered = previewTypeFilter === ''
        ? currentEntries
        : previewTypeFilter === '__untyped__'
          ? currentEntries.filter((e) => !e.entry_type)
          : currentEntries.filter((e) => e.entry_type === previewTypeFilter);
      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'placeholder';
        empty.style.cssText = 'padding:20px;text-align:center;';
        empty.textContent = 'No entries match this filter.';
        list.appendChild(empty);
      } else {
        for (let i = 0; i < filtered.length; i++) {
          const card = buildCard(filtered[i]);
          if (i === filtered.length - 1) card.style.borderBottom = 'none';
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

    btnRow.append(backBtn, stageBtn, status);
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
    let saving = false;
    let savedTitle = item ? item.title : '';
    let savedBody = item ? item.body || '' : '';
    const archivedAtStart = isArchived(item);

    const bar = document.createElement('div');
    bar.className = 'wl-editor-bar';

    const status = document.createElement('span');
    status.className = 'draft-status wl-status';
    const counter = document.createElement('span');
    counter.className = 'wl-counter';
    const spacer = document.createElement('span');
    spacer.className = 'wl-bar-spacer';

    // PWLAB — propose a canon change from this draft. Uses the selected text
    // (if any) as the proposed body, else the whole draft; attribution points
    // back at the draft. Hidden on archived drafts (read-only, can't flush).
    const proposeBtn = document.createElement('button');
    proposeBtn.type = 'button';
    proposeBtn.className = 'btn-secondary wl-propose-btn';
    proposeBtn.textContent = 'Propose Canon';

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn-secondary';
    archiveBtn.textContent = archivedAtStart ? 'Restore' : 'Archive';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';

    if (archivedAtStart) {
      bar.append(status, counter, spacer, archiveBtn, deleteBtn);
    } else {
      bar.append(status, counter, spacer, proposeBtn, archiveBtn, deleteBtn);
    }

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
    }

    rightCol.append(bar, titleInput, bodyInput);

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

    function updateCounter() {
      counter.textContent = `${wordCount(bodyInput.value)} word(s)`;
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
      saving = true;
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
      } finally {
        saving = false;
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
  }),
  'Source Material': makeEntryWorkspace({
    apiName: 'sourceMaterial',
    entityKind: 'source_material',
    draftPrefix: 'source_material',
    addLabel: 'Add Source',
    allowFileUpload: true,
    // Keep the Chat drawer's active-sources chips in sync when sources change
    // (delete cascades the attachment; archive flags it). loadActiveSources is
    // a hoisted declaration, so referencing it here before its definition is
    // fine — it only runs when a source is mutated at runtime.
    onChange: () => loadActiveSources(),
  }),
  'Documents': makeEntryWorkspace({
    apiName: 'documents',
    entityKind: 'documents',
    draftPrefix: 'documents',
    addLabel: 'Add Document',
  }),
  'Open Questions': makeEntryWorkspace({
    apiName: 'openQuestions',
    entityKind: 'open_questions',
    draftPrefix: 'open_questions',
    addLabel: 'Add Question',
  }),
  // Conflicts shares the lifecycle but is styled distinctly (red contradiction
  // accent + tailored labels) so it never reads like Open Questions.
  'Conflicts': makeEntryWorkspace({
    apiName: 'conflicts',
    entityKind: 'conflicts',
    draftPrefix: 'conflicts',
    addLabel: 'Log Conflict',
    sectionClass: 'ws-conflicts',
    titlePlaceholder: 'What contradicts what?',
    bodyPlaceholder: 'The two sides in tension, and where each comes from (optional)',
  }),
  'Decisions': makeEntryWorkspace({
    apiName: 'decisions',
    entityKind: 'decisions',
    draftPrefix: 'decisions',
    addLabel: 'Record Decision',
    titlePlaceholder: 'What was decided?',
    bodyPlaceholder: 'The decision, and why it was settled this way (optional)',
  }),
  'Brainstorm': makeEntryWorkspace({
    apiName: 'brainstorm',
    entityKind: 'brainstorm',
    draftPrefix: 'brainstorm',
    addLabel: 'Add Idea',
    titlePlaceholder: 'What is the idea?',
    bodyPlaceholder: 'Where it might go, what sparked it (optional)',
  }),
  // Research shares the lifecycle but is styled distinctly (blue source accent +
  // tailored labels) so it never reads like Brainstorm's open ideation.
  'Research': makeEntryWorkspace({
    apiName: 'research',
    entityKind: 'research',
    draftPrefix: 'research',
    addLabel: 'Add Research',
    sectionClass: 'ws-research',
    titlePlaceholder: 'What was researched?',
    bodyPlaceholder: 'Findings, and where they came from — source/link (optional)',
  }),
  // Characters (P26+P37): CRUD lifecycle + relational view.
  // P37 adds character relationship edges and the SVG graph via config hooks
  // so the base makeEntryWorkspace handles list/CRUD and the hooks inject
  // the relationships section + relational view toggle.
  'Characters': makeEntryWorkspace({
    apiName: 'characters',
    entityKind: 'characters',
    draftPrefix: 'characters',
    addLabel: 'Add Character',
    sectionClass: 'ws-characters',
    titlePlaceholder: 'Character name',
    bodyPlaceholder: 'Who they are — role, traits, arc, open threads (optional)',
    detailExtra(rightCol, item, archivedFlag) {
      if (!archivedFlag) {
        mountCharRelationships(rightCol, item.id);
        mountProposeCanonSection(rightCol, item, 'characters_workspace');
      }
    },
    leftColExtra(leftCol, rightCol, ctx) {
      setupCharRelationalView(leftCol, rightCol, ctx);
    },
  }),
  // Episodes (P27+P38): basic create/edit/delete/archive/restore on episode entries
  // (name + outline/scene list/beats/draft notes). P38 adds canon proposal button.
  'Episodes': makeEntryWorkspace({
    apiName: 'episodes',
    entityKind: 'episodes',
    draftPrefix: 'episodes',
    addLabel: 'Add Episode',
    sectionClass: 'ws-episodes',
    titlePlaceholder: 'Episode title',
    bodyPlaceholder: 'Outline, scene list, beats, draft notes (optional)',
    detailExtra(rightCol, item, archivedFlag) {
      if (!archivedFlag) mountProposeCanonSection(rightCol, item, 'episodes_workspace');
    },
  }),
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
  // PHOME: count badge for the three queue-style workspaces. Hidden until the
  // count is > 0 (refreshNavBadges manages visibility).
  if (NAV_BADGE_KEYS[name]) {
    const badge = document.createElement('span');
    badge.className = 'nav-badge';
    badge.style.display = 'none';
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
    el.textContent = n > 99 ? '99+' : String(n);
    el.style.display = n > 0 ? '' : 'none';
    el.title = `${n} ${n === 1 ? 'item' : 'items'}`;
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

const ACTIVE_CHAT_KEY = 'revival.chat.active';
const CHAT_EXPANDED_KEY = 'revival.chat.expanded';
let chatList = [];
let archivedChats = [];
let activeChatId = null;
// Keep-active sources for the current chat (persisted; loaded from SQLite).
let activeSources = [];
// "Next message only" sources (P19): ephemeral and per-chat, held in memory
// only so they never survive a send or a restart. Keyed by chat id → array of
// source objects, so switching chats keeps each chat's pending picks separate.
const nextSourcesByChat = new Map();
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
    chatMessages.appendChild(_buildMsgEl(msg.role, msg.content));
  }
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Build a single message element (user or assistant).
function _buildMsgEl(role, content) {
  const wrap = document.createElement('div');
  wrap.className = `chat-msg chat-msg-${role}`;
  const label = document.createElement('span');
  label.className = 'chat-msg-label';
  label.textContent = role === 'user' ? 'You' : 'Claude';
  const body = document.createElement('p');
  body.className = 'chat-msg-body';
  body.textContent = content;
  wrap.appendChild(label);
  wrap.appendChild(body);
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

// Build the system prompt: project rules + any attached sources.
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
  const parts = [];
  if (rules) parts.push(rules);
  if (allSrcs.length) {
    const sections = allSrcs.map(
      (s) => `### ${s.title}\n\n${s.body || '(no content)'}`
    );
    parts.push(`## Source Material\n\n${sections.join('\n\n---\n\n')}`);
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
// user knows exactly what Claude would draw on. Source Material is the only
// attachable type. Two modes:
//   • "keep active"        — persisted in SQLite, stays listed for the chat.
//   • "next message only"  — in-memory only, cleared on the next draft send.
// Every chip carries a one-click remove (P19). Composer enablement rides along
// here since it depends on whether a chat is active.
function nextSourcesFor(chatId) {
  return nextSourcesByChat.get(chatId) || [];
}

function buildSourceChip(src, mode) {
  const chip = document.createElement('span');
  chip.className = mode === 'next' ? 'source-chip chip-next' : 'source-chip';

  const title = document.createElement('span');
  title.className = 'chip-title';
  title.textContent = src.title;
  chip.appendChild(title);

  // A keep-active source archived after attaching stays active but is flagged.
  if (mode === 'keep' && src.archived_at) {
    const note = document.createElement('span');
    note.className = 'chip-archived';
    note.textContent = '(archived)';
    chip.appendChild(note);
  }

  if (mode === 'next') {
    const badge = document.createElement('span');
    badge.className = 'chip-mode';
    badge.textContent = 'next message only';
    chip.appendChild(badge);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'chip-remove';
  remove.textContent = '✕';
  remove.title = 'Remove source';
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
  if (activeSources.length === 0 && nextSources.length === 0) {
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
}

// One-click remove. Keep-active detaches in SQLite; next-message-only just
// drops from the in-memory list for the active chat.
async function removeSource(sourceId, mode) {
  if (activeChatId == null) return;
  if (mode === 'keep') {
    activeSources = await window.revival.chatSources.detach(
      activeChatId,
      sourceId
    );
    renderActiveSources();
    return;
  }
  const list = nextSourcesFor(activeChatId).filter((s) => s.id !== sourceId);
  nextSourcesByChat.set(activeChatId, list);
  renderActiveSources();
}

async function loadActiveSources() {
  if (activeChatId == null) {
    activeSources = [];
    renderActiveSources();
    return;
  }
  activeSources = await window.revival.chatSources.list(activeChatId);
  // Prune any next-message-only picks whose source was deleted elsewhere, so a
  // stale chip can't linger after the underlying source is gone.
  const next = nextSourcesByChat.get(activeChatId);
  if (next && next.length) {
    const allSources = await window.revival.sourceMaterial.list();
    const liveIds = new Set(allSources.map((s) => s.id));
    nextSourcesByChat.set(
      activeChatId,
      next.filter((s) => liveIds.has(s.id))
    );
  }
  renderActiveSources();
}

function hidePicker() {
  chatSourcePicker.hidden = true;
  chatSourcePicker.innerHTML = '';
}

// The picker lists Source Material only (no other types, no Context Packets),
// excluding sources already attached in either mode so the choices are valid.
// Each row offers both attach modes (P19): keep active vs. next message only.
async function showPicker() {
  if (activeChatId == null) return;
  const sources = await window.revival.sourceMaterial.list();
  const usedIds = new Set([
    ...activeSources.map((s) => s.id),
    ...nextSourcesFor(activeChatId).map((s) => s.id),
  ]);
  const available = sources.filter((s) => !usedIds.has(s.id));

  chatSourcePicker.innerHTML = '';
  if (available.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'picker-hint';
    hint.textContent = sources.length
      ? 'All Source Material is already attached to this chat.'
      : 'No Source Material yet. Add some in the Source Material workspace.';
    chatSourcePicker.appendChild(hint);
  } else {
    for (const src of available) {
      const row = document.createElement('div');
      row.className = 'picker-item';

      const title = document.createElement('span');
      title.className = 'picker-title';
      title.textContent = src.title;
      row.appendChild(title);

      const keepBtn = document.createElement('button');
      keepBtn.type = 'button';
      keepBtn.className = 'picker-mode-btn';
      keepBtn.textContent = 'Keep active';
      keepBtn.addEventListener('click', () => attachSource(src, 'keep', row));
      row.appendChild(keepBtn);

      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'picker-mode-btn';
      nextBtn.textContent = 'Next message only';
      nextBtn.addEventListener('click', () => attachSource(src, 'next', row));
      row.appendChild(nextBtn);

      chatSourcePicker.appendChild(row);
    }
  }
  chatSourcePicker.hidden = false;
}

// Attach a source in the chosen mode. Keep-active persists via SQLite;
// next-message-only is held in memory for the active chat only.
async function attachSource(src, mode, row) {
  if (activeChatId == null) return;
  row.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    if (mode === 'keep') {
      activeSources = await window.revival.chatSources.attach(
        activeChatId,
        src.id
      );
    } else {
      const list = nextSourcesFor(activeChatId);
      nextSourcesByChat.set(activeChatId, [...list, src]);
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

  // Clear composer and next-message-only sources.
  chatInput.value = '';
  if (nextSourcesFor(activeChatId).length) {
    nextSourcesByChat.set(activeChatId, []);
    renderActiveSources();
  }
  // Collapse preview so it doesn't show a stale payload.
  _previewOpen = false;
  chatPreviewWrap.hidden = true;
  chatPreviewBtn.textContent = 'Preview';

  // Clear cached project rules so the real send always uses the latest.
  _cachedProjectRules = null;

  // Show the user's message immediately (optimistic).
  _appendMsgEl('user', text);

  // Build API messages from history + current turn.
  const history = chatMessageHistory.map((m) => ({ role: m.role, content: m.content }));
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

  let response;
  try {
    const systemPrompt = await buildSystemPrompt();
    response = await window.revival.claude.send(history, systemPrompt);
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
  _appendMsgEl('assistant', response);

  // Persist the assistant turn.
  try {
    const saved = await window.revival.chatMessages.add(activeChatId, 'assistant', response);
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

  // Build the system prompt the same way the real send does: project rules +
  // source material. This matches what will actually be sent to Claude.
  const systemParts = [];
  if (_cachedProjectRules) systemParts.push(_cachedProjectRules);
  if (allSrcs.length) {
    const sections = allSrcs.map((s) => {
      const mode = nextSrcs.includes(s) ? ' (next message only)' : ' (keep active)';
      return `### ${s.title}${mode}\n\n${s.body || '(no content)'}`;
    });
    systemParts.push(`## Source Material\n\n${sections.join('\n\n---\n\n')}`);
  }
  const systemPrompt = systemParts.join('\n\n');

  // Messages: conversation history + current draft.
  const messages = chatMessageHistory.map((m) => ({ role: m.role, content: m.content }));
  if (userText.trim()) {
    messages.push({ role: 'user', content: userText });
  }

  const payload = {
    model: 'claude-opus-4-7',
    max_tokens: 8192,
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

setChatExpanded(localStorage.getItem(CHAT_EXPANDED_KEY) === '1');
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
const SEARCH_POPOUT_KINDS = new Set([
  'unsorted', 'source_material', 'documents', 'open_questions',
  'conflicts', 'decisions', 'brainstorm', 'research',
  'characters', 'episodes',
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
  // Canon Bible / Writing Lab: route to the workspace; entry selection is a
  // later phase (Canon Bible deep-link is on the P32+ track).
  route(workspace);
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

route('Home');
