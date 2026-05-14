import axios from 'axios';
import { logger } from '../logger/logger.js';

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 500,
): Promise<T> {
  let attempt = 0;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      // Nunca retentar em erros de validação/autenticação do cliente (4xx)
      if (axios.isAxiosError(err) && err.response?.status && err.response.status < 500) {
        throw err;
      }

      if (attempt === retries) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt);
      logger.warn({ err, attempt: attempt + 1, retries, delay }, 'Retry agendado');
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }

  throw new Error('withRetry: não deveria chegar aqui');
}
