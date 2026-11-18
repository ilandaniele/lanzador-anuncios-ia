import { useProducts } from "../products/use-products";
import { t } from "../../i18n/es-AR";
import type { ComboboxOption } from "../../components/Combobox";
import { assetOptions } from "../launch/asset-options";
import { useMetaAssets } from "../launch/use-meta-assets";

export const ALL = "";

type QueryState = {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
};

const comboboxState = (query: QueryState) => ({
  loading: query.isPending,
  loadError: query.isError ? t("combobox.error") : undefined,
  onRetry: () => void query.refetch(),
});

export function useMetricsOptions(workspaceId: string) {
  const assets = useMetaAssets(workspaceId);
  const products = useProducts(workspaceId, false);
  const productList = products.data?.pages.flatMap((page) => page.data) ?? [];
  const accountList = assetOptions(assets.data ?? [], "ad_account");

  return {
    hasNoAccounts: assets.isSuccess && accountList.length === 0,
    accounts: {
      options: [
        { value: ALL, label: t("metrics.allAccounts") },
        ...accountList,
      ],
      state: comboboxState(assets),
    },
    products: {
      options: [
        { value: ALL, label: t("metrics.allProducts") },
        ...productList.map(({ id, name }): ComboboxOption => ({
          value: id,
          label: name,
        })),
      ],
      state: comboboxState(products),
      breakEvenById: new Map(
        productList.map(({ id, breakEvenRoas }) => [id, breakEvenRoas]),
      ),
    },
  };
}

export type MetricsOptions = ReturnType<typeof useMetricsOptions>;

export const optionLabel = (options: ComboboxOption[], value: string) =>
  value === ALL
    ? undefined
    : options.find((option) => option.value === value)?.label;
