/**
 * Функциональная модель расчёта МАИ (шаги 3.1–3.7).
 */

import { algorithmRecommendTeachingMethodAhp } from "./recommendationAlgorithms.js";

export const FUNCTIONAL_PIPELINE_OVERVIEW = [
  {
    id: "F1",
    title: "Оценка ученика по критериям",
    detail: "Агрегация оценок уроков в шкалу 1–10 по каждому критерию (теория, графики, задачи и т.д.).",
  },
  {
    id: "F2",
    title: "Расчёт дефицита знаний",
    detail: "Дефицит = 10 − оценка + 1. Чем ниже оценка, тем выше дефицит и важность улучшения.",
  },
  {
    id: "F3",
    title: "Матрица критериев и веса",
    detail: "Попарное сравнение критериев через дефициты; собственный вектор матрицы → веса (сумма 100%).",
  },
  {
    id: "F4",
    title: "Проверка согласованности (CR)",
    detail: "CR < 0.1 — согласованность достигнута; иначе данные противоречивы.",
  },
  {
    id: "F5",
    title: "Локальные приоритеты методик",
    detail: "Для каждого критерия — матрица сравнения методик и её собственный вектор.",
  },
  {
    id: "F6",
    title: "Глобальные приоритеты",
    detail: "Σ (вес критерия × локальный приоритет методики). Максимум → рекомендация.",
  },
];

/**
 * @param {object} ctx
 * @param {string[]} ctx.criterionIds
 * @param {import("./dataLogicalModel.js").LessonRecord[]} ctx.lessons
 * @param {number[][]} ctx.localMatrices
 */
export function runFunctionalScoreAnalysis(ctx) {
  const { criterionIds, lessons, localMatrices } = ctx;
  const result = algorithmRecommendTeachingMethodAhp({ lessons, criterionIds, localMatrices });

  const steps = [];

  steps.push({
    id: "F1",
    title: "Оценка ученика по критериям (1–10)",
    input: "Оценки по урокам для каждого критерия.",
    output: `Средние оценки: ${result.scores10.map((s) => s.toFixed(1)).join(", ")}.`,
    data: { scores10: result.scores10, criterionIds },
  });

  steps.push({
    id: "F2",
    title: "Расчёт дефицита знаний",
    input: "Оценки 1–10.",
    output: `Дефициты: ${result.deficits.map((d) => d.toFixed(1)).join(", ")}.`,
    data: { deficits: result.deficits },
  });

  steps.push({
    id: "F3",
    title: "Матрица критериев и веса",
    input: "Дефициты критериев → попарные отношения.",
    output: `Веса: ${result.critW.map((w) => `${(w * 100).toFixed(1)}%`).join(", ")}.`,
    data: { critW: result.critW, criteriaMatrix: result.criteriaMatrix },
  });

  steps.push({
    id: "F4",
    title: "Проверка согласованности (CR)",
    input: "Матрица критериев.",
    output: `CR = ${result.criteriaCR.toFixed(3)} (${result.criteriaConsistent ? "согласовано" : "есть противоречия"}).`,
    data: { criteriaCR: result.criteriaCR, criteriaConsistent: result.criteriaConsistent },
  });

  steps.push({
    id: "F5",
    title: "Локальные приоритеты методик",
    input: "Матрицы сравнения методик по каждому критерию.",
    output: `${result.localPriorities.length} локальных векторов приоритетов.`,
    data: {
      localPriorities: result.localPriorities,
      localCR: result.localCR,
      localConsistent: result.localConsistent,
    },
  });

  steps.push({
    id: "F6",
    title: "Глобальные приоритеты и рекомендация",
    input: "Веса критериев × локальные приоритеты.",
    output: `Лучшая методика: индекс ${result.bestIdx}, приоритет ${(result.globalPriorities[result.bestIdx] * 100).toFixed(1)}%.`,
    data: {
      global: result.globalPriorities,
      bestIdx: result.bestIdx,
      marginFirstSecond: result.marginFirstSecond,
      ranking: result.ranking,
    },
  });

  return {
    scores10: result.scores10,
    deficits: result.deficits,
    critW: result.critW,
    criteriaCR: result.criteriaCR,
    criteriaConsistent: result.criteriaConsistent,
    localPriorities: result.localPriorities,
    localCR: result.localCR,
    localConsistent: result.localConsistent,
    global: result.globalPriorities,
    bestIdx: result.bestIdx,
    marginFirstSecond: result.marginFirstSecond,
    ranking: result.ranking,
    steps,
  };
}
