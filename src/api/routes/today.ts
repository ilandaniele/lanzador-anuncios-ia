import { Hono } from "hono";
import { member } from "../middleware/member";
import { getToday } from "../services/today";
import type { AppEnv } from "../types";

export const todayRoutes = new Hono<AppEnv>().get(
  "/w/:wid/today",
  ...member("viewer"),
  async (c) => c.json(await getToday(c.env, c.get("scope")!)),
);
