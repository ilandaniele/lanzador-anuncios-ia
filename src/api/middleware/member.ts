import type { Role } from "../../shared/constants";
import { requireRole, requireRoleOrSelf } from "./require-role";
import { session } from "./session";
import { workspace } from "./workspace";

export const member = (min: Role) =>
  [session({ required: true }), workspace(), requireRole(min)] as const;

export const memberOrSelf = (min: Role, param: string) =>
  [
    session({ required: true }),
    workspace(),
    requireRoleOrSelf(min, param),
  ] as const;
