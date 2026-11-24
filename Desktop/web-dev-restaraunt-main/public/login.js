// public/login.js — login + customer signup

function showMsg(elId, text, ok) {
  const box = document.getElementById(elId);
  box.innerHTML = '';
  if (!text) return;
  box.appendChild(el('div', { class: 'msg ' + (ok ? 'ok' : 'err'), text }));
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg('loginMsg', '');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  try {
    const user = await login(email, password);
    if (user.role === 'admin') location.href = '/admin.html';
    else if (user.role === 'owner') location.href = '/owner.html';
    else location.href = '/customer.html';
  } catch (err) {
    showMsg('loginMsg', err.message, false);
  }
});

document.getElementById('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg('regMsg', '');
  const name = document.getElementById('rname').value.trim();
  const email = document.getElementById('remail').value.trim();
  const password = document.getElementById('rpassword').value;
  try {
    await register(name, email, password);
    // auto-login after signup
    await login(email, password);
    location.href = '/customer.html';
  } catch (err) {
    showMsg('regMsg', err.message, false);
  }
});
