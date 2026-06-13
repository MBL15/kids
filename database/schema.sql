-- =============================================================================
-- Схема базы данных SQLite
-- Приложение: подбор методики преподавания (МАИ)
-- СУБД: SQLite 3
-- Файл БД: data/app.db
-- Актуально для версии с ролями methodist / tutor
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- users — учётные записи (методист и репетитор)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- user_profiles — данные методиста (правила, ученики, матрицы МАИ)
-- Профиль создаётся только у методиста. Репетитор читает/обновляет данные
-- методиста через API (уроки и карточки учеников).
-- Вложенные сущности хранятся в JSON-колонках.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Описание JSON-полей user_profiles
-- -----------------------------------------------------------------------------
-- criteria  — [{ "id": string, "name": string }]
-- methods   — [{ "id": string, "name": string }]
-- students  — [{
--   "id": string,
--   "name": string,
--   "class": string,
--   "subject": string,
--   "lessons": [{
--     "id": string,
--     "date": "YYYY-MM-DD",
--     "timeStart": string | optional,
--     "timeEnd": string | optional,
--     "scores": { "<criterionId>": 2..5 }
--   }],
--   "localMatrices": number[][][]   -- K матриц M×M (шкала Saaty), по одной на критерий
-- }]
--
-- Устаревшие поля (сохраняются для совместимости, в МАИ не используются):
-- criteria_importance — ручная важность критериев
-- method_scores       — таблица подходящести методик M×K
-- local_matrices      — глобальные матрицы на уровне профиля (заменены localMatrices у ученика)

-- -----------------------------------------------------------------------------
-- Миграция существующей БД (если таблица users создана без role)
-- Выполняется автоматически в server/db.js; скрипт ниже — для ручного применения.
-- -----------------------------------------------------------------------------
-- ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'methodist';
-- ALTER TABLE users ADD COLUMN methodist_login TEXT REFERENCES users(login);
