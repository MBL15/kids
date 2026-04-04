/**
 * Веса и итоговые приоритеты: упрощённая модель (без матриц парных сравнений).
 * Дополнительно — eigenvector для миграции со старых сохранений.
 */

import { SCORE_MIN, SCORE_MAX, SCORE_DEFAULT } from "./data.js";

function clampRuleScore(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return SCORE_DEFAULT;
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(n)));
}

export function normalizeVector(v) {
  const sum = v.reduce((a, b) => a + b, 0);
  if (sum === 0) return v.map(() => 1 / v.length);
  return v.map((x) => x / sum);
}

export function multiplyMatrixVector(A, v) {
  return A.map((row) => row.reduce((s, aij, j) => s + aij * v[j], 0));
}

/**
 * @param {number[][]} A - square positive reciprocal matrix
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

/**
 * Итоговые приоритеты: важность критериев и оценки «подходит» на шкале 2–5.
 * methodScores[mi][ci] — насколько методика mi подходит под критерий ci.
 */
export function globalPrioritiesFromRatings(criteriaImportance, methodScores) {
  const k = criteriaImportance.length;
  const m = methodScores.length;
  if (k === 0 || m === 0) return [];
  const critW = normalizeVector(
    criteriaImportance.map((x) => Math.max(0.01, clampRuleScore(x)))
  );
  const locals = [];
  for (let c = 0; c < k; c++) {
    const col = [];
    for (let mi = 0; mi < m; mi++) {
      const v = methodScores[mi]?.[c];
      col.push(Math.max(0.01, clampRuleScore(v)));
    }
    locals.push(normalizeVector(col));
  }
  const global = Array(m).fill(0);
  for (let mi = 0; mi < m; mi++) {
    for (let c = 0; c < k; c++) {
      global[mi] += critW[c] * locals[c][mi];
    }
  }
  return normalizeVector(global);
}

/**
 * Adjust criteria weights using child performance (0..1 per criterion).
 */
export function adjustCriteriaWeightsForChild(baseW, perf, beta = 0.6) {
  const n = baseW.length;
  if (n === 0) return [];
  const adj = baseW.map((w, i) => {
    const p = Math.max(0, Math.min(1, perf[i] ?? 0.5));
    const stress = 1 + beta * (1 - p);
    return w * stress;
  });
  return normalizeVector(adj);
}

/**
 * Балл за урок по критерию → шкала 2–5. Значения вне [2,5] считаются старой шкалой 0–100.
 */
export function lessonCriterionToScale(v) {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  if (v >= SCORE_MIN && v <= SCORE_MAX) return Math.max(SCORE_MIN, Math.min(SCORE_MAX, v));
  return SCORE_MIN + (Math.max(0, Math.min(100, v)) / 100) * (SCORE_MAX - SCORE_MIN);
}

/** Средний уровень по критериям в долях 0–1 (для корректировки весов); нет данных → 0.5. */
export function aggregateLessonScores(lessons, criterionIds) {
  const sums = Object.fromEntries(criterionIds.map((id) => [id, 0]));
  const counts = Object.fromEntries(criterionIds.map((id) => [id, 0]));
  for (const lesson of lessons) {
    for (const id of criterionIds) {
      const v = lesson.scores?.[id];
      const scaled = lessonCriterionToScale(v);
      if (scaled != null) {
        sums[id] += scaled;
        counts[id] += 1;
      }
    }
  }
  const span = SCORE_MAX - SCORE_MIN;
  return criterionIds.map((id) =>
    counts[id] > 0 ? (sums[id] / counts[id] - SCORE_MIN) / span : 0.5
  );
}
