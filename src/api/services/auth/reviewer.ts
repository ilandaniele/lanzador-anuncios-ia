import type { Env } from "../../env";
import { magicLinkUrl } from "../../emails/magic-link";
import { notFound } from "../../lib/errors";
import { timingSafeEqual } from "../../lib/hash";
import { logEvent } from "../../lib/logger";
import { isSuperadminEmail } from "./emails";
import { issueEligibleLink } from "./magic-link";

const MIN_CODE_LENGTH = 32;

type ReviewerEnv = Parameters<typeof issueEligibleLink>[0] &
  Pick<Env, "REVIEWER_CODE">;

const configuredCode = (env: ReviewerEnv) => {
  const code = env.REVIEWER_CODE?.trim() ?? "";
  return code.length >= MIN_CODE_LENGTH ? code : null;
};

const configuredEmail = (env: ReviewerEnv) => {
  const email = env.REVIEWER_EMAIL?.trim().toLowerCase() ?? "";
  return email !== "" && !isSuperadminEmail(env, email) ? email : null;
};

export async function issueReviewerLink(
  env: ReviewerEnv,
  code: string,
  { ip, requestId }: { ip?: string; requestId: string },
): Promise<string> {
  const email = configuredEmail(env);
  const expected = configuredCode(env);
  if (!email || !expected) throw notFound();
  if (!timingSafeEqual(code, expected)) {
    logEvent("warn", "reviewer_code_rejected", { requestId });
    throw notFound();
  }

  const link = await issueEligibleLink(env, email, ip);
  if (!link) throw notFound();

  logEvent("info", "reviewer_link_issued", { requestId });
  return magicLinkUrl(env.APP_ORIGIN, link.token);
}
