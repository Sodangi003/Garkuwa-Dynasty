# The Garkuwa Family — Portal

An Express + EJS site for the Garkuwa family. Any family member can sign up
for an account to see the private family pages (members, events, gallery,
announcements); one admin account manages the content and everyone's access.

## Accounts & privacy model

- **Anyone can sign up** at `/signup` with a name, email, and password.
  New accounts are `member` role by default.
- **Members** can log in and view the private pages, but can't add/edit/
  delete anything.
- **Admins** can do everything a member can, plus manage content (add/edit/
  delete members, events, announcements, gallery photos) and manage other
  people's accounts (promote to admin, or remove an account) from
  Admin → Family Accounts.
- **One admin account is created automatically** on first run, from
  `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` in `.env` (see Setup below). After
  that, admin logs in through the exact same `/login` form as everyone else
  — there's no separate admin login page.
- The system always keeps at least one admin — you can't demote or delete
  the last remaining admin account, and an admin can't demote themselves
  (to avoid accidentally locking everyone out).
- The public contact form (`/` → Contact Us) stays open to anyone, logged in
  or not — that's meant for people outside the family to reach you.

## What's in this version

**Site structure**
- The public-facing pages (`public/index.html`, `members.html`,
  `events.html`, `gallery.html`, `announcements.html`) are **plain, editable
  HTML + CSS** files — open them in any editor like normal. Each one loads
  its content live from the API via a small `<script>`
  (`public/js/*.js`), so anything changed in `/admin` shows up on them
  automatically. Visiting one while logged out shows a "please log in"
  message instead of the private data.
- `/admin`, `/login`, and `/signup` are server-rendered (`views/*.ejs`),
  since they depend on session state.
- Original bugs fixed: the `liner` CSS typo, the unclosed `<link>` tag on
  Announcements, and the missing stylesheet on Gallery.

**Design & UX**
- Unified visual identity across the public site, admin dashboard, login,
  and signup pages — same fonts (Fraunces for headings, Inter for body) and
  color palette everywhere.
- **Photo upload from the admin dashboard** — Admin → Gallery has an upload
  button (JPG/PNG/GIF/WEBP, up to 5MB each) and delete, no server filesystem
  access needed.
- Gallery has a real lightbox: click a photo to view it full-size, with
  keyboard arrow-key navigation and Escape to close.
- Members show colored initials avatars instead of a bare bullet list.
- Events are split into **Upcoming** and **Past**, sorted chronologically,
  driven by a real `startISO` datetime field (the admin form shows a
  friendly date/time picker).
- Skeleton loading placeholders, a favicon, per-page meta descriptions,
  visible keyboard focus states, and a collapsing hamburger menu on mobile.

**Security**
- Session-based auth (`express-session`); passwords hashed with bcrypt,
  never stored in plain text.
- **Every protected request re-checks the live account**, not just a cached
  session flag — so deleting someone's account or changing their role takes
  effect immediately, not just at their next login.
- **CSRF protection** on every action that changes data. A per-session token
  is required in an `X-CSRF-Token` header; the admin dashboard fetches and
  attaches it automatically.
- **Brute-force lockout**: 5 failed logins for an email/username locks it
  for 15 minutes.
- **Rate limiting** on login, signup, the public contact form, and the API
  as a whole (`express-rate-limit`).
- **Security headers** via `helmet` (a restrictive Content-Security-Policy,
  clickjacking protection, etc).
- **Session cookies** are `httpOnly` and `sameSite: lax`, marked `secure`
  automatically when `NODE_ENV=production` (requires HTTPS).
- **Request logging** via `morgan`.

## Project structure

```
server.js                 Express app: static site, API, auth, security middleware
middleware/auth.js         requireAuth (any logged-in user) / requireAdmin / CSRF middleware
lib/users.js               Reads/writes data/users.json, looks up accounts
lib/login-attempts.js      Brute-force lockout tracking
scripts/hash-password.js   CLI to generate a bcrypt hash for your admin password
views/
  admin.ejs                 Admin dashboard UI (server-rendered, admin only)
  login.ejs                 Login page (server-rendered, works for members + admin)
  signup.ejs                 Sign-up page (server-rendered)
public/
  index.html, members.html, events.html, gallery.html, announcements.html
                             Plain static pages -- edit these directly
  css/style.css              Public site styles
  css/admin-style.css        Admin / login / signup styles
  js/contact-form.js         Home page contact form
  js/members.js, events.js, announcements.js, gallery.js
                             Fetch data from the API and render it into the page
  js/auth-status.js          Shows "Log in / Sign up" or "Hi, name · Log out" in the nav
  js/nav-toggle.js           Mobile hamburger menu
  js/admin-script.js         Admin dashboard logic (calls the authenticated API)
  images/                    Gallery photos (managed via Admin → Gallery)
data/
  members.json, events.json, announcements.json, contacts.json, users.json
  (users.json and contacts.json are created automatically)
.env.example                Template for your local .env (never commit .env)
```

## Setup

```bash
npm install
cp .env.example .env
```

Generate a password hash for the admin account and put it in `.env`:

```bash
npm run hash-password -- "your-chosen-password"
# copy the ADMIN_PASSWORD_HASH= line it prints into .env
```

Also set a `SESSION_SECRET` in `.env` (any long random string — e.g.
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

```bash
npm start
```

Visit:
- http://localhost:3000/ — public landing page (contact form, links to sign up / log in)
- http://localhost:3000/signup — anyone can create a member account here
- http://localhost:3000/login — works for both member and admin accounts
- http://localhost:3000/admin — admin only; redirects to `/login` if you're not signed in as an admin

**Zero-config mode:** if you skip the `.env` setup entirely, `npm start` will
generate a temporary admin password and print it to the console on startup.
It changes every restart — fine for a quick look, not for anything you leave
running.

## API

- `GET /api/members`, `/api/events`, `/api/announcements`, `/api/gallery`
  — any logged-in user (member or admin)
- `POST` / `PUT /:id` / `DELETE /:id` on the above, and
  `POST /api/gallery/upload`, `DELETE /api/gallery/:filename`
  — admin only
- `POST /api/contacts` — public (the contact form). `GET` / `DELETE /:id`
  on contacts — admin only
- `GET /api/users` — admin only, lists all accounts
- `PUT /api/users/:id/role`, `DELETE /api/users/:id` — admin only, manage
  other accounts (blocked from removing the last admin or your own admin role)
- `GET /api/me` — public, tells the page who (if anyone) is logged in, used
  to drive the nav bar
- `GET /api/csrf-token` — any logged-in user, returns the token needed for
  the write endpoints above

`POST`/`PUT`/`DELETE` requests (except signup/login/the public contact form)
require an `X-CSRF-Token` header, obtained from `GET /api/csrf-token`.

## Production checklist

Before putting this on a public server:

- [ ] Set `NODE_ENV=production` so cookies get the `secure` flag — this
      requires serving over HTTPS (e.g. behind nginx or a platform that
      terminates TLS for you).
- [ ] If you're behind a reverse proxy, uncomment `app.set('trust proxy', 1)`
      in `server.js` so rate limiting and secure cookies see the real client.
- [ ] Set a permanent `ADMIN_PASSWORD_HASH` and `SESSION_SECRET` in `.env`
      (don't rely on the auto-generated ones).
- [ ] The session store is in-memory (`express-session`'s default). That's
      fine for one small server, but sessions reset on every restart and
      won't work if you ever run more than one instance. Swap in
      `connect-sqlite3` or a Redis store if that matters to you.
- [ ] Move `data/*.json` to a real database if the site grows past a
      handful of family members/events/accounts.
- [ ] `.env` is already gitignored — don't commit it.
- [ ] Decide who your first admin should be (set via `ADMIN_USERNAME` in
      `.env`) before you launch — you can promote others to admin later
      from Admin → Family Accounts.
