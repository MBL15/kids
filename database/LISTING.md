# Листинги программного кода и скриптов БД

> Для вставки в Word: шрифт **Courier New** 10–11 pt, интервал **1.0**.  
> Подпись — **под** блоком: *«Листинг N – …»*.

---

## (обязательное)

### SQL-скрипты

<table>
<tr>
<td valign="top" width="50%">

```sql
-- Создание таблицы "Пользователь"
CREATE TABLE Пользователь (
    id INT(10) PRIMARY KEY NOT NULL,
    login VARCHAR(50) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at DATE NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(login) <> ''),
    CHECK (TRIM(password) <> '')
);

-- Создание таблицы "Критерий"
CREATE TABLE Критерий (
    id INT(10) PRIMARY KEY NOT NULL,
    name VARCHAR(100) NOT NULL,
    user_id INT(10) NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(name) <> ''),
    CHECK (user_id > 0),
    FOREIGN KEY (user_id) REFERENCES Пользователь(id)
);

-- Создание таблицы "Методика"
CREATE TABLE Методика (
    id INT(10) PRIMARY KEY NOT NULL,
    name VARCHAR(100) NOT NULL,
    user_id INT(10) NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(name) <> ''),
    CHECK (user_id > 0),
    FOREIGN KEY (user_id) REFERENCES Пользователь(id)
);

-- Создание таблицы "Ученик"
CREATE TABLE Ученик (
    id INT(10) PRIMARY KEY NOT NULL,
    name VARCHAR(100) NOT NULL,
    notes VARCHAR(255),
    user_id INT(10) NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(name) <> ''),
    CHECK (user_id > 0),
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
    student_id INT(10) NOT NULL,
    CHECK (id > 0),
    CHECK (TRIM(date) <> ''),
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
    CHECK (lesson_id > 0),
    CHECK (criterion_id > 0),
    FOREIGN KEY (lesson_id) REFERENCES Урок(id),
    FOREIGN KEY (criterion_id) REFERENCES Критерий(id)
);

-- Создание таблицы "Подходящесть методики"
CREATE TABLE Подходящесть_методики (
    id INT(10) PRIMARY KEY NOT NULL,
    method_id INT(10) NOT NULL,
    criterion_id INT(10) NOT NULL,
    score INT(2) NOT NULL,
    CHECK (id > 0),
    CHECK (score >= 2 AND score <= 5),
    CHECK (method_id > 0),
    CHECK (criterion_id > 0),
    FOREIGN KEY (method_id) REFERENCES Методика(id),
    FOREIGN KEY (criterion_id) REFERENCES Критерий(id)
);

-- Создание таблицы "Профиль пользователя"
CREATE TABLE Профиль_пользователя (
    id INT(10) PRIMARY KEY NOT NULL,
    user_id INT(10) NOT NULL,
    criteria_json TEXT NOT NULL,
    methods_json TEXT NOT NULL,
    students_json TEXT NOT NULL,
    updated_at DATE NOT NULL,
    CHECK (id > 0),
    CHECK (user_id > 0),
    CHECK (TRIM(criteria_json) <> ''),
    CHECK (TRIM(methods_json) <> ''),
    FOREIGN KEY (user_id) REFERENCES Пользователь(id)
);
```

</td>
</tr>
</table>

*Листинг 1 – SQL-скрипты создания таблиц базы данных*

---

## Листинг 2 – Скрипты SQLite (реализация)

**Файл:** `database/schema.sql`

```sql
-- Создание таблицы "Пользователь"
CREATE TABLE IF NOT EXISTS users (
    login         TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (TRIM(login) <> '')
);

-- Создание таблицы "Профиль пользователя"
CREATE TABLE IF NOT EXISTS user_profiles (
    login               TEXT PRIMARY KEY,
    criteria            TEXT NOT NULL DEFAULT '[]',
    methods             TEXT NOT NULL DEFAULT '[]',
    criteria_importance TEXT NOT NULL DEFAULT '[]',
    method_scores       TEXT NOT NULL DEFAULT '[]',
    local_matrices      TEXT,
    students            TEXT NOT NULL DEFAULT '[]',
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (login) REFERENCES users(login) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_updated
    ON user_profiles(updated_at);
```

*Листинг 2 – SQL-скрипты SQLite*

---

## Листинг 3 – Примеры SQL-запросов

**Файл:** `database/queries.sql`

```sql
-- Загрузка данных пользователя
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

-- Сохранение данных пользователя
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

-- Авторизация
SELECT password_hash FROM users WHERE login = ?;
```

*Листинг 3 – Примеры SQL-запросов приложения*

---

## Листинг 4 – Модуль доступа к базе данных

**Файл:** `server/store.js`

```javascript
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

*Листинг 4 – Модуль доступа к базе данных*

---

## Листинг 5 – REST API сервера

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

*Листинг 5 – REST API сервера*

---

## Листинг 6 – Алгоритм МАИ (расчёт дефицита и CR)

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

*Листинг 6 – Алгоритм МАИ: дефицит, матрицы, CR*

---

## Листинг 7 – Рекомендация методики (МАИ)

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

*Листинг 7 – Алгоритм рекомендации методики обучения*
