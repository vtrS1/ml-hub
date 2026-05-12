import { connectDatabase } from './shared/database/connection.js';
import { logger } from './shared/logger/logger.js';
import { env } from './config/env.js';
import app from './app.js';
import { startSyncJob } from './jobs/syncJob.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  startSyncJob();

  app.listen(env.PORT, () => {
    logger.info(`🚀 Servidor rodando na porta ${env.PORT} [${env.NODE_ENV}]`);
  });
}

bootstrap().catch((err) => {
  logger.error({ err }, '❌ Falha ao iniciar o servidor');
  process.exit(1);
});
