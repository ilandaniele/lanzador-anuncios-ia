import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { t } from "../../i18n/es-AR";
import type { PilotRule } from "../../../shared/schemas/pilot";
import { RuleRow } from "./RuleRow";
import {
  checkRule,
  isRuleChanged,
  toRuleDrafts,
  type RuleDraft,
} from "./rules-draft";
import { useSavePilotRules } from "./use-pilot-rules";

type RulesEditorProps = { workspaceId: string; rules: PilotRule[] };

export function RulesEditor({ workspaceId, rules }: RulesEditorProps) {
  const initial = useMemo(() => toRuleDrafts(rules), [rules]);
  const [drafts, setDrafts] = useState(initial);
  const save = useSavePilotRules(workspaceId);
  const { notify } = useToast();

  const rows = drafts.map((draft, index) => ({
    draft,
    check: checkRule(draft),
    changed: isRuleChanged(initial[index], draft),
  }));
  const changedRows = rows.filter(({ changed }) => changed);
  const validRules = changedRows.flatMap(({ check }) =>
    check.rule ? [check.rule] : [],
  );
  const hasInvalid = validRules.length < changedRows.length;

  const updateRule = (
    ruleType: RuleDraft["ruleType"],
    patch: Partial<RuleDraft>,
  ) =>
    setDrafts((current) =>
      current.map((draft) =>
        draft.ruleType === ruleType ? { ...draft, ...patch } : draft,
      ),
    );

  function handleSave() {
    const savedTypes = new Set(validRules.map(({ ruleType }) => ruleType));
    save.mutate(validRules, {
      onSuccess: ({ data }) => {
        const fresh = toRuleDrafts(data);
        setDrafts((current) =>
          current.map((draft, index) =>
            savedTypes.has(draft.ruleType) ? (fresh[index] ?? draft) : draft,
          ),
        );
        notify({ tone: "success", message: t("pilot.rules.saved") });
      },
      onError: () =>
        notify({ tone: "error", message: t("pilot.rules.saveFailed") }),
    });
  }

  return (
    <div>
      <p className="mb-4 max-w-180 text-ink-muted">{t("pilot.rules.intro")}</p>
      <ul aria-label={t("pilot.rules.listLabel")} className="grid gap-3">
        {rows.map(({ draft, check }) => (
          <RuleRow
            key={draft.ruleType}
            draft={draft}
            errors={check.errors}
            onChange={(patch) => updateRule(draft.ruleType, patch)}
          />
        ))}
      </ul>
      {changedRows.length > 0 && (
        <div className="sticky bottom-0 -mx-4 mt-4 flex flex-wrap items-center gap-3 border-t border-rule bg-paper p-4">
          <Button
            loading={save.isPending}
            loadingLabel={t("common.working")}
            disabledReason={
              validRules.length === 0
                ? t("pilot.rules.nothingValid")
                : undefined
            }
            onClick={handleSave}
          >
            {t("pilot.rules.save")}
          </Button>
          {hasInvalid && (
            <p role="status" className="text-loss">
              {t("pilot.rules.someInvalid")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
