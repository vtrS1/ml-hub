import type { Request, Response, NextFunction } from 'express';
import { callbackQuerySchema } from '../dtos/authDto.js';
import type { AuthService } from '../services/authService.js';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  initiateOAuth = (_req: Request, res: Response): void => {
    const url = this.authService.getOAuthUrl();
    res.redirect(url);
  };

  handleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = callbackQuerySchema.parse(req.query);
      const { token } = await this.authService.handleCallback(code);
      res.redirect(`${process.env['FRONTEND_URL']}?token=${token}`);
    } catch (err) {
      next(err);
    }
  };
}
