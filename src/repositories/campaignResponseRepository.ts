import type { AttendanceReminderMode } from "../domain/campaigns.js";

export type PendingCampaignResponseKind = "survey" | "attendance";

export type PendingCampaignResponse = {
  schoolId: string;
  vkUserId: number;
  kind: PendingCampaignResponseKind;
  createdAt: string;
  updatedAt: string;
  lessonId?: string;
  lessonTitle?: string;
  date?: string;
  mode?: AttendanceReminderMode;
};

type PendingCampaignResponsePatch = Omit<
  PendingCampaignResponse,
  "schoolId" | "vkUserId" | "createdAt" | "updatedAt"
>;

export class CampaignResponseRepository {
  private readonly responses = new Map<string, PendingCampaignResponse>();

  private key(schoolId: string, vkUserId: number): string {
    return `${schoolId}:${vkUserId}`;
  }

  get(schoolId: string, vkUserId: number): PendingCampaignResponse | undefined {
    return this.responses.get(this.key(schoolId, vkUserId));
  }

  upsert(
    schoolId: string,
    vkUserId: number,
    patch: PendingCampaignResponsePatch,
  ): PendingCampaignResponse {
    const key = this.key(schoolId, vkUserId);
    const now = new Date().toISOString();
    const prev = this.responses.get(key);

    const next: PendingCampaignResponse = {
      schoolId,
      vkUserId,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      ...patch,
    };

    this.responses.set(key, next);
    return next;
  }

  delete(schoolId: string, vkUserId: number): void {
    this.responses.delete(this.key(schoolId, vkUserId));
  }
}
