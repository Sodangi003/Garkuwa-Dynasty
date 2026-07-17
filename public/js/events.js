(async function () {
  const container = document.getElementById('events-list');

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  function relativeLabel(date) {
    const diffMs = date.getTime() - Date.now();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (Math.abs(diffDays) < 1) {
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      return rtf.format(diffHours, 'hour');
    }
    return rtf.format(diffDays, 'day');
  }

  function renderEvent(ev, isPast) {
    const wrap = document.createElement('div');
    wrap.className = 'event-item' + (isPast ? ' past' : '');

    const titleRow = document.createElement('div');
    titleRow.className = 'event-title-row';

    const title = document.createElement('span');
    title.className = 'event-title';
    title.textContent = ev.title;
    titleRow.appendChild(title);

    if (ev.startISO) {
      const when = document.createElement('span');
      when.className = 'event-when';
      const d = new Date(ev.startISO);
      when.textContent = dateFormatter.format(d);
      const badge = document.createElement('span');
      badge.className = 'event-relative';
      badge.textContent = relativeLabel(d);
      when.appendChild(badge);
      titleRow.appendChild(when);
    } else if (ev.date) {
      const when = document.createElement('span');
      when.className = 'event-when';
      when.textContent = ev.date;
      titleRow.appendChild(when);
    }

    wrap.appendChild(titleRow);

    const metaParts = [ev.location, ev.desc].filter(Boolean);
    if (metaParts.length) {
      const meta = document.createElement('p');
      meta.className = 'event-meta';
      meta.textContent = metaParts.join(' · ');
      wrap.appendChild(meta);
    }

    return wrap;
  }

  try {
    const res = await fetch('/api/events', { headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      container.innerHTML = '<div class="locked-notice"><p>Event details are private to signed-in family members.</p><p><a href="/login" class="btn small">Log in</a> <a href="/signup">or sign up</a></p></div>';
      return;
    }
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    const events = await res.json();

    if (events.length === 0) {
      container.innerHTML = '<p class="empty-state">No events right now.</p>';
      return;
    }

    const now = Date.now();
    const withDates = events.filter((e) => e.startISO);
    const withoutDates = events.filter((e) => !e.startISO);

    const upcoming = withDates.filter((e) => new Date(e.startISO).getTime() >= now)
      .sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
    const past = withDates.filter((e) => new Date(e.startISO).getTime() < now)
      .sort((a, b) => new Date(b.startISO) - new Date(a.startISO));

    container.innerHTML = '';

    if (upcoming.length) {
      const h = document.createElement('h3');
      h.className = 'events-section-title';
      h.textContent = 'Upcoming';
      container.appendChild(h);
      upcoming.forEach((e) => container.appendChild(renderEvent(e, false)));
    }

    if (withoutDates.length) {
      const h = document.createElement('h3');
      h.className = 'events-section-title';
      h.textContent = upcoming.length || past.length ? 'Other' : 'Events';
      container.appendChild(h);
      withoutDates.forEach((e) => container.appendChild(renderEvent(e, false)));
    }

    if (past.length) {
      const h = document.createElement('h3');
      h.className = 'events-section-title';
      h.textContent = 'Past';
      container.appendChild(h);
      past.forEach((e) => container.appendChild(renderEvent(e, true)));
    }
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Could not load events right now. Please try again later.</p>';
    console.error(err);
  }
})();
