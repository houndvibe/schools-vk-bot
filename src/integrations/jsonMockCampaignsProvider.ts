import { readFile } from "node:fs/promises";
import { z } from "zod";

// JSON-реализация CampaignsProvider для mock-режима: читает локальный файл кампаний,
// валидирует структуру данных и формирует получателей/тексты для произвольных рассылок,
// опросов после уроков и напоминаний, чтобы позже безболезненно заменить источник на backend API.

import type {
  AttendanceReminderMode,
  AttendanceRecipientsResult,
  CampaignRecipient,
  CampaignsProvider,
  SurveyRecipientsResult,
} from "../domain/campaigns.js";

const studentSchema = z.object({
  studentId: z.string().min(1),
  vkUserId: z.number().int().positive(),
  fullName: z.string().min(1),
  className: z.string().min(1).optional(),
});

const lessonSchema = z.object({
  lessonId: z.string().min(1),
  title: z.string().min(1),
  date: z.string().min(1),
  studentIds: z.array(z.string().min(1)).min(1),
});

const schoolCampaignSchema = z.object({
  schoolId: z.string().min(1),
  templates: z.object({
    surveyAfterLesson: z.string().min(1),
    attendanceDayBefore: z.string().min(1),
    attendanceSameDay: z.string().min(1),
  }),
  students: z.array(studentSchema),
  lessons: z.array(lessonSchema),
});

const campaignsSchema = z.object({
  schools: z.array(schoolCampaignSchema),
});

type CampaignsConfig = z.infer<typeof campaignsSchema>;
type SchoolCampaignConfig = z.infer<typeof schoolCampaignSchema>;

export class JsonMockCampaignsProvider implements CampaignsProvider {
  constructor(private readonly dataPath: string) {}

  async listStudentsBySchool(input: {
    schoolId: string;
  }): Promise<CampaignRecipient[]> {
    const school = await this.requireSchool(input.schoolId);
    return school.students;
  }

  async buildSurveyRecipients(input: {
    schoolId: string;
    lessonId: string;
  }): Promise<SurveyRecipientsResult> {
    const school = await this.requireSchool(input.schoolId);
    const lesson = school.lessons.find((item) => item.lessonId === input.lessonId);
    if (!lesson) {
      throw new Error(
        `Lesson "${input.lessonId}" was not found for schoolId="${input.schoolId}"`,
      );
    }

    const recipients = mapStudentIdsToRecipients({
      studentIds: lesson.studentIds,
      students: school.students,
      schoolId: input.schoolId,
    });

    return {
      lessonId: lesson.lessonId,
      lessonTitle: lesson.title,
      message: template(school.templates.surveyAfterLesson, {
        lessonTitle: lesson.title,
        lessonDate: lesson.date,
      }),
      recipients,
    };
  }

  async buildAttendanceRecipients(input: {
    schoolId: string;
    date: string;
    mode: AttendanceReminderMode;
  }): Promise<AttendanceRecipientsResult> {
    const school = await this.requireSchool(input.schoolId);
    const lessonsForDate = school.lessons.filter((lesson) => lesson.date === input.date);
    if (lessonsForDate.length === 0) {
      throw new Error(
        `No lessons found for date="${input.date}" and schoolId="${input.schoolId}"`,
      );
    }

    const uniqueStudentIds = [...new Set(lessonsForDate.flatMap((lesson) => lesson.studentIds))];
    const recipients = mapStudentIdsToRecipients({
      studentIds: uniqueStudentIds,
      students: school.students,
      schoolId: input.schoolId,
    });

    const templateText =
      input.mode === "day_before"
        ? school.templates.attendanceDayBefore
        : school.templates.attendanceSameDay;

    return {
      date: input.date,
      mode: input.mode,
      message: template(templateText, { date: input.date }),
      recipients,
    };
  }

  private async requireSchool(schoolId: string): Promise<SchoolCampaignConfig> {
    const data = await this.loadData();
    const school = data.schools.find((item) => item.schoolId === schoolId);
    if (!school) {
      throw new Error(`Mock campaign school was not found for schoolId="${schoolId}"`);
    }

    return school;
  }

  private async loadData(): Promise<CampaignsConfig> {
    const raw = await readFile(this.dataPath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Mock campaign data is not valid JSON at "${this.dataPath}": ${(error as Error).message}`,
      );
    }

    return campaignsSchema.parse(parsed);
  }
}

function mapStudentIdsToRecipients(input: {
  schoolId: string;
  studentIds: string[];
  students: CampaignRecipient[];
}): CampaignRecipient[] {
  const studentsById = new Map(input.students.map((student) => [student.studentId, student]));
  const recipients: CampaignRecipient[] = [];

  for (const studentId of input.studentIds) {
    const student = studentsById.get(studentId);
    if (!student) {
      throw new Error(
        `Student "${studentId}" was not found for schoolId="${input.schoolId}"`,
      );
    }
    recipients.push(student);
  }

  return recipients;
}

function template(source: string, params: Record<string, string>): string {
  let output = source;
  for (const [key, value] of Object.entries(params)) {
    output = output.replaceAll(`{${key}}`, value);
  }
  return output;
}
