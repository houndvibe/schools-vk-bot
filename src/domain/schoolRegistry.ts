import type { SchoolConfig } from "../config.js";

// Централизованный реестр школ с быстрым поиском по id, slug и VK group_id.

export class SchoolRegistry {
  private readonly byId = new Map<string, SchoolConfig>();
  private readonly bySlug = new Map<string, SchoolConfig>();
  private readonly byGroupId = new Map<number, SchoolConfig>();

  constructor(schools: SchoolConfig[]) {
    for (const school of schools) {
      this.byId.set(school.id, school);
      this.bySlug.set(school.slug, school);
      this.byGroupId.set(school.vkGroupId, school);
    }
  }

  getByIdOrSlug(value: string): SchoolConfig | undefined {
    return this.byId.get(value) ?? this.bySlug.get(value);
  }

  getByGroupId(groupId: number): SchoolConfig | undefined {
    return this.byGroupId.get(groupId);
  }

  all(): SchoolConfig[] {
    return [...this.byId.values()];
  }
}
