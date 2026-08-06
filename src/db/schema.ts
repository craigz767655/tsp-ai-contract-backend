// ─────────────────────────────────────────────────────────────────────────────
// TSP AI Contract — unified data model (Drizzle + Postgres)
//
// One coherent model, replacing the POC's three competing contract systems.
// Multi-tenant by org. Contract families use a self-referencing parent_id so an
// SOW/Change Order/Amendment links up to its master MSA (matches the upload UI).
// ─────────────────────────────────────────────────────────────────────────────
import { sql } from "drizzle-orm";
import {
  pgTable, text, integer, timestamp, jsonb, boolean, uuid, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Orgs (tenants) ───────────────────────────────────────────────────────────
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("trial"),
  branding: jsonb("branding").$type<{
    displayName?: string;
    primaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"), // owner | admin | member | viewer
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
}, (t) => ({
  emailOrgIdx: uniqueIndex("users_email_org_idx").on(t.email, t.orgId),
}));

// ── Clients (the customer whose contracts we review) ─────────────────────────
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  legalEntityName: text("legal_entity_name"),
  industry: text("industry"),
  jurisdiction: text("jurisdiction").notNull().default("US"),
  status: text("status").notNull().default("active"), // active | inactive | prospect
  primaryContact: text("primary_contact"),
  primaryEmail: text("primary_email"),
  riskLevel: text("risk_level").notNull().default("medium"), // low | medium | high
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({ orgIdx: index("clients_org_idx").on(t.orgId) }));

// ── Contracts (with MSA/SOW family hierarchy) ────────────────────────────────
// parentId self-references this table. NULL = root (e.g. an MSA or standalone
// review). An SOW / Change Order / Amendment points to its parent MSA so risk
// and terms roll up through the family. Cycle prevention is enforced in routes.
export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"), // self-ref (contracts.id); NULL for root/standalone
  name: text("name").notNull(),
  docType: text("doc_type").notNull().default("MSA"), // MSA | SOW | ChangeOrder | Amendment | NDA | OrderForm | DPA | Other
  jurisdiction: text("jurisdiction").notNull().default("US"),
  governingLaw: text("governing_law"),
  lifecycleStatus: text("lifecycle_status").notNull().default("Draft"), // Draft | InReview | Approved | Executed | Expired | Superseded
  reviewStatus: text("review_status").notNull().default("uploaded"), // uploaded | ai_processing | needs_review | reviewed | approved | rejected
  effectiveDate: timestamp("effective_date"),
  expirationDate: timestamp("expiration_date"),
  riskScore: integer("risk_score"), // 0..100, from latest analysis
  currentVersionId: uuid("current_version_id"),
  assignedReviewer: uuid("assigned_reviewer").references(() => users.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  orgIdx: index("contracts_org_idx").on(t.orgId),
  clientIdx: index("contracts_client_idx").on(t.clientId),
  parentIdx: index("contracts_parent_idx").on(t.parentId),
}));

// ── Contract versions (immutable snapshots + extracted text) ─────────────────
export const contractVersions = pgTable("contract_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  extractedText: text("extracted_text"),
  changeNote: text("change_note"),
  source: text("source").notNull().default("upload"), // upload | manual | ai_assisted | rollback
  aiRiskScore: integer("ai_risk_score"),
  aiModelUsed: text("ai_model_used"),
  uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  contractVerIdx: uniqueIndex("versions_contract_ver_idx").on(t.contractId, t.versionNumber),
}));

// ── AI findings (per version) ────────────────────────────────────────────────
export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => contractVersions.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("clause"), // clause | missing | redline
  clauseType: text("clause_type").notNull(),
  heading: text("heading"),
  excerpt: text("excerpt"),
  severity: text("severity").notNull().default("medium"), // info | low | medium | high | critical
  riskScore: integer("risk_score"),
  summary: text("summary"),
  recommendation: text("recommendation"),
  original: text("original"),   // for redlines
  suggested: text("suggested"), // for redlines
  status: text("status").notNull().default("open"), // open | accepted | rejected
  position: integer("position").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ versionIdx: index("findings_version_idx").on(t.versionId) }));

// ── Approvals ────────────────────────────────────────────────────────────────
export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").references(() => contractVersions.id, { onDelete: "set null" }),
  reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
  decision: text("decision").notNull(), // approved | rejected | changes_requested
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ contractIdx: index("approvals_contract_idx").on(t.contractId) }));

// ── Notes ────────────────────────────────────────────────────────────────────
export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ contractIdx: index("notes_contract_idx").on(t.contractId) }));

// ── Clause library (playbook of preferred/standard positions) ────────────────
export const clauseLibrary = pgTable("clause_library", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  clauseType: text("clause_type").notNull().default("Other"),
  jurisdiction: text("jurisdiction").notNull().default("US"),
  body: text("body").notNull(),
  preferredPosition: text("preferred_position"), // firm's standard/fallback stance
  riskLevel: text("risk_level").notNull().default("medium"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ orgIdx: index("clause_library_org_idx").on(t.orgId) }));

// ── Audit log ────────────────────────────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ orgIdx: index("audit_org_idx").on(t.orgId, t.createdAt) }));

// ── Zod insert schemas (request validation) ──────────────────────────────────
export const insertClientSchema = createInsertSchema(clients).omit({
  id: true, orgId: true, createdBy: true, createdAt: true, updatedAt: true,
});
export const insertContractSchema = createInsertSchema(contracts).omit({
  id: true, orgId: true, createdBy: true, createdAt: true, updatedAt: true,
  currentVersionId: true, riskScore: true, reviewStatus: true,
});
export const insertClauseLibrarySchema = createInsertSchema(clauseLibrary).omit({
  id: true, orgId: true, createdBy: true, createdAt: true,
});
export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true, orgId: true, authorId: true, createdAt: true,
});

// ── Inferred types ───────────────────────────────────────────────────────────
export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type ContractVersion = typeof contractVersions.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type ClauseLibraryItem = typeof clauseLibrary.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

export const DOC_TYPES = ["MSA", "SOW", "ChangeOrder", "Amendment", "NDA", "OrderForm", "DPA", "Other"] as const;
