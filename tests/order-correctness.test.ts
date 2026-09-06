import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { seedProducts } from "../prisma/seed.js";

const app = createApp();

describe("Mini Order & Inventory API - Correctness & ACID Tests", () => {
  // Before each test, reset database state to guaranteed baseline: stock = 10 for all 5 products, 0 orders
  beforeEach(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany();
      await tx.order.deleteMany();
    });
    await seedProducts(true);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Product Catalog (GET /products)", () => {
    it("returns array of 5 products with current prices and available stock = 10", async () => {
      const res = await request(app).get("/products");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(5);
      expect(res.body[0]).toHaveProperty("id");
      expect(res.body[0]).toHaveProperty("name");
      expect(res.body[0]).toHaveProperty("priceInCents");
      expect(res.body[0].stock).toBe(10);
    });
  });

  describe("Order Placement & ACID Correctness (Requirements 1-4)", () => {
    // Case 1: Ordering two units reduces stock from 10 to 8.
    it("Case 1: Ordering two units reduces stock from 10 to 8", async () => {
      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [{ productId: 1, quantity: 2 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("placed");
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].quantity).toBe(2);

      // Verify stock in database
      const product = await prisma.product.findUnique({ where: { id: 1 } });
      expect(product?.stock).toBe(8);
    });

    // Case 2: The server calculates the correct total.
    it("Case 2: The server calculates the correct total in integer cents", async () => {
      // Product 1 = 999 cents ($9.99), Product 2 = 1999 cents ($19.99)
      // Total for 2 * 999 + 1 * 1999 = 1998 + 1999 = 3997 cents
      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [
            { productId: 1, quantity: 2 },
            { productId: 2, quantity: 1 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.totalInCents).toBe(3997);
      expect(res.body.total).toBe(3997);
      expect(res.body.items[0].unitPriceInCents).toBe(999);
      expect(res.body.items[1].unitPriceInCents).toBe(1999);
    });

    // Case 3: Ordering more than available stock returns 409.
    it("Case 3: Ordering more than available stock returns 409 Conflict", async () => {
      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [{ productId: 1, quantity: 15 }], // available is 10
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("Insufficient stock");

      // Verify stock remains untouched at 10
      const product = await prisma.product.findUnique({ where: { id: 1 } });
      expect(product?.stock).toBe(10);
    });

    // Case 4: If the second item fails, the first item’s stock stays unchanged and no order is saved.
    it("Case 4: Atomic rollback - if second item fails, first item stock stays unchanged and no order is saved", async () => {
      const ordersBefore = await prisma.order.count();

      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [
            { productId: 1, quantity: 3 },  // Product 1 has 10 (sufficient)
            { productId: 2, quantity: 20 }, // Product 2 has 10 (exceeds stock -> fails)
          ],
        });

      expect(res.status).toBe(409);

      // Verify Product 1 stock was NOT decremented (rolled back to 10)
      const product1 = await prisma.product.findUnique({ where: { id: 1 } });
      const product2 = await prisma.product.findUnique({ where: { id: 2 } });
      expect(product1?.stock).toBe(10);
      expect(product2?.stock).toBe(10);

      // Verify no order was saved to the database
      const ordersAfter = await prisma.order.count();
      expect(ordersAfter).toBe(ordersBefore);
    });
  });

  describe("Order Cancellation & Double-Cancel Guard (Requirements 5-6)", () => {
    // Case 5: Cancelling restores stock.
    it("Case 5: Cancelling restores stock", async () => {
      // 1. Create order for 3 units
      const createRes = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [{ productId: 1, quantity: 3 }],
        });

      expect(createRes.status).toBe(201);
      const orderId = createRes.body.id;

      // Stock should now be 7
      let product = await prisma.product.findUnique({ where: { id: 1 } });
      expect(product?.stock).toBe(7);

      // 2. Cancel the order
      const cancelRes = await request(app).post(`/orders/${orderId}/cancel`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe("cancelled");

      // 3. Verify stock restored to 10
      product = await prisma.product.findUnique({ where: { id: 1 } });
      expect(product?.stock).toBe(10);
    });

    // Case 6: Cancelling again does not increase stock.
    it("Case 6: Cancelling an already cancelled order returns 409 and never increases stock twice", async () => {
      // 1. Create order
      const createRes = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [{ productId: 1, quantity: 4 }],
        });
      const orderId = createRes.body.id;

      // 2. First cancellation (succeeds, stock: 6 -> 10)
      const cancel1 = await request(app).post(`/orders/${orderId}/cancel`);
      expect(cancel1.status).toBe(200);
      expect(cancel1.body.status).toBe("cancelled");

      let product = await prisma.product.findUnique({ where: { id: 1 } });
      expect(product?.stock).toBe(10);

      // 3. Second cancellation (must fail with 409 Conflict)
      const cancel2 = await request(app).post(`/orders/${orderId}/cancel`);
      expect(cancel2.status).toBe(409);
      expect(cancel2.body.error).toContain("already cancelled");

      // 4. Verify stock is STILL 10 (not 14!)
      product = await prisma.product.findUnique({ where: { id: 1 } });
      expect(product?.stock).toBe(10);
    });
  });

  describe("Validation & Missing Resource Checks (400 and 404 rules)", () => {
    it("returns 400 when email is invalid", async () => {
      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "not-an-email",
          items: [{ productId: 1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns 400 when items array is empty", async () => {
      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns 400 when quantity is zero or negative", async () => {
      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [{ productId: 1, quantity: 0 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns 400 when duplicate productId is provided in items", async () => {
      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [
            { productId: 1, quantity: 1 },
            { productId: 1, quantity: 2 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Duplicate productId");
    });

    it("returns 404 when ordering a non-existent product", async () => {
      const res = await request(app)
        .post("/orders")
        .send({
          customerEmail: "student@example.com",
          items: [{ productId: 99999, quantity: 1 }],
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("does not exist");
    });

    it("returns 404 when GET /orders/:id does not exist", async () => {
      const res = await request(app).get("/orders/999999");
      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });

    it("returns 404 when cancelling a non-existent order", async () => {
      const res = await request(app).post("/orders/999999/cancel");
      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });
  });

  describe("Bonus: Concurrency Control (Race Condition Prevention)", () => {
    it("prevents overselling when two orders arrive simultaneously for limited stock", async () => {
      // Product 1 currently has stock = 10
      // Request 1 asks for 7 units, Request 2 asks for 7 units (total 14 > 10)
      const [res1, res2] = await Promise.all([
        request(app)
          .post("/orders")
          .send({
            customerEmail: "concurrent.buyer1@example.com",
            items: [{ productId: 1, quantity: 7 }],
          }),
        request(app)
          .post("/orders")
          .send({
            customerEmail: "concurrent.buyer2@example.com",
            items: [{ productId: 1, quantity: 7 }],
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // One order MUST succeed (201) and one order MUST be rejected with conflict (409)
      expect(statuses).toEqual([201, 409]);

      // Product stock must now be 3 (10 - 7 = 3), never negative!
      const product = await prisma.product.findUnique({ where: { id: 1 } });
      expect(product?.stock).toBe(3);
    });
  });
});
