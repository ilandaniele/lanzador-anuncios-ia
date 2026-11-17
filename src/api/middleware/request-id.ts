import { createMiddleware } from "hono/factory";
import { newId } from "../lib/ids";
import type { AppEnv } from "../types";

export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const id = newId();
  c.set("requestId", id);
  await next();
  c.header("X-Request-Id", id);
});
