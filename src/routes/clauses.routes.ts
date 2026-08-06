import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import { clauseLibrary, insertClauseLibrarySchema } from "../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler, badRequest, notFound } from "../lib/errors";

export const clausesRouter = Router();
clausesRouter.use(requireAuth);

// Firm clause library / playbook — org-scoped standard positions Aria can flag against.
clausesRouter.get("/", asyncHandler(async (req, res) => {
  const rows = await db.select().from(clauseLibrary)
    .where(eq(clauseLibrary.orgId, req.auth!.orgId)).orderBy(desc(clauseLibrary.createdAt));
  res.json(rows);
}));

clausesRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = insertClauseLibrarySchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message || "Invalid clause");
  const [row] = await db.insert(clauseLibrary).values({
    ...parsed.data, orgId: req.auth!.orgId, createdBy: req.auth!.userId,
  }).returning();
  res.status(201).json(row);
}));

clausesRouter.delete("/:id", asyncHandler(async (req, res) => {
  const [row] = await db.delete(clauseLibrary)
    .where(and(eq(clauseLibrary.id, req.params.id), eq(clauseLibrary.orgId, req.auth!.orgId)))
    .returning();
  if (!row) throw notFound("Clause not found");
  res.json({ ok: true });
}));
