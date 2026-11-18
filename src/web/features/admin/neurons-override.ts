export type OverrideParse =
  { valid: true; value: number | null } | { valid: false };

export function parseNeuronsOverride(text: string): OverrideParse {
  const trimmed = text.trim();
  if (trimmed === "") return { valid: true, value: null };
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0
    ? { valid: true, value }
    : { valid: false };
}
