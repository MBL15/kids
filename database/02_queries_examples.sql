-- Примеры SQL-запросов (листинг 3 в LISTING.md)
-- Дубликат фрагментов database/queries.sql

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
WHERE t.login = 'tutor1';

-- Ученики методиста: имя, класс, предмет
SELECT
  json_extract(s.value, '$.name')    AS student_name,
  json_extract(s.value, '$.class')   AS student_class,
  json_extract(s.value, '$.subject') AS student_subject,
  json_array_length(json_extract(s.value, '$.lessons')) AS lesson_count
FROM user_profiles p
CROSS JOIN json_each(p.students) AS s
WHERE p.login = 'methodist';

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
