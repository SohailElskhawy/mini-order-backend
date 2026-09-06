import { prisma } from "../db/client.js";
import { CreateOrderInput } from "../schemas/order.schema.js";
import { BadRequestError, ConflictError, NotFoundError } from "../errors/app-errors.js";

export class OrderService {
  /**
   * Creates an order with ACID transaction guarantees and concurrency protection.
   * Prevents overselling using conditional atomic stock decrement.
   */
  async createOrder(input: CreateOrderInput) {
    const { customerEmail, items } = input;

    // Sort items by productId to avoid deadlock on concurrent multi-item transactions
    const sortedItems = [...items].sort((a, b) => a.productId - b.productId);
    const productIds = sortedItems.map((item) => item.productId);

    return prisma.$transaction(async (tx) => {
      // 1. Fetch current product information for all requested IDs from the database
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      // 2. Ensure all requested products exist in the database
      for (const item of sortedItems) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new NotFoundError(`Product with ID ${item.productId} does not exist`);
        }

        // Initial pre-check on stock for clearer error messages
        if (product.stock < item.quantity) {
          throw new ConflictError(
            `Insufficient stock for product "${product.name}" (ID: ${product.id}). Requested: ${item.quantity}, Available: ${product.stock}`
          );
        }
      }

      // 3. Concurrency Protection & Atomic Stock Reduction:
      // Perform conditional atomic decrement (UPDATE ... WHERE id = :id AND stock >= :qty)
      for (const item of sortedItems) {
        const product = productMap.get(item.productId)!;
        const updateResult = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: {
            stock: { decrement: item.quantity },
          },
        });

        // If count === 0, another concurrent transaction depleted the stock first!
        if (updateResult.count === 0) {
          throw new ConflictError(
            `Insufficient stock for product "${product.name}" (ID: ${product.id}) due to concurrent order`
          );
        }
      }

      // 4. Calculate total in integer cents using verified prices from DB (never client-supplied)
      const orderItemsData = sortedItems.map((item) => {
        const product = productMap.get(item.productId)!;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPriceInCents: product.priceInCents,
        };
      });

      const totalInCents = orderItemsData.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceInCents,
        0
      );

      // 5. Create Order with status "placed" and insert its items
      const order = await tx.order.create({
        data: {
          customerEmail,
          status: "placed",
          totalInCents,
          items: {
            create: orderItemsData,
          },
        },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPriceInCents: true,
            },
          },
        },
      });

      return {
        id: order.id,
        customerEmail: order.customerEmail,
        status: order.status,
        totalInCents: order.totalInCents,
        createdAt: order.createdAt,
        items: order.items,
      };
    });
  }

  /**
   * Retrieve order details and its items by ID.
   */
  async getOrderById(id: number) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${id} not found`);
    }

    return order;
  }

  /**
   * Cancels an order and atomically restores product stock.
   */
  async cancelOrder(id: number) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch order with its items
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID ${id} not found`);
      }

      // 2. Reject if already cancelled (never restore stock twice)
      if (order.status === "cancelled") {
        throw new ConflictError(`Order with ID ${id} is already cancelled`);
      }

      // 3. Only orders with status 'placed' may be cancelled
      if (order.status !== "placed") {
        throw new BadRequestError(`Cannot cancel order with status "${order.status}"`);
      }

      // 4. Update order status to 'cancelled'
      const updatedOrder = await tx.order.update({
        where: { id },
        data: { status: "cancelled" },
      });

      // 5. Restore stock for each item in the order
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantity },
          },
        });
      }

      return {
        id: updatedOrder.id,
        customerEmail: updatedOrder.customerEmail,
        status: updatedOrder.status,
        totalInCents: updatedOrder.totalInCents,
        message: "Order successfully cancelled and stock restored",
        restoredItems: order.items.map((i) => ({
          productId: i.productId,
          restoredQuantity: i.quantity,
        })),
      };
    });
  }

  /**
   * List orders with optional status filter and pagination (Bonus feature).
   */
  async listOrders(params?: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.min(50, Math.max(1, params?.limit ?? 10));
    const skip = (page - 1) * limit;

    const where = params?.status ? { status: params.status } : {};

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
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
    ]);

    return {
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export const orderService = new OrderService();
