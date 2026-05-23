# Приложение. Листинги программного кода и скриптов БД

> Документ для вставки в пояснительную записку / диплом.  
> Скопируйте нужные блоки в Word: шрифт **Courier New** 10–11 pt, межстрочный интервал 1.0.  
> Подпись листинга — по ГОСТ: *«Листинг N – …»* — размещается **под** блоком кода.

---

## Листинг 1 – Схема базы данных SQLite

**Файл:** `database/schema.sql`

```sql
-- Схема базы данных SQLite
-- Приложение: подбор методики преподавания (МАИ)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  login         TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_profiles (
  login               TEXT PRIMARY KEY
                      REFERENCES users(login) ON DELETE CASCADE,
  criteria            TEXT NOT NULL DEFAULT '[]',
  methods             TEXT NOT NULL DEFAULT '[]',
  criteria_importance TEXT NOT NULL DEFAULT '[]',
  method_scores       TEXT NOT NULL DEFAULT '[]',
  local_matrices      TEXT,
  students            TEXT NOT NULL DEFAULT '[]',
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_updated
  ON user_profiles(updated_at);
```

---

## Листинг 2 – Примеры SQL-запросов приложения

**Файл:** `database/queries.sql`

```sql
-- Загрузка состояния пользователя (GET /api/me)
SELECT
  p.criteria,
  p.methods,
  p.criteria_importance,
  p.method_scores,
  p.local_matrices,
  p.students
FROM user_profiles p
INNER JOIN users u ON u.login = p.login
WHERE p.login = ?;

-- Сохранение состояния (PUT /api/me)
UPDATE user_profiles
SET
  criteria = ?,
  methods = ?,
  criteria_importance = ?,
  method_scores = ?,
  local_matrices = ?,
  students = ?,
  updated_at = datetime('now')
WHERE login = ?;

-- Авторизация: получение хеша пароля
SELECT password_hash FROM users WHERE login = ?;
```

---

## Листинг 3 – Модуль доступа к базе данных

**Файл:** `server/store.js`

```javascript
import { getDb } from "./db.js";
import { createDefaultUserState } from "./defaultUserState.js";

function rowToPayload(row) {
  return {
    criteria: JSON.parse(row.criteria),
    methods: JSON.parse(row.methods),
    criteriaImportance: JSON.parse(row.criteria_importance),
    methodScores: JSON.parse(row.method_scores),
    students: JSON.parse(row.students),
    ...(row.local_matrices ? { localMatrices: JSON.parse(row.local_matrices) } : {}),
  };
}

export function getUserPayload(login) {
  const db = getDb();
  const row = db.prepare(`
    SELECT p.* FROM user_profiles p
    INNER JOIN users u ON u.login = p.login
    WHERE p.login = ?
  `).get(login);
  return row ? rowToPayload(row) : null;
}

export function saveUserPayload(login, payload) {
  const db = getDb();
  const result = db.prepare(`
    UPDATE user_profiles SET
      criteria = ?, methods = ?, criteria_importance = ?,
      method_scores = ?, local_matrices = ?, students = ?,
      updated_at = datetime('now')
    WHERE login = ?
  `).run(
    JSON.stringify(payload.criteria),
    JSON.stringify(payload.methods),
    JSON.stringify(payload.criteriaImportance),
    JSON.stringify(payload.methodScores),
    payload.localMatrices ? JSON.stringify(payload.localMatrices) : null,
    JSON.stringify(payload.students),
    login
  );
  return result.changes > 0;
}
```

---

## Листинг 4 – Инициализация подключения к SQLite

**Файл:** `server/db.js`

```javascript
import Database from "better-sqlite3";

export function getDb() {
  if (!db) {
    ensureDir();
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
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
```

---

## Листинг 5 – REST API сервера (авторизация и данные)

**Файл:** `server.js`

```javascript
app.post("/api/auth/register", (req, res) => {
  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "");
  const passwordHash = bcrypt.hashSync(password, 10);
  const ok = createUser(login, passwordHash);
  if (!ok) return res.status(409).json({ error: "Такой логин уже занят." });
  res.json({ token: signToken(login), login });
});

app.post("/api/auth/login", (req, res) => {
  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "");
  const hash = getPasswordHash(login);
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: "Неверный логин или пароль." });
  }
  res.json({ token: signToken(login), login });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const data = getUserPayload(req.login);
  if (!data) return res.status(404).json({ error: "Пользователь не найден" });
  res.json(data);
});

app.put("/api/me", authMiddleware, (req, res) => {
  const { criteria, methods, criteriaImportance, methodScores, localMatrices, students } = req.body;
  const payload = { criteria, methods, criteriaImportance, methodScores, students };
  if (Array.isArray(localMatrices)) payload.localMatrices = localMatrices;
  const ok = saveUserPayload(req.login, payload);
  if (!ok) return res.status(500).json({ error: "Не удалось сохранить" });
  res.json({ ok: true });
});
```

---

## Листинг 6 – Расчёт дефицита и матрицы парных сравнений (МАИ)

**Файл:** `js/ahp.js`

```javascript
/** Дефицит: 10 − оценка + 1 */
export function deficitFromScore(score1to10) {
  const s = Math.max(1, Math.min(10, Number(score1to10) || 5));
  return 10 - s + 1;
}

/** Матрица парных сравнений из вектора дефицитов / подходящести */
export function buildPairwiseMatrixFromVector(values) {
  const n = values.length;
  const safe = values.map((v) => Math.max(Number(v) || 1, 1e-6));
  const A = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ratio = clampSaaty(safe[i] / safe[j]);
      A[i][j] = ratio;
      A[j][i] = 1 / ratio;
    }
  }
  return A;
}

/** Собственный вектор матрицы (метод степенных итераций) */
export function principalEigenvector(A, eps = 1e-10) {
  const n = A.length;
  let w = Array(n).fill(1 / n);
  for (let iter = 0; iter < 1000; iter++) {
    const Aw = multiplyMatrixVector(A, w);
    const wNew = normalizeVector(Aw);
    if (wNew.reduce((d, x, i) => d + Math.abs(x - w[i]), 0) < eps) break;
    w = wNew;
  }
  const Aw = multiplyMatrixVector(A, w);
  const lambdaMax = w.reduce((s, wi, i) => s + Aw[i] / (wi || 1e-15), 0) / n;
  return { w, lambdaMax };
}

/** Индекс согласованности CR = CI / RI */
export function consistencyRatio(A, lambdaMax, n) {
  if (n <= 2) return 0;
  const CI = (lambdaMax - n) / (n - 1);
  const RI = RI_TABLE[n] ?? 1.49;
  return CI / RI;
}
```

---

## Листинг 7 – Полный алгоритм рекомендации методики (МАИ)

**Файл:** `js/ahp.js`, функция `runAhpAnalysis`

```javascript
export function runAhpAnalysis({ lessons, criterionIds, localMatrices }) {
  const k = criterionIds.length;
  const m = localMatrices[0]?.length ?? 0;

  // Шаг 3.1–3.2: оценки → дефицит → матрица критериев
  const scores10 = aggregateStudentScores1To10(lessons, criterionIds);
  const deficits = scores10.map(deficitFromScore);
  const criteriaMatrix = buildPairwiseMatrixFromVector(deficits);

  // Шаг 3.3–3.4: веса критериев и проверка CR
  const { w: critW, lambdaMax: critLambda } = principalEigenvector(criteriaMatrix);
  const criteriaCR = consistencyRatio(criteriaMatrix, critLambda, k);

  // Шаг 3.5: локальные приоритеты методик по каждому критерию
  const localPriorities = [];
  for (let ci = 0; ci < k; ci++) {
    const { w } = principalEigenvector(localMatrices[ci]);
    localPriorities.push(w);
  }

  // Шаг 3.6–3.7: глобальные приоритеты и выбор лучшей методики
  const global = Array(m).fill(0);
  for (let mi = 0; mi < m; mi++) {
    for (let ci = 0; ci < k; ci++) {
      global[mi] += critW[ci] * localPriorities[ci][mi];
    }
  }
  const globalPriorities = normalizeVector(global);
  const bestIdx = globalPriorities.indexOf(Math.max(...globalPriorities));

  return { scores10, deficits, critW, criteriaCR, localPriorities, globalPriorities, bestIdx };
}
```


