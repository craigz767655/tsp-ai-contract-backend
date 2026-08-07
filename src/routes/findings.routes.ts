import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { findings } from "../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { audit } from "../lib/audit";

export const findingsRouter = Router();
findingsRouter.use(requireAuth);

// GET /api/findings?versionId=...  — all findings (clauses, missing, redlines)
// for a specific contract version, so the UI can show redlines per version.
findingsRouter.get("/", asyncHandler(async (req, res) => {
  const versionId = req.query.versionId as string | undefined;
  if (!versionId) throw badRequest("versionId query param is required");
  const rows = await db.select().from(findings)
    .where(and(eq(findings.versionId, versionId), eq(findings.orgId, req.auth!.orgId)))
    .orderBy(findings.position);
  res.json(rows);
}));

// PATCH /api/findings/:id  — accept or reject a finding (used for redlines).
// Body: { status: "open" | "accepted" | "rejected" }
findingsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const status = req.body?.status;
  if (!["open", "accepted", "rejected"].includes(status)) {
    throw badRequest("status must be one of: open, accepted, rejected");
  }
  const [row] = await db.update(findings)
    .set({ status })
    .where(and(eq(findings.id, req.params.id), eq(findings.orgId, req.auth!.orgId)))
    .returning();
  if (!row) throw notFound("Finding not found");
  await audit({
    orgId: req.auth!.orgId, userId: req.auth!.userId,
    action: `redline_${status}`, entityType: "finding", entityId: row.id,
  });
  res.json(row);
}));
