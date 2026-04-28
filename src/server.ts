import express from "express";
import path from "node:path";
import pino from "pino";
import { ZodError } from "zod";

import { loadConfig } from "./config.js";
import { SchoolRegistry } from "./domain/schoolRegistry.js";
import { JsonMockCampaignsProvider } from "./integrations/jsonMockCampaignsProvider.js";
import { createSchoolApiClient } from "./integrations/schoolApi.js";
import { CampaignResponseRepository } from "./repositories/campaignResponseRepository.js";
import { LinkRepository } from "./repositories/linkRepository.js";
import { createMockCampaignsRouter } from "./router/mockCampaignsRouter.js";
import { SessionRepository } from "./repositories/sessionRepository.js";
import { CampaignsService } from "./services/campaignsService.js";
import { createDeepLinkHandler } from "./router/deepLinkRouter.js";
import { VkBotGateway } from "./vk/bot.js";
import { createVkCallbackHandler } from "./vk/callbackHandler.js";
import { CampaignResponseFlowService } from "./vk/flow/campaignResponseFlow.js";
import { RegisterFlowService } from "./vk/flow/registerFlow.js";

// Точка входа сервиса: собирает зависимости, настраивает маршруты и запускает HTTP-сервер.
const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});

const config = loadConfig();
const schoolRegistry = new SchoolRegistry(config.schools);
const linkRepository = new LinkRepository();
const sessionRepository = new SessionRepository();
const campaignResponseRepository = new CampaignResponseRepository();
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

const campaignResponseFlow = new CampaignResponseFlowService({
  logger,
  botGateway,
  campaignResponseRepository,
  linkRepository,
});

const campaignsProvider = new JsonMockCampaignsProvider(config.mockDataPath);
const campaignsService = new CampaignsService({
  campaignsProvider,
  botGateway,
  campaignResponseRepository,
});

const app = express();
const testFrontendPath = path.join(process.cwd(), "src", "test-frontend");
const vkCallbackDebugEvents: VkCallbackDebugEvent[] = [];
let vkCallbackDebugEventId = 0;

type VkCallbackDebugEvent = {
  id: number;
  receivedAt: string;
  finishedAt?: string;
  responseStatus?: number;
  payload: unknown;
};

const captureVkCallbackDebugEvent: express.RequestHandler = (req, res, next) => {
  const event: VkCallbackDebugEvent = {
    id: ++vkCallbackDebugEventId,
    receivedAt: new Date().toISOString(),
    payload: req.body,
  };

  vkCallbackDebugEvents.unshift(event);
  vkCallbackDebugEvents.splice(50);

  res.on("finish", () => {
    event.finishedAt = new Date().toISOString();
    event.responseStatus = res.statusCode;
  });

  next();
};

app.use(express.json({ limit: "1mb" }));
app.use("/test-frontend", express.static(testFrontendPath));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    schools: schoolRegistry.all().length,
  });
});

app.get("/debug/vk-callbacks", (_req, res) => {
  res.json({
    events: vkCallbackDebugEvents,
  });
});

app.delete("/debug/vk-callbacks", (_req, res) => {
  vkCallbackDebugEvents.length = 0;
  res.status(204).send();
});

app.get("/s/:schoolId", createDeepLinkHandler(schoolRegistry));
app.use("/mock", createMockCampaignsRouter(campaignsService));
app.post(
  "/vk/callback",
  captureVkCallbackDebugEvent,
  createVkCallbackHandler({
    logger,
    schoolRegistry,
    campaignResponseFlow,
    registerFlow,
  }),
);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: error.flatten(),
    });
    return;
  }

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
