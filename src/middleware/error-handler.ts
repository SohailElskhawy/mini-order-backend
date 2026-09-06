import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-errors.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      message: err.message,
      statusCode: err.statusCode,
      details: err.details ?? null,
    });
    return;
  }

  if (err instanceof ZodError) {
    const errorDetails = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    const message = err.issues.map((i) => i.message).join("; ") || "Validation failed";

    res.status(400).json({
      error: message,
      message: message,
      statusCode: 400,
      details: errorDetails,
    });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: "Malformed JSON payload",
      message: "Malformed JSON payload",
      statusCode: 400,
    });
    return;
  }

  console.error("Unhandled exception:", err);

  res.status(500).json({
    error: "Internal Server Error",
    message: "Internal Server Error",
    statusCode: 500,
  });
};
