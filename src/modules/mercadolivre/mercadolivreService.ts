import { mlHttpClient } from '../../shared/http/httpClient.js';
import { env } from '../../config/env.js';
import { withRetry } from '../../shared/utils/retry.js';

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

export interface MLItem {
  id: string;
  title: string;
  price: number;
  available_quantity: number;
  status: string;
  thumbnail: string;
  permalink: string;
  description?: string;
}

export interface MLItemsSearchResponse {
  results: MLItem[];
  paging: { total: number; offset: number; limit: number };
}

export class MercadoLivreService {
  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.ML_APP_ID,
      redirect_uri: env.ML_REDIRECT_URI,
    });
    return `https://auth.mercadolivre.com.br/authorization?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<MLTokenResponse> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.post<MLTokenResponse>('/oauth/token', {
        grant_type: 'authorization_code',
        client_id: env.ML_APP_ID,
        client_secret: env.ML_CLIENT_SECRET,
        code,
        redirect_uri: env.ML_REDIRECT_URI,
      });
      return data;
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<MLTokenResponse> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.post<MLTokenResponse>('/oauth/token', {
        grant_type: 'refresh_token',
        client_id: env.ML_APP_ID,
        client_secret: env.ML_CLIENT_SECRET,
        refresh_token: refreshToken,
      });
      return data;
    });
  }

  async getUserInfo(accessToken: string): Promise<MLUserInfo> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.get<MLUserInfo>('/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return data;
    });
  }

  async getSellerItems(sellerId: string, accessToken: string): Promise<MLItem[]> {
    return withRetry(async () => {
      const { data: searchData } = await mlHttpClient.get<MLItemsSearchResponse>(
        `/users/${sellerId}/items/search`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (searchData.results.length === 0) return [];

      const ids = searchData.results.join(',');
      const { data: items } = await mlHttpClient.get<MLItem[]>(`/items?ids=${ids}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
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

  async createItem(payload: Partial<MLItem>, accessToken: string): Promise<MLItem> {
    return withRetry(async () => {
      const { data } = await mlHttpClient.post<MLItem>('/items', payload, {
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
      const { data } = await mlHttpClient.put<MLItem>(`/items/${itemId}`, payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
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
    await this.updateItem(itemId, { available_quantity: availableQuantity }, accessToken);
  }

  async pauseItem(itemId: string, accessToken: string): Promise<void> {
    await this.updateItem(itemId, { status: 'paused' }, accessToken);
  }

  async activateItem(itemId: string, accessToken: string): Promise<void> {
    await this.updateItem(itemId, { status: 'active' }, accessToken);
  }
}
