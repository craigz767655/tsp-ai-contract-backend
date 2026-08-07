import { Router } from "express";
import multer from "multer";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import { contracts, contractVersions, findings, clients } from "../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler, badRequest, notFound, HttpError } from "../lib/errors";
import { extractText } from "../services/extract";
import { analyzeContract, type ContractAnalysis } from "../services/aria";
import { audit } from "../lib/audit";
import { hasAnyAiProvider } from "../lib/env";

export const analyzeRouter = Router();
analyzeRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB, matches the UI cap
});

// Persist a completed analysis as a new contract version + findings, and roll
// the contract's headline risk/status forward. Shared by file + text paths.
async function persistAnalysis(opts: {
  orgId: string; userId: string; contractId: string;
  fileName: string; mimeType: string; fileSize: number;
  extractedText: string; changeNote?: string; analysis: ContractAnalysis;
}) {
  const { orgId, userId, contractId } = opts;

  const [last] = await db.select({ v: contractVersions.versionNumber })
    .from(contractVersions)
    .where(and(eq(contractVersions.contractId, contractId), eq(contractVersions.orgId, orgId)))
    .orderBy(desc(contractVersions.versionNumber)).limit(1);
  const versionNumber = (last?.v ?? 0) + 1;

  const [version] = await db.insert(contractVersions).values({
    orgId, contractId, versionNumber,
    fileName: opts.fileName, mimeType: opts.mimeType, fileSize: opts.fileSize,
    extractedText: opts.extractedText, changeNote: opts.changeNote,
    source: "upload", aiRiskScore: opts.analysis.riskScore,
    aiModelUsed: opts.analysis.modelUsed, uploadedBy: userId,
  }).returning();

  const rows: any[] = [];
  opts.analysis.clauses.forEach((c, i) => rows.push({
    orgId, contractId, versionId: version.id, kind: "clause",
    clauseType: c.clauseType, heading: c.heading, excerpt: c.text,
    severity: c.severity, riskScore: c.riskScore, summary: c.aiSummary, position: i,
  }));
  opts.analysis.missingClauses.forEach((m, i) => rows.push({
    orgId, contractId, versionId: version.id, kind: "missing",
    clauseType: m.clauseType, severity: m.severity as any, summary: m.reason,
    position: 1000 + i,
  }));
  opts.analysis.redlines.forEach((r, i) => rows.push({
    orgId, contractId, versionId: version.id, kind: "redline",
    clauseType: "Other", severity: r.severity as any, original: r.original,
    suggested: r.suggested, recommendation: r.reason, position: 2000 + i,
  }));
  if (rows.length) await db.insert(findings).values(rows);

  await db.update(contracts).set({
    currentVersionId: version.id, riskScore: opts.analysis.riskScore,
    reviewStatus: "needs_review", updatedAt: new Date(),
  }).where(and(eq(contracts.id, contractId), eq(contracts.orgId, orgId)));

  await audit({ orgId, userId, action: "analyze", entityType: "contract", entityId: contractId,
    metadata: { versionNumber, riskScore: opts.analysis.riskScore, model: opts.analysis.modelUsed } });

  return version;
}

// If this contract has a parent MSA, fetch the parent's type + latest text so
// Aria can score the child (SOW / Change Order) in the context of the master.
async function getParentContext(orgId: string, contractId: string) {
  const [c] = await db.select({ parentId: contracts.parentId }).from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.orgId, orgId))).limit(1);
  if (!c?.parentId) return undefined;
  const [p] = await db.select({ docType: contracts.docType }).from(contracts)
    .where(and(eq(contracts.id, c.parentId), eq(contracts.orgId, orgId))).limit(1);
  const [pv] = await db.select({ text: contractVersions.extractedText }).from(contractVersions)
    .where(and(eq(contractVersions.contractId, c.parentId), eq(contractVersions.orgId, orgId)))
    .orderBy(desc(contractVersions.versionNumber)).limit(1);
  if (!pv?.text) return undefined;
  return { docType: p?.docType, text: pv.text };
}

// POST /api/analyze  (multipart/form-data)
// Fields: clientId, name, docType, parentId?, changeNote?, contractId? + file
analyzeRouter.post("/", upload.single("file"), asyncHandler(async (req, res) => {
  if (!hasAnyAiProvider()) throw new HttpError(503, "AI is not configured. Set OPENAI_API_KEY or GEMINI_API_KEY.");
  const orgId = req.auth!.orgId, userId = req.auth!.userId;
  const file = req.file;
  if (!file) throw badRequest("A contract file is required");

  const text = await extractText(file.buffer, file.mimetype, file.originalname);
  if (!text || text.length < 20) throw badRequest("Could not extract readable text from the file");

  // Existing contract (new version) or create a new one.
  let contractId = req.body.contractId as string | undefined;
  if (contractId) {
    const [c] = await db.select({ id: contracts.id }).from(contracts)
      .where(and(eq(contracts.id, contractId), eq(contracts.orgId, orgId))).limit(1);
    if (!c) throw notFound("Contract not found");
  } else {
    const clientId = req.body.clientId as string;
    if (!clientId) throw badRequest("clientId is required for a new contract");
    const [client] = await db.select({ id: clients.id }).from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId))).limit(1);
    if (!client) throw badRequest("clientId not found in this org");
    const [created] = await db.insert(contracts).values({
      orgId, clientId, createdBy: userId,
      name: (req.body.name as string) || file.originalname,
      docType: (req.body.docType as string) || "MSA",
      parentId: (req.body.parentId as string) || null,
      reviewStatus: "ai_processing",
    }).returning();
    contractId = created.id;
  }

  const parent = await getParentContext(orgId, contractId!);
  const analysis = await analyzeContract(text, parent);
  const version = await persistAnalysis({
    orgId, userId, contractId: contractId!,
    fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size,
    extractedText: text, changeNote: req.body.changeNote, analysis,
  });

  res.status(201).json({ contractId, version, analysis });
}));

// POST /api/analyze/text  — analyze pasted text into an existing contract.
analyzeRouter.post("/text", asyncHandler(async (req, res) => {
  if (!hasAnyAiProvider()) throw new HttpError(503, "AI is not configured.");
  const { contractId, text, changeNote } = req.body || {};
  if (!contractId || !text || String(text).length < 20) throw badRequest("contractId and text are required");
  const orgId = req.auth!.orgId, userId = req.auth!.userId;
  const [c] = await db.select({ id: contracts.id }).from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.orgId, orgId))).limit(1);
  if (!c) throw notFound("Contract not found");
  const analysis = await analyzeContract(String(text));
  const version = await persistAnalysis({
    orgId, userId, contractId, fileName: "pasted-text.txt", mimeType: "text/plain",
    fileSize: Buffer.byteLength(String(text)), extractedText: String(text), changeNote, analysis,
  });
  res.status(201).json({ contractId, version, analysis });
}));
