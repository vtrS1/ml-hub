import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { logger } from '../logger/logger.js';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGO_URI);
    logger.info('✅ MongoDB conectado com sucesso');
  } catch (err) {
    logger.error({ err }, '❌ Falha ao conectar ao MongoDB');
    process.exit(1);
  }
}

mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️ MongoDB desconectado');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err }, '❌ Erro na conexão MongoDB');
});
