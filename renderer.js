// Left-nav routing for the 14 Revival workspaces.
// Each page renders the shared 5-question UI-principle template (see CLAUDE.md).

const WORKSPACES = [
  'Home',
  'Chat',
  'Writing Lab',
  'Source Material',
  'Documents',
  'Canon Bible',
  'Unsorted',
  'Canon Review',
  'Open Questions',
  'Conflicts',
  'Decisions',
  'Brainstorm',
  'Research',
  'Settings',
];

// Per-workspace answers to the 5 UI questions.
// Q1 "Where am I" is derived from the name; the other four live here.
// `lifecycle` defaults to the standard edit/delete/archive/restore wording.
const STD_LIFECYCLE =
  'Each entry can be edited, deleted (for mistakes), or archived to a collapsed section and restored later.';

const WORKSPACE_INFO = {
  'Home': {
    purpose: 'An overview of the whole Revival project — where everything lives and what needs attention.',
    next: 'Pick a workspace from the left to start working.',
    savedTo: 'Nothing is saved here; Home only summarizes what lives in the other workspaces.',
    lifecycle: 'Nothing to edit here — manage material inside its own workspace.',
  },
  'Chat': {
    purpose: 'Talk through the Revival project with Claude. (Becomes a global drawer in a later phase.)',
    next: 'Open the chat drawer (💬 Chat, bottom-right of any workspace), click “+ New chat” to create chats, and switch between them with the dropdown. Rename or archive the active chat with the buttons below the title; archived chats restore from the collapsed section. Use “+ Attach source” to add Source Material in one of two modes: “Keep active” stays listed for the whole chat, while “Next message only” is used once and clears on the next send. Remove any active source with the ✕ on its chip. (Sending here is a draft action only — Claude messaging comes later; nothing is saved or sent.)',
    savedTo: 'Chats are kept in this Chat workspace. Attachments come from Source Material only.',
    lifecycle: 'Chats can be renamed, archived, and restored. Nothing is finalized without your confirmation.',
  },
  'Writing Lab': {
    purpose: 'Long-form drafting space with autosave for working on Revival writing.',
    next: 'Open or start a draft and write.',
    savedTo: 'Drafts are preserved in the Writing Lab. Autosave preserves drafts — it does not finalize them.',
    lifecycle: STD_LIFECYCLE,
  },
  'Source Material': {
    purpose: 'Reference inputs for the project. The only thing that can be attached to Chat.',
    next: 'Add a source, or open one to view it.',
    savedTo: 'Sources are stored here and stay visibly separate from Documents.',
    lifecycle: STD_LIFECYCLE,
  },
  'Documents': {
    purpose: 'Working and finished documents — kept separate from Source Material.',
    next: 'Create a document or open an existing one to edit.',
    savedTo: 'Documents are stored here, not blended with Source Material.',
    lifecycle: STD_LIFECYCLE,
  },
  'Canon Bible': {
    purpose: 'The currently accepted Revival truth. Locked = accepted, not impossible to change.',
    next: 'Browse entries; propose changes through Canon Review rather than editing truth silently.',
    savedTo: 'Accepted canon lives here. Retired/superseded entries stay in a collapsed section.',
    lifecycle: 'Entries are editable; locking warns before edits; superseding retires the old version into a collapsed section.',
  },
  'Unsorted': {
    purpose: 'A general routing queue for anything that does not fit a workspace yet.',
    next: 'Drop an item here, then route it to the right workspace when you know where it belongs.',
    savedTo: 'Items stay in Unsorted until you move them somewhere specific.',
    lifecycle: STD_LIFECYCLE,
  },
  'Canon Review': {
    purpose: 'The approval space for anything that may affect official Revival truth.',
    next: 'Review proposed changes and approve, reject, or send them back.',
    savedTo: 'Approved changes flow into the Canon Bible. Nothing reaches canon without approval here.',
    lifecycle: 'Proposals can be approved, rejected, or sent back. No automatic canon mutation.',
  },
  'Open Questions': {
    purpose: 'Unresolved questions about the Revival project.',
    next: 'Add a question, or open one to work toward an answer.',
    savedTo: 'Questions are stored here, separate from Conflicts.',
    lifecycle: STD_LIFECYCLE,
  },
  'Conflicts': {
    purpose: 'Contradictions that need resolving — kept distinct from Open Questions.',
    next: 'Log a conflict, or open one to resolve it.',
    savedTo: 'Conflicts are stored here, visibly distinct from Open Questions.',
    lifecycle: STD_LIFECYCLE,
  },
  'Decisions': {
    purpose: 'Settled decisions for the Revival project.',
    next: 'Record a decision, or open one to revisit it.',
    savedTo: 'Decisions are stored here.',
    lifecycle: STD_LIFECYCLE,
  },
  'Brainstorm': {
    purpose: 'Open idea generation — kept separate from Research.',
    next: 'Capture ideas freely; refine or route the good ones later.',
    savedTo: 'Ideas are stored here, separate from Research.',
    lifecycle: STD_LIFECYCLE,
  },
  'Research': {
    purpose: 'Background and external research — kept separate from Brainstorm.',
    next: 'Add a research note, or open one to expand it.',
    savedTo: 'Research is stored here, not blended with Brainstorm.',
    lifecycle: STD_LIFECYCLE,
  },
  'Settings': {
    purpose: 'Project configuration, including always-on Project Rules that Claude receives.',
    next: 'Review or edit your Project Rules and other settings.',
    savedTo: 'Settings are saved to this project. Project Rules are always-on and visible — no hidden memory.',
    lifecycle: 'Settings values can be edited and saved; changes persist across restarts.',
  },
};

const QUESTIONS = [
  ['Where am I', (name) => `Revival Studio › ${name}`],
  ['What is this page for', (name, info) => info.purpose],
  ['What should I do next', (name, info) => info.next],
  ['Where saved material goes', (name, info) => info.savedTo],
  ['How to edit, delete, archive, restore, or undo', (name, info) => info.lifecycle],
];

// Reusable template: renders the 5-question panel for a workspace, then any
// workspace-specific functional UI below it.
function renderWorkspacePage(name) {
  const info = WORKSPACE_INFO[name];
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

  const panel = document.createElement('dl');
  panel.className = 'principles';
  for (const [label, answer] of QUESTIONS) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = answer(name, info);
    panel.append(dt, dd);
  }
  page.appendChild(panel);

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
  // Create form
  const form = document.createElement('form');
  form.className = 'entry-form';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'Title';
  titleInput.maxLength = 200;

  const bodyInput = document.createElement('textarea');
  bodyInput.placeholder = 'Notes (optional)';
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

const CONTENT_RENDERERS = {
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

for (const name of WORKSPACES) {
  const btn = document.createElement('button');
  btn.textContent = name;
  btn.addEventListener('click', () => route(name));
  buttons[name] = btn;
  nav.appendChild(btn);
}

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
