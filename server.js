require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const multer = require('multer');
const fsSync = require('fs');
const fs = require('fs').promises;
const path = require('path');

const { requireAuth, requireAdmin, issueCsrfToken, requireCsrf } = require('./middleware/auth');
const loginAttempts = require('./lib/login-attempts');
const { readUsers, writeUsers, findByLogin, findById } = require('./lib/users');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname);
const DATA_DIR = path.join(ROOT, 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

fsSync.mkdirSync(IMAGES_DIR, { recursive: true });

// If you deploy behind a reverse proxy (nginx, Render, Heroku, etc.), uncomment
// this so secure cookies and rate limiting see the real client IP/protocol:
// app.set('trust proxy', 1);

// ---------- admin bootstrap credentials ----------
// Set ADMIN_USERNAME / ADMIN_PASSWORD_HASH in .env for a permanent admin
// login. These are used to create (or keep in sync) the one admin account
// in data/users.json on startup -- after that, admin logs in the same way
// as everyone else, through the normal /login form.
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const EXPLICIT_ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH || null;
let ADMIN_PASSWORD_HASH = EXPLICIT_ADMIN_HASH;

if (!ADMIN_PASSWORD_HASH) {
  const generatedPassword = crypto.randomBytes(9).toString('base64url');
  ADMIN_PASSWORD_HASH = bcrypt.hashSync(generatedPassword, 12);
  console.log('\n================ ADMIN LOGIN (temporary) ================');
  console.log(`  Username: ${ADMIN_USERNAME}`);
  console.log(`  Password: ${generatedPassword}`);
  console.log('  This password changes every time the server restarts.');
  console.log('  Set a permanent one with:');
  console.log('    npm run hash-password -- "your-password"');
  console.log('  ...then put ADMIN_USERNAME and ADMIN_PASSWORD_HASH in .env');
  console.log('===========================================================\n');
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Creates the admin account in data/users.json if it doesn't exist yet, or
// keeps its role/password in sync if you've set an explicit hash in .env.
// Doesn't touch an existing admin's password if you're just running with
// the auto-generated temporary one (so restarts don't invalidate it).
async function ensureAdminUser() {
  const users = await readUsers();
  const identifier = ADMIN_USERNAME.toLowerCase();
  let admin = users.find((u) => u.email.toLowerCase() === identifier);
  let changed = false;

  if (!admin) {
    admin = {
      id: makeId(),
      name: 'Admin',
      email: ADMIN_USERNAME,
      passwordHash: ADMIN_PASSWORD_HASH,
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    users.push(admin);
    changed = true;
  } else {
    if (admin.role !== 'admin') { admin.role = 'admin'; changed = true; }
    if (EXPLICIT_ADMIN_HASH && admin.passwordHash !== EXPLICIT_ADMIN_HASH) {
      admin.passwordHash = EXPLICIT_ADMIN_HASH;
      changed = true;
    }
  }

  if (changed) await writeUsers(users);
}

// ---------- session secret ----------
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.log('WARNING: SESSION_SECRET not set in .env — using a random one for this run.');
  console.log('Everyone will be logged out whenever the server restarts until you set one.\n');
}

// ---------- core middleware ----------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // the views use some inline style="" attributes
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"]
    }
  }
}));
app.use(morgan(IS_PRODUCTION ? 'combined' : 'dev'));
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'garkuwa.sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PRODUCTION, // requires HTTPS in production
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  }
}));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));

// ---------- rate limiters ----------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please try again later.' }
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this network. Please try again later.' }
});

const contactFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many messages sent from this network. Please try again later.' }
});

// ---------- generic JSON "database" helpers (for site content, not users) ----------
function fileFor(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

async function readCollection(collection) {
  try {
    const txt = await fs.readFile(fileFor(collection), 'utf8');
    return JSON.parse(txt || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeCollection(collection, arr) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(fileFor(collection), JSON.stringify(arr, null, 2), 'utf8');
}

// Family content (members/events/announcements) is private: any logged-in
// family member can read it, but only an admin can add/edit/delete.
function crudRouter(collection, requiredFields) {
  const router = express.Router();

  router.get('/', requireAuth, async (req, res) => {
    try {
      res.json(await readCollection(collection));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: `failed reading ${collection}` });
    }
  });

  router.post('/', requireAdmin, requireCsrf, async (req, res) => {
    const missing = requiredFields.filter((f) => !req.body[f]);
    if (missing.length) {
      return res.status(400).json({ error: `missing field(s): ${missing.join(', ')}` });
    }
    try {
      const items = await readCollection(collection);
      const entry = { id: makeId(), ...req.body, createdAt: new Date().toISOString() };
      items.push(entry);
      await writeCollection(collection, items);
      res.status(201).json(entry);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: `failed saving to ${collection}` });
    }
  });

  router.put('/:id', requireAdmin, requireCsrf, async (req, res) => {
    try {
      const items = await readCollection(collection);
      const idx = items.findIndex((x) => x.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      items[idx] = { ...items[idx], ...req.body, id: items[idx].id };
      await writeCollection(collection, items);
      res.json(items[idx]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: `failed updating ${collection}` });
    }
  });

  router.delete('/:id', requireAdmin, requireCsrf, async (req, res) => {
    try {
      const items = await readCollection(collection);
      const next = items.filter((x) => x.id !== req.params.id);
      if (next.length === items.length) return res.status(404).json({ error: 'not found' });
      await writeCollection(collection, next);
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: `failed deleting from ${collection}` });
    }
  });

  return router;
}

app.use('/api/members', crudRouter('members', ['name']));
app.use('/api/events', crudRouter('events', ['title']));
app.use('/api/announcements', crudRouter('announcements', ['message']));

// Gallery listing is private too, same as the other family content.
app.get('/api/gallery', requireAuth, async (req, res) => {
  let images = [];
  try {
    const files = await fs.readdir(IMAGES_DIR);
    images = files.filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(err);
  }
  res.json(images);
});

// ---------- gallery photo upload (admin-only) ----------
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_IMAGE_EXT.has(ext) ? ext : '.jpg';
    const base = path.basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40) || 'photo';
    cb(null, `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${safeExt}`);
  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_IMAGE_EXT.has(ext)) {
      return cb(new Error('Only JPG, PNG, GIF, or WEBP images are allowed'));
    }
    cb(null, true);
  }
});

app.post('/api/gallery/upload', requireAdmin, requireCsrf, (req, res) => {
  imageUpload.array('photos', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    res.status(201).json({ uploaded: req.files.map((f) => f.filename) });
  });
});

app.delete('/api/gallery/:filename', requireAdmin, requireCsrf, async (req, res) => {
  const filename = path.basename(req.params.filename); // guards against path traversal
  try {
    await fs.unlink(path.join(IMAGES_DIR, filename));
    res.status(204).end();
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'not found' });
    console.error(err);
    res.status(500).json({ error: 'failed deleting image' });
  }
});

// Contacts are special: anyone (even a visitor who isn't logged in) can
// submit one -- that's the point of the contact form -- but only an admin
// can read or delete the submissions.
app.post('/api/contacts', contactFormLimiter, async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  try {
    const contacts = await readCollection('contacts');
    const entry = { id: makeId(), name, email, message: message || '', createdAt: new Date().toISOString() };
    contacts.push(entry);
    await writeCollection('contacts', contacts);
    res.status(201).json({ id: entry.id, createdAt: entry.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed saving contact' });
  }
});

app.get('/api/contacts', requireAdmin, async (req, res) => {
  try {
    res.json(await readCollection('contacts'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed reading contacts' });
  }
});

app.delete('/api/contacts/:id', requireAdmin, requireCsrf, async (req, res) => {
  try {
    const items = await readCollection('contacts');
    const next = items.filter((x) => x.id !== req.params.id);
    if (next.length === items.length) return res.status(404).json({ error: 'not found' });
    await writeCollection('contacts', next);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed deleting contact' });
  }
});

app.get('/api/csrf-token', requireAuth, (req, res) => {
  res.json({ csrfToken: issueCsrfToken(req) });
});

// ---------- account management (admin-only) ----------
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const users = await readUsers();
    res.json(users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed reading accounts' });
  }
});

app.put('/api/users/:id/role', requireAdmin, requireCsrf, async (req, res) => {
  const { role } = req.body;
  if (role !== 'admin' && role !== 'member') {
    return res.status(400).json({ error: "role must be 'admin' or 'member'" });
  }
  try {
    const users = await readUsers();
    const target = users.find((u) => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'not found' });

    if (target.id === req.session.userId && role !== 'admin') {
      return res.status(400).json({ error: "You can't remove your own admin access." });
    }
    const remainingAdmins = users.filter((u) => u.role === 'admin' && u.id !== target.id).length;
    if (target.role === 'admin' && role !== 'admin' && remainingAdmins === 0) {
      return res.status(400).json({ error: 'There must be at least one admin.' });
    }

    target.role = role;
    await writeUsers(users);
    res.json({ id: target.id, name: target.name, email: target.email, role: target.role, createdAt: target.createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed updating account' });
  }
});

app.delete('/api/users/:id', requireAdmin, requireCsrf, async (req, res) => {
  try {
    const users = await readUsers();
    const target = users.find((u) => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'not found' });

    if (target.id === req.session.userId) {
      return res.status(400).json({ error: "You can't delete your own account here." });
    }
    const remainingAdmins = users.filter((u) => u.role === 'admin' && u.id !== target.id).length;
    if (target.role === 'admin' && remainingAdmins === 0) {
      return res.status(400).json({ error: 'There must be at least one admin.' });
    }

    await writeUsers(users.filter((u) => u.id !== target.id));
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed deleting account' });
  }
});

// Lets any page (even static HTML) ask "who's logged in right now?" so the
// nav can show a name + logout link, or Login/Sign up links.
app.get('/api/me', async (req, res) => {
  if (!req.session || !req.session.userId) return res.json(null);
  try {
    const user = await findById(req.session.userId);
    if (!user) return req.session.destroy(() => res.json(null));
    res.json({ name: user.name, role: user.role });
  } catch (err) {
    console.error(err);
    res.json(null);
  }
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ---------- auth routes ----------
app.get('/login', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin' : '/');
  }
  res.render('login', { error: null });
});

app.post('/login', loginLimiter, async (req, res) => {
  const identifier = (req.body.username || req.body.email || '').trim();
  const password = req.body.password || '';

  if (!identifier || !password) {
    return res.status(400).render('login', { error: 'Email/username and password are required.' });
  }

  if (loginAttempts.isLocked(identifier)) {
    const minutes = Math.ceil(loginAttempts.msUntilUnlock(identifier) / 60000);
    return res.status(429).render('login', {
      error: `Too many failed attempts. Try again in ${minutes} minute(s).`
    });
  }

  const user = await findByLogin(identifier);
  const validPassword = user && (await bcrypt.compare(password, user.passwordHash));

  if (!user || !validPassword) {
    loginAttempts.recordFailure(identifier);
    return res.status(401).render('login', { error: 'Invalid email/username or password.' });
  }

  loginAttempts.recordSuccess(identifier);
  req.session.regenerate((err) => {
    if (err) {
      console.error(err);
      return res.status(500).render('login', { error: 'Something went wrong. Please try again.' });
    }
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.name = user.name;
    res.redirect(user.role === 'admin' ? '/admin' : '/');
  });
});

app.get('/signup', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin' : '/');
  }
  res.render('signup', { error: null, values: { name: '', email: '' } });
});

app.post('/signup', signupLimiter, async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirmPassword || '';
  const values = { name, email };

  if (!name || !email || !password) {
    return res.status(400).render('signup', { error: 'Name, email, and password are all required.', values });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).render('signup', { error: 'Please enter a valid email address.', values });
  }
  if (password.length < 8) {
    return res.status(400).render('signup', { error: 'Password must be at least 8 characters.', values });
  }
  if (password !== confirmPassword) {
    return res.status(400).render('signup', { error: 'Passwords do not match.', values });
  }

  try {
    const existing = await findByLogin(email);
    if (existing) {
      return res.status(409).render('signup', { error: 'An account with that email already exists. Try logging in instead.', values });
    }

    const users = await readUsers();
    const user = {
      id: makeId(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'member',
      createdAt: new Date().toISOString()
    };
    users.push(user);
    await writeUsers(users);

    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.status(500).render('signup', { error: 'Account created, but something went wrong logging you in. Please try logging in.', values });
      }
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.name = user.name;
      res.redirect('/');
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('signup', { error: 'Something went wrong creating your account. Please try again.', values });
  }
});

app.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => res.redirect('/login'));
  } else {
    res.redirect('/login');
  }
});

// ---------- page routes ----------
// Home / Members / Events / Announcements / Gallery are plain static files
// in public/ (served above), which fetch their data client-side from the
// API routes -- so login-gating for them happens at the API level, not
// here. Only /admin, /login, and /signup stay server-rendered, since they
// need session-based logic.
app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin', { username: req.session.name });
});

(async () => {
  await ensureAdminUser();
  app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
  });
})();

module.exports = app;
