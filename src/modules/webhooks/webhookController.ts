import type { Request, Response } from 'express';
import { logger } from '../../shared/logger/logger.js';
import { AdsRepository } from '../ads/repositories/adsRepository.js';
import { MercadoLivreService } from '../mercadolivre/mercadolivreService.js';
import { SellerModel } from '../auth/schemas/sellerSchema.js';
import { SyncStatus } from '../ads/schemas/adSchema.js';
import type { IAd } from '../ads/schemas/adSchema.js';

const adsRepository = new AdsRepository();
const mlService = new MercadoLivreService();

interface MLNotification {
  _id: string;
  resource: string;
  user_id: number;
  topic: string;
  application_id: number;
  attempts: number;
  sent: string;
  received: string;
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  // ML exige resposta 200 imediata
  res.sendStatus(200);

  const notification = req.body as MLNotification;

  logger.info({ notification }, '📩 Webhook recebido do Mercado Livre');

  try {
    if (notification.topic !== 'items' && notification.topic !== 'prices') return;

    // resource ex: "/items/MLB123456789"
    const mlItemId = notification.resource.split('/').pop();
    if (!mlItemId) return;

    const seller = await SellerModel.findOne({ mlUserId: String(notification.user_id) });
    if (!seller) {
      logger.warn({ user_id: notification.user_id }, 'Webhook: vendedor não encontrado');
      return;
    }

    const ad = await adsRepository.findByMlItemId(mlItemId, seller._id.toString());
    if (!ad) {
      logger.warn({ mlItemId }, 'Webhook: anúncio não encontrado localmente');
      return;
    }

    const mlItem = await mlService.getItem(mlItemId, seller.accessToken);

    const hasConflict =
      mlItem.price !== ad.price || mlItem.available_quantity !== ad.availableQuantity;

    await adsRepository.updateSyncStatus(
      ad._id.toString(),
      hasConflict ? SyncStatus.CONFLICT : SyncStatus.SYNCED,
      {
        price: mlItem.price,
        availableQuantity: mlItem.available_quantity,
        status: mlItem.status,
        thumbnail: mlItem.thumbnail,
        permalink: mlItem.permalink,
      } as Partial<IAd>,
    );

    logger.info(
      { mlItemId, syncStatus: hasConflict ? 'CONFLICT' : 'SYNCED' },
      '✅ Webhook processado com sucesso',
    );
  } catch (err) {
    logger.error({ err }, '❌ Erro ao processar webhook do ML');
  }
}
