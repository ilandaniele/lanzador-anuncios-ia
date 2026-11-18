import { z } from "zod";
import { chunk } from "../../lib/chunk";
import type { BatchRequest, Graph } from "./client";
import { invalidPayloadError } from "./errors";
import type { QueryValues } from "./payload";
import { MAX_BATCH_SIZE } from "./write";

const CAMPAIGN_FIELDS = "name,status,daily_budget,objective,bid_strategy";
const ADSET_FIELDS =
  "name,status,promoted_object,optimization_goal,start_time,bid_amount,targeting";
const AD_FIELDS =
  "name,status,effective_status,issues_info,creative{object_story_spec,effective_object_story_id,degrees_of_freedom_spec}";
const VIDEO_FIELDS = "id,status";
const ADS_LIMIT = 101;

const numeric = z.union([z.string(), z.number()]).transform(Number);

const campaignSchema = z.object({
  status: z.string(),
  daily_budget: numeric.optional(),
  bid_strategy: z.string().optional(),
});

const adsetSchema = z.object({
  status: z.string(),
  optimization_goal: z.string().optional(),
  start_time: z.string().optional(),
  bid_amount: numeric.optional(),
  promoted_object: z
    .object({
      pixel_id: z.string().optional(),
      custom_event_type: z.string().optional(),
    })
    .optional(),
  targeting: z
    .object({
      geo_locations: z
        .object({ countries: z.array(z.string()).optional() })
        .optional(),
    })
    .optional(),
});

const storySpecSchema = z.object({
  page_id: z.string().optional(),
  instagram_user_id: z.string().optional(),
  video_data: z
    .object({
      title: z.string().optional(),
      message: z.string().optional(),
      link_description: z.string().optional(),
      call_to_action: z
        .object({ value: z.object({ link: z.string().optional() }) })
        .optional(),
    })
    .optional(),
  link_data: z
    .object({
      link: z.string().optional(),
      name: z.string().optional(),
      message: z.string().optional(),
      description: z.string().optional(),
    })
    .optional(),
});

const adSchema = z.object({
  status: z.string(),
  issues_info: z.array(z.unknown()).optional(),
  creative: z
    .object({
      object_story_spec: storySpecSchema.optional(),
      effective_object_story_id: z.string().optional(),
      degrees_of_freedom_spec: z
        .object({
          creative_features_spec: z
            .record(
              z.string(),
              z.object({ enroll_status: z.string().optional() }),
            )
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

const adsSchema = z.object({ data: z.array(adSchema) });

const videoSchema = z.object({
  id: z.string(),
  status: z.object({ video_status: z.string().optional() }).optional(),
});

export type VerifyCampaign = z.infer<typeof campaignSchema>;
export type VerifyAdset = z.infer<typeof adsetSchema>;
export type VerifyAd = z.infer<typeof adSchema>;
export type VerifyVideo = z.infer<typeof videoSchema>;

export interface LaunchObjects {
  campaign: VerifyCampaign;
  adset: VerifyAdset;
  ads: VerifyAd[];
  videos: VerifyVideo[];
}

export interface LaunchObjectIds {
  campaignId: string;
  adsetId: string;
  videoIds: string[];
}

function parse<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw invalidPayloadError();
  return result.data;
}

const read = (path: string, query: QueryValues): BatchRequest => ({
  method: "GET",
  path,
  query,
});

async function batchAll(graph: Graph, requests: BatchRequest[]) {
  const groups = await Promise.all(
    chunk(requests, MAX_BATCH_SIZE).map((group) => graph.batch(group)),
  );
  return groups.flat();
}

async function readAll(graph: Graph, requests: BatchRequest[]) {
  return (await batchAll(graph, requests)).map((result) => {
    if (!result.ok) throw result.error;
    return result.data;
  });
}

export async function readLaunchObjects(
  graph: Graph,
  { campaignId, adsetId, videoIds }: LaunchObjectIds,
): Promise<LaunchObjects> {
  const [campaign, adset, ads, ...videos] = await readAll(graph, [
    read(campaignId, { fields: CAMPAIGN_FIELDS }),
    read(adsetId, { fields: ADSET_FIELDS }),
    read(`${adsetId}/ads`, { fields: AD_FIELDS, limit: ADS_LIMIT }),
    ...videoIds.map((videoId) => read(videoId, { fields: VIDEO_FIELDS })),
  ]);
  return {
    campaign: parse(campaignSchema, campaign),
    adset: parse(adsetSchema, adset),
    ads: parse(adsSchema, ads).data,
    videos: videos.map((video) => parse(videoSchema, video)),
  };
}

const statusSchema = z.object({ status: z.string() });

export async function readStatuses(
  graph: Graph,
  ids: string[],
): Promise<(string | null)[]> {
  const results = await batchAll(
    graph,
    ids.map((id) => read(id, { fields: "status" })),
  );
  return results.map((result) =>
    result.ok
      ? (statusSchema.safeParse(result.data).data?.status ?? null)
      : null,
  );
}
