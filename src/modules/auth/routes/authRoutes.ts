import { Router } from 'express';
import { MercadoLivreService } from '../../mercadolivre/mercadolivreService.js';
import { AuthRepository } from '../repositories/authRepository.js';
import { AuthService } from '../services/authService.js';
import { AuthController } from '../controllers/authController.js';

const router = Router();

const mlService = new MercadoLivreService();
const authRepository = new AuthRepository();
const authService = new AuthService(authRepository, mlService);
const authController = new AuthController(authService);

router.get('/mercadolivre', authController.initiateOAuth);
router.get('/mercadolivre/callback', authController.handleCallback);

export default router;
