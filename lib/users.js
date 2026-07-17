const fs = require('fs').promises;
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

async function readUsers() {
  try {
    const txt = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(txt || '[]');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeUsers(users) {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function findByLogin(identifier) {
  const users = await readUsers();
  const needle = String(identifier || '').trim().toLowerCase();
  return users.find((u) => u.email.toLowerCase() === needle) || null;
}

async function findById(id) {
  const users = await readUsers();
  return users.find((u) => u.id === id) || null;
}

module.exports = { readUsers, writeUsers, findByLogin, findById, USERS_FILE };
