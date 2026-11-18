import type { JobKind } from "../../api/services/jobs";
import { insightsRefreshJob } from "./insights-refresh";
import { metaDisconnectCleanupJob } from "./meta-disconnect-cleanup";
import { metaVideoStatusJob } from "./meta-video-status";
import { pilotRunJob } from "./pilot-run";
import { tagCreativeJob } from "./tag-creative";
import type { JobHandler } from "./job-context";

export const JOB_HANDLERS: Partial<Record<JobKind, JobHandler>> = {
  insights_refresh: insightsRefreshJob,
  meta_disconnect_cleanup: metaDisconnectCleanupJob,
  meta_video_status: metaVideoStatusJob,
  pilot_run: pilotRunJob,
  tag_creative: tagCreativeJob,
};
