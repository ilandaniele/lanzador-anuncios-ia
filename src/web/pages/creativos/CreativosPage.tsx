import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import type { SelectOption } from "../../components/Select";
import type { CreativeLayout } from "../../features/creatives/CreativeEntry";
import { CreativeGrid } from "../../features/creatives/CreativeGrid";
import { CreativeSelectionBar } from "../../features/creatives/CreativeSelectionBar";
import type { CreativeSort } from "../../features/creatives/creative-filters";
import { useKnownTags } from "../../features/creatives/use-known-tags";
import { CreativesToolbar } from "../../features/creatives/CreativesToolbar";
import { useCreatives } from "../../features/creatives/use-creatives";
import { useCreativeSelection } from "../../features/creatives/use-creative-selection";
import { assetOptions } from "../../features/launch/asset-options";
import { useMetaAssets } from "../../features/launch/use-meta-assets";
import { useCanEdit } from "../../features/products/use-can-edit";
import { Dropzone } from "../../features/uploads/Dropzone";
import type { UploadEnvironment } from "../../features/uploads/upload-environment";
import { t } from "../../i18n/es-AR";
import { workspacePath } from "../../layout/nav-items";
import { qk } from "../../lib/query-keys";
import { CreativeDetail } from "./CreativeDetail";

type CreativeLibraryProps = {
  workspaceId: string;
  accounts: SelectOption[];
  environment?: UploadEnvironment;
};

function CreativeLibrary({
  workspaceId,
  accounts,
  environment,
}: CreativeLibraryProps) {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit(workspaceId);
  const [pickedAccountId, setPickedAccountId] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<CreativeSort>("recent");
  const [layout, setLayout] = useState<CreativeLayout>("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const adAccountAssetId = pickedAccountId ?? accounts[0]?.value ?? "";
  const query = useCreatives(workspaceId, { adAccountAssetId, tag, sort });
  const creatives = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  );
  const knownTags = useKnownTags(creatives);
  const selection = useCreativeSelection(
    workspaceId,
    adAccountAssetId,
    creatives,
  );
  const opened = creatives.find(({ id }) => id === openId);

  function changeAccount(accountId: string) {
    setPickedAccountId(accountId);
    setTag("");
    selection.clear();
  }

  return (
    <div className="flex flex-col gap-4">
      <CreativesToolbar
        accounts={accounts}
        accountId={adAccountAssetId}
        onAccountChange={changeAccount}
        sort={sort}
        onSortChange={setSort}
        layout={layout}
        onLayoutChange={setLayout}
        tags={knownTags}
        activeTag={tag}
        onTagChange={setTag}
      />
      {canEdit && (
        <Dropzone
          workspaceId={workspaceId}
          adAccountAssetId={adAccountAssetId}
          environment={environment}
          onReady={() =>
            void queryClient.invalidateQueries({
              queryKey: qk.creativeLists(workspaceId),
            })
          }
        />
      )}
      <CreativeGrid
        query={query}
        creatives={creatives}
        layout={layout}
        filtered={tag !== ""}
        selectable={canEdit}
        chosenIds={selection.chosenIds}
        onToggle={selection.toggle}
        onOpen={setOpenId}
      />
      {selection.chosenCount > 0 && (
        <CreativeSelectionBar
          count={selection.chosenCount}
          creating={selection.creating}
          failed={selection.failed}
          onUse={selection.useInLaunch}
        />
      )}
      {opened && (
        <CreativeDetail
          workspaceId={workspaceId}
          creative={opened}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

export default function CreativosPage({
  environment,
}: {
  environment?: UploadEnvironment;
}) {
  const { workspaceId = "" } = useParams();
  const navigate = useNavigate();
  const assets = useMetaAssets(workspaceId);
  const accounts = assetOptions(assets.data ?? [], "ad_account");

  if (assets.isSuccess && accounts.length === 0)
    return (
      <EmptyState
        message={t("creatives.noAccounts")}
        action={
          <Button
            onClick={() =>
              navigate(workspacePath(workspaceId, "ajustes/conexiones"))
            }
          >
            {t("creatives.connect")}
          </Button>
        }
      />
    );

  return (
    <section aria-labelledby="creativos-titulo">
      <h1 id="creativos-titulo" className="mb-4 text-xl font-semibold">
        {t("nav.creativos")}
      </h1>
      {assets.isError && (
        <div className="flex flex-col items-center gap-2 py-6">
          <p role="alert" className="text-loss">
            {t("creatives.loadError")}
          </p>
          <Button variant="secondary" onClick={() => void assets.refetch()}>
            {t("errors.retry")}
          </Button>
        </div>
      )}
      {assets.isSuccess && (
        <CreativeLibrary
          workspaceId={workspaceId}
          accounts={accounts}
          environment={environment}
        />
      )}
    </section>
  );
}
