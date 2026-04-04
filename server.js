import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createUser,
  getUserPayload,
  getPasswordHash,
  saveUserPayload,
} from "./server/store.js";

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
      return res.status(401).json({ error: "Неверный токен" });
    }
    req.login = login;
    next();
  } catch {
    return res.status(401).json({ error: "Сессия недействительна" });
  }
}

function signToken(login) {
  return jwt.sign({ sub: login }, JWT_SECRET, { expiresIn: "7d" });
}

app.post("/api/auth/register", (req, res) => {
  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (login.length < 2 || password.length < 4) {
    return res.status(400).json({ error: "Логин от 2 символов, пароль от 4." });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const ok = createUser(login, passwordHash);
  if (!ok) {
    return res.status(409).json({ error: "Такой логин уже занят." });
  }
  const token = signToken(login);
  res.json({ token, login });
});

app.post("/api/auth/login", (req, res) => {
  const login = String(req.body?.login ?? "").trim();
  const password = String(req.body?.password ?? "");
  const hash = getPasswordHash(login);
  if (!hash || !bcrypt.compareSync(password, hash)) {
    return res.status(401).json({ error: "Неверный логин или пароль." });
  }
  const token = signToken(login);
  res.json({ token, login });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const data = getUserPayload(req.login);
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
  const { criteria, methods, criteriaImportance, methodScores, students } = body;
  if (!Array.isArray(criteria) || !Array.isArray(methods) || !Array.isArray(students)) {
    return res.status(400).json({ error: "Ожидаются criteria, methods, students (массивы)" });
  }
  if (!Array.isArray(criteriaImportance) || !Array.isArray(methodScores)) {
    return res.status(400).json({ error: "Ожидаются criteriaImportance и methodScores" });
  }
  const ok = saveUserPayload(req.login, {
    criteria,
    methods,
    criteriaImportance,
    methodScores,
    students,
  });
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
  });
}

startServer(DEFAULT_PORT);
