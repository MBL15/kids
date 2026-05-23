-- ============================================================
-- Примеры SQL-запросов для диплома / отчёта
-- ============================================================

-- 1. Список всех пользователей
SELECT login, created_at FROM users ORDER BY created_at;

-- 2. Количество пользователей в системе
SELECT COUNT(*) AS user_count FROM users;

-- 3. Профиль пользователя (без пароля)
SELECT
    u.login,
    u.created_at,
    p.updated_at,
    p.criteria,
    p.methods,
    p.students
FROM users u
INNER JOIN user_profiles p ON p.login = u.login
WHERE u.login = 'demo';

-- 4. Количество учеников у пользователя (через json_each в SQLite 3.38+)
-- Если версия SQLite старее — считайте на стороне приложения.
SELECT
    u.login,
    json_array_length(p.students) AS student_count
FROM users u
INNER JOIN user_profiles p ON p.login = u.login;

-- 5. Обновление профиля (как делает API PUT /api/me)
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

-- 6. Удаление пользователя (каскадно удалит профиль)
DELETE FROM users WHERE login = ?;
