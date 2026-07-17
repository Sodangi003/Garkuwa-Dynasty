(function () {
  const form = document.getElementById('contactForm');
  const statusDiv = document.getElementById('contactStatus');
  const sendBtn = document.getElementById('sendBtn');

  if (!form) return;

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    statusDiv.textContent = '';

    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const message = form.message.value.trim();

    if (!name || !email) {
      statusDiv.textContent = 'Please provide your name and email.';
      statusDiv.style.color = 'red';
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const resp = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Server error');
      }

      await resp.json();
      statusDiv.textContent = 'Thanks! Your message was sent.';
      statusDiv.style.color = 'green';
      form.reset();
    } catch (err) {
      statusDiv.textContent = 'Failed to send message: ' + (err.message || err);
      statusDiv.style.color = 'red';
      console.error(err);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
  });
})();
