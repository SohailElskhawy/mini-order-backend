import { z } from "zod";

export const orderItemInputSchema = z.object({
  productId: z
    .number({ required_error: "productId is required" })
    .int("productId must be an integer")
    .positive("productId must be a positive integer"),
  quantity: z
    .number({ required_error: "quantity is required" })
    .int("quantity must be an integer")
    .positive("quantity must be a positive integer"),
});

export const createOrderSchema = z
  .object({
    customerEmail: z
      .string({ required_error: "customerEmail is required" })
      .trim()
      .email("Invalid email address"),
    items: z
      .array(orderItemInputSchema)
      .min(1, "Order must contain at least one item"),
  })
  .superRefine((data, ctx) => {
    // Reject duplicate product IDs in the same order
    const seenProductIds = new Set<number>();
    for (let i = 0; i < data.items.length; i++) {
      const productId = data.items[i].productId;
      if (seenProductIds.has(productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate productId ${productId} is not allowed in order items`,
          path: ["items", i, "productId"],
        });
      }
      seenProductIds.add(productId);
    }
  });

export const orderIdParamSchema = z.object({
  id: z.coerce
    .number({ required_error: "Order id is required" })
    .int("Order id must be an integer")
    .positive("Order id must be a positive integer"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
