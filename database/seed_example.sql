-- =============================================================================
-- Тестовые данные (для демонстрации / приложения к диплому)
-- Файл: database/seed_example.sql
-- Внимание: password_hash — заглушка; в приложении используется bcrypt.
-- =============================================================================

INSERT OR IGNORE INTO users (login, password_hash) VALUES
  ('demo', '$2a$10$demo_hash_replace_with_real_bcrypt');

INSERT OR REPLACE INTO user_profiles (
  login,
  criteria,
  methods,
  criteria_importance,
  method_scores,
  local_matrices,
  students
) VALUES (
  'demo',
  '[
    {"id":"theory","name":"Теория"},
    {"id":"graphs","name":"Графики"},
    {"id":"tasks","name":"Задачи"},
    {"id":"independence","name":"Самостоятельность"}
  ]',
  '[
    {"id":"m1","name":"Классическая"},
    {"id":"m2","name":"Практикум"},
    {"id":"m3","name":"Проектная"},
    {"id":"m4","name":"Визуальная"}
  ]',
  '[3,3,3,3]',
  '[
    [5,4,4,4],
    [3,3,4,3],
    [3,3,3,3],
    [3,3,3,5]
  ]',
  NULL,
  '[
    {
      "id": "s1",
      "name": "Денис",
      "notes": "10 класс",
      "lessons": [
        {
          "id": "l1",
          "date": "2026-05-21",
          "scores": {
            "theory": 3,
            "graphs": 9,
            "tasks": 4,
            "independence": 6
          }
        }
      ]
    }
  ]'
);
