export const qk = {
  me: () => ["me"] as const,
  workspace: (workspaceId: string) => ["workspace", workspaceId] as const,
  members: (workspaceId: string) => ["members", workspaceId] as const,
  invitations: (workspaceId: string) => ["invitations", workspaceId] as const,
};
