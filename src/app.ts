import express, { Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import productRoutes from "./routes/product.routes.js";
import orderRoutes from "./routes/order.routes.js";
import simulationRoutes from "./routes/simulation.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { NotFoundError } from "./errors/app-errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): Express {
  const app = express();

  // Standard middleware
  app.use(cors());
  app.use(express.json());

  // Serve static files for the interactive simulator UI
  const publicDir = path.join(__dirname, "../public");
  app.use(express.static(publicDir));

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Core API routes
  app.use("/products", productRoutes);
  app.use("/orders", orderRoutes);
  app.use("/api/simulation", simulationRoutes);

  // 404 Handler for unmatched routes
  app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}
