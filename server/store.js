import { getDb } from "./db.js";
import { createDefaultUserState } from "./defaultUserState.js";

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToPayload(row) {
  const payload = {
    criteria: parseJson(row.criteria, []),
    methods: parseJson(row.methods, []),
    criteriaImportance: parseJson(row.criteria_importance, []),
    methodScores: parseJson(row.method_scores, []),
    students: parseJson(row.students, []),
  };
  if (row.local_matrices) {
    payload.localMatrices = parseJson(row.local_matrices, null);
  }
  return payload;
}

export function getUserPayload(login) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT p.*
      FROM user_profiles p
      INNER JOIN users u ON u.login = p.login
      WHERE p.login = ?
    `
    )
    .get(login);
  if (!row) return null;
  return rowToPayload(row);
}

export function createUser(login, passwordHash) {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM users WHERE login = ?").get(login);
  if (exists) return false;

  const defaults = createDefaultUserState();
  const create = db.transaction(() => {
    db.prepare("INSERT INTO users (login, password_hash) VALUES (?, ?)").run(
      login,
      passwordHash
    );
    db.prepare(
      `
      INSERT INTO user_profiles (
        login, criteria, methods, criteria_importance, method_scores, students
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      login,
      JSON.stringify(defaults.criteria),
      JSON.stringify(defaults.methods),
      JSON.stringify(defaults.criteriaImportance),
      JSON.stringify(defaults.methodScores),
      JSON.stringify(defaults.students)
    );
  });

  create();
  return true;
}

export function saveUserPayload(login, payload) {
  const db = getDb();
  const user = db.prepare("SELECT login FROM users WHERE login = ?").get(login);
  if (!user) return false;

  const localMatrices =
    payload.localMatrices !== undefined
      ? JSON.stringify(payload.localMatrices)
      : null;

  const result = db
    .prepare(
      `
      UPDATE user_profiles
      SET
        criteria = ?,
        methods = ?,
        criteria_importance = ?,
        method_scores = ?,
        local_matrices = ?,
        students = ?,
        updated_at = datetime('now')
      WHERE login = ?
    `
    )
    .run(
      JSON.stringify(payload.criteria),
      JSON.stringify(payload.methods),
      JSON.stringify(payload.criteriaImportance),
      JSON.stringify(payload.methodScores),
      localMatrices,
      JSON.stringify(payload.students),
      login
    );

  return result.changes > 0;
}

export function getPasswordHash(login) {
  const db = getDb();
  const row = db.prepare("SELECT password_hash FROM users WHERE login = ?").get(login);
  return row?.password_hash ?? null;
}
