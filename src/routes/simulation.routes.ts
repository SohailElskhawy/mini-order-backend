import { Router, Request, Response, NextFunction } from "express";
import { prisma, databaseEvents } from "../db/client.js";
import { productService } from "../services/product.service.js";
import { orderService } from "../services/order.service.js";

const router = Router();

// Retrieve full live database snapshot + query logs for the simulator UI
router.get("/state", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [products, orders, totalOrders] = await Promise.all([
      productService.getAllProducts(),
      prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      prisma.order.count(),
    ]);

    res.status(200).json({
      products,
      orders,
      totalOrders,
      databaseEvents: [...databaseEvents].reverse().slice(0, 30),
    });
  } catch (error) {
    next(error);
  }
});

// Clear orders and reset product stock back to 10
router.post("/reset", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany();
      await tx.order.deleteMany();
      await tx.product.updateMany({
        data: { stock: 10 },
      });
    });

    databaseEvents.length = 0; // Clear logged queries

    res.status(200).json({
      message: "Database state reset: all orders cleared, all products set to stock = 10",
    });
  } catch (error) {
    next(error);
  }
});

// Run live concurrency race condition simulation
router.post("/concurrency-test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const targetProductId = req.body.productId ? Number(req.body.productId) : 1;
    const requestedQty = req.body.quantity ? Number(req.body.quantity) : 6;

    // Concurrently trigger two orders where both want 'requestedQty' (e.g., 6 + 6 = 12 > 10)
    const [order1Result, order2Result] = await Promise.allSettled([
      orderService.createOrder({
        customerEmail: "concurrent.alice@example.com",
        items: [{ productId: targetProductId, quantity: requestedQty }],
      }),
      orderService.createOrder({
        customerEmail: "concurrent.bob@example.com",
        items: [{ productId: targetProductId, quantity: requestedQty }],
      }),
    ]);

    res.status(200).json({
      message: "Concurrent orders executed simultaneously",
      order1:
        order1Result.status === "fulfilled"
          ? { status: "success", data: order1Result.value }
          : { status: "rejected (prevented oversell)", error: (order1Result.reason as Error).message },
      order2:
        order2Result.status === "fulfilled"
          ? { status: "success", data: order2Result.value }
          : { status: "rejected (prevented oversell)", error: (order2Result.reason as Error).message },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
