import type {
  CreativeDto,
  CreativeTags,
} from "../../../shared/schemas/creatives";
import { CREATIVE_SORTS } from "../../../shared/schemas/creatives";
import { t, type TextKey } from "../../i18n/es-AR";
import { tagLabel } from "../metrics/tag-label";

export type CreativeSort = (typeof CREATIVE_SORTS)[number];

export type CreativeFilters = {
  adAccountAssetId: string;
  tag: string;
  sort: CreativeSort;
};

export const sortOptions = CREATIVE_SORTS.map((value) => ({
  value,
  label: t(`creatives.sort.${value}` satisfies TextKey),
}));

export const filterableTags = ({
  hook,
  angle,
  format,
  language,
}: CreativeTags) =>
  [hook, angle, format, language].filter((tag): tag is string => tag !== null);

export const displayTags = (tags: CreativeTags) => [
  ...filterableTags(tags),
  ...(tags.onScreenText === null
    ? []
    : [tagLabel("onScreenText", String(tags.onScreenText))]),
];

export const isUnconfirmed = ({ aiStatus }: CreativeDto) => aiStatus === "done";
