import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger/logger.js';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error({ err }, 'Erro não operacional');
    }

    res.status(err.statusCode).json({
      message: err.message,
      errors: err.errors,
      statusCode: err.statusCode,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Validation failed',
      errors: err.flatten().fieldErrors,
      statusCode: 400,
    });
    return;
  }

  logger.error({ err }, 'Erro inesperado');

  res.status(500).json({
    message: 'Internal Server Error',
    errors: [],
    statusCode: 500,
  });
}
