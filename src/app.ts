import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { requireApiKey } from "./middleware/auth.js";
import { logger } from "./lib/logger.js";
import badgesRouter from "./routes/badges.js";
import assertionsRouter from "./routes/assertions.js";
import webhooksRouter from "./routes/webhooks.js";
import publicRouter from "./routes/public.js";

const app = express();

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-API-Key", "X-Webhook-Signature"],
  })
);

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Public routes (no auth)
app.use(publicRouter);

// Protected routes (require X-API-Key)
app.use("/api/v1/badges", requireApiKey, badgesRouter);
app.use("/api/v1/assertions", requireApiKey, assertionsRouter);
app.use("/api/v1/webhooks", requireApiKey, webhooksRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Global error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  logger.error({ err }, "unhandled_error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
