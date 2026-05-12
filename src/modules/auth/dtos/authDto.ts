import { z } from 'zod';

export const callbackQuerySchema = z.object({
  code: z.string().min(1, 'authorization code é obrigatório'),
});

export type CallbackQueryDto = z.infer<typeof callbackQuerySchema>;
