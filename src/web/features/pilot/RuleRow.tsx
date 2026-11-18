import { useId } from "react";
import { t } from "../../i18n/es-AR";
import { RuleField } from "./RuleField";
import { RULE_FIELDS } from "./rule-fields";
import type { FieldErrors, RuleDraft } from "./rules-draft";

const PLACEHOLDER = /\{(\w+)\}/;

type RuleRowProps = {
  draft: RuleDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<RuleDraft>) => void;
};

export function RuleRow({ draft, errors, onChange }: RuleRowProps) {
  const titleId = useId();
  const errorsId = `${titleId}-errors`;
  const name = t(`pilot.rule.${draft.ruleType}`);
  const specs = RULE_FIELDS[draft.ruleType];
  const messages = specs.filter(({ key }) => errors[key]);

  return (
    <li className="flex gap-3 rounded-sm border border-rule bg-surface p-4">
      <input
        type="checkbox"
        role="switch"
        className="mt-1 size-5 shrink-0"
        aria-labelledby={titleId}
        checked={draft.enabled}
        onChange={(event) => onChange({ enabled: event.target.checked })}
      />
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="font-semibold">
          {name}
        </h3>
        <p className="max-w-180 leading-10 text-ink-muted">
          {t(`pilot.rules.sentence.${draft.ruleType}`)
            .split(PLACEHOLDER)
            .map((part, index) => {
              if (index % 2 === 0) return part;
              const spec = specs.find(({ key }) => key === part);
              return (
                spec && (
                  <RuleField
                    key={part}
                    spec={spec}
                    ruleName={name}
                    value={draft.fields[spec.key] ?? ""}
                    invalid={Boolean(errors[spec.key])}
                    describedBy={errorsId}
                    onChange={(value) =>
                      onChange({
                        fields: { ...draft.fields, [spec.key]: value },
                      })
                    }
                  />
                )
              );
            })}
        </p>
        {messages.length > 0 && (
          <ul id={errorsId} className="text-loss">
            {messages.map(({ key }) => (
              <li key={key}>
                <span aria-hidden="true">⊗ </span>
                {t(`pilot.rules.field.${key}`)}: {errors[key]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
