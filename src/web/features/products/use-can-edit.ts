import { ROLE_RANK } from "../../../shared/constants";
import { useMe } from "../auth/use-me";

export function useCanEdit(workspaceId: string): boolean {
  const { data: me } = useMe();
  const role = me?.workspaces.find(({ id }) => id === workspaceId)?.role;
  return role !== undefined && ROLE_RANK[role] >= ROLE_RANK.editor;
}
