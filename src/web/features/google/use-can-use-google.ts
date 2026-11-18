import { ROLE_RANK } from "../../../shared/constants";
import { useWorkspaceRole } from "../settings/use-workspace-role";

export function useCanUseGoogle(workspaceId: string): boolean {
  const role = useWorkspaceRole(workspaceId);
  return role !== undefined && ROLE_RANK[role] >= ROLE_RANK.editor;
}
