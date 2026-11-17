import type { Context } from "hono";
import type { z } from "zod";
import { AppError } from "./errors";

export async function parseJson<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): Promise<z.infer<Schema>> {
  const body: unknown = await c.req.json().catch(() => undefined);
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join("."), issue.code]),
    );
    throw new AppError(400, "VALIDATION", { fields });
  }
  return result.data;
}
