import type { ErrorCode } from "../../../shared/errors";
import { t, type TextKey } from "../../i18n/es-AR";
import { ApiError } from "../../lib/api";

const MESSAGE_KEYS: Partial<Record<ErrorCode, TextKey>> = {
  INVITATION_PENDING: "members.errorInvitationPending",
  ALREADY_INVITED: "members.errorInvitationPending",
  ALREADY_MEMBER: "members.errorAlreadyMember",
  PLAN_MEMBER_LIMIT: "members.errorPlanLimit",
  OWNER_CANNOT_LEAVE: "members.errorOwnerCannotLeave",
  CANNOT_CHANGE_OWNER: "members.errorCannotChangeOwner",
  NOT_A_MEMBER: "members.errorNotAMember",
};

export function memberErrorMessage(error: unknown): string {
  const key = error instanceof ApiError ? MESSAGE_KEYS[error.code] : undefined;
  return t(key ?? "errors.generic");
}
