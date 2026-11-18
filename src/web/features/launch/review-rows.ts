import type {
  LaunchPlan,
  PartialLaunchDraft,
} from "../../../shared/schemas/launch";
import type { AssetDto } from "../../../shared/schemas/meta-connections";
import type { Settings } from "../../../shared/schemas/workspaces";
import type { ReceiptRow } from "../../components/ConfirmDialog";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";

export type ReviewNames = {
  account?: string;
  page?: string;
  instagram?: string;
  pixel?: string;
};

export function reviewNames(
  assets: AssetDto[],
  draft: PartialLaunchDraft,
): ReviewNames {
  const nameOf = (kind: AssetDto["kind"], key: "id" | "metaId", id?: string) =>
    assets.find((asset) => asset.kind === kind && asset[key] === id)?.name;
  return {
    account: nameOf("ad_account", "id", draft.adAccountAssetId),
    page: nameOf("page", "metaId", draft.pageId),
    instagram: nameOf("instagram", "metaId", draft.instagramUserId),
    pixel: nameOf("pixel", "metaId", draft.pixelId),
  };
}

type ReviewRowsInput = {
  draft: PartialLaunchDraft;
  settings: Settings;
  names: ReviewNames;
  plan?: LaunchPlan;
};

const scheduleFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const MODE_LABELS = {
  new_cbo: "launcher.summary.newCbo",
  existing_cbo: "launcher.summary.existingCbo",
} as const;

export function reviewRows({
  draft,
  settings,
  names,
  plan,
}: ReviewRowsInput): ReceiptRow[] {
  const { budgetCurrency } = settings;
  const isCostCap = draft.bidStrategy === "COST_CAP";
  const rows: (ReceiptRow | false | undefined)[] = [
    {
      label: t("launcher.review.rowAccount"),
      value: names.account ?? draft.adAccountAssetId ?? "",
    },
    {
      label: t("launcher.review.rowPage"),
      value: names.page ?? draft.pageId ?? "",
    },
    draft.instagramUserId !== undefined && {
      label: t("launcher.review.rowInstagram"),
      value: names.instagram ?? draft.instagramUserId,
    },
    {
      label: t("launcher.review.rowPixel"),
      value: names.pixel ?? draft.pixelId ?? "",
    },
    draft.mode && {
      label: t("launcher.review.rowStructure"),
      value: t(MODE_LABELS[draft.mode]),
    },
    {
      label: t("launcher.review.rowCampaign"),
      value: plan?.campaign?.name ?? draft.campaignName ?? "",
    },
    {
      label: t("launcher.review.rowAdset"),
      value: plan?.adset.name ?? draft.adsetName ?? "",
    },
    {
      label: t("launcher.review.rowAds"),
      value: String(draft.items?.length ?? 0),
    },
    {
      label: t("launcher.review.rowBudget"),
      value:
        draft.mode === "new_cbo" && draft.dailyBudgetMinor !== undefined
          ? formatMoney(draft.dailyBudgetMinor, budgetCurrency)
          : t("launcher.review.rowBudgetExisting"),
    },
    {
      label: t("launcher.review.rowStrategy"),
      value: t(
        isCostCap ? "launcher.step5.costCap" : "launcher.step5.lowestCost",
      ),
    },
    isCostCap &&
      draft.bidAmountMinor !== undefined && {
        label: t("launcher.review.rowBidAmount"),
        value: formatMoney(draft.bidAmountMinor, budgetCurrency),
      },
    {
      label: t("launcher.review.rowCountries"),
      value: (draft.countries ?? []).join(", "),
    },
    {
      label: t("launcher.review.rowEvent"),
      value: t("launcher.step5.eventPurchase"),
    },
    {
      label: t("launcher.review.rowSchedule"),
      value: draft.startAt
        ? scheduleFormat.format(new Date(draft.startAt))
        : t("launcher.review.rowNoSchedule"),
    },
    {
      label: t("launcher.review.rowAdvantage"),
      value: t(
        settings.advantageCreativeEnabled
          ? "launcher.review.advantageOn"
          : "launcher.review.advantageOff",
      ),
    },
  ];
  return rows.filter((row): row is ReceiptRow => Boolean(row));
}
