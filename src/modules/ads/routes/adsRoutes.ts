import { Router } from "express";
import { authMiddleware } from "../../../shared/middlewares/authMiddleware.js";
import { MercadoLivreService } from "../../mercadolivre/mercadolivreService.js";
import { AuthRepository } from "../../auth/repositories/authRepository.js";
import { AdsRepository } from "../repositories/adsRepository.js";
import { AdsService } from "../services/adsService.js";
import { AdsController } from "../controllers/adsController.js";

const router = Router();

const mlService = new MercadoLivreService();
const authRepository = new AuthRepository();
const adsRepository = new AdsRepository();
const adsService = new AdsService(adsRepository, authRepository, mlService);
const adsController = new AdsController(adsService);

router.use(authMiddleware);

router.post("/sync", adsController.sync);
router.get("/categories", adsController.getCategories);
router.get("/categories/:categoryId", adsController.getCategoryDetails);
router.get(
  "/categories/:categoryId/attributes",
  adsController.getCategoryAttributes,
);
router.get("/", adsController.list);
router.get("/:id", adsController.getById);
router.post("/", adsController.create);
router.put("/:id", adsController.update);
router.patch("/:id/price", adsController.updatePrice);
router.patch("/:id/stock", adsController.updateStock);
router.post("/:id/pause", adsController.pause);
router.post("/:id/activate", adsController.activate);

export default router;
