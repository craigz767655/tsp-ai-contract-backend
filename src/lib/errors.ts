// Typed HTTP errors so route handlers can throw and a single error middleware
// converts them to clean JSON responses.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (m = "Bad request") => new HttpError(400, m);
export const unauthorized = (m = "Unauthorized") => new HttpError(401, m);
export const forbidden = (m = "Forbidden") => new HttpError(403, m);
export const notFound = (m = "Not found") => new HttpError(404, m);
export const conflict = (m = "Conflict") => new HttpError(409, m);

// Wrap async route handlers so thrown errors reach the error middleware
// instead of crashing the process (a major POC instability source).
import type { Request, Response, NextFunction } from "express";
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
