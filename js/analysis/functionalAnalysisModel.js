/**
 * Функциональная модель расчёта МАИ (шаги 3.1–3.7).
 */

import { algorithmRecommendTeachingMethodAhp } from "./recommendationAlgorithms.js";

export const FUNCTIONAL_PIPELINE_OVERVIEW = [
  {
    id: "3.1",
    title: "Расчёт дефицита знаний",
    detail: "Оценки 1–10 → дефицит = 10 − оценка + 1. Чем ниже оценка, тем выше дефицит.",
  },
  {
    id: "3.2",
    title: "Построение матрицы критериев",
    detail: "Дефициты критериев → попарные сравнения (дефицит А / дефицит Б).",
  },
  {
    id: "3.3",
    title: "Расчёт весов критериев",
    detail: "Собственный вектор матрицы критериев → веса (сумма 100%).",
  },
  {
    id: "3.4",
    title: "Проверка согласованности (CR)",
    detail: "CR < 0.1 — согласованность достигнута; иначе рекомендация может быть ненадёжной.",
  },
  {
    id: "3.5",
    title: "Локальные приоритеты методик",
    detail: "Для каждого критерия — матрица сравнения методик и её собственный вектор.",
  },
  {
    id: "3.6",
    title: "Глобальные приоритеты",
    detail: "Σ (вес критерия × локальный приоритет методики по этому критерию).",
  },
  {
    id: "3.7",
    title: "Выбор лучшей методики",
    detail: "Методика с максимальным глобальным приоритетом становится рекомендацией.",
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
  const result = algorithmRecommendTeachingMethodAhp({
    lessons,
    criterionIds,
    localMatrices,
  });

  const steps = [];

  steps.push({
    id: "3.1",
    title: "Расчёт дефицита знаний",
    input: "Средние оценки 1–10 по урокам.",
    output: `Дефициты: ${result.deficits.map((d) => d.toFixed(1)).join(", ")}.`,
    data: { scores10: result.scores10, deficits: result.deficits },
  });

  steps.push({
    id: "3.2",
    title: "Построение матрицы критериев",
    input: "Дефициты критериев → попарные отношения (дефицит А / дефицит Б).",
    output: "Матрица попарных сравнений критериев построена.",
    data: { criteriaMatrix: result.criteriaMatrix },
  });

  steps.push({
    id: "3.3",
    title: "Расчёт весов критериев",
    input: "Матрица попарных сравнений критериев.",
    output: `Веса: ${result.critW.map((w) => `${(w * 100).toFixed(1)}%`).join(", ")}.`,
    data: { critW: result.critW },
  });

  steps.push({
    id: "3.4",
    title: "Проверка согласованности (CR)",
    input: "Матрица критериев.",
    output: `CR = ${result.criteriaCR.toFixed(3)} (${result.criteriaConsistent ? "согласовано" : "есть противоречия"}).`,
    data: { criteriaCR: result.criteriaCR, criteriaConsistent: result.criteriaConsistent },
  });

  steps.push({
    id: "3.5",
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
    id: "3.6",
    title: "Глобальные приоритеты",
    input: "Веса критериев × локальные приоритеты.",
    output: `Приоритеты: ${result.globalPriorities.map((p) => `${(p * 100).toFixed(1)}%`).join(", ")}.`,
    data: { global: result.globalPriorities },
  });

  steps.push({
    id: "3.7",
    title: "Выбор лучшей методики",
    input: "Глобальные приоритеты.",
    output: `Рекомендация: индекс ${result.bestIdx}, приоритет ${(result.globalPriorities[result.bestIdx] * 100).toFixed(1)}%.`,
    data: {
      bestIdx: result.bestIdx,
      marginFirstSecond: result.marginFirstSecond,
      ranking: result.ranking,
    },
  });

  return {
    scores10: result.scores10,
    deficits: result.deficits,
    criteriaMatrix: result.criteriaMatrix,
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
