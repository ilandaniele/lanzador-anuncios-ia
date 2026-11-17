import type { Me } from "../../../shared/schemas/auth";
import { buildMagicLinkEmail } from "../../emails/magic-link";
import type { Env } from "../../env";
import { sendEmail } from "../../integrations/resend/client";
import { AppError } from "../../lib/errors";
import { hashIp, randomToken, sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { now } from "../../lib/time";
import {
  consumeMagicLink,
  findMagicLinkAccess,
  insertMagicLink,
  invalidateMagicLink,
} from "../../repositories/magic-links";
import { findUserByEmail, upsertLoginUser } from "../../repositories/users";
import { countRecentMagicLinks } from "../../repositories/windows";
import { getMe } from "./me";
import { createSession, type SessionMeta } from "./session";

const MINUTE = 60_000;
const LINK_TTL = 15 * MINUTE;
const LINKS_PER_WINDOW = 5;

type LinkEnv = Pick<
  Env,
  "DB" | "APP_ORIGIN" | "SUPERADMIN_EMAIL" | "RESEND_API_KEY" | "EMAIL_FROM"
>;

const linkExpired = () => new AppError(410, "LINK_EXPIRED");

const isSuperadminEmail = (env: LinkEnv, email: string) => {
  const superadmin = env.SUPERADMIN_EMAIL.trim().toLowerCase();
  return superadmin !== "" && superadmin === email;
};

export async function issueMagicLink(
  env: LinkEnv,
  email: string,
  ip?: string,
): Promise<{ id: string; token: string } | null> {
  const at = now();
  const access = await findMagicLinkAccess(env.DB, email, at);
  const eligible =
    access.userId !== null || access.invited || isSuperadminEmail(env, email);
  if (!eligible) return null;

  const recent = await countRecentMagicLinks(
    env.DB,
    email,
    at - LINK_TTL,
    LINKS_PER_WINDOW + 1,
  );
  if (recent >= LINKS_PER_WINDOW) {
    throw new AppError(429, "RATE_LIMITED", { retryAfterSec: LINK_TTL / 1000 });
  }

  const id = newId();
  const token = randomToken(32);
  await insertMagicLink(env.DB, {
    id,
    tokenHash: await sha256Hex(token),
    email,
    userId: access.userId,
    createdAt: at,
    expiresAt: at + LINK_TTL,
    ipHash: ip ? await hashIp(ip, at) : null,
  });
  return { id, token };
}

export async function requestMagicLink(
  env: LinkEnv,
  email: string,
  ip?: string,
): Promise<void> {
  const link = await issueMagicLink(env, email, ip);
  if (!link) return;

  const content = buildMagicLinkEmail({
    appOrigin: env.APP_ORIGIN,
    token: link.token,
  });
  try {
    await sendEmail(env, { to: email, ...content });
  } catch (error) {
    await invalidateMagicLink(env.DB, link.id, now());
    throw error;
  }
}

async function canCreateUser(env: LinkEnv, email: string, at: number) {
  if (isSuperadminEmail(env, email)) return true;
  return (await findMagicLinkAccess(env.DB, email, at)).invited;
}

export async function verifyMagicLink(
  env: LinkEnv,
  token: string,
  meta: SessionMeta,
): Promise<{ me: Me; cookie: string }> {
  const at = now();
  const link = await consumeMagicLink(env.DB, await sha256Hex(token), at);
  if (!link) throw linkExpired();

  const existing = await findUserByEmail(env.DB, link.email);
  if (existing?.status === "disabled") throw linkExpired();
  if (!existing && !(await canCreateUser(env, link.email, at))) {
    throw linkExpired();
  }

  const user = await upsertLoginUser(env.DB, {
    id: newId(),
    email: link.email,
    isSuperadmin: isSuperadminEmail(env, link.email),
    at,
  });
  const { cookie } = await createSession(env.DB, user.id, meta);
  const me = await getMe(env.DB, {
    ...user,
    isSuperadmin: user.isSuperadmin === 1,
  });
  return { me, cookie };
}
