/** Шкала оценок для правил: 2–5 (важность критерия и «насколько методика подходит»). */

export const SCORE_MIN = 2;
export const SCORE_MAX = 5;
/** Нейтральное значение по умолчанию */
export const SCORE_DEFAULT = 3;

export const DEFAULT_CRITERIA = [
  { id: "geom", name: "Геометрия / пространственное мышление" },
  { id: "interest", name: "Заинтересованность в предмете" },
  { id: "hw", name: "Выполнение домашних заданий" },
];

export const DEFAULT_METHODS = [
  { id: "m1", name: "Наглядно-демонстрационный метод" },
  { id: "m2", name: "Проблемное обучение" },
  { id: "m3", name: "Игровые и сюжетные задания" },
  { id: "m4", name: "Пошаговый тренажёр и дозированная нагрузка" },
];

/** Важность каждого критерия, 2–5 */
export function defaultCriteriaImportance(count) {
  return Array.from({ length: count }, () => SCORE_DEFAULT);
}

/**
 * Оценки: строка = методика, столбец = критерий.
 * Значение 2–5: насколько эта методика подходит под этот критерий.
 */
export function defaultMethodScores(numMethods, numCriteria) {
  return Array.from({ length: numMethods }, () =>
    Array.from({ length: numCriteria }, () => SCORE_DEFAULT)
  );
}
