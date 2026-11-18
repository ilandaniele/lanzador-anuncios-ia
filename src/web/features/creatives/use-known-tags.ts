import { useState } from "react";
import type { CreativeDto } from "../../../shared/schemas/creatives";
import { filterableTags } from "./creative-filters";

const mergeTags = (known: string[], creatives: CreativeDto[]) =>
  [
    ...new Set([
      ...known,
      ...creatives.flatMap(({ tags }) => filterableTags(tags)),
    ]),
  ].sort();

export function useKnownTags(creatives: CreativeDto[]) {
  const [seen, setSeen] = useState({
    creatives,
    tags: mergeTags([], creatives),
  });

  if (seen.creatives !== creatives)
    setSeen({ creatives, tags: mergeTags(seen.tags, creatives) });

  return seen.tags;
}
