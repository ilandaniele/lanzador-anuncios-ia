import type { JobKind } from "../../api/services/jobs";
import { activateLaunchJob } from "./activate-launch";
import { driveImportFileJob } from "./drive-import-file";
import { insightsRefreshJob } from "./insights-refresh";
import { metaDisconnectCleanupJob } from "./meta-disconnect-cleanup";
import { metaVideoStatusJob } from "./meta-video-status";
import { pilotRunJob } from "./pilot-run";
import { purgeWorkspaceJob } from "./purge-workspace";
import { tagCreativeJob } from "./tag-creative";
import type { JobHandler } from "./job-context";

export const JOB_HANDLERS: Partial<Record<JobKind, JobHandler>> = {
  activate_launch: activateLaunchJob,
  drive_import_file: driveImportFileJob,
  insights_refresh: insightsRefreshJob,
  meta_disconnect_cleanup: metaDisconnectCleanupJob,
  meta_video_status: metaVideoStatusJob,
  pilot_run: pilotRunJob,
  purge_workspace: purgeWorkspaceJob,
  tag_creative: tagCreativeJob,
};
