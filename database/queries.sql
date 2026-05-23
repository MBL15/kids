-- =============================================================================
-- Примеры SQL-запросов приложения
-- Файл: database/queries.sql
-- =============================================================================

-- --- Регистрация пользователя ------------------------------------------------
INSERT INTO users (login, password_hash)
VALUES ('repetitor1', '$2a$10$example_bcrypt_hash_here');

INSERT INTO user_profiles (
  login, criteria, methods, criteria_importance, method_scores, students
) VALUES (
  'repetitor1',
  '[{"id":"theory","name":"Теория"},{"id":"graphs","name":"Графики"}]',
  '[{"id":"m1","name":"Классическая"},{"id":"m2","name":"Практикум"}]',
  '[3,3]',
  '[[3,3],[3,3]]',
  '[]'
);

-- --- Авторизация: получить хеш пароля ----------------------------------------
SELECT password_hash
FROM users
WHERE login = 'repetitor1';

-- --- Загрузка состояния пользователя (GET /api/me) ---------------------------
SELECT
  p.criteria,
  p.methods,
  p.criteria_importance,
  p.method_scores,
  p.local_matrices,
  p.students
FROM user_profiles p
INNER JOIN users u ON u.login = p.login
WHERE p.login = 'repetitor1';

-- --- Сохранение состояния (PUT /api/me) --------------------------------------
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

-- --- Статистика по базе ------------------------------------------------------
SELECT COUNT(*) AS user_count FROM users;

SELECT login, updated_at
FROM user_profiles
ORDER BY updated_at DESC;

-- --- Удаление пользователя (каскадно удалит профиль) -------------------------
DELETE FROM users WHERE login = 'repetitor1';
