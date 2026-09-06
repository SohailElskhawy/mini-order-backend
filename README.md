# Mini Order & Inventory Backend with Interactive Simulator

A production-grade, transaction-safe backend for order and inventory management built with **Node.js**, **Express 5**, **TypeScript**, **Prisma ORM**, and **PostgreSQL**.

Includes a built-in **Interactive Web Simulator & Query Inspector** that demonstrates real-time ACID transactions, conditional concurrency locking, and live state transitions.

---

## 🏛 Architecture & Engineering Principles

- **SOLID Principles**:
  - **S (Single Responsibility):** Pure separation across Routes, Controllers, Business Services, and Database layer.
  - **O (Open/Closed):** Modular services and extensible validation schemas without mutating core transaction engines.
  - **L (Liskov Substitution):** Uniform handler signatures and consistent error representations.
  - **I (Interface Segregation):** Focused types and isolated DTOs for order creation, cancellation, and simulation.
  - **D (Dependency Inversion):** Decoupled business logic from Express `req`/`res` objects.
- **DRY (Don't Repeat Yourself):** Reusable Zod schema validators (`validateBody`, `validateParams`) and a centralized `AppError` hierarchy (`BadRequestError`, `NotFoundError`, `ConflictError`).
- **KISS & YAGNI:** No unnecessary brokers or complex microservices. Pure, robust PostgreSQL ACID transactions with conditional atomic locking.
- **Express Best Practices:** Clean middleware stack, strict REST HTTP status codes (`200`, `201`, `400`, `404`, `409`), native async error propagation, and graceful server teardown (`SIGINT`/`SIGTERM`).

---

## 🗄 Database Schema (3 Tables)

| Table | Primary Columns | Purpose |
|---|---|---|
| `products` | `id`, `name`, `priceInCents`, `stock` | Single source of truth for products, integer pricing, and available stock. |
| `orders` | `id`, `customerEmail`, `status`, `totalInCents`, `createdAt` | Tracks orders, total in integer cents, and status (`placed` \| `cancelled`). |
| `order_items` | `id`, `orderId`, `productId`, `quantity`, `unitPriceInCents` | Immutable line items recording historical price snapshots at purchase time. |

---

## 🚀 Quick Startup Guide

### 1. Prerequisites
- **Node.js** (v20+ or v24+)
- **PostgreSQL** (running locally or via Podman / Docker)

### 2. Start PostgreSQL Container
If you have `podman` or `docker`:
```bash
# Using Podman
podman run -d --name pg-mini-order -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mini_order_db -p 5432:5432 docker.io/library/postgres:16-alpine

# OR using Docker
docker run -d --name pg-mini-order -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mini_order_db -p 5432:5432 postgres:16-alpine
```

### 3. Install & Setup Database
```bash
cd mini-order-backend

# Install dependencies
npm install

# Push Prisma schema to PostgreSQL
npm run prisma:generate
npx prisma db push

# Seed 5 products from DummyJSON (stock initialized to 10)
npm run prisma:seed
```

### 4. Run Automated Tests
Runs all 15 automated test cases including the 6 required scenarios and the concurrency race condition test:
```bash
npm test
```

### 5. Start the Server & Simulator
```bash
npm run dev
```
Open your browser at:
👉 **`http://localhost:3000/`** — **Interactive Simulator & Query Inspector**

---

## ☁️ Deployment Guide (Render.com)

The project is pre-configured and tested for 1-click or manual deployment on **Render**:

### Option 1: Automatic Blueprint Deployment (`render.yaml`)
1. Push this repository to GitHub.
2. Log into [Render](https://dashboard.render.com/) and click **New +** $\to$ **Blueprint**.
3. Select your repository.
4. Render automatically detects [`render.yaml`](file:///home/sohailelskhawy/work/istanbul-core-frontend/backend/mini-order-backend/render.yaml), provisions a **free PostgreSQL database**, builds the backend, migrates the schema, seeds initial products, and binds the environment variables.

### Option 2: Manual Web Service Setup on Render
1. Create a **PostgreSQL Database** on Render:
   - Name: `mini-order-db`
   - Copy the **Internal Database URL** (e.g. `postgresql://...`).
2. Create a **Web Service** on Render:
   - **Root Directory:** `backend/mini-order-backend` (or `.` if repo root is the backend folder)
   - **Environment:** `Node`
   - **Build Command:** `npm run render-build`
   - **Start Command:** `npm run start:render`
3. Add Environment Variables in the Web Service settings:
   - `DATABASE_URL`: *(paste the Internal Database URL from Step 1)*
   - `NODE_ENV`: `production`

> **Note on Port:** Render automatically assigns the `PORT` environment variable (typically `10000`), which our server reads dynamically via [`src/config/env.ts`](file:///home/sohailelskhawy/work/istanbul-core-frontend/backend/mini-order-backend/src/config/env.ts).


## 📡 API Endpoints

### 1. `GET /products`
Returns all products with current prices and available stock.
- **Response `200 OK`**:
```json
{
  "data": [
    { "id": 1, "name": "Essence Mascara Lash Princess", "priceInCents": 999, "stock": 10 },
    { "id": 2, "name": "Eyeshadow Palette with Mirror", "priceInCents": 1999, "stock": 10 }
  ]
}
```

### 2. `POST /orders`
Places an order with full ACID transaction guarantees and concurrency protection.
- **Request**:
```json
{
  "customerEmail": "student@example.com",
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 2, "quantity": 1 }
  ]
}
```
- **Response `201 Created`**:
```json
{
  "message": "Order placed successfully",
  "data": {
    "id": 1,
    "customerEmail": "student@example.com",
    "status": "placed",
    "totalInCents": 3997,
    "createdAt": "2026-09-06T12:00:00.000Z",
    "items": [
      { "id": 1, "productId": 1, "quantity": 2, "unitPriceInCents": 999 },
      { "id": 2, "productId": 2, "quantity": 1, "unitPriceInCents": 1999 }
    ]
  }
}
```
- **Error Responses**:
  - `400 Bad Request`: Invalid email, non-positive quantity, empty items, or duplicate product IDs.
  - `404 Not Found`: One or more requested products do not exist.
  - `409 Conflict`: Insufficient stock available.

### 3. `GET /orders/:id`
Returns the order and its items. Returns `404` if not found.

### 4. `POST /orders/:id/cancel`
Atomically cancels a `placed` order and restores inventory back to the database.
- **Response `200 OK`**:
```json
{
  "message": "Order successfully cancelled and stock restored",
  "data": {
    "id": 1,
    "status": "cancelled",
    "totalInCents": 3997
  }
}
```
- **Guard**: Returns `409 Conflict` if the order is already cancelled. Never restores stock twice.

### 5. `GET /orders` *(Bonus Feature)*
Paginated order listing with optional status filtering (e.g. `?status=placed&page=1&limit=10`).

---

## 🧪 Demonstration of Correctness (All 6 Cases Covered)

| Case | Scenario | Tested In | Result |
|---|---|---|---|
| **1** | Ordering 2 units reduces stock from 10 to 8 | `tests/order-correctness.test.ts` | ✅ Stock drops 10 → 8 |
| **2** | Server computes correct total in integer cents | `tests/order-correctness.test.ts` | ✅ Accurate integer math (no float drift) |
| **3** | Ordering > available stock returns 409 | `tests/order-correctness.test.ts` | ✅ `409 Conflict`, stock unchanged |
| **4** | Multi-item atomic rollback on failure | `tests/order-correctness.test.ts` | ✅ All-or-nothing rollback in transaction |
| **5** | Cancelling restores stock | `tests/order-correctness.test.ts` | ✅ Stock restored to 10 |
| **6** | Double cancellation guard | `tests/order-correctness.test.ts` | ✅ `409 Conflict`, stock not restored twice |
| **Bonus** | Concurrency race condition prevention | `tests/order-correctness.test.ts` | ✅ Conditional atomic updates prevent oversell |

---

## 🎮 The Interactive Simulator

The simulator is served at `http://localhost:3000/` and provides:
1. **Live State Visualizer**: Real-time view of `products`, `orders`, and `order_items`.
2. **One-Click Scenarios**: Execute cases 1 through 6 + high-concurrency race condition tests with one click.
3. **Transaction & Query Inspector**: Visualizes the HTTP request, PostgreSQL query trace (`BEGIN`, conditional `UPDATE`, `INSERT`, `COMMIT`), and server response in real time.
4. **Custom Order Form**: Build any multi-item order and test server-side calculations.
