/**
 * Функциональная модель анализа оценок: декомпозиция на функции (поток обработки данных).
 * Каждый шаг имеет вход, выход и назначение в терминах предметной области.
 */

import { aggregateLessonScores, adjustCriteriaWeightsForChild, normalizeVector } from "../ahp.js";
import { algorithmRecommendTeachingMethod } from "./recommendationAlgorithms.js";

/** Краткое описание конвейера для экрана «Анализ» (без числовых результатов). */
export const FUNCTIONAL_PIPELINE_OVERVIEW = [
  {
    id: "F1",
    title: "Формирование аналитического контекста",
    detail: "Выбор ученика, загрузка уроков с оценками и профиля правил (критерии, методики, веса).",
  },
  {
    id: "F2",
    title: "Агрегирование оценок занятий",
    detail: "По всем урокам вычисляется уровень по каждому критерию в шкале 0…1.",
  },
  {
    id: "F3",
    title: "Нормализация важности критериев",
    detail: "Заданная важность (2–5) переводится в базовые относительные веса.",
  },
  {
    id: "F4",
    title: "Корректировка весов по профилю ученика",
    detail: "Вес критериев с более низким уровнем усиливается (параметр β).",
  },
  {
    id: "F5",
    title: "Синтез приоритетов методик",
    detail: "Для каждой методики считается итоговый приоритет с учётом матрицы «методика × критерий».",
  },
  {
    id: "F6",
    title: "Рекомендация",
    detail: "Выбирается методика с наибольшим глобальным приоритетом.",
  },
];

/**
 * @typedef {Object} FunctionalStep
 * @property {string} id
 * @property {string} title
 * @property {string} input
 * @property {string} output
 * @property {object} [data] — промежуточный результат для отчёта
 */

/**
 * Выполняет полный конвейер анализа по функциональной модели.
 *
 * F1 — загрузка контекста (ученик, уроки, правила).
 * F2 — агрегирование оценок уроков по критериям → уровень успешности 0…1.
 * F3 — нормализация заданной важности критериев → базовые веса.
 * F4 — корректировка весов с учётом «слабых» критериев (β).
 * F5 — синтез глобальных приоритетов методик (взвешенная сумма локальных приоритетов).
 * F6 — выбор методики с максимальным приоритетом.
 *
 * @param {object} ctx
 * @param {string[]} ctx.criterionIds — порядок критериев
 * @param {import("./dataLogicalModel.js").LessonRecord[]} ctx.lessons
 * @param {number[]} ctx.criteriaImportance
 * @param {number[][]} ctx.methodScores
 * @param {number} ctx.beta
 */
export function runFunctionalScoreAnalysis(ctx) {
  const { criterionIds, lessons, criteriaImportance, methodScores, beta } = ctx;

  const steps = [];

  steps.push({
    id: "F1",
    title: "Формирование аналитического контекста",
    input: "Список уроков с оценками по критериям; матрица правил (важность, «подходит»).",
    output: "Набор данных для расчёта.",
    data: { lessonCount: lessons.length, criterionCount: criterionIds.length, methodCount: methodScores.length },
  });

  const perf = aggregateLessonScores(lessons, criterionIds);
  steps.push({
    id: "F2",
    title: "Агрегирование оценок занятий по критериям",
    input: "Оценки 2–5 (или наследие 0–100) по каждому уроку и критерию.",
    output: "Вектор уровня по критериям в [0, 1] (выше — сильнее ребёнок по критерию).",
    data: { perf, criterionIds },
  });

  const baseW = normalizeVector(criteriaImportance.map((x) => Math.max(0.01, Number(x) || 1)));
  steps.push({
    id: "F3",
    title: "Нормализация важности критериев",
    input: "Шкала важности 2–5 по каждому критерию.",
    output: "Базовые относительные веса критериев (сумма = 1).",
    data: { baseW },
  });

  const wAdj = adjustCriteriaWeightsForChild(baseW, perf, beta);
  steps.push({
    id: "F4",
    title: "Корректировка весов по профилю ученика",
    input: "Базовые веса, уровень perf, коэффициент β.",
    output: "Скорректированные веса (усиление веса критериев с низким perf).",
    data: { wAdj, beta },
  });

  const recommendation = algorithmRecommendTeachingMethod(wAdj, methodScores);
  const global = recommendation.globalPriorities;
  const bestIdx = recommendation.bestIndex;

  steps.push({
    id: "F5",
    title: "Синтез приоритетов методик (алгоритм взвешенного синтеза)",
    input: "Скорректированные веса критериев; матрица «методика × критерий».",
    output: "Вектор глобальных приоритетов альтернатив (методик), сумма = 1.",
    data: {
      global,
      marginFirstSecond: recommendation.marginFirstSecond,
      ranking: recommendation.ranking,
    },
  });

  steps.push({
    id: "F6",
    title: "Выбор предпочитаемой методики (arg max + ранжирование)",
    input: "Глобальные приоритеты методик.",
    output: "Индекс и приоритет лучшей методики; приоритеты остальных по убыванию.",
    data: {
      bestIdx,
      bestPriority: recommendation.bestPriority,
      marginFirstSecond: recommendation.marginFirstSecond,
    },
  });

  return {
    perf,
    baseW,
    wAdj,
    global,
    bestIdx,
    marginFirstSecond: recommendation.marginFirstSecond,
    ranking: recommendation.ranking,
    steps,
  };
}
