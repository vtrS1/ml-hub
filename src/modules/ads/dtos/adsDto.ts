import { z } from 'zod';

export const createAdSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  availableQuantity: z.number().int().nonnegative(),
});

export const updateAdSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  price: z.number().positive().optional(),
  availableQuantity: z.number().int().nonnegative().optional(),
});

export const updatePriceSchema = z.object({
  price: z.number().positive(),
});

export const updateStockSchema = z.object({
  availableQuantity: z.number().int().nonnegative(),
});

export const listAdsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.string().optional(),
  title: z.string().optional(),
});

export type CreateAdDto = z.infer<typeof createAdSchema>;
export type UpdateAdDto = z.infer<typeof updateAdSchema>;
export type UpdatePriceDto = z.infer<typeof updatePriceSchema>;
export type UpdateStockDto = z.infer<typeof updateStockSchema>;
export type ListAdsQueryDto = z.infer<typeof listAdsQuerySchema>;
