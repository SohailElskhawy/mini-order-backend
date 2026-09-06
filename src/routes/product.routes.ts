import { Router } from "express";
import { productController } from "../controllers/product.controller.js";

const router = Router();

router.get("/", (req, res, next) => productController.getProducts(req, res, next));
router.post("/reset-stock", (req, res, next) => productController.resetStock(req, res, next));

export default router;
