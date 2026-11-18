import type { JobKind } from "../../api/services/jobs";
import type { JobHandler } from "./job-context";

export const JOB_HANDLERS: Partial<Record<JobKind, JobHandler>> = {};
