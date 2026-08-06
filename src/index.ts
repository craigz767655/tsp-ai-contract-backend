// ─────────────────────────────────────────────────────────────────────────────
// TSP AI Contract — API server bootstrap.
// Pure API (no frontend). The Lovable frontend calls these endpoints over CORS.
// Render-ready: no Replit dependencies, binds 0.0.0.0:$PORT.
// ─────────────────────────────────────────────────────────────────────────────
import express, { type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import { env } from "./lib/env";
import { log, logError } from "./lib/logger";
import { HttpError } from "./lib/errors";
import { registerRoutes } from "./routes";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // Render terminates TLS at a proxy; needed for secure cookies

// ── CORS (credentialed) — only the configured Lovable/frontend origins ───────
const allowed = new Set(env.allowedOrigins);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));

// ── Request logging (never logs bodies of sensitive routes) ──────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  next();
});

registerRoutes(app);

// 404 for unknown API routes
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// ── Central error handler — converts thrown errors to clean JSON ─────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === "entity.too.large" || err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large (max 20MB)" });
  }
  logError("unhandled", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, "0.0.0.0", () => {
  log(`TSP AI Contract API listening on :${env.port} (${env.nodeEnv})`);
});

// Safety nets so a stray rejection never silently kills the server.
process.on("unhandledRejection", (r) => logError("unhandledRejection", r));
process.on("uncaughtException", (e) => logError("uncaughtException", e));
