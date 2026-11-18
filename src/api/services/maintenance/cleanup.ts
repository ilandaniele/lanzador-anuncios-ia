import { DAY_MS, HOUR_MS } from "../../lib/time";
import { runCleanupBatch } from "../../repositories/maintenance";

const INSIGHTS_GRACE_MS = DAY_MS;
const ERROR_EVENTS_RETENTION_MS = 30 * DAY_MS;
const AI_QUEUED_TIMEOUT_MS = 6 * HOUR_MS;

export const runCleanup = (db: D1Database, at: number) =>
  runCleanupBatch(db, {
    at,
    insightsExpiredBefore: at - INSIGHTS_GRACE_MS,
    errorEventsBefore: at - ERROR_EVENTS_RETENTION_MS,
    aiQueuedBefore: at - AI_QUEUED_TIMEOUT_MS,
  });
