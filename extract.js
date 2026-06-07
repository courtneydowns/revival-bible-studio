// PUI3 — Highlight + extract + route.
//
// Loaded by both index.html (main window) and popout.html so the same
// behavior works in either surface: select text inside a detail panel's
// body, a small floating menu appears, click a target → a new entry is
// created in that workspace pre-filled with the selection and a source
// attribution line. The original entry is never mutated.
//
// Target workspaces:
//   Unsorted, Brainstorm, Open Questions, Decisions, Conflicts, Research,
//   Documents, Canon Review.
//
// Canon Review is the only target that does not write to its own workspace
// table — it stages a pending row in canon_proposals so the future review
// queue (P35) picks the snippet up with its source attribution intact.

(function () {
  // workspaceName + apiName for the six entry-table targets. The renderer and
  // popout call this with a `sourceContext.workspace` that's also a key in
  // SOURCE_KIND_MAP so the Canon Review route can record provenance.
  const ROUTES = [
    {
      key: 'unsorted',
      label: 'Unsorted',
      workspaceName: 'Unsorted',
      create: (title, body) =>
        window.revival.unsorted.create({ title, body }),
    },
    {
      key: 'brainstorm',
      label: 'Brainstorm',
      workspaceName: 'Brainstorm',
      create: (title, body) =>
        window.revival.brainstorm.create({ title, body }),
    },
    {
      key: 'openQuestions',
      label: 'Open Questions',
      workspaceName: 'Open Questions',
      create: (title, body) =>
        window.revival.openQuestions.create({ title, body }),
    },
    {
      key: 'decisions',
      label: 'Decisions',
      workspaceName: 'Decisions',
      create: (title, body) =>
        window.revival.decisions.create({ title, body }),
    },
    {
      key: 'conflicts',
      label: 'Conflicts',
      workspaceName: 'Conflicts',
      create: (title, body) =>
        window.revival.conflicts.create({ title, body }),
    },
    {
      key: 'research',
      label: 'Research',
      workspaceName: 'Research',
      create: (title, body) =>
        window.revival.research.create({ title, body }),
    },
    {
      key: 'documents',
      label: 'Documents',
      workspaceName: 'Documents',
      create: (title, body) =>
        window.revival.documents.create({ title, body }),
    },
    {
      key: 'canonReview',
      label: 'Canon Review',
      workspaceName: 'Canon Review',
      create: (title, body, source) =>
        window.revival.canonProposals.createFromExtract({
          title,
          body,
          source_kind: SOURCE_KIND_MAP[source.workspace] || null,
          source_entry_id: source.id,
          proposer_note: `Extracted from ${source.workspace}${
            source.title ? ` — “${source.title}”` : ''
          }`,
        }),
    },
  ];

  // Source workspace label → table name used by canon_proposals.source_kind.
  // Mirrors the actual SQLite table names so a later P35 review can resolve
  // the originating row.
  const SOURCE_KIND_MAP = {
    'Unsorted': 'unsorted',
    'Source Material': 'source_material',
    'Documents': 'documents',
    'Open Questions': 'open_questions',
    'Conflicts': 'conflicts',
    'Decisions': 'decisions',
    'Brainstorm': 'brainstorm_items',
    'Research': 'research_items',
    'Characters': 'characters_workspace',
    'Episodes': 'episodes_workspace',
  };

  // Shared singleton menu + toast. Both float over the page; built lazily so
  // popout/renderer cost nothing until the user actually selects something.
  let menuEl = null;
  let toastEl = null;
  let activeSource = null;
  let routing = false;
  // Only one detail body is on-screen at a time. The renderer / popout re-set
  // this every time a new entry is shown — older hosts are simply dropped.
  // A document-level mouseup listener (registered once below) checks the
  // active host on every release, which avoids the "mouseup landed on .tc-right
  // padding" miss that a host-scoped listener has when a selection drag
  // overshoots the body element.
  let currentHost = null;
  let currentSourceContext = null;

  function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.className = 'extract-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.hidden = true;

    const label = document.createElement('div');
    label.className = 'extract-menu-label';
    label.textContent = 'Route to…';
    menuEl.appendChild(label);

    const list = document.createElement('div');
    list.className = 'extract-menu-list';
    for (const route of ROUTES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'extract-menu-item';
      btn.dataset.routeKey = route.key;
      btn.textContent = route.label;
      btn.addEventListener('mousedown', (e) => {
        // Hold the selection through the click — clicking a button outside the
        // body would otherwise clear the selection before we can read it.
        e.preventDefault();
      });
      btn.addEventListener('click', () => runRoute(route));
      list.appendChild(btn);
    }
    menuEl.appendChild(list);

    document.body.appendChild(menuEl);
    return menuEl;
  }

  function ensureToast() {
    if (toastEl) return toastEl;
    toastEl = document.createElement('div');
    toastEl.className = 'extract-toast';
    toastEl.hidden = true;
    document.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(message) {
    const el = ensureToast();
    el.textContent = message;
    el.hidden = false;
    el.classList.add('extract-toast-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.remove('extract-toast-visible');
      // Wait for fade-out before hiding so it's not in the layout.
      setTimeout(() => { el.hidden = true; }, 220);
    }, 2200);
  }

  // Compose the pre-filled title + body for a routed entry. The title is the
  // first non-empty line of the selection, truncated; the body is the full
  // selection followed by an attribution line so the routed entry remembers
  // where it came from.
  function buildEntry(selection, source) {
    const trimmed = selection.trim();
    const firstLine = trimmed.split(/\r?\n/)[0].trim();
    const title = (firstLine || source.title || 'Extracted snippet').slice(0, 120);
    const attribution =
      `— Extracted from ${source.workspace}` +
      (source.title ? ` · “${source.title}”` : '') +
      ` · ${new Date().toLocaleString()}`;
    const body = `${trimmed}\n\n${attribution}`;
    return { title, body };
  }

  async function runRoute(route) {
    if (routing) return;
    if (!activeSource) return;
    const selectionText = activeSource.selectionText;
    if (!selectionText || !selectionText.trim()) return;
    routing = true;
    menuEl.classList.add('extract-menu-busy');
    try {
      const { title, body } = buildEntry(selectionText, activeSource);
      await route.create(title, body, activeSource);
      // Fan the change out so a list open in another window refreshes.
      try {
        window.revival.popout.notifyChanged(route.workspaceName);
      } catch {
        // notifyChanged is fire-and-forget; ignore any IPC hiccups.
      }
      showToast(`Routed to ${route.label}.`);
      hideMenu();
      // Drop the highlight so the just-routed text doesn't look like it's
      // still queued for another action.
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    } catch (e) {
      showToast(`Could not route: ${(e && e.message) || e}`);
    } finally {
      menuEl.classList.remove('extract-menu-busy');
      routing = false;
    }
  }

  function hideMenu() {
    if (!menuEl) return;
    menuEl.hidden = true;
    activeSource = null;
  }

  // Place the menu just below the selection's bounding box, clamped to the
  // viewport so it never falls off-screen.
  function positionMenu(rect) {
    ensureMenu();
    menuEl.hidden = false;
    // Reset first so the previous-position offsets don't influence the
    // measurement.
    menuEl.style.left = '0px';
    menuEl.style.top = '0px';
    const menuRect = menuEl.getBoundingClientRect();
    const margin = 8;
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 6;
    const maxLeft =
      window.scrollX + document.documentElement.clientWidth - menuRect.width - margin;
    if (left > maxLeft) left = maxLeft;
    if (left < window.scrollX + margin) left = window.scrollX + margin;
    // If there's not enough room below, place it above the selection.
    const viewportBottom = window.scrollY + document.documentElement.clientHeight;
    if (top + menuRect.height + margin > viewportBottom) {
      top = rect.top + window.scrollY - menuRect.height - 6;
      if (top < window.scrollY + margin) top = window.scrollY + margin;
    }
    menuEl.style.left = `${Math.round(left)}px`;
    menuEl.style.top = `${Math.round(top)}px`;
  }

  // True if every part of the current selection lives inside `host`.
  function selectionInside(sel, host) {
    if (!sel || sel.rangeCount === 0) return false;
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      if (!host.contains(range.commonAncestorContainer)) return false;
    }
    return true;
  }

  function handleSelectionEnd(host, sourceContext) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      hideMenu();
      return;
    }
    if (!selectionInside(sel, host)) {
      hideMenu();
      return;
    }
    const text = sel.toString();
    if (!text || !text.trim()) {
      hideMenu();
      return;
    }
    activeSource = {
      workspace: sourceContext.workspace,
      id: sourceContext.id,
      title: sourceContext.title,
      selectionText: text,
    };
    const range = sel.getRangeAt(sel.rangeCount - 1);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideMenu();
      return;
    }
    positionMenu(rect);
  }

  // Register a detail body + its source attribution as the active extract
  // target. The document-level mouseup listener below uses this to decide
  // whether the current selection is route-eligible. No teardown needed —
  // a later attach() simply replaces the registration.
  function attach(host, sourceContext) {
    if (!host || !sourceContext) return () => {};
    currentHost = host;
    currentSourceContext = sourceContext;
    return () => {
      if (currentHost === host) {
        currentHost = null;
        currentSourceContext = null;
      }
    };
  }

  // Document-level mouseup: any release anywhere in the window prompts a
  // selection check against the currently attached host. Captures the case
  // where a selection drag finishes on .tc-right's padding (just outside the
  // body element) — a host-scoped listener would miss those.
  function maybeShowFromCurrent() {
    if (!currentHost || !currentSourceContext) {
      hideMenu();
      return;
    }
    handleSelectionEnd(currentHost, currentSourceContext);
  }
  document.addEventListener('mouseup', () => {
    // setTimeout so the selection is finalized before we read it.
    setTimeout(maybeShowFromCurrent, 0);
  });
  document.addEventListener('keyup', (e) => {
    if (
      e.shiftKey ||
      e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
      (e.metaKey && e.key.toLowerCase() === 'a')
    ) {
      maybeShowFromCurrent();
    }
  });

  // Global dismiss: click outside the menu (and outside the source body) hides
  // it. The selectionchange listener also catches the case where the user
  // simply clicks somewhere else and clears the selection.
  document.addEventListener('mousedown', (e) => {
    if (!menuEl || menuEl.hidden) return;
    if (menuEl.contains(e.target)) return;
    hideMenu();
  });
  document.addEventListener('selectionchange', () => {
    if (!menuEl || menuEl.hidden) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) hideMenu();
  });
  // Scroll/resize would leave the menu visually detached from the selection.
  // Cheaper to hide than to reposition continuously.
  window.addEventListener('scroll', () => hideMenu(), true);
  window.addEventListener('resize', () => hideMenu());

  window.RevivalExtract = { attach };
})();
