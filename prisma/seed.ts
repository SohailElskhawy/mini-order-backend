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

  console.log(`Fetched ${data.products.length} products. Batch seeding into PostgreSQL...`);

  // Batch upsert in a single SQL statement (zero for-loops)
  const values = data.products
    .map((product) => {
      const priceInCents = Math.round(product.price * 100);
      const escapedName = product.title.replace(/'/g, "''");
      return `(${product.id}::int, '${escapedName}', ${priceInCents}::int, 10::int)`;
    })
    .join(", ");

  await prisma.$executeRawUnsafe(`
    INSERT INTO products (id, name, "priceInCents", stock)
    VALUES ${values}
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      "priceInCents" = EXCLUDED."priceInCents",
      stock = EXCLUDED.stock;
  `);

  // Synchronize PostgreSQL sequence with max id
  try {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('products', 'id'), COALESCE((SELECT MAX(id) FROM products), 1), true);`
    );
  } catch (err) {
    // Non-fatal if sequence cannot be reset
  }

  console.log("Batch seeding complete! Database is now the source of truth.");
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  seedProducts(true)
    .catch((error) => {
      console.error("Error during seeding:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
