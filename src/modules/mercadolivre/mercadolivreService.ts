import { mlHttpClient } from "../../shared/http/httpClient.js";
import { env } from "../../config/env.js";
import { withRetry } from "../../shared/utils/retry.js";

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
  /** Para atributos do tipo number_unit (ex: WEIGHT_CAPACITY), informa a unidade separada */
  unit_id?: string;
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
    conditional_required?: boolean;
    hidden?: boolean;
    read_only?: boolean;
    multivalued?: boolean;
    variation_attribute?: boolean;
    business_conditional?: boolean;
    new_hidden?: boolean;
    used_hidden?: boolean;
    validate?: boolean;
    [key: string]: unknown;
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
  condition?: string;
  listing_type_id?: string;
  currency_id?: string;
  buying_mode?: string;
  attributes?: MLAttribute[];
  sale_terms?: MLSaleTerm[];
  pictures?: { source: string }[];
}

export interface MLItemsSearchResponse {
  results: MLItem[];
  paging: { total: number; offset: number; limit: number };
}

export class MercadoLivreService {
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

  async getCategories(
    accessToken: string,
  ): Promise<{ id: string; name: string }[]> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.get<{ id: string; name: string }[]>(
        "/sites/MLB/categories",
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return data;
    });
  }

  async getCategoryDetails(
    categoryId: string,
    accessToken: string,
  ): Promise<MLCategoryDetails> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.get<MLCategoryDetails>(
        `/categories/${categoryId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return data;
    });
  }

  async getCategoryAttributes(
    categoryId: string,
    accessToken: string,
  ): Promise<MLCategoryAttribute[]> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.get<MLCategoryAttribute[]>(
        `/categories/${categoryId}/attributes`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return data;
    });
  }

  async searchItems(
    query: string,
    categoryId: string,
    accessToken: string,
    limit = 10,
  ): Promise<{ id: string; title: string; price: number; thumbnail: string; permalink: string; seller_id: number }[]> {
    return withRetry(async () => {
      const params = new URLSearchParams({
        q: query,
        category: categoryId,
        limit: String(limit),
      });
      const { data } = await mlHttpClient.get<{
        results: { id: string; title: string; price: number; thumbnail: string; permalink: string; seller?: { id: number } }[];
      }>(`/sites/MLB/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return (data.results ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        price: r.price,
        thumbnail: r.thumbnail,
        permalink: r.permalink,
        seller_id: r.seller?.id ?? 0,
      }));
    });
  }
}
