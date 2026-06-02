/**
 * Даталогическая модель данных для анализа оценок (МАИ).
 */

/**
 * @typedef {Object} LessonRecord
 * @property {string} id
 * @property {string} date
 * @property {Record<string, number>} scores — id критерия → балл 2–5 (или 1–10)
 */

/**
 * @typedef {Object} RuleProfile
 * @property {number[]} criteriaImportance — справочная важность 2–5
 * @property {number[][]} methodScores — [методика][критерий], 2–5 → матрицы МАИ
 * @property {number[][][]} [localMatrices] — K матриц M×M парных сравнений методик
 */

export const ENTITY_RELATIONS = [
  "Пользователь хранит Критерии, Методики и матрицы парных сравнений методик (МАИ, шкала Saaty).",
  "Пользователь ведёт список Учеников (1 : N).",
  "Ученик имеет Записи уроков с оценками по критериям (шкала 2–5, конвертируется в 1–10).",
  "МАИ: оценки → дефицит (10 − оценка + 1) → матрица критериев → веса критериев.",
  "МАИ: для каждого критерия — матрица сравнения методик → локальные приоритеты.",
  "МАИ: глобальный приоритет = Σ (вес критерия × локальный приоритет методики).",
  "Рекомендация — методика с максимальным глобальным приоритетом; проверка CR < 0.1.",
];

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
