import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { createDefaultUserState } from "./defaultUserState.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
export const DB_PATH = path.join(DATA_DIR, "app.db");
const LEGACY_STORE_PATH = path.join(DATA_DIR, "store.json");

let db;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      login TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      login TEXT PRIMARY KEY REFERENCES users(login) ON DELETE CASCADE,
      criteria TEXT NOT NULL DEFAULT '[]',
      methods TEXT NOT NULL DEFAULT '[]',
      criteria_importance TEXT NOT NULL DEFAULT '[]',
      method_scores TEXT NOT NULL DEFAULT '[]',
      local_matrices TEXT,
      students TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function migrateLegacyJson(database) {
  if (!fs.existsSync(LEGACY_STORE_PATH)) return;

  const { c: userCount } = database.prepare("SELECT COUNT(*) AS c FROM users").get();
  if (userCount > 0) return;

  let store;
  try {
    store = JSON.parse(fs.readFileSync(LEGACY_STORE_PATH, "utf8"));
  } catch {
    console.warn("Не удалось прочитать data/store.json для миграции в SQLite.");
    return;
  }

  const users = store.users ?? {};
  if (Object.keys(users).length === 0) return;

  const insertUser = database.prepare(
    "INSERT INTO users (login, password_hash) VALUES (?, ?)"
  );
  const insertProfile = database.prepare(`
    INSERT INTO user_profiles (
      login, criteria, methods, criteria_importance, method_scores, local_matrices, students
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const migrate = database.transaction(() => {
    for (const [login, user] of Object.entries(users)) {
      if (!user?.passwordHash) continue;
      const defaults = createDefaultUserState();
      insertUser.run(login, user.passwordHash);
      insertProfile.run(
        login,
        JSON.stringify(user.criteria ?? defaults.criteria),
        JSON.stringify(user.methods ?? defaults.methods),
        JSON.stringify(user.criteriaImportance ?? defaults.criteriaImportance),
        JSON.stringify(user.methodScores ?? defaults.methodScores),
        user.localMatrices ? JSON.stringify(user.localMatrices) : null,
        JSON.stringify(user.students ?? defaults.students)
      );
    }
  });

  migrate();

  const backupPath = `${LEGACY_STORE_PATH}.migrated`;
  try {
    fs.renameSync(LEGACY_STORE_PATH, backupPath);
    console.log(`Данные перенесены из store.json в SQLite (${backupPath})`);
  } catch (err) {
    console.warn("Миграция в SQLite выполнена, но store.json не переименован:", err.message);
  }
}

export function getDb() {
  if (!db) {
    ensureDir();
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
    migrateLegacyJson(db);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
