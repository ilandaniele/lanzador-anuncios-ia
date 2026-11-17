import type { Env } from "./env";
import type { Scope } from "./repositories/scope";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  isSuperadmin: boolean;
  sessionId: string;
};

export type AppEnv = {
  Bindings: Env;
  Variables: { requestId: string; user?: SessionUser; scope?: Scope };
};
