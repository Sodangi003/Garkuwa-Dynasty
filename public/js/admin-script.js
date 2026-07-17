(function () {
  const views = {
    dashboard: document.getElementById('view-dashboard'),
    members: document.getElementById('view-members'),
    events: document.getElementById('view-events'),
    announcements: document.getElementById('view-announcements'),
    gallery: document.getElementById('view-gallery'),
    accounts: document.getElementById('view-accounts')
  };
  const navButtons = {
    dashboard: document.getElementById('btn-dashboard'),
    members: document.getElementById('btn-members'),
    events: document.getElementById('btn-events'),
    announcements: document.getElementById('btn-announcements'),
    gallery: document.getElementById('btn-gallery'),
    accounts: document.getElementById('btn-accounts')
  };
  const errorBanner = document.getElementById('error-banner');
  const successBanner = document.getElementById('success-banner');

  function show(view) {
    Object.values(views).forEach((v) => v.classList.add('hidden'));
    views[view].classList.remove('hidden');
    Object.values(navButtons).forEach((b) => b.classList.remove('active'));
    navButtons[view].classList.add('active');
  }

  navButtons.dashboard.onclick = () => show('dashboard');
  navButtons.members.onclick = () => { show('members'); loadMembers(); };
  navButtons.events.onclick = () => { show('events'); loadEvents(); };
  navButtons.announcements.onclick = () => { show('announcements'); loadAnnouncements(); };
  navButtons.gallery.onclick = () => { show('gallery'); loadGallery(); };
  navButtons.accounts.onclick = () => { show('accounts'); loadAccounts(); };

  document.getElementById('open-members').onclick = () => { show('members'); loadMembers(); };
  document.getElementById('open-events').onclick = () => { show('events'); loadEvents(); };
  document.getElementById('open-announcements').onclick = () => { show('announcements'); loadAnnouncements(); };
  document.getElementById('open-gallery').onclick = () => { show('gallery'); loadGallery(); };
  document.getElementById('open-accounts').onclick = () => { show('accounts'); loadAccounts(); };

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
    setTimeout(() => errorBanner.classList.add('hidden'), 5000);
  }

  function showSuccess(msg) {
    successBanner.textContent = msg;
    successBanner.classList.remove('hidden');
    setTimeout(() => successBanner.classList.add('hidden'), 4000);
  }

  let csrfToken = null;
  async function ensureCsrf() {
    if (csrfToken) return csrfToken;
    const res = await fetch('/api/csrf-token', { headers: { Accept: 'application/json' } });
    if (res.status === 401) { window.location.href = '/login'; return null; }
    const data = await res.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  }

  async function api(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (method !== 'GET') {
      const token = await ensureCsrf();
      if (token) headers['X-CSRF-Token'] = token;
    }
    const res = await fetch(path, { headers, ...options });
    if (res.status === 401) { window.location.href = '/login'; return null; }
    if (res.status === 403) {
      // CSRF token was rejected (e.g. session changed) - clear it so the next call refreshes it.
      csrfToken = null;
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Security check failed, please try again.');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function refreshCounts() {
    try {
      const [members, events, announcements, gallery, accounts] = await Promise.all([
        api('/api/members'),
        api('/api/events'),
        api('/api/announcements'),
        api('/api/gallery'),
        api('/api/users')
      ]);
      document.getElementById('count-members').textContent = 'Members: ' + members.length;
      document.getElementById('count-events').textContent = 'Events: ' + events.length;
      document.getElementById('count-announcements').textContent = 'Announcements: ' + announcements.length;
      document.getElementById('count-gallery').textContent = 'Photos: ' + gallery.length;
      document.getElementById('count-accounts').textContent = 'Family Accounts: ' + accounts.length;
    } catch (err) {
      showError('Could not load dashboard counts: ' + err.message);
    }
  }

  // ---------- Members ----------
  const membersTbody = document.getElementById('members-tbody');

  async function loadMembers() {
    try {
      const members = await api('/api/members');
      membersTbody.innerHTML = '';
      members.forEach((m) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.relation || '')}</td><td>${escapeHtml(m.contact || '')}</td>` +
          `<td><button class='ghost small' data-id='${m.id}' data-action='edit'>Edit</button> <button class='btn small' data-id='${m.id}' data-action='delete'>Delete</button></td>`;
        membersTbody.appendChild(tr);
      });
      refreshCounts();
    } catch (err) {
      showError('Could not load members: ' + err.message);
    }
  }

  document.getElementById('add-member-btn').onclick = () => {
    document.getElementById('member-form-title').textContent = 'Add Member';
    document.getElementById('member-form').classList.remove('hidden');
  };
  document.getElementById('cancel-member').onclick = () => {
    document.getElementById('member-form').classList.add('hidden');
    clearMemberForm();
  };
  function clearMemberForm() {
    document.getElementById('m-name').value = '';
    document.getElementById('m-relation').value = '';
    document.getElementById('m-contact').value = '';
    document.getElementById('save-member').dataset.edit = '';
  }

  document.getElementById('save-member').onclick = async () => {
    const name = document.getElementById('m-name').value.trim();
    if (!name) { alert('Please enter a name'); return; }
    const relation = document.getElementById('m-relation').value.trim();
    const contact = document.getElementById('m-contact').value.trim();
    const editId = document.getElementById('save-member').dataset.edit;
    try {
      if (editId) {
        await api(`/api/members/${editId}`, { method: 'PUT', body: JSON.stringify({ name, relation, contact }) });
      } else {
        await api('/api/members', { method: 'POST', body: JSON.stringify({ name, relation, contact }) });
      }
      document.getElementById('member-form').classList.add('hidden');
      clearMemberForm();
      loadMembers();
    } catch (err) {
      showError('Could not save member: ' + err.message);
    }
  };

  membersTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'edit') {
      try {
        const members = await api('/api/members');
        const m = members.find((x) => x.id === id);
        if (!m) return;
        document.getElementById('member-form-title').textContent = 'Edit Member';
        document.getElementById('m-name').value = m.name;
        document.getElementById('m-relation').value = m.relation || '';
        document.getElementById('m-contact').value = m.contact || '';
        document.getElementById('save-member').dataset.edit = id;
        document.getElementById('member-form').classList.remove('hidden');
      } catch (err) {
        showError('Could not load member: ' + err.message);
      }
    } else if (action === 'delete') {
      if (confirm('Delete this member?')) {
        try {
          await api(`/api/members/${id}`, { method: 'DELETE' });
          loadMembers();
        } catch (err) {
          showError('Could not delete member: ' + err.message);
        }
      }
    }
  });

  // ---------- Events ----------
  const eventsTbody = document.getElementById('events-tbody');

  async function loadEvents() {
    try {
      const events = await api('/api/events');
      eventsTbody.innerHTML = '';
      events.forEach((ev) => {
        const tr = document.createElement('tr');
        const whenDisplay = ev.startISO
          ? new Date(ev.startISO).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
          : (ev.date || '');
        tr.innerHTML = `<td>${escapeHtml(ev.title)}</td><td>${escapeHtml(whenDisplay)}</td><td>${escapeHtml(ev.location || '')}</td>` +
          `<td><button class='ghost small' data-id='${ev.id}' data-action='edit'>Edit</button> <button class='btn small' data-id='${ev.id}' data-action='delete'>Delete</button></td>`;
        eventsTbody.appendChild(tr);
      });
      refreshCounts();
    } catch (err) {
      showError('Could not load events: ' + err.message);
    }
  }

  document.getElementById('add-event-btn').onclick = () => {
    document.getElementById('event-form-title').textContent = 'Add Event';
    document.getElementById('event-form').classList.remove('hidden');
  };
  document.getElementById('cancel-event').onclick = () => {
    document.getElementById('event-form').classList.add('hidden');
    clearEventForm();
  };
  function clearEventForm() {
    document.getElementById('e-title').value = '';
    document.getElementById('e-date').value = '';
    document.getElementById('e-location').value = '';
    document.getElementById('e-desc').value = '';
    document.getElementById('save-event').dataset.edit = '';
  }

  document.getElementById('save-event').onclick = async () => {
    const title = document.getElementById('e-title').value.trim();
    if (!title) { alert('Enter event title'); return; }
    const startISO = document.getElementById('e-date').value;
    const location = document.getElementById('e-location').value.trim();
    const desc = document.getElementById('e-desc').value.trim();
    const editId = document.getElementById('save-event').dataset.edit;
    try {
      if (editId) {
        await api(`/api/events/${editId}`, { method: 'PUT', body: JSON.stringify({ title, startISO, location, desc }) });
      } else {
        await api('/api/events', { method: 'POST', body: JSON.stringify({ title, startISO, location, desc }) });
      }
      document.getElementById('event-form').classList.add('hidden');
      clearEventForm();
      loadEvents();
    } catch (err) {
      showError('Could not save event: ' + err.message);
    }
  };

  eventsTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'edit') {
      try {
        const events = await api('/api/events');
        const ev = events.find((x) => x.id === id);
        if (!ev) return;
        document.getElementById('e-title').value = ev.title;
        document.getElementById('e-date').value = ev.startISO || '';
        document.getElementById('e-location').value = ev.location || '';
        document.getElementById('e-desc').value = ev.desc || '';
        document.getElementById('save-event').dataset.edit = id;
        document.getElementById('event-form').classList.remove('hidden');
      } catch (err) {
        showError('Could not load event: ' + err.message);
      }
    } else if (action === 'delete') {
      if (confirm('Delete this event?')) {
        try {
          await api(`/api/events/${id}`, { method: 'DELETE' });
          loadEvents();
        } catch (err) {
          showError('Could not delete event: ' + err.message);
        }
      }
    }
  });

  // ---------- Announcements ----------
  const annTbody = document.getElementById('ann-tbody');

  async function loadAnnouncements() {
    try {
      const anns = await api('/api/announcements');
      annTbody.innerHTML = '';
      anns.forEach((a) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${escapeHtml(a.date || '')}</td><td>${escapeHtml(a.title || '')}</td><td>${escapeHtml(a.message)}</td>` +
          `<td><button class='ghost small' data-id='${a.id}' data-action='edit'>Edit</button> <button class='btn small' data-id='${a.id}' data-action='delete'>Delete</button></td>`;
        annTbody.appendChild(tr);
      });
      refreshCounts();
    } catch (err) {
      showError('Could not load announcements: ' + err.message);
    }
  }

  document.getElementById('add-ann-btn').onclick = () => {
    document.getElementById('ann-form-title').textContent = 'New Announcement';
    document.getElementById('ann-form').classList.remove('hidden');
  };
  document.getElementById('cancel-ann').onclick = () => {
    document.getElementById('ann-form').classList.add('hidden');
    clearAnnForm();
  };
  function clearAnnForm() {
    document.getElementById('a-title').value = '';
    document.getElementById('a-msg').value = '';
    document.getElementById('save-ann').dataset.edit = '';
  }

  document.getElementById('save-ann').onclick = async () => {
    const title = document.getElementById('a-title').value.trim();
    const message = document.getElementById('a-msg').value.trim();
    if (!message) { alert('Enter a message'); return; }
    const editId = document.getElementById('save-ann').dataset.edit;
    try {
      if (editId) {
        await api(`/api/announcements/${editId}`, { method: 'PUT', body: JSON.stringify({ title, message }) });
      } else {
        const date = new Date().toLocaleDateString('en-GB').split('/').join('/');
        await api('/api/announcements', { method: 'POST', body: JSON.stringify({ title, message, date }) });
      }
      document.getElementById('ann-form').classList.add('hidden');
      clearAnnForm();
      loadAnnouncements();
    } catch (err) {
      showError('Could not save announcement: ' + err.message);
    }
  };

  annTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    if (action === 'edit') {
      try {
        const anns = await api('/api/announcements');
        const a = anns.find((x) => x.id === id);
        if (!a) return;
        document.getElementById('a-title').value = a.title || '';
        document.getElementById('a-msg').value = a.message;
        document.getElementById('save-ann').dataset.edit = id;
        document.getElementById('ann-form').classList.remove('hidden');
      } catch (err) {
        showError('Could not load announcement: ' + err.message);
      }
    } else if (action === 'delete') {
      if (confirm('Delete this announcement?')) {
        try {
          await api(`/api/announcements/${id}`, { method: 'DELETE' });
          loadAnnouncements();
        } catch (err) {
          showError('Could not delete announcement: ' + err.message);
        }
      }
    }
  });

  // ---------- Gallery ----------
  const galleryGrid = document.getElementById('admin-gallery-grid');
  const photoInput = document.getElementById('photo-input');
  const uploadStatus = document.getElementById('upload-status');

  async function loadGallery() {
    try {
      const images = await api('/api/gallery');
      galleryGrid.innerHTML = '';
      if (images.length === 0) {
        galleryGrid.innerHTML = '<p class="empty-state" style="grid-column:1/-1">No photos yet. Upload some above.</p>';
      } else {
        images.forEach((filename) => {
          const item = document.createElement('div');
          item.className = 'admin-gallery-item';
          const img = document.createElement('img');
          img.src = '/images/' + encodeURIComponent(filename);
          img.alt = filename;
          item.appendChild(img);
          const removeBtn = document.createElement('button');
          removeBtn.className = 'remove-photo';
          removeBtn.type = 'button';
          removeBtn.setAttribute('aria-label', 'Delete photo');
          removeBtn.textContent = '\u00D7';
          removeBtn.dataset.filename = filename;
          item.appendChild(removeBtn);
          galleryGrid.appendChild(item);
        });
      }
      refreshCounts();
    } catch (err) {
      showError('Could not load gallery: ' + err.message);
    }
  }

  galleryGrid.addEventListener('click', async (e) => {
    const btn = e.target.closest('button.remove-photo');
    if (!btn) return;
    if (!confirm('Delete this photo?')) return;
    try {
      const token = await ensureCsrf();
      const res = await fetch(`/api/gallery/${encodeURIComponent(btn.dataset.filename)}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': token, Accept: 'application/json' }
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Delete failed');
      }
      loadGallery();
    } catch (err) {
      showError('Could not delete photo: ' + err.message);
    }
  });

  document.getElementById('upload-photos-btn').onclick = async () => {
    const files = photoInput.files;
    if (!files || files.length === 0) {
      alert('Choose one or more photos first');
      return;
    }
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append('photos', f));

    uploadStatus.textContent = 'Uploading...';
    try {
      const token = await ensureCsrf();
      const res = await fetch('/api/gallery/upload', {
        method: 'POST',
        headers: { 'X-CSRF-Token': token, Accept: 'application/json' },
        body: formData
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Upload failed');
      uploadStatus.textContent = '';
      photoInput.value = '';
      showSuccess(`Uploaded ${body.uploaded.length} photo(s).`);
      loadGallery();
    } catch (err) {
      uploadStatus.textContent = '';
      showError('Could not upload photos: ' + err.message);
    }
  };

  // ---------- Accounts ----------
  const accountsTbody = document.getElementById('accounts-tbody');
  let myUserId = null;

  async function loadAccounts() {
    try {
      const [me, accounts] = await Promise.all([
        fetch('/api/me', { headers: { Accept: 'application/json' } }).then((r) => r.json()),
        api('/api/users')
      ]);
      myUserId = me ? me.id : null;

      accountsTbody.innerHTML = '';
      accounts.forEach((u) => {
        const tr = document.createElement('tr');
        const isMe = u.id === myUserId;
        const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '';
        const roleLabel = u.role === 'admin' ? 'Admin' : 'Member';

        const roleToggleLabel = u.role === 'admin' ? 'Remove admin' : 'Make admin';
        const roleToggleValue = u.role === 'admin' ? 'member' : 'admin';

        tr.innerHTML = `<td>${escapeHtml(u.name)}${isMe ? ' <span class="small" style="color:var(--muted)">(you)</span>' : ''}</td>` +
          `<td>${escapeHtml(u.email)}</td>` +
          `<td>${roleLabel}</td>` +
          `<td>${escapeHtml(joined)}</td>` +
          `<td>` +
          `<button class='ghost small' data-id='${u.id}' data-action='role' data-role='${roleToggleValue}' ${isMe ? 'disabled title="Ask another admin to change your role"' : ''}>${roleToggleLabel}</button> ` +
          `<button class='btn small' data-id='${u.id}' data-action='delete' ${isMe ? 'disabled title="You can\'t delete your own account here"' : ''}>Delete</button>` +
          `</td>`;
        accountsTbody.appendChild(tr);
      });
      refreshCounts();
    } catch (err) {
      showError('Could not load accounts: ' + err.message);
    }
  }

  accountsTbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'role') {
      const role = btn.dataset.role;
      const verb = role === 'admin' ? 'Give this person admin access?' : 'Remove admin access from this person?';
      if (!confirm(verb)) return;
      try {
        await api(`/api/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
        loadAccounts();
      } catch (err) {
        showError('Could not update role: ' + err.message);
      }
    } else if (action === 'delete') {
      if (!confirm('Delete this account? They will need to sign up again to regain access.')) return;
      try {
        await api(`/api/users/${id}`, { method: 'DELETE' });
        loadAccounts();
      } catch (err) {
        showError('Could not delete account: ' + err.message);
      }
    }
  });

  // Initial load
  refreshCounts();
})();
