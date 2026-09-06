import { Router } from "express";
import { orderController } from "../controllers/order.controller.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { createOrderSchema, orderIdParamSchema } from "../schemas/order.schema.js";

const router = Router();

// Bonus endpoint: List orders with optional status filter & pagination
router.get("/", (req, res, next) => orderController.listOrders(req, res, next));

// Core required endpoints
router.post("/", validateBody(createOrderSchema), (req, res, next) =>
  orderController.createOrder(req, res, next)
);

router.get("/:id", validateParams(orderIdParamSchema), (req, res, next) =>
  orderController.getOrderById(req, res, next)
);

router.post("/:id/cancel", validateParams(orderIdParamSchema), (req, res, next) =>
  orderController.cancelOrder(req, res, next)
);

export default router;
