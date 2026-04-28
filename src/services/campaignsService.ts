import type {
  CampaignSendResult,
  CampaignsProvider,
  SendArbitraryMessageDto,
  SendAttendanceReminderDto,
  SendSurveyDto,
} from "../domain/campaigns.js";
import type { CampaignResponseRepository } from "../repositories/campaignResponseRepository.js";
import type { VkBotGateway } from "../vk/bot.js";

// Сервис оркестрации рассылок: получает целевых учеников из CampaignsProvider,
// применяет фильтрацию/сценарий (произвольная рассылка, опрос, напоминание)
// и делегирует фактическую отправку сообщений в VkBotGateway.

type Dependencies = {
  campaignsProvider: CampaignsProvider;
  botGateway: VkBotGateway;
  campaignResponseRepository: CampaignResponseRepository;
};

type CampaignResponsePatch = Parameters<CampaignResponseRepository["upsert"]>[2];

export class CampaignsService {
  constructor(private readonly deps: Dependencies) {}

  //Выбирает получателей по schoolId и vkUserIds, если переданы
  async sendArbitraryMessage(input: SendArbitraryMessageDto): Promise<CampaignSendResult> {
    const students = await this.deps.campaignsProvider.listStudentsBySchool({
      schoolId: input.schoolId,
    });

    const recipients =
      input.vkUserIds && input.vkUserIds.length > 0
        ? students.filter((student) => input.vkUserIds?.includes(student.vkUserId))
        : students;

    if (recipients.length === 0) {
      return {
        schoolId: input.schoolId,
        requested: 0,
        sent: 0,
      };
    }

    const responseContext = inferArbitraryMessageResponseContext(input.message);
    if (responseContext) {
      for (const recipient of recipients) {
        this.deps.campaignResponseRepository.upsert(
          input.schoolId,
          recipient.vkUserId,
          responseContext,
        );
      }
    }

    const sent = await this.deps.botGateway.sendTextMany(
      input.schoolId,
      recipients.map((student) => student.vkUserId),
      input.message,
    );

    return {
      schoolId: input.schoolId,
      requested: recipients.length,
      sent,
    };
  }

  async sendSurvey(input: SendSurveyDto): Promise<CampaignSendResult> {
    const survey = await this.deps.campaignsProvider.buildSurveyRecipients({
      schoolId: input.schoolId,
      lessonId: input.lessonId,
    });
    // #region agent log
    fetch("http://127.0.0.1:7303/ingest/0d05bb40-57b5-485d-9342-ae4d42846372", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e6621a" }, body: JSON.stringify({ sessionId: "e6621a", runId: "initial", hypothesisId: "H1,H2,H4", location: "src/services/campaignsService.ts:61", message: "survey send starting before pending upsert", data: { schoolId: input.schoolId, lessonId: survey.lessonId, recipientCount: survey.recipients.length, userKeys: survey.recipients.map((recipient) => `${input.schoolId}:u${Math.abs(recipient.vkUserId) % 1000}`) }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion

    for (const recipient of survey.recipients) {
      this.deps.campaignResponseRepository.upsert(input.schoolId, recipient.vkUserId, {
        kind: "survey",
        lessonId: survey.lessonId,
        lessonTitle: survey.lessonTitle,
      });
    }

    const sent = await this.deps.botGateway.sendTextMany(
      input.schoolId,
      survey.recipients.map((recipient) => recipient.vkUserId),
      survey.message,
    );

    // #region agent log
    fetch("http://127.0.0.1:7303/ingest/0d05bb40-57b5-485d-9342-ae4d42846372", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e6621a" }, body: JSON.stringify({ sessionId: "e6621a", runId: "initial", hypothesisId: "H1,H2,H3,H4", location: "src/services/campaignsService.ts:78", message: "survey pending upserted after send", data: { schoolId: input.schoolId, lessonId: survey.lessonId, sent, recipientCount: survey.recipients.length, userKeys: survey.recipients.map((recipient) => `${input.schoolId}:u${Math.abs(recipient.vkUserId) % 1000}`) }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion

    return {
      schoolId: input.schoolId,
      requested: survey.recipients.length,
      sent,
    };
  }

  async sendAttendanceReminder(
    input: SendAttendanceReminderDto,
  ): Promise<CampaignSendResult> {
    const reminder = await this.deps.campaignsProvider.buildAttendanceRecipients({
      schoolId: input.schoolId,
      date: input.date,
      mode: input.mode,
    });

    for (const recipient of reminder.recipients) {
      this.deps.campaignResponseRepository.upsert(input.schoolId, recipient.vkUserId, {
        kind: "attendance",
        date: reminder.date,
        mode: reminder.mode,
      });
    }

    const sent = await this.deps.botGateway.sendTextMany(
      input.schoolId,
      reminder.recipients.map((recipient) => recipient.vkUserId),
      reminder.message,
    );

    // #region agent log
    fetch("http://127.0.0.1:7303/ingest/0d05bb40-57b5-485d-9342-ae4d42846372", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e6621a" }, body: JSON.stringify({ sessionId: "e6621a", runId: "initial", hypothesisId: "H2,H3,H4", location: "src/services/campaignsService.ts:112", message: "attendance pending upserted after send", data: { schoolId: input.schoolId, date: reminder.date, mode: reminder.mode, sent, recipientCount: reminder.recipients.length, userKeys: reminder.recipients.map((recipient) => `${input.schoolId}:u${Math.abs(recipient.vkUserId) % 1000}`) }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion

    return {
      schoolId: input.schoolId,
      requested: reminder.recipients.length,
      sent,
    };
  }
}

function inferArbitraryMessageResponseContext(
  message: string,
): CampaignResponsePatch | undefined {
  const normalized = message.toLowerCase();

  if (normalized.includes("от 1 до 5") || /оценк\w*\s+от\s+1\s+до\s+5/u.test(normalized)) {
    return {
      kind: "survey",
    };
  }

  if (
    normalized.includes("да или нет") ||
    (normalized.includes("подтверд") && /урок|заняти/u.test(normalized))
  ) {
    const date = normalized.match(/\b\d{4}-\d{2}-\d{2}\b/u)?.[0];

    return {
      kind: "attendance",
      date,
    };
  }

  return undefined;
}
