import type { JobKind } from "../../api/services/jobs";
import { insightsRefreshJob } from "./insights-refresh";
import type { JobHandler } from "./job-context";

export const JOB_HANDLERS: Partial<Record<JobKind, JobHandler>> = {
  insights_refresh: insightsRefreshJob,
};
