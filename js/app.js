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

const uiState = {
  dashboardDate: todayYmd(),
  asideMode: "individual",
  scheduleWeekStart: null,
  scheduleSelectedDate: null,
};

const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_RU_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

const HELP_CONTENT = {
  docs: {
    title: "Документация",
    html: `
      <h3>Назначение</h3>
      <p>Приложение помогает подобрать методику преподавания на основе оценок ученика и правил AHP (анализ иерархий).</p>
      <h3>Быстрый старт</h3>
      <ol>
        <li>Добавьте ученика на главной странице.</li>
        <li>Откройте карточку и внесите оценки по урокам (шкала 2–5).</li>
        <li>Настройте критерии и методики в разделе «Правила».</li>
        <li>Запустите анализ в разделе «Анализ».</li>
      </ol>
      <h3>Разделы</h3>
      <ul>
        <li><strong>Главная</strong> — расписание уроков и сводная статистика.</li>
        <li><strong>Ученики</strong> — список учеников и добавление новых.</li>
        <li><strong>Анализ</strong> — рекомендация методики по данным уроков.</li>
        <li><strong>Правила</strong> — критерии, методики и таблица подходящести.</li>
      </ul>
    `,
  },
  faq: {
    title: "Частые вопросы",
    html: `
      <h3>Где хранятся данные?</h3>
      <p>На сервере в файле <code>data/store.json</code>. Каждый пользователь видит только свои данные.</p>
      <h3>Какая шкала оценок?</h3>
      <p>И оценки уроков, и важность критериев используют шкалу от 2 до 5.</p>
      <h3>Когда появится рекомендация?</h3>
      <p>После добавления хотя бы одного урока с оценками — в разделе «Анализ» выберите ученика и нажмите «Выполнить анализ».</p>
      <h3>Можно ли перенести настройки?</h3>
      <p>Да. В «Правила» используйте экспорт и импорт JSON.</p>
      <h3>Что означают кольца на главной?</h3>
      <p>Левое — прогресс по числу уроков, правое — доля учеников, у которых уже есть оценки.</p>
    `,
  },
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

function setUserDisplay(login) {
  const name = login?.trim() || "Пользователь";
  const avatar = document.getElementById("user-avatar");
  const nameEl = document.getElementById("user-name");
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = name;
}

function setRingProgress(circleEl, ratio) {
  if (!circleEl) return;
  const r = 48;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, ratio)));
  circleEl.style.strokeDasharray = String(circumference);
  circleEl.style.strokeDashoffset = String(offset);
}

function formatDateRu(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

function shiftYmd(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, "0");
  const nd = String(dt.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

function getWeekStartYmd(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return shiftYmd(ymd, offset);
}

function getWeekDays(weekStartYmd) {
  return Array.from({ length: 7 }, (_, i) => shiftYmd(weekStartYmd, i));
}

function getWeekdayIndex(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 ? 6 : dow - 1;
}

function formatWeekRangeLabel(weekStartYmd) {
  const days = getWeekDays(weekStartYmd);
  const start = days[0].split("-").map(Number);
  const end = days[6].split("-").map(Number);
  if (start[1] === end[1]) {
    return `${start[2]}–${end[2]} ${MONTHS_RU_GEN[start[1] - 1]} ${start[0]}`;
  }
  return `${start[2]} ${MONTHS_RU_GEN[start[1] - 1]} – ${end[2]} ${MONTHS_RU_GEN[end[1] - 1]} ${end[0]}`;
}

function formatDayTitle(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay();
  const dayIdx = dow === 0 ? 6 : dow - 1;
  return `${WEEKDAY_SHORT[dayIdx]}, ${d} ${MONTHS_RU_GEN[m - 1]}`;
}

function formatLessonTime(lesson) {
  const start = lesson?.timeStart?.trim();
  const end = lesson?.timeEnd?.trim();
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  return "Урок";
}

function lessonHasScores(lesson) {
  const scores = lesson?.scores || {};
  return Object.keys(scores).length > 0;
}

function collectLessonEntries() {
  const entries = [];
  for (const s of state.students) {
    for (const l of s.lessons || []) {
      entries.push({
        student: s,
        lesson: l,
        ymd: lessonDateToInputValue(l),
      });
    }
  }
  return entries;
}

function ensureScheduleState() {
  const today = todayYmd();
  if (!uiState.scheduleWeekStart) uiState.scheduleWeekStart = getWeekStartYmd(today);
  if (!uiState.scheduleSelectedDate) uiState.scheduleSelectedDate = today;
}

function setScheduleAddMsg(text, type) {
  const el = document.getElementById("schedule-add-msg");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.className = `lesson-form-msg ${type || ""}`;
  el.classList.remove("hidden");
}

function openScheduleAddModal(dateYmd) {
  ensureScheduleState();
  const sel = document.getElementById("schedule-add-student");
  const dateEl = document.getElementById("schedule-add-date");
  if (sel) {
    sel.innerHTML = "";
    if (!state.students.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "— сначала добавьте ученика —";
      sel.appendChild(o);
    } else {
      for (const s of state.students) {
        const o = document.createElement("option");
        o.value = s.id;
        o.textContent = s.name;
        sel.appendChild(o);
      }
    }
  }
  if (dateEl) dateEl.value = dateYmd || uiState.scheduleSelectedDate || todayYmd();
  document.getElementById("schedule-add-time-start").value = "12:00";
  document.getElementById("schedule-add-time-end").value = "12:55";
  setScheduleAddMsg("", "");
  document.getElementById("schedule-add-modal")?.classList.remove("hidden");
}

function hideScheduleAddModal() {
  document.getElementById("schedule-add-modal")?.classList.add("hidden");
  setScheduleAddMsg("", "");
}

function renderScheduleDayPanel(selectedYmd) {
  const titleEl = document.getElementById("schedule-day-title");
  const listEl = document.getElementById("schedule-day-lessons");
  if (!titleEl || !listEl) return;

  titleEl.textContent = `Уроки и дела на ${formatDateRu(selectedYmd)}`;
  const dayEntries = collectLessonEntries()
    .filter((e) => e.ymd === selectedYmd)
    .sort((a, b) => (a.lesson.timeStart || "").localeCompare(b.lesson.timeStart || ""));

  if (!dayEntries.length) {
    listEl.innerHTML = '<p class="schedule-panel-empty">На этот день уроков нет — нажмите «Добавить урок»</p>';
    return;
  }

  listEl.innerHTML = "";
  dayEntries.forEach(({ student, lesson }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lesson-slot";
    const initial = (student.name || "?").charAt(0).toUpperCase();
    const meta = lessonHasScores(lesson)
      ? formatLessonTime(lesson)
      : `${formatLessonTime(lesson)} · без оценок`;
    btn.innerHTML = `
      <span class="lesson-slot-avatar">${escapeHtml(initial)}</span>
      <span class="lesson-slot-name">${escapeHtml(student.name)}</span>
      <span class="lesson-slot-meta">${escapeHtml(meta)}</span>`;
    btn.addEventListener("click", () => openStudent(student.id, { date: selectedYmd, lessonId: lesson.id }));
    listEl.appendChild(btn);
  });
}

function renderSchedule() {
  ensureScheduleState();
  const weekStart = uiState.scheduleWeekStart;
  const selected = uiState.scheduleSelectedDate;
  const today = todayYmd();
  const weekDays = getWeekDays(weekStart);
  const entries = collectLessonEntries();

  const labelEl = document.getElementById("schedule-week-label");
  if (labelEl) labelEl.textContent = formatWeekRangeLabel(weekStart);

  const grid = document.getElementById("schedule-week-grid");
  if (!grid) return;
  grid.innerHTML = "";

  weekDays.forEach((ymd) => {
    const col = document.createElement("div");
    col.className = "schedule-day-col";
    if (ymd === today) col.classList.add("is-today");
    if (ymd === selected) col.classList.add("is-selected");

    const dayIdx = getWeekdayIndex(ymd);
    const dayNum = parseInt(ymd.split("-")[2], 10);

    const head = document.createElement("button");
    head.type = "button";
    head.className = "schedule-day-col-head";
    head.innerHTML = `<span class="schedule-day-name">${WEEKDAY_SHORT[dayIdx]}</span><span class="schedule-day-num">${dayNum}</span>`;
    head.addEventListener("click", () => {
      uiState.scheduleSelectedDate = ymd;
      renderSchedule();
    });

    const body = document.createElement("div");
    body.className = "schedule-day-col-body";
    const dayEntries = entries
      .filter((e) => e.ymd === ymd)
      .sort((a, b) => (a.lesson.timeStart || "").localeCompare(b.lesson.timeStart || ""));

    if (!dayEntries.length) {
      body.innerHTML = '<div class="schedule-day-empty">—</div>';
    } else {
      dayEntries.forEach(({ student, lesson }) => {
        const ev = document.createElement("button");
        ev.type = "button";
        ev.className = `schedule-event${lessonHasScores(lesson) ? "" : " is-draft"}`;
        ev.innerHTML = `
          <span class="schedule-event-time">${escapeHtml(formatLessonTime(lesson))}</span>
          <span class="schedule-event-name">${escapeHtml(student.name)}</span>
          <span class="schedule-event-meta">${lessonHasScores(lesson) ? "Оценки внесены" : "Нужны оценки"}</span>`;
        ev.addEventListener("click", (e) => {
          e.stopPropagation();
          openStudent(student.id, { date: ymd, lessonId: lesson.id });
        });
        body.appendChild(ev);
      });
    }

    col.appendChild(head);
    col.appendChild(body);
    grid.appendChild(col);
  });

  renderScheduleDayPanel(selected);
}

function closeAllDropdowns() {
  document.querySelectorAll(".dropdown-panel").forEach((el) => el.classList.add("hidden"));
  document.querySelectorAll("[aria-expanded='true']").forEach((el) => el.setAttribute("aria-expanded", "false"));
}

function toggleDropdown(buttonId, panelId) {
  const btn = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);
  if (!btn || !panel) return;
  const willOpen = panel.classList.contains("hidden");
  closeAllDropdowns();
  if (willOpen) {
    panel.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
  }
}

function showHelpModal(kind) {
  const content = HELP_CONTENT[kind];
  if (!content) return;
  document.getElementById("help-modal-title").textContent = content.title;
  document.getElementById("help-modal-body").innerHTML = content.html;
  document.getElementById("help-modal").classList.remove("hidden");
  closeAllDropdowns();
}

function hideHelpModal() {
  document.getElementById("help-modal")?.classList.add("hidden");
}

function focusAddStudent() {
  showApp("students", { scrollTo: "students-panel" });
  renderStudents();
  setTimeout(() => {
    const input = document.getElementById("new-student-name");
    input?.focus();
    input?.select();
  }, 80);
}

function goHome() {
  uiState.dashboardDate = todayYmd();
  showApp("home");
  renderStudents();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function collectNotifications() {
  const items = [];
  const pending = state.students.filter((s) => !(s.lessons?.length));
  const ready = state.students.filter((s) => (s.lessons?.length ?? 0) > 0);

  for (const s of pending) {
    items.push({
      title: `${s.name}: нет оценок`,
      meta: "Добавьте первый урок в карточке ученика",
      action: () => openStudent(s.id),
    });
  }

  if (ready.length === 1) {
    const s = ready[0];
    items.push({
      title: `${s.name}: готов к анализу`,
      meta: `${s.lessons.length} урок(ов) — можно сформировать рекомендацию`,
      action: () => {
        showApp("analysis");
        renderAnalysisForm();
        const sel = document.getElementById("analysis-student");
        if (sel) sel.value = s.id;
      },
    });
  } else if (ready.length > 1) {
    items.push({
      title: `${ready.length} учеников готовы к анализу`,
      meta: "Откройте раздел «Анализ» и выберите ученика",
      action: () => {
        showApp("analysis");
        renderAnalysisForm();
      },
    });
  }

  if (!state.criteria.length || !state.methods.length) {
    items.push({
      title: "Проверьте правила",
      meta: "Настройте критерии и методики преподавания",
      action: () => {
        showApp("settings");
        renderSettings();
      },
    });
  }
  return items;
}

function renderNotifications() {
  const items = collectNotifications();
  const badge = document.getElementById("notif-badge");
  const list = document.getElementById("notifications-list");
  const pendingCount = state.students.filter((s) => !(s.lessons?.length)).length;
  if (badge) {
    badge.textContent = String(pendingCount || items.length);
    badge.classList.toggle("hidden", items.length === 0);
  }
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<p class="notif-empty">Нет новых уведомлений</p>';
    return;
  }
  list.innerHTML = "";
  items.slice(0, 8).forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notif-item";
    btn.innerHTML = `<div class="notif-item-title">${escapeHtml(item.title)}</div><div class="notif-item-meta">${escapeHtml(item.meta)}</div>`;
    btn.addEventListener("click", () => {
      closeAllDropdowns();
      item.action();
    });
    list.appendChild(btn);
  });
}

function renderAsideContent() {
  const asideContent = document.getElementById("aside-content");
  if (!asideContent) return;

  if (uiState.asideMode === "groups") {
    const grouped = new Map();
    for (const s of state.students) {
      const key = (s.notes || "").trim() || "Без группы";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(s);
    }
    if (!state.students.length) {
      asideContent.innerHTML = "<p>Добавьте учеников — они сгруппируются по полю «Заметки»</p>";
      return;
    }
    asideContent.innerHTML = "";
    for (const [group, students] of grouped) {
      const block = document.createElement("div");
      block.className = "aside-group";
      block.innerHTML = `<div class="aside-group-title">${escapeHtml(group)}</div>`;
      students.forEach((s) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "aside-student";
        row.innerHTML = `
          <span class="lesson-slot-avatar">${escapeHtml((s.name || "?").charAt(0).toUpperCase())}</span>
          <div>
            <div class="aside-student-name">${escapeHtml(s.name)}</div>
            <div class="aside-student-meta">${s.lessons?.length ?? 0} урок(ов)</div>
          </div>`;
        row.addEventListener("click", () => openStudent(s.id));
        block.appendChild(row);
      });
      asideContent.appendChild(block);
    }
    return;
  }

  const pending = state.students.filter((s) => !(s.lessons?.length));
  if (!pending.length) {
    asideContent.innerHTML = "<p>Все ученики имеют записи уроков</p>";
    return;
  }
  asideContent.innerHTML = pending
    .slice(0, 6)
    .map(
      (s) => `
    <div class="aside-student" data-id="${s.id}">
      <span class="lesson-slot-avatar">${escapeHtml((s.name || "?").charAt(0).toUpperCase())}</span>
      <div>
        <div class="aside-student-name">${escapeHtml(s.name)}</div>
        <div class="aside-student-meta">Нет оценок — добавьте урок</div>
      </div>
    </div>`
    )
    .join("");
  asideContent.querySelectorAll(".aside-student").forEach((row) =>
    row.addEventListener("click", () => openStudent(row.getAttribute("data-id")))
  );
}

function renderDashboard() {
  const today = todayYmd();
  const viewDate = uiState.dashboardDate;
  const titleEl = document.getElementById("dashboard-schedule-title");
  if (titleEl) titleEl.textContent = `Уроки и дела на ${formatDateRu(viewDate)}`;

  const dayLessons = [];
  for (const s of state.students) {
    for (const l of s.lessons || []) {
      if (lessonDateToInputValue(l) === viewDate) {
        dayLessons.push({ student: s, lesson: l });
      }
    }
  }
  dayLessons.sort((a, b) => a.student.name.localeCompare(b.student.name, "ru"));

  const slotsEl = document.getElementById("dashboard-lessons");
  if (slotsEl) {
    if (!dayLessons.length) {
      slotsEl.innerHTML = `<p class="schedule-empty">На ${formatDateRu(viewDate)} уроков нет</p>`;
    } else {
      slotsEl.innerHTML = "";
      dayLessons.forEach(({ student, lesson }, i) => {
        const ymd = lessonDateToInputValue(lesson);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `lesson-slot${ymd === today && viewDate === today ? " highlight" : ""}`;
        const initial = (student.name || "?").charAt(0).toUpperCase();
        const scoreCount = Object.keys(lesson.scores || {}).length;
        const meta = lessonHasScores(lesson)
          ? formatLessonTime(lesson)
          : `${formatLessonTime(lesson)} · ${scoreCount ? `${scoreCount} оценок` : "без оценок"}`;
        btn.innerHTML = `
          <span class="lesson-slot-avatar">${escapeHtml(initial)}</span>
          <span class="lesson-slot-name">${escapeHtml(student.name)}</span>
          <span class="lesson-slot-meta">${escapeHtml(meta)}</span>`;
        btn.addEventListener("click", () => openStudent(student.id));
        slotsEl.appendChild(btn);
        if (i === 0 && viewDate === today) btn.classList.add("highlight");
      });
    }
  }

  const allLessons = state.students.reduce((n, s) => n + (s.lessons?.length ?? 0), 0);
  const studentsWithLessons = state.students.filter((s) => (s.lessons?.length ?? 0) > 0).length;
  const totalStudents = state.students.length;
  const targetLessons = Math.max(totalStudents * 4, allLessons, 1);

  const el = (id) => document.getElementById(id);
  if (el("stat-lessons-done")) el("stat-lessons-done").textContent = String(allLessons);
  if (el("stat-lessons-total")) el("stat-lessons-total").textContent = String(targetLessons);
  if (el("stat-students-active")) el("stat-students-active").textContent = String(studentsWithLessons);
  if (el("stat-students-total")) el("stat-students-total").textContent = String(totalStudents);
  if (el("stat-criteria-count")) el("stat-criteria-count").textContent = String(state.criteria.length);
  if (el("stat-methods-count")) el("stat-methods-count").textContent = String(state.methods.length);

  setRingProgress(el("ring-lessons"), allLessons / targetLessons);
  setRingProgress(el("ring-students"), totalStudents ? studentsWithLessons / totalStudents : 0);

  renderAsideContent();
  renderNotifications();
}

function showAuth() {
  document.getElementById("app-shell")?.classList.add("hidden");
  document.getElementById("view-auth")?.classList.remove("hidden");
}

function showApp(view, options = {}) {
  const resolvedView = view === "home" ? "students" : view;
  document.getElementById("app-shell")?.classList.remove("hidden");
  document.getElementById("view-auth")?.classList.add("hidden");
  const map = ["students", "student-detail", "analysis", "settings", "schedule"];
  map.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle("hidden", v !== resolvedView);
  });
  const navView = resolvedView === "student-detail" ? "students" : view === "home" ? "home" : resolvedView;
  document.querySelectorAll("#main-nav .nav-item[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === navView);
  });
  const aside = document.getElementById("page-aside");
  if (aside) aside.classList.toggle("hidden", resolvedView !== "students");
  closeAllDropdowns();

  if (options.scrollTo === "students-panel") {
    setTimeout(() => {
      document.getElementById("students-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
  if (view === "home" || options.scrollTop) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
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
  sessionStorage.setItem("ahp_login", login);
  await bootstrapSession();
  setUserDisplay(login);
  setAuthMsg("Аккаунт создан.", "success");
  uiState.dashboardDate = todayYmd();
  showApp("home");
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
  sessionStorage.setItem("ahp_login", login);
  await bootstrapSession();
  setUserDisplay(login);
  uiState.dashboardDate = todayYmd();
  showApp("home");
  renderStudents();
});

document.getElementById("btn-logout").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem("ahp_login");
  closeAllDropdowns();
  showAuth();
});

document.getElementById("btn-logout-menu")?.addEventListener("click", () => {
  document.getElementById("btn-logout")?.click();
});

document.querySelectorAll("#main-nav .nav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.getAttribute("data-view");
    if (v === "home") {
      goHome();
      return;
    }
    showApp(v, v === "students" ? { scrollTo: "students-panel" } : {});
    if (v === "students") renderStudents();
    if (v === "schedule") renderSchedule();
    if (v === "analysis") renderAnalysisForm();
    if (v === "settings") renderSettings();
  });
});

document.getElementById("btn-sidebar-home")?.addEventListener("click", goHome);

document.getElementById("btn-onboarding")?.addEventListener("click", () => {
  showHelpModal("docs");
});

document.getElementById("btn-help-docs")?.addEventListener("click", () => showHelpModal("docs"));
document.getElementById("btn-help-faq")?.addEventListener("click", () => showHelpModal("faq"));
document.getElementById("btn-help-close")?.addEventListener("click", hideHelpModal);
document.getElementById("help-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "help-modal") hideHelpModal();
});

document.getElementById("btn-notifications")?.addEventListener("click", (e) => {
  e.stopPropagation();
  renderNotifications();
  toggleDropdown("btn-notifications", "notifications-panel");
});

document.getElementById("btn-user-menu")?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleDropdown("btn-user-menu", "user-menu-panel");
});

document.querySelectorAll("#user-menu-panel .dropdown-item[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const v = btn.getAttribute("data-goto");
    showApp(v);
    if (v === "students") renderStudents();
    if (v === "schedule") renderSchedule();
    if (v === "analysis") renderAnalysisForm();
    if (v === "settings") renderSettings();
    closeAllDropdowns();
  });
});

document.getElementById("btn-schedule-prev")?.addEventListener("click", () => {
  uiState.dashboardDate = shiftYmd(uiState.dashboardDate, -1);
  renderDashboard();
});

document.getElementById("btn-schedule-next")?.addEventListener("click", () => {
  uiState.dashboardDate = shiftYmd(uiState.dashboardDate, 1);
  renderDashboard();
});

document.getElementById("btn-schedule-add")?.addEventListener("click", () => {
  uiState.scheduleSelectedDate = uiState.dashboardDate;
  uiState.scheduleWeekStart = getWeekStartYmd(uiState.dashboardDate);
  showApp("schedule");
  renderSchedule();
  openScheduleAddModal(uiState.dashboardDate);
});

document.getElementById("btn-aside-add")?.addEventListener("click", focusAddStudent);

document.querySelectorAll("#aside-segment .segment").forEach((btn) => {
  btn.addEventListener("click", () => {
    uiState.asideMode = btn.getAttribute("data-aside-mode") || "individual";
    document.querySelectorAll("#aside-segment .segment").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    renderAsideContent();
  });
});

document.addEventListener("click", () => closeAllDropdowns());
document.querySelectorAll(".dropdown-wrap").forEach((wrap) => {
  wrap.addEventListener("click", (e) => e.stopPropagation());
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideHelpModal();
    hideScheduleAddModal();
    closeAllDropdowns();
  }
});

document.getElementById("btn-schedule-week-prev")?.addEventListener("click", () => {
  ensureScheduleState();
  uiState.scheduleWeekStart = shiftYmd(uiState.scheduleWeekStart, -7);
  renderSchedule();
});

document.getElementById("btn-schedule-week-next")?.addEventListener("click", () => {
  ensureScheduleState();
  uiState.scheduleWeekStart = shiftYmd(uiState.scheduleWeekStart, 7);
  renderSchedule();
});

document.getElementById("btn-schedule-today")?.addEventListener("click", () => {
  const today = todayYmd();
  uiState.scheduleWeekStart = getWeekStartYmd(today);
  uiState.scheduleSelectedDate = today;
  renderSchedule();
});

document.getElementById("btn-schedule-page-add")?.addEventListener("click", () => {
  openScheduleAddModal(uiState.scheduleSelectedDate || todayYmd());
});

document.getElementById("btn-schedule-day-add")?.addEventListener("click", () => {
  openScheduleAddModal(uiState.scheduleSelectedDate || todayYmd());
});

document.getElementById("btn-schedule-add-close")?.addEventListener("click", hideScheduleAddModal);
document.getElementById("btn-schedule-add-cancel")?.addEventListener("click", hideScheduleAddModal);
document.getElementById("schedule-add-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "schedule-add-modal") hideScheduleAddModal();
});

document.getElementById("btn-schedule-add-submit")?.addEventListener("click", async () => {
  const sid = document.getElementById("schedule-add-student")?.value;
  const s = state.students.find((x) => x.id === sid);
  if (!s) {
    setScheduleAddMsg("Сначала добавьте ученика в разделе «Ученики».", "error");
    return;
  }
  const dateYmd = document.getElementById("schedule-add-date")?.value?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    setScheduleAddMsg("Укажите корректную дату.", "error");
    return;
  }
  const timeStart = document.getElementById("schedule-add-time-start")?.value?.trim() || "";
  const timeEnd = document.getElementById("schedule-add-time-end")?.value?.trim() || "";
  if (timeStart && timeEnd && timeStart >= timeEnd) {
    setScheduleAddMsg("Время окончания должно быть позже начала.", "error");
    return;
  }
  if (!s.lessons) s.lessons = [];
  const lesson = { id: uid(), date: dateYmd, scores: {} };
  if (timeStart) lesson.timeStart = timeStart;
  if (timeEnd) lesson.timeEnd = timeEnd;
  s.lessons.push(lesson);
  await persist();
  hideScheduleAddModal();
  uiState.scheduleSelectedDate = dateYmd;
  uiState.scheduleWeekStart = getWeekStartYmd(dateYmd);
  renderSchedule();
  renderNotifications();
});

function renderStudents() {
  renderDashboard();
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

function setLessonFormMsg(text, type) {
  const el = document.getElementById("lesson-form-msg");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.className = `lesson-form-msg ${type || ""}`;
  el.classList.remove("hidden");
}

function updateLessonDateDisplay() {
  const input = document.getElementById("lesson-date");
  const display = document.getElementById("lesson-date-display");
  if (!input || !display) return;
  display.textContent = input.value ? formatDateRu(input.value) : "Выберите дату";
}

function scoreBadgeHtml(value) {
  if (value == null || value === "" || value === "—") return "—";
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  const cls = v <= 2 ? "low" : v === 3 ? "mid" : v === 4 ? "good" : "high";
  return `<span class="score-badge score-${cls}">${v}</span>`;
}

function getSelectedLessonScores() {
  const scores = {};
  let any = false;
  document.querySelectorAll("#lesson-scores-inputs .score-pills").forEach((group) => {
    const active = group.querySelector(".score-pill.active");
    const cid = group.getAttribute("data-crit");
    if (active && cid) {
      scores[cid] = parseInt(active.getAttribute("data-value"), 10);
      any = true;
    }
  });
  return { scores, any };
}

function clearLessonScoreInputs() {
  document.querySelectorAll("#lesson-scores-inputs .score-pill.active").forEach((btn) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-pressed", "false");
  });
}

function setAllLessonScores(value) {
  document.querySelectorAll("#lesson-scores-inputs .score-pills").forEach((group) => {
    const pill = group.querySelector(`.score-pill[data-value="${value}"]`);
    if (!pill) return;
    group.querySelectorAll(".score-pill").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    pill.classList.add("active");
    pill.setAttribute("aria-pressed", "true");
  });
  setLessonFormMsg("", "");
}

function bindScorePillGroup(group) {
  group.querySelectorAll(".score-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      group.querySelectorAll(".score-pill").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-pressed", "true");
      setLessonFormMsg("", "");
    });
  });
}

function openStudent(id, options = {}) {
  const s = state.students.find((x) => x.id === id);
  if (!s) return;
  document.getElementById("current-student-id").value = id;
  document.getElementById("student-detail-title").textContent = s.name;
  document.getElementById("student-detail-hint").textContent = s.notes?.trim() || "Заметки не указаны";
  const avatar = document.getElementById("student-hero-avatar");
  if (avatar) avatar.textContent = (s.name || "?").charAt(0).toUpperCase();
  const lessonCount = s.lessons?.length ?? 0;
  const countEl = document.getElementById("student-lesson-count");
  if (countEl) {
    const word = lessonCount === 1 ? "урок" : lessonCount >= 2 && lessonCount <= 4 ? "урока" : "уроков";
    countEl.textContent = `${lessonCount} ${word}`;
  }
  const critEl = document.getElementById("student-criteria-count");
  if (critEl) {
    const n = state.criteria.length;
    const word = n === 1 ? "критерий" : n >= 2 && n <= 4 ? "критерия" : "критериев";
    critEl.textContent = `${n} ${word}`;
  }
  const dateEl = document.getElementById("lesson-date");
  const timeStartEl = document.getElementById("lesson-time-start");
  const timeEndEl = document.getElementById("lesson-time-end");
  if (options.lessonId) {
    const lesson = s.lessons?.find((l) => l.id === options.lessonId);
    if (lesson) {
      if (dateEl) dateEl.value = lessonDateToInputValue(lesson) || options.date || todayYmd();
      if (timeStartEl) timeStartEl.value = lesson.timeStart || "";
      if (timeEndEl) timeEndEl.value = lesson.timeEnd || "";
    }
  } else {
    if (dateEl) dateEl.value = options.date || todayYmd();
    if (timeStartEl) timeStartEl.value = options.timeStart || "";
    if (timeEndEl) timeEndEl.value = options.timeEnd || "";
  }
  updateLessonDateDisplay();
  setLessonFormMsg("", "");
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
  const labels = ["слабо", "средне", "хорошо", "отлично"];
  for (const c of state.criteria) {
    const div = document.createElement("div");
    div.className = "score-field";
    const pills = [];
    for (let v = SCORE_MIN; v <= SCORE_MAX; v++) {
      pills.push(
        `<button type="button" class="score-pill" data-value="${v}" aria-pressed="false" aria-label="${escapeHtml(c.name)}: ${v}">${v}</button>`
      );
    }
    div.innerHTML = `
      <label class="score-field-label" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</label>
      <div class="score-pills" role="group" aria-label="${escapeHtml(c.name)}" data-crit="${c.id}">
        ${pills.join("")}
      </div>
      <div class="score-pill-labels"><span>${labels[0]}</span><span>${labels[labels.length - 1]}</span></div>`;
    bindScorePillGroup(div.querySelector(".score-pills"));
    wrap.appendChild(div);
  }
}

function renderStudentLessons(s) {
  renderLessonInputs();
  const dateInp = document.getElementById("lesson-date");
  if (dateInp && !dateInp.value) dateInp.value = todayYmd();
  updateLessonDateDisplay();

  const thead = document.getElementById("lessons-thead");
  const tbody = document.getElementById("lessons-tbody");
  const emptyEl = document.getElementById("lessons-empty");
  const tableWrap = document.getElementById("lessons-table-wrap");
  const crit = state.criteria;
  thead.innerHTML = `<tr><th>№</th><th>Дата</th><th>Время</th>${crit
    .map((c) => `<th title="${escapeHtml(c.name)}">${escapeHtml(c.name.length > 22 ? `${c.name.slice(0, 20)}…` : c.name)}</th>`)
    .join("")}<th></th></tr>`;
  tbody.innerHTML = "";
  const sorted = [...(s.lessons || [])].sort((a, b) => {
    const da = lessonDateToInputValue(a) || "0000-00-00";
    const db = lessonDateToInputValue(b) || "0000-00-00";
    return db.localeCompare(da);
  });

  const hasLessons = sorted.length > 0;
  emptyEl?.classList.toggle("hidden", hasLessons);
  tableWrap?.classList.toggle("hidden", !hasLessons);

  sorted.forEach((lesson, idx) => {
    const tr = document.createElement("tr");
    const ymd = lessonDateToInputValue(lesson);
    const cells = crit.map((c) => `<td>${scoreBadgeHtml(lesson.scores?.[c.id])}</td>`).join("");
    const dateCell = `<td><span class="date-display">${formatDateRu(ymd)}</span></td>`;
    const timeCell = `<td><span class="date-display">${escapeHtml(formatLessonTime(lesson))}</span></td>`;
    tr.innerHTML = `<td>${idx + 1}</td>${dateCell}${timeCell}${cells}<td><button type="button" class="btn btn-danger btn-del-lesson" data-li="${lesson.id}">Удалить</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll(".btn-del-lesson").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Удалить запись урока?")) return;
      const lid = b.getAttribute("data-li");
      s.lessons = s.lessons.filter((l) => l.id !== lid);
      await persist();
      renderStudentLessons(s);
      const countEl = document.getElementById("student-lesson-count");
      if (countEl) {
        const n = s.lessons?.length ?? 0;
        const word = n === 1 ? "урок" : n >= 2 && n <= 4 ? "урока" : "уроков";
        countEl.textContent = `${n} ${word}`;
      }
    })
  );

  const radarCanvas = document.getElementById("student-radar-chart");
  void updateStudentRadarChart(radarCanvas, { criteria: state.criteria, lessons: s.lessons }).catch((e) =>
    console.error("Радар успеваемости:", e)
  );
}

document.getElementById("lesson-date")?.addEventListener("change", updateLessonDateDisplay);

document.getElementById("btn-fill-default-scores")?.addEventListener("click", () => {
  setAllLessonScores(SCORE_DEFAULT);
});

document.getElementById("btn-add-lesson").addEventListener("click", async () => {
  const sid = document.getElementById("current-student-id").value;
  const s = state.students.find((x) => x.id === sid);
  if (!s) return;
  const { scores, any } = getSelectedLessonScores();
  if (!any) {
    setLessonFormMsg(`Выберите оценку хотя бы по одному критерию (${SCORE_MIN}–${SCORE_MAX}).`, "error");
    return;
  }
  const dateEl = document.getElementById("lesson-date");
  const dateYmd = (dateEl?.value || todayYmd()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    setLessonFormMsg("Укажите корректную дату занятия.", "error");
    return;
  }
  const timeStart = document.getElementById("lesson-time-start")?.value?.trim() || "";
  const timeEnd = document.getElementById("lesson-time-end")?.value?.trim() || "";
  if (timeStart && timeEnd && timeStart >= timeEnd) {
    setLessonFormMsg("Время окончания должно быть позже начала.", "error");
    return;
  }
  if (!s.lessons) s.lessons = [];
  const lesson = { id: uid(), date: dateYmd, scores };
  if (timeStart) lesson.timeStart = timeStart;
  if (timeEnd) lesson.timeEnd = timeEnd;
  s.lessons.push(lesson);
  await persist();
  clearLessonScoreInputs();
  document.getElementById("lesson-time-start").value = "";
  document.getElementById("lesson-time-end").value = "";
  setLessonFormMsg(`Запись за ${formatDateRu(dateYmd)} добавлена.`, "success");
  renderStudentLessons(s);
  const countEl = document.getElementById("student-lesson-count");
  if (countEl) {
    const n = s.lessons.length;
    const word = n === 1 ? "урок" : n >= 2 && n <= 4 ? "урока" : "уроков";
    countEl.textContent = `${n} ${word}`;
  }
  renderDashboard();
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
    setUserDisplay(sessionStorage.getItem("ahp_login") || "");
    uiState.dashboardDate = todayYmd();
    showApp("home");
    renderStudents();
  } else {
    showAuth();
  }
})();
