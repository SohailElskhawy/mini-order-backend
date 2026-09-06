import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface DummyProduct {
  id: number;
  title: string;
  price: number;
}

interface DummyJsonResponse {
  products: DummyProduct[];
}

export async function seedProducts(force: boolean = false) {
  const existingCount = await prisma.product.count();
  if (existingCount >= 5 && !force) {
    console.log(`Database already contains ${existingCount} products. Skipping seeding to preserve current stock.`);
    return;
  }

  console.log("Fetching products from DummyJSON API...");
  const response = await fetch("https://dummyjson.com/products?limit=5");
  
  if (!response.ok) {
    throw new Error(`Failed to fetch from DummyJSON: ${response.statusText}`);
  }

  const data = (await response.json()) as DummyJsonResponse;

  console.log(`Fetched ${data.products.length} products. Seeding into PostgreSQL...`);

  for (const product of data.products) {
    const priceInCents = Math.round(product.price * 100);
    
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        name: product.title,
        priceInCents,
        stock: 10,
      },
      create: {
        id: product.id,
        name: product.title,
        priceInCents,
        stock: 10,
      },
    });

    console.log(`✓ Seeded Product [${product.id}]: "${product.title}" - $${(priceInCents / 100).toFixed(2)} (${priceInCents} cents), Stock: 10`);
  }

  // Synchronize PostgreSQL sequence with max id
  try {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE((SELECT MAX(id) FROM products), 1), true);`
    );
  } catch (err) {
    // Non-fatal if sequence cannot be reset
  }

  console.log("Seeding complete! Database is now the source of truth.");
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  seedProducts()
    .catch((error) => {
      console.error("Error during seeding:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
