import type { AddMetaTesterRequest } from "../../shared/schemas/admin";
import type { Env } from "../env";
import { addAppTester } from "../integrations/meta/auth";
import { MetaError } from "../integrations/meta/client";
import { conflict, unprocessable } from "../lib/errors";
import { logEvent } from "../lib/logger";
import { claimMetaTesterId, releaseMetaTesterId } from "../repositories/users";
import type { SessionUser } from "../types";

export type MetaTesterEnv = Pick<
  Env,
  "APP_ORIGIN" | "GRAPH_API_VERSION" | "META_APP_ID" | "META_APP_SECRET"
>;

export const tryAddAppTester = (env: MetaTesterEnv, facebookUserId: string) =>
  addAppTester(env, facebookUserId).catch((error) => {
    if (error instanceof MetaError) return false;
    throw error;
  });

export async function requestOwnMetaTester(
  env: MetaTesterEnv & Pick<Env, "DB">,
  user: SessionUser,
  { facebookUserId }: AddMetaTesterRequest,
  requestId: string,
) {
  if (!(await claimMetaTesterId(env.DB, user.id, facebookUserId))) {
    throw conflict("META_TESTER_ALREADY_REQUESTED");
  }
  const added = await tryAddAppTester(env, facebookUserId).catch(
    async (error: unknown) => {
      await releaseMetaTesterId(env.DB, user.id, facebookUserId);
      throw error;
    },
  );
  if (!added) {
    await releaseMetaTesterId(env.DB, user.id, facebookUserId);
    throw unprocessable("META_TESTER_REJECTED");
  }
  logEvent("info", "user.meta_tester_requested", {
    userId: user.id,
    requestId,
  });
}
