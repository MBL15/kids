import { principalEigenvector } from "./ahp.js";
import { ENTITY_RELATIONS } from "./analysis/dataLogicalModel.js";
import { runFunctionalScoreAnalysis, FUNCTIONAL_PIPELINE_OVERVIEW } from "./analysis/functionalAnalysisModel.js";
import { SCORE_MIN, SCORE_MAX, SCORE_DEFAULT } from "./data.js";
import {
  updateStudentRadarChart,
  destroyStudentRadarChart,
  updateMethodologyPriorityRadar,
  destroyAnalysisRadarChart,
} from "./studentRadar.js";

const TOKEN_KEY = "ahp_token";
/** Фиксированный коэффициент β (учёт слабых сторон) — без поля в интерфейсе */
const BETA_WEIGHT_ADJUST = 0.6;

/** Приводит к шкале 2–5; значения 1–10 (старый формат) переводит линейно. */
function normalizeStoredScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return SCORE_DEFAULT;
  if (n >= SCORE_MIN && n <= SCORE_MAX) return Math.round(n);
  if (n >= 1 && n <= 10) {
    return Math.max(
      SCORE_MIN,
      Math.min(SCORE_MAX, Math.round(SCORE_MIN + ((n - 1) * (SCORE_MAX - SCORE_MIN)) / 9))
    );
  }
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(n)));
}

function uid() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Дата занятия для input[type=date] (YYYY-MM-DD). Поддерживает старые ISO-строки. */
function lessonDateToInputValue(lesson) {
  if (!lesson?.date) return "";
  const s = String(lesson.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function todayYmd() {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const state = {
  criteria: [],
  methods: [],
  criteriaImportance: [],
  methodScores: [],
  students: [],
};

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

async function api(method, path, body) {
  const headers = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res;
}

/**
 * Матрицы Саати → шкала 2–5; старые значения 1–10 → 2–5.
 */
function migrateAndNormalize(s) {
  const k = s.criteria.length;
  const m = s.methods.length;
  if (k === 0 || m === 0) {
    s.criteriaImportance = [];
    s.methodScores = [];
    delete s.criteriaMatrix;
    delete s.localMatrices;
    return;
  }

  if (
    Array.isArray(s.criteriaMatrix) &&
    s.criteriaMatrix.length === k &&
    Array.isArray(s.localMatrices) &&
    s.localMatrices.length === k
  ) {
    try {
      const { w: critW } = principalEigenvector(s.criteriaMatrix);
      s.criteriaImportance = critW.map((w) =>
        Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(SCORE_MIN + w * (SCORE_MAX - SCORE_MIN))))
      );
      s.methodScores = s.methods.map((_, mi) =>
        s.criteria.map((_, ci) => {
          const { w } = principalEigenvector(s.localMatrices[ci]);
          return Math.max(
            SCORE_MIN,
            Math.min(SCORE_MAX, Math.round(SCORE_MIN + w[mi] * (SCORE_MAX - SCORE_MIN)))
          );
        })
      );
    } catch {
      s.criteriaImportance = s.criteria.map(() => SCORE_DEFAULT);
      s.methodScores = s.methods.map(() => s.criteria.map(() => SCORE_DEFAULT));
    }
    delete s.criteriaMatrix;
    delete s.localMatrices;
  }

  if (!Array.isArray(s.criteriaImportance)) s.criteriaImportance = [];
  while (s.criteriaImportance.length < k) s.criteriaImportance.push(SCORE_DEFAULT);
  s.criteriaImportance.length = k;
  for (let i = 0; i < k; i++) {
    s.criteriaImportance[i] = normalizeStoredScore(s.criteriaImportance[i]);
  }

  if (!Array.isArray(s.methodScores)) s.methodScores = [];
  while (s.methodScores.length < m) {
    s.methodScores.push(Array(k).fill(SCORE_DEFAULT));
  }
  s.methodScores.length = m;
  for (let i = 0; i < m; i++) {
    if (!Array.isArray(s.methodScores[i])) s.methodScores[i] = Array(k).fill(SCORE_DEFAULT);
    while (s.methodScores[i].length < k) s.methodScores[i].push(SCORE_DEFAULT);
    s.methodScores[i].length = k;
    for (let j = 0; j < k; j++) {
      s.methodScores[i][j] = normalizeStoredScore(s.methodScores[i][j]);
    }
  }
}

async function bootstrapSession() {
  const token = getToken();
  if (!token) return false;
  const res = await api("GET", "/api/me");
  if (!res.ok) {
    sessionStorage.removeItem(TOKEN_KEY);
    return false;
  }
  const data = await res.json();
  state.criteria = data.criteria || [];
  state.methods = data.methods || [];
  state.students = data.students || [];
  state.criteriaMatrix = data.criteriaMatrix;
  state.localMatrices = data.localMatrices;
  state.criteriaImportance = data.criteriaImportance;
  state.methodScores = data.methodScores;

  const hadOldMatrices = Boolean(data.criteriaMatrix);
  migrateAndNormalize(state);
  if (hadOldMatrices) await persist();
  return true;
}

async function persist() {
  if (!getToken()) return;
  const res = await api("PUT", "/api/me", {
    criteria: state.criteria,
    methods: state.methods,
    criteriaImportance: state.criteriaImportance,
    methodScores: state.methodScores,
    students: state.students,
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("Сохранение не удалось:", t);
  }
}

function showAuth() {
  document.getElementById("main-nav").classList.add("hidden");
  document.getElementById("view-auth").classList.remove("hidden");
  ["view-students", "view-student-detail", "view-analysis", "view-settings"].forEach((id) =>
    document.getElementById(id).classList.add("hidden")
  );
}

function showApp(view) {
  document.getElementById("main-nav").classList.remove("hidden");
  document.getElementById("view-auth").classList.add("hidden");
  const map = ["students", "student-detail", "analysis", "settings"];
  map.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle("hidden", v !== view);
  });
  document.querySelectorAll("#main-nav button[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === view);
  });
}

function setAuthMsg(html, type) {
  const el = document.getElementById("auth-msg");
  el.className = `msg ${type || ""}`;
  el.innerHTML = html;
}

document.getElementById("btn-register").addEventListener("click", async () => {
  const login = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  if (login.length < 2 || password.length < 4) {
    setAuthMsg("Логин от 2 символов, пароль от 4.", "error");
    return;
  }
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setAuthMsg(data.error || "Ошибка регистрации", "error");
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, data.token);
  await bootstrapSession();
  setAuthMsg("Аккаунт создан.", "success");
  showApp("students");
  renderStudents();
});

document.getElementById("btn-login").addEventListener("click", async () => {
  const login = document.getElementById("login-user").value.trim();
  const password = document.getElementById("login-pass").value;
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setAuthMsg(data.error || "Ошибка входа", "error");
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, data.token);
  await bootstrapSession();
  showApp("students");
  renderStudents();
});

document.getElementById("btn-logout").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  showAuth();
});

document.querySelectorAll("#main-nav button[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.getAttribute("data-view");
    showApp(v);
    if (v === "students") renderStudents();
    if (v === "analysis") renderAnalysisForm();
    if (v === "settings") renderSettings();
  });
});

function renderStudents() {
  const tbody = document.getElementById("students-tbody");
  tbody.innerHTML = "";
  for (const s of state.students) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td><span class="badge">${s.lessons?.length ?? 0}</span></td>
      <td>
        <ul class="inline-actions">
          <li><button class="btn btn-secondary btn-open-student" data-id="${s.id}">Карточка / оценки</button></li>
          <li><button class="btn btn-danger btn-del-student" data-id="${s.id}">Удалить</button></li>
        </ul>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll(".btn-open-student").forEach((b) =>
    b.addEventListener("click", () => openStudent(b.getAttribute("data-id")))
  );
  tbody.querySelectorAll(".btn-del-student").forEach((b) =>
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-id");
      state.students = state.students.filter((x) => x.id !== id);
      await persist();
      renderStudents();
    })
  );
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

document.getElementById("btn-add-student").addEventListener("click", async () => {
  const name = document.getElementById("new-student-name").value.trim();
  if (!name) return;
  const notes = document.getElementById("new-student-notes").value.trim();
  state.students.push({ id: uid(), name, notes, lessons: [] });
  document.getElementById("new-student-name").value = "";
  document.getElementById("new-student-notes").value = "";
  await persist();
  renderStudents();
});

function openStudent(id) {
  const s = state.students.find((x) => x.id === id);
  if (!s) return;
  document.getElementById("current-student-id").value = id;
  document.getElementById("student-detail-title").textContent = s.name;
  document.getElementById("student-detail-hint").textContent = s.notes || "Заметок нет.";
  const dateEl = document.getElementById("lesson-date");
  if (dateEl) dateEl.value = todayYmd();
  showApp("student-detail");
  renderStudentLessons(s);
}

document.getElementById("btn-back-students").addEventListener("click", () => {
  destroyStudentRadarChart();
  showApp("students");
  renderStudents();
});

function renderLessonInputs() {
  const wrap = document.getElementById("lesson-scores-inputs");
  wrap.innerHTML = "";
  migrateAndNormalize(state);
  for (const c of state.criteria) {
    const div = document.createElement("div");
    div.innerHTML = `<label>${escapeHtml(c.name)}</label><input type="number" min="${SCORE_MIN}" max="${SCORE_MAX}" step="1" data-crit="${c.id}" placeholder="${SCORE_MIN}–${SCORE_MAX}" />`;
    wrap.appendChild(div);
  }
}

function renderStudentLessons(s) {
  renderLessonInputs();
  const dateInp = document.getElementById("lesson-date");
  if (dateInp && !dateInp.value) dateInp.value = todayYmd();

  const thead = document.getElementById("lessons-thead");
  const tbody = document.getElementById("lessons-tbody");
  const crit = state.criteria;
  thead.innerHTML = `<tr><th>№</th><th>Дата занятия</th>${crit.map((c) => `<th>${escapeHtml(c.name)}</th>`).join("")}<th></th></tr>`;
  tbody.innerHTML = "";
  const sorted = [...(s.lessons || [])].sort((a, b) => {
    const da = lessonDateToInputValue(a) || "0000-00-00";
    const db = lessonDateToInputValue(b) || "0000-00-00";
    return db.localeCompare(da);
  });
  sorted.forEach((lesson, idx) => {
    const tr = document.createElement("tr");
    const ymd = lessonDateToInputValue(lesson);
    const cells = crit.map((c) => `<td>${lesson.scores?.[c.id] ?? "—"}</td>`).join("");
    const dateCell = `<td><input type="date" class="lesson-row-date" data-li="${lesson.id}" value="${ymd}" aria-label="Дата занятия" /></td>`;
    tr.innerHTML = `<td>${idx + 1}</td>${dateCell}${cells}<td><button class="btn btn-danger btn-del-lesson" data-li="${lesson.id}">Удалить</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll(".btn-del-lesson").forEach((b) =>
    b.addEventListener("click", async () => {
      const lid = b.getAttribute("data-li");
      s.lessons = s.lessons.filter((l) => l.id !== lid);
      await persist();
      renderStudentLessons(s);
    })
  );
  tbody.querySelectorAll(".lesson-row-date").forEach((inp) =>
    inp.addEventListener("change", async () => {
      const lid = inp.getAttribute("data-li");
      const lesson = s.lessons.find((l) => l.id === lid);
      if (!lesson) return;
      const v = inp.value;
      lesson.date = v || todayYmd();
      await persist();
    })
  );

  const radarCanvas = document.getElementById("student-radar-chart");
  void updateStudentRadarChart(radarCanvas, { criteria: state.criteria, lessons: s.lessons }).catch((e) =>
    console.error("Радар успеваемости:", e)
  );
}

document.getElementById("btn-add-lesson").addEventListener("click", async () => {
  const sid = document.getElementById("current-student-id").value;
  const s = state.students.find((x) => x.id === sid);
  if (!s) return;
  const scores = {};
  let any = false;
  document.querySelectorAll("#lesson-scores-inputs input[data-crit]").forEach((inp) => {
    const v = parseFloat(inp.value);
    const cid = inp.getAttribute("data-crit");
    if (!Number.isNaN(v)) {
      scores[cid] = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(v)));
      any = true;
    }
  });
  if (!any) {
    alert(`Введите хотя бы одну оценку (${SCORE_MIN}–${SCORE_MAX}).`);
    return;
  }
  const dateEl = document.getElementById("lesson-date");
  const dateYmd = (dateEl?.value || todayYmd()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    alert("Укажите корректную дату занятия.");
    return;
  }
  if (!s.lessons) s.lessons = [];
  s.lessons.push({ id: uid(), date: dateYmd, scores });
  await persist();
  document.querySelectorAll("#lesson-scores-inputs input[data-crit]").forEach((inp) => {
    inp.value = "";
  });
  renderStudentLessons(s);
});

function fillAnalysisModelListsOnce() {
  const dl = document.getElementById("data-logical-list");
  const fl = document.getElementById("functional-model-list");
  if (dl && !dl.dataset.ready) {
    dl.dataset.ready = "1";
    ENTITY_RELATIONS.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      dl.appendChild(li);
    });
  }
  if (fl && !fl.dataset.ready) {
    fl.dataset.ready = "1";
    FUNCTIONAL_PIPELINE_OVERVIEW.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = `${s.id} — ${s.title}. ${s.detail}`;
      fl.appendChild(li);
    });
  }
}

function renderAnalysisForm() {
  fillAnalysisModelListsOnce();
  destroyAnalysisRadarChart();
  const sel = document.getElementById("analysis-student");
  sel.innerHTML = `<option value="">— выберите —</option>`;
  for (const s of state.students) {
    const o = document.createElement("option");
    o.value = s.id;
    o.textContent = `${s.name} (${s.lessons?.length ?? 0} урок.)`;
    sel.appendChild(o);
  }
  document.getElementById("analysis-result").innerHTML = "";
}

function renderAnalysisResult(student, beta) {
  migrateAndNormalize(state);
  const critIds = state.criteria.map((c) => c.id);
  const lessons = student.lessons || [];

  const { perf, baseW, wAdj, global, bestIdx, steps, marginFirstSecond } = runFunctionalScoreAnalysis({
    criterionIds: critIds,
    lessons,
    criteriaImportance: state.criteriaImportance,
    methodScores: state.methodScores,
    beta,
  });

  const bestMethod = state.methods[bestIdx];

  let html = `<div class="result-card">`;
  html += `<h3>Рекомендация</h3>`;
  html += `<p class="lead">Предпочтительная методика: ${escapeHtml(bestMethod.name)}</p>`;
  html += `<p style="font-size:0.9rem;color:var(--muted)">Расчёт по функциональной модели (F1–F6). Правила: шкала ${SCORE_MIN}–${SCORE_MAX}. Уроков в расчёте: ${lessons.length}.</p>`;

  html += `<p class="diagram-ref" style="margin-top:0.75rem;margin-bottom:0.35rem">Сравнение методик по доле итогового приоритета (%), радар (как визуализация успеваемости):</p>`;
  html += `<div class="analysis-radar-wrap radar-canvas-box"><canvas id="analysis-method-radar" aria-label="Радар приоритетов методик"></canvas></div>`;

  html += `<details style="margin-top:1rem;font-size:0.85rem;color:var(--muted)"><summary>Показать детали расчёта</summary>`;
  html += `<p><strong>Веса критериев (по важности ${SCORE_MIN}–${SCORE_MAX}):</strong> ${state.criteria.map((c, i) => `${escapeHtml(c.name)}: ${(baseW[i] * 100).toFixed(1)}%`).join("; ")}</p>`;
  html += `<p><strong>После учёта слабых сторон:</strong> ${state.criteria.map((c, i) => `${escapeHtml(c.name)}: ${(wAdj[i] * 100).toFixed(1)}%`).join("; ")}</p>`;
  html += `<p><strong>Уровень по урокам (0–1, из оценок ${SCORE_MIN}–${SCORE_MAX}):</strong> ${state.criteria.map((c, i) => `${escapeHtml(c.name)}: ${(perf[i] ?? 0).toFixed(2)}`).join("; ")}</p>`;
  html += `<p><strong>Уверенность рекомендации (разрыв 1-го и 2-го приоритета):</strong> ${(marginFirstSecond * 100).toFixed(2)} п.п.</p>`;
  html += `<dl class="step-trace">`;
  steps.forEach((s) => {
    html += `<dt>${escapeHtml(s.id)} — ${escapeHtml(s.title)}</dt><dd>${escapeHtml(s.input)} → ${escapeHtml(s.output)}</dd>`;
  });
  html += `</dl>`;
  html += `</details></div>`;

  const host = document.getElementById("analysis-result");
  host.innerHTML = html;
  requestAnimationFrame(() => {
    const canvas = document.getElementById("analysis-method-radar");
    void updateMethodologyPriorityRadar(canvas, {
      methods: state.methods,
      globalPriorities: global,
    }).catch((e) => console.error("Радар методик:", e));
  });
}

document.getElementById("btn-run-analysis").addEventListener("click", () => {
  const sid = document.getElementById("analysis-student").value;
  const student = state.students.find((x) => x.id === sid);
  if (!student) {
    destroyAnalysisRadarChart();
    document.getElementById("analysis-result").innerHTML =
      '<p class="msg error">Выберите ученика.</p>';
    return;
  }
  if (!student.lessons?.length) {
    destroyAnalysisRadarChart();
    document.getElementById("analysis-result").innerHTML =
      '<p class="msg error">Нет данных уроков. Добавьте оценки в карточке ученика.</p>';
    return;
  }
  renderAnalysisResult(student, BETA_WEIGHT_ADJUST);
});

function renderSettings() {
  migrateAndNormalize(state);
  const critList = document.getElementById("criteria-list");
  const methList = document.getElementById("methods-list");
  critList.innerHTML = "";
  methList.innerHTML = "";

  state.criteria.forEach((c, ci) => {
    const row = document.createElement("div");
    row.className = "settings-row";
    const imp = state.criteriaImportance[ci] ?? SCORE_DEFAULT;
    row.innerHTML = `
      <input type="text" data-ci="${ci}" class="crit-name" value="${escapeHtml(c.name)}" />
      <label class="importance-label">Важность <span class="importance-val" id="imp-val-${ci}">${imp}</span></label>
      <input type="range" min="${SCORE_MIN}" max="${SCORE_MAX}" step="1" data-ci="${ci}" class="crit-imp" value="${imp}" />
      <button type="button" class="btn btn-danger btn-rm-crit" data-ci="${ci}" ${state.criteria.length <= 1 ? "disabled" : ""}>Удалить</button>
    `;
    critList.appendChild(row);
  });

  critList.querySelectorAll(".crit-name").forEach((inp) => {
    inp.addEventListener("change", async () => {
      const ci = parseInt(inp.getAttribute("data-ci"), 10);
      state.criteria[ci].name = inp.value.trim() || state.criteria[ci].name;
      await persist();
      renderMethodScoresTable();
    });
  });
  critList.querySelectorAll(".crit-imp").forEach((rng) => {
    rng.addEventListener("input", async () => {
      const ci = parseInt(rng.getAttribute("data-ci"), 10);
      const v = parseInt(rng.value, 10);
      state.criteriaImportance[ci] = v;
      const span = document.getElementById(`imp-val-${ci}`);
      if (span) span.textContent = String(v);
      await persist();
    });
  });
  critList.querySelectorAll(".btn-rm-crit").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (state.criteria.length <= 1) return;
      const ci = parseInt(btn.getAttribute("data-ci"), 10);
      state.criteria.splice(ci, 1);
      state.criteriaImportance.splice(ci, 1);
      for (let mi = 0; mi < state.methodScores.length; mi++) {
        state.methodScores[mi].splice(ci, 1);
      }
      await persist();
      renderSettings();
    });
  });

  state.methods.forEach((m, mi) => {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = `
      <input type="text" data-mi="${mi}" class="meth-name" value="${escapeHtml(m.name)}" />
      <button type="button" class="btn btn-danger btn-rm-meth" data-mi="${mi}" ${state.methods.length <= 2 ? "disabled" : ""}>Удалить</button>
    `;
    methList.appendChild(row);
  });

  methList.querySelectorAll(".meth-name").forEach((inp) => {
    inp.addEventListener("change", async () => {
      const mi = parseInt(inp.getAttribute("data-mi"), 10);
      state.methods[mi].name = inp.value.trim() || state.methods[mi].name;
      await persist();
      renderMethodScoresTable();
    });
  });
  methList.querySelectorAll(".btn-rm-meth").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (state.methods.length <= 2) return;
      const mi = parseInt(btn.getAttribute("data-mi"), 10);
      state.methods.splice(mi, 1);
      state.methodScores.splice(mi, 1);
      await persist();
      renderSettings();
    });
  });

  renderMethodScoresTable();
}

function renderMethodScoresTable() {
  const thead = document.getElementById("method-scores-thead");
  const tbody = document.getElementById("method-scores-tbody");
  const k = state.criteria.length;
  const m = state.methods.length;
  thead.innerHTML = `<tr><th class="method-col">Методика</th>${state.criteria.map((c) => `<th>${escapeHtml(c.name)}</th>`).join("")}</tr>`;
  tbody.innerHTML = "";
  for (let mi = 0; mi < m; mi++) {
    const tr = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.className = "method-col";
    nameCell.textContent = state.methods[mi].name;
    tr.appendChild(nameCell);
    for (let ci = 0; ci < k; ci++) {
      const td = document.createElement("td");
      const sel = document.createElement("select");
      for (let v = SCORE_MIN; v <= SCORE_MAX; v++) {
        const o = document.createElement("option");
        o.value = String(v);
        o.textContent = String(v);
        sel.appendChild(o);
      }
      sel.value = String(state.methodScores[mi][ci] ?? SCORE_DEFAULT);
      sel.addEventListener("change", async () => {
        state.methodScores[mi][ci] = parseInt(sel.value, 10);
        await persist();
      });
      td.appendChild(sel);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

document.getElementById("btn-add-criterion").addEventListener("click", async () => {
  state.criteria.push({ id: uid(), name: "Новый критерий" });
  state.criteriaImportance.push(SCORE_DEFAULT);
  for (let mi = 0; mi < state.methodScores.length; mi++) {
    state.methodScores[mi].push(SCORE_DEFAULT);
  }
  await persist();
  renderSettings();
});

document.getElementById("btn-add-method").addEventListener("click", async () => {
  const k = state.criteria.length;
  state.methods.push({ id: uid(), name: "Новая методика" });
  state.methodScores.push(Array.from({ length: k }, () => SCORE_DEFAULT));
  await persist();
  renderSettings();
});

document.getElementById("btn-export-json").addEventListener("click", () => {
  migrateAndNormalize(state);
  const blob = new Blob(
    [
      JSON.stringify(
        {
          criteria: state.criteria,
          methods: state.methods,
          criteriaImportance: state.criteriaImportance,
          methodScores: state.methodScores,
        },
        null,
        2
      ),
    ],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ahp-settings.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("btn-import-json").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const o = JSON.parse(r.result);
      if (o.criteria) state.criteria = o.criteria;
      if (o.methods) state.methods = o.methods;
      if (o.criteriaImportance) state.criteriaImportance = o.criteriaImportance;
      if (o.methodScores) state.methodScores = o.methodScores;
      if (o.criteriaMatrix && o.localMatrices) {
        state.criteriaMatrix = o.criteriaMatrix;
        state.localMatrices = o.localMatrices;
      }
      migrateAndNormalize(state);
      await persist();
      renderSettings();
    } catch (err) {
      alert("Ошибка импорта: " + err.message);
    }
  };
  r.readAsText(f);
  e.target.value = "";
});

(async function init() {
  if (await bootstrapSession()) {
    showApp("students");
    renderStudents();
  } else {
    showAuth();
  }
})();
