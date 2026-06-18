import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createUser,
  getUserPayloadForClient,
  getUserRecord,
  getPasswordHash,
  saveUserPayload,
} from "./server/store.js";
import { getDb, closeDb } from "./server/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const PORT_ATTEMPTS = 30;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

const app = express();
app.use(express.json({ limit: "2mb" }));

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Требуется авторизация" });
  }
  try {
    const token = h.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    const login = payload.sub;
    if (!login || typeof login !== "string") {
      return res.status(401).json({ error: "Недействительная сессия" });
    }
    req.login = login;
    req.userRole = payload.role || null;
    next();
  } catch {
    return res.status(401).json({ error: "Сессия недействительна" });
  }
}

function signToken(login, role) {
  return jwt.sign({ sub: login, role }, JWT_SECRET, { expiresIn: "7d" });
}

app.post("/api/auth/register", (req, res) => {
  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "");
  const role = String(req.body?.role ?? "methodist").trim();
  const methodistLogin = String(req.body?.methodistLogin ?? "").trim();
  if (login.length < 2 || password.length < 4) {
    return res.status(400).json({ error: "Учётное имя от 2 символов, пароль от 4." });
  }
  if (role !== "methodist" && role !== "tutor") {
    return res.status(400).json({ error: "Выберите роль: методист или репетитор." });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const created = createUser(login, passwordHash, role, methodistLogin || null);
  if (!created.ok) {
    return res.status(409).json({ error: created.error || "Не удалось создать учётную запись." });
  }
  const user = getUserRecord(login);
  const token = signToken(login, user?.role || role);
  res.json({ token, login, role: user?.role || role, methodistLogin: user?.methodist_login || null });
});

app.post("/api/auth/login", (req, res) => {
  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (login.length < 2) {
    return res.status(400).json({ error: "Введите учётное имя." });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: "Введите пароль." });
  }
  const hash = getPasswordHash(login);
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: "Неверное учётное имя или пароль." });
  }
  const user = getUserRecord(login);
  if (!user) {
    return res.status(401).json({ error: "Пользователь не найден." });
  }
  const role = user.role === "tutor" ? "tutor" : "methodist";
  const token = signToken(login, role);
  res.json({
    token,
    login,
    role,
    methodistLogin: user.methodist_login || null,
  });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const data = getUserPayloadForClient(req.login);
  if (!data) {
    return res.status(404).json({ error: "Пользователь не найден" });
  }
  res.json(data);
});

app.put("/api/me", authMiddleware, (req, res) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Неверное тело запроса" });
  }
  const { criteria, methods, criteriaImportance, methodScores, localMatrices, students } = body;
  if (!Array.isArray(criteria) || !Array.isArray(methods) || !Array.isArray(students)) {
    return res.status(400).json({ error: "Ожидаются массивы: критерии, методики, ученики." });
  }
  if (!Array.isArray(criteriaImportance) || !Array.isArray(methodScores)) {
    return res.status(400).json({ error: "Неверный формат данных профиля." });
  }
  const payload = { criteria, methods, criteriaImportance, methodScores, students };
  if (Array.isArray(localMatrices)) payload.localMatrices = localMatrices;
  const ok = saveUserPayload(req.login, payload);
  if (!ok) {
    return res.status(500).json({ error: "Не удалось сохранить" });
  }
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/vendor/chart.js", express.static(path.join(__dirname, "node_modules", "chart.js")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function startServer(port, attempt = 0) {
  getDb();
  const server = http.createServer(app);
  server.once("error", (err) => {
    if (err.code === "EADDRINUSE" && attempt < PORT_ATTEMPTS) {
      console.warn(`Порт ${port} занят, пробую ${port + 1}…`);
      startServer(port + 1, attempt + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
  server.listen(port, () => {
    server.removeAllListeners("error");
    server.on("error", (e) => console.error("Ошибка сервера:", e));
    console.log(`Сервер: http://localhost:${port}`);
    console.log(`База данных: SQLite (data/app.db)`);
  });
}

process.on("SIGINT", () => {
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDb();
  process.exit(0);
});

startServer(DEFAULT_PORT);
