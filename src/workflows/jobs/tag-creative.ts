import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import { AppError } from "../../api/lib/errors";
import type { Scope } from "../../api/repositories/scope";
import {
  isBudgetExhausted,
  tagFromThumbnail,
} from "../../api/services/ai/tagging";
import { JOB_STEP_CONFIG, type JobHandler } from "./job-context";

const JOB_USER_ID = "job:tag_creative";

const payloadSchema = z.object({ creativeId: z.string().min(1) });

const jobScope = (workspaceId: string): Scope => ({
  workspaceId,
  userId: JOB_USER_ID,
  role: "editor",
});

export const tagCreativeJob: JobHandler = async ({
  env,
  step,
  workspaceId,
  payload,
}) => {
  const parsed = payloadSchema.safeParse(payload);
  if (!workspaceId || !parsed.success) {
    throw new NonRetryableError("Invalid tag_creative job");
  }
  const { creativeId } = parsed.data;
  await step.do("tag creative", JOB_STEP_CONFIG, async () => {
    try {
      await tagFromThumbnail(env, jobScope(workspaceId), creativeId);
    } catch (error) {
      if (isBudgetExhausted(error)) return;
      if (error instanceof AppError && error.status < 500) {
        throw new NonRetryableError(error.code);
      }
      throw error;
    }
  });
};
