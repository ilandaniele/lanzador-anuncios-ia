import { Select } from "../../components/Select";
import { t } from "../../i18n/es-AR";
import { THEME_CHOICES, useTheme } from "../../layout/use-theme";

const options = THEME_CHOICES.map((value) => ({
  value,
  label: t(`theme.${value}`),
}));

export function ThemePicker() {
  const [choice, setChoice] = useTheme();

  return (
    <Select
      label={t("account.theme")}
      options={options}
      value={choice}
      onChange={(event) => {
        const next = THEME_CHOICES.find(
          (value) => value === event.target.value,
        );
        if (next) setChoice(next);
      }}
    />
  );
}
