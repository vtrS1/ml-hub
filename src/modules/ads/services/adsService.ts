import mongoose from "mongoose";
import { AppError } from "../../../shared/errors/AppError.js";
import { logger } from "../../../shared/logger/logger.js";
import { MercadoLivreService } from "../../mercadolivre/mercadolivreService.js";
import { AuthRepository } from "../../auth/repositories/authRepository.js";
import { AdsRepository } from "../repositories/adsRepository.js";
import { SyncStatus } from "../schemas/adSchema.js";
import type {
  CreateAdDto,
  ListAdsQueryDto,
  UpdateAdDto,
  UpdatePriceDto,
  UpdateStockDto,
} from "../dtos/adsDto.js";
import type { IAd } from "../schemas/adSchema.js";

export class AdsService {
  constructor(
    private readonly adsRepository: AdsRepository,
    private readonly authRepository: AuthRepository,
    private readonly mlService: MercadoLivreService,
  ) {}

  private async getSellerWithToken(sellerId: string) {
    const seller = await this.authRepository.findByMlUserId(sellerId);
    if (!seller) throw new AppError("Vendedor não encontrado", 404);
    return seller;
  }

  async list(sellerId: string, query: ListAdsQueryDto) {
    return this.adsRepository.findAll(sellerId, query);
  }

  async getById(id: string, sellerId: string): Promise<IAd> {
    const ad = await this.adsRepository.findById(id, sellerId);
    if (!ad) throw new AppError("Anúncio não encontrado", 404);
    return ad;
  }

  async create(sellerId: string, dto: CreateAdDto): Promise<IAd> {
    const seller = await this.authRepository.findByMlUserId(sellerId);
    if (!seller) throw new AppError("Vendedor não encontrado", 404);

    let mlItemId = "";
    let thumbnail = "";
    let permalink = "";
    let syncStatus = SyncStatus.PENDING;

    try {
      const conditionValueName =
        dto.condition === "new"
          ? "Novo"
          : dto.condition === "used"
            ? "Usado"
            : "Não especificado";

      const SKIP_IDS = [
        "GTIN",
        "EAN",
        "UPC",
        "ISBN",
        "MPN",
        "SELLER_SKU",
        "ITEM_CONDITION",
      ];
      const dynamicAttrs = (dto.attributes ?? [])
        .filter((a) => !SKIP_IDS.includes(a.id))
        // Remove atributos vazios
        .filter((a) => a.value_name && a.value_name.trim().length > 0)
        // Para atributos number_unit (ex: "12 kg"), extrai unit_id para o payload do ML
        .map((a) => {
          const parts = a.value_name.trim().split(" ");
          if (parts.length === 2 && !isNaN(Number(parts[0]))) {
            return { id: a.id, value_name: a.value_name, unit_id: parts[1] };
          }
          return { id: a.id, value_name: a.value_name };
        });

      const attributes = [
        { id: "ITEM_CONDITION", value_name: conditionValueName },
        ...dynamicAttrs,
      ];

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
      logger.warn({ err }, "Falha ao criar item no ML, salvando como PENDING");
    }

    const existingAd = mlItemId
      ? await this.adsRepository.findByMlItemId(mlItemId, sellerId)
      : null;

    if (existingAd) {
      throw new AppError("Anúncio já existe para este vendedor", 409);
    }

    return this.adsRepository.create({
      sellerId: new mongoose.Types.ObjectId(sellerId),
      mlItemId,
      title: dto.title,
      description: dto.description ?? "",
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
        logger.warn({ err }, "Falha ao atualizar item no ML");
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
      }
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      ...dto,
      syncStatus: ad.mlItemId ? SyncStatus.SYNCED : SyncStatus.PENDING,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError("Anúncio não encontrado", 404);
    return updated;
  }

  async updatePrice(
    id: string,
    sellerId: string,
    dto: UpdatePriceDto,
  ): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      try {
        await this.mlService.updatePrice(
          ad.mlItemId,
          dto.price,
          seller.accessToken,
        );
      } catch (err) {
        logger.warn({ err }, "Falha ao atualizar preço no ML");
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
        throw new AppError("Falha ao atualizar preço no Mercado Livre", 502);
      }
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      price: dto.price,
      syncStatus: SyncStatus.SYNCED,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError("Anúncio não encontrado", 404);
    return updated;
  }

  async updateStock(
    id: string,
    sellerId: string,
    dto: UpdateStockDto,
  ): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      try {
        await this.mlService.updateStock(
          ad.mlItemId,
          dto.availableQuantity,
          seller.accessToken,
        );
      } catch (err) {
        logger.warn({ err }, "Falha ao atualizar estoque no ML");
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
        throw new AppError("Falha ao atualizar estoque no Mercado Livre", 502);
      }
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      availableQuantity: dto.availableQuantity,
      syncStatus: SyncStatus.SYNCED,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError("Anúncio não encontrado", 404);
    return updated;
  }

  async pause(id: string, sellerId: string): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      await this.mlService.pauseItem(ad.mlItemId, seller.accessToken);
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      status: "paused",
      syncStatus: SyncStatus.SYNCED,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError("Anúncio não encontrado", 404);
    return updated;
  }

  async activate(id: string, sellerId: string): Promise<IAd> {
    const ad = await this.getById(id, sellerId);
    const seller = await this.getSellerWithToken(ad.sellerId.toString());

    if (ad.mlItemId) {
      await this.mlService.activateItem(ad.mlItemId, seller.accessToken);
    }

    const updated = await this.adsRepository.update(id, sellerId, {
      status: "active",
      syncStatus: SyncStatus.SYNCED,
      lastSyncAt: new Date(),
    } as Partial<IAd>);

    if (!updated) throw new AppError("Anúncio não encontrado", 404);
    return updated;
  }

  async sync(
    sellerId: string,
  ): Promise<{ synced: number; imported: number; errors: number }> {
    const seller = await this.authRepository.findById(sellerId);
    if (!seller) throw new AppError("Vendedor não encontrado", 404);

    let synced = 0;
    let imported = 0;
    let errors = 0;

    // Busca TODOS os anúncios do seller no ML (incluindo os criados fora da plataforma)
    let mlItems: Awaited<ReturnType<typeof this.mlService.getSellerItems>> = [];
    try {
      mlItems = await this.mlService.getSellerItems(
        seller.mlUserId.toString(),
        seller.accessToken,
      );
    } catch (err) {
      logger.error({ err }, "Erro ao buscar itens do seller no ML");
      throw new AppError("Falha ao buscar anúncios do Mercado Livre", 502);
    }

    // Mapeia os mlItemIds já salvos no banco para detectar novos
    const existingAds = await this.adsRepository.findAllBySeller(sellerId);
    const existingMlIds = new Set(existingAds.map((a) => a.mlItemId));

    for (const mlItem of mlItems) {
      // mlItem pode ser um objeto com body quando buscado em lote — normaliza
      const item =
        (mlItem as unknown as { body?: typeof mlItem; code?: number }).body ??
        mlItem;
      if (!item?.id) continue;

      try {
        if (existingMlIds.has(item.id)) {
          // Anúncio já existe no banco → atualiza dados
          const ad = existingAds.find((a) => a.mlItemId === item.id)!;
          const hasConflict =
            item.price !== ad.price ||
            item.available_quantity !== ad.availableQuantity;

          await this.adsRepository.updateSyncStatus(
            ad._id.toString(),
            hasConflict ? SyncStatus.CONFLICT : SyncStatus.SYNCED,
            {
              price: item.price,
              availableQuantity: item.available_quantity,
              status: item.status,
              thumbnail: item.thumbnail,
              permalink: item.permalink,
            } as Partial<IAd>,
          );
          synced++;
        } else {
          // Anúncio novo (criado direto no ML) → importa para o banco
          await this.adsRepository.create({
            sellerId: new mongoose.Types.ObjectId(sellerId),
            mlItemId: item.id,
            title: item.title,
            description: "",
            price: item.price,
            availableQuantity: item.available_quantity,
            status: item.status ?? "active",
            thumbnail: item.thumbnail ?? "",
            permalink: item.permalink ?? "",
            syncStatus: SyncStatus.SYNCED,
            lastSyncAt: new Date(),
          } as Partial<IAd>);
          imported++;
        }
      } catch (err) {
        logger.error({ err, mlItemId: item.id }, "Erro ao sincronizar anúncio");
        errors++;
      }
    }

    return { synced, imported, errors };
  }
}
