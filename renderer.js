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
    next: 'Open the chat drawer (💬 Chat, bottom-right of any workspace), click “+ New chat” to create chats, and switch between them with the dropdown. Attaching Source Material comes in a later phase.',
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

const CONTENT_RENDERERS = {
  'Chat': renderChatPage,
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
  }),
  'Documents': makeEntryWorkspace({
    apiName: 'documents',
    draftPrefix: 'documents',
    addLabel: 'Add Document',
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
    themeToggle.textContent = theme === 'dark' ? '☾  Dark' : '☀  Light';
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

nav.appendChild(themeToggle);

// --- Global Chat drawer (shell only; no AI yet) -----------------------------
// The toggle is fixed and outside #content, so the drawer opens/closes from
// every workspace without taking over the app. P15 adds multiple chats: a
// title dropdown lists them and switches the active chat. Chats are created
// only on an explicit "+ New chat" click — nothing is seeded silently. There
// are no messages yet (those arrive with AI in a later phase).
const chatDrawer = document.getElementById('chat-drawer');
const chatToggle = document.getElementById('chat-toggle');
const chatClose = document.getElementById('chat-close');
const chatSelect = document.getElementById('chat-select');
const chatNewBtn = document.getElementById('chat-new');
const chatMessages = document.getElementById('chat-messages');

const ACTIVE_CHAT_KEY = 'revival.chat.active';
let chatList = [];
let activeChatId = null;

function setChatOpen(open) {
  chatDrawer.classList.toggle('open', open);
  chatDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  chatToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
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

function setActiveChat(id) {
  activeChatId = id;
  if (id == null) {
    localStorage.removeItem(ACTIVE_CHAT_KEY);
  } else {
    localStorage.setItem(ACTIVE_CHAT_KEY, String(id));
  }
  renderChatSelect();
  renderChatBody();
}

async function loadChats() {
  chatList = await window.revival.chats.list();
  // Restore the previously active chat if it still exists; else fall back to
  // the first chat, or none when the list is empty.
  const saved = Number(localStorage.getItem(ACTIVE_CHAT_KEY));
  const stillExists = chatList.some((c) => c.id === saved);
  const next = stillExists ? saved : chatList.length ? chatList[0].id : null;
  setActiveChat(next);
}

chatToggle.addEventListener('click', () =>
  setChatOpen(!chatDrawer.classList.contains('open'))
);
chatClose.addEventListener('click', () => setChatOpen(false));
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
    // Default name is just a sequential label; rename arrives in a later phase.
    const created = await window.revival.chats.create({
      title: `Chat ${chatList.length + 1}`,
    });
    chatList.push(created);
    setActiveChat(created.id);
  } finally {
    chatNewBtn.disabled = false;
  }
});

loadChats();

route('Home');
