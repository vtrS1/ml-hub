import mongoose from "mongoose";
import { AppError } from "../../../shared/errors/AppError.js";
import { handleMlError } from "../../../shared/errors/mlError.js";
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
    const seller = await this.authRepository.findById(sellerId);
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
    const seller = await this.authRepository.findById(sellerId);
    if (!seller) throw new AppError("Vendedor não encontrado", 404);

    // --- Pré-validação: busca atributos da categoria e verifica obrigatórios ---
    // IDs sempre ignorados (gerados automaticamente ou tratados separadamente)
    // GRADING: gerenciado internamente pelo ML (business_conditional), nunca enviar
    const ALWAYS_SKIP = ["SELLER_SKU", "ITEM_CONDITION", "GRADING"];

    try {
      const categoryAttrs = await this.mlService.getCategoryAttributes(
        dto.categoryId,
        seller.accessToken,
      );

      const sentIds = new Set((dto.attributes ?? []).map((a) => a.id));
      const ALWAYS_SKIP_VALIDATION = ["SELLER_SKU", "ITEM_CONDITION", "EMPTY_GTIN_REASON"];
      const isNew = dto.condition === "new";

      const missing = categoryAttrs
        .filter(
          (a) =>
            (a.tags.required || a.tags.catalog_required || a.tags.conditional_required) &&
            !ALWAYS_SKIP_VALIDATION.includes(a.id) &&
            !a.tags.hidden &&
            !a.tags.read_only &&
            !(a.tags as Record<string, unknown>).business_conditional &&
            !(isNew && (a.tags as Record<string, unknown>).new_hidden) &&
            !(!isNew && (a.tags as Record<string, unknown>).used_hidden) &&
            !sentIds.has(a.id),
        )
        .map((a) => a.name);

      if (missing.length > 0) {
        throw new AppError(
          `Campos obrigatórios não preenchidos para esta categoria: ${missing.join(", ")}`,
          422,
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Se falhar ao buscar atributos, loga mas não bloqueia a criação
      logger.warn({ err }, "Não foi possível validar atributos da categoria");
    }
    // -------------------------------------------------------------------------

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

      const dynamicAttrs = (dto.attributes ?? [])
        .filter((a) => !ALWAYS_SKIP.includes(a.id))
        .filter((a) => a.value_name && a.value_name.trim().length > 0 && a.value_name !== "null")
        .map((a) => {
          const raw = a.value_name.trim();
          const parts = raw.split(/\s+/); // split por qualquer whitespace
          // Para atributos number_unit: "42 mm" → { value_name: "42", unit_id: "mm" }
          if (parts.length === 2 && !isNaN(Number(parts[0])) && isNaN(Number(parts[1]))) {
            return { id: a.id, value_name: parts[0], unit_id: parts[1] };
          }
          // Se só tem número mas o atributo tem unit_id enviado separado
          if (parts.length === 1 && a.unit_id) {
            return { id: a.id, value_name: parts[0], unit_id: a.unit_id };
          }
          return { id: a.id, value_name: raw };
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
          category_id: dto.categoryId,
          condition: dto.condition,
          listing_type_id: dto.listingTypeId,
          currency_id: dto.currencyId ?? "BRL",
          buying_mode: dto.buyingMode ?? "buy_it_now",
          attributes,
          ...(dto.warrantyType || dto.warrantyTime
            ? {
                sale_terms: [
                  ...(dto.warrantyType
                    ? [{ id: "WARRANTY_TYPE", value_name: dto.warrantyType }]
                    : []),
                  ...(dto.warrantyTime
                    ? [{ id: "WARRANTY_TIME", value_name: dto.warrantyTime }]
                    : []),
                ],
              }
            : {}),
          ...(dto.pictureUrls && dto.pictureUrls.length > 0
            ? { pictures: dto.pictureUrls.map((url) => ({ source: url })) }
            : {}),
        },
        seller.accessToken,
      );
      mlItemId = mlItem.id;
      thumbnail = mlItem.thumbnail;
      permalink = mlItem.permalink;
      syncStatus = SyncStatus.SYNCED;
    } catch (err) {
      handleMlError(err, "Falha ao criar anúncio no Mercado Livre");
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
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
        handleMlError(err, "Falha ao atualizar anúncio no Mercado Livre");
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
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
        handleMlError(err, "Falha ao atualizar preço no Mercado Livre");
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
        await this.adsRepository.updateSyncStatus(id, SyncStatus.ERROR);
        handleMlError(err, "Falha ao atualizar estoque no Mercado Livre");
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
      try {
        await this.mlService.pauseItem(ad.mlItemId, seller.accessToken);
      } catch (err) {
        handleMlError(err, "Falha ao pausar anúncio no Mercado Livre");
      }
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
      try {
        await this.mlService.activateItem(ad.mlItemId, seller.accessToken);
      } catch (err) {
        handleMlError(err, "Falha ao ativar anúncio no Mercado Livre");
      }
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
      handleMlError(err, "Falha ao buscar anúncios do Mercado Livre");
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

  async getCategories(
    sellerId: string,
  ): Promise<{ id: string; name: string }[]> {
    const seller = await this.authRepository.findById(sellerId);
    if (!seller) throw new AppError("Vendedor não encontrado", 404);
    return this.mlService.getCategories(seller.accessToken);
  }

  async getCategoryDetails(sellerId: string, categoryId: string) {
    const seller = await this.authRepository.findById(sellerId);
    if (!seller) throw new AppError("Vendedor não encontrado", 404);
    return this.mlService.getCategoryDetails(categoryId, seller.accessToken);
  }

  async getCategoryAttributes(sellerId: string, categoryId: string) {
    const seller = await this.authRepository.findById(sellerId);
    if (!seller) throw new AppError("Vendedor não encontrado", 404);
    return this.mlService.getCategoryAttributes(categoryId, seller.accessToken);
  }

  async getCompetitors(sellerId: string, adId: string) {
    const seller = await this.authRepository.findById(sellerId);
    if (!seller) throw new AppError("Vendedor não encontrado", 404);

    const ad = await this.adsRepository.findById(adId, sellerId);
    if (!ad) throw new AppError("Anúncio não encontrado", 404);
    if (!ad.mlItemId) throw new AppError("Anúncio sem ID no Mercado Livre", 400);

    let categoryId: string | undefined;
    try {
      const mlItem = await this.mlService.getItem(ad.mlItemId, seller.accessToken);
      categoryId = mlItem.category_id;
    } catch (err) {
      logger.warn({ err, mlItemId: ad.mlItemId }, "Não foi possível buscar item no ML para getCompetitors");
    }

    if (!categoryId) {
      return {
        adId: ad._id,
        mlItemId: ad.mlItemId,
        title: ad.title,
        myPrice: ad.price,
        competitors: [],
        stats: { minPrice: null, maxPrice: null, avgPrice: null, count: 0 },
      };
    }

    let results: Awaited<ReturnType<typeof this.mlService.searchItems>> = [];
    try {
      results = await this.mlService.searchItems(
        ad.title,
        categoryId,
        seller.accessToken,
        20,
      );
    } catch (err) {
      logger.warn({ err }, "Não foi possível buscar concorrentes no ML");
    }

    const mlSellerId = seller.mlUserId ? Number(seller.mlUserId) : 0;
    const competitors = results.filter((r) => r.seller_id !== mlSellerId && r.id !== ad.mlItemId);

    const prices = competitors.map((c) => c.price);
    const minPrice = prices.length ? Math.min(...prices) : null;
    const maxPrice = prices.length ? Math.max(...prices) : null;
    const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;

    return {
      adId: ad._id,
      mlItemId: ad.mlItemId,
      title: ad.title,
      myPrice: ad.price,
      competitors: competitors.slice(0, 10),
      stats: { minPrice, maxPrice, avgPrice, count: competitors.length },
    };
  }
}
