import type { Graph } from "../../api/integrations/meta/client";
import {
  finishVideoUpload,
  startVideoUpload,
  transferVideoChunk,
  type VideoSession,
} from "../../api/integrations/meta/upload";
import { type MetaStepRunner, runMetaStep } from "./meta-step";
import type { SubrequestBudget } from "./subrequest-budget";

const CHUNK_SUBREQUESTS = 2;

export interface ResumableUploadOptions {
  ctx: { graph: Graph };
  actId: string;
  fileSize: number;
  title: string;
  readRange: (start: number, end: number) => Promise<ReadableStream>;
  budget: SubrequestBudget;
  resume?: VideoSession;
}

export interface ResumableUploadResult {
  videoId: string;
  resume?: VideoSession;
}

function transferChunk(
  step: MetaStepRunner,
  { ctx: { graph }, actId, readRange, budget }: ResumableUploadOptions,
  { sessionId, startOffset, endOffset }: VideoSession,
) {
  return runMetaStep(
    step,
    `transfer video chunk ${startOffset}`,
    async () =>
      transferVideoChunk(
        graph,
        actId,
        sessionId,
        startOffset,
        await readRange(startOffset, endOffset),
        endOffset - startOffset,
      ),
    { budget, subrequests: CHUNK_SUBREQUESTS },
  );
}

export async function runResumableUpload(
  step: MetaStepRunner,
  options: ResumableUploadOptions,
): Promise<ResumableUploadResult> {
  const {
    ctx: { graph },
    actId,
    fileSize,
    title,
    budget,
    resume,
  } = options;
  let session =
    resume ??
    (await runMetaStep(
      step,
      "start video upload",
      () => startVideoUpload(graph, actId, fileSize),
      { budget },
    ));

  for (;;) {
    if (budget.needsContinuation()) {
      return { videoId: session.videoId, resume: session };
    }
    if (session.startOffset >= session.endOffset) break;
    session = { ...session, ...(await transferChunk(step, options, session)) };
  }

  await runMetaStep(
    step,
    "finish video upload",
    () => finishVideoUpload(graph, actId, session.sessionId, title),
    { budget },
  );
  return { videoId: session.videoId };
}
