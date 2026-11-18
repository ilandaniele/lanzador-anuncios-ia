import { useState } from "react";
import {
  COPY_GENERATE_ANGLES,
  COPY_VARIANTS_PER_GENERATION,
  type CopyGenerateAngle,
} from "../../../shared/constants";
import { CUSTOM_ANGLE_MAX, type CopyDto } from "../../../shared/schemas/copies";
import { Button } from "../../components/Button";
import { ToggleChip } from "../../components/Chip";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { Input } from "../../components/TextField";
import { t } from "../../i18n/es-AR";
import { budgetExhaustedReason } from "./budget-reason";
import { SuggestionCard } from "./SuggestionCard";
import { useGenerateCopies } from "./use-copies";

type CopyGeneratorProps = { workspaceId: string; productId: string };

export function CopyGenerator({ workspaceId, productId }: CopyGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [angle, setAngle] = useState<CopyGenerateAngle | null>(null);
  const [customAngle, setCustomAngle] = useState("");
  const [proposals, setProposals] = useState<CopyDto[]>([]);
  const generate = useGenerateCopies(workspaceId, productId);
  const budgetReason = budgetExhaustedReason(generate.error);
  const missingInput = !angle
    ? t("copys.generator.pickAngle")
    : angle === "libre" && !customAngle.trim()
      ? t("copys.generator.needsCustomAngle")
      : undefined;

  function handleGenerate() {
    if (!angle) return;
    generate.mutate(
      { angle, ...(angle === "libre" && { customAngle: customAngle.trim() }) },
      { onSuccess: setProposals },
    );
  }

  function handleChanged(updated: CopyDto) {
    setProposals((current) =>
      updated.status === "discarded"
        ? current.filter(({ id }) => id !== updated.id)
        : current.map((copy) => (copy.id === updated.id ? updated : copy)),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {t("copys.generator.open")}
        </Button>
      </div>
      {open && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">
              {t("copys.generator.angleLegend")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {COPY_GENERATE_ANGLES.map((option) => (
                <ToggleChip
                  key={option}
                  pressed={angle === option}
                  onToggle={() => setAngle(option)}
                >
                  {t(`copys.angles.${option}`)}
                </ToggleChip>
              ))}
            </div>
          </fieldset>
          {angle === "libre" && (
            <Input
              label={t("copys.generator.customAngle")}
              maxLength={CUSTOM_ANGLE_MAX}
              value={customAngle}
              onChange={(event) => setCustomAngle(event.target.value)}
            />
          )}
          <div>
            <Button
              loading={generate.isPending}
              loadingLabel={t("copys.generator.generating")}
              disabledReason={budgetReason ?? missingInput}
              onClick={handleGenerate}
            >
              {t("copys.generator.generate")}
            </Button>
          </div>
          <section
            aria-label={t("copys.generator.results")}
            className="flex flex-col gap-3"
          >
            {budgetReason && (
              <p role="alert" className="text-ink">
                {budgetReason}
              </p>
            )}
            {generate.isError && !budgetReason && (
              <p role="alert" className="text-loss">
                {t("copys.generator.failed")}
              </p>
            )}
            {generate.isPending ? (
              <SkeletonRegion
                label={t("common.loading")}
                className="flex flex-col gap-3"
              >
                {Array.from(
                  { length: COPY_VARIANTS_PER_GENERATION },
                  (_, n) => (
                    <Skeleton
                      key={n}
                      className="h-28 rounded-md border-[1.5px] border-dashed border-pencil"
                    />
                  ),
                )}
              </SkeletonRegion>
            ) : (
              proposals.map((copy) => (
                <SuggestionCard
                  key={copy.id}
                  workspaceId={workspaceId}
                  copy={copy}
                  canEdit
                  onChanged={handleChanged}
                />
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
