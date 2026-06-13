# Скрипты базы данных

## Файлы

| Файл | Назначение |
|------|------------|
| `schema.sql` | **Актуальная DDL-схема** (`users`, `user_profiles`, роли) |
| `queries.sql` | Примеры SQL-запросов |
| `seed_example.sql` | Тестовые данные (методист + репетитор) |
| `datalogical_model.md` | **Даталогическая модель** для пояснительной записки |
| `01_schema.sql` … `03_seed_example.sql` | Дубликаты для нумерации листингов диплома |
| `LISTING.md` | Готовые листинги для приложения к диплому |

## База данных

После `npm start` создаётся:

```
data/app.db
```

Схема применяется автоматически в `server/db.js` (`initSchema()`).

## Ручной запуск скриптов

```bash
sqlite3 data/app.db < database/schema.sql
sqlite3 data/app.db < database/seed_example.sql
```

Просмотр:

```bash
sqlite3 data/app.db "SELECT login, role, methodist_login FROM users;"
```

## Кратко о модели

- **users** — методист и репетитор (`role`, `methodist_login`)
- **user_profiles** — только у методиста: критерии, методики, ученики (JSON)
- Ученик: `name`, `class`, `subject`, `lessons[]`, `localMatrices[][][]`
- Репетитор работает с профилем своего методиста через API

Подробнее — в **`datalogical_model.md`**.
