import type {
  CampaignSendResult,
  CampaignsProvider,
  SendArbitraryMessageDto,
  SendAttendanceReminderDto,
  SendSurveyDto,
} from "../domain/campaigns.js";
import type { VkBotGateway } from "../vk/bot.js";

type Dependencies = {
  campaignsProvider: CampaignsProvider;
  botGateway: VkBotGateway;
};

export class CampaignsService {
  constructor(private readonly deps: Dependencies) {}

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

    const sent = await this.deps.botGateway.sendTextMany(
      input.schoolId,
      survey.recipients.map((recipient) => recipient.vkUserId),
      survey.message,
    );

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

    const sent = await this.deps.botGateway.sendTextMany(
      input.schoolId,
      reminder.recipients.map((recipient) => recipient.vkUserId),
      reminder.message,
    );

    return {
      schoolId: input.schoolId,
      requested: reminder.recipients.length,
      sent,
    };
  }
}
