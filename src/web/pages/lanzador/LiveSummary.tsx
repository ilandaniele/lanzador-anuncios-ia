import { useState } from "react";
import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import { cx, focusRing } from "../../components/classes";
import { useMetaAssets } from "../../features/launch/use-meta-assets";
import { useProduct } from "../../features/products/use-products";
import { t } from "../../i18n/es-AR";
import { formatMoney } from "../../lib/money";

type LiveSummaryProps = {
  workspaceId: string;
  draft: PartialLaunchDraft;
  onSelectStep: (index: number) => void;
};

type SummaryRow = {
  key: string;
  label: string;
  value: string | undefined;
  step: number;
};

const MODE_LABELS = {
  new_cbo: "launcher.summary.newCbo",
  existing_cbo: "launcher.summary.existingCbo",
} as const;

function useSummaryRows(
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

export function LiveSummary({
  workspaceId,
  draft,
  onSelectStep,
}: LiveSummaryProps) {
  const [open, setOpen] = useState(false);
  const rows = useSummaryRows(workspaceId, draft);

  return (
    <aside
      aria-label={t("launcher.summary.title")}
      className="rounded-sm border border-rule bg-surface p-4 xl:w-80 xl:shrink-0"
    >
      <h2 className="font-semibold">{t("launcher.summary.title")}</h2>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx("text-primary xl:hidden", focusRing)}
      >
        {t(open ? "launcher.summary.hide" : "launcher.summary.show")}
      </button>
      <ul
        className={cx("mt-2 flex-col gap-1", open ? "flex" : "hidden xl:flex")}
      >
        {rows.map(({ key, label, value, step }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelectStep(step)}
              className={cx(
                "flex w-full justify-between gap-2 rounded-xs py-1 text-left hover:bg-paper",
                focusRing,
              )}
            >
              <span className="text-ink-muted">{label}</span>
              <span className={value ? "text-ink" : "text-ink-subtle"}>
                {value ?? t("launcher.summary.empty")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
