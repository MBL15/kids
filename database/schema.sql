-- =============================================================================
-- Схема базы данных SQLite
-- Приложение: подбор методики преподавания (МАИ)
-- СУБД: SQLite 3
-- Файл: database/schema.sql
-- =============================================================================

PRAGMA foreign_keys = ON;

-- -----------------------------------------------------------------------------
-- Таблица users — учётные записи репетиторов
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  login         TEXT PRIMARY KEY,              -- логин (уникальный идентификатор)
  password_hash TEXT NOT NULL,                 -- bcrypt-хеш пароля
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- Таблица user_profiles — данные приложения пользователя
-- Сложные структуры (критерии, методики, ученики) хранятся в JSON-колонках.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  login               TEXT PRIMARY KEY
                      REFERENCES users(login) ON DELETE CASCADE,
  criteria            TEXT NOT NULL DEFAULT '[]',  -- JSON: [{id, name}, ...]
  methods             TEXT NOT NULL DEFAULT '[]',  -- JSON: [{id, name}, ...]
  criteria_importance TEXT NOT NULL DEFAULT '[]',  -- JSON: [2..5] — справ. важность
  method_scores       TEXT NOT NULL DEFAULT '[]',  -- JSON: [M][K] — подходящесть 2–5
  local_matrices      TEXT,                        -- JSON: K матриц M×M (МАИ, Saaty)
  students            TEXT NOT NULL DEFAULT '[]',  -- JSON: ученики и уроки
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- Индексы (для диплома; в текущей версии login уже PK)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated
  ON user_profiles(updated_at);

-- -----------------------------------------------------------------------------
-- Описание JSON-полей (для пояснительной записки)
-- -----------------------------------------------------------------------------
-- criteria:           список критериев оценки (Теория, Графики, Задачи, …)
-- methods:            список методик обучения (Классическая, Практикум, …)
-- criteria_importance: справочные веса критериев (не участвуют в МАИ напрямую)
-- method_scores:      таблица «методика × критерий», шкала 2–5
-- local_matrices:     матрицы парных сравнений методик по каждому критерию
-- students:           [{ id, name, notes, lessons: [{ id, date, scores: {} }] }]
