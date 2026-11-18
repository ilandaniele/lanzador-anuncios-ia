import { useMe } from "../auth/use-me";

export function useWorkspaceRole(workspaceId: string) {
  const { data: me } = useMe();
  return me?.workspaces.find(({ id }) => id === workspaceId)?.role;
}
