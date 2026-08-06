// Postgres connection pool + Drizzle client. Uses node-postgres (pg), which
// works with Render Postgres. SSL is enabled in production.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "../lib/env";

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.isProd ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err.message);
});

export const db = drizzle(pool, { schema });
export { schema };
