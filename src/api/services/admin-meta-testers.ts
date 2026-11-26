import type { AddMetaTesterRequest } from "../../shared/schemas/admin";
import { unprocessable } from "../lib/errors";
import { logEvent } from "../lib/logger";
import type { SessionUser } from "../types";
import { type MetaTesterEnv, tryAddAppTester } from "./meta-testers";

export async function addMetaTester(
  env: MetaTesterEnv,
  admin: SessionUser,
  { facebookUserId }: AddMetaTesterRequest,
  requestId: string,
) {
  if (!(await tryAddAppTester(env, facebookUserId))) {
    throw unprocessable("META_TESTER_REJECTED");
  }
  logEvent("info", "admin.meta_tester_added", { adminId: admin.id, requestId });
}
