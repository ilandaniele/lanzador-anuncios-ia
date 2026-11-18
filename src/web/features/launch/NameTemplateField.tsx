import {
  renderNameTemplate,
  type NameValues,
} from "../../../shared/name-templates";
import { Button } from "../../components/Button";
import { Input } from "../../components/TextField";
import { t } from "../../i18n/es-AR";

const NAME_LIMIT = 120;
const NAME_PLACEHOLDERS = [
  "producto",
  "fecha",
  "hora",
  "n",
] as const satisfies readonly (keyof NameValues)[];

type NameTemplateFieldProps = {
  label: string;
  value: string;
  values: NameValues;
  onChange: (value: string) => void;
};

export function NameTemplateField({
  label,
  value,
  values,
  onChange,
}: NameTemplateFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Input
        label={label}
        required
        limit={NAME_LIMIT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-muted">
          {t("launcher.step2.insertPlaceholder")}
        </span>
        {NAME_PLACEHOLDERS.map((placeholder) => (
          <Button
            key={placeholder}
            variant="secondary"
            className="min-h-8 px-2 text-sm"
            aria-label={`${t("launcher.step2.insertPlaceholder")} {${placeholder}} (${label})`}
            onClick={() => onChange(`${value}{${placeholder}}`)}
          >
            {`{${placeholder}}`}
          </Button>
        ))}
      </div>
      <p className="text-ink-subtle">
        {t("launcher.step2.preview")}: {renderNameTemplate(value, values)}
      </p>
    </div>
  );
}
