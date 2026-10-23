import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'neurowealth-test-jwt-secret-key-32chars';

export interface UserPayload {
  userId: string;
  stellarAddress: string;
  role?: string;
  scopes?: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export function generateToken(payload: UserPayload, expiresIn: string | number = '1h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized: Missing or malformed token',
      code: 'AUTH_TOKEN_MISSING'
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'Unauthorized: Token has expired',
        code: 'AUTH_TOKEN_EXPIRED'
      });
      return;
    }
    res.status(401).json({
      error: 'Unauthorized: Invalid token',
      code: 'AUTH_TOKEN_INVALID'
    });
    return;
  }
}

/**
 * Explicit operator authorization. Requires an authenticated token whose
 * payload carries the operator role or the `operator:jobs` scope. Anything
 * else is rejected with 403 so operational access is never implicit.
 */
export function requireOperator(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  const isOperator =
    !!user &&
    (user.role === 'operator' || (Array.isArray(user.scopes) && user.scopes.includes('operator:jobs')));

  if (!isOperator) {
    res.status(403).json({
      error: 'Forbidden: Operator authorization required',
      code: 'AUTH_OPERATOR_REQUIRED'
    });
    return;
  }

  next();
}

/**
 * Ownership check for user-scoped job/transaction lookups. Returns true only
 * when the authenticated user owns the job. Operators are intentionally NOT
 * granted implicit access here; operational access must go through
 * `requireOperator` on a separate route.
 */
export function isJobOwner(req: Request, jobUserId: string | undefined | null): boolean {
  if (!req.user || !jobUserId) {
    return false;
  }
  return req.user.userId === jobUserId;
}
