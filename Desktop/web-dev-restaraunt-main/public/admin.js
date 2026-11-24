// public/admin.js — admin panel: customers, owners, restaurants, reviews.

let ME = null;

async function init() {
  ME = await requireAuth(['admin']);
  if (!ME) return;
  mountNav(ME, '/admin.html');
  // tab switching
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });
  loadCustomers();
  loadOwners();
  loadRestaurants();
  loadReviews();
}

function switchTab(name) {
  document.querySelectorAll('#tabs button').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.classList.toggle('secondary', !on);
  });
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== 'tab-' + name; });
}

// ---------- customers ----------
async function loadCustomers() {
  const box = document.getElementById('custList');
  clear(box);
  const params = new URLSearchParams();
  const q = document.getElementById('cust_q').value.trim();
  const status = document.getElementById('cust_status').value;
  if (q) params.set('search', q);
  if (status) params.set('status', status);
  try {
    const data = await api('/api/admin/customers?' + params.toString());
    const rows = data.customers || [];
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No customers.' })); return; }
    const tbl = el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'ID' }), el('th', { text: 'Name' }), el('th', { text: 'Email' }), el('th', { text: 'Status' }), el('th', { text: 'Actions' })])])]);
    const tb = el('tbody');
    rows.forEach((c) => tb.appendChild(el('tr', {}, [
      el('td', { text: c.id }),
      el('td', { text: c.name }),
      el('td', { text: c.email }),
      el('td', {}, [el('span', { class: 'badge ' + (c.status === 'active' ? 'green' : 'red'), text: c.status })]),
      el('td', {}, [
        el('button', { class: 'secondary', text: c.status === 'active' ? 'Suspend' : 'Activate', onclick: () => toggleCustomer(c) }),
        el('button', { class: 'btn-danger', text: 'Delete', onclick: () => deleteCustomer(c) }),
      ]),
    ])));
    tbl.appendChild(tb); box.appendChild(tbl);
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: e.message })); }
}
async function toggleCustomer(c) {
  const status = c.status === 'active' ? 'suspended' : 'active';
  try { await api('/api/admin/customers/' + c.id, { method: 'PATCH', body: { status } }); loadCustomers(); }
  catch (e) { alert(e.message); }
}
async function deleteCustomer(c) {
  if (!confirm(`Delete customer "${c.name}"? This cascades to their reviews.`)) return;
  try { await api('/api/admin/customers/' + c.id, { method: 'DELETE' }); loadCustomers(); }
  catch (e) { alert(e.message); }
}
document.getElementById('custSearchForm').addEventListener('submit', (e) => { e.preventDefault(); loadCustomers(); });

// ---------- owners ----------
async function loadOwners() {
  const box = document.getElementById('ownerList');
  clear(box);
  try {
    const data = await api('/api/admin/owners');
    const rows = data.owners || [];
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No owners.' })); return; }
    const tbl = el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'ID' }), el('th', { text: 'Name' }), el('th', { text: 'Email' }), el('th', { text: 'Restaurants' }), el('th', { text: 'Status' }), el('th', { text: 'Actions' })])])]);
    const tb = el('tbody');
    rows.forEach((o) => tb.appendChild(el('tr', {}, [
      el('td', { text: o.id }),
      el('td', { text: o.name }),
      el('td', { text: o.email }),
      el('td', { text: o.restaurant_count != null ? o.restaurant_count : '-' }),
      el('td', {}, [el('span', { class: 'badge ' + (o.status === 'active' ? 'green' : 'red'), text: o.status })]),
      el('td', {}, [
        el('button', { class: 'secondary', text: o.status === 'active' ? 'Suspend' : 'Activate', onclick: () => toggleOwner(o) }),
        el('button', { class: 'btn-danger', text: 'Delete', onclick: () => deleteOwner(o) }),
      ]),
    ])));
    tbl.appendChild(tb); box.appendChild(tbl);
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: e.message })); }
}
document.getElementById('ownerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById('o_name').value.trim(),
    email: document.getElementById('o_email').value.trim(),
  };
  const pw = document.getElementById('o_password').value;
  if (pw) body.password = pw;
  try { await api('/api/admin/owners', { method: 'POST', body }); document.getElementById('ownerForm').reset(); loadOwners(); }
  catch (err) { alert(err.message); }
});
async function toggleOwner(o) {
  const status = o.status === 'active' ? 'suspended' : 'active';
  try { await api('/api/admin/owners/' + o.id, { method: 'PATCH', body: { status } }); loadOwners(); }
  catch (e) { alert(e.message); }
}
async function deleteOwner(o) {
  if (!confirm(`Delete owner "${o.name}"? This cascades to their restaurants, dishes and replies.`)) return;
  try { await api('/api/admin/owners/' + o.id, { method: 'DELETE' }); loadOwners(); loadRestaurants(); }
  catch (e) { alert(e.message); }
}

// ---------- restaurants ----------
async function loadRestaurants() {
  const box = document.getElementById('restList');
  clear(box);
  try {
    const data = await api('/api/admin/restaurants');
    const rows = data.restaurants || [];
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No restaurants.' })); return; }
    const tbl = el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'ID' }), el('th', { text: 'Name' }), el('th', { text: 'Owner' }), el('th', { text: 'Cuisine' }), el('th', { text: 'City' }), el('th', { text: 'Approved' }), el('th', { text: 'Actions' })])])]);
    const tb = el('tbody');
    rows.forEach((r) => tb.appendChild(el('tr', {}, [
      el('td', { text: r.id }),
      el('td', { text: r.name }),
      el('td', { text: r.owner_name || r.owner_id }),
      el('td', { text: r.cuisine || '-' }),
      el('td', { text: r.city || '-' }),
      el('td', {}, [el('span', { class: 'badge ' + (r.is_approved ? 'green' : 'amber'), text: r.is_approved ? 'approved' : 'pending' })]),
      el('td', {}, [
        el('button', { class: 'secondary', text: r.is_approved ? 'Un-approve' : 'Approve', onclick: () => toggleApprove(r) }),
        el('button', { class: 'btn-danger', text: 'Delete', onclick: () => deleteRestaurant(r) }),
      ]),
    ])));
    tbl.appendChild(tb); box.appendChild(tbl);
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: e.message })); }
}
async function toggleApprove(r) {
  try { await api('/api/admin/restaurants/' + r.id + '/approve', { method: 'PATCH', body: { is_approved: !r.is_approved } }); loadRestaurants(); }
  catch (e) { alert(e.message); }
}
async function deleteRestaurant(r) {
  if (!confirm(`Delete restaurant "${r.name}"?`)) return;
  try { await api('/api/admin/restaurants/' + r.id, { method: 'DELETE' }); loadRestaurants(); }
  catch (e) { alert(e.message); }
}

// ---------- reviews ----------
async function loadReviews() {
  const box = document.getElementById('revList');
  clear(box);
  const status = document.getElementById('rev_status').value;
  const params = status ? `?status=${status}` : '';
  try {
    const rows = await api('/api/admin/reviews' + params);
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No reviews.' })); return; }
    const tbl = el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'ID' }), el('th', { text: 'Restaurant' }), el('th', { text: 'Customer' }), el('th', { text: 'Rating' }), el('th', { text: 'Comment' }), el('th', { text: 'Status' }), el('th', { text: 'Actions' })])])]);
    const tb = el('tbody');
    rows.forEach((rv) => {
      const sel = el('select', {}, ['visible', 'hidden', 'flagged'].map((s) => el('option', { value: s, text: s })));
      sel.value = rv.status;
      sel.addEventListener('change', () => setReviewStatus(rv, sel.value));
      tb.appendChild(el('tr', {}, [
        el('td', { text: rv.id }),
        el('td', { text: rv.restaurant_name || rv.restaurant_id }),
        el('td', { text: rv.customer_name || rv.customer_id }),
        el('td', { text: '★'.repeat(rv.rating) }),
        el('td', { text: (rv.comment || '').slice(0, 60) }),
        el('td', {}, [sel]),
        el('td', {}, [el('button', { class: 'btn-danger', text: 'Delete', onclick: () => deleteReview(rv) })]),
      ]));
    });
    tbl.appendChild(tb); box.appendChild(tbl);
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: e.message })); }
}
async function setReviewStatus(rv, status) {
  try { await api('/api/admin/reviews/' + rv.id, { method: 'PATCH', body: { status } }); }
  catch (e) { alert(e.message); loadReviews(); }
}
async function deleteReview(rv) {
  if (!confirm('Delete this review?')) return;
  try { await api('/api/admin/reviews/' + rv.id, { method: 'DELETE' }); loadReviews(); }
  catch (e) { alert(e.message); }
}
document.getElementById('revFilterForm').addEventListener('submit', (e) => { e.preventDefault(); loadReviews(); });

init();
