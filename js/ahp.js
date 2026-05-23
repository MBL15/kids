/**
 * Метод анализа иерархий (МАИ / AHP).
 * Оценки ученика 1–10 → дефицит → матрица критериев → локальные матрицы методик → глобальные приоритеты.
 */

import { SCORE_MIN, SCORE_MAX, STUDENT_SCORE_MIN, STUDENT_SCORE_MAX } from "./data.js";

/** Индекс случайной согласованности (Saaty) для n = 1…15 */
const RI_TABLE = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49, 1.51, 1.48, 1.56, 1.57, 1.59];

export const SAATY_MIN = 1 / 9;
export const SAATY_MAX = 9;
export const CR_THRESHOLD = 0.1;

export function normalizeVector(v) {
  const sum = v.reduce((a, b) => a + b, 0);
  if (sum === 0) return v.map(() => 1 / v.length);
  return v.map((x) => x / sum);
}

export function multiplyMatrixVector(A, v) {
  return A.map((row) => row.reduce((s, aij, j) => s + aij * v[j], 0));
}

/**
 * @param {number[][]} A — квадратная положительная взаимная матрица
 */
export function principalEigenvector(A, eps = 1e-10) {
  const n = A.length;
  let w = Array(n).fill(1 / n);
  for (let iter = 0; iter < 1000; iter++) {
    const Aw = multiplyMatrixVector(A, w);
    const wNew = normalizeVector(Aw);
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(wNew[i] - w[i]);
    w = wNew;
    if (diff < eps) break;
  }
  const Aw = multiplyMatrixVector(A, w);
  const lambdaMax = w.reduce((s, wi, i) => s + Aw[i] / (wi || 1e-15), 0) / n;
  return { w, lambdaMax };
}

/** Ограничение значения шкалой Saaty (1/9 … 9). */
export function clampSaaty(x) {
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.max(SAATY_MIN, Math.min(SAATY_MAX, x));
}

/**
 * Построить матрицу парных сравнений из вектора «важностей» (дефицитов, подходящести).
 * a_ij = v_i / v_j, с взаимностью a_ji = 1 / a_ij.
 */
export function buildPairwiseMatrixFromVector(values) {
  const n = values.length;
  const safe = values.map((v) => Math.max(Number(v) || 1, 1e-6));
  const A = Array.from({ length: n }, () => Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ratio = clampSaaty(safe[i] / safe[j]);
      A[i][j] = ratio;
      A[j][i] = 1 / ratio;
    }
  }
  return A;
}

/** Индекс согласованности CR = CI / RI. */
export function consistencyRatio(A, lambdaMax, n) {
  if (n <= 2) return 0;
  const CI = (lambdaMax - n) / (n - 1);
  const RI = RI_TABLE[n] ?? 1.49;
  if (RI === 0) return 0;
  return CI / RI;
}

export function isConsistent(cr) {
  return cr < CR_THRESHOLD;
}

/** Дефицит по формуле из МАИ: 10 − оценка + 1. */
export function deficitFromScore(score1to10) {
  const s = Math.max(STUDENT_SCORE_MIN, Math.min(STUDENT_SCORE_MAX, Number(score1to10) || 5));
  return STUDENT_SCORE_MAX - s + 1;
}

/** Средняя оценка урока по критерию → шкала 1–10. */
export function lessonCriterionToScale1_10(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  if (v >= STUDENT_SCORE_MIN && v <= STUDENT_SCORE_MAX) {
    return Math.max(STUDENT_SCORE_MIN, Math.min(STUDENT_SCORE_MAX, v));
  }
  if (v >= SCORE_MIN && v <= SCORE_MAX) {
    const span = SCORE_MAX - SCORE_MIN;
    const norm = (v - SCORE_MIN) / span;
    return STUDENT_SCORE_MIN + norm * (STUDENT_SCORE_MAX - STUDENT_SCORE_MIN);
  }
  if (v >= 0 && v <= 100) {
    return STUDENT_SCORE_MIN + (v / 100) * (STUDENT_SCORE_MAX - STUDENT_SCORE_MIN);
  }
  return null;
}

/** Средняя оценка урока → шкала 2–5 (для радаров и отображения). */
export function lessonCriterionToScale(v) {
  const s10 = lessonCriterionToScale1_10(v);
  if (s10 == null) return null;
  const span = SCORE_MAX - SCORE_MIN;
  return SCORE_MIN + ((s10 - STUDENT_SCORE_MIN) / (STUDENT_SCORE_MAX - STUDENT_SCORE_MIN)) * span;
}

/** Средние оценки ученика по критериям (шкала 1–10). Нет данных → 5. */
export function aggregateStudentScores1To10(lessons, criterionIds) {
  const sums = Object.fromEntries(criterionIds.map((id) => [id, 0]));
  const counts = Object.fromEntries(criterionIds.map((id) => [id, 0]));
  for (const lesson of lessons) {
    for (const id of criterionIds) {
      const scaled = lessonCriterionToScale1_10(lesson.scores?.[id]);
      if (scaled != null) {
        sums[id] += scaled;
        counts[id] += 1;
      }
    }
  }
  return criterionIds.map((id) => {
    if (counts[id] > 0) {
      const avg = sums[id] / counts[id];
      return Math.round(avg * 10) / 10;
    }
    return 5;
  });
}

/** Столбец «подходящести» методик (2–5) → локальная матрица парных сравнений M×M. */
export function suitabilityColumnToPairwiseMatrix(columnScores) {
  const m = columnScores.length;
  const safe = columnScores.map((x) => Math.max(Number(x) || SCORE_MIN, SCORE_MIN));
  return buildPairwiseMatrixFromVector(safe);
}

/** Матрицы методик по каждому критерию из таблицы methodScores[M][K]. */
export function methodScoresToLocalMatrices(methodScores) {
  const m = methodScores.length;
  const k = methodScores[0]?.length ?? 0;
  return Array.from({ length: k }, (_, ci) => {
    const col = methodScores.map((row) => row[ci] ?? SCORE_MIN);
    return suitabilityColumnToPairwiseMatrix(col);
  });
}

/**
 * Полный расчёт МАИ для рекомендации методики.
 *
 * @param {object} params
 * @param {import("./analysis/dataLogicalModel.js").LessonRecord[]} params.lessons
 * @param {string[]} params.criterionIds
 * @param {number[][]} params.localMatrices — K матриц M×M (парные сравнения методик по критерию)
 */
export function runAhpAnalysis({ lessons, criterionIds, localMatrices }) {
  const k = criterionIds.length;
  const m = localMatrices[0]?.length ?? 0;
  if (k === 0 || m === 0) {
    return emptyAhpResult(k, m);
  }

  const scores10 = aggregateStudentScores1To10(lessons, criterionIds);
  const deficits = scores10.map(deficitFromScore);

  const criteriaMatrix = buildPairwiseMatrixFromVector(deficits);
  const { w: critW, lambdaMax: critLambda } = principalEigenvector(criteriaMatrix);
  const criteriaCR = consistencyRatio(criteriaMatrix, critLambda, k);

  const localPriorities = [];
  const localCR = [];
  for (let ci = 0; ci < k; ci++) {
    const A = localMatrices[ci];
    const { w, lambdaMax } = principalEigenvector(A);
    localPriorities.push(w);
    localCR.push(consistencyRatio(A, lambdaMax, m));
  }

  const global = Array(m).fill(0);
  for (let mi = 0; mi < m; mi++) {
    for (let ci = 0; ci < k; ci++) {
      global[mi] += critW[ci] * localPriorities[ci][mi];
    }
  }
  const globalPriorities = normalizeVector(global);

  let bestIdx = 0;
  for (let mi = 1; mi < m; mi++) {
    if (globalPriorities[mi] > globalPriorities[bestIdx]) bestIdx = mi;
  }

  const sorted = globalPriorities
    .map((p, i) => ({ index: i, priority: p }))
    .sort((a, b) => b.priority - a.priority);
  const marginFirstSecond =
    sorted.length >= 2 ? sorted[0].priority - sorted[1].priority : sorted[0]?.priority ?? 0;

  return {
    scores10,
    deficits,
    criteriaMatrix,
    critW,
    criteriaCR,
    criteriaConsistent: isConsistent(criteriaCR),
    localPriorities,
    localCR,
    localConsistent: localCR.map(isConsistent),
    globalPriorities,
    bestIdx,
    marginFirstSecond,
    ranking: sorted.map((item, r) => ({ ...item, rank: r + 1 })),
  };
}

function emptyAhpResult(k, m) {
  return {
    scores10: Array(k).fill(5),
    deficits: Array(k).fill(6),
    criteriaMatrix: [],
    critW: Array(k).fill(k ? 1 / k : 0),
    criteriaCR: 0,
    criteriaConsistent: true,
    localPriorities: Array.from({ length: k }, () => Array(m).fill(m ? 1 / m : 0)),
    localCR: Array(k).fill(0),
    localConsistent: Array(k).fill(true),
    globalPriorities: Array(m).fill(m ? 1 / m : 0),
    bestIdx: 0,
    marginFirstSecond: 0,
    ranking: [],
  };
}
