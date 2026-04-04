import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDefaultUserState } from "./defaultUserState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore() {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    const empty = { users: {} };
    fs.writeFileSync(STORE_PATH, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}

function writeStore(store) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
}

export function getUserPayload(login) {
  const store = readStore();
  const u = store.users[login];
  if (!u) return null;
  const { passwordHash, ...rest } = u;
  return rest;
}

export function createUser(login, passwordHash) {
  const store = readStore();
  if (store.users[login]) return false;
  const defaults = createDefaultUserState();
  store.users[login] = { passwordHash, ...defaults };
  writeStore(store);
  return true;
}

export function saveUserPayload(login, payload) {
  const store = readStore();
  const u = store.users[login];
  if (!u) return false;
  const { passwordHash } = u;
  store.users[login] = { passwordHash, ...payload };
  writeStore(store);
  return true;
}

export function getPasswordHash(login) {
  const store = readStore();
  return store.users[login]?.passwordHash ?? null;
}
