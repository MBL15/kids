/** Шкала оценок уроков в правилах (подходящесть методики): 2–5. */
export const SCORE_MIN = 2;
export const SCORE_MAX = 5;
export const SCORE_DEFAULT = 3;

/** Шкала оценок ученика для МАИ: 1–10. */
export const STUDENT_SCORE_MIN = 1;
export const STUDENT_SCORE_MAX = 10;

export const DEFAULT_CRITERIA = [
  { id: "theory", name: "Теория" },
  { id: "graphs", name: "Графики" },
  { id: "tasks", name: "Задачи" },
  { id: "independence", name: "Самостоятельность" },
];

export const DEFAULT_METHODS = [
  { id: "m1", name: "Классическая" },
  { id: "m2", name: "Практикум" },
  { id: "m3", name: "Проектная" },
  { id: "m4", name: "Визуальная" },
];

export function defaultCriteriaImportance(count) {
  return Array.from({ length: count }, () => SCORE_DEFAULT);
}

/** methodScores[M][K] — подходящесть методики под критерий (2–5), конвертируется в матрицы МАИ. */
export function defaultMethodScores(numMethods, numCriteria) {
  return Array.from({ length: numMethods }, () =>
    Array.from({ length: numCriteria }, () => SCORE_DEFAULT)
  );
}
