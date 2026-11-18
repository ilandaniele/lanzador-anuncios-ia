export const qk = {
  me: () => ["me"] as const,
  workspace: (workspaceId: string) => ["workspace", workspaceId] as const,
};
