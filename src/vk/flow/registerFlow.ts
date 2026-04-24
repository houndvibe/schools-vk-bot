import pino from "pino";

import { normalizePhoneToE164 } from "../../domain/phone.js";
import type { SchoolConfig } from "../../config.js";
import type { SchoolApiClient } from "../../integrations/schoolApi.js";
import { LinkRepository } from "../../repositories/linkRepository.js";
import { SessionRepository } from "../../repositories/sessionRepository.js";
import type { VkBotGateway } from "../bot.js";
import type { VkCallbackUpdate } from "../types.js";

type Dependencies = {
  logger: pino.Logger;
  botGateway: VkBotGateway;
  linkRepository: LinkRepository;
  sessionRepository: SessionRepository;
  schoolApiFactory: (school: SchoolConfig) => SchoolApiClient;
};

//Сервис регистрации: state machine регистрации.

export class RegisterFlowService {
  constructor(private readonly deps: Dependencies) {}

  async handleMessage(school: SchoolConfig, update: VkCallbackUpdate): Promise<void> {
    const message = update.object?.message;
    const vkUserId = message?.from_id;
    const peerId = message?.peer_id;
    const text = (message?.text ?? "").trim();

    if (!vkUserId || !peerId) {
      return;
    }

    const linked = this.deps.linkRepository.getByUser(school.id, vkUserId);
    if (linked) {
      await this.deps.botGateway.sendText(
        school.id,
        peerId,
        "Вы уже зарегистрированы. Доступ к функциям личного кабинета активен.",
      );
      return;
    }

    const existingSession = this.deps.sessionRepository.get(school.id, vkUserId);
    if (!existingSession) {
      this.deps.sessionRepository.upsert(school.id, vkUserId, {
        state: "awaiting_phone",
        ref: message?.ref,
      });

      await this.deps.botGateway.sendText(
        school.id,
        peerId,
        "Здравствуйте! Для регистрации отправьте номер телефона в формате +7XXXXXXXXXX.",
      );
      return;
    }

    if (existingSession.state !== "awaiting_phone") {
      return;
    }

    const phoneE164 = normalizePhoneToE164(text);
    if (!phoneE164) {
      await this.deps.botGateway.sendText(
        school.id,
        peerId,
        "Не удалось распознать номер. Введите телефон в формате +7XXXXXXXXXX.",
      );
      return;
    }

    const schoolApi = this.deps.schoolApiFactory(school);
    const students = await schoolApi.resolveByPhone({
      schoolId: school.id,
      phoneE164,
    });

    if (students.length === 0) {
      await this.deps.botGateway.sendText(
        school.id,
        peerId,
        "По этому номеру ученик не найден. Проверьте номер или обратитесь в школу.",
      );
      return;
    }

    if (students.length > 1) {
      await this.deps.botGateway.sendText(
        school.id,
        peerId,
        "Найдено несколько учеников. Для завершения регистрации обратитесь в поддержку школы.",
      );
      return;
    }

    const [student] = students;

    await schoolApi.bindVkUser({
      schoolId: school.id,
      studentId: student.id,
      vkUserId,
      phoneE164,
    });

    this.deps.linkRepository.upsert({
      schoolId: school.id,
      vkUserId,
      studentId: student.id,
      phoneE164,
      linkedAt: new Date().toISOString(),
    });

    this.deps.sessionRepository.upsert(school.id, vkUserId, {
      state: "linked",
      phoneE164,
    });

    await this.deps.botGateway.sendText(
      school.id,
      peerId,
      `Готово, профиль привязан к ученику ${student.fullName}${student.className ? ` (${student.className})` : ""}.`,
    );

    this.deps.logger.info(
      {
        schoolId: school.id,
        vkUserId,
        studentId: student.id,
      },
      "VK user linked to school student",
    );
  }
}
