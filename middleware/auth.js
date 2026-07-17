const crypto = require('crypto');
const { findById } = require('../lib/users');

// Blocks a route unless someone is logged in (any role). Re-checks the live
// user record on every request (not just the session cache) so a deleted
// account loses access immediately, and keeps req.session.role/name fresh
// in case an admin changed them elsewhere.
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.accepts(['html', 'json']) === 'html') return res.redirect('/login');
    return res.status(401).json({ error: 'Authentication required' });
  }

  let user;
  try {
    user = await findById(req.session.userId);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Authentication check failed' });
  }

  if (!user) {
    return req.session.destroy(() => {
      if (req.accepts(['html', 'json']) === 'html') return res.redirect('/login');
      res.status(401).json({ error: 'Authentication required' });
    });
  }

  req.session.role = user.role;
  req.session.name = user.name;
  req.currentUser = user;
  next();
}

// Blocks a route unless the logged-in user is specifically an admin
// (also via a fresh lookup, for the same reasons as requireAuth).
async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.accepts(['html', 'json']) === 'html') return res.redirect('/login');
    return res.status(401).json({ error: 'Authentication required' });
  }

  let user;
  try {
    user = await findById(req.session.userId);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Authentication check failed' });
  }

  if (!user) {
    return req.session.destroy(() => {
      if (req.accepts(['html', 'json']) === 'html') return res.redirect('/login');
      res.status(401).json({ error: 'Authentication required' });
    });
  }

  req.session.role = user.role;
  req.session.name = user.name;
  req.currentUser = user;

  if (user.role !== 'admin') {
    if (req.accepts(['html', 'json']) === 'html') return res.status(403).send('Admins only.');
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Issues (or reuses) a per-session CSRF token.
function issueCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return req.session.csrfToken;
}

// Requires a matching X-CSRF-Token header on state-changing requests.
// This stops a malicious page on another site from silently POSTing to
// our API using a logged-in user's session cookie.
function requireCsrf(req, res, next) {
  const headerToken = req.get('X-CSRF-Token');
  if (!req.session || !req.session.csrfToken || !headerToken || headerToken !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, issueCsrfToken, requireCsrf };
