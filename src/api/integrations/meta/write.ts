import { z } from "zod";
import type { BatchRequest, BatchResult, Graph } from "./client";
import { invalidPayloadError } from "./errors";
import type { FormValues } from "./payload";

export const MAX_BATCH_SIZE = 50;

export type WritableStatus = "ACTIVE" | "PAUSED";
export type CreatePayload = FormValues & { status?: string };

export interface ActivationTarget {
  id: string;
  kind: "campaign" | "adset" | "ad";
}

export class GuardrailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuardrailError";
  }
}

const createdSchema = z.object({ id: z.string() });
const updatedSchema = z.object({ success: z.literal(true) });
const WRITABLE_STATUSES = new Set<unknown>(["ACTIVE", "PAUSED"]);

function parse<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw invalidPayloadError();
  return result.data;
}

function assertPaused(status: unknown) {
  if (status !== undefined && status !== "PAUSED") {
    throw new GuardrailError("Meta objects must be created PAUSED");
  }
}

async function create(graph: Graph, path: string, form: FormValues) {
  return parse(createdSchema, await graph.post<unknown>(path, form));
}

async function update(graph: Graph, objectId: string, form: FormValues) {
  parse(updatedSchema, await graph.post<unknown>(objectId, form));
}

const createPaused =
  (edge: "campaigns" | "adsets" | "ads") =>
  async (graph: Graph, adAccountId: string, payload: CreatePayload) => {
    assertPaused(payload.status);
    return create(graph, `${adAccountId}/${edge}`, {
      ...payload,
      status: "PAUSED",
    });
  };

export const createCampaign = createPaused("campaigns");
export const createAdset = createPaused("adsets");
export const createAd = createPaused("ads");

export async function createAdCreative(
  graph: Graph,
  adAccountId: string,
  { status, ...payload }: CreatePayload,
) {
  assertPaused(status);
  return create(graph, `${adAccountId}/adcreatives`, payload);
}

export async function setStatus(
  graph: Graph,
  objectId: string,
  status: WritableStatus,
) {
  if (!WRITABLE_STATUSES.has(status)) {
    throw new GuardrailError("Only ACTIVE or PAUSED can be set on Meta");
  }
  await update(graph, objectId, { status });
}

export async function setDailyBudget(
  graph: Graph,
  campaignId: string,
  minor: number,
) {
  if (!Number.isSafeInteger(minor) || minor < 1) {
    throw new GuardrailError("Daily budget must be a positive integer");
  }
  await update(graph, campaignId, { daily_budget: minor });
}

const activationRequest =
  (startAt?: string) =>
  ({ id, kind }: ActivationTarget): BatchRequest => ({
    method: "POST",
    path: id,
    body: {
      status: "ACTIVE",
      start_time: kind === "adset" ? startAt : undefined,
    },
  });

export async function activateBatch(
  graph: Graph,
  objects: ActivationTarget[],
  startAt?: string,
): Promise<BatchResult<unknown>[]> {
  const requests = objects.map(activationRequest(startAt));
  const results: BatchResult<unknown>[] = [];
  for (let start = 0; start < requests.length; start += MAX_BATCH_SIZE) {
    results.push(
      ...(await graph.batch(requests.slice(start, start + MAX_BATCH_SIZE))),
    );
  }
  return results;
}
