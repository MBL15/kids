import { getDb } from "./db.js";
import { createDefaultUserState } from "./defaultUserState.js";
import { defaultLocalMatrices, isValidLocalMatrices } from "../js/ahp.js";

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

export function getUserRecord(login) {
  const db = getDb();
  return (
    db
      .prepare(
        `
      SELECT login, password_hash, role, methodist_login
      FROM users
      WHERE login = ?
    `
      )
      .get(login) ?? null
  );
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

function dataSourceLogin(user) {
  if (user.role === "tutor" && user.methodist_login) {
    return user.methodist_login;
  }
  return user.login;
}

export function getUserPayloadForClient(login) {
  const user = getUserRecord(login);
  if (!user) return null;

  const sourceLogin = dataSourceLogin(user);
  const payload = getUserPayload(sourceLogin);
  if (!payload) return null;

  return {
    ...payload,
    role: user.role || "methodist",
    methodistLogin: user.methodist_login || null,
    login: user.login,
  };
}

function mergeTutorStudents(methodistPayload, tutorPayload) {
  const k = methodistPayload.criteria.length;
  const m = methodistPayload.methods.length;
  const byId = new Map((methodistPayload.students || []).map((s) => [s.id, { ...s }]));

  for (const ts of tutorPayload.students || []) {
    const existing = byId.get(ts.id);
    if (existing) {
      existing.lessons = Array.isArray(ts.lessons) ? ts.lessons : [];
      if (ts.name) existing.name = ts.name;
      if (ts.class !== undefined) existing.class = ts.class;
      if (ts.subject !== undefined) existing.subject = ts.subject;
    } else {
      byId.set(ts.id, {
        id: ts.id,
        name: ts.name || "Новый ученик",
        class: ts.class || "",
        subject: ts.subject || "",
        lessons: Array.isArray(ts.lessons) ? ts.lessons : [],
        localMatrices: isValidLocalMatrices(ts.localMatrices, k, m)
          ? ts.localMatrices
          : defaultLocalMatrices(k, m),
      });
    }
  }

  return {
    criteria: methodistPayload.criteria,
    methods: methodistPayload.methods,
    criteriaImportance: [],
    methodScores: [],
    localMatrices: methodistPayload.localMatrices,
    students: Array.from(byId.values()),
  };
}

export function createUser(login, passwordHash, role = "methodist", methodistLogin = null) {
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM users WHERE login = ?").get(login);
  if (exists) return { ok: false, error: "Такой логин уже занят." };

  const normalizedRole = role === "tutor" ? "tutor" : "methodist";
  let linkedMethodist = null;

  if (normalizedRole === "tutor") {
    const methodistLoginTrimmed = String(methodistLogin ?? "").trim();
    if (!methodistLoginTrimmed) {
      return { ok: false, error: "Укажите логин методиста." };
    }
    const methodist = getUserRecord(methodistLoginTrimmed);
    if (!methodist || (methodist.role && methodist.role !== "methodist")) {
      return { ok: false, error: "Методист с таким логином не найден. Сначала зарегистрируйте методиста." };
    }
    linkedMethodist = methodistLoginTrimmed;
  }

  const defaults = createDefaultUserState();
  const create = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO users (login, password_hash, role, methodist_login)
      VALUES (?, ?, ?, ?)
    `
    ).run(login, passwordHash, normalizedRole, linkedMethodist);

    if (normalizedRole === "methodist") {
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
    }
  });

  create();
  return { ok: true };
}

export function saveUserPayload(login, payload) {
  const db = getDb();
  const user = getUserRecord(login);
  if (!user) return false;

  let targetLogin = login;
  let payloadToSave = payload;

  if (user.role === "tutor" && user.methodist_login) {
    const methodistPayload = getUserPayload(user.methodist_login);
    if (!methodistPayload) return false;
    targetLogin = user.methodist_login;
    payloadToSave = mergeTutorStudents(methodistPayload, payload);
  }

  const localMatrices =
    payloadToSave.localMatrices !== undefined ? JSON.stringify(payloadToSave.localMatrices) : null;

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
      JSON.stringify(payloadToSave.criteria),
      JSON.stringify(payloadToSave.methods),
      JSON.stringify(payloadToSave.criteriaImportance ?? []),
      JSON.stringify(payloadToSave.methodScores ?? []),
      localMatrices,
      JSON.stringify(payloadToSave.students),
      targetLogin
    );

  return result.changes > 0;
}

export function getPasswordHash(login) {
  const db = getDb();
  const row = db.prepare("SELECT password_hash FROM users WHERE login = ?").get(login);
  return row?.password_hash ?? null;
}
