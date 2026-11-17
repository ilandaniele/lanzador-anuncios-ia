import { env } from "cloudflare:workers";
import type { Env } from "../../../src/api/env";
import { errorEnvelopeSchema } from "../../../src/shared/schemas/common";

export const ORIGIN = "https://app.example.test";

export const trustedHeaders = { Origin: ORIGIN, "X-Lanzador": "1" };

export const blockedLimiter: RateLimit = {
  limit: async () => ({ success: false }),
};

export const testEnv = (overrides: Partial<Env> = {}): Env => ({
  ...env,
  APP_ORIGIN: ORIGIN,
  ...overrides,
});

export async function readEnvelope(response: Response) {
  return errorEnvelopeSchema.parse(await response.json()).error;
}
