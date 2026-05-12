import express from 'express';
import type { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './shared/logger/logger.js';
import { errorMiddleware } from './shared/middlewares/errorMiddleware.js';
import authRoutes from './modules/auth/routes/authRoutes.js';
import adsRoutes from './modules/ads/routes/adsRoutes.js';
import webhookRoutes from './modules/webhooks/webhookRoutes.js';

const app: Application = express();

// Segurança
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);

// Logger HTTP
app.use(pinoHttp({ logger }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Rotas
app.use('/auth', authRoutes);
app.use('/ads', adsRoutes);
app.use('/webhooks', webhookRoutes);

// Tratamento global de erros (deve ser o último middleware)
app.use(errorMiddleware);

export default app;
