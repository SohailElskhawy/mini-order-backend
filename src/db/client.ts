import { PrismaClient } from "@prisma/client";

export interface DatabaseEvent {
  id: string;
  timestamp: string;
  query: string;
  params: string;
  durationMs: number;
}

const MAX_LOG_EVENTS = 100;
export const databaseEvents: DatabaseEvent[] = [];

export const prisma = new PrismaClient({
  log: [
    { level: "query", emit: "event" },
    { level: "info", emit: "stdout" },
    { level: "warn", emit: "stdout" },
    { level: "error", emit: "stdout" },
  ],
});

// Capture Prisma SQL queries for the simulator visualizer
prisma.$on("query" as never, (e: { query: string; params: string; duration: number }) => {
  const event: DatabaseEvent = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    query: e.query,
    params: e.params,
    durationMs: e.duration,
  };

  databaseEvents.push(event);
  if (databaseEvents.length > MAX_LOG_EVENTS) {
    databaseEvents.shift();
  }
});
