import type { Me } from "../../../shared/schemas/auth";
import type { Env } from "../../env";
import { newId } from "../../lib/ids";
import { now } from "../../lib/time";
import { findMagicLinkAccess } from "../../repositories/magic-links";
import { findUserByEmail, upsertLoginUser } from "../../repositories/users";
import { isSuperadminEmail } from "./emails";
import { getMe } from "./me";
import { createSession, type SessionMeta } from "./session";

type LoginEnv = Pick<Env, "DB" | "SUPERADMIN_EMAIL">;

async function canCreateUser(env: LoginEnv, email: string, at: number) {
  if (isSuperadminEmail(env, email)) return true;
  return (await findMagicLinkAccess(env.DB, email, at)).invited;
}

export async function signInVerifiedEmail(
  env: LoginEnv,
  email: string,
  meta: SessionMeta,
): Promise<{ me: Me; cookie: string } | null> {
  const at = now();
  const existing = await findUserByEmail(env.DB, email);
  if (existing?.status === "disabled") return null;
  if (!existing && !(await canCreateUser(env, email, at))) return null;

  const user = await upsertLoginUser(env.DB, {
    id: newId(),
    email,
    isSuperadmin: isSuperadminEmail(env, email),
    at,
  });
  const { cookie } = await createSession(env.DB, user.id, meta);
  const me = await getMe(env.DB, {
    ...user,
    isSuperadmin: user.isSuperadmin === 1,
  });
  return { me, cookie };
}
