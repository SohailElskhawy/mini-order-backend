import { Request, Response, NextFunction } from "express";
import { productService } from "../services/product.service.js";

export class ProductController {
  async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const products = await productService.getAllProducts();
      // Directly return the array of products as per specification
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }

  async resetStock(req: Request, res: Response, next: NextFunction) {
    try {
      const stock = req.body?.stock ? Number(req.body.stock) : 10;
      const products = await productService.resetStock(stock);
      res.status(200).json(products);
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();
