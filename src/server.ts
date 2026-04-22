import express from "express";
import pino from "pino";

import { loadConfig } from "./config.js";
import { SchoolRegistry } from "./domain/schoolRegistry.js";
import { createSchoolApiClient } from "./integrations/schoolApi.js";
import { LinkRepository } from "./repositories/linkRepository.js";
import { SessionRepository } from "./repositories/sessionRepository.js";
import { createDeepLinkHandler } from "./router/deepLinkRouter.js";
import { VkBotGateway } from "./vk/bot.js";
import { createVkCallbackHandler } from "./vk/callbackHandler.js";
import { RegisterFlowService } from "./vk/flow/registerFlow.js";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

const config = loadConfig();
const schoolRegistry = new SchoolRegistry(config.schools);
const linkRepository = new LinkRepository();
const sessionRepository = new SessionRepository();
const botGateway = new VkBotGateway(config.schools);

const registerFlow = new RegisterFlowService({
  logger,
  botGateway,
  linkRepository,
  sessionRepository,
  schoolApiFactory: (school) =>
    createSchoolApiClient({
      mode: config.schoolApiMode,
      apiBaseUrl: school.apiBaseUrl,
      apiKey: school.apiKey,
      timeoutMs: config.schoolApiTimeoutMs,
    }),
});

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    schools: schoolRegistry.all().length,
  });
});

app.get("/s/:schoolId", createDeepLinkHandler(schoolRegistry));
app.post(
  "/vk/callback",
  createVkCallbackHandler({
    logger,
    schoolRegistry,
    registerFlow,
  }),
);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ error }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      publicBaseUrl: config.publicBaseUrl,
      schools: config.schools.map((school) => ({
        id: school.id,
        slug: school.slug,
        vkGroupId: school.vkGroupId,
      })),
    },
    "VK multi-school bot service started",
  );
});
