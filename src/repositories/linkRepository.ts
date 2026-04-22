export type UserLink = {
  schoolId: string;
  vkUserId: number;
  studentId: string;
  phoneE164: string;
  linkedAt: string;
};

export class LinkRepository {
  private readonly links = new Map<string, UserLink>();

  private key(schoolId: string, vkUserId: number): string {
    return `${schoolId}:${vkUserId}`;
  }

  getByUser(schoolId: string, vkUserId: number): UserLink | undefined {
    return this.links.get(this.key(schoolId, vkUserId));
  }

  upsert(link: UserLink): UserLink {
    this.links.set(this.key(link.schoolId, link.vkUserId), link);
    return link;
  }
}
