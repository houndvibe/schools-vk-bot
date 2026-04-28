import type { RequestHandler } from "express";
import pino from "pino";

import type { SchoolRegistry } from "../domain/schoolRegistry.js";
import type { CampaignResponseFlowService } from "./flow/campaignResponseFlow.js";
import type { RegisterFlowService } from "./flow/registerFlow.js";
import type { VkCallbackUpdate } from "./types.js";

type Deps = {
  logger: pino.Logger;
  schoolRegistry: SchoolRegistry;
  campaignResponseFlow: CampaignResponseFlowService;
  registerFlow: RegisterFlowService;
};

// Обрабатывает callback от VK: валидация школы/секрета и запуск message_new flow.
export function createVkCallbackHandler(deps: Deps): RequestHandler {
  return async (req, res, next) => {
    try {
      const update = req.body as VkCallbackUpdate;
      const groupId = update.group_id;
      if (!groupId) {
        res.status(400).send("group_id is required");
        return;
      }

      const school = deps.schoolRegistry.getByGroupId(groupId);
      if (!school) {
        res.status(404).send("Unknown group_id");
        return;
      }

      if (update.secret !== school.webhookSecret) {
        res.status(403).send("invalid secret");
        return;
      }

      if (update.type === "confirmation") {
        res.status(200).send(school.webhookConfirmation);
        return;
      }

      if (update.type === "message_new") {
        const handledAsCampaignResponse = await deps.campaignResponseFlow.handleMessage(
          school,
          update,
        );
        if (handledAsCampaignResponse) {
          res.status(200).send("ok");
          return;
        }

        await deps.registerFlow.handleMessage(school, update);
      }

      res.status(200).send("ok");
    } catch (error) {
      deps.logger.error({ error }, "VK callback handler failed");
      next(error);
    }
  };
}
