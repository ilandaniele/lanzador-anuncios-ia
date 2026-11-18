import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import { now } from "../../api/lib/time";
import {
  completeDataDeletion,
  findDataDeletionRequest,
} from "../../api/repositories/data-deletion-requests";
import { JOB_STEP_CONFIG, type JobHandler } from "./job-context";

const payloadSchema = z.object({ requestId: z.string().min(1) });

export const metaDisconnectCleanupJob: JobHandler = async ({
  env,
  step,
  payload,
}) => {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new NonRetryableError("Invalid meta_disconnect_cleanup job");
  }
  const { requestId } = parsed.data;
  await step.do("delete meta user data", JOB_STEP_CONFIG, async () => {
    const request = await findDataDeletionRequest(env.DB, requestId);
    if (!request) {
      throw new NonRetryableError("Unknown data deletion request");
    }
    if (request.status === "done") return;
    await completeDataDeletion(env.DB, requestId, request.metaUserId, now());
  });
};
