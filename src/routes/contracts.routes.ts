import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import {
  contracts, contractVersions, findings, clients,
  insertContractSchema, DOC_TYPES,
} from "../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler, badRequest, notFound } from "../lib/errors";
import { audit } from "../lib/audit";

export const contractsRouter = Router();
contractsRouter.use(requireAuth);

// Guard: a contract's parent must exist, be in the same org, and linking must
// not create a cycle (walk the proposed parent chain up to the root).
async function assertValidParent(orgId: string, childId: string | null, parentId: string | null) {
  if (!parentId) return;
  if (parentId === childId) throw badRequest("A contract cannot be its own parent");
  let cursor: string | null = parentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === childId) throw badRequest("Parent link would create a cycle");
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const [p]: any = await db.select({ id: contracts.id, parentId: contracts.parentId })
      .from(contracts).where(and(eq(contracts.id, cursor), eq(contracts.orgId, orgId))).limit(1);
    if (!p) throw badRequest("Parent contract not found in this org");
    cursor = p.parentId;
  }
}

// List contracts (optionally filter by clientId or parentId).
contractsRouter.get("/", asyncHandler(async (req, res) => {
  const conds = [eq(contracts.orgId, req.auth!.orgId)];
  if (req.query.clientId) conds.push(eq(contracts.clientId, String(req.query.clientId)));
  const rows = await db.select().from(contracts).where(and(...conds)).orderBy(desc(contracts.updatedAt));
  res.json(rows);
}));

// Family tree: a root contract plus its descendants (MSA -> SOWs / amendments).
contractsRouter.get("/:id/family", asyncHandler(async (req, res) => {
  const orgId = req.auth!.orgId;
  const [root] = await db.select().from(contracts)
    .where(and(eq(contracts.id, req.params.id), eq(contracts.orgId, orgId))).limit(1);
  if (!root) throw notFound("Contract not found");
  const all = await db.select().from(contracts).where(eq(contracts.orgId, orgId));
  const byParent = new Map<string | null, typeof all>();
  for (const c of all) {
    const key = c.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, [] as any);
    (byParent.get(key) as any).push(c);
  }
  const build = (node: any): any => ({ ...node, children: (byParent.get(node.id) || []).map(build) });
  res.json(build(root));
}));

contractsRouter.get("/:id", asyncHandler(async (req, res) => {
  const orgId = req.auth!.orgId;
  const [contract] = await db.select().from(contracts)
    .where(and(eq(contracts.id, req.params.id), eq(contracts.orgId, orgId))).limit(1);
  if (!contract) throw notFound("Contract not found");
  const versions = await db.select().from(contractVersions)
    .where(and(eq(contractVersions.contractId, contract.id), eq(contractVersions.orgId, orgId)))
    .orderBy(desc(contractVersions.versionNumber));
  const latest = versions[0];
  const latestFindings = latest
    ? await db.select().from(findings)
        .where(and(eq(findings.versionId, latest.id), eq(findings.orgId, orgId)))
        .orderBy(findings.position)
    : [];
  res.json({ contract, versions, findings: latestFindings });
}));

contractsRouter.post("/", asyncHandler(async (req, res) => {
  const parsed = insertContractSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message || "Invalid contract");
  const data = parsed.data;
  if (data.docType && !(DOC_TYPES as readonly string[]).includes(data.docType)) {
    throw badRequest(`docType must be one of: ${DOC_TYPES.join(", ")}`);
  }
  // validate client belongs to org
  const [client] = await db.select({ id: clients.id }).from(clients)
    .where(and(eq(clients.id, data.clientId), eq(clients.orgId, req.auth!.orgId))).limit(1);
  if (!client) throw badRequest("clientId not found in this org");
  await assertValidParent(req.auth!.orgId, null, data.parentId ?? null);

  const [row] = await db.insert(contracts).values({
    ...data, orgId: req.auth!.orgId, createdBy: req.auth!.userId,
  }).returning();
  await audit({ orgId: req.auth!.orgId, userId: req.auth!.userId, action: "create", entityType: "contract", entityId: row.id });
  res.status(201).json(row);
}));

contractsRouter.patch("/:id", asyncHandler(async (req, res) => {
  const parsed = insertContractSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid contract update");
  if (parsed.data.parentId !== undefined) {
    await assertValidParent(req.auth!.orgId, req.params.id, parsed.data.parentId ?? null);
  }
  const [row] = await db.update(contracts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(contracts.id, req.params.id), eq(contracts.orgId, req.auth!.orgId)))
    .returning();
  if (!row) throw notFound("Contract not found");
  await audit({ orgId: req.auth!.orgId, userId: req.auth!.userId, action: "update", entityType: "contract", entityId: row.id });
  res.json(row);
}));

contractsRouter.delete("/:id", asyncHandler(async (req, res) => {
  const [row] = await db.delete(contracts)
    .where(and(eq(contracts.id, req.params.id), eq(contracts.orgId, req.auth!.orgId)))
    .returning();
  if (!row) throw notFound("Contract not found");
  await audit({ orgId: req.auth!.orgId, userId: req.auth!.userId, action: "delete", entityType: "contract", entityId: row.id });
  res.json({ ok: true });
}));
