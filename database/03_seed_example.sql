-- ============================================================
-- Пример начальных данных (для демонстрации в дипломе)
-- ВНИМАНИЕ: password_hash ниже — заглушка, не используйте в продакшене
-- ============================================================

INSERT OR IGNORE INTO users (login, password_hash)
VALUES ('demo', '$2a$10$examplehashforDiplomaOnlyxxxxxxxxxxxxxxxxxxxxx');

INSERT OR REPLACE INTO user_profiles (
    login,
    criteria,
    methods,
    criteria_importance,
    method_scores,
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
        [3,3,3,3],
        [3,3,3,3],
        [3,3,3,3],
        [3,3,3,3]
    ]',
    '[
        {
            "id":"s1",
            "name":"Иван Петров",
            "notes":"10 А",
            "lessons":[
                {
                    "id":"l1",
                    "date":"2026-05-21",
                    "scores":{"theory":3,"graphs":9,"tasks":4,"independence":6}
                }
            ]
        }
    ]'
);
