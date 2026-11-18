import type {
  LaunchObjects,
  VerifyAd,
} from "../../integrations/meta/launch-read";
import { parseMetaTime } from "../../integrations/meta/lookup";
import type { LaunchCheck, LaunchDraft } from "../../../shared/schemas/launch";

const PAUSED = "PAUSED";
const PURCHASE = "PURCHASE";
const OFFSITE_CONVERSIONS = "OFFSITE_CONVERSIONS";
const OPT_IN = "OPT_IN";
const VIDEO_READY = "ready";
const BID_AMOUNT_STRATEGIES = new Set(["COST_CAP", "LOWEST_COST_WITH_BID_CAP"]);

const CHECK_TEXTS = {
  CAMPAIGN_PAUSED: "La campaña está pausada",
  BUDGET_MATCH: "El presupuesto diario coincide con el borrador",
  ADSET_PAUSED: "El conjunto de anuncios está pausado",
  START_TIME: "La fecha de inicio es la esperada",
  BID: "La puja coincide con la estrategia",
  COUNTRIES: "Los países coinciden con el borrador",
  PIXEL: "El píxel es el elegido",
  EVENT: "El evento de conversión es Compra",
  OPT_GOAL: "La optimización es por conversiones",
  AD_COUNT: "Se crearon todos los anuncios",
  LINK: "Todos los anuncios llevan al producto",
  LANDING_UP: "La landing responde",
  PAGE: "Todos los anuncios usan la página elegida",
  INSTAGRAM: "Todos los anuncios usan la cuenta de Instagram elegida",
  TEXTS: "Los textos coinciden con el borrador",
  ADS_PAUSED_NO_ISSUES: "Los anuncios están pausados y sin problemas",
  ENHANCEMENTS_OFF: "Las mejoras automáticas de Advantage+ están apagadas",
  VIDEO_READY: "Los videos están procesados",
} as const;

export type CheckCode = keyof typeof CHECK_TEXTS;

export interface VerifyExpectations {
  draft: LaunchDraft;
  advantageCreativeEnabled: boolean;
  landingUrl: string;
  landingUp: boolean;
  expectedAds: number;
  storyIds: string[];
  now: number;
}

const check = (code: CheckCode, ok: boolean): LaunchCheck => ({
  ok,
  code,
  text: CHECK_TEXTS[code],
});

const storySpec = (ad: VerifyAd) => ad.creative?.object_story_spec;

const adLink = (ad: VerifyAd) => {
  const spec = storySpec(ad);
  return spec?.video_data?.call_to_action?.value.link ?? spec?.link_data?.link;
};

const adTexts = (ad: VerifyAd) => {
  const spec = storySpec(ad);
  if (spec?.video_data) {
    const { title, message, link_description } = spec.video_data;
    return {
      headline: title,
      primaryText: message,
      description: link_description,
    };
  }
  const { name, message, description } = spec?.link_data ?? {};
  return { headline: name, primaryText: message, description };
};

const sameSet = (left: string[], right: string[]) =>
  [...left].sort().join() === [...right].sort().join();

function startTimeOk(
  { adset }: LaunchObjects,
  { draft, now }: VerifyExpectations,
) {
  if (!adset.start_time) return true;
  const limit = draft.startAt ? Date.parse(draft.startAt) : now;
  return parseMetaTime(adset.start_time) <= limit;
}

function bidOk(
  { campaign, adset }: LaunchObjects,
  { draft }: VerifyExpectations,
) {
  if (draft.mode === "existing_cbo") {
    return (
      !BID_AMOUNT_STRATEGIES.has(campaign.bid_strategy ?? "") ||
      adset.bid_amount !== undefined
    );
  }
  if (draft.bidStrategy !== "COST_CAP") return adset.bid_amount === undefined;
  return adset.bid_amount === draft.bidAmountMinor;
}

function campaignChecks(objects: LaunchObjects, { draft }: VerifyExpectations) {
  if (draft.mode !== "new_cbo") return [];
  const { campaign, adset } = objects;
  return [
    check("CAMPAIGN_PAUSED", campaign.status === PAUSED),
    check("BUDGET_MATCH", campaign.daily_budget === draft.dailyBudgetMinor),
    check(
      "COUNTRIES",
      sameSet(adset.targeting?.geo_locations?.countries ?? [], draft.countries),
    ),
  ];
}

function adsetChecks(objects: LaunchObjects, expected: VerifyExpectations) {
  const { adset } = objects;
  return [
    check("ADSET_PAUSED", adset.status === PAUSED),
    check("START_TIME", startTimeOk(objects, expected)),
    check("BID", bidOk(objects, expected)),
    check("PIXEL", adset.promoted_object?.pixel_id === expected.draft.pixelId),
    check("EVENT", adset.promoted_object?.custom_event_type === PURCHASE),
    check("OPT_GOAL", adset.optimization_goal === OFFSITE_CONVERSIONS),
  ];
}

function adChecks({ ads }: LaunchObjects, expected: VerifyExpectations) {
  const { draft, storyIds } = expected;
  const isClone = (ad: VerifyAd) =>
    storyIds.includes(ad.creative?.effective_object_story_id ?? "");
  const built = ads.filter((ad) => !isClone(ad));
  const clones = ads.filter(isClone);
  const expectedInstagram = draft.instagramUserId;
  const textsMatch = (ad: VerifyAd) => {
    const texts = adTexts(ad);
    return (
      texts.headline === draft.copy.headline &&
      texts.primaryText === draft.copy.primaryText &&
      texts.description === draft.copy.description
    );
  };
  const enhancementsOff = (ad: VerifyAd) =>
    Object.values(
      ad.creative?.degrees_of_freedom_spec?.creative_features_spec ?? {},
    ).every(({ enroll_status }) => enroll_status !== OPT_IN);
  return [
    check("AD_COUNT", ads.length === expected.expectedAds),
    check(
      "LINK",
      built.every((ad) => adLink(ad) === expected.landingUrl),
    ),
    check("LANDING_UP", expected.landingUp),
    check(
      "PAGE",
      built.every((ad) => storySpec(ad)?.page_id === draft.pageId) &&
        clones.every(
          (ad) =>
            ad.creative?.effective_object_story_id?.split("_")[0] ===
            draft.pageId,
        ),
    ),
    check(
      "INSTAGRAM",
      expectedInstagram === undefined ||
        built.every(
          (ad) => storySpec(ad)?.instagram_user_id === expectedInstagram,
        ),
    ),
    check("TEXTS", built.every(textsMatch)),
    check(
      "ADS_PAUSED_NO_ISSUES",
      ads.every((ad) => ad.status === PAUSED && !ad.issues_info?.length),
    ),
    check(
      "ENHANCEMENTS_OFF",
      expected.advantageCreativeEnabled || ads.every(enhancementsOff),
    ),
  ];
}

const videoChecks = ({ videos }: LaunchObjects) => [
  check(
    "VIDEO_READY",
    videos.every((video) => video.status?.video_status === VIDEO_READY),
  ),
];

export const buildLaunchChecks = (
  objects: LaunchObjects,
  expected: VerifyExpectations,
): LaunchCheck[] => [
  ...campaignChecks(objects, expected),
  ...adsetChecks(objects, expected),
  ...adChecks(objects, expected),
  ...videoChecks(objects),
];
