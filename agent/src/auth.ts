import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'neurowealth-test-jwt-secret-key-32chars';

export interface UserPayload {
  userId: string;
  stellarAddress: string;
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
