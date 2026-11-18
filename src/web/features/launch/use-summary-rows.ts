import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import { useProduct } from "../products/use-products";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";
import { useMetaAssets } from "./use-meta-assets";

export type SummaryRow = {
  key: string;
  label: string;
  value: string | undefined;
  step: number;
};

const MODE_LABELS = {
  new_cbo: "launcher.summary.newCbo",
  existing_cbo: "launcher.summary.existingCbo",
} as const;

export function useSummaryRows(
  workspaceId: string,
  draft: PartialLaunchDraft,
): SummaryRow[] {
  const assets = useMetaAssets(workspaceId).data ?? [];
  const product = useProduct(workspaceId, draft.productId ?? "").data;
  const nameOf = (kind: string, key: "id" | "metaId", value?: string) =>
    assets.find((asset) => asset.kind === kind && asset[key] === value)?.name;
  const account = assets.find(({ id }) => id === draft.adAccountAssetId);

  return [
    {
      key: "account",
      label: t("launcher.summary.account"),
      value: nameOf("ad_account", "id", draft.adAccountAssetId),
      step: 0,
    },
    {
      key: "page",
      label: t("launcher.summary.page"),
      value: nameOf("page", "metaId", draft.pageId),
      step: 0,
    },
    {
      key: "pixel",
      label: t("launcher.summary.pixel"),
      value: nameOf("pixel", "metaId", draft.pixelId),
      step: 0,
    },
    {
      key: "structure",
      label: t("launcher.summary.structure"),
      value: draft.mode && t(MODE_LABELS[draft.mode]),
      step: 1,
    },
    {
      key: "product",
      label: t("launcher.summary.product"),
      value: product?.name,
      step: 2,
    },
    {
      key: "creatives",
      label: t("launcher.summary.creatives"),
      value: draft.items?.length ? String(draft.items.length) : undefined,
      step: 3,
    },
    {
      key: "budget",
      label: t("launcher.summary.budget"),
      value:
        draft.dailyBudgetMinor === undefined
          ? undefined
          : formatMoney(draft.dailyBudgetMinor, account?.currency ?? "USD"),
      step: 4,
    },
    {
      key: "countries",
      label: t("launcher.summary.countries"),
      value: draft.countries?.join(", "),
      step: 4,
    },
  ];
}
