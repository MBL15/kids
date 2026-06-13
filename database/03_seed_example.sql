-- Дубликат database/seed_example.sql (листинг 03)
-- См. seed_example.sql

INSERT OR IGNORE INTO users (login, password_hash, role, methodist_login)
VALUES ('methodist', '$2a$10$demo_hash_replace_with_real_bcrypt', 'methodist', NULL);

INSERT OR REPLACE INTO user_profiles (login, criteria, methods, students)
VALUES (
  'methodist',
  '[{"id":"theory","name":"Теория"},{"id":"graphs","name":"Графики"}]',
  '[{"id":"m1","name":"Классическая"},{"id":"m2","name":"Практикум"}]',
  '[{"id":"s1","name":"Денис","class":"10","subject":"математика","lessons":[],"localMatrices":[]}]'
);

INSERT OR IGNORE INTO users (login, password_hash, role, methodist_login)
VALUES ('tutor1', '$2a$10$demo_hash_replace_with_real_bcrypt', 'tutor', 'methodist');
