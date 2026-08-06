// Seed a demo org + owner so you can log in immediately after first deploy.
// Idempotent: safe to run repeatedly. Run with `npm run db:seed`.
import { eq } from "drizzle-orm";
import { db, pool } from "./index";
import { orgs, users, clients } from "./schema";
import { hashPassword } from "../auth/password";

async function main() {
  const email = "demo@tspaicontract.com";
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) {
    console.log("Seed skipped — demo user already exists:", email);
    await pool.end();
    return;
  }
  const [org] = await db.insert(orgs).values({ name: "TSP Demo Org", slug: "tsp-demo" }).returning();
  const [user] = await db.insert(users).values({
    orgId: org.id, email, name: "Demo Owner", role: "owner",
    passwordHash: await hashPassword("ChangeMe123!"),
  }).returning();
  await db.insert(clients).values([
    { orgId: org.id, name: "Acme Corp", industry: "Manufacturing", jurisdiction: "US", createdBy: user.id },
    { orgId: org.id, name: "Globex LLC", industry: "Technology", jurisdiction: "US", createdBy: user.id },
  ]);
  console.log("Seeded demo org + owner:");
  console.log("  email:    ", email);
  console.log("  password: ", "ChangeMe123!  (change after first login)");
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
