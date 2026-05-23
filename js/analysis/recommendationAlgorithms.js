/**
 * Алгоритмы МАИ: синтез глобальных приоритетов и выбор методики.
 */

import { runAhpAnalysis } from "../ahp.js";

/**
 * Рекомендация методики по полному циклу МАИ.
 *
 * @param {object} ctx
 * @param {import("./dataLogicalModel.js").LessonRecord[]} ctx.lessons
 * @param {string[]} ctx.criterionIds
 * @param {number[][]} ctx.localMatrices — K матриц M×M
 */
export function algorithmRecommendTeachingMethodAhp(ctx) {
  return runAhpAnalysis(ctx);
}
