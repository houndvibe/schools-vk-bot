const NON_DIGIT = /\D+/g;

// Нормализует телефон в формат E.164 (+7...) или возвращает null при невалидном вводе.

export function normalizePhoneToE164(raw: string): string | null {
  const digits = raw.replace(NON_DIGIT, "");

  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+7${digits}`;
  }

  return null;
}
