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
    next: 'Start or continue a chat; attach Source Material when you need Claude to reference it.',
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

// --- Unsorted: create + list ----------------------------------------------
function renderUnsorted(section) {
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
  submit.textContent = 'Add to Unsorted';
  submit.disabled = true;

  const error = document.createElement('p');
  error.className = 'form-error';

  titleInput.addEventListener('input', () => {
    submit.disabled = titleInput.value.trim() === '';
    error.textContent = '';
  });

  const list = document.createElement('div');
  list.className = 'entry-list';

  async function loadList() {
    const items = await window.revival.unsorted.list();
    list.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'placeholder';
      empty.textContent = 'No entries yet. Add one above.';
      list.appendChild(empty);
      return;
    }
    for (const item of items) {
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
      card.appendChild(meta);

      list.appendChild(card);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (titleInput.value.trim() === '') return;
    submit.disabled = true;
    try {
      await window.revival.unsorted.create({
        title: titleInput.value,
        body: bodyInput.value,
      });
      titleInput.value = '';
      bodyInput.value = '';
      await loadList();
    } catch (err) {
      error.textContent = err.message || 'Could not save entry.';
    } finally {
      submit.disabled = titleInput.value.trim() === '';
      titleInput.focus();
    }
  });

  form.append(titleInput, bodyInput, submit, error);
  section.append(form, list);
  loadList();
}

const CONTENT_RENDERERS = {
  'Unsorted': renderUnsorted,
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

route('Home');
