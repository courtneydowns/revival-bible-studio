// PTAG — shared tag UI used by both the main window and the popout.
//
// Exposes window.RevivalTags with four entry points:
//   • mountTagBar(container, kind, id, opts) — chips + “+ Tag” picker
//     for one entity. Rebuilds in place when tags change.
//   • buildBadges(tags, opts) — compact chip row for left-list previews.
//   • mountFilterBar(container, kind, opts) — multi-select filter pills
//     above a workspace list. Selected tags are AND-combined.
//   • clearCache() — drop the in-process tag-library cache (used after the
//     picker creates a new tag so the categories list rebuilds).
//
// The module is intentionally vanilla DOM so it can run inside the popout
// window without bringing renderer.js along.

(function () {
  const api = window.revival && window.revival.tags;
  if (!api) {
    console.warn('[tags-ui] preload bridge missing; tag UI disabled');
    return;
  }

  // Process-wide cache of the tag library. listAll() can be called many
  // times per render (every detail panel, every filter bar) so caching keeps
  // the picker snappy. Invalidated whenever a new tag is created or attached
  // since attach can create the tag implicitly via the picker’s create flow.
  let libraryPromise = null;
  function loadLibrary() {
    if (!libraryPromise) libraryPromise = api.listAll();
    return libraryPromise;
  }
  function clearCache() {
    libraryPromise = null;
  }

  function groupByCategory(library) {
    const groups = new Map();
    for (const t of library) {
      const key = t.category || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return groups;
  }

  // --- Tag bar (detail panels) ---------------------------------------------
  // Renders existing tags as removable chips and a single “+ Tag” button that
  // opens an inline picker below the chip row. The picker collapses every
  // category by default; typing a query expands the matching groups.
  function mountTagBar(container, kind, entityId, opts = {}) {
    if (!container || !kind || entityId == null) return { destroy() {} };

    const wrap = document.createElement('div');
    wrap.className = 'tagbar';
    container.appendChild(wrap);

    let currentTags = [];
    let pickerEl = null;

    async function refresh() {
      try {
        currentTags = await api.listFor(kind, Number(entityId));
      } catch {
        currentTags = [];
      }
      renderChips();
    }

    function renderChips() {
      wrap.innerHTML = '';

      const chipRow = document.createElement('div');
      chipRow.className = 'tagbar-chips';

      for (const t of currentTags) {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.title = t.category
          ? `${t.name} · ${t.category}`
          : t.name;

        const label = document.createElement('span');
        label.className = 'tag-chip-name';
        label.textContent = t.name;
        chip.appendChild(label);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'tag-chip-remove';
        remove.textContent = '×';
        remove.title = `Remove “${t.name}”`;
        remove.setAttribute('aria-label', `Remove ${t.name}`);
        remove.addEventListener('click', async () => {
          remove.disabled = true;
          try {
            await api.detach(kind, Number(entityId), t.id);
            if (typeof opts.onChange === 'function') opts.onChange();
            await refresh();
          } catch {
            remove.disabled = false;
          }
        });
        chip.appendChild(remove);
        chipRow.appendChild(chip);
      }

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'tag-add-btn';
      addBtn.textContent = currentTags.length ? '+ Tag' : '+ Add tag';
      addBtn.addEventListener('click', () => {
        if (pickerEl) {
          pickerEl.remove();
          pickerEl = null;
          return;
        }
        openPicker();
      });
      chipRow.appendChild(addBtn);

      wrap.appendChild(chipRow);
    }

    async function openPicker() {
      if (pickerEl) return;
      const library = await loadLibrary();
      const currentIds = new Set(currentTags.map((t) => t.id));

      pickerEl = document.createElement('div');
      pickerEl.className = 'tag-picker';

      const searchRow = document.createElement('div');
      searchRow.className = 'tag-picker-search';
      const search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'Search tags or type to create…';
      search.className = 'tag-picker-input';
      searchRow.appendChild(search);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tag-picker-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'Close picker';
      closeBtn.addEventListener('click', () => {
        pickerEl.remove();
        pickerEl = null;
      });
      searchRow.appendChild(closeBtn);
      pickerEl.appendChild(searchRow);

      const createRow = document.createElement('div');
      createRow.className = 'tag-picker-create';
      pickerEl.appendChild(createRow);

      const groupsHost = document.createElement('div');
      groupsHost.className = 'tag-picker-groups';
      pickerEl.appendChild(groupsHost);

      function renderGroups() {
        const q = search.value.trim().toLowerCase();
        groupsHost.innerHTML = '';
        createRow.innerHTML = '';

        // “Create new” affordance: only when the typed name doesn’t match
        // an existing tag (case-insensitive).
        const exactMatch =
          q && library.some((t) => t.name.toLowerCase() === q);
        if (q && !exactMatch) {
          const newBtn = document.createElement('button');
          newBtn.type = 'button';
          newBtn.className = 'tag-picker-create-btn';
          newBtn.textContent = `+ Create new tag “${search.value.trim()}”`;
          newBtn.addEventListener('click', async () => {
            newBtn.disabled = true;
            try {
              const created = await api.create({ name: search.value.trim() });
              clearCache();
              await api.attach(kind, Number(entityId), created.id);
              if (typeof opts.onChange === 'function') opts.onChange();
              pickerEl.remove();
              pickerEl = null;
              await refresh();
            } catch (err) {
              newBtn.disabled = false;
              newBtn.textContent = `Couldn’t create: ${err.message || err}`;
            }
          });
          createRow.appendChild(newBtn);
        }

        const matches = q
          ? library.filter((t) => t.name.toLowerCase().includes(q))
          : library;

        if (matches.length === 0 && !q) {
          const empty = document.createElement('p');
          empty.className = 'tag-picker-empty';
          empty.textContent = 'No tags available.';
          groupsHost.appendChild(empty);
          return;
        }

        const groups = groupByCategory(matches);
        for (const [category, items] of groups) {
          const cat = document.createElement('details');
          cat.className = 'tag-picker-cat';
          // Auto-open the category while searching so matches are visible.
          if (q) cat.open = true;
          const sum = document.createElement('summary');
          sum.textContent = `${category} (${items.length})`;
          cat.appendChild(sum);

          const row = document.createElement('div');
          row.className = 'tag-picker-row';
          for (const t of items) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-picker-tag';
            if (currentIds.has(t.id)) btn.classList.add('attached');
            btn.textContent = t.name;
            btn.title = currentIds.has(t.id)
              ? 'Already attached — click to remove'
              : 'Click to attach';
            btn.addEventListener('click', async () => {
              btn.disabled = true;
              try {
                if (currentIds.has(t.id)) {
                  await api.detach(kind, Number(entityId), t.id);
                  currentIds.delete(t.id);
                  btn.classList.remove('attached');
                } else {
                  await api.attach(kind, Number(entityId), t.id);
                  currentIds.add(t.id);
                  btn.classList.add('attached');
                }
                if (typeof opts.onChange === 'function') opts.onChange();
                await refresh();
              } finally {
                btn.disabled = false;
              }
            });
            row.appendChild(btn);
          }
          cat.appendChild(row);
          groupsHost.appendChild(cat);
        }
      }

      search.addEventListener('input', renderGroups);
      renderGroups();
      wrap.appendChild(pickerEl);
      search.focus();
    }

    refresh();

    return {
      destroy() {
        wrap.remove();
      },
      refresh,
    };
  }

  // --- Compact badges for list items ---------------------------------------
  // Returns a single element with up to `max` tag names; remaining tags
  // collapse into a "+N" pill. Hidden entirely when there are no tags.
  function buildBadges(tagList, opts = {}) {
    const max = Number.isFinite(opts.max) ? opts.max : 3;
    const wrap = document.createElement('div');
    wrap.className = 'tag-badges';
    if (!tagList || tagList.length === 0) {
      wrap.style.display = 'none';
      return wrap;
    }
    const visible = tagList.slice(0, max);
    for (const t of visible) {
      const b = document.createElement('span');
      b.className = 'tag-badge';
      b.textContent = t.name;
      wrap.appendChild(b);
    }
    if (tagList.length > max) {
      const more = document.createElement('span');
      more.className = 'tag-badge tag-badge-more';
      more.textContent = `+${tagList.length - max}`;
      more.title = tagList
        .slice(max)
        .map((t) => t.name)
        .join(', ');
      wrap.appendChild(more);
    }
    return wrap;
  }

  // --- Filter bar ----------------------------------------------------------
  // Multi-select pills above a workspace list. AND semantics: an entry must
  // carry every selected tag. opts.onChange is called with the Set of
  // selected tag ids whenever the selection changes; workspaces respond by
  // re-running their list render.
  function mountFilterBar(container, kind, opts = {}) {
    if (!container || !kind) return { selected: new Set(), destroy() {} };

    const wrap = document.createElement('div');
    wrap.className = 'tag-filter';
    container.appendChild(wrap);

    const selected = new Set();
    let library = [];
    let pickerEl = null;

    function notify() {
      if (typeof opts.onChange === 'function') opts.onChange(selected);
    }

    function renderBar() {
      wrap.innerHTML = '';
      pickerEl = null;

      const label = document.createElement('span');
      label.className = 'tag-filter-label';
      label.textContent = 'Filter by tag:';
      wrap.appendChild(label);

      for (const id of selected) {
        const t = library.find((x) => x.id === id);
        if (!t) continue;
        const chip = document.createElement('span');
        chip.className = 'tag-chip tag-chip-filter';
        const name = document.createElement('span');
        name.className = 'tag-chip-name';
        name.textContent = t.name;
        chip.appendChild(name);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'tag-chip-remove';
        remove.textContent = '×';
        remove.title = `Remove “${t.name}” from filter`;
        remove.setAttribute('aria-label', `Remove ${t.name} from filter`);
        remove.addEventListener('click', () => {
          selected.delete(id);
          renderBar();
          notify();
        });
        chip.appendChild(remove);
        wrap.appendChild(chip);
      }

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'tag-filter-add';
      addBtn.textContent = selected.size ? '+ Add tag' : '+ Tag';
      addBtn.addEventListener('click', () => {
        if (pickerEl) {
          pickerEl.remove();
          pickerEl = null;
        } else {
          openFilterPicker();
        }
      });
      wrap.appendChild(addBtn);

      if (selected.size > 0) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'tag-filter-clear';
        clear.textContent = 'Clear';
        clear.title = 'Clear all tag filters';
        clear.addEventListener('click', () => {
          selected.clear();
          renderBar();
          notify();
        });
        wrap.appendChild(clear);

        const hint = document.createElement('span');
        hint.className = 'tag-filter-hint';
        hint.textContent =
          selected.size === 1
            ? 'Showing entries tagged with this one.'
            : `Showing entries tagged with ALL ${selected.size}.`;
        wrap.appendChild(hint);
      }
    }

    function openFilterPicker() {
      pickerEl = document.createElement('div');
      pickerEl.className = 'tag-picker tag-picker-filter';

      const searchRow = document.createElement('div');
      searchRow.className = 'tag-picker-search';
      const search = document.createElement('input');
      search.type = 'text';
      search.placeholder = 'Search tags…';
      search.className = 'tag-picker-input';
      searchRow.appendChild(search);
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tag-picker-close';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', () => {
        pickerEl.remove();
        pickerEl = null;
      });
      searchRow.appendChild(closeBtn);
      pickerEl.appendChild(searchRow);

      const groupsHost = document.createElement('div');
      groupsHost.className = 'tag-picker-groups';
      pickerEl.appendChild(groupsHost);

      function renderGroups() {
        const q = search.value.trim().toLowerCase();
        groupsHost.innerHTML = '';
        const matches = q
          ? library.filter((t) => t.name.toLowerCase().includes(q))
          : library;

        if (matches.length === 0) {
          const empty = document.createElement('p');
          empty.className = 'tag-picker-empty';
          empty.textContent = 'No matching tags.';
          groupsHost.appendChild(empty);
          return;
        }

        const groups = groupByCategory(matches);
        for (const [category, items] of groups) {
          const cat = document.createElement('details');
          cat.className = 'tag-picker-cat';
          if (q) cat.open = true;
          const sum = document.createElement('summary');
          sum.textContent = `${category} (${items.length})`;
          cat.appendChild(sum);

          const row = document.createElement('div');
          row.className = 'tag-picker-row';
          for (const t of items) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tag-picker-tag';
            if (selected.has(t.id)) btn.classList.add('attached');
            btn.textContent = t.name;
            btn.addEventListener('click', () => {
              if (selected.has(t.id)) selected.delete(t.id);
              else selected.add(t.id);
              renderBar();
              notify();
            });
            row.appendChild(btn);
          }
          cat.appendChild(row);
          groupsHost.appendChild(cat);
        }
      }

      search.addEventListener('input', renderGroups);
      renderGroups();
      wrap.appendChild(pickerEl);
      search.focus();
    }

    (async () => {
      try {
        library = await loadLibrary();
      } catch {
        library = [];
      }
      renderBar();
    })();

    return {
      selected,
      destroy() {
        wrap.remove();
      },
    };
  }

  window.RevivalTags = {
    mountTagBar,
    buildBadges,
    mountFilterBar,
    clearCache,
  };
})();
