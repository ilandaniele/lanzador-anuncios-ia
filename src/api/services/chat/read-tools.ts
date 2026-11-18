import { z } from "zod";
import { ASSET_KINDS, CREATIVE_KINDS } from "../../../shared/constants";
import { CAMPAIGN_STATUSES } from "../../../shared/schemas/meta-campaigns";
import { listCreatives } from "../creatives";
import { listAssets } from "../meta/assets";
import { listAccountCampaigns } from "../meta/campaigns";
import { listProducts } from "../products";
import { defineTool } from "./tool-kit";

const RESULTS_MAX = 10;
const ASSETS_MAX = 50;
const CAMPAIGNS_MAX = 30;
const QUERY_MAX = 120;
const ID_MAX = 64;

const searchText = z.string().trim().min(1).max(QUERY_MAX).optional();
const assetId = z.string().min(1).max(ID_MAX);

export const searchProductsTool = defineTool({
  name: "search_products",
  description:
    "Busca productos activos del workspace por nombre. Devuelve id, nombre, landing y copy base.",
  args: z.object({ query: searchText }),
  async run({ env, scope }, { query }) {
    const { data } = await listProducts(env.DB, scope, {
      q: query,
      archived: false,
      limit: RESULTS_MAX,
    });
    return data.map(({ id, name, landingUrl, headline, primaryText, cta }) => ({
      id,
      name,
      landingUrl,
      headline,
      primaryText,
      cta,
    }));
  },
});

export const listEnabledAssetsTool = defineTool({
  name: "list_enabled_assets",
  description:
    "Lista los activos de Meta habilitados: cuentas publicitarias, páginas y píxeles.",
  args: z.object({ kind: z.enum(ASSET_KINDS).optional() }),
  async run({ env, scope }, { kind }) {
    const { data } = await listAssets(env.DB, scope, {
      kind,
      enabled: true,
      limit: ASSETS_MAX,
    });
    return data.map(({ id, kind, metaId, name, currency }) => ({
      id,
      kind,
      metaId,
      name,
      currency,
    }));
  },
});

export const listCampaignsTool = defineTool({
  name: "list_campaigns",
  description:
    "Lista las campañas de una cuenta publicitaria habilitada. Solo lectura.",
  args: z.object({ adAccountAssetId: assetId }),
  async run({ env, scope }, { adAccountAssetId }) {
    const { data, truncated } = await listAccountCampaigns(
      env,
      scope,
      adAccountAssetId,
      [...CAMPAIGN_STATUSES].sort(),
    );
    return {
      campaigns: data.slice(0, CAMPAIGNS_MAX),
      truncated: truncated || data.length > CAMPAIGNS_MAX,
    };
  },
});

export const listRecentCreativesTool = defineTool({
  name: "list_recent_creatives",
  description:
    "Lista los creativos más recientes de la biblioteca, con filtros opcionales.",
  args: z.object({
    adAccountAssetId: assetId.optional(),
    kind: z.enum(CREATIVE_KINDS).optional(),
    query: searchText,
  }),
  async run({ env, scope }, { adAccountAssetId, kind, query }) {
    const { data } = await listCreatives(env.DB, scope, {
      adAccountAssetId,
      kind,
      q: query,
      sort: "recent",
      limit: RESULTS_MAX,
    });
    return data.map(({ id, name, kind, status, adAccountAssetId, tags }) => ({
      id,
      name,
      kind,
      status,
      adAccountAssetId,
      tags,
    }));
  },
});
