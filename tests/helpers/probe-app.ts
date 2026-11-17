import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { createApp } from "../../src/api/app";
import { notFound } from "../../src/api/lib/errors";
import { requireRole } from "../../src/api/middleware/require-role";
import { session } from "../../src/api/middleware/session";
import { workspace } from "../../src/api/middleware/workspace";
import { inWorkspace } from "../../src/api/repositories/scope";
import type { AppEnv } from "../../src/api/types";
import { workspaceSettings } from "../../src/db/schema/workspaces";

const lookup = (scoped: boolean) => async (c: Context<AppEnv>) => {
  const row = await drizzle(c.env.DB)
    .select()
    .from(workspaceSettings)
    .where(
      and(
        eq(workspaceSettings.workspaceId, c.req.param("id")!),
        scoped ? inWorkspace(workspaceSettings, c.get("scope")!) : undefined,
      ),
    )
    .get();
  if (!row) throw notFound();
  return c.json({ ok: true });
};

const member = [session({ required: true }), workspace()] as const;

export const PROBE_ROUTES = {
  correct: "GET /api/w/:wid/probe/:id",
  noRole: "GET /api/w/:wid/probe-no-role/:id",
  unscoped: "GET /api/w/:wid/probe-unscoped/:id",
} as const;

export function createProbeApp() {
  const app = createApp();
  app.get("/w/:wid/probe/:id", ...member, requireRole("editor"), lookup(true));
  app.get("/w/:wid/probe-no-role/:id", ...member, lookup(true));
  app.get(
    "/w/:wid/probe-unscoped/:id",
    ...member,
    requireRole("editor"),
    lookup(false),
  );
  return app;
}
