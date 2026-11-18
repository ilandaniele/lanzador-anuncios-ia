import { z } from "zod";
import type { AssetKind } from "../../../shared/constants";
import type { Graph } from "./client";
import { invalidPayloadError } from "./errors";

const PAGE_SIZE = 100;
const MAX_ITEMS_PER_EDGE = 500;
const BUSINESS_SCOPE = "business_management";

const AD_ACCOUNT_FIELDS =
  "id,name,account_id,account_status,currency,timezone_name,business{id,name},adspixels{id,name,last_fired_time}";
const PAGE_FIELDS = "id,name,instagram_business_account{id,username}";

const userSchema = z.object({ id: z.string(), name: z.string() });

const adAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  account_status: z.number().optional(),
  currency: z.string().optional(),
  timezone_name: z.string().optional(),
  business: z.object({ id: z.string(), name: z.string() }).optional(),
  adspixels: z
    .object({ data: z.array(z.object({ id: z.string(), name: z.string() })) })
    .optional(),
});

const pageSchema = z.object({
  id: z.string(),
  name: z.string(),
  instagram_business_account: z
    .object({ id: z.string(), username: z.string().optional() })
    .optional(),
});

const edgeSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    paging: z
      .object({
        cursors: z.object({ after: z.string().optional() }).optional(),
      })
      .optional(),
  });

export interface GranularScope {
  scope: string;
  target_ids?: string[];
}

export interface DiscoveredAsset {
  kind: AssetKind;
  metaId: string;
  name: string;
  parentMetaId: string | null;
  currency: string | null;
  timezoneName: string | null;
  accountStatus: number | null;
}

export interface DiscoveredAssets {
  user: z.infer<typeof userSchema>;
  businessId: string | null;
  businessName: string | null;
  assets: DiscoveredAsset[];
}

function parse<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw invalidPayloadError();
  return result.data;
}

async function fetchEdge<S extends z.ZodType>(
  graph: Graph,
  path: string,
  fields: string,
  item: S,
): Promise<z.infer<S>[]> {
  const items: z.infer<S>[] = [];
  let after: string | undefined;
  while (items.length < MAX_ITEMS_PER_EDGE) {
    const page = parse(
      edgeSchema(item),
      await graph.get<unknown>(path, {
        fields,
        limit: PAGE_SIZE,
        ...(after ? { after } : {}),
      }),
    );
    items.push(...page.data);
    after = page.paging?.cursors?.after;
    if (!after || page.data.length < PAGE_SIZE) break;
  }
  return items.slice(0, MAX_ITEMS_PER_EDGE);
}

async function fetchPages(graph: Graph) {
  const pages = await fetchEdge(graph, "me/accounts", PAGE_FIELDS, pageSchema);
  if (pages.length > 0) return pages;
  return fetchEdge(graph, "me/assigned_pages", PAGE_FIELDS, pageSchema);
}

type AdAccount = z.infer<typeof adAccountSchema>;
type Page = z.infer<typeof pageSchema>;

const emptyAsset = {
  parentMetaId: null,
  currency: null,
  timezoneName: null,
  accountStatus: null,
};

const adAccountAssets = (account: AdAccount): DiscoveredAsset[] => [
  {
    ...emptyAsset,
    kind: "ad_account",
    metaId: account.id,
    name: account.name,
    currency: account.currency ?? null,
    timezoneName: account.timezone_name ?? null,
    accountStatus: account.account_status ?? null,
  },
  ...(account.adspixels?.data ?? []).map((pixel) => ({
    ...emptyAsset,
    kind: "pixel" as const,
    metaId: pixel.id,
    name: pixel.name,
    parentMetaId: account.id,
  })),
];

const pageAssets = (page: Page): DiscoveredAsset[] => [
  { ...emptyAsset, kind: "page", metaId: page.id, name: page.name },
  ...(page.instagram_business_account
    ? [
        {
          ...emptyAsset,
          kind: "instagram" as const,
          metaId: page.instagram_business_account.id,
          name:
            page.instagram_business_account.username ??
            page.instagram_business_account.id,
          parentMetaId: page.id,
        },
      ]
    : []),
];

function uniqueAssets(assets: DiscoveredAsset[]): DiscoveredAsset[] {
  const byKey = new Map(
    assets.map((asset) => [`${asset.kind}:${asset.metaId}`, asset]),
  );
  return [...byKey.values()];
}

export function resolveBusiness(
  accounts: AdAccount[],
  granularScopes: GranularScope[],
) {
  const scoped = granularScopes.find(({ scope }) => scope === BUSINESS_SCOPE)
    ?.target_ids?.[0];
  const businesses = accounts.flatMap(({ business }) =>
    business ? [business] : [],
  );
  const business = scoped
    ? businesses.find(({ id }) => id === scoped)
    : businesses[0];
  return {
    businessId: scoped ?? business?.id ?? null,
    businessName: business?.name ?? null,
  };
}

export async function discoverAssets(
  graph: Graph,
  granularScopes: GranularScope[] = [],
): Promise<DiscoveredAssets> {
  const user = parse(
    userSchema,
    await graph.get<unknown>("me", { fields: "id,name" }),
  );
  const accounts = await fetchEdge(
    graph,
    "me/adaccounts",
    AD_ACCOUNT_FIELDS,
    adAccountSchema,
  );
  const pages = await fetchPages(graph);
  return {
    user,
    ...resolveBusiness(accounts, granularScopes),
    assets: uniqueAssets([
      ...accounts.flatMap(adAccountAssets),
      ...pages.flatMap(pageAssets),
    ]),
  };
}
