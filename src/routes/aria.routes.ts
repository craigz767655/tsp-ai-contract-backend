import { Router } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db";
import { contracts, contractVersions } from "../db/schema";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler, badRequest, HttpError } from "../lib/errors";
import { ariaChat } from "../services/aria";
import { hasAnyAiProvider } from "../lib/env";

export const ariaRouter = Router();
ariaRouter.use(requireAuth);

// POST /api/aria/chat  { question, contractId? }
// If contractId is given, Aria answers grounded in that contract's latest text.
ariaRouter.post("/chat", asyncHandler(async (req, res) => {
  if (!hasAnyAiProvider()) throw new HttpError(503, "AI is not configured.");
  const { question, contractId } = req.body || {};
  if (!question || String(question).trim().length < 2) throw badRequest("question is required");

  let context: string | undefined;
  if (contractId) {
    const [v] = await db.select({ text: contractVersions.extractedText })
      .from(contractVersions)
      .where(and(eq(contractVersions.contractId, contractId), eq(contractVersions.orgId, req.auth!.orgId)))
      .orderBy(desc(contractVersions.versionNumber)).limit(1);
    context = v?.text || undefined;
  }
  const answer = await ariaChat(String(question), context);
  res.json({ answer });
}));
