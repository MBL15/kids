# Листинги программного кода и скриптов БД

> Для вставки в Word: шрифт **Courier New** 10–11 pt, интервал **1.0**.  
> Подпись — **под** блоком: *«Листинг N – …»*.

---

## (обязательное)

### SQL-скрипты (даталогическая модель, нормализованное представление)

<table>
<tr>
<td valign="top" width="50%">

```sql
-- Создание таблицы "Пользователь"
CREATE TABLE Пользователь (
    id INT(10) PRIMARY KEY NOT NULL,
    login VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    methodist_id INT(10),
    created_at DATE NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(login) <> ''),
    CHECK (role IN ('methodist', 'tutor')),
    CHECK (role = 'methodist' OR methodist_id IS NOT NULL),
    FOREIGN KEY (methodist_id) REFERENCES Пользователь(id)
);

-- Создание таблицы "Критерий"
CREATE TABLE Критерий (
    id INT(10) PRIMARY KEY NOT NULL,
    name VARCHAR(100) NOT NULL,
    user_id INT(10) NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(name) <> ''),
    FOREIGN KEY (user_id) REFERENCES Пользователь(id)
);

-- Создание таблицы "Методика"
CREATE TABLE Методика (
    id INT(10) PRIMARY KEY NOT NULL,
    name VARCHAR(100) NOT NULL,
    user_id INT(10) NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(name) <> ''),
    FOREIGN KEY (user_id) REFERENCES Пользователь(id)
);

-- Создание таблицы "Ученик"
CREATE TABLE Ученик (
    id INT(10) PRIMARY KEY NOT NULL,
    name VARCHAR(100) NOT NULL,
    class VARCHAR(10) NOT NULL,
    subject VARCHAR(100) NOT NULL,
    user_id INT(10) NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(name) <> ''),
    FOREIGN KEY (user_id) REFERENCES Пользователь(id)
);
```

</td>
<td valign="top" width="50%">

```sql
-- Создание таблицы "Урок"
CREATE TABLE Урок (
    id INT(10) PRIMARY KEY NOT NULL,
    date DATE NOT NULL,
    time_start TIME,
    time_end TIME,
    student_id INT(10) NOT NULL,
    CHECK (id > 0),
    CHECK (student_id > 0),
    FOREIGN KEY (student_id) REFERENCES Ученик(id)
);

-- Создание таблицы "Оценка урока"
CREATE TABLE Оценка_урока (
    id INT(10) PRIMARY KEY NOT NULL,
    lesson_id INT(10) NOT NULL,
    criterion_id INT(10) NOT NULL,
    score INT(2) NOT NULL,
    CHECK (id > 0),
    CHECK (score >= 2 AND score <= 5),
    FOREIGN KEY (lesson_id) REFERENCES Урок(id),
    FOREIGN KEY (criterion_id) REFERENCES Критерий(id)
);

-- Матрица парных сравнений методик (М×M по критерию)
CREATE TABLE Матрица_сравнения (
    id INT(10) PRIMARY KEY NOT NULL,
    student_id INT(10) NOT NULL,
    criterion_id INT(10) NOT NULL,
    matrix_json TEXT NOT NULL,
    CHECK (id > 0),
    FOREIGN KEY (student_id) REFERENCES Ученик(id),
    FOREIGN KEY (criterion_id) REFERENCES Критерий(id)
);

-- Профиль методиста (в SQLite — JSON-документ в user_profiles)
CREATE TABLE Профиль_методиста (
    user_id INT(10) PRIMARY KEY NOT NULL,
    criteria_json TEXT NOT NULL,
    methods_json TEXT NOT NULL,
    students_json TEXT NOT NULL,
    updated_at DATE NOT NULL,
    FOREIGN KEY (user_id) REFERENCES Пользователь(id)
);
```

</td>
</tr>
</table>

*Листинг 1 – SQL-скрипты создания таблиц базы данных (логический уровень)*

---

## Листинг 2 – Скрипты SQLite (физическая реализация)

**Файл:** `database/schema.sql`

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  login           TEXT PRIMARY KEY,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'methodist'
                  CHECK (role IN ('methodist', 'tutor')),
  methodist_login TEXT REFERENCES users(login),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (role = 'methodist' OR methodist_login IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_methodist ON users(methodist_login);

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

CREATE INDEX IF NOT EXISTS idx_user_profiles_updated ON user_profiles(updated_at);
```

*Листинг 2 – SQL-скрипты создания таблиц SQLite*

> Профиль `user_profiles` создаётся только у методиста. Критерии, методики, ученики, уроки и матрицы МАИ хранятся в JSON-колонках `criteria`, `methods`, `students`.

---

## Листинг 3 – Примеры SQL-запросов

**Файл:** `database/queries.sql`

```sql
-- Список пользователей с ролями
SELECT login, role, methodist_login, created_at
FROM users
ORDER BY created_at;

-- Репетиторы и их методисты
SELECT
  t.login       AS tutor_login,
  t.methodist_login,
  m.created_at  AS methodist_since
FROM users t
LEFT JOIN users m ON m.login = t.methodist_login
WHERE t.role = 'tutor';

-- Данные репетитора через профиль методиста (логика GET /api/me)
SELECT
  t.login AS tutor_login,
  p.criteria,
  p.methods,
  p.students,
  p.updated_at
FROM users t
INNER JOIN user_profiles p ON p.login = t.methodist_login
WHERE t.login = ?;

-- Ученики методиста: имя, класс, предмет
SELECT
  json_extract(s.value, '$.name')    AS student_name,
  json_extract(s.value, '$.class')   AS student_class,
  json_extract(s.value, '$.subject') AS student_subject,
  json_array_length(json_extract(s.value, '$.lessons')) AS lesson_count
FROM user_profiles p
CROSS JOIN json_each(p.students) AS s
WHERE p.login = ?;

-- Авторизация: хеш пароля и роль
SELECT login, password_hash, role, methodist_login
FROM users
WHERE login = ?;

-- Сохранение профиля методиста (PUT /api/me)
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
```

*Листинг 3 – Примеры SQL-запросов приложения*

---

## Листинг 4 – Тестовые данные

**Файл:** `database/seed_example.sql`

```sql
INSERT OR IGNORE INTO users (login, password_hash, role, methodist_login)
VALUES (
  'methodist',
  '$2a$10$demo_hash_replace_with_real_bcrypt',
  'methodist',
  NULL
);

INSERT OR REPLACE INTO user_profiles (
  login, criteria, methods, students
) VALUES (
  'methodist',
  '[
    {"id":"theory","name":"Теория"},
    {"id":"graphs","name":"Графики"},
    {"id":"tasks","name":"Задачи"},
    {"id":"independence","name":"Самостоятельность"}
  ]',
  '[
    {"id":"m1","name":"Классическая"},
    {"id":"m2","name":"Практикум"},
    {"id":"m3","name":"Проектная"},
    {"id":"m4","name":"Визуальная"}
  ]',
  '[
    {
      "id": "s1",
      "name": "Денис",
      "class": "10",
      "subject": "математика",
      "lessons": [
        {
          "id": "l1",
          "date": "2026-05-21",
          "timeStart": "14:00",
          "timeEnd": "15:30",
          "scores": {
            "theory": 3,
            "graphs": 4,
            "tasks": 3,
            "independence": 3
          }
        }
      ],
      "localMatrices": []
    }
  ]'
);

INSERT OR IGNORE INTO users (login, password_hash, role, methodist_login)
VALUES (
  'tutor1',
  '$2a$10$demo_hash_replace_with_real_bcrypt',
  'tutor',
  'methodist'
);
```

*Листинг 4 – SQL-скрипт тестовых данных (методист и репетитор)*

---

## Листинг 5 – Модуль доступа к базе данных

**Файл:** `server/store.js`

```javascript
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

export function saveUserPayload(login, payload) {
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

  const result = db.prepare(`
    UPDATE user_profiles SET
      criteria = ?, methods = ?, criteria_importance = ?,
      method_scores = ?, local_matrices = ?, students = ?,
      updated_at = datetime('now')
    WHERE login = ?
  `).run(
    JSON.stringify(payloadToSave.criteria),
    JSON.stringify(payloadToSave.methods),
    JSON.stringify(payloadToSave.criteriaImportance ?? []),
    JSON.stringify(payloadToSave.methodScores ?? []),
    payloadToSave.localMatrices ? JSON.stringify(payloadToSave.localMatrices) : null,
    JSON.stringify(payloadToSave.students),
    targetLogin
  );
  return result.changes > 0;
}
```

*Листинг 5 – Модуль доступа к базе данных (роли методист / репетитор)*

---

## Листинг 6 – REST API сервера

**Файл:** `server.js`

```javascript
app.post("/api/auth/register", (req, res) => {
  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "methodist").trim();
  const methodistLogin = String(req.body?.methodistLogin ?? "").trim();
  const passwordHash = bcrypt.hashSync(password, 10);
  const created = createUser(login, passwordHash, role, methodistLogin || null);
  if (!created.ok) {
    return res.status(409).json({ error: created.error || "Не удалось создать аккаунт." });
  }
  const user = getUserRecord(login);
  res.json({
    token: signToken(login, user?.role || role),
    login,
    role: user?.role || role,
    methodistLogin: user?.methodist_login || null,
  });
});

app.post("/api/auth/login", (req, res) => {
  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "").trim();
  const hash = getPasswordHash(login);
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: "Неверный логин или пароль." });
  }
  const user = getUserRecord(login);
  if (role && role !== user.role) {
    return res.status(403).json({ error: "Выберите правильную роль." });
  }
  res.json({
    token: signToken(login, user.role),
    login,
    role: user.role,
    methodistLogin: user.methodist_login || null,
  });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const data = getUserPayloadForClient(req.login);
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

*Листинг 6 – REST API сервера*

---

## Листинг 7 – Алгоритм МАИ (расчёт дефицита и CR)

**Файл:** `js/ahp.js`

```javascript
export function deficitFromScore(score1to10) {
  const s = Math.max(1, Math.min(10, Number(score1to10) || 5));
  return 10 - s + 1;
}

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

export function consistencyRatio(A, lambdaMax, n) {
  if (n <= 2) return 0;
  const CI = (lambdaMax - n) / (n - 1);
  const RI = RI_TABLE[n] ?? 1.49;
  return CI / RI;
}
```

*Листинг 7 – Алгоритм МАИ: дефицит, матрицы, CR*

---

## Листинг 8 – Рекомендация методики (МАИ)

**Файл:** `js/ahp.js`, функция `runAhpAnalysis`

```javascript
export function runAhpAnalysis({ lessons, criterionIds, localMatrices }) {
  const k = criterionIds.length;
  const m = localMatrices[0]?.length ?? 0;

  const scores10 = aggregateStudentScores1To10(lessons, criterionIds);
  const deficits = scores10.map(deficitFromScore);
  const criteriaMatrix = buildPairwiseMatrixFromVector(deficits);

  const { w: critW, lambdaMax: critLambda } = principalEigenvector(criteriaMatrix);
  const criteriaCR = consistencyRatio(criteriaMatrix, critLambda, k);

  const localPriorities = [];
  for (let ci = 0; ci < k; ci++) {
    const { w } = principalEigenvector(localMatrices[ci]);
    localPriorities.push(w);
  }

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

*Листинг 8 – Алгоритм рекомендации методики обучения*
