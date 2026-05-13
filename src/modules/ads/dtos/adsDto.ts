import { z } from "zod";

// Imagem de teste padrão usada pelo ML na própria documentação oficial
const ML_TEST_PICTURE =
  "https://www.motorino.com.br/site/wp-content/uploads/2018/01/produto_de_teste_amarelo_4_2_20171020224326-400x400.jpg";

export const createAdSchema = z.object({
  title: z.string().min(10, "Título deve ter no mínimo 10 caracteres"),
  description: z.string().optional(),
  price: z.number().positive(),
  availableQuantity: z.number().int().nonnegative(),
  categoryId: z.string().default("MLB3530"), // default: "Outros" — categoria folha usada nos exemplos da doc do ML
  condition: z.enum(["new", "used", "not_specified"]).default("new"),
  listingTypeId: z.string().default("gold_special"),
  currencyId: z.string().default("BRL"),
  buyingMode: z.string().default("buy_it_now"),
  warrantyType: z.string().default("Garantia do vendedor"),
  warrantyTime: z.string().default("90 dias"),
  /** Atributos dinâmicos da categoria folha selecionada (ex: BRAND, MODEL, etc) */
  attributes: z
    .array(z.object({ id: z.string(), value_name: z.string() }))
    .optional()
    .default([]),
  // Em homologação, se nenhuma imagem for enviada usa a imagem de teste oficial do ML
  pictureUrls: z
    .array(z.string().url())
    .optional()
    .default([ML_TEST_PICTURE])
    .transform((urls) => (urls.length > 0 ? urls : [ML_TEST_PICTURE])),
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
