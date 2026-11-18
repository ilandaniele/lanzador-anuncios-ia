import { useState } from "react";
import {
  TAG_FORMATS,
  type CreativeTags,
  type TagFormat,
} from "../../../shared/schemas/creatives";
import { Input } from "../../components/TextField";
import { Select } from "../../components/Select";
import { t, type TextKey } from "../../i18n/es-AR";

const UNSET = "";
const LANGUAGE_LENGTH = 2;

const formatOptions = [
  { value: UNSET, label: t("creatives.detail.unset") },
  ...TAG_FORMATS.map((value) => ({
    value,
    label: t(`creatives.format.${value}` satisfies TextKey),
  })),
];

const onScreenTextOptions = [
  { value: UNSET, label: t("creatives.detail.unset") },
  { value: "true", label: t("creatives.detail.withText") },
  { value: "false", label: t("creatives.detail.withoutText") },
];

type TagsEditorProps = {
  tags: CreativeTags;
  disabled: boolean;
  onSave: (tags: CreativeTags) => void;
};

function TagTextInput({
  label,
  value,
  maxLength,
  disabled,
  onCommit,
}: {
  label: string;
  value: string | null;
  maxLength?: number;
  disabled: boolean;
  onCommit: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");

  function commit() {
    const trimmed = draft.trim();
    setDraft(trimmed);
    if (trimmed !== (value ?? "")) onCommit(trimmed || null);
  }

  return (
    <Input
      label={label}
      value={draft}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  );
}

export function TagsEditor({ tags, disabled, onSave }: TagsEditorProps) {
  const change = (changes: Partial<CreativeTags>) =>
    onSave({ ...tags, ...changes });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TagTextInput
        label={t("creatives.detail.hook")}
        value={tags.hook}
        disabled={disabled}
        onCommit={(hook) => change({ hook })}
      />
      <TagTextInput
        label={t("creatives.detail.angle")}
        value={tags.angle}
        disabled={disabled}
        onCommit={(angle) => change({ angle })}
      />
      <Select
        label={t("creatives.detail.format")}
        options={formatOptions}
        value={tags.format ?? UNSET}
        disabled={disabled}
        onChange={(event) =>
          change({ format: (event.target.value || null) as TagFormat | null })
        }
      />
      <TagTextInput
        label={t("creatives.detail.language")}
        value={tags.language}
        maxLength={LANGUAGE_LENGTH}
        disabled={disabled}
        onCommit={(language) =>
          change({ language: language?.toLowerCase() ?? null })
        }
      />
      <Select
        label={t("creatives.detail.onScreenText")}
        options={onScreenTextOptions}
        value={tags.onScreenText === null ? UNSET : String(tags.onScreenText)}
        disabled={disabled}
        onChange={(event) =>
          change({
            onScreenText:
              event.target.value === UNSET
                ? null
                : event.target.value === "true",
          })
        }
      />
    </div>
  );
}
