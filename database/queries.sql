-- =============================================================================
-- Примеры SQL-запросов
-- Файл: database/queries.sql
-- =============================================================================

-- --- 1. Список пользователей с ролями ----------------------------------------
SELECT
  login,
  role,
  methodist_login,
  created_at
FROM users
ORDER BY created_at;

-- --- 2. Все методисты --------------------------------------------------------
SELECT login, created_at
FROM users
WHERE role = 'methodist'
ORDER BY login;

-- --- 3. Репетиторы и их методисты --------------------------------------------
SELECT
  t.login       AS tutor_login,
  t.methodist_login,
  m.created_at  AS methodist_since
FROM users t
LEFT JOIN users m ON m.login = t.methodist_login
WHERE t.role = 'tutor'
ORDER BY t.login;

-- --- 4. Профиль методиста (GET /api/me для methodist) ------------------------
SELECT
  u.login,
  u.role,
  p.criteria,
  p.methods,
  p.students,
  p.updated_at
FROM users u
INNER JOIN user_profiles p ON p.login = u.login
WHERE u.login = 'methodist';

-- --- 5. Данные репетитора через профиль методиста (логика API) ---------------
SELECT
  t.login              AS tutor_login,
  t.methodist_login,
  p.criteria,
  p.methods,
  p.students,
  p.updated_at
FROM users t
INNER JOIN user_profiles p ON p.login = t.methodist_login
WHERE t.login = 'tutor1';

-- --- 6. Количество учеников у методиста --------------------------------------
SELECT
  u.login,
  json_array_length(p.students) AS student_count
FROM users u
INNER JOIN user_profiles p ON p.login = u.login
WHERE u.role = 'methodist';

-- --- 7. Список учеников (имя, класс, предмет) --------------------------------
SELECT
  u.login AS methodist_login,
  json_extract(s.value, '$.id')      AS student_id,
  json_extract(s.value, '$.name')    AS student_name,
  json_extract(s.value, '$.class')   AS student_class,
  json_extract(s.value, '$.subject') AS student_subject,
  json_array_length(json_extract(s.value, '$.lessons')) AS lesson_count
FROM users u
INNER JOIN user_profiles p ON p.login = u.login
CROSS JOIN json_each(p.students) AS s
WHERE u.role = 'methodist';

-- --- 8. Регистрация методиста ------------------------------------------------
INSERT INTO users (login, password_hash, role, methodist_login)
VALUES ('methodist', '$2a$10$example_bcrypt_hash', 'methodist', NULL);

INSERT INTO user_profiles (login, criteria, methods, students)
VALUES (
  'methodist',
  '[{"id":"theory","name":"Теория"},{"id":"graphs","name":"Графики"}]',
  '[{"id":"m1","name":"Классическая"},{"id":"m2","name":"Практикум"}]',
  '[]'
);

-- --- 9. Регистрация репетитора (без user_profiles) ---------------------------
INSERT INTO users (login, password_hash, role, methodist_login)
VALUES ('tutor1', '$2a$10$example_bcrypt_hash', 'tutor', 'methodist');

-- --- 10. Авторизация: получить хеш и роль ------------------------------------
SELECT login, password_hash, role, methodist_login
FROM users
WHERE login = 'tutor1';

-- --- 11. Сохранение профиля методиста (PUT /api/me) --------------------------
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

-- --- 12. Статистика по базе --------------------------------------------------
SELECT role, COUNT(*) AS cnt FROM users GROUP BY role;

SELECT login, updated_at
FROM user_profiles
ORDER BY updated_at DESC;

-- --- 13. Удаление пользователя (каскадно удалит профиль методиста) -----------
DELETE FROM users WHERE login = 'methodist';
