-- Дубликат database/queries.sql (листинг 02)

-- Список пользователей с ролями
SELECT login, role, methodist_login, created_at FROM users ORDER BY created_at;

-- Репетиторы и их методисты
SELECT t.login AS tutor_login, t.methodist_login
FROM users t
WHERE t.role = 'tutor';

-- Ученики методиста (имя, класс, предмет)
SELECT
  json_extract(s.value, '$.name')    AS student_name,
  json_extract(s.value, '$.class')   AS student_class,
  json_extract(s.value, '$.subject') AS student_subject
FROM user_profiles p
CROSS JOIN json_each(p.students) AS s
WHERE p.login = 'methodist';

-- Сохранение профиля (PUT /api/me)
UPDATE user_profiles
SET criteria = ?, methods = ?, criteria_importance = ?, method_scores = ?,
    local_matrices = ?, students = ?, updated_at = datetime('now')
WHERE login = ?;
