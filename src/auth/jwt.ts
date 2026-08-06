// JWT issuing/verification. Tokens are delivered as an httpOnly cookie so the
// frontend never has to store them (safer than localStorage).
import jwt from "jsonwebtoken";
import { env } from "../lib/env";

export type JwtClaims = {
  userId: string;
  orgId: string;
  role: string;
  email: string;
};

const EXPIRES_IN = "7d";
export const COOKIE_NAME = "tsp_session";

export function signToken(claims: JwtClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtClaims | null {
  try {
    return jwt.verify(token, env.jwtSecret) as JwtClaims;
  } catch {
    return null;
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,          // HTTPS only in production
    sameSite: (env.isProd ? "none" : "lax") as "none" | "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}
