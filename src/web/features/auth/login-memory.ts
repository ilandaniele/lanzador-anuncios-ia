import { z } from "zod";

const STORAGE_KEY = "lanzador.login";

const loginMemorySchema = z.object({
  email: z.string(),
  next: z.string().nullable(),
});
export type LoginMemory = z.infer<typeof loginMemorySchema>;

export function rememberLogin(memory: LoginMemory): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
}

export function recallLogin(): LoginMemory | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return loginMemorySchema.parse(JSON.parse(stored ?? "null"));
  } catch {
    return null;
  }
}

export function forgetLogin(): void {
  localStorage.removeItem(STORAGE_KEY);
}
