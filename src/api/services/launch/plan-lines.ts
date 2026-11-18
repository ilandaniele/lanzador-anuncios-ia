import type { LaunchDraft, LaunchPlan } from "../../../shared/schemas/launch";
import { AppError } from "../../lib/errors";
import type { CreativeFacts } from "../../repositories/creatives";
import {
  buildCreativePayload,
  type CreativeProduct,
  type PayloadSettings,
} from "./payloads";

export type PlanLine = LaunchPlan["blockers"][number];
export type PlanAd = LaunchPlan["ads"][number];
type MediaKind = PlanAd["mediaKind"];
type DraftItem = LaunchDraft["items"][number];

export interface ItemAssessment {
  mediaKind?: MediaKind;
  blockers: PlanLine[];
  warnings: PlanLine[];
}

interface ItemContext {
  draft: LaunchDraft;
  product: CreativeProduct;
  settings: PayloadSettings;
}

const ITEMS_PER_ADSET_WARNING = 10;
const GUARDRAIL_TEXTS: Partial<Record<AppError["code"], string>> = {
  BUDGET_CAP: "El presupuesto supera el tope del espacio de trabajo",
  NO_REFERENCE_ADSET: "La campaña elegida no tiene un conjunto de referencia",
};

export const MEDIA_NOT_IN_ACCOUNT_TEXT = "Volvé a subirlo para esta cuenta";

export const line = (code: string, text: string): PlanLine => ({ code, text });

export function guardrailLines(build: () => unknown, code?: string) {
  try {
    build();
    return [];
  } catch (error) {
    if (!(error instanceof AppError) || error.status !== 422) throw error;
    return [
      line(code ?? error.code, GUARDRAIL_TEXTS[error.code] ?? error.message),
    ];
  }
}

const blocked = (code: string, item: DraftItem, text: string) => ({
  blockers: [line(code, `${item.adName}: ${text}`)],
  warnings: [],
});

function assessCreative(
  item: DraftItem,
  draft: LaunchDraft,
  creative: CreativeFacts | undefined,
): ItemAssessment {
  if (!creative) {
    return blocked("CREATIVE_NOT_FOUND", item, "El creativo no existe");
  }
  const blockers: PlanLine[] = [];
  if (creative.status !== "ready") {
    blockers.push(
      line("CREATIVE_NOT_READY", `${item.adName}: El creativo no terminó`),
    );
  }
  if (creative.adAccountAssetId !== draft.adAccountAssetId) {
    blockers.push(
      line(
        "MEDIA_NOT_IN_ACCOUNT",
        `${item.adName}: ${MEDIA_NOT_IN_ACCOUNT_TEXT}`,
      ),
    );
  }
  const warnings =
    creative.formatWarning === "horizontal"
      ? [
          line(
            "HORIZONTAL_VIDEO",
            `${item.adName}: El video es horizontal y se verá con bordes`,
          ),
        ]
      : [];
  return { mediaKind: creative.kind, blockers, warnings };
}

function assessClone(
  item: DraftItem,
  { draft, product, settings }: ItemContext,
): ItemAssessment {
  const { cloneStoryId } = item;
  if (!cloneStoryId) {
    return blocked(
      "CLONE_SOURCE_REQUIRED",
      item,
      "Falta la publicación origen",
    );
  }
  if (!item.mediaKind) {
    return blocked("MEDIA_KIND_REQUIRED", item, "Falta el tipo de medio");
  }
  const blockers = guardrailLines(
    () =>
      buildCreativePayload(
        { adName: item.adName, pageId: draft.pageId },
        product,
        draft.copy,
        { kind: "story", storyId: cloneStoryId },
        settings,
      ),
    "CLONE_OTHER_PAGE",
  );
  return { mediaKind: item.mediaKind, blockers, warnings: [] };
}

export function assessItem(
  item: DraftItem,
  context: ItemContext,
  creative: CreativeFacts | undefined,
): ItemAssessment {
  if (item.source === "clone") return assessClone(item, context);
  if (!item.creativeId) {
    return blocked("CREATIVE_REQUIRED", item, "Falta el creativo");
  }
  return assessCreative(item, context.draft, creative);
}

export function structureBlockers(draft: LaunchDraft, maxItems: number) {
  return [
    ...(draft.mode === "existing_cbo" && !draft.existingCampaignId
      ? [line("CAMPAIGN_REQUIRED", "Elegí la campaña existente")]
      : []),
    ...(draft.mode === "new_cbo" && draft.dailyBudgetMinor === undefined
      ? [line("BUDGET_REQUIRED", "Falta el presupuesto diario")]
      : []),
    ...(draft.bidStrategy === "COST_CAP" && draft.bidAmountMinor === undefined
      ? [line("BID_AMOUNT_REQUIRED", "Falta el monto del costo objetivo")]
      : []),
    ...(draft.items.length > maxItems
      ? [
          line(
            "TOO_MANY_ITEMS",
            `El plan permite hasta ${maxItems} anuncios por lanzamiento`,
          ),
        ]
      : []),
  ];
}

export const itemsWarnings = (itemCount: number) =>
  itemCount > ITEMS_PER_ADSET_WARNING
    ? [
        line(
          "TOO_MANY_PER_ADSET",
          `Más de ${ITEMS_PER_ADSET_WARNING} anuncios en un conjunto puede frenar el aprendizaje`,
        ),
      ]
    : [];

export const mixedMediaBlockers = (kinds: (MediaKind | undefined)[]) =>
  new Set(kinds.filter(Boolean)).size > 1
    ? [line("MIXED_MEDIA", "No mezcles videos e imágenes en un mismo conjunto")]
    : [];
