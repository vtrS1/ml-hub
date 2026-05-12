import { logger } from '../../shared/logger/logger.js';
import { SellerModel } from '../auth/schemas/sellerSchema.js';
import { AdsRepository } from '../ads/repositories/adsRepository.js';
import { MercadoLivreService } from '../mercadolivre/mercadolivreService.js';
import { SyncStatus } from '../ads/schemas/adSchema.js';
import type { IAd } from '../ads/schemas/adSchema.js';

export class SyncService {
  private readonly adsRepository = new AdsRepository();
  private readonly mlService = new MercadoLivreService();

  async syncAllSellers(): Promise<void> {
    const sellers = await SellerModel.find({});
    logger.info({ count: sellers.length }, 'Iniciando sincronização para todos os vendedores');

    for (const seller of sellers) {
      try {
        await this.syncSeller(seller.mlUserId, seller.accessToken);
      } catch (err) {
        logger.error({ err, mlUserId: seller.mlUserId }, 'Erro ao sincronizar vendedor');
      }
    }
  }

  async syncSeller(mlUserId: string, accessToken: string): Promise<void> {
    const ads = await this.adsRepository.findAllBySeller(mlUserId);

    for (const ad of ads) {
      if (!ad.mlItemId) continue;
      await this.reconcileAd(ad, accessToken);
    }
  }

  private async reconcileAd(ad: IAd, accessToken: string): Promise<void> {
    try {
      const mlItem = await this.mlService.getItem(ad.mlItemId, accessToken);

      const priceConflict = mlItem.price !== ad.price;
      const stockConflict = mlItem.available_quantity !== ad.availableQuantity;
      const hasConflict = priceConflict || stockConflict;

      if (hasConflict) {
        logger.warn(
          { adId: ad._id, mlItemId: ad.mlItemId, priceConflict, stockConflict },
          'Divergência detectada — reconciliando com Mercado Livre',
        );
      }

      await this.adsRepository.updateSyncStatus(
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
    } catch (err) {
      logger.error({ err, adId: ad._id, mlItemId: ad.mlItemId }, 'Falha ao reconciliar anúncio');
      await this.adsRepository.updateSyncStatus(ad._id.toString(), SyncStatus.ERROR);
    }
  }
}
