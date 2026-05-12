import mongoose from 'mongoose';
import { AppError } from '../../../shared/errors/AppError.js';
import { logger } from '../../../shared/logger/logger.js';
import { MercadoLivreService } from '../../mercadolivre/mercadolivreService.js';
import { AuthRepository } from '../../auth/repositories/authRepository.js';
import { AdsRepository } from '../repositories/adsRepository.js';
import { SyncStatus } from '../schemas/adSchema.js';
import type {
  CreateAdDto,
  ListAdsQueryDto,
  UpdateAdDto,
  UpdatePriceDto,
  UpdateStockDto,
} from '../dtos/adsDto.js';
import type { IAd } from '../schemas/adSchema.js';

export class AdsService {
  constructor(
    private readonly adsRepository: AdsRepository,
    private readonly authRepository: AuthRepository,
    private readonly mlService: MercadoLivreService,
  ) {}

  private async getSellerWithToken(sellerId: string) {
    const seller = await this.authRepository.findByMlUserId(sellerId);
    if (!seller) throw new AppError('Vendedor não encontrado', 404);
    return seller;
  }

  async list(sellerId: string, query: ListAdsQueryDto) {
    return this.adsRepository.findAll(sellerId, query);
  }

  async getById(id: string, sellerId: string): Promise<IAd> {
    const ad = await this.adsRepository.findById(id, sellerId);
    if (!ad) throw new AppError('Anúncio não encontrado', 404);
    return ad;
  }

  async create(sellerId: string, dto: CreateAdDto): Promise<IAd> {
    const seller = await this.authRepository.findByMlUserId(sellerId);
    if (!seller) throw new AppError('Vendedor não encontrado', 404);

    let mlItemId = '';
    let thumbnail = '';
    let permalink = '';
    let syncStatus = SyncStatus.PENDING;

    try {
      const mlItem = await this.mlService.createItem(
        {
          title: dto.title,
          price: dto.price,
          available_quantity: dto.availableQuantity,
        },
        seller.accessToken,
      );
      mlItemId = mlItem.id;
      thumbnail = mlItem.thumbnail;
      permalink = mlItem.permalink;
      syncStatus = SyncStatus.SYNCED;
    } catch (err) {
      logger.warn({ err }, 'Falha ao criar item no ML, salvando como PENDING');
    }

    const existingAd = mlItemId
      ? await this.adsRepository.findByMlItemId(mlItemId, sellerId)
      : null;

    if (existingAd) {
      throw new AppError('Anúncio já existe para este vendedor', 409);
    }

    return this.adsRepository.create({
      sellerId: new mongoose.Types.ObjectId(sellerId),
      mlItemId,
      title: dto.title,
      description: dto.description ?? '',
      price: dto.price,
      availableQuantity: dto.availableQuantity,
      thumbnail,
      permalink,
      syncStatus,
      lastSyncAt: syncStatus === SyncStatus.SYNCED ? new Date() : undefined,
    });
  }

  async update(id: string, sellerId: string, dto: UpdateAdDto): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      try {
        await this.mlService.updateItem(
          ad.mlItemId,
          {
            title: dto.title,
            price: dto.price,
            available_quantity: dto.availableQuantity,
          },
          seller.accessToken,
        );
      } catch (err) {
        logger.warn({ err }, 'Falha ao atualizar item no ML');
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
      }
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      ...dto,
      syncStatus: ad.mlItemId ? SyncStatus.SYNCED : SyncStatus.PENDING,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError('Anúncio não encontrado', 404);
    return updated;
  }

  async updatePrice(id: string, sellerId: string, dto: UpdatePriceDto): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      try {
        await this.mlService.updatePrice(ad.mlItemId, dto.price, seller.accessToken);
      } catch (err) {
        logger.warn({ err }, 'Falha ao atualizar preço no ML');
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
        throw new AppError('Falha ao atualizar preço no Mercado Livre', 502);
      }
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      price: dto.price,
      syncStatus: SyncStatus.SYNCED,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError('Anúncio não encontrado', 404);
    return updated;
  }

  async updateStock(id: string, sellerId: string, dto: UpdateStockDto): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      try {
        await this.mlService.updateStock(ad.mlItemId, dto.availableQuantity, seller.accessToken);
      } catch (err) {
        logger.warn({ err }, 'Falha ao atualizar estoque no ML');
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
        throw new AppError('Falha ao atualizar estoque no Mercado Livre', 502);
      }
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      availableQuantity: dto.availableQuantity,
      syncStatus: SyncStatus.SYNCED,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError('Anúncio não encontrado', 404);
    return updated;
  }

  async pause(id: string, sellerId: string): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      await this.mlService.pauseItem(ad.mlItemId, seller.accessToken);
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      status: 'paused',
      syncStatus: SyncStatus.SYNCED,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError('Anúncio não encontrado', 404);
    return updated;
  }

  async activate(id: string, sellerId: string): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      await this.mlService.activateItem(ad.mlItemId, seller.accessToken);
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      status: 'active',
      syncStatus: SyncStatus.SYNCED,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError('Anúncio não encontrado', 404);
    return updated;
  }

  async sync(sellerId: string): Promise<{ synced: number; errors: number }> {
    const seller = await this.authRepository.findByMlUserId(sellerId);
    if (!seller) throw new AppError('Vendedor não encontrado', 404);

    const ads = await this.adsRepository.findAllBySeller(sellerId);
    let synced = 0;
    let errors = 0;

    for (const ad of ads) {
      if (!ad.mlItemId) continue;

      try {
        const mlItem = await this.mlService.getItem(ad.mlItemId, seller.accessToken);

        const hasConflict =
          mlItem.price !== ad.price || mlItem.available_quantity !== ad.availableQuantity;

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
        synced++;
      } catch (err) {
        logger.error({ err, adId: ad._id }, 'Erro ao sincronizar anúncio');
        await this.adsRepository.updateSyncStatus(ad._id.toString(), SyncStatus.ERROR);
        errors++;
      }
    }

    return { synced, errors };
  }
}
