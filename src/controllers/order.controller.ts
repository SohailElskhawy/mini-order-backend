import { Request, Response, NextFunction } from "express";
import { orderService } from "../services/order.service.js";

export class OrderController {
  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await orderService.createOrder(req.body);
      // Directly return 201 with order ID, items, total, and status
      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  }

  async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const order = await orderService.getOrderById(id);
      // Directly return the order and its items
      res.status(200).json(order);
    } catch (error) {
      next(error);
    }
  }

  async cancelOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const result = await orderService.cancelOrder(id);
      // Directly return cancelled order
      res.status(200).json(result);
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
