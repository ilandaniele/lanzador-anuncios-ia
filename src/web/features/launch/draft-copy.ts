import type { Cta } from "../../../shared/constants";
import type { CopyDto } from "../../../shared/schemas/copies";
import type { PartialLaunchDraft } from "../../../shared/schemas/launch";
import type { ProductListItemDto } from "../../../shared/schemas/products";

type DraftCopy = NonNullable<PartialLaunchDraft["copy"]>;

export const copyFromProduct = ({
  primaryText,
  headline,
  cta,
}: ProductListItemDto): DraftCopy => ({ primaryText, headline, cta });

export const copyFromSaved = (
  { id, primaryText, headline, description }: CopyDto,
  cta: Cta,
): DraftCopy => ({
  copyId: id,
  primaryText,
  headline,
  cta,
  ...(description ? { description } : {}),
});
