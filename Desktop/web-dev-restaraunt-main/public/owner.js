// public/owner.js — restaurant + dish management, view reviews, reply.

let ME = null;
let activeRestaurant = null;   // the restaurant currently being managed

async function init() {
  ME = await requireAuth(['owner', 'admin']);
  if (!ME) return;
  if (ME.role !== 'owner') {
    document.querySelector('h2').textContent = 'Admins manage restaurants via the Admin panel';
    document.getElementById('restForm').style.display = 'none';
  }
  mountNav(ME, '/owner.html');
  await loadRestaurants();
}

// ---------- restaurants ----------
async function loadRestaurants() {
  const box = document.getElementById('restList');
  clear(box);
  try {
    const rows = await api('/api/owner/restaurants');
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'You have no restaurants yet.' })); return; }
    rows.forEach((r) => box.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: r.name }),
      el('p', { class: 'muted', text: [r.cuisine, r.city, r.price_range].filter(Boolean).join(' · ') }),
      el('p', { text: r.description || '' }),
      el('p', {}, [el('span', { class: 'stars', text: r.avg_rating ? `${r.avg_rating}` : '-' }), el('span', { class: 'muted', text: ` · ${r.review_count} review(s)` }), el('span', { class: 'badge ' + (r.is_approved ? 'green' : 'amber'), text: r.is_approved ? 'approved' : 'pending' })]),
      el('p', {}, [
        el('button', { text: 'Manage', onclick: () => openManage(r) }),
        el('button', { class: 'secondary', text: 'Edit', onclick: () => startEditRestaurant(r) }),
        el('button', { class: 'btn-danger', text: 'Delete', onclick: () => deleteRestaurant(r) }),
      ]),
    ])));
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: e.message })); }
}

document.getElementById('restForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('r_id').value;
  const body = {
    name: document.getElementById('r_name').value.trim(),
    cuisine: document.getElementById('r_cuisine').value.trim() || null,
    city: document.getElementById('r_city').value.trim() || null,
    address: document.getElementById('r_address').value.trim() || null,
    price_range: document.getElementById('r_price').value,
    description: document.getElementById('r_description').value.trim() || null,
  };
  try {
    if (id) await api('/api/owner/restaurants/' + id, { method: 'PUT', body });
    else await api('/api/owner/restaurants', { method: 'POST', body });
    resetRestForm();
    await loadRestaurants();
  } catch (err) { alert(err.message); }
});

function startEditRestaurant(r) {
  document.getElementById('r_id').value = r.id;
  document.getElementById('r_name').value = r.name;
  document.getElementById('r_cuisine').value = r.cuisine || '';
  document.getElementById('r_city').value = r.city || '';
  document.getElementById('r_address').value = r.address || '';
  document.getElementById('r_price').value = r.price_range || '$$';
  document.getElementById('r_description').value = r.description || '';
  document.getElementById('formTitle').textContent = 'Edit restaurant';
  document.getElementById('restSubmit').textContent = 'Save changes';
  document.getElementById('restReset').hidden = false;
  document.getElementById('restForm').scrollIntoView({ behavior: 'smooth' });
}

function resetRestForm() {
  document.getElementById('restForm').reset();
  document.getElementById('r_id').value = '';
  document.getElementById('formTitle').textContent = 'Add a restaurant';
  document.getElementById('restSubmit').textContent = 'Add restaurant';
  document.getElementById('restReset').hidden = true;
}
document.getElementById('restReset').addEventListener('click', resetRestForm);

async function deleteRestaurant(r) {
  if (!confirm(`Delete "${r.name}"? This also removes its dishes and reviews.`)) return;
  try { await api('/api/owner/restaurants/' + r.id, { method: 'DELETE' }); await loadRestaurants(); }
  catch (e) { alert(e.message); }
}

// ---------- manage a restaurant (dishes + reviews) ----------
async function openManage(r) {
  activeRestaurant = r;
  const panel = document.getElementById('manage');
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('m_title').textContent = r.name;
  resetDishForm();
  await loadDishes(r.id);
  await loadOwnerReviews(r.id);
}
function closeManage() { document.getElementById('manage').hidden = true; activeRestaurant = null; }

async function loadDishes(restaurantId) {
  const box = document.getElementById('dishList');
  clear(box);
  try {
    const rows = await api(`/api/owner/restaurants/${restaurantId}/dishes`);
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No dishes yet.' })); return; }
    const tbl = el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', { text: 'Dish' }), el('th', { text: 'Category' }), el('th', { text: 'Dietary' }), el('th', { text: 'Price' }), el('th', { text: 'Actions' })])])]);
    const tb = el('tbody');
    rows.forEach((d) => tb.appendChild(el('tr', {}, [
      el('td', { text: d.name }),
      el('td', { text: d.category || '-' }),
      el('td', { text: d.dietary_tag || '-' }),
      el('td', { text: '$' + Number(d.price).toFixed(2) }),
      el('td', {}, [
        el('button', { class: 'secondary', text: 'Edit', onclick: () => startEditDish(d) }),
        el('button', { class: 'btn-danger', text: 'Delete', onclick: () => deleteDish(d) }),
      ]),
    ])));
    tbl.appendChild(tb); box.appendChild(tbl);
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: e.message })); }
}

document.getElementById('dishForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeRestaurant) return;
  const id = document.getElementById('d_id').value;
  const body = {
    name: document.getElementById('d_name').value.trim(),
    price: Number(document.getElementById('d_price').value),
    category: document.getElementById('d_category').value.trim() || null,
    dietary_tag: document.getElementById('d_dietary').value.trim() || null,
    description: document.getElementById('d_description').value.trim() || null,
  };
  try {
    if (id) await api('/api/owner/dishes/' + id, { method: 'PUT', body });
    else await api(`/api/owner/restaurants/${activeRestaurant.id}/dishes`, { method: 'POST', body });
    resetDishForm();
    await loadDishes(activeRestaurant.id);
  } catch (err) { alert(err.message); }
});

function startEditDish(d) {
  document.getElementById('d_id').value = d.id;
  document.getElementById('d_name').value = d.name;
  document.getElementById('d_price').value = d.price;
  document.getElementById('d_category').value = d.category || '';
  document.getElementById('d_dietary').value = d.dietary_tag || '';
  document.getElementById('d_description').value = d.description || '';
  document.getElementById('dishSubmit').textContent = 'Save dish';
  document.getElementById('dishReset').hidden = false;
}
function resetDishForm() {
  document.getElementById('dishForm').reset();
  document.getElementById('d_id').value = '';
  document.getElementById('dishSubmit').textContent = 'Add dish';
  document.getElementById('dishReset').hidden = true;
}
document.getElementById('dishReset').addEventListener('click', resetDishForm);

async function deleteDish(d) {
  if (!confirm(`Delete dish "${d.name}"?`)) return;
  try { await api('/api/owner/dishes/' + d.id, { method: 'DELETE' }); await loadDishes(activeRestaurant.id); }
  catch (e) { alert(e.message); }
}

// ---------- reviews + reply ----------
async function loadOwnerReviews(restaurantId) {
  const box = document.getElementById('reviewList');
  clear(box);
  try {
    const rows = await api(`/api/owner/restaurants/${restaurantId}/reviews`);
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No reviews yet.' })); return; }
    rows.forEach((rv) => {
      const replyWrap = el('form', { class: 'field', onsubmit: async (e) => {
        e.preventDefault();
        const text = replyWrap.querySelector('textarea').value.trim();
        if (!text) return;
        try { await api('/api/owner/reviews/' + rv.id + '/replies', { method: 'POST', body: { reply_text: text } }); await loadOwnerReviews(restaurantId); }
        catch (err) { alert(err.message); }
      }}, [
        el('label', { text: rv.owner_reply ? 'Update your reply' : 'Reply to this review' }),
        el('textarea', { rows: 2, placeholder: 'Write a reply…' }, [rv.owner_reply || '']),
        el('button', { type: 'submit', text: rv.owner_reply ? 'Update reply' : 'Post reply' }),
      ]);
      box.appendChild(el('div', { class: 'card' }, [
        el('p', {}, [el('span', { class: 'stars', text: '★'.repeat(rv.rating) }), el('strong', { text: ' ' + rv.customer_name }), el('span', { class: 'badge ' + (rv.status === 'visible' ? 'green' : 'amber'), text: rv.status })]),
        el('p', { text: rv.comment || '' }),
        rv.owner_reply ? el('p', { class: 'muted', html: '<b>Your reply:</b> ' + escapeHtml(rv.owner_reply) }) : null,
        el('p', { class: 'muted', text: new Date(rv.created_at).toLocaleString() }),
        replyWrap,
      ].filter(Boolean)));
    });
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: e.message })); }
}

init();
