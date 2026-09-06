import { prisma } from "../db/client.js";
import { NotFoundError } from "../errors/app-errors.js";

export class ProductService {
  async getAllProducts() {
    return prisma.product.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        priceInCents: true,
        stock: true,
      },
    });
  }

  async getProductById(id: number) {
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        priceInCents: true,
        stock: true,
      },
    });

    if (!product) {
      throw new NotFoundError(`Product with ID ${id} not found`);
    }

    return product;
  }

  async resetStock(stockValue: number = 10) {
    await prisma.product.updateMany({
      data: { stock: stockValue },
    });
    return this.getAllProducts();
  }
}

export const productService = new ProductService();
