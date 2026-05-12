import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGO_URI: z.string().min(1, 'MONGO_URI é obrigatório'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET é obrigatório'),
  ML_APP_ID: z.string().min(1, 'ML_APP_ID é obrigatório'),
  ML_CLIENT_SECRET: z.string().min(1, 'ML_CLIENT_SECRET é obrigatório'),
  ML_REDIRECT_URI: z.string().url('ML_REDIRECT_URI deve ser uma URL válida'),
  FRONTEND_URL: z.string().url('FRONTEND_URL deve ser uma URL válida').default('http://localhost:4200'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
