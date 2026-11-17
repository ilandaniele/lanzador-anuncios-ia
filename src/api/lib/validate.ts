import type { Context } from "hono";
import type { z } from "zod";
import { AppError } from "./errors";

function validated<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join("."), issue.code]),
    );
    throw new AppError(400, "VALIDATION", { fields });
  }
  return result.data;
}

export async function parseJson<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): Promise<z.infer<Schema>> {
  return validated(schema, await c.req.json().catch(() => undefined));
}

export const parseQuery = <Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): z.infer<Schema> => validated(schema, c.req.query());
