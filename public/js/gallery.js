(async function () {
  const container = document.getElementById('gallery-content');
  let images = [];
  let currentIndex = 0;
  let overlay = null;

  function openLightbox(index) {
    currentIndex = index;
    overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';

    const img = document.createElement('img');
    img.src = '/images/' + encodeURIComponent(images[currentIndex]);
    img.alt = 'Garkuwa family photo';
    overlay.appendChild(img);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lightbox-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', closeLightbox);
    overlay.appendChild(closeBtn);

    if (images.length > 1) {
      const prevBtn = document.createElement('button');
      prevBtn.className = 'lightbox-nav lightbox-prev';
      prevBtn.setAttribute('aria-label', 'Previous photo');
      prevBtn.textContent = '\u2039';
      prevBtn.addEventListener('click', () => showIndex(currentIndex - 1));
      overlay.appendChild(prevBtn);

      const nextBtn = document.createElement('button');
      nextBtn.className = 'lightbox-nav lightbox-next';
      nextBtn.setAttribute('aria-label', 'Next photo');
      nextBtn.textContent = '\u203A';
      nextBtn.addEventListener('click', () => showIndex(currentIndex + 1));
      overlay.appendChild(nextBtn);
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });
    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(overlay);
  }

  function showIndex(index) {
    currentIndex = (index + images.length) % images.length;
    const img = overlay.querySelector('img');
    img.src = '/images/' + encodeURIComponent(images[currentIndex]);
  }

  function closeLightbox() {
    if (overlay) { overlay.remove(); overlay = null; }
    document.removeEventListener('keydown', onKeydown);
  }

  function onKeydown(e) {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') showIndex(currentIndex - 1);
    else if (e.key === 'ArrowRight') showIndex(currentIndex + 1);
  }

  try {
    const res = await fetch('/api/gallery', { headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      container.innerHTML = '<div class="locked-notice"><p>The photo gallery is private to signed-in family members.</p><p><a href="/login" class="btn small">Log in</a> <a href="/signup">or sign up</a></p></div>';
      return;
    }
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    images = await res.json();

    if (images.length === 0) {
      container.innerHTML = '<p class="empty-state">No photos uploaded yet. Add some from the <a href="/admin">admin dashboard</a>.</p>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'gallery';
    images.forEach((filename, i) => {
      const btn = document.createElement('button');
      btn.className = 'thumb';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'View photo ' + (i + 1));
      const img = document.createElement('img');
      img.src = '/images/' + encodeURIComponent(filename);
      img.alt = 'Garkuwa family photo';
      img.loading = 'lazy';
      btn.appendChild(img);
      btn.addEventListener('click', () => openLightbox(i));
      grid.appendChild(btn);
    });

    container.innerHTML = '';
    container.appendChild(grid);
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Could not load the gallery right now. Please try again later.</p>';
    console.error(err);
  }
})();
