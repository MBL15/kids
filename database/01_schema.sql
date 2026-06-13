-- =============================================================================
-- Схема базы данных SQLite (листинг 01)
-- Дубликат database/schema.sql
-- =============================================================================

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
