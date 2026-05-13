import { mlHttpClient } from "../../shared/http/httpClient.js";
import { env } from "../../config/env.js";
import { withRetry } from "../../shared/utils/retry.js";
import { logger } from "../../shared/logger/logger.js";

export interface MLTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
}

export interface MLUserInfo {
  id: number;
  nickname: string;
}

export interface MLSaleTerm {
  id: string;
  value_name: string;
}

export interface MLAttribute {
  id: string;
  value_name: string;
}

export interface MLAttributeValue {
  id: string;
  name: string;
}

/** Definição de um atributo de categoria retornado pelo ML */
export interface MLCategoryAttribute {
  id: string;
  name: string;
  value_type: "string" | "number" | "boolean" | "list" | "number_unit";
  tags: {
    required?: boolean;
    catalog_required?: boolean;
    hidden?: boolean;
    read_only?: boolean;
    multivalued?: boolean;
    variation_attribute?: boolean;
  };
  values?: MLAttributeValue[];
  allowed_units?: { id: string; name: string }[];
  default_unit?: string;
  hint?: string;
}

export interface MLCategoryDetails {
  id: string;
  name: string;
  path_from_root: { id: string; name: string }[];
  children_categories: {
    id: string;
    name: string;
    total_items_in_this_category: number;
  }[];
  /** Se vazio, é categoria folha */
  leaf_category_count: number;
}

export interface MLItem {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  status: string;
  thumbnail: string;
  permalink: string;
  description?: string;
  category_id?: string;
  condition?: "new" | "used" | "not_specified";
  listing_type_id?: string;
  currency_id?: string;
  buying_mode?: string;
  sale_terms?: MLSaleTerm[];
  attributes?: MLAttribute[];
  pictures?: { source: string }[];
}

export interface MLItemsSearchResponse {
  results: MLItem[];
  paging: { total: number; offset: number; limit: number };
}

export class MercadoLivreService {
  // Cache de categorias para evitar bater na API do ML a cada requisição
  private categoriesCache: { id: string; name: string }[] | null = null;
  private categoriesCachedAt: number = 0;
  private readonly CATEGORIES_TTL_MS = 60 * 60 * 1000; // 1 hora
  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.ML_APP_ID,
      redirect_uri: env.ML_REDIRECT_URI,
    });
    return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<MLTokenResponse> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.post<MLTokenResponse>(
        "/oauth/token",
        {
          grant_type: "authorization_code",
          client_id: env.ML_APP_ID,
          client_secret: env.ML_CLIENT_SECRET,
          code,
          redirect_uri: env.ML_REDIRECT_URI,
        },
      );
      return data;
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<MLTokenResponse> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.post<MLTokenResponse>(
        "/oauth/token",
        {
          grant_type: "refresh_token",
          client_id: env.ML_APP_ID,
          client_secret: env.ML_CLIENT_SECRET,
          refresh_token: refreshToken,
        },
      );
      return data;
    });
  }

  async getUserInfo(accessToken: string): Promise<MLUserInfo> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.get<MLUserInfo>("/users/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data;
    });
  }

  async getSellerItems(
    sellerId: string,
    accessToken: string,
  ): Promise<MLItem[]> {
    return withRetry(async () => {
      const { data: searchData } =
        await mlHttpClient.get<MLItemsSearchResponse>(
          `/users/${sellerId}/items/search`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

      if (searchData.results.length === 0) return [];

      const ids = searchData.results.join(",");
      const { data: items } = await mlHttpClient.get<MLItem[]>(
        `/items?ids=${ids}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return items;
    });
  }

  async getItem(itemId: string, accessToken: string): Promise<MLItem> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.get<MLItem>(`/items/${itemId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data;
    });
  }

  async createItem(
    payload: Partial<MLItem>,
    accessToken: string,
  ): Promise<MLItem> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.post<MLItem>("/items", payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data;
    });
  }

  async updateItem(
    itemId: string,
    payload: Partial<MLItem>,
    accessToken: string,
  ): Promise<MLItem> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.put<MLItem>(
        `/items/${itemId}`,
        payload,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return data;
    });
  }

  async updatePrice(
    itemId: string,
    price: number,
    accessToken: string,
  ): Promise<void> {
    await this.updateItem(itemId, { price }, accessToken);
  }

  async updateStock(
    itemId: string,
    availableQuantity: number,
    accessToken: string,
  ): Promise<void> {
    await this.updateItem(
      itemId,
      { available_quantity: availableQuantity },
      accessToken,
    );
  }

  async pauseItem(itemId: string, accessToken: string): Promise<void> {
    await this.updateItem(itemId, { status: "paused" }, accessToken);
  }

  async activateItem(itemId: string, accessToken: string): Promise<void> {
    await this.updateItem(itemId, { status: "active" }, accessToken);
  }

  // Categorias folha do MLB para fallback quando a API do ML bloquear a requisição
  // Todas são categorias folha válidas (não têm filhos) — seguras para publicar
  private static readonly MLB_CATEGORIES_FALLBACK: {
    id: string;
    name: string;
  }[] = [
    { id: "MLB3530", name: "Outros (Geral)" },
    { id: "MLB1953", name: "Motos" },
    { id: "MLB1430", name: "Livros" },
    { id: "MLB1196", name: "Indústria e Comércio" },
    { id: "MLB1144", name: "Esportes e Fitness" },
    { id: "MLB1182", name: "Games e Consoles" },
    { id: "MLB1499", name: "Informática" },
    { id: "MLB1276", name: "Eletrodomésticos" },
    { id: "MLB1168", name: "Moda e Acessórios" },
    { id: "MLB1051", name: "Celulares e Telefones" },
  ];

  async getCategories(
    accessToken: string,
  ): Promise<{ id: string; name: string }[]> {
    const now = Date.now();
    if (
      this.categoriesCache &&
      now - this.categoriesCachedAt < this.CATEGORIES_TTL_MS
    ) {
      return this.categoriesCache;
    }

    try {
      const { data } = await mlHttpClient.get<{ id: string; name: string }[]>(
        "/sites/MLB/categories",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      this.categoriesCache = data;
      this.categoriesCachedAt = Date.now();
      return data;
    } catch (err) {
      logger.warn({ err }, "Falha ao buscar categorias do ML, usando fallback");
      return MercadoLivreService.MLB_CATEGORIES_FALLBACK;
    }
  }

  async postDescription(
    itemId: string,
    plainText: string,
    accessToken: string,
  ): Promise<void> {
    await withRetry(async () => {
      await mlHttpClient.post(
        `/items/${itemId}/description`,
        { plain_text: plainText },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    });
  }

  /**
   * Retorna os detalhes de uma categoria, incluindo subcategorias.
   * Se children_categories estiver vazio, é uma categoria folha.
   */
  async getCategoryDetails(
    categoryId: string,
    accessToken: string,
  ): Promise<MLCategoryDetails> {
    const { data } = await mlHttpClient.get<MLCategoryDetails>(
      `/categories/${categoryId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    return data;
  }

  /**
   * Retorna os atributos de uma categoria folha.
   * Use tags.required ou tags.catalog_required para identificar campos obrigatórios.
   */
  async getCategoryAttributes(
    categoryId: string,
    accessToken: string,
  ): Promise<MLCategoryAttribute[]> {
    const { data } = await mlHttpClient.get<MLCategoryAttribute[]>(
      `/categories/${categoryId}/attributes`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    // Filtra atributos hidden/read_only que o seller não precisa preencher
    return data.filter((a) => !a.tags?.hidden && !a.tags?.read_only);
  }
}
