import { describe, expect, it, vi } from "vitest";
import type { Graph } from "../../../src/api/integrations/meta/client";
import { classifyMetaError } from "../../../src/api/integrations/meta/errors";
import type { MetaStepRunner } from "../../../src/workflows/lib/meta-step";
import { runResumableUpload } from "../../../src/workflows/lib/resumable-upload";
import {
  CONTINUATION_THRESHOLD,
  SubrequestBudget,
} from "../../../src/workflows/lib/subrequest-budget";

const MIB = 1024 * 1024;
const CHUNK = 10 * MIB;
const FILE_SIZE = 25 * MIB;
const SESSION = { sessionId: "session-1", videoId: "video-1" };

function fakeStep() {
  const steps: string[] = [];
  const step = {
    do: async (name: string, callback: () => Promise<unknown>) => {
      steps.push(name);
      return callback();
    },
    sleep: async () => {},
  } as unknown as MetaStepRunner;
  return { step, steps };
}

const offsets = (start: number) => ({
  start_offset: start,
  end_offset: Math.min(start + CHUNK, FILE_SIZE),
});

function fakeGraph() {
  const transfers: number[] = [];
  const failOnceAt = new Map<number, Error>();
  const post = vi.fn(async (_path: string, form: Record<string, unknown>) =>
    form.upload_phase === "start"
      ? {
          upload_session_id: SESSION.sessionId,
          video_id: SESSION.videoId,
          ...offsets(0),
        }
      : { success: true },
  );
  const upload = vi.fn(
    async (_path: string, form: { start_offset: number }) => {
      const failure = failOnceAt.get(form.start_offset);
      failOnceAt.delete(form.start_offset);
      if (failure) throw failure;
      transfers.push(form.start_offset);
      const next = form.start_offset + CHUNK;
      return next >= FILE_SIZE
        ? { start_offset: FILE_SIZE, end_offset: FILE_SIZE }
        : offsets(next);
    },
  );
  const graph = { post, upload } as unknown as Graph;
  return { graph, post, transfers, failOnceAt };
}

function setup(budget = new SubrequestBudget()) {
  const { step, steps } = fakeStep();
  const meta = fakeGraph();
  const readRange = vi.fn<
    (start: number, end: number) => Promise<ReadableStream>
  >(async () => new ReadableStream());
  const options = {
    ctx: { graph: meta.graph },
    actId: "act_1",
    fileSize: FILE_SIZE,
    title: "video.mp4",
    readRange,
    budget,
  };
  return { step, steps, meta, readRange, options, budget };
}

const phases = (post: ReturnType<typeof fakeGraph>["post"]) =>
  post.mock.calls.map(([, form]) => form.upload_phase);

describe("runResumableUpload", () => {
  it("uploads 25 MiB with start + 3 transfers + finish", async () => {
    const { step, steps, meta, readRange, options, budget } = setup();
    await expect(runResumableUpload(step, options)).resolves.toEqual({
      videoId: SESSION.videoId,
    });
    expect(steps).toHaveLength(5);
    expect(phases(meta.post)).toEqual(["start", "finish"]);
    expect(meta.transfers).toEqual([0, CHUNK, 2 * CHUNK]);
    expect(readRange.mock.calls).toEqual([
      [0, CHUNK],
      [CHUNK, 2 * CHUNK],
      [2 * CHUNK, FILE_SIZE],
    ]);
    expect(budget.used).toBe(1 + 3 * 2 + 1);
  });

  it("retries a failing chunk step from its start_offset", async () => {
    const { step, steps, meta, readRange, options } = setup();
    meta.failOnceAt.set(
      CHUNK,
      classifyMetaError(500, { error: { code: 2, message: "boom" } }),
    );
    await runResumableUpload(step, options);
    expect(meta.transfers).toEqual([0, CHUNK, 2 * CHUNK]);
    expect(readRange.mock.calls.map(([start]) => start)).toEqual([
      0,
      CHUNK,
      CHUNK,
      2 * CHUNK,
    ]);
    expect(new Set(steps).size).toBe(steps.length);
  });

  it("asks for continuation at 45 subrequests and resumes without repeating chunks", async () => {
    const budget = new SubrequestBudget();
    budget.charge(CONTINUATION_THRESHOLD - 3);
    const first = setup(budget);
    const paused = await runResumableUpload(first.step, first.options);
    expect(budget.needsContinuation()).toBe(true);
    expect(paused).toEqual({
      videoId: SESSION.videoId,
      resume: {
        ...SESSION,
        startOffset: CHUNK,
        endOffset: 2 * CHUNK,
      },
    });
    expect(first.meta.transfers).toEqual([0]);
    expect(phases(first.meta.post)).toEqual(["start"]);

    const second = setup();
    const done = await runResumableUpload(second.step, {
      ...second.options,
      resume: paused.resume,
    });
    expect(done).toEqual({ videoId: SESSION.videoId });
    expect(phases(second.meta.post)).toEqual(["finish"]);
    expect(second.meta.transfers).toEqual([CHUNK, 2 * CHUNK]);
    expect(second.readRange.mock.calls.map(([start]) => start)).toEqual([
      CHUNK,
      2 * CHUNK,
    ]);
  });
});
