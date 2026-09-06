import { Request, Response, NextFunction } from "express";
import { orderService } from "../services/order.service.js";

export class OrderController {
  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await orderService.createOrder(req.body);
      res.status(201).json({
        message: "Order placed successfully",
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const order = await orderService.getOrderById(id);
      res.status(200).json({
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const result = await orderService.cancelOrder(id);
      res.status(200).json({
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async listOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, page, limit } = req.query;
      const result = await orderService.listOrders({
        status: status ? String(status) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const orderController = new OrderController();
