import { Router } from "express";
import { pool } from "../db";
import { hasAnyAiProvider } from "../lib/env";

export const healthRouter = Router();

// Liveness + readiness. Render pings this; also handy for uptime checks.
healthRouter.get("/", async (_req, res) => {
  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    db: dbOk,
    ai: hasAnyAiProvider(),
    time: new Date().toISOString(),
  });
});
