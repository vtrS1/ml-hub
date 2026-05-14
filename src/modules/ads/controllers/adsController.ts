import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../../../shared/middlewares/authMiddleware.js";
import type { AdsService } from "../services/adsService.js";
import {
  createAdSchema,
  updateAdSchema,
  updatePriceSchema,
  updateStockSchema,
  listAdsQuerySchema,
} from "../dtos/adsDto.js";
import { AppError } from "../../../shared/errors/AppError.js";

export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  private getSellerId(req: AuthRequest): string {
    if (!req.sellerId) throw new AppError("Não autenticado", 401);
    return req.sellerId;
  }

  list = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const query = listAdsQuerySchema.parse(req.query);
      const result = await this.adsService.list(sellerId, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getById = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const id = String(req.params["id"]);
      const ad = await this.adsService.getById(id, sellerId);
      res.json(ad);
    } catch (err) {
      next(err);
    }
  };

  create = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const dto = createAdSchema.parse(req.body);
      const ad = await this.adsService.create(sellerId, dto);
      res.status(201).json(ad);
    } catch (err) {
      next(err);
    }
  };

  update = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const id = String(req.params["id"]);
      const dto = updateAdSchema.parse(req.body);
      const ad = await this.adsService.update(id, sellerId, dto);
      res.json(ad);
    } catch (err) {
      next(err);
    }
  };

  updatePrice = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const id = String(req.params["id"]);
      const dto = updatePriceSchema.parse(req.body);
      const ad = await this.adsService.updatePrice(id, sellerId, dto);
      res.json(ad);
    } catch (err) {
      next(err);
    }
  };

  updateStock = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const id = String(req.params["id"]);
      const dto = updateStockSchema.parse(req.body);
      const ad = await this.adsService.updateStock(id, sellerId, dto);
      res.json(ad);
    } catch (err) {
      next(err);
    }
  };

  pause = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const id = String(req.params["id"]);
      const ad = await this.adsService.pause(id, sellerId);
      res.json(ad);
    } catch (err) {
      next(err);
    }
  };

  activate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const id = String(req.params["id"]);
      const ad = await this.adsService.activate(id, sellerId);
      res.json(ad);
    } catch (err) {
      next(err);
    }
  };

  sync = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const result = await this.adsService.sync(sellerId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getCategories = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const categories = await this.adsService.getCategories(sellerId);
      res.json(categories);
    } catch (err) {
      next(err);
    }
  };

  getCategoryDetails = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const categoryId = String(req.params["categoryId"]);
      const details = await this.adsService.getCategoryDetails(
        sellerId,
        categoryId,
      );
      res.json(details);
    } catch (err) {
      next(err);
    }
  };

  getCategoryAttributes = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const categoryId = String(req.params["categoryId"]);
      const attributes = await this.adsService.getCategoryAttributes(
        sellerId,
        categoryId,
      );
      res.json(attributes);
    } catch (err) {
      next(err);
    }
  };

  getCompetitors = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sellerId = this.getSellerId(req);
      const id = String(req.params["id"]);
      const result = await this.adsService.getCompetitors(sellerId, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
