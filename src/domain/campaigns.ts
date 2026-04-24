export type AttendanceReminderMode = "day_before" | "same_day";

// Контракты домена рассылок: единый интерфейс CampaignsProvider и DTO для ручных mock-кампаний
// (произвольные сообщения, опросы после урока, напоминания о подтверждении); реализованы так,
// чтобы позже заменить JSON/mock источник на backend API без изменения роутов и сервисного слоя.

export type CampaignRecipient = {
  studentId: string;
  vkUserId: number;
  fullName: string;
  className?: string;
};

export type SurveyRecipientsResult = {
  lessonId: string;
  lessonTitle: string;
  message: string;
  recipients: CampaignRecipient[];
};

export type AttendanceRecipientsResult = {
  date: string;
  mode: AttendanceReminderMode;
  message: string;
  recipients: CampaignRecipient[];
};

export interface CampaignsProvider {
  listStudentsBySchool(input: { schoolId: string }): Promise<CampaignRecipient[]>;
  buildSurveyRecipients(input: {
    schoolId: string;
    lessonId: string;
  }): Promise<SurveyRecipientsResult>;
  buildAttendanceRecipients(input: {
    schoolId: string;
    date: string;
    mode: AttendanceReminderMode;
  }): Promise<AttendanceRecipientsResult>;
}

export type SendArbitraryMessageDto = {
  schoolId: string;
  message: string;
  vkUserIds?: number[];
};

export type SendSurveyDto = {
  schoolId: string;
  lessonId: string;
};

export type SendAttendanceReminderDto = {
  schoolId: string;
  date: string;
  mode: AttendanceReminderMode;
};

export type CampaignSendResult = {
  schoolId: string;
  requested: number;
  sent: number;
};
