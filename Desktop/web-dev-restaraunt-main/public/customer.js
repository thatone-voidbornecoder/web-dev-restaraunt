// public/customer.js — browse restaurants, view dish/restaurant details,
// post/edit/delete reviews (customer only).

let ME = null;            // null = guest; otherwise the logged-in user
let currentRestaurant = null;
let filters = { cuisines: [], cities: [] };

async function init() {
  // Try to identify the visitor; guests can still browse.
  if (getToken()) {
    try { ME = await fetchMe(); } catch { ME = null; clearToken(); }
  }
  mountNav(ME || { name: 'Guest', role: 'guest' }, '/customer.html');
  if (ME && ME.role === 'customer') document.getElementById('myReviews').hidden = false;
  await loadFilters();
  const p = new URLSearchParams(location.search);
  ['q', 'cuisine', 'city'].forEach((k) => { if (p.get(k)) document.getElementById(k).value = p.get(k); });
  await doSearch();
  if (p.get('id')) showDetail(p.get('id'));
  if (ME && ME.role === 'customer') loadMyReviews();
}

async function loadFilters() {
  try {
    filters = await api('/api/customer/filters');
    const c = document.getElementById('cuisine');
    const city = document.getElementById('city');
    filters.cuisines.forEach((x) => c.appendChild(el('option', { value: x, text: x })));
    filters.cities.forEach((x) => city.appendChild(el('option', { value: x, text: x })));
  } catch (e) { /* ignore filter load failure */ }
}

async function doSearch() {
  const params = new URLSearchParams();
  const q = document.getElementById('q').value.trim();
  if (q) params.set('q', q);
  ['cuisine', 'city', 'price', 'minRating'].forEach((k) => {
    const v = document.getElementById(k).value;
    if (v) params.set(k, v);
  });
  const box = document.getElementById('results');
  clear(box);
  box.appendChild(el('p', { class: 'muted', text: 'Searching…' }));
  try {
    const rows = await api('/api/customer/restaurants/search?' + params.toString());
    document.getElementById('count').textContent = `${rows.length} restaurant(s) found`;
    clear(box);
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No matches.' })); return; }
    rows.forEach((r) => box.appendChild(restaurantCard(r)));
  } catch (e) {
    clear(box);
    box.appendChild(el('p', { class: 'empty', text: 'Failed to load: ' + e.message }));
  }
}

function restaurantCard(r) {
  const stars = r.avg_rating ? `${'★'.repeat(Math.round(r.avg_rating))} ${r.avg_rating}` : 'No rating';
  return el('div', { class: 'card', style: 'cursor:pointer', onclick: () => showDetail(r.id) }, [
    el('h3', { text: r.name }),
    el('p', { class: 'muted', text: [r.cuisine, r.city, r.price_range].filter(Boolean).join(' · ') }),
    el('p', { text: r.description || '' }),
    el('p', {}, [el('span', { class: 'stars', text: stars }), el('span', { class: 'muted', text: ` · ${r.review_count} review(s)` })]),
  ]);
}

async function showDetail(id) {
  const panel = document.getElementById('detail');
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth' });
  try {
    const r = await api('/api/customer/restaurants/' + id);
    currentRestaurant = r;
    document.getElementById('d_name').textContent = r.name;
    document.getElementById('d_meta').textContent =
      [r.cuisine, r.city, r.address, r.price_range, `Owner: ${r.owner_name}`].filter(Boolean).join(' · ');
    document.getElementById('d_desc').textContent = r.description || '';
    const star = r.avg_rating ? `${'★'.repeat(Math.round(r.avg_rating))} ${r.avg_rating} (${r.review_count})` : 'No reviews yet';
    document.getElementById('d_desc').appendChild(el('p', { class: 'muted', text: star }));
    await loadDishes(id);
    await loadReviews(id);
    // Review form visible only to logged-in customers
    const wrap = document.getElementById('reviewFormWrap');
    wrap.hidden = !(ME && ME.role === 'customer');
    resetReviewForm();
  } catch (e) {
    alert(e.message);
  }
}

function hideDetail() { document.getElementById('detail').hidden = true; }

async function loadDishes(restaurantId) {
  const box = document.getElementById('d_dishes');
  clear(box);
  try {
    const dishes = await api(`/api/customer/restaurants/${restaurantId}/dishes`);
    if (dishes.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No dishes listed.' })); return; }
    const tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Dish' }), el('th', { text: 'Category' }), el('th', { text: 'Dietary' }), el('th', { text: 'Price' })])]),
    ]);
    const tbody = el('tbody');
    dishes.forEach((d) => tbody.appendChild(el('tr', {}, [
      el('td', {}, [el('a', { href: '#', onclick: (e) => { e.preventDefault(); showDish(d.id); }, text: d.name })]),
      el('td', { text: d.category || '-' }),
      el('td', { text: d.dietary_tag || '-' }),
      el('td', { text: '$' + Number(d.price).toFixed(2) }),
    ])));
    tbl.appendChild(tbody);
    box.appendChild(tbl);
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: 'Could not load dishes.' })); }
}

async function showDish(id) {
  try {
    const d = await api('/api/customer/dishes/' + id);
    alert(`${d.name} — ${d.restaurant_name}\n${d.description || ''}\n$${Number(d.price).toFixed(2)} · ${d.category || ''} · ${d.dietary_tag || ''}`);
  } catch (e) { alert(e.message); }
}

async function loadReviews(restaurantId) {
  const box = document.getElementById('d_reviews');
  clear(box);
  try {
    const reviews = await api(`/api/customer/restaurants/${restaurantId}/reviews`);
    if (reviews.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'No reviews yet.' })); return; }
    reviews.forEach((rv) => box.appendChild(reviewCard(rv)));
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: 'Could not load reviews.' })); }
}

function reviewCard(rv) {
  const mine = ME && rv.customer_name === ME.name;
  return el('div', { class: 'card' }, [
    el('p', {}, [el('span', { class: 'stars', text: '★'.repeat(rv.rating) }), el('strong', { text: ' ' + rv.customer_name })]),
    el('p', { text: rv.comment || '' }),
    rv.owner_reply ? el('p', { class: 'muted', html: '<b>Owner reply:</b> ' + escapeHtml(rv.owner_reply) }) : null,
    el('p', { class: 'muted', text: new Date(rv.created_at).toLocaleString() }),
    mine ? el('p', {}, [
      el('button', { class: 'secondary', text: 'Edit', onclick: () => startEditReview(rv) }),
      el('button', { class: 'btn-danger', text: 'Delete', onclick: () => deleteReview(rv) }),
    ]) : null,
  ].filter(Boolean));
}

function resetReviewForm() {
  document.getElementById('rv_id').value = '';
  document.getElementById('rv_rating').value = '5';
  document.getElementById('rv_comment').value = '';
  document.getElementById('reviewFormTitle').textContent = 'Write a review';
  document.getElementById('rv_cancel').hidden = true;
}

function startEditReview(rv) {
  document.getElementById('reviewFormWrap').hidden = !(ME && ME.role === 'customer');
  document.getElementById('rv_id').value = rv.id;
  document.getElementById('rv_rating').value = String(rv.rating);
  document.getElementById('rv_comment').value = rv.comment || '';
  document.getElementById('reviewFormTitle').textContent = 'Edit your review';
  document.getElementById('rv_cancel').hidden = false;
  document.getElementById('reviewFormWrap').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('rv_cancel').addEventListener('click', resetReviewForm);

document.getElementById('reviewForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('rv_id').value;
  const body = {
    rating: Number(document.getElementById('rv_rating').value),
    comment: document.getElementById('rv_comment').value.trim(),
  };
  try {
    if (id) await api('/api/customer/reviews/' + id, { method: 'PUT', body });
    else await api(`/api/customer/restaurants/${currentRestaurant.id}/reviews`, { method: 'POST', body });
    resetReviewForm();
    await loadReviews(currentRestaurant.id);
    if (ME && ME.role === 'customer') loadMyReviews();
  } catch (err) { alert(err.message); }
});

async function deleteReview(rv) {
  if (!confirm('Delete your review?')) return;
  try {
    await api('/api/customer/reviews/' + rv.id, { method: 'DELETE' });
    await loadReviews(currentRestaurant.id);
    loadMyReviews();
  } catch (err) { alert(err.message); }
}

async function loadMyReviews() {
  const box = document.getElementById('myReviewsList');
  clear(box);
  try {
    const rows = await api('/api/customer/my/reviews');
    if (rows.length === 0) { box.appendChild(el('p', { class: 'empty', text: 'You have not posted any reviews.' })); return; }
    const tbl = el('table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Restaurant' }), el('th', { text: 'Rating' }), el('th', { text: 'Comment' }), el('th', { text: 'Status' }), el('th', { text: 'Actions' })])]),
    ]);
    const tbody = el('tbody');
    rows.forEach((rv) => tbody.appendChild(el('tr', {}, [
      el('td', {}, [el('a', { href: '#', onclick: (e) => { e.preventDefault(); showDetail(rv.restaurant_id); startEditReview(rv); }, text: rv.restaurant_name })]),
      el('td', { text: '★'.repeat(rv.rating) }),
      el('td', { text: rv.comment || '' }),
      el('td', {}, [el('span', { class: 'badge ' + (rv.status === 'visible' ? 'green' : 'amber'), text: rv.status })]),
      el('td', {}, [el('button', { class: 'secondary', text: 'Edit', onclick: () => showDetail(rv.restaurant_id) })]),
    ])));
    tbl.appendChild(tbody);
    box.appendChild(tbl);
  } catch (e) { box.appendChild(el('p', { class: 'empty', text: 'Could not load your reviews.' })); }
}

document.getElementById('searchForm').addEventListener('submit', (e) => { e.preventDefault(); doSearch(); });

init();
