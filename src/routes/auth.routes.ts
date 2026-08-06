import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { orgs, users } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { signToken, cookieOptions, COOKIE_NAME } from "../auth/jwt";
import { requireAuth } from "../middleware/auth.middleware";
import { asyncHandler, badRequest, unauthorized, conflict } from "../lib/errors";
import { audit } from "../lib/audit";

export const authRouter = Router();

const registerSchema = z.object({
  orgName: z.string().min(2),
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
    || "org";
}

// Register: creates a new org and its first (owner) user.
authRouter.post("/register", asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message || "Invalid input");
  const { orgName, name, email, password } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) throw conflict("An account with that email already exists");

  let slug = slugify(orgName);
  // ensure slug uniqueness
  const slugTaken = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, slug)).limit(1);
  if (slugTaken.length) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const [org] = await db.insert(orgs).values({ name: orgName, slug }).returning();
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({
    orgId: org.id, email, name, role: "owner", passwordHash,
  }).returning();

  const token = signToken({ userId: user.id, orgId: org.id, role: user.role, email: user.email });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  await audit({ orgId: org.id, userId: user.id, action: "register", entityType: "user", entityId: user.id });
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: org.id },
    org: { id: org.id, name: org.name, slug: org.slug },
  });
}));

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid input");
  const { email, password } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw unauthorized("Invalid email or password");
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw unauthorized("Invalid email or password");

  await db.update(users).set({ lastLogin: new Date() }).where(eq(users.id, user.id));
  const token = signToken({ userId: user.id, orgId: user.orgId, role: user.role, email: user.email });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.orgId },
  });
}));

authRouter.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
  if (!user) throw unauthorized();
  const [org] = await db.select().from(orgs).where(eq(orgs.id, user.orgId)).limit(1);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.orgId },
    org: org ? { id: org.id, name: org.name, slug: org.slug, branding: org.branding } : null,
  });
}));
