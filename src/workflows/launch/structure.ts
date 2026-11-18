import type { CreatedEdge } from "../../api/integrations/meta/lookup";
import { findCreatedByName } from "../../api/integrations/meta/lookup";
import {
  getCampaignReference,
  readAccountHealth,
} from "../../api/integrations/meta/read";
import {
  type CreatePayload,
  createAdset,
  createCampaign,
} from "../../api/integrations/meta/write";
import { AppError } from "../../api/lib/errors";
import { saveLaunchObject } from "../../api/repositories/launch-run";
import { accountBlockers } from "../../api/services/launch/account-check";
import {
  buildAdsetPayload,
  buildCampaignPayload,
} from "../../api/services/launch/payloads";
import { toAdsetReference } from "../../api/services/launch/reference-adset";
import { type LaunchContext, launchAudit } from "./context";
import { runLaunchStep } from "./step";

const FIND_AND_CREATE_SUBREQUESTS = 2;

const CREATORS = { campaigns: createCampaign, adsets: createAdset };

interface StructureObject {
  edge: Exclude<CreatedEdge, "ads">;
  objectType: "campaign" | "adset";
  name: string;
  payload: () => Promise<CreatePayload>;
  saved: (id: string) => { metaCampaignId: string } | { metaAdsetId: string };
}

function blockersError(blockers: { code: string; text: string }[]) {
  const fields = Object.fromEntries(
    blockers.map(({ code, text }) => [code, text]),
  );
  return new AppError(422, "BLOCKERS", { fields });
}

export function runPreflight(context: LaunchContext) {
  const { step, budget, graph, actId } = context;
  return runLaunchStep(
    step,
    "preflight",
    async () => {
      const blockers = accountBlockers(await readAccountHealth(graph, actId));
      if (blockers.length > 0) throw blockersError(blockers);
      return true;
    },
    { budget },
  );
}

function findOrCreate(context: LaunchContext, object: StructureObject) {
  const { env, step, scope, launchId, budget, graph, actId, launch } = context;
  return runLaunchStep(
    step,
    `create ${object.objectType}`,
    async () => {
      const id =
        (await findCreatedByName(
          graph,
          actId,
          object.edge,
          object.name,
          launch.startedAt,
        )) ??
        (await CREATORS[object.edge](graph, actId, await object.payload())).id;
      await saveLaunchObject(
        env.DB,
        scope,
        launchId,
        object.saved(id),
        launchAudit(context, {
          action: `launch.${object.objectType}.create`,
          objectType: object.objectType,
          objectMetaId: id,
          objectName: object.name,
        }),
      );
      return id;
    },
    { budget, subrequests: FIND_AND_CREATE_SUBREQUESTS },
  );
}

export async function ensureCampaign(context: LaunchContext) {
  const { launch, settings } = context;
  const { draft, plan } = launch;
  if (draft.mode === "existing_cbo") return draft.existingCampaignId!;
  if (launch.metaCampaignId) return launch.metaCampaignId;
  const name = plan.campaign!.name;
  return findOrCreate(context, {
    edge: "campaigns",
    objectType: "campaign",
    name,
    payload: async () =>
      buildCampaignPayload({ ...draft, campaignName: name }, settings),
    saved: (metaCampaignId) => ({ metaCampaignId }),
  });
}

async function adsetReference(context: LaunchContext, campaignId: string) {
  if (context.launch.draft.mode === "new_cbo") return undefined;
  return toAdsetReference(
    await getCampaignReference(context.graph, campaignId),
  );
}

export async function ensureAdset(context: LaunchContext, campaignId: string) {
  const { launch, settings } = context;
  if (launch.metaAdsetId) return launch.metaAdsetId;
  const name = launch.plan.adset.name;
  return findOrCreate(context, {
    edge: "adsets",
    objectType: "adset",
    name,
    payload: async () =>
      buildAdsetPayload(
        { ...launch.draft, adsetName: name, campaignId },
        await adsetReference(context, campaignId),
        settings,
      ),
    saved: (metaAdsetId) => ({ metaAdsetId }),
  });
}
