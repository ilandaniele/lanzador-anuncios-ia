import type { Role } from "../../shared/constants";
import { requireRole, requireRoleOrSelf } from "./require-role";
import { session } from "./session";
import { type WorkspaceOptions, workspace } from "./workspace";

export const member = (min: Role, options?: WorkspaceOptions) =>
  [session({ required: true }), workspace(options), requireRole(min)] as const;

export const memberOrSelf = (
  min: Role,
  param: string,
  options?: WorkspaceOptions,
) =>
  [
    session({ required: true }),
    workspace(options),
    requireRoleOrSelf(min, param),
  ] as const;
