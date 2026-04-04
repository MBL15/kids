/**
 * Алгоритмы выбора предпочитаемой методики преподавания по результатам анализа оценок.
 *
 * Связь с анализом:
 * - На вход поступают уже вычисленные веса критериев с учётом успеваемости (F2–F4)
 *   и матрица «методика × критерий» из правил.
 * - Алгоритм 1 строит вектор глобальных приоритетов альтернатив.
 * - Алгоритм 2 выбирает лучшую методику и ранжирует остальные.
 */

import { globalPrioritiesFromRatings } from "../ahp.js";
import { SCORE_MAX } from "../data.js";

const EPS = 1e-12;

/**
 * АЛГОРИТМ 1 — Синтез глобальных приоритетов методик (взвешенная аддитивная схема)
 *
 * Идея: для каждого критерия k нормалуются «локальные» приоритеты методик по столбцу
 * матрицы подходящести; затем итоговый приоритет методики m есть взвешенная сумма
 * локальных приоритетов с весами w_k (скорректированными весами критериев).
 *
 * Вход:
 *   wAdj — массив длины K, ненормализованные положительные числа (пропорциональны весам критериев);
 *   methodScores — матрица M×K, M[method][criterion], шкала 2–5.
 * Выход:
 *   global — массив длины M, сумма компонент = 1 (распределение приоритета).
 *
 * @param {number[]} wAdj — скорректированные веса критериев (после β)
 * @param {number[][]} methodScores — строки = методики, столбцы = критерии
 * @returns {number[]}
 */
export function algorithmSynthesizeGlobalPriorities(wAdj, methodScores) {
  const scaled = wAdj.map((w) => w * SCORE_MAX);
  return globalPrioritiesFromRatings(scaled, methodScores);
}

/**
 * АЛГОРИТМ 2 — Выбор предпочитаемой методики по максимуму приоритета
 *
 * Правило: j* = arg max_j global[j]. При равенстве приоритетов (с точностью EPS)
 * выбирается методика с меньшим индексом (детерминированно, порядок в списке методик).
 *
 * @param {number[]} globalPriorities — вектор из алгоритма 1
 * @returns {{ bestIndex: number, bestPriority: number }}
 */
export function algorithmArgmaxMethod(globalPriorities) {
  if (!globalPriorities?.length) {
    return { bestIndex: -1, bestPriority: 0 };
  }
  let bestIndex = 0;
  for (let j = 1; j < globalPriorities.length; j++) {
    const p = globalPriorities[j];
    const best = globalPriorities[bestIndex];
    if (p > best + EPS) bestIndex = j;
  }
  return { bestIndex, bestPriority: globalPriorities[bestIndex] };
}

/**
 * АЛГОРИТМ 3 — Полное ранжирование методик по убыванию приоритета
 *
 * Используется для отчёта и диаграммы. При равенстве — стабильный порядок по возрастанию индекса.
 *
 * @param {number[]} globalPriorities
 * @returns {{ index: number, priority: number, rank: number }[]}
 */
export function algorithmRankMethods(globalPriorities) {
  const n = globalPriorities.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => {
    const pa = globalPriorities[a];
    const pb = globalPriorities[b];
    if (Math.abs(pb - pa) > EPS) return pb - pa;
    return a - b;
  });
  return idx.map((index, r) => ({
    index,
    priority: globalPriorities[index],
    rank: r + 1,
  }));
}

/**
 * Зазор между первой и второй методикой в ранжировании (насколько «уверенна» рекомендация).
 * @param {number[]} globalPriorities
 * @returns {number}
 */
export function algorithmPriorityMargin(globalPriorities) {
  const ranked = algorithmRankMethods(globalPriorities);
  if (ranked.length < 2) return ranked[0]?.priority ?? 0;
  return ranked[0].priority - ranked[1].priority;
}

/**
 * Объединение алгоритмов 1–3: от скорректированных весов до выбора и ранжирования.
 *
 * @param {number[]} wAdj
 * @param {number[][]} methodScores
 * @returns {{
 *   globalPriorities: number[],
 *   bestIndex: number,
 *   bestPriority: number,
 *   ranking: ReturnType<typeof algorithmRankMethods>,
 *   marginFirstSecond: number
 * }}
 */
export function algorithmRecommendTeachingMethod(wAdj, methodScores) {
  const globalPriorities = algorithmSynthesizeGlobalPriorities(wAdj, methodScores);
  const { bestIndex, bestPriority } = algorithmArgmaxMethod(globalPriorities);
  const ranking = algorithmRankMethods(globalPriorities);
  const marginFirstSecond = algorithmPriorityMargin(globalPriorities);
  return {
    globalPriorities,
    bestIndex,
    bestPriority,
    ranking,
    marginFirstSecond,
  };
}
