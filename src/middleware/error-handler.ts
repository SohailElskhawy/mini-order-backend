import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-errors.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        statusCode: err.statusCode,
        details: err.details ?? null,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const formattedErrors = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));

    res.status(400).json({
      error: {
        message: "Validation failed",
        statusCode: 400,
        details: formattedErrors,
      },
    });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: {
        message: "Malformed JSON payload",
        statusCode: 400,
      },
    });
    return;
  }

  console.error("Unhandled exception:", err);

  res.status(500).json({
    error: {
      message: "Internal server error",
      statusCode: 500,
    },
  });
};
