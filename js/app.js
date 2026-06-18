import {
  methodScoresToLocalMatrices,
  defaultLocalMatrices,
  createOnesMatrix,
  isValidLocalMatrices,
  methodPairIndices,
  getPairwiseValue,
  setPairwiseValue,
  resizeLocalMatrices,
  removeMethodFromMatrix,
  SAATY_VALUES,
  formatSaatyValue,
  parseSaatyValue,
  saatyComparisonHint,
} from "./ahp.js";
import { runFunctionalScoreAnalysis } from "./analysis/functionalAnalysisModel.js";
import { SCORE_MIN, SCORE_MAX, SCORE_DEFAULT } from "./data.js";
import {
  updateStudentRadarChart,
  destroyStudentRadarChart,
  updateMethodologyPriorityRadar,
  destroyAnalysisRadarChart,
} from "./studentRadar.js";

const TOKEN_KEY = "ahp_token";
const ROLE_KEY = "ahp_role";
const METHODIST_KEY = "ahp_methodist_login";

function isMethodist() {
  return state.userRole === "methodist";
}

function isTutor() {
  return state.userRole === "tutor";
}

function defaultViewForRole() {
  return isMethodist() ? "students" : "home";
}

function applyRoleUi() {
  const role = state.userRole || "tutor";

  document.querySelectorAll("#main-nav .nav-item[data-view]").forEach((btn) => {
    const allowed = btn.getAttribute("data-role");
    const show = allowed === "both" || allowed === role;
    btn.classList.toggle("hidden", !show);
  });

  document.querySelectorAll("[data-role='tutor']").forEach((el) => {
    if (el.closest("#main-nav")) return;
    el.classList.toggle("hidden", role === "methodist");
  });
  document.querySelectorAll("[data-role='methodist']").forEach((el) => {
    if (el.closest("#main-nav")) return;
    el.classList.toggle("hidden", role === "tutor");
  });

  document.querySelectorAll("#user-menu-panel .dropdown-item[data-goto]").forEach((btn) => {
    const v = btn.getAttribute("data-goto");
    const show =
      v === "students" ||
      (v === "settings" && role === "methodist") ||
      (v !== "settings" && role === "tutor");
    btn.classList.toggle("hidden", !show);
  });

  const panelDesc = document.querySelector("#students-panel .panel-desc");
  if (panelDesc) {
    panelDesc.textContent =
      role === "methodist"
        ? "Список учеников и матрицы попарного сравнения методик"
        : "Ведение данных об учениках и оценках по урокам";
  }

  const lessonsCol = document.querySelector("#students-panel thead th.col-lessons");
  if (lessonsCol) lessonsCol.classList.toggle("hidden", role === "methodist");
}

function migrateStudentFields(student) {
  if (!student.class?.trim() && student.notes?.trim()) {
    student.class = String(student.notes).trim();
  }
  student.class = String(student.class ?? "").trim();
  student.subject = String(student.subject ?? "").trim();
  delete student.notes;
}

const STUDENT_NAME_MAX_LEN = 40;
const STUDENT_CLASS_MAX_LEN = 2;
const STUDENT_SUBJECT_MAX_LEN = 40;
const RE_STUDENT_LETTERS = /^[\p{L}]+(?:[\s-][\p{L}]+)*$/u;
const RE_STUDENT_CLASS = /^([1-9]|1[0-1])$/;

function validateStudentForm(name, studentClass, subject) {
  const trimmedName = String(name ?? "").trim();
  const trimmedClass = String(studentClass ?? "").trim();
  const trimmedSubject = String(subject ?? "").trim();

  if (!trimmedName) return "Укажите имя ученика.";
  if (trimmedName.length > STUDENT_NAME_MAX_LEN) {
    return `Имя — не более ${STUDENT_NAME_MAX_LEN} символов.`;
  }
  if (!RE_STUDENT_LETTERS.test(trimmedName)) {
    return "Имя: только буквы (можно пробел или дефис между словами).";
  }

  if (!trimmedClass) return "Укажите класс.";
  if (!RE_STUDENT_CLASS.test(trimmedClass)) {
    return "Класс: только цифры от 1 до 11.";
  }

  if (!trimmedSubject) return "Укажите предмет.";
  if (trimmedSubject.length > STUDENT_SUBJECT_MAX_LEN) {
    return `Предмет — не более ${STUDENT_SUBJECT_MAX_LEN} символов.`;
  }
  if (!RE_STUDENT_LETTERS.test(trimmedSubject)) {
    return "Предмет: только буквы (можно пробел между словами).";
  }

  return null;
}

function setStudentFormMsg(text, type) {
  const el = document.getElementById("student-add-msg");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    el.className = "student-add-msg hidden";
    return;
  }
  el.className = `student-add-msg msg ${type || ""}`;
  el.textContent = text;
  el.classList.remove("hidden");
}

function formatStudentClassLabel(className) {
  const value = String(className ?? "").trim();
  if (!value) return "Класс не указан";
  return /\bкласс/i.test(value) ? value : `${value} класс`;
}

function formatStudentSubjectLabel(subject) {
  const value = String(subject ?? "").trim();
  return value || "Предмет не указан";
}

function studentSummaryLine(student) {
  const parts = [student.name];
  if (student.class?.trim()) parts.push(formatStudentClassLabel(student.class));
  if (student.subject?.trim()) parts.push(formatStudentSubjectLabel(student.subject));
  return parts.join(" · ");
}

function guardViewForRole(view) {
  const resolved = view === "home" ? "students" : view;
  if (isMethodist() && ["home", "schedule", "analysis"].includes(resolved)) return "students";
  if (isTutor() && resolved === "settings") return "students";
  return view;
}

function setAuthMsg(html, type, step = "login") {
  const id = step === "register" ? "auth-register-msg" : "auth-login-msg";
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `msg ${type || ""}`;
  if (!html) {
    el.className = "msg hidden";
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = html;
}

function clearAuthMessages() {
  setAuthMsg("", "", "login");
  setAuthMsg("", "", "register");
}

function setAuthTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("auth-tab-login")?.classList.toggle("active", isLogin);
  document.getElementById("auth-tab-register")?.classList.toggle("active", !isLogin);
  document.getElementById("auth-tab-login")?.setAttribute("aria-selected", String(isLogin));
  document.getElementById("auth-tab-register")?.setAttribute("aria-selected", String(!isLogin));
  document.getElementById("auth-panel-login")?.classList.toggle("hidden", !isLogin);
  document.getElementById("auth-panel-register")?.classList.toggle("hidden", isLogin);
  clearAuthMessages();
  if (isLogin) {
    document.getElementById("auth-login-user")?.focus();
  } else {
    syncRegisterRoleUi();
    document.getElementById("auth-register-user")?.focus();
  }
}

function getRegisterRole() {
  return document.querySelector('input[name="auth-register-role"]:checked')?.value || "methodist";
}

function syncRegisterRoleUi() {
  const isTutor = getRegisterRole() === "tutor";
  document.getElementById("auth-register-methodist-field")?.classList.toggle("hidden", !isTutor);
}

function setAuthSubmitting(formId, submitting) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.querySelectorAll("input, button, select, textarea").forEach((el) => {
    el.disabled = submitting;
  });
}

function normalizeAuthLogin(value) {
  return String(value ?? "").trim();
}

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
  userRole: "tutor",
  methodistLogin: null,
  login: null,
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
    title: "Метод анализа иерархий (МАИ)",
    html: `
      <h3>Что такое МАИ</h3>
      <p>Математический способ выбрать лучшую методику обучения для ученика на основе его сильных и слабых сторон.</p>

      <h3>Этап 1. Оценка ученика</h3>
      <p>Репетитор выставляет оценки по критериям (на уроках 2–5, в анализе переводятся в 1–10).</p>
      <table class="help-doc-table">
        <thead><tr><th>Критерий</th><th>Что оценивается</th><th>Низкая (1–2)</th><th>Высокая (9–10)</th></tr></thead>
        <tbody>
          <tr><td>Теория</td><td>Знание правил, формул</td><td>Не помнит формулы</td><td>Свободно оперирует теорией</td></tr>
          <tr><td>Графики</td><td>Построение графиков</td><td>Не может построить простой график</td><td>Строит сложные без ошибок</td></tr>
          <tr><td>Задачи</td><td>Решение задач</td><td>Не решает типовую</td><td>Решает повышенной сложности</td></tr>
          <tr><td>Самостоятельность</td><td>Работа без подсказок</td><td>Нужен постоянный контроль</td><td>Работает полностью сам</td></tr>
        </tbody>
      </table>
      <p class="help-note"><strong>Важно:</strong> чем ниже оценка, тем больше дефицит — система в первую очередь подтягивает слабые стороны.</p>

      <h3>Этап 2. Методист настраивает матрицы методик (для каждого ученика)</h3>
      <p>Методист в карточке ученика заполняет таблицы сравнения методик. Репетитор этот этап не выполняет.</p>
      <p><strong>Пример для критерия «Теория»:</strong></p>
      <table class="help-doc-table">
        <thead><tr><th>Сравнение</th><th>Значение</th><th>Смысл</th></tr></thead>
        <tbody>
          <tr><td>Классическая важнее Практикума</td><td>3</td><td>Умеренно важнее</td></tr>
          <tr><td>Классическая важнее Проектной</td><td>5</td><td>Сильно важнее</td></tr>
          <tr><td>Классическая важнее Визуальной</td><td>4</td><td>Между сильно и очень</td></tr>
          <tr><td>Практикум важнее Проектной</td><td>2</td><td>Чуть важнее</td></tr>
          <tr><td>Практикум важнее Визуальной</td><td>2</td><td>Чуть важнее</td></tr>
          <tr><td>Проектная важнее Визуальной</td><td>1/2</td><td>Визуальная важнее в 2 раза</td></tr>
        </tbody>
      </table>
      <p><strong>Шкала сравнений:</strong></p>
      <table class="help-doc-table">
        <thead><tr><th>Значение</th><th>Смысл</th></tr></thead>
        <tbody>
          <tr><td>1</td><td>Равная важность</td></tr>
          <tr><td>3</td><td>Умеренное превосходство</td></tr>
          <tr><td>5</td><td>Сильное превосходство</td></tr>
          <tr><td>7</td><td>Очень сильное превосходство</td></tr>
          <tr><td>9</td><td>Абсолютное превосходство</td></tr>
          <tr><td>2, 4, 6, 8</td><td>Промежуточные значения</td></tr>
          <tr><td>1/2, 1/3…</td><td>Обратное превосходство (вторая методика важнее)</td></tr>
        </tbody>
      </table>
      <p class="help-note"><strong>Аналогия:</strong> если вы выбираете автомобиль и для вас важна «надёжность», вы сравните марки между собой. Здесь то же самое — для каждого критерия методист сравнивает методики обучения.</p>

      <h3>Этап 3. Система рассчитывает результат</h3>
      <p>Автоматически выполняются следующие шаги. <strong>Дополнительных действий от репетитора не требуется</strong> — веса критериев система выводит из ваших оценок через дефицит.</p>

      <h4>Шаг 3.1. Расчёт дефицита знаний</h4>
      <p>Система преобразует оценки в «дефицит» по формуле: <strong>Дефицит = 10 − оценка + 1</strong></p>
      <p class="help-note">Пример: оценка 3 → дефицит 8 (очень нужно улучшать); оценка 9 → дефицит 2 (почти не нужно улучшать).</p>

      <h4>Шаг 3.2. Построение матрицы критериев</h4>
      <p>Для каждой пары критериев: <strong>значение = дефицит А / дефицит Б</strong>. Если дефицит теории = 8, а графиков = 2, то «теория важнее графиков в 4 раза».</p>

      <h4>Шаг 3.3. Расчёт весов критериев</h4>
      <p>Из матрицы попарных сравнений вычисляются веса — насколько каждый критерий важен для улучшения. Сумма весов = 100%. Чем выше дефицит, тем больше вес.</p>

      <h4>Шаг 3.4. Проверка согласованности (КС)</h4>
      <p>Система проверяет, нет ли противоречий в сравнениях. Норма: <strong>КС &lt; 0,1</strong>. Если КС ≥ 0,1 — рекомендация может быть ненадёжной.</p>

      <h4>Шаг 3.5. Локальные приоритеты методик</h4>
      <p>Для каждого критерия система берёт <strong>заполненную вами</strong> матрицу сравнения методик и вычисляет, какая методика лучше для этого критерия.</p>

      <h4>Шаг 3.6. Глобальные приоритеты</h4>
      <p><strong>Глобальный приоритет = Σ (вес критерия × локальный приоритет методики)</strong></p>

      <h4>Шаг 3.7. Выбор лучшей методики</h4>
      <p>Методика с максимальным глобальным приоритетом становится рекомендацией.</p>

      <h4>Что вы видите на экране после расчёта</h4>
      <table class="help-doc-table">
        <thead><tr><th>Блок</th><th>Что показывает</th></tr></thead>
        <tbody>
          <tr><td>Веса критериев</td><td>Насколько важно улучшать каждый критерий (%)</td></tr>
          <tr><td>Коэффициент согласованности</td><td>✅ если всё хорошо, ⚠️ если есть противоречия</td></tr>
          <tr><td>Локальные приоритеты</td><td>Ранжирование методик по каждому критерию</td></tr>
          <tr><td>Глобальные приоритеты</td><td>Итоговый рейтинг методик</td></tr>
          <tr><td>Рекомендация</td><td>Какая методика подходит лучше всего</td></tr>
        </tbody>
      </table>

      <h3>Что делает репетитор</h3>
      <table class="help-doc-table">
        <thead><tr><th>Действие</th><th>Когда</th></tr></thead>
        <tbody>
          <tr><td>Выставить оценки после урока</td><td>После каждого занятия</td></tr>
          <tr><td>Посмотреть рекомендацию</td><td>После обновления оценок</td></tr>
        </tbody>
      </table>
      <h3>Что делает методист</h3>
      <table class="help-doc-table">
        <thead><tr><th>Действие</th><th>Когда</th></tr></thead>
        <tbody>
          <tr><td>Задать критерии и методики</td><td>Один раз или при изменении программы</td></tr>
          <tr><td>Заполнить матрицы сравнения</td><td>Один раз для каждого ученика</td></tr>
        </tbody>
      </table>
    `,
  },
  faq: {
    title: "Частые вопросы",
    html: `
      <h3>Откуда берутся веса критериев?</h3>
      <p>Из попарных сравнений, которые система строит <strong>автоматически из дефицитов</strong> (10 − оценка + 1). Дополнительных действий не требуется.</p>
      <h3>Где заполнять матрицы методик (этап 2)?</h3>
      <p>Методист — в карточке ученика, раздел «Этап 2». Репетитор матрицы не редактирует.</p>
      <h3>Кто задаёт критерии и методики?</h3>
      <p>Только методист, вкладка «Правила». Репетитор использует их при оценке и анализе.</p>
      <h3>Где хранятся данные?</h3>
      <p>На сервере в файле базы данных (<code>data/app.db</code>).</p>
      <h3>Какая шкала оценок?</h3>
      <p>На уроках — 2–5; при анализе — 1–10. Дефицит = 10 − оценка + 1.</p>
      <h3>Когда появится рекомендация?</h3>
      <p>После урока с оценками и заполненных матриц — раздел «Анализ».</p>
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
 * Нормализация правил и локальных матриц МАИ.
 */
function migrateAndNormalize(s) {
  const k = s.criteria.length;
  const m = s.methods.length;
  if (k === 0 || m === 0) {
    s.criteriaImportance = [];
    s.methodScores = [];
    s.localMatrices = [];
    delete s.criteriaMatrix;
    return;
  }

  if (!isValidLocalMatrices(s.localMatrices, k, m)) {
    const legacyScores =
      Array.isArray(s.methodScores) &&
      s.methodScores.length === m &&
      s.methodScores.every((row) => Array.isArray(row) && row.length === k);
    s.localMatrices = legacyScores
      ? methodScoresToLocalMatrices(s.methodScores)
      : defaultLocalMatrices(k, m);
  }

  s.criteriaImportance = [];
  s.methodScores = [];
  delete s.criteriaMatrix;

  if (!isValidLocalMatrices(s.localMatrices, k, m)) {
    const fromStudent = (s.students || []).find((st) =>
      isValidLocalMatrices(st.localMatrices, k, m)
    );
    if (fromStudent) {
      s.localMatrices = JSON.parse(JSON.stringify(fromStudent.localMatrices));
    }
  }

  migrateStudentsLocalMatrices(s);
}

function migrateStudentsLocalMatrices(s) {
  const k = s.criteria.length;
  const m = s.methods.length;
  if (k === 0 || m === 0) return;

  const globalMatrices = isValidLocalMatrices(s.localMatrices, k, m) ? s.localMatrices : null;

  for (const student of s.students || []) {
    if (!isValidLocalMatrices(student.localMatrices, k, m)) {
      student.localMatrices = globalMatrices
        ? JSON.parse(JSON.stringify(globalMatrices))
        : defaultLocalMatrices(k, m);
    }
  }
}

function ensureStudentLocalMatrices(student) {
  migrateAndNormalize(state);
  const k = state.criteria.length;
  const m = state.methods.length;
  if (!isValidLocalMatrices(student.localMatrices, k, m)) {
    student.localMatrices = defaultLocalMatrices(k, m);
  }
  return student.localMatrices;
}

function syncAllStudentsMatrices(mutator) {
  for (const student of state.students || []) {
    ensureStudentLocalMatrices(student);
    mutator(student);
  }
}

function purgeCriterionFromLessons(criterionId) {
  for (const student of state.students || []) {
    for (const lesson of student.lessons || []) {
      if (lesson.scores && criterionId in lesson.scores) {
        delete lesson.scores[criterionId];
      }
    }
  }
}

function migrateStudentsCleanup(s) {
  migrateStudentsLocalMatrices(s);
  for (const student of s.students || []) {
    migrateStudentFields(student);
    delete student.criterionSignificance;
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
  state.userRole = data.role || sessionStorage.getItem(ROLE_KEY) || "tutor";
  state.methodistLogin = data.methodistLogin || sessionStorage.getItem(METHODIST_KEY) || null;
  state.login = data.login || sessionStorage.getItem("ahp_login") || null;
  sessionStorage.setItem(ROLE_KEY, state.userRole);
  if (state.methodistLogin) sessionStorage.setItem(METHODIST_KEY, state.methodistLogin);
  else sessionStorage.removeItem(METHODIST_KEY);

  applyRoleUi();
  const k = state.criteria.length;
  const m = state.methods.length;
  const hadValidMatrices = isValidLocalMatrices(state.localMatrices, k, m);
  const needsStudentMigrate = (state.students || []).some(
    (st) => !isValidLocalMatrices(st.localMatrices, k, m)
  );
  migrateAndNormalize(state);
  if (!hadValidMatrices || needsStudentMigrate || data.criteriaMatrix) await persist();
  return true;
}

async function persist() {
  if (!getToken()) return;
  migrateAndNormalize(state);
  const res = await api("PUT", "/api/me", {
    criteria: state.criteria,
    methods: state.methods,
    criteriaImportance: [],
    methodScores: [],
    localMatrices: [],
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
  const roleLabel = isMethodist() ? "методист" : "репетитор";
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  if (nameEl) nameEl.textContent = `${name} · ${roleLabel}`;
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
      const key = (s.class || "").trim() || "Без класса";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(s);
    }
    if (!state.students.length) {
      asideContent.innerHTML = "<p>Добавьте учеников — они сгруппируются по классу</p>";
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
  setAuthTab("login");
}

function showApp(view, options = {}) {
  view = guardViewForRole(view);
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
  if (aside) aside.classList.toggle("hidden", resolvedView !== "students" || isMethodist());
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

function readLoginForm() {
  return {
    login: normalizeAuthLogin(document.getElementById("auth-login-user")?.value),
    password: document.getElementById("auth-login-pass")?.value || "",
  };
}

function readRegisterForm() {
  return {
    login: normalizeAuthLogin(document.getElementById("auth-register-user")?.value),
    password: document.getElementById("auth-register-pass")?.value || "",
    password2: document.getElementById("auth-register-pass2")?.value || "",
    methodistLogin: normalizeAuthLogin(document.getElementById("auth-register-methodist")?.value),
    role: getRegisterRole(),
  };
}

function validateLoginForm(form) {
  if (!form.login) return "Введите учётное имя.";
  if (form.login.length < 2) return "Учётное имя должно быть не короче 2 символов.";
  if (!form.password) return "Введите пароль.";
  if (form.password.length < 4) return "Пароль должен быть не короче 4 символов.";
  return null;
}

function validateRegisterForm(form) {
  if (form.role === "tutor" && !form.methodistLogin) {
    return "Укажите учётное имя методиста.";
  }
  if (form.role === "tutor" && form.methodistLogin.length < 2) {
    return "Учётное имя методиста — не короче 2 символов.";
  }
  if (!form.login) return "Придумайте учётное имя.";
  if (form.login.length < 2) return "Учётное имя должно быть не короче 2 символов.";
  if (!form.password) return "Введите пароль.";
  if (form.password.length < 4) return "Пароль должен быть не короче 4 символов.";
  if (form.password !== form.password2) return "Пароли не совпадают.";
  return null;
}

async function completeAuth(data, login, step = "login") {
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem("ahp_login", login);
  sessionStorage.setItem(ROLE_KEY, data.role || "methodist");
  if (data.methodistLogin) sessionStorage.setItem(METHODIST_KEY, data.methodistLogin);
  else sessionStorage.removeItem(METHODIST_KEY);

  const ok = await bootstrapSession();
  if (!ok) {
    sessionStorage.removeItem(TOKEN_KEY);
    setAuthMsg(
      "Вход выполнен, но не удалось загрузить данные профиля. Проверьте, что у методиста есть профиль, или обратитесь к администратору.",
      "error",
      step
    );
    return false;
  }

  setUserDisplay(login);
  uiState.dashboardDate = todayYmd();
  showApp(defaultViewForRole());
  renderStudents();
  return true;
}

async function submitLogin(event) {
  event?.preventDefault();
  const form = readLoginForm();
  const validationError = validateLoginForm(form);
  if (validationError) {
    setAuthMsg(validationError, "error", "login");
    return;
  }

  setAuthSubmitting("auth-login-form", true);
  setAuthMsg("", "", "login");
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ login: form.login, password: form.password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAuthMsg(data.error || "Ошибка входа", "error", "login");
      return;
    }
    await completeAuth(data, form.login, "login");
  } catch {
    setAuthMsg("Нет связи с сервером. Запустите приложение и попробуйте снова.", "error", "login");
  } finally {
    setAuthSubmitting("auth-login-form", false);
  }
}

async function submitRegister(event) {
  event?.preventDefault();
  const form = readRegisterForm();
  const validationError = validateRegisterForm(form);
  if (validationError) {
    setAuthMsg(validationError, "error", "register");
    return;
  }

  setAuthSubmitting("auth-register-form", true);
  setAuthMsg("", "", "register");
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        login: form.login,
        password: form.password,
        role: form.role,
        methodistLogin: form.methodistLogin,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAuthMsg(data.error || "Ошибка регистрации", "error", "register");
      return;
    }
    await completeAuth(data, form.login, "register");
  } catch {
    setAuthMsg("Нет связи с сервером. Запустите приложение и попробуйте снова.", "error", "register");
  } finally {
    setAuthSubmitting("auth-register-form", false);
  }
}

document.getElementById("auth-tab-login")?.addEventListener("click", () => setAuthTab("login"));
document.getElementById("auth-tab-register")?.addEventListener("click", () => setAuthTab("register"));
document.getElementById("auth-login-form")?.addEventListener("submit", submitLogin);
document.getElementById("auth-register-form")?.addEventListener("submit", submitRegister);
document.querySelectorAll('input[name="auth-register-role"]').forEach((input) => {
  input.addEventListener("change", syncRegisterRoleUi);
});

document.getElementById("btn-logout").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem("ahp_login");
  sessionStorage.removeItem(ROLE_KEY);
  sessionStorage.removeItem(METHODIST_KEY);
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
  if (!isMethodist()) renderDashboard();
  const tbody = document.getElementById("students-tbody");
  tbody.innerHTML = "";
  const openLabel = isMethodist() ? "Карточка / матрицы" : "Карточка / оценки";
  for (const s of state.students) {
    const tr = document.createElement("tr");
    const lessonsCell = `<td class="col-lessons${isMethodist() ? " hidden" : ""}"><span class="badge">${s.lessons?.length ?? 0}</span></td>`;
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.class || "—")}</td>
      <td>${escapeHtml(s.subject || "—")}</td>
      ${lessonsCell}
      <td>
        <ul class="inline-actions">
          <li><button class="btn btn-secondary btn-open-student" data-id="${s.id}">${openLabel}</button></li>
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
  const studentClass = document.getElementById("new-student-class").value.trim();
  const subject = document.getElementById("new-student-subject").value.trim();
  const validationError = validateStudentForm(name, studentClass, subject);
  if (validationError) {
    setStudentFormMsg(validationError, "error");
    return;
  }
  setStudentFormMsg("", "");
  state.students.push({
    id: uid(),
    name,
    class: studentClass,
    subject,
    lessons: [],
    localMatrices: defaultLocalMatrices(state.criteria.length, state.methods.length),
  });
  document.getElementById("new-student-name").value = "";
  document.getElementById("new-student-class").value = "";
  document.getElementById("new-student-subject").value = "";
  await persist();
  renderStudents();
});

["new-student-name", "new-student-class", "new-student-subject"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", () => setStudentFormMsg("", ""));
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
  const classChip = document.getElementById("student-class-chip");
  const subjectChip = document.getElementById("student-subject-chip");
  if (classChip) classChip.textContent = formatStudentClassLabel(s.class);
  if (subjectChip) subjectChip.textContent = formatStudentSubjectLabel(s.subject);
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
  if (isTutor()) renderStudentLessons(s);
  if (isMethodist()) renderStudentPairwiseMatrices(s);
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

document.getElementById("btn-open-saaty-scale")?.addEventListener("click", (e) => {
  e.preventDefault();
  const details = document.getElementById("pairwise-scale-help");
  if (details) {
    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

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

function setAnalysisEmptyVisible(visible) {
  document.getElementById("analysis-empty")?.classList.toggle("hidden", !visible);
  const result = document.getElementById("analysis-result");
  if (result && visible) {
    result.classList.add("hidden");
    result.innerHTML = "";
  }
}

function renderAnalysisForm() {
  destroyAnalysisRadarChart();
  const sel = document.getElementById("analysis-student");
  sel.innerHTML = `<option value="">— выберите ученика —</option>`;
  for (const s of state.students) {
    const o = document.createElement("option");
    o.value = s.id;
    const n = s.lessons?.length ?? 0;
    o.textContent = `${s.name} · ${n} ${n === 1 ? "урок" : n >= 2 && n <= 4 ? "урока" : "уроков"}`;
    if (!n) o.disabled = true;
    sel.appendChild(o);
  }
  setAnalysisEmptyVisible(true);
}

function tutorGradeComment(score10, deficit) {
  if (score10 >= 9) return "отлично, дефицита почти нет";
  if (score10 >= 7) return "хорошо";
  if (score10 >= 5) return "средне";
  if (score10 <= 3) return "плохо, большой дефицит";
  return "средне, нуждается в улучшении";
}

function buildRecommendationReason(bestIdx, deficits, localPriorities) {
  let topCi = 0;
  for (let i = 1; i < deficits.length; i++) {
    if (deficits[i] > deficits[topCi]) topCi = i;
  }
  const critName = state.criteria[topCi]?.name ?? "критерию";
  const methodName = state.methods[bestIdx]?.name ?? "методика";
  const localRow = localPriorities[topCi] ?? [];
  let bestLocalMi = 0;
  for (let mi = 1; mi < localRow.length; mi++) {
    if (localRow[mi] > localRow[bestLocalMi]) bestLocalMi = mi;
  }
  if (bestLocalMi === bestIdx) {
    return `Потому что у ученика самый большой дефицит по «${critName}», а «${methodName}» сильнее всего развивает этот критерий (задано в матрице сравнения).`;
  }
  return `С учётом дефицита по «${critName}» и глобальных приоритетов методик.`;
}

function crBadgeHtml(cr, consistent) {
  const cls = consistent ? "cr-ok" : "cr-bad";
  const icon = consistent ? "✅" : "⚠️";
  const text = consistent ? "согласовано" : "противоречия";
  return `<span class="cr-badge ${cls}">${icon} КС ${cr.toFixed(3)} — ${text}</span>`;
}

function renderAnalysisResult(student) {
  migrateAndNormalize(state);
  const critIds = state.criteria.map((c) => c.id);
  const lessons = student.lessons || [];
  const localMatrices = ensureStudentLocalMatrices(student);

  const {
    scores10,
    deficits,
    critW,
    criteriaCR,
    criteriaConsistent,
    localPriorities,
    localCR,
    localConsistent,
    global,
    bestIdx,
  } = runFunctionalScoreAnalysis({
    criterionIds: critIds,
    lessons,
    localMatrices,
  });

  const bestMethod = state.methods[bestIdx];
  const rankedMethods = state.methods
    .map((m, i) => ({ name: m.name, priority: global[i], isBest: i === bestIdx }))
    .sort((a, b) => b.priority - a.priority);

  const gradeListHtml = state.criteria
    .map(
      (c, i) =>
        `<li><strong>${escapeHtml(c.name)}</strong> — ${scores10[i].toFixed(0)} (${tutorGradeComment(scores10[i], deficits[i])})</li>`
    )
    .join("");

  const weightsRows = state.criteria
    .map((c, i) => ({ name: c.name, weight: critW[i] }))
    .sort((a, b) => b.weight - a.weight)
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.name)}</td><td class="analysis-weight-val">${(row.weight * 100).toFixed(0)}%</td></tr>`
    )
    .join("");

  const globalListHtml = rankedMethods
    .map(
      (m, idx) =>
        `<li class="${m.isBest ? "analysis-global-best" : ""}"><strong>${escapeHtml(m.name)}</strong> — ${m.priority.toFixed(2)}${m.isBest ? ' <span class="analysis-rec-badge">✅ рекомендация</span>' : ""}</li>`
    )
    .join("");

  const studentSubtitle = escapeHtml(studentSummaryLine(student));

  const reasonHtml = buildRecommendationReason(bestIdx, deficits, localPriorities);

  const localTableHead = `<tr><th>Методика</th>${state.criteria
    .map((c) => `<th>${escapeHtml(c.name)}</th>`)
    .join("")}</tr>`;
  const localTableBody = state.methods
    .map((m, mi) => {
      const cells = state.criteria
        .map((_, ci) => `<td>${(localPriorities[ci][mi] * 100).toFixed(1)}%</td>`)
        .join("");
      return `<tr><td>${escapeHtml(m.name)}</td>${cells}</tr>`;
    })
    .join("");

  const localCrHtml = state.criteria
    .map((c, i) => `${escapeHtml(c.name)}: ${crBadgeHtml(localCR[i], localConsistent[i])}`)
    .join("<br />");

  let html = `
    <div class="analysis-recommendation">
      <div class="analysis-recommendation-label">Рекомендуемая методика (МАИ)</div>
      <p class="analysis-recommendation-method">${escapeHtml(bestMethod.name)}</p>
      <div class="analysis-recommendation-meta">
        <span class="analysis-meta-chip">Ученик: <strong>${escapeHtml(student.name)}</strong></span>
        <span class="analysis-meta-chip">Приоритет: <strong>${(global[bestIdx] * 100).toFixed(1)}%</strong></span>
      </div>
    </div>

    <div class="analysis-card analysis-practice-report">
      <h3 class="analysis-card-title">Результат анализа</h3>
      <p class="analysis-practice-student">Ученик: <strong>${studentSubtitle}</strong></p>

      <h4 class="analysis-practice-heading">Оценки репетитора:</h4>
      <ul class="analysis-grade-list">${gradeListHtml}</ul>

      <h4 class="analysis-practice-heading">Что рассчитала система:</h4>
      <div class="table-wrap">
        <table class="analysis-weights-table">
          <thead><tr><th>Критерий</th><th>Вес (важность улучшения)</th></tr></thead>
          <tbody>${weightsRows}</tbody>
        </table>
      </div>

      <h4 class="analysis-practice-heading">Глобальные приоритеты методик:</h4>
      <ol class="analysis-global-list">${globalListHtml}</ol>

      <p class="analysis-why"><strong>Почему ${escapeHtml(bestMethod.name)}?</strong> ${reasonHtml}</p>
    </div>

    <div class="analysis-card">
      <h3 class="analysis-card-title">Согласованность (коэффициент КС)</h3>
      <p class="form-hint">Критерии: ${crBadgeHtml(criteriaCR, criteriaConsistent)}</p>
      <p class="diagram-ref">Матрицы методик по критериям:</p>
      <p class="diagram-ref">${localCrHtml}</p>
    </div>

    <div class="analysis-card">
      <h3 class="analysis-card-title">Локальные приоритеты методик</h3>
      <div class="table-wrap">
        <table class="local-priorities-table">
          <thead>${localTableHead}</thead>
          <tbody>${localTableBody}</tbody>
        </table>
      </div>
    </div>`;

  const host = document.getElementById("analysis-result");
  setAnalysisEmptyVisible(false);
  host.classList.remove("hidden");
  host.innerHTML = html;
  destroyAnalysisRadarChart();
}

document.getElementById("btn-run-analysis").addEventListener("click", () => {
  const sid = document.getElementById("analysis-student").value;
  const student = state.students.find((x) => x.id === sid);
  if (!student) {
    destroyAnalysisRadarChart();
    setAnalysisEmptyVisible(false);
    const host = document.getElementById("analysis-result");
    host.classList.remove("hidden");
    host.innerHTML = '<p class="msg error analysis-alert">Выберите ученика из списка.</p>';
    return;
  }
  if (!student.lessons?.length) {
    destroyAnalysisRadarChart();
    setAnalysisEmptyVisible(false);
    const host = document.getElementById("analysis-result");
    host.classList.remove("hidden");
    host.innerHTML =
      '<p class="msg error analysis-alert">Нет данных уроков. <a href="#" id="analysis-goto-student">Открыть карточку ученика</a> и добавить оценки.</p>';
    document.getElementById("analysis-goto-student")?.addEventListener("click", (e) => {
      e.preventDefault();
      openStudent(student.id);
    });
    return;
  }
  renderAnalysisResult(student);
});

function renderSettings() {
  if (!isMethodist()) return;
  migrateAndNormalize(state);
  const critList = document.getElementById("criteria-list");
  const methList = document.getElementById("methods-list");
  critList.innerHTML = "";
  methList.innerHTML = "";

  state.criteria.forEach((c, ci) => {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = `
      <input type="text" data-ci="${ci}" class="crit-name" value="${escapeHtml(c.name)}" />
      <button type="button" class="btn btn-danger btn-rm-crit" data-ci="${ci}" ${state.criteria.length <= 1 ? "disabled" : ""}>Удалить</button>
    `;
    critList.appendChild(row);
  });

  critList.querySelectorAll(".crit-name").forEach((inp) => {
    inp.addEventListener("change", async () => {
      const ci = parseInt(inp.getAttribute("data-ci"), 10);
      state.criteria[ci].name = inp.value.trim() || state.criteria[ci].name;
      await persist();
    });
  });
  critList.querySelectorAll(".btn-rm-crit").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (state.criteria.length <= 1) return;
      const ci = parseInt(btn.getAttribute("data-ci"), 10);
      const removedId = state.criteria[ci]?.id;
      syncAllStudentsMatrices((st) => st.localMatrices.splice(ci, 1));
      state.criteria.splice(ci, 1);
      if (removedId) purgeCriterionFromLessons(removedId);
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
    });
  });
  methList.querySelectorAll(".btn-rm-meth").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (state.methods.length <= 2) return;
      const mi = parseInt(btn.getAttribute("data-mi"), 10);
      syncAllStudentsMatrices((st) => {
        st.localMatrices = st.localMatrices.map((mat) => removeMethodFromMatrix(mat, mi));
      });
      state.methods.splice(mi, 1);
      await persist();
      renderSettings();
    });
  });
}

function methodMatrixLabel(idx) {
  return `М${idx + 1}`;
}

function isMatrixAllOnes(matrix) {
  const m = matrix.length;
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      if (Math.abs(getPairwiseValue(matrix, i, j) - 1) > 0.01) return false;
    }
  }
  return true;
}

function renderStudentPairwiseMatrices(student) {
  const host = document.getElementById("student-pairwise-matrices");
  if (!host) return;
  const matrices = ensureStudentLocalMatrices(student);
  renderPairwiseMatricesUI(host, matrices, persist);
}

function renderPairwiseMatricesUI(host, matrices, onChange) {
  if (!host) return;
  const m = state.methods.length;
  host.innerHTML = "";

  if (m < 2) {
    host.innerHTML = '<p class="diagram-ref">Добавьте минимум 2 методики в разделе «Правила».</p>';
    return;
  }

  state.criteria.forEach((c, ci) => {
    const matrix = matrices[ci];
    const block = document.createElement("div");
    block.className = "pairwise-criterion-block";

    const title = document.createElement("h4");
    title.className = "pairwise-criterion-title";
    title.textContent = `Матрица для критерия «${c.name}»`;
    block.appendChild(title);

    const legend = document.createElement("div");
    legend.className = "pairwise-method-legend";
    state.methods.forEach((meth, mi) => {
      const chip = document.createElement("span");
      chip.className = "pairwise-legend-chip";
      chip.title = meth.name;
      chip.innerHTML = `<strong>${escapeHtml(methodMatrixLabel(mi))}</strong> — ${escapeHtml(meth.name)}`;
      legend.appendChild(chip);
    });
    block.appendChild(legend);

    const defaultNote = document.createElement("p");
    defaultNote.className = "pairwise-default-note";
    defaultNote.textContent =
      "Сейчас все методики равны (1). Измените ячейки выше диагонали — иначе в анализе у каждой будет одинаковый приоритет.";
    defaultNote.hidden = !isMatrixAllOnes(matrix);
    block.appendChild(defaultNote);

    const matrixWrap = document.createElement("div");
    matrixWrap.className = "table-wrap pairwise-matrix-wrap";
    const grid = document.createElement("table");
    grid.className = "pairwise-matrix-grid";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.className = "pairwise-matrix-corner";
    corner.innerHTML =
      '<span class="pairwise-corner-top">столбец →</span><span class="pairwise-corner-bottom">строка ↓ важнее</span>';
    headRow.appendChild(corner);

    state.methods.forEach((meth, mi) => {
      const th = document.createElement("th");
      th.className = "pairwise-matrix-col-head";
      th.title = meth.name;
      th.innerHTML = `<span class="pairwise-matrix-label">${escapeHtml(methodMatrixLabel(mi))}</span>`;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    grid.appendChild(thead);

    const hintBar = document.createElement("p");
    hintBar.className = "pairwise-active-hint";
    hintBar.textContent = "Наведите на ячейку или выберите значение — здесь появится пояснение.";

    const tbody = document.createElement("tbody");
    for (let i = 0; i < m; i++) {
      const tr = document.createElement("tr");
      const rowTh = document.createElement("th");
      rowTh.scope = "row";
      rowTh.className = "pairwise-matrix-row-head";
      rowTh.title = state.methods[i].name;
      rowTh.innerHTML = `<span class="pairwise-matrix-label">${escapeHtml(methodMatrixLabel(i))}</span>`;
      tr.appendChild(rowTh);

      for (let j = 0; j < m; j++) {
        const td = document.createElement("td");
        td.className = "pairwise-matrix-cell";
        td.dataset.i = String(i);
        td.dataset.j = String(j);

        if (i === j) {
          td.classList.add("pairwise-matrix-diag");
          td.textContent = "1";
        } else if (i < j) {
          const left = state.methods[i].name;
          const right = state.methods[j].name;
          td.classList.add("pairwise-matrix-editable");

          const sel = document.createElement("select");
          sel.className = "pairwise-matrix-select";
          sel.setAttribute(
            "aria-label",
            `${methodMatrixLabel(i)} (${left}) важнее ${methodMatrixLabel(j)} (${right})`
          );
          SAATY_VALUES.forEach((v) => {
            const o = document.createElement("option");
            o.value = formatSaatyValue(v);
            o.textContent = formatSaatyValue(v);
            sel.appendChild(o);
          });
          const current = getPairwiseValue(matrix, i, j);
          sel.value = formatSaatyValue(current);

          const showHint = () => {
            hintBar.textContent = saatyComparisonHint(parseSaatyValue(sel.value), left, right);
          };

          sel.addEventListener("focus", showHint);
          sel.addEventListener("mouseenter", showHint);
          sel.addEventListener("change", async () => {
            const v = parseSaatyValue(sel.value);
            setPairwiseValue(matrix, i, j, v);
            const recip = grid.querySelector(`td[data-i="${j}"][data-j="${i}"]`);
            if (recip) recip.textContent = formatSaatyValue(matrix[j][i]);
            showHint();
            defaultNote.hidden = !isMatrixAllOnes(matrix);
            await onChange();
          });

          td.appendChild(sel);
        } else {
          td.classList.add("pairwise-matrix-reciprocal");
          td.title = "Считается автоматически";
          td.textContent = formatSaatyValue(matrix[i][j]);
        }

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    grid.appendChild(tbody);
    matrixWrap.appendChild(grid);
    block.appendChild(matrixWrap);

    const footnote = document.createElement("p");
    footnote.className = "pairwise-matrix-footnote";
    footnote.textContent =
      "Заполняйте только ячейки выше диагонали (белые). Ниже диагонали — обратные значения, они обновляются сами.";
    block.appendChild(footnote);
    block.appendChild(hintBar);

    host.appendChild(block);
  });
}

function renderPairwiseMatricesInto(host, matrices, onChange) {
  renderPairwiseMatricesUI(host, matrices, onChange);
}

document.getElementById("btn-add-criterion").addEventListener("click", async () => {
  const m = state.methods.length;
  syncAllStudentsMatrices((st) => st.localMatrices.push(createOnesMatrix(m)));
  state.criteria.push({ id: uid(), name: "Новый критерий" });
  await persist();
  renderSettings();
});

document.getElementById("btn-add-method").addEventListener("click", async () => {
  const oldM = state.methods.length;
  syncAllStudentsMatrices((st) => {
    st.localMatrices = resizeLocalMatrices(st.localMatrices, oldM, oldM + 1);
  });
  state.methods.push({ id: uid(), name: "Новая методика" });
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
        },
        null,
        2
      ),
    ],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "nastroiki-pravil.json";
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
      if (o.localMatrices) state.localMatrices = o.localMatrices;
      migrateAndNormalize(state);
      await persist();
      renderSettings();
    } catch (err) {
      alert("Ошибка загрузки файла: " + err.message);
    }
  };
  r.readAsText(f);
  e.target.value = "";
});

(async function init() {
  if (await bootstrapSession()) {
    setUserDisplay(sessionStorage.getItem("ahp_login") || "");
    uiState.dashboardDate = todayYmd();
    showApp(defaultViewForRole());
    renderStudents();
  } else {
    showAuth();
  }
})();
