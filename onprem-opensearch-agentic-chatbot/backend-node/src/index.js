import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { chatHandler } from "./api/chatHandler.js";
import { diagnosticsHandler } from "./api/diagnosticsHandler.js";

const app = express();

app.use(cors({ origin: config.app.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Optional: checks OpenSearch + LLM availability (best-effort)
app.get("/diagnostics", diagnosticsHandler);

app.post("/chat", chatHandler);

app.listen(config.app.port, () => {
  logger.info({ port: config.app.port }, "Backend Node.js listening");
});
