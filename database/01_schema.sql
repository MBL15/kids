-- ============================================================
-- Схема базы данных SQLite
-- Приложение: подбор методики преподавания (МАИ)
-- СУБД: SQLite 3
-- Файл БД: data/app.db
-- ============================================================

PRAGMA foreign_keys = ON;

-- Таблица пользователей (репетиторов)
CREATE TABLE IF NOT EXISTS users (
    login         TEXT PRIMARY KEY,              -- логин (уникальный идентификатор)
    password_hash TEXT NOT NULL,                 -- хеш пароля (bcrypt)
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Профиль пользователя: настройки правил и данные учеников
-- Сложные структуры хранятся в JSON-полях (критерии, методики, уроки)
CREATE TABLE IF NOT EXISTS user_profiles (
    login               TEXT PRIMARY KEY
                            REFERENCES users(login) ON DELETE CASCADE,
    criteria            TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ id, name }, ...]
    methods             TEXT NOT NULL DEFAULT '[]',   -- JSON: [{ id, name }, ...]
    criteria_importance TEXT NOT NULL DEFAULT '[]', -- JSON: [2..5, ...]
    method_scores       TEXT NOT NULL DEFAULT '[]', -- JSON: M×K, подходящесть методик
    local_matrices      TEXT,                       -- JSON: матрицы парных сравнений МАИ
    students            TEXT NOT NULL DEFAULT '[]', -- JSON: ученики и уроки
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Индекс для быстрого поиска профиля по логину (PK уже индексирует login)
-- CREATE INDEX IF NOT EXISTS idx_user_profiles_updated ON user_profiles(updated_at);
