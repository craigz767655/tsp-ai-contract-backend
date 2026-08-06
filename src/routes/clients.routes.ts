import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import { clients, insertClientSchema } from "../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { audit } from "../lib/audit";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

// List clients for the caller's org (org scoping enforced server-side).
clientsRouter.get("/", asyncHandler(async (req, res) => {
  const rows = await db.select().from(clients)
    .where(eq(clients.orgId, req.auth!.orgId))
    .orderBy(desc(clients.createdAt));
  res.json(rows);
}));

clientsRouter.get("/:id", asyncHandler(async (req, res) => {
  const [row] = await db.select().from(clients)
    .where(and(eq(clients.id, req.params.id), eq(clients.orgId, req.auth!.orgId))).limit(1);
  if (!row) throw notFound("Client not found");
  res.json(row);
}));

clientsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = insertClientSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message || "Invalid client");
  const [row] = await db.insert(clients).values({
    ...parsed.data, orgId: req.auth!.orgId, createdBy: req.auth!.userId,
  }).returning();
  await audit({ orgId: req.auth!.orgId, userId: req.auth!.userId, action: "create", entityType: "client", entityId: row.id });
  res.status(201).json(row);
}));

clientsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = insertClientSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid client update");
  const [row] = await db.update(clients)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(clients.id, req.params.id), eq(clients.orgId, req.auth!.orgId)))
    .returning();
  if (!row) throw notFound("Client not found");
  res.json(row);
}));

clientsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const [row] = await db.delete(clients)
    .where(and(eq(clients.id, req.params.id), eq(clients.orgId, req.auth!.orgId)))
    .returning();
  if (!row) throw notFound("Client not found");
  await audit({ orgId: req.auth!.orgId, userId: req.auth!.userId, action: "delete", entityType: "client", entityId: row.id });
  res.json({ ok: true });
}));
