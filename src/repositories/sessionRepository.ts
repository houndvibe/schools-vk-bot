export type RegistrationState = "awaiting_phone" | "linked";

export type RegistrationSession = {
  schoolId: string;
  vkUserId: number;
  state: RegistrationState;
  phoneE164?: string;
  startedAt: string;
  updatedAt: string;
  ref?: string;
};

export class SessionRepository {
  private readonly sessions = new Map<string, RegistrationSession>();

  private key(schoolId: string, vkUserId: number): string {
    return `${schoolId}:${vkUserId}`;
  }

  get(schoolId: string, vkUserId: number): RegistrationSession | undefined {
    return this.sessions.get(this.key(schoolId, vkUserId));
  }

  upsert(
    schoolId: string,
    vkUserId: number,
    patch: Partial<RegistrationSession> & Pick<RegistrationSession, "state">,
  ): RegistrationSession {
    const key = this.key(schoolId, vkUserId);
    const now = new Date().toISOString();
    const prev = this.sessions.get(key);

    const next: RegistrationSession = {
      schoolId,
      vkUserId,
      startedAt: prev?.startedAt ?? now,
      updatedAt: now,
      ...prev,
      ...patch,
    };

    this.sessions.set(key, next);
    return next;
  }
}
