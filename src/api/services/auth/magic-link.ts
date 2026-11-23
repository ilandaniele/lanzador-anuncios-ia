import type { Me } from "../../../shared/schemas/auth";
import { buildMagicLinkEmail } from "../../emails/magic-link";
import type { Env } from "../../env";
import { sendEmail } from "../../integrations/resend/client";
import { AppError } from "../../lib/errors";
import { hashIp, randomToken, sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { logEvent } from "../../lib/logger";
import { now } from "../../lib/time";
import {
  consumeMagicLink,
  findMagicLinkAccess,
  insertMagicLinkWithinCaps,
  invalidateMagicLink,
} from "../../repositories/magic-links";
import { isReviewerEmail, isSuperadminEmail } from "./emails";
import { signInVerifiedEmail } from "./login";
import type { SessionMeta } from "./session";

const MINUTE = 60_000;
const LINK_TTL = 15 * MINUTE;

type LinkEnv = Pick<
  Env,
  | "DB"
  | "APP_ORIGIN"
  | "SUPERADMIN_EMAIL"
  | "REVIEWER_EMAIL"
  | "RESEND_API_KEY"
  | "EMAIL_FROM"
>;

type MagicLinkIssue = { id: string; token: string };

const linkExpired = () => new AppError(410, "LINK_EXPIRED");

export async function issueMagicLink(
  env: LinkEnv,
  email: string,
  ip?: string,
): Promise<MagicLinkIssue | null> {
  if (isReviewerEmail(env, email)) return null;
  return issueEligibleLink(env, email, ip);
}

export async function issueEligibleLink(
  env: LinkEnv,
  email: string,
  ip?: string,
): Promise<MagicLinkIssue | null> {
  const at = now();
  const access = await findMagicLinkAccess(env.DB, email, at);
  const eligible =
    !access.disabled &&
    (access.userId !== null || access.invited || isSuperadminEmail(env, email));
  if (!eligible) return null;

  const id = newId();
  const token = randomToken(32);
  const issued = await insertMagicLinkWithinCaps(
    env.DB,
    {
      id,
      tokenHash: await sha256Hex(token),
      email,
      userId: access.userId,
      createdAt: at,
      expiresAt: at + LINK_TTL,
      ipHash: ip ? await hashIp(ip, at) : null,
    },
    at - LINK_TTL,
  );
  return issued ? { id, token } : null;
}

export async function deliverMagicLink(
  env: LinkEnv,
  email: string,
  link: MagicLinkIssue,
  requestId: string,
): Promise<void> {
  const content = buildMagicLinkEmail({
    appOrigin: env.APP_ORIGIN,
    token: link.token,
  });
  try {
    await sendEmail(env, { to: email, ...content });
  } catch (error) {
    logEvent("error", "magic_link_send_failed", {
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
    await invalidateMagicLink(env.DB, link.id, now());
  }
}

export async function verifyMagicLink(
  env: LinkEnv,
  token: string,
  meta: SessionMeta,
): Promise<{ me: Me; cookie: string }> {
  const at = now();
  const link = await consumeMagicLink(env.DB, await sha256Hex(token), at);
  if (!link) throw linkExpired();

  const signedIn = await signInVerifiedEmail(env, link.email, meta);
  if (!signedIn) throw linkExpired();
  return signedIn;
}
