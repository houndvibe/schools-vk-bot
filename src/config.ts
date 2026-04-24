import "dotenv/config";
import { z } from "zod";

// Загружает и валидирует конфигурацию приложения из переменных окружения.
const schoolSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  vkGroupId: z.number().int().positive(),
  vkToken: z.string().min(1),
  webhookSecret: z.string().min(1),
  webhookConfirmation: z.string().min(1),
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(1),
});

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  SCHOOL_API_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SCHOOL_API_MODE: z.enum(["mock", "http"]).default("mock"),
  SCHOOLS_JSON: z.string().min(2),
});

export type SchoolConfig = z.infer<typeof schoolSchema>;

export type AppConfig = {
  port: number;
  publicBaseUrl: string;
  schoolApiTimeoutMs: number;
  schoolApiMode: "mock" | "http";
  schools: SchoolConfig[];
};

export function loadConfig(): AppConfig {
  const schoolsJsonRaw = process.env.SCHOOLS_JSON?.trim() || "[]";

  const env = envSchema.parse({
    PORT: process.env.PORT,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
    SCHOOL_API_TIMEOUT_MS: process.env.SCHOOL_API_TIMEOUT_MS,
    SCHOOL_API_MODE: process.env.SCHOOL_API_MODE,
    SCHOOLS_JSON: schoolsJsonRaw,
  });

  let schoolsJsonParsed: unknown;
  try {
    schoolsJsonParsed = JSON.parse(env.SCHOOLS_JSON);
  } catch (error) {
    throw new Error(
      `SCHOOLS_JSON must be valid JSON array. Parse failed: ${(error as Error).message}`,
    );
  }

  const parsedSchools = z.array(schoolSchema).parse(schoolsJsonParsed);
  if (parsedSchools.length === 0) {
    throw new Error(
      "SCHOOLS_JSON must contain at least one school config for MVP runtime.",
    );
  }

  return {
    port: env.PORT,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    schoolApiTimeoutMs: env.SCHOOL_API_TIMEOUT_MS,
    schoolApiMode: env.SCHOOL_API_MODE,
    schools: parsedSchools,
  };
}
