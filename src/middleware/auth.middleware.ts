// requireAuth: validates the session cookie (or Bearer token) and attaches the
// authenticated user's claims to req.auth. Every protected route is org-scoped
// off req.auth.orgId — server-side, never trusting the client (the POC relied
// on frontend checks only).
import type { Request, Response, NextFunction } from "express";
import { verifyToken, COOKIE_NAME, type JwtClaims } from "../auth/jwt";
import { unauthorized, forbidden } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: JwtClaims;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const cookieToken = (req as any).cookies?.[COOKIE_NAME];
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = cookieToken || bearer;
  if (!token) return next(unauthorized("Not authenticated"));

  const claims = verifyToken(token);
  if (!claims) return next(unauthorized("Invalid or expired session"));

  req.auth = claims;
  next();
}

// requireRole: gate an endpoint behind one or more roles.
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden("Insufficient permissions"));
    next();
  };
}
