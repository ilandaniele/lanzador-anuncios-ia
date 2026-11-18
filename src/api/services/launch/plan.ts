import type { LandingStatus } from "../../../shared/constants";
import type { LaunchDraft, LaunchPlan } from "../../../shared/schemas/launch";
import {
  nameValuesAt,
  renderNameTemplate,
} from "../../../shared/name-templates";
import type {
  AccountHealth,
  CampaignReference,
} from "../../integrations/meta/read";
import { sha256Hex } from "../../lib/hash";
import type { CreativeFacts } from "../../repositories/creatives";
import { accountBlockers } from "./account-check";
import {
  assessItem,
  guardrailLines,
  itemsWarnings,
  line,
  mixedMediaBlockers,
  type PlanAd,
  structureBlockers,
} from "./plan-lines";
import {
  buildAdsetPayload,
  buildCampaignPayload,
  type CreativeProduct,
  type PayloadSettings,
} from "./payloads";
import { toAdsetReference } from "./reference-adset";

type PlanSettings = PayloadSettings & { timezone: string };

export interface PlanInput {
  draft: LaunchDraft;
  settings: PlanSettings;
  product: CreativeProduct & { name: string; landingStatus: LandingStatus };
  creatives: Map<string, CreativeFacts>;
  maxItems: number;
  health: AccountHealth;
  reference?: CampaignReference;
  at: number;
}

const LANDING_ERROR_TEXT = "La landing del producto no responde";
const NOT_CBO_TEXT = "La campaña elegida no tiene presupuesto de campaña";

function campaignLines(
  draft: LaunchDraft,
  campaignName: string,
  settings: PayloadSettings,
) {
  if (draft.mode !== "new_cbo" || draft.dailyBudgetMinor === undefined) {
    return [];
  }
  return guardrailLines(() =>
    buildCampaignPayload({ ...draft, campaignName }, settings),
  );
}

function adsetLines(
  draft: LaunchDraft,
  adsetName: string,
  reference: CampaignReference | undefined,
  settings: PayloadSettings,
) {
  if (draft.mode === "existing_cbo" && !reference) return [];
  const notCbo =
    reference && reference.dailyBudgetMinor === null
      ? [line("NOT_CBO", NOT_CBO_TEXT)]
      : [];
  const payload = guardrailLines(() =>
    buildAdsetPayload(
      {
        ...draft,
        adsetName,
        campaignId: draft.existingCampaignId ?? "pending",
      },
      reference && toAdsetReference(reference),
      settings,
    ),
  );
  return [...notCbo, ...payload];
}

export async function buildLaunchPlan({
  draft,
  settings,
  product,
  creatives,
  maxItems,
  health,
  reference,
  at,
}: PlanInput): Promise<LaunchPlan> {
  const adsetNumber = reference ? reference.adsets.length + 1 : 1;
  const names = nameValuesAt(at, settings.timezone, product.name, adsetNumber);
  const campaignName = renderNameTemplate(draft.campaignName, names);
  const adsetName = renderNameTemplate(draft.adsetName, names);
  const context = { draft, product, settings };
  const assessed = draft.items.map((item) =>
    assessItem(
      item,
      context,
      item.creativeId ? creatives.get(item.creativeId) : undefined,
    ),
  );
  const mediaKinds = assessed.map(({ mediaKind }) => mediaKind);
  const ads = draft.items.flatMap((item, position): PlanAd[] => {
    const mediaKind = mediaKinds[position];
    return mediaKind
      ? [
          {
            position,
            adName: item.adName,
            mediaKind,
            link: product.landingUrl,
            pageId: draft.pageId,
            instagramUserId: draft.instagramUserId ?? null,
          },
        ]
      : [];
  });
  const body = {
    campaign:
      draft.mode === "new_cbo"
        ? {
            name: campaignName,
            dailyBudgetMinor: draft.dailyBudgetMinor ?? 0,
            bidStrategy: draft.bidStrategy,
          }
        : undefined,
    adset: {
      name: adsetName,
      countries: draft.countries,
      optimizationEvent: draft.optimizationEvent,
    },
    ads,
    warnings: [
      ...itemsWarnings(draft.items.length),
      ...assessed.flatMap(({ warnings }) => warnings),
    ],
    blockers: [
      ...structureBlockers(draft, maxItems),
      ...accountBlockers(health),
      ...(product.landingStatus === "error"
        ? [line("LANDING_ERROR", LANDING_ERROR_TEXT)]
        : []),
      ...campaignLines(draft, campaignName, settings),
      ...adsetLines(draft, adsetName, reference, settings),
      ...assessed.flatMap(({ blockers }) => blockers),
      ...mixedMediaBlockers(mediaKinds),
    ],
  };
  return { ...body, planHash: await sha256Hex(JSON.stringify(body)) };
}
