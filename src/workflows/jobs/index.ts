import type { JobKind } from "../../api/services/jobs";
import { insightsRefreshJob } from "./insights-refresh";
import { metaDisconnectCleanupJob } from "./meta-disconnect-cleanup";
import type { JobHandler } from "./job-context";

export const JOB_HANDLERS: Partial<Record<JobKind, JobHandler>> = {
  insights_refresh: insightsRefreshJob,
  meta_disconnect_cleanup: metaDisconnectCleanupJob,
};
