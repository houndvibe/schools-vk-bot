import pino from "pino";

import type { SchoolConfig } from "../../config.js";
import type { CampaignResponseRepository } from "../../repositories/campaignResponseRepository.js";
import type { LinkRepository } from "../../repositories/linkRepository.js";
import type { VkBotGateway } from "../bot.js";
import type { VkCallbackUpdate } from "../types.js";

type Dependencies = {
  logger: pino.Logger;
  botGateway: VkBotGateway;
  campaignResponseRepository: CampaignResponseRepository;
  linkRepository: LinkRepository;
};

const SURVEY_RESPONSE_MESSAGES: Record<number, string> = {
  1: "Спасибо за оценку. Нам жаль, что урок не понравился. Передадим обратную связь преподавателю.",
  2: "Спасибо за оценку. Мы учтем обратную связь и постараемся сделать занятия лучше.",
  3: "Спасибо за оценку. Будем рады узнать, что можно улучшить на следующих уроках.",
  4: "Спасибо за оценку! Рады, что урок вам понравился.",
  5: "Спасибо за отличную оценку! Очень рады, что урок прошел полезно.",
};

const NO_ACTIVE_CAMPAIGN_RESPONSE_MESSAGE =
  "Не нашёл активную рассылку для этого ответа. Пожалуйста, дождитесь нового сообщения от школы и ответьте на него.";

export class CampaignResponseFlowService {
  constructor(private readonly deps: Dependencies) {}

  async handleMessage(school: SchoolConfig, update: VkCallbackUpdate): Promise<boolean> {
    const message = update.object?.message;
    const vkUserId = message?.from_id;
    const peerId = message?.peer_id;
    const text = (message?.text ?? "").trim();

    if (!vkUserId || !peerId) {
      return false;
    }

    const pending = this.deps.campaignResponseRepository.get(school.id, vkUserId);
    if (!pending) {
      return this.handleLinkedActionWithoutPending(school, vkUserId, peerId, text);
    }

    if (pending.kind === "survey") {
      return this.handleSurveyAnswer(school, vkUserId, peerId, text);
    }

    return this.handleAttendanceAnswer(school, vkUserId, peerId, text);
  }

  private async handleLinkedActionWithoutPending(
    school: SchoolConfig,
    vkUserId: number,
    peerId: number,
    text: string,
  ): Promise<boolean> {
    const linked = this.deps.linkRepository.getByUser(school.id, vkUserId);
    if (!linked) {
      return false;
    }

    const answer = text.toLowerCase();
    if (/^[1-5]$/.test(text) || answer === "да" || answer === "нет") {
      await this.deps.botGateway.sendText(
        school.id,
        peerId,
        NO_ACTIVE_CAMPAIGN_RESPONSE_MESSAGE,
      );
      return true;
    }

    return false;
  }

  private async handleSurveyAnswer(
    school: SchoolConfig,
    vkUserId: number,
    peerId: number,
    text: string,
  ): Promise<boolean> {
    if (!/^[1-5]$/.test(text)) {
      await this.deps.botGateway.sendText(
        school.id,
        peerId,
        "Пожалуйста, ответьте числом от 1 до 5.",
      );
      return true;
    }

    const rating = Number(text);
    this.deps.campaignResponseRepository.delete(school.id, vkUserId);

    await this.deps.botGateway.sendText(
      school.id,
      peerId,
      SURVEY_RESPONSE_MESSAGES[rating],
    );

    this.deps.logger.info(
      {
        schoolId: school.id,
        vkUserId,
        rating,
      },
      "Survey campaign answer received",
    );

    return true;
  }

  private async handleAttendanceAnswer(
    school: SchoolConfig,
    vkUserId: number,
    peerId: number,
    text: string,
  ): Promise<boolean> {
    const answer = text.toLowerCase();
    if (answer !== "да" && answer !== "нет") {
      await this.deps.botGateway.sendText(
        school.id,
        peerId,
        "Пожалуйста, ответьте точнее: да или нет.",
      );
      return true;
    }

    this.deps.campaignResponseRepository.delete(school.id, vkUserId);

    await this.deps.botGateway.sendText(
      school.id,
      peerId,
      answer === "да"
        ? "Спасибо, подтвердили ваше участие в уроке."
        : "Спасибо, отметили, что вы не будете на уроке.",
    );

    this.deps.logger.info(
      {
        schoolId: school.id,
        vkUserId,
        answer,
      },
      "Attendance campaign answer received",
    );

    return true;
  }
}
