import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types";

const RETRY_AFTER_SEC = 60;

export type RateLimitBinding =
  | "RL_IP"
  | "RL_USER"
  | "RL_AUTH"
  | "RL_EXP"
  | "RL_UPL"
  | "RL_POLL"
  | "RL_CLIENT_ERR";

const IPV6_HEXTETS = 8;
const IPV6_PREFIX_HEXTETS = 4;

const splitHextets = (part: string) => (part ? part.split(":") : []);

function expandIpv6(ip: string): string[] {
  if (!ip.includes("::")) return ip.split(":");
  const [head = "", tail = ""] = ip.split("::");
  const headHextets = splitHextets(head);
  const tailHextets = splitHextets(tail);
  const missing = IPV6_HEXTETS - headHextets.length - tailHextets.length;
  return [...headHextets, ...Array<string>(missing).fill("0"), ...tailHextets];
}

export function ipKey(ip: string): string {
  if (!ip.includes(":")) return ip;
  const prefix = expandIpv6(ip)
    .slice(0, IPV6_PREFIX_HEXTETS)
    .map((hextet) => parseInt(hextet, 16).toString(16));
  return `${prefix.join(":")}::/64`;
}

export const clientIp = (c: Context<AppEnv>) =>
  ipKey(c.req.header("CF-Connecting-IP") ?? "unknown");

export function rateLimit(
  binding: RateLimitBinding,
  key: (c: Context<AppEnv>) => string,
): MiddlewareHandler<AppEnv> {
  return createMiddleware<AppEnv>(async (c, next) => {
    const { success } = await c.env[binding].limit({ key: key(c) });
    if (!success) {
      throw new AppError(429, "RATE_LIMITED", {
        retryAfterSec: RETRY_AFTER_SEC,
      });
    }
    await next();
  });
}
