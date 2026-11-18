import {
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { COPY_LIMITS } from "../../../shared/constants";
import type { CopyDto } from "../../../shared/schemas/copies";
import { Button } from "../../components/Button";
import { Input, Textarea } from "../../components/TextField";
import { t } from "../../i18n/es-AR";

type CopyText = Pick<CopyDto, "primaryText" | "headline" | "description">;

type CopyEditorProps = {
  copy: CopyText;
  pending: boolean;
  onSubmit: (text: CopyText) => void;
  onCancel: () => void;
};

export function CopyEditor({
  copy,
  pending,
  onSubmit,
  onCancel,
}: CopyEditorProps) {
  const [values, setValues] = useState({
    primaryText: copy.primaryText,
    headline: copy.headline,
    description: copy.description ?? "",
  });
  const incomplete = !values.primaryText.trim() || !values.headline.trim();

  const bind = (field: keyof typeof values) => ({
    value: values[field],
    onKeyDown: handleKeyDown,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues({ ...values, [field]: event.target.value }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      primaryText: values.primaryText.trim(),
      headline: values.headline.trim(),
      description: values.description.trim() || null,
    });
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") onCancel();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Textarea
        label={t("products.form.primaryText")}
        limit={COPY_LIMITS.primaryText}
        {...bind("primaryText")}
      />
      <Input
        label={t("products.form.headline")}
        limit={COPY_LIMITS.headline}
        {...bind("headline")}
      />
      <Input
        label={t("products.form.description")}
        limit={COPY_LIMITS.description}
        {...bind("description")}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="secondary"
          loading={pending}
          disabledReason={incomplete ? t("copys.requiredFields") : undefined}
        >
          {t("copys.done")}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
