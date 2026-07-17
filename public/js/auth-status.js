(async function () {
  const slot = document.getElementById('nav-auth-slot');
  if (!slot) return;

  try {
    const res = await fetch('/api/me', { headers: { Accept: 'application/json' } });
    const me = res.ok ? await res.json() : null;

    if (!me) {
      slot.innerHTML = '<a href="/login">Log in</a> <a href="/signup" class="nav-signup">Sign up</a>';
      return;
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'nav-greeting';
    nameSpan.textContent = 'Hi, ' + me.name;
    slot.appendChild(nameSpan);

    if (me.role === 'admin') {
      const adminLink = document.createElement('a');
      adminLink.href = '/admin';
      adminLink.textContent = 'Admin';
      slot.appendChild(adminLink);
    }

    const form = document.createElement('form');
    form.action = '/logout';
    form.method = 'POST';
    form.style.display = 'inline';
    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'nav-logout';
    btn.textContent = 'Log out';
    form.appendChild(btn);
    slot.appendChild(form);
  } catch (err) {
    console.error(err);
  }
})();
