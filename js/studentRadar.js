/**
 * Радарные диаграммы. Chart.js подключается лениво — если библиотека не загрузится,
 * остальной интерфейс (кнопки, вход) продолжает работать.
 */

import { lessonCriterionToScale } from "./ahp.js";
import { SCORE_MIN, SCORE_MAX } from "./data.js";

let studentRadarInstance = null;
let analysisMethodRadarInstance = null;

async function getChart() {
  if (typeof globalThis.Chart === "function") {
    return globalThis.Chart;
  }
  try {
    const mod = await import("chart.js/auto");
    return mod.default;
  } catch (first) {
    const url = new URL("/vendor/chart.js/auto/auto.js", globalThis.location.href).href;
    const mod = await import(url);
    return mod.default;
  }
}

function shortenLabel(text, maxLen) {
  const t = String(text).trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

function averageScoresByCriterion(lessons, criterionIds) {
  const sums = Object.fromEntries(criterionIds.map((id) => [id, 0]));
  const counts = Object.fromEntries(criterionIds.map((id) => [id, 0]));
  for (const lesson of lessons || []) {
    for (const id of criterionIds) {
      const v = lesson.scores?.[id];
      const scaled = lessonCriterionToScale(v);
      if (scaled != null) {
        sums[id] += scaled;
        counts[id] += 1;
      }
    }
  }
  return criterionIds.map((id) => (counts[id] > 0 ? sums[id] / counts[id] : null));
}

/**
 * Радар успеваемости по критериям (карточка ученика).
 */
export async function updateStudentRadarChart(canvas, { criteria, lessons }) {
  if (studentRadarInstance) {
    studentRadarInstance.destroy();
    studentRadarInstance = null;
  }
  if (!canvas) return;

  const wrap = document.getElementById("student-radar-wrap");
  if (criteria.length < 2) {
    if (wrap) wrap.classList.add("hidden");
    return;
  }

  const criterionIds = criteria.map((c) => c.id);
  const avgs = averageScoresByCriterion(lessons, criterionIds);
  const hasData = avgs.some((a) => a != null);
  if (wrap) {
    wrap.classList.toggle("hidden", !hasData);
  }
  if (!hasData) return;

  let Chart;
  try {
    Chart = await getChart();
  } catch (e) {
    console.error("Не удалось загрузить Chart.js (радар успеваемости):", e);
    return;
  }

  Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
  Chart.defaults.color = "#6b6b70";

  const labels = criteria.map((c) => shortenLabel(c.name, 22));
  const data = avgs.map((a) => (a == null ? SCORE_MIN : Number(a.toFixed(2))));

  const maxV = Math.max(...data);
  const pointBg = data.map((v) =>
    Math.abs(v - maxV) < 1e-6 ? "rgba(123, 77, 255, 1)" : "rgba(167, 139, 250, 0.88)"
  );
  const pointBorder = data.map((v) =>
    Math.abs(v - maxV) < 1e-6 ? "rgba(123, 77, 255, 1)" : "rgba(167, 139, 250, 0.45)"
  );

  const ctx = canvas.getContext("2d");
  studentRadarInstance = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: "Средний балл по критерию",
          data,
          fill: true,
          backgroundColor: "rgba(123, 77, 255, 0.22)",
          borderColor: "rgba(123, 77, 255, 0.95)",
          borderWidth: 2,
          pointBackgroundColor: pointBg,
          pointBorderColor: pointBorder,
          pointHoverBackgroundColor: "rgba(123, 77, 255, 1)",
          pointRadius: 6,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const i = ctx.dataIndex;
              const v = data[i];
              return `${criteria[i].name}: ${v} (шкала ${SCORE_MIN}–${SCORE_MAX})`;
            },
          },
        },
      },
      scales: {
        r: {
          min: SCORE_MIN,
          max: SCORE_MAX,
          beginAtZero: false,
          angleLines: { color: "rgba(107, 107, 112, 0.45)" },
          grid: { color: "rgba(107, 107, 112, 0.38)" },
          pointLabels: {
            color: "#1a1a1a",
            font: { size: 11 },
          },
          ticks: {
            stepSize: 1,
            backdropColor: "transparent",
            color: "#6b6b70",
            showLabelBackdrop: false,
          },
        },
      },
    },
  });
}

/**
 * Радар глобальных приоритетов методик (% доли).
 */
export async function updateMethodologyPriorityRadar(canvas, { methods, globalPriorities }) {
  if (analysisMethodRadarInstance) {
    analysisMethodRadarInstance.destroy();
    analysisMethodRadarInstance = null;
  }
  if (!canvas || !methods?.length || !globalPriorities?.length) return;

  const n = Math.min(methods.length, globalPriorities.length);
  if (n < 1) return;

  let Chart;
  try {
    Chart = await getChart();
  } catch (e) {
    console.error("Не удалось загрузить Chart.js (радар методик):", e);
    return;
  }

  Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
  Chart.defaults.color = "#6b6b70";

  const methSlice = methods.slice(0, n);
  const gpSlice = globalPriorities.slice(0, n);
  const pct = gpSlice.map((g) => Math.round(g * 1000) / 10);
  const labels = methSlice.map((m) => shortenLabel(m.name, 24));
  const ctx = canvas.getContext("2d");

  /* Радар нужен минимум из двух лучей; одна методика — горизонтальный bar */
  if (n === 1) {
    analysisMethodRadarInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: [labels[0]],
        datasets: [
          {
            label: "Доля приоритета, %",
            data: [pct[0]],
            backgroundColor: "rgba(123, 77, 255, 0.42)",
            borderColor: "rgba(123, 77, 255, 0.95)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(c) {
                return `${methSlice[0].name}: ${pct[0]}%`;
              },
            },
          },
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            grid: { color: "rgba(107, 107, 112, 0.35)" },
            ticks: { color: "#6b6b70" },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#1a1a1a", font: { size: 11 } },
          },
        },
      },
    });
    return;
  }

  const maxPct = Math.max(...pct, 0.1);
  const rMax = Math.min(100, Math.ceil((maxPct * 1.15) / 5) * 5);

  const maxV = Math.max(...pct);
  const pointBg = pct.map((v) =>
    Math.abs(v - maxV) < 1e-6 ? "rgba(123, 77, 255, 1)" : "rgba(167, 139, 250, 0.88)"
  );
  const pointBorder = pct.map((v) =>
    Math.abs(v - maxV) < 1e-6 ? "rgba(123, 77, 255, 1)" : "rgba(167, 139, 250, 0.45)"
  );

  analysisMethodRadarInstance = new Chart(ctx, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: "Доля приоритета, %",
          data: pct,
          fill: true,
          backgroundColor: "rgba(123, 77, 255, 0.22)",
          borderColor: "rgba(123, 77, 255, 0.95)",
          borderWidth: 2,
          pointBackgroundColor: pointBg,
          pointBorderColor: pointBorder,
          pointHoverBackgroundColor: "rgba(123, 77, 255, 1)",
          pointRadius: 6,
          pointHoverRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const i = ctx.dataIndex;
              return `${methSlice[i].name}: ${pct[i]}%`;
            },
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: rMax,
          angleLines: { color: "rgba(107, 107, 112, 0.45)" },
          grid: { color: "rgba(107, 107, 112, 0.38)" },
          pointLabels: {
            color: "#1a1a1a",
            font: { size: 11 },
          },
          ticks: {
            stepSize: Math.max(5, Math.ceil(rMax / 8 / 5) * 5),
            backdropColor: "transparent",
            color: "#6b6b70",
            showLabelBackdrop: false,
          },
        },
      },
    },
  });
}

export function destroyStudentRadarChart() {
  if (studentRadarInstance) {
    studentRadarInstance.destroy();
    studentRadarInstance = null;
  }
}

export function destroyAnalysisRadarChart() {
  if (analysisMethodRadarInstance) {
    analysisMethodRadarInstance.destroy();
    analysisMethodRadarInstance = null;
  }
}
