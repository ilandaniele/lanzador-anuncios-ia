import { randomToken, sha256Hex, timingSafeEqual } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { now } from "../../lib/time";
import {
  deleteSession,
  findSessionByTokenHash,
  insertSession,
  rotateSessionToken,
  touchSession,
} from "../../repositories/sessions";
import type { SessionUser } from "../../types";

export const SESSION_COOKIE = "__Host-lanzador_sid";

const SECOND = 1000;
const HOUR = 3600 * SECOND;
const DAY = 24 * HOUR;
const ABSOLUTE_TTL = 30 * DAY;
const IDLE_TTL = 7 * DAY;
const ROTATE_EVERY = DAY;
const PREVIOUS_TOKEN_GRACE = 60 * SECOND;
const LAST_SEEN_THROTTLE = HOUR;
const USER_AGENT_MAX = 200;

export type SessionMeta = { userAgent?: string; ip?: string };

export type ResolvedSession = { user: SessionUser; cookie?: string };

const buildCookie = (value: string, maxAgeSec: number) =>
  `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

const sessionCookie = (token: string, expiresAt: number, at: number) =>
  buildCookie(token, Math.floor((expiresAt - at) / SECOND));

export const clearSessionCookie = () => buildCookie("", 0);

const dayStamp = (at: number) => new Date(at).toISOString().slice(0, 10);

export async function createSession(
  db: D1Database,
  userId: string,
  meta: SessionMeta,
): Promise<{ token: string; cookie: string }> {
  const at = now();
  const token = randomToken(32);
  const expiresAt = at + ABSOLUTE_TTL;
  await insertSession(db, {
    id: newId(),
    userId,
    tokenHash: await sha256Hex(token),
    rotatedAt: at,
    createdAt: at,
    lastSeenAt: at,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
    ipHash: meta.ip ? await sha256Hex(meta.ip + dayStamp(at)) : null,
  });
  return { token, cookie: sessionCookie(token, expiresAt, at) };
}

export async function resolveSession(
  db: D1Database,
  token: string,
): Promise<ResolvedSession | null> {
  const at = now();
  const tokenHash = await sha256Hex(token);
  const row = await findSessionByTokenHash(
    db,
    tokenHash,
    at - PREVIOUS_TOKEN_GRACE,
  );
  const usable =
    row &&
    row.userStatus === "active" &&
    row.expiresAt > at &&
    row.lastSeenAt > at - IDLE_TTL;
  if (!usable) return null;

  const user: SessionUser = {
    id: row.userId,
    email: row.email,
    name: row.name,
    isSuperadmin: row.isSuperadmin === 1,
    sessionId: row.sessionId,
  };
  if (!timingSafeEqual(row.tokenHash, tokenHash)) return { user };

  if (at - row.rotatedAt >= ROTATE_EVERY) {
    const nextToken = randomToken(32);
    const nextHash = await sha256Hex(nextToken);
    const rotated = await rotateSessionToken(
      db,
      row.sessionId,
      tokenHash,
      nextHash,
      at,
    );
    if (rotated) {
      return { user, cookie: sessionCookie(nextToken, row.expiresAt, at) };
    }
  } else if (at - row.lastSeenAt >= LAST_SEEN_THROTTLE) {
    await touchSession(db, row.sessionId, at);
  }
  return { user };
}

export async function destroySession(
  db: D1Database,
  sessionId: string,
): Promise<void> {
  await deleteSession(db, sessionId);
}
