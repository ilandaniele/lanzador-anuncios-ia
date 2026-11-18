import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LaunchListItemDto } from "../../../shared/schemas/launch";
import { Button } from "../../components/Button";
import { StatusChip } from "../../components/Chip";
import { t } from "../../i18n/es-AR";
import { qk } from "../../lib/query-keys";
import { statusLabel } from "../launch/progress-model";
import { ActivateLaunch } from "./ActivateLaunch";
import { canActivate, launchTone } from "./launch-tone";

const dateFormat = new Intl.DateTimeFormat("es-AR", { dateStyle: "short" });

type LatestLaunchesProps = {
  workspaceId: string;
  launches: LaunchListItemDto[];
  className?: string;
};

const launchName = ({ productName, campaignName }: LaunchListItemDto) =>
  productName ?? campaignName ?? t("hoy.launchUntitled");

export function LatestLaunches({
  workspaceId,
  launches,
  className,
}: LatestLaunchesProps) {
  const queryClient = useQueryClient();
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const closeActivation = () => {
    setActivatingId(null);
    void queryClient.invalidateQueries({ queryKey: qk.today(workspaceId) });
  };

  return (
    <section aria-labelledby="hoy-launches-title" className={className}>
      <h2 id="hoy-launches-title" className="mb-2 font-semibold">
        {t("hoy.launchesTitle")}
      </h2>
      {launches.length === 0 ? (
        <p className="text-ink-muted">{t("hoy.launchesEmpty")}</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {launches.map((launch) => (
            <li
              key={launch.id}
              className="flex flex-wrap items-center gap-3 py-2"
            >
              <time dateTime={launch.createdAt} className="text-ink-muted">
                {dateFormat.format(new Date(launch.createdAt))}
              </time>
              <span className="min-w-0 flex-1 truncate">
                {launchName(launch)}
              </span>
              <StatusChip tone={launchTone(launch.status)}>
                {statusLabel(launch.status)}
              </StatusChip>
              {canActivate(launch.status) && (
                <Button
                  variant="secondary"
                  aria-label={`${t("launchProgress.activate")} ${launchName(launch)}`}
                  onClick={() => setActivatingId(launch.id)}
                >
                  {t("launchProgress.activate")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {activatingId && (
        <ActivateLaunch
          workspaceId={workspaceId}
          launchId={activatingId}
          onClose={closeActivation}
        />
      )}
    </section>
  );
}
