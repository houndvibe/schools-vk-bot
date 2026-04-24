import { request } from "undici";

// Клиент школьного API: mock режим и http режим (реальные POST-запросы).

export type ResolvedStudent = {
  id: string;
  fullName: string;
  className?: string;
};

export type SchoolApiClient = {
  resolveByPhone(input: {
    schoolId: string;
    phoneE164: string;
  }): Promise<ResolvedStudent[]>;
  bindVkUser(input: {
    schoolId: string;
    studentId: string;
    vkUserId: number;
    phoneE164: string;
  }): Promise<void>;
};

type FactoryOptions = {
  mode: "mock" | "http";
  apiBaseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

export function createSchoolApiClient(options: FactoryOptions): SchoolApiClient {
  if (options.mode === "mock") {
    return {
      async resolveByPhone({ phoneE164 }) {
        if (phoneE164.endsWith("0000")) {
          return [];
        }

        return [
          {
            id: "student-001",
            fullName: "Иванов Иван",
            className: "5A",
          },
        ];
      },
      async bindVkUser() {
        return;
      },
    };
  }

  return new HttpSchoolApiClient(options);
}

class HttpSchoolApiClient implements SchoolApiClient {
  constructor(private readonly options: FactoryOptions) {}

  async resolveByPhone(input: {
    schoolId: string;
    phoneE164: string;
  }): Promise<ResolvedStudent[]> {
    const data = await this.postJson<{
      students: ResolvedStudent[];
    }>("/students/resolve-by-phone", input);

    return data.students;
  }

  async bindVkUser(input: {
    schoolId: string;
    studentId: string;
    vkUserId: number;
    phoneE164: string;
  }): Promise<void> {
    await this.postJson("/vk-links/bind", input);
  }

  private async postJson<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(path, this.options.apiBaseUrl).toString();

    const response = await request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify(body),
      bodyTimeout: this.options.timeoutMs,
      headersTimeout: this.options.timeoutMs,
    });

    if (response.statusCode >= 400) {
      const responseText = await response.body.text();
      throw new Error(
        `School API error ${response.statusCode} on ${path}: ${responseText}`,
      );
    }

    return (await response.body.json()) as T;
  }
}
