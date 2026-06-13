-- Тестовые данные (листинг 4 в LISTING.md)
-- Дубликат database/seed_example.sql

INSERT OR IGNORE INTO users (login, password_hash, role, methodist_login)
VALUES (
  'methodist',
  '$2a$10$demo_hash_replace_with_real_bcrypt',
  'methodist',
  NULL
);

INSERT OR REPLACE INTO user_profiles (
  login, criteria, methods, students
) VALUES (
  'methodist',
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
  '[
    {
      "id": "s1",
      "name": "Денис",
      "class": "10",
      "subject": "математика",
      "lessons": [
        {
          "id": "l1",
          "date": "2026-05-21",
          "timeStart": "14:00",
          "timeEnd": "15:30",
          "scores": {
            "theory": 3,
            "graphs": 4,
            "tasks": 3,
            "independence": 3
          }
        }
      ],
      "localMatrices": []
    }
  ]'
);

INSERT OR IGNORE INTO users (login, password_hash, role, methodist_login)
VALUES (
  'tutor1',
  '$2a$10$demo_hash_replace_with_real_bcrypt',
  'tutor',
  'methodist'
);
