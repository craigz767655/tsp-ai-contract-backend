// Fire-and-forget audit logging. Every meaningful mutation is recorded for the
// contract audit trail (essential for legal work). Failures here never break
// the request.
import { db } from "../db";
import { auditLogs } from "../db/schema";
import { logError } from "./logger";

export async function audit(params: {
  orgId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      orgId: params.orgId,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (e) {
    logError("audit insert failed", e, "audit");
  }
}
