(async function () {
  const container = document.getElementById('members-list');
  const AVATAR_COLORS = ['#4b3f72', '#7a4f8f', '#c2703d', '#3f7a6e', '#a24a5e', '#5c6bc0'];

  function colorFor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function initialsFor(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  try {
    const res = await fetch('/api/members', { headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      container.innerHTML = '<div class="locked-notice"><p>Member information is private to signed-in family members.</p><p><a href="/login" class="btn small">Log in</a> <a href="/signup">or sign up</a></p></div>';
      return;
    }
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const members = await res.json();

    if (members.length === 0) {
      container.innerHTML = '<p class="empty-state">No members added yet.</p>';
      return;
    }

    const ul = document.createElement('ul');
    members.forEach((m) => {
      const li = document.createElement('li');

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.style.background = colorFor(m.name || '?');
      avatar.textContent = initialsFor(m.name || '?');
      li.appendChild(avatar);

      const details = document.createElement('div');
      details.className = 'member-details';

      const nameEl = document.createElement('div');
      nameEl.className = 'member-name';
      nameEl.textContent = m.name;
      details.appendChild(nameEl);

      if (m.relation) {
        const relEl = document.createElement('div');
        relEl.className = 'member-relation';
        relEl.textContent = m.relation;
        details.appendChild(relEl);
      }

      if (m.contact) {
        const p = document.createElement('p');
        p.textContent = m.contact;
        details.appendChild(p);
      }

      li.appendChild(details);
      ul.appendChild(li);
    });

    container.innerHTML = '';
    container.appendChild(ul);
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Could not load members right now. Please try again later.</p>';
    console.error(err);
  }
})();
