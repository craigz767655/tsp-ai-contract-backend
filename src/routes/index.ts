import type { Express } from "express";
import { healthRouter } from "./health.routes";
import { authRouter } from "./auth.routes";
import { clientsRouter } from "./clients.routes";
import { contractsRouter } from "./contracts.routes";
import { analyzeRouter } from "./analyze.routes";
import { ariaRouter } from "./aria.routes";
import { clausesRouter } from "./clauses.routes";
import { findingsRouter } from "./findings.routes";

export function registerRoutes(app: Express) {
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/contracts", contractsRouter);
  app.use("/api/analyze", analyzeRouter);
  app.use("/api/aria", ariaRouter);
  app.use("/api/clauses", clausesRouter);
  app.use("/api/findings", findingsRouter);
}
