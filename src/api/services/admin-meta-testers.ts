import type { AddMetaTesterRequest } from "../../shared/schemas/admin";
import type { Env } from "../env";
import { addAppTester } from "../integrations/meta/auth";
import { MetaError } from "../integrations/meta/client";
import { unprocessable } from "../lib/errors";
import { logEvent } from "../lib/logger";
import type { SessionUser } from "../types";

type MetaTesterEnv = Pick<
  Env,
  "APP_ORIGIN" | "GRAPH_API_VERSION" | "META_APP_ID" | "META_APP_SECRET"
>;

export async function addMetaTester(
  env: MetaTesterEnv,
  admin: SessionUser,
  { facebookUserId }: AddMetaTesterRequest,
  requestId: string,
) {
  const added = await addAppTester(env, facebookUserId).catch((error) => {
    if (error instanceof MetaError) return false;
    throw error;
  });
  if (!added) throw unprocessable("META_TESTER_REJECTED");
  logEvent("info", "admin.meta_tester_added", { adminId: admin.id, requestId });
}
