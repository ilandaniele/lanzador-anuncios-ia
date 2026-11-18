export const qk = {
  me: () => ["me"] as const,
  workspace: (workspaceId: string) => ["workspace", workspaceId] as const,
  members: (workspaceId: string) => ["members", workspaceId] as const,
  invitations: (workspaceId: string) => ["invitations", workspaceId] as const,
  products: (workspaceId: string) => ["products", workspaceId] as const,
  productList: (workspaceId: string, archived: boolean) =>
    ["products", workspaceId, "list", archived] as const,
  product: (workspaceId: string, productId: string) =>
    ["products", workspaceId, "item", productId] as const,
  adminWorkspaces: () => ["admin", "workspaces"] as const,
  metaAssets: (workspaceId: string) => ["meta-assets", workspaceId] as const,
  metaAssetsAll: (workspaceId: string) =>
    ["meta-assets", workspaceId, "all"] as const,
  metaConnections: (workspaceId: string) =>
    ["meta-connections", workspaceId] as const,
};
