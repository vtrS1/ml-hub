import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../errors/AppError.js';

export interface AuthRequest extends Request {
  sellerId?: string;
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Token de autenticação não fornecido', 401));
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return next(new AppError('Token inválido', 401));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sellerId: string };
    req.sellerId = payload.sellerId;
    next();
  } catch {
    next(new AppError('Token expirado ou inválido', 401));
  }
}
