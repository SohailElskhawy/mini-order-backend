import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Mini Order & Inventory Backend Running`);
  console.log(`📡 API URL:        http://localhost:${env.PORT}`);
  console.log(`🎮 Simulator UI:   http://localhost:${env.PORT}/`);
  console.log(`📦 Database:       PostgreSQL (mini_order_db)`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
const handleShutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log("HTTP server closed.");
    try {
      await prisma.$disconnect();
      console.log("Database connection closed.");
      process.exit(0);
    } catch (err) {
      console.error("Error disconnecting database:", err);
      process.exit(1);
    }
  });
};

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
