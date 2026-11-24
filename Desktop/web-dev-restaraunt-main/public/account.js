// public/account.js
// Self-service account management for every authenticated user
// (customer / owner / admin all manage their own row).
// Backend: GET /api/auth/me, PUT /api/auth/me, DELETE /api/auth/me.

let ME = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Any authenticated role may use this page; requireAuth redirects to
  // /login.html if there is no token.
  ME = await requireAuth();
  if (!ME) return;
  mountNav(ME, '/account.html');
  renderProfile(ME);
  prefillForm(ME);

  document.getElementById('accountForm').addEventListener('submit', onSave);
  document.getElementById('deleteBtn').addEventListener('click', onDelete);
});

// Read-only summary table built from the cached/refreshed user object.
function renderProfile(u) {
  const rows = [
    ['Name', u.name],
    ['Email', u.email],
    ['Role', u.role],
    ['Status', u.status],
    ['Member since', u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'],
  ];
  const wrap = document.getElementById('profile');
  clear(wrap);
  const tbody = el('tbody');
  rows.forEach(([k, v]) => {
    tbody.appendChild(el('tr', {}, [
      el('th', { text: k }),
      el('td', { text: v == null || v === '' ? '—' : String(v) }),
    ]));
  });
  wrap.appendChild(el('table', {}, [tbody]));
}

function prefillForm(u) {
  document.getElementById('name').value = u.name || '';
  document.getElementById('email').value = u.email || '';
}

// Render / clear a message banner in the given container.
function setMsg(id, type, text) {
  const wrap = document.getElementById(id);
  clear(wrap);
  if (text) wrap.appendChild(el('div', { class: `msg ${type}`, text }));
}

async function onSave(e) {
  e.preventDefault();
  setMsg('formMsg', '', '');

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const confirmPw = document.getElementById('confirm').value;

  // Client-side checks mirroring the server's validation rules.
  if (name.length < 2 || name.length > 100)
    return setMsg('formMsg', 'err', 'Name must be 2–100 characters.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return setMsg('formMsg', 'err', 'Please enter a valid email address.');
  if (password) {
    if (password.length < 8 || password.length > 72)
      return setMsg('formMsg', 'err', 'Password must be 8–72 characters.');
    if (password !== confirmPw)
      return setMsg('formMsg', 'err', 'Passwords do not match.');
  }

  // Send name + email always (unchanged values are harmless on the server);
  // include password only when the user typed a new one.
  const body = { name, email };
  if (password) body.password = password;

  try {
    const data = await api('/api/auth/me', { method: 'PUT', body });
    ME = data.user;
    setCachedUser(ME);
    document.getElementById('password').value = '';
    document.getElementById('confirm').value = '';
    renderProfile(ME);
    mountNav(ME, '/account.html'); // refresh nav in case the name changed
    setMsg('formMsg', 'ok', 'Account updated.');
  } catch (err) {
    setMsg('formMsg', 'err', err.message);
  }
}

async function onDelete() {
  setMsg('delMsg', '', '');
  const ok = window.confirm(
    'Delete your account permanently?\n\nThis removes your reviews and replies' +
    ' and, for owners, your restaurants and dishes. This cannot be undone.',
  );
  if (!ok) return;
  try {
    await api('/api/auth/me', { method: 'DELETE' });
    clearToken();
    location.href = '/index.html';
  } catch (err) {
    setMsg('delMsg', 'err', err.message);
  }
}
