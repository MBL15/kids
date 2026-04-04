/**
 * Даталогическая модель данных для анализа оценок.
 * Описывает сущности, атрибуты и связи (концептуальный уровень без привязки к СУБД).
 */

/**
 * @typedef {Object} Criterion
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {Object} TeachingMethod
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {Object} LessonRecord
 * @property {string} id
 * @property {string} date - YYYY-MM-DD или ISO (наследие)
 * @property {Record<string, number>} scores - id критерия → балл 2–5 (или 0–100 в старых данных)
 */

/**
 * @typedef {Object} Student
 * @property {string} id
 * @property {string} name
 * @property {string} [notes]
 * @property {LessonRecord[]} lessons
 */

/**
 * @typedef {Object} RuleProfile
 * @property {number[]} criteriaImportance — по одному на критерий, шкала 2–5
 * @property {number[][]} methodScores — [методика][критерий], шкала 2–5
 */

/**
 * @typedef {Object} AnalysisSnapshot
 * @property {Criterion[]} criteria
 * @property {TeachingMethod[]} methods
 * @property {RuleProfile} rules
 * @property {Student} student — выбранный для расчёта
 */

/** Связи между сущностями (для схемы и отчёта). */
export const ENTITY_RELATIONS = [
  "Пользователь (учётная запись) хранит набор Критериев, Методик и Профиль правил (веса).",
  "Пользователь ведёт список Учеников (1 : N).",
  "Ученик имеет много Записей уроков (1 : N); каждая запись привязана к дате занятия.",
  "Запись урока содержит набор Оценок по критериям (N : M через пары «критерий — балл»).",
  "Профиль правил задаёт важность каждого Критерия и матрицу «Методика × Критерий» (насколько методика подходит под критерий).",
  "Анализ: Записи уроков выбранного Ученика + Профиль правил → Рекомендация (приоритет методик).",
];

/**
 * Собирает снимок данных для анализа (логический контекст без лишних полей состояния приложения).
 * @param {object} params
 * @param {{ id: string, name: string }[]} params.criteria
 * @param {{ id: string, name: string }[]} params.methods
 * @param {number[]} params.criteriaImportance
 * @param {number[][]} params.methodScores
 * @param {Student} params.student
 * @returns {AnalysisSnapshot}
 */
export function buildAnalysisSnapshot({ criteria, methods, criteriaImportance, methodScores, student }) {
  return {
    criteria: criteria.map((c) => ({ id: c.id, name: c.name })),
    methods: methods.map((m) => ({ id: m.id, name: m.name })),
    rules: {
      criteriaImportance: [...criteriaImportance],
      methodScores: methodScores.map((row) => [...row]),
    },
    student: {
      id: student.id,
      name: student.name,
      notes: student.notes,
      lessons: (student.lessons || []).map((l) => ({
        id: l.id,
        date: l.date,
        scores: { ...l.scores },
      })),
    },
  };
}
