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
    content(section);
  }

  return page;
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

// --- Shared entry workspace (create + list + edit/delete/archive/restore) ---
// Unsorted and Source Material share one lifecycle. `config` supplies the
// IPC namespace, the draft localStorage prefix, and the add-button label.
function makeEntryWorkspace(config) {
  const api = window.revival[config.apiName];
  const Drafts = makeDrafts(config.draftPrefix);
  const addLabel = config.addLabel;
  const finalizeHint = `Click “${addLabel}” to finalize.`;

  return function renderEntryWorkspace(section) {
  // Optional accent class lets a workspace look visibly distinct from the
  // others that share this template (e.g. Conflicts vs Open Questions).
  if (config.sectionClass) section.classList.add(config.sectionClass);

  // Create form
  const form = document.createElement('form');
  form.className = 'entry-form';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = config.titlePlaceholder || 'Title';
  titleInput.maxLength = 200;

  const bodyInput = document.createElement('textarea');
  bodyInput.placeholder = config.bodyPlaceholder || 'Notes (optional)';
  bodyInput.rows = 3;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = addLabel;
  submit.disabled = true;

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

  // Autosave the in-progress draft (preservation only; never finalizes).
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

  // Optional .txt upload (Source Material only). Reads the file in the renderer
  // and fills the fields below — the user still reviews and clicks the add
  // button to finalize, so nothing is stored without confirmation.
  let uploadRow = null;
  if (config.allowFileUpload) {
    uploadRow = document.createElement('div');
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
      fileInput.value = ''; // allow re-selecting the same file later
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
  }

  const list = document.createElement('div');
  list.className = 'entry-list';

  // Collapsed-by-default Archived section (no global Archive page).
  const archived = document.createElement('details');
  archived.className = 'archived-section';
  const archivedSummary = document.createElement('summary');
  archived.appendChild(archivedSummary);
  const archivedList = document.createElement('div');
  archivedList.className = 'entry-list';
  archived.appendChild(archivedList);

  function buildViewCard(item) {
    const card = document.createElement('div');
    card.className = 'entry-card';

    const t = document.createElement('div');
    t.className = 'entry-title';
    t.textContent = item.title;
    card.appendChild(t);

    if (item.body) {
      const b = document.createElement('div');
      b.className = 'entry-body';
      b.textContent = item.body;
      card.appendChild(b);
    }

    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent = `Added ${new Date(item.created_at).toLocaleString()}`;
    if (item.updated_at && item.updated_at !== item.created_at) {
      meta.textContent += ` · edited ${new Date(item.updated_at).toLocaleString()}`;
    }
    card.appendChild(meta);

    // A preserved draft (e.g. quit mid-edit) is shown but not yet finalized.
    const pendingDraft = Drafts.get(item.id);
    if (pendingDraft) {
      const badge = document.createElement('div');
      badge.className = 'draft-badge';
      badge.textContent = 'Unsaved draft preserved — not finalized.';
      card.appendChild(badge);
    }

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn-secondary';
    editBtn.textContent = pendingDraft ? 'Resume editing' : 'Edit';
    editBtn.addEventListener('click', () => {
      card.replaceWith(buildEditCard(item));
    });

    let discardBtn;
    if (pendingDraft) {
      discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.className = 'btn-secondary';
      discardBtn.textContent = 'Discard draft';
      discardBtn.addEventListener('click', () => {
        Drafts.clear(item.id);
        card.replaceWith(buildViewCard(item));
      });
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
      } catch (e) {
        archiveBtn.disabled = false;
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      showDeleteConfirm(card, actions, item);
    });

    actions.append(editBtn);
    if (discardBtn) actions.append(discardBtn);
    actions.append(archiveBtn, deleteBtn);
    card.appendChild(actions);

    return card;
  }

  // Read-only card for the collapsed Archived section: Restore or Delete.
  function buildArchivedCard(item) {
    const card = document.createElement('div');
    card.className = 'entry-card';

    const t = document.createElement('div');
    t.className = 'entry-title';
    t.textContent = item.title;
    card.appendChild(t);

    if (item.body) {
      const b = document.createElement('div');
      b.className = 'entry-body';
      b.textContent = item.body;
      card.appendChild(b);
    }

    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent = `Archived ${new Date(item.archived_at).toLocaleString()}`;
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn-primary';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', async () => {
      restoreBtn.disabled = true;
      try {
        await api.restore(item.id);
        await loadList();
      } catch (e) {
        restoreBtn.disabled = false;
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      showDeleteConfirm(card, actions, item);
    });

    actions.append(restoreBtn, deleteBtn);
    card.appendChild(actions);

    return card;
  }

  // Swap the card's action row for an inline "are you sure?" confirm.
  function showDeleteConfirm(card, actions, item) {
    const confirmRow = document.createElement('div');
    confirmRow.className = 'entry-actions confirm-row';

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
    no.addEventListener('click', () => {
      confirmRow.replaceWith(actions);
    });

    confirmRow.append(prompt, yes, no);
    actions.replaceWith(confirmRow);
  }

  function buildEditCard(item) {
    const card = document.createElement('div');
    card.className = 'entry-card';

    // Prefer a preserved draft (e.g. quit mid-edit) over the saved values.
    const draft = Drafts.get(item.id);
    const initial = draft || { title: item.title, body: item.body || '' };

    const titleEdit = document.createElement('input');
    titleEdit.type = 'text';
    titleEdit.maxLength = 200;
    titleEdit.value = initial.title;

    const bodyEdit = document.createElement('textarea');
    bodyEdit.rows = 3;
    bodyEdit.value = initial.body;

    const status = document.createElement('p');
    status.className = 'draft-status';

    const err = document.createElement('p');
    err.className = 'form-error';

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = 'Cancel';

    // Autosave the in-progress edit (preservation only; never finalizes).
    function saveEditDraft() {
      Drafts.set(item.id, { title: titleEdit.value, body: bodyEdit.value });
      setStatus(status, 'Draft autosaved — click Save to finalize.');
    }

    setStatus(
      status,
      draft
        ? 'Unsaved draft restored — click Save to finalize.'
        : ''
    );

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
      card.replaceWith(buildViewCard(item));
    });

    actions.append(saveBtn, cancelBtn);
    card.append(titleEdit, bodyEdit, status, err, actions);
    titleEdit.focus();
    return card;
  }

  async function loadList() {
    const [items, archivedItems] = await Promise.all([
      api.list(),
      api.listArchived(),
    ]);

    list.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'placeholder';
      empty.textContent = 'No entries yet. Add one above.';
      list.appendChild(empty);
    } else {
      for (const item of items) {
        list.appendChild(buildViewCard(item));
      }
    }

    archivedList.innerHTML = '';
    archivedSummary.textContent = `Archived (${archivedItems.length})`;
    archived.style.display = archivedItems.length === 0 ? 'none' : '';
    for (const item of archivedItems) {
      archivedList.appendChild(buildArchivedCard(item));
    }

    // Let a workspace react to its own changes elsewhere in the app. Source
    // Material uses this to refresh the Chat drawer's always-visible active
    // sources, so deleting a source (cascade-removes the attachment) or
    // archiving one (flags it) updates the chips live instead of going stale.
    if (config.onChange) config.onChange();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (titleInput.value.trim() === '') return;
    submit.disabled = true;
    try {
      await api.create({
        title: titleInput.value,
        body: bodyInput.value,
      });
      titleInput.value = '';
      bodyInput.value = '';
      Drafts.clear('new');
      setStatus(formStatus, '');
      await loadList();
    } catch (err) {
      error.textContent = err.message || 'Could not save entry.';
    } finally {
      submit.disabled = titleInput.value.trim() === '';
      titleInput.focus();
    }
  });

  if (uploadRow) form.append(uploadRow);
  form.append(titleInput, bodyInput, submit, formStatus, error);
  section.append(form, list, archived);
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
      num.className = 'count-number';
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

  renderPanicExport(section);
}

// --- Panic Export (P21) ----------------------------------------------------
// One click saves a complete copy of everything — the full database plus every
// Source Material entry as a text file — into a timestamped folder the user
// chooses. Copy-only: nothing in the app is deleted, archived, or finalized.
function renderPanicExport(section) {
  const block = document.createElement('div');
  block.className = 'entry-form settings-block';

  const heading = document.createElement('h2');
  heading.className = 'settings-heading';
  heading.textContent = 'Panic Export';

  const desc = document.createElement('p');
  desc.className = 'settings-desc';
  desc.textContent =
    'Save a complete copy of everything — the full database plus every Source ' +
    'Material entry as a text file — into a timestamped folder under ' +
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
          `Exported the database + ${res.sources} source file(s) to: ${res.folder}`
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

  const wrap = document.createElement('div');
  wrap.className = 'wl-wrap';
  section.appendChild(wrap);

  // --- Drafts list view ----------------------------------------------------
  async function showList() {
    wrap.innerHTML = '';

    const toolbar = document.createElement('div');
    toolbar.className = 'wl-toolbar';
    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'btn-primary';
    newBtn.textContent = '+ New draft';
    newBtn.addEventListener('click', () => openEditor(null));
    toolbar.appendChild(newBtn);
    wrap.appendChild(toolbar);

    const list = document.createElement('div');
    list.className = 'entry-list';
    wrap.appendChild(list);

    const archived = document.createElement('details');
    archived.className = 'archived-section';
    const archivedSummary = document.createElement('summary');
    archived.appendChild(archivedSummary);
    const archivedList = document.createElement('div');
    archivedList.className = 'entry-list';
    archived.appendChild(archivedList);
    wrap.appendChild(archived);

    let items, archivedItems;
    try {
      [items, archivedItems] = await Promise.all([api.list(), api.listArchived()]);
    } catch (e) {
      list.innerHTML = '';
      const err = document.createElement('p');
      err.className = 'placeholder';
      err.textContent = `Could not load drafts: ${e.message || e}`;
      list.appendChild(err);
      return;
    }

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'placeholder';
      empty.textContent = 'No drafts yet. Click “+ New draft” to start writing.';
      list.appendChild(empty);
    } else {
      for (const item of items) list.appendChild(buildDraftCard(item));
    }

    archivedSummary.textContent = `Archived (${archivedItems.length})`;
    archived.style.display = archivedItems.length === 0 ? 'none' : '';
    for (const item of archivedItems) {
      archivedList.appendChild(buildArchivedDraftCard(item));
    }
  }

  function snippet(body) {
    const oneLine = String(body || '').replace(/\s+/g, ' ').trim();
    return oneLine.length > 140 ? `${oneLine.slice(0, 140)}…` : oneLine;
  }

  function buildDraftCard(item) {
    const card = document.createElement('div');
    card.className = 'entry-card wl-card';

    const t = document.createElement('div');
    t.className = 'entry-title';
    t.textContent = item.title;
    card.appendChild(t);

    const body = snippet(item.body);
    if (body) {
      const b = document.createElement('div');
      b.className = 'entry-body';
      b.textContent = body;
      card.appendChild(b);
    }

    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent =
      `${wordCount(item.body)} word(s) · edited ` +
      new Date(item.updated_at).toLocaleString();
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn-primary';
    openBtn.textContent = 'Open';
    openBtn.addEventListener('click', () => openEditor(item));

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn-secondary';
    archiveBtn.textContent = 'Archive';
    archiveBtn.addEventListener('click', async () => {
      archiveBtn.disabled = true;
      try {
        await api.archive(item.id);
        await showList();
      } catch {
        archiveBtn.disabled = false;
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () =>
      showDraftDeleteConfirm(card, actions, item)
    );

    // Whole-card click also opens, except when a button was the target.
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openEditor(item);
    });

    actions.append(openBtn, archiveBtn, deleteBtn);
    card.appendChild(actions);
    return card;
  }

  function buildArchivedDraftCard(item) {
    const card = document.createElement('div');
    card.className = 'entry-card wl-card';

    const t = document.createElement('div');
    t.className = 'entry-title';
    t.textContent = item.title;
    card.appendChild(t);

    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent =
      `${wordCount(item.body)} word(s) · archived ` +
      new Date(item.archived_at).toLocaleString();
    card.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'entry-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'btn-primary';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', async () => {
      restoreBtn.disabled = true;
      try {
        await api.restore(item.id);
        await showList();
      } catch {
        restoreBtn.disabled = false;
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () =>
      showDraftDeleteConfirm(card, actions, item)
    );

    actions.append(restoreBtn, deleteBtn);
    card.appendChild(actions);
    return card;
  }

  function showDraftDeleteConfirm(card, actions, item) {
    const confirmRow = document.createElement('div');
    confirmRow.className = 'entry-actions confirm-row';

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
        await api.delete(item.id);
        await showList();
      } catch (e) {
        prompt.textContent = e.message || 'Could not delete draft.';
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

  // --- Single-draft editor view --------------------------------------------
  // Continuous autosave: edits are debounced and written straight to SQLite. A
  // brand-new draft has no row until the first non-empty autosave creates one,
  // so opening "+ New draft" and leaving without typing never clutters the list.
  function openEditor(item) {
    wrap.innerHTML = '';

    // Local editor state. `currentId` is null until a new draft's first save.
    let currentId = item ? item.id : null;
    let saveTimer = null;
    let saving = false;
    let savedTitle = item ? item.title : '';
    let savedBody = item ? item.body || '' : '';

    const bar = document.createElement('div');
    bar.className = 'wl-editor-bar';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn-secondary';
    backBtn.textContent = '← All drafts';

    const status = document.createElement('span');
    status.className = 'draft-status wl-status';

    const counter = document.createElement('span');
    counter.className = 'wl-counter';

    const spacer = document.createElement('span');
    spacer.className = 'wl-bar-spacer';

    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn-secondary';
    archiveBtn.textContent = 'Archive';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete';

    bar.append(backBtn, status, counter, spacer, archiveBtn, deleteBtn);

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

    wrap.append(bar, titleInput, bodyInput);

    function updateCounter() {
      counter.textContent = `${wordCount(bodyInput.value)} word(s)`;
    }
    updateCounter();
    setStatus(status, item ? 'Saved.' : 'New draft — autosaves as you type.');

    // Archive/Delete are meaningless until the draft actually exists.
    function syncDraftActions() {
      const exists = currentId != null;
      archiveBtn.disabled = !exists;
      deleteBtn.disabled = !exists;
    }
    syncDraftActions();

    // Write the current title/body to SQLite. Creates the row on first save of a
    // new draft; updates thereafter. Returns the persisted record (or null when
    // there is genuinely nothing to save yet).
    async function flush() {
      const title = titleInput.value;
      const body = bodyInput.value;
      if (title === savedTitle && body === savedBody && currentId != null) {
        return null; // nothing changed
      }
      if (currentId == null && title.trim() === '' && body.trim() === '') {
        return null; // empty new draft — don't create a row
      }
      saving = true;
      setStatus(status, 'Saving…');
      try {
        let rec;
        if (currentId == null) {
          rec = await api.create({ title, body });
          currentId = rec.id;
          syncDraftActions();
        } else {
          rec = await api.update(currentId, { title, body });
        }
        savedTitle = title;
        savedBody = body;
        setStatus(
          status,
          `Saved · ${new Date(rec.updated_at).toLocaleTimeString()}`
        );
        return rec;
      } catch (e) {
        setStatus(status, `Save failed: ${e.message || e}`);
        return null;
      } finally {
        saving = false;
      }
    }

    // Debounced autosave on every keystroke (preservation, not finalization).
    function scheduleSave() {
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

    titleInput.addEventListener('input', scheduleSave);
    bodyInput.addEventListener('input', () => {
      updateCounter();
      scheduleSave();
    });
    // Belt-and-suspenders: commit on blur so a pending edit isn't lost if focus
    // leaves and the window closes before the debounce fires.
    titleInput.addEventListener('blur', flushNow);
    bodyInput.addEventListener('blur', flushNow);

    backBtn.addEventListener('click', async () => {
      await flushNow();
      await showList();
    });

    archiveBtn.addEventListener('click', async () => {
      if (currentId == null) return;
      archiveBtn.disabled = true;
      await flushNow();
      try {
        await api.archive(currentId);
        await showList();
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
          await showList();
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

    titleInput.focus();
    if (item) bodyInput.focus();
  }

  showList();
}

const CONTENT_RENDERERS = {
  'Home': renderHomePage,
  'Writing Lab': renderWritingLabPage,
  'Chat': renderChatPage,
  'Settings': renderSettingsPage,
  'Unsorted': makeEntryWorkspace({
    apiName: 'unsorted',
    draftPrefix: 'unsorted',
    addLabel: 'Add to Unsorted',
  }),
  'Source Material': makeEntryWorkspace({
    apiName: 'sourceMaterial',
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
    draftPrefix: 'documents',
    addLabel: 'Add Document',
  }),
  'Open Questions': makeEntryWorkspace({
    apiName: 'openQuestions',
    draftPrefix: 'open_questions',
    addLabel: 'Add Question',
  }),
  // Conflicts shares the lifecycle but is styled distinctly (red contradiction
  // accent + tailored labels) so it never reads like Open Questions.
  'Conflicts': makeEntryWorkspace({
    apiName: 'conflicts',
    draftPrefix: 'conflicts',
    addLabel: 'Log Conflict',
    sectionClass: 'ws-conflicts',
    titlePlaceholder: 'What contradicts what?',
    bodyPlaceholder: 'The two sides in tension, and where each comes from (optional)',
  }),
  'Decisions': makeEntryWorkspace({
    apiName: 'decisions',
    draftPrefix: 'decisions',
    addLabel: 'Record Decision',
    titlePlaceholder: 'What was decided?',
    bodyPlaceholder: 'The decision, and why it was settled this way (optional)',
  }),
  'Brainstorm': makeEntryWorkspace({
    apiName: 'brainstorm',
    draftPrefix: 'brainstorm',
    addLabel: 'Add Idea',
    titlePlaceholder: 'What is the idea?',
    bodyPlaceholder: 'Where it might go, what sparked it (optional)',
  }),
  // Research shares the lifecycle but is styled distinctly (blue source accent +
  // tailored labels) so it never reads like Brainstorm's open ideation.
  'Research': makeEntryWorkspace({
    apiName: 'research',
    draftPrefix: 'research',
    addLabel: 'Add Research',
    sectionClass: 'ws-research',
    titlePlaceholder: 'What was researched?',
    bodyPlaceholder: 'Findings, and where they came from — source/link (optional)',
  }),
  // Characters (P26): basic create/edit/delete/archive/restore on character
  // entries (name + development notes). Relational view, attachments, and canon
  // flow are later phases. Distinct violet accent so it never reads like a
  // generic queue.
  'Characters': makeEntryWorkspace({
    apiName: 'characters',
    draftPrefix: 'characters',
    addLabel: 'Add Character',
    sectionClass: 'ws-characters',
    titlePlaceholder: 'Character name',
    bodyPlaceholder: 'Who they are — role, traits, arc, open threads (optional)',
  }),
  // Episodes (P27): basic create/edit/delete/archive/restore on episode entries
  // (name + outline/scene list/beats/draft notes). Attachments and canon flow
  // are later phases. Amber accent so the drafting surface reads distinctly from
  // Characters and the queue workspaces.
  'Episodes': makeEntryWorkspace({
    apiName: 'episodes',
    draftPrefix: 'episodes',
    addLabel: 'Add Episode',
    sectionClass: 'ws-episodes',
    titlePlaceholder: 'Episode title',
    bodyPlaceholder: 'Outline, scene list, beats, draft notes (optional)',
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

function route(name) {
  for (const key in buttons) {
    buttons[key].classList.toggle('active', key === name);
  }
  content.innerHTML = '';
  content.appendChild(renderWorkspacePage(name));
}

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
  'Open Questions': '❓',
  'Conflicts': '⚔️',
  'Decisions': '⚖️',
  'Brainstorm': '💡',
  'Research': '🔎',
  'Settings': '⚙️',
};

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
  btn.addEventListener('click', () => route(name));
  buttons[name] = btn;
  nav.appendChild(btn);
}

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

// The message area is a shell: no messages exist yet. It names the active chat
// so switching via the dropdown visibly changes what's shown.
function renderChatBody() {
  chatMessages.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'chat-empty';
  const active = chatList.find((c) => c.id === activeChatId);
  if (!active) {
    p.textContent =
      'No chats yet. Click “+ New chat” to start one. Messaging Claude is added in a later phase; attachments will come from Source Material only. Nothing here is saved or sent without your confirmation.';
  } else {
    p.textContent =
      `You’re in “${active.title}”. Messaging Claude here is added in a later phase. ` +
      'Attachments will come from Source Material only. Nothing here is saved or sent without your confirmation.';
  }
  chatMessages.appendChild(p);
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

// Draft send (P19): no AI, nothing stored or sent. Its only job this phase is
// to clear the composer and drop the chat's "next message only" sources, so
// that single-use mode behaves as named. Keep-active sources are untouched.
chatComposer.addEventListener('submit', (e) => {
  e.preventDefault();
  if (activeChatId == null) return;
  chatInput.value = '';
  if (nextSourcesFor(activeChatId).length) {
    nextSourcesByChat.set(activeChatId, []);
    renderActiveSources();
  }
});

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

route('Home');
