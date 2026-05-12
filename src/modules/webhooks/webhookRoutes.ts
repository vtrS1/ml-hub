import { Router } from 'express';
import { webhookHandler } from '../webhooks/webhookController.js';

const router = Router();

router.post('/mercadolivre', webhookHandler);

export default router;
