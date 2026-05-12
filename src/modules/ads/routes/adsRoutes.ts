import { Router } from 'express';
import { authMiddleware } from '../../../shared/middlewares/authMiddleware.js';
import { MercadoLivreService } from '../../mercadolivre/mercadolivreService.js';
import { AuthRepository } from '../../auth/repositories/authRepository.js';
import { AdsRepository } from '../repositories/adsRepository.js';
import { AdsService } from '../services/adsService.js';
import { AdsController } from '../controllers/adsController.js';

const router = Router();

const mlService = new MercadoLivreService();
const authRepository = new AuthRepository();
const adsRepository = new AdsRepository();
const adsService = new AdsService(adsRepository, authRepository, mlService);
const adsController = new AdsController(adsService);

router.use(authMiddleware);

router.get('/', adsController.list);
router.get('/:id', adsController.getById);
router.post('/', adsController.create);
router.put('/:id', adsController.update);
router.patch('/:id/price', adsController.updatePrice);
router.patch('/:id/stock', adsController.updateStock);
router.post('/:id/pause', adsController.pause);
router.post('/:id/activate', adsController.activate);
router.post('/sync', adsController.sync);

export default router;
