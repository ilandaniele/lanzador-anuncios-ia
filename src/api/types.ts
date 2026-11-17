import type { Role } from "../shared/constants";
import type { Env } from "./env";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  isSuperadmin: boolean;
  sessionId: string;
};

export type Scope = { workspaceId: string; userId: string; role: Role };

export type AppEnv = {
  Bindings: Env;
  Variables: { requestId: string; user?: SessionUser; scope?: Scope };
};
