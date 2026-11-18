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
  productCopies: (workspaceId: string, productId: string) =>
    ["products", workspaceId, "item", productId, "copies"] as const,
  creativesByIds: (workspaceId: string, ids: string[]) =>
    ["creatives", workspaceId, "ids", ...ids] as const,
  creativeLists: (workspaceId: string) =>
    ["creatives", workspaceId, "list"] as const,
  creativeList: (workspaceId: string, search: string) =>
    ["creatives", workspaceId, "list", search] as const,
  today: (workspaceId: string) => ["today", workspaceId] as const,
  pilotPending: (workspaceId: string) =>
    ["pilot", workspaceId, "pending"] as const,
  pilotHistory: (workspaceId: string) =>
    ["pilot", workspaceId, "history"] as const,
  pilotHistoryStatus: (workspaceId: string, status: string) =>
    ["pilot", workspaceId, "history", status] as const,
  pilotRules: (workspaceId: string) => ["pilot", workspaceId, "rules"] as const,
  pilotLastRun: (workspaceId: string) =>
    ["pilot", workspaceId, "last-run"] as const,
  adminWorkspaces: () => ["admin", "workspaces"] as const,
  adminUsage: (month: string) => ["admin", "usage", month] as const,
  adminErrors: (source: string) => ["admin", "errors", source] as const,
  launch: (workspaceId: string, launchId: string) =>
    ["launches", workspaceId, launchId] as const,
  launchProgress: (workspaceId: string, launchId: string) =>
    ["launch-progress", workspaceId, launchId] as const,
  launchHistory: (workspaceId: string) =>
    ["launches", workspaceId, "history"] as const,
  auditHistory: (workspaceId: string, search: string) =>
    ["audit", workspaceId, search] as const,
  metaAssets: (workspaceId: string) => ["meta-assets", workspaceId] as const,
  metaAssetsAll: (workspaceId: string) =>
    ["meta-assets", workspaceId, "all"] as const,
  metaConnections: (workspaceId: string) =>
    ["meta-connections", workspaceId] as const,
  googleConnection: (workspaceId: string) =>
    ["google-connection", workspaceId] as const,
  metaCampaigns: (workspaceId: string, adAccountAssetId: string) =>
    ["meta-campaigns", workspaceId, adAccountAssetId] as const,
  metricsAll: (workspaceId: string) => ["metrics", workspaceId] as const,
  metrics: (workspaceId: string, search: string) =>
    ["metrics", workspaceId, search] as const,
  topAds: (workspaceId: string, search: string) =>
    ["metrics", workspaceId, "top-ads", search] as const,
  winningTags: (workspaceId: string, search: string) =>
    ["metrics", workspaceId, "winning-tags", search] as const,
  metaCampaignReference: (
    workspaceId: string,
    adAccountAssetId: string,
    campaignId: string,
  ) => ["meta-campaigns", workspaceId, adAccountAssetId, campaignId] as const,
  metaCampaignAds: (
    workspaceId: string,
    adAccountAssetId: string,
    campaignId: string,
  ) =>
    [
      "meta-campaigns",
      workspaceId,
      adAccountAssetId,
      campaignId,
      "ads",
    ] as const,
};
