// Left-nav routing for the 14 Revival workspaces.
// Each workspace currently routes to a blank placeholder page.
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

const nav = document.getElementById('nav');
const content = document.getElementById('content');
const buttons = {};

function route(name) {
  for (const key in buttons) {
    buttons[key].classList.toggle('active', key === name);
  }
  content.innerHTML = '';
  const h1 = document.createElement('h1');
  h1.textContent = name;
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = 'Placeholder — this workspace has not been built yet.';
  content.append(h1, p);
}

for (const name of WORKSPACES) {
  const btn = document.createElement('button');
  btn.textContent = name;
  btn.addEventListener('click', () => route(name));
  buttons[name] = btn;
  nav.appendChild(btn);
}

route('Home');
