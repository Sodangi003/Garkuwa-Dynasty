(async function () {
  const container = document.getElementById('announcements-list');
  try {
    const res = await fetch('/api/announcements', { headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      container.innerHTML = '<div class="locked-notice"><p>Announcements are private to signed-in family members.</p><p><a href="/login" class="btn small">Log in</a> <a href="/signup">or sign up</a></p></div>';
      return;
    }
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const announcements = await res.json();

    if (announcements.length === 0) {
      container.innerHTML = '<p class="empty-state">No announcements yet.</p>';
      return;
    }

    // newest first, same ordering the old server-rendered page used
    announcements.sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));

    container.innerHTML = '';
    announcements.forEach((a) => {
      const p = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = `[${a.date || ''}]`;
      p.appendChild(strong);
      p.appendChild(document.createTextNode(' ' + (a.title ? `${a.title}: ` : '') + a.message));
      container.appendChild(p);
    });
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Could not load announcements right now. Please try again later.</p>';
    console.error(err);
  }
})();
