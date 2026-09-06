import { prisma } from "../db/client.js";
import { CreateOrderInput } from "../schemas/order.schema.js";
import { ConflictError, NotFoundError } from "../errors/app-errors.js";

export class OrderService {
  /**
   * Creates an order with ACID transaction guarantees and concurrency protection.
   * Eliminates sequential for-loops inside the transaction by using a single atomic set-based SQL statement.
   */
  async createOrder(input: CreateOrderInput) {
    const { customerEmail, items } = input;

    // Sort items by productId to maintain deterministic lock order
    const sortedItems = [...items].sort((a, b) => a.productId - b.productId);
    const productIds = sortedItems.map((item) => item.productId);

    return prisma.$transaction(async (tx) => {
      // 1. Fetch current product information for all requested IDs in one query
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      // 2. Validate all products exist (404 for missing resource)
      const missingItem = sortedItems.find((item) => !productMap.has(item.productId));
      if (missingItem) {
        throw new NotFoundError(`Product with ID ${missingItem.productId} does not exist`);
      }

      // 3. Pre-check stock levels for descriptive error messages (409 for conflict)
      const insufficientItem = sortedItems.find((item) => {
        const product = productMap.get(item.productId)!;
        return product.stock < item.quantity;
      });

      if (insufficientItem) {
        const product = productMap.get(insufficientItem.productId)!;
        throw new ConflictError(
          `Insufficient stock for product "${product.name}" (ID: ${product.id}). Requested: ${insufficientItem.quantity}, Available: ${product.stock}`
        );
      }

      // 4. Single Atomic Set-Based Conditional Stock Decrement (ZERO for-loops):
      // Executes in a single SQL operation and locks all involved rows simultaneously
      const valuesSql = sortedItems
        .map((item) => `(${Number(item.productId)}::int, ${Number(item.quantity)}::int)`)
        .join(", ");

      const affectedCount = await tx.$executeRawUnsafe(`
        UPDATE products AS p
        SET stock = p.stock - v.qty
        FROM (VALUES ${valuesSql}) AS v(id, qty)
        WHERE p.id = v.id AND p.stock >= v.qty
      `);

      // If fewer rows were updated than requested items, at least one product had insufficient stock
      if (affectedCount !== sortedItems.length) {
        throw new ConflictError("Insufficient stock or concurrent update conflict");
      }

      // 5. Calculate total using verified integer cents from DB
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

      // 6. Create Order and nested OrderItems in a single database round-trip
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
        total: order.totalInCents,
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

    return {
      ...order,
      total: order.totalInCents,
    };
  }

  /**
   * Cancels an order and atomically restores product stock without sequential loops.
   */
  async cancelOrder(id: number) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch order with items
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundError(`Order with ID ${id} not found`);
      }

      // 2. Reject if already cancelled (409 Conflict)
      if (order.status === "cancelled") {
        throw new ConflictError(`Order with ID ${id} is already cancelled`);
      }

      // 3. Only orders with status 'placed' may be cancelled (409 Conflict on invalid state)
      if (order.status !== "placed") {
        throw new ConflictError(`Cannot cancel order with status "${order.status}"`);
      }

      // 4. Update order status to 'cancelled'
      const updatedOrder = await tx.order.update({
        where: { id },
        data: { status: "cancelled" },
      });

      // 5. Restore stock using a single atomic set-based SQL operation (ZERO for-loops)
      if (order.items.length > 0) {
        const restoreSql = order.items
          .map((item) => `(${Number(item.productId)}::int, ${Number(item.quantity)}::int)`)
          .join(", ");

        await tx.$executeRawUnsafe(`
          UPDATE products AS p
          SET stock = p.stock + v.qty
          FROM (VALUES ${restoreSql}) AS v(id, qty)
          WHERE p.id = v.id
        `);
      }

      return {
        id: updatedOrder.id,
        customerEmail: updatedOrder.customerEmail,
        status: updatedOrder.status,
        totalInCents: updatedOrder.totalInCents,
        total: updatedOrder.totalInCents,
        createdAt: updatedOrder.createdAt,
        items: order.items,
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
      data: orders.map((o) => ({ ...o, total: o.totalInCents })),
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
