import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';
import { MercadoLivreService } from '../../mercadolivre/mercadolivreService.js';
import { AuthRepository } from '../repositories/authRepository.js';

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly mlService: MercadoLivreService,
  ) {}

  getOAuthUrl(): string {
    return this.mlService.getAuthorizationUrl();
  }

  async handleCallback(code: string): Promise<{ token: string }> {
    const tokenData = await this.mlService.exchangeCodeForTokens(code);
    const userInfo = await this.mlService.getUserInfo(tokenData.access_token);

    const tokenExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    const seller = await this.authRepository.upsertSeller({
      mlUserId: String(userInfo.id),
      nickname: userInfo.nickname,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt,
    });

    const jwtToken = jwt.sign({ sellerId: seller._id.toString() }, env.JWT_SECRET, {
      expiresIn: '7d',
    });

    return { token: jwtToken };
  }

  async refreshSellerToken(mlUserId: string): Promise<void> {
    const seller = await this.authRepository.findByMlUserId(mlUserId);
    if (!seller) return;

    const now = new Date();
    const expiresAt = seller.tokenExpiresAt;
    const diffMs = expiresAt.getTime() - now.getTime();
    const diffMinutes = diffMs / 1000 / 60;

    if (diffMinutes > 30) return;

    const refreshed = await this.mlService.refreshAccessToken(seller.refreshToken);
    await this.authRepository.updateTokens(mlUserId, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    });
  }
}
