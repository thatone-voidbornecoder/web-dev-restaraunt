// public/common.js
// Shared frontend helpers: JWT token storage, an api() wrapper that sends the
// Bearer header, auth helpers (login/register/logout/me), role guards, and
// a couple of tiny DOM utilities. Used by every page.

const TOKEN_KEY = 'foodadvisor_token';
const USER_KEY = 'foodadvisor_user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

function setCachedUser(user) { localStorage.setItem(USER_KEY, JSON.stringify(user)); }
function getCachedUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

// Thin fetch wrapper: sets Authorization + JSON headers, parses JSON, throws on
// non-2xx with the server's { error } message.
async function api(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = Object.assign({}, options, { headers });
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function login(email, password) {
  const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  setToken(data.token);
  setCachedUser(data.user);
  return data.user;
}

async function register(name, email, password) {
  return api('/api/auth/register', { method: 'POST', body: { name, email, password } });
}

async function fetchMe() {
  // /api/auth/me returns { user: {...} }; cache and return the inner user.
  const data = await api('/api/auth/me');
  const user = data && data.user ? data.user : data;
  setCachedUser(user);
  return user;
}

function logout() {
  clearToken();
  location.href = '/index.html';
}

// Redirect to login.html if the visitor is not authenticated (or not in `roles`).
// Returns the current user (cached, refreshed on demand).
async function requireAuth(roles = null) {
  let user = getCachedUser();
  if (!getToken()) { location.href = '/login.html'; return null; }
  if (!user) {
    try { user = await fetchMe(); } catch { logout(); return null; }
  }
  if (roles && !roles.includes(user.role)) {
    location.href = '/' + user.role + '.html'; // send them to their own page
    return null;
  }
  return user;
}

// --- tiny DOM helpers ---
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// Render a list of objects into a container as cards/rows via a mapper fn.
function renderList(container, items, mapper) {
  clear(container);
  if (!items || items.length === 0) {
    container.appendChild(el('p', { class: 'empty', text: 'Nothing here yet.' }));
    return;
  }
  items.forEach((item) => container.appendChild(mapper(item)));
}

// Shared top nav shown on every authenticated page.
function mountNav(user, current) {
  const nav = document.getElementById('nav');
  if (!nav) return;
  clear(nav);
  nav.appendChild(el('a', { class: 'brand', href: '/index.html', text: 'FoodAdvisor' }));
  const links = [
    { href: '/customer.html', label: 'Browse', show: true },
    { href: '/owner.html', label: 'Owner', show: user.role === 'owner' || user.role === 'admin' },
    { href: '/admin.html', label: 'Admin', show: user.role === 'admin' },
    { href: '/account.html',  label: 'Account', show: user && user.role && user.role !== 'guest' },
  ];
  links.filter((l) => l.show).forEach((l) => {
    const a = el('a', { href: l.href, text: l.label });
    if (current === l.href) a.classList.add('active');
    nav.appendChild(a);
  });
  const right = el('div', { class: 'nav-right' }, [
    el('span', { text: `${user.name} (${user.role})` }),
    el('button', { class: 'btn-link', text: 'Log out', onclick: logout }),
  ]);
  nav.appendChild(right);
}
